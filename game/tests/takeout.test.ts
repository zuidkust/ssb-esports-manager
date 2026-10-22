import { describe, expect, it } from 'vitest';
import { createNewGame, type GameState } from '../src/save/state';
import { CHAIN_CHANCE, CHAIN_COOLDOWN_DAYS, CHAINS, DISHES } from '../src/data/takeout';
import { ROSTER } from '../src/data/roster';
import { resolveMeal, settleMeals, type TakeoutPerson } from '../src/sim/takeout';
import { chainCooldownKey } from '../src/data/takeout';

function peopleOf(state: GameState, patch?: (p: TakeoutPerson) => void): TakeoutPerson[] {
  return state.roster.map((m) => {
    const def = ROSTER.find((d) => d.id === m.id)!;
    const p: TakeoutPerson = {
      id: m.id,
      name: def.name,
      persona: { 摸鱼倾向: m.persona.摸鱼倾向, 话痨: m.persona.话痨 },
      status: { 饥饿: m.status.饥饿, 心情: m.status.心情 },
      late: false,
    };
    patch?.(p);
    return p;
  });
}

function lunch(seed: number, setup?: (s: GameState) => void, patch?: (p: TakeoutPerson) => void) {
  const state = createNewGame(seed);
  setup?.(state);
  const resolved = resolveMeal({ state, people: peopleOf(state, patch), day: state.clock.day || 3, meal: 'lunch', place: '网吧角落' });
  return { state, ...resolved };
}

describe('外卖', () => {
  it('菜单按草案有 16 道', () => {
    expect(DISHES).toHaveLength(16);
    expect(new Set(DISHES.map((d) => d.id)).size).toBe(16);
  });

  it('默认状态下每餐外卖大约 2 到 3 人，同一种子可复现', () => {
    const seeds = Array.from({ length: 80 }, (_, i) => i + 1);
    let n = 0;
    for (const seed of seeds) {
      const a = lunch(seed, (s) => {
        s.clock.day = 3;
      });
      const b = lunch(seed, (s) => {
        s.clock.day = 3;
      });
      const count = a.record.orders.filter((o) => o.delivery).length;
      n += count;
      expect(b.record.orders.map((o) => o.dishId)).toEqual(a.record.orders.map((o) => o.dishId));
    }
    const avg = n / seeds.length;
    expect(avg).toBeGreaterThanOrEqual(2.1);
    expect(avg).toBeLessThanOrEqual(2.95);
  });

  it('饿的人点得更多', () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    const mean = (hungry: number) => {
      let n = 0;
      for (const seed of seeds) {
        const r = lunch(seed, (s) => {
          s.clock.day = 3;
        }, (p) => {
          p.status.饥饿 = hungry;
        });
        n += r.record.orders.filter((o) => o.delivery).length;
      }
      return n / seeds.length;
    };
    expect(mean(80)).toBeGreaterThan(mean(30) + 1);
  });

  it('自付不动公司现金；今天我请按菜单实价扣；不够就改回自付', () => {
    const hosted = lunch(11, (s) => {
      s.clock.day = 3;
      s.flags.hostDay = 3;
      s.flags.hostMeal = 'lunch';
    });
    const due = hosted.record.orders.filter((o) => o.delivery).reduce((sum, o) => sum + o.price, 0);
    expect(due).toBeGreaterThan(0);
    expect(hosted.state.cash).toBe(5000 - due);
    expect(hosted.record.orders.filter((o) => o.delivery).every((o) => o.payer === 'host')).toBe(true);

    const self = lunch(11, (s) => {
      s.clock.day = 3;
    });
    expect(self.state.cash).toBe(5000);

    const broke = lunch(11, (s) => {
      s.clock.day = 3;
      s.cash = 1;
      s.flags.hostDay = 3;
      s.flags.hostMeal = 'lunch';
    });
    expect(broke.state.cash).toBe(1);
    expect(broke.record.orders.filter((o) => o.delivery).every((o) => o.payer === 'self')).toBe(true);
  });

  it('餐补和请客叠在一起只由餐补付钱；现金不够就改回自付', () => {
    const stacked = lunch(11, (s) => {
      s.clock.day = 3;
      s.venueLevel = 1;
      s.facilities.push('mealAllowance');
      s.flags.hostDay = 3;
      s.flags.hostMeal = 'lunch';
    });
    const due = stacked.record.orders.filter((o) => o.delivery).reduce((sum, o) => sum + o.price, 0);
    expect(due).toBeGreaterThan(0);
    expect(stacked.state.cash).toBe(5000 - due);
    expect(stacked.record.orders.filter((o) => o.delivery).every((o) => o.payer === 'subsidy')).toBe(true);

    const short = lunch(11, (s) => {
      s.clock.day = 3;
      s.venueLevel = 1;
      s.facilities.push('mealAllowance');
      s.flags.hostDay = 3;
      s.flags.hostMeal = 'lunch';
      s.cash = 1;
    });
    expect(short.state.cash).toBe(1);
    expect(short.record.orders.filter((o) => o.delivery).every((o) => o.payer === 'self')).toBe(true);
    const notice = short.logs.find((l) => /自己付|自付/.test(l.text));
    expect(notice?.level).toBe('有趣');
    expect(notice?.text).not.toMatch(/当没发生/);
  });

  it('公司餐补付钱，并在吃到的时候加一点心情', () => {
    const s = createNewGame(12);
    s.clock.day = 3;
    s.venueLevel = 1;
    s.facilities.push('mealAllowance');
    const before = Object.fromEntries(s.roster.map((m) => [m.id, m.status.心情]));
    const resolved = resolveMeal({ state: s, people: peopleOf(s), day: 3, meal: 'lunch', place: '办公室' });
    const deliveries = resolved.record.orders.filter((o) => o.delivery);
    expect(deliveries.length).toBeGreaterThan(0);
    expect(deliveries.every((o) => o.payer === 'subsidy')).toBe(true);
    expect(s.cash).toBeLessThan(5000);
    s.meals.day = 3;
    s.meals.lunch = resolved.record;
    const when = Math.max(...deliveries.map((o) => o.deliveredAt));
    settleMeals(s, when);
    for (const o of deliveries) expect(s.roster.find((m) => m.id === o.memberId)!.status.心情).toBeGreaterThan(before[o.memberId]);
  });

  it('连锁大约一成多，螺蛳粉抗议有冷却；烧烤和小龙虾不在午饭出现', () => {
    let orders = 0;
    let chains = 0;
    let sawLuo = false;
    for (let seed = 1; seed <= 60; seed++) {
      const r = lunch(seed, (s) => {
        s.clock.day = 3;
      });
      const drops = r.record.orders.filter((o) => o.delivery);
      orders += drops.length;
      chains += r.record.chains.length;
      expect(r.record.orders.some((o) => o.dishId === 'bbq' || o.dishId === 'crayfish' || o.dishId === 'jianbing')).toBe(false);
      const luo = r.record.orders.find((o) => o.dishId === 'luosifen');
      if (luo) {
        sawLuo = true;
        const fx = r.record.effects.find((e) => e.status.some((st) => st.id === luo.memberId && (st.饥饿 ?? 0) < 0));
        expect(fx).toBeTruthy();
        const others = fx!.status.filter((st) => st.id !== luo.memberId);
        expect(others.length).toBeGreaterThan(0);
        expect(others.every((st) => st.心情 === -3)).toBe(true);
      }
    }
    expect(sawLuo).toBe(true);
    const rate = chains / orders;
    expect(rate).toBeGreaterThan(0.05);
    expect(rate).toBeLessThan(0.35);

    let blocked = 0;
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 8; seed++) {
      const state = createNewGame(seed);
      state.clock.day = 3;
      state.cooldowns[chainCooldownKey('luosifen')] = 6;
      const resolved = resolveMeal({ state, people: peopleOf(state, (p) => { p.status.饥饿 = 90; }), day: 3, meal: 'lunch', place: '网吧角落' });
      if (!resolved.record.orders.some((o) => o.dishId === 'luosifen')) continue;
      checked++;
      expect(resolved.record.chains.includes('luosifen')).toBe(false);
      blocked++;
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it('普通连锁大约 15%，同一种冷却 3 天', () => {
    expect(CHAIN_CHANCE).toBe(0.15);
    expect(CHAIN_COOLDOWN_DAYS).toBe(3);

    let orders = 0;
    let chains = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const r = lunch(seed, (s) => {
        s.clock.day = 3;
      });
      for (const o of r.record.orders) {
        if (!o.delivery || o.dishId === 'luosifen') continue;
        orders++;
      }
      chains += r.record.chains.filter((id) => id !== 'luosifen').length;
    }
    const rate = chains / orders;
    expect(rate).toBeGreaterThan(0.08);
    expect(rate).toBeLessThan(0.24);

    let stamped = 0;
    for (let seed = 1; seed <= 40 && stamped < 8; seed++) {
      const state = createNewGame(seed);
      state.clock.day = 10;
      const first = resolveMeal({ state, people: peopleOf(state, (p) => { p.status.饥饿 = 90; }), day: 10, meal: 'lunch', place: '网吧角落' });
      if (first.record.chains.length !== 1) continue;
      const id = first.record.chains[0];
      expect(state.cooldowns[chainCooldownKey(id)]).toBe(10 + CHAIN_COOLDOWN_DAYS);
      stamped++;
      for (const day of [11, 12]) {
        const again = resolveMeal({ state, people: peopleOf(state, (p) => { p.status.饥饿 = 90; }), day, meal: 'lunch', place: '网吧角落' });
        expect(again.record.chains).not.toContain(id);
      }
    }
    expect(stamped).toBeGreaterThan(0);

    let blockedOrders = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const state = createNewGame(seed + 200);
      state.clock.day = 3;
      for (const c of CHAINS) state.cooldowns[chainCooldownKey(c.id)] = 99;
      state.cooldowns[chainCooldownKey('luosifen')] = 99;
      const r = resolveMeal({ state, people: peopleOf(state, (p) => { p.status.饥饿 = 95; }), day: 3, meal: 'lunch', place: '网吧角落' });
      blockedOrders += r.record.orders.filter((o) => o.delivery).length;
      expect(r.record.chains).toEqual([]);
    }
    expect(blockedOrders).toBeGreaterThan(20);
  });

  it('周四的快餐旁白不写人设文案', () => {
    let saw = false;
    for (let seed = 1; seed <= 50 && !saw; seed++) {
      const state = createNewGame(seed);
      const r = resolveMeal({
        state,
        people: peopleOf(state, (p) => { p.status.饥饿 = 95; }),
        day: 4,
        meal: 'lunch',
        place: '网吧角落',
      });
      if (!r.record.orders.some((o) => o.dishId === 'mcd')) continue;
      saw = true;
      const text = r.logs.map((l) => l.text).join('');
      expect(text).toContain('周四');
      expect(text).not.toContain('文案');
      expect(text).not.toContain('那句');
    }
    expect(saw).toBe(true);
  });

  it('没赢过不会点小龙虾，晚饭可以有烧烤', () => {
    let cray = 0;
    let bbq = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const state = createNewGame(seed);
      state.clock.day = 3;
      const lost = resolveMeal({
        state,
        people: peopleOf(state, (p) => { p.status.饥饿 = 90; }),
        day: 3,
        meal: 'dinner',
        place: '网吧角落',
      });
      cray += lost.record.orders.filter((o) => o.dishId === 'crayfish').length;
      bbq += lost.record.orders.filter((o) => o.dishId === 'bbq').length;
    }
    expect(cray).toBe(0);
    expect(bbq).toBeGreaterThan(0);

    let wonCray = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const state = createNewGame(seed + 100);
      state.clock.day = 3;
      state.record.lastMatchWon = true;
      const won = resolveMeal({
        state,
        people: peopleOf(state, (p) => { p.status.饥饿 = 90; }),
        day: 3,
        meal: 'dinner',
        place: '网吧角落',
      });
      wonCray += won.record.orders.filter((o) => o.dishId === 'crayfish').length;
    }
    expect(wonCray).toBeGreaterThan(0);
  });
});
