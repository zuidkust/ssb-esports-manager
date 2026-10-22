import { describe, expect, it } from 'vitest';
import { orderedLog, visibleLogText } from '../src/ui/board';
import type { LogEntry } from '../src/save/state';

describe('事件看板', () => {
  it('正文开头不再重复时刻', () => {
    expect(visibleLogText(9 * 60, '09:00，上班。有人在单排，有人在刷手机。')).toBe('上班。有人在单排，有人在刷手机。');
    expect(visibleLogText(9 * 60, '上班了。有人在单排。')).toBe('上班了。有人在单排。');
  });

  it('跳时间之后战队成立仍跟在同一天里，不会插到更晚的日子下面', () => {
    const entries: LogEntry[] = [
      { id: 8, day: 1, minute: 12 * 60, level: '日常', text: '午饭', ids: [] },
      { id: 9, day: 28, minute: 9 * 60, level: '有趣', text: '今天比赛日', ids: [] },
      { id: 1, day: 1, minute: 9 * 60, level: '剧情', text: 'SSB 战队今天正式成立。', ids: [] },
    ];
    const ordered = orderedLog(entries);
    expect(ordered.map((e) => e.id)).toEqual([9, 8, 1]);
    const day1 = ordered.filter((e) => e.day === 1);
    expect(day1.map((e) => e.id)).toEqual([8, 1]);
    expect(ordered.findIndex((e) => e.day === 28)).toBeLessThan(ordered.findIndex((e) => e.text.includes('成立')));
  });
});
