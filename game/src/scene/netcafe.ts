// 网吧角落（场地等级 0，开局场地）：老板在网吧包了角落一排 6 台机器
// 一排网吧机位（椅子破旧）、墙上招牌和价目表、旁边有路人网民、网管吧台、饮水机（唯一自带设施）
// 没有沙发、冰箱、懒人沙发：午睡只能趴桌；零食柜要花 800 买了才出现（data/facilities.ts）
import * as THREE from 'three';
import type { FacilityId } from '../data/facilities';
import { ROSTER, type Look, type MemberDef } from '../data/roster';
import { Character, type PoseName } from './character';
import { NavGraph } from './nav';
import {
  box, buildDoor, buildPlinth, cyl, DESK_OWNERS, facingTo, lathe, mat, plant, rbox, ROOM, shadow, wallClock, waterCooler, type Desk,
} from './office';
import { neonTexture, plasterTexture, screenTexture, signTexture, SkyTexture, tileTexture, type ScreenKind } from './textures';
import type { Spot, Venue } from './venue';

const TEAM_X = [-4.3, -2.9, -1.5, -0.1, 1.3, 2.7]; // 战队包下的一排机位（靠后墙）
const TEAM_Z = -4.45;
const PUB_X = [-4.3, -2.9, -1.5, -0.1, 1.3]; // 中间一排：散客区
const PUB_Z = 0.9;
const FRONT_X = [-4.3, -2.9, -1.5]; // 前排：包夜区
const FRONT_Z = 3.3;
const CHAIR_Z = 0.9;

export const NETCAFE_NAV = new NavGraph(
  {
    D: [-5.85, -4.75], DI: [-5.85, -3.7], AL: [-5.6, -2.85],
    A0: [-4.3, -2.85], A1: [-2.9, -2.85], A2: [-1.5, -2.85], A3: [-0.1, -2.85], A4: [1.3, -2.85], A5: [2.7, -2.85], AR: [3.9, -2.85],
    WC: [4.4, -3.85], SN: [5.85, -3.6], CH: [4.2, -1.6], MT: [-1.5, -1.6],
  },
  ['D-DI', 'DI-AL', 'AL-A0', 'A0-A1', 'A1-A2', 'A2-A3', 'A3-A4', 'A4-A5', 'A5-AR', 'AR-WC', 'WC-SN', 'AR-SN', 'AR-CH', 'A1-MT', 'A2-MT', 'A3-MT'],
);

// 网吧机位：贴面板桌 + 隔板 + 厚边框显示器 + 灰色机箱 + 破皮的老板椅（屏幕朝 +z，椅子在 +z 侧）
function cafeDesk(parent: THREE.Object3D, x: number, z: number, idx: number, num: string, withLight: boolean): Omit<Desk, 'owner' | 'approach'> {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  const board = mat(0xb9b0a0, { roughness: 0.7 });
  const edge = mat(0x3b3631, { roughness: 0.6 });
  const dark = mat(0x1c1d21, { roughness: 0.5 });
  const metal = mat(0x3a3c42, { metalness: 0.5, roughness: 0.4 });

  // 桌面、侧板、背板
  rbox(g, 1.25, 0.05, 0.7, board, 0, 0.72, 0, 0.01);
  box(g, 1.25, 0.02, 0.02, edge, 0, 0.73, 0.35);
  for (const sx of [-0.6, 0.6]) box(g, 0.03, 0.72, 0.66, board, sx, 0, 0);
  box(g, 1.17, 0.4, 0.02, board, 0, 0.3, -0.32);
  // 隔板：深色框 + 磨砂蓝面板
  const panel = new THREE.MeshStandardMaterial({ color: 0x5f7f99, roughness: 0.4, transparent: true, opacity: 0.78 });
  for (const sx of [-0.61, 0.61]) {
    box(g, 0.025, 0.42, 0.62, panel, sx, 0.77, -0.03);
    box(g, 0.04, 0.03, 0.64, edge, sx, 1.19, -0.03);
  }
  // 机号牌（隔板顶端，开机时亮）
  const rgbMat = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: 0xffffff, emissiveIntensity: 0.9,
    emissiveMap: signTexture({ w: 128, h: 64, bg: '#0d1218', fg: '#7fe0ff', title: num, titleSize: 40 }),
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), rgbMat);
  plate.position.set(-0.61, 1.27, 0.27);
  g.add(plate);
  rbox(g, 0.02, 0.1, 0.04, edge, -0.61, 1.2, 0.27, 0.005);

  // 键盘（键帽磨亮了）、鼠标、印着网吧名的旧鼠标垫
  rbox(g, 0.9, 0.004, 0.34, mat(0x2a3550, { roughness: 0.9 }), 0.05, 0.77, 0.14, 0.002);
  rbox(g, 0.44, 0.024, 0.15, dark, -0.12, 0.774, 0.16, 0.008);
  const kbGlow = new THREE.MeshStandardMaterial({ color: 0x18191c, emissive: 0x9fb4ff, emissiveIntensity: 0.3 });
  rbox(g, 0.41, 0.006, 0.125, kbGlow, -0.12, 0.796, 0.16, 0.002);
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), dark);
  mouse.scale.set(0.9, 0.5, 1.4);
  mouse.position.set(0.3, 0.788, 0.17);
  g.add(mouse);

  // 显示器：厚边框、方底座
  const screens: THREE.MeshStandardMaterial[] = [];
  const mg = new THREE.Group();
  mg.position.set(0, 0.77, -0.18);
  g.add(mg);
  rbox(mg, 0.26, 0.015, 0.18, dark, 0, 0, 0, 0.006);
  rbox(mg, 0.05, 0.22, 0.04, dark, 0, 0.01, -0.03, 0.01);
  rbox(mg, 0.66, 0.42, 0.05, dark, 0, 0.18, 0, 0.012);
  const scrMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: screenTexture('game', idx * 2 + 7), emissiveIntensity: 0, roughness: 0.3 });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.34), scrMat);
  scr.position.set(0, 0.39, 0.026);
  mg.add(scr);
  screens.push(scrMat);
  // 网吧的公用耳机挂在隔板上
  const hp = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.013, 6, 16, Math.PI), dark);
  hp.position.set(0.56, 1.0, 0.1);
  hp.rotation.y = Math.PI / 2;
  g.add(hp);

  // 桌下灰色机箱 + 电源灯
  rbox(g, 0.2, 0.42, 0.42, mat(0x8d9096, { roughness: 0.5, metalness: 0.2 }), 0.4, 0.02, -0.08, 0.01);
  const pcGlow = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x3fb6ff, emissiveIntensity: 0.6 });
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.012, 10), pcGlow);
  led.position.set(0.4, 0.38, 0.131);
  g.add(led);

  // 桌上小物：泡面桶、饮料瓶
  if (idx % 3 === 0) {
    lathe(g, [[0, 0], [0.05, 0], [0.065, 0.11], [0, 0.11]], mat(0xd9452b, { roughness: 0.5 }), -0.48, 0.77, 0.05, 16);
    cyl(g, 0.066, 0.066, 0.006, mat(0xf2e6c8), -0.48, 0.88, 0.05, 16);
  } else if (idx % 3 === 1) {
    cyl(g, 0.032, 0.032, 0.2, mat(0x2f8f4e, { roughness: 0.2 }), -0.5, 0.77, 0.0, 12);
    cyl(g, 0.016, 0.016, 0.03, mat(0xd94f3d), -0.5, 0.97, 0.0, 8);
  }

  // 破旧老板椅（面朝 -z，靠背在 +z 侧）：皮面磨破露出海绵，靠背贴着胶带，有的少一个扶手
  const chair = new THREE.Group();
  chair.position.set(0, 0, CHAIR_Z);
  g.add(chair);
  const leather = mat(0x26282d, { roughness: 0.42 });
  const foam = mat(0xc9a86a, { roughness: 1 });
  const tape = mat(0x9aa0a6, { roughness: 0.5, metalness: 0.2 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = rbox(chair, 0.04, 0.03, 0.28, metal, Math.sin(a) * 0.13, 0.04, Math.cos(a) * 0.13, 0.01);
    leg.rotation.y = a;
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), dark);
    w.position.set(Math.sin(a) * 0.26, 0.03, Math.cos(a) * 0.26);
    chair.add(w);
  }
  cyl(chair, 0.026, 0.032, 0.32, metal, 0, 0.07, 0, 10);
  rbox(chair, 0.5, 0.09, 0.48, leather, 0, 0.39, 0, 0.04);
  rbox(chair, 0.12 + (idx % 2) * 0.05, 0.006, 0.08, foam, 0.1 - (idx % 3) * 0.08, 0.478, 0.06, 0.003);
  const back = new THREE.Group();
  back.position.set(0, 0.47, 0.24);
  back.rotation.x = 0.16 + (idx % 2) * 0.06; // 靠背松了，往后仰
  chair.add(back);
  rbox(back, 0.46, 0.62, 0.08, leather, 0, 0.02, 0, 0.035);
  rbox(back, 0.1, 0.06, 0.005, foam, -0.1 + (idx % 3) * 0.08, 0.42, 0.041, 0.002);
  for (const [tx, rz] of [[0.08, 0.6], [0.08, -0.6]] as const) {
    const t = rbox(back, 0.2, 0.04, 0.004, tape, tx, 0.22, 0.042, 0.001);
    t.rotation.z = rz;
  }
  for (const sx of [-0.27, 0.27]) {
    if (idx % 3 === 1 && sx > 0) continue;
    rbox(chair, 0.035, 0.2, 0.035, metal, sx, 0.44, 0.02, 0.01);
    rbox(chair, 0.07, 0.035, 0.26, dark, sx, 0.64, 0.0, 0.015);
  }
  shadow(g);

  // 显示器补光（只给战队的 6 台，路人的机位不加灯，省性能）
  const screenLight = new THREE.PointLight(0x9cc2ff, 0, 3.0, 1.8);
  screenLight.position.set(x, 1.1, z + 0.15);
  if (withLight) parent.add(screenLight);

  return {
    group: g, chair, chairBaseZ: CHAIR_Z, screens, screenLight, rgbMat, kbGlow, pcGlow, lamp: null,
    seat: new THREE.Vector3(x, 0, z + CHAIR_Z - 0.05),
    standSpot: new THREE.Vector3(x, 0, z + 0.62),
    jiggle: 0, monitor: mg,
  };
}

function setStaticScreen(d: Omit<Desk, 'owner' | 'approach'>, kind: ScreenKind | 'off', seed: number) {
  const on = kind !== 'off';
  for (const s of d.screens) {
    if (on) s.emissiveMap = screenTexture(kind, seed);
    s.emissiveIntensity = !on ? 0 : kind === 'idle' ? 0.4 : 1;
    s.needsUpdate = true;
  }
  d.rgbMat.emissiveIntensity = on ? 0.9 : 0.15;
  d.pcGlow.emissiveIntensity = on ? 0.6 : 0.08;
  d.kbGlow.emissiveIntensity = on ? 0.3 : 0.03;
}

// 路人网民：借用队员的人物模型，不带名牌、不能点
function npc(parent: THREE.Object3D, id: string, look: Look, at: THREE.Vector3, facing: number, pose: PoseName): Character {
  const def: MemberDef = { ...ROSTER[0], id, name: '路人', secondary: undefined, look };
  const c = new Character(def);
  const labels: THREE.Object3D[] = [];
  c.root.traverse((o) => {
    if ((o as { isCSS2DObject?: boolean }).isCSS2DObject) labels.push(o);
  });
  for (const o of labels) o.removeFromParent();
  c.teleport(at, facing, pose);
  parent.add(c.root);
  return c;
}

function plane(parent: THREE.Object3D, w: number, h: number, material: THREE.Material, x: number, y: number, z: number, rotY = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function buildNetcafe(scene: THREE.Scene, members: MemberDef[], fac: ReadonlySet<FacilityId>): Venue {
  void members;
  const root = new THREE.Group();
  scene.add(root);
  const { x0, x1, z0, z1, h } = ROOM;
  const W = x1 - x0, D = z1 - z0;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x9fb0a6, map: plasterTexture(), roughness: 0.95 });
  const wainscot = mat(0x3d4b47, { roughness: 0.75 });
  const wallTop = mat(0xe6e0d2, { roughness: 0.9 });
  const trim = mat(0x2d3235, { roughness: 0.6 });
  const frame = mat(0x3a3e44, { roughness: 0.45, metalness: 0.4 });

  const glowMat = buildPlinth(root);

  // ── 地砖 ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.4, color: 0xffffff }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  box(root, W + 0.4, 0.12, D + 0.4, mat(0x24221f), 0, -0.121, 0).receiveShadow = true;

  // ── 墙：后墙（门洞 + 小窗）、左墙、前/右矮墙；下半截深色墙裙 ──
  const T = 0.2;
  const wz = z0 - T / 2;
  const door = { x0: -6.4, x1: -5.3, h: 2.2 };
  const win = { x0: -3.6, x1: -0.4, y0: 1.5, y1: 2.35 };
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
  box(root, W + 2 * T, 0.03, T + 0.02, wallTop, 0, h, wz);
  box(root, T + 0.02, 0.03, D + T, wallTop, x0 - T / 2, h, -T / 2);
  rbox(root, W + 2 * T + 0.02, 0.04, T + 0.04, wallTop, 0, 0.5, z1 + T / 2, 0.015);
  rbox(root, T + 0.04, 0.04, D + T + 0.02, wallTop, x1 + T / 2, 0.5, 0, 0.015);
  box(root, door.x0 - x0, 1.0, 0.02, wainscot, (x0 + door.x0) / 2, 0, z0 + 0.011);
  box(root, x1 - door.x1, 1.0, 0.02, wainscot, (door.x1 + x1) / 2, 0, z0 + 0.011);
  box(root, 0.02, 1.0, D, wainscot, x0 + 0.011, 0, 0);
  box(root, door.x0 - x0, 0.03, 0.03, trim, (x0 + door.x0) / 2, 1.0, z0 + 0.015);
  box(root, x1 - door.x1, 0.03, 0.03, trim, (door.x1 + x1) / 2, 1.0, z0 + 0.015);
  box(root, 0.03, 0.03, D, trim, x0 + 0.015, 1.0, 0);

  // 小窗 + 防盗栏
  const sky = new SkyTexture();
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(win.x1 - win.x0 + 0.4, win.y1 - win.y0 + 0.4), new THREE.MeshBasicMaterial({ map: sky.texture, toneMapped: false }));
  skyPlane.position.set((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, z0 - 0.35);
  root.add(skyPlane);
  for (const fx of [win.x0, win.x1]) rbox(root, 0.06, win.y1 - win.y0, 0.08, frame, fx, win.y0, z0 - 0.08, 0.01);
  for (const fy of [win.y0, win.y1 - 0.05]) rbox(root, win.x1 - win.x0, 0.05, 0.08, frame, (win.x0 + win.x1) / 2, fy, z0 - 0.08, 0.01);
  for (let i = 1; i < 9; i++) cyl(root, 0.011, 0.011, win.y1 - win.y0, frame, win.x0 + ((win.x1 - win.x0) * i) / 9, win.y0, z0 + 0.02, 6);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(win.x1 - win.x0, win.y1 - win.y0), new THREE.MeshStandardMaterial({ color: 0xb8c4b0, transparent: true, opacity: 0.22, roughness: 0.2 }));
  glass.position.set((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, z0 - 0.1);
  root.add(glass);

  const doorPivot = buildDoor(root, door, mat(0x6f7b80, { roughness: 0.45, metalness: 0.35 }), trim);

  // ── 墙上：横幅、霓虹招牌、价目表、提示牌、联赛海报 ──
  const sign = (spec: Parameters<typeof signTexture>[0], w: number, hh: number, x: number, y: number, z: number, rotY = 0, emissive = 0) => {
    const tex = signTexture(spec);
    return plane(root, w, hh, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: emissive }), x, y, z, rotY);
  };
  sign({ w: 1024, h: 112, bg: '#c0261d', fg: '#ffd84a', title: '热烈庆祝 SSB 战队成立！', titleSize: 66 }, 3.8, 0.42, (win.x0 + win.x1) / 2, 2.66, z0 + 0.02);
  const neonMat = new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveMap: neonTexture('星空网吧', '#ff4fa3', '24 小时营业 · 千兆光纤'), emissiveIntensity: 1.5, roughness: 0.4 });
  rbox(root, 2.3, 0.62, 0.05, mat(0x15161a), 4.85, 1.9, z0 + 0.03, 0.02);
  plane(root, 2.2, 0.55, neonMat, 4.85, 2.21, z0 + 0.06);
  const neonLight = new THREE.PointLight(0xff5fb0, 1.1, 5, 1.6);
  neonLight.position.set(4.85, 2.1, z0 + 0.6);
  root.add(neonLight);
  const clock = wallClock(root, 2.4, 2.35, z0 + 0.03, 0xf1ede2);
  const L = Math.PI / 2;
  sign({ w: 520, h: 400, bg: '#1d3557', fg: '#ffe8a3', border: '#e9c46a', title: '价 目 表', titleSize: 54,
    lines: ['普通区　5 元 / 小时', '包夜（22:00–8:00）25 元', '泡面 6 元　加肠 +2', '可乐 / 冰红茶 4 元', '会员充 100 送 20'], lineSize: 34 },
  1.3, 1.0, x0 + 0.03, 1.72, -1.4, L, 0.06);
  sign({ w: 360, h: 220, bg: '#b3261e', fg: '#ffffff', title: '文明上网', titleSize: 60, lines: ['禁止吸烟 · 爱护设备'], lineSize: 30 }, 0.8, 0.49, x0 + 0.03, 1.6, 0.9, L);
  sign({ w: 360, h: 180, bg: '#f4f1ea', fg: '#b3261e', border: '#b3261e', title: '未成年人禁止入内', titleSize: 40, lines: ['上网请出示身份证'], lineSize: 26 }, 0.72, 0.36, x0 + 0.03, 1.55, -3.6, L);
  sign({ w: 300, h: 420, bg: '#0b1a33', fg: '#c89b3c', border: '#c89b3c', title: '网吧联赛', titleSize: 52, lines: ['火热报名中', '冠军奖金 5000 元', '五黑组队 · 详询网管'], lineSize: 26 }, 0.66, 0.92, x0 + 0.03, 1.6, 2.6, L, 0.05);

  // ── 战队的 6 台机器 ──
  const desks: Desk[] = DESK_OWNERS.map((owner, i) => ({
    ...cafeDesk(root, TEAM_X[i], TEAM_Z, i, `A0${i + 1}`, true), owner, approach: `A${i}`,
  }));

  // ── 饮水机（自带）+ 零食柜（设施）──
  waterCooler(root, 4.4, z0 + 0.38);
  lathe(root, [[0, 0], [0.12, 0], [0.13, 0.28], [0, 0.28]], mat(0x3a3d44, { roughness: 0.8 }), 3.85, 0, z0 + 0.3, 16); // 垃圾桶
  if (fac.has('snack')) {
    const cab = new THREE.Group();
    cab.position.set(5.85, 0, z0 + 0.26);
    root.add(cab);
    const wood = mat(0xc8a26a, { roughness: 0.7 });
    rbox(cab, 0.86, 0.06, 0.42, wood, 0, 0, 0, 0.01);
    for (const sy of [0.42, 0.82, 1.22]) rbox(cab, 0.86, 0.03, 0.42, wood, 0, sy, 0, 0.01);
    for (const sx of [-0.415, 0.415]) rbox(cab, 0.03, 1.25, 0.42, wood, sx, 0, 0, 0.01);
    rbox(cab, 0.86, 1.25, 0.02, mat(0xa98452), 0, 0, -0.2, 0.005);
    const colors = [0xd94f3d, 0xf2c14e, 0x3fa34d, 0x4a7fd1, 0xe8833a, 0xb05fd1];
    for (let i = 0; i < 15; i++) {
      const shelf = [0.06, 0.45, 0.85][Math.floor(i / 5)];
      const bag = rbox(cab, 0.12, 0.17 + (i % 3) * 0.04, 0.1, mat(colors[(i * 7) % colors.length], { roughness: 0.6 }), -0.3 + (i % 5) * 0.15, shelf, 0.04, 0.025);
      bag.rotation.y = (i % 3) * 0.2 - 0.2;
    }
    plane(cab, 0.5, 0.14, new THREE.MeshStandardMaterial({ map: signTexture({ w: 256, h: 72, bg: '#f2c14e', fg: '#3b2a12', title: 'SSB 零食柜', titleSize: 38 }) }), 0, 1.38, 0.0);
    rbox(cab, 0.52, 0.16, 0.02, mat(0x3b2a12), 0, 1.29, -0.012, 0.005);
  }

  // ── 散客区：路人网民 ──
  const npcs: Character[] = [];
  const pub = PUB_X.map((x, i) => cafeDesk(root, x, PUB_Z, i + 6, `B0${i + 1}`, false));
  const front = FRONT_X.map((x, i) => cafeDesk(root, x, FRONT_Z, i + 11, `C0${i + 1}`, false));
  const seatOf = (d: Omit<Desk, 'owner' | 'approach'>) => d.seat;
  const looks: Look[] = [
    { height: 0.95, girth: 0.95, glasses: false, shirt: 0x6b6f78, pants: 0x2c3038, hair: 0x1b1816, skin: 0xeec39c, hairStyle: 'short' },
    { height: 1.02, girth: 1.05, glasses: true, shirt: 0x2a2c30, pants: 0x3b4a66, hair: 0x231e1c, skin: 0xe8bd95, hairStyle: 'messy' },
    { height: 0.9, girth: 0.9, glasses: false, shirt: 0xe0ddd5, pants: 0x2d2f36, hair: 0x2a211c, skin: 0xf2caa6, hairStyle: 'side' },
    { height: 1.0, girth: 1.3, glasses: false, shirt: 0x4b5d3f, pants: 0x3a3a40, hair: 0x3a3430, skin: 0xd9aa80, hairStyle: 'buzz' },
  ];
  const seated: [Omit<Desk, 'owner' | 'approach'>, PoseName, ScreenKind][] = [
    [pub[1], 'sit_play', 'game'],
    [pub[3], 'sit_phone', 'stream'],
    [pub[4], 'sit_play', 'game'],
    [front[0], 'sleep_desk', 'idle'], // 包夜的大叔还没醒
  ];
  seated.forEach(([d, pose, kind], i) => {
    const c = npc(root, `npc-${i}`, looks[i], seatOf(d), Math.PI, pose);
    c.headset.visible = pose === 'sit_play';
    c.phone.visible = pose === 'sit_phone';
    if (c.phone.visible) c.setPhoneScreen(0xff3b6b);
    npcs.push(c);
    setStaticScreen(d, kind, 40 + i);
  });
  for (const d of [pub[0], pub[2], front[1], front[2]]) setStaticScreen(d, d === pub[2] ? 'idle' : 'off', 50);

  // ── 网管吧台（前右角）：柜台、收银电脑、扫码牌、身后的货架 ──
  const cg = new THREE.Group();
  cg.position.set(5.2, 0, 2.6);
  root.add(cg);
  rbox(cg, 2.6, 1.0, 0.55, mat(0x6e4a32, { roughness: 0.55 }), 0, 0, 0, 0.02);
  rbox(cg, 2.7, 0.05, 0.66, mat(0xe8e2d4, { roughness: 0.35 }), 0, 1.0, 0.04, 0.015);
  rbox(cg, 2.5, 0.04, 0.02, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x5ff0ff, emissiveIntensity: 1.2 }), 0, 0.92, 0.28, 0.005);
  const cm = new THREE.Group();
  cm.position.set(-0.5, 1.05, 0.05);
  cm.rotation.y = Math.PI;
  cg.add(cm);
  rbox(cm, 0.2, 0.012, 0.14, mat(0x1c1d21), 0, 0, 0, 0.004);
  rbox(cm, 0.04, 0.16, 0.03, mat(0x1c1d21), 0, 0.01, 0.02, 0.008);
  rbox(cm, 0.5, 0.32, 0.04, mat(0x1c1d21), 0, 0.14, 0, 0.01);
  const cashScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.26), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: screenTexture('idle', 77), emissiveIntensity: 0.8 }));
  cashScreen.position.set(0, 0.3, -0.021);
  cashScreen.rotation.y = Math.PI;
  cm.add(cashScreen);
  rbox(cg, 0.36, 0.12, 0.3, mat(0x2b2b30), 0.2, 1.05, 0.12, 0.02); // 收银机
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xc9a35a, { metalness: 0.8, roughness: 0.25 }));
  bell.position.set(0.75, 1.05, -0.12);
  cg.add(bell);
  plane(cg, 0.22, 0.3, new THREE.MeshStandardMaterial({ map: signTexture({ w: 160, h: 220, bg: '#ffffff', fg: '#07c160', title: '扫码', titleSize: 44, lines: ['付款 · 充值'], lineSize: 24 }) }), 1.05, 1.22, 0.1);
  rbox(cg, 0.24, 0.34, 0.03, mat(0xdddddd), 1.05, 1.04, 0.085, 0.01);
  // 收银台招牌（立在柜台上，朝镜头）
  cyl(cg, 0.015, 0.015, 0.7, frame, -1.15, 1.05, 0.2, 8);
  rbox(cg, 0.86, 0.3, 0.04, mat(0x15161a), -1.15, 1.72, 0.2, 0.01);
  plane(cg, 0.8, 0.25, new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0xffffff, emissiveIntensity: 1.1, emissiveMap: signTexture({ w: 320, h: 100, bg: '#0d1218', fg: '#ffd84a', title: '收银 · 网管', titleSize: 46 }) }), -1.15, 1.87, 0.225);
  // 身后的货架：泡面、饮料
  const shelf = new THREE.Group();
  shelf.position.set(5.2, 0, 4.5);
  root.add(shelf);
  rbox(shelf, 2.4, 0.04, 0.36, mat(0x8a8f96, { metalness: 0.4 }), 0, 0.45, 0, 0.01);
  rbox(shelf, 2.4, 0.04, 0.36, mat(0x8a8f96, { metalness: 0.4 }), 0, 0.85, 0, 0.01);
  for (const sx of [-1.18, 1.18]) rbox(shelf, 0.04, 0.9, 0.36, mat(0x6b7077, { metalness: 0.4 }), sx, 0, 0, 0.01);
  for (let i = 0; i < 12; i++) {
    const sx = -1.0 + (i % 6) * 0.4;
    const sy = i < 6 ? 0.49 : 0.89;
    if (i % 2) lathe(shelf, [[0, 0], [0.06, 0], [0.075, 0.13], [0, 0.13]], mat([0xd9452b, 0xf2c14e][i % 4 === 1 ? 0 : 1], { roughness: 0.5 }), sx, sy, 0, 14);
    else cyl(shelf, 0.035, 0.035, 0.24, mat([0x2f8f4e, 0xd94f3d, 0x3a6fd1][i % 3], { roughness: 0.25 }), sx, sy, 0, 10);
  }
  shadow(cg);
  shadow(shelf);
  npcs.push(npc(root, 'npc-admin', { height: 1.05, girth: 1.2, glasses: true, shirt: 0xb03a2e, pants: 0x2d2f36, hair: 0x151312, skin: 0xe8bd95, hairStyle: 'buzz' },
    new THREE.Vector3(5.5, 0, 3.4), Math.PI, 'watch'));

  // “小心地滑”黄牌 + 拖把桶：网管刚拖过地
  const wet = new THREE.Group();
  wet.position.set(5.0, 0, 0.3);
  wet.rotation.y = 0.5;
  root.add(wet);
  const yellow = mat(0xf2c14e, { roughness: 0.5 });
  for (const sz of [-1, 1]) {
    const leaf = rbox(wet, 0.32, 0.62, 0.015, yellow, 0, 0, sz * 0.09, 0.01);
    leaf.rotation.x = sz * 0.28;
  }
  plane(wet, 0.26, 0.3, new THREE.MeshStandardMaterial({ map: signTexture({ w: 128, h: 148, bg: '#f2c14e', fg: '#1d1d1f', title: '⚠', titleSize: 54, lines: ['小心地滑'], lineSize: 24 }) }), 0, 0.33, 0.19);
  lathe(root, [[0, 0], [0.17, 0], [0.2, 0.3], [0, 0.3]], mat(0x3a7bd5, { roughness: 0.5 }), 5.7, 0, 0.75, 18);
  const mop = cyl(root, 0.012, 0.012, 1.25, mat(0xc9ccd1, { metalness: 0.5 }), 5.7, 0.12, 0.75, 6);
  mop.rotation.z = 0.25;
  shadow(wet);

  plant(root, -6.5, 4.45, 0.95, 0x3a3d44, 8);
  plant(root, 3.3, 4.5, 0.8, 0xc8693a, 9);

  // ── 走位用的关键位置 ──
  const drinkAt = [new THREE.Vector3(4.4, 0, -4.05), new THREE.Vector3(4.95, 0, -3.75), new THREE.Vector3(3.85, 0, -3.75)];
  const meeting = (i: number): Spot => {
    // 赛前会：围在战队机位后面的过道里
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    const at = new THREE.Vector3(-1.5 + Math.cos(a) * 0.95, 0, -1.6 + Math.sin(a) * 0.95);
    return { at, approach: 'MT', facing: facingTo(at, -1.5, -1.6), lead: i === 0 };
  };
  const spots: Venue['spots'] = {
    snack: fac.has('snack') ? [5.45, 5.9, 6.35].map((x) => ({ at: new THREE.Vector3(x, 0, -4.05), approach: 'SN', facing: Math.PI })) : undefined,
    drink: drinkAt.map((at) => ({ at, approach: 'WC', facing: facingTo(at, 4.4, -4.6) })),
    meeting,
    chat: [
      { at: new THREE.Vector3(3.8, 0, -1.6), approach: 'CH', facing: Math.PI / 2 },
      { at: new THREE.Vector3(4.6, 0, -1.6), approach: 'CH', facing: -Math.PI / 2 },
    ],
    sub: { at: new THREE.Vector3(0.6, 0, -2.45), approach: 'A3', facing: Math.PI },
  };

  return {
    level: 0, root, desks, spots, lamps: [], sky, doorPivot, clock, glowMat,
    nav: NETCAFE_NAV, door: 'D', exit: new THREE.Vector3(-5.85, 0, -5.7),
    update(dt, now) {
      for (const c of npcs) c.update(dt, now);
    },
  };
}
