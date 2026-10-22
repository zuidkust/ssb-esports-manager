import { describe, expect, it } from 'vitest';
import { ROSTER } from '../src/data/roster';
import { FIG, HEAD_TOP, SEAT_H, SHOULDER_REACH, STAND_TOP, STANDARD_BODY, TORSO_HALF_DEPTH } from '../src/scene/body';
import { HEAD } from '../src/scene/hair';
import { NETCAFE_NAV } from '../src/scene/netcafe';

describe('六人同一体型', () => {
  it('look 里不再写身高和胖瘦，发色保持黑发', () => {
    expect(STANDARD_BODY).toEqual({ height: 1, girth: 1 });
    expect(ROSTER.map((m) => m.name)).toEqual(['阿鸡', '当邓', '狗粮', '弟必', '吊隆', '撇干']);
    for (const m of ROSTER) {
      expect(m.look).not.toHaveProperty('height');
      expect(m.look).not.toHaveProperty('girth');
      expect(m.look.hair).toBeLessThanOrEqual(0x3a3a40);
      expect((m.look.hair >> 16) & 0xff).toBeLessThanOrEqual(0x3a);
      expect((m.look.hair >> 8) & 0xff).toBeLessThanOrEqual(0x3a);
      expect(m.look.hair & 0xff).toBeLessThanOrEqual(0x40);
    }
  });

  it('头截面的顶和共享常量是同一个数', () => {
    expect(HEAD[HEAD.length - 1][0]).toBe(HEAD_TOP);
  });

  it('人整体缩小后，肩宽收进桌子，过道离椅背还有余量', () => {
    // 站立大约一米四到一米五，比旧的 1.72 比例矮一截，但不是缩成小孩
    expect(STAND_TOP).toBeGreaterThan(1.35);
    expect(STAND_TOP).toBeLessThan(1.55);
    expect(FIG).toBeLessThan(1.6);
    // 网吧桌子宽 1.25 米
    expect(SHOULDER_REACH * 2 * FIG).toBeLessThan(1.15);
    // 战队机位过道在 z=-2.85，椅背朝过道大约到 z=-3.23
    const chairFrontZ = -4.45 + 0.9 + 0.32;
    const half = TORSO_HALF_DEPTH * FIG;
    for (const id of ['A0', 'A1', 'A2', 'A3', 'A4', 'A5']) {
      const z = NETCAFE_NAV.nodes[id][1];
      expect(z - chairFrontZ).toBeGreaterThan(half + 0.08);
    }
    // 坐下髋高仍贴着椅子，不跟全身缩放一起掉到地上
    expect(SEAT_H).toBeGreaterThan(0.45);
    expect(SEAT_H).toBeLessThan(0.6);
  });
});
