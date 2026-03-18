const srs = require('../../utils/srs');

Page({
  data: {
    cards: [],          // 今日待复习列表
    current: 0,         // 当前卡片索引
    total: 0,           // 初始总数
    done: 0,            // 已掌握数量
    revealed: false,    // 是否已翻转
    finished: false,    // 是否全部完成
    animating: false,   // 飞出动画进行中

    // 滑动手势
    startX: 0,
    offsetX: 0,
    swiping: false,
    swipeDir: '',       // 'left' | 'right' | ''
  },

  onLoad() {
    const cards = srs.getTodayReviewList();
    if (cards.length === 0) {
      this.setData({ finished: true });
      return;
    }
    this.setData({ cards, current: 0, total: cards.length, done: 0, revealed: false });
  },

  // 点击卡片翻转
  onCardTap() {
    if (this.data.swiping || this.data.animating) return;
    if (!this.data.revealed) {
      this.setData({ revealed: true });
    }
  },

  // 触摸开始
  onTouchStart(e) {
    if (this.data.animating) return;
    this.setData({
      startX: e.touches[0].clientX,
      offsetX: 0,
      swiping: false,
      swipeDir: '',
    });
  },

  // 触摸移动
  onTouchMove(e) {
    if (this.data.animating) return;
    const dx = e.touches[0].clientX - this.data.startX;
    const dir = dx > 0 ? 'right' : 'left';
    this.setData({ offsetX: dx, swiping: Math.abs(dx) > 8, swipeDir: dir });
  },

  // 触摸结束
  onTouchEnd() {
    if (this.data.animating) return;
    const { offsetX, revealed } = this.data;
    if (Math.abs(offsetX) > 80) {
      const remembered = revealed ? offsetX > 0 : true;
      this._flyOut(offsetX > 0 ? 600 : -600, remembered);
    } else {
      this.setData({ offsetX: 0, swiping: false, swipeDir: '' });
    }
  },

  // 飞出动画后提交
  _flyOut(targetX, remembered) {
    this.setData({ animating: true, offsetX: targetX });
    setTimeout(() => {
      this.submitCard(remembered);
    }, 260);
  },

  // 底部按钮
  onForgot() {
    if (this.data.animating) return;
    this._flyOut(-600, false);
  },
  onRemembered() {
    if (this.data.animating) return;
    this._flyOut(600, true);
  },

  submitCard(remembered) {
    const { cards, current } = this.data;
    const card = cards[current];

    let newCards = cards.slice();
    let done = this.data.done;
    if (remembered) {
      srs.submitReview(card.key, true);
      newCards.splice(current, 1);
      done += 1;
    } else {
      newCards.splice(current, 1);
      newCards.push(card);
    }

    if (newCards.length === 0) {
      this.setData({ offsetX: 0, swiping: false, swipeDir: '', animating: false, done, finished: true });
    } else {
      const nextIdx = current >= newCards.length ? 0 : current;
      this.setData({
        cards: newCards,
        current: nextIdx,
        done,
        revealed: false,
        offsetX: 0,
        swiping: false,
        swipeDir: '',
        animating: false,
      });
    }
  },

  onBack() {
    wx.navigateBack();
  },

  // 测试用：模拟过了1天（nextReview 各自减1天，这样需要6天的词要点6次才出现）
  debugSimulateNextDay() {
    const all = wx.getStorageSync('flashflow_srs') || {};
    const ONE_DAY = 86400000;
    Object.keys(all).forEach(k => {
      all[k].nextReview = all[k].nextReview - ONE_DAY;
    });
    wx.setStorageSync('flashflow_srs', all);
    wx.removeStorageSync('flashflow_srs_daily');
    const cards = srs.getTodayReviewList();
    this.setData({ cards, current: 0, total: cards.length, done: 0, revealed: false, finished: cards.length === 0 });
    wx.showToast({ title: cards.length > 0 ? `今日待复习 ${cards.length}个` : '今天没有到期单词', icon: 'none' });
  },
});
