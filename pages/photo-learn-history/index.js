import { addPhotoRecognitionWords, PHOTO_RECOGNITION_CATEGORY, saveProgressV2 } from '../../utils_nv/storage';

const HISTORY_KEY = 'photoLearnHistoryRecords';
const EDGE_TTS_LANGUAGE = 'ko-KR';
const EDGE_TTS_BATCH_SIZE = 12;

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

function normalizeRecords(records) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((item) => item && item.imagePath)
    .map((item) => {
      const createdAt = Number(item.createdAt) || Date.now();
      return {
        ...item,
        createdAt,
        timeText: item.timeText || formatHistoryTime(createdAt),
        title: item.title || '韩语词卡',
        desc: item.desc || '已生成韩语词卡',
        statusText: item.statusText || '已识别',
        words: normalizeRecordWords(item.words)
      };
    });
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
    showPracticeConfirm: false,
    pendingPracticeId: '',
    practiceConfirmCount: 0
  },

  onLoad() {
    const app = getApp();
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 0,
      navBarHeight: app.globalData.navBarHeight || 0
    });
    this.loadRecords();
  },

  onShow() {
    this.loadRecords();
  },

  onHide() {
    this.stopWordAudio(false);
  },

  onUnload() {
    this.stopWordAudio(true);
  },

  loadRecords() {
    this.setData({
      records: normalizeRecords(wx.getStorageSync(HISTORY_KEY))
    });
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
    }
    this.setData({ speakingWordId: '' });
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
      const audio = this.prepareWordAudioContext(word, src);
      const preparedEntry = this.preparedWordAudioContexts
        ? this.preparedWordAudioContexts[this.getWordAudioCacheKey(word)]
        : null;
      if (!audio) {
        reject(new Error('Missing audio context'));
        return;
      }

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
