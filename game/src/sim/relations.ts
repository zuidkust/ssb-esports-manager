// 交情只升不降；心结是临时的（设计文档第 7 章）。老板动作和外卖连锁都走这里。
import { pairKey } from '../data/roster';
import type { GameState, Relation } from '../save/state';

/** 铁哥们。默契连招要到这一档，并且两人同时首发 */
export const IRON_BOND = 85;

export function relation(state: GameState, a: string, b: string): Relation {
  const key = pairKey(a, b);
  return (state.relations[key] ??= { bond: 30, knots: [], unlocked: [] });
}

export function addBond(state: GameState, a: string, b: string, n: number): void {
  if (!(n > 0) || a === b) return;
  const rel = relation(state, a, b);
  rel.bond = Math.min(100, rel.bond + n);
}

export function hasKnot(state: GameState, a: string, b: string): boolean {
  return relation(state, a, b).knots.length > 0;
}

export function addKnot(state: GameState, a: string, b: string, cause: string, day: number): boolean {
  if (a === b) return false;
  const rel = relation(state, a, b);
  if (rel.knots.length >= 2) return false;
  rel.knots.push({ cause, expireDay: day + 3 });
  return true;
}

export function clearOneKnot(state: GameState, a: string, b: string): boolean {
  const rel = relation(state, a, b);
  if (!rel.knots.length) return false;
  rel.knots.shift();
  return true;
}

export function expireKnots(state: GameState, day: number): void {
  for (const rel of Object.values(state.relations)) rel.knots = rel.knots.filter((k) => k.expireDay > day);
}

export function anyBondAtLeast(state: GameState, n: number): boolean {
  return Object.values(state.relations).some((r) => r.bond >= n);
}
