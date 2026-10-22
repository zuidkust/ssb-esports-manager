import { describe, expect, it } from 'vitest';
import { allFacilitiesUpTo, availableFacilities, venueScene } from '../src/data/facilities';
import { OFFICE_NAV, type NavGraph } from '../src/scene/nav';
import { NETCAFE_NAV } from '../src/scene/netcafe';
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

describe('寻路节点图', () => {
  const connected = (g: NavGraph) => expect([...g.reachable('D')].sort()).toEqual(Object.keys(g.nodes).sort());
  it('网吧角落：从门口能走到每个节点', () => connected(NETCAFE_NAV));
  it('小办公室：从门口能走到每个节点', () => connected(OFFICE_NAV));
});
