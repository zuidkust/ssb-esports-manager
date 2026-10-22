// 开局 6 人。文案和数值以 docs/人设稿-开局6人.md 为准。
// 7 属性：人设稿第 8 节的强 / 弱 / 未强调，落成可打的初值，微调仍【待定】。
// 外形沿用已有模型（眼镜、胖瘦、高矮、阿鸡的人字拖），人设稿没有改外观。

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
  /** 本命外卖（菜单 id）。空数组 = 不挑 */
  favorites: string[];
  /** 本命菜的权重倍率 */
  favoriteMul: number;
  avoid: string[];
  /** 命中菜品标签就不点。吊隆不吃内脏；当前菜单没有这类菜 */
  avoidTags: string[];
  drinks: string;
  milkTea: boolean;
}

export interface MemberDef {
  id: string;
  name: string;
  position: Position;
  secondary?: Position;
  /** 五个位置都能打：非本位、非次位约 75%，安心补位 */
  flex?: boolean;
  tagline: string;
  arrive: 'early' | 'normal' | 'late';
  ability: Record<AbilityKey, number>;
  persona: Record<PersonaKey, number>;
  heroes: string[];
  heroNote?: string;
  /**
   * 英雄池边界和队伍的选人偏好。
   * neverPicks：自己绝不选。teamWants：队伍希望留给他、希望他练的英雄，他可以拒绝。
   * 比赛还没有 BP，选人阶段强制跳过【待定】。
   */
  draft?: { neverPicks: string[]; teamWants: string[] };
  traits: string[];
  catchphrases: string[];
  winLines: string[];
  loseLines: string[];
  pressureLines: string[];
  cheer: string;
  softSpots: string[];
  habits: string[];
  taste: Taste;
  phoneBias: Partial<Record<string, number>>;
  roles: string[];
  look: Look;
}

const noFav = (drinks: string, milkTea: boolean, extra?: Partial<Taste>): Taste => ({
  favorites: [],
  favoriteMul: 1,
  avoid: [],
  avoidTags: [],
  drinks,
  milkTea,
  ...extra,
});

const burger = (drinks: string): Taste => ({
  favorites: ['friedchicken', 'mcd'],
  favoriteMul: 3,
  avoid: [],
  avoidTags: [],
  drinks,
  milkTea: true,
});

export const ROSTER: MemberDef[] = [
  {
    id: 'aji', name: '阿鸡', position: 'top', secondary: 'jungle', flex: true,
    tagline: '体系工具人，野路子出装，队里的笑点和背锅侠',
    arrive: 'early',
    ability: { lane: 48, roam: 50, fight: 48, sense: 32, mech: 34, pool: 78, mental: 88 },
    persona: { 嘴硬: 62, 心态倾向: 92, 胜负心: 55, 逆风意志: 80, 创新欲: 95, 话痨: 72, 摸鱼倾向: 68, 甩锅倾向: 22, 爱睡觉: 62 },
    heroes: ['克烈', '猪妹'],
    heroNote: '上单克烈、打野猪妹，都是绝活',
    traits: ['乐天派', '脑回路清奇', '脸皮厚不记仇', '嘴硬自信', '好脾气', '爱研究冷门'],
    catchphrases: ['我要拿出我的兜裆布了', '这套出装有理论的'],
    winLines: [
      '阿鸡把录像拖回去：“看见没，是出装赢的。”',
      '阿鸡连说三遍歪理论，最后一句是“我就说吧”。',
      '赢了。阿鸡把刚才那波高光又放了一遍，声音开得挺大。',
      '阿鸡邀功邀得很坦然：“这把我的发明，记下。”',
    ],
    loseLines: [
      '阿鸡笑了一下：“下把我的。”手已经点上克烈。',
      '阿鸡：“这把算我的。兜裆布我拿出来了，下把克烈。”',
      '输了阿鸡先甩了一句，接着自己认了，然后说再来。',
      '阿鸡把这把忘得很快，嘴上还在给那套出装找理由。',
    ],
    pressureLines: [
      '阿鸡先讲了一套歪理论，讲完又说是自己的问题，最后把自己损了一句。',
      '被说了两句，阿鸡点头，转头就把话题拐回出装。',
      '阿鸡：“行，我的。下把我改。”脸上没什么事。',
      '批评落在阿鸡身上，他用自嘲把场子圆回去了。',
    ],
    cheer: '表扬他的出装或打法',
    softSpots: [],
    habits: ['抽烟', '刷抖音', '研究歪出装', '午睡', '吃零食', '偷偷玩单机和三角洲'],
    taste: noFav('可乐', false, { avoid: ['milktea'] }),
    phoneBias: { douyin: 1.4, mobilegame: 1.8 },
    roles: ['开心果', '背锅常客'],
    look: { height: 1.0, girth: 1.10, glasses: true, flipflops: true, shirt: 0xff8a2b, pants: 0x3d4f66, hair: 0x2b2420, skin: 0xf0c8a0, shoes: 0xe8833a, hairStyle: 'messy' },
  },
  {
    id: 'dangdeng', name: '当邓', position: 'jungle', secondary: 'top',
    tagline: '节奏大师，出装警察，顺风浪逆风崩',
    arrive: 'normal',
    ability: { lane: 42, roam: 78, fight: 76, sense: 74, mech: 48, pool: 32, mental: 34 },
    persona: { 嘴硬: 88, 心态倾向: 28, 胜负心: 90, 逆风意志: 22, 创新欲: 18, 话痨: 74, 摸鱼倾向: 48, 甩锅倾向: 86, 爱睡觉: 50 },
    heroes: ['雪人', '凯隐', '牧魂人'],
    heroNote: '打野雪人、凯隐；上单牧魂人。被 ban 就懵',
    traits: ['爆脾气', '急性子', '爱指挥', '好胜', '嘴硬不服输'],
    catchphrases: ['三分钟没优势就没得打', '你这出装谁教的'],
    winLines: [
      '当邓：“就该这么打。节奏是我带的。”',
      '赢了。当邓先点了自己的节奏，再把队友出装过了一遍。',
      '当邓很满意：“雪人这波推球，对的。”',
      '当邓：“听见没有，就该这么打。”语气像复盘已经结束。',
    ],
    loseLines: [
      '当邓：“早说投了。指挥没人听，野区才会被进。”',
      '当邓复盘的第一句是队友不来野区打架。',
      '输了。当邓点名线上：“被压成这样，对面不进我野区才有鬼。”',
      '当邓把锅推回去，自己的雪人被 ban 这事他没提。',
    ],
    pressureLines: [
      '当邓当场急了，话又快又硬，锅顺着甩回队友。',
      '当面说他，当邓接得很快：“那你倒是来野区。”',
      '当邓不服：“我喊了。没人听，别来问我。”',
      '批评还没说完，当邓已经在讲别人哪里没跟上。',
    ],
    cheer: '表扬他的节奏和指挥',
    softSpots: ['指挥没人听', '野区被入侵没人帮忙', '拿手英雄被 ban', '当面批评', '队友乱出装'],
    habits: ['刷手机', '指点别人训练', '午睡', '吃零食', '查队友出装'],
    taste: burger('红牛、东鹏，也喝无糖'),
    phoneBias: { douyin: 1.15, bilibili: 2.2, wechat: 2.4 },
    roles: ['指挥'],
    look: { height: 0.84, girth: 0.86, glasses: true, shirt: 0x2f8a4a, pants: 0x1e2430, hair: 0x1d1a18, skin: 0xeec39c, shoes: 0x1a1a1e, hairStyle: 'short' },
  },
  {
    id: 'gouliang', name: '狗粮', position: 'adc',
    tagline: '团战收割，话比输出还停不下来',
    arrive: 'early',
    ability: { lane: 58, roam: 52, fight: 80, sense: 62, mech: 78, pool: 76, mental: 64 },
    persona: { 嘴硬: 30, 心态倾向: 78, 胜负心: 62, 逆风意志: 70, 创新欲: 28, 话痨: 94, 摸鱼倾向: 52, 甩锅倾向: 18, 爱睡觉: 58 },
    heroes: ['主流 AD'],
    heroNote: '主流 AD 都会，除了德莱文、滑板鞋、厄斐琉斯',
    traits: ['话痨', '靠谱', '爱吐槽', '乐天', '容易累'],
    catchphrases: ['记住了，我只玩一把', '是我的', 'my bad'],
    winLines: [
      '狗粮把对面嘲完，又夸了队友一句，夸完补了一刀。',
      '狗粮：“这波反杀看见没。”然后又说了四十秒。',
      '赢了。狗粮的嘴和输出一起停不下来。',
      '狗粮炫耀完极限操作，转头看阿鸡还要不要被损。',
    ],
    loseLines: [
      '狗粮先说“是我的”，接着自嘲，再损了旁边一句，很快翻篇。',
      '狗粮：“my bad。”停半秒，开始讲这把谁更离谱。',
      '输了狗粮嘴上认了，眼睛已经在找下把的槽点。',
      '狗粮把失误过了一遍，最后还是损到了阿鸡或者撇干。',
    ],
    pressureLines: [
      '狗粮：“是我的。”认完又损回去一句。',
      '狗粮点头：“my bad。”语气轻，话没停。',
      '被说了，狗粮先认，再用自嘲把批评卸掉一半。',
      '狗粮认错认得很爽快，旁边的人反而被他呛了一句。',
    ],
    cheer: '表扬他的操作和输出',
    softSpots: ['被对面特殊照顾针对'],
    habits: ['刷抖音', '找人闲聊', '损阿鸡', '损撇干', '午睡', '吃薯片', '打一两把就喊累'],
    taste: burger('无糖、茶、白开水'),
    phoneBias: { douyin: 1.35, wechat: 2.3 },
    roles: ['队伍保障'],
    look: { height: 0.9, girth: 0.90, glasses: true, shirt: 0x4a8ad4, pants: 0x2a2e3a, hair: 0x2a2420, skin: 0xf2caa6, shoes: 0xf0f0ee, hairStyle: 'short' },
  },
  {
    id: 'dibi', name: '弟必', position: 'mid',
    tagline: '对线忍耐，团战发力，队里的和事佬',
    arrive: 'normal',
    ability: { lane: 32, roam: 28, fight: 76, sense: 52, mech: 50, pool: 34, mental: 82 },
    persona: { 嘴硬: 18, 心态倾向: 86, 胜负心: 48, 逆风意志: 88, 创新欲: 22, 话痨: 24, 摸鱼倾向: 40, 甩锅倾向: 12, 爱睡觉: 42 },
    heroes: ['维克托', '小法师', '阿罗拉', '薇古丝'],
    heroNote: '法核。最怕刺客，尤其永恩。赖线不游走',
    traits: ['佛系', '耐心', '靠谱', '闷骚', '乐天'],
    catchphrases: ['没事，下一把'],
    winLines: [
      '弟必闷了半天：“团战还行。”',
      '弟必夸了队友一句，自己的输出他只提了半句。',
      '赢了。弟必小小得意了一下，马上又平回去。',
      '弟必：“这把团战可以。”就这一句。',
    ],
    loseLines: [
      '弟必：“没事，下一把。”',
      '弟必吐槽了对面刺客，然后开始想自己哪里没处理好。',
      '输了弟必不急，先认对线被打爆，再说明天还打。',
      '弟必：“永恩这英雄。”说完就去倒水了。',
    ],
    pressureLines: [
      '弟必听完，点一下头，回去改，不多解释。',
      '弟必先说是自己的问题，再慢慢找原因。',
      '批评落到弟必身上，他既不顶，也不把锅送出去。',
      '弟必：“行，我看一下。”声音还是平的。',
    ],
    cheer: '表扬他团战输出',
    softSpots: ['对线被刺客打爆', '拿手英雄被 ban', '队友不等他就开团'],
    habits: ['刷抖音', '玩三角洲', '水群'],
    taste: { ...burger('可乐，也喝茶'), favoriteMul: 2.2 },
    phoneBias: { douyin: 1.2, wechat: 2, mobilegame: 2.8 },
    roles: ['和事佬'],
    look: { height: 1.15, girth: 0.88, glasses: true, shirt: 0xf2efe8, pants: 0x2c3f5c, hair: 0x231e1c, skin: 0xefc7a2, shoes: 0x2e2e34, hairStyle: 'side' },
  },
  {
    id: 'diaolong', name: '吊隆', position: 'support',
    tagline: '钩子开团的进攻辅助，毒舌，爱起外号',
    arrive: 'normal',
    ability: { lane: 76, roam: 30, fight: 74, sense: 72, mech: 52, pool: 48, mental: 66 },
    persona: { 嘴硬: 58, 心态倾向: 72, 胜负心: 68, 逆风意志: 74, 创新欲: 26, 话痨: 70, 摸鱼倾向: 42, 甩锅倾向: 72, 爱睡觉: 64 },
    heroes: ['锤石', '机器人'],
    heroNote: '带钩子的硬辅。软辅不太行。很少游走',
    traits: ['靠谱', '温和', '毒舌', '爱指挥'],
    catchphrases: ['最新外号'],
    winLines: [
      '吊隆：“这把是钩子开出来的。”接着点了谁在划水。',
      '吊隆把谁打得好、谁在看谁过完，对面也没落下。',
      '赢了。吊隆语气很平，毒舌没停。',
      '吊隆：“钩子中了就该上。”像在陈述天气。',
    ],
    loseLines: [
      '吊隆把每路哪里崩了点了一遍，最后看向 AD 和打野。',
      '吊隆毒舌归毒舌，说完就准备下一把。',
      '输了吊隆不吵大声的，句子很短，锅很清楚。',
      '吊隆：“下路这波我认。其他路你们自己看录像。”',
    ],
    pressureLines: [
      '吊隆反怼了一句，锅分给 AD 或者打野。',
      '被说了，吊隆先笑一下，再把问题送回去。',
      '吊隆：“行。那钩子之前，线上呢？”',
      '批评他，他不闷着，嘴上立刻有回音。',
    ],
    cheer: '表扬钩子、开团和指挥；放假也管用',
    softSpots: ['拿手英雄被 ban'],
    habits: ['刷抖音', '看 B 站', '午睡', '看比赛', '给人起外号'],
    taste: { ...burger('咖啡'), avoidTags: ['内脏'] },
    phoneBias: { douyin: 1.05, bilibili: 2.4, wechat: 2, hupu: 2.2 },
    roles: ['指挥'],
    look: { height: 1.02, girth: 0.98, glasses: false, shirt: 0x1e3a6e, pants: 0x4a453f, hair: 0x0e0c0b, skin: 0xe8bd95, shoes: 0xd4d4d0, hairStyle: 'buzz' },
  },
  {
    id: 'piegan', name: '撇干', position: 'top',
    tagline: '剑魔人柱力，对线易崩，爱怪打野',
    arrive: 'late',
    ability: { lane: 32, roam: 40, fight: 44, sense: 40, mech: 46, pool: 32, mental: 30 },
    persona: { 嘴硬: 78, 心态倾向: 26, 胜负心: 72, 逆风意志: 28, 创新欲: 20, 话痨: 48, 摸鱼倾向: 58, 甩锅倾向: 90, 爱睡觉: 28 },
    heroes: ['剑魔'],
    heroNote: '战士上单。剑魔战力 +30%。英雄池窄。绝不玩石头人',
    draft: { neverPicks: ['石头人'], teamWants: ['石头人'] },
    traits: ['容易上头', '爱甩锅', '爱熬夜'],
    catchphrases: ['对面什么打野啊，3分钟来一次，5分钟又来一次'],
    winLines: [
      '撇干：“上路打爆了。这把靠我。”',
      '撇干：“剑魔开大，carry。”对面打野他顺便也喷了。',
      '赢了撇干把上路经济念了一遍。',
      '撇干很响：“帮都帮不起来，还不是我单杀的。”',
    ],
    loseLines: [
      '撇干：“对面什么打野啊，3 分钟来一次，5 分钟又来一次。”',
      '撇干怪自家打野不来，说完就不说话了。',
      '对线一炸，撇干整个人安静下去。',
      '撇干：“被针对了。”耳机还戴着，人已经不在这把里。',
    ],
    pressureLines: [
      '撇干：“我被针对了。”然后闷着。',
      '说他送，撇干不接话，过一会儿又提对面打野。',
      '撇干低着头，锅停在打野差距上，自己不再解释。',
      '关键时刻被点名，撇干嘴闭上了。',
    ],
    cheer: '表扬剑魔和上路，或者安排打野多帮他',
    softSpots: ['被对面打野针对', '自家打野不来上路', '拿手英雄被 ban', '被人说对线送', '关键局被批评'],
    habits: ['刷抖音', '看 B 站', '看小红书', '吃薯片和辣条', '熬夜'],
    taste: noFav('可乐', true),
    phoneBias: { douyin: 1.1, bilibili: 2, wechat: 1.8, xiaohongshu: 2.6 },
    roles: ['甩锅', '也会背锅'],
    look: { height: 0.98, girth: 1.18, glasses: false, shirt: 0xc43a3a, pants: 0x22252c, hair: 0x2a211c, skin: 0xedc29b, shoes: 0xe9e9e9, hairStyle: 'short' },
  },
];

export const ROSTER_BY_ID: Record<string, MemberDef> = Object.fromEntries(ROSTER.map((m) => [m.id, m]));

export function positionFit(def: MemberDef, pos: Position): number {
  if (pos === def.position) return 1;
  if (pos === def.secondary) return 0.85;
  if (def.flex) return 0.75;
  return 0.6;
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// 开局交情 42–55。最铁三对放在区间上沿；甩锅、互怼也算交情，不做成仇人。
export const INITIAL_BOND: Record<string, number> = Object.fromEntries(([
  ['aji', 'dangdeng', 55],
  ['aji', 'dibi', 54],
  ['gouliang', 'diaolong', 55],
  ['aji', 'piegan', 50],
  ['aji', 'gouliang', 48],
  ['aji', 'diaolong', 46],
  ['dangdeng', 'dibi', 52],
  ['dangdeng', 'diaolong', 47],
  ['dangdeng', 'gouliang', 44],
  ['dangdeng', 'piegan', 43],
  ['dibi', 'diaolong', 45],
  ['dibi', 'gouliang', 46],
  ['dibi', 'piegan', 42],
  ['diaolong', 'piegan', 43],
  ['gouliang', 'piegan', 44],
] as const).map(([a, b, n]) => [pairKey(a, b), n]));

export type TieKind = 'close' | 'banter';

export interface SocialTie {
  a: string;
  b: string;
  kind: TieKind;
  note: string;
}

export const SOCIAL_TIES: SocialTie[] = [
  { a: 'aji', b: 'dangdeng', kind: 'close', note: '最铁' },
  { a: 'gouliang', b: 'diaolong', kind: 'close', note: '下路最铁' },
  { a: 'aji', b: 'dibi', kind: 'close', note: '最铁' },
  { a: 'aji', b: 'dangdeng', kind: 'banter', note: '出装警察对野路子出装' },
  { a: 'gouliang', b: 'aji', kind: 'banter', note: '狗粮损阿鸡' },
  { a: 'gouliang', b: 'piegan', kind: 'banter', note: '狗粮损撇干' },
  { a: 'dangdeng', b: 'piegan', kind: 'banter', note: '打野帮不帮上路' },
];

export const BLAMERS = ['dangdeng', 'piegan'] as const;
export const SCAPEGOATS = ['aji', 'piegan'] as const;

export const TEAM_ROLES: Record<string, readonly string[]> = {
  开心果: ['aji'],
  指挥: ['dangdeng', 'diaolong'],
  和事佬: ['dibi'],
};

export interface FamousMoment {
  id: string;
  title: string;
  summary: string;
}

export const FAMOUS_MOMENTS: FamousMoment[] = [
  { id: 'miracle', title: '奇迹团', summary: '整场被压，靠一波团战翻盘' },
  { id: 'pig', title: '阿鸡猪妹大赛', summary: '阿鸡用猪妹打野打爆对面，三路带飞' },
  { id: 'allin', title: '撇干干架翻车', summary: '上路爱干架，时机不对就被反杀或被蹲，然后一蹶不振' },
];

export interface ComboSlot {
  a: string;
  b: string;
  lane: string;
  /** 连招名留空，字面就是这个占位，不要另起专名 */
  name: '【待定】';
}

export const COMBOS: ComboSlot[] = [
  { a: 'gouliang', b: 'diaolong', lane: '下路', name: '【待定】' },
  { a: 'dibi', b: 'dangdeng', lane: '中野', name: '【待定】' },
];

export function comboOf(id: string): ComboSlot | undefined {
  return COMBOS.find((c) => c.a === id || c.b === id);
}

export function comboPartner(id: string): string | undefined {
  const c = comboOf(id);
  if (!c) return undefined;
  return c.a === id ? c.b : c.a;
}
