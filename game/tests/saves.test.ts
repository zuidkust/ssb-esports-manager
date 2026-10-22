import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/save/platform';
import { SaveManager } from '../src/save/saves';
import { createNewGame, needsPrematch, SAVE_VERSION } from '../src/save/state';
import { PREMATCH_MINUTE } from '../src/core/calendar';
import { migrate, SaveError } from '../src/save/migrate';

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
    expect(s.version).toBe(3);
    expect(s.cash).toBe(4321);
    expect(s.record.wins).toBe(0);
    expect(s.bankrupt).toBe(false);
    expect(s.apDay).toBe(1);
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
    v1.roster = (v1.roster as { persona: Record<string, number> }[]).map((m) => {
      const { 爱睡觉: _, ...persona } = m.persona;
      return { ...m, persona };
    });
    const s = migrate(JSON.parse(JSON.stringify(v1)));
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.facilities).toEqual([]);
    expect(s.prematchConfirmedDay).toBe(0);
    expect(s.roster.find((m) => m.id === 'shidian')!.persona.爱睡觉).toBeGreaterThan(0);
  });
});
