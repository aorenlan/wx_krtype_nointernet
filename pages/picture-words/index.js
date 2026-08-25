import { addPictureWordsPracticeWords, PICTURE_WORDS_PRACTICE_CATEGORY } from '../../utils_nv/storage';

const {
  loadPictureWordPack,
  getSavedPictureWordGroupId,
  savePictureWordGroupId
} = require('./content');
const { sha256 } = require('../../utils/sha256');
const { drawLearningShareCard, safeText } = require('../../utils/share-card');
const { syncPageTabBar } = require('../../utils/tabbar');
const { getAdFreeExpire, setAdFreeExpire, shouldSkipAd } = require('../../utils/ad-free');

// 朗读脚本：韩文跟读 3 遍 + 英文 1 遍
// type 用于界面提示文案；lang 决定 edgeTts 语音
const READ_PLAN = [
  { type: 'ko', label: '跟读', index: 1, total: 3, lang: 'ko-KR' },
  { type: 'ko', label: '跟读', index: 2, total: 3, lang: 'ko-KR' },
  { type: 'ko', label: '跟读', index: 3, total: 3, lang: 'ko-KR' },
  { type: 'en', label: '英文', index: 1, total: 1, lang: 'en-US' }
];

const COUNTDOWN_START = 3;
const AUDIO_CACHE_DIR = `${wx.env.USER_DATA_PATH}/picword_audio`;
const AUDIO_CACHE_VERSION = 'v2';
const QUESTION_KO = '이게 뭐예요?'; // 倒计时时朗读的提问句
const READ_STEP_GAP_MS = 60;
const AUTO_NEXT_DELAY_MS = 900;
const AUTO_CHAIN_START_DELAY_MS = 80;
const IMAGE_PREFETCH_AHEAD = 2;
const ANSWER_PANEL_HIDDEN = 'answer-panel is-hidden';
const ANSWER_PANEL_VISIBLE = 'answer-panel is-visible';
const CATEGORY_AD_UNIT_ID = 'adunit-17974771ea617fa3';
const CATEGORY_AD_DATE_KEY = 'picture_words_category_ad_date_v1';
const CATEGORY_AD_FAILURE_COMPENSATION_KEY = 'picture_words_ad_failure_compensation_v1';
const CATEGORY_AD_SHOW_TIMEOUT_MS = 12000;
const STUDY_SESSION_STORAGE_KEY = 'picture_words_study_sessions_v1';
const SHUFFLE_STORAGE_KEY = 'picture_words_shuffle_enabled_v1';
const TAP_SCENE_AUTO_OPEN_KEY = 'kr_picture_words_open_tap_scene_v1';
const STUDY_SESSION_SCHEMA = 1;
const MAX_STUDY_SESSIONS = 80;

let videoAd = null;

// 音效：倒计时滴答 / 卡片弹出 / 揭晓提示
const SFX = {
  tick: '/assets/sfx/recall-tick.mp3',
  pop: '/assets/sfx/recall-pop.mp3',
  chime: '/assets/sfx/recall-chime.mp3'
};

Page({
  data: {
    statusBarHeight: 20,
    navTotalHeight: 64,
    groups: [],
    groupOptions: [],
    categoryList: [],
    categoryPanelVisible: false,
    categorySearchText: '',
    wordJumpPanelVisible: false,
    wordJumpList: [],
    showCategoryAdConfirm: false,
    categoryAdLoading: false,
    showResumeChoice: false,
    resumeChoiceTitle: '',
    resumeChoiceCopy: '',
    resumeChoiceMeta: '',
    showPicturePracticeConfirm: false,
    picturePracticeConfirmTitle: '',
    picturePracticeConfirmCount: 0,
    groupPickerIndex: 0,
    hasCategorySwitch: false,
    showCategoryPicker: false,
    currentGroup: null,
    currentGroupId: '',
    groupTitle: '看图想韩语',
    contentLoading: true,
    catalogCacheKey: '',
    contentVersion: '',
    baseWords: [],
    words: [],
    current: 0,
    total: 0,
    shuffleEnabled: false,
    // phase: 'asking' 看图猜词 | 'countdown' 倒计时 | 'reveal' 揭晓+跟读
    phase: 'asking',
    countdown: COUNTDOWN_START,
    countdownPercent: 100,
    word: null,
    // 当前朗读步骤提示，如 跟读 1/3
    readLabel: '',
    readIndex: 0,
    readTotal: 0,
    readType: '',
    koReadIndex: 0,
    readDone: false,
    groupDone: false,
    readTipText: '看图想韩语',
    showRetryButton: false,
    retryStepIndex: 0,
    cardKoreanText: '?',
    cardKoreanClass: '',
    cardMetaText: '이게 뭐예요?',
    cardMetaClass: '',
    cardEnglishText: '',
    cardEnglishClass: '',
    questionText: QUESTION_KO,
    answerPanelClass: ANSWER_PANEL_HIDDEN,
    showNextButton: false,
    nextButtonText: '下一个 ›',
    showAskBadge: true,
    showCountBadge: false,
    showAskBubble: true,
    autoMode: true,        // true=一键自动播放 false=手动输入
    autoPaused: false,
    autoContinuePending: false,
    inputValue: '',
    inputError: false,
    shareImagePath: '',
    popTick: 0,            // 自增触发卡片弹入动画（配合 pop 音效）
    dbg: '就绪'            // 调试信息，定位流程卡在哪
  },

  onLoad(options) {
    this._initialShareOptions = options || {};
    let statusBarHeight = 20;
    let navTotalHeight = 64;
    try {
      const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      statusBarHeight = sys.statusBarHeight || 20;
      const mb = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      if (mb && mb.bottom) {
        navTotalHeight = mb.bottom + (mb.top - statusBarHeight); // 胶囊底部 + 上间距，确保内容在胶囊下方
      } else {
        navTotalHeight = statusBarHeight + 44;
      }
    } catch (e) {}
    this._seqToken = 0;
    this._contentToken = 0;
    this._audioCache = {};
    this._ttsInflight = {};
    this._imagePrefetchCache = {};
    const shuffleEnabled = this._readShuffleEnabled();
    this.setData({
      statusBarHeight,
      navTotalHeight,
      shuffleEnabled
    });
    this._ensureCacheDir();
    // 即使手机静音也出声（iOS 静音键常导致“没声音”）
    try { wx.setInnerAudioOption({ obeyMuteSwitch: false, mixWithOther: true }); } catch (e) {}
    this._initSfx();
    this._initCategoryAd();
    this._prefetchTts(QUESTION_KO, 'ko-KR');
    this._loadInitialPack();
  },

  onShow() {
    this._syncTabBarVisibility();
    this._consumeTapSceneAutoOpen();
  },

  onUnload() {
    this._setTabBarHidden(false);
    this._seqToken = (this._seqToken || 0) + 1;
    if (this._shareImageTimer) {
      clearTimeout(this._shareImageTimer);
      this._shareImageTimer = null;
    }
    this._clearTimers();
    this._stopAudio();
    this._destroySfx();
  },

  onHide() {
    this._setTabBarHidden(false);
    this._pauseForTabSwitch();
  },

  _pauseForTabSwitch() {
    const shouldPausePlayback = !this.data.groupDone && (
      this.data.phase === 'countdown' ||
      this.data.autoContinuePending ||
      (this.data.phase === 'reveal' && (this.data.autoMode || !this.data.readDone))
    );

    this._seqToken = (this._seqToken || 0) + 1;
    this._clearTimers();
    this._stopAudio();

    if (shouldPausePlayback) {
      this._setPausedAskingState('切换页面，已暂停');
      return;
    }

    if (this.data.categoryPanelVisible) {
      this.setData({
        categoryPanelVisible: false,
        categorySearchText: ''
      });
    }
    this._saveStudySession();
  },

  // ---------- 音效 ----------
  // 为每种音效预建独立 InnerAudioContext，避免与朗读互相打断
  _initSfx() {
    this._sfx = {};
    Object.keys(SFX).forEach((k) => {
      const ctx = wx.createInnerAudioContext();
      ctx.src = SFX[k];
      this._sfx[k] = ctx;
    });
  },

  _playSfx(name) {
    const ctx = this._sfx && this._sfx[name];
    if (!ctx) return;
    try { ctx.stop(); } catch (e) {}
    try { ctx.seek(0); } catch (e) {}
    try { ctx.play(); } catch (e) {}
  },

  _destroySfx() {
    if (!this._sfx) return;
    Object.keys(this._sfx).forEach((k) => {
      try { this._sfx[k].destroy(); } catch (e) {}
    });
    this._sfx = null;
  },

  _setTabBarHidden(hidden) {
    syncPageTabBar(this, { selected: 1, hidden: Boolean(hidden) });
  },

  _shouldHideTabBar() {
    if (this.data.showCategoryAdConfirm || this.data.showResumeChoice) return true;
    if (this.data.categoryPanelVisible) return true;
    if (this.data.groupDone || this.data.autoPaused) return false;
    if (this.data.autoContinuePending) return true;
    return this.data.phase === 'countdown' || (this.data.phase === 'reveal' && this.data.autoMode);
  },

  _syncTabBarVisibility() {
    this._setTabBarHidden(this._shouldHideTabBar());
  },

  openTapScene() {
    wx.navigateTo({ url: '/pages/tap-scene/index' });
  },

  _consumeTapSceneAutoOpen() {
    if (this._tapSceneAutoOpening) return;
    let marker = '';
    try { marker = wx.getStorageSync(TAP_SCENE_AUTO_OPEN_KEY); } catch (e) {}
    if (!marker) return;
    try { wx.removeStorageSync(TAP_SCENE_AUTO_OPEN_KEY); } catch (e) {}
    this._tapSceneAutoOpening = true;
    setTimeout(() => {
      this._tapSceneAutoOpening = false;
      if (this.data.categoryPanelVisible || this.data.showCategoryAdConfirm || this.data.showResumeChoice) {
        this.setData({
          categoryPanelVisible: false,
          showCategoryAdConfirm: false,
          showResumeChoice: false,
          categorySearchText: ''
        });
      }
      this.openTapScene();
    }, 260);
  },

  _getPictureShareMeta() {
    const word = this.data.word || {};
    const korean = safeText(word.korean || word.word, '看图想韩语');
    const cn = safeText(word.cn || word.chinese || word.meaning);
    const en = safeText(word.en || word.english);
    const groupTitle = safeText(this.data.groupTitle, '图片词卡');
    const subtitles = [cn, en].filter(Boolean);
    return {
      korean,
      cn,
      en,
      groupTitle,
      image: safeText(word.image),
      subtitles,
      key: [this.data.currentGroupId, word.id, korean, cn, en, word.image].join('|')
    };
  },

  _scheduleShareImage() {
    if (this._shareImageTimer) {
      clearTimeout(this._shareImageTimer);
      this._shareImageTimer = null;
    }
    if (!this.data.word) return;
    this._shareImageTimer = setTimeout(() => {
      this._shareImageTimer = null;
      this._drawShareImage();
    }, 160);
  },

  async _drawShareImage() {
    const meta = this._getPictureShareMeta();
    if (!meta.korean || !this.data.word) return;
    if (this._shareImageKey === meta.key && this.data.shareImagePath) return;
    this._shareImageKey = meta.key;
    try {
      const imagePath = await drawLearningShareCard(this, {
        selector: '#pictureShareCanvas',
        background: meta.image,
        brand: '看图想韩语',
        kicker: meta.groupTitle,
        title: meta.korean,
        subtitles: meta.subtitles,
        footer: '韩语打字练习',
        accentColor: '#e9a936'
      });
      if (this._shareImageKey === meta.key && imagePath) {
        this.setData({ shareImagePath: imagePath });
      }
    } catch (error) {
      console.warn('[picture-words] draw share image failed', error);
    }
  },

  onShareAppMessage() {
    const meta = this._getPictureShareMeta();
    const titleSuffix = meta.subtitles.length ? ` · ${meta.subtitles[0]}` : '';
    const groupId = safeText(this.data.currentGroupId);
    const wordId = safeText(this.data.word && this.data.word.id);
    const params = [];
    if (groupId) params.push(`groupId=${encodeURIComponent(groupId)}`);
    if (wordId) params.push(`wordId=${encodeURIComponent(wordId)}`);
    const path = params.length
      ? `/pages/picture-words/index?${params.join('&')}`
      : '/pages/picture-words/index';
    return {
      title: `${meta.korean}${titleSuffix}`,
      path,
      imageUrl: this.data.shareImagePath || meta.image || ''
    };
  },

  onShareTimeline() {
    const meta = this._getPictureShareMeta();
    return {
      title: `看图想韩语：${meta.korean}`,
      imageUrl: this.data.shareImagePath || meta.image || ''
    };
  },

  // ---------- 分类切换广告 ----------
  _initCategoryAd() {
    if (shouldSkipAd('picture-words')) return;
    if (!wx.createRewardedVideoAd || videoAd) return;
    videoAd = wx.createRewardedVideoAd({
      adUnitId: CATEGORY_AD_UNIT_ID
    });
    videoAd.onLoad(() => {});
    videoAd.onError((err) => {
      console.error('激励视频广告加载失败', err);
    });
  },

  _getTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  _hasShownCategoryAdToday() {
    if (shouldSkipAd('picture-words')) return true;
    try {
      return wx.getStorageSync(CATEGORY_AD_DATE_KEY) === this._getTodayKey();
    } catch (e) {
      return false;
    }
  },

  _markCategoryAdShownToday() {
    try {
      wx.setStorageSync(CATEGORY_AD_DATE_KEY, this._getTodayKey());
    } catch (e) {}
  },

  _getTodayEndTimestamp() {
    const now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23, 59, 59, 999
    ).getTime();
  },

  _grantCategoryAdFailureCompensation(reason, error) {
    const expireAt = this._getTodayEndTimestamp();
    const currentExpire = Number(getAdFreeExpire()) || 0;
    // Always use today's natural-day boundary. Repeated failures today never
    // add another 24 hours or extend an existing longer entitlement.
    if (currentExpire < expireAt) {
      setAdFreeExpire(expireAt);
    }
    this._markCategoryAdShownToday();
    try {
      wx.setStorageSync(CATEGORY_AD_FAILURE_COMPENSATION_KEY, {
        dayKey: this._getTodayKey(),
        expireAt,
        reason: String(reason || 'rewarded_ad_failed'),
        errCode: error && error.errCode != null ? error.errCode : '',
        errMsg: error && error.errMsg ? String(error.errMsg) : '',
        createdAt: Date.now()
      });
    } catch (e) {}
    console.warn('[picture-words] rewarded ad failure compensated', {
      reason,
      expireAt,
      error
    });
    return expireAt;
  },

  _showCategoryAdOnceToday() {
    if (shouldSkipAd('picture-words')) return Promise.resolve(true);
    if (this._hasShownCategoryAdToday()) return Promise.resolve(true);

    if (this._categoryAdPromise) return this._categoryAdPromise;

    this._categoryAdPromise = new Promise((resolve) => {
      this._categoryAdResolve = (ok) => {
        this._categoryAdResolve = null;
        this._categoryAdPromise = null;
        resolve(Boolean(ok));
      };
      this.setData({
        showCategoryAdConfirm: true,
        categoryAdLoading: false
      }, () => {
        this._setTabBarHidden(true);
      });
    });

    return this._categoryAdPromise;
  },

  _finishCategoryAdConfirm(ok) {
    const resolve = this._categoryAdResolve;
    this._categoryAdResolve = null;
    this._categoryAdPromise = null;
    if (resolve) resolve(Boolean(ok));
  },

  cancelCategoryAdConfirm() {
    if (this.data.categoryAdLoading) return;
    this.setData({
      showCategoryAdConfirm: false,
      categoryAdLoading: false
    }, () => {
      this._syncTabBarVisibility();
    });
    this._finishCategoryAdConfirm(false);
  },

  confirmCategoryAdConfirm() {
    if (this.data.categoryAdLoading) return;
    this.setData({ categoryAdLoading: true });
    this._playCategoryRewardAd().then((ok) => {
      this.setData({
        showCategoryAdConfirm: false,
        categoryAdLoading: false
      }, () => {
        this._syncTabBarVisibility();
      });
      this._finishCategoryAdConfirm(ok);
    });
  },

  _playCategoryRewardAd() {
    if (shouldSkipAd('picture-words')) {
      return Promise.resolve(true);
    }

    if (!videoAd) this._initCategoryAd();

    if (!videoAd) {
      this._grantCategoryAdFailureCompensation('api_unavailable');
      wx.showToast({ title: '广告未调起，今日已免广告', icon: 'none', duration: 1800 });
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const adInstance = videoAd;
      let settled = false;
      let showTimer = null;
      const finish = (ok, toastText, options = {}) => {
        if (settled) return;
        settled = true;
        if (showTimer) {
          clearTimeout(showTimer);
          showTimer = null;
        }
        if (options.compensate) {
          this._grantCategoryAdFailureCompensation(options.reason, options.error);
        }
        if (ok) {
          if (!options.compensate) this._markCategoryAdShownToday();
          wx.showToast({
            title: options.compensate ? '广告未调起，今日已免广告' : '今日已解锁',
            icon: 'none',
            duration: options.compensate ? 1800 : 1000
          });
        } else if (toastText) {
          wx.showToast({ title: toastText, icon: 'none', duration: 1400 });
        }
        if (adInstance.offClose) {
          try { adInstance.offClose(onClose); } catch (e) {}
        }
        if (adInstance.offError) {
          try { adInstance.offError(onRequestError); } catch (e) {}
        }
        resolve(Boolean(ok));
      };
      const onClose = (res) => {
        const completed = !res || res.isEnded;
        finish(completed, completed ? '' : '看完广告后才能切换');
      };
      const onRequestError = (err) => {
        console.error('激励视频广告运行失败', err);
        videoAd = null;
        finish(true, '', {
          compensate: true,
          reason: 'ad_runtime_error',
          error: err
        });
      };

      adInstance.onClose(onClose);
      if (adInstance.onError) adInstance.onError(onRequestError);
      showTimer = setTimeout(() => {
        finish(true, '', {
          compensate: true,
          reason: 'show_timeout'
        });
      }, CATEGORY_AD_SHOW_TIMEOUT_MS);
      adInstance.show().catch(() => {
        return adInstance.load().then(() => adInstance.show());
      }).then(() => {
        if (showTimer) {
          clearTimeout(showTimer);
          showTimer = null;
        }
      }).catch((err) => {
        console.error('激励视频广告显示失败', err);
        videoAd = null;
        finish(true, '', {
          compensate: true,
          reason: 'load_or_show_failed',
          error: err
        });
      });
    });
  },

  // ---------- 工具 ----------
  _ensureCacheDir() {
    const fs = wx.getFileSystemManager();
    try { fs.accessSync(AUDIO_CACHE_DIR); } catch (e) {
      try { fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true }); } catch (e2) {}
    }
  },

  _clearTimers() {
    if (this._countdownTimer) { clearInterval(this._countdownTimer); this._countdownTimer = null; }
    if (this._stepTimer) { clearTimeout(this._stepTimer); this._stepTimer = null; }
    if (this._autoNextTimer) { clearTimeout(this._autoNextTimer); this._autoNextTimer = null; }
  },

  _stopAudio(channel) {
    const stopOne = (prop) => {
      if (this[prop]) {
        try { this[prop].stop(); this[prop].destroy(); } catch (e) {}
        this[prop] = null;
      }
    };
    if (!channel || channel === 'read') {
      stopOne('_audioCtx');
    }
    if (!channel || channel === 'question') {
      stopOne('_questionAudioCtx');
    }
  },

  _readShuffleEnabled() {
    try {
      return wx.getStorageSync(SHUFFLE_STORAGE_KEY) === true;
    } catch (e) {
      return false;
    }
  },

  _writeShuffleEnabled(enabled) {
    try {
      wx.setStorageSync(SHUFFLE_STORAGE_KEY, Boolean(enabled));
    } catch (e) {}
  },

  _readStudySessions() {
    try {
      const value = wx.getStorageSync(STUDY_SESSION_STORAGE_KEY);
      return value && typeof value === 'object' ? value : {};
    } catch (e) {
      return {};
    }
  },

  _writeStudySessions(sessions) {
    try {
      wx.setStorageSync(STUDY_SESSION_STORAGE_KEY, sessions || {});
    } catch (e) {}
  },

  _getSessionKey(catalogCacheKey, groupId) {
    const catalogKey = String(catalogCacheKey || 'local');
    return `${catalogKey}::${String(groupId || '')}`;
  },

  _getCurrentSessionKey() {
    return this._getSessionKey(this.data.catalogCacheKey, this.data.currentGroupId);
  },

  _getStoredSession(catalogCacheKey, groupId) {
    const key = this._getSessionKey(catalogCacheKey, groupId);
    const sessions = this._readStudySessions();
    const session = sessions[key];
    if (!session || session.schemaVersion !== STUDY_SESSION_SCHEMA) return null;
    if (session.groupId !== groupId) return null;
    return session;
  },

  _isResumableSession(session, total) {
    const count = Number(total || session && session.total || 0);
    const index = Number(session && session.currentIndex);
    return !!(
      session &&
      !session.done &&
      Array.isArray(session.orderIds) &&
      session.orderIds.length > 0 &&
      index > 0 &&
      index < count
    );
  },

  _getResumableSession(groupId, total) {
    const session = this._getStoredSession(this.data.catalogCacheKey, groupId);
    return this._isResumableSession(session, total) ? session : null;
  },

  _saveStudySession(extra) {
    const groupId = this.data.currentGroupId;
    const catalogCacheKey = this.data.catalogCacheKey;
    const words = Array.isArray(this.data.words) ? this.data.words : [];
    if (!groupId || !catalogCacheKey || !words.length) return;

    const sessions = this._readStudySessions();
    const key = this._getCurrentSessionKey();
    sessions[key] = {
      schemaVersion: STUDY_SESSION_SCHEMA,
      groupId,
      groupName: this.data.groupTitle || groupId,
      catalogCacheKey,
      contentVersion: this.data.contentVersion || '',
      currentIndex: Math.max(0, Number(this.data.current) || 0),
      total: words.length,
      orderIds: words.map((word) => String(word && word.id || '')).filter(Boolean),
      shuffleEnabled: Boolean(this.data.shuffleEnabled),
      done: Boolean(this.data.groupDone),
      updatedAt: Date.now ? Date.now() : new Date().getTime(),
      ...(extra || {})
    };

    const keys = Object.keys(sessions);
    if (keys.length > MAX_STUDY_SESSIONS) {
      keys
        .sort((a, b) => Number(sessions[a] && sessions[a].updatedAt || 0) - Number(sessions[b] && sessions[b].updatedAt || 0))
        .slice(0, keys.length - MAX_STUDY_SESSIONS)
        .forEach((oldKey) => { delete sessions[oldKey]; });
    }
    this._writeStudySessions(sessions);
  },

  _shuffleWords(words) {
    const list = (Array.isArray(words) ? words : []).slice();
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = list[i];
      list[i] = list[j];
      list[j] = temp;
    }
    return list;
  },

  _buildOrderedWords(rawWords, session, shuffleEnabled) {
    const list = (Array.isArray(rawWords) ? rawWords : []).slice();
    if (!list.length) return [];
    if (session && Array.isArray(session.orderIds) && session.orderIds.length) {
      const byId = {};
      list.forEach((word) => { if (word && word.id) byId[String(word.id)] = word; });
      const used = {};
      const ordered = [];
      session.orderIds.forEach((id) => {
        const key = String(id || '');
        if (key && byId[key] && !used[key]) {
          used[key] = true;
          ordered.push(byId[key]);
        }
      });
      list.forEach((word) => {
        const key = String(word && word.id || '');
        if (key && !used[key]) ordered.push(word);
      });
      return ordered.length ? ordered : list;
    }
    return shuffleEnabled ? this._shuffleWords(list) : list;
  },

  _getTextSizeClass(text, compactAt, tinyAt) {
    const len = String(text || '').length;
    if (tinyAt && len >= tinyAt) return 'tiny';
    if (compactAt && len >= compactAt) return 'compact';
    return '';
  },

  _getCardTextClasses(word) {
    const meta = this._getCardMetaText(word);
    return {
      cardKoreanClass: this._getTextSizeClass(word && word.korean, 5, 8),
      cardMetaClass: this._getTextSizeClass(meta, 18, 25),
      cardEnglishClass: this._getTextSizeClass(word && word.en, 12, 18)
    };
  },

  _getQuestionCardState(word) {
    const questionText = this._getQuestionText(word);
    return {
      cardKoreanText: '?',
      cardKoreanClass: '',
      cardMetaText: questionText,
      cardMetaClass: '',
      cardEnglishText: '',
      cardEnglishClass: '',
      questionText
    };
  },

  _getRevealCardState(word) {
    return {
      cardKoreanText: word && word.korean ? word.korean : '',
      cardMetaText: this._getCardMetaText(word),
      cardEnglishText: word && word.en ? word.en : '',
      ...this._getCardTextClasses(word)
    };
  },

  async _loadInitialPack() {
    const initialGroupId = this._initialShareOptions && this._initialShareOptions.groupId;
    const initialWordId = this._initialShareOptions && this._initialShareOptions.wordId;
    await this._loadGroup(initialGroupId || getSavedPictureWordGroupId(), {
      save: false,
      refresh: true,
      restoreSession: !initialWordId,
      targetWordId: initialWordId
    });
  },

  _buildGroupOptions(groups) {
    return (Array.isArray(groups) ? groups : []).map((group) => {
      const count = group && group.itemCount ? ` · ${group.itemCount}词` : '';
      const extensionCount = Number(group && group.extensionCount || 0);
      const extension = extensionCount ? ` · ${extensionCount}扩展` : '';
      return `${group.name || group.id}${count}${extension}`;
    });
  },

  _buildCategoryList(groups, query, currentGroupId) {
    const q = String(query || '').trim().toLowerCase();
    const currentId = currentGroupId || this.data.currentGroupId;
    return (Array.isArray(groups) ? groups : [])
      .filter((group) => {
        if (!group) return false;
        if (!q) return true;
        const text = `${group.name || ''} ${group.id || ''} ${group.level || ''}`.toLowerCase();
        return text.indexOf(q) >= 0;
      })
      .map((group) => {
        const itemCount = Number(group.itemCount || 0);
        const extensionCount = Number(group.extensionCount || 0);
        return {
          id: group.id,
          name: group.name || group.id,
          itemCount,
          extensionCount,
          metaText: `${itemCount}词${extensionCount ? ` · ${extensionCount}扩展` : ''}`,
          active: group.id === currentId,
          stateText: group.id === currentId ? '当前' : '切换'
        };
      });
  },

  _buildWordJumpList(words, currentIndex) {
    const list = Array.isArray(words) ? words : [];
    const current = Math.max(0, Number(currentIndex) || 0);
    return list.map((word, index) => {
      const korean = String(word && (word.korean || word.word) || '').trim();
      const cn = String(word && (word.cn || word.chinese || word.meaning) || '').trim();
      const roman = String(word && word.roman || '').trim();
      return {
        index,
        no: index + 1 < 10 ? `0${index + 1}` : String(index + 1),
        korean,
        cn,
        meta: roman || cn,
        active: index === current
      };
    });
  },

  _getGroupPickerIndex(groups, groupId) {
    const idx = (Array.isArray(groups) ? groups : []).findIndex((group) => group && group.id === groupId);
    return idx >= 0 ? idx : 0;
  },

  _getQuestionText(word) {
    if (word && word.promptKo) return word.promptKo;
    if (this.data.currentGroup && this.data.currentGroup.promptKo) return this.data.currentGroup.promptKo;
    return this.data.questionText || QUESTION_KO;
  },

  async _loadGroup(groupId, options) {
    const opts = options || {};
    this._clearTimers();
    this._stopAudio();
    this._seqToken = (this._seqToken || 0) + 1;
    const loadToken = (this._contentToken || 0) + 1;
    this._contentToken = loadToken;
    this.setData({ contentLoading: true, dbg: '加载分组…' });

    try {
      const pack = await loadPictureWordPack({ groupId, refresh: opts.refresh === true });
      if (this._contentToken !== loadToken) return;

      const groups = Array.isArray(pack.groups) ? pack.groups : [];
      const group = pack.group || groups[0] || null;
      const rawWords = Array.isArray(pack.items) ? pack.items : [];
      const catalogCacheKey = pack.catalogCacheKey || pack.cacheKey || `pictureWords:${pack.source || 'local'}:${pack.version || 'v'}:catalog`;
      const targetWordId = String(opts.targetWordId || '').trim();
      const savedSession = !targetWordId && !opts.restart && opts.restoreSession && group
        ? this._getStoredSession(catalogCacheKey, group.id)
        : null;
      const session = this._isResumableSession(savedSession, rawWords.length) ? savedSession : null;
      const shuffleEnabled = session ? Boolean(session.shuffleEnabled) : this._readShuffleEnabled();
      const words = this._buildOrderedWords(rawWords, session, shuffleEnabled);
      const targetIndex = targetWordId
        ? words.findIndex((item) => String(item && item.id || '') === targetWordId)
        : -1;
      const startIndex = session
        ? Math.max(0, Math.min(Number(session.currentIndex) || 0, Math.max(words.length - 1, 0)))
        : (targetIndex >= 0 ? targetIndex : 0);
      const currentWord = words[startIndex] || null;
      const questionText = group && group.promptKo ? group.promptKo : QUESTION_KO;
      const firstQuestionText = currentWord && currentWord.promptKo ? currentWord.promptKo : questionText;
      const groupPickerIndex = this._getGroupPickerIndex(groups, group && group.id);
      const questionState = this._getQuestionCardState(currentWord);

      if (group && opts.save !== false) {
        savePictureWordGroupId(group.id);
      }

      const groupOptions = this._buildGroupOptions(groups);
      const categoryList = this._buildCategoryList(groups, '', group && group.id);
      this.setData({
        groups,
        groupOptions,
        categoryList,
        categoryPanelVisible: false,
        categorySearchText: '',
        wordJumpPanelVisible: false,
        wordJumpList: [],
        groupPickerIndex,
        hasCategorySwitch: groupOptions.length > 1,
        showCategoryPicker: groupOptions.length > 0,
        currentGroup: group,
        currentGroupId: group ? group.id : '',
        groupTitle: group ? group.name : '看图想韩语',
        contentLoading: false,
        catalogCacheKey,
        contentVersion: pack.version || '',
        baseWords: rawWords,
        words,
        total: words.length,
        current: startIndex,
        word: currentWord,
        shuffleEnabled,
        phase: 'asking',
        countdown: COUNTDOWN_START,
        countdownPercent: 100,
        inputValue: '',
        inputError: false,
        readLabel: '',
        readIndex: 0,
        readTotal: 0,
        readType: '',
        koReadIndex: 0,
        readDone: false,
        groupDone: false,
        readTipText: '看图想韩语',
        showRetryButton: false,
        retryStepIndex: 0,
        ...questionState,
        answerPanelClass: ANSWER_PANEL_HIDDEN,
        showNextButton: false,
        nextButtonText: words.length <= 1 ? '完成' : '下一个 ›',
        showAskBadge: true,
        showCountBadge: false,
        showAskBubble: true,
        autoPaused: false,
        autoContinuePending: false,
        popTick: (this.data.popTick + 1) % 2,
        dbg: group ? `已加载：${group.name}${session ? '，继续上次进度' : ''}` : '暂无分组'
      }, () => {
        this._saveStudySession();
        this._syncTabBarVisibility();
        this._scheduleShareImage();
      });

      this._prefetchTts(firstQuestionText, 'ko-KR');
      if (currentWord) this._prefetchWordAudio(currentWord);
      this._prefetchImagesForWords(words, startIndex);
      setTimeout(() => {
        if (this._contentToken === loadToken) this._playSfx('pop');
      }, 260);
    } catch (e) {
      if (this._contentToken !== loadToken) return;
      console.warn('[picword content] load group failed:', e && e.message ? e.message : e);
      this.setData({
        contentLoading: false,
        words: [],
        total: 0,
        word: null,
        showCategoryPicker: false,
        categoryPanelVisible: false,
        dbg: '分组加载失败'
      }, () => {
        this._syncTabBarVisibility();
        this._scheduleShareImage();
      });
      wx.showToast({ title: '分组加载失败', icon: 'none', duration: 1200 });
    }
  },

  // ---------- 模式切换 ----------
  openCategorySheet() {
    const groups = Array.isArray(this.data.groups) ? this.data.groups : [];
    if (!groups.length) {
      wx.showToast({ title: '暂无分类', icon: 'none', duration: 1000 });
      return;
    }

    this.setData({
      categoryPanelVisible: true,
      categorySearchText: '',
      categoryList: this._buildCategoryList(groups, '', this.data.currentGroupId),
      wordJumpPanelVisible: false,
      wordJumpList: this._buildWordJumpList(this.data.words, this.data.current)
    });
    this._setTabBarHidden(true);
  },

  closeCategoryPanel() {
    const shouldCancelAdConfirm = this.data.showCategoryAdConfirm && !this.data.categoryAdLoading;
    this._pendingPicturePracticeWords = null;
    this.setData({
      categoryPanelVisible: false,
      categorySearchText: '',
      wordJumpPanelVisible: false,
      wordJumpList: [],
      showCategoryAdConfirm: false,
      categoryAdLoading: false,
      showPicturePracticeConfirm: false,
      picturePracticeConfirmTitle: '',
      picturePracticeConfirmCount: 0
    });
    if (shouldCancelAdConfirm) this._finishCategoryAdConfirm(false);
    this._syncTabBarVisibility();
  },

  onCategorySearchInput(e) {
    const value = e && e.detail ? e.detail.value : '';
    this.setData({
      categorySearchText: value,
      categoryList: this._buildCategoryList(this.data.groups, value, this.data.currentGroupId)
    });
  },

  clearCategorySearch() {
    this.setData({
      categorySearchText: '',
      categoryList: this._buildCategoryList(this.data.groups, '', this.data.currentGroupId)
    });
  },

  toggleWordJumpPanel() {
    const nextVisible = !this.data.wordJumpPanelVisible;
    this.setData({
      wordJumpPanelVisible: nextVisible,
      wordJumpList: this._buildWordJumpList(this.data.words, this.data.current)
    });
  },

  jumpToWord(e) {
    const index = Number(e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.index : -1);
    if (index < 0 || index >= this.data.total) return;
    this._jumpToWordIndex(index);
  },

  _jumpToWordIndex(index) {
    const words = Array.isArray(this.data.words) ? this.data.words : [];
    const targetIndex = Math.max(0, Math.min(Number(index) || 0, Math.max(words.length - 1, 0)));
    const targetWord = words[targetIndex];
    if (!targetWord) return;

    this._clearTimers();
    this._stopAudio();
    this._seqToken = (this._seqToken || 0) + 1;

    const questionText = this._getQuestionText(targetWord);
    const questionState = this._getQuestionCardState(targetWord);
    this._playSfx('pop');

    this.setData({
      current: targetIndex,
      word: targetWord,
      phase: 'asking',
      countdown: COUNTDOWN_START,
      countdownPercent: 100,
      inputValue: '',
      inputError: false,
      readLabel: '',
      readIndex: 0,
      readTotal: 0,
      readType: '',
      koReadIndex: 0,
      readDone: false,
      groupDone: false,
      readTipText: '看图想韩语',
      showRetryButton: false,
      retryStepIndex: 0,
      ...questionState,
      answerPanelClass: ANSWER_PANEL_HIDDEN,
      autoPaused: false,
      autoContinuePending: false,
      showNextButton: false,
      nextButtonText: (targetIndex + 1 >= this.data.total) ? '完成' : '下一个 ›',
      showAskBadge: true,
      showCountBadge: false,
      showAskBubble: true,
      categoryPanelVisible: false,
      categorySearchText: '',
      wordJumpPanelVisible: false,
      wordJumpList: [],
      popTick: (this.data.popTick + 1) % 2,
      dbg: `已跳到第 ${targetIndex + 1} 个`
    }, () => {
      this._saveStudySession({ done: false });
      this._syncTabBarVisibility();
      this._scheduleShareImage();
    });

    this._prefetchTts(questionText, 'ko-KR');
    this._prefetchWordAudio(targetWord);
    this._prefetchImagesForWords(words, targetIndex);
  },

  practiceCurrentGroup() {
    const group = this.data.currentGroup || {};
    const sourceWords = Array.isArray(this.data.baseWords) && this.data.baseWords.length
      ? this.data.baseWords
      : this.data.words;
    const practiceWords = (Array.isArray(sourceWords) ? sourceWords : [])
      .map((item) => {
        const sceneSentence = item && item.sceneSentence && typeof item.sceneSentence === 'object'
          ? item.sceneSentence
          : null;
        return {
          ...item,
          word: item && item.korean ? item.korean : item && item.word,
          meaning: item && item.cn ? item.cn : item && item.meaning,
          sourceGroupId: group.id || this.data.currentGroupId || '',
          sourceGroupName: group.name || this.data.groupTitle || '',
          example_sentence: (item && item.example_sentence) || (sceneSentence && sceneSentence.ko) || '',
          sentence_translation: (item && item.sentence_translation) || (sceneSentence && sceneSentence.cn) || ''
        };
      })
      .filter((item) => item && item.word);

    if (!practiceWords.length) {
      wx.showToast({ title: '暂无可练习单词', icon: 'none', duration: 1200 });
      return;
    }

    this._pendingPicturePracticeWords = practiceWords;
    this.setData({
      showPicturePracticeConfirm: true,
      picturePracticeConfirmTitle: group.name || this.data.groupTitle || '当前分类',
      picturePracticeConfirmCount: practiceWords.length
    });
  },

  cancelPicturePracticeConfirm() {
    this._pendingPicturePracticeWords = null;
    this.setData({
      showPicturePracticeConfirm: false,
      picturePracticeConfirmTitle: '',
      picturePracticeConfirmCount: 0
    });
  },

  confirmPicturePracticeCurrentGroup() {
    const practiceWords = this._pendingPicturePracticeWords || [];
    if (!practiceWords.length) {
      wx.showToast({ title: '暂无可练习单词', icon: 'none', duration: 1200 });
      this.cancelPicturePracticeConfirm();
      return;
    }

    const result = addPictureWordsPracticeWords(practiceWords);
    if (!result.success) {
      wx.showToast({ title: result.message || '加入失败', icon: 'none', duration: 1200 });
      return;
    }

    const settings = wx.getStorageSync('settings') || {};
    wx.setStorageSync('settings', {
      ...settings,
      category: PICTURE_WORDS_PRACTICE_CATEGORY
    });

    this.closeCategoryPanel();
    wx.showToast({ title: '正在打开拼写练习', icon: 'none', duration: 900 });
    setTimeout(() => {
      wx.switchTab({ url: '/pages/nv-practice/index' });
    }, 180);
  },

  selectCategory(e) {
    const groupId = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.groupId : '';
    const group = (this.data.groups || []).find((item) => item && item.id === groupId);
    if (!group) return;
    if (group.id === this.data.currentGroupId) {
      this.closeCategoryPanel();
      return;
    }

    this._showCategoryAdOnceToday().then((ok) => {
      if (!ok) return;
      this.closeCategoryPanel();
      this._loadGroupWithResumeChoice(group);
    });
  },

  onGroupPickerChange(e) {
    const idx = Number(e && e.detail ? e.detail.value : 0) || 0;
    const group = (this.data.groups || [])[idx];
    if (!group || group.id === this.data.currentGroupId) return;
    this._showCategoryAdOnceToday().then((ok) => {
      if (!ok) return;
      this._loadGroupWithResumeChoice(group);
    });
  },

  _loadGroupWithResumeChoice(group) {
    if (!group || !group.id) return;
    const session = this._getResumableSession(group.id, group.itemCount);
    if (!session) {
      this._loadGroup(group.id, { save: true, restart: true });
      return;
    }

    const currentNo = Math.min(Number(session.currentIndex || 0) + 1, Number(session.total || group.itemCount || 0));
    const total = Number(session.total || group.itemCount || 0);
    this._resumeChoiceGroup = group;
    this.setData({
      showResumeChoice: true,
      resumeChoiceTitle: group.name || group.id || '当前分类',
      resumeChoiceCopy: '检测到上次学习进度，可以继续接着学，也可以从第一张重新开始。',
      resumeChoiceMeta: `${currentNo}/${total}`
    }, () => {
      this._setTabBarHidden(true);
    });
  },

  restartResumeChoice() {
    const group = this._resumeChoiceGroup;
    this._resumeChoiceGroup = null;
    this.setData({
      showResumeChoice: false,
      resumeChoiceTitle: '',
      resumeChoiceCopy: '',
      resumeChoiceMeta: ''
    }, () => {
      this._syncTabBarVisibility();
    });
    if (group && group.id) {
      this._loadGroup(group.id, { save: true, restart: true });
    }
  },

  continueResumeChoice() {
    const group = this._resumeChoiceGroup;
    this._resumeChoiceGroup = null;
    this.setData({
      showResumeChoice: false,
      resumeChoiceTitle: '',
      resumeChoiceCopy: '',
      resumeChoiceMeta: ''
    }, () => {
      this._syncTabBarVisibility();
    });
    if (group && group.id) {
      this._loadGroup(group.id, { save: true, restoreSession: true, restart: false });
    }
  },

  toggleShuffle() {
    this._applyShuffleMode(!this.data.shuffleEnabled, { toast: true });
  },

  setShuffleMode(e) {
    const value = e && e.currentTarget && e.currentTarget.dataset
      ? e.currentTarget.dataset.shuffle
      : 0;
    const enabled = String(value) === '1' || value === true;
    this._applyShuffleMode(enabled, { toast: true });
  },

  reshuffleCurrentGroup() {
    this._applyShuffleMode(true, { forceReshuffle: true, toast: true });
  },

  _applyShuffleMode(enabled, options) {
    const opts = options || {};
    if (!this.data.word || this.data.contentLoading) return false;
    if (!this.data.groupDone && (this.data.phase !== 'asking' || this.data.autoContinuePending)) {
      wx.showToast({ title: '本词结束后再切换随机', icon: 'none', duration: 1200 });
      return false;
    }

    const shuffleEnabled = Boolean(enabled);
    const forceReshuffle = Boolean(opts.forceReshuffle);
    if (!forceReshuffle && shuffleEnabled === this.data.shuffleEnabled) {
      if (opts.toast) {
        wx.showToast({ title: shuffleEnabled ? '当前已随机' : '当前已顺序', icon: 'none', duration: 1000 });
      }
      return false;
    }

    this._clearTimers();
    this._stopAudio();
    this._seqToken = (this._seqToken || 0) + 1;

    this._writeShuffleEnabled(shuffleEnabled);

    const sourceWords = (Array.isArray(this.data.baseWords) && this.data.baseWords.length)
      ? this.data.baseWords
      : this.data.words;
    const words = this._buildOrderedWords(sourceWords, null, shuffleEnabled);
    const firstWord = words[0] || null;
    const firstQuestionText = this._getQuestionText(firstWord);
    const questionState = this._getQuestionCardState(firstWord);

    this.setData({
      shuffleEnabled,
      words,
      total: words.length,
      current: 0,
      word: firstWord,
      wordJumpList: this.data.wordJumpPanelVisible ? this._buildWordJumpList(words, 0) : this.data.wordJumpList,
      phase: 'asking',
      countdown: COUNTDOWN_START,
      countdownPercent: 100,
      inputValue: '',
      inputError: false,
      readLabel: '',
      readIndex: 0,
      readTotal: 0,
      readType: '',
      koReadIndex: 0,
      readDone: false,
      groupDone: false,
      readTipText: '看图想韩语',
      showRetryButton: false,
      retryStepIndex: 0,
      ...questionState,
      answerPanelClass: ANSWER_PANEL_HIDDEN,
      autoPaused: false,
      autoContinuePending: false,
      showNextButton: false,
      nextButtonText: words.length <= 1 ? '完成' : '下一个 ›',
      showAskBadge: true,
      showCountBadge: false,
      showAskBubble: true,
      popTick: (this.data.popTick + 1) % 2,
      dbg: shuffleEnabled ? '已开启随机顺序' : '已切回顺序播放'
    }, () => {
      this._saveStudySession();
      this._syncTabBarVisibility();
      this._scheduleShareImage();
    });

    this._prefetchTts(firstQuestionText, 'ko-KR');
    this._prefetchCurrentReadAudio();
    this._prefetchImagesForWords(words, 0);
    if (opts.toast) {
      wx.showToast({
        title: shuffleEnabled ? (forceReshuffle ? '已重新打乱' : '已随机打乱') : '已按顺序播放',
        icon: 'none',
        duration: 1000
      });
    }
    return true;
  },

  toggleMode() {
    const next = !this.data.autoMode;
    this._clearTimers();
    this._stopAudio();
    this._seqToken = (this._seqToken || 0) + 1;
    this.setData({
      autoMode: next,
      autoPaused: false,
      autoContinuePending: false,
      phase: 'asking',
      inputValue: '',
      inputError: false,
      readDone: false,
      groupDone: false,
      readTipText: '看图想韩语',
      koReadIndex: 0,
      showRetryButton: false,
      retryStepIndex: 0,
      cardKoreanText: '?',
      cardKoreanClass: '',
      cardMetaText: this.data.questionText || QUESTION_KO,
      cardMetaClass: '',
      cardEnglishText: '',
      cardEnglishClass: '',
      answerPanelClass: ANSWER_PANEL_HIDDEN,
      showNextButton: false,
      nextButtonText: '下一个 ›',
      showAskBadge: true,
      showCountBadge: false,
      showAskBubble: true,
      countdown: COUNTDOWN_START,
      countdownPercent: 100
    }, () => {
      this._syncTabBarVisibility();
    });
    wx.showToast({ title: next ? '已切换：自动播放' : '已切换：手动输入', icon: 'none', duration: 1200 });
  },

  // ---------- 一键自动播放 ----------
  // 在 asking 阶段点击「？」或「开始」进入倒计时
  startSequence() {
    if (this.data.groupDone) return;
    if (this.data.phase !== 'asking') return;
    this._startCountdown();
  },

  pauseAutoPlay() {
    if (!this.data.autoMode) return;
    if (this.data.groupDone) return;
    this._clearTimers();
    this._stopAudio();
    this._seqToken = (this._seqToken || 0) + 1;
    this._setPausedAskingState('已暂停');
  },

  _setPausedAskingState(dbgText) {
    const questionText = this._getQuestionText(this.data.word);
    this.setData({
      autoPaused: true,
      autoContinuePending: false,
      phase: 'asking',
      countdown: COUNTDOWN_START,
      countdownPercent: 100,
      readDone: false,
      groupDone: false,
      readLabel: '',
      readIndex: 0,
      readTotal: 0,
      readType: '',
      koReadIndex: 0,
      readTipText: '看图想韩语',
      showRetryButton: false,
      retryStepIndex: 0,
      cardKoreanText: '?',
      cardKoreanClass: '',
      cardMetaText: questionText,
      cardMetaClass: '',
      cardEnglishText: '',
      cardEnglishClass: '',
      questionText,
      answerPanelClass: ANSWER_PANEL_HIDDEN,
      showNextButton: false,
      showAskBadge: true,
      showCountBadge: false,
      showAskBubble: true,
      categoryPanelVisible: false,
      categorySearchText: '',
      dbg: dbgText || '已暂停'
    }, () => {
      this._saveStudySession();
      this._syncTabBarVisibility();
    });
  },

  _startCountdown() {
    this._clearTimers();
    // 新一轮：递增 token，让上一词遗留的异步回调全部作废
    this._seqToken = (this._seqToken || 0) + 1;
    const myToken = this._seqToken;
    const questionText = this._getQuestionText(this.data.word);
    this.setData({
      phase: 'countdown',
      countdown: COUNTDOWN_START,
      countdownPercent: 100,
      readDone: false,
      koReadIndex: 0,
      readTipText: '正在提问',
      showRetryButton: false,
      retryStepIndex: 0,
      cardKoreanText: '?',
      cardKoreanClass: '',
      cardMetaText: questionText,
      cardMetaClass: '',
      cardEnglishText: '',
      cardEnglishClass: '',
      questionText,
      answerPanelClass: ANSWER_PANEL_HIDDEN,
      autoPaused: false,
      autoContinuePending: false,
      showNextButton: false,
      showAskBadge: false,
      showCountBadge: true,
      showAskBubble: true,
      dbg: '倒计时…朗读 ' + questionText
    }, () => {
      this._syncTabBarVisibility();
    });
    this._playSfx('tick'); // 第一声 3
    this._speak(questionText, 'ko-KR', {
      channel: 'question',
      token: myToken,
      phase: 'countdown',
      maxMs: 5000
    }); // 倒计时同时朗读「이게 뭐예요?」
    this._prefetchCurrentReadAudio();
    let n = COUNTDOWN_START;
    this._countdownTimer = setInterval(() => {
      if (myToken !== this._seqToken) { clearInterval(this._countdownTimer); this._countdownTimer = null; return; }
      n -= 1;
      if (n <= 0) {
        clearInterval(this._countdownTimer);
        this._countdownTimer = null;
        this._reveal();
        return;
      }
      this._playSfx('tick'); // 2 / 1
      this.setData({ countdown: n, countdownPercent: Math.round((n / COUNTDOWN_START) * 100) });
    }, 1000);
  },

  // 揭晓答案并开始按计划朗读
  _reveal() {
    this._stopAudio('question');
    this._playSfx('chime'); // 揭晓提示声
    this.setData({
      phase: 'reveal',
      readDone: false,
      koReadIndex: 0,
      readTipText: '准备朗读',
      showRetryButton: false,
      retryStepIndex: 0,
      ...this._getRevealCardState(this.data.word),
      answerPanelClass: ANSWER_PANEL_VISIBLE,
      showNextButton: false,
      showAskBadge: false,
      showCountBadge: false,
      showAskBubble: false
    }, () => {
      this._syncTabBarVisibility();
    });
    this._runReadPlan(0);
  },

  // 依次执行 READ_PLAN：每一步都等待真实音频结束，读完后停留在当前卡片。
  async _runReadPlan(stepIndex) {
    const myToken = this._seqToken;
    const wordId = this.data.word && this.data.word.id;

    for (let i = stepIndex || 0; i < READ_PLAN.length; i += 1) {
      if (!this._isTokenAlive(myToken) || this.data.phase !== 'reveal') return;
      if (!this.data.word || this.data.word.id !== wordId) return;

      const step = READ_PLAN[i];
      const word = this.data.word;
      const text = step.type === 'ko' ? word.korean : (step.type === 'cn' ? word.cn : word.en);
      const koReadIndex = step.type === 'ko' ? step.index : 3;
      const stepTip = step.type === 'en' ? '英文朗读' : `${step.label} ${step.index} / ${step.total}`;

      this.setData({
        readLabel: step.label,
        readIndex: step.index,
        readTotal: step.total,
        readType: step.type,
        koReadIndex,
        readDone: false,
        readTipText: stepTip,
        showRetryButton: false,
        retryStepIndex: i,
        ...this._getRevealCardState(word),
        showNextButton: false,
        dbg: '准备朗读 ' + step.label + ' ' + step.index + '/' + step.total
      });

      let ok = await this._speak(text, step.lang, {
        channel: 'read',
        token: myToken,
        phase: 'reveal',
        maxMs: 12000,
        audioUrl: this._getWordAudioUrl(word, step.lang)
      });

      if (!ok && this._isTokenAlive(myToken) && this.data.phase === 'reveal' && this.data.word && this.data.word.id === wordId) {
        this.setData({ readTipText: `${stepTip} · 重试中`, dbg: '朗读未完成，重试 ' + text });
        await this._delay(180);
        ok = await this._speak(text, step.lang, {
          channel: 'read',
          token: myToken,
          phase: 'reveal',
          maxMs: 12000,
          audioUrl: this._getWordAudioUrl(word, step.lang)
        });
      }

      if (!this._isTokenAlive(myToken) || this.data.phase !== 'reveal') return;
      if (!this.data.word || this.data.word.id !== wordId) return;
      if (!ok) {
        this.setData({
          autoPaused: true,
          showRetryButton: true,
          retryStepIndex: i,
          showNextButton: false,
          readTipText: '朗读未完成，请重试',
          dbg: '朗读失败，暂停在当前步骤'
        }, () => {
          this._syncTabBarVisibility();
        });
        return;
      }

      if (i < READ_PLAN.length - 1) {
        await this._delay(READ_STEP_GAP_MS);
      }
    }

    if (this._isTokenAlive(myToken) && this.data.phase === 'reveal') {
      this.setData({
        readDone: true,
        readLabel: '',
        readIndex: 0,
        readTotal: 0,
        readType: '',
        koReadIndex: 3,
        readTipText: '',
        showRetryButton: false,
        retryStepIndex: 0,
        ...this._getRevealCardState(this.data.word),
        answerPanelClass: ANSWER_PANEL_VISIBLE,
        showNextButton: !this.data.autoMode,
        nextButtonText: (this.data.current + 1 >= this.data.total) ? '完成' : '下一个 ›',
        dbg: this.data.autoMode ? '本词朗读完成，准备下一张' : '本词朗读完成，停留在当前卡片'
      }, () => {
        this._syncTabBarVisibility();
      });
      if (this.data.autoMode) {
        this._autoNextTimer = setTimeout(() => {
          if (!this._isTokenAlive(myToken) || this.data.phase !== 'reveal') return;
          this._goNext({ autoContinue: true });
        }, AUTO_NEXT_DELAY_MS);
      }
    }
  },

  // ---------- 朗读：复用 edgeTts 云函数 + 本地缓存 ----------
  _isTokenAlive(token) {
    return token === undefined || token === this._seqToken;
  },

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  _getAudioCacheKey(text, lang) {
    return sha256(`${AUDIO_CACHE_VERSION}|${lang}|${String(text || '').trim()}`);
  },

  _hasLocalFile(path) {
    try {
      wx.getFileSystemManager().accessSync(path);
      return true;
    } catch (e) {
      return false;
    }
  },

  _getWordAudioUrl(word, lang) {
    const audio = word && word.audio;
    if (!audio) return '';
    if (typeof audio === 'string') return audio.trim();

    const normalizedLang = String(lang || 'ko-KR');
    if (audio[normalizedLang]) return String(audio[normalizedLang]).trim();
    if (normalizedLang === 'ko-KR') {
      return String(audio.ko || audio.korean || '').trim();
    }
    if (normalizedLang === 'en-US') {
      return String(audio.en || audio.english || '').trim();
    }
    return '';
  },

  _prefetchTts(text, lang, options) {
    this._getCachedTtsSrc(text, lang, options).catch((e) => {
      console.warn('[picword audio] prefetch failed:', text, lang, e && e.message ? e.message : e);
    });
  },

  _prefetchWordAudio(word) {
    if (!word) return;
    if (word.korean) this._prefetchTts(word.korean, 'ko-KR', { audioUrl: this._getWordAudioUrl(word, 'ko-KR') });
    if (word.en) this._prefetchTts(word.en, 'en-US', { audioUrl: this._getWordAudioUrl(word, 'en-US') });
  },

  _prefetchCurrentReadAudio() {
    this._prefetchWordAudio(this.data.word);
  },

  _prefetchImage(src) {
    const imageSrc = String(src || '').trim();
    if (!imageSrc) return;
    if (!this._imagePrefetchCache) this._imagePrefetchCache = {};
    if (this._imagePrefetchCache[imageSrc]) return;
    this._imagePrefetchCache[imageSrc] = true;

    if (wx.getImageInfo) {
      wx.getImageInfo({
        src: imageSrc,
        fail: () => {
          // 标记保留，避免坏图在一轮里反复请求。
        }
      });
    }
  },

  _prefetchImagesForWords(words, startIndex) {
    const list = Array.isArray(words) ? words : [];
    const start = Math.max(0, Number(startIndex) || 0);
    for (let i = 0; i <= IMAGE_PREFETCH_AHEAD; i += 1) {
      const word = list[start + i];
      if (word && word.image) this._prefetchImage(word.image);
    }
  },

  _getCardMetaText(word) {
    if (!word) return '';
    return `${word.roman || ''}${word.cn ? ' · ' + word.cn : ''}`.trim();
  },

  _downloadRemoteAudioToCache(remoteAudioUrl, cachePath, cacheKey) {
    if (!remoteAudioUrl || !wx.downloadFile) {
      return Promise.reject(new Error('wx.downloadFile unavailable'));
    }

    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: remoteAudioUrl,
        success: (res) => {
          const statusCode = Number(res && res.statusCode);
          if (statusCode < 200 || statusCode >= 300 || !res.tempFilePath) {
            reject(new Error(`远程音频下载失败: ${statusCode || 'unknown'}`));
            return;
          }

          const fs = wx.getFileSystemManager();
          fs.readFile({
            filePath: res.tempFilePath,
            success: (readRes) => {
              this._ensureCacheDir();
              try { fs.unlinkSync(cachePath); } catch (e) {}
              fs.writeFile({
                filePath: cachePath,
                data: readRes.data,
                success: () => {
                  this._audioCache[cacheKey] = cachePath;
                  resolve(cachePath);
                },
                fail: (e) => reject(new Error('写入远程音频缓存失败: ' + JSON.stringify(e)))
              });
            },
            fail: (e) => reject(new Error('读取远程音频失败: ' + JSON.stringify(e)))
          });
        },
        fail: (e) => reject(new Error('远程音频请求失败: ' + JSON.stringify(e)))
      });
    });
  },

  _requestEdgeTtsToCache(normalizedText, normalizedLang, cachePath, cacheKey) {
    if (!wx.cloud || !wx.cloud.callFunction) {
      return Promise.reject(new Error('wx.cloud 未初始化'));
    }

    const fs = wx.getFileSystemManager();
    return new Promise((resolve, reject) => {
      console.log('[picword audio] edgeTts fetch:', normalizedText, normalizedLang);
      wx.cloud.callFunction({
        name: 'edgeTts',
        timeout: 15000,
        data: { text: normalizedText, lang: normalizedLang },
        success: (res) => {
          const result = (res && res.result) || {};
          if (!result.ok || !result.audioBase64) {
            reject(new Error(result.error || 'edgeTts 无音频'));
            return;
          }
          this._ensureCacheDir();
          try { fs.unlinkSync(cachePath); } catch (e) {}
          fs.writeFile({
            filePath: cachePath,
            data: result.audioBase64,
            encoding: 'base64',
            success: () => {
              this._audioCache[cacheKey] = cachePath;
              resolve(cachePath);
            },
            fail: (e) => reject(new Error('写入 TTS 缓存失败: ' + JSON.stringify(e)))
          });
        },
        fail: (e) => reject(new Error('云函数调用失败: ' + JSON.stringify(e)))
      });
    });
  },

  _getCachedTtsSrc(text, lang, options) {
    const normalizedText = String(text || '').trim();
    const normalizedLang = String(lang || 'ko-KR');
    const remoteAudioUrl = String(options && options.audioUrl || '').trim();
    if (!normalizedText) return Promise.reject(new Error('Missing TTS text'));

    this._ensureCacheDir();
    if (!this._audioCache) this._audioCache = {};
    if (!this._ttsInflight) this._ttsInflight = {};

    const cacheKey = this._getAudioCacheKey(normalizedText, normalizedLang);
    const cachePath = `${AUDIO_CACHE_DIR}/${cacheKey}.mp3`;
    const memorized = this._audioCache[cacheKey];

    if (memorized && this._hasLocalFile(memorized)) {
      return Promise.resolve(memorized);
    }
    if (this._hasLocalFile(cachePath)) {
      this._audioCache[cacheKey] = cachePath;
      return Promise.resolve(cachePath);
    }
    if (this._ttsInflight[cacheKey]) {
      return this._ttsInflight[cacheKey];
    }

    const request = remoteAudioUrl
      ? this._downloadRemoteAudioToCache(remoteAudioUrl, cachePath, cacheKey).catch((e) => {
        console.warn('[picword audio] remote audio fallback:', remoteAudioUrl, e && e.message ? e.message : e);
        return this._requestEdgeTtsToCache(normalizedText, normalizedLang, cachePath, cacheKey);
      })
      : this._requestEdgeTtsToCache(normalizedText, normalizedLang, cachePath, cacheKey);

    this._ttsInflight[cacheKey] = request.then((src) => {
      delete this._ttsInflight[cacheKey];
      return src;
    }, (err) => {
      delete this._ttsInflight[cacheKey];
      throw err;
    });
    return this._ttsInflight[cacheKey];
  },

  async _speak(text, lang, options) {
    const opts = options || {};
    const token = opts.token;
    const phase = opts.phase;
    const normalizedText = String(text || '').trim();
    if (!normalizedText || !this._isTokenAlive(token)) return false;

    try {
      this.setData({ dbg: '取音频缓存: ' + normalizedText });
      const src = await this._getCachedTtsSrc(normalizedText, lang, { audioUrl: opts.audioUrl });
      if (!this._isTokenAlive(token)) return false;
      if (phase && this.data.phase !== phase) return false;
      return await this._playAudioSrc(src, normalizedText, opts);
    } catch (e) {
      if (this._isTokenAlive(token)) {
        console.warn('[picword audio] speak failed:', normalizedText, e && e.message ? e.message : e);
        this.setData({ dbg: '✗ 朗读失败: ' + normalizedText });
      }
      return false;
    }
  },

  _playAudioSrc(src, text, options) {
    const opts = options || {};
    const token = opts.token;
    const channel = opts.channel === 'question' ? 'question' : 'read';
    const prop = channel === 'question' ? '_questionAudioCtx' : '_audioCtx';
    const maxMs = opts.maxMs || 12000;

    if (!this._isTokenAlive(token)) return Promise.resolve(false);
    this._stopAudio(channel);

    return new Promise((resolve) => {
      if (!this._isTokenAlive(token)) {
        resolve(false);
        return;
      }

      const ctx = wx.createInnerAudioContext();
      this[prop] = ctx;
      let settled = false;
      let started = false;
      let timer = null;

      const finish = (ok) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (this[prop] === ctx) this[prop] = null;
        try { ctx.stop(); } catch (e) {}
        try { ctx.destroy(); } catch (e) {}
        resolve(Boolean(ok));
      };
      const attempt = () => {
        if (!this._isTokenAlive(token)) {
          finish(false);
          return;
        }
        try { ctx.play(); } catch (e) {}
      };

      ctx.onCanplay(() => {
        if (!started) attempt();
      });
      ctx.onPlay(() => {
        started = true;
        if (this._isTokenAlive(token)) {
          this.setData({ dbg: '▶ 正在播放: ' + text });
        }
      });
      ctx.onEnded(() => finish(true));
      ctx.onStop(() => finish(false));
      ctx.onError((err) => {
        console.warn('[picword audio] play error:', JSON.stringify(err), 'src=', src);
        if (!started && this._isTokenAlive(token)) {
          this.setData({ dbg: '✗ 播放出错: ' + text });
        }
        finish(started);
      });

      timer = setTimeout(() => finish(started), maxMs);
      ctx.autoplay = false;
      ctx.src = src;
      attempt();
    });
  },

  // ---------- 手动输入模式 ----------
  // 点击卡片直接揭晓（手动模式下先看答案再跟读）
  onCardTap() {
    if (this.data.autoMode) {
      this.startSequence();
      return;
    }
    if (this.data.phase === 'asking') {
      this._reveal();
    }
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value, inputError: false });
  },

  preventBubble() {},

  retryCurrentRead() {
    if (this.data.phase !== 'reveal' || !this.data.word) return;
    const stepIndex = Math.max(0, Math.min(Number(this.data.retryStepIndex) || 0, READ_PLAN.length - 1));
    this.setData({
      autoPaused: false,
      showRetryButton: false,
      showNextButton: false,
      readDone: false,
      readTipText: '准备重试',
      dbg: '准备重试朗读'
    }, () => {
      this._syncTabBarVisibility();
      this._runReadPlan(stepIndex);
    });
  },

  // 手动模式：输入韩文原词，正确才进下一个
  submitInput() {
    const word = this.data.word;
    if (!word) return;
    const val = String(this.data.inputValue || '').trim();
    const target = String(word.korean || '').trim();
    if (val === target) {
      this.setData({ inputError: false });
      this._goNext();
    } else {
      this.setData({ inputError: true });
      wx.showToast({ title: '再试试，注意拼写', icon: 'none', duration: 1200 });
    }
  },

  // ---------- 流转 ----------
  goNext() { this._goNext(); }, // 供 WXML bindtap 调用（避免下划线私有方法绑定问题）

  _goNext(options) {
    const opts = options || {};
    this._clearTimers();
    this._stopAudio();
    this._seqToken = (this._seqToken || 0) + 1; // 作废本词遗留回调
    const next = this.data.current + 1;
    if (next >= this.data.total) {
      this.setData({
        phase: 'reveal',
        groupDone: true,
        readDone: true,
        readLabel: '',
        readIndex: 0,
        readTotal: 0,
        readType: '',
        koReadIndex: 3,
        readTipText: '',
        showRetryButton: false,
        retryStepIndex: 0,
        ...this._getRevealCardState(this.data.word),
        answerPanelClass: ANSWER_PANEL_VISIBLE,
        autoPaused: false,
        autoContinuePending: false,
        showNextButton: false,
        dbg: '本组完成，卡片保持显示'
      }, () => {
        this._saveStudySession({ done: true });
        this._syncTabBarVisibility();
      });
      return;
    }
    this._playSfx('pop'); // 新卡片出现
    const nextWord = this.data.words[next];
    const nextQuestionText = this._getQuestionText(nextWord);
    const shouldAutoContinue = Boolean(opts.autoContinue && this.data.autoMode);
    const questionState = this._getQuestionCardState(nextWord);
    this.setData({
      current: next,
      word: nextWord,
      wordJumpList: this.data.wordJumpPanelVisible ? this._buildWordJumpList(this.data.words, next) : this.data.wordJumpList,
      phase: 'asking',
      countdown: COUNTDOWN_START,
      countdownPercent: 100,
      inputValue: '',
      inputError: false,
      readLabel: '', readIndex: 0, readTotal: 0, readType: '', koReadIndex: 0, readDone: false, groupDone: false,
      readTipText: '看图想韩语',
      showRetryButton: false,
      retryStepIndex: 0,
      ...questionState,
      answerPanelClass: ANSWER_PANEL_HIDDEN,
      autoPaused: false,
      autoContinuePending: shouldAutoContinue,
      showNextButton: false,
      nextButtonText: (next + 1 >= this.data.total) ? '完成' : '下一个 ›',
      showAskBadge: true,
      showCountBadge: false,
      showAskBubble: true,
      popTick: (this.data.popTick + 1) % 2
      }, () => {
        this._saveStudySession();
        this._syncTabBarVisibility();
        this._scheduleShareImage();
        if (shouldAutoContinue) {
          this._stepTimer = setTimeout(() => this.startSequence(), AUTO_CHAIN_START_DELAY_MS);
        }
    });
    this._prefetchTts(nextQuestionText, 'ko-KR');
    this._prefetchCurrentReadAudio();
    this._prefetchImagesForWords(this.data.words, next);
  },

  // 全部完成后重新开始
  restart() {
    this._clearTimers();
    this._stopAudio();
    this._seqToken = (this._seqToken || 0) + 1;
    const sourceWords = (Array.isArray(this.data.baseWords) && this.data.baseWords.length)
      ? this.data.baseWords
      : this.data.words;
    const words = this._buildOrderedWords(sourceWords, null, this.data.shuffleEnabled);
    const firstWord = words[0];
    const firstQuestionText = this._getQuestionText(firstWord);
    const questionState = this._getQuestionCardState(firstWord);
    this.setData({
      words,
      total: words.length,
      current: 0,
      word: firstWord,
      wordJumpList: this.data.wordJumpPanelVisible ? this._buildWordJumpList(words, 0) : this.data.wordJumpList,
      phase: 'asking',
      countdown: COUNTDOWN_START,
      countdownPercent: 100,
      inputValue: '',
      inputError: false,
      readLabel: '', readIndex: 0, readTotal: 0, readType: '', koReadIndex: 0, readDone: false, groupDone: false,
      readTipText: '看图想韩语',
      showRetryButton: false,
      retryStepIndex: 0,
      ...questionState,
      answerPanelClass: ANSWER_PANEL_HIDDEN,
      autoPaused: false,
      autoContinuePending: false,
      showNextButton: false,
      nextButtonText: words.length <= 1 ? '完成' : '下一个 ›',
      showAskBadge: true,
      showCountBadge: false,
      showAskBubble: true
    }, () => {
      this._saveStudySession({ done: false });
      this._syncTabBarVisibility();
      this._scheduleShareImage();
    });
    this._prefetchTts(firstQuestionText, 'ko-KR');
    this._prefetchCurrentReadAudio();
    this._prefetchImagesForWords(this.data.words, 0);
  },

});
