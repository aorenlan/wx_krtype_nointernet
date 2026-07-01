const { PICTURE_WORD_CATALOG, PICTURE_WORD_GROUPS } = require('./data');

const DEFAULT_GROUP_ID = (PICTURE_WORD_CATALOG && PICTURE_WORD_CATALOG.defaultGroupId) || 'animals';
const SELECTED_GROUP_STORAGE_KEY = 'picture_words_selected_group_v1';
const CATALOG_CACHE_STORAGE_KEY = 'picture_words_catalog_cache_v1';
const REMOTE_MANIFEST_URL = 'https://enoss.aorenlan.fun/kr_picturebook/config/picture-words.manifest.json';
const LOCAL_CONTENT_VERSION = (PICTURE_WORD_CATALOG && PICTURE_WORD_CATALOG.version) || 'v5';
const CATALOG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let catalogMemoryCache = null;

function safeString(value, fallback) {
  const text = value == null ? '' : String(value).trim();
  return text || fallback || '';
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function now() {
  return Date.now ? Date.now() : new Date().getTime();
}

function hasWxStorage() {
  return typeof wx !== 'undefined' && wx && wx.getStorageSync && wx.setStorageSync;
}

function hasWxRequest() {
  return typeof wx !== 'undefined' && wx && typeof wx.request === 'function';
}

function withCacheBuster(url, value) {
  if (!url || !value) return url;
  const joiner = url.indexOf('?') >= 0 ? '&' : '?';
  return `${url}${joiner}_pwv=${encodeURIComponent(value)}`;
}

function requestJson(url) {
  if (!hasWxRequest() || !url) return Promise.reject(new Error('wx.request unavailable'));
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      dataType: 'json',
      timeout: 8000,
      success(res) {
        const status = Number(res && res.statusCode);
        if (status < 200 || status >= 300) {
          reject(new Error(`request failed: ${status}`));
          return;
        }

        let data = res.data;
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data);
          } catch (e) {
            reject(e);
            return;
          }
        }
        resolve(data);
      },
      fail(err) {
        reject(err || new Error('request failed'));
      }
    });
  });
}

function normalizeGroup(raw, index) {
  const items = Array.isArray(raw && raw.items) ? raw.items : [];
  const id = safeString(raw && raw.id, `group-${index + 1}`);
  const first = items[0] || {};
  return {
    id,
    name: safeString(raw && (raw.name || raw.title), id),
    level: safeString(raw && raw.level, ''),
    promptKo: safeString(raw && raw.promptKo, '이게 뭐예요?'),
    cover: safeString(raw && raw.cover, first.image || ''),
    itemCount: items.length,
    order: Number(raw && raw.order) || index
  };
}

function normalizeItem(raw, group, index) {
  const baseId = safeString(raw && raw.id, `${group.id}-${index + 1}`);
  const rawAudio = raw && raw.audio;
  let audio = {};
  if (typeof rawAudio === 'string') {
    const audioUrl = safeString(rawAudio, '');
    audio = audioUrl ? { ko: audioUrl, 'ko-KR': audioUrl } : {};
  } else if (rawAudio && typeof rawAudio === 'object' && !Array.isArray(rawAudio)) {
    audio = Object.keys(rawAudio).reduce((next, key) => {
      const value = safeString(rawAudio[key], '');
      if (value) next[key] = value;
      return next;
    }, {});
  }

  return {
    id: baseId,
    groupId: group.id,
    korean: safeString(raw && raw.korean, ''),
    roman: safeString(raw && raw.roman, ''),
    cn: safeString(raw && (raw.cn || raw.chinese), ''),
    en: safeString(raw && (raw.en || raw.english), ''),
    image: safeString(raw && raw.image, group.cover || ''),
    promptKo: safeString(raw && raw.promptKo, group.promptKo || '이게 뭐예요?'),
    tags: Array.isArray(raw && raw.tags) ? raw.tags.slice() : [],
    level: safeString(raw && raw.level, group.level || ''),
    audio,
    sort: Number(raw && raw.sort) || index
  };
}

function getRawGroups() {
  if (PICTURE_WORD_CATALOG && Array.isArray(PICTURE_WORD_CATALOG.groups)) {
    return PICTURE_WORD_CATALOG.groups;
  }
  return Array.isArray(PICTURE_WORD_GROUPS) ? PICTURE_WORD_GROUPS : [];
}

function getGroupsSignature(rawGroups) {
  return (Array.isArray(rawGroups) ? rawGroups : []).map((group) => {
    const items = Array.isArray(group && group.items) ? group.items : [];
    const itemKeys = items.map((item) => {
      return [
        safeString(item && item.id, ''),
        safeString(item && item.korean, ''),
        safeString(item && item.image, '')
      ].join(':');
    }).join(',');
    return [
      safeString(group && group.id, ''),
      safeString(group && (group.name || group.title), ''),
      items.length,
      itemKeys
    ].join('|');
  }).join('||');
}

function getLocalContentSignature() {
  return getGroupsSignature(getRawGroups());
}

function buildCatalogFromRawGroups(rawGroups, options) {
  const opts = options || {};
  const source = safeString(opts.source, 'local');
  const version = safeString(opts.version, LOCAL_CONTENT_VERSION);
  const groups = rawGroups
    .map((raw, index) => normalizeGroup(raw, index))
    .filter((group) => group.itemCount > 0)
    .sort((a, b) => a.order - b.order);

  const itemsByGroupId = {};
  let total = 0;

  groups.forEach((group) => {
    const rawGroup = rawGroups.find((raw) => raw && String(raw.id) === String(group.id));
    const rawItems = Array.isArray(rawGroup && rawGroup.items) ? rawGroup.items : [];
    const items = rawItems
      .map((item, index) => normalizeItem(item, group, index))
      .filter((item) => item.korean && item.image)
      .sort((a, b) => a.sort - b.sort);
    itemsByGroupId[group.id] = items;
    group.itemCount = items.length;
    total += items.length;
  });

  return {
    source,
    version,
    schemaVersion: Number(opts.schemaVersion) || 1,
    defaultGroupId: safeString(opts.defaultGroupId, DEFAULT_GROUP_ID),
    contentSignature: getGroupsSignature(rawGroups),
    cacheKey: `pictureWords:${source}:${version}:catalog`,
    cachedAt: now(),
    groups: groups.filter((group) => group.itemCount > 0),
    itemsByGroupId,
    total,
    manifestUrl: opts.manifestUrl || '',
    catalogUrl: opts.catalogUrl || ''
  };
}

function buildLocalCatalog() {
  return buildCatalogFromRawGroups(getRawGroups(), {
    source: 'local',
    version: LOCAL_CONTENT_VERSION,
    schemaVersion: Number(PICTURE_WORD_CATALOG && PICTURE_WORD_CATALOG.schemaVersion) || 1,
    defaultGroupId: safeString(PICTURE_WORD_CATALOG && PICTURE_WORD_CATALOG.defaultGroupId, DEFAULT_GROUP_ID)
  });
}

function isValidCatalog(catalog) {
  if (!catalog || !catalog.version) return false;
  if (!Array.isArray(catalog.groups) || !catalog.itemsByGroupId) return false;
  const age = now() - Number(catalog.cachedAt || 0);
  if (age < 0 || age > CATALOG_CACHE_TTL_MS) return false;

  if (catalog.source === 'remote') {
    return true;
  }

  return catalog.version === LOCAL_CONTENT_VERSION &&
    catalog.contentSignature === getLocalContentSignature();
}

function readStoredCatalog() {
  if (!hasWxStorage()) return null;
  try {
    const cached = wx.getStorageSync(CATALOG_CACHE_STORAGE_KEY);
    return isValidCatalog(cached) ? cached : null;
  } catch (e) {
    return null;
  }
}

function writeStoredCatalog(catalog) {
  if (!hasWxStorage() || !catalog) return;
  try {
    wx.setStorageSync(CATALOG_CACHE_STORAGE_KEY, catalog);
  } catch (e) {}
}

async function fetchRemoteCatalog(existingCatalog) {
  if (!hasWxRequest()) return null;

  const manifest = await requestJson(withCacheBuster(REMOTE_MANIFEST_URL, now()));
  const version = safeString(manifest && manifest.version, '');
  const catalogUrl = safeString(manifest && manifest.catalogUrl, '');
  if (!version || !catalogUrl) return null;

  if (
    existingCatalog &&
    existingCatalog.source === 'remote' &&
    existingCatalog.version === version &&
    isValidCatalog(existingCatalog)
  ) {
    return existingCatalog;
  }

  const remoteRaw = await requestJson(withCacheBuster(catalogUrl, version));
  const rawGroups = Array.isArray(remoteRaw && remoteRaw.groups) ? remoteRaw.groups : [];
  if (!rawGroups.length) return null;

  return buildCatalogFromRawGroups(rawGroups, {
    source: 'remote',
    version,
    schemaVersion: Number(remoteRaw && remoteRaw.schemaVersion) || Number(manifest && manifest.schemaVersion) || 1,
    defaultGroupId: safeString(remoteRaw && remoteRaw.defaultGroupId, DEFAULT_GROUP_ID),
    manifestUrl: REMOTE_MANIFEST_URL,
    catalogUrl
  });
}

async function loadPictureWordCatalog(options) {
  const opts = options || {};
  if (!opts.refresh && isValidCatalog(catalogMemoryCache)) {
    return clone(catalogMemoryCache);
  }

  const stored = !opts.refresh ? readStoredCatalog() : null;
  if (stored) {
    catalogMemoryCache = stored;
    return clone(stored);
  }

  const existing = isValidCatalog(catalogMemoryCache) ? catalogMemoryCache : readStoredCatalog();
  if (opts.remote !== false) {
    try {
      const remoteCatalog = await fetchRemoteCatalog(existing);
      if (remoteCatalog && isValidCatalog(remoteCatalog)) {
        catalogMemoryCache = remoteCatalog;
        writeStoredCatalog(remoteCatalog);
        return clone(remoteCatalog);
      }
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[picture-words] remote catalog unavailable, fallback to local cache', e);
      }
    }
  }

  if (isValidCatalog(existing)) {
    catalogMemoryCache = existing;
    return clone(existing);
  }

  const catalog = buildLocalCatalog();
  catalogMemoryCache = catalog;
  writeStoredCatalog(catalog);
  return clone(catalog);
}

function getSavedPictureWordGroupId() {
  if (!hasWxStorage()) return DEFAULT_GROUP_ID;
  try {
    return wx.getStorageSync(SELECTED_GROUP_STORAGE_KEY) || DEFAULT_GROUP_ID;
  } catch (e) {
    return DEFAULT_GROUP_ID;
  }
}

function savePictureWordGroupId(groupId) {
  if (!groupId || !hasWxStorage()) return;
  try {
    wx.setStorageSync(SELECTED_GROUP_STORAGE_KEY, groupId);
  } catch (e) {}
}

async function listPictureWordGroups(options) {
  const catalog = await loadPictureWordCatalog(options);
  return clone(catalog.groups || []);
}

async function loadPictureWordPack(options) {
  const opts = options || {};
  const catalog = await loadPictureWordCatalog(opts);
  const groups = Array.isArray(catalog.groups) ? catalog.groups : [];
  const selectedId = opts.groupId || getSavedPictureWordGroupId() || DEFAULT_GROUP_ID;
  const defaultId = catalog.defaultGroupId || DEFAULT_GROUP_ID;
  const group =
    groups.find((g) => g.id === selectedId) ||
    groups.find((g) => g.id === defaultId) ||
    groups[0] ||
    null;
  const items = group && catalog.itemsByGroupId ? (catalog.itemsByGroupId[group.id] || []) : [];

  return {
    source: catalog.source,
    version: catalog.version,
    cacheKey: group ? `${catalog.cacheKey}:${group.id}` : `${catalog.cacheKey}:empty`,
    catalogCacheKey: catalog.cacheKey,
    cachedAt: catalog.cachedAt,
    group: group ? clone(group) : null,
    groups: clone(groups),
    items: clone(items),
    total: items.length
  };
}

function clearPictureWordContentCache() {
  catalogMemoryCache = null;
  if (!hasWxStorage()) return;
  try {
    wx.removeStorageSync(CATALOG_CACHE_STORAGE_KEY);
  } catch (e) {}
}

module.exports = {
  DEFAULT_GROUP_ID,
  listPictureWordGroups,
  loadPictureWordCatalog,
  loadPictureWordPack,
  getSavedPictureWordGroupId,
  savePictureWordGroupId,
  clearPictureWordContentCache
};
