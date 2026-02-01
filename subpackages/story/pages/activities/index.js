const app = getApp();

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,
    activities: [
      {
        id: 'counter-attack',
        title: '反击词汇 (Counter-Attack)',
        desc: '掌握关键时刻的有力表达，学会用韩语优雅地反击。',
        icon: '⚡️',
        path: '/subpackages/story/pages/counter-attack/index'
      },
      // Future activities can be added here
    ]
  },

  onLoad() {
    let { statusBarHeight, navBarHeight } = app.globalData;

    if (!statusBarHeight || !navBarHeight) {
        const systemInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
        statusBarHeight = systemInfo.statusBarHeight || 20;
        navBarHeight = (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height;
    }

    this.setData({ statusBarHeight, navBarHeight });
  },

  navigateToActivity(e) {
    const path = e.currentTarget.dataset.path;
    if (path) {
      wx.navigateTo({ url: path });
    } else {
      wx.showToast({ title: '敬请期待', icon: 'none' });
    }
  }
});