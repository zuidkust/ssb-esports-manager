// 比赛结算。从 inspiration/电竞经理 的引擎移植：种子随机、时间轴节点、逐杀记账、
// 经济、提前 GG、膀胱局延长、战术五环。7 属性里的 pool 在灵感版是死属性（预留 BP），
// 本作没有 BP，英雄池只约束选人，不另加节点权重。
//
// 本作接上的字段：位置适性（本位 1 / 次位 0.85 / 补位 0.75 / 其他 0.6）、
// 疲劳、压力、心结倍率、默契连招、撇干剑魔 ×1.3、狗粮「只玩一把」。
//
// TODO（灵感版特性，这刀不进结算，避免和人设稿已经落地的属性初值叠乘）：
// - 阿鸡觉醒、吊儿郎当的训练惩罚
// - 撇干神鬼二象（今日底色来回翻）。剑魔 +30% 已进
// - 当邓顺逆风的额外摇摆、弟必缚地魔节点、吊隆对线指挥官节点
// - 狗粮优势太大时整活（−25）。「只玩一把」的局数衰减已进

import { ABILITY_KEYS, type AbilityKey } from '../data/roster';
import { counterMult, tacticNodeMult, type TacticId } from '../data/tactics';
import { mulberry32, type Rand } from '../core/rng';
import type { PerkId } from '../data/leagues';

export type Slot = 'top' | 'jgl' | 'mid' | 'adc' | 'sup';
export const SLOTS: Slot[] = ['top', 'jgl', 'mid', 'adc', 'sup'];
export const SLOT_CN: Record<Slot, string> = { top: '上单', jgl: '打野', mid: '中单', adc: 'AD', sup: '辅助' };

export type NodeKey = 'lane' | 'gank' | 'skirmish' | 'dragon' | 'herald' | 'baron' | 'siege' | 'elder' | 'final';

interface NodeType {
  name: string;
  w: Partial<Record<AbilityKey, number>>;
  inv: Record<Slot, number>;
  kMin: number;
  kMax: number;
  twMin: number;
  twMax: number;
}

const NODE_TYPES: Record<NodeKey, NodeType> = {
  lane: { name: '对线期', w: { lane: 0.5, mech: 0.3, sense: 0.2 }, inv: { top: 1, jgl: 0.6, mid: 1, adc: 1, sup: 0.4 }, kMin: 0, kMax: 2, twMin: 0, twMax: 0 },
  gank: { name: '游走抓单', w: { roam: 0.5, sense: 0.3, mech: 0.2 }, inv: { top: 0.6, jgl: 1.4, mid: 1.2, adc: 0.6, sup: 0.8 }, kMin: 0, kMax: 2, twMin: 0, twMax: 0 },
  skirmish: { name: '野区遭遇战', w: { roam: 0.4, sense: 0.3, mech: 0.3 }, inv: { top: 0.4, jgl: 1.5, mid: 1, adc: 0.5, sup: 0.7 }, kMin: 1, kMax: 2, twMin: 0, twMax: 1 },
  dragon: { name: '小龙团', w: { fight: 0.4, mech: 0.3, sense: 0.3 }, inv: { top: 0.9, jgl: 1, mid: 1, adc: 1, sup: 0.9 }, kMin: 1, kMax: 3, twMin: 0, twMax: 1 },
  herald: { name: '峡谷先锋团', w: { lane: 0.2, fight: 0.3, sense: 0.3, mech: 0.2 }, inv: { top: 1.1, jgl: 1.2, mid: 0.9, adc: 0.8, sup: 0.8 }, kMin: 1, kMax: 3, twMin: 1, twMax: 2 },
  baron: { name: '大龙团', w: { fight: 0.4, sense: 0.3, mental: 0.3 }, inv: { top: 1, jgl: 1, mid: 1, adc: 1, sup: 1 }, kMin: 2, kMax: 5, twMin: 1, twMax: 2 },
  siege: { name: '推高地', w: { fight: 0.35, mech: 0.25, sense: 0.2, mental: 0.2 }, inv: { top: 1, jgl: 1, mid: 1, adc: 1, sup: 1 }, kMin: 2, kMax: 4, twMin: 2, twMax: 3 },
  elder: { name: '远古龙团', w: { fight: 0.4, mental: 0.3, sense: 0.3 }, inv: { top: 1, jgl: 1, mid: 1, adc: 1, sup: 1 }, kMin: 2, kMax: 5, twMin: 1, twMax: 2 },
  final: { name: '高地决战', w: { fight: 0.35, mech: 0.3, mental: 0.35 }, inv: { top: 1, jgl: 1, mid: 1, adc: 1, sup: 1 }, kMin: 2, kMax: 5, twMin: 3, twMax: 4 },
};

const TL_MAIN: { key: NodeKey; t: number }[] = [
  { key: 'lane', t: 3 }, { key: 'dragon', t: 5 }, { key: 'lane', t: 7 }, { key: 'dragon', t: 10 },
  { key: 'herald', t: 13 }, { key: 'dragon', t: 15 }, { key: 'lane', t: 17 }, { key: 'dragon', t: 20 },
  { key: 'baron', t: 22 }, { key: 'siege', t: 25 }, { key: 'final', t: 28 },
];
const TL_OPT: { key: NodeKey; t: number }[] = [
  { key: 'skirmish', t: 9 }, { key: 'gank', t: 12 }, { key: 'gank', t: 18 }, { key: 'skirmish', t: 23 },
];

const HL: Record<NodeKey, string[]> = {
  lane: ['控线压制，补刀领先一截', '换血细节拉满', '兵线运营，把对面逼回家'],
  gank: ['绕后包饺子', '从河道里蹲到人', '抓单时机很脏'],
  skirmish: ['野区反蹲成功', '入侵反野，全身而退', '视野压制，节奏被抓崩'],
  dragon: ['先手开团很整齐', '拉扯完白拿一条龙', '站位干净，几乎没亏血'],
  herald: ['先锋撞塔，白赚一座', '先锋团把对面压回家', '放先锋压塔，节奏起来了'],
  baron: ['大龙团听得懂指挥', '偷掉大龙，对面心态先没了', '正面控下大龙'],
  siege: ['三路兵线一起推', '兵临城下，水晶在晃', '抱团推进，不给回头的机会'],
  elder: ['远古龙入手', '远古团把对面压回家', '远古龙团站位没散'],
  final: ['高地强开，一波带走', '绕后开团，直奔水晶', '中路一波，比赛结束'],
};
const BL = ['迷之走位被秒', '闪现撞墙', '大招放空', '越塔失败，白给', '走位太靠前，被先手点名'];
const BL_SAFE = ['大招放空', '指挥犹豫，错失良机', '轮换慢了，资源被白嫖'];

const POS_KILL: Record<Slot, number> = { top: 0.9, jgl: 0.8, mid: 1.15, adc: 1.35, sup: 0.2 };
const POS_DEATH: Record<Slot, number> = { top: 1.2, jgl: 1.15, mid: 1, adc: 1, sup: 0.85 };
const POS_ASSIST: Record<Slot, number> = { top: 1, jgl: 1.5, mid: 1.1, adc: 0.8, sup: 1.7 };

export interface Rng {
  seed: number;
  next: Rand;
  gauss: () => number;
}

export function makeRng(seed: number): Rng {
  const next = mulberry32(seed >>> 0);
  return {
    seed: seed >>> 0,
    next,
    gauss() {
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

export function fmtClock(min: number): string {
  const m = Math.floor(min);
  const s = Math.floor((min - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 压力、疲劳对单节点的加减。压力 >60 每点 −0.12，<22 小幅加成；疲劳 >40 每点 −0.09。 */
export function formPenalty(stress: number, fatigue: number): number {
  let v = 0;
  if (stress > 60) v -= (stress - 60) * 0.12;
  else if (stress < 22) v += 2;
  if (fatigue > 40) v -= (fatigue - 40) * 0.09;
  return v;
}

export interface EnginePlayer {
  id: string;
  name: string;
  hero: string;
  stats: Record<AbilityKey, number>;
  /** 每个位置的适性倍率 */
  fit: Record<Slot, number>;
  stress: number;
  fatigue: number;
  /** 撇干拿剑魔：战斗属性 ×1.3 */
  aatroxAmp?: boolean;
  /** 狗粮只玩一把：第 1 局全属性 +6，之后每局 −6 */
  oneGame?: boolean;
  /** 心结。1 个 ×0.92，2 个 ×0.85 */
  knotMult?: number;
  /** 默契连招生效的节点 */
  comboOn?: string[];
  comboTag?: string;
  comboText?: string;
}

export interface MatchOpts {
  sigma?: number;
  snowball?: number;
  nodeCount?: number;
  gameIdx?: number;
  firstBuff?: number;
  decayStep?: number;
  nameA?: string;
  nameB?: string;
  tacA?: TacticId | null;
  tacB?: TacticId | null;
  /** 开赛前的解说，比如选人、心结、连招。原样进日志 */
  preface?: string[];
  /** 对手特色，作用在 B 方 */
  perkB?: PerkId;
}

export interface MatchEvent {
  t: 'draft' | 'nd' | 'tr' | 'hl' | 'bl';
  s: string;
  clock: number;
  killsA: number;
  killsB: number;
  goldA: number;
  goldB: number;
  towersA: number;
  towersB: number;
}

export interface BoxRow {
  id: string;
  name: string;
  hero: string;
  slot: Slot;
  side: 'A' | 'B';
  k: number;
  d: number;
  a: number;
  join: number;
  grade: string;
  mvp: boolean;
}

export interface MatchResult {
  win: 'A' | 'B';
  blowout: boolean;
  goldA: number;
  goldB: number;
  killsA: number;
  killsB: number;
  towersA: number;
  towersB: number;
  gameLen: number;
  mvpId: string;
  mvpName: string;
  nodes: number;
  firstBlood: string | null;
  log: MatchEvent[];
  box: BoxRow[];
}

export function combatStats(p: EnginePlayer, gameIdx: number, firstBuff = 6, decayStep = 6): Record<AbilityKey, number> {
  const st = { ...p.stats };
  if (p.aatroxAmp) {
    for (const k of ABILITY_KEYS) st[k] *= 1.3;
  }
  if (p.oneGame) {
    const m = firstBuff - decayStep * (gameIdx - 1);
    for (const k of ABILITY_KEYS) st[k] += m;
  }
  return st;
}

function buildSeq(n: number, rng: Rng): { key: NodeKey; t: number }[] {
  const base = TL_MAIN.map((x) => ({ ...x }));
  if (n >= base.length) {
    const pool = TL_OPT.map((x) => ({ ...x }));
    while (base.length < n && pool.length) {
      const idx = Math.floor(rng.next() * pool.length);
      const item = pool.splice(idx, 1)[0];
      let pos = 0;
      while (pos < base.length && base[pos].t < item.t) pos++;
      base.splice(pos, 0, item);
    }
  } else {
    while (base.length > n) {
      let best = -1;
      let bd = 1e9;
      for (let i = 2; i < base.length - 2; i++) {
        if (!['lane', 'dragon', 'skirmish', 'gank'].includes(base[i].key)) continue;
        const d = Math.abs(i - (base.length - 1) / 2);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best < 0) break;
      base.splice(best, 1);
    }
  }
  return base;
}

function wPick(w: number[], rng: Rng): number {
  let s = 0;
  for (const x of w) s += x;
  let r = rng.next() * s;
  for (let j = 0; j < w.length; j++) {
    r -= w[j];
    if (r < 0) return j;
  }
  return w.length - 1;
}

function normOf(team: EnginePlayer[], contrib: Record<string, number>, j: number): number {
  let ts = 0;
  for (const p of team) ts += contrib[p.id] || 0;
  ts = Math.max(1, ts);
  return Math.min(1.5, Math.max(0.4, ((contrib[team[j].id] || 0) / ts) * 5));
}

function killW(team: EnginePlayer[], contrib: Record<string, number>): number[] {
  return team.map((_, j) => Math.max(0.05, Math.pow(normOf(team, contrib, j), 1.7) * POS_KILL[SLOTS[j]]));
}
function deathW(team: EnginePlayer[], contrib: Record<string, number>): number[] {
  return team.map((_, j) => Math.max(0.25, POS_DEATH[SLOTS[j]] * (1.28 - 0.45 * normOf(team, contrib, j))));
}
function assistW(team: EnginePlayer[], contrib: Record<string, number>): number[] {
  return team.map((_, j) => Math.max(0.1, POS_ASSIST[SLOTS[j]] * (0.75 + 0.25 * normOf(team, contrib, j))));
}

function pick<T>(arr: readonly T[], rng: Rng): T {
  return arr[Math.floor(rng.next() * arr.length)];
}

export function simulateMatch(playersA: EnginePlayer[], playersB: EnginePlayer[], opts: MatchOpts, rng: Rng): MatchResult {
  const sigma = opts.sigma ?? 13;
  const snowball = opts.snowball ?? 0.8;
  const nodeCount = opts.nodeCount ?? 13;
  const gameIdx = opts.gameIdx ?? 1;
  const firstBuff = opts.firstBuff ?? 6;
  const decayStep = opts.decayStep ?? 6;
  const nameA = opts.nameA ?? 'SSB';
  const nameB = opts.nameB ?? '对手';
  const tacA = opts.tacA ?? null;
  const tacB = opts.tacB ?? null;
  const perk = opts.perkB;

  const A = playersA;
  const B = playersB;
  const stA = A.map((p) => combatStats(p, gameIdx, firstBuff, decayStep));
  const stB = B.map((p) => combatStats(p, gameIdx, firstBuff, decayStep));
  const contrib: Record<string, number> = {};
  const nodeScores: Record<string, number[]> = {};
  for (const p of A.concat(B)) {
    contrib[p.id] = 0;
    nodeScores[p.id] = [];
  }

  let goldA = 0;
  let goldB = 0;
  let blowout = false;
  let nodesPlayed = 0;
  let lastWinner: 'A' | 'B' = 'A';
  let killsA = 0;
  let killsB = 0;
  let towersA = 0;
  let towersB = 0;
  let firstBlood: string | null = null;
  let baronBuff: 'A' | 'B' | null = null;
  const kda: Record<string, { k: number; d: number; a: number }> = {};
  for (const p of A.concat(B)) kda[p.id] = { k: 0, d: 0, a: 0 };
  let gameClock = 0;
  const ctr = counterMult(tacA, tacB);
  const seenCombo = new Set<string>();
  const log: MatchEvent[] = [];

  const snap = (t: MatchEvent['t'], s: string, clock = gameClock) => {
    log.push({
      t, s, clock,
      killsA, killsB, goldA, goldB, towersA, towersB,
    });
  };

  for (const line of opts.preface ?? []) snap('draft', line, 0);
  for (const p of A.concat(B)) {
    if (p.stress >= 78) snap('tr', `${p.name} 压力拉满，热身的时候都在走神。`, 0);
  }
  if (tacA && tacB && ctr.a > 1) snap('tr', `战术克制：${nameA} 的战术压过对面，全场节点 +5%。`, 0);
  else if (tacA && tacB && ctr.b > 1) snap('tr', `战术克制：${nameB} 的战术压过我们，全场节点 +5%。`, 0);
  const om = A.concat(B).some((p) => p.oneGame) ? firstBuff - decayStep * (gameIdx - 1) : null;
  const oneNote = om == null ? '' : ` · 当日第 ${gameIdx} 局（只玩一把 ${om >= 0 ? '+' : ''}${om}）`;
  snap('nd', `比赛开始 ｜ ${nameA} vs ${nameB}${oneNote}`, 0);

  function playNode(def: { key: NodeKey; t: number }): boolean {
    const type = NODE_TYPES[def.key];
    const clock = Math.max(1, def.t + rng.gauss() * 0.35);
    gameClock = clock;
    const chaos = rng.next() < 0.15;
    let sg = sigma * (chaos ? 2.5 : 1) * (def.t >= 20 ? 1.5 : 1);
    if (perk === 'botChaos' && def.key === 'lane') sg *= 1.6;
    const leadA = goldA - goldB;
    const leadB = goldB - goldA;

    let dcSlot = -1;
    if (perk === 'dc' && rng.next() < 0.08) {
      dcSlot = Math.floor(rng.next() * 5);
      snap('tr', `[${fmtClock(clock)}] 网管那边“网络波动”，我方有人卡了一下。`, clock);
    }
    let absentSlot = -1;
    if (perk === 'shortStaff' && def.t >= 30) {
      absentSlot = Math.floor(rng.next() * 5);
      snap('tr', `[${fmtClock(clock)}] 外卖骑手联队有人去接单，场上少了一个人。`, clock);
    }

    const calc = (team: EnginePlayer[], st: Record<AbilityKey, number>[], ownLead: number, side: 'A' | 'B', tacM: number) => {
      const out: number[] = [];
      const oppTeam = side === 'A' ? B : A;
      const oppSt = side === 'A' ? stB : stA;
      for (let j = 0; j < team.length; j++) {
        const p = team[j];
        const s = st[j];
        let base = 0;
        let oBase = 0;
        for (const k of ABILITY_KEYS) {
          const w = type.w[k] ?? 0;
          if (!w) continue;
          base += w * s[k];
          oBase += w * oppSt[j][k];
        }
        const fit = Math.max(0.6, Math.min(1, p.fit[SLOTS[j]] ?? 0.6));
        const oFit = Math.max(0.6, Math.min(1, oppTeam[j].fit[SLOTS[j]] ?? 0.6));
        const eff = base * fit;
        const oEff = oBase * oFit;
        const pr = eff - oEff;
        let val = eff + pr * 0.05;
        if (side === 'A' && (type.w.lane ?? 0) >= 0.4 && Math.abs(pr) >= 10 && rng.next() < 0.22) {
          const strong = pr > 0 ? p.name : oppTeam[j].name;
          const weak = pr > 0 ? oppTeam[j].name : p.name;
          snap('tr', `[${fmtClock(clock)}] ${strong} 对位压着 ${weak}。`, clock);
        }
        if (baronBuff === side) val += 8;
        val += formPenalty(p.stress, p.fatigue);
        if (p.knotMult && p.knotMult !== 1) val *= p.knotMult;
        if (p.comboOn?.includes(def.key)) {
          val *= 1.06;
          if (p.comboTag && !seenCombo.has(p.comboTag)) {
            seenCombo.add(p.comboTag);
            snap('hl', `[${fmtClock(clock)}] 默契连招【待定】：${p.comboText ?? '两人'}，这波 +6%。`, clock);
          }
        }
        val *= tacM;
        let snow = ownLead / 1000 * snowball;
        if (perk === 'snowball' && side === 'B') snow += ownLead / 1000 * 0.6;
        val += snow;
        const inv = type.inv[SLOTS[j]] || 1;
        let noise = rng.gauss() * sg * inv;
        if (perk === 'lowVariance' && side === 'B') noise *= 0.55;
        val = val * inv + noise;
        if (perk === 'early' && side === 'B' && def.t < 10) val *= 1.05;
        if (perk === 'earlyBoost' && side === 'B' && def.t < 13) val *= 1.05;
        if (perk === 'latePenalty' && side === 'B' && def.t >= 22) val *= 0.92;
        if (perk === 'lateBoost' && side === 'B' && def.t >= 20) val *= 1.06;
        if (perk === 'laneBoost' && side === 'B' && def.key === 'lane') val *= 1.04;
        if (side === 'A' && j === dcSlot) val *= 0.25;
        if (side === 'B' && j === absentSlot) val *= 0.15;
        contrib[p.id] += val + pr * 0.45 * inv;
        nodeScores[p.id].push(val + pr * 0.45 * inv);
        out.push(val);
      }
      return out;
    };

    const wLane = type.w.lane ?? 0;
    const wFight = type.w.fight ?? 0;
    const scoresA = calc(A, stA, leadA, 'A', tacticNodeMult(tacA, def.key, def.t, wLane, wFight, lastWinner, 'A', nodesPlayed) * ctr.a);
    const scoresB = calc(B, stB, leadB, 'B', tacticNodeMult(tacB, def.key, def.t, wLane, wFight, lastWinner, 'B', nodesPlayed) * ctr.b);
    baronBuff = null;
    const sumA = scoresA.reduce((a, b) => a + b, 0);
    const sumB = scoresB.reduce((a, b) => a + b, 0);
    const winner: 'A' | 'B' = sumA === sumB ? (rng.next() < 0.5 ? 'A' : 'B') : sumA > sumB ? 'A' : 'B';
    lastWinner = winner;
    const margin = Math.abs(sumA - sumB);
    const isFinal = def.key === 'final';
    const leadNow = Math.abs(goldA - goldB);
    const wName = winner === 'A' ? nameA : nameB;

    const kAll = type.kMin + Math.floor(rng.next() * (type.kMax - type.kMin + 1));
    const wShare = 0.55 + Math.min(0.35, margin / 90);
    const wk = Math.round(kAll * wShare);
    const nodeDead: Record<string, boolean> = {};
    const nodeD: Record<string, number> = {};
    const streak: Record<string, number> = {};
    if (kAll > 0) {
      const kwA = killW(A, contrib);
      const kwB = killW(B, contrib);
      const dwA = deathW(A, contrib);
      const dwB = deathW(B, contrib);
      const awA = assistW(A, contrib);
      const awB = assistW(B, contrib);
      for (let q = 0; q < kAll; q++) {
        const ks: 'A' | 'B' = q < wk ? winner : winner === 'A' ? 'B' : 'A';
        const vs: 'A' | 'B' = ks === 'A' ? 'B' : 'A';
        const kTeam = ks === 'A' ? A : B;
        const vTeam = vs === 'A' ? A : B;
        const ki = wPick(ks === 'A' ? kwA : kwB, rng);
        const killer = kTeam[ki];
        let alive: number[] = [];
        for (let vj = 0; vj < 5; vj++) if (!nodeDead[vTeam[vj].id]) alive.push(vj);
        if (!alive.length) {
          alive = [0, 1, 2, 3, 4];
          for (const id of Object.keys(nodeDead)) delete nodeDead[id];
        }
        const vSel = alive[wPick(alive.map((x) => (vs === 'A' ? dwA : dwB)[x]), rng)];
        const victim = vTeam[vSel];
        nodeDead[victim.id] = true;
        nodeD[victim.id] = (nodeD[victim.id] || 0) + 1;
        kda[killer.id].k++;
        kda[victim.id].d++;
        if (ks === 'A') killsA++;
        else killsB++;
        streak[killer.id] = (streak[killer.id] || 0) + 1;
        const u = rng.next();
        const na = u < 0.08 ? 0 : u < 0.32 ? 1 : u < 0.65 ? 2 : 3;
        const pool = [0, 1, 2, 3, 4].filter((x) => x !== ki);
        const aNs: string[] = [];
        for (let a2 = 0; a2 < na && pool.length; a2++) {
          const weights = pool.map((x) => (ks === 'A' ? awA : awB)[x]);
          const ai = wPick(weights, rng);
          const helper = kTeam[pool[ai]];
          kda[helper.id].a++;
          aNs.push(helper.name);
          pool.splice(ai, 1);
        }
        if (!firstBlood) {
          firstBlood = killer.name;
          if (ks === 'A') goldA += 300;
          else goldB += 300;
          snap('hl', `[${fmtClock(clock)}] 一血！${killer.name} 击杀 ${victim.name}（+300）`, clock);
        } else {
          snap('tr', `[${fmtClock(clock)}] ${killer.name} 击杀 ${victim.name}${aNs.length ? `（${aNs.join('、')} 助攻）` : ''}`, clock);
        }
        const stN = streak[killer.id];
        if (stN === 2) snap('hl', `[${fmtClock(clock)}] ${killer.name} 双杀`, clock);
        else if (stN === 3) snap('hl', `[${fmtClock(clock)}] ${killer.name} 三杀`, clock);
        else if (stN === 4) snap('hl', `[${fmtClock(clock)}] ${killer.name} 四杀`, clock);
        else if (stN >= 5) snap('hl', `[${fmtClock(clock)}] ${killer.name} 五杀`, clock);
      }
      let deadA = 0;
      let deadB = 0;
      for (const p of A) if (nodeDead[p.id]) deadA++;
      for (const p of B) if (nodeDead[p.id]) deadB++;
      if (deadA === 5 || deadB === 5) snap('hl', `[${fmtClock(clock)}] ${deadA === 5 ? nameB : nameA} 打出团灭`, clock);
    }

    const tw = type.twMin + Math.floor(rng.next() * (type.twMax - type.twMin + 1));
    if (winner === 'A') towersA += tw;
    else towersB += tw;

    let gain: number;
    let loserGain: number;
    if (isFinal) {
      gain = 2800 + Math.min(Math.round(margin * 2), 800);
      loserGain = 900;
    } else if (def.t >= 22) {
      gain = 1500 + Math.min(Math.round(margin * 3), 600);
      loserGain = 650 + Math.min(800, Math.floor(leadNow / 2000) * 300);
    } else {
      gain = 450 + Math.min(Math.round(margin * 5), 700);
      gain = Math.round(gain * (1 - Math.min(0.4, leadNow / 12000)));
      loserGain = 350 + Math.min(600, Math.floor(leadNow / 2500) * 300);
    }
    if (winner === 'A') {
      goldA += gain;
      goldB += loserGain;
    } else {
      goldB += gain;
      goldA += loserGain;
    }
    nodesPlayed++;
    const wTeam = winner === 'A' ? A : B;
    const wScores = winner === 'A' ? scoresA : scoresB;
    const lTeam = winner === 'A' ? B : A;
    const lScores = winner === 'A' ? scoresB : scoresA;
    const hi = pickAmong(wScores, true, type);
    const lo = pickAmong(lScores, false, type);
    const goldDiff = goldA - goldB;
    snap(
      'nd',
      `[${fmtClock(clock)}] ${type.name} ｜ ${nameA} ${sumA.toFixed(1)} : ${sumB.toFixed(1)} ${nameB} ｜ ${wName} +${gain}（经济 ${goldDiff >= 0 ? '+' : ''}${goldDiff}）`,
      clock,
    );
    if (chaos) snap('tr', `[${fmtClock(clock)}] 十个人中路打成一团，这波谁也说不准。`, clock);
    if (def.key === 'baron') {
      baronBuff = winner;
      snap('tr', `[${fmtClock(clock)}] ${wName} 拿下大龙，下一波全体加一点。`, clock);
    }
    if (def.key === 'herald') snap('tr', `[${fmtClock(clock)}] ${wName} 拿下峡谷先锋${tw > 0 ? `，撞掉 ${tw} 座塔` : ''}`, clock);
    else if (tw >= 2) snap('tr', `[${fmtClock(clock)}] ${wName} 推掉 ${tw} 座防御塔`, clock);
    snap('hl', `[${fmtClock(clock)}] 高光：${wTeam[hi].name} ${pick(HL[def.key], rng)}`, clock);
    let worstId: string | null = null;
    let worstN = 0;
    for (const p of A.concat(B)) {
      const n = nodeD[p.id] || 0;
      if (n > worstN) {
        worstN = n;
        worstId = p.id;
      }
    }
    if (worstId) {
      const who = A.concat(B).find((p) => p.id === worstId)!;
      snap('bl', `[${fmtClock(clock)}] 黑洞：${who.name} ${pick(BL, rng)}${worstN >= 2 ? `（这个节点送了 ${worstN} 个）` : ''}`, clock);
    } else {
      snap('bl', `[${fmtClock(clock)}] 黑洞：${lTeam[lo].name} ${pick(BL_SAFE, rng)}`, clock);
    }
    return isFinal;
  }

  const seq = buildSeq(nodeCount, rng);
  for (const node of seq) {
    const wasFinal = playNode(node);
    if (!wasFinal && node.t >= 20 && Math.abs(goldA - goldB) >= 5200) {
      blowout = true;
      gameClock += 0.3 + rng.next() * 0.7;
      const diff = Math.abs(goldA - goldB);
      snap('nd', `[${fmtClock(gameClock)}] 经济差 ${diff}，${diff > 8000 ? '对面打出 GG' : '这局大势已去'}，提前结束`, gameClock);
      break;
    }
  }

  let ext = 0;
  while (!blowout && Math.abs(goldA - goldB) < 2500 && ext < 2) {
    if (perk === 'noExtend' && rng.next() < 0.55) {
      snap('tr', `[${fmtClock(gameClock)}] 宿舍 404 要熄灯，这场没拖成膀胱局。`, gameClock);
      break;
    }
    ext++;
    playNode(ext === 1 ? { key: 'elder', t: 31 } : { key: 'final', t: 35 });
  }

  const win: 'A' | 'B' = goldA === goldB ? lastWinner : goldA > goldB ? 'A' : 'B';
  const winTeam = win === 'A' ? A : B;
  let mvp = winTeam[0];
  let mvpScore = -1e9;
  for (const p of winTeam) {
    const sc = contrib[p.id] * (0.9 + 0.2 * rng.next());
    if (sc > mvpScore) {
      mvpScore = sc;
      mvp = p;
    }
  }

  killsA = 0;
  killsB = 0;
  for (const p of A) killsA += kda[p.id].k;
  for (const p of B) killsB += kda[p.id].k;
  if (killsA === 0 || killsB === 0) {
    const sad: 'A' | 'B' = killsA === 0 ? 'A' : 'B';
    const sTeam = sad === 'A' ? A : B;
    const oTeam = sad === 'A' ? B : A;
    const sKi = wPick(killW(sTeam, contrib), rng);
    const sVi = wPick(deathW(oTeam, contrib), rng);
    kda[sTeam[sKi].id].k++;
    kda[oTeam[sVi].id].d++;
    if (sad === 'A') killsA = 1;
    else killsB = 1;
    snap('tr', `[${fmtClock(gameClock)}] ${sTeam[sKi].name} 终场前拿下一个安慰人头`, gameClock);
  }
  const gameLen = gameClock + (blowout ? 0.2 : 0.8 + rng.next() * 2);
  snap(
    'nd',
    `比赛结束 ｜ ${win === 'A' ? nameA : nameB} 胜 · ${fmtClock(gameLen)} · 经济差 ${Math.abs(goldA - goldB)} · 推塔 ${towersA}-${towersB} · 人头 ${killsA}-${killsB} · MVP ${mvp.name}`,
    gameLen,
  );

  const box = buildBox(A, B, nodeScores, mvp.id, kda);
  return {
    win, blowout, goldA, goldB, killsA, killsB, towersA, towersB, gameLen,
    mvpId: mvp.id, mvpName: mvp.name, nodes: nodesPlayed, firstBlood, log, box,
  };
}

function pickAmong(scores: number[], wantMax: boolean, type: NodeType): number {
  let bi = -1;
  let bv = wantMax ? -1e9 : 1e9;
  for (let j = 0; j < 5; j++) {
    if ((type.inv[SLOTS[j]] || 1) < 0.9) continue;
    if (wantMax ? scores[j] > bv : scores[j] < bv) {
      bi = j;
      bv = scores[j];
    }
  }
  return bi < 0 ? 0 : bi;
}

function buildBox(
  A: EnginePlayer[],
  B: EnginePlayer[],
  nodeScores: Record<string, number[]>,
  mvpId: string,
  kda: Record<string, { k: number; d: number; a: number }>,
): BoxRow[] {
  const all = A.concat(B);
  const avg = (id: string) => {
    const a = nodeScores[id] ?? [];
    if (!a.length) return 0;
    return a.reduce((s, x) => s + x, 0) / a.length;
  };
  const sorted = all.map((p) => p.id).sort((x, y) => avg(y) - avg(x));
  const rank = new Map(sorted.map((id, i) => [id, i]));
  const teamK = { A: 0, B: 0 };
  for (const p of A) teamK.A += kda[p.id]?.k ?? 0;
  for (const p of B) teamK.B += kda[p.id]?.k ?? 0;
  return all.map((p, idx) => {
    const side: 'A' | 'B' = idx < 5 ? 'A' : 'B';
    const r = rank.get(p.id) ?? 9;
    const grade = r < 2 ? 'S' : r < 4 ? 'A' : r < 6 ? 'B' : r < 8 ? 'C' : 'D';
    const kk = kda[p.id]?.k ?? 0;
    const dd = kda[p.id]?.d ?? 0;
    const aa = kda[p.id]?.a ?? 0;
    const join = teamK[side] > 0 ? Math.min(100, Math.round(((kk + aa) / teamK[side]) * 100)) : 0;
    return {
      id: p.id, name: p.name, hero: p.hero, slot: SLOTS[idx % 5], side,
      k: kk, d: dd, a: aa, join, grade, mvp: p.id === mvpId,
    };
  });
}
