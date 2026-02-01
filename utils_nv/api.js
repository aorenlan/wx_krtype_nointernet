
const dataCache = new Map();

const getData = async (key) => {
    if (dataCache.has(key)) return dataCache.get(key);
    try {
        let rawData = null;
        switch (key) {
            case 'TOPIK Vocabulary': rawData = await require.async('../subpackages/grammar/data/all_topik_vocabulary.js'); break;
            case 'Yonsei 1': rawData = await require.async('../subpackages/grammar/data/yonsei_vocabulary_1.js'); break;
            case 'Yonsei 2': rawData = await require.async('../subpackages/grammar/data/yonsei_vocabulary_2.js'); break;
            case 'Yonsei 3': rawData = await require.async('../subpackages/grammar/data/yonsei_vocabulary_3.js'); break;
            case 'Yonsei 4': rawData = await require.async('../subpackages/grammar/data/yonsei_vocabulary_4.js'); break;
            case 'Mistakes (错题本)': rawData = []; break;
            case 'Yonsei 5': rawData = await require.async('../subpackages/grammar/data/yonsei_vocabulary_5.js'); break;
            case 'Yonsei 6': rawData = await require.async('../subpackages/grammar/data/yonsei_vocabulary_6.js'); break;
            default: 
                rawData = [];
        }

        // Hydrate data if it's in compressed format { keys: [], values: [] }
        let data = [];
        if (Array.isArray(rawData)) {
            data = rawData;
        } else if (rawData && rawData.keys && rawData.values) {
            const { keys, values } = rawData;
            data = values.map(row => {
                const obj = {};
                keys.forEach((k, i) => {
                    obj[k] = row[i];
                });
                return obj;
            });
        }

        // Validate data category to prevent cache poisoning or mismatch
        if (Array.isArray(data) && data.length > 0 && /^Yonsei\s+\d$/.test(key)) {
            const firstItem = data[0];
            if (firstItem && firstItem.category && firstItem.category !== key) {
                console.warn(`[API] Data mismatch for key ${key}. Got data for ${firstItem.category}`);
                // If mismatch, do not cache, and return empty or try to recover?
                // For now, let's just log it. If it happens, we know the root cause.
                // But to fix the user issue, we should probably NOT return this data if it's wrong.
                if (firstItem.category.startsWith('Yonsei')) {
                    // Critical mismatch between Yonsei versions
                    return [];
                }
            }
        }

        if (Array.isArray(data)) {
            dataCache.set(key, data);
        }
        return data || [];
    } catch (e) {
        console.error('Failed to load data for key:', key, e);
        return [];
    }
};

const CATEGORIES = [
    'Yonsei 1',
    'Yonsei 2',
    'Yonsei 3',
    'Yonsei 4',
    'Yonsei 5',
    'Yonsei 6',
    'TOPIK Vocabulary'
];

let topikLevelsCache = null;
const topikSessionsCache = new Map();
const yonseiLessonsCache = new Map();

export const getCategories = async () => {
    return Array.isArray(CATEGORIES) ? [...CATEGORIES] : [];
};

export const getTopikLevels = async () => {
    if (Array.isArray(topikLevelsCache)) return topikLevelsCache;
    const data = await getData('TOPIK Vocabulary');
    const levels = new Set();
    (data || []).forEach((item) => {
        const raw = item && item.category ? String(item.category) : '';
        const m = raw.match(/^TOPIK\s*(\d)$/i) || raw.match(/^TOPIK(\d)$/i);
        if (m && m[1]) levels.add(m[1]);
    });
    topikLevelsCache = Array.from(levels).sort((a, b) => Number(a) - Number(b));
    if (topikLevelsCache.length === 0) {
        topikLevelsCache = ['1', '2', '3', '4', '5', '6'];
    }
    return topikLevelsCache;
};

export const getTopikSessions = async (level) => {
    const lv = String(level || '').trim();
    const cacheKey = lv || '__ALL__';
    if (topikSessionsCache.has(cacheKey)) return topikSessionsCache.get(cacheKey);

    let words = await getData('TOPIK Vocabulary') || [];
    if (lv) {
        const normalizedLevel = lv.replace(/\s+/g, '');
        words = words.filter((w) => {
            const cat = w && w.category ? String(w.category) : '';
            const normalized = cat.replace(/\s+/g, '').toUpperCase();
            return normalized === `TOPIK${normalizedLevel}`.toUpperCase();
        });
    }

    const sessionsSet = new Set();
    words.forEach((item) => {
        const s = item && item.session != null ? String(item.session).trim() : '';
        if (s) sessionsSet.add(s);
    });

    const sessions = Array.from(sessionsSet).sort((a, b) => {
        const na = Number((a.match(/\d+/) || [])[0]);
        const nb = Number((b.match(/\d+/) || [])[0]);
        if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
        return a.localeCompare(b, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
    });

    topikSessionsCache.set(cacheKey, sessions);
    return sessions;
};

export const getYonseiLessons = async (category) => {
    if (!category || !/^Yonsei\s+\d$/.test(category)) return [];
    if (yonseiLessonsCache.has(category)) return yonseiLessonsCache.get(category);
    const data = await getData(category);
    const map = new Map();
    (data || []).forEach((item) => {
        const id = item && item.lesson_id != null ? String(item.lesson_id) : '';
        if (!id) return;
        if (!map.has(id)) {
            map.set(id, {
                id,
                name: item.lesson_name ? String(item.lesson_name) : '',
                original: item.original_lesson ? String(item.original_lesson) : ''
            });
        }
    });
    const lessons = Array.from(map.values()).sort((a, b) => Number(a.id) - Number(b.id));

    yonseiLessonsCache.set(category, lessons);
    return lessons;
};

export const getCategoryCounts = async () => {
    const counts = {};
    for (const key of CATEGORIES) {
        const data = await getData(key);
        counts[key] = data ? data.length : 0;
    }
    return counts;
};

export const getWords = async (category, limit = 50, offset = 0, filters) => {
    let words = [];
    if (category === 'Mistakes (错题本)') {
         return { words: [], total: 0 };
    } 
    
    words = await getData(category);
    if (!words || words.length === 0) {
        if (category === 'TOPIK Vocabulary') return { words: [], total: 0 };
        words = await getData('TOPIK Vocabulary');
    }

    if (filters) {
        if (filters.topikLevel && category === 'TOPIK Vocabulary') {
            const level = String(filters.topikLevel);
            words = words.filter(w => {
                const cat = w && w.category ? String(w.category) : '';
                const normalized = cat.replace(/\s+/g, '').toUpperCase();
                return normalized === `TOPIK${level}`.toUpperCase();
            });
        }
        if (filters.topikSession && category === 'TOPIK Vocabulary') {
            const session = String(filters.topikSession).trim();
            words = words.filter(w => {
                const s = w && w.session != null ? String(w.session).trim() : '';
                return s === session;
            });
        }
        if (filters.lessonId && /^Yonsei\s+\d$/.test(category)) {
            const lessonId = String(filters.lessonId);
            words = words.filter(w => w && String(w.lesson_id) === lessonId);
        }
        if (filters.wordId) {
            const wordId = String(filters.wordId);
            words = words.filter(w => {
                const id = w && (w.global_id || w.id) != null ? String(w.global_id || w.id) : '';
                const rawId = w && w.id != null ? String(w.id) : '';
                return id === wordId || rawId === wordId;
            });
        }
        if (filters.minLength) {
             words = words.filter(w => w.korean && w.korean.length >= filters.minLength);
        }
        if (filters.maxLength) {
             words = words.filter(w => w.korean && w.korean.length <= filters.maxLength);
        }
        if (filters.firstLetter) {
             words = words.filter(w => w.korean && w.korean.startsWith(filters.firstLetter));
        }
    }

    const total = words.length;
    const sliced = words.slice(offset, offset + limit);

    const mappedWords = sliced.map(item => ({
        id: item.global_id || item.id,
        word: item.korean,
        meaning: item.chinese,
        sourceCategory: item.category || '',
        lessonId: item.lesson_id || item.session || '',
        lessonName: item.lesson_name || item.original_lesson || '',
        example_sentence: item.example_sentence || '', 
        sentence_translation: item.sentence_translation || '',
        sentence_grammar: item.sentence_grammar || '',
        phonetic: ''
    }));

    return { words: mappedWords, total };
};

export const getLengthStats = async (category) => {
    return {};
};

export const getLetterStats = async (category) => {
    return {};
};

export const searchWordExact = async (word) => {
    for (const key of CATEGORIES) {
        const data = await getData(key);
        const found = data.find(w => w.korean === word);
        if (found) {
            return {
                id: found.global_id || found.id,
                word: found.korean,
                meaning: found.chinese
            };
        }
    }
    return null;
};

export const batchGetWords = async (ids) => {
    const results = [];
    for (const key of CATEGORIES) {
        const data = await getData(key);
        const found = data.filter(w => ids.includes(w.global_id || w.id));
        results.push(...found.map(item => ({
            id: item.global_id || item.id,
            word: item.korean,
            meaning: item.chinese
        })));
    }
    return results;
};

export const getGrammars = async (category, lessonId) => {
    try {
        const rawData = await require.async('../subpackages/grammar/data/yonsei_grammar.js');
        if (!rawData) return [];
        
        let data = [];
        if (Array.isArray(rawData)) {
            data = rawData;
        } else if (rawData && rawData.keys && rawData.values) {
            const { keys, values } = rawData;
            data = values.map(row => {
                const obj = {};
                keys.forEach((k, i) => {
                    obj[k] = row[i];
                });
                return obj;
            });
        }
        
        let filtered = data;
        if (category) {
             filtered = filtered.filter(item => item.category === category);
        }
        if (lessonId) {
             filtered = filtered.filter(item => String(item.lesson_id) === String(lessonId));
        }
        return filtered;
    } catch (e) {
        console.error('Failed to load grammar', e);
        return [];
    }
};
