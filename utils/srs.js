/**
 * SRS (Spaced Repetition System) - SM-2 算法
 * 只有两个评分：掌握(right) / 没记住(wrong)
 */

const SRS_KEY = 'flashflow_srs';
const SRS_DAILY_KEY = 'flashflow_srs_daily';
const DAILY_LIMIT = 10;

// ---- SM-2 核心计算 ----
function calcNext(card, remembered) {
  const now = Date.now();
  if (!remembered) {
    // 没记住：重置，明天再来
    return Object.assign({}, card, {
      interval: 1,
      reviewCount: 0,
      easeFactor: Math.max(1.3, card.easeFactor - 0.2),
      nextReview: now + 1 * 86400000,
      lastReview: now,
    });
  }
  // 掌握：SM-2 标准递增
  let interval;
  if (card.reviewCount === 0) interval = 1;
  else if (card.reviewCount === 1) interval = 6;
  else interval = Math.round(card.interval * card.easeFactor);

  const easeFactor = Math.max(1.3, card.easeFactor + 0.1);
  return Object.assign({}, card, {
    interval,
    reviewCount: card.reviewCount + 1,
    easeFactor,
    nextReview: now + interval * 86400000,
    lastReview: now,
  });
}

// ---- Storage 读写 ----
function readAll() {
  try {
    return wx.getStorageSync(SRS_KEY) || {};
  } catch (e) { return {}; }
}

function saveAll(data) {
  try { wx.setStorageSync(SRS_KEY, data); } catch (e) {}
}

function readDaily() {
  try {
    const d = wx.getStorageSync(SRS_DAILY_KEY);
    const today = todayStr();
    if (d && d.date === today) return d;
    return { date: today, reviewed: [] };
  } catch (e) {
    return { date: todayStr(), reviewed: [] };
  }
}

function saveDaily(d) {
  try { wx.setStorageSync(SRS_DAILY_KEY, d); } catch (e) {}
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ---- 对外接口 ----

/**
 * 记录一个单词已学习（首次学习时调用）
 */
function recordLearned(wordKey, wordData) {
  const all = readAll();
  if (all[wordKey]) return; // 已存在，不覆盖
  all[wordKey] = {
    word: wordData.word || '',
    meaning: wordData.meaning || '',
    phonetic: wordData.phonetic || '',
    category: wordData.category || '',
    lessonId: wordData.lessonId || '',
    easeFactor: 2.5,
    interval: 1,
    reviewCount: 0,
    nextReview: Date.now() + 1 * 86400000, // 明天第一次复习
    lastReview: 0,
    learnedAt: Date.now(),
  };
  saveAll(all);
}

/**
 * 获取今日待复习列表（最多 DAILY_LIMIT 个）
 * 排序：nextReview asc → reviewCount asc → learnedAt asc
 */
function getTodayReviewList() {
  const all = readAll();
  const daily = readDaily();
  const now = Date.now();

  const due = Object.entries(all)
    .filter(([key, card]) => {
      return card.nextReview <= now && !daily.reviewed.includes(key);
    })
    .sort(([, a], [, b]) => {
      if (a.nextReview !== b.nextReview) return a.nextReview - b.nextReview;
      if (a.reviewCount !== b.reviewCount) return a.reviewCount - b.reviewCount;
      return a.learnedAt - b.learnedAt;
    })
    .slice(0, DAILY_LIMIT)
    .map(([key, card]) => ({ key, ...card }));

  return due;
}

/**
 * 今日待复习数量（用于首页入口展示）
 */
function getTodayCount() {
  return getTodayReviewList().length;
}

/**
 * 今日是否已完成复习
 */
function isTodayDone() {
  const daily = readDaily();
  // 待复习为0，或今日已复习数 >= DAILY_LIMIT
  return getTodayReviewList().length === 0 && daily.reviewed.length > 0;
}

/**
 * 提交一张卡片的复习结果
 * remembered: true=掌握, false=没记住
 */
function submitReview(wordKey, remembered) {
  const all = readAll();
  if (!all[wordKey]) return;
  all[wordKey] = calcNext(all[wordKey], remembered);
  saveAll(all);

  // 记录今日已复习
  const daily = readDaily();
  if (!daily.reviewed.includes(wordKey)) {
    daily.reviewed.push(wordKey);
  }
  saveDaily(daily);
}

module.exports = {
  recordLearned,
  getTodayReviewList,
  getTodayCount,
  isTodayDone,
  submitReview,
  DAILY_LIMIT,
};
