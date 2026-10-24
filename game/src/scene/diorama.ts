// 漂浮街区：房间坐在一块悬空的城市街区上（画风对标《Corner Pitch》）
// 顶面草皮 + 人行道，侧面草皮层 / 土层，底下是平直着色的锯齿岩石；四周树、灌木篱、路灯、长椅、外卖电动车，
// 后墙外右侧一栋砖楼（夜里窗户亮）。后墙、左墙外的地面被 3 米高墙挡住，只放高的东西。
import * as THREE from 'three';
import { mulberry32 } from '../core/rng';
import { box, cyl, LEAF_GREENS, mat, ROOM, shadow } from './office';
import { asphaltTexture, brickTexture, grassTexture, pavingTexture, signTexture, soilTexture, TEXEL_TILE_M } from './textures';

export interface Outdoor {
  glow: THREE.MeshStandardMaterial; // 路灯灯罩
  windows: THREE.MeshStandardMaterial; // 砖楼亮着的窗
  neon: THREE.MeshStandardMaterial; // 砖楼侧面的竖招牌
  lamps: THREE.SpotLight[];
  /** 下雨会变湿（变深、变光滑）的地面材质 */
  wet: THREE.MeshStandardMaterial[];
  /** 人行道积水（雨大了才显出来） */
  puddles: THREE.MeshStandardMaterial;
  /** 室外地面范围（下雨、积水用） */
  bounds: { x0: number; x1: number; z0: number; z1: number };
}

// 岛体外缘与人行道范围
export const ISLAND = { x0: -8.5, x1: 9.1, z0: -7.5, z1: 7.1 };
const WALK = { x0: -7.9, x1: 8.5, z0: -6.9, z1: 6.5 };
const TOP = -0.04;

/** 世界坐标 UV：按面朝向选平面投影，一个贴图周期 TEXEL_TILE_M 米。几何体需已放在世界（父节点）坐标。 */
export function worldUV(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const [u, v] = ny > 0.6 ? [x, z] : nx > 0.6 ? [z, y] : [x, y];
    uv[i * 2] = u / TEXEL_TILE_M;
    uv[i * 2 + 1] = v / TEXEL_TILE_M;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function worldBox(parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) {
  const geo = worldUV(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z));
  const m = new THREE.Mesh(geo, material);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

function flatQuad(parent: THREE.Object3D, x0: number, x1: number, z0: number, z1: number, y: number, material: THREE.Material) {
  const geo = worldUV(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, y, (z0 + z1) / 2));
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ── 岛体 ──

type Ring = THREE.Vector3[];

function outline(rnd: () => number): [number, number][] {
  const { x0, x1, z0, z1 } = ISLAND;
  const pts: [number, number][] = [];
  const edge = (ax: number, az: number, bx: number, bz: number, ox: number, oz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / 0.9));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const out = i === 0 ? 0 : (rnd() - 0.35) * 0.22;
      pts.push([ax + (bx - ax) * t + ox * out, az + (bz - az) * t + oz * out]);
    }
  };
  edge(x0, z0, x1, z0, 0, -1);
  edge(x1, z0, x1, z1, 1, 0);
  edge(x1, z1, x0, z1, 0, 1);
  edge(x0, z1, x0, z0, -1, 0);
  return pts;
}

function insetRing(base: [number, number][], inset: number, y: number, jitter: number, yJitter: number, rnd: () => number): Ring {
  const { x0, x1, z0, z1 } = ISLAND;
  return base.map(([x, z]) => {
    const ins = inset + (rnd() - 0.5) * jitter;
    const px = Math.min(x1 - ins, Math.max(x0 + ins, x));
    const pz = Math.min(z1 - ins, Math.max(z0 + ins, z));
    return new THREE.Vector3(px, y + (rnd() - 0.5) * yJitter, pz);
  });
}

// 两圈之间的侧面（三角形朝外）；colors 给每个面一个随机灰度，平直着色下像一块块岩面
function skirt(a: Ring, b: Ring, center: THREE.Vector3, shades?: THREE.Color[], rnd?: () => number) {
  const pos: number[] = [], col: number[] = [], uv: number[] = [];
  let run = 0;
  const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3, c?: THREE.Color) => {
    const nrm = new THREE.Vector3().subVectors(q, p).cross(new THREE.Vector3().subVectors(r, p));
    const mid = new THREE.Vector3().add(p).add(q).add(r).multiplyScalar(1 / 3);
    const out = mid.clone().sub(center).setY(0);
    const verts = nrm.dot(out) >= 0 ? [p, q, r] : [p, r, q];
    for (const v of verts) {
      pos.push(v.x, v.y, v.z);
      uv.push((run + v.x * 0.2 + v.z * 0.2) / TEXEL_TILE_M, v.y / TEXEL_TILE_M);
      if (c) col.push(c.r, c.g, c.b);
    }
  };
  for (let i = 0; i < a.length; i++) {
    const j = (i + 1) % a.length;
    const c1 = shades && rnd ? shades[Math.floor(rnd() * shades.length)] : undefined;
    const c2 = shades && rnd ? shades[Math.floor(rnd() * shades.length)] : undefined;
    tri(a[i], a[j], b[j], c1);
    tri(a[i], b[j], b[i], c2);
    run += a[i].distanceTo(a[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function cap(ring: Ring, y: number, up: boolean) {
  const contour = ring.map((v) => new THREE.Vector2(v.x, v.z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos: number[] = [];
  for (const f of faces) {
    const [a, b, c] = f.map((i) => contour[i]);
    // 俯视下逆时针 → 法线朝 -y；按需要翻转
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const flip = up ? cross > 0 : cross < 0;
    const tri = flip ? [a, c, b] : [a, b, c];
    for (const v of tri) pos.push(v.x, y, v.y);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return worldUV(g);
}

function buildIsland(root: THREE.Object3D): THREE.MeshStandardMaterial {
  const rnd = mulberry32(2024);
  const base = outline(rnd);
  const center = new THREE.Vector3((ISLAND.x0 + ISLAND.x1) / 2, 0, (ISLAND.z0 + ISLAND.z1) / 2);
  const top = base.map(([x, z]) => new THREE.Vector3(x, TOP, z));
  const grassBottom = base.map(([x, z]) => new THREE.Vector3(x, -0.36, z));
  // 土层下面先是一圈近乎垂直的岩壁（俯视 30° 也能看见），再一层层往里收成尖底
  const soilBottom = insetRing(base, 0.04, -0.95, 0.08, 0.14, rnd);
  const r1 = insetRing(base, 0.3, -1.9, 0.35, 0.6, rnd);
  const r2 = insetRing(base, 1.3, -2.9, 0.8, 0.8, rnd);
  const r3 = insetRing(base, 3.2, -3.9, 1.0, 0.8, rnd);
  const grassSide = mat(0x3a722d, { roughness: 1 });
  const soil = new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 1, flatShading: true });
  const rock = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, flatShading: true });
  const shades = [new THREE.Color(0x44474d), new THREE.Color(0x3a3d43), new THREE.Color(0x50535a), new THREE.Color(0x34363b)];

  const grassMat = new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 });
  const topMesh = new THREE.Mesh(cap(top, TOP, true), grassMat);
  topMesh.receiveShadow = true;
  const sideMesh = new THREE.Mesh(skirt(top, grassBottom, center), grassSide);
  const soilMesh = new THREE.Mesh(skirt(grassBottom, soilBottom, center), soil);
  const rockGeo = [skirt(soilBottom, r1, center, shades, rnd), skirt(r1, r2, center, shades, rnd), skirt(r2, r3, center, shades, rnd)];
  const tip = r3.map(() => new THREE.Vector3(center.x + (rnd() - 0.5) * 3, -5.1 + rnd() * 0.6, center.z + (rnd() - 0.5) * 3));
  rockGeo.push(skirt(r3, tip, center, shades, rnd));
  const rockMeshes = rockGeo.map((g) => new THREE.Mesh(g, rock));
  for (const m of [sideMesh, soilMesh, ...rockMeshes]) {
    m.receiveShadow = true;
    m.castShadow = true;
  }
  root.add(topMesh, sideMesh, soilMesh, ...rockMeshes);
  return grassMat;
}

// 积水：几块扁平方片拼成不规则一滩，贴在人行道上
function puddle(root: THREE.Object3D, x: number, z: number, size: number, material: THREE.Material, rnd: () => number) {
  for (let i = 0; i < 4; i++) {
    const w = size * (0.5 + rnd() * 0.6), d = size * (0.35 + rnd() * 0.45);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), material);
    m.position.set(x + (rnd() - 0.5) * size * 0.7, 0.0, z + (rnd() - 0.5) * size * 0.5);
    m.receiveShadow = true;
    root.add(m);
  }
}

// ── 道具 ──

export function tree(parent: THREE.Object3D, x: number, z: number, h = 3.4, seed = 1) {
  const g = new THREE.Group();
  const r = mulberry32(seed * 77 + 5);
  cyl(g, 0.09, 0.13, h * 0.55, mat(0x5b3f28, { roughness: 1 }), 0, 0, 0, 5);
  const blobs = 4 + Math.floor(r() * 2);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + r();
    const rad = (0.55 + r() * 0.35) * (h / 3.4);
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 0), mat(LEAF_GREENS[(i + seed) % 3], { roughness: 0.9 }));
    const spread = i === 0 ? 0 : 0.45 * (h / 3.4);
    leaf.position.set(Math.cos(a) * spread, h * (0.62 + r() * 0.25) + (i === 0 ? 0.25 : 0), Math.sin(a) * spread);
    leaf.rotation.set(r() * 3, r() * 3, r() * 3);
    g.add(leaf);
  }
  g.position.set(x, TOP, z);
  parent.add(shadow(g));
  return g;
}

function hedge(parent: THREE.Object3D, x0: number, x1: number, z0: number, z1: number, h = 0.55) {
  const leaf = mat(0x356f2f, { roughness: 0.95 });
  const top = mat(0x4a8a38, { roughness: 0.95 });
  box(parent, x1 - x0, h, z1 - z0, leaf, (x0 + x1) / 2, TOP, (z0 + z1) / 2);
  box(parent, x1 - x0 - 0.06, 0.06, z1 - z0 - 0.06, top, (x0 + x1) / 2, TOP + h, (z0 + z1) / 2);
}

function streetLamp(parent: THREE.Object3D, x: number, z: number, rotY: number, glow: THREE.Material, light: THREE.SpotLight) {
  const g = new THREE.Group();
  g.position.set(x, TOP, z);
  g.rotation.y = rotY;
  parent.add(g);
  const iron = mat(0x24272b, { roughness: 0.6, metalness: 0.3 });
  cyl(g, 0.12, 0.14, 0.12, iron, 0, 0, 0, 6);
  cyl(g, 0.05, 0.06, 3.6, iron, 0, 0.1, 0, 6);
  box(g, 0.08, 0.08, 0.75, iron, 0, 3.55, 0.35);
  box(g, 0.34, 0.12, 0.46, iron, 0, 3.5, 0.75);
  box(g, 0.28, 0.06, 0.38, glow, 0, 3.45, 0.75);
  shadow(g);
  light.position.set(0, 3.4, 0.75);
  light.target.position.set(0, 0, 1.4);
  g.add(light, light.target);
}

function bench(parent: THREE.Object3D, x: number, z: number, rotY: number) {
  const g = new THREE.Group();
  g.position.set(x, TOP, z);
  g.rotation.y = rotY;
  parent.add(g);
  const wood = mat(0x9a5f34, { roughness: 0.8 });
  const iron = mat(0x24272b, { roughness: 0.6 });
  for (const sx of [-0.75, 0.75]) {
    box(g, 0.06, 0.42, 0.42, iron, sx, 0, 0);
    box(g, 0.06, 0.45, 0.06, iron, sx, 0.42, -0.2);
  }
  for (const dz of [-0.12, 0.02, 0.16]) box(g, 1.7, 0.04, 0.11, wood, 0, 0.42, dz);
  for (const dy of [0.58, 0.72]) box(g, 1.7, 0.1, 0.04, wood, 0, dy, -0.21);
  shadow(g);
}

// 外卖电动车：黄车身 + 黄色保温箱（游戏里点外卖的那位，停在门口）
function scooter(parent: THREE.Object3D, x: number, z: number, rotY: number) {
  const g = new THREE.Group();
  g.position.set(x, TOP, z);
  g.rotation.y = rotY;
  parent.add(g);
  const yellow = mat(0xf2c230, { roughness: 0.5 });
  const dark = mat(0x1e2023, { roughness: 0.6 });
  for (const wz of [-0.48, 0.48]) {
    const w = cyl(g, 0.2, 0.2, 0.09, dark, 0, 0, wz, 8);
    w.rotation.z = Math.PI / 2;
    w.position.y = 0.2;
  }
  box(g, 0.22, 0.18, 0.9, yellow, 0, 0.26, 0);
  box(g, 0.26, 0.12, 0.42, dark, 0, 0.5, -0.12);
  box(g, 0.08, 0.6, 0.1, yellow, 0, 0.32, 0.42);
  box(g, 0.6, 0.05, 0.05, dark, 0, 0.92, 0.42);
  box(g, 0.44, 0.4, 0.42, yellow, 0, 0.62, -0.46);
  box(g, 0.46, 0.05, 0.44, mat(0xd9a51f, { roughness: 0.5 }), 0, 1.02, -0.46);
  shadow(g);
}

function hydrant(parent: THREE.Object3D, x: number, z: number) {
  const red = mat(0xc8352b, { roughness: 0.5 });
  cyl(parent, 0.13, 0.15, 0.55, red, x, TOP, z, 6);
  cyl(parent, 0.08, 0.13, 0.14, red, x, TOP + 0.55, z, 6);
  box(parent, 0.4, 0.08, 0.08, red, x, TOP + 0.36, z);
}

function trashBin(parent: THREE.Object3D, x: number, z: number) {
  cyl(parent, 0.22, 0.2, 0.7, mat(0x2e6b46, { roughness: 0.6 }), x, TOP, z, 7);
  cyl(parent, 0.24, 0.24, 0.05, mat(0x24272b), x, TOP + 0.7, z, 7);
}

function building(root: THREE.Object3D, out: Pick<Outdoor, 'windows' | 'neon'>) {
  const x0 = 3.9, x1 = 8.9, z0 = -7.35, z1 = -5.75, h = 7.2;
  const brick = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.9, flatShading: true });
  worldBox(root, x1 - x0, h, z1 - z0, brick, (x0 + x1) / 2, TOP, (z0 + z1) / 2);
  const trim = mat(0x6d625a, { roughness: 0.9 });
  box(root, x1 - x0 + 0.16, 0.22, z1 - z0 + 0.16, trim, (x0 + x1) / 2, TOP + h, (z0 + z1) / 2);
  box(root, x1 - x0 + 0.1, 0.12, z1 - z0 + 0.1, trim, (x0 + x1) / 2, TOP + 3.0, (z0 + z1) / 2);
  const dark = mat(0x283040, { roughness: 0.3, metalness: 0.2 });
  const r = mulberry32(31);
  const win = (x: number, y: number, z: number, alongX: boolean) => {
    const lit = r() < 0.55;
    const m = box(root, alongX ? 0.62 : 0.06, 0.9, alongX ? 0.06 : 0.62, lit ? out.windows : dark, x, y, z);
    box(root, alongX ? 0.74 : 0.08, 0.06, alongX ? 0.1 : 0.74, trim, x, y - 0.06, z);
    return m;
  };
  for (const y of [3.5, 5.0, 6.3 - 0.1]) {
    for (let x = x0 + 0.65; x < x1 - 0.4; x += 1.05) win(x, TOP + y, z1 + 0.02, true);
    for (let z = z0 + 0.5; z < z1 - 0.3; z += 1.05) win(x1 + 0.02, TOP + y, z, false);
  }
  // 一楼：卷帘门小卖部 + 竖招牌
  box(root, 2.2, 2.3, 0.06, mat(0x8e959c, { roughness: 0.5, metalness: 0.4 }), x0 + 1.6, TOP, z1 + 0.03);
  for (let i = 0; i < 9; i++) box(root, 2.2, 0.03, 0.08, mat(0x6f767c), x0 + 1.6, TOP + 0.2 + i * 0.24, z1 + 0.04);
  box(root, 0.08, 2.3, 0.7, mat(0x3a6f9e, { roughness: 0.5 }), x1 + 0.04, TOP + 0.2, z0 + 0.6);
  const signTex = signTexture({ w: 96, h: 320, bg: '#1a0f14', fg: '#ff5fa8', title: '网', titleSize: 64, lines: ['吧'], lineSize: 64 });
  out.neon.map = signTex;
  out.neon.emissiveMap = signTex;
  // 竖招牌垂直于东墙伸出来，宽面朝南北
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.12), [mat(0x1a0f14), mat(0x1a0f14), mat(0x1a0f14), mat(0x1a0f14), out.neon, out.neon]);
  sign.position.set(x1 + 0.3, TOP + 4.6, z1 - 0.35);
  root.add(sign);
  // 屋顶：水箱、空调外机
  const roof = TOP + h + 0.22;
  cyl(root, 0.55, 0.55, 1.1, mat(0x9aa3ab, { roughness: 0.5, metalness: 0.3 }), x0 + 1.2, roof + 0.4, z0 + 0.8, 8);
  for (const [px, pz] of [[x0 + 0.7, z0 + 0.8], [x0 + 1.7, z0 + 0.8], [x0 + 0.7, z0 + 1.2], [x0 + 1.7, z0 + 1.2]]) cyl(root, 0.05, 0.05, 0.42, mat(0x4a4f55), px, roof, pz, 4);
  for (const ax of [x1 - 1.2, x1 - 2.2]) box(root, 0.7, 0.5, 0.45, mat(0xd8dadb, { roughness: 0.6 }), ax, roof, z1 - 0.4);
}

/** 建街区；返回室外灯与需要随昼夜变化的材质。 */
export function buildBlock(root: THREE.Object3D, seed = 1): Outdoor {
  const grassMat = buildIsland(root);
  const glow = new THREE.MeshStandardMaterial({ color: 0xfff2d6, emissive: 0xffd9a0, emissiveIntensity: 0.2 });
  const windows = new THREE.MeshStandardMaterial({ color: 0x3a4658, emissive: 0xffc56e, emissiveIntensity: 0, roughness: 0.4 });
  const neon = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 0.4 });
  const puddles = new THREE.MeshStandardMaterial({ color: 0x5d6c7c, roughness: 0.04, metalness: 0.35, transparent: true, opacity: 0, depthWrite: false, envMapIntensity: 2 });
  const out: Outdoor = { glow, windows, neon, lamps: [], wet: [grassMat], puddles, bounds: { ...ISLAND } };

  // 人行道：房间四周一圈方砖，外沿一圈路缘石。和房间地台顶面齐平，地台侧面不露出亚像素的深色细边
  const paving = new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.9 });
  const { x0, x1, z0, z1 } = ROOM;
  const T = 0.2;
  flatQuad(root, WALK.x0, WALK.x1, z1 + T, WALK.z1, -0.004, paving);
  flatQuad(root, WALK.x0, WALK.x1, WALK.z0, z0 - T, -0.004, paving);
  flatQuad(root, WALK.x0, x0 - T, z0 - T, z1 + T, -0.004, paving);
  flatQuad(root, x1 + T, WALK.x1, z0 - T, z1 + T, -0.004, paving);
  const curb = new THREE.MeshStandardMaterial({ color: 0xcfd1cf, roughness: 0.8, flatShading: true });
  box(root, WALK.x1 - WALK.x0 + 0.24, 0.1, 0.12, curb, (WALK.x0 + WALK.x1) / 2, TOP, WALK.z1 + 0.06);
  box(root, 0.12, 0.1, WALK.z1 - WALK.z0 + 0.12, curb, WALK.x1 + 0.06, TOP, (WALK.z0 + WALK.z1) / 2);
  box(root, WALK.x1 - WALK.x0 + 0.24, 0.1, 0.12, curb, (WALK.x0 + WALK.x1) / 2, TOP, WALK.z0 - 0.06);
  box(root, 0.12, 0.1, WALK.z1 - WALK.z0 + 0.12, curb, WALK.x0 - 0.06, TOP, (WALK.z0 + WALK.z1) / 2);
  // 门口一块柏油：外卖车停这儿
  const asphalt = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.85 });
  flatQuad(root, x1 + T + 0.05, WALK.x1 - 0.05, 1.4, 3.6, -0.002, asphalt);
  out.wet.push(paving, curb, asphalt);
  const pr = mulberry32(seed * 31 + 7);
  for (const [px, pz, sz] of [[-5.2, 5.95, 1.0], [-1.9, 6.05, 0.8], [2.9, 5.9, 1.1], [6.3, 6.0, 0.7], [7.9, -0.6, 0.8], [7.85, 4.1, 0.9], [-7.55, 1.5, 0.6]] as const) {
    puddle(root, px, pz, sz, puddles, pr);
  }

  // 灌木篱、树
  hedge(root, -6.2, -3.6, z1 + T + 1.35, z1 + T + 1.75);
  hedge(root, 2.2, 5.6, z1 + T + 1.35, z1 + T + 1.75);
  hedge(root, WALK.x1 + 0.2, WALK.x1 + 0.55, -4.2, -0.6);
  tree(root, -7.9, 6.7, 3.6, seed);
  tree(root, 8.75, 6.7, 3.2, seed + 1);
  tree(root, 8.8, -4.9, 3.8, seed + 2);
  tree(root, -8.1, -6.9, 4.4, seed + 3);
  tree(root, -2.4, -7.0, 4.8, seed + 4);
  tree(root, 1.6, -7.1, 4.0, seed + 5);
  tree(root, -8.1, -1.0, 4.2, seed + 6);
  tree(root, -8.1, 3.4, 3.6, seed + 7);

  // 路灯：前排两盏、右侧一盏；前面中间那盏投实时阴影
  const lampSpots: [number, number, number, boolean][] = [[-6.6, 6.2, Math.PI, false], [0.6, 6.25, Math.PI, true], [8.2, -2.0, -Math.PI / 2, false]];
  for (const [lx, lz, ry, cast] of lampSpots) {
    const light = new THREE.SpotLight(0xffd29a, 0, 11, 0.9, 0.5, 1.0);
    light.castShadow = cast;
    if (cast) {
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.0015;
      light.shadow.normalBias = 0.02;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = 12;
    }
    streetLamp(root, lx, lz, ry, glow, light);
    out.lamps.push(light);
  }

  bench(root, -3.0, z1 + T + 0.85, Math.PI);
  bench(root, 4.2, z1 + T + 0.85, Math.PI);
  trashBin(root, -1.1, z1 + T + 0.95);
  hydrant(root, WALK.x1 - 0.3, 4.9);
  scooter(root, WALK.x1 - 0.7, 2.5, 0.25);

  building(root, out);
  return out;
}
