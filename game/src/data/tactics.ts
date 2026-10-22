// 战术五环（设计文档第 8 章）：强开团 > 保排消耗 > 防守反打 > 速攻节奏 > 运营发育 > 强开团
// 克制方每个节点 ×1.05。各战术自己的阶段加减写在 tacticNodeMult，和灵感版一致。
// 开局只会强开团、运营发育；其余三个花心得研究。

export type TacticId = 'engage' | 'poke' | 'counter' | 'rush' | 'scaling';

export interface TacticDef {
  id: TacticId;
  name: string;
  beats: TacticId;
  /** 0 = 开局就会。其余是研究花费的训练心得 */
  cost: number;
  desc: string;
}

export const TACTICS: TacticDef[] = [
  { id: 'engage', name: '强开团', beats: 'poke', cost: 0, desc: '团战节点 +3%，对线期 −4%。克制保排消耗。' },
  { id: 'scaling', name: '运营发育', beats: 'engage', cost: 0, desc: '20 分钟后 +6%，13 分钟前 −7%。克制强开团。' },
  { id: 'poke', name: '保排消耗', beats: 'counter', cost: 200, desc: '对线、推高地 +10%，大龙、远古、决战 −2%。克制防守反打。' },
  { id: 'counter', name: '防守反打', beats: 'rush', cost: 300, desc: '上一节点输了的话，这个节点 +4%。克制速攻节奏。' },
  { id: 'rush', name: '速攻节奏', beats: 'scaling', cost: 400, desc: '13 分钟前 +16%，22 分钟后 −5%。克制运营发育。' },
];

export const TACTIC_BY_ID = Object.fromEntries(TACTICS.map((t) => [t.id, t])) as Record<TacticId, TacticDef>;

const BY_NAME = Object.fromEntries(TACTICS.map((t) => [t.name, t.id])) as Record<string, TacticId>;

export function tacticIdOf(nameOrId: string): TacticId {
  if (nameOrId in TACTIC_BY_ID) return nameOrId as TacticId;
  return BY_NAME[nameOrId] ?? 'engage';
}

export const STARTER_TACTICS: TacticId[] = TACTICS.filter((t) => t.cost <= 0).map((t) => t.id);

/** 克制方全场 ×1.05。A 克 B 时只加在 A 上。 */
export function counterMult(tacA: TacticId | null, tacB: TacticId | null): { a: number; b: number } {
  const a = tacA && tacB && TACTIC_BY_ID[tacA].beats === tacB ? 1.05 : 1;
  const b = tacB && tacA && TACTIC_BY_ID[tacB].beats === tacA ? 1.05 : 1;
  return { a, b };
}

/** 战术自己的阶段修正。克制倍率另外乘。 */
export function tacticNodeMult(
  tac: TacticId | null,
  key: string,
  t: number,
  wLane: number,
  wFight: number,
  lastWinner: 'A' | 'B' | null,
  side: 'A' | 'B',
  nodesPlayed: number,
): number {
  if (!tac) return 1;
  let m = 1;
  if (tac === 'engage') {
    if (wFight >= 0.3) m *= 1.03;
    if (wLane >= 0.4) m *= 0.96;
  } else if (tac === 'poke') {
    if (wLane >= 0.4 || key === 'siege') m *= 1.1;
    if (key === 'baron' || key === 'elder' || key === 'final') m *= 0.98;
  } else if (tac === 'counter') {
    if (nodesPlayed > 0 && lastWinner && lastWinner !== side) m *= 1.04;
  } else if (tac === 'rush') {
    if (t < 13) m *= 1.16;
    else if (t >= 22) m *= 0.95;
  } else if (tac === 'scaling') {
    if (t >= 20) m *= 1.06;
    else if (t < 13) m *= 0.93;
  }
  return m;
}
