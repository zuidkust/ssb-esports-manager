// 天气：纯画面，不影响玩法。晴雨按天数确定（同一天读档重进还是同样的天气）。
// 暴雨（视频里的“积水倒影 · 溅水 · 场地变湿”）：雨丝只落在室外（房间没有天花板，室内不能淋雨），
// 落地溅起小水花；地面随雨量慢慢变湿变深、变光滑，人行道上出现积水；雨停后慢慢干。
// 雨丝、水花放在 FX 图层：像素管线的法线 pass 不画它们，不会被描边。
import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import type { Venue } from './venue';
import { ROOM } from './office';
import { FX_LAYER } from './pixelPass';

const DAY_START = 8 * 60;

/** 这一刻的雨量 0..1。约四分之一的日子下雨，雨从上午到傍晚之间某个时刻开始，下 3–7 小时，前后各 25 分钟渐变。 */
export function rainAmount(day: number, minute: number): number {
  const r = mulberry32(day * 7919 + 13);
  if (r() >= 0.25) return 0;
  const start = DAY_START + 60 + Math.floor(r() * 10 * 60);
  const end = start + 180 + Math.floor(r() * 240);
  const fade = 25;
  if (minute <= start || minute >= end) return 0;
  return Math.min(1, (minute - start) / fade, (end - minute) / fade);
}

const DROPS = 1100;
const SPLASHES = 220;
const TOP_Y = 9;
// 房间前面、右边两条人行道上的雨从低处落：高处的雨丝投影会盖到房间里，看着像屋里下雨
const FRONT_TOP_Y = 3.4;

interface Wettable {
  mat: THREE.MeshStandardMaterial;
  color: THREE.Color;
  rough: number;
}

export class Weather {
  /** 平滑后的雨量 */
  rain = 0;
  /** 地面湿度（比雨量慢：下一会儿才湿，停了慢慢干） */
  wet = 0;
  private drops: THREE.InstancedMesh;
  private splashes: THREE.InstancedMesh;
  private dropPos: Float32Array;
  private dropSpeed: Float32Array;
  private splashT: Float32Array;
  private splashPos: Float32Array;
  private nextSplash = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private rnd = mulberry32(99);
  private bounds = { x0: -8, x1: 8, z0: -7, z1: 7 };
  private ground: Wettable[] = [];
  private puddles: THREE.MeshStandardMaterial | null = null;
  private dropMat: THREE.MeshBasicMaterial;
  private first = true;

  constructor(scene: THREE.Scene) {
    this.dropMat = new THREE.MeshBasicMaterial({ color: 0xd4dde8, transparent: true, opacity: 0.55, depthWrite: false });
    this.drops = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.45, 0.035), this.dropMat, DROPS);
    this.drops.frustumCulled = false;
    this.drops.layers.set(FX_LAYER);
    this.drops.count = 0;
    const splashMat = new THREE.MeshBasicMaterial({ color: 0xeef3f8, transparent: true, opacity: 0.85, depthWrite: false });
    this.splashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.05, 0.14), splashMat, SPLASHES);
    this.splashes.frustumCulled = false;
    this.splashes.layers.set(FX_LAYER);
    this.splashes.count = SPLASHES;
    this.dropPos = new Float32Array(DROPS * 3);
    this.dropSpeed = new Float32Array(DROPS);
    this.splashT = new Float32Array(SPLASHES).fill(1);
    this.splashPos = new Float32Array(SPLASHES * 3);
    for (let i = 0; i < DROPS; i++) this.respawn(i, this.rnd() * TOP_Y);
    scene.add(this.drops, this.splashes);
  }

  /** 换场地后：重新收集要变湿的地面材质与积水 */
  setVenue(v: Venue) {
    const b = v.outdoor.bounds;
    this.bounds = { x0: b.x0 + 0.2, x1: b.x1 - 0.2, z0: b.z0 + 0.2, z1: b.z1 - 0.2 };
    this.ground = v.outdoor.wet.map((mat) => ({ mat, color: mat.color.clone(), rough: mat.roughness }));
    this.puddles = v.outdoor.puddles;
    this.applyWet();
  }

  private outside(x: number, z: number) {
    return x < ROOM.x0 - 0.35 || x > ROOM.x1 + 0.35 || z < ROOM.z0 - 0.35 || z > ROOM.z1 + 0.35;
  }

  private respawn(i: number, y?: number) {
    const { x0, x1, z0, z1 } = this.bounds;
    let x = 0, z = 0;
    for (let k = 0; k < 8; k++) {
      x = x0 + this.rnd() * (x1 - x0);
      z = z0 + this.rnd() * (z1 - z0);
      if (this.outside(x, z)) break;
    }
    const front = z > ROOM.z1 || x > ROOM.x1;
    const top = front ? FRONT_TOP_Y : TOP_Y;
    this.dropPos[i * 3] = x;
    this.dropPos[i * 3 + 1] = y == null ? top + this.rnd() * 1.5 : Math.min(y, top + 1.5);
    this.dropPos[i * 3 + 2] = z;
    this.dropSpeed[i] = 13 + this.rnd() * 4;
  }

  private splash(x: number, z: number) {
    const i = this.nextSplash;
    this.nextSplash = (i + 1) % SPLASHES;
    this.splashT[i] = 0;
    this.splashPos[i * 3] = x;
    this.splashPos[i * 3 + 1] = 0.01;
    this.splashPos[i * 3 + 2] = z;
  }

  private applyWet() {
    const w = this.wet;
    for (const g of this.ground) {
      g.mat.color.copy(g.color).multiplyScalar(1 - 0.3 * w);
      g.mat.roughness = THREE.MathUtils.lerp(g.rough, 0.32, w);
    }
    if (this.puddles) {
      this.puddles.opacity = 0.9 * THREE.MathUtils.smoothstep(w, 0.25, 0.8);
      this.puddles.visible = this.puddles.opacity > 0.01;
    }
  }

  /** 跳时间 / 读档后调用：下一帧雨量与湿度直接到位 */
  snap() {
    this.first = true;
  }

  /** target：这一刻应有的雨量（0..1）；dt：真实秒数 */
  update(dt: number, target: number, night = 0) {
    const step = Math.min(dt, 0.1);
    if (this.first) {
      // 开局 / 读档第一帧：雨量和地面湿度直接到位，不从晴天慢慢变
      this.first = false;
      this.rain = target;
      this.wet = target > 0.05 ? 1 : 0;
    }
    this.dropMat.color.setHex(0xd4dde8).lerp(new THREE.Color(0x6f7c8c), night);
    this.rain += (target - this.rain) * Math.min(1, step * 0.8);
    const wetTarget = this.rain > 0.05 ? 1 : 0;
    this.wet += (wetTarget - this.wet) * Math.min(1, step * (wetTarget ? 0.12 : 0.03));
    this.applyWet();

    const n = Math.round(DROPS * this.rain);
    this.drops.count = n;
    this.drops.visible = n > 0;
    for (let i = 0; i < n; i++) {
      let y = this.dropPos[i * 3 + 1] - this.dropSpeed[i] * step;
      if (y < 0) {
        if (this.rnd() < 0.5) this.splash(this.dropPos[i * 3], this.dropPos[i * 3 + 2]);
        this.respawn(i);
        y = this.dropPos[i * 3 + 1];
      }
      this.dropPos[i * 3 + 1] = y;
      this.p.set(this.dropPos[i * 3], y + 0.3, this.dropPos[i * 3 + 2]);
      this.m.compose(this.p, this.q, this.s.set(1, 1, 1));
      this.drops.setMatrixAt(i, this.m);
    }
    this.drops.instanceMatrix.needsUpdate = true;

    let live = 0;
    for (let i = 0; i < SPLASHES; i++) {
      const t = (this.splashT[i] += step / 0.22);
      const k = t < 1 ? 0.5 + t * 1.2 : 0;
      if (k > 0) live++;
      this.p.set(this.splashPos[i * 3], this.splashPos[i * 3 + 1] + t * 0.06, this.splashPos[i * 3 + 2]);
      this.m.compose(this.p, this.q, this.s.set(k, k > 0 ? 1 - t * 0.6 : 0, k));
      this.splashes.setMatrixAt(i, this.m);
    }
    this.splashes.visible = live > 0;
    this.splashes.instanceMatrix.needsUpdate = true;
  }
}
