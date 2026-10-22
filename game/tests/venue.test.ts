import { describe, expect, it } from 'vitest';
import { allFacilitiesUpTo, availableFacilities, venueScene } from '../src/data/facilities';
import { OFFICE_NAV, type NavGraph } from '../src/scene/nav';
import { NETCAFE_NAV } from '../src/scene/netcafe';
import { doorQueueSpot, minSeparation, netcafeMeetingSpots, officeMeetingSpots } from '../src/scene/spots';
import { createNewGame } from '../src/save/state';

describe('场地选择', () => {
  it('新开档是网吧角落，搬到小办公室换场景', () => {
    const s = createNewGame(1);
    expect(s.venueLevel).toBe(0);
    expect(venueScene(s.venueLevel)).toBe('netcafe');
    expect(venueScene(1)).toBe('office');
  });

  it('网吧角落只自带饮水机', () => {
    expect([...availableFacilities(0, [])]).toEqual(['cooler']);
    expect(availableFacilities(0, ['snack']).has('snack')).toBe(true);
  });

  it('设施按已购买显示，且不超过当前场地等级', () => {
    const office = availableFacilities(1, []);
    expect(office.has('fridge')).toBe(false);
    expect(office.has('sofa')).toBe(false);
    const full = availableFacilities(1, allFacilitiesUpTo(1));
    for (const f of ['cooler', 'snack', 'fridge', 'sofa', 'whiteboard'] as const) expect(full.has(f)).toBe(true);
    // 退租搬回网吧：办公室的家具不跟着显示
    expect(availableFacilities(0, allFacilitiesUpTo(1)).has('fridge')).toBe(false);
  });
});

describe('站位', () => {
  const apart = (pts: { x: number; z: number }[]) => expect(minSeparation(pts)).toBeGreaterThanOrEqual(1.15);

  it('网吧赛前会每人一个点，隔开站', () => {
    const spots = netcafeMeetingSpots();
    expect(spots).toHaveLength(6);
    apart(spots);
    expect(new Set(spots.map((s) => s.approach)).size).toBe(6);
  });

  it('办公室赛前会隔开站，有白板时不站进工位', () => {
    const withBoard = officeMeetingSpots(true);
    const open = officeMeetingSpots(false);
    expect(withBoard).toHaveLength(6);
    expect(open).toHaveLength(6);
    apart(withBoard);
    apart(open);
    for (const s of withBoard) expect(s.x).toBeLessThanOrEqual(-4.8);
    for (const s of open) expect(s.z).toBeGreaterThan(0.8);
  });

  it('门外等候位在墙外，横向分开', () => {
    const spots = [0, 1, 2, 3, 4, 5].map(doorQueueSpot);
    apart(spots);
    for (const s of spots) expect(s.z).toBeLessThan(-5.3);
  });
});

describe('寻路节点图', () => {
  const connected = (g: NavGraph) => expect([...g.reachable('D')].sort()).toEqual(Object.keys(g.nodes).sort());
  it('网吧角落：从门口能走到每个节点', () => connected(NETCAFE_NAV));
  it('小办公室：从门口能走到每个节点', () => connected(OFFICE_NAV));
});
