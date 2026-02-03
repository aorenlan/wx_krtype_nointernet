const NATIVE_HOURS = [
  "", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열", "열한", "열두"
];

const SINO_TENS = ["", "십", "이십", "삼십", "사십", "오십"];
const SINO_UNITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

// Helper for Sino-Korean Numbers (Supports large numbers)
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

function numberToSinoAudioParts(num) {
  if (num === 0) return ["영"];
  if (!isFinite(num) || isNaN(num)) return [];

  const parts = [];
  if (num < 0) {
      parts.push("마이너스");
      num = Math.abs(num);
  }

  const digits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const smallUnits = ["", "십", "백", "천"];
  const bigUnits = ["", "만", "억", "조"];
  const combinedTens = ["", "십", "이십", "삼십", "사십", "오십", "육십", "칠십", "팔십", "구십"];

  const s = String(Math.floor(num));
  const chunkCount = Math.ceil(s.length / 4);

  for (let i = chunkCount - 1; i >= 0; i--) {
      let start = s.length - (i + 1) * 4;
      let end = s.length - i * 4;
      if (start < 0) start = 0;
      let chunk = s.substring(start, end);
      let chunkNum = parseInt(chunk, 10);
      
      if (chunkNum === 0) continue;
      
      let chunkParts = [];
      
      for (let j = 0; j < chunk.length; j++) {
          let d = parseInt(chunk[j], 10);
          let power = chunk.length - 1 - j;
          
          if (d !== 0) {
              if (power === 1) {
                  // Use combined tens (e.g., "이십", "삼십")
                  chunkParts.push(combinedTens[d]);
              } else {
                  if (d === 1 && power > 0) {
                      // Skip '일' for 100, 1000 (10 is handled by combinedTens)
                  } else {
                      chunkParts.push(digits[d]);
                  }
                  
                  if (power > 0) {
                      chunkParts.push(smallUnits[power]);
                  }
              }
          }
      }
      
      parts.push(...chunkParts);
      
      if (i > 0) {
          // Check if it's 10000 (man) -> we need to decide if we output "일만" or "만".
          // Standard is "만".
          // If the chunk was 1 (meaning 10000), parts so far for this chunk is empty (since we skipped '일' above? No.)
          // Wait, if chunk is "1", d=1, power=0.
          // In loop: d=1, power=0. digits[1]="일". chunkParts.push("일").
          // So we have "일".
          // Then we push "만". Result "일만".
          // But Koreans usually say "만" for 10000 at start, but "일만" sometimes?
          // numberToSinoKorean has logic: if (i === 1 && chunkNum === 1) chunkText = "";
          // Let's replicate that.
          
          if (i === 1 && chunkNum === 1 && chunkParts.length === 1 && chunkParts[0] === "일") {
               // Remove "일" to just have "만"
               parts.pop();
          }
          parts.push(bigUnits[i]);
      }
  }
  
  return parts;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

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

const BASE_AUDIO_URL = 'https://enoss.aorenlan.fun/kr_color_count/';
const CLOCK_AUDIO_BASE_URL = 'https://enoss.aorenlan.fun/kr_time/minute/';
const DATE_AUDIO_BASE_URL = 'https://enoss.aorenlan.fun/kr_time/calendar/';
const UNIT_AUDIO_BASE_URL = 'https://enoss.aorenlan.fun/kr_time/unit/';

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

function getAudioUrlCandidates(text, baseUrlOverride) {
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

  // Use override if provided, otherwise default
  let baseUrl = baseUrlOverride || BASE_AUDIO_URL;

  // Deduplicate and map to full URLs
  const uniqueNames = Array.from(new Set(candidates));
  return uniqueNames.map(name => `${baseUrl}${percentEncodeUtf8(name)}.mp3`);
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
  // Use combined hour audio (e.g. "한시")
  const hourAudio = NATIVE_HOURS[displayH] + "시";
  
  if (m === 0) {
    return { 
        text: `${prefix} ${hourPart}`,
        audioParts: [prefix, hourAudio]
    };
  }
  
  const minPart = m === 30 ? "반" : getSinoMinutes(m) + " 분";
  if (m === 30) {
      // Use combined hour+half audio (e.g. "한시_반")
      // User requested consistency: "세시_반.mp3"
      audioParts.push(hourAudio + "_반"); 
  } else {
      audioParts.push(hourAudio);
      // Use combined minute audio (e.g. "이십삼분")
      // User requested single file: "오십분.mp3"
      const minNumStr = numberToSinoKorean(m).replace(/\s+/g, '');
      audioParts.push(minNumStr + "분");
  }

  return { 
      text: `${prefix} ${hourPart} ${minPart}`,
      audioParts: audioParts
  };
}

Page({
  data: {
    activeTab: 0, // 0: Clock, 1: Date, 2: Calculator

    // Clock Data
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
    lastAngle: 0,

    // Date Data
    years: [],
    months: [],
    days: [],
    dateValue: [0, 0, 0], // Index in picker
    selectedYear: 2023,
    selectedMonth: 1,
    selectedDay: 1,
    koreanDate: '',
    
    // Calculator Data
    calcDisplay: '0',
    calcResult: null,
    calcOperator: null,
    calcWaitingForSecondOperand: false,
    koreanCalc: '',
    
    // Unit Data (Height, Weight, Temperature) - DEPRECATED
    // unitOptions: [
    //     { name: '温度', code: '도' },
    //     { name: '体重', code: '킬로그램' },
    //     { name: '身高', code: '센티미터' }
    // ],
    // currentUnitIndex: 0
  },
  
  onLoad() {
    // Initialize Date Data
    const years = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    for (let i = 1900; i <= 2100; i++) {
        years.push(i);
    }
    const months = Array.from({length: 12}, (_, i) => i + 1);
    
    const yearIdx = years.indexOf(currentYear);
    const monthIdx = now.getMonth();
    const maxDays = getDaysInMonth(currentYear, monthIdx + 1);
    const days = Array.from({length: maxDays}, (_, i) => i + 1);
    const dayIdx = Math.min(now.getDate() - 1, maxDays - 1);

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
        navBarHeight: app.globalData.navBarHeight,
        years,
        months,
        days,
        dateValue: [yearIdx, monthIdx, dayIdx],
        selectedYear: currentYear,
        selectedMonth: monthIdx + 1,
        selectedDay: dayIdx + 1
    });

    // Start live clock on load
    this.startLiveClock();
    this.updateDateKorean();
    
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

  switchTab(e) {
      const idx = Number(e.currentTarget.dataset.index);
      this.setData({ activeTab: idx });
      if (idx === 0) {
          this.startLiveClock();
      } else {
          this.stopLiveClock();
      }
  },

  // --- Clock Methods ---

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
    console.log('[playTTS] Triggered. ActiveTab:', this.data.activeTab);
    this.stopLiveClock(); // User interaction stops auto-update
    
    // Determine parts based on active tab
    let parts = [];
    let baseUrl = BASE_AUDIO_URL;

    if (this.data.activeTab === 0) {
        parts = this.data.currentAudioParts;
        baseUrl = CLOCK_AUDIO_BASE_URL;
    } else if (this.data.activeTab === 1) {
        parts = this.getDateAudioParts();
        baseUrl = DATE_AUDIO_BASE_URL;
    } 
    // Tab 2 (Calculator/Unit) is removed


    console.log('[playTTS] Parts:', parts, 'BaseURL:', baseUrl);

    if (!parts || parts.length === 0) {
        return;
    }
    
    // Increment playback ID to cancel any running sequence
    this._playbackId++;
    const currentId = this._playbackId;

    // Stop any current playback immediately
    if (this._audioCtx) {
        this._audioCtx.stop();
    }
    
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
        this.playSinglePart(text, baseUrl).then(() => {
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

  playSinglePart(text, baseUrl) {
      console.log('[playSinglePart] Preparing to play:', text, 'BaseUrl:', baseUrl);
      const urls = getAudioUrlCandidates(text, baseUrl);
      console.log('[playSinglePart] Candidate URLs:', urls);
      
      if (!this._audioCtx) {
          this._audioCtx = wx.createInnerAudioContext();
      }
      return this.playWithFallback(this._audioCtx, urls, text);
  },

  playWithFallback(audioCtx, urls, text) {
    return new Promise((resolve, reject) => {
        // Just try the first URL for now, or loop if we really want fallback
        // Since we map all candidates to the same base URL pattern, they usually point to same file if naming is consistent.
        // We can try sequential if needed.
        
        console.log('[playWithFallback] URLs to try:', urls.length);

        let urlIndex = 0;
        
        const tryNext = () => {
            if (urlIndex >= urls.length) {
                // All failed
                console.error('[playWithFallback] All URLs failed for:', text);
                reject(new Error('All URLs failed'));
                return;
            }
            
            const url = urls[urlIndex];
            console.log(`[playWithFallback] Attempting [${urlIndex + 1}/${urls.length}]:`, url);
            
            this.playSrcOnce(audioCtx, url, text + '_' + urlIndex, url).then((success) => {
                if (success) {
                    console.log('[playWithFallback] Success:', url);
                    resolve();
                } else {
                    console.warn('[playWithFallback] Failed:', url);
                    urlIndex++;
                    tryNext();
                }
            });
        };
        
        tryNext();
    });
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

        const onError = (res) => {
            console.error(logPrefix, 'onError', res);
            settle(false);
        };

        audioCtx.onCanplay(onCanplay);
        audioCtx.onPlay(onPlay);
        audioCtx.onWaiting(onWaiting);
        audioCtx.onEnded(onEnded);
        audioCtx.onError(onError);

        audioCtx.src = src;
        audioCtx.play();
        
        // Timeout
        failTimer = setTimeout(() => {
            if (!started) {
                console.warn(logPrefix, 'Timeout waiting for start');
                settle(false);
            }
        }, 3000); // 3s timeout to start
    });
  },
  
  preloadCurrentPeriodAndHour() {
      // Just a stub if needed
  },

  // --- Date Wheel Methods ---

  onDateChange(e) {
      const val = e.detail.value;
      const year = this.data.years[val[0]];
      const month = this.data.months[val[1]];

      const maxDays = getDaysInMonth(year, month);
      const days = Array.from({length: maxDays}, (_, i) => i + 1);
      const dayIdx = Math.min(val[2], maxDays - 1);
      const day = days[dayIdx];

      this.setData({
        days,
        dateValue: [val[0], val[1], dayIdx],
        selectedYear: year,
        selectedMonth: month,
        selectedDay: day
      });
      this.updateDateKorean();
  },

  updateDateKorean() {
      const { selectedYear, selectedMonth, selectedDay } = this.data;
      
      const yStr = numberToSinoKorean(selectedYear) + '년';
      
      // Month exceptions
      let mStr = numberToSinoKorean(selectedMonth);
      if (selectedMonth === 6) mStr = '유';
      if (selectedMonth === 10) mStr = '시';
      mStr += '월';
      
      const dStr = numberToSinoKorean(selectedDay) + '일';
      
      this.setData({
          koreanDate: `${yStr} ${mStr} ${dStr}`
      });
  },
  
  getDateAudioParts() {
      const { selectedYear, selectedMonth, selectedDay } = this.data;
      const parts = [];
      
      // Year
      // User request: Don't read one by one, use combined file (e.g., "이천이십삼년.mp3")
      const yearStr = numberToSinoKorean(selectedYear).replace(/\s+/g, '') + '년';
      parts.push(yearStr);
      
      // Month
      // Special pronunciations: 6 -> 유월, 10 -> 시월
      let monthNumStr = numberToSinoKorean(selectedMonth).replace(/\s+/g, '');
      if (selectedMonth === 6) monthNumStr = '유';
      if (selectedMonth === 10) monthNumStr = '시';
      parts.push(monthNumStr + '월');
      
      // Day
      const dayStr = numberToSinoKorean(selectedDay).replace(/\s+/g, '') + '일';
      parts.push(dayStr);
      
      return parts;
  },

  setRandomDate() {
      const years = this.data.years;
      const yearIdx = Math.floor(Math.random() * years.length);
      const year = years[yearIdx];

      const monthIdx = Math.floor(Math.random() * 12);
      const month = this.data.months[monthIdx];

      const maxDays = getDaysInMonth(year, month);
      const days = Array.from({length: maxDays}, (_, i) => i + 1);
      const dayIdx = Math.floor(Math.random() * maxDays);
      const day = days[dayIdx];

      this.setData({
          days,
          dateValue: [yearIdx, monthIdx, dayIdx],
          selectedYear: year,
          selectedMonth: month,
          selectedDay: day
      });
      this.updateDateKorean();
  },

  // --- Calculator Methods ---

  onCalcBtn(e) {
      const val = e.currentTarget.dataset.val;
      const { calcDisplay, calcWaitingForSecondOperand, calcResult, calcOperator } = this.data;

      if (['+', '-', '*', '/'].includes(val)) {
          this.setData({
              calcOperator: val,
              calcResult: parseFloat(calcDisplay),
              calcWaitingForSecondOperand: true
          });
          return;
      }

      if (val === '=') {
          if (calcOperator && !calcWaitingForSecondOperand) {
              const second = parseFloat(calcDisplay);
              let res = 0;
              if (calcOperator === '+') res = calcResult + second;
              else if (calcOperator === '-') res = calcResult - second;
              else if (calcOperator === '*') res = calcResult * second;
              else if (calcOperator === '/') res = calcResult / second;
              
              // Handle float precision simple fix
              res = Math.round(res * 100000000) / 100000000;

              this.setData({
                  calcDisplay: String(res),
                  calcResult: res,
                  calcOperator: null,
                  calcWaitingForSecondOperand: false
              });
              this.updateCalcKorean(res);
          }
          return;
      }

      if (val === 'C') {
          this.setData({
              calcDisplay: '0',
              calcResult: null,
              calcOperator: null,
              calcWaitingForSecondOperand: false,
              koreanCalc: ''
          });
          return;
      }
      
      if (val === '.') {
          let nextDisplay = calcDisplay;
          if (calcWaitingForSecondOperand) {
              nextDisplay = '0.';
              this.setData({
                  calcDisplay: nextDisplay,
                  calcWaitingForSecondOperand: false
              });
          } else if (!calcDisplay.includes('.')) {
              nextDisplay = calcDisplay + '.';
              this.setData({ calcDisplay: nextDisplay });
          }
          this.updateCalcKorean(parseFloat(nextDisplay));
          return;
      }

      // Numbers
      let nextDisplay = calcDisplay;
      if (calcWaitingForSecondOperand) {
          nextDisplay = val;
          this.setData({
              calcDisplay: nextDisplay,
              calcWaitingForSecondOperand: false
          });
      } else {
          nextDisplay = calcDisplay === '0' ? val : calcDisplay + val;
          this.setData({ calcDisplay: nextDisplay });
      }

      this.updateCalcKorean(parseFloat(nextDisplay));
  },

  setRandomCalc() {
      const roll = Math.random();
      let len = 1;
      if (roll < 0.2) len = 1;
      else if (roll < 0.4) len = 2;
      else if (roll < 0.6) len = 3;
      else if (roll < 0.8) len = 4;
      else len = 5;

      let min = 0;
      let max = 9;
      if (len > 1) {
          min = Math.pow(10, len - 1);
          max = Math.pow(10, len) - 1;
      }
      const num = Math.floor(min + Math.random() * (max - min + 1));
      const display = String(num);
      this.setData({
          calcDisplay: display,
          calcResult: null,
          calcOperator: null,
          calcWaitingForSecondOperand: false
      });
      this.updateCalcKorean(num);
  },

  toggleUnit() {
      const { unitOptions, currentUnitIndex } = this.data;
      const nextIndex = (currentUnitIndex + 1) % unitOptions.length;
      this.setData({ currentUnitIndex: nextIndex });
      
      // Refresh display
      const val = this.data.calcResult !== null ? this.data.calcResult : parseFloat(this.data.calcDisplay);
      this.updateCalcKorean(val);
  },

  updateCalcKorean(num) {
      if (isNaN(num) || !isFinite(num)) {
          this.setData({ koreanCalc: '오류' });
          return;
      }
      
      const { unitOptions, currentUnitIndex } = this.data;
      const unit = unitOptions[currentUnitIndex];
      
      // Use helper but handle negative manually for text consistency if needed
      // numberToSinoKorean returns "마이너스 [num]"
      let text = numberToSinoKorean(num);
      
      // Append unit
      text += ' ' + unit.code;
      
      this.setData({ koreanCalc: text });
  },

  getCalcAudioParts() {
      const val = this.data.calcResult !== null ? this.data.calcResult : parseFloat(this.data.calcDisplay);
      if (isNaN(val) || !isFinite(val)) return [];
      
      const { unitOptions, currentUnitIndex } = this.data;
      const unit = unitOptions[currentUnitIndex];
      
      const absVal = Math.abs(val);
      const numStr = numberToSinoKorean(absVal).replace(/\s+/g, '');
      
      let filename = '';
      
      // Always use 마이너스 (Minus) for negative numbers as per user's file structure
      if (val < 0) {
           filename = `마이너스_${numStr}_${unit.code}`;
      } else {
           filename = `${numStr}_${unit.code}`;
      }
      
      console.log('[getCalcAudioParts] Generated filename:', filename);
      return [filename];
  }
});
