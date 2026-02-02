const NATIVE_HOURS = [
  "", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열", "열한", "열두"
];

const SINO_TENS = ["", "십", "이십", "삼십", "사십", "오십"];
const SINO_UNITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

function getSinoMinutes(minutes) {
  if (minutes === 0) return "";
  if (minutes === 30) return "반"; // "Half"

  const tens = Math.floor(minutes / 10);
  const units = minutes % 10;

  let result = "";
  if (tens > 0) {
    if (tens === 1) result += "십";
    else result += SINO_UNITS[tens] + "십";
  }
  result += SINO_UNITS[units];
  return result;
}

const BASE_AUDIO_URL = 'https://enoss.aorenlan.fun/kr_time/';

// Helper: Manual NFD decomposition (more reliable on Android than String.prototype.normalize)
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

// Helper: Custom percent encoding to match OSS expectations
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
  // Remove spaces
  let filename = text.replace(/\s+/g, '');
  
  const candidates = [];
  // 1. Manual NFD (Most reliable for OSS compatibility on Android)
  try { candidates.push(toHangulNFD(filename)); } catch (e) {}
  // 2. Standard NFD (Apple default)
  try { if (String.prototype.normalize) candidates.push(filename.normalize('NFD')); } catch (e) {}
  // 3. Standard NFC (Android default)
  try { if (String.prototype.normalize) candidates.push(filename.normalize('NFC')); } catch (e) {}
  // 4. Raw filename
  candidates.push(filename);

  // Deduplicate and map to full URLs
  const uniqueNames = Array.from(new Set(candidates));
  return uniqueNames.map(name => `${BASE_AUDIO_URL}${percentEncodeUtf8(name)}.mp3`);
}

function convertToKoreanTime(totalMinutes) {
  // totalMinutes should be normalized to 0-1439
  let t = totalMinutes % 1440;
  if (t < 0) t += 1440;
  
  const h24 = Math.floor(t / 60);
  const m = Math.floor(t % 60);
  
  // Period Logic
  let prefix = "";
  let audioParts = []; // Array of strings to be used for audio filenames
  
  // Special Exact Cases
  if (h24 === 0 && m === 0) {
      return { text: "자정", audioParts: ["자정"] };
  }
  if (h24 === 12 && m === 0) {
      return { text: "정오", audioParts: ["정오"] };
  }
  
  // Strict Rules:
  // 00:01 ~ 11:59 -> 오전
  // 12:01 ~ 23:59 -> 오후
  if (h24 < 12) {
      prefix = "오전";
  } else {
      prefix = "오후";
  }
  
  audioParts.push(prefix);

  // Convert 24h to 12h for display text
  let displayH = h24 % 12;
  if (displayH === 0) displayH = 12;
  
  const hourPart = NATIVE_HOURS[displayH] + " 시";
  audioParts.push(NATIVE_HOURS[displayH] + "시"); // "한시", "두시" etc.
  
  if (m === 0) {
    return { 
        text: `${prefix} ${hourPart}`,
        audioParts: audioParts
    };
  }
  
  const minPart = m === 30 ? "반" : getSinoMinutes(m) + " 분";
  if (m === 30) {
      audioParts.push("반"); // Or "삼십분"? Assuming "반.mp3" exists or user wants "반"
  } else {
      audioParts.push(getSinoMinutes(m) + "분"); // "일분", "이분" etc.
  }

  return { 
      text: `${prefix} ${hourPart} ${minPart}`,
      audioParts: audioParts
  };
}

Page({
  data: {
    totalMinutes: 720, // 12:00 (Noon) - Range 0 to 1439
    hourAngle: 0,
    minuteAngle: 0,
    digitalTime: '12:00',
    koreanTime: '',
    isKoreanVisible: true, // Default visible
    isLiveClock: false, // Is the clock auto-ticking?
    
    // Layout
    statusBarHeight: 0,
    navBarHeight: 0,

    // Interaction
    clockCenter: { x: 0, y: 0 },
    clockRadius: 0,
    isDragging: null, // 'minute' | 'hour'
    lastAngle: 0
  },
  
  onLoad() {
    // Ensure audio plays even in silent mode
    if (wx.setInnerAudioOption) {
        wx.setInnerAudioOption({
            obeyMuteSwitch: false,
            mixWithOther: false
        });
    }

    // Initialize Singleton AudioContext
    this._audioCtx = wx.createInnerAudioContext();
    this._playbackId = 0;

    const app = getApp();
    this.setData({
        statusBarHeight: app.globalData.statusBarHeight,
        navBarHeight: app.globalData.navBarHeight
    });
    // Start live clock on load
    this.startLiveClock();
    
    // Preload audio for current time (Period + Hour)
    // Wait a bit for initial time set
    setTimeout(() => {
        this.preloadCurrentPeriodAndHour();
    }, 500);
  },

  onUnload() {
    this.stopLiveClock();
    if (this._audioCtx) {
        this._audioCtx.destroy();
    }
  },

  startLiveClock() {
    this.setData({ isLiveClock: true });
    this.updateToCurrentTime();
    
    // Update every second
    this._timer = setInterval(() => {
        this.updateToCurrentTime();
    }, 1000);
  },

  stopLiveClock() {
    if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
    }
    this.setData({ isLiveClock: false });
  },

  updateToCurrentTime() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds(); // Optional: if we want smooth minute movement, we could use seconds
    // But our logic is minute-based. Let's stick to minutes.
    const total = h * 60 + m;
    this.updateFromTotalMinutes(total);
  },

  goBack() {
    wx.navigateBack();
  },

  onTimePickerChange(e) {
    this.stopLiveClock(); // User interaction stops auto-update
    const val = e.detail.value; // "HH:mm"
    const [h, m] = val.split(':').map(Number);
    const total = h * 60 + m;
    this.updateFromTotalMinutes(total);
  },
  
  onReady() {
    this.measureClock();
  },
  
  measureClock() {
    const query = wx.createSelectorQuery();
    query.select('.clock-face').boundingClientRect();
    query.exec((res) => {
        if (res && res[0]) {
            this.setData({
                clockCenter: {
                    x: res[0].left + res[0].width / 2,
                    y: res[0].top + res[0].height / 2
                },
                clockRadius: res[0].width / 2
            });
        }
    });
  },

  setRandomTime() {
    this.stopLiveClock(); // User interaction stops auto-update
    // Generate random 24 hours (0-1439)
    const randomTotal = Math.floor(Math.random() * 1440);
    this.updateFromTotalMinutes(randomTotal);
  },

  toggleKoreanVisibility() {
    this.setData({ isKoreanVisible: !this.data.isKoreanVisible });
  },

  updateFromTotalMinutes(total) {
      // Normalize total to be positive 0-1439 range
      let t = total % 1440;
      if (t < 0) t += 1440;
      
      let h = Math.floor(t / 60);
      let m = Math.floor(t % 60);
      
      // Angles
      // Minute: t * 6 deg
      const mAngle = t * 6;
      // Hour: t * 0.5 deg (360 deg / 12 hours = 30 deg/hr; 30 deg / 60 min = 0.5 deg/min)
      const hAngle = t * 0.5;
      
      const digital = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      const timeData = convertToKoreanTime(t);
      
      this.setData({
          totalMinutes: t,
          hourAngle: hAngle,
          minuteAngle: mAngle,
          digitalTime: digital,
          koreanTime: timeData.text,
          currentAudioParts: timeData.audioParts // Store for playback
      });
  },

  onTouchStart(e) {
      this.stopLiveClock(); // User interaction stops auto-update
      const touch = e.touches[0];
      const cx = this.data.clockCenter.x;
      const cy = this.data.clockCenter.y;
      
      // If measureClock failed or page scrolled, this might be off.
      // Ideally re-measure? But it's heavy. Assuming no scroll or static layout.
      
      const x = touch.clientX - cx;
      const y = touch.clientY - cy;
      
      // Distance
      const dist = Math.sqrt(x*x + y*y);
      const r = this.data.clockRadius || 150; 
      
      // Determine target
      let target = 'minute'; // default
      // If closer to center, control hour hand
      if (dist < r * 0.5) {
          target = 'hour';
      }
      
      // Calculate initial angle
      // atan2(y, x) returns angle in radians from X axis.
      // Clock 12:00 is -Y axis (or -90 deg from X).
      // Let's convert to degrees + 90 to match clock (0 at 12:00).
      const angle = Math.atan2(y, x) * 180 / Math.PI + 90;
      
      this.setData({
          isDragging: target,
          lastAngle: angle
      });
  },
  
  onTouchMove(e) {
      if (!this.data.isDragging) return;
      
      const touch = e.touches[0];
      const cx = this.data.clockCenter.x;
      const cy = this.data.clockCenter.y;
      const x = touch.clientX - cx;
      const y = touch.clientY - cy;
      
      let angle = Math.atan2(y, x) * 180 / Math.PI + 90;
      
      // Calculate delta
      let delta = angle - this.data.lastAngle;
      
      // Handle wrap around (e.g. 359 -> 1, delta = -358, should be +2)
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      
      let currentTotal = this.data.totalMinutes;
      
      if (this.data.isDragging === 'minute') {
          // 6 deg = 1 min
          currentTotal += delta / 6;
      } else {
          // 0.5 deg = 1 min
          currentTotal += delta / 0.5;
      }
      
      this.updateFromTotalMinutes(currentTotal);
      
      this.setData({
          lastAngle: angle
      });
  },
  
  onTouchEnd() {
      this.setData({ isDragging: null });
      // Snap to nearest minute
      const t = Math.round(this.data.totalMinutes);
      this.updateFromTotalMinutes(t);
  },
  
  playTTS() {
    this.stopLiveClock(); // User interaction stops auto-update
    
    if (!this.data.currentAudioParts || this.data.currentAudioParts.length === 0) {
        return;
    }
    
    // Increment playback ID to cancel any running sequence
    this._playbackId++;
    const currentId = this._playbackId;

    // Stop any current playback immediately
    if (this._audioCtx) {
        this._audioCtx.stop();
    }
    
    const parts = this.data.currentAudioParts;
    let index = 0;
    
    const playNext = () => {
        // Check if this sequence is still valid
        if (currentId !== this._playbackId) {
            return;
        }

        if (index >= parts.length) {
            return;
        }
        
        const text = parts[index];
        this.playSinglePart(text).then(() => {
            index++;
            playNext();
        }).catch((err) => {
            console.error('Failed to play part:', text, err);
            // Continue to next part even if failed
            index++;
            playNext();
        });
    };
    
    playNext();
  },

  playSinglePart(text) {
      const urls = getAudioUrlCandidates(text);
      if (!this._audioCtx) {
          this._audioCtx = wx.createInnerAudioContext();
      }
      return this.playWithFallback(this._audioCtx, urls, text);
  },

  playSrcOnce(audioCtx, src, cacheKey, originalUrl) {
    return new Promise((resolve) => {
        const logPrefix = `[PlaySrcOnce:${cacheKey || 'temp'}]`;
        console.log(logPrefix, 'Start request:', src);
        
        let settled = false;
        let started = false;
        let retryTimer = null;
        let failTimer = null;

        const cleanup = () => {
            if (retryTimer) clearTimeout(retryTimer);
            if (failTimer) clearTimeout(failTimer);
            audioCtx.offCanplay(onCanplay);
            audioCtx.offPlay(onPlay);
            audioCtx.offWaiting(onWaiting);
            audioCtx.offEnded(onEnded);
            audioCtx.offError(onError);
        };

        const settle = (success) => {
            if (settled) return;
            settled = true;
            cleanup();
            if (success) {
                console.log(logPrefix, 'Settled: Success');
            } else {
                console.log(logPrefix, 'Settled: Failed');
            }
            resolve(success);
        };

        const onCanplay = () => {
            console.log(logPrefix, 'onCanplay');
            // Some Android devices need manual play here?
            // audioCtx.play(); 
        };

        const onPlay = () => {
            console.log(logPrefix, 'onPlay (Started)');
            started = true;
            if (retryTimer) clearTimeout(retryTimer);
        };

        const onWaiting = () => {
            console.log(logPrefix, 'onWaiting');
        };

        const onEnded = () => {
            console.log(logPrefix, 'onEnded');
            settle(true);
        };

        const onError = (err) => {
            console.error(logPrefix, 'onError', err);
            settle(false);
        };

        audioCtx.onEnded(onEnded);
        audioCtx.onError(onError);
        if (audioCtx.onCanplay) audioCtx.onCanplay(onCanplay);
        if (audioCtx.onPlay) audioCtx.onPlay(onPlay);
        if (audioCtx.onWaiting) audioCtx.onWaiting(onWaiting);

        // Ensure autoplay is off to manually control playback
        audioCtx.autoplay = false;
        audioCtx.src = src;
        
        const attemptPlay = () => {
            try {
                console.log(logPrefix, 'Calling audioCtx.play()');
                audioCtx.play();
            } catch (e) {
                console.error(logPrefix, 'Play exception:', e);
            }
        };
        
        // Manual play triggers loading
        attemptPlay();

        // Timeout Logic
        // If it's a local file, we expect it to be fast. If it stalls, it's likely corrupt or context issue.
        // If it's network, it might take longer.
        const isLocal = src.startsWith('http://usr/') || src.startsWith('wxfile://') || src.startsWith('/');
        const retryDelay = isLocal ? 500 : 1500; // 500ms for local, 1.5s for network warning

        retryTimer = setTimeout(() => {
            if (settled || started) return;
            console.warn(logPrefix, 'Retry timeout triggered. isLocal:', isLocal);
            
            if (isLocal) {
                // Fail fast for local files so we can fallback to network
                console.warn(logPrefix, 'Local file timeout -> Fail immediately to trigger fallback');
                settle(false);
            } else {
                // For network, try one more time or just wait for overall timeout
                attemptPlay();
            }
        }, retryDelay);

        failTimer = setTimeout(() => {
            if (settled || started) return;
            console.error(logPrefix, 'Overall timeout:', src);
            settle(false);
        }, 5000); // 5s overall safety
    });
  },

  async playWithFallback(audioCtx, urls, cacheKey) {
    if (!audioCtx || !urls || urls.length === 0) return Promise.reject('No URLs');

    for (const url of urls) {
        if (!url) continue;
        console.log('[PlayFallback] Trying url:', url);
        const ok = await this.playSrcOnce(audioCtx, url, cacheKey, url);
        if (ok) {
            console.log('[PlayFallback] Success:', url);
            return Promise.resolve();
        }
    }

    console.error('[PlayFallback] All failed:', urls);
    return Promise.reject('All candidates failed');
  },

  preloadAudio(text) {
      if (!text) return;
      // Preload the primary candidate (Manual NFD)
      const candidates = getAudioUrlCandidates(text);
      if (!candidates || candidates.length === 0) return;
      
      const url = candidates[0];
      
      // Use wx.downloadFile to cache
      wx.downloadFile({
          url: url,
          success: (res) => {
              console.log(`Preloaded ${text}: ${res.tempFilePath}`);
          },
          fail: (err) => {
              console.error(`Failed to preload ${text}`, err);
          }
      });
  },

  preloadCurrentPeriodAndHour() {
      // Preload current period and hour as requested by user
      if (this.data.currentAudioParts && this.data.currentAudioParts.length >= 2) {
          // Typically [Period, Hour, Minute]
          this.preloadAudio(this.data.currentAudioParts[0]); // Period
          this.preloadAudio(this.data.currentAudioParts[1]); // Hour
      } else if (this.data.currentAudioParts && this.data.currentAudioParts.length === 1) {
          // Exact time (Noon/Midnight)
          this.preloadAudio(this.data.currentAudioParts[0]);
      }
  },
});
