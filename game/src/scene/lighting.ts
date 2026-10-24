// 日夜光照：太阳位置按游戏内时刻计算；室内灯、台灯随在场人数变化
import * as THREE from 'three';
import type { Venue } from './venue';
import type { Quality } from './stage';

const C = (hex: number | string) => new THREE.Color(hex);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function mix3(night: THREE.Color, dusk: THREE.Color, day: THREE.Color, n: number, d: number) {
  // n：白天程度（0 夜 → 1 昼），d：晨昏程度（0~1）
  const base = night.clone().lerp(day, n);
  return base.lerp(dusk, d * 0.85);
}

// bgTop / bgBottom：画面背景（漂浮街区后面那片浅灰），视频里昼夜都保持浅灰，只是夜里稍暗、黄昏偏暖
const PALETTE: Record<'sky' | 'ground' | 'bgTop' | 'bgBottom', [THREE.Color, THREE.Color, THREE.Color]> & { winTop: string[]; winBottom: string[] } = {
  sky: [C(0x23345e), C(0xf0a070), C(0xc3dcff)],
  ground: [C(0x0e0d12), C(0x5a3a2a), C(0x5f7a48)],
  bgTop: [C(0xb4b9bf), C(0xd3cbc6), C(0xcfd3d2)],
  bgBottom: [C(0xd9dce0), C(0xece5df), C(0xeceeed)],
  winTop: ['#060a1a', '#e8875a', '#7fb8f5'],
  winBottom: ['#162448', '#ffcf94', '#dcefff'],
};

export class Lighting {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  moon: THREE.DirectionalLight;
  ceiling: THREE.DirectionalLight;
  warm: THREE.PointLight;
  night = 0;
  day = 1;
  bgTop = new THREE.Color(0xcfd3d2);
  bgBottom = new THREE.Color(0xeceeed);
  constructor(scene: THREE.Scene, public office: Venue, quality: Quality) {
    this.hemi = new THREE.HemisphereLight(0xc3dcff, 0x7a6450, 0.6);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2e0, 2.5);
    this.sun.castShadow = quality.shadows;
    const sz = quality.shadowSize;
    this.sun.shadow.mapSize.set(sz, sz);
    const cam = this.sun.shadow.camera;
    cam.left = -14; cam.right = 14; cam.top = 14; cam.bottom = -14; cam.near = 1; cam.far = 80;
    this.sun.shadow.bias = -0.001;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 0;
    scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight(0x7d93d8, 0);
    this.moon.position.set(-8, 16, 10);
    // 月光不投影：夜里的实时阴影交给路灯（视频的“夜场泛光灯 · 实时阴影”）
    scene.add(this.moon, this.moon.target);

    // 办公室顶灯（没有天花板，用一盏不投影的上方柔光代替）
    this.ceiling = new THREE.DirectionalLight(0xfff0dc, 0);
    this.ceiling.position.set(2, 20, 6);
    scene.add(this.ceiling);
    // 室内暖色补光（夜里有人时亮）
    this.warm = new THREE.PointLight(0xffc48a, 0, 16, 1.2);
    this.warm.position.set(-1, 2.8, -1);
    scene.add(this.warm);

  }

  // info: { sun:{elevation, azimuth}, present: 在场人数 }
  update(info: { sun: { elevation: number; azimuth: number }; present: number; rain?: number }) {
    const rain = info.rain ?? 0;
    const el = info.sun.elevation;
    const az = info.sun.azimuth;
    const day = smooth(-0.1, 0.18, el); // 白天程度
    const dusk = Math.max(0, 1 - Math.abs(el - 0.03) / 0.16) * smooth(-0.14, -0.02, el); // 晨昏
    const night = 1 - smooth(-0.16, 0.02, el);
    this.day = day;
    this.night = night;

    // 太阳方向：方位角从正北顺时针。为了让影子一整天都落在镜头看得见的一侧（视频里的硬影子），
    // 太阳轨迹在场景里转 90°：早上从右后方（-z）、中午从右前方高处（+x）、傍晚从左前方（+z）斜照
    const ce = Math.cos(Math.max(el, 0.05));
    const dir = new THREE.Vector3(-Math.cos(az) * ce, Math.sin(Math.max(el, 0.05)), -Math.sin(az) * ce).normalize();
    this.sun.position.copy(dir.multiplyScalar(30));
    this.sun.target.position.set(0, 0, 0);
    const low = 1 - smooth(0.05, 0.6, el);
    this.sun.color.copy(C(0xfff4e6).lerp(C(0xff9448), low * 0.9));
    // 太阳偏强、天光偏弱：块面明暗分明，影子压得住（视频白天的对比度）
    this.sun.intensity = smooth(-0.03, 0.12, el) * (2.6 + 1.6 * Math.min(1, Math.sin(Math.max(el, 0)) * 1.6)) * (1 - rain * 0.75);

    this.hemi.color.copy(mix3(...PALETTE.sky, day, dusk)).lerp(C(0x8d99a8), rain * 0.6);
    this.hemi.groundColor.copy(mix3(...PALETTE.ground, day, dusk));
    this.hemi.intensity = 0.14 + day * 0.3 + dusk * 0.14;
    this.moon.intensity = night * 0.55;

    const present = info.present > 0;
    const lightsOn = present;
    this.ceiling.intensity = lightsOn ? 0.08 + night * 0.3 : 0;
    this.warm.intensity = lightsOn ? night * 3.2 : 0;
    const lampOn = present && el < 0.22;
    for (const l of this.office.lamps) {
      l.light.intensity = lampOn ? l.base * (0.5 + night) : 0;
      l.shadeMat.emissiveIntensity = lampOn ? 1.4 : 0;
    }

    // 下雨：背景压暗成阴天灰
    this.bgTop.copy(mix3(...PALETTE.bgTop, day, dusk)).lerp(C(0x9ba3ab), rain * 0.7);
    this.bgBottom.copy(mix3(...PALETTE.bgBottom, day, dusk)).lerp(C(0xc3c8cd), rain * 0.7);

    // 街区：路灯、砖楼窗户、竖招牌（傍晚开灯）
    const out = this.office.outdoor;
    const streetOn = Math.max(smooth(0.12, -0.02, el), rain * 0.8);
    for (const l of out.lamps) {
      l.intensity = streetOn * 70;
      // 灯灭时不再重画它的阴影贴图（省一整轮阴影绘制）；太阳同理
      l.shadow.autoUpdate = l.intensity > 0.01;
    }
    this.sun.shadow.autoUpdate = this.sun.intensity > 0.01;
    out.glow.emissiveIntensity = 0.15 + streetOn * 2.4;
    out.windows.emissiveIntensity = night * 1.5 + dusk * 0.5;
    out.neon.emissiveIntensity = 0.3 + streetOn * 1.8;

    // 窗外：颜色量化后再重画，避免每帧重绘 Canvas
    const q = (x: number) => Math.round(x * 20) / 20;
    const pickCss = (arr: string[]) => '#' + mix3(C(arr[0]), C(arr[1]), C(arr[2]), q(day), q(dusk)).getHexString();
    this.office.sky.draw(pickCss(PALETTE.winTop), pickCss(PALETTE.winBottom), q(night));

    // 底座灯带
    this.office.glowMat.emissiveIntensity = 0.6 + night * 1.6;
    const floor = this.office.floorMat;
    if (floor) {
      floor.roughness = 0.55 - night * 0.1;
      floor.metalness = 0.04 + night * 0.16;
    }
  }
}
