App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: "cloud1-4gsrfepl56e590f0",
        traceUser: true,
      });
    }

    // Calculate Navigation Bar Height
    const systemInfo = wx.getSystemInfoSync();
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = systemInfo.statusBarHeight;
    const navBarHeight = (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height;

    this.globalData = {
      userInfo: null,
      statusBarHeight,
      navBarHeight,
      menuButtonInfo
    };
  },
  globalData: {
    userInfo: null,
    statusBarHeight: 0,
    navBarHeight: 0
  }
})