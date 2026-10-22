// 剖面式等距办公室：后墙与左墙完整，前墙与右墙只留矮墙，下面垫一个深色底座
// 全部用程序几何体拼装；家具用圆角盒子，比样板的直角盒子柔和一些
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MemberDef } from '../data/roster';
import {
  artTexture, floorTexture, plasterTexture, plinthLabel, posterTexture, rugTexture, screenTexture, slatTexture, SkyTexture, WhiteboardTexture,
  type ScreenKind,
} from './textures';

export const ROOM = { x0: -7, x1: 7, z0: -5, z1: 5, h: 3.0 };
export const DESK_X = [-3.6, -1.5, 0.6];
export const ROW_Z = [-4.45, -1.75];
// 工位：后排（靠窗）吊龙、地鼠、弟必；前排 施颠、当邓、批菊
export const DESK_OWNERS = ['diaolong', 'dishu', 'dibi', 'shidian', 'dangdeng', 'piju'];

type MatOpts = THREE.MeshStandardMaterialParameters;
const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02, ...opts }));
  return matCache.get(key)!;
}

export function shadow<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

function addMesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// 以“底面高度”定位的直角盒子（墙、地台等大块面）
function box(parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, rotY = 0) {
  const m = addMesh(parent, new THREE.BoxGeometry(w, h, d), material, x, y + h / 2, z);
  m.rotation.y = rotY;
  return m;
}

// 以“底面高度”定位的圆角盒子（家具）
const rboxCache = new Map<string, RoundedBoxGeometry>();
export function rbox(parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, r = 0.03, rotY = 0) {
  const radius = Math.min(r, Math.min(w, h, d) / 2 - 0.001);
  const key = [w, h, d, radius].map((v) => v.toFixed(3)).join(',');
  if (!rboxCache.has(key)) rboxCache.set(key, new RoundedBoxGeometry(w, h, d, 3, Math.max(0.001, radius)));
  const m = addMesh(parent, rboxCache.get(key)!, material, x, y + h / 2, z);
  m.rotation.y = rotY;
  return m;
}

function cyl(parent: THREE.Object3D, rTop: number, rBot: number, h: number, material: THREE.Material, x: number, y: number, z: number, seg = 20) {
  return addMesh(parent, new THREE.CylinderGeometry(rTop, rBot, h, seg), material, x, y + h / 2, z);
}

// 车削体：points 为 (半径, 高度) 轮廓
function lathe(parent: THREE.Object3D, pts: [number, number][], material: THREE.Material, x: number, y: number, z: number, seg = 24) {
  const geo = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), seg);
  return addMesh(parent, geo, material, x, y, z);
}

// 绿植：带沿的花盆 + 椭圆叶片，叶色深浅交错
function plant(parent: THREE.Object3D, x: number, z: number, scale = 1, potColor = 0xe9e2d6, seed = 1) {
  const g = new THREE.Group();
  const pot = mat(potColor, { roughness: 0.6 });
  lathe(g, [[0, 0], [0.15, 0], [0.18, 0.05], [0.2, 0.38], [0.225, 0.4], [0.225, 0.44], [0.2, 0.44], [0.19, 0.42], [0, 0.42]], pot, 0, 0, 0, 28);
  cyl(g, 0.19, 0.19, 0.02, mat(0x3b2a1e, { roughness: 1 }), 0, 0.41, 0, 20);
  const greens = [mat(0x3f7a45, { roughness: 0.65 }), mat(0x2f6238, { roughness: 0.65 }), mat(0x58904f, { roughness: 0.65 })];
  const stem = mat(0x4d6b35);
  const leafGeo = new THREE.SphereGeometry(0.16, 12, 8);
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rnd() * 0.4;
    const tilt = 0.45 + rnd() * 0.5;
    const len = 0.55 + rnd() * 0.45;
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.42, 0);
    pivot.rotation.set(0, a, 0);
    g.add(pivot);
    const arm = new THREE.Group();
    arm.rotation.x = tilt;
    pivot.add(arm);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, len, 5), stem);
    st.position.y = len / 2;
    arm.add(st);
    const leaf = new THREE.Mesh(leafGeo, greens[i % 3]);
    leaf.position.y = len + 0.08;
    leaf.scale.set(0.75, 1.25, 0.16);
    leaf.rotation.x = 0.5;
    leaf.castShadow = true;
    arm.add(leaf);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  parent.add(shadow(g));
  return g;
}

function floorLamp(parent: THREE.Object3D, x: number, z: number): Lamp {
  const g = new THREE.Group();
  const metal = mat(0x2a2a2e, { metalness: 0.6, roughness: 0.35 });
  lathe(g, [[0, 0], [0.18, 0], [0.19, 0.015], [0.16, 0.035], [0, 0.04]], metal, 0, 0, 0);
  cyl(g, 0.013, 0.013, 1.5, metal, 0, 0.03, 0, 8);
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf3e6cc, emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.95, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.25, 0), new THREE.Vector2(0.22, 0.12), new THREE.Vector2(0.17, 0.3)].map((v) => v), 28), shadeMat);
  shade.position.set(0, 1.46, 0);
  g.add(shade);
  const light = new THREE.PointLight(0xffb066, 0, 6, 1.6);
  light.position.set(0, 1.55, 0);
  g.add(light);
  g.position.set(x, 0, z);
  parent.add(g);
  return { light, shadeMat, base: 1.3 };
}

// 有褶皱的落地窗帘
function curtain(parent: THREE.Object3D, x: number, z: number, width: number, height: number, material: THREE.Material) {
  const geo = new THREE.PlaneGeometry(width, height, 24, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    pos.setZ(i, Math.sin((px / width) * Math.PI * 7) * 0.05);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, height / 2 + 0.05, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export interface Lamp {
  light: THREE.PointLight;
  shadeMat: THREE.MeshStandardMaterial;
  base: number;
}

export interface Desk {
  owner: string;
  approach: string;
  group: THREE.Group;
  chair: THREE.Group;
  chairBaseZ: number;
  chairTarget?: number;
  screens: THREE.MeshStandardMaterial[];
  screenKind?: ScreenKind | 'standby';
  screenLight: THREE.PointLight;
  rgbMat: THREE.MeshStandardMaterial;
  kbGlow: THREE.MeshStandardMaterial;
  pcGlow: THREE.MeshStandardMaterial;
  lamp: { mat: THREE.MeshStandardMaterial } | null;
  seat: THREE.Vector3;
  standSpot: THREE.Vector3;
  jiggle: number;
  monitor: THREE.Group;
}

// 电竞桌 + 电竞椅
function buildDesk(parent: THREE.Object3D, x: number, z: number, accent: number, idx: number): Omit<Desk, 'owner' | 'approach'> {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  const dark = mat(0x22252b, { roughness: 0.5 });
  const metal = mat(0x30333a, { metalness: 0.65, roughness: 0.32 });
  const wood = mat(0x4a3324, { roughness: 0.55 });

  // 桌面与金属 T 型腿
  rbox(g, 1.7, 0.05, 0.8, wood, 0, 0.72, 0, 0.02);
  for (const sx of [-0.72, 0.72]) {
    rbox(g, 0.06, 0.7, 0.06, metal, sx, 0.02, 0, 0.012);
    rbox(g, 0.08, 0.03, 0.72, metal, sx, 0, 0, 0.012);
  }
  // 理线槽
  rbox(g, 1.2, 0.05, 0.1, dark, 0, 0.62, -0.3, 0.015);
  // 桌沿 RGB 灯带（成员代表色）
  const rgbMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9 });
  box(g, 1.66, 0.012, 0.012, rgbMat, 0, 0.705, 0.395);
  // 鼠标垫（带代表色包边）、键盘、鼠标
  rbox(g, 1.12, 0.006, 0.4, mat(accent, { roughness: 0.8 }), 0.05, 0.77, 0.14, 0.003);
  rbox(g, 1.09, 0.008, 0.37, mat(0x17191e, { roughness: 0.9 }), 0.05, 0.771, 0.14, 0.003);
  rbox(g, 0.44, 0.022, 0.15, dark, -0.12, 0.777, 0.16, 0.008);
  const kbGlow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: accent, emissiveIntensity: 0.35 });
  rbox(g, 0.41, 0.006, 0.125, kbGlow, -0.12, 0.797, 0.16, 0.002);
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), dark);
  mouse.scale.set(0.9, 0.5, 1.4);
  mouse.position.set(0.32, 0.788, 0.17);
  g.add(mouse);

  // 显示器：细边框、圆角背壳、弯折支架（屏幕朝 +z，朝向坐着的人和镜头）
  const screens: THREE.MeshStandardMaterial[] = [];
  const mg = new THREE.Group();
  mg.position.set(0, 0.77, -0.22);
  g.add(mg);
  rbox(mg, 0.28, 0.012, 0.2, metal, 0, 0, 0, 0.006);
  const neck = rbox(mg, 0.05, 0.34, 0.03, metal, 0, 0.005, -0.04, 0.01);
  neck.rotation.x = 0.08;
  rbox(mg, 0.82, 0.49, 0.03, dark, 0, 0.19, 0, 0.012);
  rbox(mg, 0.5, 0.3, 0.06, dark, 0, 0.27, -0.03, 0.03);
  const scrMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: screenTexture('game', idx * 2), emissiveIntensity: 0, roughness: 0.25 });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.79, 0.45), scrMat);
  scr.position.set(0, 0.435, 0.016);
  mg.add(scr);
  screens.push(scrMat);

  // 桌下机箱（侧透 + 风扇灯）
  rbox(g, 0.22, 0.48, 0.46, mat(0x18191d, { roughness: 0.4, metalness: 0.3 }), 0.62, 0.02, -0.08, 0.02);
  const pcGlow = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: accent, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 });
  const side = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), pcGlow);
  side.position.set(0.509, 0.26, -0.08);
  side.rotation.y = -Math.PI / 2;
  g.add(side);
  for (const fy of [0.16, 0.36]) {
    const fan = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 20), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: accent, emissiveIntensity: 1.2 }));
    fan.position.set(0.507, fy, -0.08);
    fan.rotation.y = -Math.PI / 2;
    g.add(fan);
  }

  // 桌面小物：杯子、零食、耳机架
  const mugColor = [0xf2efe8, 0xc8693a, 0x2f3e66][idx % 3];
  lathe(g, [[0, 0], [0.035, 0], [0.04, 0.1], [0.037, 0.1], [0.032, 0.008], [0, 0.008]], mat(mugColor, { roughness: 0.4 }), -0.68, 0.77, 0.05, 16);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 6, 12), mat(mugColor, { roughness: 0.4 }));
  handle.position.set(-0.635, 0.82, 0.05);
  g.add(handle);
  if (idx % 2 === 0) rbox(g, 0.14, 0.03, 0.1, mat(0xd94f3d), 0.62, 0.77, 0.05, 0.01, 0.4);
  cyl(g, 0.04, 0.05, 0.015, metal, 0.7, 0.77, -0.25, 12);
  cyl(g, 0.01, 0.01, 0.3, metal, 0.7, 0.78, -0.25, 6);
  const hp = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.014, 6, 16, Math.PI), dark);
  hp.position.set(0.7, 1.0, -0.25);
  g.add(hp);
  for (const s of [-1, 1]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 14), mat(accent, { roughness: 0.5 }));
    cup.rotation.z = Math.PI / 2;
    cup.position.set(0.7 + s * 0.08, 0.99, -0.25);
    g.add(cup);
  }

  // 台灯（奇数工位）
  let lamp: Desk['lamp'] = null;
  if (idx % 2 === 1) {
    const lg = new THREE.Group();
    lg.position.set(-0.55, 0.77, -0.3);
    cyl(lg, 0.06, 0.07, 0.02, metal, 0, 0, 0, 14);
    const arm = rbox(lg, 0.018, 0.4, 0.018, metal, 0, 0.02, 0, 0.008);
    arm.rotation.z = -0.25;
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc27a, emissiveIntensity: 0 });
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 16, 1, true), mat(0x2b2b30, { side: THREE.DoubleSide }));
    head.position.set(0.1, 0.42, 0.02);
    head.rotation.z = -0.6;
    lg.add(head);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), bulbMat);
    bulb.position.set(0.12, 0.39, 0.02);
    lg.add(bulb);
    g.add(lg);
    lamp = { mat: bulbMat };
  }

  // 电竞椅（面朝 -z，靠背在 +z 侧）：五星脚 + 轮子、包边坐垫、带侧翼的靠背、头枕、扶手
  const chair = new THREE.Group();
  const chairZ = 0.95;
  chair.position.set(0, 0, chairZ);
  g.add(chair);
  const seatMat = mat(0x1d1f25, { roughness: 0.55 });
  const accentMat = mat(accent, { roughness: 0.55 });
  const wheel = new THREE.SphereGeometry(0.03, 8, 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = rbox(chair, 0.045, 0.035, 0.3, metal, Math.sin(a) * 0.14, 0.04, Math.cos(a) * 0.14, 0.012);
    leg.rotation.y = a;
    const w = new THREE.Mesh(wheel, dark);
    w.position.set(Math.sin(a) * 0.28, 0.03, Math.cos(a) * 0.28);
    chair.add(w);
  }
  cyl(chair, 0.028, 0.035, 0.32, metal, 0, 0.07, 0, 10);
  rbox(chair, 0.54, 0.09, 0.52, seatMat, 0, 0.39, 0, 0.04);
  rbox(chair, 0.3, 0.015, 0.44, accentMat, 0, 0.477, 0, 0.006);
  const back = new THREE.Group();
  back.position.set(0, 0.48, 0.27);
  back.rotation.x = 0.12;
  chair.add(back);
  rbox(back, 0.52, 0.84, 0.1, seatMat, 0, 0, 0, 0.045);
  for (const sx of [-1, 1]) {
    const wing = rbox(back, 0.08, 0.5, 0.12, seatMat, sx * 0.25, 0.08, -0.02, 0.035);
    wing.rotation.y = sx * 0.35;
    rbox(back, 0.07, 0.72, 0.105, accentMat, sx * 0.15, 0.05, 0, 0.03);
  }
  rbox(back, 0.28, 0.12, 0.08, accentMat, 0, 0.66, -0.06, 0.04);
  rbox(back, 0.32, 0.12, 0.13, seatMat, 0, 0.7, 0.01, 0.05);
  for (const sx of [-0.29, 0.29]) {
    rbox(chair, 0.045, 0.22, 0.045, metal, sx, 0.44, 0.02, 0.012);
    rbox(chair, 0.08, 0.04, 0.3, seatMat, sx, 0.66, 0.0, 0.018);
  }
  shadow(g);

  // 显示器补光
  const screenLight = new THREE.PointLight(0x9cc2ff, 0, 3.2, 1.8);
  screenLight.position.set(x, 1.15, z + 0.15);
  parent.add(screenLight);

  return {
    group: g, chair, chairBaseZ: chairZ, screens, screenLight, rgbMat, kbGlow, pcGlow, lamp,
    seat: new THREE.Vector3(x, 0, z + chairZ - 0.05),
    standSpot: new THREE.Vector3(x, 0, z + 0.62),
    jiggle: 0, monitor: mg,
  };
}

export interface Office {
  root: THREE.Group;
  desks: Desk[];
  spots: {
    door: THREE.Vector3;
    snack: THREE.Vector3[];
    drink: THREE.Vector3[];
    fridge: THREE.Vector3;
    sofa: THREE.Vector3;
    whiteboard: (i: number) => THREE.Vector3;
    chat: THREE.Vector3[];
    sub: THREE.Vector3;
  };
  lamps: Lamp[];
  sky: SkyTexture;
  wb: WhiteboardTexture;
  doorPivot: THREE.Group;
  clock: { hourHand: THREE.Mesh; minHand: THREE.Mesh };
  glowMat: THREE.MeshStandardMaterial;
  fridgeDoor: THREE.Group;
}

export function buildOffice(scene: THREE.Scene, members: MemberDef[]): Office {
  const root = new THREE.Group();
  scene.add(root);
  const { x0, x1, z0, z1, h } = ROOM;
  const W = x1 - x0, D = z1 - z0;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xead6b4, map: plasterTexture(), roughness: 0.92 });
  const wallTop = mat(0xf2e7d6, { roughness: 0.9 });
  const trim = mat(0x3a2a20, { roughness: 0.6 });
  const frame = mat(0x2b2e34, { roughness: 0.45, metalness: 0.3 });

  // ── 底座（深色）+ 发光描边 + 侧面字 ──
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(W + 0.7, 0.7, D + 0.7, 3, 0.06), mat(0x171a21, { roughness: 0.6 }));
  plinth.position.set(0, -0.47, 0);
  plinth.receiveShadow = true;
  root.add(plinth);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xe8a060, emissive: 0xe8a060, emissiveIntensity: 1.2 });
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.015, 0.015), glowMat);
  t1.position.set(0, -0.13, z1 + 0.355);
  root.add(t1);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, D + 0.6), glowMat);
  t2.position.set(x1 + 0.355, -0.13, 0);
  root.add(t2);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.7), new THREE.MeshBasicMaterial({ map: plinthLabel('SSB电竞经理'), transparent: true }));
  lbl.position.set(-2.2, -0.48, z1 + 0.352);
  root.add(lbl);
  const lbl2 = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.7), new THREE.MeshBasicMaterial({ map: plinthLabel('SSB ESPORTS MANAGER', 52), transparent: true }));
  lbl2.position.set(x1 + 0.352, -0.48, 1.5);
  lbl2.rotation.y = Math.PI / 2;
  root.add(lbl2);

  // ── 地板 ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.55, color: 0xffffff }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  box(root, W + 0.4, 0.12, D + 0.4, mat(0x2a2018), 0, -0.121, 0).receiveShadow = true;

  // ── 墙：后墙（含门洞与窗洞）、左墙、前/右矮墙 ──
  const T = 0.2;
  const wz = z0 - T / 2;
  const door = { x0: -6.4, x1: -5.3, h: 2.2 };
  const win = { x0: -4.4, x1: 1.6, y0: 0.95, y1: 2.55 };
  const seg = (xa: number, xb: number, ya: number, yb: number) => box(root, xb - xa, yb - ya, T, wallMat, (xa + xb) / 2, ya, wz);
  seg(x0 - T, door.x0, 0, h);
  seg(door.x0, door.x1, door.h, h);
  seg(door.x1, win.x0, 0, h);
  seg(win.x0, win.x1, 0, win.y0);
  seg(win.x0, win.x1, win.y1, h);
  seg(win.x1, x1 + T, 0, h);
  box(root, T, h, D + T, wallMat, x0 - T / 2, 0, -T / 2);
  rbox(root, W + 2 * T, 0.5, T, wallMat, 0, 0, z1 + T / 2, 0.02);
  rbox(root, T, 0.5, D + T, wallMat, x1 + T / 2, 0, 0, 0.02);
  // 墙顶封边（剖面感）
  box(root, W + 2 * T, 0.03, T + 0.02, wallTop, 0, h, wz);
  box(root, T + 0.02, 0.03, D + T, wallTop, x0 - T / 2, h, -T / 2);
  rbox(root, W + 2 * T + 0.02, 0.04, T + 0.04, wallTop, 0, 0.5, z1 + T / 2, 0.015);
  rbox(root, T + 0.04, 0.04, D + T + 0.02, wallTop, x1 + T / 2, 0.5, 0, 0.015);
  // 踢脚线 + 腰线
  box(root, W, 0.1, 0.025, trim, 0, 0, z0 + 0.012);
  box(root, 0.025, 0.1, D, trim, x0 + 0.012, 0, 0);
  box(root, W, 0.03, 0.02, mat(0xd8c29c), 0, 0.92, z0 + 0.01);

  // 窗：窗外天空贴图 + 窗框 + 窗台 + 有褶皱的窗帘
  const sky = new SkyTexture();
  const skyMat = new THREE.MeshBasicMaterial({ map: sky.texture, toneMapped: false });
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(win.x1 - win.x0 + 0.4, win.y1 - win.y0 + 0.4), skyMat);
  skyPlane.position.set((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, z0 - 0.35);
  root.add(skyPlane);
  for (const fx of [win.x0, -2.4, -0.4, win.x1]) rbox(root, 0.06, win.y1 - win.y0, 0.08, frame, fx, win.y0, z0 - 0.08, 0.01);
  rbox(root, win.x1 - win.x0, 0.05, 0.08, frame, (win.x0 + win.x1) / 2, win.y1 - 0.05, z0 - 0.08, 0.01);
  rbox(root, win.x1 - win.x0, 0.035, 0.08, frame, (win.x0 + win.x1) / 2, 1.75, z0 - 0.08, 0.01);
  rbox(root, win.x1 - win.x0 + 0.24, 0.045, 0.26, mat(0xe8dcc8, { roughness: 0.5 }), (win.x0 + win.x1) / 2, win.y0 - 0.045, z0 + 0.06, 0.012);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(win.x1 - win.x0, win.y1 - win.y0), new THREE.MeshStandardMaterial({ color: 0xaac8e8, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.2 }));
  glass.position.set((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, z0 - 0.1);
  root.add(glass);
  const curtainMat = mat(0xe9dfcd, { roughness: 1, side: THREE.DoubleSide });
  curtain(root, win.x0 - 0.3, z0 + 0.14, 0.62, 2.72, curtainMat);
  curtain(root, win.x1 + 0.3, z0 + 0.14, 0.62, 2.72, curtainMat);
  const rod = cyl(root, 0.015, 0.015, win.x1 - win.x0 + 1.3, frame, (win.x0 + win.x1) / 2, 0, z0 + 0.14, 8);
  rod.rotation.z = Math.PI / 2;
  rod.position.y = 2.8;
  // 窗台上的小多肉
  for (const [px, c] of [[-3.7, 0xc8693a], [-1.2, 0xe9e2d6], [0.9, 0x7b8a99]] as const) {
    lathe(root, [[0, 0], [0.06, 0], [0.075, 0.1], [0, 0.1]], mat(c, { roughness: 0.6 }), px, win.y0, z0 + 0.06, 14);
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 1), mat(0x5c8f55, { roughness: 0.7 }));
    s.position.set(px, win.y0 + 0.14, z0 + 0.06);
    s.scale.set(1, 0.7, 1);
    root.add(shadow(s));
  }

  // 门（向内开）
  rbox(root, 0.07, door.h, 0.24, trim, door.x0 - 0.035, 0, z0 - 0.02, 0.012);
  rbox(root, 0.07, door.h, 0.24, trim, door.x1 + 0.035, 0, z0 - 0.02, 0.012);
  rbox(root, door.x1 - door.x0 + 0.14, 0.07, 0.24, trim, (door.x0 + door.x1) / 2, door.h, z0 - 0.02, 0.012);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(door.x0, 0, z0 - 0.05);
  root.add(doorPivot);
  const doorMat = mat(0x7a5236, { roughness: 0.55 });
  rbox(doorPivot, door.x1 - door.x0, door.h - 0.02, 0.05, doorMat, (door.x1 - door.x0) / 2, 0, 0, 0.012);
  for (const py of [0.25, 1.2]) rbox(doorPivot, door.x1 - door.x0 - 0.24, py === 0.25 ? 0.8 : 0.75, 0.012, mat(0x6b4630, { roughness: 0.6 }), (door.x1 - door.x0) / 2, py, 0.027, 0.006);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), mat(0xc9a35a, { metalness: 0.85, roughness: 0.25 }));
  knob.position.set(door.x1 - door.x0 - 0.12, 1.0, 0.06);
  doorPivot.add(knob);
  const doorDark = new THREE.Mesh(new THREE.PlaneGeometry(door.x1 - door.x0, door.h), new THREE.MeshBasicMaterial({ color: 0x0c0d10 }));
  doorDark.position.set((door.x0 + door.x1) / 2, door.h / 2, z0 - 0.19);
  root.add(doorDark);

  // 左墙：胡桃木格栅、白板、挂画；门旁海报
  const slat = new THREE.Mesh(new THREE.BoxGeometry(0.04, h - 0.02, 2.0), new THREE.MeshStandardMaterial({ map: slatTexture(), roughness: 0.6 }));
  slat.position.set(x0 + 0.03, h / 2, -4.0);
  slat.receiveShadow = true;
  root.add(slat);
  const wb = new WhiteboardTexture();
  rbox(root, 0.05, 1.32, 2.12, mat(0xb8bcc2, { metalness: 0.6, roughness: 0.35 }), x0 + 0.03, 0.94, -1.6, 0.02);
  const wbFace = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.22), new THREE.MeshStandardMaterial({ map: wb.texture, roughness: 0.35, emissive: 0xffffff, emissiveMap: wb.texture, emissiveIntensity: 0.08 }));
  wbFace.position.set(x0 + 0.06, 1.6, -1.6);
  wbFace.rotation.y = Math.PI / 2;
  root.add(wbFace);
  rbox(root, 0.12, 0.03, 1.2, frame, x0 + 0.08, 0.92, -1.6, 0.01);
  for (const [i, cz] of [[1, 1.7], [2, 2.75]] as const) {
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshStandardMaterial({ map: artTexture(i * 13), roughness: 0.8 }));
    art.position.set(x0 + 0.055, 1.85, cz);
    art.rotation.y = Math.PI / 2;
    root.add(art);
    rbox(root, 0.03, 0.86, 0.7, trim, x0 + 0.025, 1.42, cz, 0.01);
  }
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.84), new THREE.MeshStandardMaterial({ map: posterTexture(), roughness: 0.7 }));
  poster.position.set(-4.85, 1.55, z0 + 0.02);
  root.add(poster);
  // 左墙书架（沙发上方）
  const shelfWood = mat(0x6b4630, { roughness: 0.55 });
  for (const sy of [2.05, 2.45]) rbox(root, 0.26, 0.035, 1.3, shelfWood, x0 + 0.13, sy, 0.6, 0.01);
  const bookColors = [0xc8693a, 0x2f3e66, 0xe9c46a, 0x3f6b4f, 0x9b3b3b, 0xe9e2d6];
  for (let i = 0; i < 9; i++) {
    const bh = 0.2 + (i % 3) * 0.04;
    const b = rbox(root, 0.18, bh, 0.06, mat(bookColors[i % bookColors.length], { roughness: 0.8 }), x0 + 0.13, 2.085, 0.12 + i * 0.075, 0.006);
    if (i === 8) b.rotation.x = 0.25;
  }
  const trophy0 = new THREE.Group();
  lathe(trophy0, [[0, 0], [0.06, 0], [0.06, 0.04], [0.015, 0.06], [0.015, 0.12], [0.08, 0.16], [0.09, 0.26], [0, 0.22]], mat(0xd4a83a, { metalness: 0.8, roughness: 0.25 }), 0, 0, 0, 20);
  trophy0.position.set(x0 + 0.13, 2.485, 0.6);
  root.add(shadow(trophy0));

  // ── 工位 ──
  const desks: Desk[] = [];
  const accentOf = Object.fromEntries(members.map((m) => [m.id, m.look.shirt]));
  DESK_OWNERS.forEach((owner, i) => {
    const row = Math.floor(i / 3), col = i % 3;
    const d = buildDesk(root, DESK_X[col], ROW_Z[row], accentOf[owner], i);
    desks.push({ ...d, owner, approach: `${row === 0 ? 'A' : 'B'}${col}` });
  });

  // ── 茶水 / 零食区（后墙右侧）──
  const counterTop = mat(0xf0ebe2, { roughness: 0.35 });
  const cabinet = mat(0x8a5a3c, { roughness: 0.55 });
  rbox(root, 3.8, 0.84, 0.6, cabinet, 4.3, 0.04, z0 + 0.3, 0.015);
  box(root, 3.76, 0.04, 0.56, mat(0x2a1d14), 4.3, 0, z0 + 0.3);
  rbox(root, 3.88, 0.05, 0.66, counterTop, 4.3, 0.88, z0 + 0.33, 0.015);
  for (let i = 0; i < 5; i++) {
    const cx = 2.82 + i * 0.74;
    rbox(root, 0.7, 0.72, 0.02, mat(0x9a6a48, { roughness: 0.5 }), cx, 0.1, z0 + 0.605, 0.01);
    rbox(root, 0.18, 0.018, 0.025, mat(0xc9ccd1, { metalness: 0.8, roughness: 0.25 }), cx, 0.74, z0 + 0.625, 0.008);
  }
  // 冰箱（双开门，左门可开）
  const fridgeMat = mat(0xc9ccd1, { metalness: 0.55, roughness: 0.28 });
  rbox(root, 0.74, 1.86, 0.66, fridgeMat, 6.6, 0, z0 + 0.34, 0.05);
  const fridgeDoor = new THREE.Group();
  fridgeDoor.position.set(6.235, 0, z0 + 0.68);
  root.add(fridgeDoor);
  rbox(fridgeDoor, 0.36, 1.82, 0.04, fridgeMat, 0.18, 0.02, 0, 0.02);
  rbox(fridgeDoor, 0.025, 0.55, 0.03, mat(0x777a80, { metalness: 0.85, roughness: 0.2 }), 0.32, 0.95, 0.03, 0.01);
  rbox(root, 0.025, 0.55, 0.03, mat(0x777a80, { metalness: 0.85, roughness: 0.2 }), 6.65, 0.95, z0 + 0.71, 0.01);
  // 冰箱上的贴纸便签
  for (const [px, py, c] of [[6.8, 1.5, 0xf2c14e], [6.75, 1.25, 0x6fb7e8]] as const) {
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), mat(c, { roughness: 0.9 }));
    note.position.set(px, py, z0 + 0.676);
    note.rotation.z = (px - 6.77) * 3;
    root.add(note);
  }
  // 咖啡机、微波炉、零食柜（开放式小格子）、奶茶杯
  rbox(root, 0.3, 0.4, 0.32, mat(0x1e1f22, { roughness: 0.35, metalness: 0.2 }), 2.75, 0.93, z0 + 0.25, 0.04);
  cyl(root, 0.045, 0.04, 0.08, mat(0xf2efe8), 2.75, 0.95, z0 + 0.36, 12);
  rbox(root, 0.54, 0.31, 0.38, mat(0xe7e7e7, { roughness: 0.35 }), 5.55, 0.93, z0 + 0.28, 0.03);
  const mwDoor = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.15, metalness: 0.3 }));
  mwDoor.position.set(5.48, 1.085, z0 + 0.471);
  root.add(mwDoor);
  const snackCab = new THREE.Group();
  snackCab.position.set(3.6, 0.93, z0 + 0.3);
  root.add(snackCab);
  const cabWood = mat(0xc8a26a, { roughness: 0.7 });
  rbox(snackCab, 0.66, 0.03, 0.34, cabWood, 0, 0, 0, 0.01);
  rbox(snackCab, 0.66, 0.03, 0.34, cabWood, 0, 0.2, 0, 0.01);
  rbox(snackCab, 0.66, 0.03, 0.34, cabWood, 0, 0.4, 0, 0.01);
  for (const sx of [-0.315, 0.315]) rbox(snackCab, 0.03, 0.43, 0.34, cabWood, sx, 0, 0, 0.01);
  const snackColors = [0xd94f3d, 0xf2c14e, 0x3fa34d, 0x4a7fd1, 0xe8833a, 0xb05fd1];
  for (let i = 0; i < 10; i++) {
    const shelfY = i < 5 ? 0.03 : 0.23;
    const sx = -0.24 + (i % 5) * 0.12;
    const bag = rbox(snackCab, 0.09, 0.12 + (i % 3) * 0.025, 0.08, mat(snackColors[i % snackColors.length], { roughness: 0.6 }), sx, shelfY, 0.02, 0.02);
    bag.rotation.y = (i % 3) * 0.2 - 0.2;
  }
  for (let i = 0; i < 3; i++) {
    lathe(root, [[0, 0], [0.036, 0], [0.045, 0.15], [0, 0.15]], mat(0xf3e2c7, { roughness: 0.5 }), 4.35 + i * 0.15, 0.93, z0 + 0.42, 14);
    cyl(root, 0.004, 0.004, 0.08, mat(0x2b2b30), 4.36 + i * 0.15, 1.07, z0 + 0.42, 4);
  }
  // 吊柜搁板 + 墙钟
  const shelfMat = mat(0x6b4630, { roughness: 0.55 });
  rbox(root, 2.8, 0.04, 0.3, shelfMat, 3.9, 1.65, z0 + 0.15, 0.012);
  rbox(root, 2.8, 0.04, 0.3, shelfMat, 3.9, 2.15, z0 + 0.15, 0.012);
  for (let i = 0; i < 7; i++) {
    const hh = 0.18 + (i % 3) * 0.05;
    lathe(root, [[0, 0], [0.06, 0], [0.07, hh * 0.8], [0.045, hh], [0, hh]], mat([0xe9e2d6, 0xc8693a, 0x7b8a99][i % 3], { roughness: 0.45 }), 2.8 + i * 0.32, 1.69, z0 + 0.15, 16);
  }
  const trophy = new THREE.Group();
  lathe(trophy, [[0, 0], [0.08, 0], [0.08, 0.05], [0.02, 0.07], [0.02, 0.14], [0.1, 0.18], [0.11, 0.3], [0, 0.26]], mat(0xd4a83a, { metalness: 0.8, roughness: 0.25 }), 0, 0, 0, 20);
  trophy.position.set(5.0, 2.19, z0 + 0.15);
  root.add(shadow(trophy));
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.24, 40), mat(0xf7f4ee));
  clockFace.position.set(6.0, 2.45, z0 + 0.03);
  root.add(clockFace);
  const clockRing = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.022, 10, 40), mat(0x2b2b30, { metalness: 0.4 }));
  clockRing.position.copy(clockFace.position);
  root.add(clockRing);
  for (let i = 0; i < 12; i++) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, i % 3 ? 0.025 : 0.045, 0.005), mat(0x2b2b30));
    const a = (i / 12) * Math.PI * 2;
    tick.position.set(6.0 + Math.sin(a) * 0.2, 2.45 + Math.cos(a) * 0.2, z0 + 0.035);
    tick.rotation.z = -a;
    root.add(tick);
  }
  const handMat = mat(0x1d1d1f);
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.13, 0.01), handMat);
  hourHand.geometry.translate(0, 0.065, 0);
  hourHand.position.set(6.0, 2.45, z0 + 0.045);
  const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.2, 0.01), handMat);
  minHand.geometry.translate(0, 0.1, 0);
  minHand.position.set(6.0, 2.45, z0 + 0.052);
  root.add(hourHand, minHand);
  // 饮水机：机身 + 倒扣水桶 + 出水口 + 接水杯
  const cooler = new THREE.Group();
  cooler.position.set(2.05, 0, z0 + 0.38);
  root.add(cooler);
  rbox(cooler, 0.36, 0.95, 0.36, mat(0xf1f1f1, { roughness: 0.4 }), 0, 0, 0, 0.04);
  rbox(cooler, 0.3, 0.16, 0.04, mat(0x2b2e34, { roughness: 0.3 }), 0, 0.55, 0.17, 0.02);
  for (const [sx, c] of [[-0.06, 0x3a8bd1], [0.06, 0xd94f3d]] as const) cyl(cooler, 0.015, 0.015, 0.05, mat(c, { roughness: 0.3 }), sx, 0.6, 0.2, 8);
  lathe(cooler, [[0, 0], [0.05, 0], [0.05, 0.05], [0.15, 0.12], [0.16, 0.42], [0.14, 0.46], [0, 0.46]], new THREE.MeshStandardMaterial({ color: 0x6fb7e8, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.1 }), 0, 0.95, 0, 24);
  cyl(cooler, 0.07, 0.07, 0.005, mat(0x9aa0a8, { metalness: 0.6 }), 0, 0.5, 0.2, 14);
  // 高脚小圆桌 + 凳子
  cyl(root, 0.42, 0.42, 0.04, counterTop, 4.3, 1.02, -2.4, 32);
  cyl(root, 0.035, 0.035, 1.0, mat(0x2b2b30, { metalness: 0.6 }), 4.3, 0.02, -2.4, 10);
  lathe(root, [[0, 0], [0.26, 0], [0.24, 0.02], [0, 0.03]], mat(0x2b2b30, { metalness: 0.6 }), 4.3, 0, -2.4);
  for (const sx of [-0.62, 0.62]) {
    lathe(root, [[0, 0], [0.18, 0], [0.19, 0.03], [0.17, 0.07], [0, 0.07]], mat(0xb5643a, { roughness: 0.7 }), 4.3 + sx, 0.7, -2.4);
    cyl(root, 0.022, 0.022, 0.7, mat(0x2b2b30, { metalness: 0.6 }), 4.3 + sx, 0, -2.4, 8);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.01, 6, 20), mat(0x2b2b30, { metalness: 0.6 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(4.3 + sx, 0.3, -2.4);
    root.add(ring);
  }

  // ── 沙发午睡角（左墙前段）──
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-5.4, 0.005, 2.4);
  rug.receiveShadow = true;
  root.add(rug);
  const sofaMat = mat(0xeee6d8, { roughness: 1 });
  const sofa = new THREE.Group();
  rbox(sofa, 0.95, 0.36, 2.4, sofaMat, 0, 0.1, 0, 0.08);
  rbox(sofa, 0.28, 0.86, 2.4, sofaMat, -0.36, 0.05, 0, 0.1);
  for (const sz of [-1.12, 1.12]) rbox(sofa, 0.95, 0.6, 0.22, sofaMat, 0, 0.05, sz, 0.09);
  for (const sz of [-0.5, 0.5]) rbox(sofa, 0.7, 0.14, 0.98, mat(0xf4eee4, { roughness: 1 }), 0.08, 0.44, sz, 0.06);
  for (const sz of [-0.5, 0.5]) {
    const bc = rbox(sofa, 0.18, 0.5, 0.96, mat(0xf4eee4, { roughness: 1 }), -0.17, 0.5, sz, 0.08);
    bc.rotation.z = 0.12;
  }
  for (const [sz, c] of [[-0.75, 0xc8693a], [0.75, 0xd88a4a]] as const) {
    const p = rbox(sofa, 0.13, 0.4, 0.4, mat(c, { roughness: 1 }), -0.02, 0.56, sz, 0.08);
    p.rotation.z = 0.25;
  }
  // 搭在扶手上的毯子
  rbox(sofa, 0.8, 0.04, 0.5, mat(0x7b8a99, { roughness: 1 }), 0.05, 0.6, 1.0, 0.02);
  for (const [fx, fz] of [[0.4, -1.15], [0.4, 1.15], [-0.4, -1.15], [-0.4, 1.15]]) cyl(sofa, 0.03, 0.025, 0.1, mat(0x3a2a20), fx, 0, fz, 8);
  sofa.position.set(-6.45, 0, 2.4);
  root.add(shadow(sofa));
  cyl(root, 0.38, 0.38, 0.04, mat(0x5a3a26, { roughness: 0.45 }), -5.15, 0.42, 2.4, 32);
  lathe(root, [[0, 0], [0.16, 0], [0.06, 0.06], [0.05, 0.36], [0.1, 0.42], [0, 0.42]], mat(0x5a3a26, { roughness: 0.45 }), -5.15, 0, 2.4);
  lathe(root, [[0, 0], [0.04, 0], [0.065, 0.1], [0.05, 0.13], [0, 0.13]], mat(0xe9e2d6, { roughness: 0.4 }), -5.05, 0.46, 2.3, 16);
  const lamps = [floorLamp(root, -6.55, 3.95), floorLamp(root, 6.45, 1.0)];

  // ── 前右休闲区：圆地毯、懒人沙发、矮桌 ──
  const rug2 = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.MeshStandardMaterial({ map: rugTexture('#cdbb9e', '#7b4b2a'), roughness: 1 }));
  rug2.rotation.x = -Math.PI / 2;
  rug2.position.set(4.6, 0.005, 2.7);
  rug2.receiveShadow = true;
  root.add(rug2);
  for (const [bx, bz, c] of [[3.8, 3.2, 0xb5643a], [5.4, 2.2, 0x4d5b70]] as const) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), mat(c, { roughness: 1 }));
    b.scale.set(1, 0.6, 1);
    b.position.set(bx, 0.27, bz);
    b.castShadow = b.receiveShadow = true;
    root.add(b);
    const dent = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10), mat(c, { roughness: 1 }));
    dent.scale.set(1, 0.35, 1);
    dent.position.set(bx, 0.52, bz);
    root.add(shadow(dent));
  }
  lathe(root, [[0, 0], [0.3, 0], [0.33, 0.26], [0.34, 0.3], [0, 0.3]], mat(0xd9cbb4, { roughness: 0.8 }), 4.6, 0, 2.75, 28);
  rbox(root, 0.3, 0.04, 0.2, mat(0x2b2b30), 4.6, 0.3, 2.75, 0.015, 0.5);

  // 绿植
  plant(root, -6.5, 4.5, 1.15, 0xe9e2d6, 1);
  plant(root, 6.5, 4.4, 1.3, 0x3a3d44, 2);
  plant(root, -6.5, 0.6, 0.9, 0xe9e2d6, 3);
  plant(root, 1.4, -3.1, 0.75, 0xc8693a, 4);
  plant(root, 6.55, -3.0, 0.8, 0xe9e2d6, 5);

  // ── 走位用的关键位置 ──
  const spots: Office['spots'] = {
    door: new THREE.Vector3(-5.85, 0, -4.75),
    snack: [new THREE.Vector3(3.4, 0, -4.2), new THREE.Vector3(3.95, 0, -4.2), new THREE.Vector3(4.7, 0, -4.2)],
    drink: [new THREE.Vector3(2.05, 0, -4.05), new THREE.Vector3(2.6, 0, -3.75), new THREE.Vector3(1.5, 0, -3.75)],
    fridge: new THREE.Vector3(6.05, 0, -3.95),
    sofa: new THREE.Vector3(-6.3, 0, 2.4),
    whiteboard: (i: number) => {
      // 围着白板站成扇形，间距约 0.8 米
      const a = -1.05 + i * 0.42;
      return new THREE.Vector3(-6.95 + 1.95 * Math.cos(a), 0, -1.6 + 1.95 * Math.sin(a));
    },
    chat: [new THREE.Vector3(2.75, 0, 1.05), new THREE.Vector3(3.55, 0, 1.05)],
    sub: new THREE.Vector3(-0.45, 0, 0.75),
  };

  return { root, desks, spots, lamps, sky, wb, doorPivot, clock: { hourHand, minHand }, glowMat, fridgeDoor };
}
