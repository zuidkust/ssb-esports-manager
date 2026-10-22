import { describe, expect, it } from 'vitest';
import { ROSTER_BY_ID } from '../src/data/roster';
import { createNewGame } from '../src/save/state';
import { buildPlans } from '../src/sim/schedule';

describe('早上到岗', () => {
  it('任意种子都至少隔 4 分钟，而且只往后推', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (const day of [1, 2, 3]) {
        const s = createNewGame(seed);
        const members = s.roster.map((st) => ({ def: ROSTER_BY_ID[st.id], state: st }));
        const plans = buildPlans(seed, day, members, day % 2 === 0, { sofa: false });
        const times = Object.values(plans).map((p) => p.arrive).sort((a, b) => a - b);
        expect(times[0]).toBeGreaterThanOrEqual(9 * 60);
        for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(4);
        // 09:05–09:12 这 7 分钟里最多 2 个人
        const rush = times.filter((t) => t >= 9 * 60 + 5 && t <= 9 * 60 + 12);
        expect(rush.length).toBeLessThanOrEqual(2);
      }
    }
  });
});
