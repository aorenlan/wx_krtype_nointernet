import { parseStreamedOutput } from '../../utils_nv/ai_helper';

const formatTime = (ts) => {
  const date = new Date(Number(ts) || Date.now());
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${dd}/${mm}/${yy}`;
};

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    dark: false,
    messages: [],
    allMessages: [],
    filterMode: 'current', // 'current' | 'all'
    bottomId: 'bottom-0',
    scrollIntoView: '',
    loading: true,
    showRulesModal: false,
    currentCourseInfo: '',
    searchQuery: ''
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const navBarHeight = menuButtonInfo ? (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height : 44;
    
    this.setData({ statusBarHeight, navBarHeight });
    this.loadStories();
  },

  onShow() {
    // Try to get settings from storage
    const settings = wx.getStorageSync('settings') || {};
    
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
    
    this.setData({ 
        dark: !!settings.darkMode,
        currentCourseInfo: courseInfo,
        canCreate: !isMistakes,
        settings // Store settings in data to ensure applyFilter uses the same source
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
      this.applyFilter();
    });
  },

  goToCreate() {
    wx.navigateTo({ url: '/subpackages/story/pages/create/index' });
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
  }
});
