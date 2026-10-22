// 角色数据：所有跟“人”有关的配置都放在这里，不写死在逻辑代码里
// 详细人设（docs/人设/<昵称>.md）到位后只改这个文件
// 【占位】能力值由《成长属性体系-草案v0.1》第 4 节换算成 7 属性；性格值沿用 Claude 样板

export type Position = 'top' | 'jungle' | 'mid' | 'adc' | 'support';
export const POSITIONS: Position[] = ['top', 'jungle', 'mid', 'adc', 'support'];
export const POSITION_CN: Record<Position, string> = { top: '上单', jungle: '打野', mid: '中单', adc: 'AD', support: '辅助' };

// 能力层：比赛引擎的 7 属性（设计文档 5.1）
export const ABILITY_KEYS = ['lane', 'roam', 'fight', 'sense', 'mech', 'pool', 'mental'] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];
export const ABILITY_CN: Record<AbilityKey, string> = { lane: '对线', roam: '游走', fight: '团战', sense: '意识', mech: '操作', pool: '英雄池', mental: '心态' };

// 性格层：基本固定
export const PERSONA_KEYS = ['嘴硬', '心态倾向', '胜负心', '逆风意志', '创新欲', '话痨', '摸鱼倾向', '甩锅倾向'] as const;
export type PersonaKey = (typeof PERSONA_KEYS)[number];

export interface Look {
  height: number; // 身高系数
  girth: number; // 胖瘦系数
  glasses: boolean;
  flipflops?: boolean;
  shirt: number;
  pants: number;
  hair: number;
  skin: number;
  shoes?: number;
  hairStyle: 'messy' | 'short' | 'side' | 'buzz';
}

export interface MemberDef {
  id: string;
  name: string;
  position: Position;
  secondary?: Position; // 次位：适性约 85%；【待人设】除施颠外暂未确定
  tagline: string;
  arrive: 'early' | 'normal'; // 到岗习惯
  ability: Record<AbilityKey, number>;
  persona: Record<PersonaKey, number>;
  heroes: string[];
  look: Look;
}

export const ROSTER: MemberDef[] = [
  {
    id: 'shidian', name: '施颠', position: 'top', secondary: 'jungle',
    tagline: '无厘头发明流，全队甩锅对象，心态极好',
    arrive: 'early',
    ability: { lane: 36, roam: 40, fight: 42, sense: 35, mech: 38, pool: 60, mental: 85 },
    persona: { 嘴硬: 20, 心态倾向: 90, 胜负心: 40, 逆风意志: 70, 创新欲: 95, 话痨: 70, 摸鱼倾向: 65, 甩锅倾向: 10 },
    heroes: ['石头人', '诺手', '加里奥', '蒙多'],
    look: { height: 1.0, girth: 1.32, glasses: true, flipflops: true, shirt: 0xe8833a, pants: 0x4a5a6e, hair: 0x2b2420, skin: 0xf0c8a0, hairStyle: 'messy' },
  },
  {
    id: 'dangdeng', name: '当邓', position: 'jungle',
    tagline: '嘴硬求胜，逆风爱提投降，爱批评施颠',
    arrive: 'normal',
    ability: { lane: 40, roam: 48, fight: 42, sense: 42, mech: 45, pool: 35, mental: 40 },
    persona: { 嘴硬: 85, 心态倾向: 45, 胜负心: 85, 逆风意志: 30, 创新欲: 25, 话痨: 60, 摸鱼倾向: 45, 甩锅倾向: 80 },
    heroes: ['盲僧', '赵信', '男枪', '皇子'],
    look: { height: 0.86, girth: 0.92, glasses: true, shirt: 0x3f6b4f, pants: 0x2f3440, hair: 0x1d1a18, skin: 0xeec39c, shoes: 0x2b2b30, hairStyle: 'short' },
  },
  {
    id: 'dishu', name: '地鼠', position: 'adc',
    tagline: '发挥稳定；休息时嘴碎，口头禅“如何评价”',
    arrive: 'normal',
    ability: { lane: 54, roam: 42, fight: 52, sense: 50, mech: 55, pool: 40, mental: 68 },
    persona: { 嘴硬: 40, 心态倾向: 70, 胜负心: 55, 逆风意志: 60, 创新欲: 30, 话痨: 85, 摸鱼倾向: 50, 甩锅倾向: 30 },
    heroes: ['卡莎', '艾希', '女警', '霞'],
    look: { height: 0.88, girth: 1.3, glasses: true, shirt: 0x5b7fb5, pants: 0x3b3b44, hair: 0x2a2420, skin: 0xf2caa6, hairStyle: 'short' },
  },
  {
    id: 'dibi', name: '弟必', position: 'mid',
    tagline: '对线常被打爆，擅长偷发育后期翻盘',
    arrive: 'normal',
    ability: { lane: 45, roam: 40, fight: 50, sense: 50, mech: 48, pool: 40, mental: 70 },
    persona: { 嘴硬: 35, 心态倾向: 65, 胜负心: 60, 逆风意志: 75, 创新欲: 30, 话痨: 25, 摸鱼倾向: 35, 甩锅倾向: 25 },
    heroes: ['沙皇', '维克托', '卡萨丁', '妖姬'],
    look: { height: 1.13, girth: 0.92, glasses: true, shirt: 0xe9e6df, pants: 0x384a66, hair: 0x231e1c, skin: 0xefc7a2, shoes: 0x3a3a40, hairStyle: 'side' },
  },
  {
    id: 'diaolong', name: '吊龙', position: 'support',
    tagline: '大局观强会指挥；轻松时段子手，紧张时话少',
    arrive: 'early',
    ability: { lane: 44, roam: 52, fight: 58, sense: 64, mech: 44, pool: 45, mental: 60 },
    persona: { 嘴硬: 45, 心态倾向: 60, 胜负心: 70, 逆风意志: 55, 创新欲: 30, 话痨: 65, 摸鱼倾向: 35, 甩锅倾向: 60 },
    heroes: ['锤石', '洛', '泰坦', '娜美'],
    look: { height: 1.0, girth: 1.14, glasses: false, shirt: 0x2f3e66, pants: 0x55504a, hair: 0x151312, skin: 0xe8bd95, hairStyle: 'buzz' },
  },
  {
    id: 'piju', name: '批菊', position: 'top',
    tagline: '对线常被打爆但嘴硬，挨骂后转头指点施颠',
    arrive: 'normal',
    ability: { lane: 36, roam: 36, fight: 40, sense: 38, mech: 40, pool: 35, mental: 52 },
    persona: { 嘴硬: 85, 心态倾向: 55, 胜负心: 65, 逆风意志: 50, 创新欲: 30, 话痨: 55, 摸鱼倾向: 55, 甩锅倾向: 70 },
    heroes: ['剑魔', '鳄鱼', '奥恩', '慎'],
    look: { height: 0.98, girth: 1.28, glasses: false, shirt: 0x9b3b3b, pants: 0x2d2f36, hair: 0x2a211c, skin: 0xedc29b, hairStyle: 'short' },
  },
];

export const ROSTER_BY_ID: Record<string, MemberDef> = Object.fromEntries(ROSTER.map((m) => [m.id, m]));

// 位置适性（设计文档 4.2）：本位 100%、次位约 85%、其他约 60%
export function positionFit(def: MemberDef, pos: Position): number {
  if (pos === def.position) return 1;
  if (pos === def.secondary) return 0.85;
  return 0.6;
}

// 开局交情（0–100，只升不降）。开局大多在 30–55；施颠被甩锅多，和大家偏熟【占位】
export const INITIAL_BOND: Record<string, number> = {
  'dangdeng|shidian': 48, 'piju|shidian': 50, 'diaolong|shidian': 46, 'dishu|shidian': 44, 'dibi|shidian': 42,
  'dangdeng|diaolong': 40, 'dangdeng|piju': 52, 'dangdeng|dishu': 36, 'dangdeng|dibi': 34,
  'dibi|dishu': 54, 'diaolong|dishu': 42, 'dibi|diaolong': 38, 'dibi|piju': 32, 'dishu|piju': 35, 'diaolong|piju': 37,
};

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
