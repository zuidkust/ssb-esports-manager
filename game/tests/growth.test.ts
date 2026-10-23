import { describe, expect, it } from 'vitest';
import { createNewGame, emptyEvents, type GameState } from '../src/save/state';
import { ROUTE_BY_ID, routeFit } from '../src/data/routes';
import { ABILITY_KEYS } from '../src/data/roster';
import { applyDailyGrowth, growthFor, maybeUnlockTraits, routeOf } from '../src/sim/growth';
import { makeRng } from '../src/engine/match';
import { buildOurSide } from '../src/sim/matchprep';
import { autoLineup } from '../src/sim/lineup';
import { changeRoute } from '../src/sim/offseason';
import { migrate } from '../src/save/migrate';

function setAbilities(s: GameState, value: number): void {
  for (const m of s.roster) for (const k of ABILITY_KEYS) m.ability[k] = value;
}

function quietStatus(s: GameState): void {
  for (const m of s.roster) {
    m.status.体力 = 100;
    m.status.心情 = 100;
    m.status.疲劳 = 0;
    m.status.专注 = 100;
    m.status.手感 = 0;
  }
}

describe('训练成长公式', () => {
  it('路线主/副/其他倍率：2 / 1.3 / 0.6', () => {
    const s = createNewGame(1);
    quietStatus(s);
    const m = s.roster.find((x) => x.id === 'gouliang')!;
    setAbilities(s, 50);
    const route = ROUTE_BY_ID.fight;
    const fit = routeFit(m.ability, m.persona, route);
    const g = growthFor(m, route, fit, { slackMin: 0, restDay: false, grind: false, status: m.status });
    expect(g.fight / g.lane).toBeCloseTo(2 / 0.6, 5);
    expect(g.mech / g.lane).toBeCloseTo(1.3 / 0.6, 5);
    expect(g.fight).toBeGreaterThan(g.mech);
  });

  it('适配 S/A/B、磨合、摸鱼、状态、70 瓶颈都按倍率走', () => {
    const s = createNewGame(1);
    quietStatus(s);
    const m = s.roster.find((x) => x.id === 'gouliang')!;
    setAbilities(s, 50);
    const route = ROUTE_BY_ID.fight;
    const base = growthFor(m, route, 'A', { slackMin: 0, restDay: false, grind: false, status: m.status });
    const sFit = growthFor(m, route, 'S', { slackMin: 0, restDay: false, grind: false, status: m.status });
    const bFit = growthFor(m, route, 'B', { slackMin: 0, restDay: false, grind: false, status: m.status });
    expect(sFit.fight / base.fight).toBeCloseTo(1.3, 5);
    expect(bFit.fight / base.fight).toBeCloseTo(0.7, 5);

    const grind = growthFor(m, route, 'A', { slackMin: 0, restDay: false, grind: true, status: m.status });
    expect(grind.fight / base.fight).toBeCloseTo(0.6, 5);

    const slack90 = growthFor(m, route, 'A', { slackMin: 90, restDay: false, grind: false, status: m.status });
    const slack180 = growthFor(m, route, 'A', { slackMin: 180, restDay: false, grind: false, status: m.status });
    expect(slack90.fight / base.fight).toBeCloseTo(0.6, 5);
    expect(slack180.fight / base.fight).toBeCloseTo(0.3, 5);

    m.status.体力 = 20;
    const tired = growthFor(m, route, 'A', { slackMin: 0, restDay: false, grind: false, status: m.status });
    expect(tired.fight / base.fight).toBeCloseTo(0.8, 5);

    m.status.体力 = 100;
    m.ability.fight = 90;
    const old = growthFor(m, route, 'A', { slackMin: 0, restDay: false, grind: false, status: m.status });
    expect(old.fight).toBeCloseTo(0.2 * 2 * ((100 - 90) / 30), 5);

    const rest = growthFor(m, route, 'A', { slackMin: 0, restDay: true, grind: false, status: m.status });
    expect(rest.fight).toBe(0);
  });

  it('小数进位：满 1 才加属性，封顶 99', () => {
    const s = createNewGame(2);
    quietStatus(s);
    setAbilities(s, 50);
    const m = s.roster.find((x) => x.id === 'gouliang')!;
    m.route = 'fight';
    m.ability.fight = 50;
    m.abilityCarry.fight = 0.99;
    applyDailyGrowth(s, 1, {});
    expect(m.ability.fight).toBeGreaterThanOrEqual(51);
    expect(m.ability.fight).toBeLessThanOrEqual(99);

    m.ability.fight = 99;
    m.abilityCarry.fight = 0;
    applyDailyGrowth(s, 1, {});
    expect(m.ability.fight).toBe(99);
    expect(m.abilityCarry.fight).toBe(0);
  });

  it('休息日不涨；到 70 后标记 ready', () => {
    const s = createNewGame(3);
    quietStatus(s);
    setAbilities(s, 50);
    const m = s.roster.find((x) => x.id === 'aji')!;
    m.route = 'late';
    m.ability.mental = 69;
    m.abilityCarry.mental = 0;
    s.flags.restDay = 1;
    applyDailyGrowth(s, 1, {});
    expect(m.ability.mental).toBe(69);
    expect(m.routeTraitReady).toBe(false);

    s.flags.restDay = 0;
    m.abilityCarry.mental = 0.99;
    const report = applyDailyGrowth(s, 1, {});
    expect(m.ability.mental).toBeGreaterThanOrEqual(70);
    expect(m.routeTraitReady).toBe(true);
    expect(report.aji.ready).toBe(true);
  });

  it('磨合期成长更慢，心情惩罚由 World 处理', () => {
    const s = createNewGame(4);
    quietStatus(s);
    setAbilities(s, 50);
    const m = s.roster.find((x) => x.id === 'dangdeng')!;
    m.route = 'roam';
    const fast = growthFor(m, routeOf(m)!, 'A', { slackMin: 0, restDay: false, grind: false, status: m.status });
    m.routeGrindUntil = 3;
    applyDailyGrowth(s, 1, {});
    m.routeGrindUntil = 3;
    const slow = growthFor(m, routeOf(m)!, 'A', { slackMin: 0, restDay: false, grind: true, status: m.status });
    expect(slow.roam).toBeCloseTo(fast.roam * 0.6, 5);
  });
});

describe('路线特性', () => {
  it('赛后按种子概率开窍；解锁后进 buildOurSide 的 preface', () => {
    const s = createNewGame(5);
    s.seed = 1;
    const m = s.roster.find((x) => x.id === 'aji')!;
    m.route = 'late';
    m.routeTrait = null;
    m.routeTraitReady = true;
    let unlock = null;
    for (let seed = 1; seed <= 80 && !unlock; seed++) {
      s.seed = seed;
      const got = maybeUnlockTraits(s, ['aji'], 'test');
      if (got.length) unlock = got[0];
    }
    expect(unlock).not.toBeNull();
    expect(m.routeTrait).toBe(unlock!.trait);
    expect(m.routeTraitReady).toBe(false);

    const slots = autoLineup(s.roster);
    if (!slots.includes('aji')) slots[0] = 'aji';
    const side = buildOurSide(s, slots, 1, makeRng(1).next);
    expect(side.preface.some((line) => line.includes('开窍') && line.includes(unlock!.trait))).toBe(true);
  });

  it('换路线清空特性', () => {
    const s = createNewGame(6);
    const m = s.roster.find((x) => x.id === 'gouliang')!;
    m.routeTrait = '团战收割';
    m.routeTraitReady = true;
    m.abilityCarry = { lane: 0, roam: 0, fight: 0, sense: 0, mech: 0, pool: 0, mental: 0 };
    s.insight = 200;
    s.season.phase = 'offseason';
    s.clock.day = 29;
    const r = changeRoute(s, 'gouliang', 'late');
    expect(r.ok).toBe(true);
    expect(m.routeTrait).toBeNull();
    expect(m.routeTraitReady).toBe(false);
  });
});

describe('成长与存档', () => {
  it('v6 旧档迁移到 v7：补默认路线、成长字段和事件状态', () => {
    const s = createNewGame(7);
    const raw = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    raw.version = 6;
    delete raw.events;
    for (const m of raw.roster as Record<string, unknown>[]) {
      delete m.routeTrait;
      delete m.routeTraitReady;
      delete m.abilityCarry;
      delete m.lastGain;
      delete m.slackMin;
      delete m.scrim;
      m.route = null;
    }
    const mig = migrate(raw);
    expect(mig.version).toBe(7);
    expect(mig.events).toEqual(emptyEvents());
    for (const m of mig.roster) {
      expect(m.route).toBeTruthy();
      expect(m.abilityCarry).toBeTruthy();
      expect(m.scrim).toBeTruthy();
      expect(typeof m.slackMin).toBe('number');
    }
  });
});
