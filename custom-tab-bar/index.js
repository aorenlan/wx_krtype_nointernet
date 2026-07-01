const { syncTabBarComponent } = require('../utils/tabbar');

Component({
  data: {
    selected: -1,
    dark: false,
    hidden: false
  },
  lifetimes: {
    attached() {
      this.syncTabBarState();
    }
  },
  pageLifetimes: {
    show() {
      this.syncTabBarState();
    }
  },
  methods: {
    syncTabBarState(options) {
      syncTabBarComponent(this, options);
    }
  }
})
