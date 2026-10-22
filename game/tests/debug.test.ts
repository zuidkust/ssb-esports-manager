import { describe, expect, it } from 'vitest';
import { applyJump, clearCooldowns, forceTakeout, jumpToNextPayday, jumpToNextTakeout, nextEventAt, nextMatchAt, nextPaydayDay, setActionPoints, setCash } from '../src/debug/god';
import { GameClock } from '../src/core/clock';
import { createNewGame } from '../src/save/state';
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
    expect(nextPaydayDay(29, 9 * 60)).toBe(57);
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
    const at = forceTakeout(spill.w, spill.c, 'shidian', 'huangmen', 'spill');
    const order = spill.s.meals.lunch?.orders.find((o) => o.memberId === 'shidian');
    expect(order?.dishId).toBe('huangmen');
    expect(order?.delivery).toBe(true);
    expect(spill.s.meals.lunch?.chains).toContain('spill');
    expect(spill.s.eventLog.some((e) => e.text.includes('洒'))).toBe(true);
    expect(courierTrack(spill.s.meals, at.minute)).not.toBeNull();

    const hot = boot(3);
    forceTakeout(hot.w, hot.c, 'dishu', 'huangmen', 'luosifen');
    expect(hot.s.meals.lunch?.orders.some((o) => o.memberId === 'dishu' && o.dishId === 'luosifen')).toBe(true);

    const bill = boot(5);
    forceTakeout(bill.w, bill.c, 'dangdeng', 'huangmen', 'spicybill');
    const malatang = bill.s.meals.lunch?.orders.find((o) => o.memberId === 'dangdeng');
    expect(malatang?.dishId).toBe('malatang');
    expect(malatang?.price).toBe(60);
  });
});
