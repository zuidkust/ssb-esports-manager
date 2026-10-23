// 经济数值（设计文档第 11 章）。标了【待定】的是 M2 实装时补上的默认，见文档第 15 章。
import type { Tier } from './leagues';

export const START_CASH = 5000;
export const START_STASH = 20000;

// 【待定】发薪周期按 28 天（约 4 周，接近一个网吧赛季的常规赛），不是自然月
export const MONTH_DAYS = 28;
export const BANKRUPT_MONTHS = 3;

export const SALARY: Record<Tier, number> = { netcafe: 1500, city: 3000, national: 8000 };
// 世界赛级月薪。国内联赛且已经有过世界赛资格时用这一档。
export const WORLD_SALARY = 15000;

// 下标 = 场地等级
export const RENT = [2000, 6000, 18000, 50000];

export const WIN_BONUS: Record<Tier, number> = { netcafe: 500, city: 2000, national: 8000 };
/** 世界赛：每晋级一轮（八强、半决赛）的奖金。决赛冠军另计。 */
export const WORLD_ROUND_PRIZE = 50_000;
export const WORLD_CHAMP_PRIZE = 500_000;
/** 搬家费，下标 = 目标场地等级。退租返还当前场地搬家费的 40%。 */
export const MOVE_FEE = [0, 30_000, 120_000, 400_000];
export const MOVE_REFUND_RATE = 0.4;
export const MATCH_INSIGHT = { win: 60, loss: 30 };
// 赛季排名奖。5 名及以后没有排名奖；网吧垫底也不降级，只是拿不到这笔
export const SEASON_PRIZE: Record<Tier, { champ: number; runner: number; top4: number }> = {
  netcafe: { champ: 5000, runner: 3000, top4: 1000 },
  city: { champ: 20000, runner: 12000, top4: 5000 },
  national: { champ: 80000, runner: 50000, top4: 20000 },
};

export function placementPrize(tier: Tier, rank: number): number {
  const p = SEASON_PRIZE[tier];
  if (!p) return 0;
  if (rank === 1) return p.champ;
  if (rank === 2) return p.runner;
  if (rank === 3 || rank === 4) return p.top4;
  return 0;
}

// 全队全勤约 30 / 天：每人 5。加班 ×1.5
export const DAILY_INSIGHT_EACH = 5;
// 【待定】当天摸鱼达到这么多分钟，这个人不产出心得
export const SLACK_CUTOFF = 90;
// 【待定】耳机升级、白板各让当天心得 +10%（加算）
export const INSIGHT_FACILITY_BONUS = 0.1;

// 老板动作现金随联赛级别 ×1 / ×2 / ×4。世界赛 ×8 等有这一档再接
export const TIER_MULT: Record<Tier, number> = { netcafe: 1, city: 2, national: 4 };

export const AP_BY_VENUE = [3, 4, 5, 6];

export function isPayday(day: number): boolean {
  return day > 1 && (day - 1) % MONTH_DAYS === 0;
}

export function actionPointMax(venue: number, matchDay: boolean): number {
  const base = AP_BY_VENUE[Math.max(0, Math.min(AP_BY_VENUE.length - 1, venue | 0))] ?? 3;
  return base + (matchDay ? 1 : 0);
}

export function tierCashMult(tier: Tier): number {
  return TIER_MULT[tier] ?? 1;
}
