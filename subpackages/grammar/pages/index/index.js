const grammarData = require('../../data/yansei_grammar.js');

const sortLessons = (a, b) => {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b));
};

const parseContent = (s) => {
  if (!s) return [];
  const raw = String(s);
  // Replace delimiters with a unique separator
  const normalized = raw
    .replace(/Morphological rules/gi, '形态规则')
    .replace(/\r\n/g, '###P###')
    .replace(/\n/g, '###P###');
  
  return normalized.split('###P###')
    .map(t => t.trim())
    .filter(t => t.length > 0);
};

const buildKey = (x) => `${x.category}__${String(x.lesson_id)}__${String(x.global_id || x.grammar || '')}`;

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    title: '语法',
    subTitle: '',
    subtitle: '',
    items: [],
    currentKey: '',
    current: null,
    meaningParts: [],
    usageParts: [],
    exampleParts: [],
    sidebarCollapsed: false,
    startX: 0,
    startY: 0
  },

  handleTouchStart(e) {
    if (e.touches.length !== 1) return;
    const { clientX, clientY } = e.touches[0];
    this.setData({ startX: clientX, startY: clientY });
  },

  handleTouchEnd(e) {
    if (e.changedTouches.length !== 1) return;
    const { clientX, clientY } = e.changedTouches[0];
    const { startX, startY } = this.data;
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;

    // 左右滑动判定：水平位移 > 50 且 垂直位移 < 50
    if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 50) {
      if (deltaX < 0) {
        // 向左滑动 -> 下一页
        this.nextItem();
      } else {
        // 向右滑动 -> 上一页
        this.prevItem();
      }
    }
  },

  nextItem() {
    const { items, currentKey } = this.data;
    const currentIndex = items.findIndex(x => x.key === currentKey);
    if (currentIndex < items.length - 1) {
      const next = items[currentIndex + 1];
      this.selectItemByKey(next.key);
    } else {
      wx.showToast({ title: '已经是最后一条了', icon: 'none' });
    }
  },

  prevItem() {
    const { items, currentKey } = this.data;
    const currentIndex = items.findIndex(x => x.key === currentKey);
    if (currentIndex > 0) {
      const prev = items[currentIndex - 1];
      this.selectItemByKey(prev.key);
    } else {
      wx.showToast({ title: '已经是第一条了', icon: 'none' });
    }
  },

  selectItemByKey(key) {
    const items = this.data.items || [];
    const found = items.find(x => x.key === key);
    if (!found) return;

    // Separate meaning and usage_notes
    const meaningParts = parseContent(found.meaning);
    const usageParts = parseContent(found.usage_notes);

    // Map structured examples to {kor, trans}
    const rawExamples = Array.isArray(found.examples) ? found.examples : [];
    const exampleParts = rawExamples.map(ex => ({
      kor: ex.kr || ex.kor || '', // Handle both keys just in case
      trans: ex.cn || ex.trans || ''
    }));

    this.setData({
      currentKey: key,
      current: found,
      meaningParts,
      usageParts,
      exampleParts,
      sidebarCollapsed: true
    });
  },

  goBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/nv-practice/index' });
      }
    });
  },

  onShow() {
    // If not first load, we should check if settings changed
    // But onLoad does most work. However, if user changes settings elsewhere and comes back...
    // But typically this page is pushed.
    
    // If we want to support dynamic reload when this page is already open (e.g. via custom logic)
    // we can add a check. For now, let's just ensure we respect passed options or settings.
    
    // However, the request is: "语法这里新增 设置中切换词库 可查看对应语法"
    // Meaning: In this grammar page, use settings to determine which grammar to show.
    // If query params are missing, fallback to settings.
    
    // But wait, onLoad runs once. If we want to support "Settings Switch" *inside* this page?
    // No, the user likely means: "In Settings -> Change Word Book -> Then go to Grammar Page -> See corresponding grammar".
    // OR "Inside Grammar Page -> Have a way to switch?". The user said "设置中切换词库 可查看对应语法".
    // This implies: "If I switch word book in Settings, the Grammar page should show that book's grammar."
    
    // So, we should read from Storage if query params are not sufficient or if we want to sync with global settings.
    // Let's modify onLoad to prioritize query, then fallback to Storage.
    // actually, let's just re-run the loading logic in onShow if items are empty or if we want to sync?
    // Usually onShow is better if we want to reflect global state changes.
    // But we need to avoid overwriting if user navigated specifically to a lesson.
    
    // Let's assume the user navigates here without params usually, or we want to default to current settings.
    const pages = getCurrentPages();
    const curr = pages[pages.length - 1];
    const options = curr.options || {};
    
    // If options are explicit, use them.
    // If options are empty, use settings.
    if (!options.book && !options.category) {
       this.loadFromSettings();
    }
  },

  loadFromSettings() {
      const settings = wx.getStorageSync('settings') || {};
      const book = settings.category || 'Yonsei 1';
      // For grammar, we usually want all lessons or specific lesson?
      // If user is in "Yonsei 1", maybe show all grammar for Yonsei 1?
      // Or if they selected a specific lesson in settings?
      
      let lessonId = '';
      if (settings.yonseiLessonId) {
          lessonId = String(settings.yonseiLessonId);
      }
      
      // Filter grammarData
      this.renderData(book, lessonId);
  },

  onLoad(query) {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: windowInfo.statusBarHeight || 20,
      navBarHeight: 44
    });

    const book = String((query && (query.book || query.category)) || '').trim();
    const lessonId = String((query && query.lessonId) || '').trim();

    if (book) {
        this.renderData(book, lessonId);
    } else {
        this.loadFromSettings();
    }

    this.innerAudioContext = wx.createInnerAudioContext();
    this.innerAudioContext.onPlay(() => {
        console.log('Audio playing');
    });
    this.innerAudioContext.onError((res) => {
        console.error('Audio error', res);
    });
  },

  onUnload() {
    if (this.innerAudioContext) {
        this.innerAudioContext.destroy();
    }
  },

  playExampleAudio(e) {
      const text = e.currentTarget.dataset.text;
      if (!text) return;

      const url = this.buildAudioUrl(text);
      console.log('Playing audio:', url);
      
      if (this.innerAudioContext) {
          this.innerAudioContext.stop();
          this.innerAudioContext.src = url;
          this.innerAudioContext.play();
      }
  },

  buildAudioUrl(text) {
      const baseUrl = 'https://enoss.aorenlan.fun/kr_yansei_grammar/audio/';
      // Replace punctuation and spaces with underscore
      let processed = text.replace(/[ \.,?!~:;"'’“”]+/g, '_');
      // Encode
      const encoded = encodeURIComponent(processed);
      return `${baseUrl}${encoded}.mp3`;
  },

  goToSettings() {
    wx.switchTab({
      url: '/pages/nv-settings/index'
    });
  },

  renderData(book, lessonId) {
    const all = Array.isArray(grammarData) ? grammarData : [];
    // If lessonId is provided, filter by it. If not, maybe show all for the book?
    // If lessonId is empty, we might show all lessons for that book.
    
    let filtered = all.filter((x) => String(x.category || '') === book);
    
    if (lessonId) {
        filtered = filtered.filter((x) => String(x.lesson_id || '') === lessonId);
    } else {
        // If no lessonId, maybe sort by lesson_id?
        // They are likely already sorted.
    }
    
    if (filtered.length === 0 && !lessonId) {
        // Try to find if the book name format is different or just empty
    }

    const items = filtered.map((x) => ({ ...x, key: buildKey(x) }));
    const first = items[0] || null;
    const currentKey = first ? first.key : '';
    
    // If we have items but no current selection, pick first.
    // If we are refreshing, we might want to keep current if possible? 
    // For now simple: reset to first.
    
    const subtitle = book && lessonId ? `${book} · 第${lessonId}课` : (book ? `${book} · 全部` : '语法');

    let meaningParts = [];
    let usageParts = [];
    let exampleParts = [];

    if (first) {
      meaningParts = parseContent(first.meaning);
      usageParts = parseContent(first.usage_notes);
      const rawExamples = Array.isArray(first.examples) ? first.examples : [];
      exampleParts = rawExamples.map(ex => ({
        kor: ex.kr || ex.kor || '',
        trans: ex.cn || ex.trans || ''
      }));
    }

    this.setData({
      items,
      currentKey,
      current: first,
      meaningParts,
      usageParts,
      exampleParts,
      title: '语法',
      subTitle: book && lessonId ? `第${lessonId}课 · ${items.length}条` : (items.length ? `${items.length}条` : ''),
      subtitle
    });
  },

  toggleSidebar() {
    this.setData({ 
      sidebarCollapsed: !this.data.sidebarCollapsed
    });
  },

  selectItem(e) {
    const key = e.currentTarget.dataset.key;
    this.selectItemByKey(key);
  }
});
