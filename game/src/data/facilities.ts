// 场地与设施（设计文档第 10 章）：每级场地有一批可买设施，没买的不渲染，队员也不会去用
// 价格是草案数值。购买在经营面板（M2）；场景只渲染当前场地里已经买到、等级也够的设施

export type VenueLevel = 0 | 1 | 2 | 3;
export const VENUE_CN = ['网吧角落', '小办公室', '电竞基地', '豪华基地'];

// 各级场地用哪个场景：电竞基地、豪华基地的场景在 M4 做，先沿用小办公室
export type VenueScene = 'netcafe' | 'office';
export function venueScene(level: number): VenueScene {
  return level <= 0 ? 'netcafe' : 'office';
}

export type FacilityId = 'cooler' | 'snack' | 'headset' | 'fridge' | 'sofa' | 'whiteboard' | 'mealAllowance';

export interface FacilityDef {
  id: FacilityId;
  name: string;
  venue: VenueLevel; // 从哪一级场地开始能买
  price: number; // 0 = 场地自带
  monthly?: boolean; // 长期开支（按月扣）
}

export const FACILITIES: FacilityDef[] = [
  { id: 'cooler', name: '饮水机', venue: 0, price: 0 },
  { id: 'snack', name: '零食柜', venue: 0, price: 800 },
  { id: 'headset', name: '耳机升级', venue: 0, price: 1500 },
  { id: 'fridge', name: '冰箱', venue: 1, price: 2000 },
  { id: 'sofa', name: '沙发', venue: 1, price: 3000 },
  { id: 'whiteboard', name: '白板（复盘）', venue: 1, price: 2500 },
  { id: 'mealAllowance', name: '公司餐补', venue: 1, price: 1000, monthly: true },
];

export const FACILITY_BY_ID = Object.fromEntries(FACILITIES.map((f) => [f.id, f])) as Record<FacilityId, FacilityDef>;

// 场地自带的设施（不用买）
export function builtinFacilities(venue: number): FacilityId[] {
  return FACILITIES.filter((f) => f.price === 0 && f.venue <= venue).map((f) => f.id);
}

// 当前场地实际可用的设施：自带 + 已购买，且不超过当前场地等级（搬回网吧时，办公室的家具不会跟着显示）
export function availableFacilities(venue: number, owned: readonly string[]): Set<FacilityId> {
  const out = new Set<FacilityId>(builtinFacilities(venue));
  for (const id of owned) {
    const f = FACILITY_BY_ID[id as FacilityId];
    if (f && f.venue <= venue) out.add(f.id);
  }
  return out;
}

// 某一级场地能买到的全部设施（调试 / 截图用：一次买齐）
export function allFacilitiesUpTo(venue: number): FacilityId[] {
  return FACILITIES.filter((f) => f.venue <= venue).map((f) => f.id);
}
