const LAST_GRAMMAR_TARGET_KEY = 'lastGrammarTarget';
const FALLBACK_GRAMMAR_BOOK = 'Yonsei 2';

function normalizeYonseiBook(value) {
  const text = String(value || '').trim();
  const match = text.match(/^Yonsei\s*(\d)$/i);
  return match ? `Yonsei ${match[1]}` : '';
}

async function pickFirstLesson(book) {
  try {
    const { getYonseiLessons } = require('../utils_nv/api.js');
    const lessons = await getYonseiLessons(book);
    if (lessons && lessons.length > 0) {
      return String(lessons[0].id || '').trim();
    }
  } catch (err) {
    console.error('Auto fetch grammar lesson failed', err);
  }
  return '';
}

async function buildGrammarTargetUrl() {
  const settings = wx.getStorageSync('settings') || {};
  const lastTarget = wx.getStorageSync(LAST_GRAMMAR_TARGET_KEY) || {};
  const currentBook = normalizeYonseiBook(settings.category);
  const savedBook = normalizeYonseiBook(lastTarget.book);
  const book = currentBook || savedBook || FALLBACK_GRAMMAR_BOOK;

  let lessonId = '';
  if (currentBook) {
    lessonId = String(settings.yonseiLessonId || '').trim();
  }
  if (!lessonId && savedBook === book) {
    lessonId = String(lastTarget.lessonId || '').trim();
  }
  if (!lessonId) {
    lessonId = await pickFirstLesson(book);
  }

  wx.setStorageSync(LAST_GRAMMAR_TARGET_KEY, { book, lessonId });

  const params = [`book=${encodeURIComponent(book)}`];
  if (lessonId) params.push(`lessonId=${encodeURIComponent(lessonId)}`);
  return `/subpackages/grammar/pages/index/index?${params.join('&')}`;
}

module.exports = {
  buildGrammarTargetUrl,
  normalizeYonseiBook
};
