// 事件库 v1 的类型。数据由 game/scripts/build-event-library.mjs 生成。
import type { AbilityKey, PersonaKey, Position } from '../../data/roster';
import type { EventState, Relation, ScrimState, StatusKey } from '../../save/state';

export type RoleKind = 'any' | 'all' | 'fixed' | 'slacker' | 'other' | 'jungle' | 'bench' | 'sleeping' | 'early' | 'late' | 'overtime';

export interface RoleSpec {
  key: string;
  kind: RoleKind;
  id?: string;
  /** 只从这些成员里挑（exclusiveTo 事件用） */
  only?: string[];
}

export type Condition =
  | { k: 'act'; who?: string; values: string[] }
  | { k: 'time'; from: number; to: number }
  | { k: 'weekday'; op: string; v: number }
  | { k: 'present'; ids: string[] }
  | { k: 'presentCount'; op: string; v: number }
  | { k: 'stat'; who?: string; key: StatusKey; op: string; v: number }
  | { k: 'persona'; who?: string; key: PersonaKey; op: string; v: number }
  | { k: 'ability'; who?: string; key: AbilityKey; op: string; v: number }
  | { k: 'scrimResult'; who?: string; v: 'win' | 'lose' }
  | { k: 'scrimStreak'; who?: string; op: string; v: number }
  | { k: 'teamMood'; op: string; v: number }
  | { k: 'bond'; a: string; b: string; op: string; v: number }
  | { k: 'flag'; id: string; days?: number }
  | { k: 'rand'; p: number }
  | { k: 'daysToMatch'; op: string; v: number }
  | { k: 'hoursToMatch'; op: string; v: number }
  | { k: 'after'; segment: string }
  | { k: 'overtimeYesterday' }
  | { k: 'slacking'; who?: string }
  | { k: 'otherPersona'; key: PersonaKey; op: string; v: number }
  | { k: 'hasRole'; role: string };

export type Effect =
  | { k: 'status'; key: StatusKey; d: number; who: string }
  | { k: 'persona'; key: PersonaKey; d: number; who: string }
  | { k: 'ability'; key: AbilityKey; d: number; who: string }
  | { k: 'bond'; a: string; b: string; d: number }
  | { k: 'bondAll'; who: string; d: number }
  | { k: 'fame'; d: number }
  | { k: 'insight'; d: number };

export interface LibraryEvent {
  id: string;
  name: string;
  category: string;
  level: '日常' | '有趣' | '剧情' | '重大';
  weight: number;
  cooldownMin: number;
  roles: RoleSpec[];
  conditions: Condition[];
  texts: string[];
  effects: Effect[];
  chains: { id: string; pct: number }[];
  flags: string[];
}

export interface EventMember {
  id: string;
  name: string;
  position: Position;
  present: boolean;
  slacking: boolean;
  sleeping: boolean;
  early: boolean;
  late: boolean;
  bench: boolean;
  activity: string;
  ability: Record<AbilityKey, number>;
  persona: Record<PersonaKey, number>;
  status: Record<StatusKey, number>;
  scrim: ScrimState;
}

export interface EventContext {
  day: number;
  minute: number;
  segment: string;
  lastSegment: string | null;
  members: EventMember[];
  present: EventMember[];
  starters: string[];
  relations: Record<string, Relation>;
  overtimeYesterday: boolean;
  nextMatchDays: number | null;
  nextMatchHours: number | null;
  events: EventState;
  rand: () => number;
}

export interface FiredEvent {
  id: string;
  level: LibraryEvent['level'];
  text: string;
  ids: string[];
}
