import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/save/state';
import { actionPointMax, isPayday, MONTH_DAYS, START_CASH, START_STASH } from '../src/data/economy';
import {
  buyFacility,
  grantDailyInsight,
  monthlyDue,
  monthlyRent,
  monthlySalaryTotal,
  noteMatch,
  runPayday,
  signSponsor,
  skim,
  sponsorLockReason,
} from '../src/sim/economy';

describe('经济', () => {
  it('开局公司现金 5000、私房钱 20000', () => {
    const s = createNewGame(1);
    expect(s.cash).toBe(START_CASH);
    expect(s.cash).toBe(5000);
    expect(s.privateStash).toBe(START_STASH);
    expect(s.privateStash).toBe(20000);
    expect(s.insight).toBe(0);
  });

  it('网吧月支出是 6×1500 工资 + 2000 房租', () => {
    const s = createNewGame(1);
    expect(monthlySalaryTotal(s)).toBe(9000);
    expect(monthlyRent(s)).toBe(2000);
    expect(monthlyDue(s)).toBe(11000);
    s.season.tier = 'city';
    s.venueLevel = 1;
    expect(monthlySalaryTotal(s)).toBe(18000);
    expect(monthlyRent(s)).toBe(6000);
  });

  it('发薪日在第 29 天，公司不够就垫私房钱，连续三个月才破产', () => {
    expect(isPayday(1)).toBe(false);
    expect(isPayday(28)).toBe(false);
    expect(isPayday(1 + MONTH_DAYS)).toBe(true);

    const short = createNewGame(2);
    short.cash = 5000;
    const paid = runPayday(short, 29);
    expect(paid.paid).toBe(true);
    expect(paid.usedStash).toBe(6000);
    expect(short.cash).toBe(0);
    expect(short.privateStash).toBe(14000);
    expect(short.unpaidMonths).toBe(0);
    expect(short.bankrupt).toBe(false);

    const broke = createNewGame(3);
    broke.cash = 100;
    broke.privateStash = 0;
    const a = runPayday(broke, 29);
    const b = runPayday(broke, 57);
    expect(a.paid).toBe(false);
    expect(b.bankrupt).toBe(false);
    expect(broke.unpaidMonths).toBe(2);
    expect(broke.cash).toBe(100);
    const c = runPayday(broke, 85);
    expect(c.bankrupt).toBe(true);
    expect(broke.bankrupt).toBe(true);
    expect(broke.cash).toBe(100);
  });

  it('王哥赞助每月进账 3000，没赢满 3 场签不了下一档', () => {
    const s = createNewGame(4);
    s.cash = 20000;
    expect(signSponsor(s, 'wang').ok).toBe(true);
    expect(sponsorLockReason(s, 'huang')).toMatch(/赢/);
    const before = s.cash;
    runPayday(s, 29);
    expect(s.cash).toBe(before + 3000 - monthlyDue(s));
    noteMatch(s, true);
    noteMatch(s, true);
    expect(signSponsor(s, 'huang').ok).toBe(false);
    noteMatch(s, true);
    expect(s.record.wins).toBe(3);
    expect(s.insight).toBe(180);
    expect(signSponsor(s, 'huang').ok).toBe(true);
  });

  it('买零食柜扣 800，不能买第二次，网吧买不了沙发', () => {
    const s = createNewGame(5);
    expect(buyFacility(s, 'snack')).toEqual({ ok: true });
    expect(s.cash).toBe(4200);
    expect(s.facilities).toContain('snack');
    expect(buyFacility(s, 'snack').ok).toBe(false);
    expect(buyFacility(s, 'sofa').reason).toMatch(/小办公室/);
    expect(s.cash).toBe(4200);
  });

  it('训练心得：全勤 30，摸鱼、加班、耳机、放假', () => {
    const s = createNewGame(6);
    expect(grantDailyInsight(s, [0, 0, 0, 0, 0, 0], 1)).toBe(30);
    expect(grantDailyInsight(s, [0, 0, 0, 0, 0, 90], 1)).toBe(25);
    s.flags.overtimeDay = 1;
    expect(grantDailyInsight(s, [10, 10, 10, 10, 10, 10], 1)).toBe(45);
    s.flags.overtimeDay = 0;
    s.facilities.push('headset');
    expect(grantDailyInsight(s, [0, 0, 0, 0, 0, 0], 1)).toBe(33);
    s.flags.restDay = 1;
    const before = s.insight;
    expect(grantDailyInsight(s, [0, 0, 0, 0, 0, 0], 1)).toBe(0);
    expect(s.insight).toBe(before);
  });

  it('抽成只从现金进私房钱，现金不能为负', () => {
    const s = createNewGame(7);
    expect(skim(s, 1000).ok).toBe(true);
    expect(s.cash).toBe(4000);
    expect(s.privateStash).toBe(21000);
    expect(skim(s, 9000).ok).toBe(false);
    expect(s.cash).toBe(4000);
  });

  it('行动点上限随场地涨，比赛日 +1', () => {
    expect(actionPointMax(0, false)).toBe(3);
    expect(actionPointMax(0, true)).toBe(4);
    expect(actionPointMax(1, false)).toBe(4);
    expect(actionPointMax(3, true)).toBe(7);
  });
});
