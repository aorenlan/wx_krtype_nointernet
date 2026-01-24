import { getHiLiaoChatById, getHiLiaoChatByIdCloud, markHiLiaoGrammarViewAndShouldShowAd, upsertHiLiaoChat } from '../../utils_nv/storage';

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    dark: false,
    item: null,
    loading: false
  },

  onLoad(options) {
    if (wx.createInterstitialAd) {
      try {
        const ad = wx.createInterstitialAd({ adUnitId: 'adunit-c14a05c0ca4b9df1' });
        ad.onError(() => {});
        ad.onClose(() => {});
        this._interstitialAd = ad;
      } catch (e) {}
    }

    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const navBarHeight = menuButtonInfo ? (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height : 44;

    const id = options && options.id != null ? String(options.id) : '';
    const item = id ? getHiLiaoChatById(id) : null;
    const loading = !!id && !item;
    this.setData({ statusBarHeight, navBarHeight, item, loading });
    this._targetId = id;
    
    if (loading) {
      this.loadFromCloud(id);
    } else {
      // Even if loaded, start polling if status is pending/generating
      this.checkAndStartPolling(item);
    }
  },

  checkAndStartPolling(item) {
    const status = item && item.status ? item.status : '';
    // If pending or no explanation yet, we should poll for updates
    if (status === 'pending' || status === 'streaming' || (status === 'done' && !item.explanation) || !status) {
      this.startPolling();
    }
  },

  startPolling() {
    this.stopPolling();
    if (!this._targetId) return;
    
    const tick = () => {
       try {
         const item = getHiLiaoChatById(this._targetId);
         if (item) {
           const current = this.data.item;
           const changed = !current || 
             current.korean !== item.korean || 
             current.explanation !== item.explanation ||
             current.status !== item.status;
             
           if (changed) {
             this.setData({ item });
           }
           
           // If streaming, keep polling.
          // If done/failed/blocked, we check if we can stop.
          if (item.status === 'done' || item.status === 'failed' || item.blocked) {
             if (item.status === 'done' && item.explanation) {
                if (!this._stopTimer) {
                   this._stopTimer = setTimeout(() => this.stopPolling(), 2000);
                }
             } else {
                this.stopPolling();
             }
          }
        }
      } catch (e) {
         // Ignore errors and keep polling
       }
       this._pollTimer = setTimeout(tick, 100);
    };
    this._pollTimer = setTimeout(tick, 100);
  },

  stopPolling() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._stopTimer) {
      clearTimeout(this._stopTimer);
      this._stopTimer = null;
    }
  },

  maybeShowInterstitial() {
    const shouldShow = markHiLiaoGrammarViewAndShouldShowAd();
    if (!shouldShow) return;
    const ad = this._interstitialAd;
    if (!ad || !ad.show) return;
    const tryShow = () => ad.show();
    tryShow().catch(() => {
      if (ad.load) {
        return ad.load().then(() => ad.show()).catch(() => {});
      }
      return;
    });
  },

  async loadFromCloud(id) {
    const target = id != null ? String(id) : '';
    if (!target) return;
    try {
      const item = await getHiLiaoChatByIdCloud(target);
      if (item) {
        upsertHiLiaoChat(item);
        this.setData({ item });
        return;
      }
      try {
        wx.showToast({ title: '未找到记录', icon: 'none' });
      } catch (e) {}
    } catch (e) {
      try {
        wx.showToast({ title: '加载失败', icon: 'none' });
      } catch (err) {}
    } finally {
      this.setData({ loading: false });
    }
  },

  onShow() {
    const storedSettings = wx.getStorageSync('settings') || {};
    this.setData({ dark: !!storedSettings.darkMode });
    this.maybeShowInterstitial();
    if (this.data.item) {
      this.checkAndStartPolling(this.data.item);
    }
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  }
});
