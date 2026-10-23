// 平衡台：真实跑 World + 联赛，统计成长、现金、心得、特性和名次。
// 用法：npx vite-node --script scripts/balance.ts
import { dayInfo, MATCH_MINUTE, SEASON_DAYS } from '../src/core/calendar';
import { DAY_END, DAY_START } from '../src/core/clock';
import { ROUTE_BY_ID, type RouteDef } from '../src/data/routes';
import { createNewGame, emptySeason, type GameState } from '../src/save/state';
import { World } from '../src/sim/world';
import { autoLineup } from '../src/sim/lineup';
import { commitRound, playHiddenSeries } from '../src/sim/league';
import { autoFinishWorldCup } from '../src/sim/worldcup';
import { breakOpen, moveVenue } from '../src/sim/offseason';
import { SPONSORS } from '../src/data/sponsors';
import { signSponsor } from '../src/sim/economy';
import type { TacticId } from '../src/data/tactics';

const SEEDS = 20;
const SEASONS = 3;

interface Row {
  seed: number;
  season: number;
  tier: string;
  wins: number;
  losses: number;
  rank: number;
  cash: number;
  insight: number;
  traits: number;
  mainGain: number;
  subGain: number;
  otherGain: number;
  bankrupt: boolean;
  venue: number;
}

function routeOf(state: GameState, id: string): RouteDef | null {
  const m = state.roster.find((x) => x.id === id);
  return m?.route ? (ROUTE_BY_ID[m.route] ?? null) : null;
}

function growthSnapshot(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of state.roster) for (const k of Object.keys(m.ability)) out[`${m.id}:${k}`] = m.ability[k as keyof typeof m.ability];
  return out;
}

function gains(state: GameState, before: Record<string, number>): { main: number; sub: number; other: number } {
  let main = 0, sub = 0, other = 0, nMain = 0, nSub = 0, nOther = 0;
  for (const m of state.roster) {
    const route = routeOf(state, m.id);
    for (const k of Object.keys(m.ability) as (keyof typeof m.ability)[]) {
      const d = m.ability[k] - (before[`${m.id}:${k}`] ?? 0);
      if (!route?.main) {
        other += d;
        nOther++;
      } else if (k === route.main) {
        main += d;
        nMain++;
      } else if (k === route.sub) {
        sub += d;
        nSub++;
      } else {
        other += d;
        nOther++;
      }
    }
  }
  return {
    main: nMain ? main / nMain : 0,
    sub: nSub ? sub / nSub : 0,
    other: nOther ? other / nOther : 0,
  };
}

function autoMove(state: GameState): void {
  if (!breakOpen(state)) return;
  const target = state.season.tier === 'national' ? 2 : state.season.tier === 'city' ? 1 : 0;
  while (state.venueLevel < target) {
    const r = moveVenue(state, state.venueLevel + 1);
    if (!r.ok) break;
  }
}

function autoSponsors(state: GameState): void {
  for (const sp of SPONSORS) {
    if (state.sponsors.length >= 2) break;
    signSponsor(state, sp.id);
  }
}

function runSeason(state: GameState, world: World, startDay: number): void {
  const endDay = startDay + SEASON_DAYS - 1;
  for (let day = startDay; day <= endDay; day++) {
    state.clock.day = day;
    for (let t = DAY_START; t < DAY_END; t++) {
      state.clock.minute = t;
      world.update(t, 1, false);
      const info = dayInfo(day);
      if (info.round != null && t === MATCH_MINUTE && !state.season.settled) {
        const slots = autoLineup(state.roster);
        const tactic = (state.tactics[0] ?? 'engage') as TacticId;
        const won = playHiddenSeries(state, info.round, slots, tactic);
        commitRound(state, info.round, won, slots);
        autoSponsors(state);
      }
    }
  }
}

const rows: Row[] = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const state = createNewGame(seed);
  autoSponsors(state);
  const world = new World(state);
  for (let season = 1; season <= SEASONS; season++) {
    const startDay = (season - 1) * SEASON_DAYS + 1;
    const before = growthSnapshot(state);
    const wins0 = state.record.wins;
    const losses0 = state.record.losses;
    const tier0 = state.season.tier;

    runSeason(state, world, startDay);

    if (state.worldCup && !state.worldCup.done) autoFinishWorldCup(state);
    autoMove(state);
    const g = gains(state, before);
    rows.push({
      seed,
      season,
      tier: tier0,
      wins: state.record.wins - wins0,
      losses: state.record.losses - losses0,
      rank: state.season.report?.rank ?? 0,
      cash: state.cash,
      insight: state.insight,
      traits: state.roster.filter((m) => m.routeTrait).length,
      mainGain: g.main,
      subGain: g.sub,
      otherGain: g.other,
      bankrupt: state.bankrupt,
      venue: state.venueLevel,
    });
  }
}

function avg(rows: Row[], pick: (r: Row) => number): number {
  return rows.length ? rows.reduce((n, r) => n + pick(r), 0) / rows.length : 0;
}

console.log('seed season tier      W-L   rank  cash      insight traits main+ sub+ other+ bankrupt venue');
for (const r of rows) {
  console.log(
    `${String(r.seed).padStart(4)} ${String(r.season).padStart(6)} ${r.tier.padEnd(9)} ${String(r.wins).padStart(2)}-${String(r.losses).padEnd(2)} ${String(r.rank).padStart(4)} ${String(Math.round(r.cash)).padStart(9)} ${String(Math.round(r.insight)).padStart(7)} ${String(r.traits).padStart(6)} ${r.mainGain.toFixed(1).padStart(5)} ${r.subGain.toFixed(1).padStart(4)} ${r.otherGain.toFixed(1).padStart(5)} ${r.bankrupt ? 'yes' : 'no '} ${r.venue}`,
  );
}
for (const season of [1, 2, 3]) {
  const subset = rows.filter((r) => r.season === season);
  console.log(
    `S${season} avg: ${avg(subset, (r) => r.wins).toFixed(2)}W ${avg(subset, (r) => r.losses).toFixed(2)}L ` +
      `rank ${avg(subset, (r) => r.rank).toFixed(2)} cash ${Math.round(avg(subset, (r) => r.cash))} ` +
      `insight ${Math.round(avg(subset, (r) => r.insight))} traits ${avg(subset, (r) => r.traits).toFixed(2)} ` +
      `main+${avg(subset, (r) => r.mainGain).toFixed(1)} sub+${avg(subset, (r) => r.subGain).toFixed(1)} ` +
      `other+${avg(subset, (r) => r.otherGain).toFixed(1)} bankrupt ${subset.filter((r) => r.bankrupt).length}`,
  );
}
for (const tier of ['netcafe', 'city', 'national']) {
  const subset = rows.filter((r) => r.tier === tier);
  if (!subset.length) continue;
  console.log(
    `${tier.padEnd(9)} n=${subset.length} ${avg(subset, (r) => r.wins).toFixed(2)}W ${avg(subset, (r) => r.losses).toFixed(2)}L ` +
      `rank ${avg(subset, (r) => r.rank).toFixed(2)} cash ${Math.round(avg(subset, (r) => r.cash))} ` +
      `main+${avg(subset, (r) => r.mainGain).toFixed(1)} sub+${avg(subset, (r) => r.subGain).toFixed(1)}`,
  );
}

// 主流程里城市前 2 才升国内，样本可能不足。这里固定跑 6 个种子：
// 网吧 1 季 + 城市 1 季，然后把第 3 季强制成国内，专门看 national 难度。
const probes: string[] = [];
for (let seed = 1; seed <= 6; seed++) {
  const state = createNewGame(seed);
  autoSponsors(state);
  const world = new World(state);
  runSeason(state, world, 1);
  runSeason(state, world, SEASON_DAYS + 1);
  state.season = emptySeason('national', 3);
  state.clock.day = 2 * SEASON_DAYS + 1;
  world.reset(state);
  runSeason(state, world, 2 * SEASON_DAYS + 1);
  const row = state.season.table.ssb ?? { w: 0, l: 0 };
  probes.push(`seed ${seed}: ${row.w}W ${row.l}L rank ${state.season.report?.rank ?? '?'} cash ${Math.round(state.cash)}`);
}
console.log('--- national probe (2 seasons growth, forced national) ---');
for (const line of probes) console.log(line);
