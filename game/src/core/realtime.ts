// 把“真实经过的时间”喂给时钟。
// 主循环不再把每帧截成 0.1 秒：低于 10fps 时游戏日不会被拉长。
// 单帧最多消化 SIM_BUDGET_CAP 秒，多出来的留在 debt 里下一帧继续，避免切回后台时卡死。
// 走到自动暂停（赛前确认等）会丢掉还没消化的积压，暂停结束后不会把这段时间一次性跳完。
import type { GameClock, TickResult } from './clock';

export const SIM_BUDGET_CAP = 15;

export function simBudget(debt: number, cap = SIM_BUDGET_CAP): number {
  if (!(debt > 0)) return 0;
  return Math.min(debt, cap);
}

export function drainRealtime(
  clock: GameClock,
  debt: number,
  budget: number,
  stopAt: (day: number) => number[],
  onStep: (r: TickResult) => void,
): number {
  if (!(debt > 0) || !(budget > 0)) return Math.max(0, debt);
  if (clock.paused) return 0;
  let left = Math.min(debt, budget);
  while (left > 1e-8 && !clock.paused) {
    const slice = Math.min(left, 0.1);
    const dayBefore = clock.day;
    const minuteBefore = clock.minute;
    const r = clock.tick(slice, stopAt(clock.day));
    onStep(r);
    if (clock.paused) return 0;
    if (!(r.used > 1e-9) && clock.day === dayBefore && clock.minute === minuteBefore) break;
    left -= r.used > 0 ? r.used : 0;
  }
  if (left < 1e-8) left = 0;
  return Math.max(0, debt - (Math.min(debt, budget) - left));
}
