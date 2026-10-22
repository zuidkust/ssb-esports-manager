// 每日作息（设计文档第 3 章，6 段制）与每人的当日计划
// 计划由 (存档种子, 游戏日, 成员) 决定：同一天读档重进，每个人的作息完全一样
import { MATCH_MINUTE, PREMATCH_MINUTE } from '../core/calendar';
import { DAY_END } from '../core/clock';
import { range, seeded } from '../core/rng';
import type { MemberDef } from '../data/roster';
import type { MemberState } from '../save/state';

const H = (h: number, m = 0) => h * 60 + m;

export const MATCH_END = H(20, 30); // M1 没有比赛引擎，比赛时段固定 90 分钟

export interface Segment {
  id: 'dawn' | 'morning' | 'lunch' | 'nap' | 'team' | 'dinner' | 'free' | 'prematch' | 'match' | 'night';
  name: string;
}

export function segmentAt(minute: number, matchDay: boolean): Segment {
  if (minute < H(9)) return { id: 'dawn', name: '清晨 · 陆续到岗' };
  if (minute < H(12)) return { id: 'morning', name: '上班 · 晨练' };
  if (minute < H(13, 30)) return { id: 'lunch', name: '饭点' };
  if (minute < H(14, 30)) return { id: 'nap', name: '午休 · 犯困时段' };
  if (minute < H(18)) return { id: 'team', name: '下午组排' };
  if (matchDay) {
    if (minute < PREMATCH_MINUTE) return { id: 'dinner', name: '赛前晚饭' };
    if (minute < MATCH_MINUTE) return { id: 'prematch', name: '赛前准备' };
    if (minute < MATCH_END) return { id: 'match', name: '比赛中' };
    if (minute < H(22)) return { id: 'free', name: '赛后时间' };
    return { id: 'night', name: '下班 · 夜深了' };
  }
  if (minute < H(19)) return { id: 'dinner', name: '晚饭' };
  if (minute < H(22)) return { id: 'free', name: '自由时间 · 加练 / 摸鱼' };
  return { id: 'night', name: '下班 · 夜深了' };
}

export interface DayPlan {
  arrive: number;
  late: boolean;
  leave: number;
  lunch: [number, number];
  lunchOut: boolean;
  nap: [number, number] | null;
  sofa: boolean;
  dinner: [number, number];
  dinnerOut: boolean;
}

export function buildPlans(seed: number, day: number, members: { def: MemberDef; state: MemberState }[], matchDay: boolean): Record<string, DayPlan> {
  const plans: Record<string, DayPlan> = {};
  let sofaTaken = false;
  for (const { def, state } of members) {
    const r = seeded(seed, 'plan', day, def.id);
    const p = state.persona;
    let arrive = def.arrive === 'early' ? range(r, H(8, 34), H(8, 56)) : range(r, H(8, 46), H(9, 3));
    let late = false;
    const lateP = def.arrive === 'early' ? 0.03 : 0.08 + (p.摸鱼倾向 - 50) / 400;
    if (r() < lateP) {
      arrive = range(r, H(9, 8), H(9, 42));
      late = true;
    }
    const ls = range(r, H(12), H(12, 12));
    const lunch: [number, number] = [ls, ls + range(r, 40, 56)];
    const lunchOut = r() < 0.35;
    const napP = 0.25 + p.摸鱼倾向 / 200 + (state.status.体力 < 55 ? 0.25 : 0);
    let nap: [number, number] | null = null;
    let sofa = false;
    if (r() < napP) {
      const ns = range(r, H(13, 30), H(13, 42));
      nap = [ns, Math.min(H(14, 28), ns + range(r, 25, 50))];
      if (!sofaTaken && r() < 0.55) sofa = sofaTaken = true;
    }
    const ds = range(r, H(18), H(18, 10));
    const dinner: [number, number] = [ds, ds + range(r, 32, 48)];
    const dinnerOut = !matchDay && r() < 0.4;
    let leave: number;
    if (matchDay) leave = range(r, H(21, 30), H(22, 15));
    else if (p.胜负心 >= 70) leave = range(r, H(20, 50), H(22, 10));
    else if (p.摸鱼倾向 >= 60) leave = range(r, H(19, 20), H(20, 40));
    else leave = range(r, H(19, 40), H(21, 30));
    plans[def.id] = { arrive, late, leave: Math.min(leave, DAY_END - 10), lunch, lunchOut, nap, sofa, dinner, dinnerOut };
  }
  return plans;
}
