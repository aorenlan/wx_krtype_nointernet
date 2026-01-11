export const MISTAKES_CATEGORY = 'Mistakes (错题本)';

export const CATEGORIES = [
  'CET4',
  'CET6',
  'TOEFL',
  'IELTS',
  'Business',
  MISTAKES_CATEGORY
];

export const DEFAULT_SETTINGS = {
  practiceMode: 'study', // study, flash, blink
  flashDuration: 2000,
  blinkInterval: 2000,
  repeatCount: 1,
  enableTimer: false,
  timerDuration: 10,
  enableKeyboardHint: true,
  autoPronounce: true,
  cardShowMeaning: true,
  cardShowWord: true,
  caseSensitive: false,
  darkMode: false,
  autoCheckSpelling: true,
  showHint: true,
  pronounceMeaning: false,
  category: 'CET4'
};

export const MOCK_WORDS = [
  {
    id: '1',
    word: 'abandon',
    phonetic: '/əˈbændən/',
    meaning: 'v. 放弃，抛弃',
    example: 'They had to abandon the car.',
    translation: '他们不得不弃车而去。'
  },
  {
    id: '2',
    word: 'ability',
    phonetic: '/əˈbɪləti/',
    meaning: 'n. 能力，才干',
    example: 'She has the ability to manage the team.',
    translation: '她有能力管理这个团队。'
  },
  {
    id: '3',
    word: 'absolute',
    phonetic: '/ˈæbsəluːt/',
    meaning: 'adj. 绝对的，完全的',
    example: 'I have absolute confidence in you.',
    translation: '我对你绝对有信心。'
  },
  {
    id: '4',
    word: 'curiosity',
    phonetic: '/ˌkjʊəriˈɒsəti/',
    meaning: 'n. 好奇心',
    example: 'Curiosity killed the cat.',
    translation: '好奇害死猫。'
  },
  {
    id: '5',
    word: 'generous',
    phonetic: '/ˈdʒenərəs/',
    meaning: 'adj. 慷慨的，大方的',
    example: 'He is very generous with his time.',
    translation: '他在时间上非常慷慨。'
  }
];

export const ARTICLE_LEVELS = [
  { id: 'cet4', name: '四级' },
  { id: 'cet6', name: '六级' },
  { id: 'sat', name: 'SAT' },
  { id: 'toefl', name: '托福' },
  { id: 'juniorhigh', name: '初中' },
  { id: 'seniorhigh', name: '高中' },
  { id: 'postgrad', name: '考研' }
];

export const REMOTE_LEVEL_MAP = {
  'CET4': 'cet4',
  'CET6': 'cet6',
  'SAT': 'sat',
  'TOEFL': 'toefl',
  'JUNIORHIGH': 'juniorhigh',
  'SENIORHIGH': 'seniorhigh',
  'POSTGRAD': 'postgrad'
};

export const REMOTE_AUDIO_MAP = {
  'cet4': 'CET4',
  'cet6': 'CET6',
  'sat': 'SAT',
  'toefl': 'TOEFL',
  'juniorhigh': 'JUNIORHIGH',
  'seniorhigh': 'SENIORHIGH',
  'postgrad': 'POSTGRAD'
};


// 从配置文件导入OSS地址（保持远程地址不变）
import { OSS_ARTICLE_BASE, OSS_AUDIO_BASE } from './config';

export const REMOTE_ARTICLE_BUNDLE_URL = `${OSS_ARTICLE_BASE}/2025-12-20_%E5%85%A8%E7%AD%89%E7%BA%A7%E5%8F%8C%E8%AF%AD%E6%96%87%E7%AB%A0.json`;
export const REMOTE_ARTICLE_AUDIO_BASE_URL = `${OSS_ARTICLE_BASE}/`;

export const MOCK_ARTICLES = {
  middle_high: [
    {
      id: 'mh_001',
      title: 'The Future of Work in the Era of AI',
      date: '2025-12-29',
      preview: 'The rapid development of artificial intelligence has sparked a global conversation...',
      keywords: ['rapid', 'sparked', 'artificial intelligence', 'conversation', 'future'],
      en: [
        'The rapid development of artificial intelligence has sparked a global conversation about the future of work.',
        'Some people worry that machines will replace humans, while others believe AI will create new kinds of jobs.',
        'In reality, the future will likely depend on how we learn, adapt, and collaborate with technology.'
      ],
      zh: [
        '人工智能的快速发展引发了关于工作未来的全球讨论。',
        '一些人担心机器会取代人类，而另一些人认为 AI 会创造新的工作类型。',
        '实际上，未来很可能取决于我们如何学习、适应，并与技术协作。'
      ]
    },
    {
      id: 'mh_002',
      title: 'Why Reading Every Day Matters',
      date: '2025-12-28',
      preview: 'Reading is like exercise for your brain. Even ten minutes a day can make a difference...',
      keywords: ['exercise', 'brain', 'difference', 'habit'],
      en: [
        'Reading is like exercise for your brain. It strengthens your vocabulary and improves your focus.',
        'Even ten minutes a day can make a difference if you do it consistently.',
        'Start with topics you enjoy, and turn reading into a habit.'
      ],
      zh: [
        '阅读就像大脑的锻炼。它能增强词汇量并提高专注力。',
        '如果坚持下去，即使每天十分钟也会带来改变。',
        '从你喜欢的话题开始，把阅读变成一种习惯。'
      ]
    }
  ],
  cet4: [
    {
      id: 'cet4_001',
      title: 'A Simple Guide to Healthy Sleep',
      date: '2025-12-27',
      preview: 'Good sleep is not a luxury; it is a necessity. The key is to build a stable routine...',
      keywords: ['luxury', 'necessity', 'routine', 'stable'],
      en: [
        'Good sleep is not a luxury; it is a necessity for learning and memory.',
        'The key is to build a stable routine: go to bed and wake up at similar times.',
        'Reduce screen time at night, and your body will rest more easily.'
      ],
      zh: [
        '良好睡眠不是奢侈品；它是学习和记忆的必需品。',
        '关键是建立稳定的作息：在相近的时间睡觉和起床。',
        '减少夜间屏幕使用，你的身体会更容易休息。'
      ]
    }
  ],
  cet6: [
    {
      id: 'cet6_001',
      title: 'Technology and Modern Communication',
      date: '2025-12-26',
      preview: 'While technology makes communication faster, it also changes the way we understand each other...',
      keywords: ['communication', 'understand', 'changes', 'technology'],
      en: [
        'While technology makes communication faster, it also changes the way we understand each other.',
        'Messages are shorter and more frequent, which can reduce deep conversations.',
        'To communicate better, we must choose the right channel and slow down when it matters.'
      ],
      zh: [
        '虽然科技让交流更快，但也改变了我们理解彼此的方式。',
        '信息更短也更频繁，这可能减少深入交流。',
        '为了更好沟通，我们需要选择合适渠道，并在重要时刻放慢节奏。'
      ]
    }
  ],
  postgrad: [
    {
      id: 'pg_001',
      title: 'How to Build Long-Term Learning',
      date: '2025-12-25',
      preview: 'Long-term learning is a system, not a goal. Small feedback loops keep motivation alive...',
      keywords: ['system', 'goal', 'feedback', 'motivation'],
      en: [
        'Long-term learning is a system, not a goal.',
        'Small feedback loops keep motivation alive and reduce the fear of failure.',
        'Track progress, reflect weekly, and adjust your strategy.'
      ],
      zh: [
        '长期学习是一套系统，而不是一个目标。',
        '小的反馈循环能保持动力并减少失败恐惧。',
        '记录进展、每周复盘，并调整策略。'
      ]
    }
  ],
  sat: [
    {
      id: 'sat_001',
      title: 'Critical Thinking in Daily Decisions',
      date: '2025-12-24',
      preview: 'Critical thinking helps you separate facts from opinions. It starts with asking better questions...',
      keywords: ['critical', 'separate', 'facts', 'opinions', 'questions'],
      en: [
        'Critical thinking helps you separate facts from opinions.',
        'It starts with asking better questions and checking evidence.',
        'In daily decisions, it can save time and reduce regret.'
      ],
      zh: [
        '批判性思维帮助你区分事实与观点。',
        '它从提出更好的问题并核查证据开始。',
        '在日常决策中，它能节省时间并减少后悔。'
      ]
    }
  ],
  toefl: [
    {
      id: 'toefl_001',
      title: 'Urban Life and Public Transportation',
      date: '2025-12-23',
      preview: 'Public transportation reduces traffic and pollution. However, cities must invest in reliability...',
      keywords: ['transportation', 'traffic', 'pollution', 'reliability', 'invest'],
      en: [
        'Public transportation reduces traffic and pollution in large cities.',
        'However, cities must invest in reliability and safety to earn public trust.',
        'When transit works well, it improves both economic efficiency and quality of life.'
      ],
      zh: [
        '公共交通能减少大城市的拥堵和污染。',
        '然而，城市必须投资可靠性与安全性，以赢得公众信任。',
        '当交通系统运行良好时，它能提升经济效率和生活质量。'
      ]
    }
  ]
};
