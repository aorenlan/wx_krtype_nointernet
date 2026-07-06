const REMOTE_MANIFEST_URL = 'https://enoss.aorenlan.fun/kr_picturebook/config/picture-words.manifest.json';
const CONFIG_CACHE_KEY = 'photo_learn_recognition_config_cache_v1';
const CONFIG_CACHE_TTL_MS = 60 * 1000;
const CONFIG_REQUEST_TIMEOUT_MS = 3000;

const DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG = {
  enabled: true,
  dailyFreeLimit: 5,
  rewardBonus: 3,
  adUnitId: 'adunit-17974771ea617fa3'
};

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function normalizeRecognitionConfig(rawConfig) {
  const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};
  return {
    enabled: source.enabled !== false,
    dailyFreeLimit: clampNumber(
      source.dailyFreeLimit,
      DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG.dailyFreeLimit,
      0,
      999
    ),
    rewardBonus: clampNumber(
      source.rewardBonus,
      DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG.rewardBonus,
      1,
      99
    ),
    adUnitId: String(source.adUnitId || DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG.adUnitId).trim()
  };
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      dataType: 'json',
      timeout: CONFIG_REQUEST_TIMEOUT_MS,
      success: (res) => {
        const statusCode = Number(res.statusCode);
        if (statusCode >= 200 && statusCode < 300 && res.data) {
          resolve(res.data);
          return;
        }
        reject(new Error(`Config request failed: ${statusCode || 'unknown'}`));
      },
      fail: reject
    });
  });
}

function withCacheBuster(url, value) {
  const joiner = url.indexOf('?') >= 0 ? '&' : '?';
  return `${url}${joiner}_cfg=${encodeURIComponent(value)}`;
}

function getCachedConfig() {
  try {
    const cache = wx.getStorageSync(CONFIG_CACHE_KEY);
    if (!cache || !cache.config) return null;
    return cache;
  } catch (error) {
    return null;
  }
}

function saveCachedConfig(config) {
  try {
    wx.setStorageSync(CONFIG_CACHE_KEY, {
      savedAt: Date.now(),
      config
    });
  } catch (error) {
    // Cache write failures should not block recognition.
  }
}

function pickPhotoLearnConfig(manifest) {
  const features = manifest && manifest.features ? manifest.features : {};
  const photoLearn = features.photoLearn || manifest.photoLearn || {};
  return photoLearn.recognition || photoLearn;
}

async function loadPhotoLearnRecognitionConfig(options = {}) {
  const force = !!options.force;
  const cache = getCachedConfig();
  if (!force && cache && Date.now() - Number(cache.savedAt || 0) < CONFIG_CACHE_TTL_MS) {
    return normalizeRecognitionConfig(cache.config);
  }

  try {
    const manifest = await requestJson(withCacheBuster(REMOTE_MANIFEST_URL, Date.now()));
    const config = normalizeRecognitionConfig(pickPhotoLearnConfig(manifest));
    saveCachedConfig(config);
    return config;
  } catch (error) {
    if (cache && cache.config) {
      return normalizeRecognitionConfig(cache.config);
    }
    return { ...DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG };
  }
}

module.exports = {
  DEFAULT_PHOTO_LEARN_RECOGNITION_CONFIG,
  loadPhotoLearnRecognitionConfig
};
