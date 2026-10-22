import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/save/state';
import { World } from '../src/sim/world';
import { DAY_START, DAY_END } from '../src/core/clock';

function simulateDay(seed: number, day: number) {
  const s = createNewGame(seed);
  s.clock.day = day;
  const w = new World(s);
  const trace: string[] = [];
  for (let t = DAY_START; t < DAY_END; t += 1) {
    s.clock.minute = t;
    w.update(t, 1, false);
    trace.push(w.members.map((m) => m.activity.kind).join(','));
  }
  return { w, trace, s };
}

describe('日常模拟', () => {
  it('同一种子同一天，作息完全一样（读档可复现）', () => {
    expect(simulateDay(9, 3).trace).toEqual(simulateDay(9, 3).trace);
    expect(simulateDay(9, 3).trace).not.toEqual(simulateDay(10, 3).trace);
  });

  it('白天大家会到岗，22:30 前全部下班', () => {
    const { trace } = simulateDay(5, 1);
    const at = (min: number) => trace[min - DAY_START].split(',');
    expect(at(10 * 60).filter((k) => k !== 'absent' && k !== 'out').length).toBeGreaterThanOrEqual(5);
    expect(at(15 * 60).filter((k) => k === 'team').length).toBeGreaterThanOrEqual(4);
    expect(at(DAY_END - 1).every((k) => k === 'absent')).toBe(true);
  });

  it('比赛日 19:00 首发 5 人比赛、1 人台下', () => {
    const { trace } = simulateDay(5, 2);
    const kinds = trace[19 * 60 + 10 - DAY_START].split(',');
    expect(kinds.filter((k) => k === 'match')).toHaveLength(5);
    expect(kinds.filter((k) => k === 'sub')).toHaveLength(1);
  });

  it('会写日常动态，状态保持在 0–100', () => {
    const { s } = simulateDay(3, 1);
    expect(s.eventLog.length).toBeGreaterThan(5);
    for (const m of s.roster) for (const v of Object.values(m.status)) expect(v).toBeGreaterThanOrEqual(0);
    for (const m of s.roster) for (const v of Object.values(m.status)) expect(v).toBeLessThanOrEqual(100);
  });
});

describe('刷手机细分', () => {
  it('多数时候在刷抖音，也保留笼统的“耍手机”', () => {
    const count: Record<string, number> = {};
    for (let seed = 1; seed <= 40; seed++) {
      const { w, s } = simulateDay(seed, 3);
      void s;
      // 重新跑一遍，统计每分钟的手机 App
      for (let t = DAY_START; t < DAY_END; t += 1) {
        w.state.clock.minute = t;
        w.update(t, 0, true);
        for (const m of w.members) if (m.activity.kind === 'slack_phone') count[m.activity.app!] = (count[m.activity.app!] ?? 0) + 1;
      }
    }
    const total = Object.values(count).reduce((a, b) => a + b, 0);
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe('douyin');
    expect(count.douyin / total).toBeGreaterThan(0.3);
    expect(count.generic).toBeGreaterThan(0);
    expect(Object.keys(count).length).toBeGreaterThanOrEqual(6);
  });
});
