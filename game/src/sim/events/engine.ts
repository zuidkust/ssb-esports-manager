// 事件库引擎：角色绑定 → 条件 → 权重抽取 → 效果 → 冷却 / flag / chain。
// 事件库只做日常内容；比赛日、监督、天意不在这个引擎里。
import { dayInfo } from '../../core/calendar';
import { pick, weightedPick } from '../../core/rng';
import { pairKey } from '../../data/roster';
import type { GameState } from '../../save/state';
import { addBond, addKnot } from '../relations';
import { LIBRARY_EVENTS } from './library';
import type { Condition, Effect, EventContext, EventMember, FiredEvent, LibraryEvent, RoleSpec } from './types';

type Bindings = Record<string, string[]>;

function cmp(op: string, a: number, b: number): boolean {
  switch (op) {
    case '<':
      return a < b;
    case '>':
      return a > b;
    case '<=':
      return a <= b;
    case '>=':
      return a >= b;
    case '=':
      return a === b;
    default:
      return false;
  }
}

function pickOne(ctx: EventContext, pool: EventMember[]): EventMember | null {
  return pool.length ? pick(ctx.rand, pool) : null;
}

function bindRoles(ctx: EventContext, roles: readonly RoleSpec[]): Bindings | null {
  const bindings: Bindings = {};
  const used = new Set<string>();

  // 先绑定固定成员和全员，避免随机角色把人抢走
  for (const r of roles) {
    if (r.kind === 'all') {
      bindings[r.key] = ctx.present.map((m) => m.id);
      continue;
    }
    if (r.kind !== 'fixed') continue;
    if (!r.id || !ctx.present.some((m) => m.id === r.id)) return null;
    bindings[r.key] = [r.id];
    used.add(r.id);
  }

  for (const r of roles) {
    if (r.kind === 'all' || r.kind === 'fixed') continue;
    const pool = ctx.present.filter((m) => !used.has(m.id) && (!r.only || r.only.includes(m.id)));
    let hit: EventMember | null = null;
    switch (r.kind) {
      case 'slacker':
        hit = pool.find((m) => m.slacking) ?? null;
        break;
      case 'sleeping':
        hit = pool.find((m) => m.sleeping) ?? null;
        break;
      case 'early':
        hit = pool.find((m) => m.early) ?? null;
        break;
      case 'late':
        hit = pool.find((m) => m.late) ?? null;
        break;
      case 'jungle':
        hit = pool.find((m) => m.position === 'jungle') ?? null;
        break;
      case 'bench':
        hit = ctx.members.find((m) => m.bench && m.present && !used.has(m.id) && (!r.only || r.only.includes(m.id))) ?? null;
        break;
      case 'overtime':
        hit = ctx.overtimeYesterday ? pickOne(ctx, pool) : null;
        break;
      case 'any':
      case 'other':
        hit = pickOne(ctx, pool);
        break;
    }
    if (!hit) return null;
    bindings[r.key] = [hit.id];
    used.add(hit.id);
  }
  return bindings;
}

function memberOf(ctx: EventContext, id: string): EventMember | undefined {
  return ctx.members.find((m) => m.id === id);
}

function subjectIds(ctx: EventContext, b: Bindings, who = '主角'): string[] {
  if (b[who]) return b[who];
  if (who === 'all') return ctx.present.map((m) => m.id);
  if (ctx.members.some((m) => m.id === who)) return [who];
  // 全员事件没有具体主角时，用第一个在场的人做条件主体
  if (who === '主角' && ctx.present.length) return [ctx.present[0].id];
  return [];
}

function subject(ctx: EventContext, b: Bindings, who = '主角'): EventMember | undefined {
  const id = subjectIds(ctx, b, who)[0];
  return id ? memberOf(ctx, id) : undefined;
}

function relationBond(ctx: EventContext, a: string, b: string): number {
  const key = pairKey(a, b);
  return ctx.relations[key]?.bond ?? 30;
}

function check(c: Condition, ctx: EventContext, b: Bindings): boolean {
  switch (c.k) {
    case 'act': {
      const ids = subjectIds(ctx, b, c.who);
      return ids.some((id) => c.values.includes(memberOf(ctx, id)?.activity ?? ''));
    }
    case 'slacking': {
      const m = subject(ctx, b, c.who);
      return !!m?.slacking;
    }
    case 'time':
      return ctx.minute >= c.from && ctx.minute <= c.to;
    case 'weekday':
      return cmp(c.op, dayInfo(ctx.day).weekday, c.v);
    case 'present':
      return c.ids.every((id) => ctx.present.some((m) => m.id === id));
    case 'presentCount':
      return cmp(c.op, ctx.present.length, c.v);
    case 'stat': {
      const m = subject(ctx, b, c.who);
      return !!m && cmp(c.op, m.status[c.key], c.v);
    }
    case 'persona': {
      const m = subject(ctx, b, c.who);
      return !!m && cmp(c.op, m.persona[c.key], c.v);
    }
    case 'ability': {
      const m = subject(ctx, b, c.who);
      return !!m && cmp(c.op, m.ability[c.key], c.v);
    }
    case 'scrimResult': {
      const m = subject(ctx, b, c.who);
      return !!m && m.scrim.last === c.v;
    }
    case 'scrimStreak': {
      const m = subject(ctx, b, c.who);
      return !!m && cmp(c.op, m.scrim.streak, c.v);
    }
    case 'teamMood': {
      if (!ctx.present.length) return false;
      const mood = ctx.present.reduce((n, m) => n + m.status.心情, 0) / ctx.present.length;
      return cmp(c.op, mood, c.v);
    }
    case 'bond': {
      const a = subjectIds(ctx, b, c.a)[0];
      const other = subjectIds(ctx, b, c.b)[0];
      if (!a || !other || a === other) return false;
      return cmp(c.op, relationBond(ctx, a, other), c.v);
    }
    case 'flag': {
      const at = ctx.events.lastFiredDay[c.id];
      return at != null && at >= ctx.day - (c.days ?? 3);
    }
    case 'rand':
      return ctx.rand() < c.p;
    case 'daysToMatch':
      return ctx.nextMatchDays != null && cmp(c.op, ctx.nextMatchDays, c.v);
    case 'hoursToMatch':
      return ctx.nextMatchHours != null && cmp(c.op, ctx.nextMatchHours, c.v);
    case 'after':
      return ctx.lastSegment === c.segment;
    case 'overtimeYesterday':
      return ctx.overtimeYesterday;
    case 'otherPersona':
      return ctx.present.some((m) => cmp(c.op, m.persona[c.key], c.v));
    case 'hasRole':
      return ctx.present.some((m) => m.position === c.role);
    default:
      return false;
  }
}

function targets(ctx: EventContext, b: Bindings, who: string): string[] {
  if (who === 'all') return ctx.present.map((m) => m.id);
  if (b[who]) return b[who];
  if (ctx.members.some((m) => m.id === who)) return [who];
  return [];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function applyBond(state: GameState, ctx: EventContext, a: string, b: string, d: number, cause: string): void {
  if (a === b || d === 0) return;
  if (d > 0) addBond(state, a, b, d);
  else addKnot(state, a, b, cause, ctx.day);
}

function applyEffects(state: GameState, ctx: EventContext, b: Bindings, ev: LibraryEvent): void {
  for (const eff of ev.effects as Effect[]) {
    if (eff.k === 'status' || eff.k === 'persona' || eff.k === 'ability') {
      for (const id of targets(ctx, b, eff.who)) {
        const m = state.roster.find((x) => x.id === id);
        if (!m) continue;
        if (eff.k === 'status') m.status[eff.key] = clamp(m.status[eff.key] + eff.d, 0, 100);
        else if (eff.k === 'persona') m.persona[eff.key] = clamp(m.persona[eff.key] + eff.d, 0, 100);
        else m.ability[eff.key] = clamp(m.ability[eff.key] + eff.d, 18, 99);
      }
      continue;
    }
    if (eff.k === 'bond') {
      const as = targets(ctx, b, eff.a);
      const bs = targets(ctx, b, eff.b);
      for (const a of as) for (const other of bs) applyBond(state, ctx, a, other, eff.d, ev.name);
      continue;
    }
    if (eff.k === 'bondAll') {
      if (eff.who === 'all') {
        const all = ctx.present.map((m) => m.id);
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) applyBond(state, ctx, all[i], all[j], eff.d, ev.name);
        }
      } else {
        for (const id of targets(ctx, b, eff.who)) {
          for (const other of ctx.present) if (other.id !== id) applyBond(state, ctx, id, other.id, eff.d, ev.name);
        }
      }
      continue;
    }
    if (eff.k === 'fame') {
      state.record.fame = Math.max(0, state.record.fame + eff.d);
      continue;
    }
    if (eff.k === 'insight') {
      state.insight = Math.max(0, state.insight + eff.d);
    }
  }
}

function formatText(template: string, ctx: EventContext, b: Bindings): string {
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const ids = b[key] ?? [];
    const names = ids.map((id) => memberOf(ctx, id)?.name ?? id);
    return names.length ? names.join('、') : key;
  });
}

interface Candidate {
  ev: LibraryEvent;
  bindings: Bindings;
  weight: number;
}

/** 在 World.personaTick 里、人设事件没抽到时调用。返回 null 表示这一块没有库事件。 */
export function tryLibraryEvent(
  state: GameState,
  ctx: EventContext,
  events: readonly LibraryEvent[] = LIBRARY_EVENTS,
): FiredEvent | null {
  const abs = ctx.day * 1440 + ctx.minute;
  const pool: Candidate[] = [];
  for (const ev of events) {
    const until = ctx.events.cooldownUntil[ev.id];
    if (until != null && until > abs) continue;
    const bindings = bindRoles(ctx, ev.roles);
    if (!bindings) continue;
    if (!ev.conditions.every((c) => check(c, ctx, bindings))) continue;
    let weight = ev.weight;
    const boost = ctx.events.boosts[ev.id];
    if (boost && boost.until >= abs) weight *= 1 + boost.pct / 100;
    pool.push({ ev, bindings, weight });
  }
  if (!pool.length) return null;
  const picked = weightedPick(ctx.rand, pool, (c) => c.weight);
  if (!picked) return null;

  const { ev, bindings } = picked;
  const text = formatText(pick(ctx.rand, ev.texts), ctx, bindings);
  const ids = [...new Set(Object.values(bindings).flat())];
  applyEffects(state, ctx, bindings, ev);

  ctx.events.cooldownUntil[ev.id] = abs + Math.max(30, ev.cooldownMin);
  ctx.events.lastFiredDay[ev.id] = ctx.day;
  ctx.events.flags[ev.id] = ctx.day;
  for (const ch of ev.chains) {
    const prev = ctx.events.boosts[ch.id];
    ctx.events.boosts[ch.id] = { pct: Math.max(prev?.pct ?? 0, ch.pct), until: abs + 1440 };
  }
  for (const [id, boost] of Object.entries(ctx.events.boosts)) {
    if (boost.until < abs) delete ctx.events.boosts[id];
  }
  return { id: ev.id, level: ev.level, text, ids };
}
