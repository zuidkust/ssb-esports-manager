// 联赛：8 队双循环、积分榜、BO1/BO3、赛季末升降、排名奖、赞助解约
import { dayInfo, MATCH_INTERVAL, MATCH_MINUTE, opponentForRound, SEASON_DAYS } from '../core/calendar';
import { hashString, mulberry32, pick } from '../core/rng';
import { WIN_BONUS, placementPrize } from '../data/economy';
import { OUR_ID, OUR_NAME, nextTier, opponentById, opponentsOf, prevTier, type Tier } from '../data/leagues';
import { ROSTER_BY_ID } from '../data/roster';
import type { TacticId } from '../data/tactics';
import { emptySeason, emptyTable, type GameState } from '../save/state';
import { noteMatch, noteSeasonRank, cutSponsorsAfterMove } from './economy';
import { autoLineup } from './lineup';
import { playCpuGame, playOurMatch } from './matchprep';
import { autoFinishWorldCup, createWorldCup, playerWorldPending } from './worldcup';

export function winsNeeded(tier: Tier): number {
  return tier === 'netcafe' ? 1 : 2;
}

export function roundDay(calendarSeason: number, round: number): number {
  return (calendarSeason - 1) * SEASON_DAYS + round * MATCH_INTERVAL;
}

/** 双循环的一轮配对。玩家的对手和日历里的 opponentForRound 对齐。 */
export function roundPairs(tier: Tier, round: number): [string, string][] {
  const ids = opponentsOf(tier).map((o) => o.id);
  const n = ids.length + 1;
  let circle = [OUR_ID, ...ids.slice().reverse()];
  const turns = (round - 1) % (n - 1);
  for (let i = 0; i < turns; i++) {
    const last = circle[n - 1];
    circle = [circle[0], last, ...circle.slice(1, n - 1)];
  }
  const pairs: [string, string][] = [];
  for (let i = 0; i < n / 2; i++) {
    let a = circle[i];
    let b = circle[n - 1 - i];
    if (b === OUR_ID) [a, b] = [b, a];
    pairs.push([a, b]);
  }
  return pairs;
}

export function roundSettled(state: GameState, day = state.clock.day): boolean {
  const info = dayInfo(day);
  if (info.round == null) return true;
  if (state.season.calendarSeason !== info.season) return false;
  return state.season.settled || state.season.round >= info.round;
}

export function needsIntermission(state: GameState, day: number, minute: number): boolean {
  const ser = state.series;
  if (!ser || ser.day !== day || ser.phase !== 'gap') return false;
  if (minute < MATCH_MINUTE) return false;
  if (playerWorldPending(state, day)) return true;
  return !roundSettled(state, day);
}

export function needsBroadcast(state: GameState, day: number, minute: number): boolean {
  if (minute < MATCH_MINUTE || state.prematchConfirmedDay !== day) return false;
  if (roundSettled(state, day) || needsIntermission(state, day, minute)) return false;
  return dayInfo(day).round != null;
}

function ensureTable(state: GameState): void {
  const base = emptyTable(state.season.tier);
  for (const id of Object.keys(base)) {
    if (!state.season.table[id]) state.season.table[id] = { w: 0, l: 0 };
  }
}

export interface StandingRow {
  id: string;
  name: string;
  w: number;
  l: number;
  rank: number;
}

export function standings(state: GameState): StandingRow[] {
  ensureTable(state);
  const rows = Object.entries(state.season.table).map(([id, rec]) => ({
    id,
    name: id === OUR_ID ? OUR_NAME : (opponentById(state.season.tier, id)?.name ?? id),
    w: rec.w,
    l: rec.l,
  }));
  rows.sort((a, b) => b.w - a.w || a.l - b.l || Number(a.id === OUR_ID) - Number(b.id === OUR_ID) || a.name.localeCompare(b.name, 'zh'));
  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

export function ourRank(state: GameState): StandingRow {
  return standings(state).find((r) => r.id === OUR_ID) ?? { id: OUR_ID, name: OUR_NAME, w: 0, l: 0, rank: 8 };
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function applyGameLoad(state: GameState, slots: readonly string[]): void {
  const on = new Set(slots);
  for (const m of state.roster) {
    if (on.has(m.id)) {
      m.status.疲劳 = clamp100(m.status.疲劳 + 12);
      m.status.压力 = clamp100(m.status.压力 + 6);
    } else {
      m.status.疲劳 = clamp100(Math.max(0, m.status.疲劳 - 8));
    }
  }
}

function addResult(state: GameState, a: string, b: string, aWon: boolean): void {
  const ta = (state.season.table[a] ??= { w: 0, l: 0 });
  const tb = (state.season.table[b] ??= { w: 0, l: 0 });
  if (aWon) {
    ta.w++;
    tb.l++;
  } else {
    ta.l++;
    tb.w++;
  }
}

function cpuWon(state: GameState, round: number, aId: string, bId: string): boolean {
  const tier = state.season.tier;
  const a = opponentById(tier, aId);
  const b = opponentById(tier, bId);
  if (!a || !b) return true;
  const need = winsNeeded(tier);
  const max = need === 1 ? 1 : 3;
  let aw = 0;
  let bw = 0;
  for (let g = 1; g <= max && aw < need && bw < need; g++) {
    const m = playCpuGame(state, round, a, b, g);
    if (m.win === 'A') aw++;
    else bw++;
  }
  return aw > bw;
}

/** 没看直播的系列赛（跳过的轮次）。打完把疲劳写进存档，胜负交给 commitRound。 */
export function playHiddenSeries(state: GameState, round: number, slots: readonly string[], tactic: TacticId): boolean {
  const need = winsNeeded(state.season.tier);
  const max = need === 1 ? 1 : 3;
  const day = roundDay(state.season.calendarSeason, round);
  const opp = opponentForRound(state.season.tier, round);
  let us = 0;
  let them = 0;
  for (let g = 1; g <= max && us < need && them < need; g++) {
    const m = playOurMatch(state, day, g, slots, tactic, opp);
    if (m.win === 'A') us++;
    else them++;
    applyGameLoad(state, slots);
  }
  return us > them;
}

function seriesMood(state: GameState, won: boolean, slots: readonly string[], rng: () => number): string[] {
  const on = new Set(slots);
  const logs: string[] = [];
  for (const m of state.roster) {
    if (on.has(m.id)) m.status.心情 = clamp100(m.status.心情 + (won ? 8 : -4));
    else {
      m.status.心情 = clamp100(m.status.心情 - 6);
      m.persona.胜负心 = clamp100(m.persona.胜负心 + 3);
    }
  }
  if (won) {
    let cleared = 0;
    for (const rel of Object.values(state.relations)) {
      if (!rel.knots.length) continue;
      if (rng() < 0.7) {
        rel.knots.shift();
        cleared++;
      }
    }
    if (cleared) logs.push('赢了。有的心结当场散了。');
  }
  const id = slots[Math.floor(rng() * slots.length)] ?? slots[0];
  const def = id ? ROSTER_BY_ID[id] : undefined;
  const lines = won ? def?.winLines : def?.loseLines;
  if (lines?.length) logs.push(pick(rng, lines));
  return logs;
}

export function tierMove(tier: Tier, rank: number): { tier: Tier; move: 'up' | 'down' | 'stay'; world: boolean } {
  if (rank <= 2 && tier !== 'national') return { tier: nextTier(tier) ?? tier, move: 'up', world: false };
  if (rank <= 2 && tier === 'national') return { tier, move: 'stay', world: true };
  if (rank >= 7 && tier !== 'netcafe') return { tier: prevTier(tier) ?? tier, move: 'down', world: false };
  return { tier, move: 'stay', world: false };
}

export function finishSeason(state: GameState): string[] {
  if (state.season.settled) return [];
  const old = state.season.tier;
  const row = ourRank(state);
  const logs: string[] = [];
  const prize = placementPrize(old, row.rank);
  if (prize > 0) {
    state.cash += prize;
    logs.push(`赛季第 ${row.rank} 名，排名奖 +${prize.toLocaleString('zh-CN')}。`);
  } else {
    logs.push(`赛季第 ${row.rank} 名，没有排名奖。`);
  }
  if (old === 'netcafe') noteSeasonRank(state, row.rank);
  if (old === 'city' && row.rank <= 6) state.record.citySafe = true;
  if (old === 'national' || (old === 'city' && row.rank <= 2)) state.record.reachedNational = true;
  if (old === 'national' && row.rank <= 4) state.record.nationalTop4 = true;
  if (old === 'national' && row.rank <= 2) {
    state.record.worldQualified = true;
    logs.push('拿到世界赛资格。休赛周打世界赛：八强、半决赛、决赛，每两天一场。');
  }
  const move = tierMove(old, row.rank);
  if (move.move === 'up') logs.push(`前两名，升入${move.tier === 'city' ? '城市联赛' : '国内联赛'}。休赛期可以搬家。`);
  else if (move.move === 'down') logs.push(`最后两名，降到${move.tier === 'city' ? '城市联赛' : '网吧联赛'}。场地还在，房租照交。`);
  else if (old === 'netcafe' && row.rank >= 7) logs.push('排在最后两名。网吧联赛没有更低的级别，不降级。包夜大叔队把截图发到群里，羞辱了一轮。');
  else if (move.world) logs.push('国内前两名不升联赛，这个休赛周进世界赛。');
  else logs.push('这个赛季留在原联赛。');

  const rng = mulberry32(hashString([state.seed, 'growth', state.season.calendarSeason, old].join('|')));
  const g = 1 + Math.floor(rng() * 3);
  state.season.growth[old] = (state.season.growth[old] ?? 0) + g;
  logs.push(`这一级的对手悄悄变强了 +${g}。`);

  state.season.tier = move.tier;
  state.season.settled = true;
  state.season.phase = move.world ? 'world' : 'offseason';
  state.season.report = {
    from: old, to: move.tier, rank: row.rank, move: move.move, world: move.world, prize, acked: false,
  };
  if (move.move !== 'stay') {
    for (const m of state.roster) m.salaryDeal = null;
  }
  if (move.world) {
    const other = standings(state).find((r) => r.id !== 'ssb' && r.rank <= 2);
    state.worldCup = createWorldCup(state, other?.id ?? 'jdd');
  }
  state.meta.seasonCount += 1;
  state.meta.scores.push(row.rank);
  for (const s of cutSponsorsAfterMove(state)) logs.push(`${s.name} 看了排名，把赞助解约了。`);
  return logs;
}

/** 把这一轮记进积分榜。玩家的胜负由直播给出，另外三场现场算。 */
export function commitRound(state: GameState, round: number, playerWon: boolean, slots: readonly string[]): string[] {
  if (state.season.settled || state.season.round >= round) return [];
  if (round !== state.season.round + 1) {
    return catchUpThrough(state, round - 1).concat(commitRound(state, round, playerWon, slots));
  }
  ensureTable(state);
  const logs: string[] = [];
  const tier = state.season.tier;
  for (const [a, b] of roundPairs(tier, round)) {
    if (a === OUR_ID || b === OUR_ID) addResult(state, OUR_ID, a === OUR_ID ? b : a, playerWon);
    else addResult(state, a, b, cpuWon(state, round, a, b));
  }
  const opp = opponentForRound(tier, round);
  const bonus = WIN_BONUS[tier] ?? 0;
  noteMatch(state, playerWon);
  if (playerWon) {
    state.cash += bonus;
    logs.push(`赢了 ${opp.name}。胜场奖金 +${bonus.toLocaleString('zh-CN')}，心得 +60。`);
  } else {
    logs.push(`输给 ${opp.name}。心得 +30。`);
  }
  if (!playerWon && opp.id === 'bbq') {
    for (const m of state.roster) m.status.心情 = clamp100(m.status.心情 + 4);
    logs.push('楼下烧烤摊还是请了烤串，大家心情好了一点。');
  }
  if (!playerWon && opp.id === 'class32') logs.push('被三年级二班教育了一顿。');
  const rng = mulberry32(hashString([state.seed, 'mood', state.season.calendarSeason, round].join('|')));
  logs.push(...seriesMood(state, playerWon, slots, rng));
  state.season.round = round;
  const row = ourRank(state);
  logs.push(`第 ${round} 轮结束，目前第 ${row.rank} 名（${row.w} 胜 ${row.l} 负）。`);
  if (round >= 14) logs.push(...finishSeason(state));
  return logs;
}

export function catchUpThrough(state: GameState, throughRound: number): string[] {
  const logs: string[] = [];
  let n = 0;
  while (state.season.round < throughRound && !state.season.settled && n < 14) {
    const round = state.season.round + 1;
    const slots = autoLineup(state.roster);
    const tactic = (state.tactics[0] ?? 'engage') as TacticId;
    const won = playHiddenSeries(state, round, slots, tactic);
    const part = commitRound(state, round, won, slots);
    if (!part.length && state.season.round < round) break;
    logs.push(...part);
    n++;
  }
  if (n) logs.unshift(`跳过的 ${n} 轮已按当时状态补进积分榜。`);
  return logs;
}

/** 跨进新的日历赛季。正常打完的赛季只清积分榜。
 * 已经打过至少一轮、又被时间走到下一季，才把剩下的轮次补进积分榜。
 * 一轮都没记（round 仍是 0）不补算：调试或发薪测试把日子拨过去时，不能凭空赢满 14 轮。
 * fresh 为 false 的跳日（上帝面板）一律不补算。 */
export function enterDay(state: GameState, day: number, fresh: boolean): string[] {
  const info = dayInfo(day);
  if (state.season.calendarSeason === info.season) return [];
  const logs: string[] = [];
  if (fresh && !state.season.settled && state.season.round > 0 && state.season.calendarSeason < info.season) {
    logs.push(...catchUpThrough(state, 14));
  }
  if (fresh && state.worldCup && !state.worldCup.done && state.season.calendarSeason < info.season) {
    logs.push(...autoFinishWorldCup(state));
  }
  const tier = state.season.tier;
  const growth = state.season.growth;
  state.season = emptySeason(tier, info.season);
  state.season.growth = growth;
  state.worldCup = null;
  state.series = null;
  state.broadcast = null;
  state.lineup = null;
  return logs;
}
