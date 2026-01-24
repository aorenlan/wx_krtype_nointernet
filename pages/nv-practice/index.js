import { getWords, getCategories, getYonseiLessons, getTopikLevels, getTopikSessions } from '../../utils_nv/api';
import { decomposeKoreanStructure } from '../../utils/hangul';
import { saveMistake, removeMistake, getMistakes, getProgress, saveProgressV2 } from '../../utils_nv/storage';
import { KEYBOARD_LAYOUT } from '../../constants/index';

const AUDIO_ORIGIN = 'https://enoss.aorenlan.fun';
const AUDIO_BASE_PATH = '/kr_word';

const DEFAULT_SETTINGS = {
    practiceMode: 'study',
    flashDuration: 2000,
    repeatCount: 1,
    cardShowWord: true,
    cardShowMeaning: true,
    enableTimer: false,
    timerDuration: 10,
    enableKeyboardHint: true,
    autoCheckSpelling: true,
    autoPronounce: false,
    pronounceMeaning: false,
    category: 'Yonsei 1',
    keyboardVisualMode: 'korean',
    yonseiLessonId: '',
    yonseiLessonName: '',
    topikLevel: '1',
    topikSession: ''
};

const KEY_TO_KOR = (() => {
    const map = Object.create(null);
    for (const row of KEYBOARD_LAYOUT) {
        for (const k of row) {
            if (k && k.char) map[k.char] = k.korChar || k.char;
            if (k && k.shiftChar) map[k.shiftChar] = k.shiftKorChar || k.korChar || k.shiftChar;
        }
    }
    map.SPACE = ' ';
    return map;
})();

const INITIAL_KEY_TO_INDEX = {
    r: 0, R: 1, s: 2, e: 3, E: 4, f: 5, a: 6, q: 7, Q: 8, t: 9, T: 10, d: 11, w: 12, W: 13, c: 14, z: 15, x: 16, v: 17, g: 18
};

const VOWEL_SEQ_TO_INDEX = {
    k: 0, o: 1, i: 2, O: 3, j: 4, p: 5, u: 6, P: 7, h: 8, hk: 9, ho: 10, hl: 11, y: 12, n: 13, nj: 14, np: 15, nl: 16, b: 17, m: 18, ml: 19, l: 20
};

const FINAL_SEQ_TO_INDEX = {
    '': 0, r: 1, R: 2, rt: 3, s: 4, sw: 5, sg: 6, e: 7, f: 8, fr: 9, fa: 10, fq: 11, ft: 12, fx: 13, fv: 14, fg: 15, a: 16, q: 17, qt: 18, t: 19, T: 20, d: 21, w: 22, c: 23, z: 24, x: 25, v: 26, g: 27
};

const normalizeIndex = (rawIndex, length) => {
    const len = Number(length);
    if (!Number.isFinite(len) || len <= 0) return 0;
    const n = Number(rawIndex);
    const idx = Number.isFinite(n) ? Math.trunc(n) : 0;
    return ((idx % len) + len) % len;
};

const safeWordId = (w) => {
    if (!w) return '';
    if (w.id != null) return String(w.id);
    if (w.word != null) return String(w.word);
    return '';
};

const composeHangulFromKeyPrefix = (keys) => {
    if (!keys || keys.length === 0) return '';
    if (keys[0] === 'SPACE') return ' ';

    const first = keys[0];
    const initialIndex = INITIAL_KEY_TO_INDEX[first];
    if (initialIndex == null) {
        return KEY_TO_KOR[first] || '';
    }

    if (keys.length === 1) {
        return KEY_TO_KOR[first] || '';
    }

    let pos = 1;
    let vowelIndex = null;
    if (pos < keys.length) {
        const two = pos + 1 < keys.length ? `${keys[pos]}${keys[pos + 1]}` : '';
        if (two && VOWEL_SEQ_TO_INDEX[two] != null) {
            vowelIndex = VOWEL_SEQ_TO_INDEX[two];
            pos += 2;
        } else if (VOWEL_SEQ_TO_INDEX[keys[pos]] != null) {
            vowelIndex = VOWEL_SEQ_TO_INDEX[keys[pos]];
            pos += 1;
        }
    }

    if (vowelIndex == null) {
        return KEY_TO_KOR[first] || '';
    }

    let finalIndex = 0;
    if (pos < keys.length) {
        const two = pos + 1 < keys.length ? `${keys[pos]}${keys[pos + 1]}` : '';
        if (two && FINAL_SEQ_TO_INDEX[two] != null) {
            finalIndex = FINAL_SEQ_TO_INDEX[two];
        } else if (FINAL_SEQ_TO_INDEX[keys[pos]] != null) {
            finalIndex = FINAL_SEQ_TO_INDEX[keys[pos]];
        }
    }

    const code = 0xAC00 + (initialIndex * 21 + vowelIndex) * 28 + finalIndex;
    return String.fromCharCode(code);
};

const sanitizeSettings = (raw) => {
    const merged = Object.assign({}, DEFAULT_SETTINGS, raw || {});
    delete merged.darkMode;
    delete merged.showHint;
    if (merged.practiceMode !== 'study' && merged.practiceMode !== 'flash') {
        merged.practiceMode = DEFAULT_SETTINGS.practiceMode;
    }
    if (merged.keyboardVisualMode !== 'korean' && merged.keyboardVisualMode !== 'english' && merged.keyboardVisualMode !== 'korean_hide_english' && merged.keyboardVisualMode !== 'english_only') {
        merged.keyboardVisualMode = DEFAULT_SETTINGS.keyboardVisualMode;
    }
    if (merged.topikLevel != null) merged.topikLevel = String(merged.topikLevel);
    if (merged.topikSession != null) merged.topikSession = String(merged.topikSession);
    let repeatCount = Number(merged.repeatCount);
    if (!Number.isFinite(repeatCount)) repeatCount = DEFAULT_SETTINGS.repeatCount;
    repeatCount = Math.max(1, Math.min(10, Math.round(repeatCount)));
    merged.repeatCount = repeatCount;
    return merged;
};

Page({
    data: {
        words: [],
        currentIndex: 0,
        currentWord: null, 
        repeatCorrectCount: 0,
        categories: [],
        yonseiLessons: [],
        categoryPickerIndex: 0,
        yonseiLessonPickerIndex: 0,
        yonseiLessonOptions: [],
        yonseiLessonDisplay: '请选择',
        showYonseiSub: false,
        topikLevels: [],
        topikLevelPickerIndex: 0,
        topikSessions: [],
        showTopikSub: false,
        displayCategory: '',
        prevWordInfo: null,
        helpReveal: false,
        
        // Typing State (Korean)
        typingState: {
            targetText: '',
            requiredKeys: [], 
            currentKeyIndex: 0,
            userInput: '',
            isShiftActive: false,
            isComplete: false,
            targetStructure: [], 
            nextKey: null
        },
        displayChars: [], 
        legacyDisplayChars: [],
        measureChars: [],
        useLegacyWrapMode: false,

        settings: Object.assign({}, DEFAULT_SETTINGS),
        
        // UI States
        loading: true,
        isError: false,
        isCorrect: false,
        showAnswer: false,
        isWordVisible: true,
        timeLeft: 0,
        hasInteracted: false,
        isKeyboardOpen: false, 
        showSettingsModal: false,
        keyboardOffsetBottom: 280, 
        
        statusBarHeight: 20,
        navBarHeight: 44,
        showUpdatePopup: false,
        dailySentenceEntrySource: '',
        showGuideBubble: false,
        showSettingsTooltip: false,
        settingsTooltipText: '可调整显示模式'
    },

    async onLoad() {
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        
        const storedSettings = wx.getStorageSync('settings') || {};
        const mergedSettings = sanitizeSettings(storedSettings);

        // Check Update Popup
        const updateKey = 'hasShownUpdatePopup_v2_new';
        const hasShown = wx.getStorageSync(updateKey);
        if (!hasShown) {
            this.setData({ showUpdatePopup: true });
            wx.setStorageSync(updateKey, true);
        } else {
            const guideKey = 'kr_practice_guide_bubble_shown_v1';
            const guideShown = !!wx.getStorageSync(guideKey);
            if (!guideShown && !this.data.isKeyboardOpen) {
                this.showGuideBubbleWithTimeout();
            }
        }

        // Settings Tooltip Logic (Daily Rotating)
        const now = new Date();
        const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
        const lastShownDate = wx.getStorageSync('settings_tooltip_shown_date');

        if (lastShownDate !== today) {
            const TIPS = ['设置', '可选择词库', '可修改键盘', '朗读设置', '显示设置'];
            const lastIndex = wx.getStorageSync('settings_tooltip_index');
            // If lastIndex is null/undefined (first run), we want to start at 0.
            // But we increment BEFORE showing? Or increment AFTER showing?
            // "Rotate these every day" -> Day 1: Tip 0, Day 2: Tip 1...
            // So if no index exists, use -1 so next is 0.
            
            let currentIndex = Number(lastIndex);
            if (!Number.isFinite(currentIndex)) {
                currentIndex = -1;
            }
            
            const nextIndex = (currentIndex + 1) % TIPS.length;
            const nextTip = TIPS[nextIndex];

            this.setData({ 
                showSettingsTooltip: true,
                settingsTooltipText: nextTip
            });
            
            wx.setStorageSync('settings_tooltip_shown_date', today);
            wx.setStorageSync('settings_tooltip_index', nextIndex);
            
            if (this._settingsTooltipTimer) clearTimeout(this._settingsTooltipTimer);
            this._settingsTooltipTimer = setTimeout(() => {
                this.setData({ showSettingsTooltip: false });
            }, 2000);
        }

        this.loadDailySentenceEntry();

        this.wordAudio = null;
        this.cnAudio = null;
        this._audioPlaySeq = 0;
        this._hasUserGesture = false;
        this._autoPronouncedWordId = null;
        this._audioUrlMemo = new Map();
        this._audioFileLRU = new Map();
        this._audioFileLRUCapacity = 200;
        this._audioFileInFlight = new Map();
        this._preloadTask = null;
        this._preloadNextKey = null;
        this._hasPlayedAudioOnce = false;
        this._missingAudioPrompted = new Map();
        this._missingAudioToastAt = 0;

        this.setData({
            statusBarHeight: windowInfo.statusBarHeight || 20,
            navBarHeight: 44, 
            settings: mergedSettings,
            isKeyboardOpen: false,
            timeLeft: mergedSettings.timerDuration || DEFAULT_SETTINGS.timerDuration
        });

        try {
            if (wx.setInnerAudioOption) {
                wx.setInnerAudioOption({
                    obeyMuteSwitch: false,
                    mixWithOther: true
                });
            }
        } catch (e) {}
        
        await this.loadCategories();
        await this.loadSubcategories();
        this.updateDisplayCategory();
        this.loadWords();
    },

    async loadDailySentenceEntry() {
        try {
            const cached = wx.getStorageSync('kr_daily_sentence_entry_cache');
            const cachedAt = cached && cached.cachedAt != null ? Number(cached.cachedAt) : NaN;
            const cachedSource = cached && cached.source != null ? String(cached.source) : '';
            if (cachedSource && Number.isFinite(cachedAt) && Date.now() - cachedAt < 60 * 60 * 1000) {
                this.setData({ dailySentenceEntrySource: cachedSource });
                return;
            }
            if (!wx.cloud || !wx.cloud.callFunction) return;
            const res = await new Promise((resolve, reject) => {
                wx.cloud.callFunction({
                    name: 'getalldailysentence',
                    data: { page: 1, pageSize: 1, orderField: 'batchDate', orderDirection: 'desc', brief: true, noCache: true },
                    success: resolve,
                    fail: reject
                });
            });
            const result = res && res.result ? res.result : null;
            const item = result && Array.isArray(result.data) ? result.data[0] : null;
            const source = item && item.source != null ? String(item.source) : '';
            this.setData({ dailySentenceEntrySource: source });
            try {
                if (source) wx.setStorageSync('kr_daily_sentence_entry_cache', { cachedAt: Date.now(), source });
            } catch (e) {}
        } catch (e) {}
    },

    openDailySentence() {
        console.log('[nv-practice] openDailySentence clicked');
        try { this.cancelCurrentAudioPlayback(); } catch (e) {}
        try { this.cancelAudioPreload(); } catch (e) {}
        
        wx.setStorageSync('kr_daily_sentence_force_latest', true);
        
        wx.navigateTo({
            url: '/pages/daily-sentence/index',
            success: () => {
                console.log('[nv-practice] navigateTo success');
            },
            fail: (err) => {
                console.error('[nv-practice] navigateTo failed', err);
                wx.showToast({
                    title: '跳转失败',
                    icon: 'none'
                });
            }
        });
    },

    closeUpdatePopup() {
        this.setData({ showUpdatePopup: false });
        // Check Guide Bubble again after popup closed
        const guideKey = 'kr_practice_guide_bubble_shown_v1';
        const guideShown = !!wx.getStorageSync(guideKey);
        if (!guideShown && !this.data.isKeyboardOpen) {
            this.showGuideBubbleWithTimeout();
        }
    },

    showGuideBubbleWithTimeout() {
        const guideKey = 'kr_practice_guide_bubble_shown_v1';
        if (wx.getStorageSync(guideKey)) return;
        this.setData({ showGuideBubble: true });
        wx.setStorageSync(guideKey, true);
    },

    onGuideBubbleClick() {
        this.setData({ showGuideBubble: false });
        // Mark as shown only when user clicks/dismisses it
        wx.setStorageSync('kr_practice_guide_bubble_shown_v1', true);
    },

    preventScroll() {},

    createVideoAd() {
        if (this.videoAd) return;
        if (wx.createRewardedVideoAd) {
          this.videoAd = wx.createRewardedVideoAd({
            adUnitId: 'adunit-1d2566cb7cc546d7'
          });
          
          this.videoAd.onLoad(() => {
            console.log('激励视频 广告加载成功 (Practice)');
          });
          
          this.videoAd.onError((err) => {
            console.error('激励视频 广告加载失败', err);
          });
        }
    },

    handleAdClose(res) {
        // 用户点击了【关闭广告】按钮
        console.log('Ad closed (Practice), res:', res);
        if (res && res.isEnded) {
            // 正常播放结束，可以下发奖励
            console.log('Ad ended success, pendingAction:', !!this.pendingAction, 'contentId:', this.pendingContentId);
            if (this.pendingAction) {
                // 记录解锁时间
                if (this.pendingContentId) {
                    try {
                        const key = `unlock_${this.pendingContentId}`;
                        wx.setStorageSync(key, Date.now());
                        console.log('Unlock saved:', key);
                    } catch (e) {
                        console.error('Save unlock status failed', e);
                    }
                }
                this.pendingAction();
                this.pendingAction = null;
                this.pendingContentId = null;
            }
        } else {
            // 播放中途退出，不下发奖励
            console.log('中途关闭，不切换');
            wx.showToast({
                title: '需要看完广告才能切换',
                icon: 'none'
            });
            
            // 恢复Picker的显示（如果在Picker中取消）
            this.setData({
                categoryPickerIndex: this.data.categoryPickerIndex,
                yonseiLessonPickerIndex: this.data.yonseiLessonPickerIndex,
                topikLevelPickerIndex: this.data.topikLevelPickerIndex
            });
        }
    },

    checkAndShowAd: function(contentId, callback) {
      console.log('checkAndShowAd called with contentId:', contentId);
      // 如果没有传 contentId，尝试将第一个参数当作 callback (兼容旧代码)
      if (typeof contentId === 'function') {
        callback = contentId;
        contentId = null;
      }

      // 检查是否在有效期内（7天）
      if (contentId) {
        try {
          const key = `unlock_${contentId}`;
          const lastUnlock = wx.getStorageSync(key);
          if (lastUnlock) {
            const now = Date.now();
            const diff = now - Number(lastUnlock);
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (diff < sevenDays) {
              // 有效期内，直接通过
              callback && callback();
              return;
            }
          }
        } catch (e) {
          console.error('Check unlock status failed', e);
        }
      }

      // 如果没有广告实例，直接执行回调
      if (!this.videoAd) {
        callback && callback();
        return;
      }
  
      // 显示确认弹窗
      wx.showModal({
        title: '解锁章节',
        content: '解锁该章节需要观看一次广告，解锁后7天内可自由切换。',
        confirmText: '观看广告',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 用户点击确定，展示广告
            this.pendingAction = callback;
            this.pendingContentId = contentId; // 记录待解锁ID
            this.videoAd.show().catch(() => {
              // 失败重试
              this.videoAd.load()
                .then(() => this.videoAd.show())
                .catch(err => {
                  console.error('激励视频 广告显示失败', err);
                  // 广告显示失败，直接允许切换
                  if (this.pendingAction) {
                    this.pendingAction();
                    this.pendingAction = null;
                    this.pendingContentId = null;
                  }
                });
            });
          } else {
            // 用户点击取消，不进行切换
            console.log('用户取消切换');
            // 恢复Picker的显示
            this.setData({
              categoryPickerIndex: this.data.categoryPickerIndex,
              yonseiLessonPickerIndex: this.data.yonseiLessonPickerIndex,
              topikLevelPickerIndex: this.data.topikLevelPickerIndex
            });
          }
        }
      });
    },

    onHide() {
        if (this.videoAd && this._boundAdClose) {
            this.videoAd.offClose(this._boundAdClose);
        }
    },

    onUnload() {
        this.persistCurrentProgress();
        this.cancelAudioPreload();
        this.clearAudioFileLRU();
        this.clearAllTimers();
        if (this.videoAd && this._boundAdClose) {
            this.videoAd.offClose(this._boundAdClose);
        }
        try {
            if (this.wordAudio) this.wordAudio.destroy();
            if (this.cnAudio) this.cnAudio.destroy();
        } catch (e) {}
        this.wordAudio = null;
        this.cnAudio = null;
    },

    cancelAudioPreload() {
        try {
            if (this._preloadTask && typeof this._preloadTask.abort === 'function') {
                this._preloadTask.abort();
            }
        } catch (e) {}
        this._preloadTask = null;
        this._preloadNextKey = null;
    },

    clearAudioFileLRU() {
        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        try {
            const entries = this._audioFileLRU && this._audioFileLRU.values ? Array.from(this._audioFileLRU.values()) : [];
            entries.forEach((p) => {
                if (p && fs && fs.unlinkSync) {
                    try { fs.unlinkSync(p); } catch (e) {}
                }
            });
        } catch (e) {}
        this._audioFileLRU = new Map();
        this._audioFileInFlight = new Map();
    },

    hasLocalAudioFile(p) {
        const path = p ? String(p) : '';
        if (!path) return false;
        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        if (!fs) return true;
        try {
            if (typeof fs.accessSync === 'function') {
                fs.accessSync(path);
            } else if (typeof fs.statSync === 'function') {
                fs.statSync(path);
            }
            return true;
        } catch (e) {
            return false;
        }
    },

    getAudioFileFromLRU(cacheKey) {
        const key = cacheKey ? String(cacheKey) : '';
        if (!key || !this._audioFileLRU || !this._audioFileLRU.has) return '';
        const p = this._audioFileLRU.get(key);
        if (!p || !this.hasLocalAudioFile(p)) {
            try { this._audioFileLRU.delete(key); } catch (e) {}
            return '';
        }
        try {
            this._audioFileLRU.delete(key);
            this._audioFileLRU.set(key, p);
        } catch (e) {}
        return String(p);
    },

    setAudioFileToLRU(cacheKey, tempPath) {
        const key = cacheKey ? String(cacheKey) : '';
        const p = tempPath ? String(tempPath) : '';
        if (!key || !p) return;
        if (!this._audioFileLRU) this._audioFileLRU = new Map();
        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        const prev = this._audioFileLRU.get(key);
        if (prev && prev !== p && fs && fs.unlinkSync) {
            try { fs.unlinkSync(prev); } catch (e) {}
        }
        try {
            this._audioFileLRU.delete(key);
        } catch (e) {}
        this._audioFileLRU.set(key, p);
        const cap = Number(this._audioFileLRUCapacity || 200) || 200;
        while (this._audioFileLRU.size > cap) {
            const oldestKey = this._audioFileLRU.keys().next().value;
            const oldestPath = this._audioFileLRU.get(oldestKey);
            this._audioFileLRU.delete(oldestKey);
            if (oldestPath && fs && fs.unlinkSync) {
                try { fs.unlinkSync(oldestPath); } catch (e) {}
            }
        }
    },

    downloadAudioToLRU(cacheKey, urls) {
        const key = cacheKey ? String(cacheKey) : '';
        if (!key) return Promise.resolve('');
        const cached = this.getAudioFileFromLRU(key);
        if (cached) return Promise.resolve(cached);
        if (!this._audioFileInFlight) this._audioFileInFlight = new Map();
        if (this._audioFileInFlight.has(key)) return this._audioFileInFlight.get(key);

        const candidates = Array.isArray(urls) ? urls.filter(Boolean) : [];
        const task = new Promise((resolve) => {
            const tryNext = (idx) => {
                const url = candidates[idx];
                if (!url) return resolve('');
                try {
                    wx.downloadFile({
                        url,
                        success: (res) => {
                            const ok = !!(res && res.statusCode === 200 && res.tempFilePath);
                            if (!ok) {
                                return tryNext(idx + 1);
                            }
                            const p = String(res.tempFilePath);
                            if (this._audioUrlMemo && this._audioUrlMemo.set) {
                                this._audioUrlMemo.set(key, url);
                            }
                            this.setAudioFileToLRU(key, p);
                            resolve(p);
                        },
                        fail: () => tryNext(idx + 1)
                    });
                } catch (e) {
                    tryNext(idx + 1);
                }
            };
            tryNext(0);
        })
            .then((p) => {
                try { this._audioFileInFlight.delete(key); } catch (e) {}
                return p;
            })
            .catch(() => {
                try { this._audioFileInFlight.delete(key); } catch (e) {}
                return '';
            });

        this._audioFileInFlight.set(key, task);
        return task;
    },

    getProgressSubKey(settings) {
        const s = settings || DEFAULT_SETTINGS;
        const category = s.category || DEFAULT_SETTINGS.category;
        if (category === 'TOPIK Vocabulary') {
            const level = s.topikLevel != null ? String(s.topikLevel) : '';
            const session = s.topikSession != null ? String(s.topikSession) : '';
            return `topik_${level}__${session}`;
        }
        if (/^Yonsei\s+\d$/.test(category)) {
            const lessonId = s.yonseiLessonId != null ? String(s.yonseiLessonId) : '';
            return `yonsei_${lessonId}`;
        }
        return '';
    },

    persistCurrentProgress(indexOverride) {
        try {
            const s = this.data.settings || DEFAULT_SETTINGS;
            const category = s.category || DEFAULT_SETTINGS.category;
            const subKey = this.getProgressSubKey(s);
            const index = indexOverride != null ? Number(indexOverride) : Number(this.data.currentIndex || 0);
            saveProgressV2(category, subKey, index);
        } catch (e) {}
    },

    async loadCategories() {
        const categories = await getCategories();
        if (!categories.includes('Mistakes (错题本)')) {
            categories.push('Mistakes (错题本)');
        }
        const current = (this.data.settings && this.data.settings.category) || DEFAULT_SETTINGS.category;
        const idx = Math.max(0, categories.indexOf(current));
        this.setData({ categories, categoryPickerIndex: idx });
    },

    onShow: async function() {
        this.createVideoAd();
        if (this.videoAd) {
            if (!this._boundAdClose) {
                this._boundAdClose = this.handleAdClose.bind(this);
            }
            this.videoAd.offClose(this._boundAdClose);
            this.videoAd.onClose(this._boundAdClose);
        }

        if (typeof this.getTabBar === 'function' && this.getTabBar()) {
            this.getTabBar().setData({ selected: 0 });
        }
        const newSettings = wx.getStorageSync('settings') || {};
        const mergedSettings = sanitizeSettings(newSettings);
        const prevCategory = (this.data.settings && this.data.settings.category) || DEFAULT_SETTINGS.category;
        const nextCategory = mergedSettings.category || DEFAULT_SETTINGS.category;
        const categoryChanged = prevCategory !== nextCategory;
        const categoryIndex = Math.max(0, (this.data.categories || []).indexOf(nextCategory));

        this.setData({ settings: mergedSettings, categoryPickerIndex: categoryIndex });
        await this.loadSubcategories();
        this.updateDisplayCategory();

        if (categoryChanged) {
            this.loadWords();
        }
    },

    async loadSubcategories() {
        const category = (this.data.settings && this.data.settings.category) || DEFAULT_SETTINGS.category;

        if (category === 'TOPIK Vocabulary') {
            const topikLevels = await getTopikLevels();
            let topikLevel = (this.data.settings && this.data.settings.topikLevel) || '';
            topikLevel = String(topikLevel || topikLevels[0] || DEFAULT_SETTINGS.topikLevel || '1');
            if (topikLevels.length > 0 && !topikLevels.includes(topikLevel)) {
                topikLevel = String(topikLevels[0]);
            }

            const topikSessions = await getTopikSessions(topikLevel);
            let topikSession = (this.data.settings && this.data.settings.topikSession) || '';
            topikSession = String(topikSession || topikSessions[0] || '');
            if (topikSession && topikSessions.length > 0 && !topikSessions.includes(topikSession)) {
                topikSession = String(topikSessions[0] || '');
            }

            const nextSettings = Object.assign({}, this.data.settings || {});
            nextSettings.topikLevel = topikLevel;
            nextSettings.topikSession = topikSession;
            nextSettings.yonseiLessonId = '';
            nextSettings.yonseiLessonName = '';

            const topikIdx = Math.max(0, (topikLevels || []).findIndex(l => String(l) === String(topikLevel)));
            const next = sanitizeSettings(nextSettings);

            this.setData({
                topikLevels,
                topikLevelPickerIndex: topikIdx,
                topikSessions,
                showTopikSub: true,
                yonseiLessons: [],
                yonseiLessonOptions: [],
                yonseiLessonDisplay: '请选择',
                yonseiLessonPickerIndex: 0,
                showYonseiSub: false,
                settings: next
            });
            wx.setStorageSync('settings', next);
            return;
        }

        if (/^Yonsei\s+\d$/.test(category)) {
            const yonseiLessons = await getYonseiLessons(category);
            const currentLessonId = (this.data.settings && this.data.settings.yonseiLessonId) || '';
            let yonseiLessonId = currentLessonId;
            let yonseiLessonName = (this.data.settings && this.data.settings.yonseiLessonName) || '';

            if (!yonseiLessonId && yonseiLessons.length > 0) {
                yonseiLessonId = yonseiLessons[0].id;
                yonseiLessonName = yonseiLessons[0].name || yonseiLessons[0].original || '';
            } else if (yonseiLessonId) {
                const match = yonseiLessons.find(l => String(l.id) === String(yonseiLessonId));
                if (match) yonseiLessonName = match.name || match.original || '';
            }

            const newSettings = Object.assign({}, this.data.settings || {});
            newSettings.yonseiLessonId = yonseiLessonId;
            newSettings.yonseiLessonName = yonseiLessonName;
            const yonseiLessonOptions = (yonseiLessons || []).map((l) => {
                const name = (l.original || l.name || '').trim();
                return name ? `${l.id} · ${name}` : `${l.id}`;
            });
            const yonseiIdx = Math.max(0, (yonseiLessons || []).findIndex(l => String(l.id) === String(yonseiLessonId)));
            const display = yonseiLessonOptions[yonseiIdx] || '请选择';
            this.setData({
                yonseiLessons,
                yonseiLessonOptions,
                yonseiLessonDisplay: display,
                yonseiLessonPickerIndex: yonseiIdx,
                showYonseiSub: true,
                topikLevels: [],
                topikLevelPickerIndex: 0,
                topikSessions: [],
                showTopikSub: false,
                settings: sanitizeSettings(newSettings)
            });
            wx.setStorageSync('settings', sanitizeSettings(newSettings));
            return;
        }

        const newSettings = Object.assign({}, this.data.settings || {});
        newSettings.yonseiLessonId = '';
        newSettings.yonseiLessonName = '';
        this.setData({
            yonseiLessons: [],
            yonseiLessonOptions: [],
            yonseiLessonDisplay: '请选择',
            yonseiLessonPickerIndex: 0,
            showYonseiSub: false,
            topikLevels: [],
            topikLevelPickerIndex: 0,
            topikSessions: [],
            showTopikSub: false,
            settings: sanitizeSettings(newSettings)
        });
        wx.setStorageSync('settings', sanitizeSettings(newSettings));
    },

    updateDisplayCategory() {
        const s = this.data.settings || DEFAULT_SETTINGS;
        let text = s.category || DEFAULT_SETTINGS.category;
        if (text === 'TOPIK Vocabulary' && s.topikLevel) {
            text = `${text} · TOPIK ${s.topikLevel}`;
            if (s.topikSession) text = `${text} · ${s.topikSession}`;
        }
        if (/^Yonsei\s+\d$/.test(text) && s.yonseiLessonId) {
            const lessonTitle = s.yonseiLessonName ? ` · ${s.yonseiLessonName}` : '';
            text = `${text} · ${s.yonseiLessonId}${lessonTitle}`;
        }
        this.setData({ displayCategory: text });
    },

    async loadWords() {
        this.clearAllTimers();
        this.cancelAudioPreload();
        this.setData({ loading: true, prevWordInfo: null });
        const s = this.data.settings || DEFAULT_SETTINGS;
        const category = s.category || 'TOPIK Vocabulary';
        const subKey = this.getProgressSubKey(s);
        
        if (category === 'Mistakes (错题本)') {
            const mistakes = getMistakes();
            const savedIndex = Number(getProgress(category, subKey) || 0);
            const startIndex = normalizeIndex(savedIndex, mistakes.length);
            return this.setData(
                {
                    words: mistakes,
                    loading: false,
                    currentIndex: startIndex,
                    currentWord: null
                },
                () => {
                    if (mistakes.length > 0) {
                        this.startWord(startIndex);
                    } else {
                        this.setData({ words: [], loading: false, currentWord: null, prevWordInfo: null });
                        wx.showToast({ title: '暂无错题', icon: 'none' });
                    }
                }
            );
        }

        const filters = {};
        if (category === 'TOPIK Vocabulary' && s.topikLevel) filters.topikLevel = s.topikLevel;
        if (category === 'TOPIK Vocabulary' && s.topikSession) filters.topikSession = s.topikSession;
        if (/^Yonsei\s+\d$/.test(category) && s.yonseiLessonId) filters.lessonId = s.yonseiLessonId;
        if (s.wordLengthFilter) filters.minLength = s.wordLengthFilter;
        if (s.wordStartFilter) filters.firstLetter = s.wordStartFilter;
        const res = await getWords(category, 2000, 0, filters); 
        if (res && res.words) {
            const savedIndex = Number(getProgress(category, subKey) || 0);
            const startIndex = normalizeIndex(savedIndex, res.words.length);
            this.setData(
                {
                    words: res.words,
                    loading: false,
                    currentIndex: startIndex,
                    currentWord: null
                },
                () => {
                    if (res.words.length > 0) {
                        this.startWord(startIndex);
                    }
                }
            );
        } else {
            this.setData({ words: [], loading: false, currentWord: null, prevWordInfo: null });
        }
    },

    openSettings() {
        this.setData({ showSettingsModal: true, showSettingsTooltip: false });
        if (this._settingsTooltipTimer) {
            clearTimeout(this._settingsTooltipTimer);
            this._settingsTooltipTimer = null;
        }
    },

    closeSettings() {
        this.setData({ showSettingsModal: false });
    },

    preventBubble() {},

    applyCategorySelection(category, categoryIndex) {
        if (!category) return;
        const nextSettings = Object.assign({}, this.data.settings || {});
        nextSettings.category = category;
        nextSettings.yonseiLessonId = '';
        nextSettings.yonseiLessonName = '';
        this.setData({
            settings: sanitizeSettings(nextSettings),
            categoryPickerIndex: typeof categoryIndex === 'number' ? categoryIndex : this.data.categoryPickerIndex,
            prevWordInfo: null,
            currentWord: null
        });
        wx.setStorageSync('settings', sanitizeSettings(nextSettings));
        this.loadSubcategories().then(() => {
            this.updateDisplayCategory();
            this.loadWords();
        });
    },

    onCategoryPickerChange(e) {
        const index = Number(e.detail && e.detail.value);
        const category = (this.data.categories || [])[index];
        this.applyCategorySelection(category, index);
    },

    selectCategory(e) {
        const category = e.currentTarget.dataset.category;
        const idx = Math.max(0, (this.data.categories || []).indexOf(category));
        this.applyCategorySelection(category, idx);
    },

    selectYonseiLesson(e) {
        const lessonId = e.currentTarget.dataset.lessonId;
        const lessonName = e.currentTarget.dataset.lessonName || '';

        const action = () => {
            const nextSettings = Object.assign({}, this.data.settings || {});
            nextSettings.yonseiLessonId = String(lessonId);
            nextSettings.yonseiLessonName = String(lessonName);
            const idx = Math.max(0, (this.data.yonseiLessons || []).findIndex(l => String(l.id) === String(lessonId)));
            const display = (this.data.yonseiLessonOptions || [])[idx] || '请选择';
            this.setData({ settings: sanitizeSettings(nextSettings), yonseiLessonPickerIndex: idx, yonseiLessonDisplay: display });
            wx.setStorageSync('settings', sanitizeSettings(nextSettings));
            this.updateDisplayCategory();
            this.loadWords();
        };

        const category = this.data.settings.category || 'Yonsei';
        const contentId = `yonsei_${category.replace(/\s+/g, '_')}_${lessonId}`;
        this.checkAndShowAd(contentId, action);
    },

    onYonseiLessonPickerChange(e) {
        const index = Number(e.detail && e.detail.value);
        const lesson = (this.data.yonseiLessons || [])[index];
        if (!lesson) return;

        const action = () => {
            const lessonId = String(lesson.id);
            const lessonName = String(lesson.original || lesson.name || '');
            const nextSettings = Object.assign({}, this.data.settings || {});
            nextSettings.yonseiLessonId = lessonId;
            nextSettings.yonseiLessonName = lessonName;
            const display = (this.data.yonseiLessonOptions || [])[index] || '请选择';
            this.setData({ settings: sanitizeSettings(nextSettings), yonseiLessonPickerIndex: index, yonseiLessonDisplay: display });
            wx.setStorageSync('settings', sanitizeSettings(nextSettings));
            this.updateDisplayCategory();
            this.loadWords();
        };

        const category = this.data.settings.category || 'Yonsei';
        const contentId = `yonsei_${category.replace(/\s+/g, '_')}_${lesson.id}`;
        this.checkAndShowAd(contentId, action);
    },

    async onTopikLevelPickerChange(e) {
        const index = Number(e.detail && e.detail.value);
        const level = (this.data.topikLevels || [])[index];
        if (!level) return;

        const topikLevel = String(level);
        const topikSessions = await getTopikSessions(topikLevel);
        const currentSession = (this.data.settings && this.data.settings.topikSession) || '';
        const topikSession = currentSession && topikSessions.includes(String(currentSession)) ? String(currentSession) : String(topikSessions[0] || '');

        const nextSettings = Object.assign({}, this.data.settings || {});
        nextSettings.topikLevel = topikLevel;
        nextSettings.topikSession = topikSession;
        const next = sanitizeSettings(nextSettings);

        this.setData({
            settings: next,
            topikLevelPickerIndex: index,
            topikSessions
        });
        wx.setStorageSync('settings', next);
        this.updateDisplayCategory();
        this.loadWords();
    },

    selectTopikSession(e) {
        const session = e.currentTarget.dataset.session;
        
        const action = () => {
            const topikSession = String(session || '');
            const nextSettings = Object.assign({}, this.data.settings || {});
            nextSettings.topikSession = topikSession;
            const next = sanitizeSettings(nextSettings);
            this.setData({ settings: next });
            wx.setStorageSync('settings', next);
            this.updateDisplayCategory();
            this.loadWords();
        };
        
        // TOPIK 切换 Session 也视为收费操作
        const level = this.data.settings.topikLevel || '1';
        const contentId = `topik_${level}_${session}`;
        this.checkAndShowAd(contentId, action);
    },

    clearAllTimers() {
        if (this.flashTimer) clearTimeout(this.flashTimer);
        if (this.quizTimer) clearInterval(this.quizTimer);
        this.flashTimer = null;
        this.quizTimer = null;
        if (this.helpRevealTimer) clearTimeout(this.helpRevealTimer);
        this.helpRevealTimer = null;
        if (this.completeTimer) clearTimeout(this.completeTimer);
        this.completeTimer = null;
        if (this._guideBubbleTimer) clearTimeout(this._guideBubbleTimer);
        this._guideBubbleTimer = null;
        if (this._settingsTooltipTimer) clearTimeout(this._settingsTooltipTimer);
        this._settingsTooltipTimer = null;
        if (this._preloadTimer) clearTimeout(this._preloadTimer);
        this._preloadTimer = null;
    },

    startModeLogic() {
        const { practiceMode, flashDuration } = this.data.settings || DEFAULT_SETTINGS;

        this.setData({ isWordVisible: true }, () => {
            this.updateDisplay(this.data.typingState);
        });

        if (practiceMode === 'flash') {
            this.flashTimer = setTimeout(() => {
                this.setData({ isWordVisible: false }, () => {
                    this.updateDisplay(this.data.typingState);
                });
            }, Number(flashDuration) || DEFAULT_SETTINGS.flashDuration);
        }
    },

    startQuizTimer() {
        const { enableTimer, timerDuration } = this.data.settings || DEFAULT_SETTINGS;
        if (!enableTimer) return;

        if (this.quizTimer) clearInterval(this.quizTimer);
        this.setData({ timeLeft: Number(timerDuration) || DEFAULT_SETTINGS.timerDuration });

        this.quizTimer = setInterval(() => {
            if (this.data.timeLeft <= 1) {
                this.setData({ timeLeft: 0, isWordVisible: true }, () => {
                    this.updateDisplay(this.data.typingState);
                });
                if (this.quizTimer) clearInterval(this.quizTimer);
                this.quizTimer = null;
                setTimeout(() => {
                    if (!this.data.currentWord) return;
                    this.nextWord();
                }, 600);
            } else {
                this.setData({ timeLeft: this.data.timeLeft - 1 });
            }
        }, 1000);
    },

    updateSetting(e) {
        const { key, value } = e.currentTarget.dataset;
        let val = value;
        if (e.type === 'change' && e.detail && e.detail.value !== undefined) {
            val = e.detail.value;
        }
        const newSettings = Object.assign({}, this.data.settings || {});
        newSettings[key] = val;
        const next = sanitizeSettings(newSettings);
        this.setData({ settings: next });
        wx.setStorageSync('settings', next);

        if (key === 'practiceMode' || key === 'flashDuration') {
            this.clearAllTimers();
            this.startModeLogic();
            if (this.data.hasInteracted) this.startQuizTimer();
        }

        if (key === 'cardShowWord') {
            this.updateDisplay(this.data.typingState);
            this.updateWordWrapMode(true);
        }

        if (key === 'cardShowMeaning') {
            this.updateMeaningSize();
        }

        if (key === 'timerDuration') {
            this.setData({ timeLeft: Number(val) || DEFAULT_SETTINGS.timerDuration });
            if (this.data.hasInteracted) this.startQuizTimer();
        }
    },

    toggleSetting(e) {
        const key = e.currentTarget.dataset.key;
        const newSettings = Object.assign({}, this.data.settings || {});
        newSettings[key] = !newSettings[key];
        const next = sanitizeSettings(newSettings);
        this.setData({ settings: next });
        wx.setStorageSync('settings', next);

        if (key === 'cardShowWord') {
            this.updateDisplay(this.data.typingState);
            this.updateWordWrapMode(true);
        }

        if (key === 'cardShowMeaning') {
            this.updateMeaningSize();
        }

        if (key === 'enableTimer') {
            if (next.enableTimer && this.data.hasInteracted) {
                this.startQuizTimer();
            } else {
                if (this.quizTimer) clearInterval(this.quizTimer);
                this.quizTimer = null;
            }
        }
    },

    buildTypingState(word) {
        const structure = decomposeKoreanStructure(word);
        let allKeys = [];
        structure.forEach(s => {
            allKeys = allKeys.concat(s.keys);
        });

        return {
            targetText: word,
            requiredKeys: allKeys,
            currentKeyIndex: 0,
            userInput: '',
            isShiftActive: false,
            isComplete: false,
            targetStructure: structure,
            nextKey: allKeys.length > 0 ? allKeys[0] : null
        };
    },

    startWord(index) {
        this.cancelCurrentAudioPlayback();
        const words = this.data.words || [];
        const safeIndex = normalizeIndex(index, words.length);
        if (!Array.isArray(words) || words.length === 0) return;

        const wordObj = words[safeIndex];
        const word = wordObj.word;
        this._autoPronouncedWordId = null;

        const initialState = this.buildTypingState(word);
        this.persistCurrentProgress(safeIndex);

        this.setData({
            currentIndex: safeIndex,
            currentWord: wordObj,
            typingState: initialState,
            isCorrect: false,
            showAnswer: false,
            isError: false,
            hasInteracted: false,
            isWordVisible: true,
            helpReveal: false,
            repeatCorrectCount: 0,
            timeLeft: (this.data.settings && this.data.settings.timerDuration) || DEFAULT_SETTINGS.timerDuration,
            meaningIsSmall: false
        }, () => {
            this.updateMeaningSize();
            this.updateWordWrapMode(true);
        });

        this.clearAllTimers();
        this.startModeLogic();

        this.updateDisplay(initialState);
        this.updateShiftState(initialState);

        this.tryAutoPronounce();
        if (this._preloadTimer) clearTimeout(this._preloadTimer);
        this._preloadTimer = setTimeout(() => this.preloadNextWordAudio(), 60);
        setTimeout(() => this.drawShareImage(), 500);
    },

    updateMeaningSize() {
        const settings = this.data.settings || DEFAULT_SETTINGS;
        if (!settings.cardShowMeaning) {
            if (this.data.meaningIsSmall) this.setData({ meaningIsSmall: false });
            return;
        }

        wx.nextTick(() => {
            const query = this.createSelectorQuery();
            query.select('.meaning').boundingClientRect();
            query.exec((res) => {
                const rect = res && res[0];
                if (!rect) return;
                const isMultiLine = rect.height >= 60;
                if (isMultiLine !== !!this.data.meaningIsSmall) {
                    this.setData({ meaningIsSmall: isMultiLine });
                }
            });
        });
    },

    updateShiftState(state) {
        const { nextKey } = state;
        if (!nextKey) {
            this.setData({ 'typingState.isShiftActive': false });
            return;
        }
        // Check if shift is needed (uppercase)
        const shiftRequired = /^[A-Z~!@#$%^&*()_+{}:"<>?]$/.test(nextKey) && nextKey !== 'SPACE';
        this.setData({ 'typingState.isShiftActive': shiftRequired });
    },

    updateDisplay(state) {
        const { targetStructure, currentKeyIndex } = state;
        let keyCounter = 0;
        const showInput = (!this.data.isWordVisible || !this.data.settings.cardShowWord) && !this.data.helpReveal;
        
        const displayChars = targetStructure.map((struct) => {
            const start = keyCounter;
            const end = keyCounter + struct.keys.length;
            keyCounter = end;

            if (currentKeyIndex >= end) {
                return { char: struct.char, status: 'done', composed: struct.char, progress: 100 };
            } else if (currentKeyIndex >= start) {
                const typedCount = Math.max(0, currentKeyIndex - start);
                const totalCount = Math.max(1, struct.keys.length);
                const progress = Math.floor((typedCount / totalCount) * 100);
                if (showInput) {
                    const composed = typedCount > 0 ? composeHangulFromKeyPrefix(struct.keys.slice(0, typedCount)) : '';
                    return { char: composed, status: 'active', composed: '', progress };
                }
                return { char: struct.char, status: 'active', composed: struct.char, progress };
            } else {
                if (showInput) {
                    return { char: '', status: 'future', composed: '', progress: 0 };
                }
                return { char: struct.char, status: 'future', composed: '', progress: 0 };
            }
        });

        const legacyDisplayChars = this.buildLegacyDisplayChars(displayChars);
        const measureChars = targetStructure.map(s => s.char);
        this.setData({ displayChars, legacyDisplayChars, measureChars });
    },

    buildLegacyDisplayChars(displayChars) {
        const list = Array.isArray(displayChars) ? displayChars : [];
        const len = list.length;
        if (len === 0) return [];

        let centerIndex = list.findIndex(it => it && it.status === 'active');
        if (centerIndex < 0) centerIndex = Math.max(0, len - 1);

        const radius = 3;
        let start = Math.max(0, centerIndex - radius);
        let end = Math.min(len, centerIndex + radius + 1);

        while (end - start < radius * 2 + 1 && (start > 0 || end < len)) {
            if (start > 0) start -= 1;
            else if (end < len) end += 1;
            else break;
        }

        const out = [];
        for (let i = start; i < end; i += 1) {
            const it = list[i] || {};
            out.push(Object.assign({}, it, { isCenter: i === centerIndex }));
        }
        return out;
    },

    updateWordWrapMode(force) {
        const settings = this.data.settings || DEFAULT_SETTINGS;
        if (!settings.cardShowWord) {
            if (this.data.useLegacyWrapMode) this.setData({ useLegacyWrapMode: false });
            this._wrapMeasureText = '';
            return;
        }

        const current = this.data.currentWord;
        const targetText = current && current.word ? String(current.word) : '';
        if (!targetText) {
            if (this.data.useLegacyWrapMode) this.setData({ useLegacyWrapMode: false });
            this._wrapMeasureText = '';
            return;
        }

        if (!force && this._wrapMeasureText === targetText) return;
        this._wrapMeasureText = targetText;

        wx.nextTick(() => {
            const query = this.createSelectorQuery();
            query.select('#nvLineMeasure').boundingClientRect();
            query.exec((res) => {
                const rect = res && res[0];
                if (!rect) return;
                const isMultiLine = rect.height >= 60;
                if (isMultiLine !== !!this.data.useLegacyWrapMode) {
                    this.setData({ useLegacyWrapMode: isMultiLine });
                }
            });
        });
    },

    onHelpReveal() {
        if (this.helpRevealTimer) clearTimeout(this.helpRevealTimer);
        this.helpRevealTimer = null;
        this.setData({ helpReveal: true }, () => {
            this.updateDisplay(this.data.typingState);
        });
        this.helpRevealTimer = setTimeout(() => {
            this.setData({ helpReveal: false }, () => {
                this.updateDisplay(this.data.typingState);
            });
        }, 1500);
    },

    onKeyPress(e) {
        const key = e.detail.key;
        this.handleKeyPress(key);
    },

    handleKeyPress(key) {
        if (!this._hasUserGesture) this._hasUserGesture = true;
        const { typingState } = this.data;
        if (typingState.isComplete) return;

        if (!this.data.hasInteracted) {
            this.setData({ hasInteracted: true }, () => {
                this.startQuizTimer();
            });
            this.tryAutoPronounce();
        }

        const expectedKey = typingState.requiredKeys[typingState.currentKeyIndex];
        
        if (key === expectedKey) {
            // Correct
            const nextIndex = typingState.currentKeyIndex + 1;
            const isComplete = nextIndex >= typingState.requiredKeys.length;
            
            const newState = Object.assign({}, typingState);
            newState.currentKeyIndex = nextIndex;
            newState.userInput = typingState.userInput + key;
            newState.isComplete = isComplete;
            newState.nextKey = isComplete ? null : typingState.requiredKeys[nextIndex];

            this.setData({ typingState: newState, isError: false });
            this.updateDisplay(newState);
            this.updateShiftState(newState);

            if (isComplete) {
                this.handleComplete();
            }
        } else {
            if (!this.data.settings.autoCheckSpelling) return;

            this.setData({ isError: true });
            setTimeout(() => this.setData({ isError: false }), 500);
            try {
                wx.vibrateShort({ type: 'medium' });
            } catch (e) {}
        }
    },

    handleComplete() {
        const repeatCount = Number((this.data.settings && this.data.settings.repeatCount) || DEFAULT_SETTINGS.repeatCount || 1);
        const currentRepeat = Number(this.data.repeatCorrectCount || 0);
        const nextRepeat = Math.min(Math.max(1, repeatCount), currentRepeat + 1);

        this.setData({ isCorrect: true, repeatCorrectCount: nextRepeat });

        this.completeTimer = setTimeout(() => {
            this.clearAllTimers();
            if (nextRepeat >= repeatCount) {
                this.nextWord();
                return;
            }

            const current = this.data.currentWord;
            if (!current || !current.word) return;
            const initialState = this.buildTypingState(current.word);

            this.setData({
                typingState: initialState,
                isCorrect: false,
                showAnswer: false,
                isError: false,
                hasInteracted: false,
                isWordVisible: true,
                helpReveal: false,
                timeLeft: (this.data.settings && this.data.settings.timerDuration) || DEFAULT_SETTINGS.timerDuration
            });

            this.startModeLogic();
            this.updateDisplay(initialState);
            this.updateShiftState(initialState);
        }, 800);
    },

    addToMistakes() {
        const current = this.data.currentWord;
        if (!current) return;
        const res = saveMistake(current);
        if (res.success) {
            wx.showToast({ title: '已加入错题本', icon: 'success' });
        } else {
            wx.showToast({ title: '加入失败', icon: 'none' });
        }
    },

    removeCurrentFromMistakes() {
        const current = this.data.currentWord;
        if (!current) return;
        const id = safeWordId(current);
        if (!id) return;

        const res = removeMistake(id);
        if (!res.success) {
            wx.showToast({ title: '移除失败', icon: 'none' });
            return;
        }

        const isMistakesMode = !!(this.data.settings && this.data.settings.category === 'Mistakes (错题本)');
        if (!isMistakesMode) {
            wx.showToast({ title: '已移出错题本', icon: 'success' });
            return;
        }

        const prevWords = Array.isArray(this.data.words) ? this.data.words : [];
        const remaining = prevWords.filter(w => safeWordId(w) !== id);

        if (remaining.length === 0) {
            this.setData({
                words: [],
                currentWord: null,
                currentIndex: 0,
                prevWordInfo: null
            });
            wx.showToast({ title: '已移除，暂无错题', icon: 'none' });
            return;
        }

        const nextIndex = normalizeIndex(this.data.currentIndex, remaining.length);
        this.setData({ words: remaining }, () => {
            this.startWord(nextIndex);
            wx.showToast({ title: '已移出错题本', icon: 'success' });
        });
    },

    nextWord() {
        if (!this._hasUserGesture) this._hasUserGesture = true;
        // Save previous word info
        const current = this.data.currentWord;
        if (current) {
            this.setData({
                prevWordInfo: {
                    word: current.word,
                    meaning: current.meaning,
                    isCorrect: this.data.isCorrect
                }
            });
        }
        const len = Array.isArray(this.data.words) ? this.data.words.length : 0;
        const nextIndex = normalizeIndex(Number(this.data.currentIndex || 0) + 1, len);
        this.startWord(nextIndex);
    },

    prevWord() {
        if (!this._hasUserGesture) this._hasUserGesture = true;
        const len = Array.isArray(this.data.words) ? this.data.words.length : 0;
        const prevIndex = normalizeIndex(Number(this.data.currentIndex || 0) - 1, len);
        this.startWord(prevIndex);
    },

    ensureAudioContexts() {
        if (!this.wordAudio) this.wordAudio = wx.createInnerAudioContext();
        if (!this.cnAudio) this.cnAudio = wx.createInnerAudioContext();
    },

    bumpAudioPlaySeq() {
        const next = Number(this._audioPlaySeq || 0) + 1;
        this._audioPlaySeq = next;
        return next;
    },

    stopAudioContext(audioCtx) {
        if (!audioCtx) return;
        try {
            if (audioCtx.__nvPendingSettle) {
                audioCtx.__nvPendingSettle(false);
            }
        } catch (e) {}
        try { audioCtx.stop && audioCtx.stop(); } catch (e) {}
        try { audioCtx.offEnded && audioCtx.offEnded(); } catch (e) {}
        try { audioCtx.offError && audioCtx.offError(); } catch (e) {}
        try { audioCtx.offCanplay && audioCtx.offCanplay(); } catch (e) {}
        try { audioCtx.offStop && audioCtx.offStop(); } catch (e) {}
    },

    cancelCurrentAudioPlayback() {
        const seq = this.bumpAudioPlaySeq();
        this.stopAudioContext(this.wordAudio);
        this.stopAudioContext(this.cnAudio);
        return seq;
    },

    notifyMissingAudioOnce(wordId, isChinese) {
        const id = wordId != null ? String(wordId) : '';
        if (!id) return;
        const type = isChinese ? 'cn' : 'ko';
        const key = `${id}__${type}`;
        if (!this._missingAudioPrompted) this._missingAudioPrompted = new Map();

        const now = Date.now();
        const last = Number(this._missingAudioPrompted.get(key) || 0);
        if (now - last < 60000) return;
        this._missingAudioPrompted.set(key, now);

        const globalLast = Number(this._missingAudioToastAt || 0);
        if (now - globalLast < 1200) return;
        this._missingAudioToastAt = now;

        wx.showToast({ title: isChinese ? '释义音频缺失' : '韩语音频缺失', icon: 'none', duration: 1500 });
    },

    getAudioFolder() {
        const category = (this.data.settings && this.data.settings.category) || '';
        if (/^Yonsei\s+\d$/.test(category)) return 'yansei';
        if (category === 'TOPIK Vocabulary') return 'topic';
        return 'yansei';
    },

    getAudioCacheKey(rawWord, isChinese) {
        const w0 = String(rawWord || '').trim().replace(/\s+/g, '_');
        const folder = this.getAudioFolder();
        const suffix = isChinese ? '_cn' : '';
        return `${folder}__${w0}__${suffix}`;
    },

    buildAudioUrls(rawWord, isChinese) {
        const w0 = String(rawWord || '').trim().replace(/\s+/g, '_');
        const sanitizeName = (s) => {
            let t = String(s || '');
            t = t
                .replace(/[\/／\\]/g, '')
                .replace(/[()\[\]{}"'’“”]/g, '')
                .replace(/_+/g, '_');
            while (true) {
                const next = t
                    .replace(/_+$/g, '')
                    .replace(/[\s_]*[)"'’”\]\}]+$/g, '')
                    .replace(/[\s_]*[?？!！。．\.，,、…:;：；]+$/g, '');
                if (next === t) break;
                t = next;
            }
            t = t.replace(/^_+|_+$/g, '');
            while (true) {
                const next = t
                    .replace(/[\s_]*[)"'’”\]\}]+$/g, '')
                    .replace(/[\s_]*[?？!！。．\.，,、…:;：；]+$/g, '')
                    .replace(/^_+|_+$/g, '');
                if (next === t) break;
                t = next;
            }
            return t;
        };

        const percentEncodeUtf8 = (input) => {
            const str = String(input || '');
            let out = '';
            for (let i = 0; i < str.length; i++) {
                let codePoint = str.codePointAt(i);
                if (codePoint == null) continue;
                if (codePoint > 0xffff) i++;

                const appendByte = (b) => {
                    if (
                        (b >= 0x41 && b <= 0x5a) ||
                        (b >= 0x61 && b <= 0x7a) ||
                        (b >= 0x30 && b <= 0x39) ||
                        b === 0x2d ||
                        b === 0x2e ||
                        b === 0x5f ||
                        b === 0x7e
                    ) {
                        out += String.fromCharCode(b);
                    } else {
                        out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
                    }
                };

                if (codePoint <= 0x7f) {
                    appendByte(codePoint);
                } else if (codePoint <= 0x7ff) {
                    appendByte(0xc0 | (codePoint >> 6));
                    appendByte(0x80 | (codePoint & 0x3f));
                } else if (codePoint <= 0xffff) {
                    appendByte(0xe0 | (codePoint >> 12));
                    appendByte(0x80 | ((codePoint >> 6) & 0x3f));
                    appendByte(0x80 | (codePoint & 0x3f));
                } else {
                    appendByte(0xf0 | (codePoint >> 18));
                    appendByte(0x80 | ((codePoint >> 12) & 0x3f));
                    appendByte(0x80 | ((codePoint >> 6) & 0x3f));
                    appendByte(0x80 | (codePoint & 0x3f));
                }
            }
            return out;
        };

        const toHangulNFD = (s) => {
            const str = String(s || '');
            let out = '';
            for (let i = 0; i < str.length; i++) {
                const code = str.charCodeAt(i);
                if (code >= 0xAC00 && code <= 0xD7A3) {
                    const sIndex = code - 0xAC00;
                    const lIndex = Math.floor(sIndex / 588);
                    const vIndex = Math.floor((sIndex % 588) / 28);
                    const tIndex = sIndex % 28;
                    out += String.fromCharCode(0x1100 + lIndex);
                    out += String.fromCharCode(0x1161 + vIndex);
                    if (tIndex) out += String.fromCharCode(0x11A7 + tIndex);
                } else {
                    out += str[i];
                }
            }
            return out;
        };

        const w1 = sanitizeName(w0);
        const bases = w1 && w1 !== w0 ? [w1, w0] : [w0];

        const variants = [];
        bases.forEach((b) => {
            const base = String(b || '');
            if (!base) return;
            let nfd = '';
            let nfc = '';
            if (typeof base.normalize === 'function') {
                try { nfd = base.normalize('NFD'); } catch (e) {}
                try { nfc = base.normalize('NFC'); } catch (e) {}
            }
            const hangulNfd = toHangulNFD(base);
            if (nfd) variants.push(nfd);
            if (hangulNfd) variants.push(hangulNfd);
            if (nfc) variants.push(nfc);
            variants.push(base);
        });
        const uniqueVariants = Array.from(new Set(variants.filter(Boolean)));
        const folder = this.getAudioFolder();
        const folders = folder === 'yansei' ? ['yansei', 'yonsei'] : folder === 'yonsei' ? ['yonsei', 'yansei'] : [folder];
        const suffix = isChinese ? '_cn' : '';
        const urls = [];
        uniqueVariants.forEach((v) => {
            const name = `${v}${suffix}.mp3`;
            [name].forEach((n) => {
                const hasNonAscii = /[^\u0000-\u007f]/.test(n);
                folders.forEach((fd) => {
                    const rawPath = `${AUDIO_BASE_PATH}/${fd}/${n}`;
                    const encodedPath = `${AUDIO_BASE_PATH}/${fd}/${percentEncodeUtf8(n)}`;
                    urls.push(`${AUDIO_ORIGIN}${encodedPath}`);
                    if (!hasNonAscii) urls.push(`${AUDIO_ORIGIN}${rawPath}`);
                });
            });
        });
        return Array.from(new Set(urls));
    },

    playSrcOnce(audioCtx, src, cacheKey, cacheUrl) {
        return new Promise((resolve) => {
            if (!audioCtx || !src) return resolve(false);

            let settled = false;
            let started = false;
            let retryTimer = null;
            let failTimer = null;
            const cleanup = () => {
                try { audioCtx.offEnded && audioCtx.offEnded(); } catch (e) {}
                try { audioCtx.offError && audioCtx.offError(); } catch (e) {}
                try { audioCtx.offCanplay && audioCtx.offCanplay(); } catch (e) {}
                try { audioCtx.offStop && audioCtx.offStop(); } catch (e) {}
                try { audioCtx.offPlay && audioCtx.offPlay(); } catch (e) {}
                try { if (retryTimer) clearTimeout(retryTimer); } catch (e) {}
                try { if (failTimer) clearTimeout(failTimer); } catch (e) {}
                retryTimer = null;
                failTimer = null;
            };

            const settle = (ok) => {
                if (settled) return;
                settled = true;
                cleanup();
                try {
                    if (audioCtx.__nvPendingSettle === settle) {
                        audioCtx.__nvPendingSettle = null;
                    }
                } catch (e) {}
                resolve(!!ok);
            };

            try {
                if (audioCtx.__nvPendingSettle) {
                    audioCtx.__nvPendingSettle(false);
                }
            } catch (e) {}
            try { audioCtx.stop(); } catch (e) {}
            cleanup();
            try { audioCtx.__nvPendingSettle = settle; } catch (e) {}

            const onCanplay = () => {
                if (cacheKey && cacheUrl && this._audioUrlMemo && this._audioUrlMemo.set) {
                    this._audioUrlMemo.set(cacheKey, cacheUrl);
                }
            };

            const onPlay = () => {
                started = true;
            };

            audioCtx.onEnded(() => {
                settle(true);
            });

            audioCtx.onError(() => {
                settle(false);
            });

            if (audioCtx.onCanplay) {
                audioCtx.onCanplay(onCanplay);
            }

            if (audioCtx.onPlay) {
                audioCtx.onPlay(onPlay);
            }

            audioCtx.src = src;
            const attemptPlay = () => {
                try {
                    audioCtx.play();
                } catch (e) {}
            };
            attemptPlay();

            retryTimer = setTimeout(() => {
                if (settled || started) return;
                attemptPlay();
            }, 120);

            failTimer = setTimeout(() => {
                if (settled || started) return;
                settle(false);
            }, 3500);
        });
    },

    async playWithFallback(audioCtx, urls, cacheKey) {
        if (!audioCtx || !urls || urls.length === 0) return false;

        const memo = cacheKey && this._audioUrlMemo && this._audioUrlMemo.get ? this._audioUrlMemo.get(cacheKey) : '';
        if (memo) {
            const ok = await this.playSrcOnce(audioCtx, memo, cacheKey, memo);
            if (ok) return true;
        }

        for (const url of urls) {
            if (!url) continue;
            const ok = await this.playSrcOnce(audioCtx, url, cacheKey, url);
            if (ok) return true;
        }

        return false;
    },

    preloadNextWordAudio() {
        const s = this.data.settings || DEFAULT_SETTINGS;
        const shouldPreload = !!(s.autoPronounce || this._hasPlayedAudioOnce);
        if (!shouldPreload) return;

        const words = Array.isArray(this.data.words) ? this.data.words : [];
        if (words.length <= 1) return;

        const PRELOAD_COUNT = 5;
        const currentIndex = Number(this.data.currentIndex || 0);
        const preloadMeaning = !!s.pronounceMeaning;

        for (let i = 1; i <= PRELOAD_COUNT; i++) {
            const nextIndex = normalizeIndex(currentIndex + i, words.length);
            const next = words[nextIndex];
            if (!next || !next.word) continue;

            // Preload Korean
            this._preloadSingleAudio(next.word, false);

            // Preload Chinese if needed
            if (preloadMeaning) {
                this._preloadSingleAudio(next.word, true);
            }
        }
    },

    _preloadSingleAudio(word, isChinese) {
        const cacheKey = this.getAudioCacheKey(word, isChinese);
        // Check if already in LRU
        if (this.getAudioFileFromLRU(cacheKey)) return;

        // Check if already in flight
        if (this._audioFileInFlight && this._audioFileInFlight.has(cacheKey)) return;

        const memo = cacheKey && this._audioUrlMemo && this._audioUrlMemo.get ? this._audioUrlMemo.get(cacheKey) : '';
        const candidates = memo ? [memo] : this.buildAudioUrls(word, isChinese);
        
        // Fire and forget download
        this.downloadAudioToLRU(cacheKey, candidates).catch(() => {});
    },

    async playWordAudio() {
        this._hasUserGesture = true;
        const current = this.data.currentWord;
        if (!current || !current.word) return;
        const playSeq = this.cancelCurrentAudioPlayback();
        this.ensureAudioContexts();
        this._hasPlayedAudioOnce = true;

        const wordId = safeWordId(current);
        const word = current.word;
        const playMeaning = !!(this.data.settings && this.data.settings.pronounceMeaning);

        const koCacheKey = this.getAudioCacheKey(word, false);
        const koMemo = koCacheKey && this._audioUrlMemo && this._audioUrlMemo.get ? this._audioUrlMemo.get(koCacheKey) : '';
        const koUrls = koMemo ? [koMemo, ...this.buildAudioUrls(word, false)] : this.buildAudioUrls(word, false);
        const koLocal = koCacheKey ? this.getAudioFileFromLRU(koCacheKey) : '';
        let koOk = false;
        if (koLocal) {
            const ok = await this.playSrcOnce(this.wordAudio, koLocal);
            if (!ok) {
                if (this._audioPlaySeq !== playSeq || !this.data.currentWord || safeWordId(this.data.currentWord) !== wordId) return;
                koOk = await this.playWithFallback(this.wordAudio, koUrls, koCacheKey);
            } else {
                koOk = true;
            }
        } else {
            const downloaded = await this.downloadAudioToLRU(koCacheKey, koUrls);
            if (this._audioPlaySeq !== playSeq || !this.data.currentWord || safeWordId(this.data.currentWord) !== wordId) return;
            if (downloaded) {
                const ok = await this.playSrcOnce(this.wordAudio, downloaded);
                if (!ok) {
                    if (this._audioPlaySeq !== playSeq || !this.data.currentWord || safeWordId(this.data.currentWord) !== wordId) return;
                    koOk = await this.playWithFallback(this.wordAudio, koUrls, koCacheKey);
                } else {
                    koOk = true;
                }
            } else {
                koOk = await this.playWithFallback(this.wordAudio, koUrls, koCacheKey);
            }
        }

        if (this._audioPlaySeq !== playSeq || !this.data.currentWord || safeWordId(this.data.currentWord) !== wordId) return;
        if (!koOk) {
            this.notifyMissingAudioOnce(wordId, false);
            return;
        }
        if (playMeaning) {
            const cnCacheKey = this.getAudioCacheKey(word, true);
            const cnMemo = cnCacheKey && this._audioUrlMemo && this._audioUrlMemo.get ? this._audioUrlMemo.get(cnCacheKey) : '';
            const cnUrls = cnMemo ? [cnMemo, ...this.buildAudioUrls(word, true)] : this.buildAudioUrls(word, true);
            const cnLocal = cnCacheKey ? this.getAudioFileFromLRU(cnCacheKey) : '';
            let cnOk = false;
            if (cnLocal) {
                const ok = await this.playSrcOnce(this.cnAudio, cnLocal);
                if (!ok) {
                    if (this._audioPlaySeq !== playSeq || !this.data.currentWord || safeWordId(this.data.currentWord) !== wordId) return;
                    cnOk = await this.playWithFallback(this.cnAudio, cnUrls, cnCacheKey);
                } else {
                    cnOk = true;
                }
            } else {
                const downloaded = await this.downloadAudioToLRU(cnCacheKey, cnUrls);
                if (this._audioPlaySeq !== playSeq || !this.data.currentWord || safeWordId(this.data.currentWord) !== wordId) return;
                if (downloaded) {
                    const ok = await this.playSrcOnce(this.cnAudio, downloaded);
                    if (!ok) {
                        if (this._audioPlaySeq !== playSeq || !this.data.currentWord || safeWordId(this.data.currentWord) !== wordId) return;
                        cnOk = await this.playWithFallback(this.cnAudio, cnUrls, cnCacheKey);
                    } else {
                        cnOk = true;
                    }
                } else {
                    cnOk = await this.playWithFallback(this.cnAudio, cnUrls, cnCacheKey);
                }
            }
            if (this._audioPlaySeq !== playSeq || !this.data.currentWord || safeWordId(this.data.currentWord) !== wordId) return;
            if (!cnOk) this.notifyMissingAudioOnce(wordId, true);
        }

        if (this._audioPlaySeq !== playSeq || !this.data.currentWord || safeWordId(this.data.currentWord) !== wordId) return;
        this.preloadNextWordAudio();
    },

    tryAutoPronounce() {
        const s = this.data.settings || DEFAULT_SETTINGS;
        if (!s.autoPronounce) return;
        if (!this._hasUserGesture) return;
        const current = this.data.currentWord;
        if (!current || !current.id) return;
        if (this._autoPronouncedWordId === current.id) return;
        this._autoPronouncedWordId = current.id;
        setTimeout(() => {
            if (!this.data.currentWord || this.data.currentWord.id !== current.id) return;
            this.playWordAudio();
        }, 80);
    },

    toggleKeyboard() {
        const isOpening = !this.data.isKeyboardOpen;
        this.setData({ isKeyboardOpen: isOpening, showGuideBubble: false });

        if (isOpening) {
                const settingsTipKey = 'kr_practice_settings_tooltip_shown_v1';
                const hasShown = wx.getStorageSync(settingsTipKey);
                
                if (!hasShown) {
                    this.setData({
                        showSettingsTooltip: true,
                        settingsTooltipText: '点击修改键盘设置'
                    });
                    try {
                        wx.setStorageSync(settingsTipKey, true);
                    } catch (e) {
                        console.error('Storage error:', e);
                    }
                    
                    if (this._settingsTooltipTimer) clearTimeout(this._settingsTooltipTimer);
                    this._settingsTooltipTimer = setTimeout(() => {
                        this.setData({ showSettingsTooltip: false });
                    }, 2000);
                }
            }
    },

    onShareAppMessage() {
        const word = (this.data.currentWord && this.data.currentWord.word) || '韩语单词';
        const meaning = (this.data.currentWord && this.data.currentWord.meaning) || 'Korean Practice';
        const path = '/pages/nv-practice/index';
        
        return {
            title: `${word} - ${meaning}`,
            path: path,
            imageUrl: this.data.shareImagePath || ''
        };
    },

    onShareTimeline() {
        const word = (this.data.currentWord && this.data.currentWord.word) || '韩语单词';
        return {
             title: `我在练习：${word}`,
             imageUrl: this.data.shareImagePath || ''
        };
    },

    drawShareImage() {
        if (!this.data.currentWord) return;
        const query = this.createSelectorQuery();
        query.select('#shareCanvas')
            .fields({ node: true, size: true })
            .exec((res) => {
                if (!res[0] || !res[0].node) return;
                const canvas = res[0].node;
                const ctx = canvas.getContext('2d');
                const dpr = wx.getSystemInfoSync().pixelRatio;
                
                const width = res[0].width;
                const height = res[0].height;
                canvas.width = width * dpr;
                canvas.height = height * dpr;
                ctx.scale(dpr, dpr);
                
                // Draw Background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                
                // Draw Word (Korean)
                const word = this.data.currentWord.word;
                ctx.fillStyle = '#1e293b'; 
                ctx.font = 'bold 48px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(word, width / 2, height / 2 - 20);
                
                // Draw Meaning
                const meaning = this.data.currentWord.meaning;
                ctx.fillStyle = '#64748b';
                ctx.font = '24px sans-serif';
                ctx.fillText(meaning, width / 2, height / 2 + 40);
                
                // Draw Footer
                ctx.fillStyle = '#94a3b8';
                ctx.font = '14px sans-serif';
                ctx.fillText('韩语打字练习', width / 2, height - 20);
                
                wx.canvasToTempFilePath({
                    canvas: canvas,
                    success: (res) => {
                        this.setData({ shareImagePath: res.tempFilePath });
                    },
                    fail: (err) => {
                        console.error('Canvas export failed', err);
                    }
                });
            });
    },

});
