import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/save/state';
import { World } from '../src/sim/world';
import { DAY_START } from '../src/core/clock';

function runDay(seed: number, day: number, until = 17 * 60) {
  const s = createNewGame(seed);
  s.clock.day = day;
  const w = new World(s);
  for (let t = DAY_START; t < until; t++) {
    s.clock.minute = t;
    w.update(t, 1, false);
  }
  return { s, w };
}

describe('日常排位结果', () => {
  it('组排的人共享同一局结果，35 分钟结算一次', () => {
    const { s, w } = runDay(3, 3, 16 * 60);
    const team = w.members.filter((m) => m.activity.kind === 'team' && !m.activity.bench);
    expect(team.length).toBeGreaterThanOrEqual(4);
    const first = team[0].state.scrim;
    expect(first.last).toMatch(/win|lose/);
    for (const m of team) {
      expect(m.state.scrim.last).toBe(first.last);
      expect(m.state.scrim.lastMinute).toBe(first.lastMinute);
      expect(m.state.scrim.block).toBe(first.block);
    }
    expect(s.roster.every((m) => m.scrim.block >= 0 || !w.byId[m.id].playing)).toBe(true);
  });

  it('同一种子同一天结果可复现', () => {
    const a = runDay(9, 3);
    const b = runDay(9, 3);
    expect(a.s.roster.map((m) => m.scrim)).toEqual(b.s.roster.map((m) => m.scrim));
  });

  it('连胜/连败只在自己的结果上累计', () => {
    const { s } = runDay(4, 3, 18 * 60);
    for (const m of s.roster) {
      const sc = m.scrim;
      if (sc.last === 'win') expect(sc.streak).toBeGreaterThan(0);
      if (sc.last === 'lose') expect(sc.streak).toBeLessThan(0);
      expect(Math.abs(sc.streak)).toBeLessThanOrEqual(sc.wins + sc.losses);
    }
  });
});
