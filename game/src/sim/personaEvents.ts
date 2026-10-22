// M5 第一刀：人设专属事件。名场面、互怼、甩锅、摸鱼、交情、心结、两对未命名连招。
// 每条至少四句。没覆盖到的连锁和 15 对里其余连招名，文档里标【待定】。
import { pick, seeded, weightedPick, type Rand } from '../core/rng';
import {
  COMBOS,
  ROSTER_BY_ID,
  SOCIAL_TIES,
  pairKey,
  type MemberDef,
} from '../data/roster';
import type { GameState, LogEntry } from '../save/state';

export interface PersonaFire {
  id: string;
  level: LogEntry['level'];
  text: string;
  ids: string[];
}

interface BoardEvent {
  id: string;
  level: LogEntry['level'];
  members: string[];
  /** 在场的人里再挑一个当 {b}；'rest' = 除 members 外的任意人 */
  alt?: string[] | 'rest';
  segments: string[];
  cooldown: number;
  weight: number;
  minPresent?: number;
  texts: readonly string[];
}

const NICK_A = ['电风扇', '冰箱贴', '午夜', '三楼', '半熟', '回声', '塑料', '无糖', '折叠', '星期二'];
const NICK_B = ['骑士', '股东', '气象员', '班主任', '质检员', '领航员', '保管员', '观察员'];

function nameOf(id: string): string {
  return ROSTER_BY_ID[id]?.name ?? id;
}

function coolKey(id: string): string {
  return `persona:${id}`;
}

function ready(state: GameState, id: string, day: number): boolean {
  return (state.cooldowns[coolKey(id)] ?? 0) <= day;
}

function stamp(state: GameState, id: string, day: number, days: number): void {
  state.cooldowns[coolKey(id)] = day + days;
}

const EVENTS: BoardEvent[] = [
  {
    id: 'moment_pig',
    level: '有趣',
    members: ['aji'],
    segments: ['morning', 'team', 'free'],
    cooldown: 5,
    weight: 2,
    texts: [
      '有人翻到旧录像：阿鸡的猪妹把三路节奏带飞的那场。阿鸡说还能再打。',
      '阿鸡猪妹大赛又被提起来。当邓说那是运气，阿鸡已经把出装写在纸上。',
      '群里转了一段猪妹打野。阿鸡：“绝活就是绝活。”',
      '名场面回放。猪妹开团那波，阿鸡看得比当事人还开心。',
    ],
  },
  {
    id: 'moment_miracle',
    level: '剧情',
    members: [],
    segments: ['team', 'free'],
    cooldown: 4,
    weight: 2,
    minPresent: 4,
    texts: [
      '这把眼看没了，一波团还是翻过来。有人说：奇迹团，又是 SSB。',
      '经济落后了一截，团战打完水晶没了。屋里安静两秒，然后一起笑。',
      '解说如果在场会说起势。屋里的人只说：又被我们拖到一团。',
      '整场被压，最后一波人齐了。这种翻盘他们打过太多次，还是会喊。',
    ],
  },
  {
    id: 'habit_sion',
    level: '日常',
    members: ['piegan', 'dangdeng'],
    segments: ['team', 'free'],
    cooldown: 3,
    weight: 3,
    texts: [
      '有人把石头人亮出来。撇干：“上单我不玩这个。”剑魔还是锁了。',
      '队伍想要能开团的上路，石头人排在最前。撇干看了一眼，选了剑魔。',
      '当邓：“石头人开团多稳。”撇干：“你打野你选。我不上。”',
      '有人问要不要练石头人。撇干摇头，键盘已经停在剑魔上。',
    ],
  },
  {
    id: 'moment_allin',
    level: '有趣',
    members: ['piegan'],
    segments: ['team', 'free'],
    cooldown: 2,
    weight: 3,
    texts: [
      '撇干上路又干进去了。时机不对，人没出来，后面几分钟很安静。',
      '撇干被蹲到一次，剑魔的大还交得出去，心态先交了。',
      '干架翻车。撇干说对面打野早就在草里，当邓看了他一眼。',
      '撇干：“这波我点了。”点完被反杀。这把上路到此为止。',
    ],
  },
  {
    id: 'banter_build',
    level: '有趣',
    members: ['aji', 'dangdeng'],
    segments: ['morning', 'lunch', 'team', 'free'],
    cooldown: 1,
    weight: 5,
    texts: [
      '当邓：“你这出装谁批准的？”阿鸡：“理论批准的。”',
      '出装警察对着野路子出装开讲。阿鸡听完，说下把再加一件。',
      '当邓把阿鸡的装备念出声。阿鸡点头，像在听夸奖。',
      '两人最铁，也最爱吵出装。吵完阿鸡还是那套，当邓还是要查。',
    ],
  },
  {
    id: 'banter_roast',
    level: '有趣',
    members: ['gouliang'],
    alt: ['aji', 'piegan'],
    segments: ['morning', 'lunch', 'team', 'free', 'dinner'],
    cooldown: 1,
    weight: 5,
    texts: [
      '狗粮对着{b}输出了一串吐槽，中间没换气。',
      '狗粮：“{b}，这波你自己听一下。”说完自己先乐了。',
      '{b}还没辩，狗粮的下一句已经到了。',
      '狗粮损{b}损得很顺，损完还问要不要喝水。',
    ],
  },
  {
    id: 'banter_jungle',
    level: '有趣',
    members: ['piegan', 'dangdeng'],
    segments: ['team', 'free', 'dinner'],
    cooldown: 1,
    weight: 5,
    texts: [
      '撇干：“对面什么打野啊，3 分钟来一次，5 分钟又来一次。”当邓：“那你别送。”',
      '当邓说上路别硬开。撇干说打野别只在线上当观众。',
      '帮不帮上路这件事，今天又开了一轮，没有结论。',
      '撇干要打野，当邓要他活着。两句话来回，像固定台词。',
    ],
  },
  {
    id: 'blame_aji',
    level: '有趣',
    members: ['aji'],
    alt: ['dangdeng', 'piegan'],
    segments: ['team', 'free'],
    cooldown: 1,
    weight: 4,
    texts: [
      '{b}把这把的锅递过来。阿鸡接住：“行，我的。下把克烈。”',
      '锅落到阿鸡的出装上。他笑着说理论还在实验。',
      '{b}说完，阿鸡点头点得很快，脸皮厚这事他认。',
      '阿鸡：“下把我的。”背锅背得很熟练，屋里有人笑。',
    ],
  },
  {
    id: 'blame_hook',
    level: '有趣',
    members: ['diaolong'],
    alt: ['gouliang', 'dangdeng'],
    segments: ['team', 'free'],
    cooldown: 2,
    weight: 3,
    texts: [
      '有人说吊隆这波。吊隆看向{b}：“之前那下呢？”',
      '吊隆不闷着，锅分给{b}，句子不长。',
      '吊隆：“钩子我认。{b}那波自己说。”',
      '被点到的时候，吊隆把话头送到{b}那边。',
    ],
  },
  {
    id: 'habit_build',
    level: '日常',
    members: ['aji'],
    segments: ['morning', 'free', 'nap'],
    cooldown: 1,
    weight: 4,
    texts: [
      '阿鸡又在研究没人玩的出装，笔记本翻到新的一页。',
      '阿鸡抽烟的空当还在想克烈第一件出什么。',
      '阿鸡：“这件装备冷门，所以有空间。”没人接，他继续算。',
      '歪出装时间。阿鸡自己跟自己辩论，两边都赢了。',
    ],
  },
  {
    id: 'habit_one',
    level: '日常',
    members: ['gouliang'],
    segments: ['team', 'free'],
    cooldown: 1,
    weight: 4,
    texts: [
      '狗粮打完一把，摘了一只耳机：“记住了，我只玩一把。”',
      '狗粮说累了。三分钟后他又把耳机戴回去。',
      '“就一把。”狗粮说这话的时候，队列已经排上了。',
      '狗粮喊累喊得很真诚，手还在点匹配。',
    ],
  },
  {
    id: 'habit_assassin',
    level: '有趣',
    members: ['dibi'],
    segments: ['team', 'free'],
    cooldown: 1,
    weight: 4,
    texts: [
      '对面锁了刺客。弟必看了一眼：“完了。”人还是坐着。',
      '弟必碰到永恩，对线爆炸这个流程他比谁都熟。',
      '弟必不游走，线也不让。团战之前他打算先活着。',
      '有人让弟必游走。他说等团，线上这截他认。',
    ],
  },
  {
    id: 'habit_nick',
    level: '日常',
    members: ['diaolong'],
    alt: 'rest',
    segments: ['morning', 'lunch', 'free', 'dinner'],
    cooldown: 1,
    weight: 4,
    texts: [
      '吊隆：“{b}最新外号，{nick}。”{b}没听懂，他也没解释。',
      '外号时间。吊隆把{b}叫成{nick}，用了整整一个下午。',
      '吊隆看{b}的屏幕，忽然说：“{nick}。最新的。”',
      '{b}问外号什么意思。吊隆：“{nick}就是{nick}。”',
    ],
  },
  {
    id: 'habit_ff',
    level: '有趣',
    members: ['dangdeng'],
    segments: ['team', 'free'],
    cooldown: 1,
    weight: 4,
    texts: [
      '三分钟经济没领先。当邓已经在语音里说要不要投。',
      '当邓：“这把没了。”雪人还在，他的投降键先亮了。',
      '逆风刚起，当邓的指挥就变成了指责，中间夹着一次投降。',
      '当邓喊投。吊隆如果在，通常会说比赛不能投；组排里没人真投。',
    ],
  },
  {
    id: 'habit_delta',
    level: '日常',
    members: ['dibi'],
    segments: ['free', 'morning', 'lunch'],
    cooldown: 2,
    weight: 2,
    texts: [
      '弟必训练模式挂着，手机里是三角洲。',
      '弟必说看一眼三角洲，一眼变成一局。',
      '和事佬这会儿谁也不劝，人在三角洲里。',
      '弟必的摸鱼很安静，屏幕亮着，人不说话。',
    ],
  },
];

function fill(text: string, map: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? '');
}

function pickAlt(ev: BoardEvent, present: Set<string>, rand: Rand): string | null {
  if (!ev.alt) return null;
  const pool = ev.alt === 'rest'
    ? [...present].filter((id) => !ev.members.includes(id))
    : ev.alt.filter((id) => present.has(id));
  if (!pool.length) return null;
  return pick(rand, pool);
}

interface Candidate {
  id: string;
  weight: number;
  cooldown: number;
  level: LogEntry['level'];
  ids: string[];
  text: string;
}

function staticCandidates(state: GameState, present: Set<string>, segment: string, day: number, rand: Rand): Candidate[] {
  const out: Candidate[] = [];
  for (const ev of EVENTS) {
    if (!ev.segments.includes(segment)) continue;
    if (ev.minPresent && present.size < ev.minPresent) continue;
    if (!ev.members.every((id) => present.has(id))) continue;
    if (!ready(state, ev.id, day)) continue;
    const b = pickAlt(ev, present, rand);
    if (ev.alt && !b) continue;
    const nick = `${pick(rand, NICK_A)}${pick(rand, NICK_B)}`;
    const text = fill(pick(rand, ev.texts), { b: b ? nameOf(b) : '', nick });
    out.push({
      id: ev.id,
      weight: ev.weight,
      cooldown: ev.cooldown,
      level: ev.level,
      ids: b ? [...ev.members, b] : [...ev.members],
      text,
    });
  }
  return out;
}

function bondCandidates(state: GameState, present: Set<string>, segment: string, day: number, rand: Rand): Candidate[] {
  if (!['morning', 'lunch', 'team', 'free', 'dinner'].includes(segment)) return [];
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const tie of SOCIAL_TIES) {
    if (tie.kind !== 'close') continue;
    const key = pairKey(tie.a, tie.b);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!present.has(tie.a) || !present.has(tie.b)) continue;
    const id = `bond:${key}`;
    if (!ready(state, id, day)) continue;
    const bond = state.relations[key]?.bond ?? 0;
    const warm = bond >= 65;
    const texts = warm
      ? [
          `${nameOf(tie.a)}和${nameOf(tie.b)}这会儿不用喊，人已经坐到一起了。`,
          `好兄弟的日常：${nameOf(tie.a)}一开口，${nameOf(tie.b)}就知道下文。`,
          `${nameOf(tie.a)}、${nameOf(tie.b)}并排，吵归吵，座位是挨着的。`,
          `交情摆在那儿。${nameOf(tie.a)}和${nameOf(tie.b)}分零食都不怎么说话。`,
        ]
      : [
          `${nameOf(tie.a)}和${nameOf(tie.b)}凑在一块，熟得不用找话题。`,
          `${nameOf(tie.a)}把椅子挪向${nameOf(tie.b)}，谁也没觉得奇怪。`,
          `最铁的那种：${nameOf(tie.a)}损一句，${nameOf(tie.b)}接得住。`,
          `${nameOf(tie.a)}、${nameOf(tie.b)}一起看同一块屏幕，头靠得很近。`,
        ];
    out.push({
      id,
      weight: 2 + bond / 40,
      cooldown: 2,
      level: '日常',
      ids: [tie.a, tie.b],
      text: pick(rand, texts),
    });
  }
  return out;
}

function knotCandidates(state: GameState, present: Set<string>, segment: string, day: number, rand: Rand): Candidate[] {
  if (!['team', 'free', 'dinner', 'lunch'].includes(segment)) return [];
  const out: Candidate[] = [];
  for (const [key, rel] of Object.entries(state.relations)) {
    if (!rel.knots.length) continue;
    const [a, b] = key.split('|');
    if (!present.has(a) || !present.has(b)) continue;
    const id = `knot:${key}`;
    if (!ready(state, id, day)) continue;
    const cause = rel.knots[0].cause;
    const peacemaker = present.has('dibi') && a !== 'dibi' && b !== 'dibi';
    const texts = peacemaker && rand() < 0.5
      ? [
          `心结还在（${cause}）。弟必插了一句“没事，下一把”，两人声音小了一点。`,
          `弟必没站队，只把${nameOf(a)}和${nameOf(b)}的话接开。原因还是${cause}。`,
          `和事佬上线。弟必不评理，${cause}这页先翻过去半页。`,
          `${nameOf(a)}和${nameOf(b)}还别着（${cause}）。弟必倒了两杯水放中间。`,
        ]
      : [
          `${nameOf(a)}和${nameOf(b)}还别着。原因写在心结上：${cause}。`,
          `小心结没化（${cause}）。${nameOf(a)}跟${nameOf(b)}说话比平时短。`,
          `${cause}这事还没过去。${nameOf(a)}看了${nameOf(b)}一眼，没开口。`,
          `两人照常坐着，${cause}让这几句对话硬了一点。`,
        ];
    out.push({
      id,
      weight: 7,
      cooldown: 2,
      level: '有趣',
      ids: peacemaker ? [a, b, 'dibi'] : [a, b],
      text: pick(rand, texts),
    });
  }
  return out;
}

function comboCandidates(state: GameState, present: Set<string>, segment: string, day: number, rand: Rand): Candidate[] {
  if (!['team', 'free', 'morning'].includes(segment)) return [];
  const out: Candidate[] = [];
  for (const combo of COMBOS) {
    if (!present.has(combo.a) || !present.has(combo.b)) continue;
    const id = `combo:${pairKey(combo.a, combo.b)}`;
    if (!ready(state, id, day)) continue;
    const a = nameOf(combo.a);
    const b = nameOf(combo.b);
    const texts = combo.lane === '下路'
      ? [
          `${b}钩子一中，${a}跟进收掉。这套下路连招还没有名字。`,
          `${a}和${b}下路这波很顺。群里想起名，想了半天，空着。`,
          `下路二人组又打出配合。专名还空着，先记在连招槽里。`,
          `${b}开，${a}收。默契有了，名字以后再说。`,
        ]
      : [
          `${b}从野区包过来，${a}的团战技能刚好转好。中野这套还没有名字。`,
          `${a}和${b}中野这波对上了。连招槽留着，名字空着。`,
          `中野联动打出来了。谁都说眼熟，谁都没给它起名。`,
          `${b}带节奏，${a}在中间站住。这套配合先这么打，名字以后补。`,
        ];
    out.push({
      id,
      weight: 3,
      cooldown: 2,
      level: '有趣',
      ids: [combo.a, combo.b],
      text: pick(rand, texts),
    });
  }
  return out;
}

function scrimCandidate(state: GameState, present: Set<string>, segment: string, day: number, rand: Rand): Candidate | null {
  if (segment !== 'team' && segment !== 'free') return null;
  const id = 'scrim';
  if (!ready(state, id, day)) return null;
  const ids = [...present];
  if (ids.length < 3) return null;
  const who = pick(rand, ids);
  const def: MemberDef = ROSTER_BY_ID[who];
  const won = rand() < 0.5;
  const line = pick(rand, won ? def.winLines : def.loseLines);
  const head = won ? '组排这把赢了。' : '组排这把输了。';
  return {
    id,
    weight: segment === 'team' ? 6 : 2,
    cooldown: 1,
    level: '有趣',
    ids: [who],
    text: `${head}${line}`,
  };
}

export function tryPersonaEvent(state: GameState, presentIds: string[], segment: string, day: number, minute: number): PersonaFire | null {
  const rand = seeded(state.seed, 'persona', day, Math.floor(minute / 20));
  if (rand() > 0.62) return null;
  const present = new Set(presentIds);
  if (present.size < 1) return null;
  const bag: Candidate[] = [
    ...staticCandidates(state, present, segment, day, rand),
    ...bondCandidates(state, present, segment, day, rand),
    ...knotCandidates(state, present, segment, day, rand),
    ...comboCandidates(state, present, segment, day, rand),
  ];
  const scrim = scrimCandidate(state, present, segment, day, rand);
  if (scrim) bag.push(scrim);
  const picked = weightedPick(rand, bag, (c) => c.weight);
  if (!picked) return null;
  stamp(state, picked.id, day, picked.cooldown);
  return { id: picked.id, level: picked.level, text: picked.text, ids: picked.ids };
}
