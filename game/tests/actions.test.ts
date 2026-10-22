import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/save/state';
import { performAction, previewAction } from '../src/sim/actions';
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
