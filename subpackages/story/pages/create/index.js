
import { getWords } from '../../../../utils_nv/api';
import { STORY_PRESETS } from '../../../../data/story_presets';
import { createAiModel, streamAi, parseStreamedOutput } from '../../../../utils_nv/ai_helper';

let GRAMMAR_DATA = [];
try {
  GRAMMAR_DATA = require('../../data/grammar.js');
} catch (e) {
  console.error('Failed to load grammar data', e);
}

Page({
  data: {
    navBarHeight: 44,
    statusBarHeight: 20,
    characterName: '',
    pickerColumns: [],
    pickerValue: [0, 0, 0],
    isGenerating: false,
    generated: false,
    
    // Result
    segments: [], // {korean: '', chinese: '', displayKorean: []}
    wordsSection: '',
    grammarSection: '',
    
    currentSegmentIndex: 0,
    
    // Elements for title
    elements: null
  },

  onLoad(options) {
    const columns = [
      STORY_PRESETS.times,
      STORY_PRESETS.contexts,
      STORY_PRESETS.actions
    ];
    this.setData({ pickerColumns: columns });
    
    // Handle parameters from "Generate Same Style"
    if (options && (options.who || options.when || options.where || options.action)) {
      const { who, when, where, action } = options;
      
      let tIdx = 0, pIdx = 0, aIdx = 0;
      
      if (when) {
        const idx = STORY_PRESETS.times.indexOf(when);
        if (idx > -1) tIdx = idx;
      }
      if (where) {
        const idx = STORY_PRESETS.contexts.indexOf(where);
        if (idx > -1) pIdx = idx;
      }
      if (action) {
        const idx = STORY_PRESETS.actions.indexOf(action);
        if (idx > -1) aIdx = idx;
      }
      
      this.setData({
        characterName: who || '',
        pickerValue: [tIdx, pIdx, aIdx]
      });
    }
    
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: windowInfo.statusBarHeight || 20,
      navBarHeight: 44 // Approximate
    });
    
    this._aiModel = createAiModel();
    
    // 初始化广告
    this._initAds();
  },

  _initAds() {
    // Interstitial Ad
    if (wx.createInterstitialAd) {
      this._interstitialAd = wx.createInterstitialAd({
        adUnitId: 'adunit-056745acff976dd3'
      });
      this._interstitialAd.onLoad(() => {});
      this._interstitialAd.onError((err) => {
        console.error('插屏广告加载失败', err);
      });
      this._interstitialAd.onClose(() => {});
    }

    // Rewarded Video Ad
    if (wx.createRewardedVideoAd) {
      this._videoAd = wx.createRewardedVideoAd({
        adUnitId: 'adunit-bb054aa48d4c2ce5'
      });
      this._videoAd.onLoad(() => {});
      this._videoAd.onError((err) => {
        console.error('激励视频广告加载失败', err);
      });
      // Handle close event in show logic to ensure context
      // But we can set a global handler if needed, though local is safer for logic flow
    }
  },

  getDailyStoryCount() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const key = `story_gen_count_${today}`;
    return wx.getStorageSync(key) || 0;
  },

  incrementDailyStoryCount() {
    const today = new Date().toISOString().slice(0, 10);
    const key = `story_gen_count_${today}`;
    const count = this.getDailyStoryCount();
    wx.setStorageSync(key, count + 1);
  },

  onInputName(e) {
    this.setData({ characterName: e.detail.value });
  },

  onPickerChange(e) {
    this.setData({ pickerValue: e.detail.value });
  },

  randomize() {
    if (this.data.isGenerating) return;
    
    const columns = this.data.pickerColumns;
    if (!columns || !columns.length) return;
    
    // Slot machine effect
    let count = 0;
    const maxCount = 10;
    const interval = 80; // ms
    
    const timer = setInterval(() => {
      const v1 = Math.floor(Math.random() * columns[0].length);
      const v2 = Math.floor(Math.random() * columns[1].length);
      const v3 = Math.floor(Math.random() * columns[2].length);
      
      this.setData({
        pickerValue: [v1, v2, v3]
      });
      
      count++;
      if (count >= maxCount) {
        clearInterval(timer);
      }
    }, interval);
  },

  cleanText(text) {
    if (!text) return '';
    // Filter out common streaming artifacts like "==", "***", "==="
    // But preserve meaningful markdown like "**word**" if it's complete
    // We only want to hide "unfinished" markers at the end
    
    // 1. Remove trailing partial markers
    let cleaned = text.replace(/\s*={1,}$/, ''); // Remove trailing =
    cleaned = cleaned.replace(/\s*\*{1,}$/, ''); // Remove trailing *
    
    // 2. If it ends with open markdown "**word", we keep it, but if it's just "**", maybe hide it?
    // Actually, parseMarkdown handles "**" cleanly (treats as plain text if not closed).
    // The main issue is "===" markers appearing in the text.
    
    // Remove explicit markers if they leak into the content (though parser should handle this)
    cleaned = cleaned.replace(/={3,}[A-Z_]*={0,}/g, '');
    
    return cleaned;
  },

  parseMarkdown(text) {
    // Robust parsing for **text**
    // 1. Handle potential spacing around ** like " ** text ** "
    // 2. Ensure we capture the content correctly
    if (!text) return [];
    
    const cleanedText = this.cleanText(text);
    
    // Normalize spaces around markers if they are messy (e.g. AI output quirks)
    // but be careful not to merge words.
    // Generally standard split is safer: /(\*\*.*?\*\*)/g
    
    const parts = cleanedText.split(/(\*\*.*?\*\*)/g);
    return parts.map(part => {
      const trimmed = part; 
      // Check if it matches **content** structure
      if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length >= 4) {
        return { text: trimmed.slice(2, -2).trim(), bold: true };
      }
      return { text: trimmed, bold: false };
    });
  },

  validateContent(data) {
    const { segments, words, grammar } = data;
    
    // 1. Check for Chinese in Korean segments (excluding names which might be tricky, but generally mostly Hangul)
    // Using a simple ratio or presence check. Hangul range: \uAC00-\uD7AF
    // Chinese range: \u4E00-\u9FFF
    // We allow some Chinese if it's very little (maybe names?), but if a sentence is mostly Chinese, it's wrong.
    
    for (const seg of segments) {
        const kr = seg.korean || '';
        const chineseChars = (kr.match(/[\u4E00-\u9FFF]/g) || []).length;
        const hangulChars = (kr.match(/[\uAC00-\uD7AF]/g) || []).length;
        
        // If Chinese characters are present and significant compared to Hangul (e.g. > 10% or just > 0 if strict)
        // Let's be semi-strict: if there are Chinese characters, warn unless very few (names)
        if (chineseChars > 0) {
             // If more than 2 Chinese characters, it's suspicious for a beginner story
             if (chineseChars > 2) return { valid: false, reason: '韩语段落包含中文' };
        }
        
        // Check for malformed grammar patterns (e.g. 오/소/구려, 었-소)
        // Look for Hangul followed by / or - followed by Hangul
        // Also check for parentheses usage like 먹(으)니까 which implies option listing
        if (/[\uAC00-\uD7AF]+[\/\-][\uAC00-\uD7AF]+/.test(kr) || /[\uAC00-\uD7AF]+\([\uAC00-\uD7AF]+\)[\uAC00-\uD7AF]*/.test(kr)) {
            return { valid: false, reason: '韩语包含未变形的语法符号' };
        }

        // Note: English characters (e.g. "Lisa") are now allowed and expected for some names.
    }

    // 2. Check Words and Grammar format
    // Expected: "Korean - Meaning (Tag)"
    const checkListFormat = (text) => {
        if (!text) return true; // Empty is fine? Maybe not for words
        const lines = text.split('\n').filter(l => l.trim());
        for (const line of lines) {
             // Basic check: Must have dash or similar separator and parentheses for tag
             if (!line.includes('-') && !line.includes(' ')) return false;
             // Check for tag format roughly
             // It's hard to be perfect, but let's check for Chinese characters in the "Korean" part if possible?
             // Actually, just checking if it looks like "Word - Meaning" is good enough.
             // Let's check if the line starts with Hangul
             if (!/^[\uAC00-\uD7AFa-zA-Z\s]+/.test(line.trim())) {
                  // If it starts with Chinese, it might be reversed
                  if (/^[\u4E00-\u9FFF]/.test(line.trim())) return false;
             }
        }
        return true;
    };

    if (!checkListFormat(words)) return { valid: false, reason: '单词格式异常' };
    if (!checkListFormat(grammar)) return { valid: false, reason: '语法格式异常' };

    return { valid: true };
  },

  async generate() {
    if (!this.data.characterName.trim()) {
      wx.showToast({ title: '请输入主角名字', icon: 'none' });
      return;
    }
    if (this.data.isGenerating) return;

    // Check Daily Quota and Ads
    const count = this.getDailyStoryCount();
    
    // Case 1: First time free (count == 0) -> Just generate
    if (count < 1) {
        this.doGenerate();
        return;
    }

    // Case 2: 1 < count < 4 -> Show Interstitial, then generate
    if (count < 4) {
        if (this._interstitialAd) {
            this._interstitialAd.show().catch((err) => {
                console.error('插屏广告显示失败', err);
            });
        }
        // Proceed immediately as interstitial is non-blocking in terms of logic flow usually,
        // or user can just close it.
        this.doGenerate();
        return;
    }

    // Case 3: count >= 4 -> Require Rewarded Video
    wx.showModal({
        title: '需要观看视频',
        content: '因费用限制 所以需看一个视频，明日会重置免费机会',
        confirmText: '观看',
        cancelText: '取消',
        success: (res) => {
            if (res.confirm) {
                this.showRewardedVideoAndGenerate();
            }
        }
    });
  },

  showRewardedVideoAndGenerate() {
      if (!this._videoAd) {
          wx.showToast({ title: '广告加载失败，请稍后重试', icon: 'none' });
          // Fallback or just fail? Let's allow if ad fails strictly? 
          // Usually better to fail safe for user, but request implies "must watch".
          // If ad object is missing, maybe just let them pass or block?
          // Let's block but give a hint.
          return;
      }
      
      const ad = this._videoAd;
      
      // Define close handler
      const onClose = (res) => {
          ad.offClose(onClose); // Clean up
          if (res && res.isEnded) {
              this.doGenerate();
          } else {
              wx.showToast({ title: '需完整观看视频才能生成', icon: 'none' });
          }
      };
      
      ad.onClose(onClose);
      
      ad.show().catch(() => {
          ad.load()
            .then(() => ad.show())
            .catch(err => {
                console.error('激励视频广告显示失败', err);
                ad.offClose(onClose);
                wx.showToast({ title: '广告显示失败，请重试', icon: 'none' });
            });
      });
  },

  async doGenerate() {
    // Increment count on start
    this.incrementDailyStoryCount();
    
    const [tIdx, pIdx, aIdx] = this.data.pickerValue;
    const when = STORY_PRESETS.times[tIdx];
    const where = STORY_PRESETS.contexts[pIdx];
    const action = STORY_PRESETS.actions[aIdx];
    const who = this.data.characterName.trim();
    
    // Random words/grammar logic
    const settings = wx.getStorageSync('settings') || {};
    const category = settings.category || 'Yonsei 1';
    let filters = {};
    if (/^Yonsei\s+\d$/.test(category) && settings.yonseiLessonId) {
      filters.lessonId = settings.yonseiLessonId;
    }
    
    let selectedWords = [];
    try {
      const res = await getWords(category, 100, 0, filters);
      if (res && res.words && res.words.length) {
        const shuffled = res.words.sort(() => 0.5 - Math.random());
        selectedWords = shuffled.slice(0, 5);
      }
    } catch (e) {
      console.error('Fetch words failed', e);
    }
    
    let selectedGrammar = [];
    try {
      const lessonId = settings.yonseiLessonId;
      let pool = GRAMMAR_DATA;
      if (lessonId) {
        pool = GRAMMAR_DATA.filter(g => String(g.lesson_id) === String(lessonId));
      }
      if (!pool.length && GRAMMAR_DATA.length) pool = GRAMMAR_DATA;
      const shuffled = pool.sort(() => 0.5 - Math.random());
      selectedGrammar = shuffled.slice(0, 2);
    } catch (e) {}
    
    const elements = { who, when, where, action };
    this.setData({ 
      isGenerating: true, 
      generated: false, 
      elements, 
      segments: [],
      currentSegmentIndex: 0
    });
    
    try {
      let fullText = '';
      const stream = streamAi(this._aiModel, elements, selectedWords, selectedGrammar);
      
      let lastSegmentCount = 0;
      for await (const chunk of stream) {
        fullText += chunk;
        const parsed = parseStreamedOutput(fullText);
        if (parsed.allowed) {
          const segments = parsed.segments.map(seg => ({
            ...seg,
            displayKorean: this.parseMarkdown(seg.korean)
          }));
          
          const updateData = { segments };
          
          // Auto-advance logic
          // We need to ensure segments update happens BEFORE we switch index
          // to trigger the smooth slide animation.
          
          if (segments.length > lastSegmentCount) {
             const newCount = segments.length;
             const isFirstSegment = (lastSegmentCount === 0);
             
             // If first segment, show it immediately
             if (isFirstSegment) {
                 updateData.currentSegmentIndex = 0;
                 lastSegmentCount = newCount;
             } else {
                 // For subsequent segments, check if previous one is done (has Chinese)
                 // If so, trigger the slide.
                 const prevSegIndex = lastSegmentCount - 1;
                 const prevSeg = segments[prevSegIndex];
                 
                 if (prevSeg && prevSeg.chinese) {
                     // IMPORTANT: We must NOT set currentSegmentIndex in the SAME setData call
                     // if we want to ensure the new slide exists before sliding to it.
                     // However, swiper updates usually handle this if the array grows.
                     // To be safe and ensure animation plays, we delay the index update slightly.
                     
                     // First, update the content (new segment added)
                     this.setData({ segments, wordsSection: parsed.words, grammarSection: parsed.grammar }, () => {
                         // Then, slide to the new index
                         setTimeout(() => {
                            this.setData({ currentSegmentIndex: newCount - 1 });
                         }, 100); 
                     });
                     
                     lastSegmentCount = newCount;
                     // We handled setData manually above, so we clear segments from updateData
                     // to avoid double setting.
                     delete updateData.segments;
                     delete updateData.wordsSection;
                     delete updateData.grammarSection;
                 }
             }
          }
          
          // Apply remaining updates
          // Ensure we ALWAYS stream words/grammar updates if available
          if (parsed.words) updateData.wordsSection = parsed.words;
          if (parsed.grammar) updateData.grammarSection = parsed.grammar;
          
          if (Object.keys(updateData).length > 0) {
             this.setData(updateData);
          }
        } else {
           // If blocked/not allowed during streaming
           this.setData({
              generated: false,
              isGenerating: false,
              segments: [],
              wordsSection: '',
              grammarSection: ''
           });
           
           wx.showModal({
               title: '内容违规',
               content: (parsed.message || '内容包含敏感信息') + '\n请尝试更换人物和场景再次使用',
               showCancel: false,
               confirmText: '知道了'
           });
           return; // Stop processing stream
        }
      }
      
      const finalOut = parseStreamedOutput(fullText);
      if (finalOut.allowed) {
        // Validate content
        const validateRes = this.validateContent(finalOut);
        if (!validateRes.valid) {
            this.setData({
                generated: false,
                segments: [],
                wordsSection: '',
                grammarSection: ''
            });
            wx.showModal({
                title: '生成格式异常',
                content: '检测到生成内容可能存在格式问题（如韩语中夹杂中文、单词解析格式错误等）。\n建议点击“生成”重试。\n如反复出现 请更换人物或场景',
                confirmText: '重试',
                cancelText: '取消',
                success: (res) => {
                    if (res.confirm) {
                        this.generate();
                    }
                }
            });
            return;
        }

        const segments = finalOut.segments.map(seg => ({
          ...seg,
          displayKorean: this.parseMarkdown(seg.korean)
        }));
        this.setData({
          generated: true,
          segments,
          wordsSection: finalOut.words,
          grammarSection: finalOut.grammar
        });
      } else {
        // Final check blocked
        this.setData({
          generated: false,
          segments: [],
          wordsSection: '',
          grammarSection: ''
        });
        wx.showModal({
            title: '内容违规',
            content: (finalOut.message || '生成内容包含敏感信息') + '\n请尝试更换人物和场景再次使用',
            showCancel: false,
            confirmText: '知道了'
        });
      }
      
    } catch (e) {
      console.error(e);
      this.setData({
          generated: false,
          segments: [],
          wordsSection: '',
          grammarSection: ''
      });
      wx.showToast({ title: '生成失败', icon: 'none' });
    } finally {
      this.setData({ isGenerating: false });
    }
  },

  async publish() {
    if (!this.data.generated) return;
    wx.showLoading({ title: '发布中' });
    
    try {
      const story = {
        elements: this.data.elements,
        segments: this.data.segments,
        wordsSection: this.data.wordsSection,
        grammarSection: this.data.grammarSection,
        status: 'done',
        createdAt: Date.now(),
        // Add category info for filtering
        category: wx.getStorageSync('settings')?.category || 'Yonsei 1',
        lessonId: wx.getStorageSync('settings')?.yonseiLessonId || '',
        // Save TOPIK info as well if applicable
        topikLevel: wx.getStorageSync('settings')?.topikLevel || '',
        topikSession: wx.getStorageSync('settings')?.topikSession || ''
      };
      
      // Use 'quickstartFunctions' which is a common default or check if storySync is deployed.
      // If user provided screenshot says "FunctionName parameter could not be found",
      // it means 'storySync' is not deployed or not found.
      // Based on file list, 'storySync' folder exists.
      // But maybe the actual deployed name is different or not deployed.
      // Let's try to use 'storySync' again but double check if we can fallback or if there is a typo.
      // Actually, looking at the error again: "FunctionName parameter could not be found".
      // This often means the `name` parameter itself is missing in the request to cloud, 
      // OR the function name on the server is different.
      // Since I see `cloudfunctions/storySync`, the name SHOULD be 'storySync'.
      // If it fails, it might be that the user hasn't uploaded/deployed this function yet.
      // I cannot deploy functions. I can only fix code.
      // But wait, the error is -501000. 
      // "FunctionName parameter could not be found" usually means the SDK couldn't find the function name.
      // Let's check if the call syntax is correct.
      // wx.cloud.callFunction({ name: 'storySync', ... }) is correct.
      // Maybe the environment ID is not set? But other things work?
      // Wait, look at the error image again. It says "Function not found". 
      // Ah, the error message in the screenshot says `FunctionName parameter could not be found` 
      // but also `FUNCTION_NOT_FOUND` in the standard output.
      // It is highly likely the function is simply not deployed.
      // I should add a fallback or at least a clearer error message, 
      // OR I can try to use `quickstartFunctions` if that is the "main" function 
      // and `storySync` is just a local folder.
      // But `storySync` has its own package.json, so it's a separate function.
      // I will assume it's a deployment issue and I can't "fix" deployment from here.
      // However, I can ensure the code is robust.
      // Actually, maybe I can try to use `hiLiaoSync` if that is related? 
      // No, `storySync` seems specific.
      // Let's stick to `storySync` but maybe the user needs to deploy it.
      // I'll add a check/try-catch that gives a hint "Please deploy storySync".
      // But wait, the user asked "Why publish failed".
      // I should explain they need to deploy it.
      // BUT, I can also check if I can use a different function name if `storySync` was a typo?
      // No, it matches the folder name.
      
      const res = await wx.cloud.callFunction({
        name: 'storySync',
        data: {
          action: 'create',
          payload: { story }
        }
      });
      
      if (res && res.result && !res.result.error) {
        wx.showToast({ title: '发布成功' });
        // Set flag to force refresh list on return
        // Use Storage for reliability across page stack
        wx.setStorageSync('story_refresh_needed', true);
        
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      } else {
        throw new Error(res.result.error || 'Unknown error');
      }
    } catch (e) {
      console.error(e);
      // Helpful error toast
      const msg = e.message || '';
      if (msg.includes('FUNCTION_NOT_FOUND') || msg.includes('-501000')) {
          wx.showToast({ title: '请先部署 storySync 云函数', icon: 'none' });
      } else {
          wx.showToast({ title: '发布失败: ' + msg, icon: 'none' });
      }
    } finally {
      wx.hideLoading();
    }
  },
  
  onSwiperChange(e) {
    this.setData({ currentSegmentIndex: e.detail.current });
  },
  
  prevSegment() {
    if (this.data.currentSegmentIndex > 0) {
      this.setData({ currentSegmentIndex: this.data.currentSegmentIndex - 1 });
    }
  },
  
  nextSegment() {
    if (this.data.currentSegmentIndex < this.data.segments.length - 1) {
      this.setData({ currentSegmentIndex: this.data.currentSegmentIndex + 1 });
    }
  }
});
