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
  if (minute < H(9)) return { id: 'dawn', name: '清晨 · 还没开门' };
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

// 饭点：M1 大家都留在工位，有人先坐着等饭（M2 换成等外卖小哥），然后吃
export interface Meal {
  start: number;
  eat: number; // 开吃时刻；start..eat 之间在等饭
  end: number;
}

export interface DayPlan {
  arrive: number;
  late: boolean;
  leave: number;
  lunch: Meal;
  nap: [number, number] | null;
  sofa: boolean;
  dinner: Meal;
}

export interface PlanOptions {
  sofa: boolean; // 场地里有沙发（没买就只能趴桌）
}

function meal(r: () => number, from: number, to: number, minLen: number, maxLen: number): Meal {
  const start = range(r, from, to);
  const eat = r() < 0.5 ? start + range(r, 8, 20) : start;
  return { start, eat, end: eat + range(r, minLen, maxLen) };
}

export function buildPlans(
  seed: number, day: number, members: { def: MemberDef; state: MemberState }[], matchDay: boolean, opts: PlanOptions,
): Record<string, DayPlan> {
  const plans: Record<string, DayPlan> = {};
  let sofaTaken = !opts.sofa;
  for (const { def, state } of members) {
    const r = seeded(seed, 'plan', day, def.id);
    const p = state.persona;
    let arrive = def.arrive === 'early' ? range(r, H(9), H(9, 6)) : def.arrive === 'late' ? range(r, H(9, 10), H(9, 25)) : range(r, H(9, 3), H(9, 16));
    let late = false;
    const lateP = def.arrive === 'early' ? 0.03 : def.arrive === 'late' ? 0.22 : 0.08 + (p.摸鱼倾向 - 50) / 400;
    if (r() < lateP) {
      arrive = def.arrive === 'late' ? range(r, H(9, 30), H(9, 58)) : range(r, H(9, 24), H(9, 55));
      late = true;
    }
    const lunch = meal(r, H(12), H(12, 12), 28, 40);
    // 午睡：爱睡觉的人更容易睡，体力低也会犯困（设计文档 6.1.1）
    const napP = 0.1 + p.爱睡觉 / 120 + (state.status.体力 < 55 ? 0.25 : 0);
    let nap: [number, number] | null = null;
    let sofa = false;
    if (r() < napP) {
      const ns = range(r, Math.max(H(13, 30), lunch.end), H(13, 45));
      nap = [ns, Math.min(H(14, 28), ns + range(r, 20, 30) + Math.round(p.爱睡觉 / 5))];
      if (!sofaTaken && r() < 0.55) sofa = sofaTaken = true;
    }
    const dinner = meal(r, H(18), H(18, 10), 24, 36);
    let leave: number;
    if (matchDay) leave = range(r, H(21, 30), H(22, 15));
    else if (def.arrive === 'late') leave = range(r, H(21, 10), H(22, 20));
    else if (p.胜负心 >= 70) leave = range(r, H(20, 50), H(22, 10));
    else if (p.摸鱼倾向 >= 60) leave = range(r, H(19, 20), H(20, 40));
    else leave = range(r, H(19, 40), H(21, 30));
    plans[def.id] = { arrive, late, leave: Math.min(leave, DAY_END - 10), lunch, nap, sofa, dinner };
  }
  spreadArrivals(plans);
  return plans;
}

// 早上到岗至少隔开 4 分钟，避免 09:05–09:12 几个人挤在门口。只往后推，不把人提前。
const ARRIVE_GAP = 4;
function spreadArrivals(plans: Record<string, DayPlan>) {
  const ids = Object.keys(plans).sort((a, b) => plans[a].arrive - plans[b].arrive || (a < b ? -1 : a > b ? 1 : 0));
  let prev = -1e9;
  for (const id of ids) {
    if (plans[id].arrive < prev + ARRIVE_GAP) plans[id].arrive = prev + ARRIVE_GAP;
    prev = plans[id].arrive;
  }
}
