const { buildGrammarTargetUrl } = require('../../utils/grammar-target');
const { syncPageTabBar } = require('../../utils/tabbar');

Page({
  onShow() {
    syncPageTabBar(this, { selected: 3, hidden: false });

    if (this._opening) return;
    this.openGrammar();
  },

  async openGrammar() {
    this._opening = true;
    const targetUrl = await buildGrammarTargetUrl();
    wx.redirectTo({
      url: targetUrl,
      fail: (err) => {
        console.warn('Redirect grammar failed, fallback to reLaunch', err);
        wx.reLaunch({
          url: targetUrl,
          fail: (launchErr) => {
            console.error('Open grammar failed', launchErr);
          }
        });
      },
      complete: () => {
        this._opening = false;
      }
    });
  }
});
