// 存档数据结构（设计文档第 12 章）。M1 只真正用到时间、成员状态和日常动态，其余字段先按设计预留
import type { ClockState } from '../core/clock';
import { DAY_START } from '../core/clock';
import type { Tier } from '../data/leagues';
import { ROSTER, INITIAL_BOND, type AbilityKey, type PersonaKey } from '../data/roster';

export const SAVE_VERSION = 1;

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
  venueLevel: number;
  rosterCap: number;
  roster: MemberState[];
  relations: Record<string, Relation>; // 键：pairKey(a, b)
  cooldowns: Record<string, number>;
  actionHistory: { action: string; target?: string; day: number }[];
  actionPoints: number;
  eventLog: LogEntry[];
  nextLogId: number;
  sponsors: string[];
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
    cash: 5000,
    insight: 0,
    privateStash: 20000,
    unpaidMonths: 0,
    venueLevel: 0,
    rosterCap: 6,
    roster: ROSTER.map((m) => newMemberState(m.id)),
    relations,
    cooldowns: {},
    actionHistory: [],
    actionPoints: 3,
    eventLog: [],
    nextLogId: 1,
    sponsors: [],
    meta: { seasonCount: 0, scores: [], ngPlus: 0, worldChampion: false },
  };
}
