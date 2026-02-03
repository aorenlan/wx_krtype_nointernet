const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    dark: false
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    const navBarHeight = (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height;
    
    this.setData({
        statusBarHeight,
        navBarHeight
    });

    this.showPolicyPopup();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.syncTheme();
  },

  syncTheme() {
    const storedSettings = wx.getStorageSync('settings') || {};
    this.setData({ dark: !!storedSettings.darkMode });
  },

  showPolicyPopup() {
    const key = 'hi_chat_policy_popup_shown_v1';
    const shown = wx.getStorageSync(key);
    if (!shown) {
      wx.showModal({
        title: '温馨提示',
        content: '因政策原因 HI~功能先下架。请大家谅解~会持续更新趣味学习方法',
        showCancel: false,
        confirmText: '我知道了',
        success: () => {
          wx.setStorageSync(key, true);
        }
      });
    }
  },

  navigateToTimeLearning() {
    wx.navigateTo({
      url: '/pages/time-learning/index'
    });
  },

  navigateToNumberLearning2() {
    wx.navigateTo({
      url: '/pages/number-learning-2/index'
    });
  },

  navigateToColorBlocks() {
    wx.navigateTo({
      url: '/pages/color-blocks/index'
    });
  }
});
