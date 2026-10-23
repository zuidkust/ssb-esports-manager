// 测试用的时间跳转和改数。不碰画面；面板在 debug/panel.ts。
// 跳转和读档一样：重算当天作息和站位，不重放中间的日子，也不补发薪。
import { dayInfo, MATCH_MINUTE, nextMatch, OFFSEASON_DAYS, PREMATCH_MINUTE, ROUNDS, SEASON_DAYS } from '../core/calendar';
import { DAY_START, GameClock } from '../core/clock';
import { actionPointMax, isPayday, MONTH_DAYS } from '../data/economy';
import { opponentsOf, OUR_ID, type Tier } from '../data/leagues';
import { emptyTable, type GameState } from '../save/state';
import { runPayday } from '../sim/economy';
import { finishSeason, ourRank, syncSeasonEndHold } from '../sim/league';
import { autoLineup } from '../sim/lineup';
import { commitWorldRound, isMatchDay, playerWorldKickoff, rewindUnplayedWorld } from '../sim/worldcup';
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
  const raw = clampJump(day, minute);
  // 调试跳转也不能把没打的世界赛日跨过去，否则 enterDay 会把对阵直接清掉。
  const held = rewindUnplayedWorld(world.state, raw.day, raw.minute);
  const t = held ?? raw;
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

// 发薪日 09:00 这一刻还算这一次。过了 09:00 才去下一个。普通跳转不走这里，也就不会发薪。
export function nextPaydayDay(day: number, minute: number): number {
  if (isPayday(day) && minute <= DAY_START) return day;
  const into = (day - 1) % MONTH_DAYS;
  const delta = into === 0 && day > 1 ? MONTH_DAYS : MONTH_DAYS - into;
  return day + delta;
}

export function jumpToNextPayday(world: World, clock: GameClock): { day: number; minute: number } {
  const day = nextPaydayDay(world.state.clock.day, world.state.clock.minute);
  const at = applyJump(world, clock, day, DAY_START);
  // 停在这一次发薪上。时间继续走的话，后面的发薪日会自己结算，再点一次就会跳过一个月。
  clock.manualPause = true;
  const paid = world.state.eventLog.some((e) => e.day === day && e.text.includes('发薪'));
  if (!paid) {
    const pay = runPayday(world.state, day);
    world.logAt(pay.bankrupt ? '重大' : '剧情', pay.text, [], DAY_START);
  }
  return at;
}

// 从现在走到目标时刻，中间如果隔着比赛夜的 18:30，就停在那场赛前暂停上。
export function prematchOnTheWay(
  fromDay: number,
  fromMinute: number,
  toDay: number,
  toMinute: number,
  alsoMatchDays: readonly number[] = [],
): { day: number; minute: number } | null {
  const start = fromDay * 24 * 60 + fromMinute;
  const limit = toDay * 24 * 60 + toMinute;
  if (!(limit > start)) return null;
  const extra = new Set(alsoMatchDays);
  for (let d = fromDay; d <= toDay; d++) {
    if (dayInfo(d).round == null && !extra.has(d)) continue;
    const stamp = d * 24 * 60 + PREMATCH_MINUTE;
    if (stamp <= start || stamp > limit) continue;
    return { day: d, minute: PREMATCH_MINUTE };
  }
  return null;
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
// 这段路上如果有比赛夜的赛前暂停，停在 18:30，不把暂停跳过去。
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
      const at = applyJump(world, clock, day, Math.min(...future));
      const kick = playerWorldKickoff(world.state, startDay, startMin);
      const stop = prematchOnTheWay(startDay, startMin, at.day, at.minute, kick ? [kick.day] : []);
      return stop ? applyJump(world, clock, stop.day, stop.minute) : at;
    }
    day += 1;
  }
  return null;
}

export function jumpToNextMatch(world: World, clock: GameClock): { day: number; minute: number } | null {
  const day = world.state.clock.day;
  const minute = world.state.clock.minute;
  const league = nextMatchAt(day, minute);
  const cup = playerWorldKickoff(world.state, day, minute);
  let at = league;
  if (cup && (!at || cup.day < at.day || (cup.day === at.day && cup.minute < at.minute))) at = cup;
  if (!at) return null;
  // 目标若是 19:00，路上的 18:30（含这场世界赛自己的赛前）先停住，不落到开球之后。
  const stop = prematchOnTheWay(day, minute, at.day, at.minute, cup ? [cup.day] : []);
  if (stop && (stop.day < at.day || (stop.day === at.day && stop.minute < at.minute))) {
    return applyJump(world, clock, stop.day, stop.minute);
  }
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

function seasonEndDay(day: number): number {
  const info = dayInfo(Math.max(1, day));
  return info.season * SEASON_DAYS - OFFSEASON_DAYS;
}

function offseasonDay(day: number): number {
  return seasonEndDay(day) + 1;
}

function champTable(tier: Tier): Record<string, { w: number; l: number }> {
  const table = emptyTable(tier);
  Object.keys(table).forEach((id, i) => {
    const w = id === OUR_ID ? 12 : Math.max(0, 9 - i);
    table[id] = { w, l: Math.max(0, 14 - w) };
  });
  return table;
}

// 和 world.logAt 认的是同一类结算原文。发薪里的「赛季第 N 天」不要算进来。
const SEASON_SETTLEMENT = /赛季第 \d+ 名|不升联赛|拿到世界赛资格|对手悄悄变强|看了排名，把赞助解约|不降级|前两名，升入|最后两名，降到|这个赛季留在原联赛/;

function logLines(world: World, lines: string[]): void {
  // 调试会把同一赛季再结算一次（跳到赛季末之后再触发世界赛）。奖金数字往往不一样，按整句去重去不掉。
  // 这一季的结算只留最新这一次。
  if (lines.some((text) => SEASON_SETTLEMENT.test(text))) {
    const season = dayInfo(world.state.clock.day).season;
    world.state.eventLog = world.state.eventLog.filter((e) => !(SEASON_SETTLEMENT.test(e.text) && dayInfo(e.day).season === season));
  }
  for (const text of lines) world.log(/升入|降到|世界赛|冠军|解约|羞辱/.test(text) ? '重大' : '剧情', text, []);
}

/** 跳到本赛季最后一轮的晚上，并按第 1 名结算，弹出升级。 */
export function jumpToSeasonEnd(world: World, clock: GameClock): { day: number; minute: number } {
  const at = applyJump(world, clock, seasonEndDay(world.state.clock.day), 21 * 60);
  const state = world.state;
  if (!state.season.settled) {
    state.season.table = champTable(state.season.tier);
    state.season.round = ROUNDS;
    logLines(world, finishSeason(state));
  } else if (state.season.report) state.season.report.acked = false;
  return at;
}

/** 跳到休赛期第二天早上。还没结算的赛季按第 1 名先结算，方便搬家。 */
export function jumpToOffseason(world: World, clock: GameClock): { day: number; minute: number } {
  const at = applyJump(world, clock, offseasonDay(world.state.clock.day), 10 * 60);
  const state = world.state;
  if (!state.season.settled) {
    state.season.table = champTable(state.season.tier);
    state.season.round = ROUNDS;
    logLines(world, finishSeason(state));
  }
  if (state.season.phase === 'regular') state.season.phase = state.worldCup && !state.worldCup.done ? 'world' : 'offseason';
  if (state.season.report) state.season.report.acked = true;
  // 「跳到赛季末」会先挂上赛季结算暂停。进了休赛就把这条放行，别的暂停不动。
  syncSeasonEndHold(clock, false);
  return at;
}

/** 把当前赛季改成国内第 1，生成世界赛对阵，停在八强开赛前。 */
export function armWorldCup(world: World, clock: GameClock): { day: number; minute: number } {
  const at = applyJump(world, clock, offseasonDay(world.state.clock.day), 18 * 60 + 20);
  const state = world.state;
  state.season.tier = 'national';
  state.season.settled = false;
  state.season.round = ROUNDS;
  state.season.table = champTable('national');
  state.worldCup = null;
  state.meta.worldChampion = false;
  state.meta.endingSeen = true;
  state.record.worldQualified = false;
  logLines(world, finishSeason(state));
  if (state.season.report) state.season.report.acked = true;
  // 停在八强开赛前（18:20）。赛季结算暂停不放行的话，回到场地后时钟钉死，到不了 18:30 首发。
  syncSeasonEndHold(clock, false);
  const spent = state.actionHistory.some((h) => h.day === state.clock.day);
  if (!spent) state.actionPoints = actionPointMax(state.venueLevel, isMatchDay(state, state.clock.day));
  return at;
}

/** 按目标名次排一张积分榜。名次 1 胜场最多，互不并列。 */
export function tableForRank(tier: Tier, rank: number): Record<string, { w: number; l: number }> {
  const want = Math.max(1, Math.min(8, Math.floor(rank)));
  const order = opponentsOf(tier).map((o) => o.id);
  order.splice(Math.min(want - 1, order.length), 0, OUR_ID);
  const table: Record<string, { w: number; l: number }> = {};
  order.forEach((id, i) => {
    table[id] = { w: 14 - i, l: i };
  });
  return table;
}

/**
 * 跳到本赛季末，把积分榜改成指定名次再结算。
 * 用来自测后两名降级、网吧联赛垫底不降级。已经结算过的话，按现在所在的联赛重算，不退回升级前的级别。
 */
export function setSeasonRank(world: World, clock: GameClock, rank: number): { day: number; minute: number; rank: number } {
  const state = world.state;
  if (state.season.settled) {
    state.meta.seasonCount = Math.max(0, state.meta.seasonCount - 1);
    state.meta.scores.pop();
    state.worldCup = null;
    state.season.phase = 'regular';
    state.season.settled = false;
    state.season.report = null;
  }
  const at = applyJump(world, clock, seasonEndDay(state.clock.day), 21 * 60);
  state.season.table = tableForRank(state.season.tier, rank);
  state.season.round = ROUNDS;
  state.season.settled = false;
  state.worldCup = null;
  state.season.phase = 'regular';
  state.season.report = null;
  logLines(world, finishSeason(state));
  return { ...at, rank: ourRank(state).rank };
}

/** 直接打完世界赛并且玩家全胜，用来看夺冠结局。 */
export function crownWorld(world: World, clock: GameClock): { day: number; minute: number } {
  // 八强已经输过时，旧日志里的「八强输」不能和这次的「决赛赢」叠在一起。
  world.state.eventLog = world.state.eventLog.filter((e) => !/世界赛(八强|半决赛|决赛)|拿下了世界赛|世界冠军/.test(e.text));
  const at = armWorldCup(world, clock);
  const state = world.state;
  const slots = autoLineup(state.roster);
  const logs: string[] = [];
  for (const round of [0, 1, 2] as const) logs.push(...commitWorldRound(state, round, true, slots));
  state.meta.endingSeen = false;
  if (state.season.report) state.season.report.acked = true;
  logLines(world, logs);
  return at;
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
