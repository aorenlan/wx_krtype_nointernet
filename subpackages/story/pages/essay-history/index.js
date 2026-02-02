const app = getApp();

const formatTime = (ts) => {
  const date = new Date(Number(ts));
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yy}/${mm}/${dd} ${hh}:${min}`;
};

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    works: [],
    loading: true,
    sortMode: 'time' // 'time' | 'course'
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const navBarHeight = menuButtonInfo ? (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height : 44;
    
    this.setData({ statusBarHeight, navBarHeight });
    this.loadHistory();
  },

  async loadHistory() {
    this.setData({ loading: true });
    try {
        const db = wx.cloud.database();
        
        // 1. Get OpenID securely via cloud function
        // This is necessary because client-side filtering by _openid might not work as expected
        // if the database permissions are set to "Readable by all".
        // We need the real openid to filter explicitly.
        const { result } = await wx.cloud.callFunction({
            name: 'quickstartFunctions',
            data: { type: 'getOpenId' }
        });
        
        if (!result || !result.openid) {
            throw new Error('Failed to get user openid');
        }
        
        const myOpenId = result.openid;
        console.log('【Essay History】Got OpenID:', myOpenId);

        const res = await db.collection('essay_works')
            .where({
              _openid: myOpenId 
            })
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
            
        const rawWorks = res.data || [];
        const processedWorks = rawWorks.map(item => {
            // Process Course Label
            let courseLabel = '未知课程';
            let courseClass = 'other';
            
            if (item.category === 'TOPIK Vocabulary') {
                courseLabel = `TOPIK ${item.topikLevel || '?'}-${item.topikSession || '?'}`;
                courseClass = 'topik';
            } else if (item.category && item.category.includes('Yonsei')) {
                const yLevel = item.category.replace('Yonsei', '').trim();
                const lesson = item.lessonId ? `-${item.lessonId}` : '';
                courseLabel = `Y${yLevel}${lesson}`;
                courseClass = 'yonsei';
            } else if (item.category) {
                courseLabel = item.category;
            }

            // Score Class
            const score = item.result ? item.result.score : 0;
            let scoreClass = 'low';
            if (score >= 80) scoreClass = 'high';
            else if (score >= 60) scoreClass = 'medium';

            return {
                ...item,
                timeLabel: formatTime(item.createdAt),
                courseLabel,
                courseClass,
                scoreClass
            };
        });

        this.rawWorks = processedWorks;
        this.applySort();
        
    } catch (e) {
        console.error(e);
        wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
        this.setData({ loading: false });
    }
  },

  setSort(e) {
      const mode = e.currentTarget.dataset.mode;
      if (mode === this.data.sortMode) return;
      this.setData({ sortMode: mode }, () => {
          this.applySort();
      });
  },

  applySort() {
      if (!this.rawWorks) return;
      
      let works = [...this.rawWorks];
      if (this.data.sortMode === 'course') {
          works.sort((a, b) => {
              // Sort by Category first
              const catA = a.category || '';
              const catB = b.category || '';
              const catComp = catA.localeCompare(catB);
              if (catComp !== 0) return catComp;
              
              // Then by Lesson/Session
              const lesA = Number(a.lessonId || a.topikSession) || 0;
              const lesB = Number(b.lessonId || b.topikSession) || 0;
              if (lesA !== lesB) return lesA - lesB;
              
              // Finally by time desc
              return b.createdAt - a.createdAt;
          });
      } else {
          // Time desc
          works.sort((a, b) => b.createdAt - a.createdAt);
      }
      
      this.setData({ works });
  },

  openDetail(e) {
      const id = e.currentTarget.dataset.id;
      if (!id) return;
      wx.navigateTo({ url: `/subpackages/story/pages/essay-detail/index?id=${id}` });
  }
});
