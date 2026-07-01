const AD_FREE_EXPIRE_KEY = 'kr_ad_free_expire';

const PHOTO_AD_SCOPES = {
  photo: true,
  'photo-learn': true,
  'photo-recognition': true
};

const toTimestamp = (value) => {
  const ts = Number(value);
  return Number.isFinite(ts) ? ts : 0;
};

const getAdFreeExpire = () => {
  try {
    return toTimestamp(wx.getStorageSync(AD_FREE_EXPIRE_KEY));
  } catch (e) {
    return 0;
  }
};

const setAdFreeExpire = (expire) => {
  try {
    wx.setStorageSync(AD_FREE_EXPIRE_KEY, toTimestamp(expire));
  } catch (e) {}
};

const isAdFreeActive = (now) => {
  const current = now == null ? Date.now() : Number(now);
  return getAdFreeExpire() > current;
};

const shouldSkipAd = (scope) => {
  const key = scope == null ? '' : String(scope);
  if (PHOTO_AD_SCOPES[key]) return false;
  return isAdFreeActive();
};

module.exports = {
  AD_FREE_EXPIRE_KEY,
  getAdFreeExpire,
  isAdFreeActive,
  setAdFreeExpire,
  shouldSkipAd
};
