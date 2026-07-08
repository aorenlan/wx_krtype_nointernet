const { TAP_SCENE_DEMO } = require('./mock-data');

const REMOTE_MANIFEST_URL = 'https://enoss.aorenlan.fun/kr_picturebook/tap_scene/config/tap-scenes.manifest.json';
const SCENE_CACHE_STORAGE_KEY = 'tap_scene_catalog_cache_v1';
const SELECTED_COURSE_STORAGE_KEY = 'tap_scene_selected_course_v1';
const SCENE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let sceneMemoryCache = null;

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
  return `${url}${joiner}_tsv=${encodeURIComponent(value)}`;
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

function toShortLabel(korean) {
  const text = String(korean || '');
  if (text.length <= 4) return text;
  return text.split(' ')[0] || text.slice(0, 4);
}

function isExtensionWord(raw) {
  if (!raw || typeof raw !== 'object') return false;
  if (raw.isExtension === true || raw.extension === true) return true;
  if (typeof raw.isExtension === 'string' && /^(true|1|yes|y)$/i.test(raw.isExtension.trim())) return true;
  if (typeof raw.extension === 'string' && /^(true|1|yes|y)$/i.test(raw.extension.trim())) return true;

  const kind = safeString(raw.type || raw.wordType || raw.kind || raw.role, '').toLowerCase();
  if (['extension', 'extended', 'expand', 'extra'].includes(kind)) return true;

  const strength = safeString(raw.strength, '');
  if (strength.indexOf('扩展') >= 0) return true;

  const tags = Array.isArray(raw.tags) ? raw.tags : [];
  return tags.some((tag) => {
    const text = safeString(tag, '').toLowerCase();
    return ['extension', 'extended', 'expand', 'extra', '扩展', '扩展词'].includes(text);
  });
}

function normalizePhrase(raw, index) {
  const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const zh = safeString(item.zh || item.cn || item.chinese, '');
  const kr = safeString(item.kr || item.korean || item.ko, '');
  return {
    ...clone(item),
    id: safeString(item.id, `phrase-${index + 1}`),
    index,
    indexLabel: safeString(item.indexLabel, String(index + 1).padStart(2, '0')),
    zh,
    cn: zh,
    kr,
    korean: kr,
    roman: safeString(item.roman || item.romaji || item.romanization, ''),
    en: safeString(item.en || item.english, ''),
    usage: safeString(item.usage || item.note || item.context, ''),
    audio: safeString(item.audio || item.audioUrl || item.cosAudioUrl, '')
  };
}

function normalizeHotspot(raw, index) {
  const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const example = item.example && typeof item.example === 'object' && !Array.isArray(item.example)
    ? item.example
    : {};
  const zh = safeString(item.zh || item.cn || item.chinese, '');
  const kr = safeString(item.kr || item.korean || item.ko, '');
  const isExtension = isExtensionWord(item);
  const type = isExtension ? 'extension' : safeString(item.type || item.wordType || item.kind, 'object');
  const strength = isExtension ? '扩展' : safeString(item.strength, '常用');
  const exampleKo = safeString(item.exampleKo || example.kr || example.korean || example.ko, kr ? `${kr}을/를 주세요.` : '');
  const exampleCn = safeString(item.exampleCn || example.zh || example.cn || example.chinese, zh ? `请给我${zh}。` : '');

  return {
    ...clone(item),
    id: safeString(item.id || item.itemId, `hotspot-${index + 1}`),
    x: Number(item.x) || 50,
    y: Number(item.y) || 50,
    radius: Number(item.radius) || 6,
    korean: kr,
    kr,
    short: safeString(item.short, toShortLabel(kr)),
    roman: safeString(item.roman || item.romaji || item.romanization, ''),
    cn: zh,
    zh,
    en: safeString(item.en || item.english, ''),
    audio: safeString(item.audio || item.audioUrl || item.cosAudioUrl, ''),
    type,
    strength,
    isExtension,
    exampleKo,
    exampleCn,
    exampleAudio: safeString(item.exampleAudio || example.audio || example.audioUrl || example.cosAudioUrl, ''),
    note: safeString(item.note || item.explanation || item.description, ''),
    related: Array.isArray(item.related) ? item.related.slice() : []
  };
}

function normalizeExtensionWord(raw, index) {
  return {
    ...normalizeHotspot({
      ...(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}),
      isExtension: true,
      type: 'extension',
      strength: '扩展'
    }, index),
    x: 0,
    y: 0,
    radius: 0,
    isExtension: true,
    type: 'extension',
    strength: '扩展'
  };
}

function normalizeScene(rawScene, options) {
  const scene = rawScene && typeof rawScene === 'object' && !Array.isArray(rawScene) ? rawScene : {};
  const opts = options || {};
  const allHotspots = (Array.isArray(scene.hotspots) ? scene.hotspots : [])
    .map(normalizeHotspot)
    .filter((item) => item.korean && item.cn);
  const hotspots = allHotspots.filter((item) => !item.isExtension);
  const extensionWords = [
    ...(Array.isArray(scene.extensionWords) ? scene.extensionWords : []),
    ...(Array.isArray(scene.extensions) ? scene.extensions : []),
    ...allHotspots.filter((item) => item.isExtension)
  ]
    .map(normalizeExtensionWord)
    .filter((item) => item.korean && item.cn);
  const phrases = (Array.isArray(scene.phrases) ? scene.phrases : [])
    .map(normalizePhrase)
    .filter((item) => item.kr || item.zh);

  return {
    ...clone(scene),
    id: safeString(scene.id, opts.sceneId || 'tap-scene'),
    courseId: safeString(opts.courseId, ''),
    title: safeString(scene.title || opts.courseTitle, '看图点读'),
    subtitle: safeString(scene.subtitle || scene.topic || opts.topic, 'Tap Scene'),
    topic: safeString(scene.topic || opts.topic, ''),
    theme: safeString(scene.theme || opts.theme, ''),
    aspectRatio: safeString(scene.aspectRatio || scene.ratio, '16:9'),
    image: safeString(scene.image || scene.imageUrl || scene.cosUrl, ''),
    prompt: safeString(scene.prompt || scene.brief || '点图学词，也能听高频场景句', ''),
    hotspots,
    extensionWords,
    phrases,
    source: safeString(opts.source, 'local'),
    version: safeString(opts.version, '')
  };
}

function buildLocalPack() {
  const scene = normalizeScene(TAP_SCENE_DEMO, {
    source: 'local',
    version: 'mock',
    courseId: TAP_SCENE_DEMO.id,
    courseTitle: TAP_SCENE_DEMO.title,
    topic: TAP_SCENE_DEMO.topic
  });
  return {
    source: 'local',
    version: 'mock',
    cachedAt: now(),
    manifestUrl: '',
    catalogUrl: '',
    course: {
      id: scene.courseId || scene.id,
      title: scene.title,
      version: 'mock'
    },
    scene
  };
}

function isValidPack(pack) {
  if (!pack || !pack.scene || !Array.isArray(pack.scene.hotspots) || !pack.scene.hotspots.length) return false;
  const age = now() - Number(pack.cachedAt || 0);
  if (age < 0 || age > SCENE_CACHE_TTL_MS) return false;
  return true;
}

function readStoredPack() {
  if (!hasWxStorage()) return null;
  try {
    const cached = wx.getStorageSync(SCENE_CACHE_STORAGE_KEY);
    return isValidPack(cached) ? cached : null;
  } catch (e) {
    return null;
  }
}

function writeStoredPack(pack) {
  if (!hasWxStorage() || !pack) return;
  try {
    wx.setStorageSync(SCENE_CACHE_STORAGE_KEY, pack);
  } catch (e) {}
}

function getSavedTapSceneCourseId() {
  if (!hasWxStorage()) return '';
  try {
    return wx.getStorageSync(SELECTED_COURSE_STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

function saveTapSceneCourseId(courseId) {
  if (!courseId || !hasWxStorage()) return;
  try {
    wx.setStorageSync(SELECTED_COURSE_STORAGE_KEY, courseId);
  } catch (e) {}
}

function pickCourse(manifest, courseId) {
  const courses = Array.isArray(manifest && manifest.courses) ? manifest.courses : [];
  const targetId = safeString(courseId || getSavedTapSceneCourseId() || manifest.defaultCourseId, '');
  return courses.find((item) => item && item.id === targetId) ||
    courses.find((item) => item && item.id === manifest.defaultCourseId) ||
    courses[0] ||
    null;
}

async function fetchRemotePack(options) {
  if (!hasWxRequest()) return null;
  const opts = options || {};
  const manifest = await requestJson(withCacheBuster(REMOTE_MANIFEST_URL, now()));
  const version = safeString(manifest && manifest.version, '');
  const course = pickCourse(manifest, opts.courseId);
  const catalogUrl = safeString(course && course.catalogUrl, '');
  if (!version || !course || !catalogUrl) return null;

  const rawCatalog = await requestJson(withCacheBuster(catalogUrl, course.version || version));
  const scenes = Array.isArray(rawCatalog && rawCatalog.scenes) ? rawCatalog.scenes : [];
  if (!scenes.length) return null;
  const targetSceneId = safeString(opts.sceneId || rawCatalog.defaultSceneId || course.defaultSceneId, '');
  const rawScene = scenes.find((scene) => scene && scene.id === targetSceneId) ||
    scenes.find((scene) => scene && scene.id === rawCatalog.defaultSceneId) ||
    scenes[0];
  const scene = normalizeScene(rawScene, {
    source: 'remote',
    version: rawCatalog.version || course.version || version,
    courseId: rawCatalog.courseId || rawCatalog.id || course.id,
    courseTitle: rawCatalog.title || course.title,
    topic: rawCatalog.topic || course.topic
  });
  if (!scene.hotspots.length) return null;

  const pack = {
    source: 'remote',
    version: scene.version || version,
    cachedAt: now(),
    manifestUrl: REMOTE_MANIFEST_URL,
    catalogUrl,
    course: {
      id: rawCatalog.courseId || rawCatalog.id || course.id,
      title: rawCatalog.title || course.title || '',
      version: rawCatalog.version || course.version || version,
      courses: Array.isArray(manifest.courses) ? manifest.courses.map((item) => ({ ...item })) : []
    },
    scene
  };
  saveTapSceneCourseId(pack.course.id);
  return pack;
}

async function loadTapScenePack(options) {
  const opts = options || {};
  if (!opts.refresh && isValidPack(sceneMemoryCache)) {
    return clone(sceneMemoryCache);
  }

  const stored = !opts.refresh ? readStoredPack() : null;
  if (stored) {
    sceneMemoryCache = stored;
    return clone(stored);
  }

  const existing = isValidPack(sceneMemoryCache) ? sceneMemoryCache : readStoredPack();
  if (opts.remote !== false) {
    try {
      const remotePack = await fetchRemotePack(opts);
      if (remotePack && isValidPack(remotePack)) {
        sceneMemoryCache = remotePack;
        writeStoredPack(remotePack);
        return clone(remotePack);
      }
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[tap-scene] remote catalog unavailable, fallback to cache/local', e);
      }
    }
  }

  if (isValidPack(existing)) {
    sceneMemoryCache = existing;
    return clone(existing);
  }

  const localPack = buildLocalPack();
  sceneMemoryCache = localPack;
  writeStoredPack(localPack);
  return clone(localPack);
}

function clearTapSceneContentCache() {
  sceneMemoryCache = null;
  if (!hasWxStorage()) return;
  try {
    wx.removeStorageSync(SCENE_CACHE_STORAGE_KEY);
  } catch (e) {}
}

module.exports = {
  REMOTE_MANIFEST_URL,
  loadTapScenePack,
  getSavedTapSceneCourseId,
  saveTapSceneCourseId,
  clearTapSceneContentCache,
  normalizeScene
};
