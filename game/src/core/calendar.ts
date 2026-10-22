// 赛季日历（设计文档第 9 章）：8 队双循环 14 轮，每 2 个游戏日一场，赛季后 1 周休赛
import { OPPONENTS, type OpponentDef, type Tier } from '../data/leagues';

export const ROUNDS = 14;
export const MATCH_INTERVAL = 2;
export const OFFSEASON_DAYS = 7;
export const SEASON_DAYS = ROUNDS * MATCH_INTERVAL + OFFSEASON_DAYS; // 35
export const MATCH_MINUTE = 19 * 60; // 比赛 19:00 开打
export const PREMATCH_MINUTE = 18 * 60 + 30; // 赛前自动暂停，选首发和战术

const WEEK_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export interface DayInfo {
  day: number; // 从 1 开始的游戏日
  season: number; // 从 1 开始
  dayInSeason: number; // 1..35
  weekday: number; // 1..7，第 1 天是周一
  weekdayCn: string;
  round: number | null; // 今天是第几轮比赛；不是比赛日为 null
  offseason: boolean;
}

export function dayInfo(day: number): DayInfo {
  const season = Math.floor((day - 1) / SEASON_DAYS) + 1;
  const dayInSeason = ((day - 1) % SEASON_DAYS) + 1;
  const weekday = ((day - 1) % 7) + 1;
  const inRegular = dayInSeason <= ROUNDS * MATCH_INTERVAL;
  const round = inRegular && dayInSeason % MATCH_INTERVAL === 0 ? dayInSeason / MATCH_INTERVAL : null;
  return { day, season, dayInSeason, weekday, weekdayCn: WEEK_CN[weekday - 1], round, offseason: !inRegular };
}

// 下一场比赛（含今天还没打的）
export function nextMatch(day: number, minute: number): { day: number; round: number; inDays: number } | null {
  for (let d = day; d < day + SEASON_DAYS + 1; d++) {
    const info = dayInfo(d);
    if (info.round == null) continue;
    if (d === day && minute >= MATCH_MINUTE) continue;
    return { day: d, round: info.round, inDays: d - day };
  }
  return null;
}

// 双循环：前 7 轮依次对阵 7 支对手，后 7 轮再来一遍
export function opponentForRound(tier: Tier, round: number): OpponentDef {
  const list = OPPONENTS[tier].length ? OPPONENTS[tier] : OPPONENTS.netcafe;
  return list[(round - 1) % list.length];
}
