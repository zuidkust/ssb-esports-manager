import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/save/platform';
import { SaveManager } from '../src/save/saves';
import { createNewGame, SAVE_VERSION } from '../src/save/state';
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
    expect(m.info('2').label).toMatch(/第 1 赛季 第 1 天 周一 08:30/);
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
