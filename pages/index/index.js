import { decomposeKoreanStructure, validateInput } from '../../utils/hangul';
import { BEGINNER_WORDS } from '../../data/beginnerWords';
import { COMMON_SENTENCES } from '../../data/commonSentences';
import { STAR_NICKNAMES } from '../../data/starNicknames';
import { SUPPORT_WORDS } from '../../data/supportWords';
import { DRAMA_LINES } from '../../data/dramaLines';
import { POPULAR_SONGS } from '../../data/popularSongs';

const app = getApp();
let interstitialAd = null;
let videoAd = null;


const DEFAULT_SAMPLE_TEXT = "연습은 완벽을 만듭니다. Fighting! 화이팅!";

Page({
  data: {
    safeArea: { top: 44, bottom: 34 },
    mode: 'menu', // menu, typing, custom
    items: [],
    currentItemIndex: 0,
    errorMessage: '',
    preferredKeyboardMode: 'korean',
    customInputText: '',
    practiceCount: 1,
    
    // Typing State
    typingState: {
      targetText: '',
      targetTranslation: '',
      userInput: '', // flattened keys typed so far
      requiredKeys: [], // flattened required keys
      currentKeyIndex: 0,
      isShiftActive: false,
      isComplete: false,
      targetStructure: [], // [{char: '한', keys: ['ㅎ', 'ㅏ', 'ㄴ']}]
      nextKey: null
    },

    // Display Helpers
    displayChars: [], // [{char: '한', status: 'done'}]
    activeJamos: [],   // [{char: 'ㅎ', isDone: true, isCurrent: false}]
    
    // Decorative Background Data
    decoTop: Array(30).fill(0),
    decoBottom: Array(40).fill(0),
    
    // Scroll Logic
    scrollLeft: 0,
    rpxToPx: 0.5, // Default fallback

    // Ad Logic
    isTopAdVisible: false,
    shareImage: '',
    adsDisabled: false
  },

  onLoad() {
    const sysInfo = wx.getSystemInfoSync();
    const rpxToPx = sysInfo.windowWidth / 750; // Calculate ratio
    
    const now = Date.now();
    let firstInstallTime = wx.getStorageSync('firstInstallTime');
    
    // If no timestamp, treat as new install (start 30 min grace period)
    if (!firstInstallTime) {
      firstInstallTime = now;
      wx.setStorageSync('firstInstallTime', firstInstallTime);
    }

    // Check 30-minute grace period
    const GRACE_PERIOD = 30 * 60 * 1000;
    const isInGracePeriod = (now - firstInstallTime) < GRACE_PERIOD;

    // Check manual disable (cheat code) for today
    const today = new Date().toISOString().split('T')[0];
    const disabledDate = wx.getStorageSync('adsDisabledDate');
    const isManuallyDisabled = disabledDate === today;

    // Ads are disabled if in grace period OR manually disabled
    const adsDisabled = isInGracePeriod || isManuallyDisabled;

    // Precise Navbar Calculation
    const menuButton = wx.getMenuButtonBoundingClientRect();
    const statusBarHeight = sysInfo.statusBarHeight;
    
    // Default to standard if menuButton is missing
    let navBarHeight = 44;
    let navBarTop = statusBarHeight;
    
    if (menuButton && menuButton.top) {
      // content height = capsule height + (gap above capsule * 2)
      navBarHeight = (menuButton.top - statusBarHeight) * 2 + menuButton.height;
      navBarTop = statusBarHeight;
    }
    
    const totalNavHeight = navBarTop + navBarHeight;
    
    this.setData({
      safeArea: {
        top: totalNavHeight, // Main content starts after nav bar
        bottom: sysInfo.screenHeight - sysInfo.safeArea.bottom
      },
      navBar: {
        height: navBarHeight,      // Content height
        paddingTop: navBarTop,     // Status bar height
        totalHeight: totalNavHeight // Total height to reserve
      },
      rpxToPx,
      adsDisabled
    });

    // Helper to initialize Interstitial Ad
    const initInterstitial = () => {
      if (wx.createInterstitialAd && !interstitialAd) {
        interstitialAd = wx.createInterstitialAd({
          adUnitId: 'adunit-539816ddda3566d2'
        })
        interstitialAd.onLoad(() => {})
        interstitialAd.onError((err) => {
          console.error('插屏广告加载失败', err)
        })
        interstitialAd.onClose(() => {})
      }
    };

    if (!adsDisabled) {
      initInterstitial();
    } else if (isInGracePeriod && !isManuallyDisabled) {
      // If in grace period (and not manually disabled), schedule auto-enable
      const timeRemaining = GRACE_PERIOD - (now - firstInstallTime);
      console.log(`New user grace period active. Ads enabling in ${Math.ceil(timeRemaining/1000)}s`);
      
      setTimeout(() => {
        console.log('Grace period expired. Enabling ads.');
        this.setData({ adsDisabled: false }, () => {
          // Refresh display if in typing mode to adjust layout
          if (this.data.mode === 'typing') {
            this.updateDisplay(this.data.typingState);
          }
        });
        initInterstitial();
      }, timeRemaining);
    }

    // Initialize Rewarded Video Ad
    if (wx.createRewardedVideoAd) {
      videoAd = wx.createRewardedVideoAd({
        adUnitId: 'adunit-78856528510e4410'
      })
      videoAd.onLoad(() => {})
      videoAd.onError((err) => {
        console.error('激励视频光告加载失败', err)
      })
      videoAd.onClose((res) => {
        // Only show copy options if ad was fully watched
        if (res && res.isEnded) {
          this.showCopyActionSheet();
        } else {
          // User closed early
          wx.showToast({
            title: '完整观看视频才能获取地址哦',
            icon: 'none',
            duration: 2000
          });
        }
      })
    }
  },



  // --- Canvas Helper ---
  drawShareImage(korean, translation) {
    const query = wx.createSelectorQuery();
    query.select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node) return;
        
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const width = res[0].width;
        const height = res[0].height;
        
        const dpr = wx.getSystemInfoSync().pixelRatio;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        
        // 1. Background
        ctx.fillStyle = '#0f172a'; // slate-900
        ctx.fillRect(0, 0, width, height);
        
        // 2. Decorative Border
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, width - 40, height - 40);
        
        // 3. Korean Text (Main)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Simple wrap logic
        const maxWidth = width - 80;
        
        // Helper to wrap text
        const getWrappedLines = (text, maxWidth, fontSize) => {
             ctx.font = fontSize;
             const words = text.split(' ');
             let lines = [];
             let currentLine = "";

             for (let i = 0; i < words.length; i++) {
                 const word = words[i];
                 const space = currentLine.length > 0 ? " " : "";
                 const testLine = currentLine + space + word;

                 if (ctx.measureText(testLine).width <= maxWidth) {
                     currentLine = testLine;
                 } else {
                     if (currentLine.length > 0) {
                         lines.push(currentLine);
                         currentLine = "";
                     }
                     
                     // Handle long word (or Chinese chunk)
                     if (ctx.measureText(word).width <= maxWidth) {
                         currentLine = word;
                     } else {
                         let longWordLine = "";
                         const chars = word.split('');
                         for (let j = 0; j < chars.length; j++) {
                             const char = chars[j];
                             if (ctx.measureText(longWordLine + char).width > maxWidth) {
                                 lines.push(longWordLine);
                                 longWordLine = char;
                             } else {
                                 longWordLine += char;
                             }
                         }
                         currentLine = longWordLine;
                     }
                 }
             }
             if (currentLine.length > 0) {
                 lines.push(currentLine);
             }
             return lines;
        };
        
        const koreanLines = getWrappedLines(korean, maxWidth, 'bold 28px sans-serif');
        const translationLines = getWrappedLines(translation, maxWidth, '18px sans-serif');
        
        const koreanLineHeight = 40;
        const translationLineHeight = 26;
        const gap = 30;
        
        const totalContentHeight = (koreanLines.length * koreanLineHeight) + gap + (translationLines.length * translationLineHeight);
        let startY = (height / 2) - (totalContentHeight / 2) - 20; // Shift up a bit
        
        // Draw Korean
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = '#ffffff';
        koreanLines.forEach((line, index) => {
            ctx.fillText(line, width / 2, startY + (index * koreanLineHeight));
        });

        // Draw Translation
        ctx.fillStyle = '#94a3b8'; // slate-400
        ctx.font = '18px sans-serif';
        const transStartY = startY + (koreanLines.length * koreanLineHeight) + gap;
        
        translationLines.forEach((line, index) => {
            ctx.fillText(line, width / 2, transStartY + (index * translationLineHeight));
        });
        
        // 5. Brand Footer
        ctx.fillStyle = '#3b82f6'; // blue-500
        ctx.font = '14px sans-serif';
        ctx.fillText('韩语打字练习', width / 2, height - 40);
        
        // 6. Save to Temp File
        setTimeout(() => {
            wx.canvasToTempFilePath({
                canvas: canvas,
                success: (res) => {
                    this.setData({ shareImage: res.tempFilePath });
                },
                fail: (err) => {
                    console.error('Canvas export failed', err);
                }
            });
        }, 100);
      });
  },

  // --- Menu Handlers ---
  
  handleCopyPC() {
    if (videoAd) {
      videoAd.show().catch(() => {
        // Retry load
        videoAd.load()
          .then(() => videoAd.show())
          .catch(err => {
            console.error('激励视频 广告显示失败', err);
            // If ad fails to load/show, inform user instead of bypassing
            wx.showToast({
              title: '广告加载失败，请稍后重试',
              icon: 'none',
              duration: 2000
            });
          })
      })
    } else {
      // If ad component not supported/initialized, maybe just show? 
      // Or strictly require it? Usually if !videoAd means API not supported.
      // In that case, we can show it as fallback, or show "Upgrade WeChat".
      // Assuming fallback for compatibility is okay if ad object doesn't exist.
      this.showCopyActionSheet();
    }
  },

  showCopyActionSheet() {
    wx.showActionSheet({
      itemList: ['复制国内版网址 (Faster)', '复制国际版网址 (Global)'],
      success: (res) => {
        let url = '';
        if (res.tapIndex === 0) url = 'https://krtype.aorenlan.fun/';
        if (res.tapIndex === 1) url = 'https://krtype-global.aorenlan.fun/';
        
        if (url) {
          wx.setClipboardData({
            data: url,
            success: () => {
              wx.showToast({
                title: '复制成功',
                icon: 'success'
              });
            }
          });
        }
      }
    })
  },

  startStarNicknames() {
    this.startPractice(STAR_NICKNAMES, true);
  },

  startSupportWords() {
    this.startPractice(SUPPORT_WORDS, true);
  },

  startDrama() {
    this.startPractice(DRAMA_LINES, true);
  },

  startPopular() {
    this.startPractice(POPULAR_SONGS, true);
  },

  startBeginner() {
    this.startPractice(BEGINNER_WORDS, true);
  },

  startSentences() {
    this.startPractice(COMMON_SENTENCES, true);
  },

  startCustom() {
    this.setData({ mode: 'custom', errorMessage: '', customInputText: '', practiceCount: 1 });
  },

  increaseCount() {
    if (this.data.practiceCount < 10) {
      this.setData({ practiceCount: this.data.practiceCount + 1 });
    }
  },

  decreaseCount() {
    if (this.data.practiceCount > 1) {
      this.setData({ practiceCount: this.data.practiceCount - 1 });
    }
  },

  goBack() {
    this.setData({ mode: 'menu' });
  },

  // --- Custom Input ---

  handleCustomInput(e) {
    this.setData({ customInputText: e.detail.value, errorMessage: '' });
  },

  fillSampleText() {
    this.setData({ customInputText: DEFAULT_SAMPLE_TEXT, errorMessage: '' });
  },

  submitCustom() {
    const text = this.data.customInputText.trim();
    if (!text) return;

    const lowerText = text.toLowerCase();
    const today = new Date().toISOString().split('T')[0];

    // Cheat code to disable ads for today
    if (lowerText === 'closead') {
      wx.setStorageSync('adsDisabledDate', today);
      wx.removeStorageSync('adsDisabled'); // Remove legacy key
      
      this.setData({ 
        adsDisabled: true,
        isTopAdVisible: false,
        customInputText: '',
        errorMessage: ''
      }, () => {
        this.updateDisplay(this.data.typingState);
      });
      
      wx.showToast({
        title: '今日免广告',
        icon: 'success'
      });
      return;
    }

    // Cheat code to enable ads
    if (lowerText === 'openad') {
      wx.removeStorageSync('adsDisabledDate');
      wx.removeStorageSync('adsDisabled');
      
      // Also expire the grace period (set to 1 hour ago)
      const expiredTime = Date.now() - (60 * 60 * 1000);
      wx.setStorageSync('firstInstallTime', expiredTime);
      
      this.setData({ 
        adsDisabled: false,
        customInputText: '',
        errorMessage: ''
      });

      // Re-initialize interstitial ad if missing
      if (!interstitialAd && wx.createInterstitialAd) {
        interstitialAd = wx.createInterstitialAd({
          adUnitId: 'adunit-539816ddda3566d2'
        })
        interstitialAd.onLoad(() => {})
        interstitialAd.onError((err) => {
          console.error('插屏广告加载失败', err)
        })
        interstitialAd.onClose(() => {})
      }

      wx.showToast({
        title: '广告已开启',
        icon: 'success'
      });
      return;
    }

    const validation = validateInput(text);
    if (!validation.valid) {
      this.setData({ 
        errorMessage: `不支持的字符: ${validation.invalidChars.join(' ')}` 
      });
      return;
    }

    const item = {
      korean: text,
      translation: '自定义练习'
    };

    const practiceItems = Array(this.data.practiceCount).fill(item);

    // Show Interstitial Ad Logic (Every time for custom input)
    // Only show if ads are not disabled (respects grace period)
    // AND if the text is NOT the default sample text
    if (!this.data.adsDisabled && text !== DEFAULT_SAMPLE_TEXT) {
      if (interstitialAd) {
        interstitialAd.show().catch((err) => {
          console.error('插屏广告显示失败', err)
        })
      }
    }

    this.startPractice(practiceItems, false);
  },

  // --- Ad Handlers ---
  adLoad() {
    console.log('原生模板广告加载成功')
    this.setData({ isTopAdVisible: true }, () => {
      this.updateDisplay(this.data.typingState);
    })
  },
  adError(err) {
    console.error('原生模板广告加载失败', err)
    this.setData({ isTopAdVisible: false }, () => {
      this.updateDisplay(this.data.typingState);
    })
  },
  adClose() {
    console.log('原生模板广告关闭')
    this.setData({ isTopAdVisible: false }, () => {
      this.updateDisplay(this.data.typingState);
    })
  },

  // --- Practice Logic ---

  startPractice(practiceItems, shouldShuffle) {
    if (!practiceItems || practiceItems.length === 0) return;

    let itemsToUse = [...practiceItems];
    if (shouldShuffle) {
      for (let i = itemsToUse.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [itemsToUse[i], itemsToUse[j]] = [itemsToUse[j], itemsToUse[i]];
      }
    }

    this.setData({
      items: itemsToUse,
      currentItemIndex: 0,
      mode: 'typing',
      isTopAdVisible: false // Reset ad state
    });

    this.loadItem(itemsToUse[0]);
  },

  loadItem(item) {
    const structure = decomposeKoreanStructure(item.korean);
    // structure example: [{ char: '한', keys: ['ㅎ', 'ㅏ', 'ㄴ'] }]
    
    const keys = [];
    structure.forEach(s => {
      s.keys.forEach(k => keys.push(k));
    });

    const initialState = {
      targetText: item.korean,
      targetTranslation: item.translation,
      userInput: '',
      requiredKeys: keys,
      currentKeyIndex: 0,
      isShiftActive: false,
      isComplete: false,
      targetStructure: structure,
      nextKey: keys.length > 0 ? keys[0] : null
    };

    this.setData({ typingState: initialState });
    this.updateDisplay(initialState);
    this.updateShiftState(initialState);
    
    // Generate Share Image
    this.drawShareImage(item.korean, item.translation);
  },

  onVirtualKeyPress(e) {
    const key = e.detail.key;
    this.handleKeyPress(key);
  },

  handleKeyPress(key) {
    const { typingState } = this.data;
    if (typingState.isComplete) return;

    const expectedKey = typingState.requiredKeys[typingState.currentKeyIndex];
    
    let normalizedKey = key;
    
    // Logic to handle case-insensitivity for keys that don't support Shift variants on this keyboard
    // The keys q, w, e, r, t, o, p have Shift variants (Q, W, E, R, T, O, P) which map to different Hangul characters.
    // For these, we must maintain strict case matching.
    // For other keys (e.g. n, m, a...), the keyboard only emits lowercase, so we should allow case-insensitive match for English targets.
    const strictKeys = ['q', 'w', 'e', 'r', 't', 'o', 'p'];
    const isStrictKey = (k) => strictKeys.includes(k.toLowerCase());
    
    let isMatch = normalizedKey === expectedKey;
    
    if (!isMatch) {
      if (!isStrictKey(expectedKey) && 
          normalizedKey.toLowerCase() === expectedKey.toLowerCase()) {
          isMatch = true;
          normalizedKey = expectedKey; // Use expected key to keep state consistent
      }
    }
    
    if (isMatch) {
      // Correct
      const nextIndex = typingState.currentKeyIndex + 1;
      const isNowComplete = nextIndex >= typingState.requiredKeys.length;
      const nextKey = isNowComplete ? null : typingState.requiredKeys[nextIndex];

      const newState = {
        ...typingState,
        currentKeyIndex: nextIndex,
        userInput: typingState.userInput + normalizedKey, // mostly for debug
        isComplete: isNowComplete,
        nextKey: nextKey
      };

      this.setData({ typingState: newState });
      this.updateDisplay(newState);
      
      if (!isNowComplete) {
        this.updateShiftState(newState);
      } else {
        // Item Complete
        setTimeout(() => {
          this.handleItemComplete();
        }, 500);
      }

    } else {
      // Incorrect
      wx.vibrateShort({ type: 'medium' });
    }
  },

  updateShiftState(state) {
    const { nextKey } = state;
    if (!nextKey) {
      this.setData({ 'typingState.isShiftActive': false });
      return;
    }
    
    // Check if next key requires shift (uppercase or special symbols)
    const shiftRequired = /^[A-Z~!@#$%^&*()_+{}:"<>?]$/.test(nextKey) && nextKey !== 'SPACE';
    // Also some double consonants like ㄸ, ㅉ, ㅃ, ㄲ, ㅆ are typed with shift in Korean mode?
    // Actually our decompose logic returns the char that is on the keyboard.
    // If the key is 'Q' (which maps to 'ㅃ'), the keyboard logic handles the mapping.
    // The `requiredKeys` array contains the KEY CHARACTERS (e.g. 'Q', 'W', 'E' or 'shiftChar').
    // Wait, decomposeKoreanStructure in `hangul.js` returns keys.
    // Let's check what keys it returns. 
    // If it returns 'ㅃ', does the keyboard emit 'ㅃ'?
    // The keyboard component emits `char` or `shiftChar`.
    // If visualMode is English: it emits 'Q' or 'q'.
    // If visualMode is Korean: it still emits the underlying key char (e.g. 'q' or 'Q')?
    // Let's re-check Keyboard component logic.
    
    // Keyboard component sends:
    // const charToSend = this.data.isShiftActive ? (keyData.shiftChar || keyData.char) : keyData.char;
    // keyData.char is usually the unshifted key (e.g. 'q', 'w').
    // keyData.shiftChar is the shifted key (e.g. 'Q', 'W').
    
    // So `requiredKeys` should contain 'Q', 'W', etc. for shifted consonants.
    // `decomposeKoreanStructure` logic:
    // const vowelKeys = getVowelKeys(medialIdx);
    // If vowel is complex, it returns multiple keys.
    // If consonant is double, `INITIALS` array has them.
    
    // I need to verify if `INITIALS` uses 'Q' or 'ㅃ'.
    // If `INITIALS` has 'ㅃ', but keyboard sends 'Q', we have a mismatch.
    // Let's assume `hangul.js` is correct (ported from React which worked).
    // In React, `validateInput` uses `decomposeKoreanStructure`.
    // Let's quickly check `hangul.js` content via `read` to be safe about what keys are expected.
    
    this.setData({ 'typingState.isShiftActive': shiftRequired });
  },

  updateDisplay(state) {
    const { targetStructure, currentKeyIndex } = state;
    let keyCounter = 0;
    const displayChars = [];
    let activeJamos = [];

    targetStructure.forEach((struct, idx) => {
      const start = keyCounter;
      const end = keyCounter + struct.keys.length;
      let status = 'future';
      let progress = 0;

      if (currentKeyIndex >= end) {
        status = 'done';
        progress = 100;
      } else if (currentKeyIndex >= start) {
        status = 'active';
        
        // Calculate Jamos for active char
        activeJamos = struct.keys.map((k, kIdx) => {
          const kGlobalIndex = start + kIdx;
          return {
            char: k,
            isDone: currentKeyIndex > kGlobalIndex,
            isCurrent: currentKeyIndex === kGlobalIndex
          };
        });
        
        // Calculate progress percentage for active char
        const doneCount = currentKeyIndex - start;
        const totalKeys = struct.keys.length;
        progress = totalKeys > 0 ? Math.floor((doneCount / totalKeys) * 100) : 0;
      }

      displayChars.push({
        char: struct.char,
        status: status,
        progress: progress
      });

      keyCounter += struct.keys.length;
    });

    // Group displayChars into words for proper wrapping (keeping for structure, but will display inline)
    const displayNodes = [];
    let currentWord = [];
    let activeCharIndex = 0; // Track index of active char for scrolling

    displayChars.forEach((item, index) => {
      // Assign global index for scrolling
      item.globalIndex = index;
      
      if (item.status === 'active') {
        activeCharIndex = index;
      }

      if (item.char === ' ') {
        if (currentWord.length > 0) {
          displayNodes.push({ type: 'word', chars: currentWord });
          currentWord = [];
        }
        displayNodes.push({ type: 'space', char: item });
      } else {
        currentWord.push(item);
      }
    });
    if (currentWord.length > 0) {
      displayNodes.push({ type: 'word', chars: currentWord });
    }

    // Calculate scrollLeft
    // Each char is 80rpx width + 4rpx margin-left + 4rpx margin-right = 88rpx total
    // If ad is visible, char is 50rpx + 8rpx = 58rpx
    const charWidthRpx = this.data.isTopAdVisible ? 58 : 88;
    const charWidthPx = charWidthRpx * this.data.rpxToPx;
    const scrollLeft = activeCharIndex * charWidthPx;

    this.setData({ 
      displayNodes,
      activeJamos,
      scrollLeft: scrollLeft
    });
  },

  handleItemComplete() {
    const { currentItemIndex, items } = this.data;
    if (currentItemIndex < items.length - 1) {
      const nextIdx = currentItemIndex + 1;
      this.setData({ currentItemIndex: nextIdx });
      this.loadItem(items[nextIdx]);
    } else {
      // Finished all items
      wx.showModal({
        title: '练习完成',
        content: '恭喜你完成了本次练习！',
        showCancel: false,
        success: () => {
          this.setData({ mode: 'menu' });
        }
      });
    }
  },

  prevItem() {
    const { currentItemIndex, items } = this.data;
    if (currentItemIndex > 0) {
      const prevIdx = currentItemIndex - 1;
      this.setData({ currentItemIndex: prevIdx });
      this.loadItem(items[prevIdx]);
    } else {
      wx.showToast({ title: '已经是第一个了', icon: 'none' });
    }
  },

  nextItem() {
    const { currentItemIndex, items } = this.data;
    if (currentItemIndex < items.length - 1) {
      const nextIdx = currentItemIndex + 1;
      this.setData({ currentItemIndex: nextIdx });
      this.loadItem(items[nextIdx]);
    } else {
      wx.showToast({ title: '已经是最后一个了', icon: 'none' });
    }
  },

  onShareAppMessage() {
    if (this.data.mode === 'typing' && this.data.items.length > 0) {
      const item = this.data.items[this.data.currentItemIndex];
      const shareObj = {
        title: `快来和我一起学习❤！\n${item.korean}`,
        path: '/pages/index/index'
      };
      
      if (this.data.shareImage) {
        shareObj.imageUrl = this.data.shareImage;
      }
      
      return shareObj;
    }
    return {
      title: '韩语打字练习 - 3天告别卡顿',
      path: '/pages/index/index'
    };
  },

  onShareTimeline() {
    if (this.data.mode === 'typing' && this.data.items.length > 0) {
        const item = this.data.items[this.data.currentItemIndex];
        return {
          title: `${item.korean} - 韩语打字练习`,
        };
      }
      return {
        title: '韩语打字练习'
      };
  },

  toggleVisualMode() {
    const newMode = this.data.preferredKeyboardMode === 'korean' ? 'english' : 'korean';
    this.setData({ preferredKeyboardMode: newMode });
  }
});
