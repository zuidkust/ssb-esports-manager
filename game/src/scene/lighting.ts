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

const PALETTE: Record<'sky' | 'ground' | 'bg', [THREE.Color, THREE.Color, THREE.Color]> & { winTop: string[]; winBottom: string[] } = {
  sky: [C(0x1c2a52), C(0xf0a070), C(0xc3dcff)],
  ground: [C(0x0e0d12), C(0x5a3a2a), C(0x7a6450)],
  bg: [C(0x070a12), C(0x2b1f2a), C(0x252c3a)],
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
  constructor(private scene: THREE.Scene, public office: Venue, quality: Quality) {
    this.hemi = new THREE.HemisphereLight(0xc3dcff, 0x7a6450, 0.6);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2e0, 2.5);
    this.sun.castShadow = quality.shadows;
    const sz = quality.shadowSize;
    this.sun.shadow.mapSize.set(sz, sz);
    const cam = this.sun.shadow.camera;
    cam.left = -11; cam.right = 11; cam.top = 11; cam.bottom = -11; cam.near = 1; cam.far = 70;
    this.sun.shadow.bias = -0.001;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 0;
    scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight(0x7d93d8, 0);
    this.moon.position.set(-8, 16, 10);
    this.moon.castShadow = quality.shadows;
    this.moon.shadow.mapSize.set(sz, sz);
    const moonCam = this.moon.shadow.camera;
    moonCam.left = -12; moonCam.right = 12; moonCam.top = 12; moonCam.bottom = -12; moonCam.near = 1; moonCam.far = 40;
    this.moon.shadow.bias = -0.001;
    this.moon.shadow.normalBias = 0.02;
    this.moon.shadow.radius = 0;
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
  update(info: { sun: { elevation: number; azimuth: number }; present: number }) {
    const el = info.sun.elevation;
    const az = info.sun.azimuth;
    const day = smooth(-0.1, 0.18, el); // 白天程度
    const dusk = Math.max(0, 1 - Math.abs(el - 0.03) / 0.16) * smooth(-0.14, -0.02, el); // 晨昏
    const night = 1 - smooth(-0.16, 0.02, el);
    this.day = day;
    this.night = night;

    // 太阳方向：方位角从正北顺时针；场景里 -z 为北，+x 为东
    const ce = Math.cos(Math.max(el, 0.05));
    const dir = new THREE.Vector3(Math.sin(az) * ce, Math.sin(Math.max(el, 0.05)), -Math.cos(az) * ce).normalize();
    this.sun.position.copy(dir.multiplyScalar(30));
    this.sun.target.position.set(0, 0, 0);
    const low = 1 - smooth(0.05, 0.6, el);
    this.sun.color.copy(C(0xfff4e6).lerp(C(0xff9448), low * 0.9));
    this.sun.intensity = smooth(-0.03, 0.12, el) * (1.6 + 1.6 * Math.min(1, Math.sin(Math.max(el, 0)) * 1.6));

    this.hemi.color.copy(mix3(...PALETTE.sky, day, dusk));
    this.hemi.groundColor.copy(mix3(...PALETTE.ground, day, dusk));
    this.hemi.intensity = 0.12 + day * 0.7 + dusk * 0.16;
    this.moon.intensity = night * 0.55;

    const present = info.present > 0;
    const lightsOn = present;
    this.ceiling.intensity = lightsOn ? 0.18 + night * 0.3 : 0;
    this.warm.intensity = lightsOn ? night * 3.2 : 0;
    const lampOn = present && el < 0.22;
    for (const l of this.office.lamps) {
      l.light.intensity = lampOn ? l.base * (0.5 + night) : 0;
      l.shadeMat.emissiveIntensity = lampOn ? 1.4 : 0;
    }

    this.scene.background = mix3(...PALETTE.bg, day, dusk);

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
