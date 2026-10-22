// 把存档里的人折成引擎选手：位置适性、疲劳、压力、心结、默契连招、选人
import { hashString, type Rand } from '../core/rng';
import { ABILITY_KEYS, COMBOS, POSITIONS, ROSTER_BY_ID, pairKey, positionFit, type AbilityKey } from '../data/roster';
import type { OpponentDef } from '../data/leagues';
import { tacticIdOf, type TacticId } from '../data/tactics';
import { draftPlayer } from '../engine/draft';
import {
  makeRng,
  simulateMatch,
  SLOTS,
  type EnginePlayer,
  type MatchResult,
  type Slot,
} from '../engine/match';
import type { GameState } from '../save/state';
import { IRON_BOND } from './relations';

const ROLE_BIAS: Record<Slot, Partial<Record<AbilityKey, number>>> = {
  top: { lane: 8, roam: -6, fight: 4 },
  jgl: { roam: 10, lane: -6, sense: 4 },
  mid: { lane: 6, fight: 4, roam: 2 },
  adc: { mech: 8, fight: 6, lane: 4, roam: -4 },
  sup: { sense: 8, roam: 4, mech: -6, lane: 2 },
};

function fitOf(id: string): Record<Slot, number> {
  const def = ROSTER_BY_ID[id];
  const fit = {} as Record<Slot, number>;
  if (!def) {
    for (const s of SLOTS) fit[s] = 0.6;
    return fit;
  }
  POSITIONS.forEach((pos, i) => {
    fit[SLOTS[i]] = positionFit(def, pos);
  });
  return fit;
}

function emptyStats(): Record<AbilityKey, number> {
  return { lane: 40, roam: 40, fight: 40, sense: 40, mech: 40, pool: 40, mental: 40 };
}

function clampStat(n: number): number {
  return Math.max(18, Math.min(96, Math.round(n)));
}

export function opponentPlayers(opp: OpponentDef, bonus: number, rng: Rand): EnginePlayer[] {
  let power = opp.power + bonus;
  if (opp.swing) power += Math.floor(rng() * 13) - 6;
  power = Math.max(20, Math.min(96, power));
  return SLOTS.map((slot, i) => {
    const raw = {} as Record<AbilityKey, number>;
    for (const k of ABILITY_KEYS) raw[k] = power + (ROLE_BIAS[slot][k] ?? 0) + (opp.bias?.[k] ?? 0);
    const mean = ABILITY_KEYS.reduce((s, k) => s + raw[k], 0) / ABILITY_KEYS.length;
    const stats = {} as Record<AbilityKey, number>;
    for (const k of ABILITY_KEYS) stats[k] = clampStat(raw[k] * (power / mean));
    const fit = {} as Record<Slot, number>;
    for (const s of SLOTS) fit[s] = s === slot ? 1 : 0.6;
    return {
      id: `${opp.id}_${slot}`,
      name: opp.players[i],
      hero: '招牌',
      stats,
      fit,
      stress: 30,
      fatigue: 8,
    };
  });
}

export interface ComboPlan {
  tag: string;
  text: string;
  keys: string[];
  ids: [string, string];
}

export function activeCombos(state: GameState, slots: readonly string[]): ComboPlan[] {
  const on = new Set(slots);
  const out: ComboPlan[] = [];
  for (const c of COMBOS) {
    if (!on.has(c.a) || !on.has(c.b)) continue;
    const bond = state.relations[pairKey(c.a, c.b)]?.bond ?? 0;
    if (bond < IRON_BOND) continue;
    const na = ROSTER_BY_ID[c.a]?.name ?? c.a;
    const nb = ROSTER_BY_ID[c.b]?.name ?? c.b;
    out.push({
      tag: pairKey(c.a, c.b),
      text: `${na} × ${nb}`,
      keys: c.lane === '下路' ? ['lane', 'dragon'] : ['gank', 'skirmish'],
      ids: [c.a, c.b],
    });
  }
  return out;
}

function knotFactor(state: GameState, id: string, slots: readonly string[]): { mult: number; notes: string[] } {
  const on = new Set(slots);
  let mult = 1;
  const notes: string[] = [];
  for (const [key, rel] of Object.entries(state.relations)) {
    const n = rel.knots.length;
    if (!n) continue;
    const [a, b] = key.split('|');
    if (a !== id && b !== id) continue;
    const other = a === id ? b : a;
    if (!on.has(other) || !on.has(id)) continue;
    const p = n >= 2 ? 0.85 : 0.92;
    mult *= p;
    if (id < other) {
      const na = ROSTER_BY_ID[a]?.name ?? a;
      const nb = ROSTER_BY_ID[b]?.name ?? b;
      notes.push(`心结还在：${na} 和 ${nb} 的配合 ${n >= 2 ? '−15%' : '−8%'}。`);
    }
  }
  return { mult, notes };
}

export function buildOurSide(state: GameState, slots: readonly string[], gameIdx: number, rng: Rand): { players: EnginePlayer[]; preface: string[] } {
  const combos = activeCombos(state, slots);
  const comboById = new Map<string, ComboPlan>();
  for (const c of combos) {
    comboById.set(c.ids[0], c);
    comboById.set(c.ids[1], c);
  }
  const preface: string[] = [];
  const players = slots.map((id) => {
    const def = ROSTER_BY_ID[id];
    const member = state.roster.find((m) => m.id === id);
    const drafted = draftPlayer(id, rng);
    preface.push(...drafted.lines);
    const knot = knotFactor(state, id, slots);
    for (const note of knot.notes) if (!preface.includes(note)) preface.push(note);
    const combo = comboById.get(id);
    return {
      id,
      name: def?.name ?? id,
      hero: drafted.hero,
      stats: { ...(member?.ability ?? def?.ability ?? emptyStats()) },
      fit: fitOf(id),
      stress: member?.status.压力 ?? 20,
      fatigue: member?.status.疲劳 ?? 10,
      aatroxAmp: id === 'piegan' && drafted.hero === '剑魔',
      oneGame: id === 'gouliang',
      knotMult: knot.mult === 1 ? undefined : knot.mult,
      comboOn: combo?.keys,
      comboTag: combo?.tag,
      comboText: combo?.text,
    } satisfies EnginePlayer;
  });
  for (const c of combos) {
    preface.push(`铁哥们默契【待定】：${c.text}，相关节点 +6%。`);
  }
  if (slots.includes('gouliang')) {
    const delta = 6 - 6 * (gameIdx - 1);
    preface.push(`狗粮：“记住了，我只玩一把。”本局全属性 ${delta >= 0 ? '+' : ''}${delta}。`);
  }
  return { players, preface };
}

export function liveSeed(state: GameState, day: number, game: number, slots: readonly string[], tactic: string, oppId: string): number {
  return hashString([state.seed, 'live', state.season.calendarSeason, day, game, slots.join(','), tactic, oppId].join('|'));
}

export function playOurMatch(
  state: GameState,
  day: number,
  game: number,
  slots: readonly string[],
  tactic: TacticId,
  opp: OpponentDef,
): MatchResult {
  const seed = liveSeed(state, day, game, slots, tactic, opp.id);
  const rng = makeRng(seed);
  const us = buildOurSide(state, slots, game, rng.next);
  const them = opponentPlayers(opp, state.season.growth[state.season.tier] ?? 0, rng.next);
  return simulateMatch(us.players, them, {
    nameA: 'SSB',
    nameB: opp.name,
    tacA: tactic,
    tacB: tacticIdOf(opp.tactic),
    gameIdx: game,
    preface: us.preface,
    perkB: opp.perk,
  }, rng);
}

export function cpuSeed(state: GameState, round: number, a: string, b: string, game: number): number {
  return hashString([state.seed, 'cpu', state.season.calendarSeason, round, a, b, game].join('|'));
}

export function playCpuGame(state: GameState, round: number, a: OpponentDef, b: OpponentDef, game: number): MatchResult {
  const rng = makeRng(cpuSeed(state, round, a.id, b.id, game));
  const bonus = state.season.growth[state.season.tier] ?? 0;
  const pa = opponentPlayers(a, bonus, rng.next);
  const pb = opponentPlayers(b, bonus, rng.next);
  return simulateMatch(pa, pb, {
    nameA: a.name,
    nameB: b.name,
    tacA: tacticIdOf(a.tactic),
    tacB: tacticIdOf(b.tactic),
    gameIdx: game,
    perkB: b.perk,
  }, rng);
}
