const { sha256 } = require('../../utils/sha256');

const AUDIO_ORIGIN = 'https://enoss.aorenlan.fun';
const TTS_BASE_PATH = 'krtts';
const TTS_VOICE = 'ko-KR-SunHiNeural';
const TTS_RATE = '+0%';

// Build COS audio URL matching server: sha256(`${text}|${voice}|${rate}`) → tts/{hash}.mp3
function buildParaAudioUrl(paraText) {
  const hash = sha256(`${paraText.trim()}|${TTS_VOICE}|${TTS_RATE}`);
  return `${AUDIO_ORIGIN}/${TTS_BASE_PATH}/${hash}.mp3`;
}

Page({
  data: {
    view: 'list', // 'list' | 'detail'
    articles: [],
    currentArticle: null,
    loading: false,

    // Detail interaction
    selectedWord: null,      // { word_id, text, analysis }
    selectedSentence: null,  // sentence object
    bottomTab: 'word',       // 'word' | 'sentence' | 'translation'
    showBottomPanel: false,
    showChinese: false,
    expertMode: true,   // 精讲模式：点单词弹半屏；关闭后点单词只显示中文 toast
    ttsToggle: true,    // 速读模式下喇叭开关
    wordToast: '',
    showWordMeaningToast: false,
    wordToastX: 0,
    wordToastY: 0,

    // Audio state
    playingParaIndex: -1,    // which paragraph is playing
    loadingParaIndex: -1,    // which paragraph is loading audio

    showWordTip: false,
    showExpertTip: false,
    showGuideModal: false,  // 首次进入引导弹窗

    statusBarHeight: 20,
    navBarHeight: 44,
  },

  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight || 20 });
    this.fetchArticles();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  onUnload() {
    this.stopAudio();
  },

  // ---- API ----
  async fetchArticles() {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('krarticle')
        .field({ _id: true, date: true, 'content.news_title': true, 'content.chinese_title': true, 'content.article_id': true })
        .orderBy('date', 'desc')
        .limit(30)
        .get();
      this.setData({ articles: res.data || [] });
    } catch (e) {
      console.error('fetchArticles error', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async fetchArticleDetail(id) {
    this.setData({ loading: true });
    try {
      const db = wx.cloud.database();
      const res = await db.collection('krarticle').doc(id).get();
      if (res.data) {
        const article = res.data;
        const content = article.content || {};

        // 段落文本在 content.korean_paragraphs
        const rawParagraphs = content.korean_paragraphs || [];

        // 句子分析在 topik_versions 里
        const topikVersions = content.topik_versions || {};
        const topikVersion = topikVersions['level_3_4'] || topikVersions['level_1_2'] || Object.values(topikVersions)[0] || null;
        const sentences = (topikVersion && topikVersion.sentences) || [];

        // 建立单词分析索引 word_id → analysis
        const wordAnalysisMap = {};
        if (topikVersion && topikVersion.detailed_analysis && topikVersion.detailed_analysis.word_analysis) {
          topikVersion.detailed_analysis.word_analysis.forEach(w => { wordAnalysisMap[w.id] = w; });
        }
        sentences.forEach(s => {
          if (s.detailed_analysis && s.detailed_analysis.word_analysis) {
            s.detailed_analysis.word_analysis.forEach(w => { wordAnalysisMap[w.id] = w; });
          }
        });

        // 为每个段落找匹配的句子，句子里的 word_segments 附上 analysis
        const paragraphs = rawParagraphs.map((paraText, pIdx) => {
          const paraSentences = sentences
            .filter(s => s.text && paraText.includes(s.text))
            .map(s => ({
              ...s,
              word_segments: (s.word_segments || []).map(ws => ({
                ...ws,
                analysis: wordAnalysisMap[ws.analysis_ref] || null
              }))
            }));
          return { pIdx, paraText, sentences: paraSentences };
        });

        this.setData({
          currentArticle: { ...article, topikVersion, paragraphs },
          view: 'detail',
          selectedWord: null,
          selectedSentence: null,
          showBottomPanel: false,
          bottomTab: 'word',
          playingParaIndex: -1,
          loadingParaIndex: -1,
        });
      }
    } catch (e) {
      console.error('fetchArticleDetail error', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // ---- Navigation ----
  onArticleTap(e) {
    const id = e.currentTarget.dataset.id;
    this.fetchArticleDetail(id);
    // 首次进入阅读页：弹出引导弹窗
    const shown = wx.getStorageSync('news_guide_shown');
    if (!shown) {
      setTimeout(() => this.setData({ showGuideModal: true }), 600);
    }
  },

  goBack() {
    if (this.data.view === 'detail') {
      this.stopAudio();
      this.setData({
        view: 'list',
        currentArticle: null,
        selectedWord: null,
        selectedSentence: null,
        showBottomPanel: false,
      });
    } else {
      wx.switchTab({ url: '/pages/nv-practice/index' });
    }
  },

  // ---- Word / Sentence tap ----
  onWordTap(e) {
    const { wordId, sentenceId, pIdx } = e.currentTarget.dataset;
    const paragraphs = (this.data.currentArticle && this.data.currentArticle.paragraphs) || [];
    const para = paragraphs.find(p => p.pIdx == pIdx);
    if (!para) return;
    const sentence = para.sentences.find(s => s.sentence_id === sentenceId);
    if (!sentence) return;
    const ws = sentence.word_segments && sentence.word_segments.find(w => w.word_id === wordId);
    if (!ws) return;

    if (!this.data.expertMode) {
      // 速读模式：喇叭开关开着且 wordtts=true → 播放单词音频
      if (this.data.ttsToggle && this.data.currentArticle && this.data.currentArticle.wordtts) {
        this._playWordTtsByText(ws.text);
      }
      // 非精讲模式：在单词上方显示中文释义 2s
      const analysis = ws.analysis || null;
      const meaning = analysis ? analysis.meaning : '';
      if (!meaning) return;
      // 用点击坐标定位（touches[0] 的 clientY 减去一点偏移）
      const touch = e.touches && e.touches[0];
      const x = touch ? touch.clientX : e.detail.x;
      const y = touch ? touch.clientY : e.detail.y;
      if (this._wordToastTimer) clearTimeout(this._wordToastTimer);
      this.setData({
        wordToast: meaning,
        showWordMeaningToast: true,
        wordToastX: x,
        wordToastY: y - 48,
      });
      this._wordToastTimer = setTimeout(() => {
        this.setData({ showWordMeaningToast: false });
      }, 2000);
      return;
    }

    // 首次点击单词：同时显示精讲旁「切换速读」指引
    const expertTipShown = wx.getStorageSync('news_expert_tip_shown');
    const updates = {
      selectedWord: { word_id: wordId, text: ws.text, analysis: ws.analysis || null },
      selectedSentence: sentence,
      bottomTab: 'word',
      showBottomPanel: true,
    };
    if (!expertTipShown) {
      wx.setStorageSync('news_expert_tip_shown', true);
      updates.showExpertTip = true;
    }
    this.setData(updates);
  },

  onSentenceTap(e) {
    const { sentenceId, pIdx } = e.currentTarget.dataset;
    const paragraphs = (this.data.currentArticle && this.data.currentArticle.paragraphs) || [];
    const para = paragraphs.find(p => p.pIdx == pIdx);
    if (!para) return;
    const sentence = para.sentences.find(s => s.sentence_id === sentenceId);
    if (!sentence) return;

    this.setData({
      selectedSentence: sentence,
      selectedWord: null,
      bottomTab: 'sentence',
      showBottomPanel: true,
    });
  },

  closeBottomPanel() {
    this.setData({ showBottomPanel: false });
  },

  switchBottomTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ bottomTab: tab, showBottomPanel: true });
  },

  toggleLanguage() {
    this.setData({ showChinese: !this.data.showChinese, showBottomPanel: false });
  },

  closeGuideModal() {
    wx.setStorageSync('news_guide_shown', true);
    this.setData({ showGuideModal: false });
  },

  toggleExpertMode() {
    this.setData({ expertMode: !this.data.expertMode, showBottomPanel: false, showExpertTip: false, selectedWord: null, selectedSentence: null });
  },

  toggleTtsMode() {
    const next = !this.data.ttsToggle;
    this.setData({ ttsToggle: next });
    wx.showToast({ title: next ? '朗读已开启' : '朗读已关闭', icon: 'none', duration: 1200 });
  },

  // ---- Audio ----
  _audioCtx: null,

  stopAudio() {
    if (this._audioCtx) {
      try { this._audioCtx.stop(); this._audioCtx.destroy(); } catch (e) {}
      this._audioCtx = null;
    }
    this.setData({ playingParaIndex: -1, loadingParaIndex: -1 });
  },

  onParaAudioTap(e) {
    const { paraIndex } = e.currentTarget.dataset;
    const { playingParaIndex, loadingParaIndex } = this.data;

    if (playingParaIndex === paraIndex || loadingParaIndex === paraIndex) {
      this.stopAudio();
      return;
    }

    const paragraphs = (this.data.currentArticle && this.data.currentArticle.paragraphs) || [];
    const para = paragraphs.find(p => p.pIdx == paraIndex);
    const paraText = para && para.paraText;
    if (!paraText) return;

    this.stopAudio();
    this.setData({ loadingParaIndex: paraIndex });

    const url = buildParaAudioUrl(paraText);
    const ctx = wx.createInnerAudioContext();
    this._audioCtx = ctx;
    ctx.src = url;
    ctx.autoplay = true;

    ctx.onPlay(() => {
      this.setData({ loadingParaIndex: -1, playingParaIndex: paraIndex });
    });

    ctx.onError((err) => {
      console.error('para audio error', err);
      this.setData({ loadingParaIndex: -1, playingParaIndex: -1 });
      wx.showToast({ title: '暂时无法播放', icon: 'none', duration: 2000 });
    });

    ctx.onEnded(() => {
      this.setData({ playingParaIndex: -1 });
    });
  },

  playWordTts() {
    const word = this.data.selectedWord;
    if (!word || !word.text) return;
    this._playWordTtsByText(word.text);
  },

  _playWordTtsByText(text) {
    const url = buildParaAudioUrl(text);

    if (this._wordAudioCtx) {
      try { this._wordAudioCtx.stop(); this._wordAudioCtx.destroy(); } catch (e) {}
      this._wordAudioCtx = null;
    }

    const fs = wx.getFileSystemManager();
    const safeName = String(text).replace(/[^\w\-\u4e00-\u9fa5\uac00-\ud7a3]/g, '_') + '.mp3';
    const cacheDir = `${wx.env.USER_DATA_PATH}/audio_cache`;
    const cachePath = `${cacheDir}/${safeName}`;

    const playSrc = (src) => {
      const ctx = wx.createInnerAudioContext();
      this._wordAudioCtx = ctx;
      ctx.onError(() => wx.showToast({ title: '暂无音频', icon: 'none', duration: 1500 }));
      ctx.autoplay = false;
      ctx.src = src;
      ctx.play();
    };

    let hasCached = false;
    try { fs.accessSync(cachePath); hasCached = true; } catch (e) {}

    if (hasCached) {
      playSrc(cachePath);
    } else {
      wx.downloadFile({
        url,
        success(res) {
          if (res.statusCode === 200 && res.tempFilePath) {
            try { fs.accessSync(cacheDir); } catch (e) {
              try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (e2) {}
            }
            try { fs.unlinkSync(cachePath); } catch (e) {}
            try {
              fs.saveFileSync(res.tempFilePath, cachePath);
              playSrc(cachePath);
            } catch (e) {
              playSrc(res.tempFilePath);
            }
          } else {
            wx.showToast({ title: '暂无音频', icon: 'none', duration: 1500 });
          }
        },
        fail: () => wx.showToast({ title: '暂无音频', icon: 'none', duration: 1500 })
      });
    }
  },
});
