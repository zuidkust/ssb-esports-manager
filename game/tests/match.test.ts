import { describe, expect, it } from 'vitest';
import { draftPlayer, heroPool } from '../src/engine/draft';
import { combatStats, makeRng, simulateMatch, type EnginePlayer, type Slot, SLOTS } from '../src/engine/match';
import { mulberry32 } from '../src/core/rng';
import { createNewGame } from '../src/save/state';
import { playOurMatch } from '../src/sim/matchprep';
import { activeCombos } from '../src/sim/matchprep';
import { cuesFrom } from '../src/sim/script';
import { benchLines } from '../src/sim/script';
import { pairKey } from '../src/data/roster';
import { opponentForRound } from '../src/core/calendar';

function side(id: string, fit: number, fatigue = 0, stress = 30): EnginePlayer[] {
  const fitMap = Object.fromEntries(SLOTS.map((s) => [s, fit])) as Record<Slot, number>;
  return SLOTS.map((slot, i) => ({
    id: `${id}_${slot}`,
    name: `${id}${i}`,
    hero: '招牌',
    stats: { lane: 60, roam: 60, fight: 60, sense: 60, mech: 60, pool: 60, mental: 60 },
    fit: { ...fitMap },
    stress,
    fatigue,
  }));
}

function kdaOk(box: { side: 'A' | 'B'; k: number; d: number }[]) {
  const ak = box.filter((r) => r.side === 'A').reduce((s, r) => s + r.k, 0);
  const ad = box.filter((r) => r.side === 'A').reduce((s, r) => s + r.d, 0);
  const bk = box.filter((r) => r.side === 'B').reduce((s, r) => s + r.k, 0);
  const bd = box.filter((r) => r.side === 'B').reduce((s, r) => s + r.d, 0);
  expect(ak).toBe(bd);
  expect(bk).toBe(ad);
  expect(ak + bk).toBeGreaterThan(0);
}

describe('比赛引擎', () => {
  it('同一种子两遍，日志和比分一样', () => {
    const run = () => simulateMatch(side('a', 1), side('b', 1), { nameA: '甲', nameB: '乙' }, makeRng(42));
    const x = run();
    const y = run();
    expect(x.log.map((e) => e.s)).toEqual(y.log.map((e) => e.s));
    expect(x.killsA).toBe(y.killsA);
    expect(x.goldA).toBe(y.goldA);
    expect(x.win).toBe(y.win);
  });

  it('逐杀记账：A 的击杀等于 B 的死亡', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const m = simulateMatch(side('a', 1), side('b', 0.85, 20), { perkB: 'early' }, makeRng(seed * 97));
      kdaOk(m.box);
      expect(m.killsA).toBe(m.box.filter((r) => r.side === 'A').reduce((s, r) => s + r.k, 0));
      expect(m.log.some((e) => e.s.includes('比赛结束'))).toBe(true);
      expect(m.log.some((e) => e.t === 'nd')).toBe(true);
    }
  });

  it('位置适性差一截时，强的一边赢面明显更大', () => {
    let wins = 0;
    const n = 40;
    for (let i = 0; i < n; i++) {
      const m = simulateMatch(side('a', 1), side('b', 0.6), {}, makeRng(1000 + i));
      if (m.win === 'A') wins++;
    }
    expect(wins).toBeGreaterThan(n * 0.7);
  });

  it('疲劳和压力按公式扣分', () => {
    expect(combatStats({ ...side('p', 1)[0], aatroxAmp: true }, 1).lane).toBeCloseTo(60 * 1.3);
    expect(combatStats({ ...side('p', 1)[0], oneGame: true }, 1).lane).toBe(66);
    expect(combatStats({ ...side('p', 1)[0], oneGame: true }, 2).lane).toBe(60);
    expect(combatStats({ ...side('p', 1)[0], oneGame: true }, 3).lane).toBe(54);
  });

  it('心结会改变同一颗种子的结果；默契连招写进日志', () => {
    const base = side('a', 1);
    const knotted = base.map((p) => ({ ...p, knotMult: 0.85 }));
    const a = simulateMatch(base, side('b', 1), {}, makeRng(7));
    const b = simulateMatch(knotted, side('b', 1), {}, makeRng(7));
    expect(a.goldA === b.goldA && a.win === b.win && a.killsA === b.killsA).toBe(false);
    const combo = base.map((p, i) => (i < 2 ? { ...p, comboOn: ['lane'], comboTag: 'x', comboText: '测试组合' } : p));
    const c = simulateMatch(combo, side('b', 1), {}, makeRng(7));
    expect(c.log.some((e) => e.s.includes('【待定】'))).toBe(true);
  });
});

describe('选人与第二解说', () => {
  it('撇干英雄池没有石头人，上场只锁剑魔', () => {
    expect(heroPool('piegan')).not.toContain('石头人');
    expect(heroPool('gouliang').join(' ')).not.toMatch(/德莱文|滑板鞋|厄斐琉斯/);
    for (let i = 0; i < 20; i++) {
      const d = draftPlayer('piegan', mulberry32(i + 3));
      expect(d.hero).toBe('剑魔');
      expect(d.lines.join('')).toContain('石头人');
      expect(d.lines.join('')).toContain('+30%');
    }
  });

  it('撇干坐在台下时，弹幕池里有拒绝石头人', () => {
    expect(benchLines('piegan').some((s) => s.includes('石头人'))).toBe(true);
  });

  it('直播条目里有节点、解说和替补弹幕', () => {
    const s = createNewGame(3);
    s.lineup = { day: 2, slots: ['piegan', 'dangdeng', 'dibi', 'gouliang', 'diaolong'], tactic: 'engage' };
    const m = playOurMatch(s, 2, 1, s.lineup.slots, 'engage', opponentForRound('netcafe', 1));
    expect(m.log.some((e) => e.s.includes('石头人') && e.s.includes('剑魔'))).toBe(true);
    const cues = cuesFrom(m, 'aji', makeRng(9).next);
    expect(cues.some((c) => c.kind === 'node' || c.kind === 'result')).toBe(true);
    expect(cues.some((c) => c.kind === 'danmaku' && c.text.includes('第二解说') && c.text.includes('阿鸡'))).toBe(true);
    expect(cues.at(-1)?.kind).toBe('result');
  });

  it('铁哥们并且同时首发才挂上默契连招', () => {
    const s = createNewGame(1);
    const slots = ['aji', 'dangdeng', 'dibi', 'gouliang', 'diaolong'];
    expect(activeCombos(s, slots)).toEqual([]);
    s.relations[pairKey('gouliang', 'diaolong')].bond = 85;
    s.relations[pairKey('dibi', 'dangdeng')].bond = 84;
    const on = activeCombos(s, slots);
    expect(on.map((c) => c.tag)).toEqual([pairKey('gouliang', 'diaolong')]);
    expect(on[0].text).toContain('【待定】'.replace('【待定】', '') || '狗粮');
    expect(on[0].keys).toContain('lane');
    s.relations[pairKey('dibi', 'dangdeng')].bond = 85;
    expect(activeCombos(s, ['aji', 'dangdeng', 'dibi', 'gouliang', 'piegan']).some((c) => c.keys.includes('gank'))).toBe(true);
    expect(activeCombos(s, ['aji', 'dangdeng', 'dibi', 'piegan', 'diaolong']).some((c) => c.text.includes('狗粮'))).toBe(false);
  });
});
