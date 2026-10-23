// 存档数据结构（设计文档第 12 章）
import { dayInfo, MATCH_MINUTE, PREMATCH_MINUTE } from '../core/calendar';
import type { ClockState } from '../core/clock';
import { DAY_START } from '../core/clock';
import { START_CASH, START_STASH } from '../data/economy';
import { OPPONENTS, OUR_ID, type Tier } from '../data/leagues';
import { ROSTER, INITIAL_BOND, type AbilityKey, type PersonaKey } from '../data/roster';
import { STARTER_TACTICS, type TacticId } from '../data/tactics';

export const SAVE_VERSION = 7;

export const FOUNDING_TEXT = '老板在网吧包下了角落的 6 台机器，SSB 战队今天正式成立。目标：打出网吧联赛。';

export const STATUS_KEYS = ['体力', '心情', '专注', '手感', '饥饿', '疲劳', '压力'] as const;
export type StatusKey = (typeof STATUS_KEYS)[number];

export type ScrimResult = 'win' | 'lose';

/** 日常单排 / 双排 / 组排的结果，只给事件看板和对局类条件用，不进联赛积分。 */
export interface ScrimState {
  wins: number;
  losses: number;
  /** 正数 = 连胜，负数 = 连败 */
  streak: number;
  last: ScrimResult | null;
  lastMinute: number;
  /** 已经结算到哪个 35 分钟块，避免一局重复结算 */
  block: number;
}

/** 事件库的持久状态：分钟级冷却、最近触发日、flag、chain 权重。 */
export interface EventState {
  cooldownUntil: Record<string, number>;
  lastFiredDay: Record<string, number>;
  flags: Record<string, number>;
  boosts: Record<string, { pct: number; until: number }>;
}

export function emptyScrim(): ScrimState {
  return { wins: 0, losses: 0, streak: 0, last: null, lastMinute: 0, block: -1 };
}

export function emptyEvents(): EventState {
  return { cooldownUntil: {}, lastFiredDay: {}, flags: {}, boosts: {} };
}

export function zeroAbility(): Record<AbilityKey, number> {
  return { lane: 0, roam: 0, fight: 0, sense: 0, mech: 0, pool: 0, mental: 0 };
}

export interface MemberState {
  id: string;
  ability: Record<AbilityKey, number>;
  persona: Record<PersonaKey, number>;
  status: Record<StatusKey, number>;
  route: string | null; // 训练路线 id（data/routes.ts）
  /** 磨合期最后一天（含）。0 = 没有 */
  routeGrindUntil: number;
  /** 当前路线已解锁的路线特性名；换路线会清空 */
  routeTrait: string | null;
  /** 主属性已经到 70，等一场比赛开窍 */
  routeTraitReady: boolean;
  /** 属性小数进位，满 1 才加到 ability */
  abilityCarry: Record<AbilityKey, number>;
  /** 昨天每项属性的小数成长，卡面显示用 */
  lastGain: Partial<Record<AbilityKey, number>>;
  /** 今天摸鱼分钟。持久化，读档后当天成长/心得不会少算 */
  slackMin: number;
  /** 日常排位/组排结果，给对局类事件和后文用 */
  scrim: ScrimState;
  salary: number;
  /** 休赛期谈过薪才有。table 照表，low / bond 锁住月薪直到下次升降级 */
  salaryDeal: null | 'table' | 'low' | 'bond';
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

export interface SeasonState {
  tier: Tier;
  /** 本赛季已经打完的轮次 */
  round: number;
  table: Record<string, { w: number; l: number }>;
  /** 这份积分榜属于第几个日历赛季 */
  calendarSeason: number;
  /** 各联赛对手累计加的实力 */
  growth: Partial<Record<Tier, number>>;
  /** 本日历赛季的升降和排名奖已经发过 */
  settled: boolean;
  /** regular 常规赛；world 休赛周里还有世界赛要打；offseason 只剩休赛安排 */
  phase: 'regular' | 'world' | 'offseason';
  report: SeasonReport | null;
}

export interface SeasonReport {
  from: Tier;
  to: Tier;
  rank: number;
  move: 'up' | 'down' | 'stay';
  world: boolean;
  prize: number;
  /** 结算弹窗点过之后才算看过 */
  acked: boolean;
}

export interface WorldGame {
  /** 0 八强，1 半决赛，2 决赛 */
  round: number;
  a: string;
  b: string;
  winner: string;
}

export interface WorldCupState {
  calendarSeason: number;
  /** 八强签位，两两一对 */
  order: string[];
  games: WorldGame[];
  done: boolean;
  champion: boolean;
}

export interface LineupSave {
  day: number;
  /** 五个位置的队员 id，顺序是上、野、中、AD、辅 */
  slots: string[];
  tactic: TacticId;
}

export interface SeriesSave {
  day: number;
  /** 正在打的局，从 1 开始 */
  game: number;
  us: number;
  them: number;
  phase: 'play' | 'gap';
  /** 已经把胜负加进 us/them 的局数 */
  accounted: number;
  /** 已经扣过疲劳的局数 */
  loaded: number;
}

export interface BroadcastSave {
  day: number;
  game: number;
  cursor: number;
  seed: number;
}

export function emptyTable(tier: Tier): Record<string, { w: number; l: number }> {
  const table: Record<string, { w: number; l: number }> = { [OUR_ID]: { w: 0, l: 0 } };
  for (const o of OPPONENTS[tier]) table[o.id] = { w: 0, l: 0 };
  return table;
}

export function emptySeason(tier: Tier = 'netcafe', calendarSeason = 1): SeasonState {
  return { tier, round: 0, table: emptyTable(tier), calendarSeason, growth: {}, settled: false, phase: 'regular', report: null };
}

export interface GameState {
  version: number;
  seed: number;
  createdAt: number;
  savedAt: number;
  clock: ClockState;
  season: SeasonState;
  /** 已经学会的战术 */
  tactics: TacticId[];
  /** 最近一次确认的首发。day 对得上才用 */
  lineup: LineupSave | null;
  /** BO3 打到一半的系列赛。网吧 BO1 通常一场就结 */
  series: SeriesSave | null;
  /** 直播放到第几条。读档接着放 */
  broadcast: BroadcastSave | null;
  /** 本赛季的世界赛。没资格是 null */
  worldCup: WorldCupState | null;
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
  /** 事件库状态（v7）。人设事件仍走 cooldowns，不用这个 */
  events: EventState;
  meta: { seasonCount: number; scores: number[]; ngPlus: number; worldChampion: boolean; endingSeen: boolean };
}

export function newMemberState(id: string): MemberState {
  const def = ROSTER.find((m) => m.id === id)!;
  return {
    id,
    ability: { ...def.ability },
    persona: { ...def.persona },
    status: { 体力: 85, 心情: 70, 专注: 65, 手感: 60, 饥饿: 30, 疲劳: 10, 压力: 20 },
    route: def.defaultRoute,
    routeGrindUntil: 0,
    routeTrait: null,
    routeTraitReady: false,
    abilityCarry: zeroAbility(),
    lastGain: {},
    slackMin: 0,
    scrim: emptyScrim(),
    salary: 1500,
    salaryDeal: null,
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
    season: emptySeason(),
    tactics: [...STARTER_TACTICS],
    lineup: null,
    series: null,
    broadcast: null,
    worldCup: null,
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
    events: emptyEvents(),
    meta: { seasonCount: 0, scores: [], ngPlus: 0, worldChampion: false, endingSeen: false },
  };
}

// 比赛日 18:30–19:00 之间、本场首发还没确认：要（重新）弹出赛前确认。读档后也按这个判断
export function needsPrematch(s: GameState, day: number, minute: number): boolean {
  return dayInfo(day).round != null && minute >= PREMATCH_MINUTE && minute < MATCH_MINUTE && s.prematchConfirmedDay !== day;
}

// 18:30 的确认窗，或者已经到 19:00 但首发还没确认（调试跳过了赛前）。读档落在窗口里会重新弹
export function needsLineupConfirm(s: GameState, day: number, minute: number): boolean {
  if (needsPrematch(s, day, minute)) return true;
  const info = dayInfo(day);
  if (info.round == null || minute < MATCH_MINUTE) return false;
  if (s.prematchConfirmedDay === day) return false;
  if (s.season.settled) return false;
  if (s.season.calendarSeason === info.season && s.season.round >= info.round) return false;
  return true;
}
