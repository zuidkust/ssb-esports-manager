// 训练成长结算：每天 09:00 结算前一天；读档 / 调试跳日不补已经过去的天。
import { hashString, mulberry32 } from '../core/rng';
import {
  FIT_MULT,
  GRIND_MULT,
  GROWTH_BASE,
  ROUTE_MAIN_MULT,
  ROUTE_NONE_MULT,
  ROUTE_OTHER_MULT,
  ROUTE_SUB_MULT,
  TRAIT_READY_AT,
  TRAIT_UNLOCK_CHANCE,
  focusFactor,
  headroomFactor,
  loadFactor,
  slackFactor,
} from '../data/growth';
import { ABILITY_KEYS, ROSTER_BY_ID, type AbilityKey } from '../data/roster';
import { ROUTE_BY_ID, routeFit, type FitGrade, type RouteDef } from '../data/routes';
import type { GameState, MemberState, StatusKey } from '../save/state';

export function routeOf(member: MemberState): RouteDef | null {
  return member.route ? (ROUTE_BY_ID[member.route] ?? null) : null;
}

/** 当前路线已经解锁特性时返回路线定义，否则 null */
export function activeTraitRoute(member: MemberState): RouteDef | null {
  const route = routeOf(member);
  return route && member.routeTrait === route.trait ? route : null;
}

function routeMultiplier(route: RouteDef | null, key: AbilityKey): number {
  if (!route || !route.main) return ROUTE_NONE_MULT;
  if (key === route.main) return ROUTE_MAIN_MULT;
  if (key === route.sub) return ROUTE_SUB_MULT;
  return ROUTE_OTHER_MULT;
}

export interface GrowthInput {
  slackMin: number;
  restDay: boolean;
  grind: boolean;
  status: Record<StatusKey, number>;
}

/** 一天、一个人、7 项属性的小数成长（还没进位） */
export function growthFor(
  member: MemberState,
  route: RouteDef | null,
  fit: FitGrade,
  input: GrowthInput,
): Record<AbilityKey, number> {
  const out = {} as Record<AbilityKey, number>;
  if (input.restDay) {
    for (const k of ABILITY_KEYS) out[k] = 0;
    return out;
  }
  const focus = focusFactor(input.status.专注, input.status.手感);
  const slack = slackFactor(input.slackMin);
  const load = loadFactor(input.status.体力, input.status.心情, input.status.疲劳);
  const grind = input.grind ? GRIND_MULT : 1;
  for (const k of ABILITY_KEYS) {
    const headroom = headroomFactor(member.ability[k]);
    out[k] =
      GROWTH_BASE *
      routeMultiplier(route, k) *
      FIT_MULT[fit] *
      focus *
      headroom *
      slack *
      load *
      grind;
  }
  return out;
}

export interface GrowthReport {
  gains: Partial<Record<AbilityKey, number>>;
  ready: boolean;
}

/**
 * 结算 day 这一天（前一天）的成长。调用方在 World.startDay 里、overnight 之前调用，
 * 这样用的是前一天结束时的状态和摸鱼分钟。
 */
export function applyDailyGrowth(
  state: GameState,
  day: number,
  slackById: Record<string, number> = {},
): Record<string, GrowthReport> {
  const restDay = state.flags.restDay === day;
  const reports: Record<string, GrowthReport> = {};
  for (const member of state.roster) {
    const route = routeOf(member);
    const fit: FitGrade = route ? routeFit(member.ability, member.persona, route) : 'A';
    const gains = growthFor(member, route, fit, {
      slackMin: slackById[member.id] ?? member.slackMin ?? 0,
      restDay,
      grind: member.routeGrindUntil >= day,
      status: member.status,
    });
    const shown: Partial<Record<AbilityKey, number>> = {};
    for (const k of ABILITY_KEYS) {
      const gain = gains[k] ?? 0;
      if (gain <= 0) continue;
      shown[k] = gain;
      if (member.ability[k] >= 99) {
        member.abilityCarry[k] = 0;
        continue;
      }
      let carry = (member.abilityCarry[k] ?? 0) + gain;
      const inc = Math.floor(carry);
      carry -= inc;
      if (inc > 0) {
        member.ability[k] = Math.min(99, member.ability[k] + inc);
        if (member.ability[k] >= 99) carry = 0;
      }
      member.abilityCarry[k] = carry;
    }
    member.lastGain = shown;

    let ready = false;
    if (route?.main && !member.routeTrait && !member.routeTraitReady && member.ability[route.main] >= TRAIT_READY_AT) {
      member.routeTraitReady = true;
      ready = true;
    }
    reports[member.id] = { gains: shown, ready };
  }
  return reports;
}

export interface TraitUnlock {
  id: string;
  trait: string;
  routeId: string;
  routeName: string;
}

/** 赛后开窍：首发、主属性已到 70、还没解锁的人，每场 30% 概率。 */
export function maybeUnlockTraits(state: GameState, slots: readonly string[], seedKey: string): TraitUnlock[] {
  const out: TraitUnlock[] = [];
  for (const id of slots) {
    const member = state.roster.find((m) => m.id === id);
    if (!member || !member.routeTraitReady || member.routeTrait) continue;
    const route = routeOf(member);
    if (!route) continue;
    const rng = mulberry32(hashString([state.seed, 'trait', seedKey, id].join('|')));
    if (rng() >= TRAIT_UNLOCK_CHANCE) continue;
    member.routeTrait = route.trait;
    member.routeTraitReady = false;
    out.push({ id, trait: route.trait, routeId: route.id, routeName: route.name });
  }
  return out;
}

export function traitUnlockText(u: TraitUnlock): string {
  const name = ROSTER_BY_ID[u.id]?.name ?? u.id;
  return `开窍：${name} 把「${u.routeName}」练成了「${u.trait}」。`;
}
