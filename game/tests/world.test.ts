import { describe, expect, it } from 'vitest';
import { createNewGame, type GameState } from '../src/save/state';
import { allFacilitiesUpTo } from '../src/data/facilities';
import { World } from '../src/sim/world';
import { DAY_START, DAY_END } from '../src/core/clock';
import { LIBRARY_EVENTS } from '../src/sim/events/library';

function simulateDay(seed: number, day: number, setup?: (s: GameState) => void) {
  const s = createNewGame(seed);
  s.clock.day = day;
  setup?.(s);
  const w = new World(s);
  const trace: string[] = [];
  for (let t = DAY_START; t < DAY_END; t += 1) {
    s.clock.minute = t;
    w.update(t, 1, false);
    trace.push(w.members.map((m) => m.activity.kind).join(','));
  }
  return { w, trace, s };
}

describe('日常模拟', () => {
  it('同一种子同一天，作息完全一样（读档可复现）', () => {
    expect(simulateDay(9, 3).trace).toEqual(simulateDay(9, 3).trace);
    expect(simulateDay(9, 3).trace).not.toEqual(simulateDay(10, 3).trace);
  });

  it('白天大家会到岗，22:00 前全部下班', () => {
    const { trace } = simulateDay(5, 1);
    const at = (min: number) => trace[min - DAY_START].split(',');
    expect(at(10 * 60).filter((k) => k !== 'absent' && k !== 'out').length).toBeGreaterThanOrEqual(5);
    expect(at(15 * 60).filter((k) => k === 'team').length).toBeGreaterThanOrEqual(4);
    expect(at(DAY_END - 1).every((k) => k === 'absent')).toBe(true);
  });

  it('比赛日 19:00 首发 5 人比赛、1 人台下', () => {
    const { trace } = simulateDay(5, 2);
    const kinds = trace[19 * 60 + 10 - DAY_START].split(',');
    expect(kinds.filter((k) => k === 'match')).toHaveLength(5);
    expect(kinds.filter((k) => k === 'sub')).toHaveLength(1);
  });

  it('会写日常动态，状态保持在 0–100', () => {
    const { s } = simulateDay(3, 1);
    expect(s.eventLog.length).toBeGreaterThan(5);
    for (const m of s.roster) for (const v of Object.values(m.status)) expect(v).toBeGreaterThanOrEqual(0);
    for (const m of s.roster) for (const v of Object.values(m.status)) expect(v).toBeLessThanOrEqual(100);
  });
});

describe('刷手机细分', () => {
  it('多数时候在刷抖音，也保留笼统的“耍手机”', () => {
    const count: Record<string, number> = {};
    for (let seed = 1; seed <= 40; seed++) {
      const { w, s } = simulateDay(seed, 3);
      void s;
      // 重新跑一遍，统计每分钟的手机 App
      for (let t = DAY_START; t < DAY_END; t += 1) {
        w.state.clock.minute = t;
        w.update(t, 0, true);
        for (const m of w.members) if (m.activity.kind === 'slack_phone') count[m.activity.app!] = (count[m.activity.app!] ?? 0) + 1;
      }
    }
    const total = Object.values(count).reduce((a, b) => a + b, 0);
    const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe('douyin');
    expect(count.douyin / total).toBeGreaterThan(0.3);
    expect(count.generic).toBeGreaterThan(0);
    expect(Object.keys(count).length).toBeGreaterThanOrEqual(6);
  });
});

describe('晚饭', () => {
  it('非比赛日 18:00 在岗的人都在吃', () => {
    const s = createNewGame(1);
    s.clock.day = 1;
    s.clock.minute = 18 * 60;
    const w = new World(s);
    w.update(18 * 60, 0, true);
    const present = w.members.filter((m) => m.present);
    expect(present.length).toBe(6);
    for (const m of present) expect(m.activity.kind).toBe('eat');
  });
});

describe('饭点', () => {
  it('饭点有人等外卖或在吃，没有人外出吃饭', () => {
    let eating = 0;
    let delivered = 0;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const seed of seeds) {
      const { trace, w } = simulateDay(seed, 3);
      const kinds = trace[12 * 60 + 20 - DAY_START].split(',');
      expect(kinds.some((k) => k === 'out')).toBe(false);
      expect(w.state.eventLog.some((e) => e.text.includes('出去吃'))).toBe(false);
      eating += kinds.filter((k) => k === 'eat' || k === 'wait_food').length;
      delivered += w.state.meals.lunch?.orders.filter((o) => o.delivery).length ?? 0;
    }
    const avg = eating / seeds.length;
    expect(avg).toBeGreaterThan(1);
    expect(avg).toBeLessThan(5);
    expect(delivered / seeds.length).toBeGreaterThan(1.5);
  });
});

describe('场地物件过滤', () => {
  const count = (setup?: (s: GameState) => void) => {
    const c: Record<string, number> = {};
    for (let seed = 1; seed <= 30; seed++) {
      for (const line of simulateDay(seed, 3, setup).trace) for (const k of line.split(',')) c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  };

  it('网吧角落（开局）：没有冰箱、零食柜、沙发，就不会去用', () => {
    const c = count();
    expect(c.fridge ?? 0).toBe(0);
    expect(c.snack ?? 0).toBe(0);
    expect(c.nap_sofa ?? 0).toBe(0);
    expect(c.drink).toBeGreaterThan(0); // 饮水机是自带的
    expect(c.nap_desk).toBeGreaterThan(0); // 午睡只能趴桌
  });

  it('网吧角落买了零食柜才会有人去拿零食', () => {
    const c = count((s) => (s.facilities = ['snack']));
    expect(c.snack).toBeGreaterThan(0);
    expect(c.fridge ?? 0).toBe(0);
  });

  it('办公室的设施在网吧里不生效（等级不够）', () => {
    const c = count((s) => (s.facilities = ['fridge', 'sofa']));
    expect(c.fridge ?? 0).toBe(0);
    expect(c.nap_sofa ?? 0).toBe(0);
  });

  it('小办公室买齐设施后，冰箱、零食柜、沙发都会被用到', () => {
    const c = count((s) => {
      s.venueLevel = 1;
      s.facilities = allFacilitiesUpTo(1);
    });
    expect(c.fridge).toBeGreaterThan(0);
    expect(c.snack).toBeGreaterThan(0);
    expect(c.nap_sofa).toBeGreaterThan(0);
  });
});

describe('性格：爱睡觉', () => {
  it('午睡概率由“爱睡觉”驱动', () => {
    const naps = (v: number) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const { trace } = simulateDay(seed, 3, (s) => {
          for (const m of s.roster) m.persona.爱睡觉 = v;
        });
        n += trace[14 * 60 - DAY_START].split(',').filter((k) => k === 'nap_desk').length;
      }
      return n;
    };
    expect(naps(100)).toBeGreaterThan(naps(0) * 2);
  });
});

describe('场地文案', () => {
  it('称呼跟着场地等级走', () => {
    const s = createNewGame(1);
    const w = new World(s);
    expect(w.placeName).toBe('网吧角落');
    s.venueLevel = 1;
    expect(w.placeName).toBe('小办公室');
    s.venueLevel = 2;
    expect(w.placeName).toBe('电竞基地');
  });

  it('赛前会文案跟着场地和白板走', () => {
    const text = (setup?: (s: GameState) => void) => simulateDay(4, 2, setup).s.eventLog.map((e) => e.text).join('\n');
    const cafe = text();
    expect(cafe).toMatch(/站到自己机位后面/);
    expect(cafe).not.toMatch(/白板/);
    expect(text((s) => {
      s.venueLevel = 1;
      s.facilities = ['whiteboard'];
    })).toMatch(/白板前分开站好/);
    const bare = text((s) => {
      s.venueLevel = 1;
      s.facilities = [];
    });
    expect(bare).toMatch(/空地上分开站好/);
    expect(bare).toMatch(/小办公室安静下来/);
    expect(bare).not.toMatch(/白板/);
  });
});

describe('事件看板日常', () => {
  it('会写摸鱼、午睡、刷手机、看直播这类日常', () => {
    const texts: string[] = [];
    for (let seed = 1; seed <= 5; seed++) texts.push(...simulateDay(seed, 3).s.eventLog.filter((e) => e.level === '日常').map((e) => e.text));
    const has = (re: RegExp) => texts.some((t) => re.test(t));
    expect(has(/手机|抖音/)).toBe(true);
    expect(has(/直播/)).toBe(true);
    expect(has(/睡|趴/)).toBe(true);
    expect(has(/出去吃/)).toBe(false);
  });
});

describe('下午组排：五黑只要 5 个人', () => {
  it('任何时刻最多 5 人在组排，6 人都在时一局有 1 人轮空', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { trace } = simulateDay(seed, 3);
      for (let t = 14 * 60 + 30; t < 18 * 60; t++) {
        const kinds = trace[t - DAY_START].split(',');
        expect(kinds.filter((k) => k === 'team').length).toBeLessThanOrEqual(5);
      }
      // 局中（排队时间之外）：5 人五黑 + 1 人在干别的
      const mid = trace[15 * 60 - DAY_START].split(',');
      expect(mid.filter((k) => k === 'team')).toHaveLength(5);
    }
  });

  it('轮空的人轮流换，做的是观战、吃东西、耍手机、看直播', () => {
    const s = createNewGame(8);
    s.clock.day = 3;
    const w = new World(s);
    const benched = new Set<string>();
    const kinds = new Set<string>();
    for (let t = DAY_START; t < 18 * 60; t++) {
      s.clock.minute = t;
      w.update(t, 1, false);
      for (const m of w.members) {
        if (!m.activity.bench) continue;
        benched.add(m.id);
        kinds.add(m.activity.kind);
      }
    }
    expect(benched.size).toBeGreaterThanOrEqual(5); // 6 局，每局换一个人
    for (const k of kinds) expect(['spectate', 'eat', 'slack_phone', 'slack_stream']).toContain(k);
    expect(s.eventLog.some((e) => e.text.includes('这把轮空'))).toBe(true);
  });
});

describe('训练成长接入日常', () => {
  it('跨天结算前一天成长，摸鱼分钟写进存档并在新一天清零', () => {
    const s = createNewGame(7);
    const w = new World(s);
    for (let t = DAY_START; t < DAY_END; t++) {
      s.clock.minute = t;
      w.update(t, 1, false);
    }
    const slack = w.members.find((m) => m.id === 'aji')!.slackMin;
    expect(slack).toBeGreaterThanOrEqual(0);
    s.clock.day = 2;
    s.clock.minute = DAY_START;
    w.startDay(2, true);
    const m = s.roster.find((x) => x.id === 'aji')!;
    expect(Object.keys(m.lastGain).length).toBeGreaterThan(0);
    expect(m.abilityCarry).toBeTruthy();
    expect(m.routeTraitReady).toBe(true);
    expect(w.members.find((x) => x.id === 'aji')!.slackMin).toBe(0);
  });
});

describe('事件库接入日常', () => {
  const libraryTexts = new Set(LIBRARY_EVENTS.flatMap((e) => e.texts));

  it('同一种子同一天看板可复现，且会出现库事件', () => {
    const run = (seed: number) => {
      const s = createNewGame(seed);
      s.clock.day = 3;
      const w = new World(s);
      for (let t = DAY_START; t < DAY_END; t++) {
        s.clock.minute = t;
        w.update(t, 1, false);
      }
      return s;
    };
    const a = run(3);
    const b = run(3);
    expect(a.eventLog.map((e) => e.text)).toEqual(b.eventLog.map((e) => e.text));
    const lib = a.eventLog.filter((e) => libraryTexts.has(e.text));
    expect(lib.length).toBeGreaterThan(0);
    for (const e of a.eventLog) expect(e.text).not.toMatch(/\{[^}]+\}/);
    expect(a.eventLog.length).toBeLessThanOrEqual(160);
  });
});
