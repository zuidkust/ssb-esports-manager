// 首发五个位置、替补、战术研究
import type { TacticId } from '../data/tactics';
import { TACTIC_BY_ID } from '../data/tactics';
import { POSITIONS, positionFit, ROSTER, ROSTER_BY_ID, type Position } from '../data/roster';
import type { GameState, MemberState } from '../save/state';

export function validLineup(slots: readonly string[]): boolean {
  if (slots.length !== 5) return false;
  const known = new Set(ROSTER.map((m) => m.id));
  const seen = new Set<string>();
  for (const id of slots) {
    if (!known.has(id) || seen.has(id)) return false;
    seen.add(id);
  }
  return true;
}

export function autoLineup(roster: readonly MemberState[]): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  const byId = new Map(roster.map((m) => [m.id, m]));
  const score = (id: string, pos: Position) => {
    const m = byId.get(id);
    const def = ROSTER_BY_ID[id];
    if (!m || !def) return -1e9;
    const a = m.ability;
    const core =
      pos === 'top' ? a.lane + a.mech
      : pos === 'jungle' ? a.roam + a.sense
      : pos === 'mid' ? a.lane + a.fight
      : pos === 'adc' ? a.mech + a.fight
      : a.sense + a.roam;
    return core * positionFit(def, pos) + m.status.心情 * 0.2;
  };
  for (const pos of POSITIONS) {
    const best = roster
      .map((m) => m.id)
      .filter((id) => !used.has(id))
      .sort((x, y) => score(y, pos) - score(x, pos))[0];
    used.add(best);
    out.push(best);
  }
  return out;
}

export function lineupSlots(state: GameState, day: number): string[] {
  const saved = state.lineup;
  if (saved && saved.day === day && validLineup(saved.slots)) return saved.slots.slice();
  return autoLineup(state.roster);
}

export function benchOf(slots: readonly string[]): string | null {
  const used = new Set(slots);
  return ROSTER.find((m) => !used.has(m.id))?.id ?? null;
}

export function researchTactic(state: GameState, id: TacticId): { ok: boolean; reason?: string } {
  const def = TACTIC_BY_ID[id];
  if (!def) return { ok: false, reason: '没有这个战术' };
  if (state.tactics.includes(id)) return { ok: false, reason: '已经会了' };
  if (def.cost <= 0) {
    state.tactics.push(id);
    return { ok: true };
  }
  if (state.insight < def.cost) return { ok: false, reason: `心得不够，要 ${def.cost}` };
  state.insight -= def.cost;
  state.tactics.push(id);
  return { ok: true };
}
