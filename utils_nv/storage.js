const STORAGE_KEY = 'flashflow_imported_lists';
const MISTAKES_KEY = 'flashflow_mistakes';
const WORDS_CACHE_KEY_PREFIX = 'flashflow_words_cache_';
const PROGRESS_KEY_PREFIX = 'flashflow_progress_';
const DAILY_SENTENCE_HISTORY_KEY = 'kr_daily_sentence_history';

export const getImportedLists = () => {
  const raw = wx.getStorageSync(STORAGE_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.map((l) => {
    if (!l || typeof l !== 'object') return null;
    const words = Array.isArray(l.words) ? l.words : [];
    return { ...l, words };
  }).filter(Boolean);
};

export const getCachedWords = (category, filters) => {
    const key = getCacheKey(category, filters);
    return wx.getStorageSync(key) || null;
};

export const setCachedWords = (category, filters, words) => {
    const key = getCacheKey(category, filters);
    wx.setStorageSync(key, words);
};

const getCacheKey = (category, filters) => {
    let key = `${WORDS_CACHE_KEY_PREFIX}${category}`;
    if (filters) {
        if (filters.minLength) key += `_len${filters.minLength}`;
        if (filters.firstLetter) key += `_let${filters.firstLetter}`;
    }
    return key;
};

export const getMistakes = () => {
  const raw = wx.getStorageSync(MISTAKES_KEY);
  return Array.isArray(raw) ? raw : [];
};

export const saveMistake = (word) => {
    try {
        const mistakes = getMistakes();
        const incomingId = word && word.id != null ? String(word.id) : '';
        const incomingWord = word && word.word != null ? String(word.word).trim() : '';
        if (!incomingId && !incomingWord) {
            return { success: false, message: 'Invalid word' };
        }
        if (mistakes.some(w => (incomingId && w && w.id != null && String(w.id) === incomingId) || (incomingWord && w && w.word != null && String(w.word).trim() === incomingWord))) {
            return { success: true };
        }
        const newMistake = { ...word, addedAt: Date.now() };
        mistakes.unshift(newMistake);
        wx.setStorageSync(MISTAKES_KEY, mistakes.slice(0, 100));
        return { success: true };
    } catch (e) {
        console.error('Save mistake error:', e);
        return { success: false, message: e.message };
    }
};

export const removeMistake = (wordId) => {
    try {
        const targetId = wordId != null ? String(wordId) : '';
        if (!targetId) return { success: false, message: 'Invalid wordId' };
        const mistakes = getMistakes();
        const newMistakes = mistakes.filter(w => !(w && w.id != null && String(w.id) === targetId));
        wx.setStorageSync(MISTAKES_KEY, newMistakes);
        return { success: true };
    } catch (e) {
        console.error('Remove mistake error:', e);
        return { success: false, message: e.message };
    }
};

export const saveImportedList = (name, words) => {
  try {
    const lists = getImportedLists();
    if (lists.length >= 10) {
      return { success: false, message: '最多只能创建10个词单' };
    }
    const newList = {
      id: Date.now().toString(),
      name,
      words,
      createdAt: Date.now()
    };
    lists.unshift(newList);
    wx.setStorageSync(STORAGE_KEY, lists);
    return { success: true, list: newList };
  } catch (e) {
    console.error('Save list error:', e);
    return { success: false, message: '保存失败: ' + e.message };
  }
};

export const updateImportedList = (id, name, words) => {
  try {
    const lists = getImportedLists();
    const index = lists.findIndex(l => l.id === id);
    if (index === -1) return { success: false, message: 'List not found' };
    
    lists[index] = { ...lists[index], name, words, updatedAt: Date.now() };
    wx.setStorageSync(STORAGE_KEY, lists);
    return { success: true };
  } catch (e) {
    console.error('Update list error:', e);
    return { success: false, message: '更新失败: ' + e.message };
  }
};

export const deleteImportedList = (id) => {
  try {
    const lists = getImportedLists();
    const newLists = lists.filter(l => l.id !== id);
    wx.setStorageSync(STORAGE_KEY, newLists);
    return { success: true };
  } catch (e) {
    console.error('Delete list error:', e);
    return { success: false, message: '删除失败: ' + e.message };
  }
};

export const saveProgress = (category, index) => {
    try {
        const key = `${PROGRESS_KEY_PREFIX}${category}`;
        wx.setStorageSync(key, index);
        wx.setStorageSync('flashflow_last_progress', { category, index });
    } catch (e) {
        console.error('Save progress error:', e);
    }
};

export const saveProgressV2 = (category, subKey, index) => {
    try {
        const safeCategory = String(category || '');
        const safeSubKey = String(subKey || '');
        const key = `${PROGRESS_KEY_PREFIX}${safeCategory}__${safeSubKey}`;
        wx.setStorageSync(key, index);
        wx.setStorageSync('flashflow_last_progress', { category: safeCategory, subKey: safeSubKey, index });
    } catch (e) {
        console.error('Save progress error:', e);
    }
};

export const getProgress = (category, subKey) => {
    try {
        if (subKey != null) {
            const safeCategory = String(category || '');
            const safeSubKey = String(subKey || '');
            const keyV2 = `${PROGRESS_KEY_PREFIX}${safeCategory}__${safeSubKey}`;
            const v2 = wx.getStorageSync(keyV2);
            if (typeof v2 === 'number') return v2;
            if (typeof v2 === 'string' && v2 !== '') {
                const n = Number(v2);
                if (Number.isFinite(n)) return n;
            }
        }

        const key = `${PROGRESS_KEY_PREFIX}${category}`;
        return wx.getStorageSync(key) || 0;
    } catch (e) {
        return 0;
    }
};

export const getLastProgress = () => {
    return wx.getStorageSync('flashflow_last_progress') || null;
};

export const getDailySentenceHistory = () => {
  const raw = wx.getStorageSync(DAILY_SENTENCE_HISTORY_KEY);
  if (!Array.isArray(raw)) return [];
  const normalized = raw.filter((x) => x && typeof x === 'object').map((x) => {
    const day = x && x.day ? String(x.day) : '';
    if (day) return x;
    const ts = x && x.timestamp != null ? Number(x.timestamp) : NaN;
    const exportDate = x && x.exportDate ? String(x.exportDate) : '';
    const derivedDay = deriveDailySentenceDay({ timestamp: ts, exportDate });
    return { ...x, day: derivedDay };
  });
  const byDay = new Map();
  for (const it of normalized) {
    const day = it && it.day ? String(it.day) : '';
    const key = day || String((it && it.timestamp) || '');
    const prev = byDay.get(key);
    if (!prev) {
      byDay.set(key, it);
      continue;
    }
    const pt = prev && prev.timestamp != null ? Number(prev.timestamp) : 0;
    const ct = it && it.timestamp != null ? Number(it.timestamp) : 0;
    if (ct > pt) byDay.set(key, it);
  }
  return Array.from(byDay.values());
};

const pad2 = (n) => String(n).padStart(2, '0');

const formatDay = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}/${m}/${day}`;
};

const deriveDailySentenceDay = ({ timestamp, exportDate }) => {
  const raw = exportDate ? String(exportDate) : '';
  if (raw) {
    const first = raw.split(' ')[0] || '';
    const parts = first.split('/').filter(Boolean);
    if (parts.length >= 3) {
      const y = parts[0];
      const m = pad2(parts[1]);
      const d = pad2(parts[2]);
      return `${y}/${m}/${d}`;
    }
  }
  const ts = timestamp != null ? Number(timestamp) : NaN;
  if (Number.isFinite(ts)) return formatDay(new Date(ts));
  return '';
};

export const addDailySentenceHistoryEntry = (entry) => {
  try {
    if (!entry || typeof entry !== 'object') return;
    const history = getDailySentenceHistory();
    const ts = entry.timestamp != null ? Number(entry.timestamp) : NaN;
    const day = deriveDailySentenceDay({ timestamp: ts, exportDate: entry.exportDate });
    const key = day || (Number.isFinite(ts) ? String(ts) : String(entry.source || ''));
    const next = history.filter((x) => {
      const xDay = x && x.day ? String(x.day) : '';
      const xKey = xDay || (() => {
        const xTs = x && x.timestamp != null ? Number(x.timestamp) : NaN;
        return Number.isFinite(xTs) ? String(xTs) : String(x && x.source ? x.source : '');
      })();
      return xKey !== key;
    });
    next.unshift({
      timestamp: entry.timestamp || Date.now(),
      day,
      exportDate: day || (entry.exportDate || ''),
      source: entry.source || '',
      backgroundImage: entry.backgroundImage || '',
      translations: Array.isArray(entry.translations) ? entry.translations : []
    });
    wx.setStorageSync(DAILY_SENTENCE_HISTORY_KEY, next.slice(0, 100));
  } catch (e) {}
};

export const clearDailySentenceHistory = () => {
  try {
    wx.removeStorageSync(DAILY_SENTENCE_HISTORY_KEY);
  } catch (e) {}
};

const HI_LIAO_CHATS_KEY = 'kr_hiliao_chats_v1';
const HI_LIAO_DEVICE_ID_KEY = 'kr_hi_liao_device_id_v1';
const HI_LIAO_NICKNAME_KEY = 'kr_hi_liao_nickname_v1';
const HI_LIAO_CLOUD_COLLECTIONS = ['kr_hi_liao_messages'];
const HI_LIAO_CLOUD_COLLECTION_PREF_KEY = 'kr_hi_liao_cloud_collection_pref_v1';
const HI_LIAO_CLOUD_FEED_CACHE_KEY = 'kr_hi_liao_cloud_feed_cache_v1';
const HI_LIAO_CLOUD_FEED_CACHE_TTL_MS = 2 * 60 * 1000;
const HI_LIAO_CLOUD_BOOK_REFRESH_AT_KEY = 'kr_hi_liao_book_cloud_refresh_at_v1';
const HI_LIAO_BOOK_LAST_SYNC_AT_KEY = 'kr_hi_liao_book_last_sync_at_v1';
const HI_LIAO_CLOUD_BOOK_REFRESH_TTL_MS = 12 * 60 * 60 * 1000;
const HI_LIAO_CLOUD_WRITE_QUEUE_KEY = 'kr_hi_liao_cloud_write_queue_v1';
const HI_LIAO_GRAMMAR_AD_STORE_KEY = 'kr_hi_liao_grammar_ad_store_v1';
const HI_LIAO_GRAMMAR_AD_LAST_SHOWN_AT_KEY = 'kr_hi_liao_grammar_ad_last_shown_at_v1';
const HI_LIAO_CHAT_QUOTA_STORE_KEY = 'kr_hi_liao_chat_quota_store_v1';

let hiLiaoWriteTimer = null;
let hiLiaoWriteInFlight = false;
let hiLiaoWriteLastErrorMsg = '';
let hiLiaoWriteLastErrorAt = 0;
let hiLiaoWriteRetryKey = '';
let hiLiaoWriteRetryCount = 0;

const setHiLiaoWriteLastError = (err) => {
  const msg = err && err.errMsg != null
    ? String(err.errMsg)
    : (err && err.message != null ? String(err.message) : (err != null ? String(err) : ''));
  hiLiaoWriteLastErrorMsg = String(msg || '').trim();
  hiLiaoWriteLastErrorAt = Date.now();
};

const clearHiLiaoWriteLastError = () => {
  hiLiaoWriteLastErrorMsg = '';
  hiLiaoWriteLastErrorAt = 0;
};

export const getHiLiaoChatCloudWriteLastError = () => {
  const ttlMs = 2 * 60 * 1000;
  if (!hiLiaoWriteLastErrorMsg) return '';
  if (!hiLiaoWriteLastErrorAt) return '';
  if ((Date.now() - hiLiaoWriteLastErrorAt) > ttlMs) return '';
  return hiLiaoWriteLastErrorMsg;
};

const withHiLiaoCollections = async (runner) => {
  let lastError = null;
  let preferred = '';
  try {
    const v = wx.getStorageSync(HI_LIAO_CLOUD_COLLECTION_PREF_KEY);
    if (v && typeof v === 'string') preferred = v;
  } catch (e) {}

  const ordered = (() => {
    const list = Array.isArray(HI_LIAO_CLOUD_COLLECTIONS) ? HI_LIAO_CLOUD_COLLECTIONS.slice() : [];
    if (!preferred) return list;
    if (!list.includes(preferred)) return list;
    return [preferred, ...list.filter((x) => x !== preferred)];
  })();

  for (const name of ordered) {
    try {
      const out = await runner(name);
      try {
        wx.setStorageSync(HI_LIAO_CLOUD_COLLECTION_PREF_KEY, name);
      } catch (e) {}
      return out;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('cloud unavailable');
};

const getHiLiaoCollectionsOrdered = () => {
  let preferred = '';
  try {
    const v = wx.getStorageSync(HI_LIAO_CLOUD_COLLECTION_PREF_KEY);
    if (v && typeof v === 'string') preferred = v;
  } catch (e) {}
  const list = Array.isArray(HI_LIAO_CLOUD_COLLECTIONS) ? HI_LIAO_CLOUD_COLLECTIONS.slice() : [];
  if (!preferred) return list;
  if (!list.includes(preferred)) return list;
  return [preferred, ...list.filter((x) => x !== preferred)];
};

const setHiLiaoCollectionPreferred = (name) => {
  try {
    wx.setStorageSync(HI_LIAO_CLOUD_COLLECTION_PREF_KEY, name);
  } catch (e) {}
};

const withHiLiaoCollectionsNonEmptyArray = async (runner) => {
  const ordered = getHiLiaoCollectionsOrdered();
  let lastError = null;
  let empty = null;
  for (const name of ordered) {
    try {
      const out = await runner(name);
      if (Array.isArray(out) && out.length === 0) {
        if (!empty) empty = { name, out };
        continue;
      }
      setHiLiaoCollectionPreferred(name);
      return out;
    } catch (e) {
      lastError = e;
    }
  }
  if (empty) {
    setHiLiaoCollectionPreferred(empty.name);
    return empty.out;
  }
  throw lastError || new Error('cloud unavailable');
};

const isHiLiaoFunctionNotFoundError = (err) => {
  const msg = err && err.errMsg != null ? String(err.errMsg) : (err && err.message != null ? String(err.message) : '');
  if (!msg) return false;
  return msg.includes('FUNCTION_NOT_FOUND')
    || msg.includes('FunctionName parameter could not be found')
    || msg.includes('errCode: -501000');
};

const isHiLiaoCollectionNotExistsError = (err) => {
  const msg = err && err.errMsg != null ? String(err.errMsg) : (err && err.message != null ? String(err.message) : '');
  const code = err && err.errCode != null ? String(err.errCode) : '';
  const m = String(msg || '').toLowerCase();
  if (code && (code.includes('COLLECTION') || code.includes('collection') || code.includes('NOT_EXIST'))) return true;
  return (m.includes('collection') && (m.includes('not exist') || m.includes('not exists') || m.includes('does not exist')))
    || (String(msg || '').includes('集合') && String(msg || '').includes('不存在'));
};

const isHiLiaoWritePermanentError = (err) => {
  const msg = err && err.errMsg != null ? String(err.errMsg) : (err && err.message != null ? String(err.message) : '');
  const code = err && err.errCode != null ? String(err.errCode) : '';
  const m = String(msg || '').toLowerCase();
  if (code && (code.includes('PERMISSION') || code.includes('AUTH') || code.includes('UNAUTHORIZED'))) return true;
  if (m.includes('permission') || m.includes('unauthorized') || m.includes('not authorized') || m.includes('no permission')) return true;
  return false;
};

const isHiLiaoWriteSetupError = (err) => {
  const msg = err && err.errMsg != null ? String(err.errMsg) : (err && err.message != null ? String(err.message) : '');
  const code = err && err.errCode != null ? String(err.errCode) : '';
  const m = String(msg || '').toLowerCase();
  if (code && (code.includes('ResourceNotFound') || code.includes('RESOURCE_NOT_FOUND'))) return true;
  if (m.includes('resource not found')) return true;
  if (String(msg || '').includes('数据源') && String(msg || '').includes('不存在')) return true;
  if (String(msg || '').includes('InnerError.ResourceNotFound')) return true;
  return false;
};

const scheduleHiLiaoWriteRetry = ({ batchKey, err, minDelayMs } = {}) => {
  if (hiLiaoWriteTimer) return;
  if (isHiLiaoWritePermanentError(err)) return;
  if (isHiLiaoWriteSetupError(err)) return;
  const key = batchKey != null ? String(batchKey) : '';
  if (key && key === hiLiaoWriteRetryKey) {
    hiLiaoWriteRetryCount += 1;
  } else {
    hiLiaoWriteRetryKey = key;
    hiLiaoWriteRetryCount = 1;
  }
  if (hiLiaoWriteRetryCount >= 8) return;
  const base = Number(minDelayMs) > 0 ? Number(minDelayMs) : 6000;
  const exp = Math.min(6, Math.max(0, hiLiaoWriteRetryCount - 1));
  const rawDelay = Math.min(5 * 60 * 1000, Math.floor(base * Math.pow(2, exp)));
  const jitter = 0.2;
  const factor = 1 - jitter + (Math.random() * jitter * 2);
  const delay = Math.max(1500, Math.floor(rawDelay * factor));
  hiLiaoWriteTimer = setTimeout(() => {
    hiLiaoWriteTimer = null;
    flushHiLiaoChatCloudWriteQueue();
  }, delay);
};

const resetHiLiaoWriteRetry = () => {
  hiLiaoWriteRetryKey = '';
  hiLiaoWriteRetryCount = 0;
};

const _hiLiaoSyncPending = new Map();

const callHiLiaoSync = (data) => {
  const action = data && data.action;
  const isFetch = typeof action === 'string' && action.startsWith('fetch');
  let dedupKey = '';
  
  if (isFetch) {
    try {
      dedupKey = JSON.stringify({
        a: action,
        l: data.limit,
        o: data.offset,
        s: data.sinceUpdatedAt,
        b: data.beforeCreatedAt,
        c: data.collection,
        m: !!data.mine,
        d: data.deviceId
      });
    } catch (e) {}
  }

  if (dedupKey && _hiLiaoSyncPending.has(dedupKey)) {
     return _hiLiaoSyncPending.get(dedupKey);
  }

  const promise = new Promise((resolve, reject) => {
    if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
      console.error('[hiLiaoSync] wx.cloud.callFunction unavailable');
      reject(new Error('cloud function unavailable'));
      return;
    }
    const payload = data && typeof data === 'object' ? { ...data } : {};
    if (!payload.__reqId) payload.__reqId = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    if (!payload.__ts) payload.__ts = Date.now();
    const startedAt = Date.now();
    const action = payload.action != null ? String(payload.action) : '';
    const meta = {
      action,
      reqId: payload.__reqId,
      limit: payload.limit,
      offset: payload.offset,
      sinceUpdatedAt: payload.sinceUpdatedAt,
      beforeCreatedAt: payload.beforeCreatedAt,
      itemsCount: Array.isArray(payload.items) ? payload.items.length : undefined
    };
    try {
      console.log('[hiLiaoSync] call start', meta);
    } catch (e) {}
    wx.cloud.callFunction({
      name: 'hiLiaoSync',
      data: payload,
      success: (res) => {
        try {
          const result = res && res.result ? res.result : null;
          console.log('[hiLiaoSync] call ok', { ...meta, ms: Date.now() - startedAt, ok: !!(result && result.ok), collection: result && result.collection });
        } catch (e) {}
        resolve(res);
      },
      fail: (err) => {
        try {
          const msg = err && err.errMsg != null ? String(err.errMsg) : (err && err.message != null ? String(err.message) : String(err));
          console.error('[hiLiaoSync] call fail', { ...meta, ms: Date.now() - startedAt, err: msg });
        } catch (e) {}
        if (isHiLiaoFunctionNotFoundError(err)) {
          try {
            const tipKey = 'kr_hi_liao_fn_not_found_tip_v1';
            const seen = !!wx.getStorageSync(tipKey);
            if (!seen) {
              wx.setStorageSync(tipKey, 1);
              wx.showModal({
                title: '云函数未部署',
                content: '当前环境找不到 hiLiaoSync 云函数（FUNCTION_NOT_FOUND）。请在云开发控制台/开发者工具部署 cloudfunctions/hiLiaoSync 后再试。',
                showCancel: false
              });
            }
          } catch (e) {}
        }
        reject(err);
      }
    });
  });

  if (dedupKey) {
    _hiLiaoSyncPending.set(dedupKey, promise);
    promise.finally(() => {
        if (_hiLiaoSyncPending.get(dedupKey) === promise) {
            _hiLiaoSyncPending.delete(dedupKey);
        }
    });
  }

  return promise;
};

const normalizeHiLiaoChat = (x) => {
  if (!x || typeof x !== 'object') return null;
  const id = x && x.id != null ? String(x.id) : (x && x._id != null ? String(x._id) : '');
  if (!id) return null;
  const createdAt = x && x.createdAt != null ? Number(x.createdAt) : Date.now();
  const updatedAt = x && x.updatedAt != null ? Number(x.updatedAt) : createdAt;
  return {
    id,
    nickname: x && x.nickname != null ? String(x.nickname) : '',
    deviceId: x && x.deviceId != null ? String(x.deviceId) : '',
    userText: x && x.userText != null ? String(x.userText) : '',
    korean: x && x.korean != null ? String(x.korean) : '',
    explanation: x && x.explanation != null ? String(x.explanation) : '',
    rejectReason: x && x.rejectReason != null ? String(x.rejectReason) : '',
    blocked: !!(x && x.blocked),
    status: x && x.status != null ? String(x.status) : 'done',
    violationCode: x && x.violationCode != null ? String(x.violationCode) : '',
    message: x && x.message != null ? String(x.message) : '',
    model: x && x.model != null ? String(x.model) : '',
    promptVersion: x && x.promptVersion != null ? String(x.promptVersion) : '',
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    mineHint: !!(x && x.mineHint)
  };
};

const toHiLiaoCloudDoc = (normalized) => {
  if (!normalized || typeof normalized !== 'object') return null;
  const id = normalized.id != null ? String(normalized.id) : '';
  if (!id) return null;
  return {
    id,
    nickname: normalized.nickname,
    deviceId: normalized.deviceId,
    userText: normalized.userText,
    korean: normalized.korean,
    explanation: normalized.explanation,
    rejectReason: normalized.rejectReason,
    blocked: !!normalized.blocked,
    status: normalized.status,
    violationCode: normalized.violationCode,
    message: normalized.message,
    model: normalized.model,
    promptVersion: normalized.promptVersion,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    dayKey: (() => {
      const d = new Date(Number(normalized.createdAt) || Date.now());
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}${m}${day}`;
    })()
  };
};

export const getHiLiaoChats = () => {
  const raw = wx.getStorageSync(HI_LIAO_CHATS_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeHiLiaoChat).filter(Boolean);
};

const setHiLiaoChats = (items) => {
  try {
    const normalized = Array.isArray(items) ? items.filter((x) => x && typeof x === 'object') : [];
    wx.setStorageSync(HI_LIAO_CHATS_KEY, normalized.slice(0, 500));
  } catch (e) {}
};

export const mergeHiLiaoChats = (incoming) => {
  try {
    const current = getHiLiaoChats();
    const byId = new Map();
    for (const it of current) {
      if (it && it.id) byId.set(String(it.id), it);
    }
    const normalizedIncoming = Array.isArray(incoming) ? incoming.map(normalizeHiLiaoChat).filter(Boolean) : [];
    for (const it of normalizedIncoming) {
      const prev = byId.get(it.id);
      if (!prev) {
        byId.set(it.id, it);
        continue;
      }
      const prevUpdated = prev && prev.updatedAt != null ? Number(prev.updatedAt) : 0;
      const nextUpdated = it && it.updatedAt != null ? Number(it.updatedAt) : 0;
      byId.set(it.id, nextUpdated >= prevUpdated ? it : prev);
    }
    const merged = Array.from(byId.values());
    merged.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    setHiLiaoChats(merged);
    return merged;
  } catch (e) {
    return getHiLiaoChats();
  }
};

export const addHiLiaoChat = (chat) => {
  try {
    if (!chat || typeof chat !== 'object') return getHiLiaoChats();
    const normalized = normalizeHiLiaoChat(chat);
    if (!normalized) return getHiLiaoChats();
    const list = getHiLiaoChats();
    const next = list.filter((x) => !(x && x.id === normalized.id));
    next.unshift(normalized);
    setHiLiaoChats(next);
    return next;
  } catch (e) {
    return getHiLiaoChats();
  }
};

export const upsertHiLiaoChat = (chat) => {
  return addHiLiaoChat(chat);
};

export const getHiLiaoChatById = (id) => {
  const target = id != null ? String(id) : '';
  if (!target) return null;
  const list = getHiLiaoChats();
  return list.find((x) => x && x.id === target) || null;
};

const readHiLiaoFeedCache = () => {
  try {
    const raw = wx.getStorageSync(HI_LIAO_CLOUD_FEED_CACHE_KEY);
    if (!raw || typeof raw !== 'object') return null;
    const cachedAt = raw.cachedAt != null ? Number(raw.cachedAt) : 0;
    const maxUpdatedAt = raw.maxUpdatedAt != null ? Number(raw.maxUpdatedAt) : 0;
    const items = Array.isArray(raw.items) ? raw.items.map(normalizeHiLiaoChat).filter(Boolean) : [];
    if (!Number.isFinite(cachedAt) || cachedAt <= 0) return null;
    return {
      cachedAt,
      maxUpdatedAt: Number.isFinite(maxUpdatedAt) ? maxUpdatedAt : 0,
      items
    };
  } catch (e) {
    return null;
  }
};

const writeHiLiaoFeedCache = ({ items, maxUpdatedAt }) => {
  try {
    const normalized = Array.isArray(items) ? items.map(normalizeHiLiaoChat).filter(Boolean) : [];
    const max = Number.isFinite(maxUpdatedAt)
      ? maxUpdatedAt
      : normalized.reduce((acc, it) => Math.max(acc, Number(it.updatedAt) || 0), 0);
    wx.setStorageSync(HI_LIAO_CLOUD_FEED_CACHE_KEY, {
      cachedAt: Date.now(),
      maxUpdatedAt: max,
      items: normalized.slice(0, 120)
    });
  } catch (e) {}
};

export const shouldRefreshHiLiaoBookFromCloud = () => {
  try {
    const last = wx.getStorageSync(HI_LIAO_CLOUD_BOOK_REFRESH_AT_KEY);
    const ts = last != null ? Number(last) : 0;
    if (!Number.isFinite(ts) || ts <= 0) return true;
    return (Date.now() - ts) >= HI_LIAO_CLOUD_BOOK_REFRESH_TTL_MS;
  } catch (e) {
    return true;
  }
};

export const markHiLiaoBookCloudRefreshed = () => {
  try {
    wx.setStorageSync(HI_LIAO_CLOUD_BOOK_REFRESH_AT_KEY, Date.now());
  } catch (e) {}
};

export const getHiLiaoBookLastSyncAt = () => {
  try {
    const ts = wx.getStorageSync(HI_LIAO_BOOK_LAST_SYNC_AT_KEY);
    const n = ts != null ? Number(ts) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch (e) {
    return 0;
  }
};

export const markHiLiaoBookLastSynced = (ts) => {
  try {
    const n = ts != null ? Number(ts) : Date.now();
    wx.setStorageSync(HI_LIAO_BOOK_LAST_SYNC_AT_KEY, Number.isFinite(n) ? n : Date.now());
  } catch (e) {}
};

const hiLiaoTodayKey = (ts) => {
  const d = new Date(ts != null ? Number(ts) : Date.now());
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
};

const readHiLiaoGrammarAdStore = () => {
  try {
    const raw = wx.getStorageSync(HI_LIAO_GRAMMAR_AD_STORE_KEY);
    if (!raw || typeof raw !== 'object') return { dayKey: hiLiaoTodayKey(), count: 0 };
    const dayKey = raw.dayKey != null ? String(raw.dayKey) : '';
    const count = raw.count != null ? Number(raw.count) : 0;
    const today = hiLiaoTodayKey();
    if (!dayKey || dayKey !== today) return { dayKey: today, count: 0 };
    return { dayKey, count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0 };
  } catch (e) {
    return { dayKey: hiLiaoTodayKey(), count: 0 };
  }
};

const writeHiLiaoGrammarAdStore = (store) => {
  try {
    wx.setStorageSync(HI_LIAO_GRAMMAR_AD_STORE_KEY, store);
  } catch (e) {}
};

export const markHiLiaoGrammarViewAndShouldShowAd = () => {
  const now = Date.now();
  let last = 0;
  try {
    const raw = wx.getStorageSync(HI_LIAO_GRAMMAR_AD_LAST_SHOWN_AT_KEY);
    last = raw != null ? Number(raw) : 0;
  } catch (e) {
    last = 0;
  }
  const gap = now - (Number.isFinite(last) ? last : 0);
  if (gap < 10 * 1000) return false;
  try {
    wx.setStorageSync(HI_LIAO_GRAMMAR_AD_LAST_SHOWN_AT_KEY, now);
  } catch (e) {}
  return true;
};

const readHiLiaoChatQuotaStore = () => {
  try {
    const raw = wx.getStorageSync(HI_LIAO_CHAT_QUOTA_STORE_KEY);
    if (!raw || typeof raw !== 'object') return { dayKey: hiLiaoTodayKey(), used: 0, bonus: 0 };
    const dayKey = raw.dayKey != null ? String(raw.dayKey) : '';
    const used = raw.used != null ? Number(raw.used) : 0;
    const bonus = raw.bonus != null ? Number(raw.bonus) : 0;
    const today = hiLiaoTodayKey();
    if (!dayKey || dayKey !== today) return { dayKey: today, used: 0, bonus: 0 };
    return {
      dayKey,
      used: Number.isFinite(used) ? Math.max(0, Math.floor(used)) : 0,
      bonus: Number.isFinite(bonus) ? Math.max(0, Math.floor(bonus)) : 0
    };
  } catch (e) {
    return { dayKey: hiLiaoTodayKey(), used: 0, bonus: 0 };
  }
};

const writeHiLiaoChatQuotaStore = (store) => {
  try {
    wx.setStorageSync(HI_LIAO_CHAT_QUOTA_STORE_KEY, store);
  } catch (e) {}
};

const countHiLiaoChatsUsedTodayLocal = () => {
  try {
    const today = hiLiaoTodayKey();
    if (!today) return 0;
    const myDeviceId = getOrCreateHiLiaoDeviceId();
    const myNickname = (() => {
      try {
        const existing = wx.getStorageSync(HI_LIAO_NICKNAME_KEY);
        if (existing && typeof existing === 'string') return existing;
      } catch (e) {}
      return '';
    })();
    const list = getHiLiaoChats();
    let count = 0;
    for (const it of list) {
      if (!it) continue;
      const createdAt = it && it.createdAt != null ? Number(it.createdAt) : 0;
      if (!Number.isFinite(createdAt) || createdAt <= 0) continue;
      const dayKey = hiLiaoTodayKey(createdAt);
      if (dayKey !== today) continue;
      const deviceId = it && it.deviceId != null ? String(it.deviceId) : '';
      const nickname = it && it.nickname != null ? String(it.nickname) : '';
      const isMine = (deviceId && myDeviceId && deviceId === myDeviceId) || (!deviceId && myNickname && nickname === myNickname);
      if (!isMine) continue;
      const userText = it && it.userText != null ? String(it.userText) : '';
      if (!userText.trim()) continue;
      count += 1;
    }
    return count;
  } catch (e) {
    return 0;
  }
};

export const getHiLiaoChatQuotaState = () => {
  const store = readHiLiaoChatQuotaStore();
  const total = 3 + (Number(store.bonus) || 0);
  const used = Number(store.used) || 0;
  const remaining = Math.max(0, total - used);
  return { dayKey: store.dayKey, used, bonus: Number(store.bonus) || 0, total, remaining };
};

export const consumeHiLiaoChatQuotaOnce = () => {
  const store = readHiLiaoChatQuotaStore();
  const total = 3 + (Number(store.bonus) || 0);
  const used = Number(store.used) || 0;
  if (used >= total) return getHiLiaoChatQuotaState();
  const next = { ...store, used: used + 1 };
  writeHiLiaoChatQuotaStore(next);
  return getHiLiaoChatQuotaState();
};

export const addHiLiaoChatQuotaBonus = (n) => {
  const store = readHiLiaoChatQuotaStore();
  const add = n != null ? Number(n) : 0;
  const inc = Number.isFinite(add) ? Math.max(0, Math.floor(add)) : 0;
  if (!inc) return getHiLiaoChatQuotaState();
  const next = { ...store, bonus: (Number(store.bonus) || 0) + inc };
  writeHiLiaoChatQuotaStore(next);
  return getHiLiaoChatQuotaState();
};

export const fetchHiLiaoChatsCloud = async ({ limit, offset } = {}) => {
  const l = limit != null ? Number(limit) : 30;
  const o = offset != null ? Number(offset) : 0;
  const pageSize = Number.isFinite(l) ? Math.max(1, Math.min(100, Math.floor(l))) : 30;
  const pageOffset = Number.isFinite(o) ? Math.max(0, Math.floor(o)) : 0;
  if (false && wx.cloud && wx.cloud.database) {
    const db = wx.cloud.database();
    try {
      const collections = HI_LIAO_CLOUD_COLLECTIONS || ['kr_hi_liao_messages'];
      const promises = collections.map(async (collectionName) => {
        try {
          let fetched = [];
          let currentSkip = pageOffset;
          let remaining = pageSize;

          while (remaining > 0) {
            const batchSize = Math.min(20, remaining);
            const res = await db
              .collection(collectionName)
              .orderBy('createdAt', 'desc')
              .skip(currentSkip)
              .limit(batchSize)
              .get();
            const list = res && Array.isArray(res.data) ? res.data : [];
            if (list.length > 0) {
              fetched = fetched.concat(list);
              currentSkip += list.length;
              remaining -= list.length;
            }
            if (list.length < batchSize) break;
          }
          console.log('[fetchHiLiaoChatsCloud] got', fetched.length, 'from', collectionName);
          return fetched;
        } catch (e) {
          console.error('[fetchHiLiaoChatsCloud] fail', collectionName, e);
          return null;
        }
      });
      const results = await Promise.all(promises);
      
      // Check if main collection failed - crucial for data integrity
      const mainCollection = 'kr_hi_liao_messages';
      const mainIndex = collections.indexOf(mainCollection);
      if (mainIndex >= 0 && results[mainIndex] === null) {
        throw new Error(`fetch failed for main collection: ${mainCollection}`);
      }

      if (results.every(r => r === null)) {
        throw new Error('all collections failed');
      }
      const allData = results.reduce((acc, curr) => {
        if (Array.isArray(curr)) return acc.concat(curr);
        return acc;
      }, []);
      console.log('[fetchHiLiaoChatsCloud] allData length:', allData.length);
      const byId = new Map();
      for (const item of allData) {
        const norm = normalizeHiLiaoChat(item);
        if (!norm) {
           console.log('[fetchHiLiaoChatsCloud] normalize fail', item);
           continue;
        }
        const prev = byId.get(norm.id);
        if (!prev) {
          byId.set(norm.id, norm);
        } else {
          if ((norm.updatedAt || 0) >= (prev.updatedAt || 0)) {
            byId.set(norm.id, norm);
          }
        }
      }
      const merged = Array.from(byId.values());
      console.log('[fetchHiLiaoChatsCloud] merged length:', merged.length);
      merged.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
      return merged.slice(0, pageSize);
    } catch (e) {}
  }
  try {
    const action = pageOffset === 0 ? 'fetchLatest' : 'fetchBefore';
    const beforeCreatedAt = pageOffset === 0 ? undefined : (() => {
      const local = getHiLiaoChats();
      const it = local && local.length ? local[local.length - 1] : null;
      const t = it && it.createdAt != null ? Number(it.createdAt) : NaN;
      return Number.isFinite(t) ? t : undefined;
    })();
    const res = await callHiLiaoSync({ action, limit: pageSize, offset: pageOffset, beforeCreatedAt });
    const result = res && res.result ? res.result : null;
    if (!result || result.ok !== true) {
      const errMsg = result && result.error ? (result.error.message || JSON.stringify(result.error)) : 'unknown error';
      throw new Error(errMsg);
    }
    const allData = Array.isArray(result.data) ? result.data : [];
    console.log('[fetchHiLiaoChatsCloud] allData length:', allData.length);
    if (result.missingModels && Array.isArray(result.missingModels) && result.missingModels.length) {
      console.log('[fetchHiLiaoChatsCloud] missingModels:', result.missingModels);
    }

    const byId = new Map();
    for (const item of allData) {
      const norm = normalizeHiLiaoChat(item);
      if (!norm) {
         console.log('[fetchHiLiaoChatsCloud] normalize fail', item);
         continue;
      }
      const prev = byId.get(norm.id);
      if (!prev) {
        byId.set(norm.id, norm);
      } else {
        if ((norm.updatedAt || 0) >= (prev.updatedAt || 0)) {
          byId.set(norm.id, norm);
        }
      }
    }
    const merged = Array.from(byId.values());
    console.log('[fetchHiLiaoChatsCloud] merged length:', merged.length);
    merged.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    return merged.slice(0, pageSize);
  } catch (e) {
    try {
      console.error('[hiLiaoSync] fetch fallback via cloud function failed', e);
    } catch (err) {}
  }
  throw new Error('cloud unavailable');
};

export const fetchHiLiaoChatsCloudMine = async ({ limit } = {}) => {
  const l = limit != null ? Number(limit) : 30;
  const pageSize = Number.isFinite(l) ? Math.max(1, Math.min(100, Math.floor(l))) : 30;
  try {
    const res = await callHiLiaoSync({ action: 'fetchLatest', limit: pageSize, mine: true, deviceId: getHiLiaoDeviceId() });
    const result = res && res.result ? res.result : null;
    if (!result || result.ok !== true) {
      const errMsg = result && result.error ? (result.error.message || JSON.stringify(result.error)) : 'unknown error';
      throw new Error(errMsg);
    }
    const allData = Array.isArray(result.data) ? result.data : [];
    const byId = new Map();
    for (const item of allData) {
      const norm = normalizeHiLiaoChat({ ...(item || {}), mineHint: true });
      if (!norm) continue;
      const prev = byId.get(norm.id);
      if (!prev) byId.set(norm.id, norm);
      else if ((norm.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(norm.id, norm);
    }
    const merged = Array.from(byId.values());
    merged.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    return merged.slice(0, pageSize);
  } catch (e) {
    try {
      console.error('[hiLiaoSync] fetchMineLatest failed', e);
    } catch (err) {}
  }
  throw new Error('cloud unavailable');
};

export const fetchHiLiaoChatsCloudMineBefore = async ({ limit, beforeCreatedAt } = {}) => {
  const l = limit != null ? Number(limit) : 30;
  const before = beforeCreatedAt != null ? Number(beforeCreatedAt) : NaN;
  const pageSize = Number.isFinite(l) ? Math.max(1, Math.min(100, Math.floor(l))) : 30;
  try {
    const res = await callHiLiaoSync({
      action: 'fetchBefore',
      limit: pageSize,
      beforeCreatedAt: Number.isFinite(before) ? before : undefined,
      mine: true,
      deviceId: getHiLiaoDeviceId()
    });
    const result = res && res.result ? res.result : null;
    if (!result || result.ok !== true) {
      const errMsg = result && result.error ? (result.error.message || JSON.stringify(result.error)) : 'unknown error';
      throw new Error(errMsg);
    }
    const allData = Array.isArray(result.data) ? result.data : [];
    const byId = new Map();
    for (const item of allData) {
      const norm = normalizeHiLiaoChat({ ...(item || {}), mineHint: true });
      if (!norm) continue;
      const prev = byId.get(norm.id);
      if (!prev) byId.set(norm.id, norm);
      else if ((norm.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(norm.id, norm);
    }
    const merged = Array.from(byId.values());
    merged.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    return merged.slice(0, pageSize);
  } catch (e) {
    try {
      console.error('[hiLiaoSync] fetchMineBefore failed', e);
    } catch (err) {}
  }
  throw new Error('cloud unavailable');
};

export const fetchHiLiaoChatsCloudSinceUpdatedAt = async ({ limit, sinceUpdatedAt } = {}) => {
  const l = limit != null ? Number(limit) : 100;
  const since = sinceUpdatedAt != null ? Number(sinceUpdatedAt) : 0;
  const pageSize = Number.isFinite(l) ? Math.max(1, Math.min(100, Math.floor(l))) : 100;
  if (!Number.isFinite(since) || since <= 0) return fetchHiLiaoChatsCloud({ limit: pageSize, offset: 0 });
  if (false && wx.cloud && wx.cloud.database) {
    const db = wx.cloud.database();
    const _ = db.command;
    try {
      const collections = HI_LIAO_CLOUD_COLLECTIONS || ['kr_hi_liao_messages'];
      const promises = collections.map(async (collectionName) => {
        try {
          let fetched = [];
          let currentSkip = 0;
          let remaining = pageSize;

          while (remaining > 0) {
            const batchSize = Math.min(20, remaining);
            const res = await db
              .collection(collectionName)
              .where({ updatedAt: _.gt(since) })
              .orderBy('updatedAt', 'asc')
              .skip(currentSkip)
              .limit(batchSize)
              .get();
            const list = res && Array.isArray(res.data) ? res.data : [];
            if (list.length > 0) {
              fetched = fetched.concat(list);
              currentSkip += list.length;
              remaining -= list.length;
            }
            if (list.length < batchSize) break;
          }
          console.log('[fetchHiLiaoChatsCloudSinceUpdatedAt] got', fetched.length, 'from', collectionName);
          return fetched;
        } catch (e) {
          console.error('[fetchHiLiaoChatsCloudSinceUpdatedAt] fail', collectionName, e);
          return null;
        }
      });
      const results = await Promise.all(promises);
      if (results.every(r => r === null)) {
        throw new Error('all collections failed');
      }
      const allData = results.filter(Array.isArray).flat();
      const byId = new Map();
      for (const item of allData) {
        const norm = normalizeHiLiaoChat(item);
        if (!norm) continue;
        const prev = byId.get(norm.id);
        if (!prev) {
          byId.set(norm.id, norm);
        } else {
          if ((norm.updatedAt || 0) >= (prev.updatedAt || 0)) {
            byId.set(norm.id, norm);
          }
        }
      }
      const merged = Array.from(byId.values());
      merged.sort((a, b) => (Number(a.updatedAt) || 0) - (Number(b.updatedAt) || 0));
      return merged.slice(0, pageSize);
    } catch (e) {}
  }
  try {
    const res = await callHiLiaoSync({ action: 'fetchSince', limit: pageSize, sinceUpdatedAt: since });
    const result = res && res.result ? res.result : null;
    if (!result || result.ok !== true) {
      const errMsg = result && result.error ? (result.error.message || JSON.stringify(result.error)) : 'unknown error';
      throw new Error(errMsg);
    }
    const allData = Array.isArray(result.data) ? result.data : [];
    if (result.missingCollections && Array.isArray(result.missingCollections) && result.missingCollections.length) {
      console.log('[fetchHiLiaoChatsCloudSinceUpdatedAt] missingCollections:', result.missingCollections);
    }
    
    const byId = new Map();
    for (const item of allData) {
      const norm = normalizeHiLiaoChat(item);
      if (!norm) continue;
      const prev = byId.get(norm.id);
      if (!prev) {
        byId.set(norm.id, norm);
      } else {
        if ((norm.updatedAt || 0) >= (prev.updatedAt || 0)) {
          byId.set(norm.id, norm);
        }
      }
    }
    const merged = Array.from(byId.values());
    merged.sort((a, b) => (Number(a.updatedAt) || 0) - (Number(b.updatedAt) || 0));
    return merged.slice(0, pageSize);
  } catch (e) {
    try {
      console.error('[hiLiaoSync] fetchSince fallback via cloud function failed', e);
    } catch (err) {}
  }
  throw new Error('cloud unavailable');
};

export const fetchHiLiaoChatsCloudBefore = async ({ limit, beforeCreatedAt } = {}) => {
  const l = limit != null ? Number(limit) : 30;
  const before = beforeCreatedAt != null ? Number(beforeCreatedAt) : NaN;
  const pageSize = Number.isFinite(l) ? Math.max(1, Math.min(100, Math.floor(l))) : 30;
  if (false && wx.cloud && wx.cloud.database) {
    const db = wx.cloud.database();
    const _ = db.command;
    try {
      const collections = HI_LIAO_CLOUD_COLLECTIONS || ['kr_hi_liao_messages'];
      const promises = collections.map(async (collectionName) => {
        try {
          let fetched = [];
          let currentSkip = 0;
          let remaining = pageSize;

          while (remaining > 0) {
            const batchSize = Math.min(20, remaining);
            const query = db.collection(collectionName);
            const q2 = Number.isFinite(before) ? query.where({ createdAt: _.lt(before) }) : query;
            const res = await q2.orderBy('createdAt', 'desc').skip(currentSkip).limit(batchSize).get();
            const list = res && Array.isArray(res.data) ? res.data : [];
            if (list.length > 0) {
              fetched = fetched.concat(list);
              currentSkip += list.length;
              remaining -= list.length;
            }
            if (list.length < batchSize) break;
          }
          console.log('[fetchHiLiaoChatsCloudBefore] got', fetched.length, 'from', collectionName);
          return fetched;
        } catch (e) {
          console.error('[fetchHiLiaoChatsCloudBefore] fail', collectionName, e);
          return null;
        }
      });
      const results = await Promise.all(promises);
      if (results.every(r => r === null)) {
        throw new Error('all collections failed');
      }
      const allData = results.filter(Array.isArray).flat();
      const byId = new Map();
      for (const item of allData) {
        const norm = normalizeHiLiaoChat(item);
        if (!norm) continue;
        const prev = byId.get(norm.id);
        if (!prev) {
          byId.set(norm.id, norm);
        } else {
          if ((norm.updatedAt || 0) >= (prev.updatedAt || 0)) {
            byId.set(norm.id, norm);
          }
        }
      }
      const merged = Array.from(byId.values());
      merged.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
      return merged.slice(0, pageSize);
    } catch (e) {}
  }
  try {
    // Concurrent read from all collections via cloud function
    const collections = HI_LIAO_CLOUD_COLLECTIONS || ['kr_hi_liao_messages'];
    const promises = collections.map(async (collectionName) => {
      try {
        const res = await callHiLiaoSync({
          action: 'fetchBefore',
          limit: pageSize,
          beforeCreatedAt: Number.isFinite(before) ? before : undefined,
          collection: collectionName
        });
        const result = res && res.result ? res.result : null;
        if (!result || result.ok !== true) return [];
        return Array.isArray(result.data) ? result.data : [];
      } catch (e) {
        console.error('[fetchHiLiaoChatsCloudBefore] call fail', collectionName, e);
        return [];
      }
    });

    const results = await Promise.all(promises);
    const allData = results.flat();
    
    const byId = new Map();
    for (const item of allData) {
      const norm = normalizeHiLiaoChat(item);
      if (!norm) continue;
      const prev = byId.get(norm.id);
      if (!prev) {
        byId.set(norm.id, norm);
      } else {
        if ((norm.updatedAt || 0) >= (prev.updatedAt || 0)) {
          byId.set(norm.id, norm);
        }
      }
    }
    const merged = Array.from(byId.values());
    merged.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
    return merged.slice(0, pageSize);
  } catch (e) {
    try {
      console.error('[hiLiaoSync] fetchBefore fallback via cloud function failed', e);
    } catch (err) {}
  }
  throw new Error('cloud unavailable');
};

let _hiLiaoFetchPromise = null;

export const fetchHiLiaoFeedCloudSmart = async ({ force } = {}) => {
  if (_hiLiaoFetchPromise) return _hiLiaoFetchPromise;
  
  _hiLiaoFetchPromise = (async () => {
    const cache = readHiLiaoFeedCache();
    const canUseCache = !force && cache && cache.items.length > 0 && (Date.now() - cache.cachedAt) < HI_LIAO_CLOUD_FEED_CACHE_TTL_MS;
    if (canUseCache) {
      return { list: cache.items, changed: false, usedCache: true, deltaCount: 0 };
    }

    if (cache && cache.items.length > 0 && cache.maxUpdatedAt > 0 && !force) {
      try {
        const safeSince = Math.max(0, (Number(cache.maxUpdatedAt) || 0) - 5 * 60 * 1000);
        const delta = await fetchHiLiaoChatsCloudSinceUpdatedAt({ limit: 100, sinceUpdatedAt: safeSince });
        if (!Array.isArray(delta) || delta.length === 0) {
          writeHiLiaoFeedCache({ items: cache.items, maxUpdatedAt: cache.maxUpdatedAt });
          return { list: cache.items, changed: false, usedCache: true, deltaCount: 0 };
        }
        const mergedById = new Map();
        for (const it of cache.items) {
          if (it && it.id) mergedById.set(String(it.id), it);
        }
        for (const it of delta) {
          if (!it || !it.id) continue;
          const prev = mergedById.get(String(it.id));
          if (!prev) {
            mergedById.set(String(it.id), it);
            continue;
          }
          const pu = prev && prev.updatedAt != null ? Number(prev.updatedAt) : 0;
          const nu = it && it.updatedAt != null ? Number(it.updatedAt) : 0;
          mergedById.set(String(it.id), nu >= pu ? it : prev);
        }
        const merged = Array.from(mergedById.values());
        merged.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
        const maxUpdatedAt = merged.reduce((acc, it) => Math.max(acc, Number(it.updatedAt) || 0), 0);
        writeHiLiaoFeedCache({ items: merged, maxUpdatedAt });
        return { list: merged.slice(0, 120), changed: true, usedCache: false, deltaCount: delta.length };
      } catch (e) {}
    }

    const full = await fetchHiLiaoChatsCloud({ limit: 100, offset: 0 });
    const maxUpdatedAt = Array.isArray(full)
      ? full.reduce((acc, it) => Math.max(acc, Number(it && it.updatedAt) || 0), 0)
      : 0;
    writeHiLiaoFeedCache({ items: Array.isArray(full) ? full : [], maxUpdatedAt });
    return { list: Array.isArray(full) ? full : [], changed: true, usedCache: false, deltaCount: 0 };
  })();

  try {
    return await _hiLiaoFetchPromise;
  } finally {
    _hiLiaoFetchPromise = null;
  }
};

const readHiLiaoWriteQueue = () => {
  try {
    const raw = wx.getStorageSync(HI_LIAO_CLOUD_WRITE_QUEUE_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeHiLiaoChat).filter(Boolean);
  } catch (e) {
    return [];
  }
};

const writeHiLiaoWriteQueue = (items) => {
  try {
    const normalized = Array.isArray(items) ? items.map(normalizeHiLiaoChat).filter(Boolean) : [];
    wx.setStorageSync(HI_LIAO_CLOUD_WRITE_QUEUE_KEY, normalized.slice(0, 200));
  } catch (e) {}
};

export const getHiLiaoChatCloudWriteQueueCount = () => {
  try {
    const queue = readHiLiaoWriteQueue();
    return Array.isArray(queue) ? queue.length : 0;
  } catch (e) {
    return 0;
  }
};

export const enqueueHiLiaoChatCloudWrite = (chat) => {
  const normalized = normalizeHiLiaoChat(chat);
  if (!normalized) {
    console.log('[enqueueHiLiaoChatCloudWrite] skipped: invalid chat');
    return 0;
  }
  if (normalized.blocked) {
    console.log('[enqueueHiLiaoChatCloudWrite] skipped: blocked', normalized.id);
    return 0;
  }
  if (normalized.status && String(normalized.status) !== 'done') {
    console.log('[enqueueHiLiaoChatCloudWrite] skipped: status not done', normalized.id, normalized.status);
    return 0;
  }
  const queue = readHiLiaoWriteQueue();
  const next = queue.filter((x) => !(x && x.id === normalized.id));
  next.unshift(normalized);
  writeHiLiaoWriteQueue(next);
  console.log('[enqueueHiLiaoChatCloudWrite] enqueued', { id: normalized.id, queueLen: next.length });
  try {
    Promise.resolve()
      .then(() => flushHiLiaoChatCloudWriteQueue())
      .catch((err) => {
        scheduleHiLiaoWriteRetry({ batchKey: 'enqueue', err, minDelayMs: 2500 });
      });
  } catch (e) {}
  return next.length;
};

export const backfillHiLiaoChatCloudWriteQueueFromLocal = ({ limit } = {}) => {
  const max = limit != null ? Number(limit) : 80;
  const maxItems = Number.isFinite(max) ? Math.max(0, Math.min(200, Math.floor(max))) : 80;
  if (!maxItems) return 0;
  const local = getHiLiaoChats();
  if (!Array.isArray(local) || !local.length) return 0;
  const queue = readHiLiaoWriteQueue();
  const queuedIds = new Set(queue.map((x) => (x && x.id != null ? String(x.id) : '')).filter(Boolean));
  const adds = [];
  for (const it of local) {
    if (!it || !it.id) continue;
    if (queuedIds.has(String(it.id))) continue;
    if (it.blocked) continue;
    if (it.status && String(it.status) !== 'done') continue;
    const userText = it.userText != null ? String(it.userText) : '';
    if (!userText.trim()) continue;
    adds.push(it);
    if (adds.length >= maxItems) break;
  }
  if (!adds.length) return 0;
  const next = adds.concat(queue);
  writeHiLiaoWriteQueue(next);
  console.log('[backfillHiLiaoChatCloudWriteQueueFromLocal] backfilled', { count: adds.length, ids: adds.map(x => x.id) });
  return adds.length;
};

export const flushHiLiaoChatCloudWriteQueue = async ({ drain, limit } = {}) => {
  try {
    console.log('[flushHiLiaoChatCloudWriteQueue] start', { drain, limit, inFlight: hiLiaoWriteInFlight });
  } catch (e) {}

  const shouldDrain = !!drain;
  const maxPerBatch = shouldDrain ? 5 : (() => {
    const n = limit != null ? Number(limit) : NaN;
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(20, Math.floor(n)));
  })();
  
  if (hiLiaoWriteInFlight) {
    if (!shouldDrain) {
      return 0;
    }
    const start = Date.now();
    while (hiLiaoWriteInFlight && (Date.now() - start) < 8000) {
      await new Promise((r) => setTimeout(r, 120));
    }
    if (hiLiaoWriteInFlight) {
      setHiLiaoWriteLastError('上传中，请稍后重试');
      return 0;
    }
  }
  
  const initialQueue = readHiLiaoWriteQueue();
  if (initialQueue.length === 0) {
     console.log('[flushHiLiaoChatCloudWriteQueue] empty queue, nothing to flush');
     return 0;
  }

  hiLiaoWriteInFlight = true;
  let totalWritten = 0;
  try {
    const maxBatches = shouldDrain ? 5 : 1;
    for (let i = 0; i < maxBatches; i += 1) {
      const queue = readHiLiaoWriteQueue();
      if (!queue.length) break;
      const batch = queue.slice(0, maxPerBatch);
      let successIds = new Set();
      let written = 0;
      
      const docs = batch.map(normalizeHiLiaoChat).filter(Boolean).map(toHiLiaoCloudDoc).filter(Boolean);
      console.log('[flushHiLiaoChatCloudWriteQueue] batch start', { count: docs.length, ids: docs.map(d => d.id) });
      
      try {
          // Directly use cloud function for batch upload to save calls and ensure consistency
          console.log('[flushHiLiaoChatCloudWriteQueue] calling cloud function upsertMany', { count: docs.length });
          const res = await callHiLiaoSync({ action: 'upsertMany', items: docs });
          const result = res && res.result ? res.result : null;
          console.log('[flushHiLiaoChatCloudWriteQueue] cloud function result', { ok: result && result.ok, written: result && result.writtenIds ? result.writtenIds.length : 0 });
          
          const ok = !!(result && result.ok === true);
          const writtenIds = result && Array.isArray(result.writtenIds) ? result.writtenIds.map((x) => String(x)).filter(Boolean) : [];
          if (ok && writtenIds.length) {
            console.log('[flushHiLiaoChatCloudWriteQueue] writtenIds', writtenIds.slice(0, 20));
          }
          
          if (!ok && !writtenIds.length) {
            const err = result && result.error ? result.error : null;
            const msg = err && err.message != null ? String(err.message) : (err != null ? String(err) : '');
            const miss = result && Array.isArray(result.missingModels) ? result.missingModels.map(String).filter(Boolean) : [];
            console.log('[flushHiLiaoChatCloudWriteQueue] cloud function error', { error: err, missingModels: miss });
            const extra = miss.length ? ` missingModels=${miss.join(',')}` : '';
            throw new Error((msg || 'cloud upsertMany failed') + extra);
          }
          
          successIds = new Set(writtenIds);
          written = writtenIds.length;
      } catch (err) {
          console.error('[flushHiLiaoChatCloudWriteQueue] batch fail', err);
          throw err;
      }

      totalWritten += Number.isFinite(written) ? written : successIds.size;
      const remaining = queue.filter((x) => {
        const id = x && x.id != null ? String(x.id) : '';
        if (!id) return false;
        return !successIds.has(id);
      });
      writeHiLiaoWriteQueue(remaining);
      if ((Number.isFinite(written) && written > 0) || successIds.size > 0) {
        resetHiLiaoWriteRetry();
      }
      if (!shouldDrain) {
        break;
      }
    }
    const rest = readHiLiaoWriteQueue();
    if (rest.length && shouldDrain) {
    }
    if (totalWritten > 0) clearHiLiaoWriteLastError();
    return totalWritten;
  } catch (e) {
    const msg = e && e.message != null ? String(e.message) : '';
    setHiLiaoWriteLastError(e);
    try {
      scheduleHiLiaoWriteRetry({ batchKey: 'flush', err: e, minDelayMs: 6000 });
    } catch (err) {}
    try {
      console.error('[hiLiaoSync] cloud write failed', e);
    } catch (err) {}
    return totalWritten;
  } finally {
    hiLiaoWriteInFlight = false;
  }
};

export const upsertHiLiaoChatCloud = async (chat) => {
  const normalized = normalizeHiLiaoChat(chat);
  if (!normalized) return null;
  if (normalized.blocked) return normalized;
  if (normalized.status && String(normalized.status) !== 'done') return normalized;
  if (!wx.cloud || !wx.cloud.database) throw new Error('cloud unavailable');
  const db = wx.cloud.database();
  const doc = toHiLiaoCloudDoc(normalized);
  if (!doc) return normalized;
  await withHiLiaoCollections(async (collectionName) => {
    try {
      await db.collection(collectionName).doc(normalized.id).set({ data: doc });
      return true;
    } catch (e) {
      try {
        await db.createCollection(collectionName);
      } catch (createErr) {}
      await db.collection(collectionName).doc(normalized.id).set({ data: doc });
      return true;
    }
  });
  return normalized;
};

export const getHiLiaoChatByIdCloud = async (id) => {
  const target = id != null ? String(id) : '';
  if (!target) return null;
  if (!wx.cloud || !wx.cloud.database) throw new Error('cloud unavailable');
  const db = wx.cloud.database();
  const doc = await withHiLiaoCollections(async (collectionName) => {
    try {
      const res = await db.collection(collectionName).doc(target).get();
      if (res && res.data) return res.data;
    } catch (e) {}
    const res2 = await db.collection(collectionName).where({ id: target }).limit(1).get();
    const d2 = res2 && Array.isArray(res2.data) ? res2.data[0] : null;
    return d2 || null;
  });
  return normalizeHiLiaoChat(doc);
};

const getOrCreateHiLiaoDeviceId = () => {
  try {
    const existing = wx.getStorageSync(HI_LIAO_DEVICE_ID_KEY);
    if (existing && typeof existing === 'string') return existing;
  } catch (e) {}
  const alphabet = '012356789abcdef';
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  try {
    wx.setStorageSync(HI_LIAO_DEVICE_ID_KEY, out);
  } catch (e) {}
  return out;
};

export const getHiLiaoDeviceId = () => {
  return getOrCreateHiLiaoDeviceId();
};

export const getHiLiaoNickname = () => {
  try {
    const existing = wx.getStorageSync(HI_LIAO_NICKNAME_KEY);
    if (existing && typeof existing === 'string') return existing;
  } catch (e) {}
  const deviceId = getOrCreateHiLiaoDeviceId();
  const alphabet = '012356789abcdef';
  let h = 2166136261;
  for (let i = 0; i < deviceId.length; i++) {
    h ^= deviceId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += alphabet[h % alphabet.length];
    h = Math.floor(h / alphabet.length);
  }
  const nick = `宝${suffix}`;
  try {
    wx.setStorageSync(HI_LIAO_NICKNAME_KEY, nick);
  } catch (e) {}
  return nick;
};
