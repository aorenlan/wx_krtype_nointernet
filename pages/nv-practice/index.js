import { getWords, getCategories, getYonseiLessons, getTopikLevels, getTopikSessions } from '../../utils_nv/api';
import { decomposeKoreanStructure } from '../../utils/hangul';
import { saveMistake, removeMistake, getMistakes, getProgress, saveProgressV2, getFavorites, addFavorites, FAVORITES_LIST_NAME, getPhotoRecognitionWords, PHOTO_RECOGNITION_CATEGORY, getPictureWordsPracticeWords, PICTURE_WORDS_PRACTICE_CATEGORY } from '../../utils_nv/storage';
import { KEYBOARD_LAYOUT } from '../../constants/index';
const srs = require('../../utils/srs');
const { syncPageTabBar } = require('../../utils/tabbar');
const { shouldSkipAd } = require('../../utils/ad-free');
const { SLEEP_MOODIST_CATEGORIES, SLEEP_MOODIST_SOUNDS, SLEEP_MOODIST_TOTAL_BYTES } = require('./sleep-sounds.js');

const AUDIO_ORIGIN = 'https://enoss.aorenlan.fun';
const AUDIO_BASE_PATH = '/kr_word';
const EDGE_TTS_CACHE_NAMESPACE = 'edge_tts_v1';
const EDGE_TTS_PRELOAD_AHEAD = 2;
const EDGE_TTS_BATCH_SIZE = 12;
const AUDIO_PRELOAD_DELAY_MS = 280;
const AUDIO_PRELOAD_QUEUE_GAP_MS = 220;
const AUDIO_PRELOAD_AHEAD = 2;
const NAGGING_REPEAT_MIN = 10;
const NAGGING_REPEAT_MAX = 100;
const NAGGING_REPEAT_DEFAULT = 50;
const DUAL_COLUMN_FULL_RENDER_LIMIT = 120;
const DUAL_COLUMN_WINDOW_SIZE = 80;
const SLEEP_STORAGE_KEY = 'kr_sleep_mixer_state_v1';
const SLEEP_CACHE_STORAGE_KEY = 'kr_sleep_moodist_cache_v1';
const SLEEP_GUIDE_STORAGE_KEY = 'kr_sleep_focus_guide_seen_v1';
const SLEEP_MAX_TRACKS = 3;
const SLEEP_DEFAULT_SOUND_ID = 'wind';
const SLEEP_DEFAULT_CATEGORY_ID = 'nature';
const SLEEP_SAMPLE_RATE = 16000;
const SLEEP_WAV_SECONDS = 10;
const SLEEP_FALLBACK_CACHE_MARK = '_fallback_';
const SLEEP_SOUND_CATEGORIES = SLEEP_MOODIST_CATEGORIES;
const SLEEP_SOUND_OPTIONS = SLEEP_MOODIST_SOUNDS;
const SLEEP_SOUND_TOTAL_BYTES = SLEEP_MOODIST_TOTAL_BYTES;
const SLEEP_WORD_LOOP_MAX_PLAY_MS = 12000;
const SLEEP_WORD_LOOP_SUCCESS_GAP_MS = 1600;
const SLEEP_WORD_LOOP_RETRY_GAP_MS = 2200;
const SLEEP_WORD_LOOP_FAIL_ADVANCE_LIMIT = 2;
const SLEEP_WORD_PRELOAD_INITIAL = 6;
const SLEEP_WORD_PRELOAD_AHEAD = 4;
const SLEEP_MIXER_GAIN = 0.42;
const SLEEP_PREVIEW_GAIN = 0.42;
const SLEEP_KOREAN_REPEAT_OPTIONS = [1, 2, 3];
const SLEEP_TIMER_OPTIONS = [
    { minutes: 0, label: '不定时' },
    { minutes: 15, label: '15分钟' },
    { minutes: 30, label: '30分钟' },
    { minutes: 45, label: '45分钟' }
];
const SLEEP_KOREAN_REPEAT_PICKER_OPTIONS = SLEEP_KOREAN_REPEAT_OPTIONS.map(count => `韩语读 ${count} 遍`);
const TAP_SCENE_GUIDE_STORAGE_KEY = 'kr_tap_scene_intro_seen_v1';
const TAP_SCENE_AUTO_OPEN_KEY = 'kr_picture_words_open_tap_scene_v1';
const TAP_SCENE_GUIDE_IMAGE = 'https://enoss.aorenlan.fun/kr_picturebook/point_read/mraibn8j/scene_mrajn319.png';

const getSleepTimerPickerIndex = (minutes) => {
    const safeMinutes = Number(minutes) || 0;
    const index = SLEEP_TIMER_OPTIONS.findIndex(item => item.minutes === safeMinutes);
    return index >= 0 ? index : 0;
};

const getSleepTimerLabel = (minutes) => {
    return SLEEP_TIMER_OPTIONS[getSleepTimerPickerIndex(minutes)].label;
};

const getSleepKoreanRepeatPickerIndex = (count) => {
    const safeCount = Number(count) || 2;
    const index = SLEEP_KOREAN_REPEAT_OPTIONS.indexOf(safeCount);
    return index >= 0 ? index : 1;
};

const getSleepKoreanRepeatLabel = (count) => {
    return `${SLEEP_KOREAN_REPEAT_OPTIONS[getSleepKoreanRepeatPickerIndex(count)]}遍`;
};

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
    autoPlaySentence: false,
    srsEnabled: true,
    category: 'Yonsei 1',
    keyboardVisualMode: 'korean',
    yonseiLessonId: '',
    yonseiLessonName: '',
    topikLevel: '1',
    topikSession: '',
    naggingRepeatCount: NAGGING_REPEAT_DEFAULT,
    naggingMode: false
};

const TOOLTIP_STORAGE_KEY = 'has_shown_word_detail_tooltip';

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

const getDualWordKey = (word, index) => {
    const base = safeWordId(word);
    return base ? `${base}__${index}` : `word_${index}`;
};

const getDualCompletedKey = (word, index) => {
    return getDualWordKey(word, index);
};

const normalizeDualNativeInput = (value) => {
    return String(value || '').trim().toLowerCase();
};

const formatDualTimerText = (seconds) => {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const getDualExampleSentence = (word) => {
    if (!word) return '';
    return word.example_sentence || word.exampleSentence || word.sentence || word.example || '';
};

const getDualExampleTranslation = (word) => {
    if (!word) return '';
    return word.sentence_translation
        || word.example_translation
        || word.exampleTranslation
        || word.sentenceTranslation
        || word.example_meaning
        || '';
};

const clampAudioSample = (value) => {
    return Math.max(-0.98, Math.min(0.98, Number(value) || 0));
};

const createSleepRandom = (seedText) => {
    let seed = 2166136261;
    const text = String(seedText || 'sleep');
    for (let i = 0; i < text.length; i += 1) {
        seed ^= text.charCodeAt(i);
        seed = Math.imul(seed, 16777619);
    }
    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return (seed / 4294967296) * 2 - 1;
    };
};

const buildSleepWavBuffer = (kind, seedText = '') => {
    const safeKind = kind || 'noise';
    const sampleRate = SLEEP_SAMPLE_RATE;
    const sampleCount = sampleRate * SLEEP_WAV_SECONDS;
    const dataSize = sampleCount * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const seed = `${safeKind}:${seedText || 'default'}`;
    const rand = createSleepRandom(seed);
    const variantRand = createSleepRandom(`variant:${seed}`);
    const unit = () => (variantRand() + 1) * 0.5;
    const phase = unit() * Math.PI * 2;
    const speed = 0.72 + unit() * 0.68;
    const density = 0.75 + unit() * 0.7;
    const tone = 72 + unit() * 132;
    const texture = 0.65 + unit() * 0.8;
    let brown = 0;
    let wind = 0;

    const writeString = (offset, value) => {
        for (let i = 0; i < value.length; i += 1) {
            view.setUint8(offset + i, value.charCodeAt(i));
        }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    for (let i = 0; i < sampleCount; i += 1) {
        const t = i / sampleRate;
        const n = rand();
        let sample = 0;

        if (safeKind === 'rain') {
            const drop = rand() > Math.max(0.972, 0.991 - density * 0.008) ? rand() * (0.45 + texture * 0.18) : 0;
            sample = n * (0.12 + texture * 0.06) + drop;
        } else if (safeKind === 'waves') {
            const swell = (Math.sin((t * speed + phase) * Math.PI * 0.34) + 1) * 0.5;
            sample = n * (0.05 + swell * (0.12 + texture * 0.08)) + Math.sin(t * Math.PI * (1.65 + speed)) * 0.035;
        } else if (safeKind === 'wind') {
            wind = wind * 0.985 + n * 0.015;
            const gust = (Math.sin((t * speed + phase) * Math.PI * 0.23) + 1.2) * (0.38 + texture * 0.06);
            sample = (wind * (3.4 + texture) + n * 0.04) * gust;
        } else if (safeKind === 'fire') {
            const crackle = rand() > Math.max(0.984, 0.996 - density * 0.007) ? rand() * (0.65 + texture * 0.18) : 0;
            brown = brown * 0.96 + n * 0.04;
            sample = brown * (0.2 + texture * 0.07) + crackle;
        } else if (safeKind === 'fan') {
            sample = Math.sin(t * Math.PI * 2 * tone) * 0.055
                + Math.sin(t * Math.PI * 2 * tone * 2) * 0.022
                + n * (0.055 + texture * 0.025);
        } else {
            brown = brown * 0.992 + n * 0.008;
            sample = brown * (2.2 + texture * 0.6) + n * (0.018 + texture * 0.01);
        }

        view.setInt16(44 + i * 2, Math.round(clampAudioSample(sample) * 32767), true);
    }

    return buffer;
};

const formatSleepBytes = (bytes) => {
    const value = Math.max(0, Number(bytes) || 0);
    if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)}MB`;
    if (value >= 1024) return `${Math.round(value / 1024)}KB`;
    return `${value}B`;
};

const getSleepCategoryById = (id) => {
    return SLEEP_SOUND_CATEGORIES.find(item => item.id === id) || SLEEP_SOUND_CATEGORIES[0] || null;
};

const normalizeSleepCategoryId = (id) => {
    const category = getSleepCategoryById(id);
    return category ? category.id : SLEEP_DEFAULT_CATEGORY_ID;
};

const getSleepCacheSummary = (cacheMap) => {
    const cached = cacheMap && typeof cacheMap === 'object' ? cacheMap : {};
    const cachedCount = SLEEP_SOUND_OPTIONS.filter(item => !!cached[item.id]).length;
    const total = SLEEP_SOUND_OPTIONS.length;
    return {
        cachedCount,
        total,
        percent: total ? Math.round((cachedCount / total) * 100) : 0,
        ready: total > 0 && cachedCount >= total
    };
};

const isSleepFallbackPath = (filePath) => String(filePath || '').indexOf(SLEEP_FALLBACK_CACHE_MARK) >= 0;

const buildSleepSoundCards = (selectedIds, volumes, activeCategoryId = SLEEP_DEFAULT_CATEGORY_ID, cacheMap = {}) => {
    const selected = Array.isArray(selectedIds) ? selectedIds : [];
    const volumeMap = volumes || {};
    const categoryId = normalizeSleepCategoryId(activeCategoryId);
    const cached = cacheMap || {};
    return SLEEP_SOUND_OPTIONS.filter(item => item.categoryId === categoryId).map((item) => {
        const volume = Number(volumeMap[item.id] != null ? volumeMap[item.id] : item.defaultVolume);
        return Object.assign({}, item, {
            selected: selected.indexOf(item.id) >= 0,
            cached: !!cached[item.id] || !!item.src,
            cacheStatusText: cached[item.id] || item.src ? '已下载' : '点卡片试听',
            volume: Math.max(0, Math.min(100, Number.isFinite(volume) ? Math.round(volume) : item.defaultVolume))
        });
    });
};

const buildSleepSelectedTracks = (selectedIds, volumes) => {
    const volumeMap = volumes || {};
    return (Array.isArray(selectedIds) ? selectedIds : []).slice(0, SLEEP_MAX_TRACKS).map((id) => {
        const option = getSleepOptionById(id);
        if (!option) return null;
        const rawVolume = Number(volumeMap[id] != null ? volumeMap[id] : option.defaultVolume);
        const volume = Math.max(0, Math.min(100, Number.isFinite(rawVolume) ? Math.round(rawVolume) : option.defaultVolume));
        return {
            id,
            name: option.name,
            mark: option.mark,
            volume,
            volumeText: `${volume}%`
        };
    }).filter(Boolean);
};

const getSleepOptionById = (id) => {
    return SLEEP_SOUND_OPTIONS.find(item => item.id === id) || null;
};

const getSleepOutputVolume = (value, gain = SLEEP_MIXER_GAIN) => {
    const percent = Math.max(0, Math.min(100, Number(value) || 0));
    return Math.max(0, Math.min(1, (percent / 100) * gain));
};

const getSleepFallbackKind = (option) => {
    const text = `${option && option.id || ''} ${option && option.label || ''} ${option && option.categoryId || ''}`.toLowerCase();
    if (/rain|thunder/.test(text)) return 'rain';
    if (/wave|river|water|droplet|submarine|underwater|boat/.test(text)) return 'waves';
    if (/wind/.test(text)) return 'wind';
    if (/fire|campfire/.test(text)) return 'fire';
    if (/fan|train|airplane|machine|dryer/.test(text)) return 'fan';
    return 'noise';
};

const normalizeSleepState = (raw) => {
    const saved = raw && typeof raw === 'object' ? raw : {};
    const validIds = SLEEP_SOUND_OPTIONS.map(item => item.id);
    let selectedIds = Array.isArray(saved.selectedIds)
        ? saved.selectedIds.filter(id => validIds.indexOf(id) >= 0)
        : [SLEEP_DEFAULT_SOUND_ID];
    selectedIds = Array.from(new Set(selectedIds)).slice(0, SLEEP_MAX_TRACKS);
    if (!selectedIds.length) selectedIds = [SLEEP_DEFAULT_SOUND_ID];

    const volumes = {};
    SLEEP_SOUND_OPTIONS.forEach((item) => {
        const rawVolume = saved.volumes && saved.volumes[item.id] != null ? Number(saved.volumes[item.id]) : item.defaultVolume;
        volumes[item.id] = Math.max(0, Math.min(100, Number.isFinite(rawVolume) ? Math.round(rawVolume) : item.defaultVolume));
    });

    const timerMinutes = SLEEP_TIMER_OPTIONS.some(item => item.minutes === Number(saved.timerMinutes))
        ? Number(saved.timerMinutes)
        : 0;
    const rawRepeat = Number(saved.koreanRepeatCount);
    const koreanRepeatCount = SLEEP_KOREAN_REPEAT_OPTIONS.indexOf(rawRepeat) >= 0 ? rawRepeat : 2;
    const readMeaning = saved.readMeaning != null ? !!saved.readMeaning : true;

    return { selectedIds, volumes, timerMinutes, readMeaning, koreanRepeatCount };
};

const getSleepSummary = (selectedIds) => {
    const names = (Array.isArray(selectedIds) ? selectedIds : [])
        .map(id => {
            const option = getSleepOptionById(id);
            return option ? option.name : '';
        })
        .filter(Boolean);
    return names.length ? names.join(' + ') : '未选择';
};

const buildDualColumnRows = (words, currentIndex, completedMap, typingState, inputMap, shouldFocusInput, hideKorean, revealWord, exampleRowId, reciteMode = false) => {
    const list = Array.isArray(words) ? words : [];
    const total = list.length;
    if (!total) return [];

    const safeIndex = normalizeIndex(currentIndex, total);
    let start = 0;
    let end = total;

    if (total > DUAL_COLUMN_FULL_RENDER_LIMIT) {
        const half = Math.floor(DUAL_COLUMN_WINDOW_SIZE / 2);
        start = Math.max(0, Math.min(safeIndex - half, total - DUAL_COLUMN_WINDOW_SIZE));
        end = Math.min(total, start + DUAL_COLUMN_WINDOW_SIZE);
    }

    const activeRequiredCount = typingState && Array.isArray(typingState.requiredKeys)
        ? typingState.requiredKeys.length
        : 0;
    const activeTypedCount = typingState
        ? Math.max(0, Number(typingState.currentKeyIndex || 0))
        : 0;
    const activeProgress = activeRequiredCount > 0
        ? Math.min(100, Math.round((activeTypedCount / activeRequiredCount) * 100))
        : 0;

    return list.slice(start, end).map((word, offset) => {
        const index = start + offset;
        const completedKey = getDualCompletedKey(word, index);
        const reciteActive = !!reciteMode && completedKey === exampleRowId;
        const active = reciteActive || index === safeIndex;
        const inputValue = inputMap && inputMap[completedKey] ? inputMap[completedKey] : '';
        const rawWord = String((word && word.word) || '');
        const targetLength = rawWord.trim().length;
        const nativeProgress = targetLength > 0
            ? Math.min(100, Math.round((String(inputValue || '').trim().length / targetLength) * 100))
            : 0;
        const completed = !!(completedMap && completedMap[completedKey]);
        const shouldShowWord = !hideKorean || completed || (active && revealWord);
        const hiddenWord = rawWord ? '•'.repeat(Math.max(2, Array.from(rawWord).length)) : '';
        const exampleSentence = getDualExampleSentence(word);
        const exampleTranslation = getDualExampleTranslation(word);
        return {
            rowKey: getDualWordKey(word, index),
            id: completedKey,
            index,
            indexLabel: String(index + 1).padStart(2, '0'),
            word: rawWord,
            displayWord: shouldShowWord ? rawWord : hiddenWord,
            wordHidden: !shouldShowWord,
            meaning: (word && (word.meaning || word.translation || word.definition)) || '',
            phonetic: (word && word.phonetic) || '',
            active,
            completed,
            justCompleted: completed && completedKey === exampleRowId,
            showExample: (completed || reciteMode) && completedKey === exampleRowId && !!(exampleSentence || exampleTranslation),
            exampleSentence,
            exampleTranslation,
            progress: active ? (inputValue ? nativeProgress : activeProgress) : 0,
            inputValue,
            inputFocus: !!(active && shouldFocusInput)
        };
    });
};

const findNextDualIncompleteIndex = (words, currentIdx, completedMap) => {
    const list = Array.isArray(words) ? words : [];
    const total = list.length;
    if (!total) return -1;
    const safeIndex = normalizeIndex(currentIdx, total);

    for (let i = safeIndex + 1; i < total; i += 1) {
        if (!completedMap[getDualCompletedKey(list[i], i)]) return i;
    }
    for (let i = 0; i < safeIndex; i += 1) {
        if (!completedMap[getDualCompletedKey(list[i], i)]) return i;
    }
    return -1;
};

const hashAudioCacheText = (value) => {
    const input = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
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
    delete merged.photoPracticeId;
    if (merged.category === '拍照识别') {
        merged.category = PHOTO_RECOGNITION_CATEGORY;
    }
    if (merged.practiceMode !== 'study' && merged.practiceMode !== 'flash') {
        merged.practiceMode = DEFAULT_SETTINGS.practiceMode;
    }
    if (merged.keyboardVisualMode !== 'korean' && merged.keyboardVisualMode !== 'english' && merged.keyboardVisualMode !== 'korean_hide_english' && merged.keyboardVisualMode !== 'english_only') {
        merged.keyboardVisualMode = DEFAULT_SETTINGS.keyboardVisualMode;
    }
    if (merged.topikLevel != null) merged.topikLevel = String(merged.topikLevel);
    if (merged.topikSession != null) merged.topikSession = String(merged.topikSession);
    merged.naggingMode = !!merged.naggingMode;
    merged.autoPlaySentence = !!merged.autoPlaySentence;
    merged.srsEnabled = merged.srsEnabled !== false; // 默认 true
    if (merged.yonseiLessonId != null) merged.yonseiLessonId = String(merged.yonseiLessonId);
    if (merged.yonseiLessonName != null) merged.yonseiLessonName = String(merged.yonseiLessonName);
    let repeatCount = Number(merged.repeatCount);
    if (!Number.isFinite(repeatCount)) repeatCount = DEFAULT_SETTINGS.repeatCount;
    repeatCount = Math.max(1, Math.min(10, Math.round(repeatCount)));
    merged.repeatCount = repeatCount;
    let naggingRepeatCount = Number(merged.naggingRepeatCount);
    if (!Number.isFinite(naggingRepeatCount)) naggingRepeatCount = DEFAULT_SETTINGS.naggingRepeatCount;
    naggingRepeatCount = Math.round(naggingRepeatCount);
    naggingRepeatCount = Math.max(NAGGING_REPEAT_MIN, Math.min(NAGGING_REPEAT_MAX, naggingRepeatCount));
    merged.naggingRepeatCount = naggingRepeatCount;
    return merged;
};

Page({
    data: {
        words: [],
        originalWords: [],
        isShuffled: false,
        showShuffleToast: false,
        shuffleToastText: '',
        showShuffleGuide: false,
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
        practiceToolsOpen: false,
        dualColumnMode: false,
        dualColumnRows: [],
        dualScrollIntoView: 'dual-row-0',
        dualCompletedIds: {},
        dualNativeInputs: {},
        dualNativeInputFocus: false,
        dualReciteMode: false,
        dualHideKorean: false,
        dualRevealWord: false,
        dualExampleRowId: '',
        dualActionLocked: false,
        dualElapsedSeconds: 0,
        dualTimerText: formatDualTimerText(0),
        dualTimerRunning: false,
        dualTimerPaused: false,
        sleepPanelOpen: false,
        sleepFocusOpen: false,
        sleepStarting: false,
        sleepGuideVisible: false,
        sleepCategories: SLEEP_SOUND_CATEGORIES,
        sleepActiveCategoryId: SLEEP_DEFAULT_CATEGORY_ID,
        sleepSoundOptions: buildSleepSoundCards([SLEEP_DEFAULT_SOUND_ID], {}, SLEEP_DEFAULT_CATEGORY_ID, {}),
        sleepSelectedIds: [SLEEP_DEFAULT_SOUND_ID],
        sleepSelectedTracks: buildSleepSelectedTracks([SLEEP_DEFAULT_SOUND_ID], {}),
        sleepVolumes: {},
        sleepPlaying: false,
        sleepTimerMinutes: 0,
        sleepTimerOptions: SLEEP_TIMER_OPTIONS,
        sleepTimerPickerIndex: getSleepTimerPickerIndex(0),
        sleepTimerLabel: getSleepTimerLabel(0),
        sleepReadMeaning: true,
        sleepKoreanRepeatCount: 2,
        sleepKoreanRepeatPickerOptions: SLEEP_KOREAN_REPEAT_PICKER_OPTIONS,
        sleepKoreanRepeatPickerIndex: getSleepKoreanRepeatPickerIndex(2),
        sleepKoreanRepeatLabel: getSleepKoreanRepeatLabel(2),
        sleepRemainingText: '',
        sleepActiveSummary: getSleepSummary([SLEEP_DEFAULT_SOUND_ID]),
        sleepCacheMap: {},
        sleepCacheReady: false,
        sleepCacheDownloading: false,
        sleepCacheProgress: 0,
        sleepCacheTotal: SLEEP_SOUND_OPTIONS.length,
        sleepCachePercent: 0,
        sleepCacheSizeText: formatSleepBytes(SLEEP_SOUND_TOTAL_BYTES),
        sleepCacheStatusText: `点试听可单独下载 · 全量约 ${formatSleepBytes(SLEEP_SOUND_TOTAL_BYTES)}`,
        sleepCacheButtonText: '一键下载',
        sleepPreviewingId: '',
        sleepPreviewLoadingId: '',
        sleepWordLoopRunning: false,
        sleepWordLoopCurrent: '从当前词开始 · 最多100词',
        sleepWordLoopMeaning: '',
        sleepWordLoopProgressText: '0/0',
        sentenceAudioState: '',
        sentenceAudioIndex: -1,
        
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
        navBarHeight: 44,
        dailySentenceEntrySource: '',
        srsCount: 0,
        showDevBtn: false,
        showGuideBubble: false,
        showSettingsTooltip: false,
        settingsTooltipText: '可调整显示模式',
        showWordTooltip: false,
        showTapSceneGuide: false,
        tapSceneGuideImage: TAP_SCENE_GUIDE_IMAGE,
        naggingRepeatCountPreview: NAGGING_REPEAT_DEFAULT,
        naggingRepeatProgress: 0,
        isEditingNaggingRepeatCount: false,

        // PC Support
        isPC: false,
        hiddenInputValue: ' ',
        inputFocus: false,

        // Nagging Mode
        isNaggingMode: false,
        naggingStyle: 'scatter', // 'scatter' | 'flow'
        naggingWordInfo: null,
        naggingItems: [],

        // Detail Modal
        showDetailModal: false
    },

    async onLoad(options) {
        // 直接带参打开（非 tabBar 中转）时也记录待处理收藏，统一在 onShow 处理。
        // 不覆盖 app.js 经 extraData 写入的更可靠数据（words 为数组）。
        if (options && (options.words || options.word)) {
            try {
                const existing = wx.getStorageSync('pending_fav_import');
                const hasExtraData = existing && existing.query && Array.isArray(existing.query.words);
                if (!hasExtraData) {
                    wx.setStorageSync('pending_fav_import', { query: options, ts: Date.now() });
                }
            } catch (e) {}
        }
        const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        
        let platform = '';
        try {
            if (wx.getDeviceInfo) {
                const deviceInfo = wx.getDeviceInfo();
                platform = deviceInfo.platform;
            }
            if (!platform) {
                // Fallback if getDeviceInfo returns empty platform or is unavailable
                const sysInfo = wx.getSystemInfoSync();
                platform = sysInfo.platform;
            }
        } catch (e) {
            console.error('Platform detection failed:', e);
            try { platform = wx.getSystemInfoSync().platform; } catch (e) {}
        }
        
        // Normalize
        platform = (platform || '').toLowerCase();
        
        // Add 'devtools' for simulator testing
        const isPC = platform === 'mac' || platform === 'windows' || platform === 'devtools';
        
        // iPad/Large Screen detection
        // Check model OR screen width (iPad usually > 700px width, landscape even more)
        const isIPad = (windowInfo.model || '').toLowerCase().includes('ipad') || (windowInfo.windowWidth >= 600);
        
        const storedSettings = wx.getStorageSync('settings') || {};
        const mergedSettings = sanitizeSettings(storedSettings);
        let sleepState = normalizeSleepState(null);
        try {
            sleepState = normalizeSleepState(wx.getStorageSync(SLEEP_STORAGE_KEY));
        } catch (e) {}
        const sleepCacheMap = this.readSleepCacheMap();
        const sleepCacheSummary = getSleepCacheSummary(sleepCacheMap);
        const firstSleepOption = getSleepOptionById(sleepState.selectedIds && sleepState.selectedIds[0]);
        const sleepActiveCategoryId = normalizeSleepCategoryId(firstSleepOption ? firstSleepOption.categoryId : SLEEP_DEFAULT_CATEGORY_ID);
        let shouldShowTapSceneGuide = false;
        try {
            shouldShowTapSceneGuide = !wx.getStorageSync(TAP_SCENE_GUIDE_STORAGE_KEY);
            if (shouldShowTapSceneGuide) wx.setStorageSync(TAP_SCENE_GUIDE_STORAGE_KEY, true);
        } catch (e) {}


        // --- Onboarding Guide Queue ---
        // To add a new guide in the future, append an entry to GUIDE_QUEUE.
        // Each entry needs a unique `key` (stored in wx.storage to track if shown),
        // a `show` function (called to display it), and a `hide` function.
        // The queue runs in order; only unseen guides are shown, one at a time.
        const GUIDE_QUEUE = [
            {
                key: 'kr_practice_guide_bubble_shown_v1',   // 1. 点击唤起键盘
                duration: 2500,
                show: () => this.setData({ showGuideBubble: true }),
                hide: () => this.setData({ showGuideBubble: false }),
            },
            {
                key: 'has_seen_shuffle_guide_v1',            // 2. 打乱单词
                duration: 2500,
                show: () => this.setData({ showShuffleGuide: true }),
                hide: () => this.setData({ showShuffleGuide: false }),
            },
            {
                key: 'has_shown_word_detail_tooltip',        // 3. 点击单词可查看例句 (same key as TOOLTIP_STORAGE_KEY)
                duration: 2500,
                show: () => this.setData({ showWordTooltip: true }),
                hide: () => this.setData({ showWordTooltip: false }),
            },
            {
                key: 'has_seen_settings_guide_v1',           // 4. 可选择词库
                duration: 2500,
                show: () => this.setData({ showSettingsTooltip: true, settingsTooltipText: '可选择词库' }),
                hide: () => this.setData({ showSettingsTooltip: false }),
            },
        ];

        // Filter to only unseen guides, mark them all as seen upfront
        const pending = shouldShowTapSceneGuide ? [] : GUIDE_QUEUE.filter(g => !wx.getStorageSync(g.key));
        pending.forEach(g => wx.setStorageSync(g.key, true));

        if (pending.length > 0) {
            const runNext = (index) => {
                if (index >= pending.length) return;
                const guide = pending[index];
                guide.show();
                setTimeout(() => {
                    guide.hide();
                    setTimeout(() => runNext(index + 1), 400);
                }, guide.duration);
            };
            setTimeout(() => runNext(0), 1000);
        }

        this.loadDailySentenceEntry();

        this.wordAudio = null;
        this.cnAudio = null;
	        this._audioPlaySeq = 0;
	        this._currentIndexRuntime = 0;
	        this._currentWordRuntime = null;
	        this._wordRenderSeq = 0;
	        this._hasUserGesture = false;
        this._autoPronouncedWordId = null;
        this._audioUrlMemo = new Map();
        this._audioFileLRU = new Map();
        this._audioFileLRUCapacity = 50;
        this._audioFileInFlight = new Map();
        this._audioPreloadQueue = [];
        this._audioPreloadQueueKeys = new Set();
        this._audioPreloadQueueRunning = false;
        this._audioPreloadQueueTimer = null;
        this._edgeTtsInFlight = new Map();
        this._preloadTask = null;
        this._preloadNextKey = null;
        this._hasPlayedAudioOnce = false;
        this._missingAudioPrompted = new Map();
        this._missingAudioToastAt = 0;
        this._attemptedPreloadKeys = new Set();
        this._sleepAudioContexts = {};
        this._sleepAudioPathMap = {};
        this._sleepCacheMap = sleepCacheMap;
        this._sleepDownloadRunning = false;
        this._sleepStarting = false;

        this.setData({
            statusBarHeight: windowInfo.statusBarHeight || 20,
            navBarHeight: 44, 
            isIPad,
            settings: mergedSettings,
            naggingRepeatCountPreview: mergedSettings.naggingRepeatCount,
            isKeyboardOpen: false,
            timeLeft: mergedSettings.timerDuration || DEFAULT_SETTINGS.timerDuration,
            isPC,
            inputFocus: isPC, // Auto focus on PC
            sleepActiveCategoryId,
            sleepSelectedIds: sleepState.selectedIds,
            sleepSelectedTracks: buildSleepSelectedTracks(sleepState.selectedIds, sleepState.volumes),
            sleepVolumes: sleepState.volumes,
            sleepTimerMinutes: sleepState.timerMinutes,
            sleepTimerPickerIndex: getSleepTimerPickerIndex(sleepState.timerMinutes),
            sleepTimerLabel: getSleepTimerLabel(sleepState.timerMinutes),
            sleepReadMeaning: sleepState.readMeaning,
            sleepKoreanRepeatCount: sleepState.koreanRepeatCount,
            sleepKoreanRepeatPickerIndex: getSleepKoreanRepeatPickerIndex(sleepState.koreanRepeatCount),
            sleepKoreanRepeatLabel: getSleepKoreanRepeatLabel(sleepState.koreanRepeatCount),
            sleepCacheMap,
            sleepCacheReady: sleepCacheSummary.ready,
            sleepCacheProgress: sleepCacheSummary.cachedCount,
            sleepCacheTotal: sleepCacheSummary.total,
            sleepCachePercent: sleepCacheSummary.percent,
            sleepCacheStatusText: sleepCacheSummary.ready
                ? `已本地加载 ${sleepCacheSummary.cachedCount}/${sleepCacheSummary.total}`
                : `点音色下载试听 · 全量约 ${formatSleepBytes(SLEEP_SOUND_TOTAL_BYTES)}`,
            sleepCacheButtonText: sleepCacheSummary.ready ? '已下载' : '一键下载',
            sleepSoundOptions: buildSleepSoundCards(sleepState.selectedIds, sleepState.volumes, sleepActiveCategoryId, sleepCacheMap),
            sleepActiveSummary: getSleepSummary(sleepState.selectedIds),
            showTapSceneGuide: shouldShowTapSceneGuide
        });

        try {
            if (wx.setInnerAudioOption) {
                wx.setInnerAudioOption({
                    obeyMuteSwitch: false,
                    mixWithOther: true
                });
            }
        } catch (e) {}

        await this.loadCategories();
        await this.loadSubcategories();
        this.updateDisplayCategory();
        this.loadWords();
    },

    async loadDailySentenceEntry() {
        try {
            const cached = wx.getStorageSync('kr_daily_sentence_entry_cache');
            const cachedAt = cached && cached.cachedAt != null ? Number(cached.cachedAt) : NaN;
            const cachedSource = cached && cached.source != null ? String(cached.source) : '';
            if (cachedSource && Number.isFinite(cachedAt) && Date.now() - cachedAt < 60 * 60 * 1000) {
                this.setData({ dailySentenceEntrySource: cachedSource });
                return;
            }
            if (!wx.cloud || !wx.cloud.callFunction) return;
            const res = await new Promise((resolve, reject) => {
                wx.cloud.callFunction({
                    name: 'getalldailysentence',
                    data: { page: 1, pageSize: 1, orderField: 'batchDate', orderDirection: 'desc', brief: true, noCache: true },
                    success: resolve,
                    fail: reject
                });
            });
            const result = res && res.result ? res.result : null;
            const item = result && Array.isArray(result.data) ? result.data[0] : null;
            const source = item && item.source != null ? String(item.source) : '';
            this.setData({ dailySentenceEntrySource: source });
            try {
                if (source) wx.setStorageSync('kr_daily_sentence_entry_cache', { cachedAt: Date.now(), source });
            } catch (e) {}
        } catch (e) {}
    },

    dismissWordTooltip() {
        this.setData({ showWordTooltip: false });
        wx.setStorageSync(TOOLTIP_STORAGE_KEY, true);
    },

    openSrsReview() {
        wx.navigateTo({ url: '/pages/srs-review/index' });
    },

    // 设置弹窗标题连点10次开启/关闭开发者模式
    onDevTriggerTap() {
        const now = Date.now();
        const last = this._devLastTap || 0;
        this._devLastTap = now;
        if (now - last > 2000) {
            this._devTapCount = 1;
            this._devFirstTap = now;
        } else {
            this._devTapCount = (this._devTapCount || 0) + 1;
        }
        if (this._devTapCount >= 10 && (now - (this._devFirstTap || now) <= 5000)) {
            const next = !this.data.showDevBtn;
            wx.setStorageSync('dev_mode_enabled', next);
            this.setData({ showDevBtn: next });
            wx.showToast({ title: next ? '🧪 开发者模式已开启' : '开发者模式已关闭', icon: 'none' });
            this._devTapCount = 0;
        }
    },

    debugSimulateNextDay() {
        const all = wx.getStorageSync('flashflow_srs') || {};
        const keys = Object.keys(all);
        if (keys.length === 0) {
            wx.showToast({ title: '还没有学习记录，先练几个单词', icon: 'none' });
            return;
        }
        const ONE_DAY = 86400000;
        keys.forEach(k => { all[k].nextReview = all[k].nextReview - ONE_DAY; });
        wx.setStorageSync('flashflow_srs', all);
        wx.removeStorageSync('flashflow_srs_daily');
        const count = srs.getTodayCount();
        this.setData({ srsCount: count });
        wx.showToast({ title: count > 0 ? `今日待复习 ${count}个` : '今天没有到期单词', icon: 'none' });
    },

    openDailySentence() {
        try { this.cancelCurrentAudioPlayback(); } catch (e) {}
        try { this.cancelAudioPreload(); } catch (e) {}
        
        wx.setStorageSync('kr_daily_sentence_force_latest', true);
        
        wx.navigateTo({
            url: '/pages/daily-sentence/index',
            fail: (err) => {
                console.error('[nv-practice] navigateTo failed', err);
                wx.showToast({
                    title: '跳转失败',
                    icon: 'none'
                });
            }
        });
    },

    closeTapSceneGuide() {
        this.setData({ showTapSceneGuide: false });
    },

    goTapSceneFromGuide() {
        this.setData({ showTapSceneGuide: false });
        try { wx.setStorageSync(TAP_SCENE_AUTO_OPEN_KEY, Date.now()); } catch (e) {}
        wx.switchTab({
            url: '/pages/picture-words/index',
            fail: () => {
                wx.navigateTo({ url: '/pages/tap-scene/index' });
            }
        });
    },


    showGuideBubbleWithTimeout() {
        const guideKey = 'kr_practice_guide_bubble_shown_v1';
        if (wx.getStorageSync(guideKey)) return;
        this.setData({ showGuideBubble: true });
        wx.setStorageSync(guideKey, true);
    },

    onGuideBubbleClick() {
        this.setData({ showGuideBubble: false });
        // Mark as shown only when user clicks/dismisses it
        wx.setStorageSync('kr_practice_guide_bubble_shown_v1', true);
    },

    preventScroll() {},

    createVideoAd() {
        if (shouldSkipAd('nv-practice')) return;
        if (this.videoAd) return;
        if (wx.createRewardedVideoAd) {
          this.videoAd = wx.createRewardedVideoAd({
            adUnitId: 'adunit-1d2566cb7cc546d7'
          });
          
          this.videoAd.onLoad(() => {
          });
          
          this.videoAd.onError((err) => {
            console.error('激励视频 广告加载失败', err);
          });
        }
    },

    handleAdClose(res) {
        // 用户点击了【关闭广告】按钮
        if (res && res.isEnded) {
            // 正常播放结束，可以下发奖励
            if (this.pendingAction) {
                // 记录解锁时间
                if (this.pendingContentId) {
                    try {
                        const key = `unlock_${this.pendingContentId}`;
                        wx.setStorageSync(key, Date.now());
                    } catch (e) {
                        console.error('Save unlock status failed', e);
                    }
                }
                this.pendingAction();
                this.pendingAction = null;
                this.pendingContentId = null;
            }
        } else {
            // 播放中途退出，不下发奖励
            wx.showToast({
                title: '需要看完广告才能切换',
                icon: 'none'
            });
            
            // 恢复Picker的显示（如果在Picker中取消）
            this.setData({
                categoryPickerIndex: this.data.categoryPickerIndex,
                yonseiLessonPickerIndex: this.data.yonseiLessonPickerIndex,
                topikLevelPickerIndex: this.data.topikLevelPickerIndex
            });
        }
    },

    checkAndShowAd: function(contentId, callback) {
      // 如果没有传 contentId，尝试将第一个参数当作 callback (兼容旧代码)
      if (typeof contentId === 'function') {
        callback = contentId;
        contentId = null;
      }

      if (shouldSkipAd('nv-practice')) {
        callback && callback();
        return;
      }

      // 检查是否在有效期内（7天）
      if (contentId) {
        try {
          const key = `unlock_${contentId}`;
          const lastUnlock = wx.getStorageSync(key);
          if (lastUnlock) {
            const now = Date.now();
            const diff = now - Number(lastUnlock);
            const sevenDays = 60 * 60 * 1000;
            if (diff < sevenDays) {
              // 有效期内，直接通过
              callback && callback();
              return;
            }
          }
        } catch (e) {
          console.error('Check unlock status failed', e);
        }
      }

      if (!this.videoAd) this.createVideoAd();

      // 如果没有广告实例，直接执行回调
      if (!this.videoAd) {
        callback && callback();
        return;
      }
  
      // 显示确认弹窗
      wx.showModal({
        title: '解锁章节',
        content: '解锁该章节需要观看一次广告，解锁后1小时内可自由切换。',
        confirmText: '观看广告',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 用户点击确定，展示广告
            this.pendingAction = callback;
            this.pendingContentId = contentId; // 记录待解锁ID
            this.videoAd.show().catch(() => {
              // 失败重试
              this.videoAd.load()
                .then(() => this.videoAd.show())
                .catch(err => {
                  console.error('激励视频 广告显示失败', err);
                  // 广告显示失败，直接允许切换
                  if (this.pendingAction) {
                    this.pendingAction();
                    this.pendingAction = null;
                    this.pendingContentId = null;
                  }
                });
            });
          } else {
            // 用户点击取消，不进行切换
            // 恢复Picker的显示
            this.setData({
              categoryPickerIndex: this.data.categoryPickerIndex,
              yonseiLessonPickerIndex: this.data.yonseiLessonPickerIndex,
              topikLevelPickerIndex: this.data.topikLevelPickerIndex
            });
          }
        }
      });
    },

    destroyAudioContexts() {
        try {
            if (this.wordAudio) {
                this.wordAudio.destroy();
                this.wordAudio = null;
            }
            if (this.cnAudio) {
                this.cnAudio.destroy();
                this.cnAudio = null;
            }
        } catch (e) {}
    },

    onHide() {
        this.stopNaggingLoop();
        this.cancelCurrentAudioPlayback();
        if (this.data.dualTimerRunning) {
            this.pauseDualTimer();
        } else {
            this.clearDualTimerInterval();
        }
        
        // Clear pending auto-pronounce to prevent ghost audio on return
        if (this._autoPronounceTimer) {
            clearTimeout(this._autoPronounceTimer);
            this._autoPronounceTimer = null;
        }
        
        // Clear preload timer
        if (this._preloadTimer) {
             clearTimeout(this._preloadTimer);
             this._preloadTimer = null;
        }

        // Destroy ALL audio contexts to prevent background resurrection
        this.destroyAudioContexts();
        this._sentenceAudioToken = '';
        this.setData({ sentenceAudioState: '', sentenceAudioIndex: -1 });
        if (this._sentenceAudioCtx) {
            try { 
                this._sentenceAudioCtx.stop();
                this._sentenceAudioCtx.destroy(); 
            } catch(e) {}
            this._sentenceAudioCtx = null;
        }

        if (this.videoAd && this._boundAdClose) {
            this.videoAd.offClose(this._boundAdClose);
        }
    },

    onUnload() {
        this.stopNaggingLoop();
        this.clearDualTimerInterval();
        this.clearSleepTimer && this.clearSleepTimer();
        this.stopSleepBackgroundAudio && this.stopSleepBackgroundAudio();
        this.stopSleepAudioContexts && this.stopSleepAudioContexts();
        this.stopSleepPreviewAudio && this.stopSleepPreviewAudio();
        this.stopSleepWordLoop && this.stopSleepWordLoop({ silent: true });
        this.setSleepKeepScreenOn && this.setSleepKeepScreenOn(false);
        this.persistCurrentProgress();
        this.cancelAudioPreload();
        this.clearAudioFileLRU();
        this.clearAllTimers();
        if (this._attemptedPreloadKeys) this._attemptedPreloadKeys.clear();
        if (this.videoAd && this._boundAdClose) {
            this.videoAd.offClose(this._boundAdClose);
        }
        this.destroyAudioContexts();
        this._sentenceAudioToken = '';
        this.setData({ sentenceAudioState: '', sentenceAudioIndex: -1 });
        if (this._sentenceAudioCtx) {
            try { this._sentenceAudioCtx.destroy(); } catch (e) {}
            this._sentenceAudioCtx = null;
        }
    },

    cancelAudioPreload() {
        try {
            if (this._preloadTask && typeof this._preloadTask.abort === 'function') {
                this._preloadTask.abort();
            }
        } catch (e) {}
        this._preloadTask = null;
        this._preloadNextKey = null;
        this.clearAudioPreloadQueue();
    },

    clearAudioPreloadQueue() {
        if (this._audioPreloadQueueTimer) {
            try { clearTimeout(this._audioPreloadQueueTimer); } catch (e) {}
            this._audioPreloadQueueTimer = null;
        }
        this._audioPreloadQueue = [];
        if (this._audioPreloadQueueKeys && this._audioPreloadQueueKeys.clear) {
            try { this._audioPreloadQueueKeys.clear(); } catch (e) {}
        } else {
            this._audioPreloadQueueKeys = new Set();
        }
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
        this.clearAudioPreloadQueue();
        this._edgeTtsInFlight = new Map();
    },

    hasLocalAudioFile(p) {
        const path = p ? String(p) : '';
        if (!path) return false;
        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        if (!fs) return true;
        try {
            if (typeof fs.statSync === 'function') {
                const stat = fs.statSync(path);
                return stat.size > 0;
            } else if (typeof fs.accessSync === 'function') {
                fs.accessSync(path);
                return true;
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
        // Trust LRU cache to avoid frequent IO checks which may fail and cause re-download
        if (!p) {
            try { this._audioFileLRU.delete(key); } catch (e) {}
            return '';
        }
        try {
            this._audioFileLRU.delete(key);
            this._audioFileLRU.set(key, p);
        } catch (e) {}
        return String(p);
    },

    removeAudioFromLRU(cacheKey) {
        const key = cacheKey ? String(cacheKey) : '';
        if (!key || !this._audioFileLRU || !this._audioFileLRU.has(key)) return;
        const p = this._audioFileLRU.get(key);
        this._audioFileLRU.delete(key);
        
        // Also try to delete file to clean up
        if (p) {
            const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
            if (fs && fs.unlinkSync) {
                try { fs.unlinkSync(p); } catch (e) {}
            }
        }
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
                            if (!ok) {
                                return tryNext(idx + 1);
                            }
                            
                            let finalPath = String(res.tempFilePath);
                            
                            // Try to save to permanent storage to avoid OSS requests on replay
                            try {
                                const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
                                if (fs && wx.env && wx.env.USER_DATA_PATH) {
                                    const dir = `${wx.env.USER_DATA_PATH}/audio_cache`;
                                    try { fs.accessSync(dir); } catch(e) { 
                                        try { fs.mkdirSync(dir, {recursive: true}); } catch(e2) {} 
                                    }
                                    
                                    // Sanitize key for filename
                                    const safeName = String(key).replace(/[^\w\-\u4e00-\u9fa5\uac00-\ud7a3]/g, '_') + '.mp3';
                                    const dest = `${dir}/${safeName}`;
                                    
                                    // Remove existing if any
                                    try { fs.unlinkSync(dest); } catch(e) {}
                                    
                                    // saveFileSync moves/copies temp file to user path
                                    fs.saveFileSync(finalPath, dest);
                                    
                                    this.setAudioFileToLRU(key, dest);
                                } else {
                                    // If no user path (should not happen), cache temp
                                    this.setAudioFileToLRU(key, finalPath);
                                }
                            } catch (e) {
                                console.error('Save audio cache failed', e);
                                // Fallback: cache the temp file if saving failed
                                this.setAudioFileToLRU(key, finalPath);
                            }

                            if (this._audioUrlMemo && this._audioUrlMemo.set) {
                                this._audioUrlMemo.set(key, url);
                            }
                            resolve(finalPath);
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

    enqueueAudioPreload(cacheKey, urls) {
        const key = cacheKey ? String(cacheKey) : '';
        const candidates = Array.isArray(urls) ? urls.filter(Boolean) : [];
        if (!key || !candidates.length) return;
        if (this.getAudioFileFromLRU(key)) return;
        if (this._audioFileInFlight && this._audioFileInFlight.has(key)) return;
        if (!this._audioPreloadQueue) this._audioPreloadQueue = [];
        if (!this._audioPreloadQueueKeys) this._audioPreloadQueueKeys = new Set();
        if (this._audioPreloadQueueKeys.has(key)) return;

        this._audioPreloadQueue.push({ cacheKey: key, urls: candidates });
        this._audioPreloadQueueKeys.add(key);
        while (this._audioPreloadQueue.length > 8) {
            const dropped = this._audioPreloadQueue.pop();
            if (dropped && dropped.cacheKey) {
                try { this._audioPreloadQueueKeys.delete(dropped.cacheKey); } catch (e) {}
            }
        }
        this.processAudioPreloadQueue();
    },

    processAudioPreloadQueue() {
        if (this._audioPreloadQueueRunning) return;
        const queue = Array.isArray(this._audioPreloadQueue) ? this._audioPreloadQueue : [];
        if (!queue.length) return;

        const item = queue.shift();
        if (item && item.cacheKey && this._audioPreloadQueueKeys) {
            try { this._audioPreloadQueueKeys.delete(item.cacheKey); } catch (e) {}
        }
        if (!item || !item.cacheKey || !Array.isArray(item.urls) || !item.urls.length) {
            this.processAudioPreloadQueue();
            return;
        }
        if (this.getAudioFileFromLRU(item.cacheKey) || (this._audioFileInFlight && this._audioFileInFlight.has(item.cacheKey))) {
            this.processAudioPreloadQueue();
            return;
        }

        this._audioPreloadQueueRunning = true;
        if (!this._attemptedPreloadKeys) this._attemptedPreloadKeys = new Set();
        this._attemptedPreloadKeys.add(item.cacheKey);
        this.downloadAudioToLRU(item.cacheKey, item.urls)
            .catch(() => '')
            .then(() => {
                this._audioPreloadQueueRunning = false;
                if (this._audioPreloadQueue && this._audioPreloadQueue.length) {
                    if (this._audioPreloadQueueTimer) clearTimeout(this._audioPreloadQueueTimer);
                    this._audioPreloadQueueTimer = setTimeout(() => {
                        this._audioPreloadQueueTimer = null;
                        this.processAudioPreloadQueue();
                    }, AUDIO_PRELOAD_QUEUE_GAP_MS);
                }
            });
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
        if (category === PHOTO_RECOGNITION_CATEGORY) {
            return 'photo_recognition';
        }
        if (category === PICTURE_WORDS_PRACTICE_CATEGORY) {
            return 'picture_words_practice';
        }
        return '';
    },

    getWordsContentKey(settings) {
        const s = settings || DEFAULT_SETTINGS;
        const category = s.category || DEFAULT_SETTINGS.category;
        const lessonId = s.yonseiLessonId != null ? String(s.yonseiLessonId) : '';
        const topikLevel = s.topikLevel != null ? String(s.topikLevel) : '';
        const topikSession = s.topikSession != null ? String(s.topikSession) : '';
        const wordLengthFilter = s.wordLengthFilter != null ? String(s.wordLengthFilter) : '';
        const wordStartFilter = s.wordStartFilter != null ? String(s.wordStartFilter) : '';
        if (category === PHOTO_RECOGNITION_CATEGORY) {
            const photoWords = getPhotoRecognitionWords();
            const latestId = photoWords[0] && photoWords[0].id != null ? String(photoWords[0].id) : '';
            return `${category}__${photoWords.length}__${latestId}`;
        }
        if (category === PICTURE_WORDS_PRACTICE_CATEGORY) {
            const pictureWords = getPictureWordsPracticeWords();
            const latestId = pictureWords[0] && pictureWords[0].id != null ? String(pictureWords[0].id) : '';
            return `${category}__${pictureWords.length}__${latestId}`;
        }
        return `${category}__${lessonId}__${topikLevel}__${topikSession}__${wordLengthFilter}__${wordStartFilter}`;
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
        const base = await getCategories();
        const categories = Array.isArray(base) ? [...base] : [];
        if (!categories.includes('Mistakes (错题本)')) categories.push('Mistakes (错题本)');
        // 收藏夹仅在有收藏单词时才作为可选词书出现
        if (getFavorites().length > 0 && !categories.includes(FAVORITES_LIST_NAME)) {
            categories.push(FAVORITES_LIST_NAME);
        }
        if (getPhotoRecognitionWords().length > 0 && !categories.includes(PHOTO_RECOGNITION_CATEGORY)) {
            categories.push(PHOTO_RECOGNITION_CATEGORY);
        }
        if (getPictureWordsPracticeWords().length > 0 && !categories.includes(PICTURE_WORDS_PRACTICE_CATEGORY)) {
            categories.push(PICTURE_WORDS_PRACTICE_CATEGORY);
        }
        const current = (this.data.settings && this.data.settings.category) || DEFAULT_SETTINGS.category;
        const idx = Math.max(0, categories.indexOf(current));
        this.setData({ categories, categoryPickerIndex: idx });
    },

	    onShow: async function() {
	        this.clearAllTimers();
	        this.cancelCurrentAudioPlayback();
	        this.createVideoAd();
        if (this.videoAd) {
            if (!this._boundAdClose) {
                this._boundAdClose = this.handleAdClose.bind(this);
            }
            this.videoAd.offClose(this._boundAdClose);
            this.videoAd.onClose(this._boundAdClose);
        }

	        syncPageTabBar(this, { selected: 0, hidden: false });
	        let forceReloadInfo = null;
	        try {
	            const pendingReload = wx.getStorageSync('nv_practice_force_reload');
	            if (pendingReload && typeof pendingReload === 'object') {
	                forceReloadInfo = pendingReload;
	                wx.removeStorageSync('nv_practice_force_reload');
	            }
	        } catch (e) {}
	        let liveCategories = [...(this.data.categories || [])];
        let categoriesChanged = false;
        if (getFavorites().length > 0 && !liveCategories.includes(FAVORITES_LIST_NAME)) {
            liveCategories.push(FAVORITES_LIST_NAME);
            categoriesChanged = true;
        }
        const photoRecognitionCount = getPhotoRecognitionWords().length;
        if (photoRecognitionCount > 0 && !liveCategories.includes(PHOTO_RECOGNITION_CATEGORY)) {
            liveCategories.push(PHOTO_RECOGNITION_CATEGORY);
            categoriesChanged = true;
        } else if (photoRecognitionCount <= 0 && liveCategories.includes(PHOTO_RECOGNITION_CATEGORY)) {
            liveCategories = liveCategories.filter((item) => item !== PHOTO_RECOGNITION_CATEGORY);
            categoriesChanged = true;
        }
        const pictureWordsPracticeCount = getPictureWordsPracticeWords().length;
        if (pictureWordsPracticeCount > 0 && !liveCategories.includes(PICTURE_WORDS_PRACTICE_CATEGORY)) {
            liveCategories.push(PICTURE_WORDS_PRACTICE_CATEGORY);
            categoriesChanged = true;
        } else if (pictureWordsPracticeCount <= 0 && liveCategories.includes(PICTURE_WORDS_PRACTICE_CATEGORY)) {
            liveCategories = liveCategories.filter((item) => item !== PICTURE_WORDS_PRACTICE_CATEGORY);
            categoriesChanged = true;
        }
        if (categoriesChanged) {
            this.setData({ categories: liveCategories });
        }
        // 更新今日待复习数量 & 开发者模式
        const devEnabled = wx.getStorageSync('dev_mode_enabled') || false;
        console.log('[SRS] dev_mode_enabled:', devEnabled, 'srsCount:', srs.getTodayCount());
        this.setData({ srsCount: srs.getTodayCount(), showDevBtn: devEnabled });
        const newSettings = wx.getStorageSync('settings') || {};
        const mergedSettings = sanitizeSettings(newSettings);
        const prevSettings = sanitizeSettings(this.data.settings || {});
        const prevKey = this.getWordsContentKey(prevSettings);
        const nextCategory = mergedSettings.category || DEFAULT_SETTINGS.category;
        const categoryIndex = Math.max(0, liveCategories.indexOf(nextCategory));

        this.setData({
            settings: mergedSettings,
            categoryPickerIndex: categoryIndex,
            naggingRepeatCountPreview: mergedSettings.naggingRepeatCount
        });
        const finalSettings = await this.loadSubcategories(mergedSettings);
	        this.updateDisplayCategory();

	        const nextKey = this.getWordsContentKey(finalSettings || mergedSettings);
	        const forceReload = !!forceReloadInfo && (!forceReloadInfo.category || forceReloadInfo.category === nextCategory);
	        if (forceReload || prevKey !== nextKey || !Array.isArray(this.data.words) || this.data.words.length === 0) {
	            this.stopNaggingLoop();
	            this._sentenceAudioToken = '';
	            this.setData({ sentenceAudioState: '', sentenceAudioIndex: -1 });
	            if (this._sentenceAudioCtx) {
                try {
                    this._sentenceAudioCtx.stop();
                    this._sentenceAudioCtx.destroy();
                } catch (e) {}
                this._sentenceAudioCtx = null;
            }
            this.loadWords(finalSettings || mergedSettings);
        }

        if (this.data.isPC) {
            this.setData({ inputFocus: true });
        }

        // 处理外部跳转带来的待收藏单词
        this.processPendingFavoriteImport();
    },

    // 解析 words 参数：优先 JSON 数组 [{word,meaning},...]，回退到单个 word/meaning。
    parseFavoriteQuery(query) {
        const q = query || {};
        const out = [];
        const seen = new Set();
        const push = (word, meaning, scene) => {
            const w = word != null ? String(word).trim() : '';
            if (!w || seen.has(w)) return;
            seen.add(w);
            const item = { word: w, meaning: meaning != null ? String(meaning).trim() : '' };
            if (scene != null && String(scene).trim()) item.scene = String(scene).trim();
            out.push(item);
        };

        // words 可能是：①真数组（来自 extraData 兜底）②JSON 字符串（来自 query）
        let arr = null;
        if (Array.isArray(q.words)) {
            arr = q.words;
        } else if (q.words != null && String(q.words).trim()) {
            const raw = String(q.words);
            // 微信 onLoad(options) 已自动 decode 过一次，先直接 parse；
            // 仅当直接 parse 失败时，才尝试再 decode 一次（兼容未被框架 decode 的来源）。
            // 不无条件 decode，避免把释义里字面的 %xx 误还原（如 "100%20off"）。
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) arr = parsed;
            } catch (e1) {
                try {
                    const parsed = JSON.parse(decodeURIComponent(raw));
                    if (Array.isArray(parsed)) arr = parsed;
                } catch (e2) {
                    console.warn('[favImport] words 参数解析失败', e2);
                }
            }
        }
        if (Array.isArray(arr)) {
            arr.forEach((it) => {
                if (it && typeof it === 'object') push(it.word, it.meaning, it.scene || q.scene);
            });
        }

        // 单个单词参数（与 words 并存时也一并收入）
        if (q.word != null && String(q.word).trim()) {
            push(q.word, q.meaning, q.scene);
        }
        return out;
    },

    processPendingFavoriteImport() {
        let pending = null;
        try { pending = wx.getStorageSync('pending_fav_import'); } catch (e) {}
        if (!pending || !pending.query) return;
        // 防重复：消费即清除
        try { wx.removeStorageSync('pending_fav_import'); } catch (e) {}

        const words = this.parseFavoriteQuery(pending.query);
        if (words.length === 0) return;

        const res = addFavorites(words);
        if (!res || !res.success) {
            wx.showToast({ title: (res && res.message) || '收藏失败', icon: 'none' });
            return;
        }

        // 确保收藏夹出现在词书列表里
        if (!(this.data.categories || []).includes(FAVORITES_LIST_NAME)) {
            this.setData({ categories: [...(this.data.categories || []), FAVORITES_LIST_NAME] });
        }

        const addedText = res.added > 0 ? `已收藏 ${res.added} 个新单词` : '单词已在收藏中';
        wx.showModal({
            title: '收藏成功',
            content: `${addedText}（共 ${res.total} 个）。是否切换到「${FAVORITES_LIST_NAME}」开始练习？`,
            confirmText: '去练习',
            cancelText: '稍后',
            success: (r) => {
                if (r.confirm) {
                    const idx = Math.max(0, (this.data.categories || []).indexOf(FAVORITES_LIST_NAME));
                    this.applyCategorySelection(FAVORITES_LIST_NAME, idx);
                }
            }
        });
    },

    async loadSubcategories(settingsOverride) {
        const currentSettings = settingsOverride || this.data.settings || {};
        const category = currentSettings.category || DEFAULT_SETTINGS.category;

        if (category === 'TOPIK Vocabulary') {
            const topikLevels = await getTopikLevels();
            let topikLevel = currentSettings.topikLevel || '';
            topikLevel = String(topikLevel || topikLevels[0] || DEFAULT_SETTINGS.topikLevel || '1');
            if (topikLevels.length > 0 && !topikLevels.includes(topikLevel)) {
                topikLevel = String(topikLevels[0]);
            }

            const topikSessions = await getTopikSessions(topikLevel);
            let topikSession = currentSettings.topikSession || '';
            topikSession = String(topikSession || topikSessions[0] || '');
            if (topikSession && topikSessions.length > 0 && !topikSessions.includes(topikSession)) {
                topikSession = String(topikSessions[0] || '');
            }

            const nextSettings = Object.assign({}, currentSettings);
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
            return next;
        }

        if (/^Yonsei\s+\d$/.test(category)) {
            const yonseiLessons = await getYonseiLessons(category);
            
            const currentLessonId = currentSettings.yonseiLessonId || '';
            
            let yonseiLessonId = currentLessonId;
            let yonseiLessonName = currentSettings.yonseiLessonName || '';

            // Validate Lesson ID range
            const exists = yonseiLessons && yonseiLessons.some(l => String(l.id) === String(yonseiLessonId));

            if ((!yonseiLessonId || !exists) && yonseiLessons.length > 0) {
                yonseiLessonId = yonseiLessons[0].id;
                yonseiLessonName = yonseiLessons[0].name || yonseiLessons[0].original || '';
            } else if (yonseiLessonId) {
                const match = yonseiLessons.find(l => String(l.id) === String(yonseiLessonId));
                if (match) yonseiLessonName = match.name || match.original || '';
            }

            const newSettings = Object.assign({}, currentSettings);
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
            return sanitizeSettings(newSettings);
        }

        const newSettings = Object.assign({}, currentSettings);
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
        return sanitizeSettings(newSettings);
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

    readSleepCacheMap() {
        let saved = {};
        try {
            const raw = wx.getStorageSync(SLEEP_CACHE_STORAGE_KEY);
            saved = raw && raw.files ? raw.files : (raw || {});
        } catch (e) {}

        const fs = wx.getFileSystemManager && wx.getFileSystemManager();
        const cacheMap = {};
        let removedStale = false;
        Object.keys(saved || {}).forEach((id) => {
            const option = getSleepOptionById(id);
            const filePath = saved[id];
            if (!option || !filePath || isSleepFallbackPath(filePath)) {
                removedStale = true;
                return;
            }
            if (!fs || !fs.accessSync) {
                cacheMap[id] = filePath;
                return;
            }
            try {
                fs.accessSync(filePath);
                cacheMap[id] = filePath;
            } catch (e) {
                removedStale = true;
            }
        });
        if (removedStale) {
            try {
                wx.setStorageSync(SLEEP_CACHE_STORAGE_KEY, {
                    version: '20260706.002',
                    files: cacheMap,
                    updatedAt: Date.now()
                });
            } catch (e) {}
        }
        return cacheMap;
    },

    persistSleepCacheMap(cacheMap) {
        try {
            wx.setStorageSync(SLEEP_CACHE_STORAGE_KEY, {
                version: '20260706.002',
                files: cacheMap || {},
                updatedAt: Date.now()
            });
        } catch (e) {}
    },

    refreshSleepCacheState(cacheMap, options = {}) {
        const nextCacheMap = cacheMap || this._sleepCacheMap || {};
        const summary = getSleepCacheSummary(nextCacheMap);
        const downloading = options.downloading != null ? options.downloading : this.data.sleepCacheDownloading;
        const statusText = options.statusText || (summary.ready
            ? `已本地加载 ${summary.cachedCount}/${summary.total}`
            : `已加载 ${summary.cachedCount}/${summary.total} · 约 ${formatSleepBytes(SLEEP_SOUND_TOTAL_BYTES)}`);
        this._sleepCacheMap = nextCacheMap;
        this.setData({
            sleepCacheMap: nextCacheMap,
            sleepCacheReady: summary.ready,
            sleepCacheDownloading: downloading,
            sleepCacheProgress: summary.cachedCount,
            sleepCacheTotal: summary.total,
            sleepCachePercent: summary.percent,
            sleepCacheStatusText: statusText,
            sleepCacheButtonText: downloading ? `${summary.percent}%` : (summary.ready ? '已下载' : '一键下载'),
            sleepSoundOptions: buildSleepSoundCards(
                this.data.sleepSelectedIds,
                this.data.sleepVolumes,
                this.data.sleepActiveCategoryId,
                nextCacheMap
            )
        });
    },

    getSleepCachedPath(option, cacheMap = this._sleepCacheMap) {
        if (!option) return '';
        const filePath = cacheMap && cacheMap[option.id];
        if (!filePath) return '';
        if (isSleepFallbackPath(filePath)) {
            if (cacheMap) delete cacheMap[option.id];
            return '';
        }
        const fs = wx.getFileSystemManager && wx.getFileSystemManager();
        if (!fs || !fs.accessSync) return filePath;
        try {
            fs.accessSync(filePath);
            return filePath;
        } catch (e) {
            if (cacheMap) delete cacheMap[option.id];
            return '';
        }
    },

    getSleepRemoteCandidates(option) {
        if (!option) return [];
        return [option.remoteSrc, option.originalSrc]
            .filter(Boolean)
            .filter((url, index, list) => list.indexOf(url) === index);
    },

    downloadSleepUrl(url) {
        return new Promise((resolve, reject) => {
            if (!url || !wx.downloadFile) {
                reject(new Error('missing sleep remote audio'));
                return;
            }
            wx.downloadFile({
                url,
                success: (res) => {
                    if (!res || res.statusCode < 200 || res.statusCode >= 300 || !res.tempFilePath) {
                        const err = new Error(`download failed: ${res && res.statusCode}`);
                        err.statusCode = res && res.statusCode;
                        err.remoteSrc = url;
                        reject(err);
                        return;
                    }
                    if (!wx.saveFile) {
                        resolve(res.tempFilePath);
                        return;
                    }
                    wx.saveFile({
                        tempFilePath: res.tempFilePath,
                        success: (saveRes) => resolve(saveRes.savedFilePath || res.tempFilePath),
                        fail: reject
                    });
                },
                fail: (err) => {
                    if (err && typeof err === 'object') err.remoteSrc = url;
                    reject(err);
                }
            });
        });
    },

    async downloadSleepRemoteFile(option) {
        const urls = this.getSleepRemoteCandidates(option);
        if (!urls.length) throw new Error('missing sleep remote audio');

        let lastError = null;
        for (const url of urls) {
            try {
                return await this.downloadSleepUrl(url);
            } catch (err) {
                lastError = err;
                console.log('[sleep audio] download candidate skipped:', option && option.id, url);
            }
        }
        throw lastError || new Error('sleep remote audio download failed');
    },

    createSleepFallbackFile(option) {
        const fs = wx.getFileSystemManager && wx.getFileSystemManager();
        if (!fs || !wx.env || !wx.env.USER_DATA_PATH || !option) return '';
        const path = `${wx.env.USER_DATA_PATH}/sleep_${option.id}_fallback_v2.wav`;
        try {
            if (fs.accessSync) {
                fs.accessSync(path);
                return path;
            }
        } catch (e) {}
        const buffer = buildSleepWavBuffer(
            getSleepFallbackKind(option),
            `${option.id || ''}:${option.label || option.name || ''}`
        );
        fs.writeFileSync(path, buffer);
        return path;
    },

    async cacheSleepOption(option, options = {}) {
        if (!option) return '';
        const cacheMap = this._sleepCacheMap || this.readSleepCacheMap();
        const cachedPath = this.getSleepCachedPath(option, cacheMap);
        if (cachedPath) return cachedPath;

        let filePath = '';
        let fallback = false;
        const allowFallback = options.allowFallback !== false;
        if (option.src) {
            filePath = option.src;
        } else {
            try {
                filePath = await this.downloadSleepRemoteFile(option);
            } catch (err) {
                if (!allowFallback) throw err;
                console.log('[sleep audio] remote unavailable, using fallback:', option.id);
                filePath = this.createSleepFallbackFile(option);
                fallback = true;
                if (!filePath) throw err;
            }
        }
        if (filePath && !fallback) {
            cacheMap[option.id] = filePath;
            this._sleepCacheMap = cacheMap;
            this.persistSleepCacheMap(cacheMap);
        } else if (filePath) {
            this._sleepCacheMap = cacheMap;
        }
        return filePath;
    },

    async downloadAllSleepSounds() {
        if (this._sleepDownloadRunning || this.data.sleepCacheDownloading) return;
        let cacheMap = this.readSleepCacheMap();
        this._sleepCacheMap = cacheMap;
        let summary = getSleepCacheSummary(cacheMap);
        if (summary.ready) {
            this.refreshSleepCacheState(cacheMap, { statusText: `已本地加载 ${summary.cachedCount}/${summary.total}` });
            wx.showToast({ title: '音频已加载', icon: 'none' });
            return;
        }

        this._sleepDownloadRunning = true;
        this.refreshSleepCacheState(cacheMap, {
            downloading: true,
            statusText: `准备加载 ${summary.total - summary.cachedCount} 个音频`
        });

        let failed = 0;
        for (let i = 0; i < SLEEP_SOUND_OPTIONS.length; i += 1) {
            const option = SLEEP_SOUND_OPTIONS[i];
            if (this.getSleepCachedPath(option, cacheMap)) {
                summary = getSleepCacheSummary(cacheMap);
                this.refreshSleepCacheState(cacheMap, {
                    downloading: true,
                    statusText: `已加载 ${summary.cachedCount}/${summary.total}`
                });
                continue;
            }
            this.refreshSleepCacheState(cacheMap, {
                downloading: true,
                statusText: `正在加载 ${i + 1}/${SLEEP_SOUND_OPTIONS.length} · ${option.name}`
            });
            try {
                await this.cacheSleepOption(option, { allowFallback: false });
                cacheMap = this._sleepCacheMap || cacheMap;
            } catch (e) {
                failed += 1;
                console.warn('[sleep cache] download failed:', option.id, e);
            }
        }

        this._sleepDownloadRunning = false;
        summary = getSleepCacheSummary(cacheMap);
        this.refreshSleepCacheState(cacheMap, {
            downloading: false,
            statusText: failed
                ? `已加载 ${summary.cachedCount}/${summary.total}，${failed} 个失败`
                : `已本地加载 ${summary.cachedCount}/${summary.total}`
        });
        wx.showToast({
            title: failed ? `有 ${failed} 个未加载` : '音频加载完成',
            icon: 'none'
        });
    },

    persistSleepState(nextState = {}) {
        const selectedIds = nextState.selectedIds || this.data.sleepSelectedIds || [SLEEP_DEFAULT_SOUND_ID];
        const volumes = nextState.volumes || this.data.sleepVolumes || {};
        const timerMinutes = nextState.timerMinutes != null ? nextState.timerMinutes : this.data.sleepTimerMinutes;
        const readMeaning = nextState.readMeaning != null ? !!nextState.readMeaning : !!this.data.sleepReadMeaning;
        const koreanRepeatCount = nextState.koreanRepeatCount != null
            ? Number(nextState.koreanRepeatCount)
            : Number(this.data.sleepKoreanRepeatCount || 2);
        try {
            wx.setStorageSync(SLEEP_STORAGE_KEY, { selectedIds, volumes, timerMinutes, readMeaning, koreanRepeatCount });
        } catch (e) {}
    },

    togglePracticeTools() {
        this.setData({ practiceToolsOpen: !this.data.practiceToolsOpen });
    },

    tapPracticeDualTool() {
        this.setData({ practiceToolsOpen: false }, () => {
            this.toggleDualColumnMode();
        });
    },

    tapPracticeSleepTool() {
        this.setData({ practiceToolsOpen: false }, () => {
            if (this.data.sleepPlaying) {
                this.enterSleepFocusMode();
            } else {
                this.openSleepPanel();
            }
        });
    },

    hasSeenSleepGuide() {
        try {
            return !!wx.getStorageSync(SLEEP_GUIDE_STORAGE_KEY);
        } catch (e) {
            return false;
        }
    },

    markSleepGuideSeen() {
        try {
            wx.setStorageSync(SLEEP_GUIDE_STORAGE_KEY, true);
        } catch (e) {}
    },

    dismissSleepGuide() {
        this.markSleepGuideSeen();
        if (this.data.sleepGuideVisible) {
            this.setData({ sleepGuideVisible: false });
        }
    },

    openSleepPanel() {
        this.setData({
            sleepPanelOpen: true,
            sleepGuideVisible: !this.hasSeenSleepGuide(),
            practiceToolsOpen: false,
            showGuideBubble: false
        });
    },

    closeSleepPanel() {
        this._sleepPreviewToken = Number(this._sleepPreviewToken || 0) + 1;
        this.stopSleepPreviewAudio();
        if (this._sleepWordLoopRunning && !this.data.sleepPlaying) {
            this.stopSleepWordLoop({ silent: true });
        }
        this.setData({
            sleepPanelOpen: false,
            sleepPreviewLoadingId: '',
            sleepGuideVisible: false
        });
    },

    selectSleepCategory(e) {
        const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
        const categoryId = normalizeSleepCategoryId(id);
        this.setData({
            sleepActiveCategoryId: categoryId,
            sleepSoundOptions: buildSleepSoundCards(
                this.data.sleepSelectedIds,
                this.data.sleepVolumes,
                categoryId,
                this._sleepCacheMap || this.data.sleepCacheMap
            )
        });
    },

    toggleSleepSound(e) {
        const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
        if (!getSleepOptionById(id)) return;

        let selectedIds = (this.data.sleepSelectedIds || []).slice();
        const exists = selectedIds.indexOf(id) >= 0;
        if (exists) {
            selectedIds = selectedIds.filter(item => item !== id);
        } else {
            if (selectedIds.length >= SLEEP_MAX_TRACKS) {
                wx.showToast({ title: '最多叠加3个声音', icon: 'none' });
                return;
            }
            selectedIds.push(id);
        }

        const sleepSoundOptions = buildSleepSoundCards(
            selectedIds,
            this.data.sleepVolumes,
            this.data.sleepActiveCategoryId,
            this._sleepCacheMap || this.data.sleepCacheMap
        );
        this.setData({
            sleepSelectedIds: selectedIds,
            sleepSelectedTracks: buildSleepSelectedTracks(selectedIds, this.data.sleepVolumes),
            sleepSoundOptions,
            sleepActiveSummary: getSleepSummary(selectedIds)
        }, () => {
            this.persistSleepState({ selectedIds });
            if (this.data.sleepPlaying) {
                if (selectedIds.length) {
                    this.startSleepMixer({ keepTimer: true });
                } else {
                    this.stopSleepMixer();
                }
            }
        });
    },

    changeSleepVolume(e) {
        const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
        const option = getSleepOptionById(id);
        if (!option) return;
        const value = Math.max(0, Math.min(100, Math.round(Number(e.detail && e.detail.value) || 0)));
        const volumes = Object.assign({}, this.data.sleepVolumes || {}, { [id]: value });
        this.setData({
            sleepVolumes: volumes,
            sleepSelectedTracks: buildSleepSelectedTracks(this.data.sleepSelectedIds, volumes),
            sleepSoundOptions: buildSleepSoundCards(
                this.data.sleepSelectedIds,
                volumes,
                this.data.sleepActiveCategoryId,
                this._sleepCacheMap || this.data.sleepCacheMap
            )
        }, () => this.persistSleepState({ volumes }));

        const ctx = this._sleepAudioContexts && this._sleepAudioContexts[id];
        if (ctx) {
            try { ctx.volume = getSleepOutputVolume(value); } catch (err) {}
        }
        if (this._sleepBackgroundAudio && this._sleepBackgroundAudioId === id) {
            try { this._sleepBackgroundAudio.volume = getSleepOutputVolume(value); } catch (err) {}
        }
        if (this._sleepPreviewAudio && this.data.sleepPreviewingId === id) {
            try { this._sleepPreviewAudio.volume = getSleepOutputVolume(value, SLEEP_PREVIEW_GAIN); } catch (err) {}
        }

        const eventType = String(e.type || '');
        if (!this.data.sleepPlaying && eventType === 'change' && this.data.sleepPreviewingId !== id && this.data.sleepPreviewLoadingId !== id) {
            if (this._sleepVolumePreviewTimer) clearTimeout(this._sleepVolumePreviewTimer);
            this._sleepVolumePreviewTimer = setTimeout(() => {
                this._sleepVolumePreviewTimer = null;
                if (this.data.sleepPlaying || this.data.sleepPreviewingId === id || this.data.sleepPreviewLoadingId) return;
                this.tapSleepSound({ currentTarget: { dataset: { id } } });
            }, 80);
        }
    },

    applySleepTimer(minutes) {
        const valid = SLEEP_TIMER_OPTIONS.some(item => item.minutes === minutes);
        if (!valid) return;
        this.setData({
            sleepTimerMinutes: minutes,
            sleepTimerPickerIndex: getSleepTimerPickerIndex(minutes),
            sleepTimerLabel: getSleepTimerLabel(minutes)
        }, () => {
            this.persistSleepState({ timerMinutes: minutes });
            if (this.data.sleepPlaying) this.scheduleSleepTimer();
        });
    },

    selectSleepTimer(e) {
        const minutes = Number(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.minutes) || 0;
        this.applySleepTimer(minutes);
    },

    onSleepTimerPickerChange(e) {
        const index = Number(e.detail && e.detail.value) || 0;
        const option = SLEEP_TIMER_OPTIONS[index] || SLEEP_TIMER_OPTIONS[0];
        this.applySleepTimer(option.minutes);
    },

    toggleSleepReadMeaning() {
        const readMeaning = !this.data.sleepReadMeaning;
        this.setData({ sleepReadMeaning: readMeaning }, () => {
            this.persistSleepState({ readMeaning });
        });
    },

    applySleepKoreanRepeat(count) {
        if (SLEEP_KOREAN_REPEAT_OPTIONS.indexOf(count) < 0) return;
        this.setData({
            sleepKoreanRepeatCount: count,
            sleepKoreanRepeatPickerIndex: getSleepKoreanRepeatPickerIndex(count),
            sleepKoreanRepeatLabel: getSleepKoreanRepeatLabel(count)
        }, () => {
            this.persistSleepState({ koreanRepeatCount: count });
        });
    },

    selectSleepKoreanRepeat(e) {
        const count = Number(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.count) || 1;
        this.applySleepKoreanRepeat(count);
    },

    onSleepKoreanRepeatPickerChange(e) {
        const index = Number(e.detail && e.detail.value) || 0;
        const count = SLEEP_KOREAN_REPEAT_OPTIONS[index] || 1;
        this.applySleepKoreanRepeat(count);
    },

    toggleSleepMixer() {
        if (this._sleepStarting) return;
        this.stopSleepPreviewAudio();
        if (this.data.sleepPlaying) {
            this.stopSleepMixer();
            return;
        }
        this.startSleepMixer({ enterFocus: true });
    },

    enterSleepFocusMode() {
        this._sleepPreviewToken = Number(this._sleepPreviewToken || 0) + 1;
        this._sleepFocusOpenedAt = Date.now();
        this.setSleepKeepScreenOn(true);
        this.markSleepGuideSeen();
        this.stopSleepPreviewAudio();
        const current = this._currentWordRuntime || this.data.currentWord || {};
        this.setData({
            sleepFocusOpen: true,
            sleepPanelOpen: false,
            practiceToolsOpen: false,
            showGuideBubble: false,
            sleepGuideVisible: false,
            sleepPreviewLoadingId: '',
            sleepWordLoopCurrent: this._sleepWordLoopRunning
                ? this.data.sleepWordLoopCurrent
                : (current.word || '准备播放'),
            sleepWordLoopMeaning: this._sleepWordLoopRunning
                ? this.data.sleepWordLoopMeaning
                : (current.meaning || ''),
            sleepWordLoopProgressText: this._sleepWordLoopRunning
                ? this.data.sleepWordLoopProgressText
                : '0/0'
        });
        if (!this._sleepWordLoopRunning) {
            this.startSleepWordLoop({ silent: true });
        }
    },

    setSleepKeepScreenOn(keepScreenOn) {
        try {
            if (wx.setKeepScreenOn) {
                wx.setKeepScreenOn({ keepScreenOn: !!keepScreenOn });
            }
        } catch (e) {}
    },

    stopSleepFocusMode() {
        if (Date.now() - Number(this._sleepFocusOpenedAt || 0) < 520) return;
        this.stopSleepMixer();
    },

    stopSleepPreviewAudio() {
        if (this._sleepPreviewAudio) {
            try { this._sleepPreviewAudio.stop && this._sleepPreviewAudio.stop(); } catch (e) {}
            try { this._sleepPreviewAudio.destroy && this._sleepPreviewAudio.destroy(); } catch (e) {}
        }
        this._sleepPreviewAudio = null;
        if (this.data.sleepPreviewingId) this.setData({ sleepPreviewingId: '' });
    },

    previewSleepAudio(option, src) {
        if (!option || !src) return;
        this.stopSleepPreviewAudio();
        const ctx = wx.createInnerAudioContext();
        ctx.loop = false;
        ctx.autoplay = false;
        ctx.obeyMuteSwitch = false;
        const volumes = this.data.sleepVolumes || {};
        ctx.volume = getSleepOutputVolume(
            Number(volumes[option.id] != null ? volumes[option.id] : option.defaultVolume),
            SLEEP_PREVIEW_GAIN
        );
        ctx.onError((err) => {
            console.warn('[sleep preview] audio error:', option.id, JSON.stringify(err));
            if (this._sleepPreviewAudio === ctx) this.stopSleepPreviewAudio();
        });
        ctx.onEnded(() => {
            if (this._sleepPreviewAudio === ctx) this.stopSleepPreviewAudio();
        });
        ctx.src = src;
        this._sleepPreviewAudio = ctx;
        this.setData({
            sleepPreviewingId: option.id,
            sleepPreviewLoadingId: ''
        });
        try { ctx.play(); } catch (e) {}
    },

    buildSleepWordLoopList() {
        const words = Array.isArray(this.data.words) ? this.data.words : [];
        const total = words.length;
        if (!total) return [];
        const start = normalizeIndex(Number(this.data.currentIndex || 0), total);
        const limit = Math.min(100, total);
        const list = [];
        const seen = new Set();
        for (let offset = 0; offset < total && list.length < limit; offset += 1) {
            const index = normalizeIndex(start + offset, total);
            if (seen.has(index)) continue;
            seen.add(index);
            const item = words[index];
            if (!item || !String(item.word || '').trim()) continue;
            list.push(Object.assign({}, item, { __sleepLoopIndex: index }));
        }
        return list;
    },

    ensureSleepWordAudioContext() {
        if (!this._sleepWordAudio) {
            this._sleepWordAudio = wx.createInnerAudioContext();
            this._sleepWordAudio.autoplay = false;
            this._sleepWordAudio.obeyMuteSwitch = false;
            this._sleepWordAudio.loop = false;
        }
        return this._sleepWordAudio;
    },

    preloadSleepWordLoopWindow(cursor = 0, count = SLEEP_WORD_PRELOAD_AHEAD) {
        const list = this._sleepWordLoopList || [];
        if (!Array.isArray(list) || !list.length) return;
        const safeCount = Math.max(1, Math.min(Number(count) || SLEEP_WORD_PRELOAD_AHEAD, list.length));
        const start = Math.max(0, Number(cursor) || 0);
        const includeMeaning = !!this.data.sleepReadMeaning;
        const preferEdgeTts = this.shouldPreferEdgeTtsAudio();
        const seen = new Set();
        const edgeRequests = [];

        for (let offset = 0; offset < safeCount; offset += 1) {
            const index = normalizeIndex(start + offset, list.length);
            if (seen.has(index)) continue;
            seen.add(index);
            const wordInfo = list[index];
            const word = String((wordInfo && wordInfo.word) || '').trim();
            if (!word) continue;

            if (preferEdgeTts) {
                edgeRequests.push(...this.buildEdgeTtsPreloadItems(wordInfo, includeMeaning));
            } else {
                this._preloadSingleAudio(word, false);
                if (includeMeaning) this._preloadSingleAudio(word, true);
            }
        }

        if (edgeRequests.length) {
            this.preloadEdgeTtsRequests(edgeRequests);
        }
    },

    async playSleepWordLoopAudio(wordInfo, playToken, options = {}) {
        if (!this._sleepWordLoopRunning || !wordInfo || !wordInfo.word) return false;
        this._hasUserGesture = true;
        const ctx = this.ensureSleepWordAudioContext();
        try { ctx.loop = false; } catch (e) {}
        const isChinese = !!options.isChinese;
        const word = String(wordInfo.word || '').trim();
        const audioText = isChinese ? String(wordInfo.meaning || '').trim() : word;
        if (!word || !audioText) return false;
        const cacheKey = this.getAudioCacheKey(word, isChinese);
        const lang = isChinese ? 'zh-CN' : 'ko-KR';
        const stillRunning = () => !!this._sleepWordLoopRunning
            && (!playToken || this._sleepWordPlayToken === playToken);

        const edgeCached = this.getCachedEdgeTtsFile(cacheKey, audioText, lang);
        if (edgeCached) {
            const ok = await this.playSrcOnce(ctx, edgeCached);
            if (!stillRunning()) return null;
            if (ok) return true;
            this.removeCachedEdgeTtsFile(cacheKey, audioText, lang);
        }

        if (this.shouldPreferEdgeTtsAudio()) {
            let src = await this.fetchEdgeTtsToLRU(cacheKey, audioText, lang);
            if (!stillRunning()) return null;
            if (!src) src = await this.fetchEdgeTtsToLRU(cacheKey, audioText, lang, true);
            if (!stillRunning()) return null;
            return src ? this.playSrcOnce(ctx, src) : false;
        }

        const urls = this.buildAudioUrls(word, isChinese);
        const local = cacheKey ? this.getAudioFileFromLRU(cacheKey) : '';
        if (local) {
            const ok = await this.playSrcOnce(ctx, local);
            if (!stillRunning()) return null;
            if (ok) return true;
            if (!this.hasLocalAudioFile(local)) this.removeAudioFromLRU(cacheKey);
        }

        const downloaded = await this.downloadAudioToLRU(cacheKey, urls);
        if (!stillRunning()) return null;
        if (downloaded) {
            const ok = await this.playSrcOnce(ctx, downloaded);
            if (!stillRunning()) return null;
            if (ok) return true;
        }

        const remoteOk = await this.playWithFallback(ctx, urls, cacheKey, stillRunning);
        if (!stillRunning()) return null;
        if (remoteOk) return true;

        let edgeSrc = await this.fetchEdgeTtsToLRU(cacheKey, audioText, lang);
        if (!stillRunning()) return null;
        if (!edgeSrc) edgeSrc = await this.fetchEdgeTtsToLRU(cacheKey, audioText, lang, true);
        if (!stillRunning()) return null;
        return edgeSrc ? this.playSrcOnce(ctx, edgeSrc) : false;
    },

    playSleepWordLoopAudioWithLimit(wordInfo, token) {
        const playToken = `${token}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        this._sleepWordPlayToken = playToken;
        const playPart = (isChinese) => {
            let timeoutId = null;
            const timeoutPromise = new Promise((resolve) => {
                timeoutId = setTimeout(() => {
                    if (this._sleepWordPlayToken === playToken) {
                        console.warn('[sleep word loop] playback timeout:', wordInfo && wordInfo.word);
                        this.stopAudioContext(this._sleepWordAudio);
                        resolve(false);
                    }
                }, SLEEP_WORD_LOOP_MAX_PLAY_MS);
            });
            return Promise.race([
                this.playSleepWordLoopAudio(wordInfo, playToken, { isChinese }),
                timeoutPromise
            ]).finally(() => {
                if (timeoutId) clearTimeout(timeoutId);
            });
        };
        const runSequence = async () => {
            let played = false;
            if (this.data.sleepReadMeaning) {
                const cnOk = await playPart(true);
                if (cnOk == null) return null;
                played = played || cnOk === true;
            }
            const repeatCount = SLEEP_KOREAN_REPEAT_OPTIONS.indexOf(Number(this.data.sleepKoreanRepeatCount)) >= 0
                ? Number(this.data.sleepKoreanRepeatCount)
                : 2;
            for (let i = 0; i < repeatCount; i += 1) {
                if (!this._sleepWordLoopRunning || this._sleepWordPlayToken !== playToken) return null;
                const koOk = await playPart(false);
                if (koOk == null) return null;
                played = played || koOk === true;
            }
            return played;
        };
        return runSequence().finally(() => {
            if (this._sleepWordPlayToken === playToken) this._sleepWordPlayToken = '';
        });
    },

    waitSleepWordLoopGap(ms, token) {
        return new Promise((resolve) => {
            this._sleepWordLoopGapResolve = resolve;
            this._sleepWordLoopTimer = setTimeout(() => {
                if (this._sleepWordLoopToken === token) this._sleepWordLoopTimer = null;
                if (this._sleepWordLoopGapResolve === resolve) this._sleepWordLoopGapResolve = null;
                resolve();
            }, Math.max(0, Number(ms) || 0));
        });
    },

    async runSleepWordLoop(token) {
        while (this._sleepWordLoopRunning && this._sleepWordLoopToken === token) {
            const list = this._sleepWordLoopList || [];
            if (!list.length) break;
            const cursor = Math.max(0, Number(this._sleepWordLoopCursor || 0)) % list.length;
            const wordInfo = list[cursor];
            const displayWord = String(wordInfo.word || '').trim();
            this.setData({
                sleepWordLoopCurrent: displayWord || '准备播放',
                sleepWordLoopMeaning: String(wordInfo.meaning || '').trim(),
                sleepWordLoopProgressText: `${cursor + 1}/${list.length}`
            });
            this.preloadSleepWordLoopWindow(cursor, SLEEP_WORD_PRELOAD_AHEAD);

            const played = await this.playSleepWordLoopAudioWithLimit(wordInfo, token);
            if (!this._sleepWordLoopRunning || this._sleepWordLoopToken !== token) break;

            if (played === true) {
                this._sleepWordLoopFailCount = 0;
                this._sleepWordLoopCursor = (cursor + 1) % list.length;
                await this.waitSleepWordLoopGap(SLEEP_WORD_LOOP_SUCCESS_GAP_MS, token);
            } else {
                this._sleepWordLoopFailCount = Number(this._sleepWordLoopFailCount || 0) + 1;
                if (this._sleepWordLoopFailCount >= SLEEP_WORD_LOOP_FAIL_ADVANCE_LIMIT) {
                    this._sleepWordLoopFailCount = 0;
                    this._sleepWordLoopCursor = (cursor + 1) % list.length;
                }
                await this.waitSleepWordLoopGap(SLEEP_WORD_LOOP_RETRY_GAP_MS, token);
            }
        }

        if (this._sleepWordLoopToken === token && this._sleepWordLoopRunning) {
            this.stopSleepWordLoop({ silent: true });
        }
    },

    startSleepWordLoop(options = {}) {
        if (this._sleepWordLoopRunning) return true;
        const list = this.buildSleepWordLoopList();
        if (!list.length) {
            if (!options.silent) wx.showToast({ title: '当前没有可播放单词', icon: 'none' });
            return false;
        }
        this.stopSleepPreviewAudio();
        this._sleepWordLoopList = list;
        this._sleepWordLoopCursor = 0;
        this._sleepWordLoopFailCount = 0;
        this._sleepWordLoopRunning = true;
        this._sleepWordLoopToken = Date.now();
        this.setData({
            sleepWordLoopRunning: true,
            sleepWordLoopCurrent: '准备播放',
            sleepWordLoopMeaning: '',
            sleepWordLoopProgressText: `0/${list.length}`
        });
        this.preloadSleepWordLoopWindow(0, SLEEP_WORD_PRELOAD_INITIAL);
        this.runSleepWordLoop(this._sleepWordLoopToken).catch((err) => {
            console.warn('[sleep word loop] stopped by error:', err);
            this.stopSleepWordLoop();
        });
        return true;
    },

    stopSleepWordLoop(options = {}) {
        this._sleepWordLoopRunning = false;
        this._sleepWordLoopToken = Number(this._sleepWordLoopToken || 0) + 1;
        this._sleepWordPlayToken = '';
        this._sleepWordLoopFailCount = 0;
        if (this._sleepWordLoopTimer) {
            clearTimeout(this._sleepWordLoopTimer);
            this._sleepWordLoopTimer = null;
        }
        if (this._sleepWordLoopGapResolve) {
            try { this._sleepWordLoopGapResolve(); } catch (e) {}
            this._sleepWordLoopGapResolve = null;
        }
        this.stopAudioContext(this._sleepWordAudio);
        this.setData({
            sleepWordLoopRunning: false,
            sleepWordLoopCurrent: '从当前词开始 · 最多100词',
            sleepWordLoopMeaning: '',
            sleepWordLoopProgressText: this._sleepWordLoopList && this._sleepWordLoopList.length
                ? `0/${this._sleepWordLoopList.length}`
                : '0/0'
        });
        if (!options.silent) {
            wx.showToast({ title: '单词循环已停止', icon: 'none' });
        }
    },

    toggleSleepWordLoop() {
        if (this.data.sleepWordLoopRunning || this._sleepWordLoopRunning) {
            this.stopSleepWordLoop();
            return;
        }
        this.startSleepWordLoop();
    },

    async tapSleepSound(e) {
        const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id;
        const option = getSleepOptionById(id);
        if (!option) return;
        if (this.data.sleepPreviewingId === id) {
            this.stopSleepPreviewAudio();
            return;
        }
        if (this.data.sleepPreviewLoadingId === id) {
            this._sleepPreviewToken = Number(this._sleepPreviewToken || 0) + 1;
            this.setData({ sleepPreviewLoadingId: '' });
            return;
        }
        if (this.data.sleepPreviewLoadingId) return;
        if (this.data.sleepPreviewingId) this.stopSleepPreviewAudio();

        const previewToken = Date.now();
        this._sleepPreviewToken = previewToken;
        this.setData({ sleepPreviewLoadingId: id });
        let src = '';
        try {
            src = await this.cacheSleepOption(option);
            if (this._sleepPreviewToken !== previewToken) {
                this.setData({ sleepPreviewLoadingId: '' });
                return;
            }
            const cacheMap = this._sleepCacheMap || this.data.sleepCacheMap || {};
            const cachedNow = !!(cacheMap && cacheMap[option.id]);
            this.refreshSleepCacheState(cacheMap, {
                statusText: cachedNow
                    ? `已加载 ${getSleepCacheSummary(cacheMap).cachedCount}/${SLEEP_SOUND_OPTIONS.length} · ${option.name}`
                    : `临时试听 · ${option.name}`
            });
            this.previewSleepAudio(option, src);
        } catch (err) {
            console.warn('[sleep sound] single download failed:', id, err);
            wx.showToast({
                title: '音频加载失败',
                icon: 'none'
            });
            this.setData({ sleepPreviewLoadingId: '' });
        }

        if (!src) {
            this.setData({ sleepPreviewLoadingId: '' });
            return;
        }
        this.setData({
            sleepSoundOptions: buildSleepSoundCards(
                this.data.sleepSelectedIds,
                this.data.sleepVolumes,
                this.data.sleepActiveCategoryId,
                this._sleepCacheMap || this.data.sleepCacheMap
            )
        });
    },

    async ensureSleepAudioFile(option) {
        if (!this._sleepAudioPathMap) this._sleepAudioPathMap = {};
        if (!option) return '';
        if (this._sleepAudioPathMap[option.id]) return this._sleepAudioPathMap[option.id];

        const cachedPath = this.getSleepCachedPath(option, this._sleepCacheMap || this.data.sleepCacheMap);
        if (cachedPath) {
            this._sleepAudioPathMap[option.id] = cachedPath;
            return cachedPath;
        }

        if (option.remoteSrc || option.originalSrc) {
            try {
                const filePath = await this.cacheSleepOption(option);
                this._sleepAudioPathMap[option.id] = filePath || option.originalSrc || option.remoteSrc;
                this.refreshSleepCacheState(this._sleepCacheMap || {});
                return this._sleepAudioPathMap[option.id];
            } catch (e) {
                console.warn('[sleep mixer] cache selected audio failed:', option.id, e);
                return option.originalSrc || option.remoteSrc;
            }
        }

        const fs = wx.getFileSystemManager && wx.getFileSystemManager();
        if (option.src) {
            if (!fs || !wx.env || !wx.env.USER_DATA_PATH) return option.src;
            const ext = String(option.src).split('.').pop() || 'mp3';
            const localPath = `${wx.env.USER_DATA_PATH}/sleep_${option.id}_v1.${ext}`;
            let localExists = false;
            try {
                if (fs.accessSync) {
                    fs.accessSync(localPath);
                    localExists = true;
                }
            } catch (e) {}
            if (!localExists) {
                try {
                    const buffer = fs.readFileSync(option.src);
                    fs.writeFileSync(localPath, buffer);
                    localExists = true;
                } catch (e) {}
            }
            this._sleepAudioPathMap[option.id] = localExists ? localPath : option.src;
            return this._sleepAudioPathMap[option.id];
        }

        if (!fs || !wx.env || !wx.env.USER_DATA_PATH) return '';

        const path = `${wx.env.USER_DATA_PATH}/sleep_${option.id}_v1.wav`;
        let exists = false;
        try {
            if (fs.accessSync) {
                fs.accessSync(path);
                exists = true;
            }
        } catch (e) {}
        if (!exists) {
            const buffer = buildSleepWavBuffer(
                option.kind || getSleepFallbackKind(option),
                `${option.id || ''}:${option.label || option.name || ''}`
            );
            fs.writeFileSync(path, buffer);
        }
        this._sleepAudioPathMap[option.id] = path;
        return path;
    },

    getSleepBackgroundSrc(option) {
        if (!option) return '';
        if (option.remoteSrc) return option.remoteSrc;
        if (this._sleepAudioPathMap && this._sleepAudioPathMap[option.id]) return this._sleepAudioPathMap[option.id];
        return option.originalSrc || option.src || '';
    },

    stopSleepBackgroundAudio(options = {}) {
        const bg = this._sleepBackgroundAudio;
        this._sleepBackgroundAudioId = '';
        this._sleepBackgroundAudioSrc = '';
        this._sleepBackgroundRestarting = false;
        this._sleepBackgroundStartGuardUntil = 0;
        if (!bg) return;
        try { bg.offEnded && bg.offEnded(); } catch (e) {}
        try { bg.offError && bg.offError(); } catch (e) {}
        try { bg.offStop && bg.offStop(); } catch (e) {}
        if (!options.keepPlaying) {
            this._sleepStoppingBackground = true;
            try { bg.stop && bg.stop(); } catch (e) {}
            if (this._sleepBackgroundStopGuardTimer) clearTimeout(this._sleepBackgroundStopGuardTimer);
            this._sleepBackgroundStopGuardTimer = setTimeout(() => {
                this._sleepBackgroundStopGuardTimer = null;
                this._sleepStoppingBackground = false;
            }, 300);
        }
    },

    startSleepBackgroundAudio(option, src, volume) {
        if (!option || !src || !wx.getBackgroundAudioManager) return false;
        const bg = wx.getBackgroundAudioManager();
        this.stopSleepBackgroundAudio();
        this._sleepBackgroundAudio = bg;
        this._sleepBackgroundAudioId = option.id;
        this._sleepBackgroundAudioSrc = src;
        this._sleepBackgroundStartGuardUntil = Date.now() + 1400;

        const applyMeta = () => {
            try { bg.title = '单词助眠'; } catch (e) {}
            try { bg.epname = getSleepSummary(this.data.sleepSelectedIds || [option.id]); } catch (e) {}
            try { bg.singer = '韩词练习'; } catch (e) {}
            try { bg.volume = Math.max(0, Math.min(1, Number(volume) || 0.5)); } catch (e) {}
        };

        const restart = () => {
            if (!this.data.sleepPlaying || this._sleepBackgroundAudioId !== option.id) return;
            this._sleepBackgroundRestarting = true;
            this._sleepBackgroundStartGuardUntil = Date.now() + 900;
            try { bg.seek && bg.seek(0); } catch (e) {}
            try {
                bg.play && bg.play();
            } catch (e) {
                try {
                    applyMeta();
                    bg.src = src;
                } catch (err) {}
            }
            setTimeout(() => {
                this._sleepBackgroundRestarting = false;
            }, 120);
        };

        try { bg.offEnded && bg.offEnded(); } catch (e) {}
        try { bg.offError && bg.offError(); } catch (e) {}
        try { bg.offStop && bg.offStop(); } catch (e) {}
        try { bg.onEnded && bg.onEnded(restart); } catch (e) {}
        try {
            bg.onError && bg.onError((err) => {
                console.warn('[sleep background] audio error:', option.id, JSON.stringify(err));
            });
        } catch (e) {}
        try {
            bg.onStop && bg.onStop(() => {
                if (this._sleepStoppingBackground || this._sleepBackgroundRestarting) return;
                if (Date.now() < Number(this._sleepBackgroundStartGuardUntil || 0)) return;
                if (this.data.sleepPlaying && this._sleepBackgroundAudioId === option.id) {
                    this.stopSleepMixer({ silent: true });
                }
            });
        } catch (e) {}

        try {
            applyMeta();
            bg.src = src;
            bg.play && bg.play();
            return true;
        } catch (e) {
            console.warn('[sleep background] start failed:', option.id, e);
            return false;
        }
    },

    stopSleepAudioContexts() {
        const contexts = this._sleepAudioContexts || {};
        Object.keys(contexts).forEach((id) => {
            const ctx = contexts[id];
            try { ctx.stop && ctx.stop(); } catch (e) {}
            try { ctx.destroy && ctx.destroy(); } catch (e) {}
        });
        this._sleepAudioContexts = {};
    },

    async startSleepMixer(options = {}) {
        if (this._sleepStarting) return false;
        this._sleepStarting = true;
        const startToken = Number(this._sleepStartToken || 0) + 1;
        this._sleepStartToken = startToken;
        this.setData({ sleepStarting: true });
        const selectedIds = (this.data.sleepSelectedIds && this.data.sleepSelectedIds.length)
            ? this.data.sleepSelectedIds.slice(0, SLEEP_MAX_TRACKS)
            : [];
        if (!selectedIds.length) {
            this._sleepStarting = false;
            if (this._sleepStartToken === startToken) this.setData({ sleepStarting: false });
            wx.showToast({ title: '先选择音色', icon: 'none' });
            return false;
        }
        const volumes = this.data.sleepVolumes || {};
        this.stopSleepAudioContexts();

        if (options.enterFocus) {
            this.setData({
                sleepPlaying: true,
                sleepSelectedIds: selectedIds,
                sleepSelectedTracks: buildSleepSelectedTracks(selectedIds, volumes),
                sleepActiveSummary: getSleepSummary(selectedIds)
            });
            if (!options.keepTimer) this.scheduleSleepTimer();
            this.enterSleepFocusMode();
        }

        try {
            if (wx.setInnerAudioOption) {
                wx.setInnerAudioOption({
                    obeyMuteSwitch: false,
                    mixWithOther: true
                });
            }
        } catch (e) {}

        try {
            this._sleepAudioContexts = {};
            this.stopSleepBackgroundAudio();
            let backgroundStarted = false;
            const backgroundId = selectedIds[0];
            for (const id of selectedIds) {
                const option = getSleepOptionById(id);
                if (!option) continue;
                const src = await this.ensureSleepAudioFile(option);
                if (this._sleepStartToken !== startToken) return false;
                if (!src) continue;
                const volume = getSleepOutputVolume(Number(volumes[id] != null ? volumes[id] : option.defaultVolume));
                if (id === backgroundId) {
                    const backgroundSrc = this.getSleepBackgroundSrc(option) || src;
                    backgroundStarted = this.startSleepBackgroundAudio(option, backgroundSrc, volume);
                    if (backgroundStarted) continue;
                }
                const ctx = wx.createInnerAudioContext();
                ctx.loop = true;
                ctx.autoplay = false;
                ctx.obeyMuteSwitch = false;
                ctx.volume = volume;
                ctx.onError((err) => {
                    console.warn('[sleep mixer] audio error:', id, JSON.stringify(err));
                });
                ctx.onEnded(() => {
                    if (!this.data.sleepPlaying || !this._sleepAudioContexts || this._sleepAudioContexts[id] !== ctx) return;
                    try { ctx.seek && ctx.seek(0); } catch (e) {}
                    try { ctx.play && ctx.play(); } catch (e) {}
                });
                ctx.src = src;
                this._sleepAudioContexts[id] = ctx;
                try { ctx.play(); } catch (e) {}
            }

            const hasContext = backgroundStarted || Object.keys(this._sleepAudioContexts || {}).length > 0;
            const hasSession = hasContext || !!options.enterFocus || !!this.data.sleepFocusOpen || !!this._sleepWordLoopRunning;
            if (this._sleepStartToken !== startToken) return false;
            this.setData({
                sleepPlaying: hasSession,
                sleepSelectedIds: selectedIds,
                sleepSelectedTracks: buildSleepSelectedTracks(selectedIds, volumes),
                sleepSoundOptions: buildSleepSoundCards(
                    selectedIds,
                    volumes,
                    this.data.sleepActiveCategoryId,
                    this._sleepCacheMap || this.data.sleepCacheMap
                ),
                sleepActiveSummary: getSleepSummary(selectedIds)
            }, () => {
                if (this._sleepStartToken !== startToken) return;
                if (!options.enterFocus && !options.keepTimer) this.scheduleSleepTimer();
            });
            if (!hasContext && !options.enterFocus) wx.showToast({ title: '音频启动失败', icon: 'none' });
            return hasSession;
        } finally {
            this._sleepStarting = false;
            if (this._sleepStartToken === startToken) {
                this.setData({ sleepStarting: false });
            }
        }
    },

    clearSleepTimer() {
        if (this._sleepStopTimer) clearTimeout(this._sleepStopTimer);
        if (this._sleepTickTimer) clearInterval(this._sleepTickTimer);
        this._sleepStopTimer = null;
        this._sleepTickTimer = null;
        this._sleepTimerEndAt = 0;
    },

    updateSleepRemaining() {
        const endAt = Number(this._sleepTimerEndAt || 0);
        if (!endAt) {
            if (this.data.sleepRemainingText) this.setData({ sleepRemainingText: '' });
            return;
        }
        const left = Math.max(0, endAt - Date.now());
        const totalSeconds = Math.ceil(left / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        this.setData({ sleepRemainingText: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` });
    },

    scheduleSleepTimer() {
        this.clearSleepTimer();
        const minutes = Number(this.data.sleepTimerMinutes || 0);
        if (!minutes) {
            this.setData({ sleepRemainingText: '' });
            return;
        }
        this._sleepTimerEndAt = Date.now() + minutes * 60 * 1000;
        this.updateSleepRemaining();
        this._sleepTickTimer = setInterval(() => this.updateSleepRemaining(), 1000);
        this._sleepStopTimer = setTimeout(() => {
            this.stopSleepMixer({ fromTimer: true });
        }, minutes * 60 * 1000);
    },

    stopSleepMixer(options = {}) {
        this._sleepStartToken = Number(this._sleepStartToken || 0) + 1;
        this._sleepStarting = false;
        this.clearSleepTimer();
        this.stopSleepBackgroundAudio();
        this.stopSleepAudioContexts();
        if (this._sleepWordLoopRunning) {
            this.stopSleepWordLoop({ silent: true });
        }
        this.setSleepKeepScreenOn(false);
        this.setData({
            sleepPlaying: false,
            sleepStarting: false,
            sleepRemainingText: '',
            sleepFocusOpen: false
        });
        if (options.fromTimer) {
            wx.showToast({ title: '助眠音已关闭', icon: 'none' });
        }
    },

    refreshDualColumnRows(overrides = {}) {
        if (!this.data.dualColumnMode && !overrides.force) return;
        const words = overrides.words || this.data.words || [];
        const currentIndex = overrides.currentIndex != null ? overrides.currentIndex : this.data.currentIndex;
        const completedMap = overrides.completedMap || this.data.dualCompletedIds || {};
        const typingState = overrides.typingState || this.data.typingState || {};
        const inputMap = overrides.inputMap || this.data.dualNativeInputs || {};
        const reciteMode = !!this.data.dualReciteMode;
        const shouldFocusInput = reciteMode
            ? false
            : (overrides.inputFocus != null ? overrides.inputFocus : this.data.dualNativeInputFocus);
        const hideKorean = overrides.hideKorean != null ? overrides.hideKorean : this.data.dualHideKorean;
        const revealWord = overrides.revealWord != null ? overrides.revealWord : this.data.dualRevealWord;
        const exampleRowId = overrides.exampleRowId != null ? overrides.exampleRowId : this.data.dualExampleRowId;
        const dualColumnRows = buildDualColumnRows(words, currentIndex, completedMap, typingState, inputMap, shouldFocusInput, hideKorean, revealWord, exampleRowId, reciteMode);
        this.setData({ dualColumnRows });
    },

    lockDualColumnActions(duration = 360) {
        this._dualActionLocked = true;
        if (this._dualActionLockTimer) clearTimeout(this._dualActionLockTimer);
        if (!this.data.dualActionLocked) this.setData({ dualActionLocked: true });
        this._dualActionLockTimer = setTimeout(() => {
            this._dualActionLockTimer = null;
            this._dualActionLocked = false;
            if (this.data.dualActionLocked) this.setData({ dualActionLocked: false });
        }, duration);
    },

    unlockDualColumnActions() {
        this._dualActionLocked = false;
        if (this._dualActionLockTimer) clearTimeout(this._dualActionLockTimer);
        this._dualActionLockTimer = null;
        if (this.data.dualActionLocked) this.setData({ dualActionLocked: false });
    },

    updateDualTimerDisplay(seconds, extra = {}) {
        const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
        this.setData(Object.assign({
            dualElapsedSeconds: safeSeconds,
            dualTimerText: formatDualTimerText(safeSeconds)
        }, extra));
    },

    clearDualTimerInterval() {
        if (this._dualTimerInterval) clearInterval(this._dualTimerInterval);
        this._dualTimerInterval = null;
    },

    startDualTimer(options = {}) {
        const shouldRestart = !!options.restart;
        const currentSeconds = Number(this.data.dualElapsedSeconds || 0);
        const startSeconds = shouldRestart ? 0 : Math.max(0, currentSeconds);

        this.clearDualTimerInterval();
        this.updateDualTimerDisplay(startSeconds, {
            dualTimerRunning: true,
            dualTimerPaused: false
        });

        this._dualTimerInterval = setInterval(() => {
            const nextSeconds = Math.max(0, Number(this.data.dualElapsedSeconds || 0) + 1);
            this.updateDualTimerDisplay(nextSeconds);
        }, 1000);

        this.focusDualCurrentWord();
    },

    pauseDualTimer() {
        if (!this.data.dualTimerRunning) return;
        this.clearDualTimerInterval();
        this.setData({
            dualTimerRunning: false,
            dualTimerPaused: true
        });
    },

    resumeDualTimer() {
        this.startDualTimer({ restart: false });
    },

    resetDualTimer() {
        this.clearDualTimerInterval();
        this.updateDualTimerDisplay(0, {
            dualTimerRunning: false,
            dualTimerPaused: false
        });
    },

    stopDualTimer() {
        this.resetDualTimer();
        this.setData({ dualNativeInputFocus: false });
        if (typeof wx.hideKeyboard === 'function') {
            wx.hideKeyboard();
        }
    },

    async playDualReciteAudio(index) {
        const words = this.data.words || [];
        const safeIndex = normalizeIndex(index, words.length);
        if (!words.length || !this.data.dualReciteMode) return;
        const word = words[safeIndex];
        if (!word || !word.word) return;
        const completedKey = getDualCompletedKey(word, safeIndex);
        this.setData({
            dualExampleRowId: completedKey,
            dualNativeInputFocus: false,
            dualRevealWord: false
        }, () => {
            this.refreshDualColumnRows({
                force: true,
                inputFocus: false,
                exampleRowId: completedKey,
                revealWord: false
            });
        });

        this._hasUserGesture = true;
        this.ensureAudioContexts();
        this._hasPlayedAudioOnce = true;
        const playSeq = this.cancelCurrentAudioPlayback();
        const wordId = safeWordId(word) || getDualWordKey(word, safeIndex);
        await this.playAudioPartWithFallback(this.wordAudio, word, false, playSeq, wordId, {
            allowInDual: true,
            wordIdOverride: wordId,
            skipCurrentCheck: true
        });
    },

    toggleDualReciteMode(e) {
        const mode = e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.mode;
        const next = mode === 'recite'
            ? true
            : (mode === 'spell' ? false : !this.data.dualReciteMode);
        if (next === !!this.data.dualReciteMode) return;
        if (next && typeof wx.hideKeyboard === 'function') {
            wx.hideKeyboard();
        }
        this.cancelCurrentAudioPlayback();
        this.setData({
            dualReciteMode: next,
            dualNativeInputFocus: next ? false : true,
            dualRevealWord: false,
            isKeyboardOpen: false,
            showGuideBubble: false
        }, () => {
            this.refreshDualColumnRows({
                force: true,
                inputFocus: !next
            });
        });
    },

    resetDualColumnPractice() {
        if (this._dualAdvanceTimer) clearTimeout(this._dualAdvanceTimer);
        this._dualAdvanceTimer = null;
        if (this._dualHintAdvanceTimer) clearTimeout(this._dualHintAdvanceTimer);
        this._dualHintAdvanceTimer = null;
        this.clearDualRevealTimer();
        this.resetDualTimer();
        this.unlockDualColumnActions();

        const words = this.data.words || [];
        const currentIndex = normalizeIndex(this.data.currentIndex || 0, words.length);
        this.setData({
            dualCompletedIds: {},
            dualNativeInputs: {},
            dualNativeInputFocus: false,
            dualRevealWord: false,
            dualExampleRowId: '',
            dualActionLocked: false,
            isCorrect: false,
            prevWordInfo: null,
            dualScrollIntoView: `dual-row-${currentIndex}`
        }, () => {
            this.refreshDualColumnRows({
                force: true,
                completedMap: {},
                inputMap: {},
                inputFocus: false,
                revealWord: false,
                exampleRowId: ''
            });
        });
        if (typeof wx.hideKeyboard === 'function') {
            wx.hideKeyboard();
        }
    },

    handleDualEndOrReset() {
        if (this.data.dualTimerRunning || this.data.dualTimerPaused || Number(this.data.dualElapsedSeconds || 0) > 0) {
            this.stopDualTimer();
            return;
        }
        this.resetDualColumnPractice();
    },

    toggleDualTimerStart() {
        if (this.data.dualTimerRunning) {
            this.pauseDualTimer();
            return;
        }
        if (this.data.dualTimerPaused) {
            this.resumeDualTimer();
            return;
        }
        this.startDualTimer({ restart: true });
    },

    openDualTimerActions() {
        const itemList = [];
        if (this.data.dualTimerRunning) {
            itemList.push('暂停');
        } else if (this.data.dualTimerPaused) {
            itemList.push('继续');
        } else {
            itemList.push('开始');
        }
        itemList.push('重新开始', '结束计时');

        wx.showActionSheet({
            itemList,
            success: (res) => {
                const action = itemList[res.tapIndex];
                if (action === '暂停') this.pauseDualTimer();
                if (action === '继续') this.resumeDualTimer();
                if (action === '开始') this.startDualTimer({ restart: Number(this.data.dualElapsedSeconds || 0) <= 0 });
                if (action === '重新开始') this.startDualTimer({ restart: true });
                if (action === '结束计时') this.stopDualTimer();
            }
        });
    },

    toggleDualColumnMode() {
        if (this._dualActionLocked && !this.data.dualColumnMode) return;
        const nextMode = !this.data.dualColumnMode;
        this._dualWordAudioBlocked = nextMode;
        if (nextMode) {
            this.cancelCurrentAudioPlayback();
        }
        this.setData({
            dualColumnMode: nextMode,
            isKeyboardOpen: nextMode ? false : this.data.isKeyboardOpen,
            showGuideBubble: false,
            practiceToolsOpen: false,
            dualNativeInputFocus: nextMode && !this.data.dualReciteMode,
            dualScrollIntoView: `dual-row-${normalizeIndex(this.data.currentIndex || 0, (this.data.words || []).length)}`
        }, () => {
            if (nextMode) {
                this.refreshDualColumnRows({ force: true });
            } else {
                this._dualWordAudioBlocked = false;
                this.clearDualRevealTimer();
                this.stopDualTimer();
                if (this._dualHintAdvanceTimer) clearTimeout(this._dualHintAdvanceTimer);
                this._dualHintAdvanceTimer = null;
                this.setData({ dualColumnRows: [], dualNativeInputFocus: false, dualRevealWord: false, dualExampleRowId: '', dualScrollIntoView: 'dual-row-0' });
            }
        });
    },

    exitDualColumnMode() {
        this._dualWordAudioBlocked = false;
        this.clearDualRevealTimer();
        this.stopDualTimer();
        if (this._dualAdvanceTimer) clearTimeout(this._dualAdvanceTimer);
        this._dualAdvanceTimer = null;
        if (this._dualHintAdvanceTimer) clearTimeout(this._dualHintAdvanceTimer);
        this._dualHintAdvanceTimer = null;
        this.unlockDualColumnActions();
        if (typeof wx.hideKeyboard === 'function') {
            wx.hideKeyboard();
        }
        this.setData({
            dualColumnMode: false,
            dualColumnRows: [],
            dualNativeInputFocus: false,
            dualRevealWord: false,
            dualExampleRowId: '',
            dualScrollIntoView: 'dual-row-0',
            isKeyboardOpen: false,
            showGuideBubble: false,
            practiceToolsOpen: false
        });
    },

    toggleDualHideKorean() {
        const next = !this.data.dualHideKorean;
        this.setData({
            dualHideKorean: next,
            dualRevealWord: false
        }, () => this.refreshDualColumnRows({ force: true, hideKorean: next, revealWord: false }));
        this.clearDualRevealTimer();
    },

    focusDualCurrentWord() {
        if (this._dualActionLocked) return;
        this._dualWordAudioBlocked = true;
        const words = this.data.words || [];
        if (!words.length) return;
        let nextIndex = Number(this.data.currentIndex || 0);
        const completed = this.data.dualCompletedIds || {};
        if (completed[getDualCompletedKey(words[nextIndex], nextIndex)]) {
            const found = findNextDualIncompleteIndex(words, nextIndex, completed);
            if (found >= 0) nextIndex = found;
        }
        this.startWord(nextIndex, null);
        if (this.data.dualReciteMode) {
            this.setData({
                isKeyboardOpen: false,
                showGuideBubble: false,
                dualNativeInputFocus: false
            }, () => {
                this.refreshDualColumnRows({ force: true, inputFocus: false });
                this.playDualReciteAudio(nextIndex);
            });
            if (typeof wx.hideKeyboard === 'function') wx.hideKeyboard();
            return;
        }
        this.setData({
            isKeyboardOpen: false,
            showGuideBubble: false,
            dualNativeInputFocus: true
        }, () => this.refreshDualColumnRows({ force: true, inputFocus: true }));
    },

    clearDualRevealTimer() {
        if (this._dualRevealTimer) clearTimeout(this._dualRevealTimer);
        this._dualRevealTimer = null;
    },

    revealDualKoreanWord() {
        this.clearDualRevealTimer();
        if (this._dualHintAdvanceTimer) clearTimeout(this._dualHintAdvanceTimer);
        this._dualHintAdvanceTimer = null;
        const words = this.data.words || [];
        const index = Number(this.data.currentIndex || 0);
        const word = words[index];
        const title = word && word.word ? String(word.word) : '';
        if (!title) return;

        const completedKey = getDualCompletedKey(word, index);
        const nextInputs = Object.assign({}, this.data.dualNativeInputs || {}, {
            [completedKey]: title
        });
        this.setData({
            dualNativeInputs: nextInputs,
            dualNativeInputFocus: true,
            dualRevealWord: true,
            isKeyboardOpen: false,
            showGuideBubble: false
        }, () => {
            this.refreshDualColumnRows({
                force: true,
                inputMap: nextInputs,
                inputFocus: true,
                revealWord: true
            });
            this._dualHintAdvanceTimer = setTimeout(() => {
                this._dualHintAdvanceTimer = null;
                const latestWords = this.data.words || [];
                const latestWord = latestWords[index];
                if (!latestWord || getDualCompletedKey(latestWord, index) !== completedKey) return;
                if ((this.data.dualCompletedIds || {})[completedKey]) return;
                this.completeDualNativeWord(latestWord, index, nextInputs);
            }, 120);
        });
    },

    selectDualColumnWord(e) {
        if (this._dualActionLocked) return;
        this._dualWordAudioBlocked = true;
        const index = Number(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index);
        const words = this.data.words || [];
        if (!Number.isFinite(index) || index < 0 || index >= words.length) return;
        if (this.data.dualReciteMode) {
            this.cancelCurrentAudioPlayback();
            this.setData({
                isKeyboardOpen: false,
                showGuideBubble: false,
                dualNativeInputFocus: false,
                dualRevealWord: false
            }, () => {
                this.refreshDualColumnRows({ force: true, inputFocus: false, revealWord: false });
                this.playDualReciteAudio(index);
            });
            if (typeof wx.hideKeyboard === 'function') wx.hideKeyboard();
            return;
        }
        this.lockDualColumnActions(180);
        this.startWord(index, null);
        this.setData({
            isKeyboardOpen: false,
            showGuideBubble: false,
            dualNativeInputFocus: true
        }, () => this.refreshDualColumnRows({ force: true, inputFocus: true }));
    },

    markDualColumnCompleted(word, index) {
        if (!word) return null;
        const completedKey = getDualCompletedKey(word, index);
        if (!completedKey) return null;
        return Object.assign({}, this.data.dualCompletedIds || {}, {
            [completedKey]: true
        });
    },

    focusDualNativeInput(e) {
        const index = Number(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index);
        if (Number.isFinite(index) && index !== Number(this.data.currentIndex || 0)) {
            this.selectDualColumnWord({ currentTarget: { dataset: { index } } });
            return;
        }
        this.setData({ dualNativeInputFocus: true }, () => {
            this.refreshDualColumnRows({ force: true, inputFocus: true });
        });
    },

    blurDualNativeInput() {
        this.setData({ dualNativeInputFocus: false }, () => {
            this.refreshDualColumnRows({ inputFocus: false });
        });
    },

    hideDualNativeKeyboard() {
        this.setData({ dualNativeInputFocus: false }, () => {
            this.refreshDualColumnRows({ inputFocus: false });
        });
        if (typeof wx.hideKeyboard === 'function') {
            wx.hideKeyboard();
        }
    },

    onDualNativeInput(e) {
        const index = Number(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index);
        const words = this.data.words || [];
        if (!Number.isFinite(index) || index < 0 || index >= words.length) return;

        const word = words[index];
        const completedKey = getDualCompletedKey(word, index);
        const value = e && e.detail ? String(e.detail.value || '') : '';
        const nextInputs = Object.assign({}, this.data.dualNativeInputs || {}, {
            [completedKey]: value
        });

        const target = normalizeDualNativeInput(word && word.word);
        const typed = normalizeDualNativeInput(value);
        if (!target || typed !== target) {
            this.setData({ dualNativeInputs: nextInputs }, () => {
                this.refreshDualColumnRows({ inputMap: nextInputs, inputFocus: true });
            });
            return;
        }

        this.completeDualNativeWord(word, index, nextInputs);
    },

    onDualNativeConfirm(e) {
        const index = Number(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index);
        const words = this.data.words || [];
        if (!Number.isFinite(index) || index < 0 || index >= words.length) return;
        const word = words[index];
        const completedKey = getDualCompletedKey(word, index);
        const value = e && e.detail ? String(e.detail.value || '') : ((this.data.dualNativeInputs || {})[completedKey] || '');
        if (normalizeDualNativeInput(value) === normalizeDualNativeInput(word && word.word)) {
            this.completeDualNativeWord(word, index, Object.assign({}, this.data.dualNativeInputs || {}, {
                [completedKey]: value
            }));
        }
    },

    completeDualNativeWord(word, index, inputMap) {
        this._dualWordAudioBlocked = true;
        const words = this.data.words || [];
        const completedKey = getDualCompletedKey(word, index);
        if ((this.data.dualCompletedIds || {})[completedKey]) return;
        this.lockDualColumnActions(260);
        const completedMap = this.markDualColumnCompleted(word, index);
        if (!completedMap) return;

        if (word && word.id) {
            const wordKey = `${word.sourceCategory || ''}_${word.lessonId || ''}_${word.id}`;
            srs.recordLearned(wordKey, {
                word: word.word,
                meaning: word.meaning,
                phonetic: word.phonetic || '',
                category: word.sourceCategory || '',
                lessonId: word.lessonId || '',
            });
        }

        const nextIndex = findNextDualIncompleteIndex(words, index, completedMap);
        const prevWordInfo = word ? {
            word: word.word,
            meaning: word.meaning,
            isCorrect: true
        } : null;

        const completedScrollTarget = `dual-row-${index}`;
        const applyCompletedState = () => {
            this.setData({
                dualCompletedIds: completedMap,
                dualNativeInputs: inputMap || this.data.dualNativeInputs || {},
                dualNativeInputFocus: false,
                dualRevealWord: false,
                dualExampleRowId: completedKey,
                dualScrollIntoView: completedScrollTarget,
                isCorrect: true
            }, () => {
                this.refreshDualColumnRows({
                    completedMap,
                    inputMap: inputMap || this.data.dualNativeInputs || {},
                    exampleRowId: completedKey,
                    inputFocus: false,
                    force: true
                });

                if (this._dualAdvanceTimer) clearTimeout(this._dualAdvanceTimer);
                this._dualAdvanceTimer = setTimeout(() => {
                    this._dualAdvanceTimer = null;
                    if (nextIndex < 0) {
                        wx.showToast({ title: '本组已完成', icon: 'success' });
                        return;
                    }
                    this.startWord(nextIndex, prevWordInfo, { dualScrollIndex: index });
                    this.setData({
                        dualNativeInputFocus: true,
                        isCorrect: false
                    }, () => this.refreshDualColumnRows({ force: true, inputFocus: true }));
                    this.lockDualColumnActions(120);
                }, 120);
            });
        };

        if (this.data.dualScrollIntoView === completedScrollTarget) {
            this.setData({ dualScrollIntoView: '' }, applyCompletedState);
        } else {
            applyCompletedState();
        }
    },

    playDualExampleAudio(e) {
        const index = Number(e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.index);
        const words = this.data.words || [];
        if (!Number.isFinite(index) || index < 0 || index >= words.length) return;
        const word = words[index];
        if (!getDualExampleSentence(word)) {
            wx.showToast({ title: '暂无例句', icon: 'none' });
            return;
        }
        this.playSentenceAudioForWord(word, { index });
    },

    async loadWords(settingsOverride) {
        this.clearAllTimers();
        this.cancelAudioPreload();
        this.cancelCurrentAudioPlayback();
        this.unlockDualColumnActions && this.unlockDualColumnActions();
        this.resetDualTimer && this.resetDualTimer();
        this._autoPronouncedWordId = null;
        if (this._attemptedPreloadKeys) this._attemptedPreloadKeys.clear();
        this.setData({
            loading: true,
            prevWordInfo: null,
            dualCompletedIds: {},
            dualNativeInputs: {},
            dualNativeInputFocus: false,
            dualRevealWord: false,
            dualExampleRowId: '',
            dualActionLocked: false,
            dualScrollIntoView: 'dual-row-0',
            dualColumnRows: []
        });
        const s = settingsOverride || this.data.settings || DEFAULT_SETTINGS;
        const category = s.category || 'TOPIK Vocabulary';
        
        const subKey = this.getProgressSubKey(s);
        
        if (category === 'Mistakes (错题本)') {
            const mistakes = getMistakes();
            const savedIndex = Number(getProgress(category, subKey) || 0);
            const startIndex = normalizeIndex(savedIndex, mistakes.length);
            return this.setData(
                {
                    words: mistakes,
                    originalWords: [...mistakes],
                    isShuffled: false,
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

        if (category === FAVORITES_LIST_NAME) {
            const favorites = getFavorites();
            const savedIndex = Number(getProgress(category, subKey) || 0);
            const startIndex = normalizeIndex(savedIndex, favorites.length);
            return this.setData(
                {
                    words: favorites,
                    originalWords: [...favorites],
                    isShuffled: false,
                    loading: false,
                    currentIndex: startIndex,
                    currentWord: null
                },
                () => {
                    if (favorites.length > 0) {
                        this.startWord(startIndex);
                    } else {
                        this.setData({ words: [], loading: false, currentWord: null, prevWordInfo: null });
                        wx.showToast({ title: '暂无收藏单词', icon: 'none' });
                    }
                }
            );
        }

        if (category === PHOTO_RECOGNITION_CATEGORY) {
            const photoWords = getPhotoRecognitionWords();
            const savedIndex = Number(getProgress(category, subKey) || 0);
            const startIndex = normalizeIndex(savedIndex, photoWords.length);
            return this.setData(
                {
                    words: photoWords,
                    originalWords: [...photoWords],
                    isShuffled: false,
                    loading: false,
                    currentIndex: startIndex,
                    currentWord: null
                },
                () => {
                    if (photoWords.length > 0) {
                        this.startWord(startIndex);
                    } else {
                        this.setData({ words: [], loading: false, currentWord: null, prevWordInfo: null });
                        wx.showToast({ title: '暂无拍照练习单词', icon: 'none' });
                    }
                }
            );
        }

        if (category === PICTURE_WORDS_PRACTICE_CATEGORY) {
            const pictureWords = getPictureWordsPracticeWords();
            const savedIndex = Number(getProgress(category, subKey) || 0);
            const startIndex = normalizeIndex(savedIndex, pictureWords.length);
            return this.setData(
                {
                    words: pictureWords,
                    originalWords: [...pictureWords],
                    isShuffled: false,
                    loading: false,
                    currentIndex: startIndex,
                    currentWord: null
                },
                () => {
                    if (pictureWords.length > 0) {
                        this.startWord(startIndex);
                    } else {
                        this.setData({ words: [], loading: false, currentWord: null, prevWordInfo: null });
                        wx.showToast({ title: '暂无看图练习单词', icon: 'none' });
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
        
        const res = await getWords(category, 2000, 0, filters);
        
        if (res && res.words) {
            const savedIndex = Number(getProgress(category, subKey) || 0);
            const startIndex = normalizeIndex(savedIndex, res.words.length);
            this.setData(
                {
                    words: res.words,
                    originalWords: [...res.words],
                    isShuffled: false,
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
            this.setData({ words: [], originalWords: [], isShuffled: false, loading: false, currentWord: null, prevWordInfo: null });
        }
    },

    toggleShuffle() {
        const { isShuffled, originalWords, words } = this.data;
        let newWords;
        let toastText;
        if (isShuffled) {
            newWords = [...originalWords];
            toastText = '已恢复原顺序';
        } else {
            newWords = [...words];
            for (let i = newWords.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [newWords[i], newWords[j]] = [newWords[j], newWords[i]];
            }
            toastText = `已随机打乱 ${newWords.length} 个单词`;
        }
        if (this._shuffleToastTimer) clearTimeout(this._shuffleToastTimer);
        this.setData({
            isShuffled: !isShuffled,
            words: newWords,
            currentIndex: 0,
            dualCompletedIds: {},
            dualNativeInputs: {},
            dualNativeInputFocus: false,
            dualRevealWord: false,
            dualExampleRowId: '',
            dualActionLocked: false,
            dualScrollIntoView: 'dual-row-0',
            dualColumnRows: [],
            showShuffleToast: true,
            shuffleToastText: toastText
        }, () => {
            this.startWord(0);
        });
        this._shuffleToastTimer = setTimeout(() => {
            this.setData({ showShuffleToast: false });
        }, 2000);
    },

    openSettings() {
        this.setData({ showSettingsModal: true, showSettingsTooltip: false });
        if (this._settingsTooltipTimer) {
            clearTimeout(this._settingsTooltipTimer);
            this._settingsTooltipTimer = null;
        }
    },

    closeSettings() {
        this.setData({ showSettingsModal: false });
        if (this.data.isPC) {
            this.focusHiddenInput();
        }
    },

    preventBubble() {},

    applyCategorySelection(category, categoryIndex) {
        if (!category) return;
        const nextSettings = Object.assign({}, this.data.settings || {});
        nextSettings.category = category;
        nextSettings.yonseiLessonId = '';
        nextSettings.yonseiLessonName = '';
        
        const sanitized = sanitizeSettings(nextSettings);

        this.setData({
            settings: sanitized,
            categoryPickerIndex: typeof categoryIndex === 'number' ? categoryIndex : this.data.categoryPickerIndex,
            prevWordInfo: null,
            currentWord: null
        });
        wx.setStorageSync('settings', sanitized);
        this.loadSubcategories(sanitized).then((finalSettings) => {
            this.updateDisplayCategory();
            this.loadWords(finalSettings);
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

        const action = () => {
            const nextSettings = Object.assign({}, this.data.settings || {});
            nextSettings.yonseiLessonId = String(lessonId);
            nextSettings.yonseiLessonName = String(lessonName);
            const idx = Math.max(0, (this.data.yonseiLessons || []).findIndex(l => String(l.id) === String(lessonId)));
            const display = (this.data.yonseiLessonOptions || [])[idx] || '请选择';
            this.setData({ settings: sanitizeSettings(nextSettings), yonseiLessonPickerIndex: idx, yonseiLessonDisplay: display });
            wx.setStorageSync('settings', sanitizeSettings(nextSettings));
            this.updateDisplayCategory();
            this.loadWords();
        };

        const category = this.data.settings.category || 'Yonsei';
        const contentId = `yonsei_${category.replace(/\s+/g, '_')}_${lessonId}`;
        this.checkAndShowAd(contentId, action);
    },

    onYonseiLessonPickerChange(e) {
        const index = Number(e.detail && e.detail.value);
        const lesson = (this.data.yonseiLessons || [])[index];
        if (!lesson) return;

        const action = () => {
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
        };

        const category = this.data.settings.category || 'Yonsei';
        const contentId = `yonsei_${category.replace(/\s+/g, '_')}_${lesson.id}`;
        this.checkAndShowAd(contentId, action);
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
        
        const action = () => {
            const topikSession = String(session || '');
            const nextSettings = Object.assign({}, this.data.settings || {});
            nextSettings.topikSession = topikSession;
            const next = sanitizeSettings(nextSettings);
            this.setData({ settings: next });
            wx.setStorageSync('settings', next);
            this.updateDisplayCategory();
            this.loadWords();
        };
        
        // TOPIK 切换 Session 也视为收费操作
        const level = this.data.settings.topikLevel || '1';
        const contentId = `topik_${level}_${session}`;
        this.checkAndShowAd(contentId, action);
    },

    clearAllTimers() {
        if (this.flashTimer) clearTimeout(this.flashTimer);
        if (this.quizTimer) clearInterval(this.quizTimer);
        this.flashTimer = null;
        this.quizTimer = null;
        if (this._quizAdvanceTimer) clearTimeout(this._quizAdvanceTimer);
        this._quizAdvanceTimer = null;
        if (this.helpRevealTimer) clearTimeout(this.helpRevealTimer);
        this.helpRevealTimer = null;
        if (this.completeTimer) clearTimeout(this.completeTimer);
        this.completeTimer = null;
        if (this._guideBubbleTimer) clearTimeout(this._guideBubbleTimer);
        this._guideBubbleTimer = null;
        if (this._settingsTooltipTimer) clearTimeout(this._settingsTooltipTimer);
        this._settingsTooltipTimer = null;
        if (this._preloadTimer) clearTimeout(this._preloadTimer);
        this._preloadTimer = null;
        if (this._autoPronounceTimer) clearTimeout(this._autoPronounceTimer);
        this._autoPronounceTimer = null;
        if (this._shareImageTimer) clearTimeout(this._shareImageTimer);
        this._shareImageTimer = null;
        if (this._audioGapTimer) clearTimeout(this._audioGapTimer);
        this._audioGapTimer = null;
        if (this._sleepVolumePreviewTimer) clearTimeout(this._sleepVolumePreviewTimer);
        this._sleepVolumePreviewTimer = null;
        if (this._sleepBackgroundStopGuardTimer) clearTimeout(this._sleepBackgroundStopGuardTimer);
        this._sleepBackgroundStopGuardTimer = null;
        this._sleepStoppingBackground = false;
        if (this._dualAdvanceTimer) clearTimeout(this._dualAdvanceTimer);
        this._dualAdvanceTimer = null;
        if (this._dualRevealTimer) clearTimeout(this._dualRevealTimer);
        this._dualRevealTimer = null;
        if (this._dualHintAdvanceTimer) clearTimeout(this._dualHintAdvanceTimer);
        this._dualHintAdvanceTimer = null;
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
                if (this._quizAdvanceTimer) clearTimeout(this._quizAdvanceTimer);
                this._quizAdvanceTimer = setTimeout(() => {
                    this._quizAdvanceTimer = null;
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
        this.setData({
            settings: next,
            naggingRepeatCountPreview: next.naggingRepeatCount
        });
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

        if (key === 'naggingRepeatCount' && this.data.isNaggingMode) {
            this.startNaggingLoop();
        }
    },

    onNaggingRepeatCountInput(e) {
        const raw = e && e.detail ? String(e.detail.value || '') : '';
        const value = raw.replace(/\D/g, '').slice(0, 3);
        this.setData({ naggingRepeatCountPreview: value });
    },

    startEditingNaggingRepeatCount() {
        this.pauseNaggingLoopForEdit();
        this.setData({
            isEditingNaggingRepeatCount: true,
            naggingRepeatCountPreview: this.getNaggingRepeatLimit()
        });
    },

    pauseNaggingLoopForEdit() {
        this._naggingLoopId = (this._naggingLoopId || 0) + 1;
        if (this.naggingTimer) clearTimeout(this.naggingTimer);
        this.naggingTimer = null;
        this.cancelCurrentAudioPlayback();
    },

    resumeNaggingLoopAfterEdit() {
        if (!this.data.isNaggingMode) return;
        const currentWord = this._currentWordRuntime || this.data.currentWord;
        if (!currentWord) return;
        this._naggingLoopId = (this._naggingLoopId || 0) + 1;
        const progress = Number(this.data.naggingRepeatProgress || 0);
        if (progress >= this.getNaggingRepeatLimit()) {
            this.scheduleNextNaggingWord(this._naggingLoopId);
            return;
        }
        this.naggingAudioLoop(this._naggingLoopId);
    },

    suppressNextNaggingOverlayExit() {
        this._suppressNextNaggingOverlayExit = true;
        if (this._suppressNaggingOverlayExitTimer) {
            clearTimeout(this._suppressNaggingOverlayExitTimer);
        }
        this._suppressNaggingOverlayExitTimer = setTimeout(() => {
            this._suppressNextNaggingOverlayExit = false;
            this._suppressNaggingOverlayExitTimer = null;
        }, 350);
    },

    clearNaggingOverlayExitSuppress() {
        this._suppressNextNaggingOverlayExit = false;
        if (this._suppressNaggingOverlayExitTimer) {
            clearTimeout(this._suppressNaggingOverlayExitTimer);
            this._suppressNaggingOverlayExitTimer = null;
        }
    },

    commitNaggingRepeatCount(e) {
        const wasEditing = !!this.data.isEditingNaggingRepeatCount;
        if (!wasEditing) return;
        const raw = e && e.detail && e.detail.value !== undefined
            ? e.detail.value
            : this.data.naggingRepeatCountPreview;
        const next = sanitizeSettings(Object.assign({}, this.data.settings || {}, {
            naggingRepeatCount: raw
        }));
        if (wasEditing) {
            this.suppressNextNaggingOverlayExit();
        }
        this.setData({
            settings: next,
            naggingRepeatCountPreview: next.naggingRepeatCount,
            isEditingNaggingRepeatCount: false
        });
        wx.setStorageSync('settings', next);
        if (wasEditing) {
            this.resumeNaggingLoopAfterEdit();
        }
    },

    handleNaggingOverlayTap() {
        if (this.data.isEditingNaggingRepeatCount) {
            this.suppressNextNaggingOverlayExit();
            if (typeof wx.hideKeyboard === 'function') {
                wx.hideKeyboard();
            }
            if (this._naggingEditFallbackCommitTimer) {
                clearTimeout(this._naggingEditFallbackCommitTimer);
            }
            this._naggingEditFallbackCommitTimer = setTimeout(() => {
                this._naggingEditFallbackCommitTimer = null;
                if (this.data.isEditingNaggingRepeatCount) {
                    this.commitNaggingRepeatCount();
                }
            }, 120);
            return;
        }
        if (this._suppressNextNaggingOverlayExit) {
            this.clearNaggingOverlayExitSuppress();
            return;
        }
        this.toggleSetting({
            currentTarget: {
                dataset: { key: 'naggingMode' }
            }
        });
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

        if (key === 'naggingMode') {
            if (next.naggingMode) {
                this.setData({ isNaggingMode: true });
                this.startNaggingLoop();
            } else {
                this.setData({ isNaggingMode: false });
                this.stopNaggingLoop();
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

	    startWord(index, prevWordInfoOverride, options = {}) {
	        this.clearAllTimers();
	        this.cancelCurrentAudioPlayback();
	        const words = this.data.words || [];
	        const safeIndex = normalizeIndex(index, words.length);
	        if (!Array.isArray(words) || words.length === 0) return;

		        const wordObj = words[safeIndex];
            const dualScrollIndex = options && options.dualScrollIndex != null
                ? normalizeIndex(options.dualScrollIndex, words.length)
                : safeIndex;
	        const word = wordObj.word;
	        const renderSeq = Number(this._wordRenderSeq || 0) + 1;
	        this._wordRenderSeq = renderSeq;
	        this._currentIndexRuntime = safeIndex;
	        this._currentWordRuntime = wordObj;
        this._autoPronouncedWordId = null;

        const initialState = this.buildTypingState(word);
        this.persistCurrentProgress(safeIndex);

	        const nextState = {
	            currentIndex: safeIndex,
	            currentWord: wordObj,
	            typingState: initialState,
            isCorrect: false,
            showAnswer: false,
            isError: false,
            hasInteracted: false,
            isWordVisible: true,
            helpReveal: false,
            dualRevealWord: false,
	            repeatCorrectCount: 0,
	            timeLeft: (this.data.settings && this.data.settings.timerDuration) || DEFAULT_SETTINGS.timerDuration,
		            meaningIsSmall: false,
                dualScrollIntoView: `dual-row-${dualScrollIndex}`
		        };
	        if (arguments.length > 1) {
	            nextState.prevWordInfo = prevWordInfoOverride;
	        }

		        this.setData(nextState, () => {
		            if (
		                this._wordRenderSeq !== renderSeq
		                || this._currentIndexRuntime !== safeIndex
		                || safeWordId(this._currentWordRuntime) !== safeWordId(wordObj)
		            ) {
		                return;
		            }
		            this.updateMeaningSize();
		            this.updateWordWrapMode(true);
		            this.startModeLogic();
		            this.refreshDualColumnRows({
		                currentIndex: safeIndex,
		                typingState: initialState
		            });
		            this.tryAutoPronounce();
		        });

	        this.updateDisplay(initialState);
	        this.updateShiftState(initialState);

		        if (this._preloadTimer) clearTimeout(this._preloadTimer);
		        this.clearAudioPreloadQueue();
		        this._preloadTimer = setTimeout(() => {
		            this._preloadTimer = null;
		            this.preloadNextWordAudio();
		        }, AUDIO_PRELOAD_DELAY_MS);
	        if (this._shareImageTimer) clearTimeout(this._shareImageTimer);
	        this._shareImageTimer = setTimeout(() => {
	            this._shareImageTimer = null;
	            this.drawShareImage();
	        }, 500);
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

    onHiddenInput(e) {
        if (!this.data.isPC) return;
        const val = e.detail.value;
        
        // Reset immediately to keep capturing
        this.setData({ hiddenInputValue: ' ' });

        if (!val || val.length === 0) {
            // Backspace handling if needed
            return;
        }

        if (val.length >= 2) {
            const char = val.slice(1);
            // Process each new character (in case multiple were pasted or typed fast)
            for (const c of char) {
                // Special case for Space
                const key = c === ' ' ? 'SPACE' : c;
                this.handleKeyPress(key);
            }
        }
    },

    onHiddenInputBlur() {
        if (this.data.isPC) {
            this.setData({ inputFocus: false });
        }
    },

    focusHiddenInput() {
        if (this.data.practiceToolsOpen) {
            this.setData({ practiceToolsOpen: false });
        }
        if (this.data.isPC) {
            this.setData({ inputFocus: true });
        }
    },

    onKeyPress(e) {
        const key = e.detail.key;
        this.handleKeyPress(key);
    },

    handleKeyPress(key) {
        if (!this._hasUserGesture) this._hasUserGesture = true;
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
            this.refreshDualColumnRows({ typingState: newState });

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
                // 记录 SRS 学习数据
                const w = this.data.currentWord;
                if (w && w.id) {
                    const wordKey = `${w.sourceCategory || ''}_${w.lessonId || ''}_${w.id}`;
                    srs.recordLearned(wordKey, {
                        word: w.word,
                        meaning: w.meaning,
                        phonetic: w.phonetic || '',
                        category: w.sourceCategory || '',
                        lessonId: w.lessonId || '',
                    });
                }
                const completedMap = this.markDualColumnCompleted(w, this.data.currentIndex);
                if (completedMap) {
                    this.setData({
                        dualCompletedIds: completedMap,
                        dualExampleRowId: getDualCompletedKey(w, this.data.currentIndex)
                    }, () => {
                        this.nextWord();
                    });
                } else {
                    this.nextWord();
                }
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
            this.refreshDualColumnRows({ typingState: initialState });
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
            this._currentIndexRuntime = 0;
            this._currentWordRuntime = null;
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
        if (!this._hasUserGesture) this._hasUserGesture = true;
        const current = this._currentWordRuntime || this.data.currentWord;
        const len = Array.isArray(this.data.words) ? this.data.words.length : 0;
        if (len <= 0) return;
        const currentIndex = Number.isFinite(Number(this._currentIndexRuntime))
            ? Number(this._currentIndexRuntime)
            : Number(this.data.currentIndex || 0);
        const nextIndex = normalizeIndex(currentIndex + 1, len);
        const prevWordInfo = current ? {
            word: current.word,
            meaning: current.meaning,
            isCorrect: this.data.isCorrect
        } : null;
        this.startWord(nextIndex, prevWordInfo);
    },

    prevWord() {
        if (!this._hasUserGesture) this._hasUserGesture = true;
        const len = Array.isArray(this.data.words) ? this.data.words.length : 0;
        if (len <= 0) return;
        const currentIndex = Number.isFinite(Number(this._currentIndexRuntime))
            ? Number(this._currentIndexRuntime)
            : Number(this.data.currentIndex || 0);
        const prevIndex = normalizeIndex(currentIndex - 1, len);
        this.startWord(prevIndex, null);
    },

    ensureAudioContexts() {
        if (!this.wordAudio) {
            this.wordAudio = wx.createInnerAudioContext();
            this.wordAudio.autoplay = false;
        }
        if (!this.cnAudio) {
            this.cnAudio = wx.createInnerAudioContext();
            this.cnAudio.autoplay = false;
        }
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
	        try { audioCtx.__nvPendingSettle = null; } catch (e) {}
	        try { audioCtx.stop && audioCtx.stop(); } catch (e) {}
	        try { audioCtx.offPlay && audioCtx.offPlay(); } catch (e) {}
	        try { audioCtx.offWaiting && audioCtx.offWaiting(); } catch (e) {}
	        try { audioCtx.offEnded && audioCtx.offEnded(); } catch (e) {}
	        try { audioCtx.offError && audioCtx.offError(); } catch (e) {}
	        try { audioCtx.offCanplay && audioCtx.offCanplay(); } catch (e) {}
	        try { audioCtx.offStop && audioCtx.offStop(); } catch (e) {}
	    },

	    cancelCurrentAudioPlayback() {
	        const seq = this.bumpAudioPlaySeq();
	        if (this._autoPronounceTimer) {
	            clearTimeout(this._autoPronounceTimer);
	            this._autoPronounceTimer = null;
	        }
	        if (this._audioGapTimer) {
	            clearTimeout(this._audioGapTimer);
	            this._audioGapTimer = null;
	        }
	        this.stopAudioContext(this.wordAudio);
	        this.stopAudioContext(this.cnAudio);
	        return seq;
    },

    notifyMissingAudioOnce(wordId, isChinese) {
        const id = wordId != null ? String(wordId) : '';
        if (!id) return;
        const type = isChinese ? 'cn' : 'ko';
        const key = `${id}__${type}`;
        if (!this._missingAudioPrompted) this._missingAudioPrompted = new Map();

        const now = Date.now();
        const last = Number(this._missingAudioPrompted.get(key) || 0);
        if (now - last < 60000) return;
        this._missingAudioPrompted.set(key, now);

        const globalLast = Number(this._missingAudioToastAt || 0);
        if (now - globalLast < 1200) return;
        this._missingAudioToastAt = now;

        wx.showToast({ title: '加载失败，请手动点击', icon: 'none', duration: 1500 });
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

    shouldPreferEdgeTtsAudio() {
        const category = (this.data.settings && this.data.settings.category) || '';
        return category === PHOTO_RECOGNITION_CATEGORY || category === '拍照识别' || category === PICTURE_WORDS_PRACTICE_CATEGORY;
    },

    ensureAudioCacheDir() {
        if (!wx.env || !wx.env.USER_DATA_PATH || !wx.getFileSystemManager) return '';
        const dir = `${wx.env.USER_DATA_PATH}/audio_cache`;
        const fs = wx.getFileSystemManager();
        try {
            fs.accessSync(dir);
        } catch (e) {
            try { fs.mkdirSync(dir, { recursive: true }); } catch (e2) {}
        }
        return dir;
    },

    getEdgeTtsCachePath(cacheKey, text, lang) {
        const dir = this.ensureAudioCacheDir();
        if (!dir) return '';
        const key = `${EDGE_TTS_CACHE_NAMESPACE}|${lang}|${cacheKey}|${String(text || '').trim()}`;
        return `${dir}/edge_${hashAudioCacheText(key)}.mp3`;
    },

    getCachedEdgeTtsFile(cacheKey, text, lang) {
        const cachePath = this.getEdgeTtsCachePath(cacheKey, text, lang);
        if (!cachePath) return '';
        if (!this.hasLocalAudioFile(cachePath)) return '';
        this.setAudioFileToLRU(cacheKey, cachePath);
        return cachePath;
    },

    removeCachedEdgeTtsFile(cacheKey, text, lang) {
        const cachePath = this.getEdgeTtsCachePath(cacheKey, text, lang);
        if (!cachePath) return;
        this.removeAudioFromLRU(cacheKey);
        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        if (fs && fs.unlinkSync) {
            try { fs.unlinkSync(cachePath); } catch (e) {}
        }
    },

    buildEdgeTtsCacheItem(cacheKey, text, lang) {
        const key = cacheKey ? String(cacheKey) : '';
        const normalizedText = String(text || '').trim();
        const normalizedLang = String(lang || 'ko-KR');
        if (!key || !normalizedText) return null;
        const cachePath = this.getEdgeTtsCachePath(key, normalizedText, normalizedLang);
        if (!cachePath) return null;
        const flightKey = `${key}__${hashAudioCacheText(`${normalizedLang}|${normalizedText}`)}`;
        return {
            cacheKey: key,
            text: normalizedText,
            lang: normalizedLang,
            cachePath,
            flightKey
        };
    },

    writeEdgeTtsCacheFile(item, audioBase64) {
        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        if (!fs || !item || !item.cachePath || !audioBase64) return Promise.resolve('');
        this.ensureAudioCacheDir();
        try { fs.unlinkSync(item.cachePath); } catch (e) {}
        return new Promise((resolve) => {
            fs.writeFile({
                filePath: item.cachePath,
                data: audioBase64,
                encoding: 'base64',
                success: () => {
                    this.setAudioFileToLRU(item.cacheKey, item.cachePath);
                    resolve(item.cachePath);
                },
                fail: (e) => {
                    console.warn('[NV audio] edgeTts batch writeFile failed:', JSON.stringify(e));
                    resolve('');
                }
            });
        });
    },

    fetchEdgeTtsBatchToLRU(rawItems) {
        if (!Array.isArray(rawItems) || rawItems.length === 0) return Promise.resolve([]);
        if (!wx.cloud || !wx.cloud.callFunction) {
            console.warn('[NV audio] edgeTts unavailable: wx.cloud not initialized');
            return Promise.resolve([]);
        }

        if (!this._edgeTtsInFlight) this._edgeTtsInFlight = new Map();

        const seen = new Set();
        const toFetch = [];
        const waiters = [];

        rawItems.forEach((raw) => {
            const item = this.buildEdgeTtsCacheItem(raw && raw.cacheKey, raw && raw.text, raw && raw.lang);
            if (!item || seen.has(item.flightKey)) return;
            seen.add(item.flightKey);

            if (this.hasLocalAudioFile(item.cachePath)) {
                this.setAudioFileToLRU(item.cacheKey, item.cachePath);
                waiters.push(Promise.resolve(item.cachePath));
                return;
            }

            const inFlight = this._edgeTtsInFlight.get(item.flightKey);
            if (inFlight) {
                waiters.push(inFlight);
                return;
            }
            toFetch.push(item);
        });

        const startBatch = (chunk) => {
            const resolvers = new Map();
            chunk.forEach((item) => {
                const itemPromise = new Promise((resolve) => {
                    resolvers.set(item.flightKey, resolve);
                }).then((path) => {
                    try { this._edgeTtsInFlight.delete(item.flightKey); } catch (e) {}
                    return path || '';
                }).catch(() => {
                    try { this._edgeTtsInFlight.delete(item.flightKey); } catch (e) {}
                    return '';
                });
                this._edgeTtsInFlight.set(item.flightKey, itemPromise);
                waiters.push(itemPromise);
            });

            const finish = (item, path) => {
                const resolve = resolvers.get(item.flightKey);
                if (resolve) resolve(path || '');
            };

            wx.cloud.callFunction({
                name: 'edgeTts',
                timeout: 20000,
                data: {
                    items: chunk.map((item) => ({
                        key: item.flightKey,
                        text: item.text,
                        lang: item.lang
                    }))
                },
                success: async (res) => {
                    const result = (res && res.result) || {};
                    const resultItems = Array.isArray(result.items) ? result.items : [];
                    const resultMap = new Map(resultItems.map((item) => [String(item.key || ''), item]));
                    await Promise.all(chunk.map(async (item) => {
                        const resultItem = resultMap.get(item.flightKey);
                        if (!resultItem || !resultItem.ok || !resultItem.audioBase64) {
                            console.warn('[NV audio] edgeTts batch item failed:', item.text);
                            finish(item, '');
                            return;
                        }
                        const path = await this.writeEdgeTtsCacheFile(item, resultItem.audioBase64);
                        finish(item, path);
                    }));
                },
                fail: (e) => {
                    console.warn('[NV audio] edgeTts batch callFunction fail:', JSON.stringify(e));
                    chunk.forEach((item) => finish(item, ''));
                }
            });
        };

        for (let i = 0; i < toFetch.length; i += EDGE_TTS_BATCH_SIZE) {
            startBatch(toFetch.slice(i, i + EDGE_TTS_BATCH_SIZE));
        }

        return Promise.all(waiters);
    },

    fetchEdgeTtsToLRU(cacheKey, text, lang, forceRefresh = false) {
        const key = cacheKey ? String(cacheKey) : '';
        const normalizedText = String(text || '').trim();
        const normalizedLang = String(lang || 'ko-KR');
        if (!key || !normalizedText) return Promise.resolve('');

        const cachePath = this.getEdgeTtsCachePath(key, normalizedText, normalizedLang);
        if (!cachePath) return Promise.resolve('');
        if (!forceRefresh && this.hasLocalAudioFile(cachePath)) {
            this.setAudioFileToLRU(key, cachePath);
            return Promise.resolve(cachePath);
        }
        if (!wx.cloud || !wx.cloud.callFunction) {
            console.warn('[NV audio] edgeTts unavailable: wx.cloud not initialized');
            return Promise.resolve('');
        }

        if (!this._edgeTtsInFlight) this._edgeTtsInFlight = new Map();
        const flightKey = `${key}__${hashAudioCacheText(`${normalizedLang}|${normalizedText}`)}`;
        if (this._edgeTtsInFlight.has(flightKey)) return this._edgeTtsInFlight.get(flightKey);

        const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null;
        const request = new Promise((resolve) => {
            console.log('[NV audio] edgeTts fetch:', normalizedText, normalizedLang);
            wx.cloud.callFunction({
                name: 'edgeTts',
                timeout: 15000,
                data: { text: normalizedText, lang: normalizedLang },
                success: (res) => {
                    const result = (res && res.result) || {};
                    if (!result.ok || !result.audioBase64 || !fs) {
                        console.warn('[NV audio] edgeTts failed:', result.error || 'no audio');
                        resolve('');
                        return;
                    }
                    this.writeEdgeTtsCacheFile({ cacheKey: key, cachePath }, result.audioBase64).then(resolve);
                },
                fail: (e) => {
                    console.warn('[NV audio] edgeTts callFunction fail:', JSON.stringify(e));
                    resolve('');
                }
            });
        }).then((path) => {
            try { this._edgeTtsInFlight.delete(flightKey); } catch (e) {}
            return path;
        }).catch(() => {
            try { this._edgeTtsInFlight.delete(flightKey); } catch (e) {}
            return '';
        });

        this._edgeTtsInFlight.set(flightKey, request);
        return request;
    },

	    async playEdgeTtsFallback(audioCtx, cacheKey, text, lang, playSeq, wordId) {
	        const normalizedText = String(text || '').trim();
	        if (!audioCtx || !cacheKey || !normalizedText) return false;
	        const stillCurrent = () => playSeq == null || this.isAudioRequestCurrent(playSeq, wordId);

	        let src = await this.fetchEdgeTtsToLRU(cacheKey, normalizedText, lang);
	        if (!stillCurrent()) return null;
	        if (!src) {
	            src = await this.fetchEdgeTtsToLRU(cacheKey, normalizedText, lang, true);
	            if (!stillCurrent()) return null;
	            if (!src) return false;
	        }

	        let ok = await this.playSrcOnce(audioCtx, src);
	        if (!stillCurrent()) return null;
	        if (ok) return true;

	        this.removeCachedEdgeTtsFile(cacheKey, normalizedText, lang);
	        src = await this.fetchEdgeTtsToLRU(cacheKey, normalizedText, lang, true);
	        if (!stillCurrent()) return null;
	        if (!src) return false;
	        ok = await this.playSrcOnce(audioCtx, src);
	        if (!stillCurrent()) return null;
	        return !!ok;
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

        const percentEncodeUtf8 = (input) => {
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
        };

        const toHangulNFD = (s) => {
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
        };

        const w1 = sanitizeName(w0);
        const bases = w1 && w1 !== w0 ? [w1, w0] : [w0];

        const variants = [];
        bases.forEach((b) => {
            const base = String(b || '');
            if (!base) return;
            let nfd = '';
            let nfc = '';
            if (typeof base.normalize === 'function') {
                try { nfd = base.normalize('NFD'); } catch (e) {}
                try { nfc = base.normalize('NFC'); } catch (e) {}
            }
            const hangulNfd = toHangulNFD(base);
            // Optimization: Prioritize Manual NFD (toHangulNFD) for Android compatibility
            if (hangulNfd) variants.push(hangulNfd);
            if (nfd) variants.push(nfd);
            if (nfc) variants.push(nfc);
            variants.push(base);
        });
        const uniqueVariants = Array.from(new Set(variants.filter(Boolean)));
        const folder = this.getAudioFolder();
        const folders = [folder];
        const suffix = isChinese ? '_cn' : '';
        const urls = [];
        uniqueVariants.forEach((v) => {
            const name = `${v}${suffix}.mp3`;
            [name].forEach((n) => {
                const hasNonAscii = /[^\u0000-\u007f]/.test(n);
                folders.forEach((fd) => {
                    const rawPath = `${AUDIO_BASE_PATH}/${fd}/${n}`;
                    const encodedPath = `${AUDIO_BASE_PATH}/${fd}/${percentEncodeUtf8(n)}`;
                    urls.push(`${AUDIO_ORIGIN}${encodedPath}`);
                    if (!hasNonAscii) urls.push(`${AUDIO_ORIGIN}${rawPath}`);
                });
            });
        });
        return Array.from(new Set(urls));
    },

    playSrcOnce(audioCtx, src, cacheKey, cacheUrl) {
        const playId = Math.random().toString(36).substring(7);
        const logPrefix = `[PlaySrcOnce:${playId}]`;
        console.log(logPrefix, 'Start request:', src);

        return new Promise((resolve) => {
            if (!audioCtx || !src) {
                console.warn(logPrefix, 'Invalid args');
                return resolve(false);
            }

            let settled = false;
            let started = false;
            let playRequested = false;
            let retryTimer = null;
            let failTimer = null;

            const cleanup = () => {
                try { audioCtx.offEnded && audioCtx.offEnded(); } catch (e) {}
                try { audioCtx.offError && audioCtx.offError(); } catch (e) {}
                try { audioCtx.offCanplay && audioCtx.offCanplay(); } catch (e) {}
                try { audioCtx.offStop && audioCtx.offStop(); } catch (e) {}
                try { audioCtx.offPlay && audioCtx.offPlay(); } catch (e) {}
                try { audioCtx.offWaiting && audioCtx.offWaiting(); } catch (e) {}
                try { if (retryTimer) clearTimeout(retryTimer); } catch (e) {}
                try { if (failTimer) clearTimeout(failTimer); } catch (e) {}
                retryTimer = null;
                failTimer = null;
            };

            const settle = (ok) => {
                if (settled) return;
                settled = true;
                cleanup();
                console.log(logPrefix, 'Settled:', ok ? 'Success' : 'Failed');
                try {
                    if (audioCtx.__nvPendingSettle === settle) {
                        audioCtx.__nvPendingSettle = null;
                    }
                } catch (e) {}
                resolve(!!ok);
            };

            // Stop previous if any
            try {
                if (audioCtx.__nvPendingSettle) {
                    audioCtx.__nvPendingSettle(false);
                }
            } catch (e) {}
            try { audioCtx.stop(); } catch (e) {}
            
            cleanup(); // Ensure clean slate
            
            try { audioCtx.__nvPendingSettle = settle; } catch (e) {}

            const onCanplay = () => {
                console.log(logPrefix, 'onCanplay');
                if (cacheKey && cacheUrl && this._audioUrlMemo && this._audioUrlMemo.set) {
                    this._audioUrlMemo.set(cacheKey, cacheUrl);
                }
                if (!playRequested && !started && !settled) {
                    console.log(logPrefix, 'onCanplay -> attemptPlay');
                    attemptPlay('canplay');
                }
            };

            const onPlay = () => {
                console.log(logPrefix, 'onPlay (Started)');
                started = true;
            };

            const onWaiting = () => {
                console.log(logPrefix, 'onWaiting');
            };

            const onEnded = () => {
                console.log(logPrefix, 'onEnded');
                settle(true);
            };

            const onStop = () => {
                console.log(logPrefix, 'onStop');
                settle(started);
            };

            const onError = (res) => {
                console.error(logPrefix, 'onError:', res);
                settle(started);
            };

            audioCtx.onEnded(onEnded);
            audioCtx.onError(onError);

            if (audioCtx.onCanplay) audioCtx.onCanplay(onCanplay);
            if (audioCtx.onPlay) audioCtx.onPlay(onPlay);
            if (audioCtx.onWaiting) audioCtx.onWaiting(onWaiting);
            if (audioCtx.onStop) audioCtx.onStop(onStop);

            // Ensure autoplay is off to manually control playback
            audioCtx.autoplay = false;
            try { audioCtx.loop = false; } catch (e) {}
            audioCtx.src = src;
            
            const attemptPlay = (reason = 'manual') => {
                if (settled || started || playRequested) return;
                try {
                    playRequested = true;
                    console.log(logPrefix, 'Calling audioCtx.play()', reason);
                    audioCtx.play();
                } catch (e) {
                    playRequested = false;
                    console.error(logPrefix, 'Play exception:', e);
                }
            };
            
            // Manual play triggers loading
            attemptPlay('initial');

            // Timeout Logic
            // If it's a local file, we expect it to be fast. If it stalls, it's likely corrupt or context issue.
            // If it's network, it might take longer.
            const isLocal = src.startsWith('http://usr/')
                || src.startsWith('usr/')
                || src.startsWith('http://tmp/')
                || src.startsWith('tmp/')
                || src.startsWith('wxfile://')
                || src.startsWith('/');
            const retryDelay = isLocal ? 500 : 1500; // 500ms for local, 1.5s for network warning

            retryTimer = setTimeout(() => {
                if (settled || started) return;
                console.warn(logPrefix, 'Retry timeout triggered. isLocal:', isLocal);
                
                if (isLocal) {
                    // Fail fast for local files so we can fallback to network
                    console.warn(logPrefix, 'Local file timeout -> Fail immediately to trigger fallback');
                    settle(false);
                } else {
                    // Do not call play() repeatedly on Android; it may enqueue duplicate playback.
                    console.warn(logPrefix, 'Network still waiting, keep current play request');
                }
            }, retryDelay);

            failTimer = setTimeout(() => {
                if (settled || started) return;
                console.error(logPrefix, 'Overall timeout:', src);
                settle(false);
            }, 5000); // 5s overall safety
        });
    },

    async playWithFallback(audioCtx, urls, cacheKey, shouldContinue) {
        if (!audioCtx || !urls || urls.length === 0) return false;
        const isCurrent = typeof shouldContinue === 'function' ? shouldContinue : () => true;
        if (!isCurrent()) return null;

        const memo = cacheKey && this._audioUrlMemo && this._audioUrlMemo.get ? this._audioUrlMemo.get(cacheKey) : '';
        if (memo) {
            console.log('[PlayFallback] Trying memo:', memo);
            const ok = await this.playSrcOnce(audioCtx, memo, cacheKey, memo);
            if (!isCurrent()) return null;
            if (ok) return true;
        }

        for (const url of urls) {
            if (!isCurrent()) return null;
            if (!url) continue;
            console.log('[PlayFallback] Trying url:', url);
            const ok = await this.playSrcOnce(audioCtx, url, cacheKey, url);
            if (!isCurrent()) return null;
            if (ok) {
                console.log('[PlayFallback] Success:', url);
                return true;
            }
        }

        console.error('[PlayFallback] All failed:', urls);
        return false;
    },

    preloadNextWordAudio() {
        const s = this.data.settings || DEFAULT_SETTINGS;
        const preferEdgeTts = this.shouldPreferEdgeTtsAudio();
        const shouldPreload = preferEdgeTts || !!(s.autoPronounce || this._hasPlayedAudioOnce);
        if (!shouldPreload) return;

        const words = Array.isArray(this.data.words) ? this.data.words : [];
        if (words.length === 0) return;

        const currentIndex = Number(this.data.currentIndex || 0);
        const preloadMeaning = !!s.pronounceMeaning;

        if (preferEdgeTts) {
            this.preloadEdgeTtsWindow(currentIndex, preloadMeaning);
            return;
        }

        if (words.length <= 1) return;

        const loopCount = Math.min(AUDIO_PRELOAD_AHEAD, words.length - 1);

        for (let i = 1; i <= loopCount; i++) {
            const nextIndex = normalizeIndex(currentIndex + i, words.length);
            const next = words[nextIndex];
            if (!next || !next.word) continue;

            // Preload Korean
            this._preloadSingleAudio(next.word, false);

            // Preload Chinese if needed
            if (preloadMeaning) {
                this._preloadSingleAudio(next.word, true);
            }
        }
    },

    buildEdgeTtsPreloadItems(wordInfo, includeMeaning) {
        const item = wordInfo && typeof wordInfo === 'object' ? wordInfo : { word: wordInfo };
        const word = String((item && item.word) || '').trim();
        if (!word) return [];

        const requests = [{
            cacheKey: this.getAudioCacheKey(word, false),
            text: word,
            lang: 'ko-KR'
        }];

        if (includeMeaning && item && item.meaning) {
            requests.push({
                cacheKey: this.getAudioCacheKey(word, true),
                text: String(item.meaning || '').trim(),
                lang: 'zh-CN'
            });
        }

        return requests;
    },

    preloadEdgeTtsRequests(rawItems) {
        if (!Array.isArray(rawItems) || rawItems.length === 0) return;
        if (!this._attemptedPreloadKeys) this._attemptedPreloadKeys = new Set();

        const pending = [];
        rawItems.forEach((raw) => {
            const item = this.buildEdgeTtsCacheItem(raw && raw.cacheKey, raw && raw.text, raw && raw.lang);
            if (!item) return;
            if (this.getAudioFileFromLRU(item.cacheKey)) return;
            if (this.hasLocalAudioFile(item.cachePath)) {
                this.setAudioFileToLRU(item.cacheKey, item.cachePath);
                return;
            }

            const preloadKey = `edge__${item.flightKey}`;
            const inFlight = this._edgeTtsInFlight && this._edgeTtsInFlight.has(item.flightKey);
            if (this._attemptedPreloadKeys.has(preloadKey) && !inFlight) return;
            this._attemptedPreloadKeys.add(preloadKey);
            pending.push(item);
        });

        if (pending.length > 0) {
            this.fetchEdgeTtsBatchToLRU(pending).catch(() => {});
        }
    },

    preloadEdgeTtsWindow(indexOverride, includeMeaning) {
        const words = Array.isArray(this.data.words) ? this.data.words : [];
        if (words.length === 0) return;

        const currentIndex = Number(indexOverride != null ? indexOverride : this.data.currentIndex || 0);
        const loopCount = Math.min(EDGE_TTS_PRELOAD_AHEAD, Math.max(words.length - 1, 0));
        const seen = new Set();
        const requests = [];

        for (let i = 0; i <= loopCount; i++) {
            const nextIndex = normalizeIndex(currentIndex + i, words.length);
            if (seen.has(nextIndex)) continue;
            seen.add(nextIndex);

            const next = words[nextIndex];
            if (!next || !next.word) continue;
            requests.push(...this.buildEdgeTtsPreloadItems(next, includeMeaning));
        }

        this.preloadEdgeTtsRequests(requests);
    },

    preloadEdgeTtsForWord(wordInfo, includeMeaning) {
        this.preloadEdgeTtsRequests(this.buildEdgeTtsPreloadItems(wordInfo, includeMeaning));
    },

    _preloadSingleAudio(word, isChinese) {
        if (!word) return;
        const cacheKey = this.getAudioCacheKey(word, isChinese);
        // Check if already in LRU
        if (this.getAudioFileFromLRU(cacheKey)) return;

        if (!isChinese) {
            const edgeCached = this.getCachedEdgeTtsFile(cacheKey, word, 'ko-KR');
            if (edgeCached) return;
        }
        if (this.shouldPreferEdgeTtsAudio()) return;

        // Check if already attempted in this session (avoid redundant requests)
        if (!this._attemptedPreloadKeys) this._attemptedPreloadKeys = new Set();
        if (this._attemptedPreloadKeys.has(cacheKey)) return;

        // Check if already in flight
        if (this._audioFileInFlight && this._audioFileInFlight.has(cacheKey)) return;

        const memo = cacheKey && this._audioUrlMemo && this._audioUrlMemo.get ? this._audioUrlMemo.get(cacheKey) : '';
        const candidates = memo ? [memo] : this.buildAudioUrls(word, isChinese);
        
        this.enqueueAudioPreload(cacheKey, candidates);
    },

    isAudioRequestCurrent(playSeq, wordId) {
        return this._audioPlaySeq === playSeq && !!this.data.currentWord && safeWordId(this.data.currentWord) === wordId;
    },

    canPlayCurrentWordAudio(playSeq, wordId, options = {}) {
        if ((this._dualWordAudioBlocked || this.data.dualColumnMode) && !options.allowInDual) return false;
        if (options.skipCurrentCheck) {
            return this._audioPlaySeq === playSeq;
        }
        return this.isAudioRequestCurrent(playSeq, wordId);
    },

    async playCurrentWordSrcOnce(audioCtx, src, playSeq, wordId, cacheKey, cacheUrl, options = {}) {
        if (!this.canPlayCurrentWordAudio(playSeq, wordId, options)) return null;
        const ok = await this.playSrcOnce(audioCtx, src, cacheKey, cacheUrl);
        if (!this.canPlayCurrentWordAudio(playSeq, wordId, options)) {
            this.stopAudioContext(audioCtx);
            return null;
        }
        return ok;
    },

    async playAudioPartWithFallback(audioCtx, current, isChinese, playSeq, wordId, options = {}) {
        if (!audioCtx || !current || !current.word) return false;
        if (!this.canPlayCurrentWordAudio(playSeq, wordId, options)) return null;

        const word = String(current.word || '').trim();
        const edgeText = isChinese ? String(current.meaning || '').trim() : word;
        const lang = isChinese ? 'zh-CN' : 'ko-KR';
        if (!word || !edgeText) return false;

	        const cacheKey = this.getAudioCacheKey(word, isChinese);
	        const edgeCached = this.getCachedEdgeTtsFile(cacheKey, edgeText, lang);
	        if (edgeCached) {
	            const ok = await this.playCurrentWordSrcOnce(audioCtx, edgeCached, playSeq, wordId, null, null, options);
	            if (ok == null) return null;
	            if (ok) return true;
	            this.removeCachedEdgeTtsFile(cacheKey, edgeText, lang);
	        }

	        if (this.shouldPreferEdgeTtsAudio()) {
	            const ok = await this.playEdgeTtsFallback(audioCtx, cacheKey, edgeText, lang, playSeq, wordId);
	            return this.canPlayCurrentWordAudio(playSeq, wordId, options) ? ok : null;
	        }

        const memo = cacheKey && this._audioUrlMemo && this._audioUrlMemo.get ? this._audioUrlMemo.get(cacheKey) : '';
        const urls = memo ? [memo, ...this.buildAudioUrls(word, isChinese)] : this.buildAudioUrls(word, isChinese);
        const local = cacheKey ? this.getAudioFileFromLRU(cacheKey) : '';
        let ok = false;

	        if (local) {
	            ok = await this.playCurrentWordSrcOnce(audioCtx, local, playSeq, wordId, null, null, options);
	            if (ok == null) return null;
	            if (!ok) {
	                if (!this.hasLocalAudioFile(local)) {
	                    this.removeAudioFromLRU(cacheKey);
                }
                if (!this.canPlayCurrentWordAudio(playSeq, wordId, options)) return null;
	                ok = await this.playWithFallback(audioCtx, urls, cacheKey, () => this.canPlayCurrentWordAudio(playSeq, wordId, options));
            }
	        } else {
	            const downloaded = await this.downloadAudioToLRU(cacheKey, urls);
	            if (!this.canPlayCurrentWordAudio(playSeq, wordId, options)) return null;
	            if (downloaded) {
	                ok = await this.playCurrentWordSrcOnce(audioCtx, downloaded, playSeq, wordId, null, null, options);
	                if (ok == null) return null;
	                if (!ok) {
	                    if (!this.canPlayCurrentWordAudio(playSeq, wordId, options)) return null;
		                    ok = await this.playWithFallback(audioCtx, urls, cacheKey, () => this.canPlayCurrentWordAudio(playSeq, wordId, options));
	                }
	            }
	        }

	        if (!this.canPlayCurrentWordAudio(playSeq, wordId, options)) return null;
	        if (ok) return true;
	        ok = await this.playEdgeTtsFallback(audioCtx, cacheKey, edgeText, lang, playSeq, wordId);
	        return this.canPlayCurrentWordAudio(playSeq, wordId, options) ? ok : null;
	    },

    async playWordAudio(options = {}) {
        this._hasUserGesture = true;
        if ((this._dualWordAudioBlocked || this.data.dualColumnMode) && !options.allowInDual) {
            this.cancelCurrentAudioPlayback();
            return;
        }
        const current = this.data.currentWord;
        if (!current || !current.word) return;
        const playSeq = this.cancelCurrentAudioPlayback();
        this.ensureAudioContexts();
        this._hasPlayedAudioOnce = true;

        const wordId = safeWordId(current);
        if (!this.canPlayCurrentWordAudio(playSeq, wordId, options)) return;
        const playMeaning = !options.skipMeaning && !!(this.data.settings && this.data.settings.pronounceMeaning);
        if (this.shouldPreferEdgeTtsAudio()) {
            this.preloadEdgeTtsWindow(Number(this.data.currentIndex || 0), playMeaning);
        }

        const koOk = await this.playAudioPartWithFallback(this.wordAudio, current, false, playSeq, wordId, options);
        if (koOk == null) return;
        if (!koOk) {
            this.notifyMissingAudioOnce(wordId, false);
            return;
        }

        if (playMeaning) {
            const cnOk = await this.playAudioPartWithFallback(this.cnAudio, current, true, playSeq, wordId, options);
            if (cnOk == null) return;
            if (!cnOk) this.notifyMissingAudioOnce(wordId, true);
        }

        if (!this.canPlayCurrentWordAudio(playSeq, wordId, options)) return;
        this.preloadNextWordAudio();
    },

    tryAutoPronounce() {
        const s = this.data.settings || DEFAULT_SETTINGS;
        if (!s.autoPronounce) return;
        if (this._dualWordAudioBlocked || this.data.dualColumnMode) return;
        // if (!this._hasUserGesture) return;
        const current = this.data.currentWord;
        const currentId = safeWordId(current);
        if (!current || !currentId) return;
        if (this._autoPronouncedWordId === currentId) return;
        this._autoPronouncedWordId = currentId;
        
        if (this._autoPronounceTimer) clearTimeout(this._autoPronounceTimer);
        this._autoPronounceTimer = setTimeout(() => {
            this._autoPronounceTimer = null;
            if (this._dualWordAudioBlocked || this.data.dualColumnMode) return;
            if (!this.data.currentWord || safeWordId(this.data.currentWord) !== currentId) return;
            this.playWordAudio();
	        }, 20);
	    },

    showWordDetail() {
        if (this.data.showWordTooltip) {
             this.dismissWordTooltip();
        }

        const { currentWord } = this.data;
        if (!currentWord) return;

        this.setData({ showDetailModal: true });
        
        // Auto play when opened if enabled
        if (this.data.settings && this.data.settings.autoPlaySentence) {
            this.playSentenceAudio();
        }
    },

    closeDetailModal() {
        this.setData({ showDetailModal: false });
        this._sentenceAudioToken = '';
        this.setData({ sentenceAudioState: '', sentenceAudioIndex: -1 });
        if (this._sentenceAudioCtx) {
            try {
                this._sentenceAudioCtx.stop();
                this._sentenceAudioCtx.destroy();
            } catch (e) {}
            this._sentenceAudioCtx = null;
        }
    },
    
    playSentenceAudio() {
        this.playSentenceAudioForWord(this.data.currentWord, { index: this.data.currentIndex });
    },

    stopSentenceAudioContext(options = {}) {
        const keepToken = !!options.keepToken;
        if (this._sentenceAudioCtx) {
            try {
                this._sentenceAudioCtx.stop();
                this._sentenceAudioCtx.destroy();
            } catch (e) {}
            this._sentenceAudioCtx = null;
        }
        if (!keepToken) {
            this._sentenceAudioToken = '';
            this.setData({ sentenceAudioState: '', sentenceAudioIndex: -1 });
        }
    },

    playSentenceSrcOnce(src, sentenceToken) {
        const playId = Math.random().toString(36).substring(7);
        const logPrefix = `[SentenceSrc:${playId}]`;
        const thisRef = this;
        console.log(logPrefix, 'Start request:', src);

        return new Promise((resolve) => {
            if (!src || this._sentenceAudioToken !== sentenceToken) {
                resolve(false);
                return;
            }

            this.stopSentenceAudioContext({ keepToken: true });

            const audioCtx = wx.createInnerAudioContext();
            audioCtx.autoplay = false;
            audioCtx.obeyMuteSwitch = false;
            try { audioCtx.loop = false; } catch (e) {}
            this._sentenceAudioCtx = audioCtx;

            let settled = false;
            let started = false;
            let playRequested = false;
            let playTimer = null;
            let failTimer = null;

            const isCurrent = () => this._sentenceAudioToken === sentenceToken && this._sentenceAudioCtx === audioCtx;

            const cleanup = () => {
                try { audioCtx.offCanplay && audioCtx.offCanplay(onCanplay); } catch (e) {}
                try { audioCtx.offPlay && audioCtx.offPlay(onPlay); } catch (e) {}
                try { audioCtx.offEnded && audioCtx.offEnded(onEnded); } catch (e) {}
                try { audioCtx.offError && audioCtx.offError(onError); } catch (e) {}
                try { audioCtx.offStop && audioCtx.offStop(onStop); } catch (e) {}
                if (playTimer) clearTimeout(playTimer);
                if (failTimer) clearTimeout(failTimer);
                playTimer = null;
                failTimer = null;
            };

            const settle = (ok) => {
                if (settled) return;
                settled = true;
                cleanup();
                console.log(logPrefix, 'Settled:', ok ? 'Success' : 'Failed');
                if (this._sentenceAudioCtx === audioCtx) {
                    try { audioCtx.destroy(); } catch (e) {}
                    this._sentenceAudioCtx = null;
                }
                resolve(!!ok);
            };

            const attemptPlay = (reason) => {
                if (settled || started || playRequested || !isCurrent()) return;
                playRequested = true;
                try {
                    console.log(logPrefix, 'Calling audioCtx.play()', reason);
                    audioCtx.play();
                } catch (e) {
                    console.warn(logPrefix, 'Play exception:', e);
                    playRequested = false;
                    settle(false);
                }
            };

            function onCanplay() {
                attemptPlay('canplay');
            }

            function onPlay() {
                started = true;
                if (thisRef._sentenceAudioToken === sentenceToken) {
                    thisRef.setData({ sentenceAudioState: 'playing' });
                }
            }

            function onEnded() {
                settle(true);
            }

            function onStop() {
                settle(started);
            }

            function onError(res) {
                console.warn(logPrefix, 'onError:', res);
                settle(started);
            }

            if (audioCtx.onCanplay) audioCtx.onCanplay(onCanplay);
            if (audioCtx.onPlay) audioCtx.onPlay(onPlay);
            audioCtx.onEnded(onEnded);
            audioCtx.onError(onError);
            if (audioCtx.onStop) audioCtx.onStop(onStop);

            try {
                audioCtx.src = src;
            } catch (e) {
                console.warn(logPrefix, 'Set src failed:', e);
                settle(false);
                return;
            }

            // On iOS true devices, immediate play after creating the context can fail with audioInstance is not set.
            playTimer = setTimeout(() => attemptPlay('delayed'), 120);
            failTimer = setTimeout(() => {
                if (!started) settle(false);
            }, 6000);
        });
    },

    async playSentenceAudioForWord(currentWord, options = {}) {
        this.stopSentenceAudioContext();
        const sentence = getDualExampleSentence(currentWord);
        if (!currentWord || !sentence) {
            wx.showToast({ title: '暂无例句音频', icon: 'none' });
            return;
        }
        const sentenceToken = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
        this._sentenceAudioToken = sentenceToken;
        const sentenceIndex = Number.isFinite(Number(options.index)) ? Number(options.index) : -1;
        this.setData({
            sentenceAudioState: 'loading',
            sentenceAudioIndex: sentenceIndex
        });
        
        console.log('[SentenceAudio] Original:', sentence);
        // Replace spaces and punctuation with underscores to match OSS filename format
        // Based on: https://enoss.aorenlan.fun/kr_yonsei_sentence_example/...
        // "감기에 민간요법을 써 봤어요" -> "감기에_민간요법을_써_봤어요"
        const filename = sentence.replace(/[\s\p{P}]+/gu, '_');
        // Handle trailing underscore if any
        const safeFilename = filename.replace(/_+$/, '').replace(/^_+/, '');
        
        console.log('[SentenceAudio] SafeFilename:', safeFilename);

        const toHangulNFD = (s) => {
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
        };

        // Generate candidates (NFD first as per macOS upload, then NFC as fallback)
        // Optimization: Put Manual NFD (toHangulNFD) FIRST as it is the most reliable for OSS files on Android
        const candidates = [];
        try { candidates.push(toHangulNFD(safeFilename)); } catch (e) {}
        try { candidates.push(safeFilename.normalize('NFD')); } catch (e) {}
        try { candidates.push(safeFilename.normalize('NFC')); } catch (e) {}
        candidates.push(safeFilename);
        
        const uniqueNames = Array.from(new Set(candidates));
        // Use manual percent encoding for special characters to ensure compatibility
        // Similar to how buildAudioUrls handles it
        const percentEncodeUtf8 = (input) => {
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
        };

        const urls = uniqueNames.map(name => 
            `https://enoss.aorenlan.fun/kr_yonsei_sentence_example/${percentEncodeUtf8(name)}.mp3`
        );
        
        console.log('[SentenceAudio] Candidates:', uniqueNames);
        console.log('[SentenceAudio] URLs:', urls);

        const isCurrentSentenceAudio = () => this._sentenceAudioToken === sentenceToken;
        const sentenceHash = hashAudioCacheText(sentence);
        const sentenceOssCacheKey = `sentence_oss__${sentenceHash}`;
        const sentenceTtsCacheKey = `sentence_tts__${sentenceHash}`;

        try {
            let result = false;
            if (!this._sentenceOssMissingKeys) this._sentenceOssMissingKeys = new Set();
            const skipOss = this._sentenceOssMissingKeys.has(sentenceOssCacheKey);

            if (!skipOss) {
                const ossSrc = this.getAudioFileFromLRU(sentenceOssCacheKey)
                    || await this.downloadAudioToLRU(sentenceOssCacheKey, urls);
                if (!isCurrentSentenceAudio()) return;
                if (ossSrc) {
                    result = await this.playSentenceSrcOnce(ossSrc, sentenceToken);
                } else {
                    this._sentenceOssMissingKeys.add(sentenceOssCacheKey);
                }
            }

            if (!result) {
                const hasHangul = /[\uac00-\ud7a3\u1100-\u11ff]/.test(sentence);
                const hasCjk = /[\u3400-\u9fff]/.test(sentence);
                const lang = hasHangul ? 'ko-KR' : (hasCjk ? 'zh-CN' : 'ko-KR');
                let edgeSrc = this.getCachedEdgeTtsFile(sentenceTtsCacheKey, sentence, lang);
                if (!edgeSrc) edgeSrc = await this.fetchEdgeTtsToLRU(sentenceTtsCacheKey, sentence, lang);
                if (!isCurrentSentenceAudio()) return;
                if (!edgeSrc) edgeSrc = await this.fetchEdgeTtsToLRU(sentenceTtsCacheKey, sentence, lang, true);
                if (!isCurrentSentenceAudio()) return;
                result = edgeSrc ? await this.playSentenceSrcOnce(edgeSrc, sentenceToken) : false;
            }

            if (!isCurrentSentenceAudio()) return;
            if (!result) {
                wx.showToast({ title: '例句音频暂不可用', icon: 'none' });
            }
        } catch (e) {
            console.warn('[SentenceAudio] play failed:', e);
            if (isCurrentSentenceAudio()) {
                wx.showToast({ title: '例句音频暂不可用', icon: 'none' });
            }
        } finally {
            if (this._sentenceAudioToken === sentenceToken && !this._sentenceAudioCtx) {
                this._sentenceAudioToken = '';
                this.setData({ sentenceAudioState: '', sentenceAudioIndex: -1 });
            }
        }
    },

    toggleKeyboard() {
        const isOpening = !this.data.isKeyboardOpen;
        this.setData({ isKeyboardOpen: isOpening, showGuideBubble: false });

        if (isOpening) {
                const settingsTipKey = 'kr_practice_settings_tooltip_shown_v1';
                const hasShown = wx.getStorageSync(settingsTipKey);
                
                if (!hasShown) {
                    this.setData({
                        showSettingsTooltip: true,
                        settingsTooltipText: '点击修改键盘设置'
                    });
                    try {
                        wx.setStorageSync(settingsTipKey, true);
                    } catch (e) {
                        console.error('Storage error:', e);
                    }
                    
                    if (this._settingsTooltipTimer) clearTimeout(this._settingsTooltipTimer);
                    this._settingsTooltipTimer = setTimeout(() => {
                        this.setData({ showSettingsTooltip: false });
                    }, 2000);
                }
            }
    },

    onShareAppMessage(res) {
        const shareType = res && res.target && res.target.dataset && res.target.dataset.shareType;
        if (shareType === 'sleep' || this.data.sleepFocusOpen) {
            return {
                title: '睡不着？来听单词助眠',
                path: '/pages/nv-practice/index?from=sleep',
                imageUrl: this.data.shareImagePath || ''
            };
        }

        const word = (this.data.currentWord && this.data.currentWord.word) || '韩语单词';
        const meaning = (this.data.currentWord && this.data.currentWord.meaning) || 'Korean Practice';
        const path = '/pages/nv-practice/index';
        
        return {
            title: `${word} - ${meaning}`,
            path: path,
            imageUrl: this.data.shareImagePath || ''
        };
    },

    onShareTimeline() {
        if (this.data.sleepFocusOpen) {
            return {
                 title: '睡不着？来听单词助眠',
                 imageUrl: this.data.shareImagePath || ''
            };
        }

        const word = (this.data.currentWord && this.data.currentWord.word) || '韩语单词';
        return {
             title: `我在练习：${word}`,
             imageUrl: this.data.shareImagePath || ''
        };
    },

    drawShareImage() {
        if (!this.data.currentWord) return;
        const query = this.createSelectorQuery();
        query.select('#shareCanvas')
            .fields({ node: true, size: true })
            .exec((res) => {
                if (!res[0] || !res[0].node) return;
                const canvas = res[0].node;
                const ctx = canvas.getContext('2d');
                const dpr = wx.getSystemInfoSync().pixelRatio;
                
                const width = res[0].width;
                const height = res[0].height;
                canvas.width = width * dpr;
                canvas.height = height * dpr;
                ctx.scale(dpr, dpr);
                
                // Draw Background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                
                // Draw Word (Korean)
                const word = this.data.currentWord.word;
                ctx.fillStyle = '#1e293b'; 
                ctx.font = 'bold 48px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(word, width / 2, height / 2 - 20);
                
                // Draw Meaning
                const meaning = this.data.currentWord.meaning;
                ctx.fillStyle = '#64748b';
                ctx.font = '24px sans-serif';
                ctx.fillText(meaning, width / 2, height / 2 + 40);
                
                // Draw Footer
                ctx.fillStyle = '#94a3b8';
                ctx.font = '14px sans-serif';
                ctx.fillText('韩语打字练习', width / 2, height - 20);
                
                wx.canvasToTempFilePath({
                    canvas: canvas,
                    success: (res) => {
                        this.setData({ shareImagePath: res.tempFilePath });
                    },
                    fail: (err) => {
                        console.error('Canvas export failed', err);
                    }
                });
            });
    },

    toggleFocusMode() {
        // Toggle Nagging Mode (Focus Mode)
        const isNagging = !this.data.isNaggingMode;
        
        // Update local state
        this.setData({ isNaggingMode: isNagging });

        if (isNagging) {
             wx.hideKeyboard(); // Hide keyboard when entering Focus Mode
             this.setData({ isKeyboardOpen: false }); // Ensure UI state reflects closed keyboard
        }
        
        // Sync with settings if needed, or just keep it as a temporary state
        // The user asked for "Nagging Mode" in settings and "Focus" button.
        // Let's keep settings in sync so the switch reflects the state.
        const newSettings = Object.assign({}, this.data.settings || {});
        newSettings.naggingMode = isNagging;
        this.setData({ settings: newSettings });
        
        if (isNagging) {
            this.startNaggingLoop();
        } else {
            this.stopNaggingLoop();
        }
    },

    toggleNaggingStyle() {
        const next = this.data.naggingStyle === 'scatter' ? 'flow' : 'scatter';
        this.setData({ naggingStyle: next });
        
        // Restart loop to apply new style (clear screen)
        if (this.data.isNaggingMode) {
            this.startNaggingLoop();
        }
    },

    getNaggingRepeatLimit() {
        const raw = Number((this.data.settings && this.data.settings.naggingRepeatCount) || DEFAULT_SETTINGS.naggingRepeatCount);
        if (!Number.isFinite(raw)) return DEFAULT_SETTINGS.naggingRepeatCount;
        return Math.max(NAGGING_REPEAT_MIN, Math.min(NAGGING_REPEAT_MAX, Math.round(raw)));
    },

    startNaggingLoop() {
        this.stopNaggingLoop(); // Clear previous state
        
        const currentWord = this._currentWordRuntime || this.data.currentWord;
        if (!currentWord) return;

        this.setData({
            naggingItems: [],
            naggingRepeatProgress: 0
        });
        
        // Start Loop
        this._naggingLoopId = (this._naggingLoopId || 0) + 1;
        this.naggingAudioLoop(this._naggingLoopId);
    },

    stopNaggingLoop() {
        // Invalidate any running loop
        this._naggingLoopId = (this._naggingLoopId || 0) + 1;
        
        if (this.naggingTimer) clearTimeout(this.naggingTimer);
        this.naggingTimer = null;
        this.setData({
            naggingItems: [],
            naggingRepeatProgress: 0
        });
        this.cancelCurrentAudioPlayback();
    },

    async naggingAudioLoop(loopId) {
        if (!this.data.isNaggingMode) return;
        if (loopId !== this._naggingLoopId) return;
        
        // Add Visual Item (Read one, Appear one)
        const added = this.addNaggingItem();
        if (!added) return;

        try {
            const progress = Number(this.data.naggingRepeatProgress || 0);
            const currentWord = this._currentWordRuntime || this.data.currentWord;
            await this.playNaggingAudioForCurrent(currentWord, progress <= 1, loopId);
        } catch (e) {
            console.error('Nagging loop audio error', e);
            // Safety delay on error
            await new Promise(r => setTimeout(r, 1000));
        }

        // Check if loop is still valid after await
        if (loopId !== this._naggingLoopId) return;

        const progress = Number(this.data.naggingRepeatProgress || 0);
        const repeatLimit = this.getNaggingRepeatLimit();
        if (progress >= repeatLimit) {
            this.scheduleNextNaggingWord(loopId);
            return;
        }

        if (this.data.isNaggingMode) {
            // Yield to UI thread to prevent blocking (Allow taps/exits)
            await new Promise(r => setTimeout(r, 50));
            // Check again after yield
            if (loopId !== this._naggingLoopId) return;
            
            this.naggingAudioLoop(loopId);
        }
    },

    async playNaggingAudioForCurrent(currentWord, isChinese, loopId) {
        if (!this.data.isNaggingMode || loopId !== this._naggingLoopId) return null;
        if (!currentWord || !currentWord.word) return false;
        this._hasUserGesture = true;
        this.ensureAudioContexts();
        this._hasPlayedAudioOnce = true;

        const playSeq = this.cancelCurrentAudioPlayback();
        const wordId = safeWordId(currentWord);
        const ctx = isChinese ? this.cnAudio : this.wordAudio;
        const ok = await this.playAudioPartWithFallback(ctx, currentWord, isChinese, playSeq, wordId, { allowInDual: true });
        if (!this.data.isNaggingMode || loopId !== this._naggingLoopId) return null;
        if (!ok) this.notifyMissingAudioOnce(wordId, !!isChinese);
        return ok;
    },

    scheduleNextNaggingWord(loopId) {
        if (!this.data.isNaggingMode || loopId !== this._naggingLoopId) return;
        if (this.naggingTimer) clearTimeout(this.naggingTimer);
        this.naggingTimer = setTimeout(() => {
            this.naggingTimer = null;
            if (!this.data.isNaggingMode || loopId !== this._naggingLoopId) return;
            this.nextWord();
            setTimeout(() => {
                if (this.data.isNaggingMode && loopId === this._naggingLoopId) {
                    this.startNaggingLoop();
                }
            }, 120);
        }, 260);
    },

    addNaggingItem() {
        const items = this.data.naggingItems || [];
        const repeatLimit = this.getNaggingRepeatLimit();
        if (items.length >= repeatLimit) return false;

        const currentWord = this._currentWordRuntime || this.data.currentWord;
        if (!currentWord) return false;
        const style = this.data.naggingStyle;
        
        const newItem = {
            id: Date.now() + Math.random(), // Unique ID
            word: currentWord.word,
        };

        if (style === 'scatter') {
            newItem.top = Math.floor(Math.random() * 90) + 5;
            newItem.left = Math.floor(Math.random() * 90) + 5;
            newItem.fontSize = Math.floor(Math.random() * 30) + 20;
            newItem.rotate = Math.floor(Math.random() * 90) - 45;
        }
        
        // Flow mode doesn't need extra props, CSS handles it
        
        items.push(newItem);
        this.setData({
            naggingItems: items,
            naggingRepeatProgress: items.length
        });
        return true;
    }

});
