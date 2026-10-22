// 每天几个时刻抽一条人设事件。预算写在冷却表里，读档不会同一天再抽满一轮。
import { pick, seeded, weightedPick } from '../core/rng';
import { GRUDGE_LINES, NICKNAMES, PERSONA_EVENTS, type PersonaEventDef } from '../data/personaEvents';
import { COMBO_SLOTS, ROSTER_BY_ID } from '../data/roster';
import type { GameState, LogEntry } from '../save/state';
import { addBond, addKnot } from './relations';

const BUDGET_KEY = 'pev:budget';
const DAILY_CAP = 3;

export interface PersonaBeat {
  level: LogEntry['level'];
  text: string;
  ids: string[];
}

export interface PersonaRollInput {
  state: GameState;
  day: number;
  minute: number;
  segment: string;
  present: string[];
  bondOf: (a: string, b: string) => number;
}

function budget(state: GameState, day: number): number {
  const raw = state.cooldowns[BUDGET_KEY] ?? 0;
  return Math.floor(raw / 100) === day ? raw % 100 : 0;
}

function spend(state: GameState, day: number): void {
  state.cooldowns[BUDGET_KEY] = day * 100 + budget(state, day) + 1;
}

function cooled(state: GameState, key: string, day: number): boolean {
  return (state.cooldowns[key] ?? 0) <= day;
}

function nameOf(id: string): string {
  return ROSTER_BY_ID[id]?.name ?? id;
}

function nicknameLine(rand: () => number, present: string[]): string {
  const targets = present.filter((id) => id !== 'diaolong');
  const id = targets.length ? pick(rand, targets) : 'aji';
  const who = nameOf(id);
  const nick = pick(rand, NICKNAMES);
  return `吊隆闲着给人起外号：「${who}最新外号，${nick}」。${who}愣了一下，没反驳。`;
}

function lineOf(def: PersonaEventDef, rand: () => number, present: string[]): string {
  if (def.id === 'nick') return nicknameLine(rand, present);
  return pick(rand, def.lines);
}

function allowed(def: PersonaEventDef, input: PersonaRollInput, present: Set<string>): boolean {
  if (!def.requires.every((id) => present.has(id))) return false;
  if (def.segments && !def.segments.includes(input.segment)) return false;
  if (def.minBond && input.bondOf(def.minBond.a, def.minBond.b) < def.minBond.n) return false;
  if (!cooled(input.state, `pev:${def.id}`, input.day)) return false;
  if (def.id === 'nick' && present.size < 2) return false;
  if (!def.lines.length && def.id !== 'nick') return false;
  return true;
}

function commit(
  state: GameState,
  day: number,
  key: string,
  cooldown: number,
  beat: PersonaBeat,
  extra?: { bond?: { a: string; b: string; n: number }; knot?: { a: string; b: string; cause: string }; spendBudget?: boolean },
): PersonaBeat {
  state.cooldowns[key] = day + cooldown;
  if (extra?.spendBudget !== false) spend(state, day);
  if (extra?.bond) addBond(state, extra.bond.a, extra.bond.b, extra.bond.n);
  if (extra?.knot) addKnot(state, extra.knot.a, extra.knot.b, extra.knot.cause, day);
  return beat;
}

function grudge(input: PersonaRollInput, rand: () => number, present: Set<string>): PersonaBeat | null {
  const pairs: { key: string; a: string; b: string }[] = [];
  for (const [key, rel] of Object.entries(input.state.relations)) {
    if (!rel.knots.length) continue;
    const [a, b] = key.split('|');
    if (!a || !b || !present.has(a) || !present.has(b)) continue;
    if (!cooled(input.state, `pev:grudge:${key}`, input.day)) continue;
    pairs.push({ key, a, b });
  }
  if (!pairs.length || rand() > 0.42) return null;
  const hit = pick(rand, pairs);
  const lines = GRUDGE_LINES[hit.key] ?? [`${nameOf(hit.a)}和${nameOf(hit.b)}还别着，小心结没化。`];
  return commit(input.state, input.day, `pev:grudge:${hit.key}`, 2, {
    level: '有趣',
    text: pick(rand, lines),
    ids: [hit.a, hit.b],
  });
}

function combo(input: PersonaRollInput, rand: () => number, present: Set<string>): PersonaBeat | null {
  if (input.segment !== 'team' && input.segment !== 'match') return null;
  const ready = COMBO_SLOTS.filter((c) => present.has(c.a) && present.has(c.b) && cooled(input.state, `pev:combo:${c.id}`, input.day));
  if (!ready.length || rand() > 0.5) return null;
  const slot = pick(rand, ready);
  return commit(input.state, input.day, `pev:combo:${slot.id}`, 4, {
    level: '有趣',
    text: slot.hint,
    ids: [slot.a, slot.b],
  }, { spendBudget: false });
}

export function rollPersonaBeat(input: PersonaRollInput): PersonaBeat | null {
  const rand = seeded(input.state.seed, 'pev', input.day, input.minute);
  const present = new Set(input.present);
  const named = combo(input, rand, present);
  if (named) return named;
  if (budget(input.state, input.day) >= DAILY_CAP) return null;
  const grudged = grudge(input, rand, present);
  if (grudged) return grudged;

  const pool = PERSONA_EVENTS.filter((def) => allowed(def, input, present));
  const bag = [...pool.map((def) => ({ def, w: def.weight })), { def: null, w: 16 }];
  const picked = weightedPick(rand, bag, (x) => x.w);
  if (!picked?.def) return null;
  const def = picked.def;
  const beat: PersonaBeat = { level: def.level, text: lineOf(def, rand, input.present), ids: [...def.requires] };
  const knot = def.knot && (def.knotChance == null || rand() < def.knotChance) ? def.knot : undefined;
  return commit(input.state, input.day, `pev:${def.id}`, def.cooldown, beat, { bond: def.bond, knot });
}
