// 训练成长（设计文档 5.2）。数值是首版默认，平衡阶段按 docs/数值-v0.5.md 调。
import { SLACK_CUTOFF } from './economy';
import type { FitGrade } from './routes';

/** 一个正常训练日、主属性 50 上下、适配 A 的基础成长 */
export const GROWTH_BASE = 0.2;

/** 路线倍率：主属性 / 副属性 / 其他；没有路线（万金油）全部 1.0 */
export const ROUTE_MAIN_MULT = 2.0;
export const ROUTE_SUB_MULT = 1.3;
export const ROUTE_OTHER_MULT = 0.6;
export const ROUTE_NONE_MULT = 1.0;

/** 适配度倍率：S / A / B */
export const FIT_MULT: Record<FitGrade, number> = { S: 1.3, A: 1.0, B: 0.7 };

/** 改路线的磨合期成长倍率 */
export const GRIND_MULT = 0.6;

/** 主属性到这条线之后进入 70 瓶颈，成长开始放缓 */
export const TRAIT_READY_AT = 70;
/** 每场比赛开窍概率 */
export const TRAIT_UNLOCK_CHANCE = 0.3;

/** 当天专注与手感：约 0.75–1.20 */
export function focusFactor(focus: number, feel: number): number {
  return 0.75 + 0.25 * clamp01(focus / 100) + 0.2 * clamp01(feel / 100);
}

/** 70 以上越接近 99 越慢；70 以下不减速 */
export function headroomFactor(current: number): number {
  if (current < TRAIT_READY_AT) return 1;
  return Math.max(0.05, (100 - current) / 30);
}

/** 摸鱼越多，当天训练越少：≥90 分钟 ×0.6，≥180 分钟 ×0.3 */
export function slackFactor(slackMin: number): number {
  if (slackMin >= SLACK_CUTOFF * 2) return 0.3;
  if (slackMin >= SLACK_CUTOFF) return 0.6;
  return 1;
}

/** 体力、心情、疲劳各有一个 0.8 的惩罚，可叠乘 */
export function loadFactor(stamina: number, mood: number, fatigue: number): number {
  let mul = 1;
  if (stamina < 30) mul *= 0.8;
  if (mood < 35) mul *= 0.8;
  if (fatigue > 70) mul *= 0.8;
  return mul;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
