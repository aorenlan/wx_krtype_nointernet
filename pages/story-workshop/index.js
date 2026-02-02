const formatTime = (ts) => {
  const date = new Date(Number(ts) || Date.now());
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${dd}/${mm}/${yy}`;
};

import { getWords, getGrammars } from '../../utils_nv/api';

const createAiModel = () => {
  try {
    const ai = wx.cloud && wx.cloud.extend && wx.cloud.extend.AI;
    if (!ai || typeof ai.createModel !== 'function') return null;
    return ai.createModel('hunyuan-exp');
  } catch (e) {
    return null;
  }
};

const containsChinese = (text) => /[\u4e00-\u9fa5]/.test(String(text || ''));

const isUnsafeContent = (text) => {
  const raw = String(text || '').toLowerCase();
  const keywordPattern = /(习近平|共产党|政府|台独|法轮功|天安门|色情|裸聊|裸照|强奸|成人视频|嫖娼|卖淫|杀人|爆炸|炸弹|枪支|恐怖|袭击)/i;
  return keywordPattern.test(raw);
};

const clampScore = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const rounded = Math.round(num);
  if (rounded < 0) return 0;
  if (rounded > 100) return 100;
  return rounded;
};

const unescapeJsonString = (value) => {
  return String(value || '')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
};

const formatCommentToHtml = (comment) => {
    if (!comment) return '';
    let safeComment = String(comment)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    
    // Convert **text** to <span style="font-weight: bold;">text</span>
    let commentHtml = safeComment.replace(/\*\*(.*?)\*\*/g, '<span style="font-weight: bold;">$1</span>');
    
    // Convert newlines to <br>
    commentHtml = commentHtml.replace(/\n/g, '<br>');
    return commentHtml;
};

const extractPartialEssayResult = (text) => {
  const raw = String(text || '');
  const result = {
      score: 0,
      comment: '',
      sentence_explanations: [],
      rewrite: ''
  };

  // Extract Score
  const scoreMatch = raw.match(/"score"\s*:\s*([0-9]{1,3})/) || raw.match(/score\s*[:：]\s*([0-9]{1,3})/i);
  if (scoreMatch) result.score = clampScore(scoreMatch[1]) || 0;

  // Extract Comment (Partial or Complete)
  const commentStartRegex = /"comment"\s*:\s*"/;
  const commentStart = raw.match(commentStartRegex) || raw.match(/"点评"\s*:\s*"/);
  if (commentStart) {
      const startIndex = commentStart.index + commentStart[0].length;
      let content = raw.slice(startIndex);
      
      // Find closing quote that is NOT escaped
      let endIndex = -1;
      for (let i = 0; i < content.length; i++) {
          if (content[i] === '"' && (i === 0 || content[i-1] !== '\\')) {
              endIndex = i;
              break;
          }
      }
      
      if (endIndex !== -1) {
          content = content.slice(0, endIndex);
      }
      // If no closing quote, use all content (streaming)
      
      result.comment = unescapeJsonString(content);
  }

  // Extract Sentence Explanations (Partial or Complete)
  // Regex body for a JSON string value
  const strBody = '"((?:[^"\\\\]|\\\\.)*)"';
  const pairRegex = new RegExp(`"sentence"\\s*:\\s*${strBody}\\s*,\\s*"explanation"\\s*:\\s*${strBody}`, 'g');
  let pair;
  // Use a fresh regex execution loop on the full text
  while ((pair = pairRegex.exec(raw)) !== null) {
    result.sentence_explanations.push({
      sentence: unescapeJsonString(pair[1]),
      explanation: unescapeJsonString(pair[2])
    });
  }

  return result;
};

const extractEssayResultFromText = (text) => {
  const raw = String(text || '');
  const result = {};

  const scoreMatch = raw.match(/"score"\s*:\s*([0-9]{1,3})/) || raw.match(/score\s*[:：]\s*([0-9]{1,3})/i) || raw.match(/"评分"\s*:\s*([0-9]{1,3})/);
  if (scoreMatch) result.score = clampScore(scoreMatch[1]);

  // Regex body for a JSON string value: matches "content" where content can contain escaped quotes
  // Capture group 1 is the content.
  const strBody = '"((?:[^"\\\\]|\\\\.)*)"';

  const commentMatch = raw.match(new RegExp(`"comment"\\s*:\\s*${strBody}`)) || 
                       raw.match(new RegExp(`"点评"\\s*:\\s*${strBody}`)) || 
                       raw.match(new RegExp(`"feedback"\\s*:\\s*${strBody}`));
  if (commentMatch) result.comment = unescapeJsonString(commentMatch[1]);

  const rewriteMatch = raw.match(new RegExp(`"rewrite"\\s*:\\s*${strBody}`)) || 
                       raw.match(new RegExp(`"改写"\\s*:\\s*${strBody}`)) || 
                       raw.match(new RegExp(`"model_answer"\\s*:\\s*${strBody}`));
  if (rewriteMatch) result.rewrite = unescapeJsonString(rewriteMatch[1]);

  const sentences = [];
  const pairRegex = new RegExp(`"sentence"\\s*:\\s*${strBody}\\s*,\\s*"explanation"\\s*:\\s*${strBody}`, 'g');
  let pair;
  while ((pair = pairRegex.exec(raw)) !== null) {
    sentences.push({
      sentence: unescapeJsonString(pair[1]),
      explanation: unescapeJsonString(pair[2])
    });
  }
  if (sentences.length) result.sentence_explanations = sentences;

  return Object.keys(result).length ? result : null;
};

const normalizeEssayResult = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const score = clampScore(raw.score != null ? raw.score : raw.评分);
  const comment = raw.comment != null ? raw.comment : (raw.review != null ? raw.review : (raw.feedback != null ? raw.feedback : (raw.点评 != null ? raw.点评 : '')));
    const rewrite = raw.rewrite != null ? raw.rewrite : (raw.rewrite_text != null ? raw.rewrite_text : (raw.model_answer != null ? raw.model_answer : (raw.改写 != null ? raw.改写 : '')));
    
    // Clean rewrite field: remove HTML tags
    const cleanRewrite = rewrite ? String(rewrite).replace(/<[^>]+>/g, '') : '';
    
    // Format comment: convert **text** to <b>text</b> for rich-text display
    let commentHtml = '';
    if (comment) {
        commentHtml = formatCommentToHtml(comment);
    }

    const rawSentences = Array.isArray(raw.sentence_explanations)
    ? raw.sentence_explanations
    : (Array.isArray(raw.sentenceExplanations) ? raw.sentenceExplanations : (Array.isArray(raw.explanations) ? raw.explanations : (Array.isArray(raw.拆句讲解) ? raw.拆句讲解 : [])));
  return {
    score: score == null ? 0 : score,
    comment: comment != null ? String(comment) : '',
    commentHtml: commentHtml, // Add html formatted comment
    sentence_explanations: (Array.isArray(rawSentences) ? rawSentences : [])
      .filter(item => item)
      .map(item => ({
        sentence: item.sentence != null ? String(item.sentence) : (item.text != null ? String(item.text) : ''),
        explanation: item.explanation != null ? String(item.explanation) : (item.analysis != null ? String(item.analysis) : '')
      })),
    rewrite: cleanRewrite
  };
};

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    dark: false,
    messages: [],
    allMessages: [],
    filterMode: 'current', // 'current' | 'all' | 'essay'
    bottomId: 'bottom-0',
    scrollIntoView: '',
    loading: true,
    showRulesModal: false,
    currentCourseInfo: '',
    searchQuery: '',
    
    // Essay Practice Data
    essayPrompts: { words: [], grammars: [] },
    essayContent: '',
    essayResult: null,
    essayError: null,
    isSubmitting: false,
    submitStatus: 'idle', // 'idle' | 'thinking' | 'generating'
    scrollTarget: '',

    // Detail Modal Data
    showDetailModal: false,
    detailType: 'word', // 'word' | 'grammar'
    detailData: null,

    rules: [
      { icon: '📚', title: '课程生成', desc: '会根据你当前选择的课程进度，展示对应的文章。' },
      { icon: '✍️', title: '短文练习', desc: '根据当前课程随机出题（单词+语法），智能批改并打分。' },
      { icon: '🧠', title: '科学复习', desc: '通过将生词融入有趣的故事场景，帮助你在语境中自然记忆，摆脱死记硬背。' },
      { icon: '🚫', title: '关于上传', desc: '暂时不支持用户自己上传，后期会根据课程完善相关目录数据。' }
    ]
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const navBarHeight = menuButtonInfo ? (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height : 44;
    
    this.setData({ statusBarHeight, navBarHeight });
    this.initRewardedAd();
    this.loadStories();
  },

  initRewardedAd() {
    if (!wx.createRewardedVideoAd) return;
    this._rewardedAd = wx.createRewardedVideoAd({
      adUnitId: 'adunit-dbc27ff5b3e89195'
    });
    this._rewardedAd.onError((err) => {
      console.error('rewarded video error', err);
    });
    this._rewardedAd.onClose((res) => {
      // If ad was already marked completed (e.g. via timeout/skip), ignore this event
      // to prevent a late "skip" action from blocking the result.
      if (this._adCompleted) {
          return;
      }

      const finished = res && res.isEnded === false ? false : true;
      if (!finished) {
        this._adBlocked = true;
        this._pendingEssayResult = null;
        this._pendingEssayContext = null;
        this.finishSubmitting();
        wx.showToast({ title: '未看完无法提交', icon: 'none' });
        return;
      }
      this._adCompleted = true;
      if (this._pendingEssayResult && this._pendingEssayContext) {
        this.applyEssayResult(this._pendingEssayResult, this._pendingEssayContext);
      }
    });
  },

  confirmAdGate() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '提交审核',
        content: '审批大约需要30s，完整看一个视频后可获取详细批改。',
        showCancel: true,
        confirmText: '开始观看',
        cancelText: '取消',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });
  },

  showRewardedAdWithTimeout(timeoutMs = 5000) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        console.warn('Ad show timeout, resolving false');
        resolve(false);
      }, timeoutMs);

      this.showRewardedAd()
        .then((ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(!!ok);
        })
        .catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(false);
        });
    });
  },

  async showRewardedAd() {
    // Re-initialize if missing (e.g. createRewardedVideoAd failed initially or instance lost)
    if (!this._rewardedAd && wx.createRewardedVideoAd) {
      this.initRewardedAd();
    }
    
    if (!this._rewardedAd) return false;
    
    try {
      await this._rewardedAd.show();
      return true;
    } catch (e) {
      console.warn('Ad show failed, retrying load...', e);
      try {
        await this._rewardedAd.load();
        await this._rewardedAd.show();
        return true;
      } catch (err) {
        console.error('rewarded video show failed', err);
        wx.showToast({ title: '广告加载失败', icon: 'none' });
        return false;
      }
    }
  },

  finishSubmitting() {
    if (this.data.isSubmitting) {
        this.setData({ 
            isSubmitting: false,
            submitStatus: 'idle'
        });
    }
  },

  applyEssayResult(resultData, context) {
    if (!resultData || !context) {
      this.finishSubmitting();
      return;
    }
    this._pendingEssayResult = null;
    this._pendingEssayContext = null;
    const essayError = this._pendingEssayError || null;
    this._pendingEssayError = null;
    this.setData({ essayResult: resultData, essayError });
    wx.showToast({ title: '批改完成', icon: 'success' });
    wx.cloud.callFunction({
      name: 'checkEssay',
      data: {
        action: 'save',
        resultData,
        content: context.content,
        prompts: context.prompts,
        category: context.category,
        lessonId: context.lessonId,
        topikLevel: context.topikLevel,
        topikSession: context.topikSession
      }
    }).catch(err => {
        console.error('Failed to save essay result:', err);
        if (err.message && err.message.includes('access_token')) {
            wx.showToast({ title: '保存失败: 登录态失效', icon: 'none' });
        } else {
            // Optional: Don't show generic error to avoid annoying user if it's just a background save
            // But if it's important, we should.
            // wx.showToast({ title: '保存记录失败', icon: 'none' });
        }
    });
    this.finishSubmitting();
  },

  handleEssayResult(resultData, context) {
    if (this._adBlocked) {
      this.finishSubmitting();
      return;
    }
    if (this._adCompleted) {
      this.applyEssayResult(resultData, context);
      return;
    }
    this._pendingEssayResult = resultData;
    this._pendingEssayContext = context;
  },

  retryEssay() {
      if (this.data.isSubmitting) return;
      this._skipAdOnce = true;
      this.submitEssay();
  },

  onShow() {
    // Try to get settings from storage
    const settings = wx.getStorageSync('settings') || {};
    const oldSettings = this.data.settings || {};

    // Check if course changed
    const isCourseChanged = 
        settings.category !== oldSettings.category ||
        (settings.category && settings.category.includes('Yonsei') && settings.yonseiLessonId !== oldSettings.yonseiLessonId) ||
        (settings.category === 'TOPIK Vocabulary' && (settings.topikLevel !== oldSettings.topikLevel || settings.topikSession !== oldSettings.topikSession));
    
    // Format current course info
    let courseInfo = '';
    let isMistakes = false;

    if (settings.category) {
        if (settings.category === 'Mistakes (错题本)') {
             courseInfo = '错题本';
             isMistakes = true;
        } else if (settings.category === 'TOPIK Vocabulary') {
             const level = settings.topikLevel || '1';
             const session = settings.topikSession || '1';
             courseInfo = `TOPIK ${level}-${session}`;
        } else if (settings.category.includes('Yonsei')) {
             courseInfo = 'Yonsei ' + settings.category.replace('Yonsei', '').trim();
             if (settings.yonseiLessonId) {
                  courseInfo += ` - 第${settings.yonseiLessonId}课`;
             }
        } else {
             courseInfo = settings.category;
        }
    } else {
        courseInfo = '未选择课程';
    }
    
    const dataToSet = { 
        dark: !!settings.darkMode,
        currentCourseInfo: courseInfo,
        settings // Store settings in data to ensure applyFilter uses the same source
    };

    let shouldRefreshEssay = false;
    if (isCourseChanged) {
        // If user is currently in essay mode, refresh the essay prompts immediately
        if (this.data.filterMode === 'essay') {
            shouldRefreshEssay = true;
        } else {
            // Otherwise, clear essay prompts so it refreshes when user switches to essay tab
            dataToSet.essayPrompts = { words: [], grammars: [] };
            dataToSet.essayResult = null;
            dataToSet.essayContent = '';
        }
    }

    this.setData(dataToSet, () => {
        if (shouldRefreshEssay) {
            this.refreshEssayPrompts();
        }
    });

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1, hidden: false });
    }
    
    // Check if we need to force refresh (e.g. after new story)
    // Check both globalData and Storage
    const app = getApp();
    const refreshNeeded = app.globalData.storyRefreshNeeded || wx.getStorageSync('story_refresh_needed');
    
    if (refreshNeeded) {
        app.globalData.storyRefreshNeeded = false;
        wx.removeStorageSync('story_refresh_needed');
        this.loadStories(true); // Force refresh
    } else {
        // If coming back from detail page (and no force refresh needed), skip reload
        // to preserve optimistic updates (like view count +1)
        if (this.justViewedDetail) {
            this.justViewedDetail = false;
            // Re-apply filter in case settings changed while in detail page (unlikely but possible)
            this.applyFilter();
            return;
        }

        // Otherwise use cache logic inside loadStories
        this.loadStories(false);
    }
  },

  async loadStories(force = false) {
    // Cache check for BOTH date and heat modes
    // Use v3 to invalidate previous cache
    const cacheKey = `story_cache_v3_${this.data.sortMode}`;
    if (!force) {
        const cache = wx.getStorageSync(cacheKey);
        const now = Date.now();
        // Cache valid for 5 minutes (300000ms)
        if (cache && cache.data && cache.time && (now - cache.time < 300000)) {
            console.log('Using cached stories for', this.data.sortMode);
            this.setData({ 
                allMessages: cache.data,
                loading: false
            });
            this.applyFilter();
            return;
        }
    }

    this.setData({ loading: true });
    try {
      // Get current filter settings
      const settings = this.data.settings || wx.getStorageSync('settings') || {};
      
      const orderByField = this.data.sortMode === 'heat' ? 'viewCount' : 'createdAt';

      const res = await wx.cloud.callFunction({
        name: 'storySync',
        data: { 
            action: 'list',
            payload: {
                orderByField,
                orderDirection: 'desc',
                limit: 100 // User requested 100 items pagination
            }
        }
      });

      console.log('【Client Log】storySync response:', res);
      
      if (res && res.result && res.result.data) {
        let rawList = res.result.data;
        console.log('【Client Log】Data length:', rawList.length);
        if (rawList.length > 0) {
            console.log('【Client Log】First item _openid:', rawList[0]._openid);
        }
        
        // Filter logic:
        // 1. By default show ALL stories sorted by time (newest first).
        // 2. User asked to "also filter by current category". 
        // Actually, user said: "Default enter is ALL works under CURRENT COURSE, but can also sort by time to view ALL categories".
        // Let's implement a simple tab or just sort by time for now as "All Categories" is safer default,
        // but if we strictly follow "Default enter is current course works", we should filter.
        // However, if user has no stories in current course, it looks empty.
        // Let's stick to showing ALL for now but add labels, or maybe client-side filter if needed.
        // Re-reading user request: "In main list user default enters is works under current course, but can also view all categories sorted by time".
        
        // So we need a filter toggle.
        // Let's process all first, then filter in render or separate list?
        // Better: Fetch all, then filter client side for smooth toggle.
        
        const messages = rawList.map(item => {
          // Add labels
          let timeLabel = formatTime(item.createdAt);
          
          // Source Label: Category + Lesson (e.g., Y1-1 Lesson 2 -> Y1-1 L2 or just Y1-1)
          // User wants "Yonsei 1" -> Y1-1 etc.
          let sourceLabel = '';
          if (item.category) {
             if (item.category === 'TOPIK Vocabulary') {
                 // Format TOPIK 1-1
                 const level = item.topikLevel || '1';
                 const session = item.topikSession || '1';
                 sourceLabel = `TOPIK ${level}-${session}`;
             } else if (item.category.includes('Yonsei')) {
                 sourceLabel = 'Y ' + item.category.replace('Yonsei', '').trim();
                 // Try to append lesson info if available
                 // item.lessonName usually looks like "Lesson 1 ..." or just "1"
                 if (item.lessonName) {
                    const match = String(item.lessonName).match(/(\d+)/);
                    if (match) {
                        sourceLabel += '-' + match[1];
                    }
                 } else if (item.lessonId) {
                    // Fallback to lessonId if no name
                    sourceLabel += '-' + item.lessonId;
                 }
             } else {
                 sourceLabel = item.category;
             }
          }
          
          // Elements parsing
          let elements = item.elements;
          // If stored as string (legacy), try parse? But usually object.
          
          return {
            ...item,
            mid: item._id,
            timeLabel,
            sourceLabel,
            elements,
            viewCount: item.viewCount || 0
          };
        });

        this.setData({ 
            allMessages: messages,
            loading: false 
        });
        
        // Cache for current sort mode
        const cacheKey = `story_cache_v2_${this.data.sortMode}`;
        wx.setStorageSync(cacheKey, {
            data: messages,
            time: Date.now()
        });

        this.applyFilter();
      } else {
        throw new Error('No data');
      }
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
      // If error, maybe show empty or toast
    }
  },

  setSort(e) {
    const mode = e.currentTarget.dataset.mode;
    if (this.data.sortMode === mode) return;
    this.setData({ sortMode: mode });
    this.loadStories(true);
  },

  onSearchInput(e) {
    const val = e.detail.value;
    this.setData({ searchQuery: val }, () => {
        this.applyFilter();
    });
  },

  clearSearch() {
    this.setData({ searchQuery: '' }, () => {
        this.applyFilter();
    });
  },

  applyFilter() {
    const { allMessages, filterMode, searchQuery } = this.data;
    if (!allMessages) {
        // Should not happen if loaded, but safe check
        this.setData({ messages: [] });
        return;
    }
    
    let baseList = [];

    if (filterMode === 'all') {
      baseList = allMessages;
    } else {
      // Filter by current settings
      // Use this.data.settings first to match onShow logic, fallback to storage
      const settings = this.data.settings || wx.getStorageSync('settings') || {};
      const cat = settings.category;
      
      if (!cat) {
        // If no settings, just show all (or maybe empty? Let's show all for now)
        baseList = allMessages;
      } else {
        baseList = allMessages.filter(m => {
          // Loose match
          if (!m.category) return false;
          
          if (m.category === 'TOPIK Vocabulary' && cat === 'TOPIK Vocabulary') {
              const targetLevel = String(settings.topikLevel || '');
              const targetSession = String(settings.topikSession || '');
              const itemLevel = String(m.topikLevel || '');
              const itemSession = String(m.topikSession || '');
              
              // Only match if level and session match (if settings exist)
              // If settings are missing level/session, maybe loose match? But settings usually have defaults.
              return itemLevel === targetLevel && itemSession === targetSession;
          }

          const catMatch = m.category === cat;
          let lessonMatch = true;
          
          // Yonsei Lesson Check
          const lid = settings.yonseiLessonId;
          if (lid && m.lessonId && cat.includes('Yonsei')) {
            lessonMatch = String(m.lessonId) === String(lid);
          }
          return catMatch && lessonMatch;
        });
      }
    }

    // Apply Fuzzy Search if query exists
    if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        baseList = baseList.filter(m => {
            if (!m.elements || !m.elements.who) return false;
            return String(m.elements.who).toLowerCase().includes(q);
        });
    }
    
    this.setData({ messages: baseList });
  },

  setFilter(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.filterMode) return;
    
    this.setData({ filterMode: mode }, () => {
      if (mode === 'essay') {
          // Refresh prompts if empty OR if settings changed (detected via empty check strategy above)
          // But actually, we should check if current prompts match current settings?
          // Simpler: if prompts are empty (cleared by onShow), refresh.
          if (!this.data.essayPrompts || !this.data.essayPrompts.words || !this.data.essayPrompts.words.length) {
              this.refreshEssayPrompts();
          }
      } else {
          this.applyFilter();
      }
    });
  },

  async refreshEssayPrompts() {
      // Use this.data.settings (which is updated in onShow) or fallback to storage
      // Ensure we have the LATEST settings
      const settings = this.data.settings || wx.getStorageSync('settings') || {};
      const category = settings.category;
      
      console.log('Refreshing Essay Prompts with settings:', settings);

      wx.showLoading({ title: '出题中...' });
      
      try {
          // Get Words
          // Must pass explicit filters to getWords
          const wordRes = await getWords(category, 100, 0, {
              lessonId: settings.yonseiLessonId,
              topikLevel: settings.topikLevel,
              topikSession: settings.topikSession
          });
          
          let allWords = wordRes.words || [];
          if (allWords.length === 0) {
             const fallbackRes = await getWords(category, 50, 0);
             allWords = fallbackRes.words || [];
          }

          // Shuffle and pick 5
          allWords.sort(() => 0.5 - Math.random());
          const selectedWords = allWords.slice(0, 5);
          
          // Get Grammars
          const allGrammars = await getGrammars(category, settings.yonseiLessonId);
          // Shuffle
          const shuffledGrammars = [...allGrammars].sort(() => 0.5 - Math.random());
          const selectedGrammars = shuffledGrammars.slice(0, Math.floor(Math.random() * 2) + 1); // 1 or 2
          
          this.setData({
              essayPrompts: {
                  words: selectedWords,
                  grammars: selectedGrammars
              },
              essayResult: null,
              essayError: null,
              essayContent: '' 
          });
      } catch (e) {
          console.error(e);
          wx.showToast({ title: '获取题目失败', icon: 'none' });
      } finally {
          wx.hideLoading();
      }
  },

  onEssayInput(e) {
      const value = e.detail.value;
      
      // Check for Chinese characters
      if (containsChinese(value)) {
          wx.showToast({
              title: '只能输入韩语哦',
              icon: 'none',
              duration: 2000
          });
      }
      
      this.setData({ essayContent: value });
  },

  clearEssay() {
      wx.showModal({
          title: '确认清空',
          content: '确定要清空当前内容和批改结果吗？',
          success: (res) => {
              if (res.confirm) {
                  this.setData({
                      essayContent: '',
                      essayResult: null,
                      essayError: null
                  });
              }
          }
      });
  },

  async submitEssay() {
      console.log('submitEssay triggered', {
          isSubmitting: this.data.isSubmitting,
          contentLength: this.data.essayContent?.length
      });

      if (this.data.isSubmitting) {
          console.log('submitEssay aborted: isSubmitting is true');
          return;
      }
      const content = this.data.essayContent.trim();
      if (!content) {
          console.log('submitEssay aborted: content is empty');
          return;
      }

      // Validation: Check for Chinese characters
      if (containsChinese(content)) {
          wx.showToast({
              title: '请仅使用韩语写作',
              icon: 'none'
          });
          return;
      }

      if (isUnsafeContent(content)) {
          wx.showToast({
              title: '内容不合规',
              icon: 'none'
          });
          return;
      }
      
      const settings = this.data.settings || wx.getStorageSync('settings') || {};
      const skipAdOnce = this._skipAdOnce === true;
      this._skipAdOnce = false;

      this._adCompleted = skipAdOnce;
      this._adBlocked = false;
      this._pendingEssayResult = null;
      this._pendingEssayContext = null;
      this._pendingEssayError = null;

      this.setData({ 
          isSubmitting: true, 
          submitStatus: 'thinking',
          essayError: null,
          scrollTarget: '' 
      });

      if (!skipAdOnce) {
          const confirmed = await this.confirmAdGate();
          if (!confirmed) {
              this.finishSubmitting();
              return;
          }

          const adStarted = await this.showRewardedAdWithTimeout(5000);
          if (!adStarted) {
              console.log('Ad failed to start or timed out, skipping ad check.');
              this._adCompleted = true;
              // Inform user that we are skipping the ad
              wx.showToast({
                  title: '广告加载超时，已自动跳过',
                  icon: 'none',
                  duration: 2000
              });
          }
      }

      try {
          console.log('Calling checkEssay cloud function...');

          // Try Frontend AI first (like HiLiao)
          const aiModel = createAiModel();
          if (aiModel) {
             console.log('Using Frontend AI Model...');
             const prompts = this.data.essayPrompts;
             const wordsStr = (prompts.words || []).map(w => w.word).join(', ');
             const grammarsStr = (prompts.grammars || []).map(g => g.grammar).join(', ');
             
             let levelInfo = '初学者';
             if (settings.category === 'TOPIK Vocabulary') {
                levelInfo = `TOPIK ${settings.topikLevel || '1'}级`;
             } else if (settings.category && settings.category.includes('Yonsei')) {
                levelInfo = `${settings.category} 第${settings.yonseiLessonId || '?'}课`;
             }

             const systemPrompt = `你是一位专业的韩语老师。请根据学生提交的韩语短文进行批改和评分。
             要求：
             1. 必须检查是否包含要求使用的单词：${wordsStr}
             2. 必须检查是否使用了要求的语法：${grammarsStr}
             3. **重点检查以下韩语常见错误**：
                - **敬语/阶称统一性**：检查是否混用了不同的敬语阶称（如同时使用尊敬阶“합쇼체/해요체”和非尊敬阶“해라체/반말”）。除非语境需要（如对话引用），否则全篇应保持一致。
                - **文体混用**：检查是否混用了书面语（词典形/해라체）和口语（해요체）。
                - **拼写错误**：检查是否有错别字。
             4. 评分标准：
                - 单词和语法使用情况 (30%)
                - **敬语、文体和拼写正确性** (40%)
                - 表达自然度和连贯性 (30%)
             5. 无论分数高低，都必须输出 sentence_explanations，把原文按句拆开，每句给中文讲解。
                - 解析句子时，必须结合全文语境来判断语态、时态和含义，禁止仅做孤立的单句分析。
                - **如果句子中有【敬语不统一】、【文体混用】、【错别字】或语法错误**，请在 sentence 字段中用 <span style="color: #ef4444;">错误部分</span> 标红显示错误，并在 explanation 中明确指出错误类型（如“敬语混用”、“拼写错误”）并给出正确写法。
                - 注意：在 explanation 中，**不要**批评该句未包含指定的单词或语法（这是针对整篇文章的要求，而非单句）。
             6. 当分数 >= 80：rewrite 置为空字符串。重点在于指出文中的小错误（如有）。
             7. 当分数 < 80：必须输出 rewrite，给出一篇符合要求的完整韩语短文。注意：改写时必须使用适合【${levelInfo}】水平的单词和语法，确保学生能够理解，避免使用过于高深的词汇。**rewrite 内容必须精简，篇幅应与原文相当（约100-150字），严禁长篇大论。**rewrite 内容必须是纯文本，严禁包含任何 HTML 标签（如 <span>, <p> 等）。
             8. 严禁输出 Markdown 代码块标记（如 \`\`\`json），请直接输出纯 JSON 字符串。
                - 必须确保所有字符串（特别是 explanation 字段）中的换行符都已转义（使用 \\n）。
                - 绝对禁止在 JSON 字符串值中直接使用未转义的换行符。
                - 必须只输出 JSON 对象本身，禁止任何额外文字。
                - 必须输出完整字段，缺失字段也要给空值：comment 为空字符串，sentence_explanations 为空数组，rewrite 为空字符串。
                - 如果格式确实无法保证，请退化为最小 JSON：{"score": 数字, "comment":"", "sentence_explanations":[], "rewrite":""}
                格式如下：
             {
               "score": 0-100之间的整数,
               "comment": "详细的中文点评。请先肯定学生的优点，然后重点指出**敬语/文体/拼写**方面的问题（如有），最后给出改进建议。可以使用 **加粗** 来强调重点。",
               "sentence_explanations": [
                 {
                   "sentence": "原文中的一句韩语（如有错误请按要求标红）",
                   "explanation": "该句的中文讲解（务必指出敬语、文体、拼写等具体错误）"
                 }
               ],
               "rewrite": "当分数<80时提供的合格韩语短文（纯文本，无HTML标签，精简）"
             }
             如果文章完全无关、无法识别或字数过少，请给低分并说明原因。但务必注意：即使这种情况下，也必须生成一个 rewrite（合格改写/范文），展示如何使用要求的单词和语法写出正确的短文，供学生参考学习。绝不允许 rewrite 为空！`;

             try {
                const res = await aiModel.streamText({
                    data: {
                        model: 'hunyuan-turbos-latest',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content }
                        ]
                    }
                });

                let aiText = '';
                // Init shell for streaming
                let currentResult = { score: 0, comment: '正在分析中...', commentHtml: '正在分析中...', sentence_explanations: [], rewrite: '' };
                this.setData({ essayResult: currentResult });

                let lastUpdateLen = 0;
                let hasScrolled = false;
                let isAnalysisToastShown = false;

                for await (const str of res.textStream) {
                    aiText += str;
                    // Update UI every ~10 chars or so to avoid too many setDatas, but for text stream 10 is fine
                    if (aiText.length - lastUpdateLen > 5) {
                        lastUpdateLen = aiText.length;
                        
                        // Update status to generating if not already
                        if (this.data.submitStatus !== 'generating') {
                             this.setData({ submitStatus: 'generating' });
                        }

                        // Scroll to result section once when content starts streaming
                        if (!hasScrolled && aiText.length > 10) {
                            hasScrolled = true;
                            this.setData({ scrollTarget: 'essay-result-section' });
                        }

                        const partial = extractPartialEssayResult(aiText);
                        
                        // Update UI with partial result
                        const updates = {};
                        let hasChanges = false;
                        
                        if (partial.comment) {
                            const formatted = formatCommentToHtml(partial.comment);
                            if (formatted !== currentResult.commentHtml) {
                                currentResult.comment = partial.comment;
                                currentResult.commentHtml = formatted;
                                updates['essayResult.comment'] = partial.comment;
                                updates['essayResult.commentHtml'] = formatted;
                                hasChanges = true;
                            }
                        }
                        
                        if (partial.score > 0 && partial.score !== currentResult.score) {
                            currentResult.score = partial.score;
                            updates['essayResult.score'] = partial.score;
                            hasChanges = true;
                        }

                        if (partial.sentence_explanations.length > currentResult.sentence_explanations.length) {
                             currentResult.sentence_explanations = partial.sentence_explanations;
                             updates['essayResult.sentence_explanations'] = partial.sentence_explanations;
                             hasChanges = true;
                             
                             // Show toast when analysis starts coming in (detected first sentence)
                             if (!isAnalysisToastShown) {
                                 isAnalysisToastShown = true;
                                 wx.showToast({
                                     title: '解析生成中...',
                                     icon: 'none',
                                     duration: 2000
                                 });
                             }
                        }
                        
                        // Keep scrolling to bottom as content grows
                        if (hasChanges) {
                             // Use a toggle to ensure scroll-into-view triggers even if value is same string
                             // But since we want to stick to bottom, we can just clear it and set it back? 
                             // No, that's too much thrashing.
                             // Better approach: calculate a large scrollTop.
                             // But we don't have easy access to height in logic layer without query.
                             // Let's try the toggle trick with two anchors at bottom?
                             // Or just set it to 'result-bottom-anchor' every time. 
                             // If it doesn't trigger, we might need to set it to '' then back to 'result-bottom-anchor' in next tick.
                             // Let's try setting it directly first.
                             
                             // To make sure it triggers, we can use a sequence of updates.
                             // But `setData` is async.
                             
                             // Let's just update scrollTarget to bottom anchor.
                             // If the previous value was 'essay-result-section', it will scroll down.
                             // If it was already 'result-bottom-anchor', it might not scroll again if the view grew.
                             
                             // Workaround: We really want "stick to bottom".
                             // We can use a unique ID for each update? No, ID must exist in WXML.
                             // We can use the last item's ID?
                             // If sentence_explanations added a new item, scroll to that item!
                             
                             if (partial.sentence_explanations.length > 0) {
                                 const lastIdx = partial.sentence_explanations.length - 1;
                                 updates['scrollTarget'] = `explain-${lastIdx}`;
                             } else {
                                 updates['scrollTarget'] = 'result-bottom-anchor';
                             }
                             
                             this.setData(updates);
                        }
                    }
                }
                console.log('Frontend AI Response:', aiText);

                // Clean up markdown code blocks if any
                aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
                
                let rawResult = null;
                let hadParseError = false;
                try {
                    rawResult = JSON.parse(aiText);
                } catch (parseErr) {
                    hadParseError = true;
                    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const jsonStr = jsonMatch[0];
                        try {
                            rawResult = JSON.parse(jsonStr);
                        } catch (e2) {
                            try {
                                const fixedStr = jsonStr.replace(/"(?:[^\\"]|\\.)*"/g, (match) => {
                                    return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
                                });
                                rawResult = JSON.parse(fixedStr);
                            } catch (e3) {
                                rawResult = null;
                            }
                        }
                    }
                }

                if (!rawResult) {
                    const extracted = extractEssayResultFromText(aiText);
                    if (extracted) {
                        rawResult = extracted;
                        hadParseError = true;
                    } else if (aiText && aiText.trim().length > 0) {
                        // If extraction fails but we have text, treat it as comment
                        console.warn('Parsing failed completely, using raw text as comment');
                        rawResult = {
                            score: 0,
                            comment: aiText,
                            sentence_explanations: [],
                            rewrite: ''
                        };
                        hadParseError = true;
                    }
                }

                const normalizedResult = normalizeEssayResult(rawResult);
                if (normalizedResult) {
                    const context = {
                        content,
                        prompts: this.data.essayPrompts,
                        category: settings.category,
                        lessonId: settings.yonseiLessonId,
                        topikLevel: settings.topikLevel,
                        topikSession: settings.topikSession
                    };

                    // Validation: Check for chaotic/empty format
                    // Even if parsing succeeded, check for meaningful content
                    const isMalformed = 
                        !normalizedResult.comment || 
                        normalizedResult.comment.length < 5 || 
                        !normalizedResult.sentence_explanations || 
                        normalizedResult.sentence_explanations.length === 0;

                    if (hadParseError || isMalformed) {
                        this._pendingEssayError = { message: '打分异常', canRetry: true };
                        this._skipAdOnce = true;
                        if (isMalformed) {
                             console.warn('Essay result marked as malformed:', normalizedResult);
                        }
                    }
                    this.handleEssayResult(normalizedResult, context);
                    return;
                }
             } catch (aiErr) {
                 console.error('Frontend AI failed, falling back to cloud function:', aiErr);
             }
          }

          // Fallback to Cloud Function if Frontend AI fails or is unavailable
          const res = await wx.cloud.callFunction({
              name: 'checkEssay',
              data: {
                  content,
                  prompts: this.data.essayPrompts,
                  category: settings.category,
                  lessonId: settings.yonseiLessonId,
                  topikLevel: settings.topikLevel,
                  topikSession: settings.topikSession
              }
          });
          
          console.log('checkEssay result:', res);

          if (res.result && res.result.success) {
              const rawResult = res.result.data || {};
              const normalizedResult = normalizeEssayResult(rawResult);
              if (normalizedResult) {
                  const context = {
                      content,
                      prompts: this.data.essayPrompts,
                      category: settings.category,
                      lessonId: settings.yonseiLessonId,
                      topikLevel: settings.topikLevel,
                      topikSession: settings.topikSession
                  };
                  this.handleEssayResult(normalizedResult, context);
                  return;
              }
          }
          this._skipAdOnce = true;
          this.setData({ essayResult: null, essayError: { message: '打分异常', canRetry: true } });
          this.finishSubmitting();
      } catch (e) {
          if (!this._adBlocked) {
            console.error('checkEssay call failed:', e);
            wx.showToast({ title: '打分异常', icon: 'none', duration: 3000 });
          }
          this._skipAdOnce = true;
          this.setData({ essayResult: null, essayError: { message: '打分异常', canRetry: true } });
          this.finishSubmitting();
      }
  },

  openEssayHistory() {
      console.log('openEssayHistory clicked');
      wx.navigateTo({ url: '/subpackages/story/pages/essay-history/index' });
  },

  openDetail(e) {
    const id = e.currentTarget.dataset.id;
    
    // Optimistic update for view count
    // Update allMessages (source of truth) and then re-filter
    const { allMessages } = this.data;
    const idx = allMessages.findIndex(m => m.mid === id || m._id === id);
    
    if (idx > -1) {
        const item = allMessages[idx];
        const nextCount = (item.viewCount || 0) + 1;
        
        // Update item in allMessages (create copy to avoid direct mutation issues if shared)
        const newAllMessages = [...allMessages];
        newAllMessages[idx] = { ...item, viewCount: nextCount };
        
        this.setData({ allMessages: newAllMessages }, () => {
            // Re-apply filter to update 'messages' correctly
            this.applyFilter();
            
            // Update cache to preserve optimistic update across tab switches
            const cacheKey = `story_cache_${this.data.sortMode}`;
            wx.setStorageSync(cacheKey, {
                data: newAllMessages,
                time: Date.now() // Reset time or keep old? Keep old usually, but reset means extending cache life.
                // Better to use current time or just not update time?
                // Let's update time so it stays fresh longer since we just interacted.
            });
        });
    }
    
    this.justViewedDetail = true;

    wx.navigateTo({
      url: `/subpackages/story/pages/detail/index?id=${id}`
    });
  },

  showRules() {
    this.setData({ showRulesModal: true });
  },

  hideRules() {
    this.setData({ showRulesModal: false });
  },

  showWordDetail(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showDetailModal: true,
      detailType: 'word',
      detailData: item
    });
  },

  showGrammarDetail(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showDetailModal: true,
      detailType: 'grammar',
      detailData: item
    });
  },

  hideDetail() {
    this.setData({
      showDetailModal: false,
      detailData: null
    });
  }
});
