import { describe, expect, it } from 'vitest';
import { applyJump, armWorldCup, clearCooldowns, crownWorld, forceTakeout, jumpToNextMatch, jumpToNextPayday, jumpToNextTakeout, jumpToOffseason, jumpToSeasonEnd, nextEventAt, nextMatchAt, nextPaydayDay, prematchOnTheWay, setActionPoints, setCash, setSeasonRank } from '../src/debug/god';
import { PREMATCH_MINUTE } from '../src/core/calendar';
import { GameClock } from '../src/core/clock';
import { createNewGame } from '../src/save/state';
import { autoLineup } from '../src/sim/lineup';
import { syncSeasonEndHold } from '../src/sim/league';
import { commitWorldRound, needsWorldPrematch } from '../src/sim/worldcup';
import { courierTrack } from '../src/sim/takeout';
import { World } from '../src/sim/world';

function boot(seed: number, day = 1, minute = 9 * 60) {
  const s = createNewGame(seed);
  s.clock.day = day;
  s.clock.minute = minute;
  const w = new World(s);
  const c = new GameClock(s.clock);
  w.update(minute, 0, true);
  return { s, w, c };
}

function picture(w: World) {
  const orders = (w.state.meals.lunch?.orders ?? []).map((o) => `${o.memberId}:${o.dishId}`).sort();
  return {
    day: w.state.clock.day,
    minute: w.state.clock.minute,
    planDay: w.planDay,
    mealsDay: w.state.meals.day,
    plans: w.plans,
    activities: w.members.map((m) => [m.id, m.activity.kind, m.activity.label]),
    orders,
  };
}

describe('调试跳转', () => {
  it('跳到第 29 天 12:00，作息和午饭与直接读档到同一时刻相同', () => {
    const loaded = boot(11, 29, 12 * 60);
    const jumped = boot(11);
    applyJump(jumped.w, jumped.c, 29, 12 * 60);
    expect(picture(jumped.w)).toEqual(picture(loaded.w));
    expect(jumped.c.day).toBe(29);
    expect(jumped.c.minute).toBe(12 * 60);
  });

  it('跳过中间的日子，不补写那些天的动态，也不补发薪', () => {
    const { s, w, c } = boot(4);
    const cash = s.cash;
    applyJump(w, c, 29, 12 * 60);
    expect(s.eventLog.filter((e) => e.day > 1 && e.day < 29)).toEqual([]);
    expect(s.eventLog.some((e) => e.text.includes('发薪'))).toBe(false);
    expect(s.cash).toBe(cash);
    expect(s.eventLog.length).toBeLessThan(40);
  });

  it('世界赛当晚的下一场停在八强赛前，不会跳进下赛季', () => {
    const { w, c, s } = boot(4);
    armWorldCup(w, c);
    expect(s.worldCup && !s.worldCup.done).toBe(true);
    const at = jumpToNextMatch(w, c);
    expect(at).toEqual({ day: 29, minute: PREMATCH_MINUTE });
    expect(s.worldCup?.done).toBe(false);
    expect(s.season.calendarSeason).toBe(1);
    expect(s.clock.day).toBe(29);
  });

  it('直接把钟拨过世界赛日也会被拉回八强赛前', () => {
    const { w, c, s } = boot(4);
    armWorldCup(w, c);
    const at = applyJump(w, c, 37, 19 * 60);
    expect(at).toEqual({ day: 29, minute: PREMATCH_MINUTE });
    expect(s.worldCup?.done).toBe(false);
    expect(s.season.tier).toBe('national');
  });

  it('指定赛季末名次：后两名降级，网吧联赛垫底不降级', () => {
    const cafe8 = boot(2);
    const at8 = setSeasonRank(cafe8.w, cafe8.c, 8);
    expect(at8.rank).toBe(8);
    expect(cafe8.s.season.tier).toBe('netcafe');
    expect(cafe8.s.eventLog.map((e) => e.text).join('\n')).toMatch(/不降级/);

    const cafe7 = boot(3);
    expect(setSeasonRank(cafe7.w, cafe7.c, 7).rank).toBe(7);
    expect(cafe7.s.season.tier).toBe('netcafe');

    const city = boot(5);
    city.s.season.tier = 'city';
    expect(setSeasonRank(city.w, city.c, 7).rank).toBe(7);
    expect(city.s.season.tier).toBe('netcafe');
    const city8 = boot(6);
    city8.s.season.tier = 'city';
    expect(setSeasonRank(city8.w, city8.c, 8).rank).toBe(8);
    expect(city8.s.season.tier).toBe('netcafe');

    const up = boot(7);
    up.s.season.tier = 'city';
    expect(setSeasonRank(up.w, up.c, 2).rank).toBe(2);
    expect(up.s.season.tier).toBe('national');
    expect(setSeasonRank(up.w, up.c, 8).rank).toBe(8);
    expect(up.s.season.tier).toBe('city');
  });

  it('赛季结算暂停只在未确认时留着；进休赛或世界赛日会放行，世界赛赛前暂停不动', () => {
    const clock = new GameClock({ day: 29, minute: 18 * 60 + 20, speed: 'x1', paused: false });
    syncSeasonEndHold(clock, true);
    clock.hold('match-29', '世界赛：等老板确认首发和战术');
    syncSeasonEndHold(clock, true);
    expect(clock.holdReasons.filter((r) => r === '赛季结算')).toEqual(['赛季结算']);
    expect(clock.isHeld('match-29')).toBe(true);
    syncSeasonEndHold(clock, false);
    expect(clock.isHeld('season-end')).toBe(false);
    expect(clock.isHeld('match-29')).toBe(true);

    const stuck = boot(4);
    jumpToSeasonEnd(stuck.w, stuck.c);
    stuck.c.hold('season-end', '赛季结算');
    expect(stuck.s.season.report?.acked).toBe(false);
    expect(stuck.c.isHeld('season-end')).toBe(true);
    // 再跳一次赛季末仍是未确认的结算，这条暂停不能被跳转本身清掉。
    jumpToSeasonEnd(stuck.w, stuck.c);
    expect(stuck.s.season.report?.acked).toBe(false);
    expect(stuck.c.isHeld('season-end')).toBe(true);

    const off = boot(3);
    jumpToSeasonEnd(off.w, off.c);
    off.c.hold('season-end', '赛季结算');
    const offAt = jumpToOffseason(off.w, off.c);
    expect(off.s.season.report?.acked).toBe(true);
    expect(off.c.isHeld('season-end')).toBe(false);
    expect(off.s.season.phase === 'offseason' || off.s.season.phase === 'world').toBe(true);
    expect(offAt.minute).toBe(10 * 60);

    armWorldCup(stuck.w, stuck.c);
    expect(stuck.s.season.report?.acked).toBe(true);
    expect(stuck.c.isHeld('season-end')).toBe(false);
    expect(stuck.c.paused).toBe(false);
    expect(stuck.c.day).toBe(29);
    expect(stuck.c.minute).toBe(18 * 60 + 20);
    expect(needsWorldPrematch(stuck.s, stuck.c.day, stuck.c.minute)).toBe(false);
    stuck.c.tick(30, [PREMATCH_MINUTE]);
    expect(stuck.c.day).toBe(29);
    expect(stuck.c.minute).toBeCloseTo(PREMATCH_MINUTE, 3);
    expect(needsWorldPrematch(stuck.s, stuck.c.day, stuck.c.minute)).toBe(true);
    stuck.c.hold('match-29', '世界赛：等老板确认首发和战术');
    expect(stuck.c.isHeld('season-end')).toBe(false);
    expect(stuck.c.paused).toBe(true);
    expect(stuck.c.tick(30, [19 * 60]).advanced).toBe(0);
  });

  it('同一赛季的结算日志只记一遍', () => {
    const again = boot(2);
    setSeasonRank(again.w, again.c, 8);
    setSeasonRank(again.w, again.c, 8);
    expect(again.s.eventLog.filter((e) => e.text.includes('不降级'))).toHaveLength(1);
    expect(again.s.eventLog.filter((e) => /赛季第 8 名/.test(e.text))).toHaveLength(1);
    again.w.log('日常', '摸鱼', []);
    again.w.log('日常', '摸鱼', []);
    expect(again.s.eventLog.filter((e) => e.text === '摸鱼')).toHaveLength(2);

    const nat = boot(4);
    nat.s.season.tier = 'national';
    jumpToSeasonEnd(nat.w, nat.c);
    armWorldCup(nat.w, nat.c);
    expect(nat.s.eventLog.filter((e) => e.text.includes('不升联赛'))).toHaveLength(1);
    expect(nat.s.eventLog.filter((e) => e.text.includes('赛季第 1 名'))).toHaveLength(1);
    expect(nat.s.eventLog.filter((e) => e.text.includes('拿到世界赛资格'))).toHaveLength(1);

    // 网吧第 1 名先升城市，再触发世界赛改成国内第 1。两句「赛季第 1 名」奖金不同，也不能各留一条。
    const promoted = boot(9);
    jumpToSeasonEnd(promoted.w, promoted.c);
    expect(promoted.s.eventLog.some((e) => e.text.includes('升入'))).toBe(true);
    armWorldCup(promoted.w, promoted.c);
    expect(promoted.s.eventLog.filter((e) => e.text.includes('赛季第 1 名'))).toHaveLength(1);
    expect(promoted.s.eventLog.filter((e) => e.text.includes('不升联赛'))).toHaveLength(1);
    expect(promoted.s.eventLog.filter((e) => e.text.includes('升入'))).toHaveLength(0);
    expect(promoted.s.eventLog.filter((e) => e.text.includes('拿到世界赛资格'))).toHaveLength(1);
  });

  it('八强输了再直接夺冠，只保留这次的冠军，不留「八强输」', () => {
    const { w, c, s } = boot(8);
    c.hold('season-end', '赛季结算');
    armWorldCup(w, c);
    for (const text of commitWorldRound(s, 0, false, autoLineup(s.roster))) w.log('重大', text, []);
    expect(s.eventLog.some((e) => e.text.includes('八强输'))).toBe(true);
    expect(s.worldCup?.done).toBe(true);
    crownWorld(w, c);
    const text = s.eventLog.map((e) => e.text).join('\n');
    expect(text).not.toMatch(/八强输/);
    expect(text).toMatch(/决赛赢/);
    expect(s.worldCup?.champion).toBe(true);
    expect(s.worldCup?.done).toBe(true);
    expect(c.isHeld('season-end')).toBe(false);
    const ours = s.worldCup?.games.filter((g) => g.a === 'ssb' || g.b === 'ssb') ?? [];
    expect(ours.length).toBeGreaterThan(0);
    expect(ours.every((g) => g.winner === 'ssb')).toBe(true);
  });

  it('下一场比赛落在 19:00，首发在打、一个人在台下', () => {
    expect(nextMatchAt(1, 10 * 60)).toEqual({ day: 2, minute: 19 * 60 });
    expect(nextMatchAt(2, 19 * 60)).toEqual({ day: 4, minute: 19 * 60 });
    const { w, c } = boot(6);
    applyJump(w, c, 2, 19 * 60);
    const kinds = w.members.map((m) => m.activity.kind);
    expect(kinds.filter((k) => k === 'match')).toHaveLength(5);
    expect(kinds.filter((k) => k === 'sub')).toHaveLength(1);
  });

  it('发薪日、下一事件按日程算', () => {
    expect(nextPaydayDay(1, 9 * 60)).toBe(29);
    expect(nextPaydayDay(10, 12 * 60)).toBe(29);
    expect(nextPaydayDay(29, 8 * 60)).toBe(29);
    expect(nextPaydayDay(29, 9 * 60)).toBe(29);
    expect(nextPaydayDay(29, 9 * 60 + 1)).toBe(57);
    expect(nextEventAt(1, 9 * 60)).toEqual({ day: 1, minute: 12 * 60, label: '午饭' });
    expect(nextEventAt(1, 22 * 60)).toEqual({ day: 2, minute: 9 * 60, label: '上班' });
    expect(nextEventAt(28, 22 * 60)).toEqual({ day: 29, minute: 9 * 60, label: '发薪' });
    expect(nextEventAt(2, 18 * 60)).toEqual({ day: 2, minute: 18 * 60 + 30, label: '赛前' });
  });

  it('发薪按钮结算一次；这一天已经有发薪记录就不再扣', () => {
    const first = boot(1);
    const at = jumpToNextPayday(first.w, first.c);
    expect(at).toEqual({ day: 29, minute: 9 * 60 });
    expect(first.s.eventLog.some((e) => e.day === 29 && e.text.includes('发薪'))).toBe(true);
    expect(first.s.cash).not.toBe(5000);

    const again = boot(1, 29, 8 * 60);
    const cash = again.s.cash;
    again.s.eventLog.unshift({ id: 99, day: 29, minute: 9 * 60, level: '剧情', text: '发薪日。已经发过。', ids: [] });
    const at2 = jumpToNextPayday(again.w, again.c);
    expect(at2).toEqual({ day: 29, minute: 9 * 60 });
    expect(again.s.cash).toBe(cash);
    expect(again.s.eventLog.filter((e) => e.text.includes('发薪'))).toHaveLength(1);
  });

  it('发薪按钮停在这一次；再按一次还在同一天，不会跳到下个月', () => {
    const { s, w, c } = boot(1);
    s.cash = 0;
    s.privateStash = 0;
    const at = jumpToNextPayday(w, c);
    expect(at).toEqual({ day: 29, minute: 9 * 60 });
    expect(c.manualPause).toBe(true);
    expect(s.unpaidMonths).toBe(1);
    expect(s.bankrupt).toBe(false);
    const at2 = jumpToNextPayday(w, c);
    expect(at2).toEqual({ day: 29, minute: 9 * 60 });
    expect(s.unpaidMonths).toBe(1);
    expect(s.bankrupt).toBe(false);
    expect(s.eventLog.filter((e) => e.text.includes('发薪'))).toHaveLength(1);
  });

  it('下一顿外卖不会跳过比赛夜的赛前暂停', () => {
    expect(prematchOnTheWay(2, 10 * 60, 2, 12 * 60 + 10)).toBeNull();
    expect(prematchOnTheWay(2, 18 * 60 + 25, 4, 12 * 60)).toEqual({ day: 2, minute: 18 * 60 + 30 });
    const { w, c } = boot(1, 2, 18 * 60 + 25);
    const at = jumpToNextTakeout(w, c);
    expect(at).toEqual({ day: 2, minute: 18 * 60 + 30 });
  });

  it('下一顿外卖落在外卖员进门的时刻', () => {
    const { s, w, c } = boot(1);
    const at = jumpToNextTakeout(w, c);
    expect(at).not.toBeNull();
    expect(at!.day > 1 || at!.minute > 9 * 60).toBe(true);
    expect(courierTrack(s.meals, at!.minute)).not.toBeNull();
  });

  it('可以改现金和行动点，并清空冷却', () => {
    const { s } = boot(1);
    expect(setCash(s, -20)).toBe(0);
    expect(s.cash).toBe(0);
    expect(setCash(s, 1234.8)).toBe(1234);
    expect(setActionPoints(s, 2)).toBe(2);
    expect(s.actionPoints).toBe(2);
    expect(s.apDay).toBe(1);
    s.cooldowns = { 'takeout:spill': 99, 'action:rest': 12 };
    clearCooldowns(s);
    expect(s.cooldowns).toEqual({});
  });

  it('强制点单和连锁会进当天的外卖，并写进动态', () => {
    const spill = boot(2);
    const at = forceTakeout(spill.w, spill.c, 'aji', 'huangmen', 'spill');
    const order = spill.s.meals.lunch?.orders.find((o) => o.memberId === 'aji');
    expect(order?.dishId).toBe('huangmen');
    expect(order?.delivery).toBe(true);
    expect(spill.s.meals.lunch?.chains).toContain('spill');
    expect(spill.s.eventLog.some((e) => e.text.includes('洒'))).toBe(true);
    expect(courierTrack(spill.s.meals, at.minute)).not.toBeNull();

    const hot = boot(3);
    forceTakeout(hot.w, hot.c, 'gouliang', 'huangmen', 'luosifen');
    expect(hot.s.meals.lunch?.orders.some((o) => o.memberId === 'gouliang' && o.dishId === 'luosifen')).toBe(true);

    const bill = boot(5);
    forceTakeout(bill.w, bill.c, 'dangdeng', 'huangmen', 'spicybill');
    const malatang = bill.s.meals.lunch?.orders.find((o) => o.memberId === 'dangdeng');
    expect(malatang?.dishId).toBe('malatang');
    expect(malatang?.price).toBe(60);
  });
});
