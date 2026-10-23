// 日常单排 / 双排 / 组排结果。只给事件看板和对局类条件用，不进联赛积分。
// 每 35 分钟结算一局；组排五个人共享同一局结果，单排/双排各算各的。
import { seeded } from '../core/rng';
import { ABILITY_KEYS } from '../data/roster';
import type { MemberState } from '../save/state';

export const SCRIM_MINUTES = 35;

export interface ScrimMember {
  id: string;
  playing: boolean;
  present: boolean;
  activity: { kind: string; bench?: boolean };
  state: MemberState;
}

function meanAbility(state: MemberState): number {
  let n = 0;
  for (const k of ABILITY_KEYS) n += state.ability[k];
  return n / ABILITY_KEYS.length;
}

function winChance(mean: number): number {
  return Math.max(0.35, Math.min(0.65, 0.5 + (mean - 50) * 0.006));
}

function applyResult(member: ScrimMember, win: boolean, minute: number, block: number): void {
  const sc = member.state.scrim;
  if (win) {
    sc.wins += 1;
    sc.streak = sc.streak >= 0 ? sc.streak + 1 : 1;
  } else {
    sc.losses += 1;
    sc.streak = sc.streak <= 0 ? sc.streak - 1 : -1;
  }
  sc.last = win ? 'win' : 'lose';
  sc.lastMinute = minute;
  sc.block = block;
}

/** 在 World.update 里按游戏分钟调用。jumped（读档/跳时间）不结算。 */
export function updateScrims(
  state: { seed: number; clock: { day: number } },
  members: readonly ScrimMember[],
  minute: number,
): void {
  const block = Math.floor(minute / SCRIM_MINUTES);
  const day = state.clock.day;
  const playing = members.filter((m) => m.present && m.playing && !m.activity.bench && m.activity.kind !== 'match');

  const team = playing.filter((m) => m.activity.kind === 'team');
  if (team.length >= 2 && team.some((m) => m.state.scrim.block !== block)) {
    const rand = seeded(state.seed, 'scrim', day, 'team', block);
    const mean = team.reduce((n, m) => n + meanAbility(m.state), 0) / team.length;
    const win = rand() < winChance(mean);
    for (const m of team) applyResult(m, win, minute, block);
  }

  for (const m of playing) {
    if (m.activity.kind === 'team') continue;
    if (m.state.scrim.block === block) continue;
    const rand = seeded(state.seed, 'scrim', day, m.id, block);
    applyResult(m, rand() < winChance(meanAbility(m.state)), minute, block);
  }
}

/** 事件条件用：这个人的最近一局结果；还没打过就是 null。 */
export function lastScrim(member: MemberState | undefined): 'win' | 'lose' | null {
  return member?.scrim.last ?? null;
}
