// 休赛期：搬家、换路线、谈薪、谈赞助。招新人留给 DLC。
import { dayInfo } from '../core/calendar';
import { MOVE_FEE, MOVE_REFUND_RATE, SALARY, WORLD_SALARY, actionPointMax } from '../data/economy';
import { VENUE_CN } from '../data/facilities';
import { ROUTE_BY_ID, ROUTE_CHANGE_INSIGHT, ROUTE_GRIND_DAYS, ROUTES, routeFit } from '../data/routes';
import { pairKey, ROSTER_BY_ID } from '../data/roster';
import type { GameState } from '../save/state';
import { monthlySalaryEach } from './economy';
import { isMatchDay } from './worldcup';

export function breakOpen(state: GameState, day = state.clock.day): boolean {
  if (state.season.phase === 'offseason' || state.season.phase === 'world') return true;
  const info = dayInfo(day);
  return info.offseason && state.season.settled && info.season === state.season.calendarSeason;
}

export function venueGate(state: GameState, level: number): string | null {
  if (level <= 0) return null;
  if (level === 1 && state.season.tier === 'netcafe') return '要先打进城市联赛';
  if (level === 2 && state.season.tier !== 'national') return '要先打进国内联赛';
  if (level >= 3 && !state.record.worldQualified) return '要先拿到世界赛资格';
  return null;
}

export function retuneActionPoints(state: GameState, oldLevel: number): void {
  const day = state.clock.day;
  const match = isMatchDay(state, day);
  const oldMax = actionPointMax(oldLevel, match);
  const nextMax = actionPointMax(state.venueLevel, match);
  state.actionPoints = Math.max(0, state.actionPoints + (nextMax - oldMax));
  state.apDay = day;
}

export interface OffseasonResult {
  ok: boolean;
  reason?: string;
  logs: string[];
}

export function moveVenue(state: GameState, target: number): OffseasonResult {
  if (!breakOpen(state)) return { ok: false, reason: '只有休赛期能搬家', logs: [] };
  const level = Math.max(0, Math.min(3, target | 0));
  if (level === state.venueLevel) return { ok: false, reason: '已经在这块场地', logs: [] };
  if (level > state.venueLevel + 1) return { ok: false, reason: '一次只能搬高一级', logs: [] };
  if (level < state.venueLevel - 1) return { ok: false, reason: '一次只能退回一级', logs: [] };
  const gate = venueGate(state, level);
  if (gate) return { ok: false, reason: gate, logs: [] };
  const logs: string[] = [];
  if (level > state.venueLevel) {
    const fee = MOVE_FEE[level] ?? 0;
    if (state.cash < fee) return { ok: false, reason: `搬家费要 ${fee.toLocaleString('zh-CN')}，现金不够`, logs: [] };
    state.cash -= fee;
    logs.push(`搬进${VENUE_CN[level]}，搬家费 -${fee.toLocaleString('zh-CN')}。`);
  } else {
    const back = Math.round((MOVE_FEE[state.venueLevel] ?? 0) * MOVE_REFUND_RATE);
    state.cash += back;
    logs.push(`退掉${VENUE_CN[state.venueLevel]}，返还 ${back.toLocaleString('zh-CN')}。回到${VENUE_CN[level]}。`);
  }
  const old = state.venueLevel;
  state.venueLevel = level;
  retuneActionPoints(state, old);
  const max = actionPointMax(level, isMatchDay(state, state.clock.day));
  logs.push(`场地换成${VENUE_CN[level]}。今天的行动点上限是 ${max}。`);
  return { ok: true, logs };
}

export function recruitMember(): OffseasonResult {
  return { ok: false, reason: '招新人是 DLC，本体一直是这 6 个人', logs: [] };
}

export function changeRoute(state: GameState, memberId: string, routeId: string): OffseasonResult {
  if (!breakOpen(state)) return { ok: false, reason: '换路线留到休赛期', logs: [] };
  const route = ROUTE_BY_ID[routeId];
  const member = state.roster.find((m) => m.id === memberId);
  if (!route || !member) return { ok: false, reason: '没有这条路线', logs: [] };
  if (member.route === route.id) return { ok: false, reason: '已经在练这条', logs: [] };
  if (state.insight < ROUTE_CHANGE_INSIGHT) return { ok: false, reason: `改路线要 ${ROUTE_CHANGE_INSIGHT} 心得`, logs: [] };
  state.insight -= ROUTE_CHANGE_INSIGHT;
  member.route = route.id;
  member.routeGrindUntil = state.clock.day + ROUTE_GRIND_DAYS - 1;
  member.status.心情 = Math.max(0, member.status.心情 - 6);
  const who = ROSTER_BY_ID[memberId]?.name ?? memberId;
  const fit = routeFit(member.ability, member.persona, route);
  return {
    ok: true,
    logs: [`${who} 改练「${route.name}」，适配 ${fit}。磨合到第 ${member.routeGrindUntil} 天，心得 -${ROUTE_CHANGE_INSIGHT}。`],
  };
}

function bestBond(state: GameState, id: string): number {
  let n = 0;
  for (const other of state.roster) {
    if (other.id === id) continue;
    n = Math.max(n, state.relations[pairKey(id, other.id)]?.bond ?? 0);
  }
  return n;
}

export function previousTierSalary(state: GameState): number {
  const from = state.season.report?.from ?? state.season.tier;
  if (from === 'national' && state.record.worldQualified && state.season.report?.move !== 'up') return WORLD_SALARY;
  return SALARY[from] ?? SALARY.netcafe;
}

export function talkSalary(state: GameState, memberId: string, choice: 'table' | 'low' | 'bond'): OffseasonResult {
  if (!breakOpen(state)) return { ok: false, reason: '谈薪在休赛期', logs: [] };
  if (state.season.report?.move !== 'up') return { ok: false, reason: '这次没有升级，工资按表现在的级别走', logs: [] };
  const member = state.roster.find((m) => m.id === memberId);
  if (!member) return { ok: false, reason: '没有这个人', logs: [] };
  if (member.salaryDeal) return { ok: false, reason: '这个人这赛季谈过了', logs: [] };
  const who = ROSTER_BY_ID[memberId]?.name ?? memberId;
  const next = monthlySalaryEach(state);
  const prev = SALARY[state.season.report.from] ?? next;
  if (choice === 'bond') {
    const bond = bestBond(state, memberId);
    if (bond < 65) return { ok: false, reason: `${who} 还没有好兄弟，兄弟情分说不通`, logs: [] };
    member.salary = prev;
    member.salaryDeal = 'bond';
    member.status.心情 = Math.min(100, member.status.心情 + 6);
    return { ok: true, logs: [`${who} 认了兄弟价，月薪先按 ${prev.toLocaleString('zh-CN')}。`] };
  }
  if (choice === 'low') {
    member.salary = Math.round((prev + next) / 2);
    member.salaryDeal = 'low';
    let drop = 12;
    if (member.persona.嘴硬 >= 70) drop += 8;
    member.status.心情 = Math.max(0, member.status.心情 - drop);
    const sulk = member.persona.嘴硬 >= 70 ? '嘴上说没事，脸色很难看。' : '没多说什么。';
    return { ok: true, logs: [`${who} 少涨一点，月薪 ${member.salary.toLocaleString('zh-CN')}。${sulk}`] };
  }
  member.salary = next;
  member.salaryDeal = 'table';
  member.status.心情 = Math.min(100, member.status.心情 + 2);
  return { ok: true, logs: [`${who} 按表拿 ${next.toLocaleString('zh-CN')}。`] };
}

export function routeChoices() {
  return ROUTES;
}
