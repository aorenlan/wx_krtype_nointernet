const srs = require('../../utils/srs');

const AUDIO_ORIGIN = 'https://enoss.aorenlan.fun';
const AUDIO_BASE_PATH = '/kr_word';

// 与练习页完全相同的 percent encode
function percentEncodeUtf8(input) {
  const str = String(input || '');
  let out = '';
  for (let i = 0; i < str.length; i++) {
    let codePoint = str.codePointAt(i);
    if (codePoint == null) continue;
    if (codePoint > 0xffff) i++;
    const appendByte = (b) => {
      if ((b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) ||
          (b >= 0x30 && b <= 0x39) || b === 0x2d || b === 0x2e || b === 0x5f || b === 0x7e) {
        out += String.fromCharCode(b);
      } else {
        out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
      }
    };
    if (codePoint <= 0x7f) { appendByte(codePoint); }
    else if (codePoint <= 0x7ff) { appendByte(0xc0 | (codePoint >> 6)); appendByte(0x80 | (codePoint & 0x3f)); }
    else if (codePoint <= 0xffff) { appendByte(0xe0 | (codePoint >> 12)); appendByte(0x80 | ((codePoint >> 6) & 0x3f)); appendByte(0x80 | (codePoint & 0x3f)); }
    else { appendByte(0xf0 | (codePoint >> 18)); appendByte(0x80 | ((codePoint >> 12) & 0x3f)); appendByte(0x80 | ((codePoint >> 6) & 0x3f)); appendByte(0x80 | (codePoint & 0x3f)); }
  }
  return out;
}

// 与练习页完全相同的韩文 NFD 分解
function toHangulNFD(s) {
  const str = String(s || '');
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const sIndex = code - 0xAC00;
      const lIndex = Math.floor(sIndex / 588);
      const vIndex = Math.floor((sIndex % 588) / 28);
      const tIndex = sIndex % 28;
      out += String.fromCharCode(0x1100 + lIndex);
      out += String.fromCharCode(0x1161 + vIndex);
      if (tIndex) out += String.fromCharCode(0x11A7 + tIndex);
    } else { out += str[i]; }
  }
  return out;
}

function buildWordAudioUrls(word, category) {
  const folder = /^Yonsei\s+\d/.test(category || '') ? 'yansei' : 'topic';
  const w0 = String(word || '').trim().replace(/\s+/g, '_');
  const variants = [];
  const hangulNfd = toHangulNFD(w0);
  if (hangulNfd) variants.push(hangulNfd);
  try { variants.push(w0.normalize('NFD')); } catch (e) {}
  try { variants.push(w0.normalize('NFC')); } catch (e) {}
  variants.push(w0);
  const unique = Array.from(new Set(variants.filter(Boolean)));
  const urls = [];
  unique.forEach(v => {
    const name = `${v}.mp3`;
    const hasNonAscii = /[^\u0000-\u007f]/.test(name);
    urls.push(`${AUDIO_ORIGIN}${AUDIO_BASE_PATH}/${folder}/${percentEncodeUtf8(name)}`);
    if (!hasNonAscii) urls.push(`${AUDIO_ORIGIN}${AUDIO_BASE_PATH}/${folder}/${name}`);
  });
  return Array.from(new Set(urls));
}

Page({
  data: {
    cards: [],          // 今日待复习列表
    current: 0,         // 当前卡片索引
    total: 0,           // 初始总数
    done: 0,            // 已掌握数量
    revealed: false,    // 是否已翻转
    finished: false,    // 是否全部完成
    animating: false,   // 飞出动画进行中
    autoPlay: true,     // 喇叭开关：自动朗读

    // 滑动手势
    startX: 0,
    offsetX: 0,
    swiping: false,
    swipeDir: '',       // 'left' | 'right' | ''
  },

  onLoad() {
    const showDebugBtn = wx.getStorageSync('dev_mode_enabled') || false;
    const cards = srs.getTodayReviewList();
    if (cards.length === 0) {
      this.setData({ finished: true, showDebugBtn });
      return;
    }
    this.setData({ cards, current: 0, total: cards.length, done: 0, revealed: false, showDebugBtn });
  },

  toggleAutoPlay() {
    const next = !this.data.autoPlay;
    this.setData({ autoPlay: next });
    wx.showToast({ title: next ? '自动朗读已开启' : '自动朗读已关闭', icon: 'none', duration: 1200 });
  },

  _playCurrentWord() {
    if (!this.data.autoPlay) return;
    const card = this.data.cards[this.data.current];
    if (!card || !card.word) return;
    const urls = buildWordAudioUrls(card.word, card.category);
    console.log('[SRS audio] word:', card.word, '| category:', card.category, '| urls:', JSON.stringify(urls));
    if (!urls.length) return;

    if (this._audioCtx) {
      try { this._audioCtx.stop(); this._audioCtx.destroy(); } catch (e) {}
      this._audioCtx = null;
    }

    const fs = wx.getFileSystemManager();
    const safeName = String(card.word).replace(/[^\w\-\u4e00-\u9fa5\uac00-\ud7a3]/g, '_') + '.mp3';
    const cacheDir = `${wx.env.USER_DATA_PATH}/audio_cache`;
    const cachePath = `${cacheDir}/${safeName}`;

    // 检查是否有本地缓存
    let hasCached = false;
    try { fs.accessSync(cachePath); hasCached = true; } catch (e) {}

    const playSrc = (src, fallbackUrls) => {
      console.log('[SRS audio] playSrc:', src);
      const ctx = wx.createInnerAudioContext();
      this._audioCtx = ctx;
      let started = false;
      ctx.onPlay(() => {
        started = true;
        console.log('[SRS audio] onPlay fired');
      });
      ctx.onError((err) => {
        console.error('[SRS audio] playError:', JSON.stringify(err));
        if (started) return;
        // 播放失败时如果还有 fallback URL，继续尝试；否则走 edgeTts 兜底
        if (fallbackUrls && fallbackUrls.length > 0) {
          console.log('[SRS audio] trying next url');
          doDownload(fallbackUrls);
        } else {
          fallbackToEdgeTts();
        }
      });
      ctx.autoplay = false;
      ctx.src = src;
      ctx.play();
    };

    const ensureCacheDir = () => {
      try { fs.accessSync(cacheDir); } catch (e) {
        try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e2) {}
      }
    };

    const fallbackToEdgeTts = () => {
      if (!wx.cloud || !wx.cloud.callFunction) {
        console.warn('[SRS audio] edgeTts unavailable: wx.cloud not initialized');
        return;
      }
      console.log('[SRS audio] all urls failed, calling edgeTts for:', card.word);
      wx.cloud.callFunction({
        name: 'edgeTts',
        timeout: 15000,
        data: { text: card.word, lang: 'ko-KR' },
        success: (res) => {
          const result = (res && res.result) || {};
          if (!result.ok || !result.audioBase64) {
            console.warn('[SRS audio] edgeTts failed:', result.error || 'no audio');
            wx.showToast({ title: '朗读失败', icon: 'none', duration: 1500 });
            return;
          }
          ensureCacheDir();
          try { fs.unlinkSync(cachePath); } catch (e) {}
          fs.writeFile({
            filePath: cachePath,
            data: result.audioBase64,
            encoding: 'base64',
            success: () => {
              console.log('[SRS audio] edgeTts saved to:', cachePath);
              playSrc(cachePath, []);
            },
            fail: (e) => {
              console.warn('[SRS audio] edgeTts writeFile failed:', JSON.stringify(e));
              wx.showToast({ title: '朗读失败', icon: 'none', duration: 1500 });
            }
          });
        },
        fail: (e) => {
          console.warn('[SRS audio] edgeTts callFunction fail:', JSON.stringify(e));
          wx.showToast({ title: '朗读失败', icon: 'none', duration: 1500 });
        }
      });
    };

    const doDownload = (remainingUrls) => {
      if (!remainingUrls || remainingUrls.length === 0) {
        console.warn('[SRS audio] all urls exhausted, falling back to edgeTts for:', card.word);
        fallbackToEdgeTts();
        return;
      }
      const url = remainingUrls[0];
      const rest = remainingUrls.slice(1);
      console.log('[SRS audio] downloading:', url);
      wx.downloadFile({
        url,
        success(res) {
          console.log('[SRS audio] download statusCode:', res.statusCode);
          if (res.statusCode === 200 && res.tempFilePath) {
            ensureCacheDir();
            try { fs.unlinkSync(cachePath); } catch (e) {}
            try {
              fs.saveFileSync(res.tempFilePath, cachePath);
              console.log('[SRS audio] saved to:', cachePath);
              playSrc(cachePath, rest);
            } catch (e) {
              console.warn('[SRS audio] saveFile failed, play temp directly');
              playSrc(res.tempFilePath, rest);
            }
          } else {
            doDownload(rest);
          }
        },
        fail(e) {
          console.warn('[SRS audio] download fail:', JSON.stringify(e));
          doDownload(rest);
        }
      });
    };

    if (hasCached) {
      console.log('[SRS audio] cache hit:', cachePath);
      // 缓存损坏时直接清除并走 edgeTts 重生成，不再重试 OSS
      playSrc(cachePath, []);
    } else {
      doDownload(urls);
    }
  },

  // 点击卡片翻转
  onCardTap() {
    if (this.data.swiping || this.data.animating) return;
    if (!this.data.revealed) {
      this.setData({ revealed: true });
      this._playCurrentWord();
    }
  },

  // 触摸开始
  onTouchStart(e) {
    if (this.data.animating) return;
    this.setData({
      startX: e.touches[0].clientX,
      offsetX: 0,
      swiping: false,
      swipeDir: '',
    });
  },

  // 触摸移动
  onTouchMove(e) {
    if (this.data.animating) return;
    const dx = e.touches[0].clientX - this.data.startX;
    const dir = dx > 0 ? 'right' : 'left';
    this.setData({ offsetX: dx, swiping: Math.abs(dx) > 8, swipeDir: dir });
  },

  // 触摸结束
  onTouchEnd() {
    if (this.data.animating) return;
    const { offsetX, revealed } = this.data;
    if (Math.abs(offsetX) > 80) {
      const remembered = revealed ? offsetX > 0 : true;
      this._flyOut(offsetX > 0 ? 600 : -600, remembered);
    } else {
      this.setData({ offsetX: 0, swiping: false, swipeDir: '' });
    }
  },

  // 飞出动画后提交
  _flyOut(targetX, remembered) {
    this.setData({ animating: true, offsetX: targetX });
    setTimeout(() => {
      this.submitCard(remembered);
    }, 260);
  },

  // 底部按钮
  onForgot() {
    if (this.data.animating) return;
    this._flyOut(-600, false);
  },
  onRemembered() {
    if (this.data.animating) return;
    this._flyOut(600, true);
  },

  submitCard(remembered) {
    const { cards, current } = this.data;
    const card = cards[current];

    let newCards = cards.slice();
    let done = this.data.done;
    if (remembered) {
      srs.submitReview(card.key, true);
      newCards.splice(current, 1);
      done += 1;
    } else {
      newCards.splice(current, 1);
      newCards.push(card);
    }

    if (newCards.length === 0) {
      this.setData({ offsetX: 0, swiping: false, swipeDir: '', animating: false, done, finished: true });
    } else {
      const nextIdx = current >= newCards.length ? 0 : current;
      this.setData({
        cards: newCards,
        current: nextIdx,
        done,
        revealed: false,
        offsetX: 0,
        swiping: false,
        swipeDir: '',
        animating: false,
      });
    }
  },

  onUnload() {
    if (this._audioCtx) {
      try { this._audioCtx.stop(); this._audioCtx.destroy(); } catch (e) {}
      this._audioCtx = null;
    }
  },

  onBack() {
    wx.navigateBack();
  },

  // 测试用：模拟过了1天（nextReview 各自减1天，这样需要6天的词要点6次才出现）
  debugSimulateNextDay() {
    const all = wx.getStorageSync('flashflow_srs') || {};
    const ONE_DAY = 86400000;
    Object.keys(all).forEach(k => {
      all[k].nextReview = all[k].nextReview - ONE_DAY;
    });
    wx.setStorageSync('flashflow_srs', all);
    wx.removeStorageSync('flashflow_srs_daily');
    const cards = srs.getTodayReviewList();
    this.setData({ cards, current: 0, total: cards.length, done: 0, revealed: false, finished: cards.length === 0 });
    wx.showToast({ title: cards.length > 0 ? `今日待复习 ${cards.length}个` : '今天没有到期单词', icon: 'none' });
  },
});
