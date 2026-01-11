Component({
  data: {
    selected: 0,
    dark: false,
    hidden: false
  },
  lifetimes: {
    attached() {
      this.syncTheme();
    }
  },
  pageLifetimes: {
    show() {
      this.syncTheme();
    }
  },
  methods: {
    syncTheme() {
      const storedSettings = wx.getStorageSync('settings') || {};
      this.setData({ dark: !!storedSettings.darkMode });
    }
  }
})
