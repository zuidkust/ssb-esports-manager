// 测试用的时间跳转和改数。不碰画面；面板在 debug/panel.ts。
// 跳转和读档一样：重算当天作息和站位，不重放中间的日子，也不补发薪。
import { dayInfo, MATCH_MINUTE, nextMatch, PREMATCH_MINUTE } from '../core/calendar';
import { DAY_START, GameClock } from '../core/clock';
import { isPayday, MONTH_DAYS } from '../data/economy';
import type { GameState } from '../save/state';
import { runPayday } from '../sim/economy';
import { forceDelivery, type TakeoutPerson } from '../sim/takeout';
import type { World } from '../sim/world';

const LUNCH = 12 * 60;
const DINNER = 18 * 60;
const LUNCH_DONE = 14 * 60;
const DINNER_DONE = 21 * 60;
const TAKEOUT_DAYS = 7;

export function clampJump(day: number, minute: number): { day: number; minute: number } {
  const d = Math.max(1, Math.floor(Number.isFinite(day) ? day : 1));
  const m = Math.max(0, Math.min(1439, Math.floor(Number.isFinite(minute) ? minute : DAY_START)));
  return { day: d, minute: m };
}

export function parseHM(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// 和读档同一条路：两个钟一起改，world.update(..., jumped=true)，不写沿途动态。
export function applyJump(world: World, clock: GameClock, day: number, minute: number): { day: number; minute: number } {
  const t = clampJump(day, minute);
  clock.releasePrefixed('match-');
  clock.set(t.day, t.minute);
  world.state.clock.day = t.day;
  world.state.clock.minute = t.minute;
  world.planDay = -1;
  world.update(t.minute, 0, true);
  return t;
}

export function nextMatchAt(day: number, minute: number): { day: number; minute: number } | null {
  const nm = nextMatch(day, minute);
  if (!nm) return null;
  return { day: nm.day, minute: MATCH_MINUTE };
}

// 已经过了当天 09:00 的发薪日，按钮去下一个；普通跳转不走这里，也就不会发薪。
export function nextPaydayDay(day: number, minute: number): number {
  if (isPayday(day) && minute < DAY_START) return day;
  const into = (day - 1) % MONTH_DAYS;
  const delta = into === 0 && day > 1 ? MONTH_DAYS : MONTH_DAYS - into;
  return day + delta;
}

export function jumpToNextPayday(world: World, clock: GameClock): { day: number; minute: number } {
  const day = nextPaydayDay(world.state.clock.day, world.state.clock.minute);
  const at = applyJump(world, clock, day, DAY_START);
  const paid = world.state.eventLog.some((e) => e.day === day && e.text.includes('发薪'));
  if (!paid) {
    const pay = runPayday(world.state, day);
    world.logAt(pay.bankrupt ? '重大' : '剧情', pay.text, [], DAY_START);
  }
  return at;
}

export interface EventBeat {
  day: number;
  minute: number;
  label: string;
}

// 下一个作息节点。完整事件库是 M5，这里只跳日程上的点。
export function nextEventAt(day: number, minute: number): EventBeat {
  const match = dayInfo(day).round != null;
  const beats: { minute: number; label: string }[] = [
    { minute: DAY_START, label: '上班' },
    { minute: LUNCH, label: '午饭' },
    { minute: 13 * 60 + 30, label: '午休' },
    { minute: 14 * 60 + 30, label: '组排' },
    { minute: DINNER, label: '晚饭' },
  ];
  if (match) {
    beats.push({ minute: PREMATCH_MINUTE, label: '赛前' });
    beats.push({ minute: MATCH_MINUTE, label: '开赛' });
    beats.push({ minute: 20 * 60 + 30, label: '赛后' });
  } else {
    beats.push({ minute: 19 * 60, label: '自由时间' });
  }
  beats.push({ minute: 22 * 60, label: '下班' });
  const next = beats.find((b) => b.minute > minute);
  if (next) return { day, minute: next.minute, label: next.label };
  const nd = day + 1;
  return { day: nd, minute: DAY_START, label: isPayday(nd) ? '发薪' : '上班' };
}

function peopleOf(world: World): TakeoutPerson[] {
  return world.members.map((m) => ({
    id: m.id,
    name: m.name,
    persona: { 摸鱼倾向: m.state.persona.摸鱼倾向, 话痨: m.state.persona.话痨 },
    status: { 饥饿: m.state.status.饥饿, 心情: m.state.status.心情 },
    late: world.plans[m.id]?.late ?? false,
  }));
}

function mealRecord(world: World, day: number, meal: 'lunch' | 'dinner') {
  if (world.state.meals.day !== day) return undefined;
  return meal === 'lunch' ? world.state.meals.lunch : world.state.meals.dinner;
}

// 走到下一顿还有外卖员的饭点，落在他进门的那一分钟（送达前 6 分钟）。最多找 7 天。
export function jumpToNextTakeout(world: World, clock: GameClock): { day: number; minute: number } | null {
  const startDay = world.state.clock.day;
  const startMin = world.state.clock.minute;
  let day = startDay;
  for (let i = 0; i < TAKEOUT_DAYS; i++) {
    const slots: { meal: 'lunch' | 'dinner'; at: number; done: number }[] = [
      { meal: 'lunch', at: LUNCH, done: LUNCH_DONE },
      { meal: 'dinner', at: DINNER, done: DINNER_DONE },
    ];
    for (const slot of slots) {
      if (day === startDay && startMin >= slot.done) continue;
      if (!mealRecord(world, day, slot.meal)) applyJump(world, clock, day, slot.at);
      const rec = mealRecord(world, day, slot.meal);
      const enters = (rec?.orders ?? []).filter((o) => o.delivery).map((o) => o.deliveredAt - 6);
      const future = enters.filter((t) => day > startDay || t > startMin + 1e-6);
      if (!future.length) continue;
      return applyJump(world, clock, day, Math.min(...future));
    }
    day += 1;
  }
  return null;
}

export function jumpToNextMatch(world: World, clock: GameClock): { day: number; minute: number } | null {
  const at = nextMatchAt(world.state.clock.day, world.state.clock.minute);
  if (!at) return null;
  return applyJump(world, clock, at.day, at.minute);
}

export function jumpToNextEvent(world: World, clock: GameClock): EventBeat {
  const beat = nextEventAt(world.state.clock.day, world.state.clock.minute);
  applyJump(world, clock, beat.day, beat.minute);
  return beat;
}

export function setCash(state: GameState, amount: number): number {
  const n = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
  state.cash = n;
  return n;
}

export function setActionPoints(state: GameState, points: number): number {
  const n = Math.max(0, Math.min(99, Math.floor(Number.isFinite(points) ? points : 0)));
  state.actionPoints = n;
  state.apDay = state.clock.day;
  return n;
}

export function clampVenue(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(3, Math.floor(level)));
}

export function clearCooldowns(state: GameState): void {
  state.cooldowns = {};
}

// 15:00 前算午饭，之后算晚饭；21:00 以后改到第二天午饭。先落到饭点让当天订单生成，再把指定的一单叠上去。
export function forceTakeout(
  world: World,
  clock: GameClock,
  memberId: string,
  dishId: string,
  chainId: string | null,
): { day: number; minute: number } {
  const nowDay = world.state.clock.day;
  const nowMin = world.state.clock.minute;
  let day = nowDay;
  let meal: 'lunch' | 'dinner';
  if (nowMin >= DINNER_DONE) {
    day = nowDay + 1;
    meal = 'lunch';
  } else if (nowMin < 15 * 60) meal = 'lunch';
  else meal = 'dinner';
  applyJump(world, clock, day, meal === 'lunch' ? LUNCH : DINNER);
  const forced = forceDelivery({
    state: world.state,
    people: peopleOf(world),
    day,
    meal,
    memberId,
    dishId,
    chainId,
    place: world.placeName,
  });
  for (const l of forced.logs) world.logAt(l.level, l.text, l.ids, l.minute);
  return applyJump(world, clock, day, forced.minute);
}
