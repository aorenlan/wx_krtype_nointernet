import { getWords, getCategories, getYonseiLessons, getTopikLevels, getTopikSessions } from '../../utils_nv/api';
import { decomposeKoreanStructure } from '../../utils/hangul';
import { saveMistake, removeMistake, getMistakes, getProgress, saveProgressV2 } from '../../utils_nv/storage';
import { KEYBOARD_LAYOUT } from '../../constants/index';

const AUDIO_ORIGIN = 'https://enoss.aorenlan.fun';
const AUDIO_BASE_PATH = '/kr_word';

const DEFAULT_SETTINGS = {
    practiceMode: 'study',
    flashDuration: 2000,
    repeatCount: 1,
    cardShowWord: true,
    cardShowMeaning: true,
    enableTimer: false,
    timerDuration: 10,
    enableKeyboardHint: true,
    autoCheckSpelling: true,
    autoPronounce: false,
    pronounceMeaning: false,
    category: 'TOPIK Vocabulary',
    keyboardVisualMode: 'korean',
    yonseiLessonId: '',
    yonseiLessonName: '',
    topikLevel: '1',
    topikSession: ''
};

const KEY_TO_KOR = (() => {
    const map = Object.create(null);
    for (const row of KEYBOARD_LAYOUT) {
        for (const k of row) {
            if (k && k.char) map[k.char] = k.korChar || k.char;
            if (k && k.shiftChar) map[k.shiftChar] = k.shiftKorChar || k.korChar || k.shiftChar;
        }
    }
    map.SPACE = ' ';
    return map;
})();

const INITIAL_KEY_TO_INDEX = {
    r: 0, R: 1, s: 2, e: 3, E: 4, f: 5, a: 6, q: 7, Q: 8, t: 9, T: 10, d: 11, w: 12, W: 13, c: 14, z: 15, x: 16, v: 17, g: 18
};

const VOWEL_SEQ_TO_INDEX = {
    k: 0, o: 1, i: 2, O: 3, j: 4, p: 5, u: 6, P: 7, h: 8, hk: 9, ho: 10, hl: 11, y: 12, n: 13, nj: 14, np: 15, nl: 16, b: 17, m: 18, ml: 19, l: 20
};

const FINAL_SEQ_TO_INDEX = {
    '': 0, r: 1, R: 2, rt: 3, s: 4, sw: 5, sg: 6, e: 7, f: 8, fr: 9, fa: 10, fq: 11, ft: 12, fx: 13, fv: 14, fg: 15, a: 16, q: 17, qt: 18, t: 19, T: 20, d: 21, w: 22, c: 23, z: 24, x: 25, v: 26, g: 27
};

const normalizeIndex = (rawIndex, length) => {
    const len = Number(length);
    if (!Number.isFinite(len) || len <= 0) return 0;
    const n = Number(rawIndex);
    const idx = Number.isFinite(n) ? Math.trunc(n) : 0;
    return ((idx % len) + len) % len;
};

const safeWordId = (w) => {
    if (!w) return '';
    if (w.id != null) return String(w.id);
    if (w.word != null) return String(w.word);
    return '';
};

const composeHangulFromKeyPrefix = (keys) => {
    if (!keys || keys.length === 0) return '';
    if (keys[0] === 'SPACE') return ' ';

    const first = keys[0];
    const initialIndex = INITIAL_KEY_TO_INDEX[first];
    if (initialIndex == null) {
        return KEY_TO_KOR[first] || '';
    }

    if (keys.length === 1) {
        return KEY_TO_KOR[first] || '';
    }

    let pos = 1;
    let vowelIndex = null;
    if (pos < keys.length) {
        const two = pos + 1 < keys.length ? `${keys[pos]}${keys[pos + 1]}` : '';
        if (two && VOWEL_SEQ_TO_INDEX[two] != null) {
            vowelIndex = VOWEL_SEQ_TO_INDEX[two];
            pos += 2;
        } else if (VOWEL_SEQ_TO_INDEX[keys[pos]] != null) {
            vowelIndex = VOWEL_SEQ_TO_INDEX[keys[pos]];
            pos += 1;
        }
    }

    if (vowelIndex == null) {
        return KEY_TO_KOR[first] || '';
    }

    let finalIndex = 0;
    if (pos < keys.length) {
        const two = pos + 1 < keys.length ? `${keys[pos]}${keys[pos + 1]}` : '';
        if (two && FINAL_SEQ_TO_INDEX[two] != null) {
            finalIndex = FINAL_SEQ_TO_INDEX[two];
        } else if (FINAL_SEQ_TO_INDEX[keys[pos]] != null) {
            finalIndex = FINAL_SEQ_TO_INDEX[keys[pos]];
        }
    }

    const code = 0xAC00 + (initialIndex * 21 + vowelIndex) * 28 + finalIndex;
    return String.fromCharCode(code);
};

const sanitizeSettings = (raw) => {
    const merged = Object.assign({}, DEFAULT_SETTINGS, raw || {});
    delete merged.darkMode;
    delete merged.showHint;
    if (merged.practiceMode !== 'study' && merged.practiceMode !== 'flash') {
        merged.practiceMode = DEFAULT_SETTINGS.practiceMode;
    }
    if (merged.keyboardVisualMode !== 'korean' && merged.keyboardVisualMode !== 'english' && merged.keyboardVisualMode !== 'korean_hide_english' && merged.keyboardVisualMode !== 'english_only') {
        merged.keyboardVisualMode = DEFAULT_SETTINGS.keyboardVisualMode;
    }
    if (merged.topikLevel != null) merged.topikLevel = String(merged.topikLevel);
    if (merged.topikSession != null) merged.topikSession = String(merged.topikSession);
    let repeatCount = Number(merged.repeatCount);
    if (!Number.isFinite(repeatCount)) repeatCount = DEFAULT_SETTINGS.repeatCount;
    repeatCount = Math.max(1, Math.min(10, Math.round(repeatCount)));
    merged.repeatCount = repeatCount;
    return merged;
};

Page({
    data: {
        words: [],
        currentIndex: 0,
        currentWord: null, 
        repeatCorrectCount: 0,
        categories: [],
        yonseiLessons: [],
        categoryPickerIndex: 0,
        yonseiLessonPickerIndex: 0,
        yonseiLessonOptions: [],
        yonseiLessonDisplay: '请选择',
        showYonseiSub: false,
        topikLevels: [],
        topikLevelPickerIndex: 0,
        topikSessions: [],
        showTopikSub: false,
        displayCategory: '',
        prevWordInfo: null,
        helpReveal: false,
        
        // Typing State (Korean)
        typingState: {
            targetText: '',
            requiredKeys: [], 
            currentKeyIndex: 0,
            userInput: '',
            isShiftActive: false,
            isComplete: false,
            targetStructure: [], 
            nextKey: null
        },
        displayChars: [], 
        legacyDisplayChars: [],
        measureChars: [],
        useLegacyWrapMode: false,

        settings: Object.assign({}, DEFAULT_SETTINGS),
        
        // UI States
        loading: true,
        isError: false,
        isCorrect: false,
        showAnswer: false,
        isWordVisible: true,
        timeLeft: 0,
        hasInteracted: false,
        isKeyboardOpen: false, 
        showSettingsModal: false,
        keyboardOffsetBottom: 280, 
        
        statusBarHeight: 20,
        navBarHeight: 44
    },

    async onLoad() {
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        
        const storedSettings = wx.getStorageSync('settings') || {};
        const mergedSettings = sanitizeSettings(storedSettings);

        this.wordAudio = null;
        this.cnAudio = null;
        this._audioPlaySeq = 0;
        this._autoPronouncedWordId = null;
        this._audioUrlMemo = new Map();
        this._audioFileLRU = new Map();
        this._audioFileLRUCapacity = 200;
        this._audioFileInFlight = new Map();
        this._preloadTask = null;
        this._preloadNextKey = null;
        this._hasPlayedAudioOnce = false;

        this.setData({
            statusBarHeight: windowInfo.statusBarHeight || 20,
            navBarHeight: 44, 
            settings: mergedSettings,
            isKeyboardOpen: false,
            timeLeft: mergedSettings.timerDuration || DEFAULT_SETTINGS.timerDuration
        });
        
        await this.loadCategories();
        await this.loadSubcategories();
        this.updateDisplayCategory();
        this.loadWords();
    },

    onUnload() {
        this.persistCurrentProgress();
        this.cancelAudioPreload();
        this.clearAudioFileLRU();
        this.clearAllTimers();
        try {
            if (this.wordAudio) this.wordAudio.destroy();
            if (this.cnAudio) this.cnAudio.destroy();
        } catch (e) {}
        this.wordAudio = null;
        this.cnAudio = null;
    },

    cancelAudioPreload() {
        try {
            if (this._preloadTask && typeof this._preloadTask.abort === 'function') {
                this._preloadTask.abort();
            }
        } catch (e) {}
        this._preloadTask = null;
        this._preloadNextKey = null;
    },

    clearAudioFileLRU() {
        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        try {
            const entries = this._audioFileLRU && this._audioFileLRU.values ? Array.from(this._audioFileLRU.values()) : [];
            entries.forEach((p) => {
                if (p && fs && fs.unlinkSync) {
                    try { fs.unlinkSync(p); } catch (e) {}
                }
            });
        } catch (e) {}
        this._audioFileLRU = new Map();
        this._audioFileInFlight = new Map();
    },

    hasLocalAudioFile(p) {
        const path = p ? String(p) : '';
        if (!path) return false;
        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        if (!fs) return true;
        try {
            if (typeof fs.accessSync === 'function') {
                fs.accessSync(path);
            } else if (typeof fs.statSync === 'function') {
                fs.statSync(path);
            }
            return true;
        } catch (e) {
            return false;
        }
    },

    getAudioFileFromLRU(cacheKey) {
        const key = cacheKey ? String(cacheKey) : '';
        if (!key || !this._audioFileLRU || !this._audioFileLRU.has) return '';
        const p = this._audioFileLRU.get(key);
        if (!p || !this.hasLocalAudioFile(p)) {
            try { this._audioFileLRU.delete(key); } catch (e) {}
            return '';
        }
        try {
            this._audioFileLRU.delete(key);
            this._audioFileLRU.set(key, p);
        } catch (e) {}
        return String(p);
    },

    setAudioFileToLRU(cacheKey, tempPath) {
        const key = cacheKey ? String(cacheKey) : '';
        const p = tempPath ? String(tempPath) : '';
        if (!key || !p) return;
        if (!this._audioFileLRU) this._audioFileLRU = new Map();
        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        const prev = this._audioFileLRU.get(key);
        if (prev && prev !== p && fs && fs.unlinkSync) {
            try { fs.unlinkSync(prev); } catch (e) {}
        }
        try {
            this._audioFileLRU.delete(key);
        } catch (e) {}
        this._audioFileLRU.set(key, p);
        const cap = Number(this._audioFileLRUCapacity || 200) || 200;
        while (this._audioFileLRU.size > cap) {
            const oldestKey = this._audioFileLRU.keys().next().value;
            const oldestPath = this._audioFileLRU.get(oldestKey);
            this._audioFileLRU.delete(oldestKey);
            if (oldestPath && fs && fs.unlinkSync) {
                try { fs.unlinkSync(oldestPath); } catch (e) {}
            }
        }
    },

    downloadAudioToLRU(cacheKey, urls) {
        const key = cacheKey ? String(cacheKey) : '';
        if (!key) return Promise.resolve('');
        const cached = this.getAudioFileFromLRU(key);
        if (cached) return Promise.resolve(cached);
        if (!this._audioFileInFlight) this._audioFileInFlight = new Map();
        if (this._audioFileInFlight.has(key)) return this._audioFileInFlight.get(key);

        const candidates = Array.isArray(urls) ? urls.filter(Boolean) : [];
        const task = new Promise((resolve) => {
            const tryNext = (idx) => {
                const url = candidates[idx];
                if (!url) return resolve('');
                try {
                    wx.downloadFile({
                        url,
                        success: (res) => {
                            const ok = !!(res && res.statusCode === 200 && res.tempFilePath);
                            if (!ok) return tryNext(idx + 1);
                            const p = String(res.tempFilePath);
                            if (this._audioUrlMemo && this._audioUrlMemo.set) {
                                this._audioUrlMemo.set(key, url);
                            }
                            this.setAudioFileToLRU(key, p);
                            resolve(p);
                        },
                        fail: () => tryNext(idx + 1)
                    });
                } catch (e) {
                    tryNext(idx + 1);
                }
            };
            tryNext(0);
        })
            .then((p) => {
                try { this._audioFileInFlight.delete(key); } catch (e) {}
                return p;
            })
            .catch(() => {
                try { this._audioFileInFlight.delete(key); } catch (e) {}
                return '';
            });

        this._audioFileInFlight.set(key, task);
        return task;
    },

    getProgressSubKey(settings) {
        const s = settings || DEFAULT_SETTINGS;
        const category = s.category || DEFAULT_SETTINGS.category;
        if (category === 'TOPIK Vocabulary') {
            const level = s.topikLevel != null ? String(s.topikLevel) : '';
            const session = s.topikSession != null ? String(s.topikSession) : '';
            return `topik_${level}__${session}`;
        }
        if (/^Yonsei\s+\d$/.test(category)) {
            const lessonId = s.yonseiLessonId != null ? String(s.yonseiLessonId) : '';
            return `yonsei_${lessonId}`;
        }
        return '';
    },

    persistCurrentProgress(indexOverride) {
        try {
            const s = this.data.settings || DEFAULT_SETTINGS;
            const category = s.category || DEFAULT_SETTINGS.category;
            const subKey = this.getProgressSubKey(s);
            const index = indexOverride != null ? Number(indexOverride) : Number(this.data.currentIndex || 0);
            saveProgressV2(category, subKey, index);
        } catch (e) {}
    },

    async loadCategories() {
        const categories = await getCategories();
        if (!categories.includes('Mistakes (错题本)')) {
            categories.push('Mistakes (错题本)');
        }
        const current = (this.data.settings && this.data.settings.category) || DEFAULT_SETTINGS.category;
        const idx = Math.max(0, categories.indexOf(current));
        this.setData({ categories, categoryPickerIndex: idx });
    },

    async onShow() {
        if (typeof this.getTabBar === 'function' && this.getTabBar()) {
            this.getTabBar().setData({ selected: 0 });
        }
        const newSettings = wx.getStorageSync('settings') || {};
        const mergedSettings = sanitizeSettings(newSettings);
        const prevCategory = (this.data.settings && this.data.settings.category) || DEFAULT_SETTINGS.category;
        const nextCategory = mergedSettings.category || DEFAULT_SETTINGS.category;
        const categoryChanged = prevCategory !== nextCategory;
        const categoryIndex = Math.max(0, (this.data.categories || []).indexOf(nextCategory));

        this.setData({ settings: mergedSettings, categoryPickerIndex: categoryIndex });
        await this.loadSubcategories();
        this.updateDisplayCategory();

        if (categoryChanged) {
            this.loadWords();
        }
    },

    async loadSubcategories() {
        const category = (this.data.settings && this.data.settings.category) || DEFAULT_SETTINGS.category;

        if (category === 'TOPIK Vocabulary') {
            const topikLevels = await getTopikLevels();
            let topikLevel = (this.data.settings && this.data.settings.topikLevel) || '';
            topikLevel = String(topikLevel || topikLevels[0] || DEFAULT_SETTINGS.topikLevel || '1');
            if (topikLevels.length > 0 && !topikLevels.includes(topikLevel)) {
                topikLevel = String(topikLevels[0]);
            }

            const topikSessions = await getTopikSessions(topikLevel);
            let topikSession = (this.data.settings && this.data.settings.topikSession) || '';
            topikSession = String(topikSession || topikSessions[0] || '');
            if (topikSession && topikSessions.length > 0 && !topikSessions.includes(topikSession)) {
                topikSession = String(topikSessions[0] || '');
            }

            const nextSettings = Object.assign({}, this.data.settings || {});
            nextSettings.topikLevel = topikLevel;
            nextSettings.topikSession = topikSession;
            nextSettings.yonseiLessonId = '';
            nextSettings.yonseiLessonName = '';

            const topikIdx = Math.max(0, (topikLevels || []).findIndex(l => String(l) === String(topikLevel)));
            const next = sanitizeSettings(nextSettings);

            this.setData({
                topikLevels,
                topikLevelPickerIndex: topikIdx,
                topikSessions,
                showTopikSub: true,
                yonseiLessons: [],
                yonseiLessonOptions: [],
                yonseiLessonDisplay: '请选择',
                yonseiLessonPickerIndex: 0,
                showYonseiSub: false,
                settings: next
            });
            wx.setStorageSync('settings', next);
            return;
        }

        if (/^Yonsei\s+\d$/.test(category)) {
            const yonseiLessons = await getYonseiLessons(category);
            const currentLessonId = (this.data.settings && this.data.settings.yonseiLessonId) || '';
            let yonseiLessonId = currentLessonId;
            let yonseiLessonName = (this.data.settings && this.data.settings.yonseiLessonName) || '';

            if (!yonseiLessonId && yonseiLessons.length > 0) {
                yonseiLessonId = yonseiLessons[0].id;
                yonseiLessonName = yonseiLessons[0].name || yonseiLessons[0].original || '';
            } else if (yonseiLessonId) {
                const match = yonseiLessons.find(l => String(l.id) === String(yonseiLessonId));
                if (match) yonseiLessonName = match.name || match.original || '';
            }

            const newSettings = Object.assign({}, this.data.settings || {});
            newSettings.yonseiLessonId = yonseiLessonId;
            newSettings.yonseiLessonName = yonseiLessonName;
            const yonseiLessonOptions = (yonseiLessons || []).map((l) => {
                const name = (l.original || l.name || '').trim();
                return name ? `${l.id} · ${name}` : `${l.id}`;
            });
            const yonseiIdx = Math.max(0, (yonseiLessons || []).findIndex(l => String(l.id) === String(yonseiLessonId)));
            const display = yonseiLessonOptions[yonseiIdx] || '请选择';
            this.setData({
                yonseiLessons,
                yonseiLessonOptions,
                yonseiLessonDisplay: display,
                yonseiLessonPickerIndex: yonseiIdx,
                showYonseiSub: true,
                topikLevels: [],
                topikLevelPickerIndex: 0,
                topikSessions: [],
                showTopikSub: false,
                settings: sanitizeSettings(newSettings)
            });
            wx.setStorageSync('settings', sanitizeSettings(newSettings));
            return;
        }

        const newSettings = Object.assign({}, this.data.settings || {});
        newSettings.yonseiLessonId = '';
        newSettings.yonseiLessonName = '';
        this.setData({
            yonseiLessons: [],
            yonseiLessonOptions: [],
            yonseiLessonDisplay: '请选择',
            yonseiLessonPickerIndex: 0,
            showYonseiSub: false,
            topikLevels: [],
            topikLevelPickerIndex: 0,
            topikSessions: [],
            showTopikSub: false,
            settings: sanitizeSettings(newSettings)
        });
        wx.setStorageSync('settings', sanitizeSettings(newSettings));
    },

    updateDisplayCategory() {
        const s = this.data.settings || DEFAULT_SETTINGS;
        let text = s.category || DEFAULT_SETTINGS.category;
        if (text === 'TOPIK Vocabulary' && s.topikLevel) {
            text = `${text} · TOPIK ${s.topikLevel}`;
            if (s.topikSession) text = `${text} · ${s.topikSession}`;
        }
        if (/^Yonsei\s+\d$/.test(text) && s.yonseiLessonId) {
            const lessonTitle = s.yonseiLessonName ? ` · ${s.yonseiLessonName}` : '';
            text = `${text} · ${s.yonseiLessonId}${lessonTitle}`;
        }
        this.setData({ displayCategory: text });
    },

    async loadWords() {
        this.clearAllTimers();
        this.cancelAudioPreload();
        this.setData({ loading: true, prevWordInfo: null });
        const s = this.data.settings || DEFAULT_SETTINGS;
        const category = s.category || 'TOPIK Vocabulary';
        const subKey = this.getProgressSubKey(s);
        
        if (category === 'Mistakes (错题本)') {
            const mistakes = getMistakes();
            const savedIndex = Number(getProgress(category, subKey) || 0);
            const startIndex = normalizeIndex(savedIndex, mistakes.length);
            return this.setData(
                {
                    words: mistakes,
                    loading: false,
                    currentIndex: startIndex,
                    currentWord: null
                },
                () => {
                    if (mistakes.length > 0) {
                        this.startWord(startIndex);
                    } else {
                        this.setData({ words: [], loading: false, currentWord: null, prevWordInfo: null });
                        wx.showToast({ title: '暂无错题', icon: 'none' });
                    }
                }
            );
        }

        const filters = {};
        if (category === 'TOPIK Vocabulary' && s.topikLevel) filters.topikLevel = s.topikLevel;
        if (category === 'TOPIK Vocabulary' && s.topikSession) filters.topikSession = s.topikSession;
        if (/^Yonsei\s+\d$/.test(category) && s.yonseiLessonId) filters.lessonId = s.yonseiLessonId;
        if (s.wordLengthFilter) filters.minLength = s.wordLengthFilter;
        if (s.wordStartFilter) filters.firstLetter = s.wordStartFilter;
        const res = await getWords(category, 50, 0, filters); 
        if (res && res.words) {
            const savedIndex = Number(getProgress(category, subKey) || 0);
            const startIndex = normalizeIndex(savedIndex, res.words.length);
            this.setData(
                {
                    words: res.words,
                    loading: false,
                    currentIndex: startIndex,
                    currentWord: null
                },
                () => {
                    if (res.words.length > 0) {
                        this.startWord(startIndex);
                    }
                }
            );
        } else {
            this.setData({ words: [], loading: false, currentWord: null, prevWordInfo: null });
        }
    },

    openSettings() {
        this.setData({ showSettingsModal: true });
    },

    closeSettings() {
        this.setData({ showSettingsModal: false });
    },

    preventBubble() {},

    applyCategorySelection(category, categoryIndex) {
        if (!category) return;
        const nextSettings = Object.assign({}, this.data.settings || {});
        nextSettings.category = category;
        nextSettings.yonseiLessonId = '';
        nextSettings.yonseiLessonName = '';
        this.setData({
            settings: sanitizeSettings(nextSettings),
            categoryPickerIndex: typeof categoryIndex === 'number' ? categoryIndex : this.data.categoryPickerIndex,
            prevWordInfo: null,
            currentWord: null
        });
        wx.setStorageSync('settings', sanitizeSettings(nextSettings));
        this.loadSubcategories().then(() => {
            this.updateDisplayCategory();
            this.loadWords();
        });
    },

    onCategoryPickerChange(e) {
        const index = Number(e.detail && e.detail.value);
        const category = (this.data.categories || [])[index];
        this.applyCategorySelection(category, index);
    },

    selectCategory(e) {
        const category = e.currentTarget.dataset.category;
        const idx = Math.max(0, (this.data.categories || []).indexOf(category));
        this.applyCategorySelection(category, idx);
    },

    selectYonseiLesson(e) {
        const lessonId = e.currentTarget.dataset.lessonId;
        const lessonName = e.currentTarget.dataset.lessonName || '';
        const nextSettings = Object.assign({}, this.data.settings || {});
        nextSettings.yonseiLessonId = String(lessonId);
        nextSettings.yonseiLessonName = String(lessonName);
        const idx = Math.max(0, (this.data.yonseiLessons || []).findIndex(l => String(l.id) === String(lessonId)));
        const display = (this.data.yonseiLessonOptions || [])[idx] || '请选择';
        this.setData({ settings: sanitizeSettings(nextSettings), yonseiLessonPickerIndex: idx, yonseiLessonDisplay: display });
        wx.setStorageSync('settings', sanitizeSettings(nextSettings));
        this.updateDisplayCategory();
        this.loadWords();
    },

    onYonseiLessonPickerChange(e) {
        const index = Number(e.detail && e.detail.value);
        const lesson = (this.data.yonseiLessons || [])[index];
        if (!lesson) return;
        const lessonId = String(lesson.id);
        const lessonName = String(lesson.original || lesson.name || '');
        const nextSettings = Object.assign({}, this.data.settings || {});
        nextSettings.yonseiLessonId = lessonId;
        nextSettings.yonseiLessonName = lessonName;
        const display = (this.data.yonseiLessonOptions || [])[index] || '请选择';
        this.setData({ settings: sanitizeSettings(nextSettings), yonseiLessonPickerIndex: index, yonseiLessonDisplay: display });
        wx.setStorageSync('settings', sanitizeSettings(nextSettings));
        this.updateDisplayCategory();
        this.loadWords();
    },

    async onTopikLevelPickerChange(e) {
        const index = Number(e.detail && e.detail.value);
        const level = (this.data.topikLevels || [])[index];
        if (!level) return;

        const topikLevel = String(level);
        const topikSessions = await getTopikSessions(topikLevel);
        const currentSession = (this.data.settings && this.data.settings.topikSession) || '';
        const topikSession = currentSession && topikSessions.includes(String(currentSession)) ? String(currentSession) : String(topikSessions[0] || '');

        const nextSettings = Object.assign({}, this.data.settings || {});
        nextSettings.topikLevel = topikLevel;
        nextSettings.topikSession = topikSession;
        const next = sanitizeSettings(nextSettings);

        this.setData({
            settings: next,
            topikLevelPickerIndex: index,
            topikSessions
        });
        wx.setStorageSync('settings', next);
        this.updateDisplayCategory();
        this.loadWords();
    },

    selectTopikSession(e) {
        const session = e.currentTarget.dataset.session;
        const topikSession = String(session || '');
        const nextSettings = Object.assign({}, this.data.settings || {});
        nextSettings.topikSession = topikSession;
        const next = sanitizeSettings(nextSettings);
        this.setData({ settings: next });
        wx.setStorageSync('settings', next);
        this.updateDisplayCategory();
        this.loadWords();
    },

    clearAllTimers() {
        if (this.flashTimer) clearTimeout(this.flashTimer);
        if (this.quizTimer) clearInterval(this.quizTimer);
        this.flashTimer = null;
        this.quizTimer = null;
        if (this.helpRevealTimer) clearTimeout(this.helpRevealTimer);
        this.helpRevealTimer = null;
        if (this.completeTimer) clearTimeout(this.completeTimer);
        this.completeTimer = null;
    },

    startModeLogic() {
        const { practiceMode, flashDuration } = this.data.settings || DEFAULT_SETTINGS;

        this.setData({ isWordVisible: true }, () => {
            this.updateDisplay(this.data.typingState);
        });

        if (practiceMode === 'flash') {
            this.flashTimer = setTimeout(() => {
                this.setData({ isWordVisible: false }, () => {
                    this.updateDisplay(this.data.typingState);
                });
            }, Number(flashDuration) || DEFAULT_SETTINGS.flashDuration);
        }
    },

    startQuizTimer() {
        const { enableTimer, timerDuration } = this.data.settings || DEFAULT_SETTINGS;
        if (!enableTimer) return;

        if (this.quizTimer) clearInterval(this.quizTimer);
        this.setData({ timeLeft: Number(timerDuration) || DEFAULT_SETTINGS.timerDuration });

        this.quizTimer = setInterval(() => {
            if (this.data.timeLeft <= 1) {
                this.setData({ timeLeft: 0, isWordVisible: true }, () => {
                    this.updateDisplay(this.data.typingState);
                });
                if (this.quizTimer) clearInterval(this.quizTimer);
                this.quizTimer = null;
                setTimeout(() => {
                    if (!this.data.currentWord) return;
                    this.nextWord();
                }, 600);
            } else {
                this.setData({ timeLeft: this.data.timeLeft - 1 });
            }
        }, 1000);
    },

    updateSetting(e) {
        const { key, value } = e.currentTarget.dataset;
        let val = value;
        if (e.type === 'change' && e.detail && e.detail.value !== undefined) {
            val = e.detail.value;
        }
        const newSettings = Object.assign({}, this.data.settings || {});
        newSettings[key] = val;
        const next = sanitizeSettings(newSettings);
        this.setData({ settings: next });
        wx.setStorageSync('settings', next);

        if (key === 'practiceMode' || key === 'flashDuration') {
            this.clearAllTimers();
            this.startModeLogic();
            if (this.data.hasInteracted) this.startQuizTimer();
        }

        if (key === 'cardShowWord') {
            this.updateDisplay(this.data.typingState);
            this.updateWordWrapMode(true);
        }

        if (key === 'cardShowMeaning') {
            this.updateMeaningSize();
        }

        if (key === 'timerDuration') {
            this.setData({ timeLeft: Number(val) || DEFAULT_SETTINGS.timerDuration });
            if (this.data.hasInteracted) this.startQuizTimer();
        }
    },

    toggleSetting(e) {
        const key = e.currentTarget.dataset.key;
        const newSettings = Object.assign({}, this.data.settings || {});
        newSettings[key] = !newSettings[key];
        const next = sanitizeSettings(newSettings);
        this.setData({ settings: next });
        wx.setStorageSync('settings', next);

        if (key === 'cardShowWord') {
            this.updateDisplay(this.data.typingState);
            this.updateWordWrapMode(true);
        }

        if (key === 'cardShowMeaning') {
            this.updateMeaningSize();
        }

        if (key === 'enableTimer') {
            if (next.enableTimer && this.data.hasInteracted) {
                this.startQuizTimer();
            } else {
                if (this.quizTimer) clearInterval(this.quizTimer);
                this.quizTimer = null;
            }
        }
    },

    buildTypingState(word) {
        const structure = decomposeKoreanStructure(word);
        let allKeys = [];
        structure.forEach(s => {
            allKeys = allKeys.concat(s.keys);
        });

        return {
            targetText: word,
            requiredKeys: allKeys,
            currentKeyIndex: 0,
            userInput: '',
            isShiftActive: false,
            isComplete: false,
            targetStructure: structure,
            nextKey: allKeys.length > 0 ? allKeys[0] : null
        };
    },

    startWord(index) {
        this.cancelCurrentAudioPlayback();
        const words = this.data.words || [];
        const safeIndex = normalizeIndex(index, words.length);
        if (!Array.isArray(words) || words.length === 0) return;

        const wordObj = words[safeIndex];
        const word = wordObj.word;
        this._autoPronouncedWordId = null;

        const initialState = this.buildTypingState(word);
        this.persistCurrentProgress(safeIndex);

        this.setData({
            currentIndex: safeIndex,
            currentWord: wordObj,
            typingState: initialState,
            isCorrect: false,
            showAnswer: false,
            isError: false,
            hasInteracted: false,
            isWordVisible: true,
            helpReveal: false,
            repeatCorrectCount: 0,
            timeLeft: (this.data.settings && this.data.settings.timerDuration) || DEFAULT_SETTINGS.timerDuration,
            meaningIsSmall: false
        }, () => {
            this.updateMeaningSize();
            this.updateWordWrapMode(true);
        });

        this.clearAllTimers();
        this.startModeLogic();

        this.updateDisplay(initialState);
        this.updateShiftState(initialState);

        this.tryAutoPronounce();
        setTimeout(() => this.preloadNextWordAudio(), 60);
    },

    updateMeaningSize() {
        const settings = this.data.settings || DEFAULT_SETTINGS;
        if (!settings.cardShowMeaning) {
            if (this.data.meaningIsSmall) this.setData({ meaningIsSmall: false });
            return;
        }

        wx.nextTick(() => {
            const query = this.createSelectorQuery();
            query.select('.meaning').boundingClientRect();
            query.exec((res) => {
                const rect = res && res[0];
                if (!rect) return;
                const isMultiLine = rect.height >= 60;
                if (isMultiLine !== !!this.data.meaningIsSmall) {
                    this.setData({ meaningIsSmall: isMultiLine });
                }
            });
        });
    },

    updateShiftState(state) {
        const { nextKey } = state;
        if (!nextKey) {
            this.setData({ 'typingState.isShiftActive': false });
            return;
        }
        // Check if shift is needed (uppercase)
        const shiftRequired = /^[A-Z~!@#$%^&*()_+{}:"<>?]$/.test(nextKey) && nextKey !== 'SPACE';
        this.setData({ 'typingState.isShiftActive': shiftRequired });
    },

    updateDisplay(state) {
        const { targetStructure, currentKeyIndex } = state;
        let keyCounter = 0;
        const showInput = (!this.data.isWordVisible || !this.data.settings.cardShowWord) && !this.data.helpReveal;
        
        const displayChars = targetStructure.map((struct) => {
            const start = keyCounter;
            const end = keyCounter + struct.keys.length;
            keyCounter = end;

            if (currentKeyIndex >= end) {
                return { char: struct.char, status: 'done', composed: struct.char, progress: 100 };
            } else if (currentKeyIndex >= start) {
                const typedCount = Math.max(0, currentKeyIndex - start);
                const totalCount = Math.max(1, struct.keys.length);
                const progress = Math.floor((typedCount / totalCount) * 100);
                if (showInput) {
                    const composed = typedCount > 0 ? composeHangulFromKeyPrefix(struct.keys.slice(0, typedCount)) : '';
                    return { char: composed, status: 'active', composed: '', progress };
                }
                return { char: struct.char, status: 'active', composed: struct.char, progress };
            } else {
                if (showInput) {
                    return { char: '', status: 'future', composed: '', progress: 0 };
                }
                return { char: struct.char, status: 'future', composed: '', progress: 0 };
            }
        });

        const legacyDisplayChars = this.buildLegacyDisplayChars(displayChars);
        const measureChars = targetStructure.map(s => s.char);
        this.setData({ displayChars, legacyDisplayChars, measureChars });
    },

    buildLegacyDisplayChars(displayChars) {
        const list = Array.isArray(displayChars) ? displayChars : [];
        const len = list.length;
        if (len === 0) return [];

        let centerIndex = list.findIndex(it => it && it.status === 'active');
        if (centerIndex < 0) centerIndex = Math.max(0, len - 1);

        const radius = 3;
        let start = Math.max(0, centerIndex - radius);
        let end = Math.min(len, centerIndex + radius + 1);

        while (end - start < radius * 2 + 1 && (start > 0 || end < len)) {
            if (start > 0) start -= 1;
            else if (end < len) end += 1;
            else break;
        }

        const out = [];
        for (let i = start; i < end; i += 1) {
            const it = list[i] || {};
            out.push(Object.assign({}, it, { isCenter: i === centerIndex }));
        }
        return out;
    },

    updateWordWrapMode(force) {
        const settings = this.data.settings || DEFAULT_SETTINGS;
        if (!settings.cardShowWord) {
            if (this.data.useLegacyWrapMode) this.setData({ useLegacyWrapMode: false });
            this._wrapMeasureText = '';
            return;
        }

        const current = this.data.currentWord;
        const targetText = current && current.word ? String(current.word) : '';
        if (!targetText) {
            if (this.data.useLegacyWrapMode) this.setData({ useLegacyWrapMode: false });
            this._wrapMeasureText = '';
            return;
        }

        if (!force && this._wrapMeasureText === targetText) return;
        this._wrapMeasureText = targetText;

        wx.nextTick(() => {
            const query = this.createSelectorQuery();
            query.select('#nvLineMeasure').boundingClientRect();
            query.exec((res) => {
                const rect = res && res[0];
                if (!rect) return;
                const isMultiLine = rect.height >= 60;
                if (isMultiLine !== !!this.data.useLegacyWrapMode) {
                    this.setData({ useLegacyWrapMode: isMultiLine });
                }
            });
        });
    },

    onHelpReveal() {
        if (this.helpRevealTimer) clearTimeout(this.helpRevealTimer);
        this.helpRevealTimer = null;
        this.setData({ helpReveal: true }, () => {
            this.updateDisplay(this.data.typingState);
        });
        this.helpRevealTimer = setTimeout(() => {
            this.setData({ helpReveal: false }, () => {
                this.updateDisplay(this.data.typingState);
            });
        }, 1500);
    },

    onKeyPress(e) {
        const key = e.detail.key;
        this.handleKeyPress(key);
    },

    handleKeyPress(key) {
        const { typingState } = this.data;
        if (typingState.isComplete) return;

        if (!this.data.hasInteracted) {
            this.setData({ hasInteracted: true }, () => {
                this.startQuizTimer();
            });
            this.tryAutoPronounce();
        }

        const expectedKey = typingState.requiredKeys[typingState.currentKeyIndex];
        
        if (key === expectedKey) {
            // Correct
            const nextIndex = typingState.currentKeyIndex + 1;
            const isComplete = nextIndex >= typingState.requiredKeys.length;
            
            const newState = Object.assign({}, typingState);
            newState.currentKeyIndex = nextIndex;
            newState.userInput = typingState.userInput + key;
            newState.isComplete = isComplete;
            newState.nextKey = isComplete ? null : typingState.requiredKeys[nextIndex];

            this.setData({ typingState: newState, isError: false });
            this.updateDisplay(newState);
            this.updateShiftState(newState);

            if (isComplete) {
                this.handleComplete();
            }
        } else {
            if (!this.data.settings.autoCheckSpelling) return;

            this.setData({ isError: true });
            setTimeout(() => this.setData({ isError: false }), 500);
            try {
                wx.vibrateShort({ type: 'medium' });
            } catch (e) {}
        }
    },

    handleComplete() {
        const repeatCount = Number((this.data.settings && this.data.settings.repeatCount) || DEFAULT_SETTINGS.repeatCount || 1);
        const currentRepeat = Number(this.data.repeatCorrectCount || 0);
        const nextRepeat = Math.min(Math.max(1, repeatCount), currentRepeat + 1);

        this.setData({ isCorrect: true, repeatCorrectCount: nextRepeat });

        this.completeTimer = setTimeout(() => {
            this.clearAllTimers();
            if (nextRepeat >= repeatCount) {
                this.nextWord();
                return;
            }

            const current = this.data.currentWord;
            if (!current || !current.word) return;
            const initialState = this.buildTypingState(current.word);

            this.setData({
                typingState: initialState,
                isCorrect: false,
                showAnswer: false,
                isError: false,
                hasInteracted: false,
                isWordVisible: true,
                helpReveal: false,
                timeLeft: (this.data.settings && this.data.settings.timerDuration) || DEFAULT_SETTINGS.timerDuration
            });

            this.startModeLogic();
            this.updateDisplay(initialState);
            this.updateShiftState(initialState);
        }, 800);
    },

    addToMistakes() {
        const current = this.data.currentWord;
        if (!current) return;
        const res = saveMistake(current);
        if (res.success) {
            wx.showToast({ title: '已加入错题本', icon: 'success' });
        } else {
            wx.showToast({ title: '加入失败', icon: 'none' });
        }
    },

    removeCurrentFromMistakes() {
        const current = this.data.currentWord;
        if (!current) return;
        const id = safeWordId(current);
        if (!id) return;

        const res = removeMistake(id);
        if (!res.success) {
            wx.showToast({ title: '移除失败', icon: 'none' });
            return;
        }

        const isMistakesMode = !!(this.data.settings && this.data.settings.category === 'Mistakes (错题本)');
        if (!isMistakesMode) {
            wx.showToast({ title: '已移出错题本', icon: 'success' });
            return;
        }

        const prevWords = Array.isArray(this.data.words) ? this.data.words : [];
        const remaining = prevWords.filter(w => safeWordId(w) !== id);

        if (remaining.length === 0) {
            this.setData({
                words: [],
                currentWord: null,
                currentIndex: 0,
                prevWordInfo: null
            });
            wx.showToast({ title: '已移除，暂无错题', icon: 'none' });
            return;
        }

        const nextIndex = normalizeIndex(this.data.currentIndex, remaining.length);
        this.setData({ words: remaining }, () => {
            this.startWord(nextIndex);
            wx.showToast({ title: '已移出错题本', icon: 'success' });
        });
    },

    nextWord() {
        // Save previous word info
        const current = this.data.currentWord;
        if (current) {
            this.setData({
                prevWordInfo: {
                    word: current.word,
                    meaning: current.meaning,
                    isCorrect: this.data.isCorrect
                }
            });
        }
        const len = Array.isArray(this.data.words) ? this.data.words.length : 0;
        const nextIndex = normalizeIndex(Number(this.data.currentIndex || 0) + 1, len);
        this.startWord(nextIndex);
    },

    prevWord() {
        const len = Array.isArray(this.data.words) ? this.data.words.length : 0;
        const prevIndex = normalizeIndex(Number(this.data.currentIndex || 0) - 1, len);
        this.startWord(prevIndex);
    },

    ensureAudioContexts() {
        if (!this.wordAudio) this.wordAudio = wx.createInnerAudioContext();
        if (!this.cnAudio) this.cnAudio = wx.createInnerAudioContext();
    },

    bumpAudioPlaySeq() {
        const next = Number(this._audioPlaySeq || 0) + 1;
        this._audioPlaySeq = next;
        return next;
    },

    stopAudioContext(audioCtx) {
        if (!audioCtx) return;
        try {
            if (audioCtx.__nvPendingSettle) {
                audioCtx.__nvPendingSettle(false);
            }
        } catch (e) {}
        try { audioCtx.stop && audioCtx.stop(); } catch (e) {}
    },

    cancelCurrentAudioPlayback() {
        const seq = this.bumpAudioPlaySeq();
        this.stopAudioContext(this.wordAudio);
        this.stopAudioContext(this.cnAudio);
        return seq;
    },

    getAudioFolder() {
        const category = (this.data.settings && this.data.settings.category) || '';
        if (/^Yonsei\s+\d$/.test(category)) return 'yansei';
        if (category === 'TOPIK Vocabulary') return 'topic';
        return 'yansei';
    },

    getAudioCacheKey(rawWord, isChinese) {
        const w0 = String(rawWord || '').trim().replace(/\s+/g, '_');
        const folder = this.getAudioFolder();
        const suffix = isChinese ? '_cn' : '';
        return `${folder}__${w0}__${suffix}`;
    },

    buildAudioUrls(rawWord, isChinese) {
        const w0 = String(rawWord || '').trim().replace(/\s+/g, '_');
        const sanitizeName = (s) => {
            let t = String(s || '');
            t = t
                .replace(/[\/／\\]/g, '')
                .replace(/[()\[\]{}"'’“”]/g, '')
                .replace(/_+/g, '_');
            while (true) {
                const next = t
                    .replace(/_+$/g, '')
                    .replace(/[\s_]*[)"'’”\]\}]+$/g, '')
                    .replace(/[\s_]*[?？!！。．\.，,、…:;：；]+$/g, '');
                if (next === t) break;
                t = next;
            }
            t = t.replace(/^_+|_+$/g, '');
            while (true) {
                const next = t
                    .replace(/[\s_]*[)"'’”\]\}]+$/g, '')
                    .replace(/[\s_]*[?？!！。．\.，,、…:;：；]+$/g, '')
                    .replace(/^_+|_+$/g, '');
                if (next === t) break;
                t = next;
            }
            return t;
        };

        const w1 = sanitizeName(w0);
        const bases = w1 && w1 !== w0 ? [w1, w0] : [w0];

        const variants = [];
        bases.forEach((b) => {
            try {
                variants.push(b.normalize('NFD'));
                variants.push(b.normalize('NFC'));
            } catch (e) {
                variants.push(b);
            }
        });
        const uniqueVariants = Array.from(new Set(variants.filter(Boolean)));
        const folder = this.getAudioFolder();
        const suffix = isChinese ? '_cn' : '';
        const urls = [];
        uniqueVariants.forEach((v) => {
            const name = `${v}${suffix}.mp3`;
            const nameWithDash = `-${v}${suffix}.mp3`;
            [name, nameWithDash].forEach((n) => {
                const path = `${AUDIO_BASE_PATH}/${folder}/${encodeURIComponent(n)}`;
                urls.push(`${AUDIO_ORIGIN}${path}`);
            });
        });
        return Array.from(new Set(urls));
    },

    playSrcOnce(audioCtx, src, cacheKey, cacheUrl) {
        return new Promise((resolve) => {
            if (!audioCtx || !src) return resolve(false);

            let settled = false;
            const cleanup = () => {
                try { audioCtx.offEnded && audioCtx.offEnded(); } catch (e) {}
                try { audioCtx.offError && audioCtx.offError(); } catch (e) {}
                try { audioCtx.offCanplay && audioCtx.offCanplay(); } catch (e) {}
                try { audioCtx.offStop && audioCtx.offStop(); } catch (e) {}
            };

            const settle = (ok) => {
                if (settled) return;
                settled = true;
                cleanup();
                try {
                    if (audioCtx.__nvPendingSettle === settle) {
                        audioCtx.__nvPendingSettle = null;
                    }
                } catch (e) {}
                resolve(!!ok);
            };

            try {
                if (audioCtx.__nvPendingSettle) {
                    audioCtx.__nvPendingSettle(false);
                }
            } catch (e) {}
            try { audioCtx.stop(); } catch (e) {}
            cleanup();
            try { audioCtx.__nvPendingSettle = settle; } catch (e) {}

            const onCanplay = () => {
                if (cacheKey && cacheUrl && this._audioUrlMemo && this._audioUrlMemo.set) {
                    this._audioUrlMemo.set(cacheKey, cacheUrl);
                }
            };

            audioCtx.onEnded(() => {
                settle(true);
            });

            audioCtx.onError(() => {
                settle(false);
            });

            if (audioCtx.onCanplay) {
                audioCtx.onCanplay(onCanplay);
            }

            if (audioCtx.onStop) {
                audioCtx.onStop(() => {
                    settle(false);
                });
            }

            audioCtx.src = src;
            try {
                audioCtx.play();
            } catch (e) {
                settle(false);
            }
        });
    },

    async playWithFallback(audioCtx, urls, cacheKey) {
        if (!audioCtx || !urls || urls.length === 0) return false;

        const memo = cacheKey && this._audioUrlMemo && this._audioUrlMemo.get ? this._audioUrlMemo.get(cacheKey) : '';
        if (memo) {
            const ok = await this.playSrcOnce(audioCtx, memo, cacheKey, memo);
            if (ok) return true;
        }

        for (const url of urls) {
            if (!url) continue;
            const ok = await this.playSrcOnce(audioCtx, url, cacheKey, url);
            if (ok) return true;
        }

        return false;
    },

    preloadNextWordAudio() {
        const s = this.data.settings || DEFAULT_SETTINGS;
        const shouldPreload = !!(s.autoPronounce || this._hasPlayedAudioOnce);
        if (!shouldPreload) return;

        const words = Array.isArray(this.data.words) ? this.data.words : [];
        if (words.length <= 1) return;

        const nextIndex = normalizeIndex(Number(this.data.currentIndex || 0) + 1, words.length);
        const next = words[nextIndex];
        if (!next || !next.word) return;

        const cacheKey = this.getAudioCacheKey(next.word, false);
        const existing = cacheKey ? this.getAudioFileFromLRU(cacheKey) : '';
        if (existing) {
            this._preloadNextKey = cacheKey;
            return;
        }

        if (this._preloadNextKey === cacheKey) return;
        this._preloadNextKey = cacheKey;

        const memo = cacheKey && this._audioUrlMemo && this._audioUrlMemo.get ? this._audioUrlMemo.get(cacheKey) : '';
        const candidates = memo ? [memo] : this.buildAudioUrls(next.word, false);
        const url = candidates && candidates[0] ? candidates[0] : '';
        if (!url) return;

        try {
            if (this._preloadTask && typeof this._preloadTask.abort === 'function') {
                this._preloadTask.abort();
            }
        } catch (e) {}
        this._preloadTask = null;

        try {
            this._preloadTask = wx.downloadFile({
                url,
                success: (res) => {
                    if (res && res.statusCode === 200 && res.tempFilePath) {
                        if (cacheKey && this._audioUrlMemo && this._audioUrlMemo.set) {
                            this._audioUrlMemo.set(cacheKey, url);
                        }
                        this.setAudioFileToLRU(cacheKey, res.tempFilePath);
                    }
                },
                fail: () => {}
            });
        } catch (e) {}
    },

    async playWordAudio() {
        const current = this.data.currentWord;
        if (!current || !current.word) return;
        const playSeq = this.cancelCurrentAudioPlayback();
        this.ensureAudioContexts();
        this.stopAudioContext(this.wordAudio);
        this.stopAudioContext(this.cnAudio);
        this._hasPlayedAudioOnce = true;

        const wordId = current.id;
        const word = current.word;
        const playMeaning = !!(this.data.settings && this.data.settings.pronounceMeaning);

        const koCacheKey = this.getAudioCacheKey(word, false);
        const koLocal = koCacheKey ? this.getAudioFileFromLRU(koCacheKey) : '';
        if (koLocal) {
            await this.playSrcOnce(this.wordAudio, koLocal);
        } else {
            const memo = koCacheKey && this._audioUrlMemo && this._audioUrlMemo.get ? this._audioUrlMemo.get(koCacheKey) : '';
            const koUrls = memo ? [memo, ...this.buildAudioUrls(word, false)] : this.buildAudioUrls(word, false);
            const downloaded = await this.downloadAudioToLRU(koCacheKey, koUrls);
            if (this._audioPlaySeq !== playSeq || !this.data.currentWord || this.data.currentWord.id !== wordId) return;
            if (downloaded) {
                await this.playSrcOnce(this.wordAudio, downloaded);
            } else {
                await this.playWithFallback(this.wordAudio, koUrls, koCacheKey);
            }
        }

        if (this._audioPlaySeq !== playSeq || !this.data.currentWord || this.data.currentWord.id !== wordId) return;
        if (playMeaning) {
            const cnCacheKey = this.getAudioCacheKey(word, true);
            const cnLocal = cnCacheKey ? this.getAudioFileFromLRU(cnCacheKey) : '';
            if (cnLocal) {
                await this.playSrcOnce(this.cnAudio, cnLocal);
            } else {
                const memo = cnCacheKey && this._audioUrlMemo && this._audioUrlMemo.get ? this._audioUrlMemo.get(cnCacheKey) : '';
                const cnUrls = memo ? [memo, ...this.buildAudioUrls(word, true)] : this.buildAudioUrls(word, true);
                const downloaded = await this.downloadAudioToLRU(cnCacheKey, cnUrls);
                if (this._audioPlaySeq !== playSeq || !this.data.currentWord || this.data.currentWord.id !== wordId) return;
                if (downloaded) {
                    await this.playSrcOnce(this.cnAudio, downloaded);
                } else {
                    await this.playWithFallback(this.cnAudio, cnUrls, cnCacheKey);
                }
            }
        }

        if (this._audioPlaySeq !== playSeq || !this.data.currentWord || this.data.currentWord.id !== wordId) return;
        this.preloadNextWordAudio();
    },

    tryAutoPronounce() {
        const s = this.data.settings || DEFAULT_SETTINGS;
        if (!s.autoPronounce) return;
        const current = this.data.currentWord;
        if (!current || !current.id) return;
        if (this._autoPronouncedWordId === current.id) return;
        this._autoPronouncedWordId = current.id;
        setTimeout(() => {
            if (!this.data.currentWord || this.data.currentWord.id !== current.id) return;
            this.playWordAudio();
        }, 80);
    },

    toggleKeyboard() {
        this.setData({ isKeyboardOpen: !this.data.isKeyboardOpen });
    },

});
