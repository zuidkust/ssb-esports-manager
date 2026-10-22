import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/save/platform';
import { formatWallStamp, formatWallTime, SaveManager } from '../src/save/saves';
import { createNewGame, needsPrematch, SAVE_VERSION } from '../src/save/state';
import { PREMATCH_MINUTE } from '../src/core/calendar';
import { migrate, SaveError } from '../src/save/migrate';
import { pairKey } from '../src/data/roster';

describe('存档', () => {
  it('保存后读回内容一致', () => {
    const m = new SaveManager(new MemoryStore());
    const s = createNewGame(42);
    s.clock.day = 5;
    s.cash = 1234;
    m.save('1', s);
    const back = m.load('1')!;
    expect(back.clock.day).toBe(5);
    expect(back.cash).toBe(1234);
    expect(back.roster).toHaveLength(6);
  });

  it('槽位列表和“继续游戏”选最近保存的', async () => {
    const m = new SaveManager(new MemoryStore());
    m.save('2', createNewGame(1));
    await new Promise((r) => setTimeout(r, 5));
    m.save('auto', createNewGame(2));
    expect(m.latest()).toBe('auto');
    expect(m.list().find((i) => i.slot === '3')!.empty).toBe(true);
    expect(m.info('2').label).toMatch(/第 1 赛季 第 1 天 周一 09:00/);
  });

  it('导出再导入得到同一个存档', () => {
    const s = createNewGame(7);
    s.insight = 99;
    const back = SaveManager.importText(SaveManager.exportText(s));
    expect(back.seed).toBe(7);
    expect(back.insight).toBe(99);
  });

  it('拒绝坏文件、未来版本', () => {
    expect(() => SaveManager.importText('not json')).toThrow(SaveError);
    expect(() => migrate({ hello: 1 })).toThrow(SaveError);
    expect(() => migrate({ ...createNewGame(1), version: SAVE_VERSION + 1 })).toThrow(/更新的版本/);
    expect(() => migrate({ ...createNewGame(1), roster: [] })).toThrow(SaveError);
  });

  it('损坏的槽位不会让列表崩掉', () => {
    const store = new MemoryStore();
    store.set('ssb-esports-manager/save/3', '{broken');
    const m = new SaveManager(store);
    expect(m.info('3').label).toBe('存档损坏');
    expect(m.latest()).toBeNull();
  });
});

describe('读档与赛前确认', () => {
  const at1830 = () => {
    const s = createNewGame(3);
    s.clock.day = 2; // 第 1 轮比赛日
    s.clock.minute = PREMATCH_MINUTE;
    return s;
  };

  it('18:30 暂停中没确认就存档：读档后仍要弹首发确认', () => {
    const m = new SaveManager(new MemoryStore());
    m.save('auto', at1830());
    const back = m.load('auto')!;
    expect(needsPrematch(back, back.clock.day, back.clock.minute)).toBe(true);
  });

  it('确认过的比赛日写进存档，读档后不再弹', () => {
    const m = new SaveManager(new MemoryStore());
    const s = at1830();
    s.prematchConfirmedDay = 2;
    m.save('auto', s);
    const back = m.load('auto')!;
    expect(needsPrematch(back, back.clock.day, back.clock.minute)).toBe(false);
    // 下一个比赛日照常要确认
    expect(needsPrematch(back, 4, PREMATCH_MINUTE)).toBe(true);
  });

  it('只在比赛日 18:30–19:00 之间弹', () => {
    const s = createNewGame(3);
    expect(needsPrematch(s, 1, PREMATCH_MINUTE)).toBe(false); // 第 1 天不是比赛日
    expect(needsPrematch(s, 2, PREMATCH_MINUTE - 1)).toBe(false);
    expect(needsPrematch(s, 2, 19 * 60)).toBe(false);
    expect(needsPrematch(s, 2, 18 * 60 + 45)).toBe(true);
  });
});

describe('战队成立的时间', () => {
  it('写在第 1 天 09:00，不跟玩家进游戏的时刻走', () => {
    const s = createNewGame(4);
    s.clock.day = 6;
    s.clock.minute = 14 * 60 + 5;
    const founding = s.eventLog.find((e) => e.text.includes('战队今天正式成立'));
    expect(founding?.day).toBe(1);
    expect(founding?.minute).toBe(9 * 60);
  });
});

describe('存档迁移 v2 → v3', () => {
  it('补上经济字段，并把成立动态改回第 1 天早上，现金不动', () => {
    const raw = createNewGame(9) as unknown as Record<string, unknown>;
    raw.version = 2;
    raw.cash = 4321;
    delete raw.bankrupt;
    delete raw.apDay;
    delete raw.meals;
    delete raw.record;
    delete raw.flags;
    const log = raw.eventLog as { text: string; day: number; minute: number }[];
    const founding = log.find((e) => e.text.includes('战队今天正式成立'))!;
    founding.day = 3;
    founding.minute = 14 * 60 + 5;
    const s = migrate(JSON.parse(JSON.stringify(raw)));
    expect(s.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(4);
    expect(s.cash).toBe(4321);
    expect(s.record.wins).toBe(0);
    expect(s.bankrupt).toBe(false);
    expect(s.apDay).toBe(0);
    expect(s.meals.day).toBe(1);
    expect(s.flags.restDay).toBe(0);
    const back = s.eventLog.find((e) => e.text.includes('战队今天正式成立'))!;
    expect(back.day).toBe(1);
    expect(back.minute).toBe(9 * 60);
  });
});

describe('存档迁移 v1 → v2', () => {
  it('补上设施、赛前确认标记和“爱睡觉”', () => {
    const v1 = createNewGame(5) as unknown as Record<string, unknown>;
    delete v1.facilities;
    delete v1.prematchConfirmedDay;
    v1.version = 1;
    delete v1.apDay;
    delete v1.meals;
    delete v1.record;
    delete v1.flags;
    delete v1.bankrupt;
    v1.roster = (v1.roster as { persona: Record<string, number> }[]).map((m) => {
      const { 爱睡觉: _, ...persona } = m.persona;
      return { ...m, persona };
    });
    const s = migrate(JSON.parse(JSON.stringify(v1)));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.facilities).toEqual([]);
    expect(s.prematchConfirmedDay).toBe(0);
    expect(s.roster.find((m) => m.id === 'aji')!.persona.爱睡觉).toBeGreaterThan(0);
    expect(s.apDay).toBe(0);
    expect(s.actionPoints).toBe(3);
    expect(s.meals.day).toBe(1);
  });
});

describe('存档时间', () => {
  it('列表和导出文件名用本地墙钟，不用 UTC 的 Z', () => {
    const ms = Date.UTC(2026, 5, 15, 16, 45);
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    expect(formatWallTime(ms)).toBe(local);
    expect(formatWallStamp(ms)).toBe(local.replace(/[-: ]/g, ''));
    const name = SaveManager.exportFilename(createNewGame(1), ms);
    expect(name).toContain(formatWallStamp(ms));
    expect(name.endsWith('.json')).toBe(true);
    expect(name.includes('Z')).toBe(false);
    const utc = new Date(ms).toISOString().slice(0, 16).replace(/[-:T]/g, '');
    if (d.getTimezoneOffset() !== 0) expect(name.includes(utc)).toBe(false);
  });
});

describe('存档迁移 v3 → v4', () => {
  it('旧 id 和旧昵称改成正式名，能力按人设稿重写', () => {
    const raw = createNewGame(3) as unknown as Record<string, unknown>;
    raw.version = 3;
    const back: Record<string, string> = { aji: 'shidian', gouliang: 'dishu', piegan: 'piju' };
    const roster = raw.roster as { id: string; ability: { pool: number } }[];
    for (const m of roster) {
      if (back[m.id]) m.id = back[m.id];
      if (m.id === 'shidian') m.ability.pool = 60;
    }
    const relations = raw.relations as Record<string, { bond: number; knots: { cause: string; expireDay: number }[]; unlocked: string[] }>;
    const rewritten: typeof relations = {};
    for (const [key, rel] of Object.entries(relations)) {
      const nk = key.split('|').map((id) => back[id] ?? id).sort().join('|');
      rewritten[nk] = rel;
    }
    rewritten['dangdeng|shidian'].knots = [{ cause: '施颠的出装', expireDay: 9 }];
    raw.relations = rewritten;
    const flags = raw.flags as { duoA: string; duoB: string };
    flags.duoA = 'shidian';
    flags.duoB = 'piju';
    raw.actionHistory = [
      { action: 'talk', target: 'shidian', day: 1 },
      { action: 'duo', target: 'piju|shidian', day: 1 },
    ];
    raw.cooldowns = { 'act:talk:dishu': 9, 'act:duo:dangdeng|shidian': 4 };
    const log = raw.eventLog as { text: string; ids: string[] }[];
    log.push({ id: 9, day: 1, minute: 600, level: '日常', text: '施颠穿着人字拖，地鼠说了一句，吊龙和批菊在看。', ids: ['shidian', 'dishu', 'diaolong', 'piju'] } as unknown as { text: string; ids: string[] });
    raw.meals = {
      day: 1,
      morning: [{ memberId: 'piju', dishId: 'jianbing' }],
      lunch: {
        meal: 'lunch',
        orders: [{ memberId: 'shidian', dishId: 'huangmen', price: 22, payer: 'self', deliveredAt: 1, eatUntil: 2, delivery: true }],
        effects: [{ at: 1, status: [{ id: 'dishu', 心情: 1 }], social: [{ type: 'knot', a: 'piju', b: 'shidian', cause: '批菊甩锅' }], applied: false }],
        chains: [],
      },
    };
    const s = migrate(JSON.parse(JSON.stringify(raw)));
    expect(s.version).toBe(4);
    expect(s.roster.map((m) => m.id).sort()).toEqual(['aji', 'dangdeng', 'diaolong', 'dibi', 'gouliang', 'piegan']);
    expect(s.roster.find((m) => m.id === 'aji')!.ability.pool).toBeGreaterThan(60);
    expect(s.flags.duoA).toBe('aji');
    expect(s.flags.duoB).toBe('piegan');
    expect(s.relations['aji|dangdeng']!.bond).toBeGreaterThan(0);
    expect(s.relations['aji|dangdeng']!.knots[0].cause).toBe('阿鸡的出装');
    expect(s.relations['dangdeng|shidian']).toBeUndefined();
    expect(s.cooldowns['act:talk:gouliang']).toBe(9);
    expect(s.cooldowns['act:duo:aji|dangdeng']).toBe(4);
    expect(s.actionHistory.map((h) => h.target)).toEqual(['aji', pairKey('aji', 'piegan')]);
    const line = s.eventLog.find((e) => e.text.includes('人字拖'))!;
    expect(line.text).toContain('阿鸡');
    expect(line.text).toContain('狗粮');
    expect(line.text).toContain('吊隆');
    expect(line.text).toContain('撇干');
    expect(line.text).not.toMatch(/施颠|地鼠|吊龙|批菊/);
    expect(line.ids).toEqual(['aji', 'gouliang', 'diaolong', 'piegan']);
    expect(s.meals.morning[0].memberId).toBe('piegan');
    expect(s.meals.lunch?.orders[0].memberId).toBe('aji');
    expect(s.meals.lunch?.effects[0].status[0].id).toBe('gouliang');
    expect(s.meals.lunch?.effects[0].social[0]).toMatchObject({ a: 'piegan', b: 'aji', cause: '撇干甩锅' });
  });
});
