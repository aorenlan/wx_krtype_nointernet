import { addPhotoRecognitionWords, PHOTO_RECOGNITION_CATEGORY, saveProgressV2 } from '../../utils_nv/storage';
const {
  DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG,
  loadPhotoLearnRecognitionConfig
} = require('../../utils/photo-limit-config');

const HISTORY_KEY = 'photoLearnHistoryRecords';
const SENTENCE_QUOTA_TIP_DISABLED_KEY = 'photoSentenceQuotaTipDisabled';
const EDGE_TTS_LANGUAGE = 'ko-KR';
const EDGE_TTS_BATCH_SIZE = 4;
const PREFETCH_CLICK_WAIT_MS = 450;
const PHOTO_RECOGNITION_QUOTA_KEY = 'photo_learn_recognition_quota_v1';
const SENTENCE_WORD_LIMIT = 10;

let photoRecognitionAd = null;
let photoRecognitionAdUnitId = '';
let photoRecognitionAdCloseResolver = null;
let photoRecognitionAdErrorResolver = null;
let photoRecognitionAdPlaying = false;
let photoRecognitionAdLoadHandler = null;
let photoRecognitionAdErrorHandler = null;
let photoRecognitionAdCloseHandler = null;

function detachPhotoRecognitionAdHandlers(ad) {
  if (!ad) return;
  if (photoRecognitionAdLoadHandler && typeof ad.offLoad === 'function') {
    ad.offLoad(photoRecognitionAdLoadHandler);
  }
  if (photoRecognitionAdErrorHandler && typeof ad.offError === 'function') {
    ad.offError(photoRecognitionAdErrorHandler);
  }
  if (photoRecognitionAdCloseHandler && typeof ad.offClose === 'function') {
    ad.offClose(photoRecognitionAdCloseHandler);
  }
  photoRecognitionAdLoadHandler = null;
  photoRecognitionAdErrorHandler = null;
  photoRecognitionAdCloseHandler = null;
}

function hashText(value) {
  const text = String(value || '');
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(index);
    hash &= 0x7fffffff;
  }
  return hash.toString(36);
}

function fileExists(filePath) {
  try {
    wx.getFileSystemManager().accessSync(filePath);
    return true;
  } catch (error) {
    return false;
  }
}

function writeBase64File(filePath, data) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().writeFile({
      filePath,
      data,
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: reject
    });
  });
}

function callCloudFunction(name, data) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      reject(new Error('wx.cloud is not available'));
      return;
    }
    wx.cloud.callFunction({
      name,
      data,
      success: resolve,
      fail: reject
    });
  });
}

function padTime(value) {
  return String(value).padStart(2, '0');
}

function formatHistoryTime(timestamp) {
  const date = new Date(timestamp || Date.now());
  return `${date.getMonth() + 1}/${date.getDate()} ${padTime(date.getHours())}:${padTime(date.getMinutes())}`;
}

function getTodayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${padTime(date.getMonth() + 1)}-${padTime(date.getDate())}`;
}

function normalizeQuotaState(rawState) {
  const today = getTodayKey();
  if (!rawState || rawState.day !== today) {
    return {
      day: today,
      used: 0,
      bonus: 0
    };
  }
  return {
    day: today,
    used: Math.max(0, Number(rawState.used) || 0),
    bonus: Math.max(0, Number(rawState.bonus) || 0)
  };
}

function readQuotaState() {
  try {
    return normalizeQuotaState(wx.getStorageSync(PHOTO_RECOGNITION_QUOTA_KEY));
  } catch (error) {
    return normalizeQuotaState(null);
  }
}

function saveQuotaState(state) {
  try {
    wx.setStorageSync(PHOTO_RECOGNITION_QUOTA_KEY, normalizeQuotaState(state));
  } catch (error) {
    // Quota cache failures should not crash the history page.
  }
}

function getQuotaSnapshot(config) {
  const quotaConfig = config || DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG;
  const state = readQuotaState();
  const freeLimit = Math.max(0, Number(quotaConfig.dailyFreeLimit) || 0);
  const total = freeLimit + state.bonus;
  const remaining = Math.max(0, total - state.used);
  const freeRemaining = Math.max(0, freeLimit - state.used);
  const bonusRemaining = Math.max(0, remaining - freeRemaining);
  return {
    state,
    total,
    remaining,
    used: state.used,
    freeLimit,
    bonus: state.bonus,
    freeRemaining,
    bonusRemaining
  };
}

function normalizeRecordWords(words) {
  return (Array.isArray(words) ? words : [])
    .map((item, index) => {
      const text = item && item.text ? String(item.text).trim() : '';
      const meaning = item && item.meaning ? String(item.meaning).trim() : '';
      return {
        id: item && item.id ? String(item.id) : `${text || 'word'}-${index}`,
        text,
        meaning
      };
    })
    .filter((item) => item.text || item.meaning);
}

function normalizeSentenceDetails(details) {
  if (!details || typeof details !== 'object') return null;
  const items = (Array.isArray(details.items) ? details.items : [])
    .map((item, index) => ({
      key: item && item.key ? String(item.key) : `sentence_${index + 1}`,
      word: item && item.word ? String(item.word).trim() : '',
      meaning: item && item.meaning ? String(item.meaning).trim() : '',
      sentence: item && item.sentence ? String(item.sentence).trim() : '',
      translation: item && item.translation ? String(item.translation).trim() : '',
      detail: item && item.detail ? String(item.detail).trim() : ''
    }))
    .filter((item) => item.word && item.sentence && item.translation);
  if (!items.length) return null;
  return {
    title: details.title ? String(details.title) : '例句详解',
    summary: details.summary ? String(details.summary) : `已整理 ${items.length} 条常用例句`,
    items,
    createdAt: Number(details.createdAt) || Date.now(),
    source: details.source ? String(details.source) : ''
  };
}

function normalizeRecords(records) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((item) => item && item.imagePath)
    .map((item) => {
      const createdAt = Number(item.createdAt) || Date.now();
      const words = normalizeRecordWords(item.words);
      const record = {
        ...item,
        createdAt,
        timeText: item.timeText || formatHistoryTime(createdAt),
        title: item.title || '韩语词卡',
        desc: item.desc || '已生成韩语词卡',
        statusText: item.statusText || '已识别',
        words,
        sentenceDetails: normalizeSentenceDetails(item.sentenceDetails)
      };
      if (!isGeneratedSentenceDetailsComplete(record, record.sentenceDetails)) {
        record.sentenceDetails = null;
      }
      return record;
    });
}

function buildSentenceWords(record) {
  const seen = {};
  return (Array.isArray(record && record.words) ? record.words : [])
    .map((item) => ({
      text: String((item && item.text) || '').trim(),
      meaning: String((item && item.meaning) || '').trim()
    }))
    .filter((item) => {
      if (!item.text || !item.meaning || seen[item.text]) return false;
      seen[item.text] = true;
      return true;
    })
    .slice(0, SENTENCE_WORD_LIMIT);
}

function hasKoreanFinalConsonant(text) {
  const chars = Array.from(String(text || '').trim());
  const last = chars[chars.length - 1];
  if (!last) return false;
  const code = last.charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return false;
  return ((code - 0xAC00) % 28) !== 0;
}

function buildFallbackSentenceItem(word, index) {
  const text = String((word && word.text) || '').trim();
  const meaning = String((word && word.meaning) || '').trim();
  const particle = hasKoreanFinalConsonant(text) ? '을' : '를';
  return {
    key: word && word.key ? word.key : `word_${index + 1}`,
    word: text,
    meaning,
    sentence: `저는 ${text}${particle} 기억해요.`,
    translation: `我记住“${meaning}”。`,
    detail: `这句用「${text}」表示“${meaning}”。`
  };
}

function completeSentenceDetails(record, details) {
  const normalized = normalizeSentenceDetails(details);
  if (!normalized) return null;
  const targetWords = buildSentenceWords(record);
  if (!targetWords.length) return normalized;

  const byWord = new Map();
  normalized.items.forEach((item) => {
    if (item.word) byWord.set(item.word, item);
  });

  const items = targetWords.map((word, index) => {
    const cached = byWord.get(word.text);
    if (cached && cached.sentence && cached.translation) {
      return {
        ...cached,
        key: cached.key || `word_${index + 1}`,
        word: word.text,
        meaning: word.meaning || cached.meaning
      };
    }
    return buildFallbackSentenceItem(word, index);
  });

  return normalizeSentenceDetails({
    ...normalized,
    summary: `已整理 ${items.length} 条常用例句`,
    items,
    source: normalized.source || 'wordSentences'
  });
}

function isGeneratedSentenceDetailsComplete(record, details) {
  const normalized = normalizeSentenceDetails(details);
  if (!normalized || normalized.source !== 'wordSentences') return false;
  const targetWords = buildSentenceWords(record);
  if (!targetWords.length) return normalized.items.length > 0;
  const words = new Set(normalized.items.map((item) => item.word).filter(Boolean));
  return normalized.items.length >= targetWords.length
    && targetWords.every((item) => words.has(item.text));
}

function buildPracticeWords(record) {
  if (!record) return [];
  return (record.words || [])
    .map((item, index) => ({
      id: `photo_rec_${record.id}_${index}`,
      word: item.text,
      meaning: item.meaning,
      sourceCategory: PHOTO_RECOGNITION_CATEGORY,
      sourceId: record.id,
      scene: record.title || '拍照练习'
    }))
    .filter((item) => item.word);
}

function getRecordKoreanWords(record) {
  const seen = {};
  return (Array.isArray(record && record.words) ? record.words : [])
    .map((item) => String((item && item.text) || '').trim())
    .filter((word) => {
      if (!word || seen[word]) return false;
      seen[word] = true;
      return true;
    });
}

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    records: [],
    expandedRecordId: '',
    speakingWordId: '',
    speakingSentenceKey: '',
    showPracticeConfirm: false,
    pendingPracticeId: '',
    practiceConfirmCount: 0,
    sentenceLoadingRecordId: '',
    showSentenceModal: false,
    sentenceModalRecord: null,
    sentenceDetails: null,
    showSentenceQuotaConfirm: false,
    pendingSentenceQuotaRecordId: '',
    sentenceQuotaNoMoreTip: true,
    showPhotoQuotaModal: false,
    photoQuotaAdLoading: false,
    photoQuotaRewardBonus: DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG.rewardBonus
  },

  onLoad() {
    const app = getApp();
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 0,
      navBarHeight: app.globalData.navBarHeight || 0
    });
    this.loadRecords();
    this.loadPhotoRecognitionLimitConfig();
  },

  onShow() {
    this.loadRecords();
  },

  onHide() {
    this.stopWordAudio(false);
  },

  onUnload() {
    if (this._initialAudioPrefetchTimer) {
      clearTimeout(this._initialAudioPrefetchTimer);
      this._initialAudioPrefetchTimer = null;
    }
    this.stopWordAudio(true);
    detachPhotoRecognitionAdHandlers(photoRecognitionAd);
  },

  loadRecords() {
    const records = normalizeRecords(wx.getStorageSync(HISTORY_KEY));
    this.setData({ records });
    const firstRecord = records[0];
    const firstRecordId = firstRecord && firstRecord.id ? String(firstRecord.id) : '';
    if (firstRecordId && this._historyPrefetchRecordId !== firstRecordId) {
      this._historyPrefetchRecordId = firstRecordId;
      this._initialAudioPrefetchTimer = setTimeout(() => {
        this._initialAudioPrefetchTimer = null;
        this.prefetchRecordWordAudio(firstRecord).catch((error) => {
          console.warn('[photo-learn-history] initial word audio prefetch failed', error);
        });
      }, 80);
    }
  },

  async loadPhotoRecognitionLimitConfig(options = {}) {
    const fallbackConfig = this.photoRecognitionConfig || { ...DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG };
    this.photoRecognitionConfig = fallbackConfig;
    this.initPhotoRecognitionAd(fallbackConfig.adUnitId);
    this.refreshPhotoQuotaView();

    if (this.photoRecognitionConfigLoading) return;
    this.photoRecognitionConfigLoading = true;
    try {
      const config = await loadPhotoLearnRecognitionConfig(options);
      this.photoRecognitionConfig = config;
      this.initPhotoRecognitionAd(config.adUnitId);
      this.refreshPhotoQuotaView();
    } catch (error) {
      console.warn('[photo-learn-history] use default recognition config', error);
      this.photoRecognitionConfig = fallbackConfig;
      this.initPhotoRecognitionAd(fallbackConfig.adUnitId);
      this.refreshPhotoQuotaView();
    } finally {
      this.photoRecognitionConfigLoading = false;
    }
  },

  refreshPhotoQuotaView() {
    const config = this.photoRecognitionConfig || DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG;
    const snapshot = getQuotaSnapshot(config);
    this.setData({
      photoQuotaRewardBonus: config.rewardBonus
    });
    return snapshot;
  },

  initPhotoRecognitionAd(adUnitId, options = {}) {
    const shouldPreload = options.preload !== false;
    if (!wx.createRewardedVideoAd || !adUnitId) return;
    if (photoRecognitionAd && photoRecognitionAdUnitId === adUnitId) {
      if (shouldPreload) this.preloadPhotoRecognitionAd();
      return;
    }
    detachPhotoRecognitionAdHandlers(photoRecognitionAd);
    photoRecognitionAd = wx.createRewardedVideoAd({ adUnitId });
    photoRecognitionAdUnitId = adUnitId;
    photoRecognitionAdLoadHandler = () => {};
    photoRecognitionAdErrorHandler = (error) => {
      console.error('[photo-learn-history] rewarded video load failed', error);
      if (typeof photoRecognitionAdErrorResolver === 'function') {
        photoRecognitionAdErrorResolver(error);
      }
    };
    photoRecognitionAdCloseHandler = (res) => {
      if (typeof photoRecognitionAdCloseResolver === 'function') {
        photoRecognitionAdCloseResolver(res);
      }
    };
    photoRecognitionAd.onLoad(photoRecognitionAdLoadHandler);
    photoRecognitionAd.onError(photoRecognitionAdErrorHandler);
    photoRecognitionAd.onClose(photoRecognitionAdCloseHandler);
    if (shouldPreload) this.preloadPhotoRecognitionAd();
  },

  preloadPhotoRecognitionAd() {
    if (photoRecognitionAdPlaying || !photoRecognitionAd || typeof photoRecognitionAd.load !== 'function') return;
    photoRecognitionAd.load().catch((error) => {
      console.warn('[photo-learn-history] rewarded video preload failed', error);
    });
  },

  consumePhotoRecognitionQuota(snapshot) {
    const current = snapshot || this.refreshPhotoQuotaView();
    if (!current || current.remaining <= 0) {
      this.refreshPhotoQuotaView();
      return false;
    }
    saveQuotaState({
      ...current.state,
      used: current.state.used + 1
    });
    this.refreshPhotoQuotaView();
    return true;
  },

  ensureSentenceQuota(recordId) {
    const config = this.photoRecognitionConfig || DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG;
    if (config.enabled === false) return true;
    const snapshot = this.refreshPhotoQuotaView();
    if (snapshot.remaining > 0) return true;
    this.pendingSentenceDetailId = recordId;
    this.setData({ showPhotoQuotaModal: true });
    return false;
  },

  addPhotoRecognitionQuotaBonus() {
    const config = this.photoRecognitionConfig || DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG;
    const snapshot = getQuotaSnapshot(config);
    const freeLimit = Math.max(0, Number(config.dailyFreeLimit) || 0);
    const bonusToAdd = Math.max(1, Number(config.rewardBonus) || 1);
    saveQuotaState({
      day: snapshot.state.day,
      used: freeLimit,
      bonus: snapshot.remaining + bonusToAdd
    });
    return this.refreshPhotoQuotaView();
  },

  playPhotoRecognitionRewardAd() {
    const config = this.photoRecognitionConfig || DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG;
    this.initPhotoRecognitionAd(config.adUnitId, { preload: false });
    if (!photoRecognitionAd) {
      wx.showToast({ title: '广告暂不可用', icon: 'none' });
      return Promise.resolve(false);
    }
    if (photoRecognitionAdPlaying) {
      wx.showToast({ title: '广告加载中', icon: 'none' });
      return Promise.resolve(false);
    }

    photoRecognitionAdPlaying = true;
    return new Promise((resolve) => {
      let settled = false;
      let showTimeoutTimer = null;
      const clearShowTimeout = () => {
        if (showTimeoutTimer) {
          clearTimeout(showTimeoutTimer);
          showTimeoutTimer = null;
        }
      };
      const finish = (ok, toastText) => {
        if (settled) return;
        settled = true;
        clearShowTimeout();
        photoRecognitionAdPlaying = false;
        photoRecognitionAdCloseResolver = null;
        photoRecognitionAdErrorResolver = null;
        if (toastText) {
          wx.showToast({
            title: toastText,
            icon: 'none',
            duration: 1500
          });
        }
        resolve(Boolean(ok));
      };
      photoRecognitionAdCloseResolver = (res) => {
        const completed = !res || res.isEnded;
        finish(completed, completed ? '已增加使用次数' : '看完广告后增加使用次数');
      };
      photoRecognitionAdErrorResolver = () => {
        finish(false, '广告暂不可用');
      };
      showTimeoutTimer = setTimeout(() => {
        finish(false, '广告拉起超时');
      }, 8000);
      photoRecognitionAd.show().catch(() => {
        return photoRecognitionAd.load().then(() => photoRecognitionAd.show());
      }).then(() => {
        clearShowTimeout();
      }).catch((error) => {
        console.error('[photo-learn-history] rewarded video show failed', error);
        finish(false, '广告暂不可用');
      });
    });
  },

  async watchPhotoQuotaAd() {
    if (this.data.photoQuotaAdLoading) return;
    this.setData({ photoQuotaAdLoading: true });
    try {
      const ok = await this.playPhotoRecognitionRewardAd();
      if (!ok) return;
      this.addPhotoRecognitionQuotaBonus();
      this.setData({ showPhotoQuotaModal: false });
      const pendingId = this.pendingSentenceDetailId;
      this.pendingSentenceDetailId = '';
      if (pendingId) {
        setTimeout(() => {
          this.generateSentenceDetailsForRecord(pendingId);
        }, 120);
      }
    } finally {
      this.setData({ photoQuotaAdLoading: false });
    }
  },

  closePhotoQuotaModal() {
    if (this.data.photoQuotaAdLoading) return;
    this.pendingSentenceDetailId = '';
    this.setData({ showPhotoQuotaModal: false });
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/photo-learn/index' });
      }
    });
  },

  toggleRecord(event) {
    const id = event.currentTarget.dataset.id;
    const willExpand = this.data.expandedRecordId !== id;
    this.setData({
      expandedRecordId: willExpand ? id : ''
    });
    if (willExpand) {
      const record = this.data.records.find((item) => item.id === id);
      this.prefetchRecordWordAudio(record);
    }
  },

  previewRecordImage(event) {
    const imagePath = event.currentTarget.dataset.image;
    if (!imagePath) return;
    wx.previewImage({
      current: imagePath,
      urls: [imagePath],
      fail: (error) => {
        console.warn('[photo-learn-history] preview image failed', error);
        wx.showToast({
          title: '图片暂时无法预览',
          icon: 'none'
        });
      }
    });
  },

  getWordAudioFilePath(text) {
    const safeHash = hashText(`${EDGE_TTS_LANGUAGE}:${text}`);
    return `${wx.env.USER_DATA_PATH}/photo_word_${safeHash}.mp3`;
  },

  getWordAudioCacheKey(text) {
    return hashText(`${EDGE_TTS_LANGUAGE}:${String(text || '').trim()}`);
  },

  getSentenceAudioFilePath(text) {
    const safeHash = hashText(`${EDGE_TTS_LANGUAGE}:sentence:${text}`);
    return `${wx.env.USER_DATA_PATH}/photo_sentence_${safeHash}.mp3`;
  },

  getSentenceAudioItems(details) {
    const seen = {};
    return (Array.isArray(details && details.items) ? details.items : [])
      .map((item, index) => ({
        key: String(item && item.key ? item.key : `sentence_${index + 1}`),
        text: String(item && item.sentence ? item.sentence : '').trim()
      }))
      .filter((item) => {
        if (!item.text || seen[item.text]) return false;
        seen[item.text] = true;
        return true;
      });
  },

  async writeSentenceAudioItems(items) {
    const audioItems = Array.isArray(items) ? items : [];
    if (!audioItems.length) return false;
    await Promise.all(audioItems.map((item) => {
      if (!item || !item.ok || !item.audioBase64 || !item.text) {
        return Promise.resolve();
      }
      const filePath = this.getSentenceAudioFilePath(item.text);
      return writeBase64File(filePath, item.audioBase64).catch((error) => {
        console.warn('[photo-learn-history] write sentence audio failed', item.text, error);
      });
    }));
    return true;
  },

  prepareWordAudioContext(text, src) {
    const word = String(text || '').trim();
    if (!word || !src) return null;
    if (!this.preparedWordAudioContexts) {
      this.preparedWordAudioContexts = {};
    }

    const key = this.getWordAudioCacheKey(word);
    const cached = this.preparedWordAudioContexts[key];
    if (cached && cached.src === src && cached.audio) {
      return cached.audio;
    }

    if (cached && cached.audio) {
      try {
        cached.audio.destroy();
      } catch (error) {
        // Stale audio contexts are best-effort cleanup only.
      }
    }

    const audio = wx.createInnerAudioContext();
    audio.obeyMuteSwitch = false;
    audio.src = src;
    this.preparedWordAudioContexts[key] = { src, audio, warmed: false, warming: false };
    return audio;
  },

  releaseWordAudioWarm(entry) {
    if (!entry) return;
    if (entry.warmTimer) {
      clearTimeout(entry.warmTimer);
      entry.warmTimer = null;
    }
    const handlers = entry.warmHandlers;
    if (handlers && entry.audio) {
      if (entry.audio.offCanplay) entry.audio.offCanplay(handlers.onCanplay);
      if (entry.audio.offEnded) entry.audio.offEnded(handlers.onEnded);
      if (entry.audio.offError) entry.audio.offError(handlers.onError);
    }
    entry.warmHandlers = null;
    entry.warming = false;
  },

  warmWordAudioContext(text, src) {
    const word = String(text || '').trim();
    if (!word || !src) return;
    const audio = this.prepareWordAudioContext(word, src);
    if (!audio || !this.preparedWordAudioContexts) return;
    const entry = this.preparedWordAudioContexts[this.getWordAudioCacheKey(word)];
    if (!entry || entry.warmed || entry.warming) return;

    // Assigning a cached local src is enough to let InnerAudioContext prepare it.
    // Do not silently play every word: pause may be delayed on some devices and
    // those warmups can later become audible, producing repeated Korean speech.
    try {
      if (audio.src !== src) audio.src = src;
      audio.autoplay = false;
      audio.loop = false;
      entry.warmed = true;
      entry.warming = false;
    } catch (error) {
      entry.warmed = false;
      entry.warming = false;
    }
  },

  stopWordAudio(destroy = false) {
    const contexts = [];
    if (this.activeWordAudioContext) contexts.push(this.activeWordAudioContext);
    if (this.preparedWordAudioContexts) {
      Object.keys(this.preparedWordAudioContexts).forEach((key) => {
        const entry = this.preparedWordAudioContexts[key];
        this.releaseWordAudioWarm(entry);
        if (entry && entry.audio) contexts.push(entry.audio);
      });
    }

    contexts.forEach((audio) => {
      try {
        audio.stop();
      } catch (error) {
        // Audio may already be idle.
      }
      if (destroy) {
        try {
          audio.destroy();
        } catch (error) {
          // Best-effort cleanup.
        }
      }
    });

    if (destroy) {
      this.activeWordAudioContext = null;
      this.preparedWordAudioContexts = null;
      this.edgeTtsPending = null;
      this.edgeTtsPrefetchByWord = null;
      this.sentenceTtsPending = null;
      this.sentenceTtsPrefetchByText = null;
    }
    this.setData({ speakingWordId: '', speakingSentenceKey: '' });
  },

  prepareRecordWordAudioContexts(record) {
    getRecordKoreanWords(record).forEach((word) => {
      const filePath = this.getWordAudioFilePath(word);
      if (fileExists(filePath)) {
        this.warmWordAudioContext(word, filePath);
      }
    });
  },

  async prefetchRecordWordAudio(record) {
    const words = getRecordKoreanWords(record);
    if (!words.length) return false;
    this.prepareRecordWordAudioContexts(record);

    if (!this.edgeTtsPrefetchByWord) {
      this.edgeTtsPrefetchByWord = {};
    }

    const requestWords = words.filter((word) => {
      if (fileExists(this.getWordAudioFilePath(word))) return false;
      if (this.edgeTtsPending && this.edgeTtsPending[word]) return false;
      return !this.edgeTtsPrefetchByWord[word];
    });
    if (!requestWords.length) return true;

    const batchPromise = (async () => {
      for (let start = 0; start < requestWords.length; start += EDGE_TTS_BATCH_SIZE) {
        const batchWords = requestWords.slice(start, start + EDGE_TTS_BATCH_SIZE);
        const response = await callCloudFunction('edgeTts', {
          lang: EDGE_TTS_LANGUAGE,
          items: batchWords.map((word) => ({
            key: word,
            text: word,
            lang: EDGE_TTS_LANGUAGE
          }))
        });
        const result = response && response.result ? response.result : {};
        const items = Array.isArray(result.items) ? result.items : [];
        await Promise.all(items.map((item) => {
          if (!item || !item.ok || !item.audioBase64 || !item.text) {
            return Promise.resolve();
          }
          const filePath = this.getWordAudioFilePath(item.text);
          return writeBase64File(filePath, item.audioBase64).catch((error) => {
            console.warn('[photo-learn-history] write batch audio failed', item.text, error);
          }).then(() => {
            if (fileExists(filePath)) {
              this.warmWordAudioContext(item.text, filePath);
            }
          });
        }));
      }
      return true;
    })().catch((error) => {
      console.warn('[photo-learn-history] batch prefetch word audio failed', error);
      return false;
    });

    requestWords.forEach((word) => {
      let wordPromise = null;
      wordPromise = batchPromise.then(() => {
        const filePath = this.getWordAudioFilePath(word);
        return fileExists(filePath) ? filePath : '';
      }).finally(() => {
        if (this.edgeTtsPrefetchByWord && this.edgeTtsPrefetchByWord[word] === wordPromise) {
          delete this.edgeTtsPrefetchByWord[word];
        }
      });
      this.edgeTtsPrefetchByWord[word] = wordPromise;
    });

    return batchPromise;
  },

  async prefetchSentenceAudio(details) {
    const sentenceItems = this.getSentenceAudioItems(details);
    if (!sentenceItems.length) return false;

    if (!this.sentenceTtsPrefetchByText) {
      this.sentenceTtsPrefetchByText = {};
    }

    const requestItems = sentenceItems.filter((item) => {
      if (fileExists(this.getSentenceAudioFilePath(item.text))) return false;
      if (this.sentenceTtsPending && this.sentenceTtsPending[item.text]) return false;
      return !this.sentenceTtsPrefetchByText[item.text];
    });
    if (!requestItems.length) return true;

    const batchPromise = (async () => {
      for (let start = 0; start < requestItems.length; start += EDGE_TTS_BATCH_SIZE) {
        const batchItems = requestItems.slice(start, start + EDGE_TTS_BATCH_SIZE);
        const response = await callCloudFunction('edgeTts', {
          lang: EDGE_TTS_LANGUAGE,
          items: batchItems.map((item) => ({
            key: item.key,
            text: item.text,
            lang: EDGE_TTS_LANGUAGE
          }))
        });
        const result = response && response.result ? response.result : {};
        await this.writeSentenceAudioItems(Array.isArray(result.items) ? result.items : []);
      }
      return true;
    })().catch((error) => {
      console.warn('[photo-learn-history] batch prefetch sentence audio failed', error);
      return false;
    });

    requestItems.forEach((item) => {
      let sentencePromise = null;
      sentencePromise = batchPromise.then(() => {
        const filePath = this.getSentenceAudioFilePath(item.text);
        return fileExists(filePath) ? filePath : '';
      }).finally(() => {
        if (this.sentenceTtsPrefetchByText && this.sentenceTtsPrefetchByText[item.text] === sentencePromise) {
          delete this.sentenceTtsPrefetchByText[item.text];
        }
      });
      this.sentenceTtsPrefetchByText[item.text] = sentencePromise;
    });

    return batchPromise;
  },

  async getWordAudioSource(text) {
    const word = String(text || '').trim();
    if (!word) {
      throw new Error('Missing word text');
    }

    const filePath = this.getWordAudioFilePath(word);
    if (fileExists(filePath)) {
      return filePath;
    }

    const prefetchPromise = this.edgeTtsPrefetchByWord && this.edgeTtsPrefetchByWord[word];
    if (prefetchPromise) {
      const prefetchedPath = await Promise.race([
        prefetchPromise,
        new Promise((resolve) => setTimeout(() => resolve(''), PREFETCH_CLICK_WAIT_MS))
      ]);
      if (prefetchedPath && fileExists(prefetchedPath)) {
        return prefetchedPath;
      }
      if (fileExists(filePath)) {
        return filePath;
      }
    }

    if (!this.edgeTtsPending) {
      this.edgeTtsPending = {};
    }
    if (this.edgeTtsPending[word]) {
      return this.edgeTtsPending[word];
    }

    this.edgeTtsPending[word] = (async () => {
      const response = await callCloudFunction('edgeTts', {
        text: word,
        lang: EDGE_TTS_LANGUAGE
      });
      const result = response && response.result ? response.result : {};
      if (!result.ok || !result.audioBase64) {
        throw new Error(result.error || 'Edge TTS failed');
      }
      await writeBase64File(filePath, result.audioBase64);
      this.warmWordAudioContext(word, filePath);
      return filePath;
    })();

    try {
      return await this.edgeTtsPending[word];
    } finally {
      delete this.edgeTtsPending[word];
    }
  },

  async getSentenceAudioSource(text) {
    const sentence = String(text || '').trim();
    if (!sentence) {
      throw new Error('Missing sentence text');
    }

    const filePath = this.getSentenceAudioFilePath(sentence);
    if (fileExists(filePath)) {
      return filePath;
    }

    const prefetchPromise = this.sentenceTtsPrefetchByText && this.sentenceTtsPrefetchByText[sentence];
    if (prefetchPromise) {
      const prefetchedPath = await prefetchPromise;
      if (prefetchedPath && fileExists(prefetchedPath)) {
        return prefetchedPath;
      }
      if (fileExists(filePath)) {
        return filePath;
      }
    }

    if (!this.sentenceTtsPending) {
      this.sentenceTtsPending = {};
    }
    if (this.sentenceTtsPending[sentence]) {
      return this.sentenceTtsPending[sentence];
    }

    this.sentenceTtsPending[sentence] = (async () => {
      const response = await callCloudFunction('edgeTts', {
        text: sentence,
        lang: EDGE_TTS_LANGUAGE
      });
      const result = response && response.result ? response.result : {};
      if (!result.ok || !result.audioBase64) {
        throw new Error(result.error || 'Edge TTS failed');
      }
      await writeBase64File(filePath, result.audioBase64);
      return filePath;
    })();

    try {
      return await this.sentenceTtsPending[sentence];
    } finally {
      delete this.sentenceTtsPending[sentence];
    }
  },

  playAudioSource(src, word) {
    return new Promise((resolve, reject) => {
      const audio = this.prepareWordAudioContext(word, src);
      const preparedEntry = this.preparedWordAudioContexts
        ? this.preparedWordAudioContexts[this.getWordAudioCacheKey(word)]
        : null;
      if (!audio) {
        reject(new Error('Missing audio context'));
        return;
      }

      let settled = false;
      let started = false;
      const markStarted = () => {
        started = true;
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (audio.offPlay) audio.offPlay(onPlay);
        if (audio.offCanplay) audio.offCanplay(onCanplay);
        if (audio.offEnded) audio.offEnded(onEnded);
        if (audio.offError) audio.offError(onError);
        if (error && !started) {
          reject(error);
          return;
        }
        resolve();
      };
      const onPlay = () => markStarted();
      const onCanplay = () => markStarted();
      const onEnded = () => finish();
      const onError = (error) => finish(error || new Error('Audio play failed'));
      const timer = setTimeout(() => {
        finish(new Error('Audio play timeout'));
      }, 45000);

      try {
        this.releaseWordAudioWarm(preparedEntry);
        audio.volume = 1;
        if (this.activeWordAudioContext && this.activeWordAudioContext !== audio) {
          this.activeWordAudioContext.stop();
        }
        audio.stop();
      } catch (error) {
        // Audio may be idle.
      }
      this.activeWordAudioContext = audio;
      if (audio.offPlay) audio.offPlay();
      if (audio.offCanplay) audio.offCanplay();
      if (audio.offEnded) audio.offEnded();
      if (audio.offError) audio.offError();
      if (audio.onPlay) audio.onPlay(onPlay);
      if (audio.onCanplay) audio.onCanplay(onCanplay);
      audio.onEnded(onEnded);
      audio.onError(onError);
      if (audio.src !== src) {
        audio.src = src;
      }
      audio.play();
    });
  },

  async playHistoryWord(event) {
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const word = String(dataset.word || '').trim();
    const wordId = String(dataset.wordId || word);
    if (!word) return;

    this.setData({ speakingWordId: wordId });
    try {
      const src = await this.getWordAudioSource(word);
      await this.playAudioSource(src, word);
    } catch (error) {
      console.error('[photo-learn-history] play word failed', error);
      wx.showToast({
        title: '朗读失败',
        icon: 'none'
      });
    } finally {
      if (this.data.speakingWordId === wordId) {
        this.setData({ speakingWordId: '' });
      }
    }
  },

  async playSentenceAudio(event) {
    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
    const sentence = String(dataset.text || '').trim();
    const key = String(dataset.key || sentence);
    if (!sentence) return;

    this.setData({ speakingSentenceKey: key });
    try {
      const src = await this.getSentenceAudioSource(sentence);
      await this.playAudioSource(src, sentence);
    } catch (error) {
      console.error('[photo-learn-history] play sentence failed', error);
      wx.showToast({
        title: '朗读失败',
        icon: 'none'
      });
    } finally {
      if (this.data.speakingSentenceKey === key) {
        this.setData({ speakingSentenceKey: '' });
      }
    }
  },

  openSentenceDetails(event) {
    const id = event.currentTarget.dataset.id;
    this.generateSentenceDetailsForRecord(id);
  },

  getRecordSentenceDetails(record) {
    const details = normalizeSentenceDetails(record && record.sentenceDetails);
    return isGeneratedSentenceDetailsComplete(record, details) ? details : null;
  },

  showSentenceDetails(record, details) {
    this.setData({
      showSentenceModal: true,
      sentenceModalRecord: record,
      sentenceDetails: details
    }, () => {
      this.prefetchSentenceAudio(details);
    });
  },

  updateRecordSentenceDetails(recordId, details) {
    const nextRecords = (this.data.records || []).map((item) => (
      item.id === recordId
        ? { ...item, sentenceDetails: details }
        : item
    ));
    try {
      wx.setStorageSync(HISTORY_KEY, nextRecords);
    } catch (error) {
      console.warn('[photo-learn-history] save sentence details failed', error);
    }
    this.setData({ records: nextRecords });
    return nextRecords.find((item) => item.id === recordId) || null;
  },

  isSentenceQuotaTipDisabled() {
    try {
      return wx.getStorageSync(SENTENCE_QUOTA_TIP_DISABLED_KEY) === true;
    } catch (error) {
      return false;
    }
  },

  showSentenceQuotaUseConfirm(recordId) {
    this.setData({
      showSentenceQuotaConfirm: true,
      pendingSentenceQuotaRecordId: recordId,
      sentenceQuotaNoMoreTip: true
    });
  },

  toggleSentenceQuotaNoMoreTip() {
    this.setData({
      sentenceQuotaNoMoreTip: !this.data.sentenceQuotaNoMoreTip
    });
  },

  cancelSentenceQuotaConfirm() {
    this.setData({
      showSentenceQuotaConfirm: false,
      pendingSentenceQuotaRecordId: ''
    });
  },

  confirmSentenceQuotaUse() {
    const id = this.data.pendingSentenceQuotaRecordId;
    if (this.data.sentenceQuotaNoMoreTip) {
      try {
        wx.setStorageSync(SENTENCE_QUOTA_TIP_DISABLED_KEY, true);
      } catch (error) {
        // Ignore local preference failures.
      }
    }
    this.setData({
      showSentenceQuotaConfirm: false,
      pendingSentenceQuotaRecordId: ''
    });
    if (id) {
      this.generateSentenceDetailsForRecord(id, { confirmedQuotaUse: true });
    }
  },

  async generateSentenceDetailsForRecord(id, options = {}) {
    if (this.data.sentenceLoadingRecordId) {
      wx.showToast({ title: '正在生成中', icon: 'none' });
      return;
    }

    const record = (this.data.records || []).find((item) => item.id === id);
    if (!record) return;

    const cachedDetails = this.getRecordSentenceDetails(record);
    if (cachedDetails) {
      this.showSentenceDetails(record, cachedDetails);
      return;
    }

    const words = buildSentenceWords(record);
    if (!words.length) {
      wx.showToast({ title: '没有可生成例句的单词', icon: 'none' });
      return;
    }

    if (!this.ensureSentenceQuota(id)) {
      return;
    }

    if (!options.confirmedQuotaUse && !this.isSentenceQuotaTipDisabled()) {
      this.showSentenceQuotaUseConfirm(id);
      return;
    }

    this.setData({ sentenceLoadingRecordId: id });
    try {
      const response = await callCloudFunction('qwenScene', {
        mode: 'wordSentences',
        includeAudio: true,
        traceId: `photo_sentence_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        sceneName: record.title || record.sceneName || '拍照词卡',
        words
      });
      const result = response && response.result ? response.result : {};
      if (!result.ok || !result.details) {
        throw new Error(result.error || '例句生成失败');
      }
      const details = completeSentenceDetails(record, {
        ...result.details,
        createdAt: Date.now(),
        source: 'wordSentences'
      });
      if (!details) {
        throw new Error('例句内容为空');
      }
      await this.writeSentenceAudioItems(result.sentenceAudioItems);
      this.consumePhotoRecognitionQuota();
      const nextRecord = this.updateRecordSentenceDetails(id, details) || {
        ...record,
        sentenceDetails: details
      };
      this.showSentenceDetails(nextRecord, details);
    } catch (error) {
      console.error('[photo-learn-history] generate sentence details failed', error);
      wx.showToast({
        title: '例句生成失败，请稍后再试',
        icon: 'none'
      });
    } finally {
      this.setData({ sentenceLoadingRecordId: '' });
    }
  },

  closeSentenceModal() {
    this.setData({
      showSentenceModal: false,
      sentenceModalRecord: null,
      sentenceDetails: null,
      speakingSentenceKey: ''
    });
  },

  practiceRecord(event) {
    const id = event.currentTarget.dataset.id;
    const record = this.data.records.find((item) => item.id === id);
    if (!record) return;

    const words = buildPracticeWords(record);
    if (!words.length) {
      wx.showToast({ title: '没有可练习的单词', icon: 'none' });
      return;
    }

    this.setData({
      showPracticeConfirm: true,
      pendingPracticeId: id,
      practiceConfirmCount: words.length
    });
  },

  cancelPracticeConfirm() {
    this.setData({
      showPracticeConfirm: false,
      pendingPracticeId: '',
      practiceConfirmCount: 0
    });
  },

  confirmPracticeRecord() {
    const id = this.data.pendingPracticeId;
    const record = this.data.records.find((item) => item.id === id);
    const words = buildPracticeWords(record);
    if (!words.length) {
      this.cancelPracticeConfirm();
      wx.showToast({ title: '没有可练习的单词', icon: 'none' });
      return;
    }

    const result = addPhotoRecognitionWords(words);
    if (!result.success) {
      wx.showToast({ title: result.message || '加入失败', icon: 'none' });
      return;
    }

    const settings = wx.getStorageSync('settings') || {};
    const nextSettings = {
      ...settings,
      category: PHOTO_RECOGNITION_CATEGORY
    };
    delete nextSettings.photoPracticeId;
    wx.setStorageSync('settings', nextSettings);
    saveProgressV2(PHOTO_RECOGNITION_CATEGORY, 'photo_recognition', 0);

    this.cancelPracticeConfirm();
    const mergedCount = Number(result.merged || result.added || result.updated || words.length);
    wx.showToast({
      title: `已加入${mergedCount}个词`,
      icon: 'none'
    });
    setTimeout(() => {
      wx.switchTab({ url: '/pages/nv-practice/index' });
    }, 220);
  },

  preventModalBubble() {},

  preventTouchMove() {
    return false;
  }
});
