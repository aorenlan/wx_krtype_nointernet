import { addHiLiaoChat, addHiLiaoChatQuotaBonus, backfillHiLiaoChatCloudWriteQueueFromLocal, consumeHiLiaoChatQuotaOnce, enqueueHiLiaoChatCloudWrite, fetchHiLiaoFeedCloudSmart, flushHiLiaoChatCloudWriteQueue, getHiLiaoChatCloudWriteLastError, getHiLiaoChatCloudWriteQueueCount, getHiLiaoChatQuotaState, getHiLiaoChats, getHiLiaoDeviceId, getHiLiaoNickname, mergeHiLiaoChats, upsertHiLiaoChat } from '../../utils_nv/storage';

const formatTime = (ts) => {
  const date = new Date(Number(ts) || Date.now());
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}/${d}`;
};

const createKbdLogger = (ctx) => {
  return (event, payload) => {
    try {
      if (!ctx || !ctx._kbdDebugEnabled) return;
      const now = Date.now();
      if (!ctx._kbdDebugCount) ctx._kbdDebugCount = 0;
      if (!ctx._kbdDebugLastLogAt) ctx._kbdDebugLastLogAt = 0;
      if (!ctx._kbdDebugLastGeoAt) ctx._kbdDebugLastGeoAt = 0;
      if (ctx._kbdDebugCount >= 40) return;
      if (String(event) === 'geo') {
        if (now - ctx._kbdDebugLastGeoAt < 60) return;
        ctx._kbdDebugLastGeoAt = now;
      } else {
        if (now - ctx._kbdDebugLastLogAt < 180) return;
        ctx._kbdDebugLastLogAt = now;
      }
      ctx._kbdDebugCount += 1;
      console.log('[hi-chat][kbd]', event, payload || {});
    } catch (e) {}
  };
};

const normalizeBubbleText = (text) => {
  const raw = String(text || '').replace(/\r/g, '').trim();
  if (!raw) return '';
  if (!raw.includes('\n')) return raw;
  const lines = raw.split('\n').map((s) => String(s).trim()).filter(Boolean);
  if (lines.length <= 1) return raw;
  let maxLen = 0;
  let totalLen = 0;
  for (const l of lines) {
    totalLen += l.length;
    if (l.length > maxLen) maxLen = l.length;
  }
  if (lines.length >= 3 && maxLen <= 6) return lines.join('');
  return lines.join(' ').replace(/\s+/g, ' ').trim();
};


const normalizeHonorificType = (value) => {
  const raw = value != null ? String(value).trim() : '';
  if (raw === '平语') return '平语';
  return '敬语';
};

const isChineseOrEnglishText = (text) => {
  const raw = String(text || '');
  if (!raw.trim()) return false;
  const disallowed = /[^\u3400-\u4DBF\u4E00-\u9FFF A-Za-z0-9\s.,!?;:'"()\-–—_+&@#%*/\\，。！？；：“”‘’（）【】《》、…·]/;
  return !disallowed.test(raw);
};

const showToastSafe = (title) => {
  try {
    wx.showToast({ title: String(title || ''), icon: 'none' });
    return true;
  } catch (e) {
    try {
      console.error('[hi-chat] toast fail', { title }, e);
    } catch (err) {}
    return false;
  }
};

const showModalSafe = ({ title, content, showCancel, confirmText, cancelText, success, fail, complete } = {}) => {
  try {
    wx.showModal({
      title: String(title || ''),
      content: String(content || ''),
      showCancel: showCancel !== false,
      confirmText: confirmText != null ? String(confirmText) : undefined,
      cancelText: cancelText != null ? String(cancelText) : undefined,
      success: (res) => {
        try {
          if (typeof success === 'function') success(res);
        } catch (e) {}
      },
      fail: (err) => {
        try {
          console.error('[hi-chat] modal fail', { title, content, err: err && err.errMsg != null ? String(err.errMsg) : String(err) });
        } catch (e) {}
        try {
          if (typeof fail === 'function') fail(err);
        } catch (e) {}
      },
      complete: (res) => {
        try {
          if (typeof complete === 'function') complete(res);
        } catch (e) {}
      }
    });
    return true;
  } catch (e) {
    try {
      console.error('[hi-chat] modal fail', { title, content }, e);
    } catch (err) {}
    return false;
  }
};

const pickWxErrMessage = (e) => {
  const msg =
    (e && e.message != null ? String(e.message) : '')
    || (e && e.errMsg != null ? String(e.errMsg) : '')
    || (e && e.errMsg != null ? String(e.errMsg) : '')
    || (e != null ? String(e) : '');
  return msg.trim();
};


const createAiModel = () => {
  try {
    const ai = wx.cloud && wx.cloud.extend && wx.cloud.extend.AI;
    if (!ai || typeof ai.createModel !== 'function') return null;
    return ai.createModel('hunyuan-exp');
  } catch (e) {
    return null;
  }
};

const HI_LIAO_VIOLATION_KEY = 'kr_hi_liao_violation_v2';
const HI_LIAO_MAX_VIOLATIONS = 2;

const getTodayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
};

const readViolationStore = () => {
  try {
    const raw = wx.getStorageSync(HI_LIAO_VIOLATION_KEY);
    if (!raw || typeof raw !== 'object') return { dayKey: getTodayKey(), count: 0 };
    const dayKey = raw.dayKey != null ? String(raw.dayKey) : '';
    const count = raw.count != null ? Number(raw.count) : 0;
    const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    return { dayKey: /^\d{8}$/.test(dayKey) ? dayKey : getTodayKey(), count: normalizedCount };
  } catch (e) {
    return { dayKey: getTodayKey(), count: 0 };
  }
};

const writeViolationStore = (store) => {
  try {
    wx.setStorageSync(HI_LIAO_VIOLATION_KEY, store);
  } catch (e) {}
};

const ensureViolationStoreToday = () => {
  const today = getTodayKey();
  const store = readViolationStore();
  if (store.dayKey === today) return store;
  const next = { dayKey: today, count: 0 };
  writeViolationStore(next);
  return next;
};

const bumpViolation = () => {
  const current = ensureViolationStoreToday();
  const nextCount = (Number(current.count) || 0) + 1;
  const next = { dayKey: getTodayKey(), count: nextCount };
  writeViolationStore(next);
  return next;
};

const buildPrompt = (userText, honorificType) => {
  const text = String(userText || '').trim();
  const style = normalizeHonorificType(honorificType);
  const rule = [
    '你是一个内容安全 + 翻译 + 韩语讲解助手。',
    '任务：',
    '1) 过滤不文明内容：涉黄、涉暴、涉恐、仇恨、辱骂、违法等。若明显违规才拒绝输出翻译与讲解。',
    '2) 不要因为标点/引号/口语化表达而拒绝。',
    '3) 除非出现明确的违规内容，否则不要输出任何 BLOCKED 标记。',
    '4) 若确实需要拒绝：优先使用 PORN 或 VIOLENCE；只有在明确属于其他严重违规时才用 OTHER。',
    `5) 若合规：把用户中文或英文翻译成自然地道的韩文（${style}，严禁夹杂中文/英文）。如果是单词则直接给出对应韩语单词。只给出一个最佳翻译，不要提供多个选项。`,
    '   注意：用户场景为“频道内聊天”，翻译时请务必结合语境，选择最自然、地道的口语表达（例如“拜拜”应译为符合聊天结束语境的表达），避免生硬直译。',
    '6) 讲解要求：简练精准，不要啰嗦，不要重复，不要长篇大论。如果是单词，直接解释含义；如果是句子，简单点拨语法。讲解字数控制在 100 字以内。',
    '输出格式要求（不要输出 JSON，严格按以下格式）：',
    '若合规，请输出：',
    '===KOREAN===',
    '(这里是韩文翻译，严禁出现中文)',
    '===EXPLANATION===',
    '(这里是中文讲解，简练精准)',
    '',
    '若不合规，请输出：',
    '===BLOCKED:CODE=== (CODE只能是 PORN / VIOLENCE / OTHER)',
    '(这里是拒绝原因)'
  ].join('\n');
  return [
    { role: 'system', content: rule },
    { role: 'user', content: text }
  ];
};

const buildPromptRelaxed = (userText, honorificType) => {
  const text = String(userText || '').trim();
  const style = normalizeHonorificType(honorificType);
  const rule = [
    '你是一个内容安全 + 翻译 + 韩语讲解助手。',
    '说明：用户输入已通过应用层校验，不存在“仅支持中文或英文输入”的问题。',
    '规则：',
    '1) 只拦截明确的涉黄或涉暴内容；严禁输出 BLOCKED:OTHER。',
    `2) 若合规：把用户中文或英文翻译成自然地道的韩文（${style}，严禁夹杂中文/英文）。如果是单词则直接给出对应韩语单词。只给出一个最佳翻译，不要提供多个选项。`,
    '   注意：用户场景为“频道内聊天”，翻译时请务必结合语境，选择最自然、地道的口语表达（例如“拜拜”应译为符合聊天结束语境的表达），避免生硬直译。',
    '3) 讲解要求：简练精准，不要啰嗦，不要重复，不要长篇大论。如果是单词，直接解释含义；如果是句子，简单点拨语法。讲解字数控制在 100 字以内。',
    '输出格式要求（不要输出 JSON，严格按以下格式）：',
    '若合规，请输出：',
    '===KOREAN===',
    '(这里是韩文翻译，严禁出现中文)',
    '===EXPLANATION===',
    '(这里是中文讲解，简练精准)',
    '',
    '若不合规，请输出：',
    '===BLOCKED:CODE=== (CODE只能是 PORN / VIOLENCE)',
    '(这里是拒绝原因)'
  ].join('\n');
  return [
    { role: 'system', content: rule },
    { role: 'user', content: text }
  ];
};

const parseStreamedOutput = (text) => {
  let allowed = true;
  let code = 'OK';
  let korean = '';
  let explanation = '';
  let message = '';

  // 1. Check for Blocked
  const blockMatch = text.match(/={3,}BLOCKED:([A-Z]+)(?:={3,})?/i);
  if (blockMatch) {
    allowed = false;
    code = blockMatch[1].toUpperCase();
    message = (text.split(blockMatch[0])[1] || '').trim();
    return { allowed, code, korean, explanation, message };
  }

  // 2. Parse Content with Markers
  // We use regex to be robust against spacing and case and extra equals
  // Match ===KOREAN=== (at least 3=) ... ===EXPLANATION=== (at least 3=)
  const dualMatch = text.match(/={3,}KOREAN={3,}\s*([\s\S]*?)\s*={3,}EXPLANATION={3,}\s*([\s\S]*)/i);
  
  if (dualMatch) {
    korean = dualMatch[1].trim();
    explanation = dualMatch[2].trim();
  } else {
    // Case 2: Only Start Marker or Partial
    // Try to strip the start marker (at least 3=)
    let rawKorean = text.replace(/={3,}KOREAN={3,}\s*/i, '');
    
    // Check if we haven't even received the full start marker yet (e.g. "===KO")
    // If the text *is* just the partial marker (starts with 1+ =), we want to show nothing.
    if (/^={1,}(?:K(?:O(?:R(?:E(?:A(?:N)?)?)?)?)?)?={0,}$/i.test(text.trim())) {
      rawKorean = '';
    }

    // Check if we are seeing a partial EXPLANATION marker or any other marker at the end
    // e.g. "Hello ===EXP" or "Hello ====" or "===ENGLISH"
    // We strip this from the display so the user doesn't see "===EXP"
    // We match 2+ equals to handle "==" case and start of any marker
    const partialSplitRegex = /\s*={2,}(?:[A-Z]*|.*[\u4e00-\u9fa5]+.*)={0,}$/i;
    korean = rawKorean.replace(partialSplitRegex, '').trim();
    
    explanation = ''; // Not reached yet
  }

  // Post-processing: Ensure Korean part does not contain Chinese characters
  if (korean && /[\u4e00-\u9fa5]/.test(korean)) {
    korean = korean.replace(/[\u4e00-\u9fa5]/g, '').trim();
  }

  return { allowed, code, korean, explanation, message };
};

const streamAi = async function* (model, userText, honorificType, options) {
  if (!model) throw new Error('AI unavailable');
  const relaxed = !!(options && options.relaxed);
  const messages = relaxed ? buildPromptRelaxed(userText, honorificType) : buildPrompt(userText, honorificType);
  const res = await model.streamText({
    data: {
      model: 'hunyuan-turbos-latest',
      messages
    }
  });
  
  if (res && res.textStream) {
    for await (const text of res.textStream) {
      if (text) yield text;
    }
  } else {
    // Fallback for older SDK versions or unexpected response structure
    let iterable = res;
    if (res && typeof res.eventStream === 'object') {
      iterable = res.eventStream;
    } else if (res && typeof res[Symbol.asyncIterator] === 'function') {
      iterable = res;
    }

    for await (const event of iterable) {
      let text = '';
      if (typeof event === 'string') text = event;
      else if (event.data) text = event.data;
      else if (event.choices && event.choices[0] && event.choices[0].delta && event.choices[0].delta.content) {
        text = event.choices[0].delta.content;
      } else if (event.choices && event.choices[0] && event.choices[0].text) {
        text = event.choices[0].text;
      }
      if (text) yield text;
    }
  }
};

Page({
  data: {
    statusBarHeight: 20,
    navBarHeight: 44,
    dark: false,
    nickname: '',
    inputText: '',
    canSend: false,
    sending: false,
    unsupported: false,
    banned: false,
    banCount: 0,
    keyboardOffset: 0,
    keyboardVisible: false,
    safeAreaInsetBottom: 0,
    messages: [],
    bottomId: 'bottom-0',
    scrollIntoView: '',
    honorificType: '敬语',
    platform: '',
    unuploadedCount: 0,
    showSyncTip: false,
    showDetailTip: false,
    showSettingsTooltip: false,
    refreshText: '刷新',
    showRefreshBubble: false
  },

  _applyKeyboardHeight(height) {
    const prevHeight = Number(this._lastKeyboardHeight) || 0;
    this._lastKeyboardHeight = height;
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ hidden: height > 0 });
    }
    if (!height) {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const windowHeight = windowInfo && windowInfo.windowHeight != null ? Number(windowInfo.windowHeight) : 0;
      if (Number.isFinite(windowHeight) && windowHeight > 0) this._keyboardBaselineWindowHeight = windowHeight;
      this._rawKeyboardHeight = 0;
      this._androidKbdLoopCount = 0;
      this._androidKbdOpenedAt = 0;
      this._androidKbdClosedAt = Date.now();
      if (this._androidKbdLoopTimer) {
        clearTimeout(this._androidKbdLoopTimer);
        this._androidKbdLoopTimer = null;
      }
      if (this._keyboardHeightTimer) {
        clearTimeout(this._keyboardHeightTimer);
        this._keyboardHeightTimer = null;
      }
      try {
        if (this._logKbd) {
          this._logKbd('height=0', {
            windowHeight,
            baselineWindowHeight: Number(this._keyboardBaselineWindowHeight) || 0,
            prevOffset: Number(this.data.keyboardOffset) || 0
          });
        }
      } catch (e) {}
      if (this.data.keyboardVisible || this.data.keyboardOffset) {
        this.setData({ keyboardVisible: false, keyboardOffset: 0 });
        this.refreshChat(true);
      }
      return;
    }

    this._rawKeyboardHeight = height;
    if (this._blurTimer) {
      clearTimeout(this._blurTimer);
      this._blurTimer = null;
    }
    const wasVisible = !!this.data.keyboardVisible;
    if (!wasVisible) this.setData({ keyboardVisible: true });
    if (String(this.data.platform || '').toLowerCase() === 'android') {
      const opening = prevHeight <= 0 || !wasVisible;
      this._androidKbdLoopCount = 0;
      if (opening) this._androidKbdOpenedAt = Date.now();
      if (this._androidKbdLoopTimer) {
        clearTimeout(this._androidKbdLoopTimer);
        this._androidKbdLoopTimer = null;
      }
      if (opening && this.data.keyboardOffset) {
        this.setData({ keyboardOffset: 0 });
      }
      try {
        if (this._logKbd) {
          this._logKbd('height>0', {
            height,
            safeAreaInsetBottom: Number(this.data.safeAreaInsetBottom) || 0,
            prevOffset: Number(this.data.keyboardOffset) || 0
          });
        }
      } catch (e) {}
      if (this._keyboardHeightTimer) clearTimeout(this._keyboardHeightTimer);
      this._keyboardHeightTimer = setTimeout(() => {
        this._keyboardHeightTimer = null;
        this.updateAndroidKeyboardLayout();
      }, opening ? 90 : 50);
      return;
    }
    if (this._keyboardHeightTimer) clearTimeout(this._keyboardHeightTimer);
    this._keyboardHeightTimer = setTimeout(() => {
      this._keyboardHeightTimer = null;
      this.updateKeyboardLayout();
    }, 50);
  },

  updateAndroidKeyboardLayout() {
    const rawHeight = Number(this._rawKeyboardHeight) || 0;
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const windowHeight = windowInfo && windowInfo.windowHeight != null ? Number(windowInfo.windowHeight) : 0;
    if (!rawHeight || !windowHeight || !this.data.keyboardVisible) return;
    const keyboardTop = Math.max(0, Math.floor(windowHeight - rawHeight));
    const openedAt = Number(this._androidKbdOpenedAt) || 0;
    const now = Date.now();
    const grace = openedAt > 0 && (now - openedAt) < 450;

    this.createSelectorQuery()
      .select('.composer')
      .boundingClientRect((rect) => {
        if (!rect) {
          const n = Number(this._androidKbdLoopCount) || 0;
          if (n >= 4) return;
          this._androidKbdLoopCount = n + 1;
          if (this._androidKbdLoopTimer) clearTimeout(this._androidKbdLoopTimer);
          this._androidKbdLoopTimer = setTimeout(() => {
            this._androidKbdLoopTimer = null;
            if (!this.data.keyboardVisible || !(Number(this._rawKeyboardHeight) > 0)) return;
            this.updateAndroidKeyboardLayout();
          }, 60);
          return;
        }
        const currentOffset = Number(this.data.keyboardOffset) || 0;
        const rectBottom = Math.floor(Number(rect.bottom));
        if (currentOffset > 0 && rectBottom >= Math.floor(windowHeight) - 1) {
          const n = Number(this._androidKbdLoopCount) || 0;
          if (n >= 6) return;
          this._androidKbdLoopCount = n + 1;
          if (this._androidKbdLoopTimer) clearTimeout(this._androidKbdLoopTimer);
          this._androidKbdLoopTimer = setTimeout(() => {
            this._androidKbdLoopTimer = null;
            if (!this.data.keyboardVisible || !(Number(this._rawKeyboardHeight) > 0)) return;
            this.updateAndroidKeyboardLayout();
          }, 80);
          return;
        }
        const delta = Math.floor(rectBottom - Number(keyboardTop));
        let nextOffset = currentOffset;
        if (delta > 0) nextOffset = currentOffset + delta;
        else if (delta < -8) nextOffset = Math.max(0, currentOffset + delta + 4);
        nextOffset = Math.max(0, Math.floor(nextOffset));
        try {
          if (this._logKbd) {
            this._logKbd('geo', {
              rawHeight,
              windowHeight,
              keyboardTop,
              rectBottom,
              currentOffset,
              delta,
              nextOffset,
              loopCount: Number(this._androidKbdLoopCount) || 0
            });
          }
        } catch (e) {}
        const willChange = nextOffset !== this.data.keyboardOffset;
        if (willChange) {
          this.setData({ keyboardOffset: nextOffset });
          this.refreshChat(true);
        }
        const needUp = delta > 2;
        const needDown = delta < -12 && currentOffset > 0;
        const shouldLoop = needUp || needDown || willChange || (grace && (Number(this._androidKbdLoopCount) || 0) < 6);
        if (!shouldLoop) {
          this._androidKbdLoopCount = 0;
          if (this._androidKbdLoopTimer) {
            clearTimeout(this._androidKbdLoopTimer);
            this._androidKbdLoopTimer = null;
          }
          return;
        }
        const n = Number(this._androidKbdLoopCount) || 0;
        if (n >= 8) {
          this._androidKbdLoopCount = 0;
          if (this._androidKbdLoopTimer) {
            clearTimeout(this._androidKbdLoopTimer);
            this._androidKbdLoopTimer = null;
          }
          return;
        }
        this._androidKbdLoopCount = n + 1;
        if (this._androidKbdLoopTimer) clearTimeout(this._androidKbdLoopTimer);
        this._androidKbdLoopTimer = setTimeout(() => {
          this._androidKbdLoopTimer = null;
          if (!this.data.keyboardVisible || !(Number(this._rawKeyboardHeight) > 0)) return;
          this.updateAndroidKeyboardLayout();
        }, 60);
      })
      .exec();
  },

  updateKeyboardLayout() {
    const rawHeight = Number(this._rawKeyboardHeight) || 0;
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const windowHeight = windowInfo && windowInfo.windowHeight != null ? Number(windowInfo.windowHeight) : 0;
    const safeAreaInsetBottom = Number(this._hiChatSafeAreaInsetBottom) || 0;
    const baselineWindowHeight = Number(this._keyboardBaselineWindowHeight) || 0;
    const platform = String(this._hiChatPlatform || windowInfo.platform || '').toLowerCase();

    const resized =
      rawHeight > 0 &&
      baselineWindowHeight > 0 &&
      windowHeight > 0 &&
      Math.floor(baselineWindowHeight - windowHeight) > 24;

    if (platform === 'android') return;

    let effectiveKeyboardHeight = rawHeight;
    if (platform === 'ios' && effectiveKeyboardHeight > 0 && safeAreaInsetBottom > 0) {
      effectiveKeyboardHeight = Math.max(0, Math.floor(effectiveKeyboardHeight - safeAreaInsetBottom));
    }

    const keyboardTop = resized
      ? Math.max(0, Math.floor(windowHeight))
      : Math.max(0, Math.floor(windowHeight - effectiveKeyboardHeight));

    this.createSelectorQuery()
      .select('.composer')
      .boundingClientRect((rect) => {
        if (!rect) return;
        const currentOffset = Number(this.data.keyboardOffset) || 0;
        const delta = Math.floor(Number(rect.bottom) - Number(keyboardTop));
        const nextOffset = Math.max(0, Math.floor(currentOffset + (Number.isFinite(delta) ? delta : 0)));
        if (nextOffset === this.data.keyboardOffset) return;
        this.setData({ keyboardOffset: nextOffset });
        this.refreshChat(true);
      })
      .exec();
  },

  refreshUnuploadedCount() {
    try {
      const n = getHiLiaoChatCloudWriteQueueCount();
      const next = Number.isFinite(Number(n)) ? Math.max(0, Math.floor(Number(n))) : 0;
      if (next === this.data.unuploadedCount) return;
      this.setData({ unuploadedCount: next });
    } catch (e) {}
  },

  getTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  },

  async runSync({ bypassCooldown } = {}) {
    if (this.data.unsupported || this.data.banned) return;
    this.refreshUnuploadedCount();
    try {
      console.log('[hi-chat] runSync start', { bypassCooldown: !!bypassCooldown });
    } catch (e) {}
    const key = 'kr_hi_liao_manual_refresh_at_v1';
    const cooldownMs = 5 * 60 * 1000;
    const now = Date.now();
    const bypass = !!bypassCooldown;
    let last = 0;
    try {
      const v = wx.getStorageSync(key);
      last = v != null ? Number(v) : 0;
    } catch (e) {
      last = 0;
    }
    if (!bypass) {
      const remainMs = cooldownMs - (now - (Number.isFinite(last) ? last : 0));
      if (remainMs > 0) {
        const s = Math.max(1, Math.ceil(remainMs / 1000));
        try {
          console.log('[hi-chat] runSync cooldown', { remainSec: s, lastAt: last });
        } catch (e) {}
        wx.showToast({
          title: `请${s}秒后再试`,
          icon: 'none',
          duration: 2000
        });
        return { skipped: 'cooldown', remainSec: s };
      }
    }
    // Silent start
    // try {
    //   wx.showToast({ title: '同步中…', icon: 'none', duration: 1500 });
    // } catch (e) {}

    // 0. Backfill queue from local to ensure no data loss (always try to recover)
    try {
      const backfilled = backfillHiLiaoChatCloudWriteQueueFromLocal({ limit: 10 });
      if (backfilled > 0) this.refreshUnuploadedCount();
    } catch (e) {
      try {
        console.error('[hi-chat] runSync backfill fail', e);
      } catch (err) {}
    }

    let uploaded = 0;
    try {
      uploaded = await flushHiLiaoChatCloudWriteQueue({ drain: true });
    } catch (e) {
      try {
        console.error('[hi-chat] runSync upload fail', e);
        const msg = e && e.message ? String(e.message) : String(e);
        if (msg.includes('force cloud function') || msg.includes('cloud function unavailable')) {
           wx.showToast({ title: '上传失败: 云函数未部署', icon: 'none' });
        } else {
           wx.showToast({ title: '上传失败，请重试', icon: 'none' });
        }
      } catch (err) {}
    }
    this.refreshUnuploadedCount();

    // 2. Pull from cloud
    let changed = false;
    let pullFailed = false;
    try {
      changed = await this.loadRecentFromCloud(true);
    } catch (e) {
      changed = false;
      pullFailed = true;
      try {
        console.error('[hi-chat] runSync pull fail', e);
      } catch (err) {}
    }
    try {
      console.log('[hi-chat] runSync done', { changed, uploaded });
    } catch (e) {}
    if (!bypass && !pullFailed) {
      try {
        wx.setStorageSync(key, now);
      } catch (e) {}
    }
    try {
      this.refreshUnuploadedCount();
      const pending = Number(this.data.unuploadedCount) || 0;
      if (pullFailed) {
        // wx.showToast({ title: '同步失败（拉取错）', icon: 'none' });
      } else if (pending > 0) {
        // const prefix = uploaded > 0 ? `已上传${uploaded}条，` : '';
        // wx.showToast({ title: changed ? `${prefix}已同步（${pending}条未传）` : `${prefix}已是最新（${pending}条未传）`, icon: 'none' });
      } else {
        // const prefix = uploaded > 0 ? `已上传${uploaded}条，` : '';
        // wx.showToast({ title: changed ? `${prefix}已同步最新` : `${prefix}已是最新`, icon: 'none' });
      }
    } catch (e) {}
    return {
      skipped: '',
      changed: !!changed,
      uploaded: Number(uploaded) || 0,
      pullFailed: !!pullFailed,
      unuploadedCount: Number(this.data.unuploadedCount) || 0
    };
  },

  async manualRefresh() {
    try {
      wx.showLoading({ title: '刷新中', mask: true });
    } catch (e) {}
    try {
      const res = await this.runSync({ bypassCooldown: false });
      if (res && res.skipped === 'cooldown') return res;
      const pullFailed = !!(res && res.pullFailed);
      if (pullFailed) {
        showToastSafe('刷新失败，请重试');
        return res;
      }
      const changed = !!(res && res.changed);
      const uploaded = Number(res && res.uploaded) || 0;
      if (changed || uploaded > 0) {
        showToastSafe('刷新成功');
      } else {
        showToastSafe('已是最新');
      }
      return res;
    } finally {
      try {
        wx.hideLoading();
      } catch (e) {}
    }
  },

  async autoSyncOncePerDay() {
    if (this.data.unsupported || this.data.banned) return;
    const key = 'kr_hi_liao_auto_sync_day_v1';
    const today = this.getTodayKey();
    let stored = '';
    try {
      stored = String(wx.getStorageSync(key) || '');
    } catch (e) {
      stored = '';
    }
    if (stored === today) return;
    try {
      wx.setStorageSync(key, today);
    } catch (e) {}
    
    wx.showLoading({ title: '更新中', mask: true });
    try {
      await this.runSync({ bypassCooldown: true });
    } catch (e) {
    } finally {
      wx.hideLoading();
    }
  },

  onLoad() {
    this._videoAd = null;
    this._rewardPendingResolve = null;
    this._rewarding = false;
    if (wx.createRewardedVideoAd) {
      try {
        const ad = wx.createRewardedVideoAd({ adUnitId: 'adunit-a4a6a8bbc9495ac7' });
        ad.onError(() => {
          const resolve = this._rewardPendingResolve;
          this._rewardPendingResolve = null;
          if (resolve) resolve(false);
        });
        ad.onClose((res) => {
          const resolve = this._rewardPendingResolve;
          this._rewardPendingResolve = null;
          const ok = !!(res && res.isEnded);
          if (resolve) resolve(ok);
        });
        this._videoAd = ad;
      } catch (e) {}
    }

    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : windowInfo;
    const statusBarHeight = windowInfo.statusBarHeight || 20;
    const menuButtonInfo = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const navBarHeight = menuButtonInfo ? (menuButtonInfo.top - statusBarHeight) * 2 + menuButtonInfo.height : 44;
    const screenHeight = windowInfo.screenHeight || systemInfo.screenHeight || 0;
    const safeArea = windowInfo.safeArea || systemInfo.safeArea;
    const safeAreaInsetBottom =
      safeArea && safeArea.bottom != null && screenHeight
        ? Math.max(0, Math.floor(Number(screenHeight) - Number(safeArea.bottom)))
        : 0;
    const platform = String(windowInfo.platform || systemInfo.platform || '').toLowerCase();
    this._hiChatScreenHeight = Number.isFinite(Number(screenHeight)) ? Number(screenHeight) : 0;
    this._hiChatSafeAreaInsetBottom = Number.isFinite(Number(safeAreaInsetBottom)) ? Number(safeAreaInsetBottom) : 0;
    this._hiChatPlatform = platform;
    this._kbdDebugEnabled = platform === 'android';
    this._kbdDebugCount = 0;
    this._kbdDebugLastLogAt = 0;
    this._logKbd = createKbdLogger(this);
    if (!this._globalKbdHandler && typeof wx.onKeyboardHeightChange === 'function') {
      this._globalKbdHandler = (res) => {
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1];
        if (!currentPage || currentPage !== this) return;
        const raw = res && res.height != null ? Number(res.height) : 0;
        const h = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
        this._applyKeyboardHeight(h);
      };
      try {
        wx.onKeyboardHeightChange(this._globalKbdHandler);
      } catch (e) {}
    }
    const windowHeight = windowInfo && windowInfo.windowHeight != null ? Number(windowInfo.windowHeight) : 0;
    this._keyboardBaselineWindowHeight = Number.isFinite(windowHeight) ? windowHeight : 0;
    const aiModel = createAiModel();
    this._aiModel = aiModel;
    const store = ensureViolationStoreToday();
    const banned = Number(store.count) >= HI_LIAO_MAX_VIOLATIONS;
    const honorificType = normalizeHonorificType(wx.getStorageSync('kr_hi_liao_honorific_type_v1'));
    this.setData({
      statusBarHeight,
      navBarHeight,
      unsupported: !aiModel,
      banned,
      banCount: Number(store.count) || 0,
      honorificType,
      platform,
      safeAreaInsetBottom
    });
    try {
      if (this._logKbd) {
        this._logKbd('init', {
          platform,
          windowHeight: Number(windowInfo && windowInfo.windowHeight),
          screenHeight,
          safeAreaInsetBottom,
          baselineWindowHeight: this._keyboardBaselineWindowHeight
        });
      }
    } catch (e) {}
  },

  onShow() {
    const storedSettings = wx.getStorageSync('settings') || {};
    const nickname = getHiLiaoNickname();
    const honorificType = normalizeHonorificType(wx.getStorageSync('kr_hi_liao_honorific_type_v1') || this.data.honorificType);
    this.setData({ dark: !!storedSettings.darkMode, nickname, honorificType });
    const store = ensureViolationStoreToday();
    const banned = Number(store.count) >= HI_LIAO_MAX_VIOLATIONS;
    const banCount = Number(store.count) || 0;
    const currentText = String(this.data.inputText || '');
    const canSend = !this.data.unsupported && !banned && !!currentText.trim() && !this.data.sending;
    this.setData({ banned, banCount, canSend, inputText: banned ? '' : currentText });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2, hidden: false });
    }
    this.refreshChat(true);
    this.refreshUnuploadedCount();
    this.autoSyncOncePerDay();
    
    // Check 30-min interval for auto-refresh
    try {
      const now = Date.now();
      const lastSync = this._lastCloudSyncAt || 0;
      const interval = 30 * 60 * 1000;
      if (now - lastSync > interval) {
        this.loadRecentFromCloud(true);
      }
    } catch (e) {}

    this.maybeShowOnboard();
    this.startRefreshTimer();
    
    // Check for refresh bubble
    this.checkRefreshBubble();
    
    if (!this.data.keyboardOffset) {
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      const windowHeight = windowInfo && windowInfo.windowHeight != null ? Number(windowInfo.windowHeight) : 0;
      if (Number.isFinite(windowHeight) && windowHeight > 0) this._keyboardBaselineWindowHeight = windowHeight;
    }
    if (!this._settingsTipShown) {
      this._settingsTipShown = true;
      try {
        const key = 'kr_hi_liao_settings_tip_seen_v1';
        const seen = !!wx.getStorageSync(key);
        if (!seen && !this.data.unsupported && !this.data.banned) {
          wx.setStorageSync(key, 1);
          this.setData({ showSettingsTooltip: true });
          setTimeout(() => {
            this.setData({ showSettingsTooltip: false });
          }, 8000);
        }
      } catch (e) {}
    }
    if (!this._syncTipShown) {
      this._syncTipShown = true;
      try {
        const key = 'kr_hi_liao_sync_tip_seen_v2';
        const seen = !!wx.getStorageSync(key);
        if (!seen) {
          wx.setStorageSync(key, 1);
          this.setData({ showSyncTip: true, showDetailTip: true });
          setTimeout(() => {
             this.setData({ showSyncTip: false, showDetailTip: false });
          }, 8000);
        }
      } catch (e) {}
    }
  },

  onHide() {
    this.stopCloudPolling();
    this.stopRefreshTimer();
    flushHiLiaoChatCloudWriteQueue().catch(() => {});
    if (this._keyboardHeightTimer) {
      clearTimeout(this._keyboardHeightTimer);
      this._keyboardHeightTimer = null;
    }
    if (this._androidKbdLoopTimer) {
      clearTimeout(this._androidKbdLoopTimer);
      this._androidKbdLoopTimer = null;
    }
    if (this._blurTimer) {
      clearTimeout(this._blurTimer);
      this._blurTimer = null;
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ hidden: false });
    }
  },
  
  startRefreshTimer() {
    this.updateRefreshState();
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._refreshTimer = setInterval(() => {
      this.updateRefreshState();
    }, 1000);
  },
  
  stopRefreshTimer() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  },
  
  updateRefreshState() {
    const lastSync = this._lastCloudSyncAt || 0;
    const now = Date.now();
    const diff = now - lastSync;
    const cooldown = 60 * 1000; // 1 minute
    
    if (diff >= cooldown) {
      if (this.data.refreshText !== '刷新') {
        this.setData({ 
          refreshText: '刷新',
          showRefreshBubble: true
        });
      }
    } else {
      const remaining = Math.ceil((cooldown - diff) / 1000);
      const text = `${remaining}s`;
      if (this.data.refreshText !== text) {
        this.setData({ refreshText: text });
      }
    }
  },
  
  checkRefreshBubble() {
    try {
      // Always show bubble if refresh is available, regardless of whether it was seen today
      if (this.data.refreshText === '刷新') {
        this.setData({ showRefreshBubble: true });
      } else {
        this.setData({ showRefreshBubble: false });
      }
    } catch (e) {}
  },
  
  manualRefresh() {
    const lastSync = this._lastCloudSyncAt || 0;
    const now = Date.now();
    if (now - lastSync < 60 * 1000) {
      wx.showToast({ title: '请稍后再试', icon: 'none' });
      return;
    }
    
    // Hide bubble on click
    if (this.data.showRefreshBubble) {
      this.setData({ showRefreshBubble: false });
    }
    
    wx.showLoading({ title: '刷新中' });
    this.loadRecentFromCloud(true).then((updated) => {
      wx.hideLoading();
      if (updated) {
        wx.showToast({ title: '已刷新', icon: 'none' });
      } else {
        wx.showToast({ title: '暂无新消息', icon: 'none' });
      }
    });
  },

  onUnload() {
    this.stopCloudPolling();
    this.stopRefreshTimer();
    flushHiLiaoChatCloudWriteQueue().catch(() => {});
    if (this._keyboardHeightTimer) {
      clearTimeout(this._keyboardHeightTimer);
      this._keyboardHeightTimer = null;
    }
    if (this._androidKbdLoopTimer) {
      clearTimeout(this._androidKbdLoopTimer);
      this._androidKbdLoopTimer = null;
    }
    if (this._blurTimer) {
      clearTimeout(this._blurTimer);
      this._blurTimer = null;
    }
    if (this._globalKbdHandler && typeof wx.offKeyboardHeightChange === 'function') {
      try {
        wx.offKeyboardHeightChange(this._globalKbdHandler);
      } catch (e) {}
      this._globalKbdHandler = null;
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ hidden: false });
    }
  },

  startCloudPolling() {
    this.stopCloudPolling();
    if (this.data.unsupported || this.data.banned) return;
    this._cloudPollDelayMs = 20000;
    const tick = async () => {
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      if (!currentPage || currentPage !== this) {
        this._cloudPollTimer = setTimeout(tick, Math.min(60000, Number(this._cloudPollDelayMs) || 20000));
        return;
      }
      const changed = await this.loadRecentFromCloud(false);
      const base = Number(this._cloudPollDelayMs) || 20000;
      const next = changed ? 20000 : Math.min(5 * 60 * 1000, Math.max(20000, base * 2));
      this._cloudPollDelayMs = next;
      this._cloudPollTimer = setTimeout(tick, next);
    };
    this._cloudPollTimer = setTimeout(tick, this._cloudPollDelayMs);
  },

  stopCloudPolling() {
    if (this._cloudPollTimer) {
      clearTimeout(this._cloudPollTimer);
      this._cloudPollTimer = null;
    }
  },

  maybeShowOnboard() {
    if (this.data.unsupported || this.data.banned) return;
    if (this._onboardModalShown) return;
    const key = 'kr_hi_liao_onboard_seen_v1';
    let seen = false;
    try {
      seen = !!wx.getStorageSync(key);
    } catch (e) {
      seen = false;
    }
    if (seen) return;
    this._onboardModalShown = true;
    try {
      wx.setStorageSync(key, 1);
    } catch (e) {}
    try {
      wx.showModal({
        title: 'HI~提示',
        content: ['1、输入中文发布，自动生成韩语笔记与语法讲解', '2、点击任意卡片，可查看详细语法解析', '3、请专注语法学习，禁止违规内容'].join('\n'),
        showCancel: false,
        confirmText: '知道了'
      });
    } catch (e) {}
  },

  openSettings() {
    if (this.data.unsupported || this.data.banned) return;
    const options = ['敬语（존댓말）', '平语（반말）'];
    wx.showActionSheet({
      itemList: options,
      success: (res) => {
        const tapIndex = res && typeof res.tapIndex === 'number' ? res.tapIndex : -1;
        const next = tapIndex === 1 ? '平语' : '敬语';
        try {
          wx.setStorageSync('kr_hi_liao_honorific_type_v1', next);
        } catch (e) {}
        this.setData({ honorificType: next });
        try {
          wx.showToast({ title: `已切换：${next}`, icon: 'none' });
        } catch (e) {}
      }
    });
  },

  async loadRecentFromCloud(shouldScroll) {
    if (this.data.unsupported || this.data.banned) return;
    if (this._cloudSyncing) return;
    this._cloudSyncing = true;
    try {
      const before = getHiLiaoChats();
      const beforeById = new Map();
      for (const it of before) {
        if (it && it.id) beforeById.set(String(it.id), Number(it.updatedAt) || 0);
      }
      const res = await fetchHiLiaoFeedCloudSmart({ force: !!shouldScroll });
      const list = res && Array.isArray(res.list) ? res.list : [];
      if (!Array.isArray(list) || list.length === 0) return false;
      let changed = false;
      for (const it of list) {
        const id = it && it.id != null ? String(it.id) : '';
        if (!id) continue;
        const prevUpdatedAt = beforeById.get(id);
        const nextUpdatedAt = it && it.updatedAt != null ? Number(it.updatedAt) : 0;
        if (prevUpdatedAt == null) {
          changed = true;
          break;
        }
        if (Number(nextUpdatedAt) > Number(prevUpdatedAt)) {
          changed = true;
          break;
        }
      }
      if (!changed) return false;
      mergeHiLiaoChats(list);
      this.refreshChat(!!shouldScroll);
      return true;
    } catch (e) {
      console.error('HI~ 云端同步失败', e);
      if (!this._cloudSyncToastShown) {
        this._cloudSyncToastShown = true;
        try {
          wx.showToast({ title: '云端同步失败', icon: 'none' });
        } catch (err) {}
      }
      return false;
    } finally {
      this._lastCloudSyncAt = Date.now();
      this._cloudSyncing = false;
    }
  },

  showTipDetail() {
    try {
      wx.showModal({
        title: 'HI~提示',
        content: [
          '1、输入中文发布，自动生成韩语笔记与语法讲解',
          '2、点击任意卡片，可查看详细语法解析',
          '3、请文明交流，禁止涉黄涉暴等违规内容',
          '4、不合规内容会被拦截，严重者将被禁用'
        ].join('\n'),
        showCancel: false,
        confirmText: '知道了'
      });
    } catch (e) {}
  },

  refreshChat(shouldScroll) {
    const myDeviceId = getHiLiaoDeviceId();
    const list = getHiLiaoChats();
    const recentChats = list.slice(0, 30).slice().reverse();
    const messages = [];
    let lastTs = 0;
    for (const chat of recentChats) {
      const createdAt = chat && chat.createdAt != null ? Number(chat.createdAt) : 0;
      const showTime = !lastTs || (createdAt - lastTs) > 1 * 60 * 1000;
      const timeLabel = showTime ? formatTime(createdAt) : '';
      lastTs = createdAt;

      const userText = chat && chat.userText != null ? String(chat.userText) : '';
      const status = chat && chat.status ? String(chat.status) : 'done';
      const blocked = !!(chat && chat.blocked);
      if (blocked) continue;
      const korean = chat && chat.korean != null ? String(chat.korean) : '';
      const nickname = chat && chat.nickname != null ? String(chat.nickname) : '';
      const deviceId = chat && chat.deviceId != null ? String(chat.deviceId) : '';
      const isSelf = !!(myDeviceId && deviceId && myDeviceId === deviceId);
      const displayText = (() => {
        if (status === 'pending') return '生成中…';
        if (status === 'failed') return '生成失败，点开查看';
        if (status === 'streaming' && !String(korean || '').trim()) return '生成中…';
        return normalizeBubbleText(korean) || '生成失败，点开查看';
      })();

      messages.push({
        mid: `${chat.id}:m`,
        isSelf,
        text: displayText,
        chatId: chat.id,
        timeLabel,
        nickname: nickname || ''
      });
    }

    if (shouldScroll) {
      const bottomId = `bottom-${Date.now()}`;
      this.setData({ messages, bottomId, scrollIntoView: bottomId });
      return;
    }
    this.setData({ messages });
  },

  onInput(e) {
    if (this.data.banned || this.data.unsupported) return;
    const value = e && e.detail && e.detail.value != null ? String(e.detail.value) : '';
    const trimmed = value.trim();
    this.setData({ inputText: value, canSend: !!trimmed && !this.data.sending });
  },

  onKeyboardHeightChange(e) {
    const raw = e && e.detail && e.detail.height != null ? Number(e.detail.height) : 0;
    const height = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    this._applyKeyboardHeight(height);
  },

  onFocus() {
    if (this._blurTimer) {
      clearTimeout(this._blurTimer);
      this._blurTimer = null;
    }
    this.refreshChat(true);
  },

  onBlur() {
    if (this._blurTimer) clearTimeout(this._blurTimer);
    this._blurTimer = setTimeout(() => {
      this._blurTimer = null;
      if (!this.data.keyboardVisible && !this.data.keyboardOffset) return;
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setData({ hidden: false });
      }
      this.setData({ keyboardVisible: false, keyboardOffset: 0 });
      this.refreshChat(true);
    }, 180);
  },

  openDetail(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : '';
    if (!id) return;
    wx.navigateTo({ url: `/pages/hi-chat-detail/index?id=${encodeURIComponent(String(id))}` });
  },

  openBook() {
    wx.navigateTo({ url: '/pages/hi-chat-book/index' });
  },

  showRewardedVideo() {
    if (!this._videoAd || !this._videoAd.show) return Promise.resolve(false);
    if (this._rewardPendingResolve) return Promise.resolve(false);
    return new Promise((resolve) => {
      this._rewardPendingResolve = resolve;
      this._videoAd.show().catch(() => {
        const load = this._videoAd && this._videoAd.load ? this._videoAd.load() : Promise.reject(new Error('no load'));
        load
          .then(() => this._videoAd.show())
          .catch(() => {
            const r = this._rewardPendingResolve;
            this._rewardPendingResolve = null;
            if (r) r(false);
          });
      });
    });
  },

  async grantExtraChatsByAd() {
    if (this._rewarding) return false;
    this._rewarding = true;
    try {
      if (!this._videoAd) {
        try {
          wx.showToast({ title: '当前环境不支持广告', icon: 'none' });
        } catch (e) {}
        return false;
      }
      const ok = await this.showRewardedVideo();
      if (!ok) {
        try {
          wx.showToast({ title: '未完整观看，未获得次数', icon: 'none' });
        } catch (e) {}
        return false;
      }
      addHiLiaoChatQuotaBonus(2);
      try {
        wx.showToast({ title: '已增加 2 次', icon: 'none' });
      } catch (e) {}
      return true;
    } finally {
      this._rewarding = false;
    }
  },

  async send() {
    try {
      try {
        console.log('[hi-chat] send click', { unsupported: !!this.data.unsupported, banned: !!this.data.banned, sending: !!this.data.sending });
      } catch (e) {}
      if (this.data.unsupported) {
        showToastSafe('当前微信版本不支持，请升级');
        return;
      }
      if (this.data.banned) {
        showToastSafe('功能已禁用');
        return;
      }
      if (this.data.sending) {
        showToastSafe('生成中…');
        return;
      }
      const text = String(this.data.inputText || '').trim();
      try {
        console.log('[hi-chat] send input', { textLen: text.length, hasText: !!text });
      } catch (e) {}
      if (!text) {
        try {
          console.log('[hi-chat] send blocked', { reason: 'empty_text' });
        } catch (e) {}
        showToastSafe('请输入内容');
        return;
      }
      const langOk = isChineseOrEnglishText(text);
      if (!langOk) {
        try {
          console.log('[hi-chat] send blocked', { reason: 'invalid_chars', textLen: text.length });
        } catch (e) {}
        showToastSafe('仅支持中文或英文输入');
        return;
      }

      const quota = getHiLiaoChatQuotaState();
      try {
        console.log('[hi-chat] send quota', quota);
      } catch (e) {}
      if (!quota || (quota.remaining != null && Number(quota.remaining) <= 0)) {
        try {
          console.log('[hi-chat] send blocked', { reason: 'quota_exhausted', quota });
        } catch (e) {}
        if (this._quotaModalShowing) return;
        this._quotaModalShowing = true;
        const opened = showModalSafe({
          title: '今日免费次数已用完',
          content: '每日免费 3 次。\n观看广告可额外增加 2 次。',
          confirmText: '看广告',
          cancelText: '取消',
          success: async (res) => {
            if (!res || !res.confirm) return;
            const granted = await this.grantExtraChatsByAd();
            if (!granted) return;
          },
          fail: () => {
            showToastSafe('今日次数已用完');
          },
          complete: () => {
            this._quotaModalShowing = false;
          }
        });
        if (!opened) {
          this._quotaModalShowing = false;
          showToastSafe('今日次数已用完');
        }
        return;
      }
      consumeHiLiaoChatQuotaOnce();

      const now = Date.now();
      const id = `${now}_${Math.floor(Math.random() * 100000)}`;
      const nickname = String(this.data.nickname || getHiLiaoNickname() || '');
      const deviceId = getHiLiaoDeviceId();
      const pending = {
        id,
        nickname,
        deviceId,
        userText: text,
        korean: '',
        explanation: '',
        blocked: false,
        status: 'pending',
        createdAt: now,
        updatedAt: now
      };

      addHiLiaoChat(pending);
      this.setData({ inputText: '', canSend: false, sending: true });
      this.refreshChat(true);
      try {
        console.log('[hi-chat] send pending saved', { id, textLen: text.length, honorificType: this.data.honorificType });
      } catch (e) {}

      try {
        const runOnce = async ({ relaxed }) => {
          let fullText = '';
          const stream = (() => {
            if (relaxed) return streamAi(this._aiModel, text, this.data.honorificType, { relaxed: true });
            return streamAi(this._aiModel, text, this.data.honorificType);
          })();

          for await (const chunk of stream) {
            fullText += chunk;
            const parsed = parseStreamedOutput(fullText);
            if (parsed.allowed && parsed.korean) {
              const nextText = normalizeBubbleText(parsed.korean);
              const msgs = this.data.messages;
              const idx = msgs.findIndex(m => m.chatId === id);
              if (idx >= 0) {
                 this.setData({ [`messages[${idx}].text`]: nextText });
              }
            }

            if (parsed.allowed) {
              const nextKorean = normalizeBubbleText(parsed.korean || '');
              const streamingMsg = {
                 ...pending,
                 status: 'streaming',
                 korean: nextKorean,
                 explanation: parsed.explanation || '',
                 updatedAt: Date.now()
              };
              throttledUpsert(streamingMsg);
            }
          }
          return fullText;
        };

        let fullText = '';
        try {
          console.log('[hi-chat] send streamAi start', { id });
        } catch (e) {}

        // Throttling setup
        let lastUpsertTime = 0;
        const upsertInterval = 100; // ms (Faster updates for smoother streaming)
        const throttledUpsert = (msgToSave) => {
          const now = Date.now();
          if (now - lastUpsertTime >= upsertInterval) {
            upsertHiLiaoChat(msgToSave);
            lastUpsertTime = now;
          }
        };

        fullText = await runOnce({ relaxed: false });

        const out = parseStreamedOutput(fullText);
        const allowed = !!(out && out.allowed);
        const code = out && out.code != null ? String(out.code) : '';
        const korean = normalizeBubbleText(out && out.korean != null ? String(out.korean) : '');
        const explanation = out && out.explanation != null ? String(out.explanation) : '';
        const message = out && out.message != null ? String(out.message) : '';

        const shouldRetryByLangFalsePositive =
          !allowed
          && code === 'OTHER'
          && langOk
          && /(仅支持中文或英文输入|只支持中文和英文输入)/.test(message || '');
        if (shouldRetryByLangFalsePositive) {
          try {
            console.log('[hi-chat] send retry relaxed', { id });
          } catch (e) {}
          fullText = await runOnce({ relaxed: true });
        }

        const finalOut = parseStreamedOutput(fullText);
        const finalAllowed = !!(finalOut && finalOut.allowed);
        const finalCode = finalOut && finalOut.code != null ? String(finalOut.code) : '';
        const finalKorean = normalizeBubbleText(finalOut && finalOut.korean != null ? String(finalOut.korean) : '');
        const finalExplanation = finalOut && finalOut.explanation != null ? String(finalOut.explanation) : '';
        const finalMessage = finalOut && finalOut.message != null ? String(finalOut.message) : '';

        try {
          console.log('[hi-chat] send streamAi done', { id, allowed: finalAllowed, code: finalCode, len: fullText.length });
        } catch (e) {}

        const updated = {
          ...pending,
          blocked: !finalAllowed,
          status: 'done',
          korean: finalAllowed ? finalKorean : '',
          explanation: finalAllowed ? finalExplanation : '',
          updatedAt: Date.now(),
          rejectReason: finalAllowed ? '' : finalMessage,
          violationCode: finalAllowed ? 'OK' : finalCode,
          message: finalAllowed ? '' : finalMessage,
          model: 'hunyuan-turbos-latest',
          promptVersion: shouldRetryByLangFalsePositive ? 'v4r' : 'v4'
        };
        upsertHiLiaoChat(updated);
        if (finalAllowed) {
          enqueueHiLiaoChatCloudWrite(updated);
          this.refreshUnuploadedCount();
        }
        this.refreshChat(true);

        if (!finalAllowed) {
          const shouldStrike = finalCode === 'PORN' || finalCode === 'VIOLENCE';
          if (shouldStrike) {
            const store = bumpViolation();
            const remaining = Math.max(0, HI_LIAO_MAX_VIOLATIONS - (Number(store.count) || 0));
            try {
              wx.showToast({ title: finalMessage || `内容不合规，剩余 ${remaining} 次`, icon: 'none' });
            } catch (e) {}
            if (Number(store.count) >= HI_LIAO_MAX_VIOLATIONS) {
              this.setData({ banned: true, banCount: Number(store.count) || 0, canSend: false, inputText: '' });
              try {
                wx.showModal({
                  title: '功能已禁用',
                  content: '今日多次发布不合规内容，HI~已禁用，明日自动恢复。',
                  showCancel: false
                });
              } catch (e) {}
            }
          } else {
            try {
              wx.showToast({ title: finalMessage || '内容不合规，已拦截', icon: 'none' });
            } catch (e) {}
          }
        }
      } catch (err) {
        const msg = pickWxErrMessage(err);
        try {
          console.error('[hi-chat] send streamAi fail', { id, msg, partialLen: fullText ? fullText.length : 0 }, err);
        } catch (e) {}

        // If we have some content, save it as done (partial) so it syncs
        if (fullText && fullText.trim().length > 0) {
          const out = parseStreamedOutput(fullText);
          const allowed = !!(out && out.allowed);
          const korean = normalizeBubbleText(out && out.korean != null ? String(out.korean) : '');
          const explanation = out && out.explanation != null ? String(out.explanation) : '';
          const message = out && out.message != null ? String(out.message) : '';
          
          const partialDone = {
            ...pending,
            blocked: !allowed,
            status: 'done', // Mark as done to ensure sync
            korean: allowed ? korean : '',
            explanation: allowed ? explanation : '',
            updatedAt: Date.now(),
            rejectReason: allowed ? '' : message,
            violationCode: allowed ? 'OK' : (out.code || ''),
            message: allowed ? '' : message,
            model: 'hunyuan-turbos-latest',
            promptVersion: 'v3'
          };
          upsertHiLiaoChat(partialDone);
          if (allowed) {
            enqueueHiLiaoChatCloudWrite(partialDone);
            this.refreshUnuploadedCount();
          }
          this.refreshChat(true);
          try {
            wx.showToast({ title: '生成中断，已保存部分', icon: 'none' });
          } catch (e) {}
          return;
        }

        const failed = {
          ...pending,
          status: 'failed',
          updatedAt: Date.now(),
          model: 'hunyuan-turbos-latest',
          promptVersion: 'v3'
        };
        upsertHiLiaoChat(failed);
        this.refreshChat(true);
        try {
          const title = msg.includes('timeout') ? '生成超时，请重试' : (msg ? `生成失败：${msg}` : '生成失败');
          showToastSafe(title);
        } catch (e) {}
      } finally {
        const nextCanSend = !this.data.unsupported && !this.data.banned && !!String(this.data.inputText || '').trim();
        this.setData({ sending: false, canSend: nextCanSend });
      }
    } catch (e) {
      try {
        console.error('[hi-chat] send outer fail', e);
      } catch (err) {}
      showToastSafe('发布失败，请重试');
      const nextCanSend =
        !this.data.unsupported && !this.data.banned && !!String(this.data.inputText || '').trim() && !this.data.sending;
      try {
        this.setData({ sending: false, canSend: nextCanSend });
      } catch (err) {}
    }
  }
});
