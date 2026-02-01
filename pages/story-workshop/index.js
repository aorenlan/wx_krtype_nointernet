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
    isSubmitting: false,

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

  async showRewardedAd() {
    if (!this._rewardedAd) return false;
    try {
      await this._rewardedAd.show();
      return true;
    } catch (e) {
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
    if (this.data.isSubmitting) this.setData({ isSubmitting: false });
  },

  applyEssayResult(resultData, context) {
    if (!resultData || !context) {
      this.finishSubmitting();
      return;
    }
    this._pendingEssayResult = null;
    this._pendingEssayContext = null;
    this.setData({ essayResult: resultData });
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
        if (this.data.filterMode === 'essay') {
            shouldRefreshEssay = true;
        } else {
            // Clear essay prompts so it refreshes when user switches to essay tab
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
    const cacheKey = `story_cache_${this.data.sortMode}`;
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
      if (res && res.result && res.result.data) {
        let rawList = res.result.data;
        
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
        const cacheKey = `story_cache_${this.data.sortMode}`;
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
          if (!this.data.essayPrompts.words.length) {
              this.refreshEssayPrompts();
          }
      } else {
          this.applyFilter();
      }
    });
  },

  async refreshEssayPrompts() {
      const settings = this.data.settings || wx.getStorageSync('settings') || {};
      const category = settings.category;
      
      wx.showLoading({ title: '出题中...' });
      
      try {
          // Get Words
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
      const confirmed = await this.confirmAdGate();
      if (!confirmed) return;

      this._adCompleted = false;
      this._adBlocked = false;
      this._pendingEssayResult = null;
      this._pendingEssayContext = null;

      this.setData({ isSubmitting: true });
      const adStarted = await this.showRewardedAd();
      if (!adStarted) {
          this.finishSubmitting();
          return;
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
             7. 当分数 < 80：必须输出 rewrite，给出一篇符合要求的完整韩语短文。注意：改写时必须使用适合【${levelInfo}】水平的单词和语法，确保学生能够理解，避免使用过于高深的词汇。
             8. 严禁输出 Markdown 代码块标记（如 \`\`\`json），请直接输出纯 JSON 字符串。
                - 必须确保所有字符串（特别是 explanation 字段）中的换行符都已转义（使用 \\n）。
                - 绝对禁止在 JSON 字符串值中直接使用未转义的换行符。
                格式如下：
             {
               "score": 0-100之间的整数,
               "comment": "详细的中文点评。请先肯定学生的优点，然后重点指出**敬语/文体/拼写**方面的问题（如有），最后给出改进建议。",
               "sentence_explanations": [
                 {
                   "sentence": "原文中的一句韩语（如有错误请按要求标红）",
                   "explanation": "该句的中文讲解（务必指出敬语、文体、拼写等具体错误）"
                 }
               ],
               "rewrite": "当分数<80时提供的合格韩语短文"
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
                for await (const str of res.textStream) {
                    aiText += str;
                }
                console.log('Frontend AI Response:', aiText);

                // Clean up markdown code blocks if any
                aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
                
                let resultData = null;
                try {
                    resultData = JSON.parse(aiText);
                } catch (parseErr) {
                    console.warn('First JSON parse failed, trying to repair:', parseErr);
                    // Try to find JSON object in text
                    let jsonMatch = aiText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        let jsonStr = jsonMatch[0];
                        // Attempt to fix unescaped newlines in strings
                        // This is a heuristic: replace newlines that are likely inside strings
                        // A safer way for common LLM output is to assume newlines inside the structure are valid whitespace,
                        // but newlines INSIDE quotes are invalid.
                        // Since we can't easily distinguish, we'll try a common fix:
                        // If the error is 'Unexpected token', it might be a newline.
                        // Let's try replacing literal newlines with \n if the initial parse failed.
                        // Note: This is risky if the JSON is pretty-printed (contains valid newlines).
                        // However, most LLM JSON is compact or uses \n. 
                        // If we see actual line breaks in the string, it's usually the error source.
                        
                        try {
                            resultData = JSON.parse(jsonStr);
                        } catch (e2) {
                            // Smarter fix: Only escape control characters INSIDE strings
                            // Use regex to find strings and replace \n within them to fix "Unexpected token" errors
                            try {
                                const fixedStr = jsonStr.replace(/"(?:[^\\"]|\\.)*"/g, (match) => {
                                    return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
                                });
                                resultData = JSON.parse(fixedStr);
                            } catch (e3) {
                                console.error('All JSON parse attempts failed', e3);
                            }
                        }
                    }
                }

                if (resultData) {
                    const normalizedResult = {
                        ...resultData,
                        score: Number(resultData.score) || 0,
                        sentence_explanations: (Array.isArray(resultData.sentence_explanations) ? resultData.sentence_explanations : []).filter(item => item).map(item => ({
                            sentence: item.sentence ? String(item.sentence) : '',
                            explanation: item.explanation ? String(item.explanation) : ''
                        })),
                        rewrite: resultData.rewrite != null ? String(resultData.rewrite) : ''
                    };
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
              const normalizedResult = {
                  ...rawResult,
                  score: Number(rawResult.score) || 0,
                  sentence_explanations: (Array.isArray(rawResult.sentence_explanations) ? rawResult.sentence_explanations : []).filter(item => item).map(item => ({
                      sentence: item.sentence ? String(item.sentence) : '',
                      explanation: item.explanation ? String(item.explanation) : ''
                  })),
                  rewrite: rawResult.rewrite ? String(rawResult.rewrite) : ''
              };
              const context = {
                  content,
                  prompts: this.data.essayPrompts,
                  category: settings.category,
                  lessonId: settings.yonseiLessonId,
                  topikLevel: settings.topikLevel,
                  topikSession: settings.topikSession
              };
              this.handleEssayResult(normalizedResult, context);
          } else {
              console.error('checkEssay failed result:', res.result);
              throw new Error(res.result?.message || 'Check failed');
          }
      } catch (e) {
          if (!this._adBlocked) {
            console.error('checkEssay call failed:', e);
            wx.showToast({ title: '批改失败: ' + (e.message || '未知错误'), icon: 'none', duration: 3000 });
          }
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
