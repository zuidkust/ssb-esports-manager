// 开局 6 人。数值和台词按 docs/人设稿-开局6人.md。
// 旧 id：shidian / dishu / piju。吊隆与吊龙拼音相同，id 仍是 diaolong，只改显示名。
// 7 属性是人设稿第 8 节的相对强弱换成开局均值约 47 的初值，不是最终平衡。

export type Position = 'top' | 'jungle' | 'mid' | 'adc' | 'support';
export const POSITIONS: Position[] = ['top', 'jungle', 'mid', 'adc', 'support'];
export const POSITION_CN: Record<Position, string> = { top: '上单', jungle: '打野', mid: '中单', adc: 'AD', support: '辅助' };

export const ABILITY_KEYS = ['lane', 'roam', 'fight', 'sense', 'mech', 'pool', 'mental'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];
export const ABILITY_CN: Record<AbilityKey, string> = { lane: '对线', roam: '游走', fight: '团战', sense: '意识', mech: '操作', pool: '英雄池', mental: '心态' };

export const PERSONA_KEYS = ['嘴硬', '心态倾向', '胜负心', '逆风意志', '创新欲', '话痨', '摸鱼倾向', '甩锅倾向', '爱睡觉'] as const;
export type PersonaKey = (typeof PERSONA_KEYS)[number];

export interface Look {
  height: number;
  girth: number;
  glasses: boolean;
  flipflops?: boolean;
  shirt: number;
  pants: number;
  hair: number;
  skin: number;
  shoes?: number;
  hairStyle: 'messy' | 'short' | 'side' | 'buzz';
}

export interface Taste {
  /** 本命菜品 id。空数组表示不挑。 */
  favorites: string[];
  favoriteMul: number;
  /** 菜单里几乎不点的菜。 */
  avoids: string[];
  /** 菜单上还没有的忌口，先写在人物卡上。 */
  avoidNote?: string;
  drinks: string[];
  snacks: string[];
  /** 请奶茶时换成可乐，也不爱把奶茶当正餐。 */
  noMilktea?: boolean;
}

export interface MemberDef {
  id: string;
  name: string;
  aliases: string[];
  position: Position;
  secondary?: Position;
  /** 团队角色，见人设稿第 7 节。 */
  roles: string[];
  traits: string[];
  tagline: string;
  arrive: 'early' | 'normal';
  ability: Record<AbilityKey, number>;
  persona: Record<PersonaKey, number>;
  heroes: string[];
  avoidHeroes?: string[];
  heroNote?: string;
  signature: string[];
  winLines: string[];
  loseLines: string[];
  pressure: string[];
  cheer: string;
  softSpots: string[];
  habits: string[];
  chatLines: string[];
  taste: Taste;
  /** 加在刷手机 App 基础权重上。 */
  phoneBias: Partial<Record<string, number>>;
  look: Look;
}

export const ROSTER: MemberDef[] = [
  {
    id: 'aji', name: '阿鸡', aliases: [],
    position: 'top', secondary: 'jungle',
    roles: ['开心果', '背锅'],
    traits: ['发明流', '背锅侠', '五个位置都能补'],
    tagline: '体系工具人，野路子出装，队里的笑点和背锅侠',
    arrive: 'early',
    ability: { lane: 44, roam: 42, fight: 42, sense: 32, mech: 32, pool: 64, mental: 78 },
    persona: { 嘴硬: 58, 心态倾向: 92, 胜负心: 55, 逆风意志: 82, 创新欲: 95, 话痨: 72, 摸鱼倾向: 68, 甩锅倾向: 28, 爱睡觉: 62 },
    heroes: ['克烈', '猪妹'],
    heroNote: '上单克烈、打野猪妹都是绝活',
    signature: ['我要拿出我的兜裆布了', '用歪理论为自己的出装辩护'],
    winLines: ['立刻邀功说出装赢的', '得意证明歪理论对了', '反复回放自己的高光'],
    loseLines: ['一笑了之马上忘掉', '嘴硬甩锅，转头又说下把我的', '嚷着再来一把，要拿克烈报仇'],
    pressure: ['先歪理论，再认错，再用自嘲化解'],
    cheer: '表扬他的出装或打法',
    softSpots: [],
    habits: ['抽烟', '刷手机', '研究歪出装', '午睡', '吃零食', '偷偷玩 Steam 单机和三角洲'],
    chatLines: [
      '阿鸡凑到{other}旁边，开始讲一套没人写过的出装。',
      '阿鸡跟{other}闲聊，话题三句之内拐回克烈。',
    ],
    taste: {
      favorites: [], favoriteMul: 1, avoids: [], drinks: ['可乐'], snacks: ['零食'], noMilktea: true,
    },
    phoneBias: { douyin: 8 },
    look: { height: 1.0, girth: 1.32, glasses: true, flipflops: true, shirt: 0xe8833a, pants: 0x4a5a6e, hair: 0x2b2420, skin: 0xf0c8a0, hairStyle: 'messy' },
  },
  {
    id: 'dangdeng', name: '当邓', aliases: ['出装警察'],
    position: 'jungle', secondary: 'top',
    roles: ['指挥'],
    traits: ['出装警察', '节奏大师', '三分钟投降'],
    tagline: '全图带节奏，顺风指挥，逆风喊投，爱查别人装备',
    arrive: 'normal',
    ability: { lane: 42, roam: 68, fight: 66, sense: 64, mech: 44, pool: 32, mental: 32 },
    persona: { 嘴硬: 90, 心态倾向: 30, 胜负心: 92, 逆风意志: 24, 创新欲: 22, 话痨: 74, 摸鱼倾向: 48, 甩锅倾向: 86, 爱睡觉: 50 },
    heroes: ['雪人', '凯隐', '牧魂人'],
    heroNote: '打野雪人、凯隐；上单牧魂人。招牌被 ban 就懵',
    signature: ['赖线上被压导致野区被入侵', '当出装警察点评别人装备', '早没优势就喊投降'],
    winLines: ['说是自己节奏带得好', '点评别人出装', '就该这么打'],
    loseLines: ['复盘怪队友不听指挥', '早说投了'],
    pressure: ['当场急眼对喷，把锅甩回队友'],
    cheer: '表扬他的节奏和指挥',
    softSpots: ['指挥没人听', '野区被入侵没人帮忙', '拿手英雄被 ban', '当面批评', '队友乱出装'],
    habits: ['刷手机', '跑去指点别人训练', '午睡', '吃零食'],
    chatLines: [
      '当邓凑到{other}旁边看屏幕：“这出装不对。”',
      '当邓跟{other}复盘，三句话里有一句投降。',
    ],
    taste: {
      favorites: ['friedchicken', 'mcd'], favoriteMul: 3, avoids: [], drinks: ['红牛', '东鹏', '无糖'], snacks: ['零食'],
    },
    phoneBias: { bilibili: 12, wechat: 8 },
    look: { height: 0.86, girth: 0.92, glasses: true, shirt: 0x3f6b4f, pants: 0x2f3440, hair: 0x1d1a18, skin: 0xeec39c, shoes: 0x2b2b30, hairStyle: 'short' },
  },
  {
    id: 'gouliang', name: '狗粮', aliases: [],
    position: 'adc',
    roles: [],
    traits: ['团战收割', '只玩一把'],
    tagline: '安静发育后期 Carry，话比输出还停不下来',
    arrive: 'early',
    ability: { lane: 48, roam: 44, fight: 64, sense: 50, mech: 62, pool: 62, mental: 52 },
    persona: { 嘴硬: 42, 心态倾向: 78, 胜负心: 60, 逆风意志: 70, 创新欲: 28, 话痨: 94, 摸鱼倾向: 55, 甩锅倾向: 22, 爱睡觉: 48 },
    heroes: ['金克丝', '女警', '卡莎', '霞'],
    avoidHeroes: ['德莱文', '滑板鞋', '厄斐琉斯'],
    heroNote: '主流 AD 都会，除了德莱文、滑板鞋、厄斐琉斯',
    signature: ['嘲讽对面', '失误时先说是我的', '记住了，我只玩一把'],
    winLines: ['狂嘲对面', '炫耀极限操作', '夸队友顺便损两句'],
    loseLines: ['先自责', '自嘲着吐槽队友', '嘲笑阿鸡或撇干的失误，很快翻篇'],
    pressure: ['乐于认错', '自嘲化解', '嘴上认了再损回去'],
    cheer: '表扬他的操作和输出',
    softSpots: ['被对面特殊照顾针对导致劣势'],
    habits: ['刷手机', '找人闲聊吹牛', '损阿鸡或撇干', '午睡', '吃零食', '打一两把就说累'],
    chatLines: [
      '狗粮凑到{other}旁边，先损两句再聊正事。',
      '狗粮跟{other}闲聊，嘴就没停过。',
    ],
    taste: {
      favorites: ['friedchicken', 'mcd'], favoriteMul: 3, avoids: [], drinks: ['无糖', '茶', '白开水'], snacks: ['薯片'],
    },
    phoneBias: { douyin: 6, wechat: 10 },
    look: { height: 0.88, girth: 1.3, glasses: true, shirt: 0x5b7fb5, pants: 0x3b3b44, hair: 0x2a2420, skin: 0xf2caa6, hairStyle: 'short' },
  },
  {
    id: 'dibi', name: '弟必', aliases: ['葛永', '小必', '大标', '缚地魔'],
    position: 'mid',
    roles: ['和事佬'],
    traits: ['缚地魔', '团战法核'],
    tagline: '对线忍耐，团战发力。赖线不游走，最怕刺客',
    arrive: 'normal',
    ability: { lane: 32, roam: 30, fight: 64, sense: 46, mech: 44, pool: 32, mental: 70 },
    persona: { 嘴硬: 18, 心态倾向: 84, 胜负心: 48, 逆风意志: 86, 创新欲: 24, 话痨: 22, 摸鱼倾向: 38, 甩锅倾向: 16, 爱睡觉: 32 },
    heroes: ['维克托', '小法师', '阿罗拉', '薇古丝'],
    heroNote: '法核为主。最怕刺客，尤其永恩',
    signature: ['没事，下一把', '对面又是刺客'],
    winLines: ['闷骚冒一句金句', '夸队友打得好', '团战打爆了会小小得意一下'],
    loseLines: ['淡定说没事，下一把', '吐槽对面刺客', '也会自责反思'],
    pressure: ['淡定接受，默默改', '先自责，再找原因'],
    cheer: '表扬他团战输出',
    softSpots: ['对线被刺客打爆', '拿手英雄被 ban', '队友不等他就开团'],
    habits: ['刷手机', '玩三角洲'],
    chatLines: [
      '弟必在{other}旁边坐了一会儿，话不多。',
      '弟必跟{other}说了句下一把，就回去补刀了。',
    ],
    taste: {
      favorites: ['friedchicken', 'mcd'], favoriteMul: 2, avoids: [], drinks: ['可乐', '茶', '白开水'], snacks: ['薯片'],
    },
    phoneBias: { douyin: 4, wechat: 8 },
    look: { height: 1.13, girth: 0.92, glasses: true, shirt: 0xe9e6df, pants: 0x384a66, hair: 0x231e1c, skin: 0xefc7a2, shoes: 0x3a3a40, hairStyle: 'side' },
  },
  {
    id: 'diaolong', name: '吊隆', aliases: [],
    position: 'support',
    roles: ['指挥'],
    traits: ['神钩', '指挥型辅助'],
    tagline: '钩子一中就开团。只守下路，闲时给人起无厘头外号',
    arrive: 'normal',
    ability: { lane: 66, roam: 32, fight: 64, sense: 66, mech: 46, pool: 44, mental: 50 },
    persona: { 嘴硬: 60, 心态倾向: 74, 胜负心: 66, 逆风意志: 76, 创新欲: 36, 话痨: 68, 摸鱼倾向: 42, 甩锅倾向: 72, 爱睡觉: 58 },
    heroes: ['锤石', '机器人'],
    heroNote: '带钩子的硬辅。软辅不太擅长',
    signature: ['点评其他线打得好坏', '自己对线时也指挥各路', 'XX最新外号，XX'],
    winLines: ['点评谁打得好谁划水', '说这把是他钩子开出来的', '顺便毒舌一下对面'],
    loseLines: ['复盘每路哪里打崩了', '毒舌怼队友', '冷静接受，下一把'],
    pressure: ['毒舌反怼回去', '把锅甩给 AD 或打野'],
    cheer: '表扬他钩子和开团，或者直接放假',
    softSpots: ['拿手英雄被 ban'],
    habits: ['刷手机', '午睡', '给人起外号'],
    chatLines: [
      '吊隆看着{other}：“{other}最新外号，还没想好，先记着。”',
      '吊隆跟{other}点评刚才那波，钩子的账算得很清。',
    ],
    taste: {
      favorites: ['friedchicken', 'mcd'], favoriteMul: 2.5, avoids: [], avoidNote: '不吃内脏', drinks: ['咖啡'], snacks: [],
    },
    phoneBias: { bilibili: 10, wechat: 6 },
    look: { height: 1.0, girth: 1.14, glasses: false, shirt: 0x2f3e66, pants: 0x55504a, hair: 0x151312, skin: 0xe8bd95, hairStyle: 'buzz' },
  },
  {
    id: 'piegan', name: '撇干', aliases: ['剑魔人柱力'],
    position: 'top',
    roles: ['甩锅'],
    traits: ['剑魔人柱力', '容易红温'],
    tagline: '战士硬刚，剑魔开大就冲。对线一炸，整局就炸',
    arrive: 'normal',
    ability: { lane: 30, roam: 38, fight: 40, sense: 36, mech: 38, pool: 30, mental: 30 },
    persona: { 嘴硬: 82, 心态倾向: 28, 胜负心: 72, 逆风意志: 26, 创新欲: 20, 话痨: 48, 摸鱼倾向: 52, 甩锅倾向: 90, 爱睡觉: 30 },
    heroes: ['剑魔', '诺手', '鳄鱼'],
    heroNote: '拿剑魔战力 +30%',
    signature: ['对面什么打野啊，3分钟来一次，5分钟又来一次'],
    winLines: ['说自己对线打爆了', '说剑魔开大 carry 了', '邀功说这把靠上路', '喷对面打野帮都帮不起来'],
    loseLines: ['怪对面打野针对自己', '怪自家打野不来', '心态炸了不说话'],
    pressure: ['说自己被针对', '闷着不说话'],
    cheer: '表扬他剑魔和上路，安排打野多帮他',
    softSpots: ['被对面打野针对', '自家打野不来上路', '拿手英雄被 ban', '被人说对线送', '关键局被批评'],
    habits: ['刷手机', '吃零食', '熬夜'],
    chatLines: [
      '撇干跟{other}说对面打野三分钟来一次。',
      '撇干看着{other}的屏幕，先把自己的死亡回放翻过去。',
    ],
    taste: {
      favorites: [], favoriteMul: 1, avoids: [], drinks: ['可乐'], snacks: ['辣条', '薯片'],
    },
    phoneBias: { bilibili: 8, xiaohongshu: 14, wechat: 6 },
    look: { height: 0.98, girth: 1.28, glasses: false, shirt: 0x9b3b3b, pants: 0x2d2f36, hair: 0x2a211c, skin: 0xedc29b, hairStyle: 'short' },
  },
];

export const ROSTER_BY_ID: Record<string, MemberDef> = Object.fromEntries(ROSTER.map((m) => [m.id, m]));

/** 存档 v4 之前的 id。吊隆的 id 没变。 */
export const LEGACY_ID_MAP: Record<string, string> = {
  shidian: 'aji',
  dishu: 'gouliang',
  piju: 'piegan',
};

export const LEGACY_NAME_MAP: readonly [string, string][] = [
  ['施颠', '阿鸡'],
  ['地鼠', '狗粮'],
  ['吊龙', '吊隆'],
  ['批菊', '撇干'],
];

export function mapLegacyId(id: string): string {
  return LEGACY_ID_MAP[id] ?? id;
}

export function positionFit(def: MemberDef, pos: Position): number {
  if (pos === def.position) return 1;
  if (pos === def.secondary) return 0.85;
  return 0.6;
}

// 开局交情（0–100，只升不降）。最铁的三对靠近朋友档上沿，其余仍在 30–55。
export const INITIAL_BOND: Record<string, number> = {
  'aji|dangdeng': 55,
  'aji|dibi': 52,
  'aji|diaolong': 44,
  'aji|gouliang': 46,
  'aji|piegan': 42,
  'dangdeng|dibi': 48,
  'dangdeng|diaolong': 48,
  'dangdeng|gouliang': 40,
  'dangdeng|piegan': 40,
  'dibi|diaolong': 42,
  'dibi|gouliang': 44,
  'dibi|piegan': 38,
  'diaolong|gouliang': 54,
  'diaolong|piegan': 40,
  'gouliang|piegan': 36,
};

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 人设稿里点过名、名字仍是【待定】的两对。比赛加成等 M3。 */
export interface ComboSlot {
  id: string;
  a: string;
  b: string;
  roles: string;
  name: '【待定】';
  hint: string;
}

export const COMBO_SLOTS: ComboSlot[] = [
  {
    id: 'bot',
    a: 'gouliang',
    b: 'diaolong',
    roles: '下路 AD + 辅助',
    name: '【待定】',
    hint: '狗粮和吊隆的下路连招名还是【待定】。钩子中了，输出跟上。',
  },
  {
    id: 'midjg',
    a: 'dibi',
    b: 'dangdeng',
    roles: '中野',
    name: '【待定】',
    hint: '弟必和当邓的中野连招名还是【待定】。打野靠过来了，中单还赖在线上。',
  },
];

export function comboOf(a: string, b: string): ComboSlot | undefined {
  return COMBO_SLOTS.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
}

export function phoneWeight(memberId: string, appId: string, base: number): number {
  return base + (ROSTER_BY_ID[memberId]?.phoneBias[appId] ?? 0);
}
