// 世界赛：国内前 2 + 6 支海外队，8 队单败淘汰 BO3。三场落在休赛周的第 1、3、5 天。
import { dayInfo, MATCH_INTERVAL, MATCH_MINUTE, PREMATCH_MINUTE, ROUNDS, SEASON_DAYS } from '../core/calendar';
import { hashString } from '../core/rng';
import { WORLD_CHAMP_PRIZE, WORLD_ROUND_PRIZE } from '../data/economy';
import { opponentById, OUR_ID, OUR_NAME, type OpponentDef } from '../data/leagues';
import { WORLD_BY_ID, WORLD_TEAMS } from '../data/world';
import { tacticIdOf } from '../data/tactics';
import { makeRng, simulateMatch } from '../engine/match';
import type { GameState, WorldCupState } from '../save/state';
import { noteMatch } from './economy';
import { autoLineup } from './lineup';
import { opponentPlayers, playOurMatch } from './matchprep';

export const WORLD_ROUND_CN = ['八强', '半决赛', '决赛'] as const;

const G3_TACTICS = ['强开团', '保排消耗', '防守反打', '速攻节奏', '运营发育'];

export function worldRoundOnDay(day: number): 0 | 1 | 2 | null {
  const info = dayInfo(day);
  if (!info.offseason) return null;
  const n = info.dayInSeason - ROUNDS * MATCH_INTERVAL;
  if (n === 1) return 0;
  if (n === 3) return 1;
  if (n === 5) return 2;
  return null;
}

/** 某一季世界赛第 round 轮的比赛日。八强 / 半决赛 / 决赛落在休赛周第 1、3、5 天。 */
export function worldRoundDay(calendarSeason: number, round: 0 | 1 | 2): number {
  const offStart = (calendarSeason - 1) * SEASON_DAYS + ROUNDS * MATCH_INTERVAL;
  return offStart + (round === 0 ? 1 : round === 1 ? 3 : 5);
}

/** 联赛比赛日，以及世界赛那三天，全天都算比赛日（行动点 +1），打完也还算。 */
export function isMatchDay(state: GameState, day: number): boolean {
  if (dayInfo(day).round != null) return true;
  const cup = state.worldCup;
  if (!cup || cup.calendarSeason !== dayInfo(day).season) return false;
  return worldRoundOnDay(day) != null;
}

function rosterPower(state: GameState): number {
  let sum = 0;
  for (const m of state.roster) {
    const vals = Object.values(m.ability);
    sum += vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return Math.round(sum / Math.max(1, state.roster.length));
}

export function teamName(id: string): string {
  if (id === OUR_ID) return OUR_NAME;
  return WORLD_BY_ID[id]?.name ?? opponentById('national', id)?.name ?? id;
}

/** 海外队和国内另一支资格队。G3 按场次换战术，C10 过了八强掉实力。 */
export function teamDef(id: string, roundIndex: number, game = 1): OpponentDef | null {
  if (id === OUR_ID) return null;
  const base = WORLD_BY_ID[id] ?? opponentById('national', id);
  if (!base) return null;
  let def = base;
  if (def.id === 'c10' && roundIndex > 0) def = { ...def, power: def.power - 6 };
  if (def.id === 'g3') def = { ...def, tactic: G3_TACTICS[(roundIndex + game) % G3_TACTICS.length] };
  return def;
}

export function createWorldCup(state: GameState, otherId: string): WorldCupState {
  const other = opponentById('national', otherId) ?? opponentById('national', 'jdd')!;
  const entrants = [
    ...WORLD_TEAMS.map((t) => ({ id: t.id, power: t.power })),
    { id: other.id, power: other.power },
    { id: OUR_ID, power: rosterPower(state) },
  ];
  entrants.sort((a, b) => b.power - a.power || a.id.localeCompare(b.id));
  const seed = [0, 7, 3, 4, 1, 6, 2, 5];
  return {
    calendarSeason: state.season.calendarSeason,
    order: seed.map((i) => entrants[i].id),
    games: [],
    done: false,
    champion: false,
  };
}

export function winnersOf(cup: WorldCupState, roundIndex: number): string[] {
  return cup.games.filter((g) => g.round === roundIndex).map((g) => g.winner);
}

export function pendingRound(cup: WorldCupState): 0 | 1 | 2 | null {
  for (const r of [0, 1, 2] as const) {
    const need = r === 0 ? 4 : r === 1 ? 2 : 1;
    if (cup.games.filter((g) => g.round === r).length < need) return r;
  }
  return null;
}

export function roundPairsOf(cup: WorldCupState, roundIndex: number): [string, string][] {
  const ids = roundIndex === 0 ? cup.order : winnersOf(cup, roundIndex - 1);
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
  return pairs;
}

export function playerWorldPending(state: GameState, day: number): boolean {
  const cup = state.worldCup;
  if (!cup || cup.done) return false;
  if (cup.calendarSeason !== dayInfo(day).season) return false;
  const round = worldRoundOnDay(day);
  if (round == null || pendingRound(cup) !== round) return false;
  return roundPairsOf(cup, round).some((p) => p[0] === OUR_ID || p[1] === OUR_ID);
}

function playerInPending(cup: NonNullable<GameState['worldCup']>): 0 | 1 | 2 | null {
  const round = pendingRound(cup);
  if (round == null) return null;
  if (!roundPairsOf(cup, round).some((p) => p[0] === OUR_ID || p[1] === OUR_ID)) return null;
  return round;
}

/** 玩家还没打的那一轮世界赛开球时刻。已经过了 19:00 就不再算「下一场」。 */
export function playerWorldKickoff(state: GameState, day: number, minute: number): { day: number; minute: number } | null {
  const cup = state.worldCup;
  if (!cup || cup.done) return null;
  const round = playerInPending(cup);
  if (round == null) return null;
  const due = worldRoundDay(cup.calendarSeason, round);
  if (due < day || (due === day && minute >= MATCH_MINUTE)) return null;
  return { day: due, minute: MATCH_MINUTE };
}

/**
 * 时间已经走过玩家还没打的世界赛日。调用方应把钟拨回那场的 18:30。
 * 只在「日历日已经超过比赛日」时拨回；比赛当晚的 18:30–19:00 仍交给赛前暂停。
 */
export function rewindUnplayedWorld(state: GameState, day: number, minute: number): { day: number; minute: number } | null {
  void minute;
  const cup = state.worldCup;
  if (!cup || cup.done) return null;
  const round = playerInPending(cup);
  if (round == null) return null;
  const due = worldRoundDay(cup.calendarSeason, round);
  if (day <= due) return null;
  return { day: due, minute: PREMATCH_MINUTE };
}

/** 联赛比赛日，以及玩家今天要打的世界赛，18:30 和 19:00 都是停靠点。 */
export function matchPauseMinutes(state: GameState, day: number): number[] {
  if (dayInfo(day).round != null || playerWorldPending(state, day)) return [PREMATCH_MINUTE, MATCH_MINUTE];
  return [];
}

export function needsWorldPrematch(state: GameState, day: number, minute: number): boolean {
  if (!playerWorldPending(state, day) || minute < PREMATCH_MINUTE) return false;
  if (state.series?.day === day && state.series.phase === 'gap') return false;
  return state.prematchConfirmedDay !== day;
}

export function needsWorldBroadcast(state: GameState, day: number, minute: number): boolean {
  if (!playerWorldPending(state, day) || minute < 19 * 60) return false;
  if (state.prematchConfirmedDay !== day) return false;
  if (state.series?.day === day && state.series.phase === 'gap') return false;
  return true;
}

export function playerWorldOpponent(state: GameState, day: number): { round: 0 | 1 | 2; opponent: OpponentDef } | null {
  if (!playerWorldPending(state, day)) return null;
  const round = worldRoundOnDay(day)!;
  const pair = roundPairsOf(state.worldCup!, round).find((p) => p[0] === OUR_ID || p[1] === OUR_ID);
  if (!pair) return null;
  const foeId = pair[0] === OUR_ID ? pair[1] : pair[0];
  const opponent = teamDef(foeId, round, state.series?.game ?? 1);
  if (!opponent) return null;
  return { round, opponent };
}

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function loadRoster(state: GameState, slots: readonly string[]): void {
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

function cpuWins(state: GameState, a: OpponentDef, b: OpponentDef, tag: string): boolean {
  let aw = 0;
  let bw = 0;
  for (let g = 1; g <= 3 && aw < 2 && bw < 2; g++) {
    const rng = makeRng(hashString([state.seed, 'worldcpu', state.season.calendarSeason, tag, a.id, b.id, g].join('|')));
    const pa = opponentPlayers(a, 0, rng.next);
    const pb = opponentPlayers(b, 0, rng.next);
    const m = simulateMatch(pa, pb, {
      nameA: a.name,
      nameB: b.name,
      tacA: tacticIdOf(a.tactic),
      tacB: tacticIdOf(b.tactic),
      gameIdx: g,
      perkB: b.perk,
    }, rng);
    if (m.win === 'A') aw++;
    else bw++;
  }
  return aw > bw;
}

function autoPlayerWins(state: GameState, foe: OpponentDef, roundIndex: number): boolean {
  const slots = autoLineup(state.roster);
  const tactic = state.tactics[0] ?? 'engage';
  let us = 0;
  let them = 0;
  const day = state.clock.day;
  for (let g = 1; g <= 3 && us < 2 && them < 2; g++) {
    const live = teamDef(foe.id, roundIndex, g) ?? foe;
    const m = playOurMatch(state, day, g, slots, tactic, live);
    if (m.win === 'A') us++;
    else them++;
    loadRoster(state, slots);
  }
  return us > them;
}

function money(n: number): string {
  return n.toLocaleString('zh-CN');
}

/** 把这一轮全部记进对阵。玩家在场时用传入的胜负，其余场次现场算。 */
export function commitWorldRound(state: GameState, roundIndex: number, playerWon: boolean, slots: readonly string[]): string[] {
  const cup = state.worldCup;
  if (!cup || cup.done || pendingRound(cup) !== roundIndex) return [];
  const pairs = roundPairsOf(cup, roundIndex);
  const logs: string[] = [];
  for (const [a, b] of pairs) {
    let winner: string;
    if (a === OUR_ID || b === OUR_ID) {
      winner = playerWon ? OUR_ID : a === OUR_ID ? b : a;
      const foe = a === OUR_ID ? b : a;
      noteMatch(state, playerWon);
      if (playerWon && roundIndex < 2) {
        state.cash += WORLD_ROUND_PRIZE;
        logs.push(`世界赛${WORLD_ROUND_CN[roundIndex]}赢了 ${teamName(foe)}。晋级奖金 +${money(WORLD_ROUND_PRIZE)}。`);
      } else if (playerWon && roundIndex === 2) {
        state.cash += WORLD_CHAMP_PRIZE;
        logs.push(`世界赛决赛赢了 ${teamName(foe)}。冠军奖金 +${money(WORLD_CHAMP_PRIZE)}。`);
      } else {
        logs.push(`世界赛${WORLD_ROUND_CN[roundIndex]}输给 ${teamName(foe)}。`);
      }
      if (playerWon && roundIndex === 0) state.record.worldTop4 = true;
      if (slots.length) {
        for (const m of state.roster) {
          if (slots.includes(m.id)) m.status.心情 = clamp100(m.status.心情 + (playerWon ? 8 : -4));
        }
      }
    } else {
      const da = teamDef(a, roundIndex);
      const db = teamDef(b, roundIndex);
      winner = da && db && cpuWins(state, da, db, `r${roundIndex}`) ? a : b;
    }
    cup.games.push({ round: roundIndex, a, b, winner });
  }
  if (roundIndex === 2 || !winnersOf(cup, roundIndex).includes(OUR_ID)) {
    if (roundIndex < 2 && !winnersOf(cup, roundIndex).includes(OUR_ID)) {
      logs.push(...simRemaining(state));
    } else if (roundIndex === 2) {
      finishCup(state, logs);
    }
  }
  return logs;
}

function finishCup(state: GameState, logs: string[]): void {
  const cup = state.worldCup;
  if (!cup) return;
  const final = cup.games.find((g) => g.round === 2);
  cup.done = true;
  cup.champion = final?.winner === OUR_ID;
  state.season.phase = 'offseason';
  if (cup.champion) {
    state.meta.worldChampion = true;
    state.meta.endingSeen = false;
    logs.push('世界冠军。庆功宴今晚开，明天还可以继续打。');
  } else if (final) {
    logs.push(`${teamName(final.winner)} 拿下了世界赛。休赛期还没结束，可以搬家。`);
  }
}

function simRemaining(state: GameState): string[] {
  const logs: string[] = [];
  const cup = state.worldCup;
  if (!cup) return logs;
  let guard = 0;
  while (!cup.done && guard++ < 3) {
    const round = pendingRound(cup);
    if (round == null) {
      finishCup(state, logs);
      break;
    }
    const pairs = roundPairsOf(cup, round);
    if (pairs.some((p) => p.includes(OUR_ID))) break;
    for (const [a, b] of pairs) {
      const da = teamDef(a, round);
      const db = teamDef(b, round);
      const winner = da && db && cpuWins(state, da, db, `rest${round}`) ? a : b;
      cup.games.push({ round, a, b, winner });
    }
    if (round === 2) finishCup(state, logs);
  }
  return logs;
}

/** 时间直接跨进下个赛季时，把没打完的世界赛按当前状态补完。 */
export function autoFinishWorldCup(state: GameState): string[] {
  const cup = state.worldCup;
  if (!cup || cup.done) return [];
  const logs: string[] = ['世界赛还没看完，按当时的阵容补完了。'];
  let guard = 0;
  while (state.worldCup && !state.worldCup.done && guard++ < 4) {
    const round = pendingRound(state.worldCup);
    if (round == null) break;
    const pair = roundPairsOf(state.worldCup, round).find((p) => p.includes(OUR_ID));
    let won = false;
    const slots = autoLineup(state.roster);
    if (pair) {
      const foeId = pair[0] === OUR_ID ? pair[1] : pair[0];
      const foe = teamDef(foeId, round);
      won = foe ? autoPlayerWins(state, foe, round) : false;
    }
    const part = commitWorldRound(state, round, won, slots);
    if (!part.length) break;
    logs.push(...part);
  }
  return logs;
}

/** 旧档已经在国内赛季末、并且有世界赛资格：补一份对阵，不重发排名奖。 */
export function armLegacyWorldCup(state: GameState): void {
  if (state.worldCup || !state.season?.settled || !state.record?.worldQualified) return;
  if (state.meta?.worldChampion) return;
  const info = dayInfo(state.clock?.day ?? 1);
  if (info.season !== state.season.calendarSeason) return;
  if (!info.offseason && state.season.round < 14) return;
  const rows = Object.entries(state.season.table ?? {}).map(([id, rec]) => ({ id, ...rec }));
  rows.sort((a, b) => b.w - a.w || a.l - b.l || Number(a.id === OUR_ID) - Number(b.id === OUR_ID));
  const other = rows.find((r) => r.id !== OUR_ID);
  state.worldCup = createWorldCup(state, other?.id ?? 'jdd');
  state.season.phase = 'world';
  if (!state.season.report) {
    state.season.report = {
      from: 'national', to: 'national', rank: Math.max(1, rows.findIndex((r) => r.id === OUR_ID) + 1),
      move: 'stay', world: true, prize: 0, acked: true,
    };
  }
}
