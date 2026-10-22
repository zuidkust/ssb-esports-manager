import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/save/state';
import { performAction, previewAction } from '../src/sim/actions';
import { manageHtml } from '../src/ui/manage';
import { addKnot } from '../src/sim/relations';
import { actionPointMax } from '../src/data/economy';
import { World } from '../src/sim/world';
import { DAY_START } from '../src/core/clock';

function act(state: ReturnType<typeof createNewGame>, id: string, targets: string[], day: number, minute = 10 * 60) {
  const logs: string[] = [];
  const r = performAction(state, id, targets, {
    day,
    minute,
    log: (_level, text) => logs.push(text),
  });
  return { ...r, logs };
}

describe('老板动作', () => {
  it('行动点不够就做不了，也不会扣成负数', () => {
    const s = createNewGame(1);
    s.actionPoints = 3;
    expect(act(s, 'rest', [], 1).ok).toBe(true);
    expect(s.actionPoints).toBe(0);
    const again = act(s, 'milktea', [], 1);
    expect(again.ok).toBe(false);
    expect(s.actionPoints).toBe(0);
    expect(s.cash).toBe(5000);
  });

  it('比赛日行动点上限是平日 +1', () => {
    const s = createNewGame(2);
    s.clock.day = 2;
    s.clock.minute = DAY_START;
    new World(s).update(DAY_START, 0, true);
    expect(s.actionPoints).toBe(actionPointMax(0, true));
    expect(s.actionPoints).toBe(4);
  });

  it('比赛日池子停在 3、当天还没花过时，会补成 4/4', () => {
    const s = createNewGame(2);
    s.clock.day = 2;
    s.clock.minute = DAY_START;
    s.apDay = 2;
    s.actionPoints = 3;
    new World(s).update(DAY_START, 0, true);
    expect(s.actionPoints).toBe(4);
  });

  it('当天已经花过行动点，不会再把比赛日上限补回去', () => {
    const s = createNewGame(2);
    s.clock.day = 2;
    s.apDay = 2;
    s.actionPoints = 2;
    s.actionHistory.push({ action: 'talk', day: 2 });
    new World(s).update(DAY_START, 0, true);
    expect(s.actionPoints).toBe(2);
  });

  it('单独谈话对同一个人有冷却', () => {
    const s = createNewGame(3);
    s.actionPoints = 5;
    const id = s.roster[0].id;
    expect(act(s, 'talk', [id], 1).ok).toBe(true);
    expect(act(s, 'talk', [id], 2).ok).toBe(false);
    expect(previewAction(s, 'talk', [id], 2, 600).reason).toMatch(/等/);
    expect(act(s, 'talk', [id], 3).ok).toBe(true);
  });

  it('同一动作 7 天内第 4 次反噬，滑出窗口后恢复', () => {
    const s = createNewGame(4);
    s.actionPoints = 8;
    s.cash = 5000;
    const mood = () => s.roster[0].status.心情;
    const base = mood();
    expect(act(s, 'milktea', [], 1).ok).toBe(true);
    expect(mood()).toBe(base + 6);
    expect(act(s, 'milktea', [], 1).ok).toBe(true);
    expect(mood()).toBe(base + 10);
    expect(act(s, 'milktea', [], 1).ok).toBe(true);
    expect(mood()).toBe(base + 12);
    const fourth = act(s, 'milktea', [], 1);
    expect(fourth.ok).toBe(true);
    expect(mood()).toBeLessThan(base + 12);
    expect(fourth.logs.some((t) => /老板又来了|用得太勤|第四次|没人接话/.test(t))).toBe(true);
    expect(s.cash).toBe(5000 - 150 * 4);

    s.actionPoints = 2;
    const later = mood();
    expect(act(s, 'milktea', [], 8).ok).toBe(true);
    expect(mood()).toBe(later + 6);
  });

  it('小办公室才解锁的动作在网吧做不了', () => {
    const s = createNewGame(5);
    s.actionPoints = 5;
    const r = previewAction(s, 'review', [], 1, 600);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/小办公室/);
  });

  it('城市联赛请奶茶按两倍现金', () => {
    const s = createNewGame(6);
    s.actionPoints = 2;
    s.season.tier = 'city';
    s.cash = 1000;
    expect(act(s, 'milktea', [], 1).ok).toBe(true);
    expect(s.cash).toBe(700);
  });

  it('今天我请只占行动点，不预扣 200', () => {
    const s = createNewGame(7);
    s.actionPoints = 2;
    const r = act(s, 'host', [], 1, 10 * 60);
    expect(r.ok).toBe(true);
    expect(s.cash).toBe(5000);
    expect(s.flags.hostDay).toBe(1);
    expect(s.flags.hostMeal).toBe('lunch');
    expect(s.actionPoints).toBe(1);
  });

  it('连续请奶茶不会连着三句一样', () => {
    const s = createNewGame(5);
    s.actionPoints = 6;
    s.cash = 10000;
    const lines = [0, 1, 2].map(() => act(s, 'milktea', [], 1, 11 * 60).logs[0]);
    expect(new Set(lines).size).toBe(3);
    expect(lines.join('')).not.toContain('价格待定');
  });

  it('没买白板不能开复盘会', () => {
    const s = createNewGame(4);
    s.venueLevel = 1;
    s.actionPoints = 4;
    const blocked = previewAction(s, 'review', [], 1, 11 * 60);
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toContain('白板');
    s.facilities.push('whiteboard');
    expect(previewAction(s, 'review', [], 1, 11 * 60).ok).toBe(true);
  });

  it('经营面板不出现开发用语，设施只列当前场地', () => {
    const s = createNewGame(3);
    s.venueLevel = 1;
    s.cash = 100;
    s.actionPoints = 4;
    const html = manageHtml(new World(s), [s.roster[0].id, s.roster[1].id]);
    expect(html).not.toContain('价格待定');
    expect(html).toContain('要先买白板');
    expect(html).toContain('私房钱');
    expect(html).toContain('抽成把公司账上的现金转进老板自己的私房钱');
    expect(html).toContain('现金不够');
    expect(html).toContain('白板（复盘）');
    expect(html).not.toContain('零食柜');
    expect(html).toContain('电竞基地之后才解锁');
    const net = createNewGame(3);
    net.cash = 100;
    const netHtml = manageHtml(new World(net), [net.roster[0].id, net.roster[1].id]);
    expect(netHtml).toContain('零食柜');
    expect(netHtml).not.toContain('白板（复盘）');
  });

  it('没有心结不能调解', () => {
    const s = createNewGame(8);
    s.actionPoints = 4;
    const a = s.roster[0].id;
    const b = s.roster[1].id;
    expect(act(s, 'mediate', [a, b], 1).ok).toBe(false);
    addKnot(s, a, b, '测试', 1);
    expect(act(s, 'mediate', [a, b], 1).ok).toBe(true);
  });
});
