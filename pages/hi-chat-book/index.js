import { fetchHiLiaoChatsCloud, fetchHiLiaoChatsCloudBefore, fetchHiLiaoChatsCloudMine, fetchHiLiaoChatsCloudMineBefore, getHiLiaoBookLastSyncAt, markHiLiaoBookLastSynced, getHiLiaoChats, getHiLiaoDeviceId, mergeHiLiaoChats } from '../../utils_nv/storage';

const formatTime = (ts) => {
  const date = new Date(Number(ts) || Date.now());
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}/${d}`;
};

const avatarLabelOf = ({ isSelf, nickname }) => {
  if (isSelf) return '我';
  const raw = String(nickname || '').trim();
  const m = raw.match(/([0-9a-fA-F]{4})$/);
  const tail4 = m ? m[1].toLowerCase() : '';
  if (tail4 && raw.startsWith('宝')) return `宝${tail4}`;
  if (tail4) return tail4;
  if (raw.length >= 2) return raw.slice(0, 2);
  return raw || '他';
};

const mapForDisplay = (x, myDeviceId, myNickname) => {
  const korean = x && x.korean ? String(x.korean) : '';
  const blocked = !!(x && x.blocked);
  const status = x && x.status ? String(x.status) : 'done';
  const nickname = x && x.nickname != null ? String(x.nickname) : '';
  const deviceId = x && x.deviceId != null ? String(x.deviceId) : '';
  const mineHint = !!(x && x.mineHint);
  const isSelf = !!(mineHint || (myDeviceId && deviceId && myDeviceId === deviceId) || (!deviceId && nickname && myNickname && nickname === myNickname));
  const avatarText = blocked ? '!' : avatarLabelOf({ isSelf, nickname });
  const preview = blocked
    ? '内容不合规，已拦截'
    : (status === 'pending' ? '正在生成…' : (korean || '生成失败，可点开查看'));
  return {
    ...x,
    isSelf,
    avatarText,
    safeTitle: blocked ? '已拦截内容' : String((x && x.userText) || ''),
    safePreview: preview,
    preview,
    displayTime: formatTime(x && x.updatedAt != null ? x.updatedAt : (x && x.createdAt))
  };
};

const buildItems = ({ onlyMine } = {}) => {
  const myDeviceId = getHiLiaoDeviceId();
  const myNickname = (() => {
    try {
      return wx.getStorageSync('kr_hi_liao_nickname_v1') || '';
    } catch (e) {
      return '';
    }
  })();
  const list = getHiLiaoChats();
  const base = list.filter((x) => x && !x.blocked);
  const filtered = onlyMine
    ? base.filter((x) => x && (x.mineHint || (x.deviceId && x.deviceId === myDeviceId) || (!x.deviceId && x.nickname && myNickname && x.nickname === myNickname)))
    : base;
  return filtered.map((x) => mapForDisplay(x, myDeviceId, myNickname));
};

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    dark: false,
    items: [],
    loading: false,
    syncing: false,
    syncFailed: false,
    lastSyncAt: 0,
    lastSyncLabel: '',
    loadingMore: false,
    hasMore: true,
    pageSize: 100,
    cloudBeforeCreatedAt: 0,
    onlyMine: false
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const navBarHeight = menuButtonInfo ? (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height : 44;
    let onlyMine = false;
    try {
      onlyMine = !!wx.getStorageSync('kr_hi_liao_book_only_mine_v1');
    } catch (e) {
      onlyMine = false;
    }
    this.setData({ statusBarHeight, navBarHeight, onlyMine });
  },

  onShow() {
    const storedSettings = wx.getStorageSync('settings') || {};
    this.setData({ dark: !!storedSettings.darkMode });
    this.bootstrap();
  },

  async bootstrap() {
    const items = buildItems({ onlyMine: this.data.onlyMine });
    const lastSyncAt = getHiLiaoBookLastSyncAt();
    this.setData({
      items,
      lastSyncAt,
      lastSyncLabel: lastSyncAt ? formatTime(lastSyncAt) : ''
    });
    if (!items.length) {
      await this.syncLatestFromCloud({ force: true, full: true, block: true });
    } else {
      this.syncLatestFromCloud({ force: false, full: false, block: false });
    }
  },

  async syncLatestFromCloud({ force, full, block } = {}) {
    if (this.data.loading || this.data.syncing) return;
    const now = Date.now();
    const last = getHiLiaoBookLastSyncAt();
    const shouldSkip = !force && last && (now - last) < 30 * 1000;
    if (shouldSkip) return;

    const shouldBlock = !!block;
    this.setData({ syncing: true, syncFailed: false, loading: shouldBlock });
    try {
      const pageSize = Number(this.data.pageSize) || 100;
      const limit = full ? pageSize : pageSize;
      const list = this.data.onlyMine ? await fetchHiLiaoChatsCloudMine({ limit }) : await fetchHiLiaoChatsCloud({ limit, offset: 0 });
      const fetchedCount = Array.isArray(list) ? list.length : 0;
      if (fetchedCount) mergeHiLiaoChats(list);

      const syncedAt = Date.now();
      markHiLiaoBookLastSynced(syncedAt);
      const next = {
        items: buildItems({ onlyMine: this.data.onlyMine }),
        lastSyncAt: syncedAt,
        lastSyncLabel: formatTime(syncedAt)
      };
      if (shouldBlock) {
        const nextBefore = fetchedCount
          ? list.reduce((acc, it) => Math.min(acc, Number(it && it.createdAt) || acc), Number.POSITIVE_INFINITY)
          : 0;
        next.cloudBeforeCreatedAt = Number.isFinite(nextBefore) && nextBefore !== Number.POSITIVE_INFINITY ? nextBefore : 0;
        next.hasMore = fetchedCount === limit;
      }
      this.setData(next);
    } catch (e) {
      console.error('HI~小本本 云端拉取失败', e);
      this.setData({ syncFailed: true });
    } finally {
      this.setData({ loading: false, syncing: false });
    }
  },

  manualSync() {
    this.syncLatestFromCloud({ force: true, full: false });
  },

  async loadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
    this.setData({ loadingMore: true });
    try {
      const pageSize = Number(this.data.pageSize) || 100;
      let before = Number(this.data.cloudBeforeCreatedAt) || 0;
      if (!before) {
        const existing = getHiLiaoChats();
        const min = Array.isArray(existing) && existing.length
          ? existing.reduce((acc, it) => Math.min(acc, Number(it && it.createdAt) || acc), Number.POSITIVE_INFINITY)
          : 0;
        before = Number.isFinite(min) && min !== Number.POSITIVE_INFINITY ? min : 0;
      }
      const list = this.data.onlyMine
        ? await fetchHiLiaoChatsCloudMineBefore({ limit: pageSize, beforeCreatedAt: before || undefined })
        : await fetchHiLiaoChatsCloudBefore({ limit: pageSize, beforeCreatedAt: before || undefined });
      const fetchedCount = Array.isArray(list) ? list.length : 0;
      if (fetchedCount) mergeHiLiaoChats(list);
      const nextBefore = fetchedCount
        ? list.reduce((acc, it) => Math.min(acc, Number(it && it.createdAt) || acc), Number.POSITIVE_INFINITY)
        : 0;
      this.setData({
        items: buildItems({ onlyMine: this.data.onlyMine }),
        cloudBeforeCreatedAt: Number.isFinite(nextBefore) && nextBefore !== Number.POSITIVE_INFINITY ? nextBefore : 0,
        hasMore: fetchedCount === pageSize
      });
    } catch (e) {
      try {
        wx.showToast({ title: '加载更多失败', icon: 'none' });
      } catch (err) {}
    } finally {
      this.setData({ loadingMore: false });
    }
  },

  toggleOnlyMine() {
    const next = !this.data.onlyMine;
    try {
      wx.setStorageSync('kr_hi_liao_book_only_mine_v1', next ? 1 : 0);
    } catch (e) {}
    this.setData({ onlyMine: next, items: buildItems({ onlyMine: next }) });
  },

  openDetail(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : '';
    if (!id) return;
    wx.navigateTo({ url: `/pages/hi-chat-detail/index?id=${encodeURIComponent(String(id))}` });
  }
});
