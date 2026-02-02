const app = getApp();

const formatTime = (ts) => {
  const date = new Date(Number(ts) || Date.now());
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${dd}/${mm}/${yy}`;
};

Page({
  data: {
    storyId: '',
    story: null,
    loading: true,
    mode: 'card', // 'card' | 'article'
    currentSegmentIndex: 0,
    statusBarHeight: 20,
    navBarHeight: 44,
    isSinglePage: false
  },

  onLoad(options) {
    const pages = getCurrentPages();
    this.setData({ isSinglePage: pages.length === 1 });

    if (options.id) {
      this.setData({ storyId: options.id });
      this.loadStory(options.id);
      
      // Increment view count silently
      wx.cloud.callFunction({
        name: 'storySync',
        data: {
          action: 'view',
          payload: { id: options.id }
        }
      }).catch(err => console.error('Failed to increment view count', err));
    }

    // First time hint
    const hasShownTip = wx.getStorageSync('hasShownDetailTip');
    if (!hasShownTip) {
      wx.showToast({
        title: '点击顶部图标切换阅读模式',
        icon: 'none',
        duration: 3000
      });
      wx.setStorageSync('hasShownDetailTip', true);
    }
    
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: windowInfo.statusBarHeight || 20,
      navBarHeight: 44
    });
  },

  async loadStory(id) {
    this.setData({ loading: true });
    try {
      // Try to find in global data or pages stack first for speed? 
      // Actually cloud fetch is safer for consistency if linked.
      // But we can try to get from opener event channel if passed.
      
      const res = await wx.cloud.callFunction({
        name: 'storySync',
        data: {
          action: 'get',
          payload: { id }
        }
      });

      if (res && res.result && res.result.data) {
        const item = res.result.data;
        const currentUserOpenid = res.result.currentUserOpenid;
        const story = this.processStoryData(item);
        
        // Check if current user is creator
        const isCreator = story._openid === currentUserOpenid;
        
        // Show share hint if creator and not shown before
        if (isCreator) {
          const hasShownShareHint = wx.getStorageSync('has_shown_share_hint_v1');
          if (!hasShownShareHint) {
            this.setData({ showShareHint: true });
            wx.setStorageSync('has_shown_share_hint_v1', true);
            
            // Auto hide after 5 seconds
            setTimeout(() => {
              this.setData({ showShareHint: false });
            }, 5000);
          }
        }
        
        this.setData({ story, loading: false, isCreator });
      } else {
        wx.showToast({ title: '故事不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },



  processStoryData(item) {
    // Standardize segments
    let segments = item.segments || [];
    
    // If old format (no segments, just korean/translation strings), construct one segment
    if (!segments.length && item.korean) {
      segments = [{
        korean: item.korean,
        chinese: item.translation || ''
      }];
    }

    // Process segments for display
    const displaySegments = segments.map(seg => ({
      ...seg,
      displayKorean: (seg.displayKorean && seg.displayKorean.length > 0) ? seg.displayKorean : this.parseMarkdown(seg.korean),
      chinese: seg.chinese
    }));

    // Time Label
    const timeLabel = formatTime(item.createdAt);

    // Source Label
    let sourceLabel = '';
    if (item.category) {
        if (item.category === 'TOPIK Vocabulary') {
            const level = item.topikLevel || '1';
            const session = item.topikSession || '1';
            sourceLabel = `TOPIK ${level}-${session}`;
        } else if (item.category.includes('Yonsei')) {
            sourceLabel = 'Y ' + item.category.replace('Yonsei', '').trim();
            if (item.lessonName) {
            const match = String(item.lessonName).match(/(\d+)/);
            if (match) {
                sourceLabel += '-' + match[1];
            }
            } else if (item.lessonId) {
            sourceLabel += '-' + item.lessonId;
            }
        } else {
            sourceLabel = item.category;
        }
    }

    return {
      ...item,
      timeLabel,
      sourceLabel,
      segments: displaySegments,
      wordsSection: item.wordsSection || '',
      grammarSection: item.grammarSection || ''
    };
  },

  parseMarkdown(text) {
    if (!text) return [];
    // Simple bold parser **text**
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map(part => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return { text: part.slice(2, -2), bold: true };
      }
      return { text: part, bold: false };
    });
  },

  toggleMode() {
    this.setData({
      mode: this.data.mode === 'card' ? 'article' : 'card'
    });
  },

  onSwiperChange(e) {
    this.setData({ currentSegmentIndex: e.detail.current });
  },
  
  prevSegment() {
    if (this.data.currentSegmentIndex > 0) {
      this.setData({ currentSegmentIndex: this.data.currentSegmentIndex - 1 });
    }
  },
  
  nextSegment() {
    if (this.data.currentSegmentIndex < this.data.story.segments.length - 1) {
      this.setData({ currentSegmentIndex: this.data.currentSegmentIndex + 1 });
    }
  },

  onShareAppMessage() {
    const story = this.data.story;
    let title = '韩语故事';
    if (story && story.elements) {
      const { who, when, where, action } = story.elements;
      // Construct title from elements
      title = `${who} ${when || ''} ${where} ${action}`.replace(/\s+/g, ' ').trim();
    }
    
    return {
      title: title,
      path: `/subpackages/story/pages/detail/index?id=${this.data.storyId}`
    };
  },

  onShareTimeline() {
    const story = this.data.story;
    let title = '韩语故事';
    if (story && story.elements) {
      const { who, when, where, action } = story.elements;
      title = `${who} ${when || ''} ${where} ${action}`.replace(/\s+/g, ' ').trim();
    }
    
    return {
      title: title,
      query: `id=${this.data.storyId}`
    };
  }
});
