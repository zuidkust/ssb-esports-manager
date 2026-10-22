// 存档数据结构（设计文档第 12 章）
import { dayInfo, MATCH_MINUTE, PREMATCH_MINUTE } from '../core/calendar';
import type { ClockState } from '../core/clock';
import { DAY_START } from '../core/clock';
import { START_CASH, START_STASH } from '../data/economy';
import type { Tier } from '../data/leagues';
import { ROSTER, INITIAL_BOND, type AbilityKey, type PersonaKey } from '../data/roster';

export const SAVE_VERSION = 3;

export const FOUNDING_TEXT = '老板在网吧包下了角落的 6 台机器，SSB 战队今天正式成立。目标：打出网吧联赛。';

export const STATUS_KEYS = ['体力', '心情', '专注', '手感', '饥饿', '疲劳', '压力'] as const;
export type StatusKey = (typeof STATUS_KEYS)[number];

export interface MemberState {
  id: string;
  ability: Record<AbilityKey, number>;
  persona: Record<PersonaKey, number>;
  status: Record<StatusKey, number>;
  route: string | null; // 训练路线（设计文档 5.2），M1 未启用
  salary: number;
}

export interface Knot {
  cause: string;
  expireDay: number;
}

export interface Relation {
  bond: number; // 交情 0–100，只升不降
  knots: Knot[];
  unlocked: string[];
}

export interface LogEntry {
  id: number;
  day: number;
  minute: number;
  level: '日常' | '有趣' | '剧情' | '重大';
  text: string;
  ids: string[];
}

export type Payer = 'self' | 'host' | 'subsidy';

export interface MealOrder {
  memberId: string;
  dishId: string;
  price: number;
  payer: Payer;
  deliveredAt: number;
  eatUntil: number;
  delivery: boolean; // false = 泡面 / 煎饼，没有外卖员
}

export interface StatusDelta {
  id: string;
  体力?: number;
  心情?: number;
  专注?: number;
  手感?: number;
  饥饿?: number;
  疲劳?: number;
  压力?: number;
}

export interface SocialDelta {
  type: 'bond' | 'knot';
  a: string;
  b: string;
  n?: number;
  cause?: string;
}

export interface MealEffect {
  at: number;
  status: StatusDelta[];
  social: SocialDelta[];
  applied: boolean;
}

export interface MealRecord {
  meal: 'lunch' | 'dinner';
  orders: MealOrder[];
  effects: MealEffect[];
  chains: string[];
}

export interface MorningSnack {
  memberId: string;
  dishId: string;
}

export interface MealsState {
  day: number;
  morning: MorningSnack[];
  lunch?: MealRecord;
  dinner?: MealRecord;
}

export interface GameRecord {
  wins: number;
  losses: number;
  huangmenji: number;
  bestRank: number | null;
  lastMatchWon: boolean | null;
  citySafe: boolean;
  reachedNational: boolean;
  nationalTop4: boolean;
  worldQualified: boolean;
  worldTop4: boolean;
  fame: number;
}

export interface DayFlags {
  restDay: number;
  overtimeDay: number;
  hostDay: number;
  hostMeal: '' | 'lunch' | 'dinner';
  duoDay: number;
  duoA: string;
  duoB: string;
}

export function emptyRecord(): GameRecord {
  return {
    wins: 0, losses: 0, huangmenji: 0, bestRank: null, lastMatchWon: null,
    citySafe: false, reachedNational: false, nationalTop4: false, worldQualified: false, worldTop4: false, fame: 0,
  };
}

export function emptyFlags(): DayFlags {
  return { restDay: 0, overtimeDay: 0, hostDay: 0, hostMeal: '', duoDay: 0, duoA: '', duoB: '' };
}

export function emptyMeals(day = 0): MealsState {
  return { day, morning: [] };
}

export interface GameState {
  version: number;
  seed: number;
  createdAt: number;
  savedAt: number;
  clock: ClockState;
  season: { tier: Tier; round: number; table: Record<string, { w: number; l: number }> };
  cash: number;
  insight: number;
  privateStash: number;
  unpaidMonths: number;
  venueLevel: number; // 0 网吧角落 → 3 豪华基地（data/facilities.ts）
  facilities: string[]; // 已购买的设施 id；场地自带的不用存
  prematchConfirmedDay: number; // 最近一次确认首发的比赛日；读档时据此决定要不要重新弹赛前确认
  rosterCap: number;
  roster: MemberState[];
  relations: Record<string, Relation>; // 键：pairKey(a, b)
  cooldowns: Record<string, number>;
  actionHistory: { action: string; target?: string; day: number }[];
  actionPoints: number;
  apDay: number; // 行动点是哪一天填的，读档同一天不重置
  eventLog: LogEntry[];
  nextLogId: number;
  sponsors: string[];
  bankrupt: boolean;
  meals: MealsState;
  record: GameRecord;
  flags: DayFlags;
  meta: { seasonCount: number; scores: number[]; ngPlus: number; worldChampion: boolean };
}

export function newMemberState(id: string): MemberState {
  const def = ROSTER.find((m) => m.id === id)!;
  return {
    id,
    ability: { ...def.ability },
    persona: { ...def.persona },
    status: { 体力: 85, 心情: 70, 专注: 65, 手感: 60, 饥饿: 30, 疲劳: 10, 压力: 20 },
    route: null,
    salary: 1500,
  };
}

export function createNewGame(seed = Math.floor(Math.random() * 2 ** 31)): GameState {
  const now = Date.now();
  const relations: Record<string, Relation> = {};
  for (const [k, bond] of Object.entries(INITIAL_BOND)) relations[k] = { bond, knots: [], unlocked: [] };
  return {
    version: SAVE_VERSION,
    seed,
    createdAt: now,
    savedAt: now,
    clock: { day: 1, minute: DAY_START, speed: 'x1', paused: false },
    season: { tier: 'netcafe', round: 0, table: {} },
    cash: START_CASH,
    insight: 0,
    privateStash: START_STASH,
    unpaidMonths: 0,
    venueLevel: 0,
    facilities: [],
    prematchConfirmedDay: 0,
    rosterCap: 6,
    roster: ROSTER.map((m) => newMemberState(m.id)),
    relations,
    cooldowns: {},
    actionHistory: [],
    actionPoints: 3,
    apDay: 0,
    eventLog: [{ id: 1, day: 1, minute: DAY_START, level: '剧情', text: FOUNDING_TEXT, ids: [] }],
    nextLogId: 2,
    sponsors: [],
    bankrupt: false,
    meals: emptyMeals(0),
    record: emptyRecord(),
    flags: emptyFlags(),
    meta: { seasonCount: 0, scores: [], ngPlus: 0, worldChampion: false },
  };
}

// 比赛日 18:30–19:00 之间、本场首发还没确认：要（重新）弹出赛前确认。读档后也按这个判断
export function needsPrematch(s: GameState, day: number, minute: number): boolean {
  return dayInfo(day).round != null && minute >= PREMATCH_MINUTE && minute < MATCH_MINUTE && s.prematchConfirmedDay !== day;
}
