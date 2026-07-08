const RAW_COFFEE_SCENE = {
  id: 'col-mraibn',
  title: '咖啡馆点单场景',
  topic: '购买咖啡',
  subtitle: 'Coffee Shop',
  style: '韩系教材漫画',
  mode: 'tap-to-learn',
  coordinateSystem: 'percent',
  aspectRatio: '16:9',
  image: 'https://enoss.aorenlan.fun/kr_picturebook/point_read/mraibn8j/scene_mrajn319.png',
  phrases: [
    {
      id: 'hello-one-iced-americano-please',
      zh: '您好，我要一杯冰美式咖啡。',
      kr: '안녕하세요, 아이스 아메리카노 한 잔 주세요.',
      roman: 'an-nyeong-ha-se-yo, a-i-seu a-me-ri-ka-no han jan ju-se-yo.',
      en: 'Hello, one iced Americano please.',
      usage: '点单时向咖啡师开口',
      audio: 'https://enoss.aorenlan.fun/kr_picturebook/point_read_phrase_audio/mraibn8j/phrase1_mravgyr0.mp3'
    },
    {
      id: 'can-i-earn-points-here',
      zh: '这里可以积分吗？',
      kr: '적립 가능한가요?',
      roman: 'jeok-rip ga-neung-han-ga-yo?',
      en: 'Can I earn points here?',
      usage: '出示会员卡或询问积分',
      audio: ''
    },
    {
      id: 'some-syrup-and-a-straw-please',
      zh: '请给我糖浆和吸管。',
      kr: '시럽이랑 빨대 주세요.',
      roman: 'si-reo-bi-rang ppal-dae ju-se-yo.',
      en: 'Some syrup and a straw, please.',
      usage: '取餐时索要配料',
      audio: ''
    },
    {
      id: 'a-hot-latte-large-size-please',
      zh: '热的拿铁，大杯。',
      kr: '따뜻한 라떼 라지 사이즈로 주세요.',
      roman: 'tta-tteu-tan ra-tte ra-ji sa-i-jeu-ro ju-se-yo.',
      en: 'A hot latte, large size please.',
      usage: '指定温度和杯型',
      audio: ''
    },
    {
      id: 'could-you-warm-up-this-croissant',
      zh: '可以帮我加热牛角包吗？',
      kr: '크루아상 좀 데워 주실 수 있나요?',
      roman: 'keu-ru-a-sang jom de-wo ju-sil su in-na-yo?',
      en: 'Could you warm up this croissant?',
      usage: '要求加热面包',
      audio: ''
    },
    {
      id: 'a-cup-of-water-please',
      zh: '请给我一杯水。',
      kr: '물 한 잔 주세요.',
      roman: 'mul han jan ju-se-yo.',
      en: 'A cup of water, please.',
      usage: '单独要饮用水',
      audio: ''
    },
    {
      id: 'can-i-sit-here',
      zh: '这里可以坐吗？',
      kr: '여기 앉아도 돼요?',
      roman: 'yeo-gi an-ja-do dwae-yo?',
      en: 'Can I sit here?',
      usage: '寻找座位时确认',
      audio: ''
    },
    {
      id: 'to-go-please',
      zh: '我要打包带走。',
      kr: '테이크아웃이요.',
      roman: 'te-i-keu-a-u-si-yo.',
      en: 'To go, please.',
      usage: '点单时说明外带',
      audio: ''
    },
    {
      id: 'one-more-napkin-please',
      zh: '可以再给我一张纸巾吗？',
      kr: '냅킨 한 장만 더 주시겠어요?',
      roman: 'naep-kin han jang-man deo ju-si-ge-sseo-yo?',
      en: 'One more napkin, please.',
      usage: '需要额外纸巾时',
      audio: ''
    },
    {
      id: 'do-you-have-reusable-cup-sleeves',
      zh: '有可循环使用的杯套吗？',
      kr: '재사용 컵 슬리브 있어요?',
      roman: 'jae-sa-yong keop seul-ri-beu i-sseo-yo?',
      en: 'Do you have reusable cup sleeves?',
      usage: '环保询问杯套',
      audio: ''
    }
  ],
  hotspots: [
    ['barista', 53.1, 41.4, '咖啡师', '바리스타', 'ba-ri-seu-ta', 'barista', '制作咖啡的人', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word1_mravhdte.mp3'],
    ['customer', 29.4, 54, '顾客', '손님', 'son-nim', 'customer', '买咖啡的人', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word2_mravhfes.mp3'],
    ['espresso-machine', 79.3, 42.9, '浓缩咖啡机', '에스프레소 머신', 'e-seu-peu-re-so-meo-sin', 'espresso machine', '制作浓缩咖啡的机器', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word3_mravhgzd.mp3'],
    ['coffee-cup', 33.3, 89.8, '咖啡杯', '커피잔', 'keo-pi-jan', 'coffee cup', '盛咖啡的杯子', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word4_mravhih6.mp3'],
    ['menu-board', 69.1, 10.6, '菜单板', '메뉴판', 'me-nyu-pan', 'menu board', '显示饮品的板子', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word5_mravhjyk.mp3'],
    ['cash-register', 42.3, 46.3, '收银机', '포스기', 'po-seu-gi', 'cash register', '结算用的 POS 机', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word6_mravhlj9.mp3'],
    ['coffee-beans', 78.1, 64.9, '咖啡豆', '커피콩', 'keo-pi-kong', 'coffee beans', '制作咖啡的豆子', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word7_mravhn0v.mp3'],
    ['milk-carton', 85.9, 63.7, '牛奶盒', '우유팩', 'u-yu-paek', 'milk carton', '装牛奶的纸盒', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word8_mravhoje.mp3'],
    ['syrup-bottle', 91.6, 60.7, '糖浆瓶', '시럽병', 'si-reop-byeong', 'syrup bottle', '装糖浆的瓶子', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word9_mravhqc0.mp3'],
    ['stirrer', 53.1, 88.2, '搅拌棒', '스틱', 'seu-tik', 'stirrer', '搅拌饮品的棒子', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word10_mravhrrr.mp3'],
    ['napkin', 60.9, 89.3, '纸巾', '냅킨', 'naep-kin', 'napkin', '擦拭用的纸张', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word11_mravhtap.mp3'],
    ['tray', 16.6, 91.8, '托盘', '쟁반', 'jaeng-ban', 'tray', '端饮品用的盘子', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word12_mravhupk.mp3'],
    ['croissant', 72.6, 88.1, '牛角包', '크루아상', 'keu-ru-a-sang', 'croissant', '法式可颂面包', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word13_mravhw9h.mp3'],
    ['straw', 84.6, 84.2, '吸管', '빨대', 'ppal-dae', 'straw', '喝饮料的管子', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word14_mravhxl7.mp3'],
    ['cup-sleeve', 92.2, 89.1, '杯套', '컵 슬리브', 'keop-seul-li-beu', 'cup sleeve', '隔热纸套', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word15_mravhz5o.mp3'],
    ['receipt', 10, 87.5, '小票', '영수증', 'yeong-su-jeung', 'receipt', '点单后收到的收据凭证', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word16_mravi0o4.mp3'],
    ['americano', 17.6, 70.3, '美式', '아메리카노', 'a-me-ri-ka-no', 'americano', '浓缩咖啡加水的美式咖啡', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word17_mravi22j.mp3'],
    ['cake', 45.2, 83.6, '蛋糕', '케이크', 'ke-i-keu', 'cake', '搭配咖啡的甜点蛋糕', 'https://enoss.aorenlan.fun/kr_picturebook/point_read_audio/mraibn8j/word18_mravi3qd.mp3']
  ]
};

const HOTSPOT_EXTRAS = {
  barista: {
    type: 'core',
    strength: '核心',
    exampleKo: '바리스타에게 아이스 아메리카노를 주문해요.',
    exampleCn: '向咖啡师点一杯冰美式。',
    related: ['주문하다', '카페', '손님']
  },
  customer: {
    type: 'core',
    strength: '核心',
    exampleKo: '손님이 카운터 앞에서 기다리고 있어요.',
    exampleCn: '顾客正在柜台前等待。',
    related: ['기다리다', '주문', '카운터']
  },
  'espresso-machine': {
    type: 'object',
    strength: '核心',
    exampleKo: '에스프레소 머신으로 커피를 내려요.',
    exampleCn: '用浓缩咖啡机萃取咖啡。',
    related: ['커피', '내리다', '기계']
  },
  'coffee-cup': {
    type: 'object',
    strength: '常用',
    exampleKo: '커피잔에 커피가 담겨 있어요.',
    exampleCn: '咖啡杯里装着咖啡。',
    related: ['컵', '담기다', '커피']
  },
  'menu-board': {
    type: 'scene',
    strength: '核心',
    exampleKo: '메뉴판을 보고 음료를 골라요.',
    exampleCn: '看菜单板选择饮品。',
    related: ['메뉴', '고르다', '가격']
  },
  'cash-register': {
    type: 'object',
    strength: '常用',
    exampleKo: '포스기에서 카드로 계산해요.',
    exampleCn: '在收银机用卡结账。',
    related: ['계산하다', '카드', '영수증']
  },
  'coffee-beans': {
    type: 'object',
    strength: '常用',
    exampleKo: '커피콩 향이 정말 좋아요.',
    exampleCn: '咖啡豆的香味真好。',
    related: ['향', '원두', '갈다']
  },
  'milk-carton': {
    type: 'object',
    strength: '常用',
    exampleKo: '라떼에는 우유팩 속 우유가 들어가요.',
    exampleCn: '拿铁里会加入牛奶盒里的牛奶。',
    related: ['우유', '라떼', '넣다']
  },
  'syrup-bottle': {
    type: 'object',
    strength: '常用',
    exampleKo: '시럽병에서 시럽을 조금만 넣어 주세요.',
    exampleCn: '请从糖浆瓶里只加一点糖浆。',
    related: ['시럽', '조금만', '달다']
  },
  stirrer: {
    type: 'object',
    strength: '场景',
    exampleKo: '스틱으로 커피를 저어요.',
    exampleCn: '用搅拌棒搅咖啡。',
    related: ['젓다', '커피', '빨대']
  },
  napkin: {
    type: 'object',
    strength: '常用',
    exampleKo: '냅킨 한 장만 더 주시겠어요?',
    exampleCn: '可以再给我一张纸巾吗？',
    related: ['한 장', '더', '주세요']
  },
  tray: {
    type: 'object',
    strength: '常用',
    exampleKo: '쟁반 위에 커피와 케이크를 올려요.',
    exampleCn: '把咖啡和蛋糕放到托盘上。',
    related: ['위에', '올리다', '케이크']
  },
  croissant: {
    type: 'object',
    strength: '常用',
    exampleKo: '크루아상 좀 데워 주실 수 있나요?',
    exampleCn: '可以帮我加热牛角包吗？',
    related: ['데우다', '빵', '하나']
  },
  straw: {
    type: 'object',
    strength: '常用',
    exampleKo: '빨대가 필요해요.',
    exampleCn: '我需要吸管。',
    related: ['필요하다', '음료', '주세요']
  },
  'cup-sleeve': {
    type: 'object',
    strength: '场景',
    exampleKo: '컵 슬리브가 있나요?',
    exampleCn: '有杯套吗？',
    related: ['컵', '뜨겁다', '있나요']
  },
  receipt: {
    type: 'object',
    strength: '常用',
    exampleKo: '영수증을 주세요.',
    exampleCn: '请给我小票。',
    related: ['계산', '주세요', '카드']
  },
  americano: {
    type: 'core',
    strength: '核心',
    exampleKo: '아이스 아메리카노 한 잔 주세요.',
    exampleCn: '请给我一杯冰美式。',
    related: ['아이스', '한 잔', '주문']
  },
  cake: {
    type: 'object',
    strength: '常用',
    exampleKo: '케이크도 같이 주문할게요.',
    exampleCn: '蛋糕也一起点。',
    related: ['같이', '주문하다', '디저트']
  }
};

function toShortLabel(korean) {
  const text = String(korean || '');
  if (text.length <= 4) return text;
  return text.split(' ')[0] || text.slice(0, 4);
}

function normalizeHotspot(row) {
  const [id, x, y, zh, kr, roman, en, explanation, audio] = row;
  const extra = HOTSPOT_EXTRAS[id] || {};
  return {
    id,
    x,
    y,
    korean: kr,
    short: toShortLabel(kr),
    roman,
    cn: zh,
    en,
    audio,
    type: extra.type || 'object',
    strength: extra.strength || '常用',
    exampleKo: extra.exampleKo || `${kr}을/를 주세요.`,
    exampleCn: extra.exampleCn || `请给我${zh}。`,
    note: extra.note || explanation,
    related: extra.related || []
  };
}

function normalizePhrase(phrase, index) {
  return {
    ...phrase,
    index,
    indexLabel: String(index + 1).padStart(2, '0')
  };
}

const TAP_SCENE_DEMO = {
  id: RAW_COFFEE_SCENE.id,
  title: '咖啡馆',
  subtitle: RAW_COFFEE_SCENE.subtitle,
  topic: RAW_COFFEE_SCENE.topic,
  theme: 'coffee',
  image: RAW_COFFEE_SCENE.image,
  prompt: '点图学词，也能听高频点单句',
  hotspots: RAW_COFFEE_SCENE.hotspots.map(normalizeHotspot),
  phrases: RAW_COFFEE_SCENE.phrases.map(normalizePhrase)
};

module.exports = {
  TAP_SCENE_DEMO
};
