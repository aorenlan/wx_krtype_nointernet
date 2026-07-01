const TAB_BAR_ITEMS = [
  {
    pagePath: '/pages/nv-practice/index',
    iconPath: '/assets/tabbar/re_练习.png',
    selectedIconPath: '/assets/tabbar/re_练习.png',
    text: '练习',
    shortText: '练习'
  },
  {
    pagePath: '/pages/picture-words/index',
    iconPath: '/assets/tabbar/re_story.png',
    selectedIconPath: '/assets/tabbar/re_story.png',
    text: '看图想韩语',
    shortText: '看图'
  },
  {
    pagePath: '/pages/photo-learn/index',
    iconPath: '/assets/tabbar/re_eye.png',
    selectedIconPath: '/assets/tabbar/re_eye.png',
    text: '拍照',
    shortText: '拍照'
  },
  {
    pagePath: '/pages/grammar-entry/index',
    iconPath: '/assets/tabbar/re_语法.png',
    selectedIconPath: '/assets/tabbar/re_语法.png',
    text: '语法',
    shortText: '语法'
  },
  {
    pagePath: '/pages/nv-settings/index',
    iconPath: '/assets/tabbar/re_设置.png',
    selectedIconPath: '/assets/tabbar/re_设置.png',
    text: '设置',
    shortText: '设置'
  }
];

const ROUTE_INDEX = TAB_BAR_ITEMS.reduce((map, item, index) => {
  map[item.pagePath] = index;
  return map;
}, {
  '/subpackages/grammar/pages/index/index': 3
});

function normalizeRoute(route) {
  const text = String(route || '').split('?')[0].trim();
  if (!text) return '';
  return text.charAt(0) === '/' ? text : `/${text}`;
}

function normalizeSelected(value, fallback) {
  const count = TAB_BAR_ITEMS.length || 1;
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    return normalizeSelected(fallback == null ? 0 : fallback, 0);
  }
  return Math.max(0, Math.min(count - 1, Math.trunc(raw)));
}

function getCurrentRoute() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  const current = pages[pages.length - 1] || {};
  return normalizeRoute(current.route || '');
}

function getPageRoute(page) {
  return normalizeRoute(page && page.route);
}

function isCurrentPage(page) {
  const pageRoute = getPageRoute(page);
  const currentRoute = getCurrentRoute();
  return !pageRoute || !currentRoute || pageRoute === currentRoute;
}

function getTabIndexByRoute(route) {
  const normalized = normalizeRoute(route);
  return Object.prototype.hasOwnProperty.call(ROUTE_INDEX, normalized)
    ? ROUTE_INDEX[normalized]
    : -1;
}

function getCurrentTabIndex() {
  return getTabIndexByRoute(getCurrentRoute());
}

function getDarkMode() {
  try {
    const settings = wx.getStorageSync('settings') || {};
    return !!settings.darkMode;
  } catch (error) {
    return false;
  }
}

function buildTabBarState(currentData, options) {
  const data = currentData || {};
  const opts = options || {};
  const routeIndex = getCurrentTabIndex();
  const currentSelected = Number(data.selected);
  const fallbackSelected = currentSelected === -1 ? -1 : normalizeSelected(data.selected, 0);
  const selected = opts.selected != null
    ? normalizeSelected(opts.selected, data.selected)
    : (routeIndex >= 0 ? routeIndex : fallbackSelected);
  const hidden = opts.hidden != null ? !!opts.hidden : !!data.hidden;
  const dark = opts.dark != null ? !!opts.dark : getDarkMode();
  return { selected, hidden, dark };
}

function setComponentData(component, nextData) {
  if (!component || typeof component.setData !== 'function') return false;
  const patch = {};
  Object.keys(nextData).forEach((key) => {
    if (!component.data || component.data[key] !== nextData[key]) {
      patch[key] = nextData[key];
    }
  });
  if (Object.keys(patch).length > 0) {
    component.setData(patch);
  }
  return true;
}

function syncTabBarComponent(component, options) {
  const nextData = buildTabBarState(component && component.data, options);
  return setComponentData(component, nextData);
}

function clearPageTabBarTimer(page) {
  if (page && page.__tabBarSyncTimer) {
    clearTimeout(page.__tabBarSyncTimer);
    page.__tabBarSyncTimer = null;
  }
}

function queuePageTabBarSync(page, opts, retryCount, maxRetry) {
  if (!page || retryCount >= maxRetry) {
    clearPageTabBarTimer(page);
    return false;
  }
  clearPageTabBarTimer(page);
  page.__tabBarSyncTimer = setTimeout(() => {
    syncPageTabBar(page, {
      ...opts,
      retryCount: retryCount + 1
    });
  }, opts.retryDelay || 80);
  return true;
}

function syncPageTabBar(page, options) {
  const opts = options || {};
  const retry = opts.retry !== false;
  const retryCount = Number(opts.retryCount) || 0;
  const maxRetry = opts.maxRetry == null ? 6 : Number(opts.maxRetry);

  if (!isCurrentPage(page)) {
    if (retry) {
      queuePageTabBarSync(page, opts, retryCount, maxRetry);
    } else {
      clearPageTabBarTimer(page);
    }
    return false;
  }

  const tabBar = page && typeof page.getTabBar === 'function' ? page.getTabBar() : null;
  if (tabBar) {
    clearPageTabBarTimer(page);
    if (typeof tabBar.syncTabBarState === 'function') {
      tabBar.syncTabBarState(opts);
    } else {
      syncTabBarComponent(tabBar, opts);
    }
    return true;
  }

  if (retry) {
    queuePageTabBarSync(page, opts, retryCount, maxRetry);
  }
  return false;
}

module.exports = {
  TAB_BAR_ITEMS,
  clearPageTabBarTimer,
  getCurrentRoute,
  getCurrentTabIndex,
  getPageRoute,
  getTabIndexByRoute,
  isCurrentPage,
  normalizeSelected,
  syncPageTabBar,
  syncTabBarComponent
};
