import { describe, expect, it } from 'vitest';
import { dayInfo } from '../src/core/calendar';
import { MOVE_FEE } from '../src/data/economy';
import { venueLook, venueScene } from '../src/data/facilities';
import { WORLD_TEAMS } from '../src/data/world';
import { actionPointMax } from '../src/data/economy';
import { createNewGame, SAVE_VERSION } from '../src/save/state';
import { migrate } from '../src/save/migrate';
import { monthlySalaryTotal } from '../src/sim/economy';
import { finishSeason } from '../src/sim/league';
import { changeRoute, moveVenue, recruitMember, talkSalary } from '../src/sim/offseason';
import {
  commitWorldRound,
  createWorldCup,
  isMatchDay,
  playerWorldPending,
  worldRoundOnDay,
} from '../src/sim/worldcup';
import { autoLineup } from '../src/sim/lineup';

function nationalChamp() {
  const s = createNewGame(4);
  s.season.tier = 'national';
  s.season.round = 14;
  s.season.table = {
    ssb: { w: 12, l: 2 },
    jdd: { w: 11, l: 3 }, blb: { w: 9, l: 5 }, tea: { w: 8, l: 6 },
    wbc: { w: 6, l: 8 }, egg: { w: 5, l: 9 }, lmg: { w: 4, l: 10 }, iq: { w: 1, l: 13 },
  };
  return s;
}

describe('世界赛', () => {
  it('国内前 2 生成 8 队对阵，休赛周第 1、3、5 天开打', () => {
    const s = nationalChamp();
    finishSeason(s);
    expect(s.record.worldQualified).toBe(true);
    expect(s.season.phase).toBe('world');
    expect(s.worldCup).not.toBeNull();
    const order = s.worldCup!.order;
    expect(new Set(order).size).toBe(8);
    expect(order).toContain('ssb');
    expect(order).toContain('jdd');
    for (const team of WORLD_TEAMS) expect(order).toContain(team.id);
    expect(worldRoundOnDay(29)).toBe(0);
    expect(worldRoundOnDay(31)).toBe(1);
    expect(worldRoundOnDay(33)).toBe(2);
    expect(worldRoundOnDay(30)).toBeNull();
    s.clock.day = 29;
    expect(playerWorldPending(s, 29)).toBe(true);
    expect(playerWorldPending(s, 30)).toBe(false);
  });

  it('赢下八强拿晋级奖金和四强，连赢三轮是冠军且可续玩', () => {
    const s = nationalChamp();
    finishSeason(s);
    const slots = autoLineup(s.roster);
    s.clock.day = 29;
    const cash = s.cash;
    const qf = commitWorldRound(s, 0, true, slots);
    expect(qf.join('\n')).toMatch(/八强/);
    expect(s.cash - cash).toBe(50_000);
    expect(s.record.worldTop4).toBe(true);
    expect(isMatchDay(s, 29)).toBe(true);
    expect(isMatchDay(s, 30)).toBe(false);
    expect(s.worldCup!.done).toBe(false);
    expect(playerWorldPending(s, 31)).toBe(true);

    commitWorldRound(s, 1, true, slots);
    commitWorldRound(s, 2, true, slots);
    expect(s.worldCup!.champion).toBe(true);
    expect(s.worldCup!.done).toBe(true);
    expect(s.meta.worldChampion).toBe(true);
    expect(s.meta.endingSeen).toBe(false);
    expect(s.season.phase).toBe('offseason');
    expect(s.cash - cash).toBe(50_000 + 50_000 + 500_000);
    expect(s.season.tier).toBe('national');
  });

  it('八强出局后把后面的轮次算完，不是冠军', () => {
    const s = nationalChamp();
    finishSeason(s);
    const logs = commitWorldRound(s, 0, false, autoLineup(s.roster));
    expect(s.worldCup!.done).toBe(true);
    expect(s.worldCup!.champion).toBe(false);
    expect(s.meta.worldChampion).toBe(false);
    expect(logs.join('\n')).toMatch(/输给/);
    expect(s.worldCup!.games.filter((g) => g.round === 2)).toHaveLength(1);
  });

  it('对阵签位固定，同一存档种子得到同一张表', () => {
    const a = nationalChamp();
    const b = nationalChamp();
    finishSeason(a);
    finishSeason(b);
    expect(a.worldCup!.order).toEqual(b.worldCup!.order);
    expect(createWorldCup(a, 'blb').order).toContain('blb');
  });
});

describe('休赛期搬家和路线', () => {
  it('常规赛不能搬；升上城市联赛后付得起就能搬进小办公室，行动点跟着涨', () => {
    const s = createNewGame(1);
    s.clock.day = 3;
    expect(moveVenue(s, 1).ok).toBe(false);
    s.season.tier = 'city';
    s.season.phase = 'offseason';
    s.clock.day = 29;
    s.apDay = 29;
    s.actionPoints = 3;
    expect(moveVenue(s, 1).reason).toMatch(/现金不够/);
    s.cash = 40_000;
    const moved = moveVenue(s, 1);
    expect(moved.ok).toBe(true);
    expect(s.venueLevel).toBe(1);
    expect(s.cash).toBe(40_000 - MOVE_FEE[1]);
    expect(venueScene(s.venueLevel)).toBe('office');
    expect(s.actionPoints).toBe(actionPointMax(1, false));
    expect(dayInfo(29).offseason).toBe(true);
  });

  it('退租返还 40%，电竞基地和豪华基地要对应资格', () => {
    const s = createNewGame(2);
    s.season.phase = 'offseason';
    s.season.tier = 'national';
    s.record.worldQualified = true;
    s.venueLevel = 1;
    s.cash = 0;
    const back = moveVenue(s, 0);
    expect(back.ok).toBe(true);
    expect(s.cash).toBe(Math.round(MOVE_FEE[1] * 0.4));
    expect(venueScene(0)).toBe('netcafe');
    expect(venueLook(1)).toBe('office');
    expect(venueLook(2)).toBe('base');
    expect(venueLook(3)).toBe('luxury');
    s.venueLevel = 0;
    s.season.tier = 'netcafe';
    expect(moveVenue(s, 1).reason).toMatch(/城市联赛/);
  });

  it('换路线花 150 心得；招人是 DLC；升级后可以谈薪', () => {
    const s = createNewGame(3);
    s.season.phase = 'offseason';
    s.clock.day = 29;
    expect(recruitMember().ok).toBe(false);
    expect(changeRoute(s, 'aji', 'lane').reason).toMatch(/心得/);
    s.insight = 150;
    const changed = changeRoute(s, 'aji', 'lane');
    expect(changed.ok).toBe(true);
    expect(s.insight).toBe(0);
    expect(s.roster.find((m) => m.id === 'aji')!.route).toBe('lane');
    expect(s.roster.find((m) => m.id === 'aji')!.routeGrindUntil).toBe(31);

    s.season.tier = 'city';
    s.season.report = { from: 'netcafe', to: 'city', rank: 1, move: 'up', world: false, prize: 5000, acked: true };
    const low = talkSalary(s, 'gouliang', 'low');
    expect(low.ok).toBe(true);
    expect(s.roster.find((m) => m.id === 'gouliang')!.salary).toBe(2250);
    expect(talkSalary(s, 'gouliang', 'table').ok).toBe(false);
    s.relations['aji|dangdeng'].bond = 70;
    const bond = talkSalary(s, 'aji', 'bond');
    expect(bond.ok).toBe(true);
    expect(s.roster.find((m) => m.id === 'aji')!.salary).toBe(1500);
    expect(monthlySalaryTotal(s)).toBe(1500 + 2250 + 3000 * 4);
  });
});

describe('旧存档', () => {
  it('v5 没有世界赛字段也能读，现金和队员还在', () => {
    const raw = createNewGame(9) as unknown as Record<string, unknown>;
    raw.version = 5;
    raw.cash = 7777;
    delete raw.worldCup;
    const season = raw.season as Record<string, unknown>;
    delete season.phase;
    delete season.report;
    for (const m of raw.roster as Record<string, unknown>[]) {
      delete m.salaryDeal;
      delete m.routeGrindUntil;
    }
    const meta = raw.meta as Record<string, unknown>;
    delete meta.endingSeen;
    const s = migrate(JSON.parse(JSON.stringify(raw)));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.cash).toBe(7777);
    expect(s.roster).toHaveLength(6);
    expect(s.worldCup).toBeNull();
    expect(s.season.phase).toBe('regular');
    expect(s.roster[0].salaryDeal).toBeNull();
    expect(s.meta.endingSeen).toBe(false);
  });

  it('已经停在国内赛季末、有资格的旧档会补上世界赛', () => {
    const raw = nationalChamp() as unknown as Record<string, unknown>;
    raw.version = 5;
    delete raw.worldCup;
    const season = raw.season as { settled: boolean; phase?: string; report?: unknown };
    season.settled = true;
    delete season.phase;
    delete season.report;
    const record = raw.record as { worldQualified: boolean };
    record.worldQualified = true;
    const clock = raw.clock as { day: number };
    clock.day = 30;
    const s = migrate(JSON.parse(JSON.stringify(raw)));
    expect(s.worldCup?.order).toHaveLength(8);
    expect(s.season.phase).toBe('world');
    expect(s.cash).toBe(5000);
  });
});
