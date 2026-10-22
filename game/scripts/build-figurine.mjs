// 方案 B：生成 1.00m 低多边形切面手办 glTF。
// 身体一套；发型 / 眼镜 / 耳机分开。骨骼名对齐 character.ts 的 hips/spine/neck/head 与 sh/el/hp/kn。
// 单位：米，Y-up，脚底 y=0，面朝 +Z。面数：body ≤2500，单发型 ≤400，眼镜 ≤120，耳机 ≤200。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDirs = [
  path.join(root, 'public/models/character'),
  path.join(root, 'src/scene/figurine'),
];

const HIP_Y = 0.38;
const THIGH = 0.18;
const SHIN = 0.17;
const TORSO = 0.28;
const NECK = 0.04;
const HEAD_H = 0.3;
const HEAD_RX = 0.13;
const HEAD_RY = 0.15;
const HEAD_RZ = 0.118;
const HEAD_CY = 0.15;

const hex = (n) => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

class Acc {
  constructor() { this.pos = []; this.nrm = []; this.tris = 0; }
  tri(a, b, c) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    if (!Number.isFinite(n[0])) return;
    this.pos.push(...a, ...b, ...c);
    this.nrm.push(...n, ...n, ...n);
    this.tris++;
  }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
}

function box(acc, cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  acc.quad(v[4], v[5], v[6], v[7]);
  acc.quad(v[1], v[0], v[3], v[2]);
  acc.quad(v[5], v[1], v[2], v[6]);
  acc.quad(v[0], v[4], v[7], v[3]);
  acc.quad(v[3], v[7], v[6], v[2]);
  acc.quad(v[0], v[1], v[5], v[4]);
}

/** 沿 Y 的切面圆台。sides 6–10。原点在轴上。 */
function frustumY(acc, n, y0, y1, rx0, rz0, rx1, rz1, ox = 0, oz = 0) {
  const ring = (y, rx, rz) => {
    const p = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      p.push([ox + Math.cos(a) * rx, y, oz + Math.sin(a) * rz]);
    }
    return p;
  };
  const b = ring(y0, rx0, rz0);
  const t = ring(y1, rx1, rz1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    acc.quad(b[i], t[i], t[j], b[j]);
  }
  const bc = [ox, y0, oz];
  const tc = [ox, y1, oz];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    acc.tri(bc, b[j], b[i]);
    acc.tri(tc, t[i], t[j]);
  }
}

function ellipsoid(acc, lon, lat, rx, ry, rz, ox, oy, oz, keep) {
  const p = (i, j) => {
    const v = (j / lat) * Math.PI;
    const u = (i / lon) * Math.PI * 2 - Math.PI / 2;
    const st = Math.sin(v);
    let x = st * Math.cos(u);
    let y = Math.cos(v);
    let z = st * Math.sin(u);
    // 下颌略收，头顶略平，靠近锁定图的大头切面
    const chin = y < -0.15 ? 0.78 + (y + 1) * 0.18 : 1;
    const crown = y > 0.55 ? 0.92 : 1;
    x *= chin * crown;
    z *= chin * crown;
    return [ox + x * rx, oy + y * ry, oz + z * rz];
  };
  for (let j = 0; j < lat; j++) {
    for (let i = 0; i < lon; i++) {
      const a = p(i, j);
      const b = p(i + 1, j);
      const c = p(i, j + 1);
      const d = p(i + 1, j + 1);
      const centroid = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
      if (keep && !keep(centroid, j, lat)) continue;
      if (j > 0) acc.tri(a, b, d);
      if (j < lat - 1) acc.tri(a, d, c);
    }
  }
}

function cone(acc, base, dir, height, radius, sides = 5) {
  const axis = norm(dir);
  const tip = add(base, mul(axis, height));
  const helper = Math.abs(axis[1]) > 0.85 ? [1, 0, 0] : [0, 1, 0];
  const x = norm(cross(helper, axis));
  const z = norm(cross(axis, x));
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    ring.push(add(base, add(mul(x, Math.cos(a) * radius), mul(z, Math.sin(a) * radius))));
  }
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    acc.tri(ring[i], ring[j], tip);
  }
  const c = base;
  for (let i = 0; i < sides; i++) acc.tri(c, ring[(i + 1) % sides], ring[i]);
}

function extrude(acc, ring, z0, z1) {
  const n = ring.length;
  const front = ring.map(([x, y]) => [x, y, z1]);
  const back = ring.map(([x, y]) => [x, y, z0]);
  let cx = 0, cy = 0;
  for (const p of ring) { cx += p[0]; cy += p[1]; }
  cx /= n; cy /= n;
  const cf = [cx, cy, z1];
  const cb = [cx, cy, z0];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    acc.tri(cf, front[i], front[j]);
    acc.tri(cb, back[j], back[i]);
    acc.quad(front[i], back[i], back[j], front[j]);
  }
}

function hexRing(r) {
  const p = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
    p.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return p;
}

function starRing(points, rOut, rIn) {
  const p = [];
  const n = points * 2;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const r = i % 2 === 0 ? rOut : rIn;
    p.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return p;
}

function superellipse(n, rx, ry, pow = 2.4) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const e = 2 / pow;
    p.push([Math.sign(c) * Math.pow(Math.abs(c), e) * rx, Math.sign(s) * Math.pow(Math.abs(s), e) * ry]);
  }
  return p;
}

function ringBand(acc, cx, cy, cz, rx, ry, thick, n = 10) {
  const outer = superellipse(n, rx, ry);
  const inner = superellipse(n, Math.max(0.004, rx - thick), Math.max(0.004, ry - thick));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const o0 = [cx + outer[i][0], cy + outer[i][1], cz];
    const o1 = [cx + outer[j][0], cy + outer[j][1], cz];
    const i1 = [cx + inner[j][0], cy + inner[j][1], cz];
    const i0 = [cx + inner[i][0], cy + inner[i][1], cz];
    acc.quad(o0, i0, i1, o1);
  }
}

function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

class Doc {
  constructor() {
    this.materials = [];
    this.matIndex = new Map();
    this.meshes = [];
    this.nodes = [];
    this.accessors = [];
    this.bufferViews = [];
    this.bin = [];
  }
  binBytes() {
    let n = 0;
    for (const b of this.bin) n += b.length;
    return n;
  }
  mat(name, color, opts = {}) {
    if (this.matIndex.has(name)) return this.matIndex.get(name);
    const i = this.materials.length;
    const factor = hex(color);
    if (opts.alpha != null) factor[3] = opts.alpha;
    const m = {
      name,
      pbrMetallicRoughness: {
        baseColorFactor: factor,
        metallicFactor: opts.metal ?? 0.02,
        roughnessFactor: opts.rough ?? 0.78,
      },
    };
    if (opts.alpha != null) {
      m.alphaMode = 'BLEND';
      m.doubleSided = true;
    }
    if (opts.double) m.doubleSided = true;
    this.materials.push(m);
    this.matIndex.set(name, i);
    return i;
  }
  addMesh(primitives) {
    const prims = primitives.map((p) => {
      const pos = Float32Array.from(p.acc.pos);
      const nrm = Float32Array.from(p.acc.nrm);
      // bin 是 Buffer 数组，长度是块数不是字节数。偏移按已写入字节累计，且保持 4 字节对齐。
      const posOff = this.binBytes();
      this.bin.push(Buffer.from(pos.buffer));
      const nrmOff = this.binBytes();
      this.bin.push(Buffer.from(nrm.buffer));
      const posView = this.bufferViews.length;
      this.bufferViews.push({ buffer: 0, byteOffset: posOff, byteLength: pos.byteLength, target: 34962 });
      const nrmView = this.bufferViews.length;
      this.bufferViews.push({ buffer: 0, byteOffset: nrmOff, byteLength: nrm.byteLength, target: 34962 });
      const posAcc = this.accessors.length;
      this.accessors.push({
        bufferView: posView, componentType: 5126, count: pos.length / 3, type: 'VEC3',
        min: min3(pos), max: max3(pos),
      });
      const nrmAcc = this.accessors.length;
      this.accessors.push({ bufferView: nrmView, componentType: 5126, count: nrm.length / 3, type: 'VEC3' });
      return { attributes: { POSITION: posAcc, NORMAL: nrmAcc }, material: p.material, mode: 4 };
    });
    const i = this.meshes.length;
    this.meshes.push({ primitives: prims });
    return i;
  }
  node(name, { translation, mesh, children } = {}) {
    const n = { name };
    if (translation && translation.some((v) => Math.abs(v) > 1e-6)) n.translation = translation.map((v) => +v.toFixed(5));
    if (mesh != null) n.mesh = mesh;
    if (children?.length) n.children = children;
    const i = this.nodes.length;
    this.nodes.push(n);
    return i;
  }
  finish(sceneNode) {
    const bin = Buffer.concat(this.bin);
    const json = {
      asset: { version: '2.0', generator: 'ssb-figurine-b' },
      scene: 0,
      scenes: [{ nodes: [sceneNode], name: 'Root' }],
      nodes: this.nodes,
      meshes: this.meshes.length ? this.meshes : undefined,
      materials: this.materials,
      accessors: this.accessors.length ? this.accessors : undefined,
      bufferViews: this.bufferViews.length ? this.bufferViews : undefined,
      buffers: this.accessors.length ? [{ byteLength: bin.length }] : undefined,
    };
    if (!json.meshes) delete json.meshes;
    return pack(json, this.accessors.length ? bin : Buffer.alloc(0));
  }
}

function min3(arr) {
  const m = [Infinity, Infinity, Infinity];
  for (let i = 0; i < arr.length; i += 3) {
    m[0] = Math.min(m[0], arr[i]); m[1] = Math.min(m[1], arr[i + 1]); m[2] = Math.min(m[2], arr[i + 2]);
  }
  return m.map((v) => +v.toFixed(5));
}
function max3(arr) {
  const m = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < arr.length; i += 3) {
    m[0] = Math.max(m[0], arr[i]); m[1] = Math.max(m[1], arr[i + 1]); m[2] = Math.max(m[2], arr[i + 2]);
  }
  return m.map((v) => +v.toFixed(5));
}

function pack(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json));
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const binPad = (4 - (bin.length % 4)) % 4;
  const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad, 0)]);
  const total = 12 + 8 + jsonChunk.length + (bin.length ? 8 + binChunk.length : 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonChunk.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const parts = [header, jh, jsonChunk];
  if (bin.length) {
    const bh = Buffer.alloc(8);
    bh.writeUInt32LE(binChunk.length, 0);
    bh.writeUInt32LE(0x004e4942, 4);
    parts.push(bh, binChunk);
  }
  return Buffer.concat(parts);
}

function meshNode(doc, name, parts, translation) {
  const mesh = doc.addMesh(parts.filter((p) => p.acc.tris > 0));
  return doc.node(name, { translation, mesh });
}

function buildBody() {
  const doc = new Doc();
  const skin = doc.mat('matSkin', 0xf0c8a0, { rough: 0.62 });
  const shirt = doc.mat('matShirt', 0xff8a2b, { rough: 0.82 });
  const pants = doc.mat('matPants', 0x243044, { rough: 0.84 });
  const shoes = doc.mat('matShoes', 0x2f7fd1, { rough: 0.55 });
  const badge = doc.mat('matBadge', 0xffffff, { rough: 0.32, metal: 0.08 });
  const eye = doc.mat('matEye', 0x141414, { rough: 0.35 });
  const brow = doc.mat('matBrow', 0x1a120e, { rough: 0.7 });
  const mouth = doc.mat('matMouth', 0x6a3030, { rough: 0.55 });

  const limb = (name, mat, y0, y1, r0, r1, n = 8) => {
    const acc = new Acc();
    frustumY(acc, n, y0, y1, r0, r0 * 0.92, r1, r1 * 0.92);
    return meshNode(doc, name, [{ acc, material: mat }]);
  };

  function leg(side) {
    const sx = side === 'L' ? 1 : -1;
    const thigh = limb(`thigh${side}`, pants, -THIGH, 0.012, 0.058, 0.064);
    const shin = limb(`shin${side}`, skin, -SHIN, 0.012, 0.046, 0.05);
    const sole = new Acc();
    const strap = new Acc();
    const toes = new Acc();
    box(sole, 0, -0.02, 0.045, 0.062, 0.016, 0.125);
    // 人字拖 Y 带
    box(strap, 0, 0.004, 0.078, 0.012, 0.02, 0.04);
    box(strap, sx * 0.012, 0.008, 0.04, 0.03, 0.012, 0.012);
    box(toes, 0, -0.004, 0.055, 0.05, 0.02, 0.07);
    const foot = doc.node(`foot${side}`, {
      translation: [0, -SHIN, 0],
      children: [
        meshNode(doc, `sole${side}`, [{ acc: sole, material: shoes }]),
        meshNode(doc, `strap${side}`, [{ acc: strap, material: shoes }]),
        meshNode(doc, `toes${side}`, [{ acc: toes, material: skin }]),
      ],
    });
    const kn = doc.node(`leg${side}_kn`, {
      translation: [0, -THIGH, 0],
      children: [shin, foot],
    });
    return doc.node(`leg${side}_hp`, {
      translation: [sx * 0.075, -0.01, 0],
      children: [thigh, kn],
    });
  }

  function arm(side) {
    const sx = side === 'L' ? 1 : -1;
    const upper = limb(`upper${side}`, shirt, -0.14, 0.01, 0.042, 0.048);
    const fore = limb(`fore${side}`, skin, -0.13, 0.01, 0.034, 0.038);
    const handAcc = new Acc();
    box(handAcc, 0, -0.04, 0.006, 0.046, 0.07, 0.028);
    const hand = meshNode(doc, `hand${side}`, [{ acc: handAcc, material: skin }], [0, -0.13, 0]);
    const el = doc.node(`arm${side}_el`, { translation: [0, -0.14, 0], children: [fore, hand] });
    return doc.node(`arm${side}_sh`, {
      translation: [sx * 0.2, TORSO - 0.03, 0],
      children: [upper, el],
    });
  }

  const torsoAcc = new Acc();
  const rings = [
    [0, 0.112, 0.086],
    [0.07, 0.12, 0.092],
    [0.15, 0.14, 0.1],
    [0.23, 0.158, 0.1],
    [TORSO, 0.15, 0.092],
  ];
  const N = 10;
  const ringPts = rings.map(([y, rx, rz]) => {
    const p = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.PI / N;
      p.push([Math.cos(a) * rx, y, Math.sin(a) * rz]);
    }
    return p;
  });
  for (let s = 0; s < rings.length - 1; s++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      torsoAcc.quad(ringPts[s][i], ringPts[s + 1][i], ringPts[s + 1][j], ringPts[s][j]);
    }
  }
  const top = rings[rings.length - 1];
  const bot = rings[0];
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    torsoAcc.tri([0, top[0], 0], ringPts[rings.length - 1][i], ringPts[rings.length - 1][j]);
    torsoAcc.tri([0, bot[0], 0], ringPts[0][j], ringPts[0][i]);
  }
  const badgeAcc = new Acc();
  const hexP = hexRing(0.034).map(([x, y]) => [0.055 + x, 0.175 + y]);
  extrude(badgeAcc, hexP, 0.108, 0.118);
  const starP = starRing(6, 0.02, 0.008).map(([x, y]) => [0.055 + x, 0.175 + y]);
  extrude(badgeAcc, starP, 0.116, 0.128);
  const torso = meshNode(doc, 'torso', [
    { acc: torsoAcc, material: shirt },
    { acc: badgeAcc, material: badge },
  ]);

  const pelvisAcc = new Acc();
  frustumY(pelvisAcc, 8, -0.09, 0.045, 0.1, 0.082, 0.112, 0.088);
  const pelvis = meshNode(doc, 'pelvis', [{ acc: pelvisAcc, material: pants }]);

  const neckAcc = new Acc();
  frustumY(neckAcc, 8, 0, NECK, 0.042, 0.04, 0.046, 0.042);
  const headAcc = new Acc();
  ellipsoid(headAcc, 14, 10, HEAD_RX, HEAD_RY, HEAD_RZ, 0, HEAD_CY, 0);
  const earL = new Acc();
  const earR = new Acc();
  box(earL, HEAD_RX + 0.008, HEAD_CY, -0.005, 0.028, 0.05, 0.02);
  box(earR, -HEAD_RX - 0.008, HEAD_CY, -0.005, 0.028, 0.05, 0.02);
  const nose = new Acc();
  box(nose, 0, 0.145, HEAD_RZ + 0.008, 0.02, 0.026, 0.018);
  const mouthAcc = new Acc();
  box(mouthAcc, 0, 0.1, HEAD_RZ - 0.002, 0.036, 0.008, 0.012);
  box(mouthAcc, -0.016, 0.104, HEAD_RZ - 0.004, 0.014, 0.007, 0.01);
  box(mouthAcc, 0.016, 0.104, HEAD_RZ - 0.004, 0.014, 0.007, 0.01);

  function makeEye(side) {
    const sx = side === 'L' ? 1 : -1;
    const acc = new Acc();
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i / 6) * Math.PI * 2 + sx * 0.08;
      pts.push([Math.cos(a) * 0.03, Math.sin(a) * 0.024]);
    }
    // 几何以节点为中心，眨眼时压 scale.y 不会把眼睛拽离脸
    extrude(acc, pts, -0.012, 0.012);
    return doc.node(`eye${side}`, {
      translation: [sx * 0.046, 0.172, HEAD_RZ],
      children: [meshNode(doc, `eyeMesh${side}`, [{ acc, material: eye }])],
    });
  }
  const eyeL = makeEye('L');
  const eyeR = makeEye('R');
  const browL = new Acc();
  const browR = new Acc();
  box(browL, 0.046, 0.214, HEAD_RZ - 0.002, 0.05, 0.01, 0.012);
  box(browR, -0.046, 0.214, HEAD_RZ - 0.002, 0.05, 0.01, 0.012);

  const head = doc.node('head', {
    translation: [0, NECK, 0],
    children: [
      meshNode(doc, 'skull', [{ acc: headAcc, material: skin }]),
      meshNode(doc, 'earL', [{ acc: earL, material: skin }]),
      meshNode(doc, 'earR', [{ acc: earR, material: skin }]),
      meshNode(doc, 'nose', [{ acc: nose, material: skin }]),
      meshNode(doc, 'mouth', [{ acc: mouthAcc, material: mouth }]),
      eyeL, eyeR,
      meshNode(doc, 'browL', [{ acc: browL, material: brow }]),
      meshNode(doc, 'browR', [{ acc: browR, material: brow }]),
      doc.node('socket_hair'),
      doc.node('socket_glasses'),
      doc.node('socket_headset'),
    ],
  });
  const neckNode = doc.node('neck', {
    translation: [0, TORSO, 0],
    children: [meshNode(doc, 'neckMesh', [{ acc: neckAcc, material: skin }]), head],
  });
  const spine = doc.node('spine', {
    translation: [0, 0.0, 0],
    children: [torso, arm('L'), arm('R'), neckNode],
  });
  const hips = doc.node('hips', {
    translation: [0, HIP_Y, 0],
    children: [pelvis, leg('L'), leg('R'), spine],
  });
  const rootNode = doc.node('Root', { children: [hips] });
  return doc.finish(rootNode);
}

function hairCap(acc, inflate, yCut, shiftY = 0.01) {
  ellipsoid(
    acc, 12, 8,
    HEAD_RX * inflate, HEAD_RY * inflate, HEAD_RZ * inflate,
    0, HEAD_CY + shiftY, -0.006,
    (c) => c[1] > yCut,
  );
}

function buildHair(style) {
  const doc = new Doc();
  const hair = doc.mat('matHair', 0x2a211c, { rough: 0.72 });
  const acc = new Acc();
  if (style === 'messy') {
    hairCap(acc, 1.05, 0.2, 0.012);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.4;
      const lift = 0.25 + hash(i) * 0.85;
      const dir = norm([Math.sin(lift) * Math.cos(a), 0.55 + hash(i + 5) * 0.7, Math.sin(lift) * Math.sin(a) * 0.85]);
      const base = [dir[0] * 0.1, 0.2 + Math.max(0, dir[1]) * 0.08, dir[2] * 0.08 - 0.01];
      cone(acc, base, dir, 0.075 + hash(i + 2) * 0.07, 0.02 + hash(i + 4) * 0.012, 4);
    }
  } else if (style === 'short') {
    hairCap(acc, 1.07, 0.16, 0.008);
    // 齐刘海
    box(acc, 0, 0.2, HEAD_RZ * 0.72, 0.16, 0.045, 0.04);
    box(acc, -0.09, 0.16, 0.02, 0.04, 0.08, 0.06);
    box(acc, 0.09, 0.16, 0.02, 0.04, 0.08, 0.06);
  } else if (style === 'side') {
    hairCap(acc, 1.06, 0.17, 0.01);
    // 浅金侧分：刘海从中缝扫向一侧，额前有厚度
    box(acc, 0.02, 0.22, 0.06, 0.16, 0.04, 0.08);
    box(acc, 0.07, 0.175, HEAD_RZ * 0.55, 0.1, 0.07, 0.05);
    box(acc, -0.04, 0.2, 0.02, 0.08, 0.035, 0.07);
    box(acc, 0.1, 0.14, 0.0, 0.045, 0.09, 0.06);
  } else {
    // 板寸：贴头皮的薄盖，几乎不挡脸
    hairCap(acc, 1.025, 0.2, 0.004);
  }
  const node = meshNode(doc, `hair_${style}`, [{ acc, material: hair }]);
  const rootNode = doc.node('hair', { children: [node] });
  return { glb: doc.finish(rootNode), tris: acc.tris };
}

function buildGlasses() {
  const doc = new Doc();
  const frame = doc.mat('matGlasses', 0x111114, { rough: 0.28, metal: 0.35 });
  const lens = doc.mat('matLens', 0xc5d8f2, { rough: 0.05, metal: 0.05, alpha: 0.22 });
  const acc = new Acc();
  const lensAcc = new Acc();
  for (const sx of [-1, 1]) {
    const cx = sx * 0.05;
    ringBand(acc, cx, 0.172, HEAD_RZ + 0.02, 0.04, 0.03, 0.008, 8);
    const z = HEAD_RZ + 0.016;
    lensAcc.quad(
      [cx - 0.028, 0.15, z],
      [cx + 0.028, 0.15, z],
      [cx + 0.028, 0.194, z],
      [cx - 0.028, 0.194, z],
    );
    box(acc, sx * (HEAD_RX + 0.01), 0.178, 0.02, 0.008, 0.008, 0.11);
  }
  box(acc, 0, 0.188, HEAD_RZ + 0.02, 0.028, 0.008, 0.008);
  const node = doc.node('glasses', {
    children: [
      meshNode(doc, 'frames', [{ acc, material: frame }]),
      meshNode(doc, 'lenses', [{ acc: lensAcc, material: lens }]),
    ],
  });
  return { glb: doc.finish(node), tris: acc.tris + lensAcc.tris };
}

function buildHeadset() {
  const doc = new Doc();
  const band = doc.mat('matHeadsetBand', 0x1b1b1f, { rough: 0.45 });
  const cup = doc.mat('matHeadsetCup', 0xff8a2b, { rough: 0.5 });
  const bandAcc = new Acc();
  const cupAcc = new Acc();
  // 头顶弧：一串盒子
  const steps = 7;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const a = Math.PI * (1 - t);
    const x = Math.cos(a) * (HEAD_RX + 0.028);
    const y = 0.16 + Math.sin(a) * (HEAD_RY * 0.85 + 0.02);
    box(bandAcc, x, y, -0.01, 0.028, 0.028, 0.03);
  }
  for (const sx of [-1, 1]) {
    const acc = new Acc();
    // 耳罩沿 X 放倒：用盒子堆一个短圆柱的切面感
    box(acc, sx * (HEAD_RX + 0.02), 0.15, 0, 0.04, 0.07, 0.06);
    box(acc, sx * (HEAD_RX + 0.038), 0.15, 0, 0.016, 0.05, 0.044);
    // 把耳罩并进 cup 材质
    cupAcc.pos.push(...acc.pos);
    cupAcc.nrm.push(...acc.nrm);
    cupAcc.tris += acc.tris;
  }
  // 麦克风：从左耳罩（+X，角色左侧）弯到嘴前。锁定图麦在画面左侧，角色面朝 +Z 时角色右是 -X。
  // 画面左侧 = 角色的右 = -X。
  box(bandAcc, -HEAD_RX - 0.01, 0.1, 0.04, 0.012, 0.012, 0.07);
  box(bandAcc, -0.08, 0.08, 0.08, 0.05, 0.01, 0.012);
  const node = doc.node('headset', {
    children: [
      meshNode(doc, 'band', [{ acc: bandAcc, material: band }]),
      meshNode(doc, 'cups', [{ acc: cupAcc, material: cup }]),
    ],
  });
  return { glb: doc.finish(node), tris: bandAcc.tris + cupAcc.tris };
}

function countTris(glb) {
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const bin = glb.subarray(20 + jsonLen + 8);
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives) {
      const acc = json.accessors[p.attributes.POSITION];
      tris += acc.count / 3;
      const view = json.bufferViews[acc.bufferView];
      const off = (view.byteOffset || 0) + (acc.byteOffset || 0);
      for (let i = 0; i < acc.count; i++) {
        for (let k = 0; k < 3; k++) {
          const v = bin.readFloatLE(off + (i * 3 + k) * 4);
          if (v < acc.min[k] - 1e-3 || v > acc.max[k] + 1e-3) {
            throw new Error(`顶点越界 ${v} 不在 [${acc.min}]..[${acc.max}]`);
          }
        }
      }
    }
  }
  return { json, tris };
}

function writeBoth(name, buf) {
  for (const dir of outDirs) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buf);
  }
}

const body = buildBody();
const hairs = Object.fromEntries(['messy', 'short', 'side', 'buzz'].map((s) => [s, buildHair(s)]));
const glasses = buildGlasses();
const headset = buildHeadset();

const report = {
  body: countTris(body).tris,
  hair: Object.fromEntries(Object.entries(hairs).map(([k, v]) => [k, v.tris])),
  glasses: glasses.tris,
  headset: headset.tris,
};

const limits = { body: 2500, hair: 400, glasses: 120, headset: 200 };
const problems = [];
if (report.body > limits.body) problems.push(`body ${report.body} > ${limits.body}`);
for (const [k, n] of Object.entries(report.hair)) if (n > limits.hair) problems.push(`hair_${k} ${n} > ${limits.hair}`);
if (report.glasses > limits.glasses) problems.push(`glasses ${report.glasses} > ${limits.glasses}`);
if (report.headset > limits.headset) problems.push(`headset ${report.headset} > ${limits.headset}`);
if (problems.length) {
  console.error(report);
  throw new Error(problems.join('; '));
}

writeBoth('body.glb', body);
for (const [k, v] of Object.entries(hairs)) writeBoth(`hair_${k}.glb`, v.glb);
writeBoth('glasses.glb', glasses.glb);
writeBoth('headset.glb', headset.glb);
fs.writeFileSync(path.join(outDirs[0], 'manifest.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
