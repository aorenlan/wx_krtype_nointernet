const BASE_COLOR_AUDIO_URL = 'https://enoss.aorenlan.fun/kr_color_count/';

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
    } else {
      out += str[i];
    }
  }
  return out;
}

function percentEncodeUtf8(input) {
  const str = String(input || '');
  let out = '';
  for (let i = 0; i < str.length; i++) {
    let codePoint = str.codePointAt(i);
    if (codePoint == null) continue;
    if (codePoint > 0xffff) i++;

    const appendByte = (b) => {
      if (
        (b >= 0x41 && b <= 0x5a) ||
        (b >= 0x61 && b <= 0x7a) ||
        (b >= 0x30 && b <= 0x39) ||
        b === 0x2d ||
        b === 0x2e ||
        b === 0x5f ||
        b === 0x7e
      ) {
        out += String.fromCharCode(b);
      } else {
        out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
      }
    };

    if (codePoint <= 0x7f) {
      appendByte(codePoint);
    } else if (codePoint <= 0x7ff) {
      appendByte(0xc0 | (codePoint >> 6));
      appendByte(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      appendByte(0xe0 | (codePoint >> 12));
      appendByte(0x80 | ((codePoint >> 6) & 0x3f));
      appendByte(0x80 | (codePoint & 0x3f));
    } else {
      appendByte(0xf0 | (codePoint >> 18));
      appendByte(0x80 | ((codePoint >> 12) & 0x3f));
      appendByte(0x80 | ((codePoint >> 6) & 0x3f));
      appendByte(0x80 | (codePoint & 0x3f));
    }
  }
  return out;
}

function getAudioUrlCandidates(text) {
  const filename = String(text || '').replace(/\s+/g, '');
  const candidates = [];
  try { candidates.push(toHangulNFD(filename)); } catch (e) {}
  try { if (String.prototype.normalize) candidates.push(filename.normalize('NFD')); } catch (e) {}
  try { if (String.prototype.normalize) candidates.push(filename.normalize('NFC')); } catch (e) {}
  candidates.push(filename);
  const uniqueNames = Array.from(new Set(candidates));
  return uniqueNames.map(name => `${BASE_COLOR_AUDIO_URL}${percentEncodeUtf8(name)}.mp3`);
}

function normalizeKo(input) {
  let s = String(input || '').trim().replace(/\s+/g, '');
  if (s.endsWith('색')) s = s.slice(0, -1);
  return s;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

const COLOR_BANK = [
  { id: 'red', zh: '红', ko: '빨강', hex: '#ef4444' },
  { id: 'orange', zh: '橙', ko: '주황', hex: '#f97316' },
  { id: 'yellow', zh: '黄', ko: '노랑', hex: '#facc15' },
  { id: 'green', zh: '绿', ko: '초록', hex: '#22c55e' },
  { id: 'blue', zh: '蓝', ko: '파랑', hex: '#3b82f6' },
  { id: 'navy', zh: '藏青', ko: '남색', hex: '#1d4ed8' },
  { id: 'purple', zh: '紫', ko: '보라', hex: '#a855f7' },
  { id: 'pink', zh: '粉', ko: '분홍', hex: '#ec4899' },
  { id: 'brown', zh: '棕', ko: '갈색', hex: '#a16207' },
  { id: 'black', zh: '黑', ko: '검정', hex: '#111827' },
  { id: 'white', zh: '白', ko: '흰', hex: '#f8fafc' },
  { id: 'gray', zh: '灰', ko: '회색', hex: '#94a3b8' },
  { id: 'sky', zh: '天蓝', ko: '하늘색', hex: '#38bdf8' },
  { id: 'gold', zh: '金', ko: '금색', hex: '#ffd700' },
  { id: 'silver', zh: '银', ko: '은색', hex: '#c0c0c0' },
  { id: 'beige', zh: '米', ko: '베이지', hex: '#f5f5dc' },
  { id: 'mint', zh: '薄荷', ko: '민트', hex: '#98ff98' },
  { id: 'lavender', zh: '薰衣草', ko: '라벤더', hex: '#e6e6fa' },
  { id: 'olive', zh: '橄榄', ko: '올리브', hex: '#808000' },
  { id: 'indigo', zh: '靛青', ko: '남보라', hex: '#4b0082' },
  { id: 'teal', zh: '青', ko: '청록', hex: '#008080' },
  { id: 'magenta', zh: '洋红', ko: '자주', hex: '#ff00ff' },
  { id: 'lime', zh: '酸橙', ko: '라임', hex: '#00ff00' },
  { id: 'maroon', zh: '栗', ko: '밤색', hex: '#800000' },
  { id: 'coral', zh: '珊瑚', ko: '산호색', hex: '#ff7f50' }
];

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,

    activeModule: 0,
    
    // Module 0: Flip/Zoom
    gridSize: 4, // 4 or 9
    gridCells: [],
    focusedCell: null, // { hex, ko } or null
    lastFlippedKo: '',

    quizColor: COLOR_BANK[0],
    quizInput: '',
    quizResult: 0,
    quizFeedback: '输入后点击确认',

    audioOptions: [],
    audioTargetId: '',
    audioStatus: '点击开始后播放音频',
    audioResult: 0,
    audioFeedback: '',

    isAudioEnabled: true,
    isShowZh: true
  },

  onLoad() {
    const app = getApp();
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight
    });

    if (wx.setInnerAudioOption) {
      wx.setInnerAudioOption({
        obeyMuteSwitch: false,
        mixWithOther: false
      });
    }

    this._audioCtx = wx.createInnerAudioContext();
    this.initFlip();
    this.initQuiz();
    this.initAudio();
  },

  onUnload() {
    if (this._audioCtx) {
      this._audioCtx.destroy();
    }
  },

  goBack() {
    wx.navigateBack();
  },

  switchModule(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ activeModule: idx });
  },

  switchGridSize(e) {
    const size = Number(e.currentTarget.dataset.size);
    if (this.data.gridSize === size) return;
    this.setData({ gridSize: size }, () => {
      this.initFlip();
    });
  },

  initFlip() {
    const count = this.data.gridSize === 9 ? 81 : 16;
    
    // For 9x9, we repeat colors or pick random from full bank if needed. 
    // Actually, user wants "grid" of colors. If 9x9=81, maybe random fill?
    // Let's just fill randomly from full bank to ensure variety.
    
    const gridCells = Array.from({ length: count }, () => {
      const c = pickRandom(COLOR_BANK); // Random pick for each cell
      return { id: c.id, ko: c.ko, zh: c.zh, hex: c.hex, flipped: false };
    });
    this.setData({ gridCells, lastFlippedKo: '', focusedCell: null });
  },

  onFlipCell(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const cell = this.data.gridCells[idx];
    if (!cell) return;

    // Zoom effect: set focusedCell
    this.setData({
      focusedCell: { hex: cell.hex, ko: cell.ko, zh: cell.zh },
      lastFlippedKo: cell.ko
    });

    if (this.data.isAudioEnabled) {
      this.playColorAudio(cell.ko);
    }
  },

  toggleAudio() {
    this.setData({ isAudioEnabled: !this.data.isAudioEnabled });
  },

  toggleZh() {
    this.setData({ isShowZh: !this.data.isShowZh });
  },

  closeFocus() {
    this.setData({ focusedCell: null });
  },

  resetFlip() {
    this.setData({ focusedCell: null, lastFlippedKo: '' });
    // Maybe re-randomize just positions but keep colors? Or just reset focus?
    // User said "reset", let's re-init.
    this.initFlip(); 
  },

  shuffleFlip() {
    this.initFlip();
  },

  initQuiz() {
    const quizColor = pickRandom(COLOR_BANK);
    this.setData({
      quizColor,
      quizInput: '',
      quizResult: 0,
      quizFeedback: '输入后点击确认'
    });
  },

  onQuizInput(e) {
    this.setData({ quizInput: e.detail.value, quizResult: 0, quizFeedback: '' });
  },

  checkQuiz() {
    const answer = normalizeKo(this.data.quizColor.ko);
    const input = normalizeKo(this.data.quizInput);
    if (!input) {
      this.setData({ quizResult: -1, quizFeedback: '请先输入' });
      return;
    }
    if (input === answer) {
      this.setData({ quizResult: 1, quizFeedback: '正确，已进入下一个' });
      setTimeout(() => this.initQuiz(), 450);
    } else {
      this.setData({ quizResult: -1, quizFeedback: `不对，答案：${this.data.quizColor.ko}` });
    }
  },

  nextQuiz() {
    this.initQuiz();
  },

  initAudio() {
    const options = shuffle(COLOR_BANK).slice(0, 9);
    this.setData({
      audioOptions: options,
      audioTargetId: '',
      audioStatus: '点击开始后播放音频',
      audioResult: 0,
      audioFeedback: ''
    });
  },

  reshuffleAudioOptions() {
    this.initAudio();
  },

  startAudioRound() {
    if (!this.data.audioOptions.length) {
      this.initAudio();
    }
    const target = pickRandom(this.data.audioOptions);
    this.setData({
      audioTargetId: target.id,
      audioStatus: '正在播放…',
      audioResult: 0,
      audioFeedback: ''
    });
    this.playColorAudio(target.ko).then(() => {
      this.setData({ audioStatus: '请选择对应颜色' });
    }).catch(() => {
      this.setData({ audioStatus: `音频暂未配置：${target.ko}` });
    });
  },

  selectAudioColor(e) {
    const id = String(e.currentTarget.dataset.id);
    if (!this.data.audioTargetId) {
      this.setData({ audioResult: -1, audioFeedback: '请先点击开始' });
      return;
    }
    const target = this.data.audioOptions.find(x => x.id === this.data.audioTargetId);
    if (!target) return;

    if (id === this.data.audioTargetId) {
      this.setData({ audioResult: 1, audioFeedback: '正确，即将进入下一关' });
      setTimeout(() => {
        this.initAudio();
        this.startAudioRound();
      }, 800);
    } else {
      this.setData({ audioResult: -1, audioFeedback: `不对，答案：${target.ko}` });
    }
  },

  playColorAudio(text) {
    const urls = getAudioUrlCandidates(text);
    if (!this._audioCtx) {
      this._audioCtx = wx.createInnerAudioContext();
    }

    this._audioCtx.stop();

    return new Promise((resolve, reject) => {
      let urlIndex = 0;

      const cleanup = () => {
        this._audioCtx.offEnded(onEnded);
        this._audioCtx.offError(onError);
      };

      const onEnded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        this._audioCtx.stop();
        cleanup();
        urlIndex++;
        tryNext();
      };

      const tryNext = () => {
        if (urlIndex >= urls.length) {
          reject(new Error('all failed'));
          return;
        }
        this._audioCtx.offEnded(onEnded);
        this._audioCtx.offError(onError);
        this._audioCtx.onEnded(onEnded);
        this._audioCtx.onError(onError);
        this._audioCtx.src = urls[urlIndex];
        this._audioCtx.play();
      };

      tryNext();
    });
  }
});
