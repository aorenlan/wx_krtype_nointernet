const grammarData = require('../../data/yansei_grammar.js');

const parseContent = (s) => {
  if (!s) return [];
  const raw = String(s);
  // Replace delimiters with a unique separator
  const normalized = raw
    .replace(/Morphological rules/gi, '形态规则')
    .replace(/\r\n/g, '###P###')
    .replace(/\n/g, '###P###');
  
  return normalized.split('###P###')
    .map(t => t.trim())
    .filter(t => t.length > 0);
};

const buildKey = (x) => `${x.category}__${String(x.lesson_id)}__${String(x.global_id || x.grammar || '')}`;

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    title: '语法',
    subTitle: '',
    subtitle: '',
    items: [],
    currentKey: '',
    current: null,
    meaningParts: [],
    usageParts: [],
    exampleParts: [],
    sidebarCollapsed: false,
    startX: 0,
    startY: 0
  },

  handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    const { clientX, clientY } = e.touches[0];
    this.setData({ startX: clientX, startY: clientY });
  },

  handleTouchEnd(e) {
    if (e.changedTouches.length !== 1) return;
    const { clientX, clientY } = e.changedTouches[0];
    const { startX, startY } = this.data;
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    // 左右滑动判定：水平位移 > 50 且 垂直位移 < 50
    if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 50) {
      if (deltaX < 0) {
        // 向左滑动 -> 下一页
        this.nextItem();
      } else {
        // 向右滑动 -> 上一页
        this.prevItem();
      }
    }
  },

  nextItem() {
    const { items, currentKey } = this.data;
    const currentIndex = items.findIndex(x => x.key === currentKey);
    if (currentIndex < items.length - 1) {
      const next = items[currentIndex + 1];
      this.selectItemByKey(next.key);
    } else {
      wx.showToast({ title: '已经是最后一条了', icon: 'none' });
    }
  },

  prevItem() {
    const { items, currentKey } = this.data;
    const currentIndex = items.findIndex(x => x.key === currentKey);
    if (currentIndex > 0) {
      const prev = items[currentIndex - 1];
      this.selectItemByKey(prev.key);
    } else {
      wx.showToast({ title: '已经是第一条了', icon: 'none' });
    }
  },

  selectItemByKey(key) {
    const items = this.data.items || [];
    const found = items.find(x => x.key === key);
    if (!found) return;

    // Separate meaning and usage_notes
    const meaningParts = parseContent(found.meaning);
    const usageParts = parseContent(found.usage_notes);

    // Map structured examples to {kor, trans}
    const rawExamples = Array.isArray(found.examples) ? found.examples : [];
    const exampleParts = rawExamples.map(ex => ({
      kor: ex.kr || ex.kor || '', // Handle both keys just in case
      trans: ex.cn || ex.trans || ''
    }));

    this.setData({
      currentKey: key,
      current: found,
      meaningParts,
      usageParts,
      exampleParts,
      sidebarCollapsed: true
    });
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/nv-practice/index' });
      }
    });
  },

  onLoad(query) {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const book = String((query && (query.book || query.category)) || '').trim();
    const lessonId = String((query && query.lessonId) || '').trim();

    const all = Array.isArray(grammarData) ? grammarData : [];
    const filtered = all.filter((x) => String(x.category || '') === book && String(x.lesson_id || '') === lessonId);
    const items = filtered.map((x) => ({ ...x, key: buildKey(x) }));

    const first = items[0] || null;
    const currentKey = first ? first.key : '';
    const subtitle = book && lessonId ? `${book} · 第${lessonId}课` : '语法';

    let meaningParts = [];
    let usageParts = [];
    let exampleParts = [];

    if (first) {
      meaningParts = parseContent(first.meaning);
      usageParts = parseContent(first.usage_notes);

      const rawExamples = Array.isArray(first.examples) ? first.examples : [];
      exampleParts = rawExamples.map(ex => ({
        kor: ex.kr || ex.kor || '',
        trans: ex.cn || ex.trans || ''
      }));
    }

    this.setData({
      statusBarHeight: windowInfo.statusBarHeight || 20,
      navBarHeight: 44,
      items,
      currentKey,
      current: first,
      meaningParts,
      usageParts,
      exampleParts,
      title: '语法',
      subTitle: book && lessonId ? `第${lessonId}课 · ${items.length}条` : '',
      subtitle
    });
  },

  toggleSidebar() {
    this.setData({ 
      sidebarCollapsed: !this.data.sidebarCollapsed
    });
  },

  selectItem(e) {
    const key = e.currentTarget.dataset.key;
    this.selectItemByKey(key);
  }
});
