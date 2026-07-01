const { TAB_BAR_ITEMS, getCurrentTabIndex, normalizeSelected } = require('../../utils/tabbar');
const { buildGrammarTargetUrl } = require('../../utils/grammar-target');

const GRAMMAR_TAB_INDEX = TAB_BAR_ITEMS.findIndex((item) => item.pagePath === '/pages/grammar-entry/index');

let tabSwitching = false;

function releaseTabSwitching() {
  setTimeout(() => {
    tabSwitching = false;
  }, 220);
}

function openGrammarPage(done) {
  buildGrammarTargetUrl()
    .then((url) => {
      wx.navigateTo({
        url,
        success: done,
        fail: (err) => {
          console.warn('[tabbar] navigate grammar failed, fallback to tab entry', err);
          wx.switchTab({
            url: '/pages/grammar-entry/index',
            fail: (switchErr) => {
              console.warn('[tabbar] switch grammar entry failed', switchErr);
            },
            complete: done
          });
        }
      });
    })
    .catch((err) => {
      console.error('[tabbar] build grammar url failed', err);
      wx.switchTab({
        url: '/pages/grammar-entry/index',
        complete: done
      });
    });
}

Component({
  properties: {
    selected: {
      type: Number,
      value: -1
    },
    dark: {
      type: Boolean,
      value: false
    },
    hidden: {
      type: Boolean,
      value: false
    }
  },
  data: {
    color: "#94a3b8",
    selectedColor: "#6366f1",
    list: TAB_BAR_ITEMS
  },
  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const index = normalizeSelected(data.index, this.data.selected);
      const item = this.data.list[index];
      const url = data.path || (item && item.pagePath);
      if (!url || tabSwitching) return;

      const currentIndex = getCurrentTabIndex();
      const selectedIndex = currentIndex >= 0
        ? currentIndex
        : (this.data.selected >= 0 ? normalizeSelected(this.data.selected, 0) : -1);
      if (selectedIndex >= 0 && index === selectedIndex) return;

      tabSwitching = true;

      if (index === GRAMMAR_TAB_INDEX) {
        openGrammarPage(releaseTabSwitching);
        return;
      }

      wx.switchTab({
        url,
        fail: (err) => {
          console.warn('[tabbar] switchTab failed', url, err);
        },
        complete: releaseTabSwitching
      });
    }
  }
});
