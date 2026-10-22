import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { preferenceMul } from '../src/data/voice';
import { bossLine } from '../src/data/voice';
import { COMBOS, INITIAL_BOND, ROSTER, ROSTER_BY_ID, pairKey, positionFit } from '../src/data/roster';
import { DISH_BY_ID } from '../src/data/takeout';
import { mulberry32 } from '../src/core/rng';
import { createNewGame } from '../src/save/state';
import { performAction } from '../src/sim/actions';
import { addKnot } from '../src/sim/relations';
import { tryPersonaEvent } from '../src/sim/personaEvents';
import { resolveMeal, type TakeoutPerson } from '../src/sim/takeout';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|mjs|md|html|css)$/.test(name)) out.push(p);
  }
  return out;
}

describe('开局阵容', () => {
  it('正式名、位置和两对未命名连招', () => {
    expect(ROSTER.map((m) => m.name)).toEqual(['阿鸡', '当邓', '狗粮', '弟必', '吊隆', '撇干']);
    expect(ROSTER_BY_ID.aji.position).toBe('top');
    expect(ROSTER_BY_ID.aji.secondary).toBe('jungle');
    expect(positionFit(ROSTER_BY_ID.aji, 'mid')).toBe(0.75);
    expect(ROSTER_BY_ID.dangdeng.position).toBe('jungle');
    expect(ROSTER_BY_ID.gouliang.position).toBe('adc');
    expect(ROSTER_BY_ID.gouliang.secondary).toBeUndefined();
    expect(ROSTER_BY_ID.dibi.position).toBe('mid');
    expect(ROSTER_BY_ID.diaolong.name).toBe('吊隆');
    expect(ROSTER_BY_ID.piegan.position).toBe('top');
    expect(ROSTER_BY_ID.piegan.heroes).toContain('剑魔');
    expect(ROSTER_BY_ID.piegan.heroes).not.toContain('石头人');
    expect(ROSTER_BY_ID.piegan.draft?.neverPicks).toEqual(['石头人']);
    expect(ROSTER_BY_ID.piegan.draft?.teamWants).toEqual(['石头人']);
    expect(ROSTER.filter((m) => m.id !== 'piegan').every((m) => !m.draft?.neverPicks.includes('石头人'))).toBe(true);
    expect(COMBOS.map((c) => c.name)).toEqual(['【待定】', '【待定】']);
    expect(COMBOS.map((c) => pairKey(c.a, c.b)).sort()).toEqual(['dangdeng|dibi', 'diaolong|gouliang'].sort());
    for (const n of Object.values(INITIAL_BOND)) {
      expect(n).toBeGreaterThanOrEqual(42);
      expect(n).toBeLessThanOrEqual(55);
    }
    expect(INITIAL_BOND[pairKey('aji', 'dangdeng')]).toBeGreaterThanOrEqual(INITIAL_BOND[pairKey('dibi', 'piegan')]);
  });

  it('本命外卖：阿鸡不喝奶茶，当邓偏向汉堡炸鸡，吊隆不吃内脏标签', () => {
    const ctxDish = DISH_BY_ID;
    expect(preferenceMul('aji', ctxDish.milktea)).toBe(0);
    expect(preferenceMul('aji', ctxDish.huangmen)).toBe(1);
    expect(preferenceMul('dangdeng', ctxDish.friedchicken)).toBeGreaterThan(preferenceMul('dangdeng', ctxDish.salad));
    expect(preferenceMul('diaolong', ctxDish.pigfoot)).toBeGreaterThan(0);
    expect(ROSTER_BY_ID.diaolong.taste.avoidTags).toContain('内脏');
    expect(ROSTER_BY_ID.gouliang.heroNote).toContain('德莱文');
  });
});

describe('人设事件', () => {
  it('在场的人能打出互怼、背锅和未命名连招，同一段冷却内不连发', () => {
    const s = createNewGame(3);
    const present = ROSTER.map((m) => m.id);
    let first: ReturnType<typeof tryPersonaEvent> = null;
    for (let minute = 15 * 60; minute < 17 * 60 && !first; minute += 20) first = tryPersonaEvent(s, present, 'team', 3, minute);
    expect(first).not.toBeNull();
    expect(first!.text.length).toBeGreaterThan(4);
    const again = tryPersonaEvent(s, present, 'team', 3, 15 * 60);
    if (again && first) expect(again.id).not.toBe(first.id);
    const texts = new Set<string>();
    for (let day = 1; day <= 6; day++) {
      for (const minute of [10 * 60, 12 * 60, 15 * 60, 16 * 60, 20 * 60]) {
        const hit = tryPersonaEvent(s, present, minute >= 14 * 60 + 30 && minute < 18 * 60 ? 'team' : 'free', day, minute);
        if (hit) texts.add(hit.id);
      }
    }
    expect([...texts].some((id) => id.startsWith('banter_') || id.startsWith('blame_') || id.startsWith('combo:') || id === 'scrim')).toBe(true);
  });

  it('有心结时会写到看板上，弟必在场可以当和事佬', () => {
    const s = createNewGame(8);
    addKnot(s, 'aji', 'dangdeng', '出装', 1);
    let saw = false;
    for (let day = 1; day <= 8 && !saw; day++) {
      for (let minute = 15 * 60; minute <= 17 * 60; minute += 20) {
        const hit = tryPersonaEvent(s, ['aji', 'dangdeng', 'dibi'], 'team', day, minute);
        if (hit?.id.startsWith('knot:')) {
          saw = true;
          expect(hit.text).toContain('出装');
          expect(hit.ids).toEqual(expect.arrayContaining(['aji', 'dangdeng']));
        }
      }
    }
    expect(saw).toBe(true);
  });

  it('老板批评和请奶茶用得上每个人的反应', () => {
    const rand = mulberry32(1);
    for (const m of ROSTER) {
      expect(bossLine('scold', m.id, rand)).toBeTruthy();
      expect(bossLine('praise', m.id, rand)).toBeTruthy();
      expect(bossLine('talk', m.id, rand)).toBeTruthy();
    }
    expect(bossLine('milktea', 'aji', rand)).toMatch(/可乐/);
    const s = createNewGame(2);
    s.actionPoints = 3;
    const logs: string[] = [];
    performAction(s, 'milktea', [], { day: 1, minute: 600, log: (_l, text) => logs.push(text) });
    expect(logs.join('')).toMatch(/可乐/);
    performAction(s, 'scold', ['dangdeng'], { day: 1, minute: 610, log: (_l, text) => logs.push(text) });
    expect(logs.join('')).toMatch(/当邓/);
  });

  it('当邓点汉堡炸鸡时外卖动态会提他的本命', () => {
    let saw = false;
    for (let seed = 1; seed <= 40 && !saw; seed++) {
      const state = createNewGame(seed);
      const people: TakeoutPerson[] = state.roster.map((m) => ({
        id: m.id,
        name: ROSTER_BY_ID[m.id].name,
        persona: { 摸鱼倾向: 80, 话痨: 50 },
        status: { 饥饿: 90, 心情: 70 },
        late: false,
      }));
      const r = resolveMeal({ state, people, day: 3, meal: 'lunch', place: '网吧角落' });
      const dang = r.record.orders.find((o) => o.memberId === 'dangdeng' && (o.dishId === 'friedchicken' || o.dishId === 'mcd'));
      if (!dang) continue;
      if (r.logs.some((l) => l.ids.includes('dangdeng') && /汉堡|炸鸡/.test(l.text))) saw = true;
    }
    expect(saw).toBe(true);
  });
});

describe('旧昵称不进现行代码', () => {
  it('game/src 里除了迁移表，不再出现旧名', () => {
    const root = fileURLToPath(new URL('../src', import.meta.url));
    const banned = /施颠|地鼠|批菊|吊龙|shidian|dishu|piju|如何评价|鉴黄师|中转上可惜了/;
    const hits: string[] = [];
    for (const file of walk(root)) {
      if (file.endsWith('legacy.ts')) continue;
      const text = readFileSync(file, 'utf8');
      if (banned.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});
