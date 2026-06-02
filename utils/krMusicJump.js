// utils/krMusicJump.js
// Helper for hopping over to the 听歌学韩语 (kr_music) mini program with a
// word or lyric line pre-filled in its search.
//
// Usage from any page:
//   import { jumpToKrMusicWord, jumpToKrMusicLyric } from '../../utils/krMusicJump';
//   jumpToKrMusicWord('새벽');
//   jumpToKrMusicLyric('어제 밤 별이 빛났어');
//
// Requires app.json -> navigateToMiniProgramAppIdList includes
// "wxa1228b63bef8864d" (already added).

const KR_MUSIC_APPID = 'wxa1228b63bef8864d';
const KR_MUSIC_PATH = 'pages/home/home';

function jump(extraData, opts) {
  return new Promise((resolve) => {
    wx.navigateToMiniProgram({
      appId: KR_MUSIC_APPID,
      path: KR_MUSIC_PATH,
      extraData: Object.assign({ from: 'krtype' }, extraData),
      // 'release' for production. Switch to 'develop' or 'trial' while debugging
      // (the simulator only allows cross-app jumps for installed/whitelisted peers).
      envVersion: (opts && opts.envVersion) || 'release',
      success: () => resolve({ ok: true }),
      fail: (err) => {
        if (!opts || !opts.silent) {
          wx.showToast({ title: '跳转失败', icon: 'none' });
        }
        console.error('[krMusicJump]', err);
        resolve({ ok: false, err });
      },
    });
  });
}

// Open kr_music's search panel auto-filled with the given Korean word.
// Pass a single string or an array of strings (only the first is used in search).
export function jumpToKrMusicWord(wordOrWords, opts) {
  const words = Array.isArray(wordOrWords) ? wordOrWords : [wordOrWords];
  const cleaned = words.map((w) => String(w || '').trim()).filter(Boolean);
  if (!cleaned.length) return Promise.resolve({ ok: false, err: 'empty' });
  return jump({ word: cleaned[0], words: cleaned }, opts);
}

// Open kr_music's search panel auto-filled with the given lyric line.
export function jumpToKrMusicLyric(lyric, opts) {
  const s = String(lyric || '').trim();
  if (!s) return Promise.resolve({ ok: false, err: 'empty' });
  return jump({ lyric: s }, opts);
}

export default {
  jumpToKrMusicWord,
  jumpToKrMusicLyric,
};
