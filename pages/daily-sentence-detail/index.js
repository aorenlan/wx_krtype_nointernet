import { addDailySentenceHistoryEntry } from '../../utils_nv/storage';

const OSS_ORIGIN = 'https://enoss.aorenlan.fun';
const OSS_BASE_PATH = '/kr_dailysentence';
const OSS_BASE_URL = `${OSS_ORIGIN}${OSS_BASE_PATH}`;

const getTodayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
};

const toTsFromBatchDate = (batchDate) => {
  const s = String(batchDate || '');
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return NaN;
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  const ts = dt.getTime();
  return Number.isFinite(ts) ? ts : NaN;
};

const resolveTs = (sentence, fallbackTs) => {
  if (sentence && sentence.timestamp != null) {
    const n = Number(sentence.timestamp);
    if (Number.isFinite(n)) return n;
  }
  if (sentence && sentence.batchDate != null) {
    const bt = toTsFromBatchDate(sentence.batchDate);
    if (Number.isFinite(bt)) return bt;
  }
  const fb = fallbackTs != null ? Number(fallbackTs) : NaN;
  return Number.isFinite(fb) ? fb : Date.now();
};

const emptyCard = () => ({
  korean: '',
  romaji: '',
  tone: '',
  context: '',
  explanation: '',
  vocabulary: '',
  audio: ''
});

const pad2 = (n) => String(n).padStart(2, '0');

const hangulNfdFallback = (input) => {
  const s = String(input || '');
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (cp >= 0xAC00 && cp <= 0xD7A3) {
      const sIndex = cp - 0xAC00;
      const lIndex = Math.floor(sIndex / 588);
      const vIndex = Math.floor((sIndex % 588) / 28);
      const tIndex = sIndex % 28;
      out += String.fromCharCode(0x1100 + lIndex);
      out += String.fromCharCode(0x1161 + vIndex);
      if (tIndex) out += String.fromCharCode(0x11A7 + tIndex);
    } else {
      out += ch;
    }
  }
  return out;
};

const toDateKey = (sentence, fallbackTs) => {
  const s = sentence && typeof sentence === 'object' ? sentence : null;
  const batchDate = s && s.batchDate != null ? String(s.batchDate) : '';
  if (/^\d{8}$/.test(batchDate)) return batchDate;
  const raw =
    (s && (s.dateKey || s.day)) ||
    (s && s.exportDate ? String(s.exportDate).split(' ')[0] : '') ||
    '';

  if (raw) {
    const parts = String(raw).split('/').filter(Boolean);
    if (parts.length >= 3) {
      const y = String(parts[0]).padStart(4, '0');
      const m = pad2(parts[1]);
      const d = pad2(parts[2]);
      return `${y}${m}${d}`;
    }
    const m = String(raw).match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return m[0];
  }

  const ts = s && s.timestamp != null ? Number(s.timestamp) : NaN;
  const fb = fallbackTs != null ? Number(fallbackTs) : NaN;
  const useTs = Number.isFinite(ts) ? ts : (Number.isFinite(fb) ? fb : NaN);
  if (!Number.isFinite(useTs)) return '';

  const d = new Date(useTs);
  if (!Number.isFinite(d.getTime())) return '';
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
};

const toOssKey = (rawText) => {
  const s = String(rawText || '');
  if (!s) return '';
  let normalized = '';
  if (typeof s.normalize === 'function') {
    try {
      normalized = s.normalize('NFD');
    } catch (e) {
      normalized = '';
    }
    if (!normalized) normalized = hangulNfdFallback(s);
    if (/[\uAC00-\uD7A3]/.test(normalized)) normalized = hangulNfdFallback(s);
  } else {
    normalized = hangulNfdFallback(s);
  }
  const allowed = /[0-9A-Za-z\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/;
  let out = '';
  for (const ch of normalized) {
    out += allowed.test(ch) ? ch : '_';
  }
  return out;
};

const toOssName = (rawText) => {
  const s = String(rawText || '');
  if (!s) return '';
  const normalized = typeof s.normalize === 'function' ? s.normalize('NFC') : s;
  const allowed = /[0-9A-Za-z\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\uD7B0-\uD7FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
  let out = '';
  for (const ch of normalized) {
    out += allowed.test(ch) ? ch : '_';
  }
  return out;
};

const normalizeUrl = (raw) => {
  const s = String(raw || '').trim();
  try { console.log('[daily-sentence] normalizeUrl input', raw); } catch (e) {}
  if (!s) {
    try { console.log('[daily-sentence] normalizeUrl output empty'); } catch (e) {}
    return '';
  }
  if (/^(https?:)?\/\//i.test(s)) {
    try { console.log('[daily-sentence] normalizeUrl output absolute', s); } catch (e) {}
    return s;
  }
  if (/^wxfile:\/\//i.test(s)) {
    try { console.log('[daily-sentence] normalizeUrl output wxfile', s); } catch (e) {}
    return s;
  }
  if (s.startsWith('/assets/')) {
    try { console.log('[daily-sentence] normalizeUrl output assets', s); } catch (e) {}
    return s;
  }
  if (s.startsWith('/')) {
    const out = `${OSS_ORIGIN}${s}`;
    try { console.log('[daily-sentence] normalizeUrl output oss-root', out); } catch (e) {}
    return out;
  }
  const out = `${OSS_BASE_URL}/${s}`;
  try { console.log('[daily-sentence] normalizeUrl output oss-base', out); } catch (e) {}
  return out;
};

const normalizeTranslations = (sentence, dateKey) => {
  const translations = sentence && Array.isArray(sentence.translations) ? sentence.translations : [];
  return translations.map((t, idx) => {
    const id = t && t.id != null ? String(t.id) : `item-${idx}`;
    const korean = (t && t.korean) || '';
    const ossKey = toOssKey(korean);
    const prefix = dateKey ? `${dateKey}-` : '';
    const rawAudio = (t && (t.audioUrl || t.audio)) || '';
    const audio = rawAudio ? normalizeUrl(rawAudio) : (ossKey ? `${OSS_BASE_URL}/${prefix}${encodeURIComponent(ossKey)}.wav` : '');
    try {
      console.log('[daily-sentence] normalizeTranslation audio', {
        dateKey,
        idx,
        id,
        hasRawAudio: !!rawAudio,
        rawAudio: rawAudio ? String(rawAudio) : '',
        ossKey,
        derivedAudio: audio
      });
    } catch (e) {}
    return {
      id,
      korean,
      romaji: (t && t.romaji) || '',
      tone: (t && t.tone) || '',
      context: (t && t.context) || '',
      explanation: (t && t.explanation) || '',
      vocabulary: (t && t.vocabulary) || '',
      audio
    };
  });
};

const normalizeSentence = (rawSentence, fallbackTs) => {
  const safe = rawSentence && typeof rawSentence === 'object' ? rawSentence : { source: '', backgroundImage: '', translations: [] };
  const resolvedTs = resolveTs(safe, fallbackTs);
  const dateKey = toDateKey(safe, resolvedTs);
  const translations = normalizeTranslations(safe, dateKey);
  const bgRaw = safe.backgroundImage || safe.image || '';
  const source = safe && safe.source != null ? String(safe.source) : '';
  const normalizedSource = source ? toOssName(source) : '';
  const bgFileFromSource = dateKey && normalizedSource ? `${dateKey}-${normalizedSource}.png` : '';
  const derivedBg = bgRaw
    ? normalizeUrl(bgRaw)
    : (bgFileFromSource ? `${OSS_BASE_URL}/${encodeURIComponent(bgFileFromSource)}` : '');
  return {
    resolvedTs,
    sentence: { ...safe, timestamp: resolvedTs, backgroundImage: derivedBg, translations },
    translations
  };
};

const callDailySentence = (params) => new Promise((resolve, reject) => {
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

const readCache = (key, maxAgeMs) => {
  try {
    const raw = wx.getStorageSync(key);
    if (!raw || typeof raw !== 'object') return null;
    const cachedAt = raw.cachedAt != null ? Number(raw.cachedAt) : NaN;
    if (!Number.isFinite(cachedAt)) return null;
    if (Date.now() - cachedAt > maxAgeMs) return null;
    return raw.value || null;
  } catch (e) {
    return null;
  }
};

const writeCache = (key, value) => {
  try {
    wx.setStorageSync(key, { cachedAt: Date.now(), value });
  } catch (e) {}
};

let interstitialAd = null;
let interstitialShowing = false;
let interstitialWatchdog = null;
let interstitialAttemptAt = 0;

const INTERSTITIAL_AD_UNIT_ID = 'adunit-a53a9f65ac42cc65';
const INTERSTITIAL_STORE_KEY = 'kr_daily_sentence_interstitial_store_v2';
const INTERSTITIAL_MIN_INTERVAL_MS = 10 * 1000;

const clearInterstitialWatchdog = () => {
  if (!interstitialWatchdog) return;
  clearTimeout(interstitialWatchdog);
  interstitialWatchdog = null;
};

const ensureInterstitialAd = (forceRecreate) => {
  if (!wx.createInterstitialAd) return;
  if (interstitialAd && !forceRecreate) return;
  clearInterstitialWatchdog();
  interstitialShowing = false;
  interstitialAttemptAt = 0;
  try {
    interstitialAd = wx.createInterstitialAd({ adUnitId: INTERSTITIAL_AD_UNIT_ID });
    interstitialAd.onLoad(() => {});
    interstitialAd.onClose(() => {
      interstitialShowing = false;
      interstitialAttemptAt = 0;
      clearInterstitialWatchdog();
    });
    interstitialAd.onError(() => {
      interstitialShowing = false;
      interstitialAttemptAt = 0;
      clearInterstitialWatchdog();
    });
  } catch (e) {
    interstitialAd = null;
  }
};

const readInterstitialStore = () => {
  try {
    const raw = wx.getStorageSync(INTERSTITIAL_STORE_KEY);
    if (!raw || typeof raw !== 'object') return { dayKey: '', lastShownAt: 0, shown: {} };
    const dayKey = raw.dayKey != null ? String(raw.dayKey) : '';
    const lastShownAt = raw.lastShownAt != null ? Number(raw.lastShownAt) : 0;
    const shownRaw = raw.shown && typeof raw.shown === 'object' ? raw.shown : {};
    const shown = Array.isArray(shownRaw)
      ? shownRaw.reduce((acc, k) => {
          const key = k != null ? String(k) : '';
          if (key) acc[key] = 1;
          return acc;
        }, {})
      : shownRaw;
    return { dayKey, lastShownAt: Number.isFinite(lastShownAt) ? lastShownAt : 0, shown };
  } catch (e) {
    return { dayKey: '', lastShownAt: 0, shown: {} };
  }
};

const writeInterstitialStore = (store) => {
  try {
    wx.setStorageSync(INTERSTITIAL_STORE_KEY, store);
  } catch (e) {}
};

const maybeShowInterstitial = ({ dayKey, contentKey }) => {
  const d = String(dayKey || '');
  if (!d) return;
  const c = String(contentKey || '');
  if (!c) return;
  const now = Date.now();
  const store = readInterstitialStore();
  const useStore = store.dayKey === d ? store : { dayKey: d, lastShownAt: 0, shown: {} };
  if (useStore.shown && useStore.shown[c]) return;
  if (now - (useStore.lastShownAt || 0) < INTERSTITIAL_MIN_INTERVAL_MS) return;

  if (interstitialShowing) {
    if (interstitialAttemptAt && now - interstitialAttemptAt < 20 * 1000) return;
    interstitialShowing = false;
    interstitialAttemptAt = 0;
    clearInterstitialWatchdog();
  }

  ensureInterstitialAd(true);
  if (!interstitialAd || !interstitialAd.show) return;

  interstitialShowing = true;
  interstitialAttemptAt = now;
  clearInterstitialWatchdog();
  interstitialWatchdog = setTimeout(() => {
    interstitialShowing = false;
    interstitialAttemptAt = 0;
    clearInterstitialWatchdog();
  }, 20 * 1000);
  const showOnce = () => {
    try {
      const p = interstitialAd.show();
      if (p && typeof p.then === 'function') return p;
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  };
  const showWithRetry = () => {
    const loadAndShow = () => {
      if (!interstitialAd || !interstitialAd.show) return Promise.reject(new Error('interstitial missing'));
      if (typeof interstitialAd.load !== 'function') return showOnce();
      return interstitialAd.load().catch(() => {}).then(() => showOnce());
    };
    return loadAndShow().catch(() => {
      ensureInterstitialAd(true);
      return loadAndShow();
    });
  };

  showWithRetry()
    .then(() => {
      const nextShown = Object.assign({}, useStore.shown || {});
      nextShown[c] = 1;
      writeInterstitialStore({ dayKey: d, lastShownAt: now, shown: nextShown });
    })
    .catch(() => {
      interstitialShowing = false;
      interstitialAttemptAt = 0;
      clearInterstitialWatchdog();
    });
};

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    windowHeight: 667,
    ts: 0,
    sentence: {
      source: '',
      backgroundImage: '',
      translations: []
    },
    translations: [],
    currentIndex: 0,
    currentCard: emptyCard(),
    nextCard: emptyCard(),
    displayCurrentCard: emptyCard(),
    displayNextCard: emptyCard(),
    hasNext: false,
    autoPlay: false,
    loading: false,
    animating: false,
    currentAnimClass: '',
    nextAnimClass: ''
  },

  ensureAudio() {
    if (!this._audio) {
      this._audio = wx.createInnerAudioContext();
    }
    if (this._audioBound) return this._audio;
    this._audioBound = true;
    const a = this._audio;
    const pickMeta = () => (this._audioDebugMeta && typeof this._audioDebugMeta === 'object' ? this._audioDebugMeta : {});
    try {
      a.onCanplay(() => {
        try { console.log('[daily-sentence] audio onCanplay', pickMeta()); } catch (e) {}
      });
      a.onPlay(() => {
        try { console.log('[daily-sentence] audio onPlay', pickMeta()); } catch (e) {}
      });
      a.onWaiting(() => {
        try { console.log('[daily-sentence] audio onWaiting', pickMeta()); } catch (e) {}
      });
      a.onPause(() => {
        try { console.log('[daily-sentence] audio onPause', pickMeta()); } catch (e) {}
      });
      a.onStop(() => {
        try { console.log('[daily-sentence] audio onStop', pickMeta()); } catch (e) {}
      });
      a.onEnded(() => {
        try { console.log('[daily-sentence] audio onEnded', pickMeta()); } catch (e) {}
      });
      a.onTimeUpdate(() => {});
      a.onError((err) => {
        try {
          const e = err && typeof err === 'object' ? err : {};
          console.error('[daily-sentence] audio onError', { ...pickMeta(), errCode: e.errCode, errMsg: e.errMsg, err });
        } catch (e) {}
      });
    } catch (e) {
      try { console.error('[daily-sentence] audio bind events fail', e); } catch (err) {}
    }
    return a;
  },

  async onLoad(options) {
    console.log('[daily-sentence] onLoad start', options);
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const navBarHeight = menuButtonInfo ? (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height : 44;
    const windowHeight = windowInfo.windowHeight || 667;

    this._audio = null;
    this._audioBound = false;
    this._audioDebugMeta = null;
    this._transitionTimer = null;
    this._swipeStartX = 0;
    this._swipeStartY = 0;
    this._swipeStartTime = 0;
    const autoPlay = !!wx.getStorageSync('kr_daily_sentence_autoplay');
    const hasShownAutoTip = !!wx.getStorageSync('kr_daily_sentence_autoplay_tip_shown');

    const ts = options && options.ts != null ? options.ts : null;
    const id = options && options.id != null ? String(options.id) : '';
    const forceLatest = !!(options && (options.forceLatest === 1 || options.forceLatest === '1' || options.forceLatest === true || options.forceLatest === 'true'));

    this.setData({
      statusBarHeight,
      navBarHeight,
      windowHeight,
      autoPlay,
      loading: true
    });

    if (!hasShownAutoTip) {
      try {
        wx.setStorageSync('kr_daily_sentence_autoplay_tip_shown', true);
        setTimeout(() => {
          try {
            wx.showToast({ title: '右上角可开启自动连读', icon: 'none', duration: 2200 });
          } catch (e) {}
        }, 240);
      } catch (e) {}
    }

    let loaded = null;
    try {
      const ttlMs = 2 * 60 * 60 * 1000;
      const tryById = async () => {
        if (!id) return null;
        const cacheKey = `kr_daily_sentence_cache_id_${id}`;
        const cached = readCache(cacheKey, ttlMs);
        if (cached) return cached;
        const callRes = await callDailySentence({ id });
        const result = callRes && callRes.result ? callRes.result : null;
        const list = result && Array.isArray(result.data) ? result.data : [];
        const found = list[0] || null;
        if (found) writeCache(cacheKey, found);
        return found;
      };
      const tryByTs = async () => {
        if (ts == null) return null;
        const n = Number(ts);
        if (!Number.isFinite(n)) return null;
        const cacheKey = `kr_daily_sentence_cache_ts_${n}`;
        const cached = readCache(cacheKey, ttlMs);
        if (cached) return cached;
        const callRes = await callDailySentence({ timestamp: n });
        const result = callRes && callRes.result ? callRes.result : null;
        const list = result && Array.isArray(result.data) ? result.data : [];
        const found = list[0] || null;
        if (found) writeCache(cacheKey, found);
        return found;
      };
      const tryLatest = async () => {
        const cacheKey = 'kr_daily_sentence_cache_latest';
        if (!forceLatest) {
          const cached = readCache(cacheKey, ttlMs);
          if (cached) return cached;
        }
        const callRes = await callDailySentence({ page: 1, pageSize: 1, orderField: 'batchDate', orderDirection: 'desc', noCache: true });
        const result = callRes && callRes.result ? callRes.result : null;
        const list = result && Array.isArray(result.data) ? result.data : [];
        const found = list[0] || null;
        if (found) writeCache(cacheKey, found);
        return found;
      };

      loaded = await tryById();
      if (!loaded) loaded = await tryByTs();
      if (!loaded && !id && ts == null) loaded = await tryLatest();
    } catch (e) {
      try {
        wx.showToast({ title: '云数据加载失败', icon: 'none' });
      } catch (err) {}
    }

    const picked = loaded || { source: '', backgroundImage: '', translations: [] };
    if (!loaded) {
      try {
        wx.showToast({ title: '暂无数据', icon: 'none' });
      } catch (err) {}
    }

    const normalized = normalizeSentence(picked, ts);
    try {
      console.log('[daily-sentence] onLoad normalized', {
        resolvedTs: normalized && normalized.resolvedTs,
        dateKey: toDateKey(normalized && normalized.sentence, normalized && normalized.resolvedTs),
        translationsCount: Array.isArray(normalized && normalized.translations) ? normalized.translations.length : 0,
        firstAudio: normalized && normalized.translations && normalized.translations[0] ? normalized.translations[0].audio : ''
      });
    } catch (e) {}
    const hasMeaningful =
      !!(normalized.sentence && normalized.sentence.source) ||
      (Array.isArray(normalized.translations) && normalized.translations.length > 0);
    if (hasMeaningful) {
      addDailySentenceHistoryEntry({ ...normalized.sentence, timestamp: normalized.resolvedTs });
    }

    this.setData({
      ts: normalized.resolvedTs,
      sentence: normalized.sentence,
      translations: normalized.translations,
      currentIndex: 0,
      loading: false
    });

    maybeShowInterstitial({ dayKey: getTodayKey(), contentKey: toDateKey(normalized.sentence, normalized.resolvedTs) });
    this.refreshCards();
  },

  onShow() {
    const shouldForceLatest = wx.getStorageSync('kr_daily_sentence_force_latest');
    if (shouldForceLatest) {
        wx.removeStorageSync('kr_daily_sentence_force_latest');
        this.forceRefreshLatest();
        return;
    }

    if (this.data.loading) return;
    const contentKey = toDateKey(this.data.sentence, this.data.ts);
    if (!contentKey) return;
    maybeShowInterstitial({ dayKey: getTodayKey(), contentKey });
  },

  async forceRefreshLatest() {
    this.setData({ loading: true });
    try {
        const callRes = await callDailySentence({ page: 1, pageSize: 1, orderField: 'batchDate', orderDirection: 'desc', noCache: true });
        const result = callRes && callRes.result ? callRes.result : null;
        const list = result && Array.isArray(result.data) ? result.data : [];
        const found = list[0] || null;
        
        if (found) {
             const cacheKey = 'kr_daily_sentence_cache_latest';
             writeCache(cacheKey, found);
             
             const normalized = normalizeSentence(found, null);
             
             // History
             if (normalized.sentence && normalized.sentence.source) {
                 addDailySentenceHistoryEntry({ ...normalized.sentence, timestamp: normalized.resolvedTs });
             }

             this.setData({
                  ts: normalized.resolvedTs,
                  sentence: normalized.sentence,
                  translations: normalized.translations,
                  currentIndex: 0,
                  loading: false
             });
             this.refreshCards();
             
             const contentKey = toDateKey(normalized.sentence, normalized.resolvedTs);
             if (contentKey) {
                 maybeShowInterstitial({ dayKey: getTodayKey(), contentKey });
             }
        } else {
            this.setData({ loading: false });
            wx.showToast({ title: '暂无最新数据', icon: 'none' });
        }
    } catch (e) {
        console.error(e);
        this.setData({ loading: false });
        wx.showToast({ title: '刷新失败', icon: 'none' });
    }
  },

  refreshCards() {
    if (this.data.animating) return;
    const list = Array.isArray(this.data.translations) ? this.data.translations : [];
    const len = list.length;
    if (len <= 0) {
      this.setData({
        currentCard: emptyCard(),
        nextCard: emptyCard(),
        displayCurrentCard: emptyCard(),
        displayNextCard: emptyCard(),
        hasNext: false,
        currentIndex: 0
      });
      return;
    }
    const idx = Math.max(0, Math.min(len - 1, Number(this.data.currentIndex) || 0));
    const currentCard = list[idx] || emptyCard();
    const hasNext = len > 1;
    const nextCard = hasNext ? (list[(idx + 1) % len] || emptyCard()) : emptyCard();
    this.setData({ currentIndex: idx, currentCard, nextCard, hasNext, displayCurrentCard: currentCard, displayNextCard: nextCard }, () => {
      if (this.data.autoPlay) {
        setTimeout(() => this.playCurrentAudio(true), 60);
      }
    });
  },

  preventMove() {},

  openHistory() {
    wx.navigateTo({ url: '/pages/daily-sentence-history/index' });
  },

  onNavBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/nv-practice/index' });
      }
    });
  },

  startTransition(direction) {
    if (this.data.animating) return false;
    const list = Array.isArray(this.data.translations) ? this.data.translations : [];
    const len = list.length;
    if (len <= 1) return false;

    const idx = Number(this.data.currentIndex) || 0;
    const nextIndex = direction === 'prev'
      ? (idx - 1 + len) % len
      : (idx + 1) % len;

    if (this._transitionTimer) {
      clearTimeout(this._transitionTimer);
      this._transitionTimer = null;
    }

    const isPrev = direction === 'prev';
    const nextCurrentCard = list[nextIndex] || emptyCard();
    const nextNextCard = list[(nextIndex + 1) % len] || emptyCard();
    this.setData({
      animating: true,
      currentAnimClass: isPrev ? 'anim-out-prev' : 'anim-out-next',
      nextAnimClass: isPrev ? 'anim-in-prev' : 'anim-in-next',
      displayCurrentCard: this.data.currentCard || emptyCard(),
      displayNextCard: isPrev ? nextCurrentCard : (this.data.nextCard || emptyCard())
    });

    this._transitionTimer = setTimeout(() => {
      this._transitionTimer = null;
      this.setData({
        currentIndex: nextIndex,
        animating: false,
        currentAnimClass: '',
        nextAnimClass: '',
        currentCard: nextCurrentCard,
        nextCard: nextNextCard,
        displayCurrentCard: nextCurrentCard,
        displayNextCard: nextNextCard,
        hasNext: len > 1
      }, () => {
        if (this.data.autoPlay) setTimeout(() => this.playCurrentAudio(true), 60);
      });
    }, 240);

    return true;
  },

  nextCard() {
    this.startTransition('next');
  },

  prevCard() {
    this.startTransition('prev');
  },

  onSwipeStart(e) {
    const t = e && e.touches && e.touches[0] ? e.touches[0] : null;
    if (!t) return;
    this._swipeStartX = Number(t.clientX) || 0;
    this._swipeStartY = Number(t.clientY) || 0;
    this._swipeStartTime = Date.now();
  },

  onSwipeEnd(e) {
    if (this.data.animating) return;
    const t = e && e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : null;
    if (!t) return;
    const endX = Number(t.clientX) || 0;
    const endY = Number(t.clientY) || 0;
    const dx = endX - (Number(this._swipeStartX) || 0);
    const dy = endY - (Number(this._swipeStartY) || 0);
    const dt = Date.now() - (Number(this._swipeStartTime) || 0);
    if (dt > 650) return;
    if (Math.abs(dx) < 44) return;
    if (Math.abs(dy) > Math.abs(dx) * 1.1) return;
    if (dx < 0) this.nextCard();
    else this.prevCard();
  },

  toggleAutoPlay() {
    const checked = !this.data.autoPlay;
    this.setData({ autoPlay: checked }, () => {
      try {
        wx.setStorageSync('kr_daily_sentence_autoplay', checked);
      } catch (err) {}
      if (checked) {
        setTimeout(() => this.playCurrentAudio(true), 60);
      }
    });
  },

  playCurrentAudio(silent) {
    if (this.data.animating) return;
    const isSilent = typeof silent === 'boolean' ? silent : false;
    const rawSrc = this.data.currentCard && this.data.currentCard.audio ? String(this.data.currentCard.audio) : '';
    const audio = rawSrc.replace(/^`+/, '').replace(/`+$/, '').trim();
    if (!audio) {
      try {
        console.log('[daily-sentence] audio no src', {
          ts: this.data.ts,
          currentIndex: this.data.currentIndex,
          cardId: this.data.currentCard && this.data.currentCard.id,
          korean: this.data.currentCard && this.data.currentCard.korean
        });
      } catch (e) {}
      if (!isSilent) wx.showToast({ title: '暂无语音', icon: 'none' });
      return;
    }
    let sys = null;
    try {
      sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null;
    } catch (e) {}
    const meta = {
      ts: this.data.ts,
      currentIndex: this.data.currentIndex,
      cardId: this.data.currentCard && this.data.currentCard.id,
      korean: this.data.currentCard && this.data.currentCard.korean,
      src: audio,
      platform: sys && sys.platform,
      system: sys && sys.system,
      brand: sys && sys.brand,
      model: sys && sys.model,
      version: sys && sys.version,
      SDKVersion: sys && sys.SDKVersion
    };
    this._audioDebugMeta = meta;
    try { console.log('[daily-sentence] audio play request', meta); } catch (e) {}
    try { console.log('[daily-sentence] audio src includes oss origin', { ...meta, includes: audio.includes(OSS_ORIGIN) }); } catch (e) {}
    try {
      wx.getNetworkType({
        success: (res) => {
          try { console.log('[daily-sentence] networkType', { ...meta, networkType: res && res.networkType }); } catch (e) {}
        },
        fail: (err) => {
          try { console.log('[daily-sentence] networkType fail', { ...meta, err: err && err.errMsg ? String(err.errMsg) : String(err) }); } catch (e) {}
        }
      });
    } catch (e) {}
    const a = this.ensureAudio();
    try { a.stop(); } catch (e) {}
    try { a.src = audio; } catch (e) {}
    try { a.play(); } catch (e) {
      try { console.error('[daily-sentence] audio play throw', { ...meta, err: e && e.message ? String(e.message) : String(e) }); } catch (err) {}
    }
  },

  onUnload() {
    try {
      if (this._audio) {
        this._audio.stop();
        this._audio.destroy();
      }
    } catch (e) {}
    try {
      if (this._transitionTimer) clearTimeout(this._transitionTimer);
    } catch (e) {}
    this._audio = null;
    this._transitionTimer = null;
  }
});
