function clampInt(value, min, max, fallback) {
  let v = Number(value);
  if (!isFinite(v) || isNaN(v)) v = fallback;
  v = Math.round(v);
  if (v < min) v = min;
  if (v > max) v = max;
  return v;
}

function numberToSinoKorean(num) {
  if (num === 0) return "영";
  if (!isFinite(num) || isNaN(num)) return "오류";

  const sign = num < 0 ? "마이너스 " : "";
  const absNum = Math.abs(num);

  const digits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const smallUnits = ["", "십", "백", "천"];
  const bigUnits = ["", "만", "억"];

  const intNum = Math.floor(absNum);
  if (intNum >= 1000000000000) return "범위 초과";

  let s = String(intNum);
  let result = [];

  let chunkCount = Math.ceil(s.length / 4);
  if (chunkCount > bigUnits.length) return "범위 초과";

  for (let i = 0; i < chunkCount; i++) {
    let start = s.length - (i + 1) * 4;
    let end = s.length - i * 4;
    if (start < 0) start = 0;
    let chunk = s.substring(start, end);
    let chunkNum = parseInt(chunk, 10);

    if (chunkNum === 0) continue;

    let chunkText = "";
    for (let j = 0; j < chunk.length; j++) {
      let d = parseInt(chunk[j], 10);
      let power = chunk.length - 1 - j;
      if (d !== 0) {
        let digitStr = digits[d];
        if (d === 1 && power > 0) digitStr = "";
        chunkText += digitStr + smallUnits[power];
      }
    }

    if (i === 1 && chunkNum === 1) {
      chunkText = "";
    }

    if (chunkText !== "") {
      result.unshift(chunkText + bigUnits[i]);
    } else {
      result.unshift(bigUnits[i]);
    }
  }

  return sign + result.join(' ');
}

const BASE_AUDIO_URL = 'https://enoss.aorenlan.fun/kr_color_count/';
const SINO_UNITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

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

function getAudioUrlCandidates(text, baseUrlOverride) {
  const filename = String(text || '').replace(/\s+/g, '');
  const candidates = [];
  try { candidates.push(toHangulNFD(filename)); } catch (e) {}
  try { if (String.prototype.normalize) candidates.push(filename.normalize('NFD')); } catch (e) {}
  try { if (String.prototype.normalize) candidates.push(filename.normalize('NFC')); } catch (e) {}
  candidates.push(filename);
  
  const baseUrl = baseUrlOverride || BASE_AUDIO_URL;
  
  const uniqueNames = Array.from(new Set(candidates));
  return uniqueNames.map(name => `${baseUrl}${percentEncodeUtf8(name)}.mp3`);
}

function getSinoAudioParts(num) {
  if (num === 0) return ["영"];
  const parts = [];
  let temp = Math.abs(num);
  
  // Thousands
  const thousands = Math.floor(temp / 1000);
  if (thousands > 0) {
     if (thousands > 1) parts.push(SINO_UNITS[thousands]);
     parts.push("천");
     temp %= 1000;
  }
  
  // Hundreds
  const hundreds = Math.floor(temp / 100);
  if (hundreds > 0) {
     if (hundreds > 1) parts.push(SINO_UNITS[hundreds]);
     parts.push("백");
     temp %= 100;
  }
  
  // Tens
  const tens = Math.floor(temp / 10);
  if (tens > 0) {
     if (tens === 1) parts.push("십");
     else parts.push(SINO_UNITS[tens] + "십"); 
     temp %= 10;
  }
  
  // Units
  if (temp > 0) {
     parts.push(SINO_UNITS[temp]);
  }
  
  return parts;
}

Page({
  data: {
    statusBarHeight: 0,
    navBarHeight: 0,

    activeTab: 0,
    isSliding: false,

    heightMin: 100,
    heightMax: 220,
    height: 170,
    koreanHeight: '',

    weightMin: 30,
    weightMax: 150,
    weight: 60,
    koreanWeight: '',

    tempAbsMax: 50,
    tempSign: 1,
    tempAbs: 20,
    koreanTemp: ''
  },

  onLoad() {
    const app = getApp();
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      navBarHeight: app.globalData.navBarHeight
    });

    // Initialize Audio Context
    this._audioCtx = wx.createInnerAudioContext();
    this._playbackId = 0;
    if (wx.setInnerAudioOption) {
      wx.setInnerAudioOption({
        obeyMuteSwitch: false,
        mixWithOther: false
      });
    }

    this.updateHeightKorean();
    this.updateWeightKorean();
    this.updateTempKorean();
  },

  onUnload() {
    if (this._audioCtx) {
      this._audioCtx.destroy();
    }
  },

  goBack() {
    wx.navigateBack();
  },

  switchTab(e) {
    const idx = Number(e.currentTarget.dataset.index);
    this.setData({ activeTab: idx });
  },

  updateHeightKorean() {
    const v = this.data.height;
    this.setData({ koreanHeight: `${numberToSinoKorean(v)} 센티미터` });
  },

  updateWeightKorean() {
    const v = this.data.weight;
    this.setData({ koreanWeight: `${numberToSinoKorean(v)} 킬로그램` });
  },

  updateTempKorean() {
    const sign = this.data.tempSign;
    const abs = this.data.tempAbs;
    const prefix = sign < 0 && abs !== 0 ? '마이너스 ' : '';
    this.setData({ koreanTemp: `${prefix}${numberToSinoKorean(abs)} 도` });
  },

  onHeightSliderChange(e) {
    const v = clampInt(e.detail.value, this.data.heightMin, this.data.heightMax, this.data.height);
    this.setData({ height: v, isSliding: false });
    this.updateHeightKorean();
  },

  onHeightSliderChanging(e) {
    const v = clampInt(e.detail.value, this.data.heightMin, this.data.heightMax, this.data.height);
    this.setData({ height: v, isSliding: true });
    this.updateHeightKorean();
  },

  onHeightInput(e) {
    const v = clampInt(e.detail.value, this.data.heightMin, this.data.heightMax, this.data.height);
    this.setData({ height: v });
    this.updateHeightKorean();
  },

  onWeightSliderChange(e) {
    const v = clampInt(e.detail.value, this.data.weightMin, this.data.weightMax, this.data.weight);
    this.setData({ weight: v, isSliding: false });
    this.updateWeightKorean();
  },

  onWeightSliderChanging(e) {
    const v = clampInt(e.detail.value, this.data.weightMin, this.data.weightMax, this.data.weight);
    this.setData({ weight: v, isSliding: true });
    this.updateWeightKorean();
  },

  onWeightInput(e) {
    const v = clampInt(e.detail.value, this.data.weightMin, this.data.weightMax, this.data.weight);
    this.setData({ weight: v });
    this.updateWeightKorean();
  },

  toggleTempSign() {
    this.setData({ tempSign: this.data.tempSign < 0 ? 1 : -1 });
    this.updateTempKorean();
  },

  onTempAbsSliderChange(e) {
    const v = clampInt(e.detail.value, 0, this.data.tempAbsMax, this.data.tempAbs);
    this.setData({ tempAbs: v, isSliding: false });
    this.updateTempKorean();
  },

  onTempAbsSliderChanging(e) {
    const v = clampInt(e.detail.value, 0, this.data.tempAbsMax, this.data.tempAbs);
    this.setData({ tempAbs: v, isSliding: true });
    this.updateTempKorean();
  },

  onTempAbsInput(e) {
    const v = clampInt(e.detail.value, 0, this.data.tempAbsMax, this.data.tempAbs);
    this.setData({ tempAbs: v });
    this.updateTempKorean();
  },

  randomizeValue() {
    const { activeTab } = this.data;
    if (activeTab === 0) { // Height
      const min = this.data.heightMin;
      const max = this.data.heightMax;
      const val = Math.floor(Math.random() * (max - min + 1)) + min;
      this.setData({ height: val });
      this.updateHeightKorean();
    } else if (activeTab === 1) { // Weight
      const min = this.data.weightMin;
      const max = this.data.weightMax;
      const val = Math.floor(Math.random() * (max - min + 1)) + min;
      this.setData({ weight: val });
      this.updateWeightKorean();
    } else if (activeTab === 2) { // Temp
      const max = this.data.tempAbsMax;
      const abs = Math.floor(Math.random() * (max + 1));
      // 50% chance for negative, unless abs is 0
      const sign = (abs === 0) ? 1 : (Math.random() > 0.5 ? 1 : -1);
      this.setData({ tempAbs: abs, tempSign: sign });
      this.updateTempKorean();
    }
  },

  playAudio() {
    let parts = [];
    const activeTab = this.data.activeTab;

    console.log('[playAudio] ActiveTab:', activeTab);

    if (activeTab === 0) { // Height
      const val = this.data.height;
      const numStr = numberToSinoKorean(val).replace(/\s+/g, '');
      const filename = `${numStr}_센티미터`;
      parts = [filename];
    } else if (activeTab === 1) { // Weight
      const val = this.data.weight;
      const numStr = numberToSinoKorean(val).replace(/\s+/g, '');
      const filename = `${numStr}_킬로그램`;
      parts = [filename];
    } else if (activeTab === 2) { // Temp
      const sign = this.data.tempSign;
      const abs = this.data.tempAbs;
      const numStr = numberToSinoKorean(abs).replace(/\s+/g, '');
      
      let filename = '';
      if (sign < 0 && abs !== 0) {
        filename = `마이너스_${numStr}_도`;
      } else {
        filename = `${numStr}_도`;
      }
      parts = [filename];
    }

    console.log('[playAudio] Generated Parts:', parts);

    if (parts.length === 0) return;

    this._playbackId++;
    const currentId = this._playbackId;

    if (this._audioCtx) {
      this._audioCtx.stop();
    }
    
    // Determine Base URL (Assuming Unit Base URL is needed, or default)
    // The previous code used BASE_AUDIO_URL which was color_count
    // But for Units, we probably want the UNIT_AUDIO_BASE_URL
    // Based on user's previous request: https://enoss.aorenlan.fun/kr_time/unit/
    
    const UNIT_AUDIO_BASE_URL = 'https://enoss.aorenlan.fun/kr_time/unit/';
    const baseUrl = UNIT_AUDIO_BASE_URL;

    let index = 0;

    const playNext = () => {
      if (currentId !== this._playbackId) return;
      if (index >= parts.length) return;

      const text = parts[index];
      this.playSinglePart(text, baseUrl).then(() => {
        index++;
        playNext();
      }).catch((err) => {
        console.error('Failed to play part:', text, err);
        index++;
        playNext();
      });
    };

    playNext();
  },

  playSinglePart(text, baseUrl) {
    console.log('[playSinglePart] Preparing to play:', text, 'BaseUrl:', baseUrl);
    const urls = getAudioUrlCandidates(text, baseUrl); // Pass baseUrl
    console.log('[playSinglePart] URLs:', urls);
    
    if (!this._audioCtx) {
      this._audioCtx = wx.createInnerAudioContext();
    }
    return this.playWithFallback(this._audioCtx, urls, text);
  },

  playWithFallback(audioCtx, urls, text) {
    return new Promise((resolve, reject) => {
      let urlIndex = 0;

      const tryNext = () => {
        if (urlIndex >= urls.length) {
          reject(new Error('All URLs failed'));
          return;
        }

        const url = urls[urlIndex];
        this.playSrcOnce(audioCtx, url, text + '_' + urlIndex).then((success) => {
          if (success) {
            resolve();
          } else {
            urlIndex++;
            tryNext();
          }
        });
      };

      tryNext();
    });
  },

  playSrcOnce(audioCtx, src, cacheKey) {
    return new Promise((resolve) => {
      let settled = false;
      let started = false;
      let failTimer = null;

      const cleanup = () => {
        if (failTimer) clearTimeout(failTimer);
        audioCtx.offEnded(onEnded);
        audioCtx.offError(onError);
        audioCtx.offPlay(onPlay);
      };

      const settle = (success) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(success);
      };

      const onEnded = () => settle(true);
      
      const onError = (res) => {
        console.error('onError', res);
        settle(false);
      };
      
      const onPlay = () => {
        started = true;
      };

      audioCtx.onEnded(onEnded);
      audioCtx.onError(onError);
      audioCtx.onPlay(onPlay);

      audioCtx.src = src;
      audioCtx.play();

      failTimer = setTimeout(() => {
        if (!started) {
          settle(false);
        }
      }, 3000);
    });
  }
});
