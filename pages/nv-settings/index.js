import { getCategories, getCategoryCounts, getYonseiLessons, getTopikLevels, getTopikSessions, getWords } from '../../utils_nv/api';
import { getImportedLists, saveImportedList, updateImportedList, deleteImportedList, getMistakes, removeMistake } from '../../utils_nv/storage';

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

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    scrollHeight: 0,
    view: 'categories', // 'categories' | 'filters' | 'importList' | 'importForm' | 'smartImport'
    categories: [],
    categoryCounts: {},
    currentCategory: 'TOPIK Vocabulary', // Default
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
    importPlaceholderLines: ['apple 苹果', 'banana 香蕉', 'computer 电脑'],
    importPlaceholder: 'apple 苹果\nbanana 香蕉\ncomputer 电脑',
    suggestion: null
  },

  videoAd: null, // 激励视频广告实例

  switchVersion: function() {
    wx.showModal({
      title: '切换回旧版',
      content: '确定要切换回旧版界面吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('useNewVersion');
          wx.reLaunch({
            url: '/pages/index/index'
          });
        }
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
  },

  createVideoAd: function() {
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

  onShow: function () {
    this.createVideoAd();
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

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 4
      })
    }
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
    // 即使页面隐藏，也不要移除广告监听器，否则广告关闭回调无法触发
  },

  onUnload: function () {
    const app = getApp();
    if (app && typeof app.unregisterThemePage === 'function') {
      app.unregisterThemePage('settings', this);
    }
    // 不要销毁广告
    if (this.videoAd && this.onAdClose) {
       this.videoAd.offClose(this.onAdClose);
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

    const categoryCounts = await getCategoryCounts();
    const counts = categoryCounts && typeof categoryCounts === 'object' ? { ...categoryCounts } : {};
    counts['Mistakes (错题本)'] = this.data.mistakesCount || 0;

    const current = (this.data.settings && this.data.settings.category) || DEFAULT_SETTINGS.category;
    const idx = Math.max(0, categories.indexOf(current));

    // Check if data actually changed to avoid unnecessary re-renders (flickering)
    const isCategoriesChanged = JSON.stringify(categories) !== JSON.stringify(this.data.categories);
    const isCountsChanged = JSON.stringify(counts) !== JSON.stringify(this.data.categoryCounts);
    const isIdxChanged = idx !== this.data.categoryPickerIndex;

    if (isCategoriesChanged || isCountsChanged || isIdxChanged) {
        this.setData({ categories, categoryCounts: counts, categoryPickerIndex: idx });
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
          this.setData({
            categoryPickerIndex: this.data.categoryPickerIndex,
            yonseiLessonPickerIndex: this.data.yonseiLessonPickerIndex,
            topikLevelPickerIndex: this.data.topikLevelPickerIndex
          });
        }
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

  removeMistake: function (e) {
    const id = e.currentTarget.dataset.id;
    const res = removeMistake(id);
    if (!res.success) {
      wx.showToast({ title: '移除失败', icon: 'none' });
      return;
    }
    const nextList = (Array.isArray(this.data.mistakesList) ? this.data.mistakesList : []).filter(w => String(w.id) !== String(id));
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
           wx.showToast({ title: '已关闭免广告模式', icon: 'none' });
       } else {
           wx.setStorageSync('story_create_unlock_counter', 100);
           wx.showToast({ title: '已开启免广告模式', icon: 'success' });
       }
       this.clickCount = 0;
    }

    wx.setClipboardData({
      data: 'gaoyuhao1',
      success: () => wx.showToast({ title: '微信号已复制', icon: 'success' })
    });
  },

  loadLists: function () {
    const lists = getImportedLists();
    const next = (Array.isArray(lists) ? lists : []).map(l => ({
      ...l,
      formattedDate: formatDate(l.updatedAt || l.createdAt)
    }));
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
    wx.showModal({
      title: '删除词单',
      content: '确定要删除该词单吗？',
      confirmColor: '#ef4444',
      success: (res) => {
        if (!res.confirm) return;
        const result = deleteImportedList(id);
        if (result && result.success) {
          this.loadLists();
          wx.showToast({ title: '已删除', icon: 'success' });
        } else {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
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
    wx.showToast({ title: '暂不支持智能导入', icon: 'none' });
  },

  onCameraClick: function () {
    wx.showToast({ title: '暂不支持拍照导入', icon: 'none' });
  },

  preventBubble: function () {}
});
