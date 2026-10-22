import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/save/state';
import { COMBO_SLOTS, ROSTER } from '../src/data/roster';
import { PERSONA_EVENTS, GRUDGE_LINES, NICKNAMES } from '../src/data/personaEvents';
import { performAction } from '../src/sim/actions';
import { memberDishWeight } from '../src/sim/takeout';
import { DISH_BY_ID } from '../src/data/takeout';
import { rollPersonaBeat } from '../src/sim/personaEvents';
import { World } from '../src/sim/world';
import { DAY_END, DAY_START } from '../src/core/clock';

const BANNED = ['鉴黄师', '中转上可惜了', '施颠', '地鼠', '批菊', '吊龙', '如何评价'];

describe('开局 6 人', () => {
  it('正式名、本命外卖和两对连招占位', () => {
    expect(ROSTER.map((m) => m.name)).toEqual(['阿鸡', '当邓', '狗粮', '弟必', '吊隆', '撇干']);
    expect(ROSTER.find((m) => m.id === 'aji')!.taste.noMilktea).toBe(true);
    expect(ROSTER.find((m) => m.id === 'dangdeng')!.taste.favorites).toEqual(['friedchicken', 'mcd']);
    expect(ROSTER.find((m) => m.id === 'diaolong')!.taste.avoidNote).toBe('不吃内脏');
    expect(ROSTER.find((m) => m.id === 'piegan')!.heroNote).toContain('+30%');
    expect(COMBO_SLOTS.map((c) => c.name)).toEqual(['【待定】', '【待定】']);
    const blob = JSON.stringify({ ROSTER, PERSONA_EVENTS, GRUDGE_LINES, NICKNAMES, COMBO_SLOTS });
    for (const word of BANNED) expect(blob).not.toContain(word);
  });

  it('点单偏向本命，阿鸡赛前仍会考虑螺蛳粉', () => {
    const ctx = { lowMood: false, monthEnd: false, unpaid: false, matchEve: false, thursday: false };
    expect(memberDishWeight('dangdeng', DISH_BY_ID.friedchicken, ctx)).toBeGreaterThan(memberDishWeight('dangdeng', DISH_BY_ID.salad, ctx));
    expect(memberDishWeight('aji', DISH_BY_ID.milktea, ctx)).toBeLessThan(memberDishWeight('dibi', DISH_BY_ID.milktea, ctx));
    const eve = { ...ctx, matchEve: true };
    expect(memberDishWeight('aji', DISH_BY_ID.luosifen, eve)).toBeGreaterThan(memberDishWeight('piegan', DISH_BY_ID.luosifen, eve));
  });

  it('老板动作用得上每个人的说法', () => {
    const s = createNewGame(1);
    s.actionPoints = 6;
    s.cash = 8000;
    const logs: string[] = [];
    const run = (id: string, targets: string[]) => {
      performAction(s, id, targets, { day: 1, minute: 11 * 60, log: (_l, text) => logs.push(text) });
    };
    run('milktea', []);
    run('scold', ['dangdeng']);
    run('praise', ['gouliang']);
    run('talk', ['piegan']);
    run('duo', ['gouliang', 'diaolong']);
    const text = logs.join('\n');
    expect(text).toContain('可乐');
    expect(text).toMatch(/急眼|指挥/);
    expect(text).toContain('【待定】');
    for (const word of BANNED) expect(text).not.toContain(word);
  });

  it('训练日看板上会出现人设事件', () => {
    let flavored = 0;
    let named = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = createNewGame(seed);
      s.clock.day = 3;
      const w = new World(s);
      for (let t = DAY_START; t < DAY_END; t += 1) {
        s.clock.minute = t;
        w.update(t, 1, false);
      }
      const text = s.eventLog.map((e) => e.text).join('\n');
      if (/出装|兜裆布|只玩一把|三分钟|外号|三角洲|辣条|奇迹团/.test(text)) flavored++;
      if (text.includes('【待定】')) named++;
      for (const word of BANNED) expect(text).not.toContain(word);
    }
    expect(flavored).toBeGreaterThanOrEqual(6);
    expect(named).toBeGreaterThanOrEqual(2);
  });

  it('有心结时能抽出拌嘴', () => {
    const state = createNewGame(4);
    state.relations['dangdeng|piegan'].knots.push({ cause: '上路甩锅', expireDay: 99 });
    let hit = 0;
    for (let day = 2; day <= 40; day++) {
      const beat = rollPersonaBeat({
        state,
        day,
        minute: 10 * 60 + 20,
        segment: 'morning',
        present: ROSTER.map((m) => m.id),
        bondOf: () => 40,
      });
      if (beat && (beat.text.includes('心结') || beat.text.includes('三分钟来一次') && beat.ids.includes('piegan') && beat.ids.includes('dangdeng'))) hit++;
    }
    expect(hit).toBeGreaterThan(0);
  });
});
