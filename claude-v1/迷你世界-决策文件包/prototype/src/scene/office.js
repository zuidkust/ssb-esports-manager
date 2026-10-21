// 剖面式等距办公室：后墙与左墙完整，前墙与右墙只留矮墙，下面垫一个深色底座
import * as THREE from 'three';
import { floorTexture, plasterTexture, slatTexture, rugTexture, screenTexture, WhiteboardTexture, SkyTexture, plinthLabel, artTexture, posterTexture } from './textures.js';

export const ROOM = { x0: -7, x1: 7, z0: -5, z1: 5, h: 3.0 };
export const DESK_X = [-3.6, -1.5, 0.6];
export const ROW_Z = [-4.45, -1.75];
// 工位分配：后排（靠窗）吊龙、地鼠、弟必；前排 施颠、当邓、批菊
export const DESK_OWNERS = ['diaolong', 'dishu', 'dibi', 'shidian', 'dangdeng', 'piju'];

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.02, ...opts }));
  return matCache.get(key);
}

function shadow(o, cast = true, receive = true) {
  o.traverse((c) => {
    if (c.isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

// 以"底面高度"定位的盒子
function box(parent, w, h, d, material, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = rotY;
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(parent, rTop, rBot, h, material, x, y, z, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function plant(parent, x, z, scale = 1, potColor = 0xe9e2d6) {
  const g = new THREE.Group();
  cyl(g, 0.2, 0.15, 0.42, mat(potColor), 0, 0, 0, 14);
  cyl(g, 0.19, 0.19, 0.03, mat(0x3b2a1e), 0, 0.4, 0, 14);
  const leaf = mat(0x3f7a45, { flatShading: true });
  const leaf2 = mat(0x2f6238, { flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 4), i % 2 ? leaf : leaf2);
    l.position.set(Math.cos(a) * 0.12, 0.85 + (i % 3) * 0.12, Math.sin(a) * 0.12);
    l.rotation.z = Math.cos(a) * 0.55;
    l.rotation.x = -Math.sin(a) * 0.55;
    l.scale.set(1, 1, 0.35);
    g.add(l);
  }
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), i % 2 ? leaf : leaf2);
    s.position.set((Math.random() - 0.5) * 0.3, 1.1 + Math.random() * 0.35, (Math.random() - 0.5) * 0.3);
    s.scale.set(1, 0.6, 1);
    g.add(s);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(scale);
  parent.add(shadow(g));
  return g;
}

function floorLamp(parent, x, z) {
  const g = new THREE.Group();
  cyl(g, 0.16, 0.18, 0.03, mat(0x2a2a2e, { metalness: 0.5, roughness: 0.4 }), 0, 0, 0);
  cyl(g, 0.015, 0.015, 1.5, mat(0x2a2a2e, { metalness: 0.5, roughness: 0.4 }), 0, 0.03, 0, 8);
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf3e6cc, emissive: 0xffc27a, emissiveIntensity: 0, roughness: 0.9, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.32, 18, 1, true), shadeMat);
  shade.position.set(0, 1.62, 0);
  g.add(shade);
  const light = new THREE.PointLight(0xffb066, 0, 6, 1.6);
  light.position.set(0, 1.55, 0);
  g.add(light);
  g.position.set(x, 0, z);
  parent.add(g);
  return { light, shadeMat, base: 1.3 };
}

// 单屏电竞桌 + 电竞椅
function buildDesk(parent, x, z, accent, idx) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  parent.add(g);
  const dark = mat(0x22252b, { roughness: 0.55 });
  const metal = mat(0x30333a, { metalness: 0.6, roughness: 0.35 });
  // 桌面（深色胡桃木）与 T 型桌腿
  box(g, 1.7, 0.05, 0.8, mat(0x4a3324, { roughness: 0.6 }), 0, 0.72, 0);
  for (const sx of [-0.72, 0.72]) {
    box(g, 0.06, 0.7, 0.06, metal, sx, 0.02, 0);
    box(g, 0.08, 0.03, 0.7, metal, sx, 0, 0);
  }
  // 桌沿 RGB 灯带（成员代表色）
  const rgbMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9 });
  box(g, 1.66, 0.012, 0.012, rgbMat, 0, 0.705, 0.395);
  // 鼠标垫、键盘、鼠标
  box(g, 1.1, 0.006, 0.38, mat(0x1a1c22), 0.05, 0.77, 0.14);
  const kb = box(g, 0.44, 0.022, 0.15, dark, -0.12, 0.775, 0.16);
  const kbGlow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: accent, emissiveIntensity: 0.35 });
  box(g, 0.42, 0.004, 0.13, kbGlow, -0.12, 0.797, 0.16);
  box(g, 0.06, 0.025, 0.1, dark, 0.32, 0.775, 0.17);
  // 单显示器，居中（屏幕朝向 +z，即朝向坐着的人和镜头）
  const screens = [];
  const mg = new THREE.Group();
  mg.position.set(0, 0.77, -0.22);
  g.add(mg);
  box(mg, 0.26, 0.012, 0.18, metal, 0, 0, 0);
  box(mg, 0.05, 0.32, 0.03, metal, 0, 0, -0.03);
  box(mg, 0.8, 0.48, 0.035, dark, 0, 0.2, 0);
  const scrMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: screenTexture('game', idx * 2), emissiveIntensity: 0, roughness: 0.3 });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.43), scrMat);
  scr.position.set(0, 0.44, 0.019);
  mg.add(scr);
  screens.push(scrMat);
  // 桌面小物：杯子、零食、手办
  cyl(g, 0.04, 0.035, 0.1, mat([0xf2efe8, 0xc8693a, 0x2f3e66][idx % 3]), -0.68, 0.77, 0.05, 12);
  if (idx % 2 === 0) box(g, 0.14, 0.03, 0.1, mat(0xd94f3d), 0.62, 0.77, -0.05, 0.4);
  // 耳机支架
  cyl(g, 0.012, 0.012, 0.28, metal, 0.7, 0.77, -0.25, 6);
  // 台灯（偶数工位）
  let lamp = null;
  if (idx % 2 === 1) {
    const lg = new THREE.Group();
    lg.position.set(0.66, 0.77, -0.28);
    cyl(lg, 0.07, 0.08, 0.02, metal, 0, 0, 0);
    const arm = box(lg, 0.02, 0.4, 0.02, metal, 0, 0.02, 0);
    arm.rotation.z = 0.25;
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc27a, emissiveIntensity: 0 });
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 12, 1, true), mat(0x2b2b30, { side: THREE.DoubleSide }));
    head.position.set(-0.1, 0.42, 0.02);
    head.rotation.z = 0.6;
    lg.add(head);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), bulbMat);
    bulb.position.set(-0.12, 0.39, 0.02);
    lg.add(bulb);
    g.add(lg);
    lamp = { mat: bulbMat };
  }
  // 电竞椅（面朝 -z，靠背在 +z 侧）
  const chair = new THREE.Group();
  const chairZ = 0.95;
  chair.position.set(0, 0, chairZ);
  g.add(chair);
  const seatMat = mat(0x1d1f25, { roughness: 0.6 });
  const accentMat = mat(accent, { roughness: 0.6 });
  // 五星脚与气杆
  for (let i = 0; i < 5; i++) {
    const leg = box(chair, 0.04, 0.035, 0.32, metal, 0, 0.05, 0);
    leg.rotation.y = (i / 5) * Math.PI * 2;
    leg.position.set(Math.sin(leg.rotation.y) * 0.15, 0.06, Math.cos(leg.rotation.y) * 0.15);
  }
  cyl(chair, 0.03, 0.03, 0.32, metal, 0, 0.08, 0, 8);
  box(chair, 0.52, 0.08, 0.5, seatMat, 0, 0.4, 0);
  box(chair, 0.3, 0.012, 0.42, accentMat, 0, 0.48, 0);
  const back = new THREE.Group();
  back.position.set(0, 0.48, 0.26);
  back.rotation.x = 0.12;
  chair.add(back);
  box(back, 0.5, 0.82, 0.09, seatMat, 0, 0, 0);
  box(back, 0.08, 0.7, 0.095, accentMat, -0.16, 0.06, 0);
  box(back, 0.08, 0.7, 0.095, accentMat, 0.16, 0.06, 0);
  box(back, 0.3, 0.14, 0.12, seatMat, 0, 0.66, 0.01);
  for (const sx of [-0.28, 0.28]) {
    box(chair, 0.05, 0.22, 0.05, metal, sx, 0.44, 0.02);
    box(chair, 0.08, 0.04, 0.3, seatMat, sx, 0.66, 0.0);
  }
  shadow(g);

  // 显示器补光
  const screenLight = new THREE.PointLight(0x9cc2ff, 0, 3.2, 1.8);
  screenLight.position.set(x, 1.15, z + 0.15);
  parent.add(screenLight);

  return {
    group: g, chair, chairZ, chairBaseZ: chairZ, screens, screenLight, rgbMat, kbGlow, lamp,
    seat: new THREE.Vector3(x, 0, z + chairZ - 0.05),
    standSpot: new THREE.Vector3(x, 0, z + 0.62),
    facing: Math.PI, jiggle: 0, monitorGroups: g.children.filter((c) => c.isGroup && c !== chair),
  };
}

export function buildOffice(scene, members) {
  const root = new THREE.Group();
  scene.add(root);
  const { x0, x1, z0, z1, h } = ROOM;
  const W = x1 - x0, D = z1 - z0;
  const plaster = plasterTexture();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe9d3b0, map: plaster, roughness: 0.92 });
  const wallTop = mat(0xf2e7d6, { roughness: 0.9 });
  const trim = mat(0x3a2a20, { roughness: 0.7 });

  // ── 底座（深色）+ 发光描边 + 侧面字 ──
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 0.7, 0.7, D + 0.7), mat(0x171a21, { roughness: 0.65 }));
  plinth.position.set(0, -0.47, 0);
  plinth.receiveShadow = true;
  root.add(plinth);
  const glowMat = new THREE.MeshStandardMaterial({ color: 0xe8a060, emissive: 0xe8a060, emissiveIntensity: 1.2 });
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(W + 0.72, 0.015, 0.015), glowMat);
  t1.position.set(0, -0.13, z1 + 0.355);
  root.add(t1);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, D + 0.72), glowMat);
  t2.position.set(x1 + 0.355, -0.13, 0);
  root.add(t2);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.7), new THREE.MeshBasicMaterial({ map: plinthLabel('峡谷打工人 · 迷你世界'), transparent: true }));
  lbl.position.set(-2.2, -0.48, z1 + 0.352);
  root.add(lbl);
  const lbl2 = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.7), new THREE.MeshBasicMaterial({ map: plinthLabel('LIVE · 北京时间'), transparent: true }));
  lbl2.position.set(x1 + 0.352, -0.48, 1.5);
  lbl2.rotation.y = Math.PI / 2;
  root.add(lbl2);

  // ── 地板 ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.62, color: 0xffffff }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  box(root, W + 0.4, 0.12, D + 0.4, mat(0x2a2018), 0, -0.121, 0).receiveShadow = true;

  // ── 墙：后墙（含门洞与窗洞）、左墙、前/右矮墙 ──
  const T = 0.2;
  const wz = z0 - T / 2;
  const door = { x0: -6.4, x1: -5.3, h: 2.2 };
  const win = { x0: -4.4, x1: 1.6, y0: 0.95, y1: 2.55 };
  const seg = (xa, xb, ya, yb) => box(root, xb - xa, yb - ya, T, wallMat, (xa + xb) / 2, ya, wz);
  seg(x0 - T, door.x0, 0, h);
  seg(door.x0, door.x1, door.h, h);
  seg(door.x1, win.x0, 0, h);
  seg(win.x0, win.x1, 0, win.y0);
  seg(win.x0, win.x1, win.y1, h);
  seg(win.x1, x1 + T, 0, h);
  box(root, T, h, D + T, wallMat, x0 - T / 2, 0, -T / 2);
  box(root, W + 2 * T, 0.5, T, wallMat, 0, 0, z1 + T / 2);
  box(root, T, 0.5, D + T, wallMat, x1 + T / 2, 0, 0);
  // 墙顶封边（剖面感）
  box(root, W + 2 * T, 0.03, T + 0.02, wallTop, 0, h, wz);
  box(root, T + 0.02, 0.03, D + T, wallTop, x0 - T / 2, h, -T / 2);
  box(root, W + 2 * T, 0.03, T + 0.02, wallTop, 0, 0.5, z1 + T / 2);
  box(root, T + 0.02, 0.03, D + T, wallTop, x1 + T / 2, 0.5, 0);
  // 踢脚线
  box(root, W, 0.08, 0.02, trim, 0, 0, z0 + 0.01);
  box(root, 0.02, 0.08, D, trim, x0 + 0.01, 0, 0);

  // 窗：窗外天空贴图 + 窗框 + 窗台 + 窗帘
  const sky = new SkyTexture();
  const skyMat = new THREE.MeshBasicMaterial({ map: sky.texture, toneMapped: false });
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(win.x1 - win.x0 + 0.4, win.y1 - win.y0 + 0.4), skyMat);
  skyPlane.position.set((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, z0 - 0.35);
  root.add(skyPlane);
  const frame = mat(0x2b2e34, { roughness: 0.5 });
  for (const fx of [win.x0, -2.4, -0.4, win.x1]) box(root, 0.06, win.y1 - win.y0, 0.08, frame, fx, win.y0, z0 - 0.08);
  box(root, win.x1 - win.x0, 0.05, 0.08, frame, (win.x0 + win.x1) / 2, win.y1 - 0.05, z0 - 0.08);
  box(root, win.x1 - win.x0 + 0.2, 0.04, 0.24, mat(0xe8dcc8), (win.x0 + win.x1) / 2, win.y0 - 0.04, z0 + 0.06);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(win.x1 - win.x0, win.y1 - win.y0), new THREE.MeshStandardMaterial({ color: 0xaac8e8, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.2 }));
  glass.position.set((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, z0 - 0.1);
  root.add(glass);
  const curtain = mat(0xe6dccb, { roughness: 1 });
  for (const cx of [win.x0 - 0.25, win.x1 + 0.25]) {
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.75, 8), curtain);
      c.position.set(cx + (i - 2) * 0.075, 1.4, z0 + 0.12 + (i % 2) * 0.03);
      c.castShadow = true;
      root.add(c);
    }
  }
  box(root, win.x1 - win.x0 + 1.2, 0.03, 0.03, frame, (win.x0 + win.x1) / 2, 2.78, z0 + 0.12);

  // 门（向内开）
  box(root, 0.06, door.h, 0.24, trim, door.x0 - 0.03, 0, z0 - 0.02);
  box(root, 0.06, door.h, 0.24, trim, door.x1 + 0.03, 0, z0 - 0.02);
  box(root, door.x1 - door.x0 + 0.12, 0.06, 0.24, trim, (door.x0 + door.x1) / 2, door.h, z0 - 0.02);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(door.x0, 0, z0 - 0.05);
  root.add(doorPivot);
  const leaf = box(doorPivot, door.x1 - door.x0, door.h - 0.02, 0.05, mat(0x7a5236, { roughness: 0.6 }), (door.x1 - door.x0) / 2, 0, 0);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat(0xc9a35a, { metalness: 0.8, roughness: 0.3 }));
  knob.position.set(door.x1 - door.x0 - 0.12, 1.0, 0.05);
  doorPivot.add(knob);
  const doorDark = new THREE.Mesh(new THREE.PlaneGeometry(door.x1 - door.x0, door.h), new THREE.MeshBasicMaterial({ color: 0x0c0d10 }));
  doorDark.position.set((door.x0 + door.x1) / 2, door.h / 2, z0 - 0.19);
  root.add(doorDark);
  void leaf;

  // 左墙：胡桃木格栅、白板、挂画；门旁海报
  const slat = new THREE.Mesh(new THREE.BoxGeometry(0.04, h - 0.02, 2.0), new THREE.MeshStandardMaterial({ map: slatTexture(), roughness: 0.7 }));
  slat.position.set(x0 + 0.03, h / 2, -4.0);
  slat.receiveShadow = true;
  root.add(slat);
  const wb = new WhiteboardTexture();
  box(root, 0.05, 1.32, 2.12, mat(0xb8bcc2, { metalness: 0.5, roughness: 0.4 }), x0 + 0.03, 0.94, -1.6);
  const wbFace = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.22), new THREE.MeshStandardMaterial({ map: wb.texture, roughness: 0.35, emissive: 0xffffff, emissiveMap: wb.texture, emissiveIntensity: 0.08 }));
  wbFace.position.set(x0 + 0.06, 1.6, -1.6);
  wbFace.rotation.y = Math.PI / 2;
  root.add(wbFace);
  box(root, 0.12, 0.03, 1.2, frame, x0 + 0.08, 0.92, -1.6);
  for (const [i, az] of [[1, 1.7], [2, 2.75]]) {
    const art = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshStandardMaterial({ map: artTexture(i * 13), roughness: 0.8 }));
    art.position.set(x0 + 0.05, 1.85, az);
    art.rotation.y = Math.PI / 2;
    root.add(art);
    box(root, 0.03, 0.84, 0.68, trim, x0 + 0.02, 1.43, az);
  }
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.84), new THREE.MeshStandardMaterial({ map: posterTexture(), roughness: 0.7 }));
  poster.position.set(-4.85, 1.55, z0 + 0.02);
  root.add(poster);

  // ── 工位 ──
  const desks = [];
  const accentOf = Object.fromEntries(members.map((m) => [m.id, m.look.shirt]));
  DESK_OWNERS.forEach((owner, i) => {
    const row = Math.floor(i / 3), col = i % 3;
    const d = buildDesk(root, DESK_X[col], ROW_Z[row], accentOf[owner], i);
    d.owner = owner;
    d.approach = `${row === 0 ? 'A' : 'B'}${col}`;
    desks.push(d);
  });

  // ── 茶水 / 零食区（后墙右侧）──
  const counterMat = mat(0xf0ebe2, { roughness: 0.5 });
  box(root, 3.8, 0.88, 0.6, mat(0x8a5a3c, { roughness: 0.6 }), 4.3, 0, z0 + 0.3);
  box(root, 3.86, 0.05, 0.64, counterMat, 4.3, 0.88, z0 + 0.32);
  for (let i = 0; i < 5; i++) box(root, 0.02, 0.7, 0.01, mat(0x5e3c27), 2.6 + i * 0.85, 0.08, z0 + 0.605);
  // 冰箱
  box(root, 0.72, 1.85, 0.66, mat(0xc9ccd1, { metalness: 0.55, roughness: 0.3 }), 6.6, 0, z0 + 0.34);
  box(root, 0.03, 0.5, 0.03, mat(0x777a80, { metalness: 0.8 }), 6.33, 1.1, z0 + 0.69);
  // 咖啡机、微波炉、零食筐、奶茶杯
  box(root, 0.3, 0.38, 0.32, mat(0x1e1f22, { roughness: 0.4 }), 2.75, 0.93, z0 + 0.25);
  box(root, 0.52, 0.3, 0.36, mat(0xe7e7e7, { roughness: 0.4 }), 5.55, 0.93, z0 + 0.27);
  box(root, 0.5, 0.18, 0.3, mat(0xc8a26a, { roughness: 0.9 }), 3.6, 0.93, z0 + 0.3);
  for (let i = 0; i < 6; i++) box(root, 0.1, 0.12, 0.08, mat([0xd94f3d, 0xf2c14e, 0x3fa34d, 0x4a7fd1][i % 4]), 3.42 + i * 0.07, 1.04, z0 + 0.28, i * 0.3);
  for (let i = 0; i < 3; i++) cyl(root, 0.045, 0.038, 0.15, mat(0xf3e2c7), 4.3 + i * 0.15, 0.93, z0 + 0.42, 10);
  // 吊柜搁板 + 墙钟（显示世界时间）
  const shelfMat = mat(0x6b4630, { roughness: 0.6 });
  box(root, 2.8, 0.04, 0.3, shelfMat, 3.9, 1.65, z0 + 0.15);
  box(root, 2.8, 0.04, 0.3, shelfMat, 3.9, 2.15, z0 + 0.15);
  for (let i = 0; i < 7; i++) cyl(root, 0.07, 0.07, 0.2 + (i % 3) * 0.05, mat([0xe9e2d6, 0xc8693a, 0x7b8a99][i % 3]), 2.8 + i * 0.32, 1.69, z0 + 0.15, 10);
  // 打印出来的奖杯
  const trophy = new THREE.Group();
  cyl(trophy, 0.07, 0.09, 0.06, mat(0x3a2a20), 0, 0, 0);
  cyl(trophy, 0.02, 0.02, 0.1, mat(0xd4a83a, { metalness: 0.7, roughness: 0.3 }), 0, 0.06, 0);
  cyl(trophy, 0.1, 0.04, 0.14, mat(0xd4a83a, { metalness: 0.7, roughness: 0.3 }), 0, 0.16, 0);
  trophy.position.set(5.0, 2.19, z0 + 0.15);
  root.add(shadow(trophy));
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), mat(0xf7f4ee));
  clockFace.position.set(6.0, 2.45, z0 + 0.03);
  root.add(clockFace);
  const clockRing = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.02, 8, 32), mat(0x2b2b30));
  clockRing.position.copy(clockFace.position);
  root.add(clockRing);
  const handMat = mat(0x1d1d1f);
  const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.13, 0.01), handMat);
  hourHand.geometry.translate(0, 0.065, 0);
  hourHand.position.set(6.0, 2.45, z0 + 0.05);
  const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.2, 0.01), handMat);
  minHand.geometry.translate(0, 0.1, 0);
  minHand.position.set(6.0, 2.45, z0 + 0.055);
  root.add(hourHand, minHand);
  // 饮水机
  cyl(root, 0.17, 0.17, 0.9, mat(0xf1f1f1), 2.0, 0, z0 + 0.35);
  cyl(root, 0.15, 0.15, 0.4, new THREE.MeshStandardMaterial({ color: 0x6fb7e8, transparent: true, opacity: 0.75, roughness: 0.1 }), 2.0, 0.9, z0 + 0.35);
  // 高脚小圆桌 + 凳子
  cyl(root, 0.42, 0.42, 0.04, counterMat, 4.3, 1.02, -2.4, 24);
  cyl(root, 0.035, 0.035, 1.0, mat(0x2b2b30, { metalness: 0.6 }), 4.3, 0.02, -2.4, 8);
  cyl(root, 0.22, 0.25, 0.02, mat(0x2b2b30, { metalness: 0.6 }), 4.3, 0, -2.4, 16);
  for (const sx of [-0.62, 0.62]) {
    cyl(root, 0.17, 0.17, 0.05, mat(0xb5643a), 4.3 + sx, 0.72, -2.4, 16);
    cyl(root, 0.025, 0.025, 0.72, mat(0x2b2b30, { metalness: 0.6 }), 4.3 + sx, 0, -2.4, 8);
  }

  // ── 沙发午睡角（左墙前段）──
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 1 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-5.4, 0.005, 2.4);
  rug.receiveShadow = true;
  root.add(rug);
  const sofaMat = mat(0xeee6d8, { roughness: 1 });
  const sofa = new THREE.Group();
  box(sofa, 0.95, 0.42, 2.4, sofaMat, 0, 0.05, 0);
  box(sofa, 0.25, 0.85, 2.4, sofaMat, -0.38, 0.05, 0);
  for (const sz of [-1.15, 1.15]) box(sofa, 0.95, 0.62, 0.2, sofaMat, 0, 0.05, sz);
  for (const sz of [-0.5, 0.5]) box(sofa, 0.66, 0.12, 0.96, mat(0xf4eee4, { roughness: 1 }), 0.1, 0.47, sz);
  for (const [sz, c] of [[-0.75, 0xc8693a], [0.75, 0xd88a4a]]) {
    const p = box(sofa, 0.12, 0.4, 0.4, mat(c, { roughness: 1 }), -0.18, 0.55, sz);
    p.rotation.z = 0.25;
  }
  sofa.position.set(-6.45, 0, 2.4);
  root.add(shadow(sofa));
  cyl(root, 0.38, 0.38, 0.04, mat(0x5a3a26, { roughness: 0.5 }), -5.15, 0.42, 2.4, 24);
  cyl(root, 0.05, 0.12, 0.42, mat(0x5a3a26), -5.15, 0, 2.4, 10);
  cyl(root, 0.06, 0.05, 0.12, mat(0xe9e2d6), -5.05, 0.46, 2.3, 10);
  const lamps = [floorLamp(root, -6.55, 3.95), floorLamp(root, 6.45, 1.0)];

  // ── 前右休闲区：圆地毯、懒人沙发、矮桌 ──
  const rug2 = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshStandardMaterial({ map: rugTexture('#cdbb9e', '#7b4b2a'), roughness: 1 }));
  rug2.rotation.x = -Math.PI / 2;
  rug2.position.set(4.6, 0.005, 2.7);
  rug2.receiveShadow = true;
  root.add(rug2);
  for (const [bx, bz, c] of [[3.8, 3.2, 0xb5643a], [5.4, 2.2, 0x4d5b70]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), mat(c, { roughness: 1 }));
    b.scale.set(1, 0.6, 1);
    b.position.set(bx, 0.27, bz);
    b.castShadow = b.receiveShadow = true;
    root.add(b);
  }
  cyl(root, 0.32, 0.32, 0.3, mat(0xd9cbb4, { roughness: 0.8 }), 4.6, 0, 2.75, 20);
  box(root, 0.3, 0.04, 0.2, mat(0x2b2b30), 4.6, 0.3, 2.75, 0.5);

  // 绿植
  plant(root, -6.5, 4.5, 1.15);
  plant(root, 6.5, 4.4, 1.3, 0x3a3d44);
  plant(root, -6.5, 0.6, 0.9);
  plant(root, 1.95, -3.1, 0.75, 0xc8693a);
  plant(root, 6.55, -3.6, 0.8);

  // ── 导航相关的关键位置 ──
  const spots = {
    door: new THREE.Vector3(-5.85, 0, -4.75),
    snack: [new THREE.Vector3(3.5, 0, -4.2), new THREE.Vector3(4.3, 0, -4.2), new THREE.Vector3(5.1, 0, -4.2)],
    snackTable: [new THREE.Vector3(3.55, 0, -2.4), new THREE.Vector3(5.05, 0, -2.4), new THREE.Vector3(4.3, 0, -1.65)],
    sofa: new THREE.Vector3(-6.3, 0, 2.4),
    whiteboard: (i) => {
      // 围着白板站成一个扇形，间距约 0.8 米
      const a = -1.05 + i * 0.42;
      return new THREE.Vector3(-6.95 + 1.95 * Math.cos(a), 0, -1.6 + 1.95 * Math.sin(a));
    },
    chat: [new THREE.Vector3(2.75, 0, 1.05), new THREE.Vector3(3.55, 0, 1.05)],
    lounge: [new THREE.Vector3(3.8, 0, 2.4), new THREE.Vector3(5.2, 0, 3.0)],
  };

  return {
    root, desks, spots, lamps, sky, skyPlane, wb, doorPivot, door,
    clock: { hourHand, minHand },
    glowMat, plinth,
  };
}
