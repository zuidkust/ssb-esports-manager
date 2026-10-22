import { describe, expect, it } from 'vitest';
import { dayInfo, nextMatch, offseasonDaysLeft, opponentForRound, MATCH_MINUTE, SEASON_DAYS } from '../src/core/calendar';

describe('赛季日历', () => {
  it('每 2 天一轮，14 轮后休赛 1 周', () => {
    expect(dayInfo(1).round).toBeNull();
    expect(dayInfo(2).round).toBe(1);
    expect(dayInfo(28).round).toBe(14);
    expect(dayInfo(29).offseason).toBe(true);
    expect(dayInfo(35).offseason).toBe(true);
    expect(dayInfo(36).season).toBe(2);
    expect(dayInfo(37).round).toBe(1);
    expect(SEASON_DAYS).toBe(35);
  });

  it('第 1 天是周一', () => {
    expect(dayInfo(1).weekdayCn).toBe('周一');
    expect(dayInfo(7).weekdayCn).toBe('周日');
  });

  it('休赛周从第 29 天起还剩 7 天，不是距下赛季首战的 8 天', () => {
    expect(offseasonDaysLeft(29)).toBe(7);
    expect(offseasonDaysLeft(35)).toBe(1);
    expect(offseasonDaysLeft(2)).toBe(0);
    expect(nextMatch(29, 600)?.inDays).toBe(8);
  });

  it('下一场比赛：比赛开打后算下一轮', () => {
    expect(nextMatch(2, 600)).toMatchObject({ day: 2, round: 1, inDays: 0 });
    expect(nextMatch(2, MATCH_MINUTE)).toMatchObject({ day: 4, round: 2 });
    expect(nextMatch(29, 600)).toMatchObject({ day: 37, round: 1 });
  });

  it('双循环：第 8 轮和第 1 轮是同一个对手', () => {
    expect(opponentForRound('netcafe', 8).id).toBe(opponentForRound('netcafe', 1).id);
  });
});
