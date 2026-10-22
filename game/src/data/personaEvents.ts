// M5 第一刀：从人设稿抽的专属事件。不是 227 条事件库的整库改写。
import type { LogEntry } from '../save/state';

export type PersonaTag = '名场面' | '互怼' | '甩锅' | '背锅' | '摸鱼' | '交情';

export interface PersonaEventDef {
  id: string;
  tags: PersonaTag[];
  level: LogEntry['level'];
  weight: number;
  cooldown: number;
  requires: string[];
  segments?: string[];
  minBond?: { a: string; b: string; n: number };
  lines: string[];
  bond?: { a: string; b: string; n: number };
  knot?: { a: string; b: string; cause: string };
  knotChance?: number;
}

export const PERSONA_EVENTS: PersonaEventDef[] = [
  {
    id: 'fame_miracle', tags: ['名场面'], level: '有趣', weight: 2, cooldown: 4, requires: ['diaolong'],
    segments: ['team', 'match', 'free'],
    lines: [
      '解说：这把又是奇迹团。整场被压，吊隆喊开，一波翻了。',
      'SSB 擅长的那种团又来了。经济落后，团战打完水晶没了。',
      '群里有人发：又靠一波团。弟必的输出还在，吊隆的钩子也在。',
      '奇迹团。没人复盘前十分钟，都在看最后那波。',
    ],
  },
  {
    id: 'fame_sejuani', tags: ['名场面'], level: '有趣', weight: 3, cooldown: 3, requires: ['aji'],
    lines: [
      '阿鸡提起猪妹大赛：那次打野猪妹把三路节奏带飞了。',
      '阿鸡：“我要拿出我的兜裆布了。”屏幕上锁的是克烈。',
      '阿鸡在研究一套没人写过的出装，自称绝活。',
      '解说要是在场会说：阿鸡又在开发新打法了。',
    ],
  },
  {
    id: 'fame_piegan', tags: ['名场面'], level: '有趣', weight: 3, cooldown: 2, requires: ['piegan'],
    segments: ['team', 'match'],
    lines: [
      '撇干上路又冲了。时机不对，人没回来。',
      '解说：剑魔开大冲进去了，能不能回来另说。',
      '撇干对线送成这样，对面上路要成大爹了。',
      '撇干：“对面什么打野啊，3分钟来一次，5分钟又来一次。”',
    ],
  },
  {
    id: 'banter_build', tags: ['互怼'], level: '有趣', weight: 4, cooldown: 1, requires: ['aji', 'dangdeng'],
    lines: [
      '当邓盯着阿鸡的装备栏：“这是出装还是行为艺术？”阿鸡：“这是理论。”',
      '出装警察上线。当邓把阿鸡的鞋子念了一遍，阿鸡笑着点头。',
      '阿鸡用歪理论给自己的出装辩护。当邓听完，投降键都亮了。',
      '当邓：“队友乱出装。”阿鸡把理论又讲了一遍，当邓没听完。',
    ],
  },
  {
    id: 'banter_gl_aji', tags: ['互怼'], level: '有趣', weight: 3, cooldown: 2, requires: ['gouliang', 'aji'],
    lines: [
      '狗粮损了阿鸡一整段，阿鸡听完还给他递零食。',
      '狗粮：“这波锅估计又是阿鸡的。”阿鸡：“那我下把背。”',
      '打完这波，阿鸡又要被狗粮损了。两个人都在笑。',
      '狗粮嘲完对面，顺手把阿鸡的出装也嘲了。阿鸡鼓掌。',
    ],
  },
  {
    id: 'banter_gl_piegan', tags: ['互怼'], level: '有趣', weight: 3, cooldown: 2, requires: ['gouliang', 'piegan'],
    lines: [
      '狗粮看着撇干的死亡回放，补了一句嘲讽。撇干没接。',
      '狗粮：“记住了，我只玩一把。”然后转头说撇干这把冲太早。',
      '撇干被单杀，狗粮在语音里笑出声，又补了句“是我嘴快”。',
      '狗粮损撇干损到一半，自己先说 my bad，撇干还是没说话。',
    ],
  },
  {
    id: 'banter_jungle_top', tags: ['互怼', '甩锅'], level: '有趣', weight: 4, cooldown: 2, requires: ['dangdeng', 'piegan'],
    lines: [
      '撇干：“对面什么打野啊，3分钟来一次，5分钟又来一次。”当邓：“你自己先别冲。”',
      '当邓没来上路。撇干把对线劣势记到打野头上。',
      '当邓：“上路自己冲进去，叫打野有什么用？”撇干不说话了。',
      '打野帮不帮上路，当邓和撇干又吵了一轮。谁也没让谁。',
    ],
    knot: { a: 'dangdeng', b: 'piegan', cause: '上路甩锅' },
    knotChance: 0.4,
  },
  {
    id: 'nick', tags: ['互怼'], level: '有趣', weight: 3, cooldown: 2, requires: ['diaolong'],
    lines: [],
  },
  {
    id: 'blame_aji', tags: ['背锅'], level: '有趣', weight: 4, cooldown: 1, requires: ['aji'],
    lines: [
      '这把输了，目光先找阿鸡。阿鸡：“我的锅，下把我的。”',
      '阿鸡接过锅，还问要不要顺便刷一层漆。',
      '甩锅大会开完，锅落在阿鸡的出装上。他自己先笑了。',
      '阿鸡：“对对对，我的锅。”全屋笑完，这事就翻篇了。',
    ],
  },
  {
    id: 'blame_diaolong', tags: ['甩锅'], level: '有趣', weight: 2, cooldown: 3, requires: ['diaolong', 'gouliang'],
    lines: [
      '吊隆被说了一句，把锅顺手递给狗粮：“钩是中了，输出呢？”',
      '吊隆复盘到下路，锅在狗粮和当邓之间传了一圈。',
      '吊隆毒舌反怼完，下路这几分钟话少了。',
      '批评落到吊隆头上。他没认，把开团的账算给了旁边的人。',
    ],
    knot: { a: 'diaolong', b: 'gouliang', cause: '辅助甩锅' },
    knotChance: 0.35,
  },
  {
    id: 'ff_dangdeng', tags: ['甩锅'], level: '有趣', weight: 3, cooldown: 2, requires: ['dangdeng'],
    segments: ['team', 'match', 'free'],
    lines: [
      '三分钟没优势，当邓要发起投降了。',
      '当邓：“早说投了。”没人点。',
      '顺风是指挥官，逆风是指责官。当邓今天走的是后一种。',
      '当邓看了眼比分，投降两个字在嘴里转了一圈。',
    ],
  },
  {
    id: 'slack_aji_smoke', tags: ['摸鱼'], level: '日常', weight: 3, cooldown: 1, requires: ['aji'],
    lines: [
      '阿鸡溜到门口抽了根烟，回来继续看歪出装。',
      '阿鸡摸鱼：烟、手机、一套没人敢跟的出装。',
      '阿鸡说出去透气，烟灭了才回来。',
      '网吧角落飘过一点烟味。阿鸡已经坐回去研究克烈了。',
    ],
  },
  {
    id: 'slack_aji_build', tags: ['摸鱼'], level: '日常', weight: 3, cooldown: 1, requires: ['aji'],
    lines: [
      '阿鸡在自定义里试克烈的新出装，说这是版本答案。',
      '这个出装解说十年没见过。阿鸡说十年太短。',
      '阿鸡把训练模式最小化，下面是一套野路子出装笔记。',
      '阿鸡：“五个位置哪里都能撑。”他正在第六套出装里选。',
    ],
  },
  {
    id: 'slack_gl_one', tags: ['摸鱼'], level: '日常', weight: 3, cooldown: 2, requires: ['gouliang'],
    segments: ['team', 'free'],
    lines: [
      '狗粮打完一把摘了耳机：“记住了，我只玩一把。”',
      '狗粮说累了。上一把才刚结束。',
      '狗粮靠回椅背，嘴还在动，手已经不排了。',
      '有人叫狗粮再来一把。他说记住了，他只玩一把。',
    ],
  },
  {
    id: 'slack_dibi_delta', tags: ['摸鱼'], level: '日常', weight: 3, cooldown: 2, requires: ['dibi'],
    lines: [
      '弟必切出去玩了会儿三角洲，说就一局。',
      '弟必的摸鱼很安静，屏幕上是三角洲。',
      '弟必打完三角洲回来，说中路下一把再补。',
      '弟必没说话。耳机里是另一款游戏的声音。',
    ],
  },
  {
    id: 'slack_aji_delta', tags: ['摸鱼'], level: '日常', weight: 2, cooldown: 3, requires: ['aji'],
    lines: [
      '阿鸡偷偷开了把单机，最小化在训练模式下面。',
      '阿鸡的屏幕在出装笔记和三角洲之间切。',
      '阿鸡说在研究版本，实际切出去玩了十分钟。',
      '阿鸡把单机窗口藏到任务栏里，人还在笑。',
    ],
  },
  {
    id: 'slack_piegan', tags: ['摸鱼'], level: '日常', weight: 3, cooldown: 2, requires: ['piegan'],
    lines: [
      '撇干拆了一包辣条，眼睛还在看上路被抓的回放。',
      '撇干摸鱼就两件事：刷手机，吃零食。',
      '撇干熬着，薯片袋子空了，人还没排。',
      '撇干刷小红书，死亡回放停在旁边。',
    ],
  },
  {
    id: 'slack_dangdeng', tags: ['摸鱼'], level: '日常', weight: 3, cooldown: 2, requires: ['dangdeng'],
    lines: [
      '当邓自己没排，跑去指点别人的出装。',
      '当邓午睡醒了第一句是点评队友装备。',
      '当邓刷着手机，还是抽空说了一句这鞋不对。',
      '出装警察今天没打野，在工位之间巡逻。',
    ],
  },
  {
    id: 'slack_diaolong', tags: ['摸鱼'], level: '日常', weight: 2, cooldown: 2, requires: ['diaolong'],
    segments: ['lunch', 'nap', 'free'],
    lines: [
      '吊隆趴下了。作息不规律，这是今天的一觉。',
      '吊隆刷完手机，头一点，辅助位空了。',
      '吊隆说看一会儿比赛，然后睡过去了。',
      '吊隆的午睡没有预告。醒了继续起外号。',
    ],
  },
  {
    id: 'bond_aji_dangdeng', tags: ['交情'], level: '有趣', weight: 2, cooldown: 4, requires: ['aji', 'dangdeng'],
    minBond: { a: 'aji', b: 'dangdeng', n: 40 },
    lines: [
      '阿鸡和当邓吵完出装，又坐到一起排。最铁的那种吵。',
      '当邓骂完阿鸡的鞋子，把双排邀请推了过去。阿鸡秒接。',
      '阿鸡靠着当邓的椅背笑。当邓嘴上还在说这出装不行。',
      '两个人语音里互相呛，排位房间却是一起的。',
    ],
    bond: { a: 'aji', b: 'dangdeng', n: 1 },
  },
  {
    id: 'bond_aji_dibi', tags: ['交情'], level: '有趣', weight: 2, cooldown: 4, requires: ['aji', 'dibi'],
    minBond: { a: 'aji', b: 'dibi', n: 40 },
    lines: [
      '弟必和阿鸡并排坐着。一个不说话，一个在讲理论。都自在。',
      '阿鸡把歪出装讲给弟必。弟必点头，没反驳。',
      '弟必输了说下一把。阿鸡说下把他来背。两个人都信。',
      '和事佬今天没开口。阿鸡已经自己把场面圆回去了。',
    ],
    bond: { a: 'aji', b: 'dibi', n: 1 },
  },
  {
    id: 'bond_bot', tags: ['交情'], level: '有趣', weight: 2, cooldown: 4, requires: ['gouliang', 'diaolong'],
    minBond: { a: 'gouliang', b: 'diaolong', n: 40 },
    lines: [
      '狗粮和吊隆下路对了一眼。钩子出去之前，输出已经在等了。',
      '吊隆说这波他开。狗粮“嗯”了一声，嘴上还在损。',
      '下路两个人的节奏对上了。连招叫什么，还没人起名。',
      '狗粮的输出跟上了吊隆的钩。两个人都没提配合这两个字。',
    ],
    bond: { a: 'gouliang', b: 'diaolong', n: 1 },
  },
];

export const NICKNAMES = [
  '闪现存款', '野区路灯', '补刀诗人', '键盘加湿器', '红温气象台',
  '一血收藏家', '水晶守门员', '耳机头发', '地图游客', '防御塔亲戚',
];

export const GRUDGE_LINES: Record<string, string[]> = {
  'aji|dangdeng': [
    '当邓和阿鸡还记着刚才那套出装，语音里互相呛了一句。人还是坐在一起。',
    '出装的心结还挂着。当邓看了一眼鞋子，阿鸡先笑了。',
  ],
  'dangdeng|piegan': [
    '上路和打野的心结还挂着。撇干不说话，当邓也不来。',
    '撇干又提对面打野三分钟来一次。当邓这次没接。',
  ],
  'gouliang|piegan': [
    '狗粮损撇干损过了。撇干闷着，狗粮也收了一点。',
    '撇干看着狗粮，没回嘴。心结还在这一小段里。',
  ],
  'diaolong|gouliang': [
    '吊隆把锅甩给狗粮之后，下路这一小段话少了。',
    '狗粮没接吊隆那句输出呢。钩子还是会扔，人先别着。',
  ],
  'dangdeng|diaolong': [
    '吊隆把开团的锅丢给当邓。打野没接。',
    '两个指挥都觉得那波不该自己背。心结挂在语音里。',
  ],
};
