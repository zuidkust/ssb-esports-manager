// 场地：按存档里的场地等级选场景（网吧角落 / 小办公室……），设施按“已购买”显示
// 导演层和灯光层只认这里的接口，不关心具体是哪个场景
import type * as THREE from 'three';
import { venueLook, venueScene, type FacilityId } from '../data/facilities';
import type { MemberDef } from '../data/roster';
import type { NavGraph } from './nav';
import { buildNetcafe } from './netcafe';
import { buildOffice, type Desk, type Lamp } from './office';
import type { SkyTexture, WhiteboardTexture } from './textures';

// 一个站位：站在哪、从哪个过道节点走过去、站定后朝哪
export interface Spot {
  at: THREE.Vector3;
  approach: string;
  facing: number;
  lead?: boolean; // 赛前会上带头讲话的位置
}

export interface Venue {
  level: number;
  root: THREE.Group;
  desks: Desk[];
  nav: NavGraph;
  door: string; // 门口的过道节点
  exit: THREE.Vector3; // 门外：离开的人走到这里后隐藏
  spots: {
    snack?: Spot[]; // 没买零食柜就没有
    drink: Spot[];
    fridge?: Spot;
    sofa?: Spot;
    meeting: (i: number) => Spot;
    chat: Spot[];
    sub: Spot;
  };
  lamps: Lamp[];
  sky: SkyTexture;
  wb?: WhiteboardTexture; // 白板（摸鱼排行榜）
  doorPivot: THREE.Group;
  clock: { hourHand: THREE.Mesh; minHand: THREE.Mesh };
  glowMat: THREE.MeshStandardMaterial;
  fridgeDoor?: THREE.Group;
  update?(dt: number, nowMs: number): void; // 场景自带的小动画（网吧里的路人）
}

export function buildVenue(scene: THREE.Scene, level: number, members: MemberDef[], fac: ReadonlySet<FacilityId>): Venue {
  return venueScene(level) === 'netcafe' ? buildNetcafe(scene, members, fac) : buildOffice(scene, members, fac, venueLook(level));
}

export function venueKey(level: number, fac: ReadonlySet<FacilityId>): string {
  return `${level}|${[...fac].sort().join(',')}`;
}
