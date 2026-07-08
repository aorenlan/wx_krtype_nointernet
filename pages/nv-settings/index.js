import { getCategories, getCategoryCounts, getYonseiLessons, getTopikLevels, getTopikSessions, getWords } from '../../utils_nv/api';
import { getImportedLists, saveImportedList, updateImportedList, deleteImportedList, getMistakes, removeMistake, FAVORITES_LIST_NAME, addFavorites, getPhotoRecognitionWords, removePhotoRecognitionWord as removeStoredPhotoRecognitionWord, clearPhotoRecognitionWords as clearStoredPhotoRecognitionWords, PHOTO_RECOGNITION_CATEGORY, getPictureWordsPracticeWords, removePictureWordsPracticeWord as removeStoredPictureWordsPracticeWord, clearPictureWordsPracticeWords as clearStoredPictureWordsPracticeWords, PICTURE_WORDS_PRACTICE_CATEGORY } from '../../utils_nv/storage';
const { syncPageTabBar } = require('../../utils/tabbar');
const { getAdFreeExpire, isAdFreeActive, setAdFreeExpire, shouldSkipAd } = require('../../utils/ad-free');

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

const sanitizeSettings = (raw) => {
  const merged = Object.assign({}, DEFAULT_SETTINGS, raw || {});
  delete merged.darkMode;
  delete merged.showHint;
  delete merged.photoPracticeId;
  if (merged.category === '拍照识别') {
    merged.category = PHOTO_RECOGNITION_CATEGORY;
  }
  if (merged.practiceMode !== 'study' && merged.practiceMode !== 'flash') {
    merged.practiceMode = DEFAULT_SETTINGS.practiceMode;
  }
  if (
    merged.keyboardVisualMode !== 'korean' &&
    merged.keyboardVisualMode !== 'english' &&
    merged.keyboardVisualMode !== 'korean_hide_english' &&
    merged.keyboardVisualMode !== 'english_only'
  ) {
    merged.keyboardVisualMode = DEFAULT_SETTINGS.keyboardVisualMode;
  }
  if (merged.topikLevel != null) merged.topikLevel = String(merged.topikLevel);
  if (merged.topikSession != null) merged.topikSession = String(merged.topikSession);
  if (merged.yonseiLessonId != null) merged.yonseiLessonId = String(merged.yonseiLessonId);
  if (merged.yonseiLessonName != null) merged.yonseiLessonName = String(merged.yonseiLessonName);
  let repeatCount = Number(merged.repeatCount);
  if (!Number.isFinite(repeatCount)) repeatCount = DEFAULT_SETTINGS.repeatCount;
  merged.repeatCount = Math.max(1, Math.min(10, Math.round(repeatCount)));
  let flashDuration = Number(merged.flashDuration);
  if (!Number.isFinite(flashDuration)) flashDuration = DEFAULT_SETTINGS.flashDuration;
  merged.flashDuration = Math.max(200, Math.min(3000, Math.round(flashDuration / 100) * 100));
  let timerDuration = Number(merged.timerDuration);
  if (!Number.isFinite(timerDuration)) timerDuration = DEFAULT_SETTINGS.timerDuration;
  merged.timerDuration = Math.max(3, Math.min(30, Math.round(timerDuration)));
  merged.enableTimer = !!merged.enableTimer;
  merged.cardShowWord = merged.cardShowWord !== false;
  merged.cardShowMeaning = merged.cardShowMeaning !== false;
  merged.enableKeyboardHint = merged.enableKeyboardHint !== false;
  merged.autoCheckSpelling = merged.autoCheckSpelling !== false;
  merged.autoPronounce = !!merged.autoPronounce;
  merged.pronounceMeaning = !!merged.pronounceMeaning;
  return merged;
};

const getInitialSettings = () => {
  const storedSettings = wx.getStorageSync('settings') || {};
  return sanitizeSettings(storedSettings);
};

const formatDate = (ts) => {
  const d = new Date(Number(ts) || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseImportedWords = (content) => {
  const text = String(content || '');
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  const words = [];

  lines.forEach((raw) => {
    const line = String(raw || '').trim();
    if (!line) return;
    const parts = line.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return;

    const word = parts[0];
    if (seen.has(word)) return;
    seen.add(word);

    const meaning = parts.slice(1).join(' ').trim();
    words.push({
      id: `${Date.now()}_${words.length}`,
      word,
      meaning
    });
  });

  return words;
};

// 扫码导入专用：严格校验每行必须为「韩文 中文」对。
// 第一段（按空白分隔）必须含韩文字符，剩余部分必须含中文字符。
const HANGUL_RE = /[가-힣ᄀ-ᇿ㄰-㆏]/;
const HANZI_RE = /[一-鿿]/;
const parseStrictKrCnQrText = (raw) => {
  const text = String(raw || '');
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  const words = [];
  lines.forEach((line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return;
    const word = parts[0];
    const meaning = parts.slice(1).join(' ').trim();
    if (!HANGUL_RE.test(word)) return;
    if (!HANZI_RE.test(meaning)) return;
    if (seen.has(word)) return;
    seen.add(word);
    words.push({ word, meaning });
  });
  return words;
};

const EXTEND_LINK = 'https://chat.eng100.cn/';
const EXTEND_USER_ID_STORAGE_KEY = 'extend_user_id';
const EXTEND_ONE_DAY_AD_UNIT_ID = 'adunit-a8c0edf5a1947c4a';
const AD_FREE_ONE_DAY_REWARD_AD_UNIT_ID = 'adunit-1e8cde57f31f864e';
const REMOTE_BASE_CONFIG_URL = 'https://enoss.aorenlan.fun/kr_dailysentence/base.json';
const REMOTE_BASE_CONFIG_CACHE_KEY = 'kr_remote_base_config_v2';
const REMOTE_BASE_CONFIG_TTL_MS = 10 * 60 * 1000;

const DEFAULT_REMOTE_BASE_CONFIG = {
  extendModal: {
    notice: ''
  }
};

const createExtendRequestId = (userid) => {
  const safeUserId = String(userid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'user';
  return `web_extend_${safeUserId}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
};

const normalizeRemoteBaseConfig = (raw) => {
  const safe = raw && typeof raw === 'object' ? raw : {};
  const extendModal = safe.extendModal && typeof safe.extendModal === 'object' ? safe.extendModal : {};
  const redeemModal = safe.redeemModal && typeof safe.redeemModal === 'object' ? safe.redeemModal : {};
  return {
    extendModal: {
      notice: extendModal.notice != null ? String(extendModal.notice) : ''
    },
    redeemModal: {
      notice: redeemModal.notice != null ? String(redeemModal.notice) : ''
    }
  };
};

const readRemoteBaseConfigCache = () => {
  try {
    const raw = wx.getStorageSync(REMOTE_BASE_CONFIG_CACHE_KEY);
    if (!raw || typeof raw !== 'object') return null;
    const cachedAt = raw.cachedAt != null ? Number(raw.cachedAt) : NaN;
    if (!Number.isFinite(cachedAt)) return null;
    if (Date.now() - cachedAt > REMOTE_BASE_CONFIG_TTL_MS) return null;
    return normalizeRemoteBaseConfig(raw.value);
  } catch (e) {
    return null;
  }
};

const writeRemoteBaseConfigCache = (value) => {
  try {
    wx.setStorageSync(REMOTE_BASE_CONFIG_CACHE_KEY, {
      cachedAt: Date.now(),
      value
    });
  } catch (e) {}
};

const formatAdFreeRemain = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return days > 0 ? `${days}天 ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
};

const formatAdFreeExpire = (ts) => {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= Date.now()) return '当前未开启';
  const d = new Date(n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `有效至 ${m}-${day} ${hh}:${mm}`;
};

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    scrollHeight: 0,
    view: 'categories', // 'categories' | 'filters' | 'importList' | 'importForm' | 'smartImport'
    categories: [],
    categoryCounts: {},
    currentCategory: 'TOPIK Vocabulary', // Default
    photoRecognitionCategory: PHOTO_RECOGNITION_CATEGORY,
    photoRecognitionCount: 0,
    photoRecognitionWords: [],
    showPhotoClearConfirm: false,
    pictureWordsPracticeCategory: PICTURE_WORDS_PRACTICE_CATEGORY,
    pictureWordsPracticeCount: 0,
    pictureWordsPracticeWords: [],
    showPictureWordsClearConfirm: false,
    settings: getInitialSettings(),
    categoryPickerIndex: 0,
    mistakesCount: 0,
    mistakesList: [],
    totalWords: 0,
    topikLevels: [],
    topikLevelPickerIndex: 0,
    topikSessions: [],
    showTopikSub: false,
    yonseiLessons: [],
    yonseiLessonOptions: [],
    yonseiLessonPickerIndex: 0,
    yonseiLessonDisplay: '请选择',
    showYonseiSub: false,
    lists: [],
    editingId: null,
    name: '',
    content: '',
    contentCursor: -1,
    contentFocus: false,
    showExtendModal: false,
    extendLink: EXTEND_LINK,
    extendUserId: '',
    extendSubmitting: false,
    extendNotice: '',
    adFreeActive: false,
    adFreeExpireAt: 0,
    adFreeRemainText: '00:00:00',
    adFreeExpireText: '当前未开启',
    adFreeRewardSubmitting: false,
    showRedeemModal: false,
    redeemCode: '',
    redeemSubmitting: false,
    redeemNotice: '',
    importPlaceholderLines: ['apple 苹果', 'banana 香蕉', 'computer 电脑'],
    importPlaceholder: 'apple 苹果\nbanana 香蕉\ncomputer 电脑',
    suggestion: null,
    showDeleteListConfirm: false,
    pendingDeleteListId: '',
    pendingDeleteListName: '',
    showSettingsGeneralConfirm: false,
    settingsGeneralTitle: '',
    settingsGeneralCopy: '',
    settingsGeneralPrimaryText: '确定',
    settingsGeneralDanger: false
  },

  videoAd: null, // 激励视频广告实例
  extendVideoAd: null,
  extendAdResolver: null,
  adFreeRewardVideoAd: null,
  adFreeRewardResolver: null,
  adFreeCountdownTimer: null,

  refreshAdFreeState: function () {
    const now = Date.now();
    const expire = getAdFreeExpire();
    const active = expire > now;
    this.setData({
      adFreeActive: active,
      adFreeExpireAt: expire,
      adFreeRemainText: formatAdFreeRemain(expire - now),
      adFreeExpireText: formatAdFreeExpire(expire)
    });
  },

  startAdFreeCountdown: function () {
    this.stopAdFreeCountdown();
    this.refreshAdFreeState();
    this.adFreeCountdownTimer = setInterval(() => {
      this.refreshAdFreeState();
    }, 1000);
  },

  stopAdFreeCountdown: function () {
    if (this.adFreeCountdownTimer) {
      clearInterval(this.adFreeCountdownTimer);
      this.adFreeCountdownTimer = null;
    }
  },

  syncSettingsTabBar: function () {
    const hidden = !!(this.data.showRedeemModal || this.data.showExtendModal);
    try {
      syncPageTabBar(this, { selected: 4, hidden });
    } catch (err) {
      console.warn('同步设置页 tabbar 失败', err);
    }
  },

  openSettingsGeneralConfirm: function (options = {}) {
    this.pendingSettingsGeneralConfirm = typeof options.onConfirm === 'function' ? options.onConfirm : null;
    this.pendingSettingsGeneralCancel = typeof options.onCancel === 'function' ? options.onCancel : null;
    this.setData({
      showSettingsGeneralConfirm: true,
      settingsGeneralTitle: options.title || '确认操作',
      settingsGeneralCopy: options.copy || '',
      settingsGeneralPrimaryText: options.primaryText || '确定',
      settingsGeneralDanger: !!options.danger
    });
  },

  closeSettingsGeneralConfirm: function () {
    const onCancel = this.pendingSettingsGeneralCancel;
    this.pendingSettingsGeneralConfirm = null;
    this.pendingSettingsGeneralCancel = null;
    this.setData({
      showSettingsGeneralConfirm: false,
      settingsGeneralTitle: '',
      settingsGeneralCopy: '',
      settingsGeneralPrimaryText: '确定',
      settingsGeneralDanger: false
    });
    if (onCancel) onCancel();
  },

  confirmSettingsGeneral: function () {
    const onConfirm = this.pendingSettingsGeneralConfirm;
    this.pendingSettingsGeneralConfirm = null;
    this.pendingSettingsGeneralCancel = null;
    this.setData({
      showSettingsGeneralConfirm: false,
      settingsGeneralTitle: '',
      settingsGeneralCopy: '',
      settingsGeneralPrimaryText: '确定',
      settingsGeneralDanger: false
    });
    if (onConfirm) onConfirm();
  },

  switchVersion: function() {
    this.openSettingsGeneralConfirm({
      title: '切换回旧版',
      copy: '确定要切换回旧版界面吗？之后可以再切回新版。',
      primaryText: '切换',
      onConfirm: () => {
        wx.removeStorageSync('useNewVersion');
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }
    });
  },

  onLoad: function () {
    const app = getApp();
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    let { statusBarHeight, navBarHeight } = app.globalData;

    if (!statusBarHeight || !navBarHeight) {
        const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
        statusBarHeight = windowInfo.statusBarHeight || 20;
        navBarHeight = (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height;
    }
    
    this.setData({
      statusBarHeight,
      navBarHeight: navBarHeight || 44,
    });

    if (app && typeof app.registerThemePage === 'function') {
      app.registerThemePage('settings', this);
    }

    try {
      const windowHeight = windowInfo.windowHeight || 0;
      const scrollHeight = Math.max(0, windowHeight - this.data.statusBarHeight - this.data.navBarHeight - 20);
      this.setData({ scrollHeight });
    } catch (e) { }
    this.normalizeMistakesStorage();
    this.loadCategories();
    this.loadMistakesCount();
    this.loadLists();
    this.loadExtendUserId();
    this.createExtendVideoAd();
    this.createAdFreeRewardVideoAd();
    this.loadRemoteBaseConfig();
  },

  createVideoAd: function() {
    if (shouldSkipAd('nv-settings')) return;
    if (this.videoAd) return;
    if (wx.createRewardedVideoAd) {
      this.videoAd = wx.createRewardedVideoAd({
        adUnitId: 'adunit-1d2566cb7cc546d7'
      });
      this.videoAd.onLoad(() => {
        console.log('激励视频 广告加载成功 (Settings)');
      });
      this.videoAd.onError((err) => {
        console.error('激励视频广告加载失败', err);
      });
    }
  },

  createExtendVideoAd: function() {
    if (this.extendVideoAd || !wx.createRewardedVideoAd) return;
    this.extendVideoAd = wx.createRewardedVideoAd({
      adUnitId: EXTEND_ONE_DAY_AD_UNIT_ID
    });
    this.extendVideoAd.onError((err) => {
      console.error('Web 工具续期激励视频广告加载失败', err);
      if (this.extendAdResolver) {
        const resolve = this.extendAdResolver;
        this.extendAdResolver = null;
        resolve(false);
      }
    });
    this.extendVideoAd.onClose((res) => {
      const resolve = this.extendAdResolver;
      this.extendAdResolver = null;
      if (!resolve) return;
      const finished = !(res && res.isEnded === false);
      resolve(finished);
    });
  },

  createAdFreeRewardVideoAd: function() {
    if (this.adFreeRewardVideoAd || !wx.createRewardedVideoAd) return;
    this.adFreeRewardVideoAd = wx.createRewardedVideoAd({
      adUnitId: AD_FREE_ONE_DAY_REWARD_AD_UNIT_ID
    });
    this.adFreeRewardVideoAd.onError((err) => {
      console.error('免广告一天激励视频广告加载失败', err);
      if (this.adFreeRewardResolver) {
        const resolve = this.adFreeRewardResolver;
        this.adFreeRewardResolver = null;
        resolve(false);
      }
    });
    this.adFreeRewardVideoAd.onClose((res) => {
      const resolve = this.adFreeRewardResolver;
      this.adFreeRewardResolver = null;
      if (!resolve) return;
      const finished = !(res && res.isEnded === false);
      resolve(finished);
    });
  },

  loadExtendUserId: function () {
    try {
      const extendUserId = wx.getStorageSync(EXTEND_USER_ID_STORAGE_KEY) || '';
      this.setData({ extendUserId: String(extendUserId || '') });
    } catch (e) {
      this.setData({ extendUserId: '' });
    }
  },

  onShow: function () {
    this.refreshAdFreeState();
    if (this.data.showRedeemModal) {
      this.startAdFreeCountdown();
    }
    this.createVideoAd();
    this.createExtendVideoAd();
    this.createAdFreeRewardVideoAd();
    if (this.videoAd) {
      if (!this.onAdClose) {
         this.onAdClose = (res) => {
           console.log('Ad closed, res:', res);
           if (res && res.isEnded) {
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
             wx.showToast({
               title: '看完广告才能切换哦',
               icon: 'none'
             });
             // 恢复Picker显示
             this.setData({
                categoryPickerIndex: this.data.categoryPickerIndex,
                yonseiLessonPickerIndex: this.data.yonseiLessonPickerIndex,
                topikLevelPickerIndex: this.data.topikLevelPickerIndex
             });
           }
         };
      }
      this.videoAd.offClose(this.onAdClose);
      this.videoAd.onClose(this.onAdClose);
    }

    this.syncSettingsTabBar();
    if (this.data.view !== 'importForm') {
      this.setData({ contentCursor: -1, contentFocus: false });
    }
    this.loadSettings();
    this.normalizeMistakesStorage();
    this.loadMistakesCount();
    this.loadCategories(); // Refresh categories and counts
    if (this.data.view === 'importList') this.loadLists();
    if (this.data.view === 'filters') {
      this.refreshMistakesList();
      this.loadSubcategories();
    }
  },

  onHide: function() {
    this.stopAdFreeCountdown();
    // 即使页面隐藏，也不要移除广告监听器，否则广告关闭回调无法触发
  },

  onUnload: function () {
    this.stopAdFreeCountdown();
    const app = getApp();
    if (app && typeof app.unregisterThemePage === 'function') {
      app.unregisterThemePage('settings', this);
    }
    // 不要销毁广告
    if (this.videoAd && this.onAdClose) {
       this.videoAd.offClose(this.onAdClose);
    }
  },

  openExtendModal: function () {
    this.setData({
      showExtendModal: true
    }, () => {
      this.syncSettingsTabBar();
    });
    this.loadExtendUserId();
    try {
      this.refreshAdFreeState();
    } catch (err) {
      console.warn('刷新免广告状态失败', err);
    }
    try {
      this.loadRemoteBaseConfig();
    } catch (err) {
      console.warn('加载 Web 学习工具配置失败', err);
    }
  },

  closeExtendModal: function () {
    if (this.data.extendSubmitting) return;
    this.setData({
      showExtendModal: false
    }, () => {
      this.syncSettingsTabBar();
    });
  },

  openRedeemModal: function () {
    this.setData({ showRedeemModal: true, redeemCode: '' }, () => {
      this.syncSettingsTabBar();
      try {
        this.startAdFreeCountdown();
      } catch (err) {
        console.warn('启动免广告倒计时失败', err);
      }
    });
    try {
      this.refreshAdFreeState();
    } catch (err) {
      console.warn('刷新免广告状态失败', err);
    }
    try {
      this.loadRemoteBaseConfig();
    } catch (err) {
      console.warn('加载免广告配置失败', err);
    }
  },

  closeRedeemModal: function () {
    if (this.data.redeemSubmitting || this.data.adFreeRewardSubmitting) return;
    this.stopAdFreeCountdown();
    this.setData({ showRedeemModal: false, redeemCode: '' }, () => {
      this.syncSettingsTabBar();
    });
  },

  onRedeemCodeInput: function (e) {
    const redeemCode = e && e.detail && e.detail.value != null ? String(e.detail.value) : '';
    this.setData({ redeemCode });
  },

  submitRedeemCode: async function () {
    const code = String(this.data.redeemCode || '').trim();
    if (!code) {
      wx.showToast({ title: '请输入兑换码', icon: 'none' });
      return;
    }
    if (!wx.cloud || !wx.cloud.callFunction) {
      wx.showToast({ title: '云能力不可用', icon: 'none' });
      return;
    }

    this.setData({ redeemSubmitting: true });
    wx.showLoading({ title: '验证中', mask: true });

    try {
      const res = await wx.cloud.callFunction({
        name: 'redeemCode',
        data: { code }
      });
      const result = res && res.result ? res.result : {};
      if (!result.success) {
        throw new Error(result.error || '兑换失败');
      }

      const days = Number(result.days) || 0;
      const expire = Date.now() + days * 24 * 60 * 60 * 1000;
      setAdFreeExpire(expire);
      this.refreshAdFreeState();

      wx.showToast({ title: result.message || `免广告 ${days} 天`, icon: 'success' });
      this.setData({ redeemCode: '' });
    } catch (err) {
      wx.showToast({ title: (err && err.message) || '兑换失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ redeemSubmitting: false });
    }
  },

  copyExtendLink: function () {
    wx.setClipboardData({
      data: EXTEND_LINK,
      success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
    });
  },

  onExtendUserIdInput: function (e) {
    const extendUserId = e && e.detail && e.detail.value != null ? String(e.detail.value) : '';
    this.setData({ extendUserId });
    try {
      wx.setStorageSync(EXTEND_USER_ID_STORAGE_KEY, extendUserId);
    } catch (err) {
      console.error('保存加一天ID失败', err);
    }
  },

  adLoad: function () {
    console.log('原生模板广告加载成功');
  },

  adError: function (err) {
    console.error('原生模板广告加载失败', err);
  },

  adClose: function () {
    console.log('原生模板广告关闭');
  },

  loadRemoteBaseConfig: function () {
    const cached = readRemoteBaseConfigCache();
    if (cached) {
      this.setData({
        extendNotice: cached.extendModal.notice || '',
        redeemNotice: cached.redeemModal ? (cached.redeemModal.notice || '') : ''
      });
    }

    wx.request({
      url: REMOTE_BASE_CONFIG_URL,
      method: 'GET',
      timeout: 5000,
      success: (res) => {
        if (!res || !res.data || res.statusCode < 200 || res.statusCode >= 300) return;
        const nextConfig = normalizeRemoteBaseConfig(res.data);
        writeRemoteBaseConfigCache(nextConfig);
        this.setData({
          extendNotice: nextConfig.extendModal.notice || '',
          redeemNotice: nextConfig.redeemModal ? (nextConfig.redeemModal.notice || '') : ''
        });
      },
      fail: (err) => {
        console.warn('加载远程 base.json 失败', err);
      }
    });
  },

  showExtendRewardedAd: async function () {
    this.createExtendVideoAd();
    if (!this.extendVideoAd) {
      wx.showToast({ title: '当前环境不支持广告', icon: 'none' });
      return false;
    }

    if (this.extendAdResolver) {
      wx.showToast({ title: '广告正在打开', icon: 'none' });
      return false;
    }

    return new Promise((resolve) => {
      this.extendAdResolver = resolve;
      this.extendVideoAd.show().catch(() => {
          this.extendVideoAd.load()
          .then(() => this.extendVideoAd.show())
          .catch((err) => {
            console.error('Web 工具续期激励视频广告显示失败', err);
            if (this.extendAdResolver) {
              const fallbackResolve = this.extendAdResolver;
              this.extendAdResolver = null;
              fallbackResolve(false);
            }
          });
      });
    });
  },

  showAdFreeRewardedAd: async function () {
    this.createAdFreeRewardVideoAd();
    if (!this.adFreeRewardVideoAd) {
      wx.showToast({ title: '当前环境不支持广告', icon: 'none' });
      return false;
    }

    if (this.adFreeRewardResolver) {
      wx.showToast({ title: '广告正在打开', icon: 'none' });
      return false;
    }

    return new Promise((resolve) => {
      this.adFreeRewardResolver = resolve;
      this.adFreeRewardVideoAd.show().catch(() => {
        this.adFreeRewardVideoAd.load()
          .then(() => this.adFreeRewardVideoAd.show())
          .catch((err) => {
            console.error('免广告一天激励视频广告显示失败', err);
            if (this.adFreeRewardResolver) {
              const fallbackResolve = this.adFreeRewardResolver;
              this.adFreeRewardResolver = null;
              fallbackResolve(false);
            }
          });
      });
    });
  },

  grantAdFreeOneDay: function () {
    const now = Date.now();
    const baseExpire = Math.max(now, getAdFreeExpire());
    const nextExpire = baseExpire + 24 * 60 * 60 * 1000;
    setAdFreeExpire(nextExpire);
    this.refreshAdFreeState();
    return nextExpire;
  },

  watchAdFreeOneDay: async function () {
    if (this.data.adFreeRewardSubmitting) return;
    this.setData({ adFreeRewardSubmitting: true });

    try {
      const watched = await this.showAdFreeRewardedAd();
      if (!watched) {
        wx.showToast({ title: '看完广告才能免一天', icon: 'none' });
        return;
      }

      this.grantAdFreeOneDay();
      wx.showToast({ title: '已免广告 1 天', icon: 'success' });
    } catch (err) {
      console.error('领取免广告一天失败', err);
      wx.showToast({ title: '领取失败，请稍后再试', icon: 'none' });
    } finally {
      this.setData({ adFreeRewardSubmitting: false });
    }
  },

  submitExtendDay: async function () {
    if (this.data.extendSubmitting) return;
    const userid = String(this.data.extendUserId || '').trim();
    let loadingShown = false;
    const hideExtendLoading = () => {
      if (loadingShown) {
        wx.hideLoading();
        loadingShown = false;
      }
    };
    if (!userid) {
      wx.showToast({ title: '请输入网页 id', icon: 'none' });
      return;
    }
    if (!wx.cloud || !wx.cloud.callFunction) {
      wx.showToast({ title: '云能力不可用', icon: 'none' });
      return;
    }

    try {
      wx.setStorageSync(EXTEND_USER_ID_STORAGE_KEY, userid);
    } catch (err) {
      console.error('保存 Web 工具 ID 失败', err);
    }

    this.setData({ extendSubmitting: true });

    try {
      const watched = await this.showExtendRewardedAd();
      if (!watched) {
        wx.showToast({ title: '看完广告后给网页加 3 天', icon: 'none' });
        return;
      }

      wx.showLoading({
        title: '处理中',
        mask: true
      });
      loadingShown = true;

      const res = await wx.cloud.callFunction({
        name: 'extendUserOneDay',
        timeout: 30000,
        data: {
          userid,
          requestId: createExtendRequestId(userid)
        }
      });

      const result = res && res.result ? res.result : null;
      console.log('网页工具加 3 天结果:', result);
      if (!result || result.success !== true) {
        throw new Error((result && result.error) || '网页工具加 3 天失败');
      }

      hideExtendLoading();
      wx.showToast({
        title: result.message || '网页工具已加 3 天',
        icon: 'success'
      });
      this.setData({
        showExtendModal: false
      }, () => {
        this.syncSettingsTabBar();
      });
    } catch (err) {
      console.error('网页工具加 3 天失败', err);
      hideExtendLoading();
      wx.showToast({
        title: (err && err.message) || '网页工具加 3 天失败',
        icon: 'none'
      });
    } finally {
      hideExtendLoading();
      this.setData({ extendSubmitting: false });
    }
  },

  normalizeMistakesStorage: function () {
    const mistakes = getMistakes();
    if (!Array.isArray(mistakes)) return;
    if (mistakes.length > 100) {
      wx.setStorageSync('flashflow_mistakes', mistakes.slice(0, 100));
    }
  },

  loadCategories: async function () {
    const base = await getCategories();
    const categories = Array.isArray(base) ? [...base] : [];
    if (!categories.includes('Mistakes (错题本)')) categories.push('Mistakes (错题本)');
    const photoRecognitionWords = getPhotoRecognitionWords();
    const photoRecognitionCount = photoRecognitionWords.length;
    if (photoRecognitionCount > 0 && !categories.includes(PHOTO_RECOGNITION_CATEGORY)) {
      categories.push(PHOTO_RECOGNITION_CATEGORY);
    }
    const pictureWordsPracticeWords = getPictureWordsPracticeWords();
    const pictureWordsPracticeCount = pictureWordsPracticeWords.length;
    if (pictureWordsPracticeCount > 0 && !categories.includes(PICTURE_WORDS_PRACTICE_CATEGORY)) {
      categories.push(PICTURE_WORDS_PRACTICE_CATEGORY);
    }

    const categoryCounts = await getCategoryCounts();
    const counts = categoryCounts && typeof categoryCounts === 'object' ? { ...categoryCounts } : {};
    counts['Mistakes (错题本)'] = this.data.mistakesCount || 0;
    counts[PHOTO_RECOGNITION_CATEGORY] = photoRecognitionCount;
    counts[PICTURE_WORDS_PRACTICE_CATEGORY] = pictureWordsPracticeCount;

    const current = (this.data.settings && this.data.settings.category) || DEFAULT_SETTINGS.category;
    const idx = Math.max(0, categories.indexOf(current));

    // Check if data actually changed to avoid unnecessary re-renders (flickering)
    const isCategoriesChanged = JSON.stringify(categories) !== JSON.stringify(this.data.categories);
    const isCountsChanged = JSON.stringify(counts) !== JSON.stringify(this.data.categoryCounts);
    const isIdxChanged = idx !== this.data.categoryPickerIndex;
    const isPhotoCountChanged = photoRecognitionCount !== this.data.photoRecognitionCount;
    const isPhotoWordsChanged = JSON.stringify(photoRecognitionWords) !== JSON.stringify(this.data.photoRecognitionWords);
    const isPicturePracticeCountChanged = pictureWordsPracticeCount !== this.data.pictureWordsPracticeCount;
    const isPicturePracticeWordsChanged = JSON.stringify(pictureWordsPracticeWords) !== JSON.stringify(this.data.pictureWordsPracticeWords);

    if (isCategoriesChanged || isCountsChanged || isIdxChanged || isPhotoCountChanged || isPhotoWordsChanged || isPicturePracticeCountChanged || isPicturePracticeWordsChanged) {
        this.setData({
          categories,
          categoryCounts: counts,
          categoryPickerIndex: idx,
          photoRecognitionCount,
          photoRecognitionWords,
          pictureWordsPracticeCount,
          pictureWordsPracticeWords
        });
    }
  },

  loadMistakesCount: function () {
    const mistakes = getMistakes();
    const list = Array.isArray(mistakes) ? mistakes : [];
    const newCount = list.length;
    
    const isCountChanged = newCount !== this.data.mistakesCount;
    // Simple array length check for list change approximation, or deep check if needed. 
    // Since we mostly care about count and list content for display:
    const isListChanged = JSON.stringify(list) !== JSON.stringify(this.data.mistakesList);
    
    if (isCountChanged || isListChanged) {
        this.setData({ mistakesCount: newCount, mistakesList: list, totalWords: this.data.currentCategory === 'Mistakes (错题本)' ? newCount : this.data.totalWords });
    }
  },

  refreshMistakesList: function () {
    const mistakes = getMistakes();
    const list = Array.isArray(mistakes) ? mistakes : [];
    this.setData({ mistakesList: list, mistakesCount: list.length, totalWords: list.length });
  },

  loadSettings: function () {
    const stored = wx.getStorageSync('settings') || {};
    const settings = sanitizeSettings(stored);
    const category = settings.category || DEFAULT_SETTINGS.category;
    const idx = Math.max(0, (this.data.categories || []).indexOf(category));
    
    // Check if settings changed
    const isSettingsChanged = JSON.stringify(settings) !== JSON.stringify(this.data.settings);
    const isCategoryChanged = category !== this.data.currentCategory;
    const isIdxChanged = idx !== this.data.categoryPickerIndex;

    if (isSettingsChanged || isCategoryChanged || isIdxChanged) {
        this.setData({ settings, currentCategory: category, categoryPickerIndex: idx });
    }
  },

  loadSubcategories: async function () {
    const s = this.data.settings || DEFAULT_SETTINGS;
    const category = s.category || DEFAULT_SETTINGS.category;

    if (category === 'TOPIK Vocabulary') {
      const topikLevels = await getTopikLevels();
      let topikLevel = s.topikLevel != null ? String(s.topikLevel) : '';
      topikLevel = String(topikLevel || topikLevels[0] || DEFAULT_SETTINGS.topikLevel || '1');
      if (topikLevels.length > 0 && !topikLevels.includes(topikLevel)) {
        topikLevel = String(topikLevels[0]);
      }

      const topikSessions = await getTopikSessions(topikLevel);
      let topikSession = s.topikSession != null ? String(s.topikSession) : '';
      topikSession = String(topikSession || topikSessions[0] || '');
      if (topikSession && topikSessions.length > 0 && !topikSessions.includes(topikSession)) {
        topikSession = String(topikSessions[0] || '');
      }

      const nextSettings = sanitizeSettings({ ...s, topikLevel, topikSession, yonseiLessonId: '', yonseiLessonName: '' });
      wx.setStorageSync('settings', nextSettings);

      const topikIdx = Math.max(0, (topikLevels || []).findIndex(l => String(l) === String(topikLevel)));
      this.setData({
        settings: nextSettings,
        topikLevels,
        topikLevelPickerIndex: topikIdx,
        topikSessions,
        showTopikSub: true,
        yonseiLessons: [],
        yonseiLessonOptions: [],
        yonseiLessonDisplay: '请选择',
        yonseiLessonPickerIndex: 0,
        showYonseiSub: false
      }, () => {
        this.updateFilteredTotalWords();
      });
      return;
    }

    if (/^Yonsei\s+\d$/.test(category)) {
      const yonseiLessons = await getYonseiLessons(category);
      const options = (yonseiLessons || []).map(l => `第${l.id}课 ${l.original || l.name || ''}`.trim());

      let yonseiLessonId = s.yonseiLessonId != null ? String(s.yonseiLessonId) : '';
      let yonseiLessonName = s.yonseiLessonName != null ? String(s.yonseiLessonName) : '';

      if (!yonseiLessonId && yonseiLessons.length > 0) {
        yonseiLessonId = String(yonseiLessons[0].id);
        yonseiLessonName = String(yonseiLessons[0].original || yonseiLessons[0].name || '');
      } else if (yonseiLessonId) {
        const match = yonseiLessons.find(l => String(l.id) === String(yonseiLessonId));
        if (match) yonseiLessonName = String(match.original || match.name || '');
      }

      const nextSettings = sanitizeSettings({ ...s, yonseiLessonId, yonseiLessonName, topikSession: '' });
      wx.setStorageSync('settings', nextSettings);

      const idx = Math.max(0, (yonseiLessons || []).findIndex(l => String(l.id) === String(yonseiLessonId)));
      const display = idx >= 0 && idx < options.length ? options[idx] : '请选择';

      this.setData({
        settings: nextSettings,
        yonseiLessons,
        yonseiLessonOptions: options,
        yonseiLessonPickerIndex: idx,
        yonseiLessonDisplay: display,
        showYonseiSub: true,
        topikLevels: [],
        topikSessions: [],
        showTopikSub: false
      }, () => {
        this.updateFilteredTotalWords();
      });
      return;
    }

    this.setData({
      topikLevels: [],
      topikSessions: [],
      showTopikSub: false,
      yonseiLessons: [],
      yonseiLessonOptions: [],
      yonseiLessonDisplay: '请选择',
      yonseiLessonPickerIndex: 0,
      showYonseiSub: false
    }, () => {
      this.updateFilteredTotalWords();
    });
  },

  updateFilteredTotalWords: async function() {
    const s = this.data.settings;
    const category = this.data.currentCategory;
    
    if (category === 'Mistakes (错题本)') {
       return;
    }
    if (category === PHOTO_RECOGNITION_CATEGORY) {
       const words = getPhotoRecognitionWords();
       const count = words.length;
       const counts = { ...(this.data.categoryCounts || {}) };
       counts[PHOTO_RECOGNITION_CATEGORY] = count;
       this.setData({ totalWords: count, photoRecognitionCount: count, photoRecognitionWords: words, categoryCounts: counts });
       return;
    }
    if (category === PICTURE_WORDS_PRACTICE_CATEGORY) {
       const words = getPictureWordsPracticeWords();
       const count = words.length;
       const counts = { ...(this.data.categoryCounts || {}) };
       counts[PICTURE_WORDS_PRACTICE_CATEGORY] = count;
       this.setData({ totalWords: count, pictureWordsPracticeCount: count, pictureWordsPracticeWords: words, categoryCounts: counts });
       return;
    }

    const filters = {};
    if (category === 'TOPIK Vocabulary') {
       if (s.topikLevel) filters.topikLevel = s.topikLevel;
       if (s.topikSession) filters.topikSession = s.topikSession;
    } else if (/^Yonsei\s+\d$/.test(category)) {
       if (s.yonseiLessonId) filters.lessonId = s.yonseiLessonId;
    }

    const res = await getWords(category, 1, 0, filters);
    this.setData({ totalWords: res.total });
  },

  checkAndShowAd: function(contentId, callback) {
    console.log('checkAndShowAd called with contentId:', contentId);
    // 如果没有传 contentId，尝试将第一个参数当作 callback (兼容旧代码)
    if (typeof contentId === 'function') {
      callback = contentId;
      contentId = null;
    }

    if (shouldSkipAd('nv-settings')) {
      callback && callback();
      return;
    }

    // 检查是否开启了免广告模式
    const unlockCount = wx.getStorageSync('story_create_unlock_counter') || 0;
    if (unlockCount >= 10) {
        callback && callback();
        return;
    }

    // 检查是否在有效期内（7天）
    if (contentId) {
      try {
        const key = `unlock_${contentId}`;
        const lastUnlock = wx.getStorageSync(key);
        if (lastUnlock) {
          const now = Date.now();
          const diff = now - Number(lastUnlock);
          const sevenDays = 60 * 60 * 1000;
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

    if (!this.videoAd) this.createVideoAd();

    // 如果没有广告实例，直接执行回调
    if (!this.videoAd) {
      callback && callback();
      return;
    }

    this.openSettingsGeneralConfirm({
      title: '解锁章节',
      copy: '解锁该章节需要观看一次广告，解锁后 1 小时内可自由切换。',
      primaryText: '观看广告',
      onConfirm: () => {
        this.pendingAction = callback;
        this.pendingContentId = contentId;
        this.videoAd.show().catch(() => {
          this.videoAd.load()
            .then(() => this.videoAd.show())
            .catch(err => {
              console.error('激励视频 广告显示失败', err);
              if (this.pendingAction) {
                this.pendingAction();
                this.pendingAction = null;
                this.pendingContentId = null;
              }
            });
        });
      },
      onCancel: () => {
        console.log('用户取消切换');
        this.setData({
          categoryPickerIndex: this.data.categoryPickerIndex,
          yonseiLessonPickerIndex: this.data.yonseiLessonPickerIndex,
          topikLevelPickerIndex: this.data.topikLevelPickerIndex
        });
      }
    });
  },

  applyCategorySelection: function (category, idx) {
    const nextCategory = String(category || '');
    if (!nextCategory) return;

    const nextSettings = sanitizeSettings({ 
      ...this.data.settings, 
      category: nextCategory,
      yonseiLessonId: '', // Reset lesson ID when switching category
      yonseiLessonName: '',
      topikLevel: '1', // Reset TOPIK defaults too
      topikSession: ''
    });
    wx.setStorageSync('settings', nextSettings);
    const counts = this.data.categoryCounts || {};
    const totalWords =
      nextCategory === 'Mistakes (错题本)'
        ? Number(this.data.mistakesCount || 0)
        : Number(counts[nextCategory] || 0);
    this.setData(
      {
        settings: nextSettings,
        currentCategory: nextCategory,
        categoryPickerIndex: typeof idx === 'number' ? idx : this.data.categoryPickerIndex,
        totalWords,
        view: 'filters'
      },
      () => {
        this.refreshMistakesList();
        this.loadSubcategories();
      }
    );
  },

  navigateToTimeLearning() {
    wx.navigateTo({
      url: '/pages/time-learning/index'
    });
  },

  goToHiChat() {
    wx.navigateTo({ url: '/pages/hi-chat/index' });
  },

  selectCategory: function (e) {
    const category = e.currentTarget.dataset.category;
    const nextCategory = String(category || '');
    const idx = Math.max(0, (this.data.categories || []).indexOf(nextCategory));
    this.applyCategorySelection(nextCategory, idx);
  },

  onCategoryPickerChange: function (e) {
    const index = Number(e.detail && e.detail.value);
    const category = (this.data.categories || [])[index];
    if (!category) return;
    this.applyCategorySelection(category, index);
  },

  onTopikLevelPickerChange: async function (e) {
    const index = Number(e.detail && e.detail.value);
    const level = (this.data.topikLevels || [])[index];
    if (!level) return;
    
    const topikLevel = String(level);
    const topikSessions = await getTopikSessions(topikLevel);
    const topikSession = String(topikSessions[0] || '');
    const nextSettings = sanitizeSettings({ ...this.data.settings, topikLevel, topikSession });
    wx.setStorageSync('settings', nextSettings);
    this.setData({ settings: nextSettings, topikLevelPickerIndex: index, topikSessions }, () => {
      this.updateFilteredTotalWords();
    });
  },

  selectTopikSession: function (e) {
    const session = e.currentTarget.dataset.session;
    
    const action = () => {
      const topikSession = String(session || '');
      const nextSettings = sanitizeSettings({ ...this.data.settings, topikSession });
      wx.setStorageSync('settings', nextSettings);
      this.setData({ settings: nextSettings }, () => {
        this.updateFilteredTotalWords();
      });
    };

    const level = this.data.settings.topikLevel || '1';
    const contentId = `topik_${level}_${session}`;
    this.checkAndShowAd(contentId, action);
  },

  onYonseiLessonPickerChange: function (e) {
    const index = Number(e.detail && e.detail.value);
    const lesson = (this.data.yonseiLessons || [])[index];
    if (!lesson) return;

    const performLessonSwitch = () => {
      const yonseiLessonId = String(lesson.id || '');
      const yonseiLessonName = String(lesson.original || lesson.name || '');
      const nextSettings = sanitizeSettings({ ...this.data.settings, yonseiLessonId, yonseiLessonName });
      wx.setStorageSync('settings', nextSettings);
      const display = (this.data.yonseiLessonOptions || [])[index] || '请选择';
      this.setData({ settings: nextSettings, yonseiLessonPickerIndex: index, yonseiLessonDisplay: display }, () => {
        this.updateFilteredTotalWords();
      });
    };

    const category = this.data.currentCategory || 'Yonsei';
    const contentId = `yonsei_${category.replace(/\s+/g, '_')}_${lesson.id}`;
    this.checkAndShowAd(contentId, performLessonSwitch);
  },

  updateSetting: function (eOrKey, value) {
    if (typeof eOrKey === 'string') {
      const key = eOrKey;
      const nextSettings = sanitizeSettings({ ...this.data.settings, [key]: value });
      wx.setStorageSync('settings', nextSettings);
      this.setData({ settings: nextSettings });
      return;
    }

    const e = eOrKey;
    const key = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.key : '';
    if (!key) return;
    const datasetValue = e.currentTarget.dataset.value;
    const v = datasetValue != null ? datasetValue : (e.detail && e.detail.value);
    const nextSettings = sanitizeSettings({ ...this.data.settings, [key]: v });
    wx.setStorageSync('settings', nextSettings);
    this.setData({ settings: nextSettings });
  },

  toggleSetting: function (e) {
    const key = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.key : '';
    if (!key) return;
    const nextValue = e.detail && typeof e.detail.value === 'boolean' ? e.detail.value : !this.data.settings[key];
    const nextSettings = sanitizeSettings({ ...this.data.settings, [key]: nextValue });
    wx.setStorageSync('settings', nextSettings);
    this.setData({ settings: nextSettings });
  },

  goBackToCategories: function () {
    this.setData({ view: 'categories' });
  },

  startMistakesPractice: function () {
    const nextSettings = sanitizeSettings({
      ...this.data.settings,
      category: 'Mistakes (错题本)'
    });
    wx.setStorageSync('settings', nextSettings);
    this.setData({ settings: nextSettings, currentCategory: 'Mistakes (错题本)' }, () => {
      wx.switchTab({ url: '/pages/nv-practice/index' });
    });
  },

  removeMistake: function (e) {
    const dataset = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : {};
    const id = dataset.id || dataset.word;
    const res = removeMistake(id);
    if (!res.success) {
      wx.showToast({ title: '移除失败', icon: 'none' });
      return;
    }
    const target = String(id || '');
    const nextList = (Array.isArray(this.data.mistakesList) ? this.data.mistakesList : []).filter((w) => {
      if (!w) return true;
      const itemId = w.id != null ? String(w.id) : '';
      const itemWord = w.word != null ? String(w.word).trim() : '';
      return !((itemId && itemId === target) || (itemWord && itemWord === target));
    });
    const counts = { ...(this.data.categoryCounts || {}) };
    counts['Mistakes (错题本)'] = nextList.length;
    this.setData({
      mistakesList: nextList,
      mistakesCount: nextList.length,
      totalWords: this.data.currentCategory === 'Mistakes (错题本)' ? nextList.length : this.data.totalWords,
      categoryCounts: counts
    });
    wx.showToast({ title: '已移除', icon: 'success' });
  },

  removePhotoRecognitionWord: function (e) {
    const id = e.currentTarget.dataset.id;
    const result = removeStoredPhotoRecognitionWord(id);
    if (!result.success) {
      wx.showToast({ title: result.message || '删除失败', icon: 'none' });
      return;
    }

    const words = getPhotoRecognitionWords();
    const counts = { ...(this.data.categoryCounts || {}) };
    counts[PHOTO_RECOGNITION_CATEGORY] = words.length;

    const settings = this.data.settings || DEFAULT_SETTINGS;
    const shouldResetCategory = words.length === 0 && (settings.category || '') === PHOTO_RECOGNITION_CATEGORY;
    const nextSettings = shouldResetCategory
      ? sanitizeSettings({ ...settings, category: DEFAULT_SETTINGS.category })
      : sanitizeSettings(settings);
    if (shouldResetCategory) {
      wx.setStorageSync('settings', nextSettings);
      delete counts[PHOTO_RECOGNITION_CATEGORY];
    }

    const categories = words.length === 0
      ? (this.data.categories || []).filter((item) => item !== PHOTO_RECOGNITION_CATEGORY)
      : this.data.categories;

    this.setData({
      photoRecognitionWords: words,
      photoRecognitionCount: words.length,
      totalWords: shouldResetCategory ? 0 : words.length,
      settings: nextSettings,
      currentCategory: shouldResetCategory ? DEFAULT_SETTINGS.category : this.data.currentCategory,
      categories,
      categoryCounts: counts,
      view: shouldResetCategory ? 'categories' : this.data.view
    }, () => {
      if (shouldResetCategory) this.loadCategories();
    });
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  clearPhotoRecognitionWords: function () {
    const count = getPhotoRecognitionWords().length;
    if (!count) {
      wx.showToast({ title: '暂无可清空内容', icon: 'none' });
      return;
    }

    this.setData({ showPhotoClearConfirm: true });
  },

  closePhotoClearConfirm: function () {
    this.setData({ showPhotoClearConfirm: false });
  },

  confirmClearPhotoRecognitionWords: function () {
    const result = clearStoredPhotoRecognitionWords();
    if (!result.success) {
      this.closePhotoClearConfirm();
      wx.showToast({ title: result.message || '清空失败', icon: 'none' });
      return;
    }

    const settings = this.data.settings || DEFAULT_SETTINGS;
    const shouldResetCategory = (settings.category || '') === PHOTO_RECOGNITION_CATEGORY;
    const nextSettings = shouldResetCategory
      ? sanitizeSettings({ ...settings, category: DEFAULT_SETTINGS.category })
      : sanitizeSettings(settings);
    if (shouldResetCategory) {
      wx.setStorageSync('settings', nextSettings);
    }

    const categories = (this.data.categories || []).filter((item) => item !== PHOTO_RECOGNITION_CATEGORY);
    const counts = { ...(this.data.categoryCounts || {}) };
    delete counts[PHOTO_RECOGNITION_CATEGORY];
    const nextCurrentCategory = shouldResetCategory ? DEFAULT_SETTINGS.category : this.data.currentCategory;

    this.setData({
      showPhotoClearConfirm: false,
      settings: nextSettings,
      currentCategory: nextCurrentCategory,
      categories,
      categoryCounts: counts,
      photoRecognitionCount: 0,
      photoRecognitionWords: [],
      totalWords: shouldResetCategory ? 0 : this.data.totalWords,
      view: shouldResetCategory ? 'categories' : this.data.view
    }, () => {
      this.loadCategories();
      if (shouldResetCategory) this.loadSettings();
    });
    wx.showToast({ title: '已清空', icon: 'success' });
  },

  removePictureWordsPracticeWord: function (e) {
    const id = e.currentTarget.dataset.id;
    const result = removeStoredPictureWordsPracticeWord(id);
    if (!result.success) {
      wx.showToast({ title: result.message || '删除失败', icon: 'none' });
      return;
    }

    const words = getPictureWordsPracticeWords();
    const counts = { ...(this.data.categoryCounts || {}) };
    counts[PICTURE_WORDS_PRACTICE_CATEGORY] = words.length;

    const settings = this.data.settings || DEFAULT_SETTINGS;
    const shouldResetCategory = words.length === 0 && (settings.category || '') === PICTURE_WORDS_PRACTICE_CATEGORY;
    const nextSettings = shouldResetCategory
      ? sanitizeSettings({ ...settings, category: DEFAULT_SETTINGS.category })
      : sanitizeSettings(settings);
    if (shouldResetCategory) {
      wx.setStorageSync('settings', nextSettings);
      delete counts[PICTURE_WORDS_PRACTICE_CATEGORY];
    }

    const categories = words.length === 0
      ? (this.data.categories || []).filter((item) => item !== PICTURE_WORDS_PRACTICE_CATEGORY)
      : this.data.categories;

    this.setData({
      pictureWordsPracticeWords: words,
      pictureWordsPracticeCount: words.length,
      totalWords: shouldResetCategory ? 0 : words.length,
      settings: nextSettings,
      currentCategory: shouldResetCategory ? DEFAULT_SETTINGS.category : this.data.currentCategory,
      categories,
      categoryCounts: counts,
      view: shouldResetCategory ? 'categories' : this.data.view
    }, () => {
      if (shouldResetCategory) this.loadCategories();
    });
    wx.showToast({ title: '已删除', icon: 'success' });
  },

  clearPictureWordsPracticeWords: function () {
    const count = getPictureWordsPracticeWords().length;
    if (!count) {
      wx.showToast({ title: '暂无可清空内容', icon: 'none' });
      return;
    }

    this.setData({ showPictureWordsClearConfirm: true });
  },

  closePictureWordsClearConfirm: function () {
    this.setData({ showPictureWordsClearConfirm: false });
  },

  confirmClearPictureWordsPracticeWords: function () {
    const result = clearStoredPictureWordsPracticeWords();
    if (!result.success) {
      this.closePictureWordsClearConfirm();
      wx.showToast({ title: result.message || '清空失败', icon: 'none' });
      return;
    }

    const settings = this.data.settings || DEFAULT_SETTINGS;
    const shouldResetCategory = (settings.category || '') === PICTURE_WORDS_PRACTICE_CATEGORY;
    const nextSettings = shouldResetCategory
      ? sanitizeSettings({ ...settings, category: DEFAULT_SETTINGS.category })
      : sanitizeSettings(settings);
    if (shouldResetCategory) {
      wx.setStorageSync('settings', nextSettings);
    }

    const categories = (this.data.categories || []).filter((item) => item !== PICTURE_WORDS_PRACTICE_CATEGORY);
    const counts = { ...(this.data.categoryCounts || {}) };
    delete counts[PICTURE_WORDS_PRACTICE_CATEGORY];
    const nextCurrentCategory = shouldResetCategory ? DEFAULT_SETTINGS.category : this.data.currentCategory;

    this.setData({
      showPictureWordsClearConfirm: false,
      settings: nextSettings,
      currentCategory: nextCurrentCategory,
      categories,
      categoryCounts: counts,
      pictureWordsPracticeCount: 0,
      pictureWordsPracticeWords: [],
      totalWords: shouldResetCategory ? 0 : this.data.totalWords,
      view: shouldResetCategory ? 'categories' : this.data.view
    }, () => {
      this.loadCategories();
      if (shouldResetCategory) this.loadSettings();
    });
    wx.showToast({ title: '已清空', icon: 'success' });
  },

  exportMistakes: function () {
    const list = Array.isArray(this.data.mistakesList) ? this.data.mistakesList : [];
    const text = list.map(w => `${w.word || ''}${w.meaning ? ' ' + w.meaning : ''}`.trim()).filter(Boolean).join('\n');
    if (!text) {
      wx.showToast({ title: '暂无可导出内容', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
    });
  },

  onImportWords: function () {
    this.loadLists();
    this.setData({ view: 'importList', contentCursor: -1, contentFocus: false });
  },

  onContactSupport: function () {
    const now = Date.now();
    const lastClickTime = this.lastClickTime || 0;
    this.lastClickTime = now;

    if (now - lastClickTime > 5000) {
      this.clickCount = 1;
      this.firstClickTime = now;
    } else {
      this.clickCount = (this.clickCount || 0) + 1;
    }

    if (this.clickCount >= 10 && (now - (this.firstClickTime || now) <= 5000)) {
       const currentUnlock = wx.getStorageSync('story_create_unlock_counter') || 0;
       if (currentUnlock >= 10) {
           wx.setStorageSync('story_create_unlock_counter', 0);
           wx.setStorageSync('dev_mode_enabled', false);
           wx.showToast({ title: '已关闭免广告模式', icon: 'none' });
       } else {
           wx.setStorageSync('story_create_unlock_counter', 100);
           wx.setStorageSync('dev_mode_enabled', true);
           wx.showToast({ title: '🧪 开发者模式已开启', icon: 'none' });
       }
       this.clickCount = 0;
       return; // 不触发复制，避免 toast 被覆盖
    }

    wx.setClipboardData({
      data: 'gaoyuhao1',
      success: () => wx.showToast({ title: '微信号已复制', icon: 'success' })
    });
  },

  loadLists: function () {
    const lists = getImportedLists();
    const next = (Array.isArray(lists) ? lists : [])
      .map(l => ({
        ...l,
        isFavorites: l && l.name === FAVORITES_LIST_NAME,
        formattedDate: formatDate(l.updatedAt || l.createdAt)
      }))
      // 收藏词单没数据不显示
      .filter(l => !(l.isFavorites && (!Array.isArray(l.words) || l.words.length === 0)));
    // 「单词收藏」置顶
    next.sort((a, b) => (b.isFavorites ? 1 : 0) - (a.isFavorites ? 1 : 0));
    this.setData({ lists: next });
  },

  goBackToImportList: function () {
    this.loadLists();
    this.setData({ view: 'importList', editingId: null, name: '', content: '' });
  },

  createNewList: function () {
    this.setData({ view: 'importForm', editingId: null, name: '', content: '', contentCursor: -1, contentFocus: true });
  },

  editList: function (e) {
    const id = e.currentTarget.dataset.id;
    const list = (Array.isArray(this.data.lists) ? this.data.lists : []).find(l => String(l.id) === String(id));
    if (!list) return;
    const content = (Array.isArray(list.words) ? list.words : []).map(w => `${w.word || ''}${w.meaning ? ' ' + w.meaning : ''}`.trim()).filter(Boolean).join('\n');
    this.setData({ view: 'importForm', editingId: list.id, name: list.name || '', content, contentCursor: -1, contentFocus: true });
  },

  deleteList: function (e) {
    const id = e.currentTarget.dataset.id;
    const list = (Array.isArray(this.data.lists) ? this.data.lists : []).find(l => String(l.id) === String(id));
    this.setData({
      showDeleteListConfirm: true,
      pendingDeleteListId: id != null ? String(id) : '',
      pendingDeleteListName: list && list.name ? String(list.name) : '这个词单'
    });
  },

  closeDeleteListConfirm: function () {
    this.setData({
      showDeleteListConfirm: false,
      pendingDeleteListId: '',
      pendingDeleteListName: ''
    });
  },

  confirmDeleteList: function () {
    const id = this.data.pendingDeleteListId;
    if (!id) {
      this.closeDeleteListConfirm();
      return;
    }

    const result = deleteImportedList(id);
    if (result && result.success) {
      this.closeDeleteListConfirm();
      this.loadLists();
      wx.showToast({ title: '已删除', icon: 'success' });
    } else {
      this.closeDeleteListConfirm();
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  exportList: function (e) {
    const id = e.currentTarget.dataset.id;
    const list = (Array.isArray(this.data.lists) ? this.data.lists : []).find(l => String(l.id) === String(id));
    if (!list) return;
    const text = (Array.isArray(list.words) ? list.words : []).map(w => `${w.word || ''}${w.meaning ? ' ' + w.meaning : ''}`.trim()).filter(Boolean).join('\n');
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: '已复制到剪贴板', icon: 'success' })
    });
  },

  onNameInput: function (e) {
    const value = e.detail && e.detail.value != null ? String(e.detail.value) : '';
    this.setData({ name: value });
  },

  onContentInput: function (e) {
    const value = e.detail && e.detail.value != null ? String(e.detail.value) : '';
    this.setData({ content: value });
  },

  saveList: function () {
    const name = String(this.data.name || '').trim();
    const words = parseImportedWords(this.data.content);
    if (!name) {
      wx.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }
    if (words.length === 0) {
      wx.showToast({ title: '请输入单词内容', icon: 'none' });
      return;
    }

    const id = this.data.editingId;
    const result = id ? updateImportedList(id, name, words) : saveImportedList(name, words);
    if (result && result.success) {
      this.loadLists();
      this.setData({ view: 'importList', editingId: null, name: '', content: '', contentCursor: -1, contentFocus: false });
      wx.showToast({ title: '已保存', icon: 'success' });
    } else {
      wx.showToast({ title: (result && result.message) || '保存失败', icon: 'none' });
    }
  },

  onSmartImport: function () {
    this.setData({ view: 'smartImport', content: '', suggestion: null, contentCursor: -1, contentFocus: true });
  },

  startSmartRecognition: async function () {
    wx.showToast({ title: '暂不支持自动导入', icon: 'none' });
  },

  // 扫码导入：仅支持「韩文 中文」每行一对的格式，扫到的内容直接合并进「单词收藏」
  onCameraClick: function () {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: (res) => {
        const raw = String((res && res.result) || '');
        const words = parseStrictKrCnQrText(raw);
        if (words.length === 0) {
          wx.showToast({
            title: '请使用语境官网生成的单词二维码',
            icon: 'none',
            duration: 2000
          });
          return;
        }
        const result = addFavorites(words);
        if (!result || !result.success) {
          wx.showToast({ title: (result && result.message) || '导入失败', icon: 'none' });
          return;
        }
        const tip = result.added > 0
          ? `已导入 ${result.added} 个新单词`
          : '单词已在收藏中';
        wx.showToast({ title: `${tip}（共 ${result.total} 个）`, icon: 'none', duration: 2000 });
        if (this.data.view === 'importList') this.loadLists();
      },
      fail: () => { /* 用户取消扫码，静默 */ }
    });
  },

  preventBubble: function () {}
});
