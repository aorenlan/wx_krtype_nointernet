import { addPhotoRecognitionWords, PHOTO_RECOGNITION_CATEGORY, saveProgressV2 } from '../../utils_nv/storage';

const HERO_PHRASE = '即刻拍照，学习词汇';
const HERO_FINAL_TEXT = 'Hello · 안녕하세요 · こんにちは';
const { analyzeImageToLearningCard } = require('../../utils/qwen-ai');
const {
  DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG,
  loadPhotoLearnRecognitionConfig
} = require('../../utils/photo-limit-config');
const { drawPhotoLearnShareCard, safeText } = require('../../utils/share-card');
const { clearPageTabBarTimer, syncPageTabBar } = require('../../utils/tabbar');

const EDGE_TTS_LANGUAGE = 'ko-KR';
const EDGE_TTS_BATCH_SIZE = 12;
const HERO_FINAL_CHARS = Array.from(HERO_FINAL_TEXT).map((char) => {
  if (/[A-Za-z]/.test(char)) {
    return { text: char, tone: 'en' };
  }
  if (/[\uac00-\ud7af]/.test(char)) {
    return { text: char, tone: 'ko' };
  }
  if (/[\u3040-\u30ff]/.test(char)) {
    return { text: char, tone: 'ja' };
  }
  return { text: char, tone: 'muted' };
});

const HISTORY_KEY = 'photoLearnHistoryRecords';
const HISTORY_LIMIT = 12;
const PHOTO_RECOGNITION_QUOTA_KEY = 'photo_learn_recognition_quota_v1';

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
    // Local quota cache failures should not crash the page.
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

function buildQuotaText(config, snapshot) {
  if (!config || config.enabled === false) return '';
  if (snapshot.remaining > 0) {
    return `今日还可拍 ${snapshot.remaining} 次`;
  }
  return '今日次数已用完，去获取次数吧~';
}

function normalizeHistoryRecords(records) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((item) => item && item.imagePath)
    .slice(0, HISTORY_LIMIT)
    .map((item) => {
      const createdAt = Number(item.createdAt) || Date.now();
      return {
        id: item.id || `photo_${createdAt}`,
        imagePath: item.imagePath,
        createdAt,
        timeText: formatHistoryTime(createdAt),
        title: item.title || '韩语词卡',
        desc: item.desc || '等待生成韩语词卡',
        statusText: item.statusText || '待生成',
        sceneName: item.sceneName || '',
        categoryKey: item.categoryKey || '',
        wordCount: Number(item.wordCount) || 0,
        words: Array.isArray(item.words) ? item.words : [],
        card: item.card || null,
        aiTraceId: item.aiTraceId || ''
      };
    });
}

function pickKoreanLanguage(card) {
  const languages = (card && card.languages) || {};
  return languages.ko || languages[Object.keys(languages)[0]] || {};
}

function buildHistoryRecordFromCard(card, imagePath, sourceType) {
  const language = pickKoreanLanguage(card);
  const words = Array.isArray(language.words) ? language.words : [];
  const firstWords = words.slice(0, 3).map((item) => {
    const text = item && item.text ? item.text : '';
    const meaning = item && item.meaning ? item.meaning : '';
    return meaning ? `${text} · ${meaning}` : text;
  }).filter(Boolean);
  const createdAt = Date.now();
  const sceneName = language.sceneName || language.category || '韩语词卡';
  return {
    id: card.id || `photo_${createdAt}`,
    imagePath,
    source: sourceType,
    createdAt,
    title: sceneName,
    desc: firstWords.length ? firstWords.join(' / ') : '已生成韩语词卡',
    statusText: words.length ? `${words.length}词` : '已识别',
    sceneName,
    categoryKey: card.categoryKey || card.aiCategoryKey || '',
    wordCount: words.length,
    words,
    card,
    aiTraceId: card.aiTraceId || ''
  };
}

function buildPracticeWords(record) {
  if (!record) return [];
  return (Array.isArray(record.words) ? record.words : [])
    .map((item, index) => ({
      id: `photo_rec_${record.id}_${index}`,
      word: item && item.text ? String(item.text).trim() : '',
      meaning: item && item.meaning ? String(item.meaning).trim() : '',
      sourceCategory: PHOTO_RECOGNITION_CATEGORY,
      sourceId: record.id,
      scene: record.title || '拍照练习'
    }))
    .filter((item) => item.word);
}

function getRecordKoreanWords(record) {
  const seen = {};
  return (Array.isArray(record && record.words) ? record.words : [])
    .map((item) => String(item && item.text || '').trim())
    .filter((word) => {
      if (!word || seen[word]) return false;
      seen[word] = true;
      return true;
    });
}

function safeDecodeURIComponent(value) {
  const text = String(value || '');
  try {
    return decodeURIComponent(text);
  } catch (error) {
    return text;
  }
}

function normalizeSharedWords(words) {
  if (!Array.isArray(words)) return [];
  const seen = {};
  return words
    .map((item) => {
      const text = safeText(item && (item.t || item.text || item.word));
      const meaning = safeText(item && (item.m || item.meaning || item.cn));
      return text ? { text, meaning } : null;
    })
    .filter((item) => {
      if (!item || seen[item.text]) return false;
      seen[item.text] = true;
      return true;
    })
    .slice(0, 8);
}

function parseSharedWordsParam(value) {
  const text = safeDecodeURIComponent(value);
  if (!text) return [];
  try {
    return normalizeSharedWords(JSON.parse(text));
  } catch (error) {
    return [];
  }
}

function buildSharedWordsParam(source) {
  const rawWords = Array.isArray(source)
    ? source
    : (Array.isArray(source && source.words) ? source.words : []);
  const words = normalizeSharedWords(rawWords);
  if (!words.length) return '';
  const compactWords = words.map((item) => ({
    t: item.text,
    m: item.meaning
  }));
  return encodeURIComponent(JSON.stringify(compactWords));
}

function getReadableQwenError(error) {
  const message = error && (error.message || error.errMsg) ? (error.message || error.errMsg) : String(error || '');
  if ((error && error.code === 'UNSAFE_CONTENT') || /UNSAFE_CONTENT|不适合生成学习词卡|unsafe_content/i.test(message)) {
    return '识别失败，请换一张日常图片';
  }
  if (/FUNCTION_NOT_FOUND|function not found|qwenScene/i.test(message)) {
    return '识别云函数 qwenScene 还没有部署';
  }
  if (/Missing QWEN_API_KEY/i.test(message)) {
    return '云函数缺少 QWEN_API_KEY';
  }
  if (/wx-server-sdk is required|downloadFile|Downloaded image file/i.test(message)) {
    return '云函数依赖未安装，请用云端安装依赖重新部署';
  }
  if (/Missing QWEN_OPENAI_BASE_URL|Missing QWEN_API_HOST/i.test(message)) {
    return '云函数缺少 Qwen 接口地址配置';
  }
  if (/Qwen output|Invalid Qwen response|parse response/i.test(message)) {
    return '模型返回不完整，请再试一次';
  }
  if (/timeout|TIME_LIMIT|timed out/i.test(message)) {
    return '识别超时，请稍后再试';
  }
  if (/wx\.cloud|cloud is not available/i.test(message)) {
    return '当前环境未启用云能力';
  }
  return '识别失败，请换张清晰图片再试';
}

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    heroChars: [],
    heroLeaving: false,
    heroFinal: false,
    heroHaloActive: false,
    typingActive: false,
	    selectedImagePath: '',
	    historyRecords: [],
	    latestRecord: null,
	    currentRecord: null,
    sharedWords: [],
    sharedSceneName: '',
	    isAnalyzing: false,
	    analysisStatus: '',
	    speakingWordIndex: -1,
    shareImagePath: '',
    photoQuotaEnabled: DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG.enabled,
    photoQuotaRemaining: DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG.dailyFreeLimit,
    photoQuotaLimit: DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG.dailyFreeLimit,
    photoQuotaRewardBonus: DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG.rewardBonus,
    photoQuotaText: '',
    showPhotoQuotaModal: false,
    photoQuotaAdLoading: false
	  },

  onLoad(options) {
    const app = getApp();
    const sharedWords = parseSharedWordsParam(options && options.w);
    const sharedSceneName = safeText(safeDecodeURIComponent(options && options.s), sharedWords.length ? '朋友分享的韩语词卡' : '');
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 0,
      navBarHeight: app.globalData.navBarHeight || 0,
      sharedWords,
      sharedSceneName
    });
    this.loadHistoryRecords();
    this.photoRecognitionConfig = { ...DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG };
    this.initPhotoRecognitionAd(this.photoRecognitionConfig.adUnitId);
    this.refreshPhotoQuotaView();
    this.loadPhotoRecognitionLimitConfig({ force: true });
  },

  onShow() {
    this.syncTabBar();
    this.loadHistoryRecords();
    this.refreshPhotoQuotaView();
    this.loadPhotoRecognitionLimitConfig({ force: true });
    this.startHeroTyping();
  },

	  onHide() {
	    this.stopHeroTyping();
	    this.clearTabBarSyncTimer();
	    this.stopWordAudio();
	  },

	  onUnload() {
	    this.stopHeroTyping();
	    this.clearTabBarSyncTimer();
    if (this._shareImageTimer) {
      clearTimeout(this._shareImageTimer);
      this._shareImageTimer = null;
    }
	    this.stopWordAudio(true);
	  },

  onReady() {
    this.syncTabBar();
  },

  clearTabBarSyncTimer() {
    if (this.tabBarSyncTimer) {
      clearTimeout(this.tabBarSyncTimer);
      this.tabBarSyncTimer = null;
    }
    clearPageTabBarTimer(this);
  },

  syncTabBar() {
    syncPageTabBar(this, { selected: 2, hidden: false });
  },

  getPhotoShareMeta() {
    const record = this.data.currentRecord || (this.data.historyRecords && this.data.historyRecords[0]) || null;
    const sharedWords = normalizeSharedWords(this.data.sharedWords);
    const words = normalizeSharedWords(record && record.words).length
      ? normalizeSharedWords(record.words)
      : sharedWords;
    const wordCount = words.length;
    const wordText = words.slice(0, 4).map((item) => item.text).join(' ');
    const sceneName = safeText(record && (record.sceneName || record.title), safeText(this.data.sharedSceneName, '生活场景'));
    const title = wordCount ? '这张照片能学韩语' : '拍照学韩语';
    const subtitle = wordCount
      ? `识别出 ${wordCount} 个词，点开跟读练习`
      : '拍一下身边的东西，马上得到韩语词卡';
    return {
      title,
      subtitle,
      sceneName,
      image: '',
      words,
      wordCount,
      shareTitle: wordCount
        ? `拍照学韩语：这张图识别出 ${wordCount} 个词`
        : '拍照学韩语：把生活照片变成韩语词卡',
      timelineTitle: wordCount
        ? `拍照学韩语：${wordText || sceneName}`
        : '拍照学韩语：随手拍，马上学',
      key: ['photo-learn-card-v3', wordText, wordCount, record && record.id, this.data.sharedSceneName].join('|')
    };
  },

  scheduleShareImage() {
    if (this._shareImageTimer) {
      clearTimeout(this._shareImageTimer);
      this._shareImageTimer = null;
    }
    const meta = this.getPhotoShareMeta();
    this._shareImageTimer = setTimeout(() => {
      this._shareImageTimer = null;
      this.drawShareImage();
    }, 160);
  },

  async drawShareImage() {
    const meta = this.getPhotoShareMeta();
    if (this._shareImageKey === meta.key && this.data.shareImagePath) return;
    this._shareImageKey = meta.key;
    try {
      const imagePath = await drawPhotoLearnShareCard(this, {
        selector: '#photoShareCanvas',
        brand: '韩语打字练习',
        title: meta.title,
        subtitle: meta.subtitle,
        sceneName: meta.sceneName,
        wordCount: meta.wordCount,
        words: meta.words,
        sectionTitle: meta.wordCount ? '这张图里的韩语词' : '拍照生成韩语词卡',
        footer: '打开小程序，拍一下就开始学',
        accentColor: '#0f766e'
      });
      if (this._shareImageKey === meta.key && imagePath) {
        this.setData({ shareImagePath: imagePath });
      }
    } catch (error) {
      console.warn('[photo-learn] draw share image failed', error);
    }
  },

  onShareAppMessage() {
    const meta = this.getPhotoShareMeta();
    const params = [];
    const wordsParam = buildSharedWordsParam(meta.words);
    if (wordsParam) params.push(`w=${wordsParam}`);
    if (meta.sceneName) params.push(`s=${encodeURIComponent(meta.sceneName)}`);
    const path = params.length ? `/pages/photo-learn/index?${params.join('&')}` : '/pages/photo-learn/index';
    return {
      title: meta.shareTitle,
      path,
      imageUrl: this.data.shareImagePath || ''
    };
  },

  onShareTimeline() {
    const meta = this.getPhotoShareMeta();
    return {
      title: meta.timelineTitle,
      imageUrl: this.data.shareImagePath || ''
    };
  },

  stopHeroTyping() {
    if (this.heroTypingTimer) {
      clearTimeout(this.heroTypingTimer);
      this.heroTypingTimer = null;
    }
  },

  startHeroTyping() {
    this.stopHeroTyping();
    const chars = Array.from(HERO_PHRASE);
    let cursor = 0;

    this.setData({
      heroChars: [],
      heroLeaving: false,
      heroFinal: false,
      heroHaloActive: false,
      typingActive: true
    });

    const tick = () => {
      cursor += 1;
      this.setData({
        heroChars: chars.slice(0, cursor).map((char) => ({
          text: char,
          tone: 'plain'
        }))
      });

      if (cursor < chars.length) {
        this.heroTypingTimer = setTimeout(tick, 128);
        return;
      }

      this.setData({ typingActive: false });
      this.heroTypingTimer = setTimeout(() => {
        this.setData({ heroLeaving: true });
        this.heroTypingTimer = setTimeout(() => {
          this.showHeroFinal();
        }, 360);
      }, 1050);
    };

    this.heroTypingTimer = setTimeout(tick, 220);
  },

  showHeroFinal() {
    let cursor = 0;
    this.setData({
      heroChars: [],
      heroLeaving: false,
      heroFinal: true,
      heroHaloActive: false,
      typingActive: true
    });

    const tick = () => {
      cursor += 1;
      this.setData({
        heroChars: HERO_FINAL_CHARS.slice(0, cursor)
      });

      if (cursor < HERO_FINAL_CHARS.length) {
        this.heroTypingTimer = setTimeout(tick, 86);
        return;
      }

      this.setData({
        typingActive: false,
        heroHaloActive: true
      });
      this.heroTypingTimer = null;
    };

    this.heroTypingTimer = setTimeout(tick, 160);
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
      console.warn('[photo-learn] use default recognition config', error);
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
      photoQuotaEnabled: config.enabled !== false,
      photoQuotaRemaining: snapshot.remaining,
      photoQuotaLimit: snapshot.freeLimit,
      photoQuotaRewardBonus: config.rewardBonus,
      photoQuotaText: buildQuotaText(config, snapshot)
    });
    return snapshot;
  },

	  initPhotoRecognitionAd(adUnitId, options = {}) {
	    const shouldPreload = options.preload !== false;
	    if (!wx.createRewardedVideoAd || !adUnitId) return;
	    if (photoRecognitionAd && photoRecognitionAdUnitId === adUnitId) {
	      if (shouldPreload) {
	        this.preloadPhotoRecognitionAd();
	      }
	      return;
	    }
	    detachPhotoRecognitionAdHandlers(photoRecognitionAd);
	    photoRecognitionAd = wx.createRewardedVideoAd({ adUnitId });
	    photoRecognitionAdUnitId = adUnitId;
	    photoRecognitionAdLoadHandler = () => {};
	    photoRecognitionAdErrorHandler = (error) => {
	      console.error('[photo-learn] rewarded video load failed', error);
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
	    if (shouldPreload) {
	      this.preloadPhotoRecognitionAd();
	    }
	  },

  preloadPhotoRecognitionAd() {
    if (photoRecognitionAdPlaying || !photoRecognitionAd || typeof photoRecognitionAd.load !== 'function') return;
    photoRecognitionAd.load().catch((error) => {
      console.warn('[photo-learn] rewarded video preload failed', error);
    });
  },

  consumePhotoRecognitionQuota(snapshot) {
    const current = snapshot || this.refreshPhotoQuotaView();
    if (!current || current.remaining <= 0) {
      this.refreshPhotoQuotaView();
      return false;
    }
    const nextState = {
      ...current.state,
      used: current.state.used + 1
    };
    saveQuotaState(nextState);
    this.refreshPhotoQuotaView();
    return true;
  },

  ensurePhotoRecognitionQuota(imagePath, sourceType) {
    const config = this.photoRecognitionConfig || DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG;
    if (config.enabled === false) return true;

    const snapshot = this.refreshPhotoQuotaView();
    if (snapshot.remaining > 0) {
      return true;
    }

    this.pendingPhotoAnalyze = { imagePath, sourceType };
    this.setData({ showPhotoQuotaModal: true });
    return false;
  },

  addPhotoRecognitionQuotaBonus() {
    const config = this.photoRecognitionConfig || DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG;
    const snapshot = getQuotaSnapshot(config);
    const freeLimit = Math.max(0, Number(config.dailyFreeLimit) || 0);
    const bonusToAdd = Math.max(1, Number(config.rewardBonus) || 1);

    // Keep ad rewards as real remaining chances. If today's free limit was
    // changed after the user already used more attempts, the old "used" count
    // must not swallow the newly earned reward.
    saveQuotaState({
      day: snapshot.state.day,
      used: freeLimit,
      bonus: snapshot.remaining + bonusToAdd
    });
    return this.refreshPhotoQuotaView();
  },

  openPhotoQuotaModal() {
    const config = this.photoRecognitionConfig || DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG;
    const snapshot = this.refreshPhotoQuotaView();
    if (config.enabled !== false && snapshot.remaining <= 0) {
      this.setData({ showPhotoQuotaModal: true });
    }
  },

  closePhotoQuotaModal() {
    if (this.data.photoQuotaAdLoading) return;
    this.pendingPhotoAnalyze = null;
    this.setData({ showPhotoQuotaModal: false });
  },

  preventTouchMove() {},

  stopTapBubble() {},

  playPhotoRecognitionRewardAd() {
    const config = this.photoRecognitionConfig || DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG;
    this.initPhotoRecognitionAd(config.adUnitId, { preload: false });
    if (!photoRecognitionAd) {
      wx.showToast({
        title: '广告暂不可用',
        icon: 'none'
      });
      return Promise.resolve(false);
    }
    if (photoRecognitionAdPlaying) {
      wx.showToast({
        title: '广告加载中',
        icon: 'none'
      });
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
        finish(completed, completed ? '已增加识别次数' : '看完广告后增加次数');
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
        console.error('[photo-learn] rewarded video show failed', error);
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
      const pending = this.pendingPhotoAnalyze;
      this.pendingPhotoAnalyze = null;
      if (pending && pending.imagePath) {
        setTimeout(() => {
          this.analyzeSelectedPhoto(pending.imagePath, pending.sourceType);
        }, 120);
      }
    } finally {
      this.setData({ photoQuotaAdLoading: false });
    }
  },

  choosePhoto(sourceType) {
    if (this.data.isAnalyzing) {
      wx.showToast({
        title: '正在识别中',
        icon: 'none'
      });
      return;
    }

    if (!wx.chooseMedia) {
      wx.showToast({
        title: '当前基础库不支持',
        icon: 'none'
      });
      return;
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: [sourceType],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        const tempFilePath = file && file.tempFilePath;
        if (!tempFilePath) return;
        this.persistPhoto(tempFilePath, (imagePath) => {
          this.analyzeSelectedPhoto(imagePath, sourceType);
        });
      },
      fail: (error) => {
        if (String(error && error.errMsg || '').indexOf('cancel') >= 0) return;
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  getStoredHistoryRecords() {
    return normalizeHistoryRecords(wx.getStorageSync(HISTORY_KEY));
  },

  loadHistoryRecords() {
    const historyRecords = this.getStoredHistoryRecords();
    const currentRecord = historyRecords[0] || null;
    this.setData({
      historyRecords,
      latestRecord: currentRecord,
      currentRecord
    }, () => {
      this.scheduleShareImage();
    });
    if (currentRecord) {
      this.prefetchRecordWordAudio(currentRecord);
    }
  },

  persistPhoto(tempFilePath, done) {
    if (!wx.saveFile) {
      done(tempFilePath);
      return;
    }

    wx.saveFile({
      tempFilePath,
      success: (result) => {
        done(result.savedFilePath || tempFilePath);
      },
      fail: () => {
        done(tempFilePath);
      }
    });
  },

  addHistoryRecord(record) {
    const nextRecords = normalizeHistoryRecords([record].concat(this.getStoredHistoryRecords()));
    const savedRecord = nextRecords[0] || record;
    wx.setStorageSync(HISTORY_KEY, nextRecords);
    this.setData({
      selectedImagePath: record.imagePath,
      historyRecords: nextRecords,
      latestRecord: savedRecord,
      currentRecord: savedRecord
    }, () => {
      this.scheduleShareImage();
    });
    this.prefetchRecordWordAudio(savedRecord);
    return savedRecord;
  },

  async analyzeSelectedPhoto(imagePath, sourceType) {
    if (!this.ensurePhotoRecognitionQuota(imagePath, sourceType)) {
      return;
    }

    this.setData({
      selectedImagePath: imagePath,
      currentRecord: null,
      shareImagePath: '',
      isAnalyzing: true,
      analysisStatus: '正在压缩图片'
    });
    wx.showLoading({
      title: '识别中',
      mask: true
    });

    try {
      this.setData({ analysisStatus: '正在识别场景' });
      const card = await analyzeImageToLearningCard({
        imagePath,
        source: sourceType,
        languageKey: 'ko'
      });
      const historyRecord = buildHistoryRecordFromCard(card, imagePath, sourceType);
      this.addHistoryRecord(historyRecord);
      this.consumePhotoRecognitionQuota();
      this.setData({
        isAnalyzing: false,
        analysisStatus: ''
      });
      wx.showToast({
        title: '识别完成',
        icon: 'success'
      });
    } catch (error) {
      const message = getReadableQwenError(error);
      console.error('[photo-learn] analyze failed', error);
      this.setData({
        isAnalyzing: false,
        analysisStatus: ''
      });
      wx.showToast({
        title: message,
        icon: 'none',
        duration: 2600
      });
    } finally {
      wx.hideLoading();
    }
  },

  goCamera() {
    this.choosePhoto('camera');
  },

	  practiceCurrentRecord() {
    const currentRecord = this.data.currentRecord || (this.data.historyRecords && this.data.historyRecords[0]);
    const words = buildPracticeWords(currentRecord);
    if (!words.length) {
      wx.showToast({
        title: '没有可练习的单词',
        icon: 'none'
      });
      return;
    }

    const result = addPhotoRecognitionWords(words);
    if (!result.success) {
      wx.showToast({
        title: result.message || '加入失败',
        icon: 'none'
      });
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
	    wx.setStorageSync('nv_practice_force_reload', {
	      category: PHOTO_RECOGNITION_CATEGORY,
	      reason: 'photo_recognition_added',
	      ts: Date.now()
	    });

	    const mergedCount = Number(result.merged || result.added || result.updated || words.length);
    wx.showToast({
      title: `已加入${mergedCount}个词`,
      icon: 'none'
    });
    setTimeout(() => {
      wx.switchTab({ url: '/pages/nv-practice/index' });
    }, 220);
  },

	  goHistory() {
	    if (!this.data.historyRecords.length) {
      wx.showToast({
        title: '暂无历史记录',
        icon: 'none'
      });
      return;
    }
	    wx.navigateTo({
	      url: '/pages/photo-learn-history/index'
	    });
	  },

	  ensureWordAudio() {
	    if (this.wordAudioContext) {
	      return this.wordAudioContext;
	    }
	    this.wordAudioContext = wx.createInnerAudioContext();
	    this.wordAudioContext.obeyMuteSwitch = false;
	    return this.wordAudioContext;
	  },

	  stopWordAudio(destroy = false) {
	    const contexts = [];
	    if (this.wordAudioContext) contexts.push(this.wordAudioContext);
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
	        // Stop is best-effort; the context may already be idle.
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
	      this.wordAudioContext = null;
	      this.activeWordAudioContext = null;
	      this.preparedWordAudioContexts = null;
	    }
	    this.setData({ speakingWordIndex: -1 });
	  },

	  getWordAudioFilePath(text) {
	    const safeHash = hashText(`${EDGE_TTS_LANGUAGE}:${text}`);
	    return `${wx.env.USER_DATA_PATH}/photo_word_${safeHash}.mp3`;
	  },

	  getWordAudioCacheKey(text) {
	    return hashText(`${EDGE_TTS_LANGUAGE}:${String(text || '').trim()}`);
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
	        // Ignore stale context cleanup failures.
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

	    entry.warming = true;
	    const finishWarm = (markWarmed) => {
	      this.releaseWordAudioWarm(entry);
	      entry.warmed = !!markWarmed;
	      try {
	        audio.pause();
	        if (audio.seek) audio.seek(0);
	      } catch (error) {
	        // Warmup cleanup is best-effort.
	      }
	      audio.volume = 1;
	    };
	    const onCanplay = () => finishWarm(true);
	    const onEnded = () => finishWarm(true);
	    const onError = () => finishWarm(false);

	    entry.warmHandlers = { onCanplay, onEnded, onError };
	    if (audio.onCanplay) audio.onCanplay(onCanplay);
	    audio.onEnded(onEnded);
	    audio.onError(onError);
	    entry.warmTimer = setTimeout(() => finishWarm(true), 260);

	    try {
	      audio.volume = 0;
	      if (audio.src !== src) audio.src = src;
	      audio.play();
	    } catch (error) {
	      finishWarm(false);
	    }
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
	    if (!words.length) return Promise.resolve(false);
	    this.prepareRecordWordAudioContexts(record);

	    if (!this.edgeTtsPrefetchByWord) {
	      this.edgeTtsPrefetchByWord = {};
	    }

	    const requestWords = words.filter((word) => {
	      if (fileExists(this.getWordAudioFilePath(word))) return false;
	      if (this.edgeTtsPending && this.edgeTtsPending[word]) return false;
	      return !this.edgeTtsPrefetchByWord[word];
	    });
	    if (!requestWords.length) return Promise.resolve(true);

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
	            console.warn('[photo-learn] write batch audio failed', item.text, error);
	          }).then(() => {
	            if (fileExists(filePath)) {
	              this.warmWordAudioContext(item.text, filePath);
	            }
	          });
	        }));
	      }
	      return true;
	    })().catch((error) => {
	      console.warn('[photo-learn] batch prefetch word audio failed', error);
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
	      const prefetchedPath = await prefetchPromise;
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

	  playAudioSource(src, word) {
	    return new Promise((resolve, reject) => {
	      const audio = word ? this.prepareWordAudioContext(word, src) : this.ensureWordAudio();
	      const preparedEntry = word && this.preparedWordAudioContexts
	        ? this.preparedWordAudioContexts[this.getWordAudioCacheKey(word)]
	        : null;
	      let settled = false;
	      const finish = (error) => {
	        if (settled) return;
	        settled = true;
	        clearTimeout(timer);
	        if (audio.offEnded) audio.offEnded(onEnded);
	        if (audio.offError) audio.offError(onError);
	        if (error) {
	          reject(error);
	          return;
	        }
	        resolve();
	      };
	      const onEnded = () => finish();
	      const onError = (error) => finish(error || new Error('Audio play failed'));
	      const timer = setTimeout(() => {
	        finish(new Error('Audio play timeout'));
	      }, 12000);

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
	      if (audio.offEnded) audio.offEnded();
	      if (audio.offError) audio.offError();
	      audio.onEnded(onEnded);
	      audio.onError(onError);
	      if (audio.src !== src) {
	        audio.src = src;
	      }
	      audio.play();
	    });
	  },

	  async playCurrentWord(event) {
	    const dataset = event && event.currentTarget ? event.currentTarget.dataset || {} : {};
	    const word = String(dataset.word || '').trim();
	    const index = Number(dataset.index);
	    if (!word) return;

	    this.setData({ speakingWordIndex: isNaN(index) ? -1 : index });
	    try {
	      const src = await this.getWordAudioSource(word);
	      await this.playAudioSource(src, word);
	    } catch (error) {
	      console.error('[photo-learn] play word failed', error);
	      wx.showToast({
	        title: '朗读失败',
	        icon: 'none'
	      });
	    } finally {
	      if (this.data.speakingWordIndex === index) {
	        this.setData({ speakingWordIndex: -1 });
	      }
	    }
	  }
	});
