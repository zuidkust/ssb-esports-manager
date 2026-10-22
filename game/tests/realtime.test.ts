import { describe, expect, it } from 'vitest';
import { DAY_END, DAY_START, GameClock, REAL_SECONDS_PER_DAY } from '../src/core/clock';
import { drainRealtime, SIM_BUDGET_CAP, simBudget } from '../src/core/realtime';
import { PREMATCH_MINUTE } from '../src/core/calendar';

describe('低帧率仍按真实时间走', () => {
  it('每帧 0.2 秒（5fps）走完 10 分钟现实时间，白天仍然到 22:00', () => {
    const c = new GameClock({ day: 1, minute: DAY_START, speed: 'x1', paused: false });
    let debt = 0;
    const step = 0.2;
    for (let t = 0; t < REAL_SECONDS_PER_DAY - 1e-9; t += step) {
      debt += step;
      debt = drainRealtime(c, debt, simBudget(debt), () => [], () => {});
    }
    expect(debt).toBe(0);
    expect(c.minute).toBeCloseTo(DAY_END, 0);
    expect(c.day).toBe(1);
  });

  it('一次 40 秒的空档单帧最多消化 15 秒，接着追上连续小步', () => {
    const steady = new GameClock({ day: 1, minute: DAY_START, speed: 'x1', paused: false });
    let debt = 0;
    for (let i = 0; i < 400; i++) {
      debt += 0.1;
      debt = drainRealtime(steady, debt, simBudget(debt), () => [], () => {});
    }
    const burst = new GameClock({ day: 1, minute: DAY_START, speed: 'x1', paused: false });
    debt = 40;
    let frames = 0;
    let firstBite = 0;
    while (debt > 1e-6 && frames < 8) {
      const before = debt;
      debt = drainRealtime(burst, debt, simBudget(debt), () => [], () => {});
      if (frames === 0) firstBite = before - debt;
      frames++;
    }
    expect(firstBite).toBeLessThanOrEqual(SIM_BUDGET_CAP + 1e-6);
    expect(firstBite).toBeGreaterThan(10);
    expect(debt).toBe(0);
    expect(burst.minute).toBeCloseTo(steady.minute, 1);
    expect(burst.day).toBe(steady.day);
  });

  it('走到 18:30 停靠点会丢掉还没消化的积压', () => {
    const c = new GameClock({ day: 2, minute: PREMATCH_MINUTE - 8, speed: 'x10', paused: false });
    const debt = drainRealtime(c, 40, simBudget(40), () => [PREMATCH_MINUTE], () => {
      if (c.minute >= PREMATCH_MINUTE - 1e-6) c.hold('match', '赛前');
    });
    expect(c.minute).toBeCloseTo(PREMATCH_MINUTE, 4);
    expect(c.paused).toBe(true);
    expect(debt).toBe(0);
    c.release('match');
    drainRealtime(c, 0, 1, () => [PREMATCH_MINUTE], () => {});
    expect(c.minute).toBeCloseTo(PREMATCH_MINUTE, 4);
  });
});
