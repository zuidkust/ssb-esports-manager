import { describe, expect, it } from 'vitest';
import { opponentForRound } from '../src/core/calendar';
import { createNewGame, needsLineupConfirm, needsPrematch } from '../src/save/state';
import { PREMATCH_MINUTE } from '../src/core/calendar';
import { signSponsor } from '../src/sim/economy';
import { autoLineup, validLineup } from '../src/sim/lineup';
import { commitRound, enterDay, finishSeason, ourRank, roundPairs, standings, tierMove, winsNeeded } from '../src/sim/league';

describe('联赛赛程', () => {
  it('14 轮双循环，每轮 8 人各打一场，玩家对手和日历一致', () => {
    const seen = new Map<string, number>();
    for (let round = 1; round <= 14; round++) {
      const pairs = roundPairs('netcafe', round);
      expect(pairs).toHaveLength(4);
      const ids = pairs.flat();
      expect(new Set(ids).size).toBe(8);
      const foe = pairs.find((p) => p[0] === 'ssb')![1];
      expect(foe).toBe(opponentForRound('netcafe', round).id);
      for (const [a, b] of pairs) {
        const key = [a, b].sort().join('|');
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    expect([...seen.values()].every((n) => n === 2)).toBe(true);
    expect(seen.size).toBe(28);
  });

  it('网吧 BO1，城市起 BO3；网吧不降级，前 2 升级', () => {
    expect(winsNeeded('netcafe')).toBe(1);
    expect(winsNeeded('city')).toBe(2);
    expect(tierMove('netcafe', 1)).toMatchObject({ tier: 'city', move: 'up' });
    expect(tierMove('netcafe', 8)).toMatchObject({ tier: 'netcafe', move: 'stay' });
    expect(tierMove('city', 7)).toMatchObject({ tier: 'netcafe', move: 'down' });
    expect(tierMove('national', 2)).toMatchObject({ tier: 'national', world: true });
    expect(tierMove('national', 8)).toMatchObject({ tier: 'city', move: 'down' });
  });

  it('默认首发五人互不重复，撇干多半在台下', () => {
    const s = createNewGame(1);
    const slots = autoLineup(s.roster);
    expect(new Set(slots).size).toBe(5);
    expect(slots).not.toContain('piegan');
    expect(validLineup(slots)).toBe(true);
    expect(validLineup(['gouliang', 'gouliang', 'dibi', 'diaolong', 'aji'])).toBe(false);
  });
});

describe('胜负写入排名和赞助', () => {
  it('打完一轮：赢场、奖金、心得、积分榜', () => {
    const s = createNewGame(8);
    const slots = autoLineup(s.roster);
    const logs = commitRound(s, 1, true, slots);
    expect(s.record.wins).toBe(1);
    expect(s.insight).toBe(60);
    expect(s.cash).toBe(5000 + 500);
    expect(s.season.round).toBe(1);
    expect(s.season.table.ssb.w).toBe(1);
    const sumW = standings(s).reduce((n, r) => n + r.w, 0);
    expect(sumW).toBe(4);
    expect(logs.some((t) => t.includes('第 1 轮'))).toBe(true);
  });

  it('网吧垫底不降级，并记下名次；城市降级会解约', () => {
    const s = createNewGame(2);
    for (const [id, rec] of Object.entries(s.season.table)) {
      rec.w = id === 'ssb' ? 1 : 10;
      rec.l = id === 'ssb' ? 13 : 4;
    }
    const logs = finishSeason(s);
    expect(s.season.tier).toBe('netcafe');
    expect(s.record.bestRank).toBe(8);
    expect(logs.join('\n')).toMatch(/不降级/);
    expect(logs.join('\n')).toMatch(/包夜大叔/);
    expect(s.season.settled).toBe(true);
    expect(s.meta.scores).toEqual([8]);

    const city = createNewGame(3);
    city.season.tier = 'city';
    city.season.table = {
      ssb: { w: 2, l: 12 },
      sunset: { w: 12, l: 2 }, uni: { w: 11, l: 3 }, viewers: { w: 10, l: 4 },
      village: { w: 9, l: 5 }, coldnoodle: { w: 8, l: 6 }, gym: { w: 7, l: 7 }, rich: { w: 6, l: 8 },
    };
    city.cash = 100000;
    expect(signSponsor(city, 'wang').ok).toBe(true);
    city.record.wins = 3;
    city.record.huangmenji = 10;
    city.record.bestRank = 4;
    expect(signSponsor(city, 'keyboard').ok).toBe(true);
    const down = finishSeason(city);
    expect(city.season.tier).toBe('netcafe');
    expect(city.sponsors).not.toContain('keyboard');
    expect(city.sponsors).toContain('wang');
    expect(down.some((t) => t.includes('解约'))).toBe(true);
    expect(ourRank(city).rank).toBe(8);
  });

  it('国内前 2 拿到世界赛资格，级别先留在国内', () => {
    const s = createNewGame(4);
    s.season.tier = 'national';
    s.season.table = {
      ssb: { w: 12, l: 2 },
      jdd: { w: 11, l: 3 }, blb: { w: 9, l: 5 }, tea: { w: 8, l: 6 },
      wbc: { w: 6, l: 8 }, egg: { w: 5, l: 9 }, lmg: { w: 4, l: 10 }, iq: { w: 1, l: 13 },
    };
    const logs = finishSeason(s);
    expect(s.season.tier).toBe('national');
    expect(s.record.worldQualified).toBe(true);
    expect(s.record.nationalTop4).toBe(true);
    expect(logs.join('\n')).toMatch(/世界赛/);
    expect(s.cash).toBe(5000 + 80000);
  });

  it('打过一轮再跨赛季会补完；一轮都没记就不补算', () => {
    const played = createNewGame(5);
    commitRound(played, 1, true, autoLineup(played.roster));
    const logs = enterDay(played, 36, true);
    expect(played.season.calendarSeason).toBe(2);
    expect(played.season.round).toBe(0);
    expect(played.meta.seasonCount).toBe(1);
    expect(logs.some((t) => t.includes('跳过'))).toBe(true);

    const skipped = createNewGame(5);
    const none = enterDay(skipped, 57, true);
    expect(none).toEqual([]);
    expect(skipped.season.calendarSeason).toBe(2);
    expect(skipped.season.round).toBe(0);
    expect(skipped.record.wins).toBe(0);
    expect(skipped.cash).toBe(5000);
  });

  it('19:00 还没确认首发时要弹确认；18:30 的旧判断不变', () => {
    const s = createNewGame(1);
    expect(needsPrematch(s, 2, 19 * 60)).toBe(false);
    expect(needsPrematch(s, 2, PREMATCH_MINUTE)).toBe(true);
    expect(needsLineupConfirm(s, 2, 19 * 60)).toBe(true);
    s.prematchConfirmedDay = 2;
    expect(needsLineupConfirm(s, 2, 19 * 60)).toBe(false);
    expect(needsLineupConfirm(s, 2, PREMATCH_MINUTE)).toBe(false);
  });
});
