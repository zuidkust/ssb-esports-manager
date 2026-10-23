import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/core/rng';
import { createNewGame, type GameState } from '../src/save/state';
import { ROSTER_BY_ID } from '../src/data/roster';
import { pairKey } from '../src/data/roster';
import type { EventContext, EventMember, LibraryEvent } from '../src/sim/events/types';
import { tryLibraryEvent } from '../src/sim/events/engine';

function membersOf(state: GameState): EventMember[] {
  return state.roster.map((m) => {
    const def = ROSTER_BY_ID[m.id];
    return {
      id: m.id,
      name: def.name,
      position: def.position,
      present: true,
      slacking: false,
      sleeping: false,
      early: true,
      late: false,
      bench: false,
      activity: 'team',
      ability: m.ability,
      persona: m.persona,
      status: m.status,
      scrim: m.scrim,
    };
  });
}

function context(state: GameState, over: Partial<EventContext> = {}): EventContext {
  const members = membersOf(state);
  return {
    day: 3,
    minute: 15 * 60,
    segment: 'team',
    lastSegment: 'lunch',
    members,
    present: members.slice(),
    starters: members.slice(0, 5).map((m) => m.id),
    relations: state.relations,
    overtimeYesterday: false,
    nextMatchDays: 1,
    nextMatchHours: 20,
    events: state.events,
    rand: mulberry32(1),
    ...over,
  };
}

function ev(over: Partial<LibraryEvent> = {}): LibraryEvent {
  return {
    id: 'test',
    name: '测试事件',
    category: '对局',
    level: '有趣',
    weight: 1,
    cooldownMin: 60,
    roles: [{ key: '主角', kind: 'fixed', id: 'aji' }],
    conditions: [],
    texts: ['{主角} 测试。'],
    effects: [],
    chains: [],
    flags: [],
    ...over,
  };
}

describe('事件引擎：角色绑定', () => {
  it('固定成员不在场就不触发；在场就替换占位符', () => {
    const s = createNewGame(1);
    const ctx = context(s);
    expect(tryLibraryEvent(s, ctx, [ev()])).toMatchObject({ text: '阿鸡 测试。', ids: ['aji'] });
    const away = context(s, { present: membersOf(s).filter((m) => m.id !== 'aji') });
    expect(tryLibraryEvent(s, away, [ev()])).toBeNull();
  });

  it('摸鱼者只从正在摸鱼的人里挑', () => {
    const s = createNewGame(2);
    const members = membersOf(s).map((m) => ({ ...m, slacking: m.id === 'gouliang' }));
    const ctx = context(s, { members, present: members });
    const hit = tryLibraryEvent(s, ctx, [
      ev({ roles: [{ key: '摸鱼者', kind: 'slacker' }], texts: ['{摸鱼者} 在摸鱼。'] }),
    ]);
    expect(hit?.ids).toEqual(['gouliang']);
  });

  it('甲/乙绑定两个不同的人', () => {
    const s = createNewGame(3);
    const hit = tryLibraryEvent(s, context(s), [
      ev({ roles: [{ key: '甲', kind: 'any' }, { key: '乙', kind: 'other' }], texts: ['{甲} 和 {乙}。'] }),
    ]);
    expect(hit?.ids).toHaveLength(2);
    expect(hit!.ids[0]).not.toBe(hit!.ids[1]);
  });
});

describe('事件引擎：条件', () => {
  it('状态/性格/属性/act/时间/在场', () => {
    const s = createNewGame(4);
    s.roster.find((m) => m.id === 'aji')!.status.心情 = 80;
    const good = ev({
      conditions: [
        { k: 'stat', who: '主角', key: '心情', op: '>=', v: 70 },
        { k: 'persona', who: '主角', key: '创新欲', op: '>=', v: 80 },
        { k: 'ability', who: '主角', key: 'pool', op: '>=', v: 70 },
        { k: 'act', who: '主角', values: ['team'] },
        { k: 'time', from: 14 * 60, to: 16 * 60 },
        { k: 'present', ids: ['aji', 'dangdeng'] },
      ],
    });
    expect(tryLibraryEvent(s, context(s), [good])).not.toBeNull();
    expect(tryLibraryEvent(s, context(s, { minute: 9 * 60 }), [good])).toBeNull();
  });

  it('排位结果/连胜、关系、flag、rand、赛程', () => {
    const s = createNewGame(5);
    const aji = s.roster.find((m) => m.id === 'aji')!;
    aji.scrim.last = 'win';
    aji.scrim.streak = 3;
    s.relations[pairKey('aji', 'dangdeng')].bond = 70;
    s.events.lastFiredDay['setup'] = 2;
    const e = ev({
      conditions: [
        { k: 'scrimResult', who: '主角', v: 'win' },
        { k: 'scrimStreak', who: '主角', op: '>=', v: 3 },
        { k: 'bond', a: '主角', b: 'dangdeng', op: '>=', v: 60 },
        { k: 'flag', id: 'setup', days: 3 },
        { k: 'rand', p: 1 },
        { k: 'daysToMatch', op: '<=', v: 2 },
      ],
    });
    expect(tryLibraryEvent(s, context(s), [e])).not.toBeNull();
    s.events.lastFiredDay['setup'] = -10;
    expect(tryLibraryEvent(s, context(s), [e])).toBeNull();
  });
});

describe('事件引擎：效果', () => {
  it('状态/性格/属性/关系/名声/心得都写进存档', () => {
    const s = createNewGame(6);
    const aji = s.roster.find((m) => m.id === 'aji')!;
    const before = { mood: aji.status.心情, bond: s.relations[pairKey('aji', 'dangdeng')].bond };
    s.insight = 10;
    const e = ev({
      effects: [
        { k: 'status', key: '心情', d: 10, who: '主角' },
        { k: 'persona', key: '创新欲', d: 5, who: '主角' },
        { k: 'ability', key: 'pool', d: 2, who: '主角' },
        { k: 'bond', a: '主角', b: 'dangdeng', d: 4 },
        { k: 'fame', d: 2 },
        { k: 'insight', d: 3 },
      ],
    });
    expect(tryLibraryEvent(s, context(s), [e])).not.toBeNull();
    expect(aji.status.心情).toBe(before.mood + 10);
    expect(s.relations[pairKey('aji', 'dangdeng')].bond).toBe(before.bond + 4);
    expect(s.record.fame).toBe(2);
    expect(s.insight).toBe(13);
  });

  it('负关系变成心结；bondAll 覆盖全员', () => {
    const s = createNewGame(7);
    const e = ev({
      roles: [{ key: '主角', kind: 'fixed', id: 'aji' }, { key: '全员', kind: 'all' }],
      effects: [{ k: 'bondAll', who: 'all', d: -1 }],
    });
    expect(tryLibraryEvent(s, context(s), [e])).not.toBeNull();
    const knots = Object.values(s.relations).filter((r) => r.knots.length > 0);
    expect(knots.length).toBeGreaterThan(0);
  });
});

describe('事件引擎：冷却与连锁', () => {
  it('冷却内不再触发，冷却过后可以', () => {
    const s = createNewGame(8);
    const e = ev({ cooldownMin: 60 });
    expect(tryLibraryEvent(s, context(s), [e])).not.toBeNull();
    expect(tryLibraryEvent(s, context(s), [e])).toBeNull();
    expect(tryLibraryEvent(s, context(s, { minute: 16 * 60 + 1 }), [e])).not.toBeNull();
  });

  it('chainNext 会提高目标事件的下一次权重', () => {
    const s = createNewGame(9);
    const a = ev({ id: 'a', name: 'A', weight: 100, chains: [{ id: 'b', pct: 500 }], cooldownMin: 1000 });
    const b = ev({ id: 'b', name: 'B', weight: 1, texts: ['B'] });
    expect(tryLibraryEvent(s, context(s), [a, b])?.id).toBe('a');
    expect(s.events.boosts.b.pct).toBe(500);
    expect(tryLibraryEvent(s, context(s, { minute: 15 * 60 + 2 }), [a, b])?.id).toBe('b');
  });

  it('flag 记录触发日', () => {
    const s = createNewGame(10);
    tryLibraryEvent(s, context(s), [ev({ id: 'flag_test' })]);
    expect(s.events.lastFiredDay.flag_test).toBe(3);
  });
});
