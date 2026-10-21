// 成员、对手、作息等静态配置
// 能力与部分性格数值取自《成长属性体系-草案v0.1》第 4 节；
// 草案未给出的 胜负心 / 话痨 / 摸鱼倾向 由样板按性格描述自行设定（见技术架构方案末尾"待确认"）

export const TEAM_NAME = '峡谷打工人';

export const MEMBERS = [
  {
    id: 'shidian', name: '施颠', role: '上/野', mainRole: '上单', rank: '白银 II',
    evolve: '发明流大师', tagline: '无厘头发明流，全队甩锅对象，心态极好',
    schedule: 'early',
    ability: { 操作: 38, 意识: 35, 对线: 36, 发育: 37, 团队: 45, 英雄池: 60 },
    persona: { 心态: 90, 逆风意志: 70, 创新欲: 95, 嘴硬: 20, 甩锅倾向: 10, 胜负心: 40, 话痨: 70, 摸鱼倾向: 65 },
    heroes: ['石头人', '诺手', '盲僧', '加里奥', '蒙多'],
    look: { height: 1.0, girth: 1.32, glasses: true, flipflops: true, shirt: 0xe8833a, pants: 0x4a5a6e, hair: 0x2b2420, skin: 0xf0c8a0, hairStyle: 'messy' },
  },
  {
    id: 'dangdeng', name: '当邓', role: '打野（偶尔上）', mainRole: '打野', rank: '白银 I',
    evolve: '嘴硬打野 → 逆风核心', tagline: '嘴硬求胜，逆风爱提投降，爱批评施颠',
    schedule: 'normal',
    ability: { 操作: 45, 意识: 42, 对线: 40, 发育: 40, 团队: 38, 英雄池: 35 },
    persona: { 心态: 45, 逆风意志: 30, 创新欲: 25, 嘴硬: 85, 甩锅倾向: 80, 胜负心: 85, 话痨: 60, 摸鱼倾向: 45 },
    heroes: ['盲僧', '赵信', '男枪', '皇子'],
    look: { height: 0.86, girth: 0.92, glasses: true, shirt: 0x3f6b4f, pants: 0x2f3440, hair: 0x1d1a18, skin: 0xeec39c, hairStyle: 'short' },
  },
  {
    id: 'dishu', name: '地鼠', role: 'AD', mainRole: 'AD', rank: '黄金 IV',
    evolve: '稳定输出天花板', tagline: '发挥稳定；休息时嘴碎，口头禅"如何评价"',
    schedule: 'dayonly',
    ability: { 操作: 55, 意识: 50, 对线: 52, 发育: 55, 团队: 50, 英雄池: 40 },
    persona: { 心态: 70, 逆风意志: 60, 创新欲: 30, 嘴硬: 40, 甩锅倾向: 30, 胜负心: 55, 话痨: 85, 摸鱼倾向: 50 },
    heroes: ['卡莎', '艾希', '女警', '霞'],
    look: { height: 0.88, girth: 1.3, glasses: true, shirt: 0x5b7fb5, pants: 0x3b3b44, hair: 0x2a2420, skin: 0xf2caa6, hairStyle: 'short' },
  },
  {
    id: 'dibi', name: '弟必', role: '中单', mainRole: '中单', rank: '黄金 IV',
    evolve: '后期翻盘王', tagline: '对线常被打爆，擅长偷发育后期翻盘',
    schedule: 'normal',
    ability: { 操作: 48, 意识: 50, 对线: 35, 发育: 65, 团队: 45, 英雄池: 40 },
    persona: { 心态: 65, 逆风意志: 75, 创新欲: 30, 嘴硬: 35, 甩锅倾向: 25, 胜负心: 60, 话痨: 25, 摸鱼倾向: 35 },
    heroes: ['沙皇', '维克托', '卡萨丁', '妖姬'],
    look: { height: 1.13, girth: 0.92, glasses: true, shirt: 0xe9e6df, pants: 0x384a66, hair: 0x231e1c, skin: 0xefc7a2, hairStyle: 'side' },
  },
  {
    id: 'diaolong', name: '吊龙', role: '辅助', mainRole: '辅助', rank: '黄金 III',
    evolve: '指挥核心', tagline: '大局观强会指挥；轻松时段子手，紧张时话少',
    schedule: 'early',
    ability: { 操作: 45, 意识: 60, 对线: 45, 发育: 40, 团队: 70, 英雄池: 45 },
    persona: { 心态: 60, 逆风意志: 55, 创新欲: 30, 嘴硬: 45, 甩锅倾向: 60, 胜负心: 70, 话痨: 65, 摸鱼倾向: 35 },
    heroes: ['锤石', '洛', '泰坦', '娜美'],
    look: { height: 1.0, girth: 1.14, glasses: false, shirt: 0x2f3e66, pants: 0x55504a, hair: 0x151312, skin: 0xe8bd95, hairStyle: 'buzz' },
  },
  {
    id: 'piju', name: '批菊', role: '上单', mainRole: '上单', rank: '白银 III',
    evolve: '嘴硬上单的觉醒', tagline: '对线常被打爆但嘴硬，挨骂后转头指点施颠',
    schedule: 'normal',
    ability: { 操作: 40, 意识: 38, 对线: 33, 发育: 40, 团队: 38, 英雄池: 35 },
    persona: { 心态: 55, 逆风意志: 50, 创新欲: 30, 嘴硬: 85, 甩锅倾向: 70, 胜负心: 65, 话痨: 55, 摸鱼倾向: 55 },
    heroes: ['剑魔', '鳄鱼', '奥恩', '慎'],
    look: { height: 0.98, girth: 1.28, glasses: false, shirt: 0x9b3b3b, pants: 0x2d2f36, hair: 0x2a211c, skin: 0xedc29b, hairStyle: 'short' },
  },
];

// 初始关系值（0–100，50 为中立）。以施颠为中心的甩锅链：当邓、批菊、吊龙对施颠偏低
export const INITIAL_RELATIONS = {
  'dangdeng>shidian': 38, 'piju>shidian': 42, 'diaolong>shidian': 48,
  'shidian>dangdeng': 66, 'shidian>piju': 64,
  'dangdeng>diaolong': 45, 'diaolong>dangdeng': 47,
  'dishu>dibi': 62, 'dibi>dishu': 62,
  'piju>dangdeng': 60, 'dangdeng>piju': 60,
};

// 虚拟对手战队
export const OPPONENTS = [
  { name: '夜猫子电竞', style: '野区入侵，打野爱三级抓上', power: 50 },
  { name: '风暴速推', style: '速推流，20 分钟前强势', power: 53 },
  { name: '老干部俱乐部', style: '稳健运营，后期团战', power: 48 },
  { name: '网吧之王', style: '单带分推', power: 51 },
  { name: '龙坑钉子户', style: '控龙资源，节奏慢', power: 47 },
  { name: '甜品店五连坐', style: '娱乐阵容，发挥忽高忽低', power: 45 },
];

// 周赛：每周五 15:00（样板暂定，待产品确认）
export const MATCH_WEEKDAY = 5;
export const MATCH_MINUTE = 15 * 60;

export const STATUS_KEYS = ['体力', '心情', '专注', '手感', '饥饿'];
export const ABILITY_KEYS = ['操作', '意识', '对线', '发育', '团队', '英雄池'];
export const PERSONA_KEYS = ['心态', '逆风意志', '创新欲', '嘴硬', '甩锅倾向', '胜负心', '话痨', '摸鱼倾向'];
