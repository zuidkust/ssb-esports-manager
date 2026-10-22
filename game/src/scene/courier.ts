// 外卖员：黄衣服、保温箱。位置按游戏分钟贴在进门 → 各工位 → 出门的路径上，暂停和时间跳跃都对得上。
import * as THREE from 'three';
import type { MemberDef } from '../data/roster';
import { Character } from './character';
import { mat } from './office';
import type { Venue } from './venue';
import type { CourierTrack } from '../sim/takeout';

const COURIER_DEF: MemberDef = {
  id: 'courier',
  name: '外卖',
  position: 'support',
  tagline: '送餐的',
  arrive: 'normal',
  ability: { lane: 1, roam: 1, fight: 1, sense: 1, mech: 1, pool: 1, mental: 1 },
  persona: { 嘴硬: 0, 心态倾向: 50, 胜负心: 0, 逆风意志: 0, 创新欲: 0, 话痨: 0, 摸鱼倾向: 0, 甩锅倾向: 0, 爱睡觉: 0 },
  heroes: [],
  traits: [],
  catchphrases: [],
  winLines: [],
  loseLines: [],
  pressureLines: [],
  cheer: '',
  softSpots: [],
  habits: [],
  taste: { favorites: [], favoriteMul: 1, avoid: [], avoidTags: [], drinks: '', milkTea: true },
  phoneBias: {},
  roles: [],
  look: { height: 1.04, girth: 0.96, glasses: false, shirt: 0xf5c400, pants: 0x1a1a1a, hair: 0x241c18, skin: 0xf0c8a0, shoes: 0x111111, hairStyle: 'short', helmet: 0xf5c400 },
};

interface Knot {
  t: number;
  x: number;
  z: number;
}

export class Courier {
  readonly char: Character;
  private key = '';
  private knots: Knot[] = [];
  private dropAt: number[] = [];

  constructor(parent: THREE.Object3D) {
    this.char = new Character(COURIER_DEF);
    const bag = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.22), mat(0xf5c400, { roughness: 0.55 }));
    body.castShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.24), mat(0x1a1a1a, { roughness: 0.4 }));
    lid.position.y = 0.18;
    bag.add(body, lid);
    bag.position.set(0, 0.92, -0.32);
    this.char.root.add(bag);
    this.char.setHidden(true);
    parent.add(this.char.root);
  }

  sync(venue: Venue, job: CourierTrack | null, minute: number) {
    if (!job) {
      this.key = '';
      this.char.setHidden(true);
      return;
    }
    const key = `${job.key}|${venue.level}`;
    if (key !== this.key) {
      this.key = key;
      this.knots = this.build(venue, job);
      this.dropAt = job.stops.map((s) => s.at);
    }
    const p = sample(this.knots, minute);
    const nearDrop = this.dropAt.some((t) => Math.abs(minute - t) < 0.7);
    this.char.setHidden(false);
    this.char.path = [];
    this.char.pos.set(p.x, 0, p.z);
    // 递餐时面向工位（朝 -z），不要侧身站进桌椅里
    this.char.facing = this.char.targetFacing = nearDrop ? Math.PI : p.facing;
    this.char.poseName = nearDrop ? 'reach' : 'walk';
  }

  private build(venue: Venue, job: CourierTrack): Knot[] {
    const knots: Knot[] = [];
    let cursor = { x: venue.exit.x, z: venue.exit.z };
    let t0 = job.enter;
    knots.push({ t: t0, x: cursor.x, z: cursor.z });
    const legs: { x: number; z: number; approach: string; t: number }[] = [];
    for (const stop of job.stops) {
      const desk = venue.desks.find((d) => d.owner === stop.memberId);
      if (!desk) continue;
      legs.push({ x: desk.standSpot.x, z: desk.standSpot.z, approach: desk.approach, t: stop.at });
    }
    legs.push({ x: venue.exit.x, z: venue.exit.z, approach: venue.door, t: job.leave });
    for (const leg of legs) {
      const route = venue.nav.route(cursor.x, cursor.z, leg.approach, leg.x, leg.z);
      const poly = [{ x: cursor.x, z: cursor.z }, ...route];
      let len = 0;
      const seg: number[] = [];
      for (let i = 1; i < poly.length; i++) {
        const d = Math.hypot(poly[i].x - poly[i - 1].x, poly[i].z - poly[i - 1].z);
        seg.push(d);
        len += d;
      }
      let acc = 0;
      const t1 = Math.max(leg.t, t0 + 0.4);
      for (let i = 1; i < poly.length; i++) {
        acc += seg[i - 1];
        const u = len > 0.05 ? acc / len : 1;
        knots.push({ t: t0 + (t1 - t0) * u, x: poly[i].x, z: poly[i].z });
      }
      cursor = { x: leg.x, z: leg.z };
      t0 = t1;
    }
    return knots;
  }
}

function sample(knots: Knot[], t: number): { x: number; z: number; facing: number } {
  if (!knots.length) return { x: 0, z: 0, facing: 0 };
  if (t <= knots[0].t) return { ...knots[0], facing: 0 };
  for (let i = 1; i < knots.length; i++) {
    const b = knots[i];
    if (t <= b.t) {
      const a = knots[i - 1];
      const u = (t - a.t) / Math.max(1e-4, b.t - a.t);
      const x = a.x + (b.x - a.x) * u;
      const z = a.z + (b.z - a.z) * u;
      return { x, z, facing: Math.atan2(b.x - a.x, b.z - a.z) };
    }
  }
  const last = knots[knots.length - 1];
  return { x: last.x, z: last.z, facing: 0 };
}
