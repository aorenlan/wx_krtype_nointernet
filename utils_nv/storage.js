const STORAGE_KEY = 'flashflow_imported_lists';
const MISTAKES_KEY = 'flashflow_mistakes';
const WORDS_CACHE_KEY_PREFIX = 'flashflow_words_cache_';
const PROGRESS_KEY_PREFIX = 'flashflow_progress_';

export const getImportedLists = () => {
  const raw = wx.getStorageSync(STORAGE_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.map((l) => {
    if (!l || typeof l !== 'object') return null;
    const words = Array.isArray(l.words) ? l.words : [];
    return { ...l, words };
  }).filter(Boolean);
};

export const getCachedWords = (category, filters) => {
    const key = getCacheKey(category, filters);
    return wx.getStorageSync(key) || null;
};

export const setCachedWords = (category, filters, words) => {
    const key = getCacheKey(category, filters);
    wx.setStorageSync(key, words);
};

const getCacheKey = (category, filters) => {
    let key = `${WORDS_CACHE_KEY_PREFIX}${category}`;
    if (filters) {
        if (filters.minLength) key += `_len${filters.minLength}`;
        if (filters.firstLetter) key += `_let${filters.firstLetter}`;
    }
    return key;
};

export const getMistakes = () => {
  const raw = wx.getStorageSync(MISTAKES_KEY);
  return Array.isArray(raw) ? raw : [];
};

export const saveMistake = (word) => {
    try {
        const mistakes = getMistakes();
        const incomingId = word && word.id != null ? String(word.id) : '';
        const incomingWord = word && word.word != null ? String(word.word).trim() : '';
        if (!incomingId && !incomingWord) {
            return { success: false, message: 'Invalid word' };
        }
        if (mistakes.some(w => (incomingId && w && w.id != null && String(w.id) === incomingId) || (incomingWord && w && w.word != null && String(w.word).trim() === incomingWord))) {
            return { success: true };
        }
        const newMistake = { ...word, addedAt: Date.now() };
        mistakes.unshift(newMistake);
        wx.setStorageSync(MISTAKES_KEY, mistakes.slice(0, 100));
        return { success: true };
    } catch (e) {
        console.error('Save mistake error:', e);
        return { success: false, message: e.message };
    }
};

export const removeMistake = (wordId) => {
    try {
        const targetId = wordId != null ? String(wordId) : '';
        if (!targetId) return { success: false, message: 'Invalid wordId' };
        const mistakes = getMistakes();
        const newMistakes = mistakes.filter(w => !(w && w.id != null && String(w.id) === targetId));
        wx.setStorageSync(MISTAKES_KEY, newMistakes);
        return { success: true };
    } catch (e) {
        console.error('Remove mistake error:', e);
        return { success: false, message: e.message };
    }
};

export const saveImportedList = (name, words) => {
  try {
    const lists = getImportedLists();
    if (lists.length >= 10) {
      return { success: false, message: '最多只能创建10个词单' };
    }
    const newList = {
      id: Date.now().toString(),
      name,
      words,
      createdAt: Date.now()
    };
    lists.unshift(newList);
    wx.setStorageSync(STORAGE_KEY, lists);
    return { success: true, list: newList };
  } catch (e) {
    console.error('Save list error:', e);
    return { success: false, message: '保存失败: ' + e.message };
  }
};

export const updateImportedList = (id, name, words) => {
  try {
    const lists = getImportedLists();
    const index = lists.findIndex(l => l.id === id);
    if (index === -1) return { success: false, message: 'List not found' };
    
    lists[index] = { ...lists[index], name, words, updatedAt: Date.now() };
    wx.setStorageSync(STORAGE_KEY, lists);
    return { success: true };
  } catch (e) {
    console.error('Update list error:', e);
    return { success: false, message: '更新失败: ' + e.message };
  }
};

export const deleteImportedList = (id) => {
  try {
    const lists = getImportedLists();
    const newLists = lists.filter(l => l.id !== id);
    wx.setStorageSync(STORAGE_KEY, newLists);
    return { success: true };
  } catch (e) {
    console.error('Delete list error:', e);
    return { success: false, message: '删除失败: ' + e.message };
  }
};

export const saveProgress = (category, index) => {
    try {
        const key = `${PROGRESS_KEY_PREFIX}${category}`;
        wx.setStorageSync(key, index);
        wx.setStorageSync('flashflow_last_progress', { category, index });
    } catch (e) {
        console.error('Save progress error:', e);
    }
};

export const saveProgressV2 = (category, subKey, index) => {
    try {
        const safeCategory = String(category || '');
        const safeSubKey = String(subKey || '');
        const key = `${PROGRESS_KEY_PREFIX}${safeCategory}__${safeSubKey}`;
        wx.setStorageSync(key, index);
        wx.setStorageSync('flashflow_last_progress', { category: safeCategory, subKey: safeSubKey, index });
    } catch (e) {
        console.error('Save progress error:', e);
    }
};

export const getProgress = (category, subKey) => {
    try {
        if (subKey != null) {
            const safeCategory = String(category || '');
            const safeSubKey = String(subKey || '');
            const keyV2 = `${PROGRESS_KEY_PREFIX}${safeCategory}__${safeSubKey}`;
            const v2 = wx.getStorageSync(keyV2);
            if (typeof v2 === 'number') return v2;
            if (typeof v2 === 'string' && v2 !== '') {
                const n = Number(v2);
                if (Number.isFinite(n)) return n;
            }
        }

        const key = `${PROGRESS_KEY_PREFIX}${category}`;
        return wx.getStorageSync(key) || 0;
    } catch (e) {
        return 0;
    }
};

export const getLastProgress = () => {
    return wx.getStorageSync('flashflow_last_progress') || null;
};
