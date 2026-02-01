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
    loading: true,
    work: null
  },

  onLoad(options) {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const navBarHeight = menuButtonInfo ? (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height : 44;
    this.setData({ statusBarHeight, navBarHeight });
    const id = options && options.id ? String(options.id) : '';
    if (id) this.loadDetail(id);
    else this.setData({ loading: false });
  },

  async loadDetail(id) {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('essay_works').doc(id).get();
      const item = res && res.data ? res.data : null;
      if (!item) throw new Error('not_found');

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

      const rawResult = item.result || {};
      const score = Number(rawResult.score) || 0;
      const scoreClass = score >= 80 ? 'high' : (score >= 60 ? 'medium' : 'low');
      const result = {
        ...rawResult,
        score,
        sentence_explanations: Array.isArray(rawResult.sentence_explanations) ? rawResult.sentence_explanations : [],
        rewrite: rawResult.rewrite != null ? String(rawResult.rewrite) : ''
      };

      this.setData({
        work: {
          ...item,
          timeLabel: formatTime(item.createdAt),
          courseLabel,
          courseClass,
          scoreClass,
          result
        },
        loading: false
      });
    } catch (e) {
      console.error(e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  }
});
