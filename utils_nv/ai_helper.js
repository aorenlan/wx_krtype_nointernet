
const createAiModel = () => {
  try {
    const ai = wx.cloud && wx.cloud.extend && wx.cloud.extend.AI;
    if (!ai || typeof ai.createModel !== 'function') return null;
    return ai.createModel('hunyuan-exp');
  } catch (e) {
    return null;
  }
};

const buildStoryPrompt = (elements, words, grammar) => {
  const { who, when, where, action } = elements;
  const wordList = words.map(w => `${w.word}(${w.meaning})`).join(', ');
  const grammarList = grammar.map(g => `${g.grammar}(${g.meaning})`).join(', ');

  const rule = [
    '你是一个韩语故事创作助手。',
    '任务：根据用户提供的元素、单词和语法，创作一个简短有趣的韩语故事。',
    '要求：',
    '1. 必须使用提供的所有单词和语法。',
    '2. **核心指令（违反必究 - 最高优先级）**：提供的语法项（如 "-(으)세요", "이/가"）仅为原型，**绝不能**直接出现在生成的句子中！',
    '   - **必须活用**：你必须根据韩语语法规则，将语法原型与前面的单词进行**变位融合**。',
    '   - **严禁半截语法**：正文中绝对不能出现 `(으)`, `(이)`, `/`, `-` 等语法描述符号。这些符号只存在于教科书中，绝不能出现在最终的故事里。',
    '   - **正确示例**：',
    '       - 输入语法 `-(으)세요` + 单词 `가다` -> 正确输出：`가세요` (融合变位)',
    '       - 错误输出：`가-(으)세요` (错误！), `가 (으)세요` (错误！), `가세요-(으)세요` (错误！)',
    '   - **正确示例**：',
    '       - 输入语法 `이/가` + 单词 `친구` -> 正确输出：`친구가` (根据韵尾选择)',
    '       - 错误输出：`친구 이/가` (错误！), `친구이/가` (错误！)',
    '   - **正确示例**：',
    '       - 输入语法 `-(으)ㄹ 수 있다` + 单词 `먹다` -> 正确输出：`먹을 수 있다` (融合变位)',
    '       - 错误输出：`먹다-(으)ㄹ 수 있다` (错误！), `먹다 (으)ㄹ 수 있다` (错误！)',
    '3. **语法正确性**：',
    '   - 必须确保韩语语法的自然和正确，助词使用得当，时态前后一致。',
    '   - 故事内容必须积极向上。**严禁**包含任何色情、暴力、政治敏感内容。',
    '4. **安全审查（最高优先级）**：请首先审查用户输入的“人物”和“场景”等元素。如果包含以下内容，请**立即**停止生成，直接输出拒绝标识：',
    '   - 涉黄内容（如AV演员、软色情描述等）',
    '   - 涉暴内容（如犯罪人员、血腥暴力描述等）',
    '   - 政治敏感内容（如国家领导人、政治人物、敏感历史事件等）',
    '   - 其他违法违规内容',
    '5. 重点单词和语法在韩语原文中请使用 Markdown **加粗** 标记，例如：**单词**。',
    '6. 中文翻译只输出纯文本，**严禁**使用任何 Markdown 标记（不要加粗），必须是地道的中文。',
    '7. 必须在故事结束后，明确输出 ===WORDS=== 和 ===GRAMMAR=== 区域。',
    '8. 输出格式必须严格按照下文要求。',
    '9. 生成的韩语部分**严禁**包含中文字符。但是，对于用户提供的“人物”名称，如果是英文名（如 Lisa, Tom），请**直接保留英文**，不要强行音译成韩语；如果是中文名，请音译成韩语。其他专有名词尽量使用韩语。',
    '10. **最终自查（重要）**：输出前请再次通读全文。如果发现句子中包含 `(`、`)`、`/`、`-` 等符号，或者包含 `-(으)`、`이/가`、`을/를` 等未变位的半截语法，**必须立即修正**。请确保每一个句子都是完整、自然、符合韩语语法的句子。',
    '11. 单词和语法解析部分，每一行都必须严格遵循“韩语词 - 中文含义 (标签: xxx)”的格式。',
    '',
    '输入元素：',
    `人物：${who}`,
    `时间：${when}`,
    `场景：${where}`,
    `动作：${action}`,
    `必选单词：${wordList}`,
    `必选语法：${grammarList}`,
    '',
    '输出格式：',
    '===STORY_START===',
    '===SEGMENT===',
    'KR: (韩语第一句/段，重点词语法加粗)',
    'CN: (中文翻译，纯文本)',
    '===SEGMENT===',
    'KR: (韩语第二句/段...)',
    'CN: (中文翻译...)',
    '...',
    '===STORY_END===',
    '',
    '===WORDS===',
    '(列出文中使用的重点单词。对于上述"必选单词"，请标注(标签: 本课)；对于你额外补充的词汇，请标注(标签: 拓展)。每行一个，格式：单词 - 含义 (标签: 本课/拓展)。请务必多列举一些非本课的**拓展**词汇，帮助用户扩大词汇量)',
    '',
    '===GRAMMAR===',
    '(列出文中使用的重点语法。对于上述"必选语法"，请标注(标签: 本课)；对于你额外补充的语法，请标注(标签: 拓展)。每行一个，格式：语法 - 含义 (标签: 本课/拓展)。请务必多列举一些非本课的**拓展**语法，帮助用户扩大知识面)',
    '',
    '若内容违规（涉黄/涉暴/涉政/敏感人物），请**仅**输出以下内容（不要输出其他任何字符）：',
    '===BLOCKED:CODE===',
    '内容包含敏感信息（人物或情节），无法生成。'
  ].join('\n');

  return [
    { role: 'system', content: rule },
    { role: 'user', content: '请开始创作。' }
  ];
};

const parseStreamedOutput = (text) => {
  let allowed = true;
  let code = 'OK';
  let segments = [];
  let words = '';
  let grammar = '';
  let message = '';

  const blockMatch = text.match(/={3,}BLOCKED:([A-Z]+)(?:={3,})?/i);
  if (blockMatch) {
    allowed = false;
    code = blockMatch[1].toUpperCase();
    message = (text.split(blockMatch[0])[1] || '').trim();
    return { allowed, code, segments, words, grammar, message };
  }

  // Parse segments
  const storyMatch = text.match(/={3,}STORY_START={3,}\s*([\s\S]*?)(?=={3,}STORY_END={3,}|$)/i);
  if (storyMatch) {
    const storyContent = storyMatch[1];
    const segParts = storyContent.split(/={3,}SEGMENT={3,}/i);
    segParts.forEach(part => {
      const trimmed = part.trim();
      if (!trimmed) return;
      
      const krMatch = trimmed.match(/KR:\s*([\s\S]*?)(?=CN:|$)/i);
      const cnMatch = trimmed.match(/CN:\s*([\s\S]*?)(?=$)/i);
      
      if (krMatch) {
        const kr = krMatch[1].trim();
        let cn = cnMatch ? cnMatch[1].trim().replace(/\*\*/g, '') : '';
        // Clean streaming artifacts from CN (like ===SEGMENT, ===STORY_END, or just ===)
        cn = cn.replace(/\s*={2,}[A-Z_]*={0,}$/i, '');
        if (kr) {
          segments.push({ korean: kr, chinese: cn });
        }
      }
    });
  }

  const wMatch = text.match(/={3,}WORDS={3,}\s*([\s\S]*?)(?=={3,}GRAMMAR={3,}|$)/i);
  const gMatch = text.match(/={3,}GRAMMAR={3,}\s*([\s\S]*?)(?=$)/i);

  // Fallback: if segments were parsed but words/grammar sections are missing or empty in strict regex,
  // try to find them by simpler splitting if STORY_END exists
  if ((!wMatch || !wMatch[1].trim()) && (!gMatch || !gMatch[1].trim()) && text.includes('===STORY_END===')) {
     const afterStory = text.split('===STORY_END===')[1] || '';
     const parts = afterStory.split('===GRAMMAR===');
     
     let rawWords = parts[0] || '';
     let rawGrammar = parts[1] || '';
     
     // Remove WORDS marker if present
     rawWords = rawWords.replace(/={3,}WORDS={3,}/i, '').trim();
     
     words = rawWords;
     grammar = rawGrammar.trim();
  } else {
     if (wMatch) words = wMatch[1].trim();
     if (gMatch) grammar = gMatch[1].trim();
  }

  const cleanup = (str) => str.replace(/\s*={2,}[A-Z_]*={0,}$/i, '').trim();
  words = cleanup(words);
  grammar = cleanup(grammar);

  return { allowed, code, segments, words, grammar, message };
};

const streamAi = async function* (model, elements, words, grammar) {
  if (!model) throw new Error('AI unavailable');
  const messages = buildStoryPrompt(elements, words, grammar);
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

module.exports = {
  createAiModel,
  streamAi,
  parseStreamedOutput
};
