import { describe, expect, it } from 'vitest';
import { DAY_END, DAY_START, GameClock, NIGHT_SECONDS, REAL_SECONDS_PER_DAY } from '../src/core/clock';

function run(c: GameClock, seconds: number, step = 1 / 60, stopAt: number[] = []) {
  let t = 0;
  while (t < seconds - 1e-9) {
    c.tick(Math.min(step, seconds - t), stopAt);
    t += step;
  }
}

describe('GameClock', () => {
  it('可见白天是 09:00–22:00', () => {
    expect(DAY_START).toBe(9 * 60);
    expect(DAY_END).toBe(22 * 60);
  });

  it('正常速度下白天正好走现实 10 分钟', () => {
    const c = new GameClock({ day: 1, minute: DAY_START, speed: 'x1', paused: false });
    run(c, REAL_SECONDS_PER_DAY - 1);
    expect(c.minute).toBeLessThan(DAY_END);
    run(c, 1.001);
    expect(c.minute).toBeCloseTo(DAY_END, 0);
  });

  it('×3 和 ×10 按比例加速', () => {
    const a = new GameClock({ day: 1, minute: DAY_START, speed: 'x3', paused: false });
    run(a, REAL_SECONDS_PER_DAY / 3);
    expect(a.minute).toBeCloseTo(DAY_END, 0);
    const b = new GameClock({ day: 1, minute: DAY_START, speed: 'x10', paused: false });
    run(b, REAL_SECONDS_PER_DAY / 10);
    expect(b.minute).toBeCloseTo(DAY_END, 0);
  });

  it('22:00 后夜间快进约 6 秒，进入第二天 09:00', () => {
    const c = new GameClock({ day: 1, minute: DAY_END, speed: 'x1', paused: false });
    run(c, NIGHT_SECONDS + 0.05);
    expect(c.day).toBe(2);
    expect(c.minute).toBeGreaterThanOrEqual(DAY_START);
    expect(c.minute).toBeLessThan(DAY_START + 1);
  });

  it('一大帧也不会跳过夜间边界或跨好几天', () => {
    const c = new GameClock({ day: 1, minute: DAY_END - 1, speed: 'x10', paused: false });
    c.tick(1000);
    expect(c.day).toBeLessThanOrEqual(2);
  });

  it('手动暂停和自动暂停都会停住时间', () => {
    const c = new GameClock({ day: 1, minute: 600, speed: 'x1', paused: true });
    c.tick(10);
    expect(c.minute).toBe(600);
    c.togglePause();
    c.hold('match', '比赛日');
    c.tick(10);
    expect(c.minute).toBe(600);
    c.release('match');
    c.tick(10);
    expect(c.minute).toBeGreaterThan(600);
  });

  it('调试倍率只加速白天，不写进快照，切回档位后消失', () => {
    const fast = new GameClock({ day: 1, minute: DAY_START, speed: 'x1', paused: false });
    fast.setDebugRate(60);
    fast.tick(1);
    const slow = new GameClock({ day: 1, minute: DAY_START, speed: 'x1', paused: false });
    slow.tick(1);
    expect(fast.minute - DAY_START).toBeGreaterThan((slow.minute - DAY_START) * 30);
    expect(fast.snapshot()).toEqual({ day: 1, minute: fast.minute, speed: 'x1', paused: false });
    fast.setSpeed('x1');
    expect(fast.debugRate).toBeNull();

    const night = new GameClock({ day: 1, minute: DAY_END, speed: 'x1', paused: false });
    night.setDebugRate(60);
    const plain = new GameClock({ day: 1, minute: DAY_END, speed: 'x1', paused: false });
    night.tick(1);
    plain.tick(1);
    expect(night.minute).toBeCloseTo(plain.minute, 5);
    expect(night.day).toBe(plain.day);
  });

  it('跳时间会丢掉比赛日的自动暂停，保留别的暂停', () => {
    const c = new GameClock({ day: 2, minute: 18 * 60 + 30, speed: 'x1', paused: false });
    c.hold('match-2', '比赛日');
    c.hold('bankrupt', '破产');
    c.releasePrefixed('match-');
    expect(c.isHeld('match-2')).toBe(false);
    expect(c.isHeld('bankrupt')).toBe(true);
  });

  it('跨过午夜就交还剩余时间，不带着旧停靠点走进下一天', () => {
    const c = new GameClock({ day: 30, minute: 10 * 60, speed: 'x1', paused: false });
    c.setDebugRate(60);
    c.tick(30, []);
    expect(c.day).toBe(31);
    expect(c.minute).toBe(0);
  });

  it('停靠点：走到 18:30 精确停下，解除后不会重复停', () => {
    const c = new GameClock({ day: 2, minute: 18 * 60 + 20, speed: 'x10', paused: false });
    c.tick(30, [18 * 60 + 30]);
    expect(c.minute).toBe(18 * 60 + 30);
    c.tick(1, [18 * 60 + 30]);
    expect(c.minute).toBeGreaterThan(18 * 60 + 30);
  });
});
