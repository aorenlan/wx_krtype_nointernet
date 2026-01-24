const pad2 = (n) => String(n).padStart(2, '0');

const formatDay = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
};

const deriveDay = (item) => {
  const batchDate = item && item.batchDate ? String(item.batchDate) : '';
  if (/^\d{8}$/.test(batchDate)) {
    const y = batchDate.slice(0, 4);
    const m = batchDate.slice(4, 6);
    const d = batchDate.slice(6, 8);
    return `${y}/${m}/${d}`;
  }
  return '';
};

const sortByBatchDateDesc = (list) => {
  const arr = Array.isArray(list) ? list.slice() : [];
  arr.sort((a, b) => {
    const ab = a && a.batchDate != null ? String(a.batchDate) : '';
    const bb = b && b.batchDate != null ? String(b.batchDate) : '';
    const adb = /^\d{8}$/.test(ab) ? Number(ab) : NaN;
    const bdb = /^\d{8}$/.test(bb) ? Number(bb) : NaN;
    if (Number.isFinite(adb) && Number.isFinite(bdb) && adb !== bdb) return bdb - adb;
    if (Number.isFinite(adb) && !Number.isFinite(bdb)) return -1;
    if (!Number.isFinite(adb) && Number.isFinite(bdb)) return 1;
    const at = a && a.timestamp != null ? Number(a.timestamp) : 0;
    const bt = b && b.timestamp != null ? Number(b.timestamp) : 0;
    return bt - at;
  });
  return arr;
};

const callDailySentenceList = (params) => new Promise((resolve, reject) => {
  if (!wx.cloud || !wx.cloud.callFunction) {
    reject(new Error('wx.cloud not available'));
    return;
  }
  wx.cloud.callFunction({
    name: 'getalldailysentence',
    data: params || {},
    success: (res) => resolve(res),
    fail: (err) => reject(err)
  });
});

const HISTORY_CACHE_KEY = 'kr_daily_sentence_history_page_cache_v2';
const HISTORY_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

const isCacheFresh = (cachedAt) => {
  const t = cachedAt != null ? Number(cachedAt) : NaN;
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < HISTORY_CACHE_TTL_MS;
};

const getDayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}${m}${day}`;
};

const readHistoryCache = () => {
  try {
    const raw = wx.getStorageSync(HISTORY_CACHE_KEY);
    if (!raw || typeof raw !== 'object') return null;
    return raw;
  } catch (e) {
    return null;
  }
};

const writeHistoryCache = (payload) => {
  try {
    wx.setStorageSync(HISTORY_CACHE_KEY, payload);
  } catch (e) {}
};

const uniqueKeyOf = (it) => {
  if (it && it._id != null) return `id:${String(it._id)}`;
  const ts = it && it.timestamp != null ? Number(it.timestamp) : NaN;
  const source = it && it.source != null ? String(it.source) : '';
  return `ts:${Number.isFinite(ts) ? ts : ''}__${source}`;
};

const mergeUnique = (a, b) => {
  const out = [];
  const seen = new Set();
  (Array.isArray(a) ? a : []).forEach((it) => {
    const k = uniqueKeyOf(it);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(it);
  });
  (Array.isArray(b) ? b : []).forEach((it) => {
    const k = uniqueKeyOf(it);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(it);
  });
  return out;
};

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    history: [],
    page: 1,
    pageSize: 100,
    hasMore: false,
    loading: false,
    loadingMore: false
  },

  async onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const navBarHeight = menuButtonInfo ? (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height : 44;

    this.setData({ statusBarHeight, navBarHeight });
    const cached = readHistoryCache();
    const cachedItems = cached && Array.isArray(cached.items) ? cached.items : [];
    const cachedPagesLoaded = cached && cached.pagesLoaded != null ? Number(cached.pagesLoaded) : NaN;
    const cachedHasMore = !!(cached && cached.hasMore);
    const cachedAt = cached && cached.cachedAt != null ? cached.cachedAt : null;
    if (cachedItems.length > 0 && isCacheFresh(cachedAt)) {
      const mapped = sortByBatchDateDesc(cachedItems).map((it) => {
        const day = deriveDay(it);
        const ts = it && it.timestamp != null ? Number(it.timestamp) : NaN;
        return {
          ...it,
          timestamp: Number.isFinite(ts) ? ts : (it && it._createTime ? Number(it._createTime) : Date.now()),
          day
        };
      });
      const pagesLoaded = Number.isFinite(cachedPagesLoaded) && cachedPagesLoaded > 0
        ? Math.floor(cachedPagesLoaded)
        : Math.max(1, Math.ceil(mapped.length / this.data.pageSize));
      this.setData({
        history: mapped,
        hasMore: cachedHasMore,
        page: pagesLoaded,
        loading: false,
        loadingMore: false
      });
      return;
    }
    await this.refreshHistory();
  },

  async onShow() {},

  async refreshHistory() {
    this.setData({ loading: true, page: 1 });
    try {
      const res = await callDailySentenceList({ page: 1, pageSize: this.data.pageSize, orderField: 'batchDate', orderDirection: 'desc', noCache: true });
      const result = res && res.result ? res.result : null;
      const list = result && Array.isArray(result.data) ? result.data : [];
      const mapped = sortByBatchDateDesc(list).map((it) => {
        const day = deriveDay(it);
        const ts = it && it.timestamp != null ? Number(it.timestamp) : NaN;
        return {
          ...it,
          timestamp: Number.isFinite(ts) ? ts : (it && it._createTime ? Number(it._createTime) : Date.now()),
          day
        };
      });
      this.setData({
        history: mapped,
        hasMore: !!(result && result.hasMore),
        page: 1
      });
      writeHistoryCache({
        pageSize: this.data.pageSize,
        pagesLoaded: 1,
        hasMore: !!(result && result.hasMore),
        cachedAt: Date.now(),
        items: mapped
      });
    } catch (e) {
      this.setData({ history: [], hasMore: false, page: 1 });
      try {
        wx.showToast({ title: '历史加载失败', icon: 'none' });
      } catch (err) {}
    } finally {
      this.setData({ loading: false, loadingMore: false });
    }
  },

  async loadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    const nextPage = (Number(this.data.page) || 1) + 1;
    const cached = readHistoryCache();
    const cachedAt = cached && cached.cachedAt != null ? cached.cachedAt : null;
    if (isCacheFresh(cachedAt)) {
      const cachedItems = cached && Array.isArray(cached.items) ? cached.items : [];
      const cachedPagesLoaded = cached && cached.pagesLoaded != null ? Number(cached.pagesLoaded) : NaN;
      const pagesLoaded = Number.isFinite(cachedPagesLoaded) ? Math.floor(cachedPagesLoaded) : 0;
      const expectedCount = nextPage * this.data.pageSize;
      if (pagesLoaded >= nextPage && cachedItems.length >= expectedCount) {
        this.setData({
          history: cachedItems,
          hasMore: !!(cached && cached.hasMore),
          page: nextPage
        });
        return;
      }
    }
    this.setData({ loadingMore: true });
    try {
      const res = await callDailySentenceList({ page: nextPage, pageSize: this.data.pageSize, orderField: 'batchDate', orderDirection: 'desc', noCache: true });
      const result = res && res.result ? res.result : null;
      const list = result && Array.isArray(result.data) ? result.data : [];
      const mapped = sortByBatchDateDesc(list).map((it) => {
        const day = deriveDay(it);
        const ts = it && it.timestamp != null ? Number(it.timestamp) : NaN;
        return {
          ...it,
          timestamp: Number.isFinite(ts) ? ts : (it && it._createTime ? Number(it._createTime) : Date.now()),
          day
        };
      });
      const merged = (this.data.history || []).concat(mapped);
      const deduped = mergeUnique(merged, []);
      this.setData({
        history: deduped,
        hasMore: !!(result && result.hasMore),
        page: nextPage
      });
      writeHistoryCache({
        pageSize: this.data.pageSize,
        pagesLoaded: nextPage,
        hasMore: !!(result && result.hasMore),
        cachedAt: Date.now(),
        items: deduped
      });
    } catch (e) {
      try {
        wx.showToast({ title: '加载更多失败', icon: 'none' });
      } catch (err) {}
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  openItem(e) {
    const ds = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : null;
    const id = ds && ds.id != null ? String(ds.id) : '';
    const ts = ds && ds.ts != null ? ds.ts : null;
    const idx = ds && ds.idx != null ? Number(ds.idx) : NaN;
    const item = Number.isFinite(idx) && Array.isArray(this.data.history) ? this.data.history[idx] : null;
    if (item && typeof item === 'object') {
      try {
        if (id) wx.setStorageSync(`kr_daily_sentence_cache_id_${id}`, { cachedAt: Date.now(), value: item });
      } catch (e) {}
      const t = item && item.timestamp != null ? Number(item.timestamp) : NaN;
      if (Number.isFinite(t)) {
        try { wx.setStorageSync(`kr_daily_sentence_cache_ts_${t}`, { cachedAt: Date.now(), value: item }); } catch (e) {}
      }
    }
    if (id) {
      try { wx.setStorageSync('kr_daily_sentence_target_id', id); } catch (e) {}
      if (ts != null) {
        try { wx.setStorageSync('kr_daily_sentence_target_ts', ts); } catch (e) {}
      }
      
      const pages = getCurrentPages ? getCurrentPages() : [];
      if (pages.length >= 2 && pages[pages.length - 2].route === 'pages/daily-sentence/index') {
          wx.navigateBack({ delta: 1 });
      } else {
          wx.redirectTo({ url: '/pages/daily-sentence/index' });
      }
      return;
    }
    if (ts != null) {
      try { wx.setStorageSync('kr_daily_sentence_target_ts', ts); } catch (e) {}
      
      const pages = getCurrentPages ? getCurrentPages() : [];
      if (pages.length >= 2 && pages[pages.length - 2].route === 'pages/daily-sentence/index') {
          wx.navigateBack({ delta: 1 });
      } else {
          wx.redirectTo({ url: '/pages/daily-sentence/index' });
      }
    }
  }
});
