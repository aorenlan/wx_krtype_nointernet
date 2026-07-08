const { sha256 } = require('../../utils/sha256');
const { TAP_SCENE_DEMO } = require('./mock-data');
const { clearTapSceneContentCache, loadTapScenePack, saveTapSceneCourseId } = require('./content');

const AUDIO_CACHE_DIR = `${wx.env.USER_DATA_PATH}/tap_scene_audio`;
const AUDIO_CACHE_VERSION = 'v1';

function getHotspotLabelClass(item) {
  const x = Number(item && item.x) || 50;
  const y = Number(item && item.y) || 50;
  const horizontal = x > 72 ? 'label-left' : 'label-right';
  const vertical = y < 18 ? 'label-down' : (y > 82 ? 'label-up' : '');
  return `${horizontal} ${vertical}`.trim();
}

function formatHotspots(scene, selectedId) {
  const hotspots = Array.isArray(scene && scene.hotspots) ? scene.hotspots : [];
  return hotspots.map((item, index) => ({
    ...item,
    index,
    indexLabel: String(index + 1).padStart(2, '0'),
    mark: String(item.korean || '').slice(0, 1),
    label: item.short || item.korean,
    active: item.id === selectedId,
    labelClass: getHotspotLabelClass(item),
    styleText: `left:${Number(item.x) || 50}%;top:${Number(item.y) || 50}%;`
  }));
}

function formatWordItems(items, selectedId, offset) {
  const list = Array.isArray(items) ? items : [];
  const start = Number(offset) || 0;
  return list.map((item, index) => ({
    ...item,
    index: start + index,
    indexLabel: String(start + index + 1).padStart(2, '0'),
    mark: String(item.korean || '').slice(0, 1),
    label: item.short || item.korean,
    active: item.id === selectedId,
    labelClass: getHotspotLabelClass(item),
    styleText: `left:${Number(item.x) || 50}%;top:${Number(item.y) || 50}%;`
  }));
}

function formatWords(scene, selectedId) {
  const core = Array.isArray(scene && scene.hotspots) ? scene.hotspots : [];
  const extensions = Array.isArray(scene && scene.extensionWords) ? scene.extensionWords : [];
  return formatWordItems(core.concat(extensions), selectedId, 0);
}

function formatSceneWords(scene, selectedId) {
  const core = Array.isArray(scene && scene.hotspots) ? scene.hotspots : [];
  return formatWordItems(core, selectedId, 0);
}

function formatExtensionWords(scene, selectedId) {
  const core = Array.isArray(scene && scene.hotspots) ? scene.hotspots : [];
  const extensions = Array.isArray(scene && scene.extensionWords) ? scene.extensionWords : [];
  return formatWordItems(extensions, selectedId, core.length);
}

function formatPhrases(scene, selectedId) {
  const phrases = Array.isArray(scene && scene.phrases) ? scene.phrases : [];
  return phrases.map((item, index) => ({
    ...item,
    index,
    indexLabel: item.indexLabel || String(index + 1).padStart(2, '0'),
    active: item.id === selectedId
  }));
}

function findFormattedHotspot(scene, id) {
  const list = formatHotspots(scene, id);
  return list.find((item) => item.id === id) || list[0] || null;
}

function findFormattedWord(scene, id) {
  const list = formatWords(scene, id);
  return list.find((item) => item.id === id) || list[0] || null;
}

function findFormattedPhrase(scene, id) {
  const list = formatPhrases(scene, id);
  return list.find((item) => item.id === id) || list[0] || null;
}

function buildSceneViewState(scene, selectedId, selectedPhraseId) {
  const targetScene = scene || TAP_SCENE_DEMO;
  const rawHotspots = Array.isArray(targetScene.hotspots) ? targetScene.hotspots : [];
  const rawExtensionWords = Array.isArray(targetScene.extensionWords) ? targetScene.extensionWords : [];
  const rawWords = rawHotspots.concat(rawExtensionWords);
  const rawPhrases = Array.isArray(targetScene.phrases) ? targetScene.phrases : [];
  const nextSelectedId = rawWords.some((item) => item.id === selectedId)
    ? selectedId
    : (rawWords[0] && rawWords[0].id || '');
  const nextPhraseId = rawPhrases.some((item) => item.id === selectedPhraseId)
    ? selectedPhraseId
    : '';
  return {
    scene: targetScene,
    hotspots: formatHotspots(targetScene, nextSelectedId),
    words: formatSceneWords(targetScene, nextSelectedId),
    extensionWords: formatExtensionWords(targetScene, nextSelectedId),
    phrases: formatPhrases(targetScene, nextPhraseId),
    selectedId: nextSelectedId,
    selected: findFormattedWord(targetScene, nextSelectedId) || {},
    selectedPhraseId: nextPhraseId,
    selectedPhrase: nextPhraseId ? findFormattedPhrase(targetScene, nextPhraseId) || {} : {}
  };
}

function formatCourseOptions(courses, activeId) {
  const list = Array.isArray(courses) ? courses : [];
  return list
    .filter((item) => item && item.id)
    .map((item) => ({
      id: item.id,
      title: item.title || item.id,
      active: item.id === activeId
    }));
}

function getShareSceneName(scene) {
  const rawTitle = String(scene && (scene.shareTitle || scene.title || scene.topic || scene.subtitle) || '').trim();
  let name = rawTitle
    .replace(/看图点读/g, '')
    .replace(/点读/g, '')
    .replace(/点单场景/g, '')
    .replace(/点单/g, '')
    .replace(/场景/g, '')
    .trim();

  if (!name) {
    name = String(scene && (scene.topic || scene.subtitle) || '').trim();
  }
  if (/^咖啡馆$/.test(name)) return '咖啡店';
  return name || '这个场景';
}

function getTapSceneShareTitle(scene) {
  return `在${getShareSceneName(scene)}该怎么说`;
}

function getCourseIndex(courseOptions, activeId) {
  const index = (Array.isArray(courseOptions) ? courseOptions : [])
    .findIndex((item) => item && item.id === activeId);
  return index >= 0 ? index : 0;
}

function getViewportWidth(info) {
  return Number(info && (info.windowWidth || info.width || info.screenWidth)) || 0;
}

function getViewportHeight(info) {
  return Number(info && (info.windowHeight || info.height || info.screenHeight)) || 0;
}

function isLandscapeViewport(info) {
  const width = getViewportWidth(info);
  const height = getViewportHeight(info);
  return width > height && height > 0;
}

function getLandscapeChromeStyles(info, forceLandscape) {
  const shouldUseLandscape = forceLandscape === true || isLandscapeViewport(info);
  if (!shouldUseLandscape) {
    return {
      pageSafeStyle: '',
      topbarSafeStyle: ''
    };
  }

  let width = getViewportWidth(info);
  let height = getViewportHeight(info);
  if (width > 0 && height > 0 && width < height) {
    const oldWidth = width;
    width = height;
    height = oldWidth;
  }
  const safeArea = info && info.safeArea || {};
  const deviceText = `${info && info.platform || ''} ${info && info.model || ''}`.toLowerCase();
  const isIphoneLike = /ios|iphone/.test(deviceText);

  const rawLeftInset = Number(safeArea.left) || 0;
  const rawRightInset = width && safeArea.right ? Math.max(0, width - Number(safeArea.right)) : 0;
  const rawBottomInset = height && safeArea.bottom ? Math.max(0, height - Number(safeArea.bottom)) : 0;

  // Some devices report portrait safe-area values immediately after landscape switch.
  // Treat very large landscape insets as stale data, otherwise the whole layout gets squeezed left.
  let leftInset = rawLeftInset > 0 && rawLeftInset < width * 0.22 ? rawLeftInset : 0;
  let rightInset = rawRightInset > 0 && rawRightInset < width * 0.14 ? rawRightInset : 0;
  let bottomInset = rawBottomInset > 0 && rawBottomInset < height * 0.18 ? rawBottomInset : 0;

  if (isIphoneLike) {
    leftInset = Math.max(leftInset, 44);
    bottomInset = Math.max(bottomInset, 6);
  }

  const pageLeft = 8 + Math.min(68, Math.ceil(leftInset));
  const pageRight = 8 + Math.min(18, Math.ceil(rightInset));
  const pageBottom = 8 + Math.min(14, Math.ceil(bottomInset));

  let menuReserve = 118;
  try {
    const mb = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
    if (mb && mb.left && width) {
      const measuredReserve = Math.ceil(width - mb.left + 10);
      if (measuredReserve > 70 && measuredReserve < 170) {
        menuReserve = measuredReserve;
      }
    }
  } catch (e) {}
  menuReserve = Math.min(150, Math.max(104, menuReserve));

  return {
    pageSafeStyle: [
      `padding-left:${pageLeft}px`,
      `padding-right:${pageRight}px`,
      `padding-bottom:${pageBottom}px`
    ].join(';') + ';',
    topbarSafeStyle: `padding-right:${menuReserve}px;`
  };
}

function mergeResizeInfo(baseInfo, sizeInfo) {
  const size = sizeInfo || {};
  const width = Number(size.windowWidth || size.width || size.screenWidth) || 0;
  const height = Number(size.windowHeight || size.height || size.screenHeight) || 0;
  return {
    ...(baseInfo || {}),
    ...size,
    ...(width ? { windowWidth: width, width } : {}),
    ...(height ? { windowHeight: height, height } : {})
  };
}

Page({
  data: {
    statusBarHeight: 20,
    navTotalHeight: 64,
    isLandscape: false,
    pageSafeStyle: '',
    topbarSafeStyle: '',
    ...buildSceneViewState(TAP_SCENE_DEMO),
    detailMode: 'word',
    showExtensions: false,
    courseId: '',
    courseOptions: [],
    courseIndex: 0,
    playingKey: '',
    audioStatus: '点读'
  },

  onLoad(options) {
    const courseIdFromShare = String(options && options.courseId || '').trim();
    const sceneIdFromShare = String(options && options.sceneId || '').trim();
    if (courseIdFromShare) {
      this._sharedCourseId = courseIdFromShare;
      saveTapSceneCourseId(courseIdFromShare);
    }
    if (sceneIdFromShare) {
      this._sharedSceneId = sceneIdFromShare;
    }

    let statusBarHeight = 20;
    let navTotalHeight = 64;
    try {
      const sys = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      statusBarHeight = sys.statusBarHeight || 20;
      const mb = wx.getMenuButtonBoundingClientRect && wx.getMenuButtonBoundingClientRect();
      navTotalHeight = mb && mb.bottom ? mb.bottom + (mb.top - statusBarHeight) : statusBarHeight + 44;
      this._lastWindowInfo = sys;
    } catch (e) {}

    this._audioCache = {};
    this._ttsInflight = {};
    this._orientationPreference = '';
    this._ensureCacheDir();
    try { wx.setInnerAudioOption({ obeyMuteSwitch: false, mixWithOther: true }); } catch (e) {}
    this.setData({
      statusBarHeight,
      navTotalHeight,
      isLandscape: isLandscapeViewport(this._lastWindowInfo),
      ...getLandscapeChromeStyles(this._lastWindowInfo)
    });
    this._loadRemoteScene(courseIdFromShare, sceneIdFromShare);
    this._prefetchSelectedAudio();
  },

  onResize(res) {
    const size = res && (res.size || res);
    try {
      const sys = wx.getWindowInfo ? wx.getWindowInfo() : {};
      this._lastWindowInfo = mergeResizeInfo(sys, size);
    } catch (e) {
      this._lastWindowInfo = mergeResizeInfo(this._lastWindowInfo, size);
    }
    const nextLandscape = this._orientationPreference
      ? this._orientationPreference === 'landscape'
      : isLandscapeViewport(this._lastWindowInfo);
    this.setData({
      isLandscape: nextLandscape,
      ...getLandscapeChromeStyles(this._lastWindowInfo, nextLandscape)
    });
  },

  onUnload() {
    this._stopAudio();
    this._setPageOrientation('portrait', { silent: true });
  },

  goBack() {
    const pages = getCurrentPages ? getCurrentPages() : [];
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/picture-words/index' });
  },

  toggleOrientation() {
    const nextOrientation = this.data.isLandscape ? 'portrait' : 'landscape';
    this._orientationPreference = nextOrientation;
    this._setPageOrientation(nextOrientation);
  },

  _setPageOrientation(orientation, options) {
    const opts = options || {};
    if (!opts.silent) {
      this._orientationPreference = orientation;
    }
    if (!wx.setPageOrientation) {
      const nextLandscape = orientation === 'landscape';
      this.setData({
        isLandscape: nextLandscape,
        ...getLandscapeChromeStyles(this._lastWindowInfo, nextLandscape)
      });
      if (!opts.silent) {
        wx.showToast({ title: nextLandscape ? '已切横屏布局' : '已切竖屏布局', icon: 'none', duration: 900 });
      }
      return;
    }

    wx.setPageOrientation({
      orientation,
      success: () => {
        const nextLandscape = orientation === 'landscape';
        try {
          this._lastWindowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        } catch (e) {}
        this.setData({
          isLandscape: nextLandscape,
          ...getLandscapeChromeStyles(this._lastWindowInfo, nextLandscape)
        });
        setTimeout(() => {
          try {
            this._lastWindowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
          } catch (e) {}
          this.setData({
            isLandscape: nextLandscape,
            ...getLandscapeChromeStyles(this._lastWindowInfo, nextLandscape)
          });
        }, 260);
      },
      fail: () => {
        const nextLandscape = orientation === 'landscape';
        this.setData({
          isLandscape: nextLandscape,
          ...getLandscapeChromeStyles(this._lastWindowInfo, nextLandscape)
        });
        if (!opts.silent) {
          wx.showToast({ title: nextLandscape ? '已切横屏布局' : '已切竖屏布局', icon: 'none', duration: 900 });
        }
      }
    });
  },

  _getSharePayload() {
    const scene = this.data.scene || {};
    const params = [];
    if (this.data.courseId) params.push(`courseId=${encodeURIComponent(this.data.courseId)}`);
    if (scene.id) params.push(`sceneId=${encodeURIComponent(scene.id)}`);
    const query = params.join('&');
    return {
      title: getTapSceneShareTitle(scene),
      path: query ? `/pages/tap-scene/index?${query}` : '/pages/tap-scene/index',
      imageUrl: scene.shareImage || scene.image || ''
    };
  },

  onShareAppMessage() {
    return this._getSharePayload();
  },

  onShareTimeline() {
    const payload = this._getSharePayload();
    const queryIndex = payload.path.indexOf('?');
    return {
      title: payload.title,
      query: queryIndex >= 0 ? payload.path.slice(queryIndex + 1) : '',
      imageUrl: payload.imageUrl
    };
  },

  async _loadRemoteScene(courseId, sceneId) {
    try {
      this.setData({ audioStatus: '加载中' });
      const pack = await loadTapScenePack({
        refresh: true,
        courseId: courseId || this._sharedCourseId || '',
        sceneId: sceneId || this._sharedSceneId || ''
      });
      if (!pack || !pack.scene || !Array.isArray(pack.scene.hotspots) || !pack.scene.hotspots.length) {
        this.setData({ audioStatus: '点读' });
        return;
      }
      const viewState = buildSceneViewState(pack.scene, this.data.selectedId, this.data.selectedPhraseId);
      const courseId = pack.course && pack.course.id || '';
      const courseOptions = formatCourseOptions(pack.course && pack.course.courses, courseId);
      this.setData({
        ...viewState,
        ...getLandscapeChromeStyles(this._lastWindowInfo, this.data.isLandscape),
        courseId,
        courseOptions,
        courseIndex: getCourseIndex(courseOptions, courseId),
        detailMode: 'word',
        audioStatus: pack.source === 'remote' ? '点读' : '本地兜底'
      });
      this._prefetchSelectedAudio(viewState.selected);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[tap-scene] load remote scene failed', e);
      }
      this.setData({ audioStatus: '本地兜底' });
    }
  },

  async switchCourse(e) {
    const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
    return this._switchCourseById(id);
  },

  switchCourseByIndex(e) {
    const index = Number(e && e.detail && e.detail.value) || 0;
    const item = this.data.courseOptions && this.data.courseOptions[index];
    if (!item || !item.id) return;
    this._switchCourseById(item.id);
  },

  async _switchCourseById(id) {
    if (!id || id === this.data.courseId) return;
    this._stopAudio();
    saveTapSceneCourseId(id);
    clearTapSceneContentCache();
    this.setData({ audioStatus: '切换中', playingKey: '' });
    try {
      const pack = await loadTapScenePack({ refresh: true, courseId: id });
      if (!pack || !pack.scene || !Array.isArray(pack.scene.hotspots) || !pack.scene.hotspots.length) {
        this.setData({ audioStatus: '加载失败' });
        return;
      }
      const viewState = buildSceneViewState(pack.scene, '', '');
      const courseId = pack.course && pack.course.id || id;
      const courseOptions = formatCourseOptions(pack.course && pack.course.courses, courseId);
      this.setData({
        ...viewState,
        ...getLandscapeChromeStyles(this._lastWindowInfo, this.data.isLandscape),
        courseId,
        courseOptions,
        courseIndex: getCourseIndex(courseOptions, courseId),
        detailMode: 'word',
        showExtensions: false,
        audioStatus: '点读'
      });
      this._prefetchSelectedAudio(viewState.selected);
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[tap-scene] switch course failed', err);
      }
      this.setData({ audioStatus: '切换失败' });
    }
  },

  selectHotspot(e) {
    const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
    const formattedHotspots = formatHotspots(this.data.scene, id);
    const formattedWords = formatSceneWords(this.data.scene, id);
    const formattedExtensionWords = formatExtensionWords(this.data.scene, id);
    const selected = formattedHotspots.find((item) => item.id === id);
    if (!selected) return;
    this.setData({
      detailMode: 'word',
      selectedId: selected.id,
      selected,
      selectedPhraseId: '',
      selectedPhrase: {},
      phrases: formatPhrases(this.data.scene, ''),
      hotspots: formattedHotspots,
      words: formattedWords,
      extensionWords: formattedExtensionWords,
      audioStatus: '点读'
    });
    this._prefetchSelectedAudio(selected);
    this.speakWord();
  },

  selectFromList(e) {
    const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
    const formattedHotspots = formatHotspots(this.data.scene, id);
    const formattedWords = formatSceneWords(this.data.scene, id);
    const formattedExtensionWords = formatExtensionWords(this.data.scene, id);
    const allWords = formatWords(this.data.scene, id);
    const selected = allWords.find((item) => item.id === id);
    if (!selected) return;
    this.setData({
      detailMode: 'word',
      selectedId: selected.id,
      selected,
      selectedPhraseId: '',
      selectedPhrase: {},
      phrases: formatPhrases(this.data.scene, ''),
      hotspots: formattedHotspots,
      words: formattedWords,
      extensionWords: formattedExtensionWords,
      showExtensions: selected.isExtension ? true : this.data.showExtensions,
      audioStatus: '点读'
    });
    this._prefetchSelectedAudio(selected);
    this.speakWord();
  },

  toggleExtensions() {
    this.setData({
      showExtensions: !this.data.showExtensions
    });
  },

  speakWord() {
    const selected = this.data.selected;
    if (!selected || !selected.korean) return;
    this._speak(selected.korean, 'ko-KR', `word:${selected.id}`, selected.korean, selected.audio);
  },

  speakExample() {
    const selected = this.data.selected;
    if (!selected || !selected.exampleKo) return;
    this._speak(selected.exampleKo, 'ko-KR', `example:${selected.id}`, '例句', selected.exampleAudio);
  },

  speakPhrase(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id || this.data.selectedPhraseId;
    const formattedPhrases = formatPhrases(this.data.scene, id);
    const phrase = formattedPhrases.find((item) => item.id === id);
    if (!phrase || !phrase.kr) return;
    this.setData({
      detailMode: 'phrase',
      selectedId: '',
      selected: {},
      hotspots: formatHotspots(this.data.scene, ''),
      words: formatSceneWords(this.data.scene, ''),
      extensionWords: formatExtensionWords(this.data.scene, ''),
      selectedPhraseId: phrase.id,
      selectedPhrase: phrase,
      phrases: formattedPhrases,
      audioStatus: '点读'
    });
    this._speak(phrase.kr, 'ko-KR', `phrase:${phrase.id}`, '场景句', phrase.audio);
  },

  _ensureCacheDir() {
    try {
      wx.getFileSystemManager().mkdirSync(AUDIO_CACHE_DIR, true);
    } catch (e) {}
  },

  _hasLocalFile(path) {
    try {
      wx.getFileSystemManager().accessSync(path);
      return true;
    } catch (e) {
      return false;
    }
  },

  _getAudioCacheKey(text, lang) {
    return sha256(`${AUDIO_CACHE_VERSION}|${lang}|${String(text || '').trim()}`);
  },

  _prefetchSelectedAudio(selected) {
    const item = selected || this.data.selected;
    if (!item) return;
    if (item.korean && !item.audio) this._getCachedTtsSrc(item.korean, 'ko-KR').catch(() => {});
    if (item.exampleKo && !item.exampleAudio) this._getCachedTtsSrc(item.exampleKo, 'ko-KR').catch(() => {});
  },

  _getCachedTtsSrc(text, lang) {
    const normalizedText = String(text || '').trim();
    const normalizedLang = String(lang || 'ko-KR');
    if (!normalizedText) return Promise.reject(new Error('Missing TTS text'));

    this._ensureCacheDir();
    if (!this._audioCache) this._audioCache = {};
    if (!this._ttsInflight) this._ttsInflight = {};

    const cacheKey = this._getAudioCacheKey(normalizedText, normalizedLang);
    const cachePath = `${AUDIO_CACHE_DIR}/${cacheKey}.mp3`;

    if (this._audioCache[cacheKey] && this._hasLocalFile(this._audioCache[cacheKey])) {
      return Promise.resolve(this._audioCache[cacheKey]);
    }
    if (this._hasLocalFile(cachePath)) {
      this._audioCache[cacheKey] = cachePath;
      return Promise.resolve(cachePath);
    }
    if (this._ttsInflight[cacheKey]) return this._ttsInflight[cacheKey];

    this._ttsInflight[cacheKey] = this._requestEdgeTtsToCache(normalizedText, normalizedLang, cachePath, cacheKey)
      .then((src) => {
        delete this._ttsInflight[cacheKey];
        return src;
      }, (err) => {
        delete this._ttsInflight[cacheKey];
        throw err;
      });

    return this._ttsInflight[cacheKey];
  },

  _requestEdgeTtsToCache(text, lang, cachePath, cacheKey) {
    if (!wx.cloud || !wx.cloud.callFunction) {
      return Promise.reject(new Error('wx.cloud unavailable'));
    }

    const fs = wx.getFileSystemManager();
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'edgeTts',
        timeout: 15000,
        data: { text, lang },
        success: (res) => {
          const result = res && res.result || {};
          if (!result.ok || !result.audioBase64) {
            reject(new Error(result.error || 'edgeTts empty'));
            return;
          }
          this._ensureCacheDir();
          try { fs.unlinkSync(cachePath); } catch (e) {}
          fs.writeFile({
            filePath: cachePath,
            data: result.audioBase64,
            encoding: 'base64',
            success: () => {
              this._audioCache[cacheKey] = cachePath;
              resolve(cachePath);
            },
            fail: (e) => reject(new Error('write audio failed: ' + JSON.stringify(e)))
          });
        },
        fail: (e) => reject(new Error('edgeTts failed: ' + JSON.stringify(e)))
      });
    });
  },

  async _speak(text, lang, playingKey, label, audioSrc) {
    const normalizedText = String(text || '').trim();
    if (!normalizedText) return;
    const token = Date.now();
    this._speakToken = token;
    this.setData({ playingKey, audioStatus: '准备中' });

    try {
      const src = audioSrc || await this._getCachedTtsSrc(normalizedText, lang);
      if (this._speakToken !== token) return;
      await this._playAudioSrc(src, normalizedText, playingKey);
    } catch (e) {
      if (this._speakToken === token) {
        this.setData({ playingKey: '', audioStatus: '发音失败' });
      }
    }
  },

  _playAudioSrc(src, text, playingKey) {
    this._stopAudio();

    return new Promise((resolve) => {
      const ctx = wx.createInnerAudioContext();
      this._audioCtx = ctx;
      let settled = false;
      let started = false;
      let timer = null;

      const finish = (ok) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (this._audioCtx === ctx) this._audioCtx = null;
        try { ctx.stop(); } catch (e) {}
        try { ctx.destroy(); } catch (e) {}
        this.setData({
          playingKey: '',
          audioStatus: ok ? '点读' : '已停止'
        });
        resolve(Boolean(ok));
      };

      ctx.onCanplay(() => {
        try { ctx.play(); } catch (e) {}
      });
      ctx.onPlay(() => {
        started = true;
        this.setData({ playingKey, audioStatus: '朗读中' });
      });
      ctx.onEnded(() => finish(true));
      ctx.onStop(() => finish(false));
      ctx.onError(() => finish(started));

      timer = setTimeout(() => finish(started), 12000);
      ctx.autoplay = false;
      ctx.src = src;
      try { ctx.play(); } catch (e) {}
    });
  },

  _stopAudio() {
    if (!this._audioCtx) return;
    try { this._audioCtx.stop(); } catch (e) {}
    try { this._audioCtx.destroy(); } catch (e) {}
    this._audioCtx = null;
  }
});
