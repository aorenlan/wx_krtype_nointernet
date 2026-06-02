// 从其它小程序跳转携带的 extraData 里提取待收藏单词，写入中转 storage。
// query string 可能因过长被截断，extraData 是更可靠的传参通道，作为兜底。
function stashFavoriteFromExtraData(options) {
  try {
    const extra = options && options.referrerInfo && options.referrerInfo.extraData;
    if (!extra || typeof extra !== 'object') return;
    const words = Array.isArray(extra.words) ? extra.words : null;
    if (!words || words.length === 0) return;
    wx.setStorageSync('pending_fav_import', {
      query: {
        words,                       // 结构化数组，nv-practice 直接消费
        mode: extra.mode,
        lang: extra.language,
        scene: extra.sceneName
      },
      ts: Date.now()
    });
  } catch (e) {}
}

App({
  onLaunch: function (options) {
    stashFavoriteFromExtraData(options);

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
  onShow: function (options) {
    // 小程序在后台被跳转再次唤起时也能拿到 extraData
    stashFavoriteFromExtraData(options);
  },
  globalData: {
    userInfo: null,
    statusBarHeight: 0,
    navBarHeight: 0
  }
})