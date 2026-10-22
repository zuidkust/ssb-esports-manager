// 低多边形手办人物：关节是空 Group，姿态用关节角度插值实现
// 外形按稿 B 锁定图（体型修正版）：大头、短腿、切面块状四肢、V 领短袖 + 胸口六边形队标、深藏青短裤、蓝人字拖。
// 所有尺寸先按「1.00 米手办」写，再乘 FIG 放进办公室；路人和外卖员也走这一套，只是不带队标、穿运动鞋。
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Look, MemberDef } from '../data/roster';
import { mat } from './office';
import { bar, hull, ring, solid, type P3 } from './figure';

const SEAT_H = 0.5;
const WALK_SPEED = 1.35;
/** 手办 1.00 → 办公室里的米数（门高 2.2，坐下髋高仍是 SEAT_H） */
const FIG = 1.72;

// 关节位置（手办单位）
const HIP_Y = 0.4;
const THIGH = 0.178;
const SHIN = 0.17;
const SHOULDER_Y = 0.212;
const SHOULDER_X = 0.205;
const UPPER_ARM = 0.15;
const NECK_Y = 0.268;
const HEAD_Y = 0.014;

// 头的截面：y、宽、深、前后偏移。下巴 y=0，头顶 0.335
const HEAD: [number, number, number, number][] = [
  [0.0, 0.17, 0.085, 0.058],
  [0.035, 0.232, 0.175, 0.034],
  [0.09, 0.254, 0.232, 0.012],
  [0.17, 0.262, 0.25, 0],
  [0.25, 0.258, 0.256, -0.004],
  [0.305, 0.215, 0.215, -0.01],
  [0.335, 0.13, 0.13, -0.012],
];
const HEAD_TOP = 0.335;
const FZ = 0.125; // 脸正面
/** 头整体再放大一点：锁定图里头宽≈肩宽 */
const HEAD_SCALE = 1.06;

// 上衣截面：y、宽、深（相对髋关节）
const TORSO: [number, number, number][] = [
  [-0.012, 0.345, 0.222],
  [0.03, 0.336, 0.212],
  [0.08, 0.326, 0.205],
  [0.165, 0.352, 0.22],
  [0.222, 0.35, 0.195],
  [0.265, 0.22, 0.13],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function headAt(y: number) {
  const yy = Math.min(HEAD_TOP, Math.max(0, y));
  for (let i = 0; i < HEAD.length - 1; i++) {
    const [y0, w0, d0, z0] = HEAD[i], [y1, w1, d1, z1] = HEAD[i + 1];
    if (yy <= y1) {
      const t = (yy - y0) / (y1 - y0);
      return { hw: lerp(w0, w1, t) / 2, hd: lerp(d0, d1, t) / 2, z0: lerp(z0, z1, t) };
    }
  }
  const [, w, d, z0] = HEAD[HEAD.length - 1];
  return { hw: w / 2, hd: d / 2, z0 };
}

/** 头壳表面一点：th=0 正前方（+z），th>0 朝人物左手（+x） */
function shell(th: number, y: number, t = 0): P3 {
  const { hw, hd, z0 } = headAt(y);
  const s = Math.sin(th), c = Math.cos(th);
  const px = Math.sign(s) * Math.pow(Math.abs(s), 0.5);
  const pz = Math.sign(c) * Math.pow(Math.abs(c), 0.5);
  return [px * (hw + t), y, z0 + pz * (hd + t)];
}

/** 发际线：按 |th| 分段插值 [角度, 高度] */
function hairline(pts: [number, number][]) {
  return (th: number) => {
    const a = Math.abs(th);
    for (let i = 0; i < pts.length - 1; i++) {
      if (a <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], (a - pts[i][0]) / (pts[i + 1][0] - pts[i][0]));
    }
    return pts[pts.length - 1][1];
  };
}

/**
 * 一顶头发的外壳：发际线 hl 处厚 t，越往头顶越厚（bulk，体积感），
 * 额前发际线往前探出一道发檐（brim），头顶整体再抬高 top。
 */
interface Dome { hl: (th: number) => number; t: number; bulk: number; top: number; brim: number }

/** 外壳在 (th, y) 处离头皮的厚度 */
function domeT(d: Dome, th: number, y: number) {
  const y0 = d.hl(th);
  const k = clamp01((y - y0) / Math.max(0.01, HEAD_TOP - y0));
  // 两侧贴头皮，体积堆在头顶和前后
  const side = 0.45 + 0.55 * Math.abs(Math.cos(th));
  // 发际线附近贴着长，越往上越蓬：额前不会出现一大片朝下的发檐底面
  return d.t + d.bulk * Math.pow(k, 0.9) * lerp(side, 1, k * k);
}

/** 外壳表面一点；inset 往里缩（给凸起埋根用） */
function domeAt(d: Dome, th: number, y: number, inset = 0): P3 {
  const p = shell(th, Math.min(y, HEAD_TOP - 0.01), domeT(d, th, y) - inset);
  const k = clamp01((y - (HEAD_TOP - 0.08)) / 0.08);
  p[1] += (d.top + domeT(d, th, y) * 0.4) * k * k;
  return p;
}

function cap(d: Dome): P3[] {
  const pts: P3[] = [];
  const N = 20;
  for (let i = 0; i < N; i++) {
    const th = -Math.PI + (i / N) * Math.PI * 2;
    const y0 = d.hl(th);
    const front = Math.max(0, Math.cos(th));
    // 额前发际线做成锯齿：隔一个点往下、往外戳一点，像一缕缕刘海
    const back = Math.max(0, -Math.cos(th));
    const jag = (front > 0.35 || back > 0.5) && i % 2 === 0 ? 1 : 0;
    const edge = shell(th, y0 - jag * (0.016 * front + 0.012 * back), d.t + d.brim * front * front * (0.5 + jag) + jag * 0.004 * back);
    pts.push(edge);
    for (let y = Math.ceil(y0 / 0.045) * 0.045; y < HEAD_TOP - 0.01; y += 0.045) if (y > y0 + 0.02) pts.push(domeAt(d, th, y));
    // 顶圈往里收，头顶是个平缓的拱，不是平顶
    const tp = shell(th, HEAD_TOP - 0.01, domeT(d, th, HEAD_TOP) * 0.45);
    tp[1] += d.top + domeT(d, th, HEAD_TOP) * 0.55;
    pts.push(tp);
  }
  pts.push([0, HEAD_TOP + d.t + d.bulk + d.top + 0.012, -0.02]);
  return pts;
}

/**
 * 一个发尖：根埋在外壳里，只露出一截棱角分明的尖。
 * w 是根部宽度，dir 是尖的朝向，len 是露出外壳的长度。
 */
function tuft(d: Dome, th: number, y: number, w: number, dir: P3, len: number): P3[] {
  const { hw } = headAt(Math.min(y, HEAD_TOP - 0.02));
  const dth = w / 2 / Math.max(0.06, hw);
  const v = new THREE.Vector3(...dir).normalize();
  const c = domeAt(d, th, y, 0.002);
  const deep = domeT(d, th, y) * 0.8;
  return [
    domeAt(d, th - dth, y - 0.02, deep), domeAt(d, th + dth, y - 0.02, deep),
    domeAt(d, th - dth * 0.6, y + 0.03, deep), domeAt(d, th + dth * 0.6, y + 0.03, deep),
    domeAt(d, th - dth * 0.5, y, 0.003), domeAt(d, th + dth * 0.5, y, 0.003),
    [c[0] + v.x * len, c[1] + v.y * len, c[2] + v.z * len],
  ];
}

/** 一小片刘海：贴在额前 th0~th1 之间，从发际线盖到 yb，下沿在 tipTh 处收成尖 */
function bang(d: Dome, th0: number, th1: number, yb: number, tipTh: number, t = 0.026): P3[] {
  const yt = d.hl((th0 + th1) / 2) + 0.03;
  return [
    domeAt(d, th0, yt, 0.004), domeAt(d, th1, yt, 0.004), shell(th0, yt, 0.004), shell(th1, yt, 0.004),
    shell(th0, yb + 0.014, t), shell(th1, yb + 0.014, t), shell(th0, yb + 0.014, 0.004), shell(th1, yb + 0.014, 0.004),
    shell(tipTh, yb - 0.01, t * 0.9), shell(tipTh, yb - 0.01, 0.004),
  ];
}

/** 鬓角：耳前一小块 */
function sideburns(t: number, bottom = 0.135): P3[][] {
  return [-1, 1].map((sx) => {
    const th = sx * 1.32;
    return [shell(th, 0.215, t), shell(th + sx * 0.18, 0.215, t), shell(th, bottom, t - 0.006), shell(th + sx * 0.14, bottom + 0.01, t - 0.006), shell(th + sx * 0.08, 0.2, t + 0.012)];
  });
}

/** 发际线常用形：前额高 f，耳上 e，后脑 n */
const line = (f: number, e = 0.19, n = 0.075) => hairline([[0, f], [0.55, f - 0.008], [1.05, f - 0.04], [1.35, e], [1.75, e + 0.005], [2.3, 0.12], [Math.PI, n]]);

/** 各发型：返回若干个凸包点云 */
function hairParts(style: Look['hairStyle']): P3[][] {
  const parts: P3[][] = [];
  switch (style) {
    case 'tousled': {
      // 阿鸡：短碎发，贴头皮，头顶和后脑几撮小翘，额前两小撮碎尖
      const d: Dome = { hl: line(0.264), t: 0.014, bulk: 0.02, top: 0.004, brim: 0.006 };
      parts.push(cap(d), ...sideburns(0.014));
      parts.push(tuft(d, 0.35, 0.325, 0.09, [0.5, 1, 0.1], 0.03));
      parts.push(tuft(d, -0.4, 0.325, 0.09, [-0.5, 1, 0.2], 0.026));
      parts.push(tuft(d, 1.0, 0.3, 0.09, [1, 0.7, -0.1], 0.022));
      parts.push(tuft(d, 2.5, 0.3, 0.1, [0.4, 0.6, -1], 0.026));
      parts.push(tuft(d, -2.6, 0.29, 0.1, [-0.3, 0.5, -1], 0.022));
      parts.push(bang(d, -0.45, -0.05, 0.238, -0.3, 0.024), bang(d, 0.1, 0.45, 0.245, 0.32, 0.022));
      break;
    }
    case 'quiff': {
      // 当邓：短发，前额那撮往上、往人物左手边抓起来，其余贴头
      const d: Dome = { hl: line(0.27), t: 0.014, bulk: 0.026, top: 0.008, brim: 0.006 };
      parts.push(cap(d), ...sideburns(0.014));
      parts.push(tuft(d, 0.0, 0.3, 0.14, [0.45, 1, 0.45], 0.04));
      parts.push(tuft(d, 0.6, 0.31, 0.11, [1, 0.8, 0.1], 0.032));
      parts.push(tuft(d, Math.PI - 0.3, 0.3, 0.1, [-0.2, 0.55, -1], 0.02));
      break;
    }
    case 'fringe': {
      // 狗粮：短发，短刘海往下压到额头一半，中间一个小分叉
      const d: Dome = { hl: line(0.262), t: 0.016, bulk: 0.022, top: 0.006, brim: 0.01 };
      parts.push(cap(d), ...sideburns(0.014));
      parts.push(bang(d, -0.62, -0.22, 0.228, -0.45), bang(d, -0.24, 0.16, 0.222, -0.05), bang(d, 0.14, 0.58, 0.232, 0.4));
      parts.push(tuft(d, 0.4, 0.33, 0.1, [0.7, 1, 0.1], 0.024));
      parts.push(tuft(d, Math.PI - 0.3, 0.3, 0.1, [-0.2, 0.55, -1], 0.02));
      break;
    }
    case 'sweep': {
      // 弟必：短侧分，刘海从人物左上薄薄地斜扫到右眉上方
      const d: Dome = { hl: line(0.272), t: 0.014, bulk: 0.02, top: 0.006, brim: 0.004 };
      parts.push(cap(d), ...sideburns(0.014));
      parts.push([
        domeAt(d, 0.95, 0.3, 0.004), domeAt(d, 0.6, 0.272, -0.004), shell(0.2, 0.25, 0.036), shell(-0.3, 0.225, 0.036), shell(-0.75, 0.215, 0.03),
        shell(-1.0, 0.25, 0.026), domeAt(d, -0.55, 0.3, -0.008), domeAt(d, 0.1, 0.32, -0.008), domeAt(d, 0.7, 0.33, -0.004),
        domeAt(d, 0, 0.29, 0.012), domeAt(d, -0.6, 0.27, 0.012),
      ]);
      parts.push(tuft(d, -0.7, 0.24, 0.08, [-0.55, -1, 0.35], 0.022));
      parts.push(tuft(d, Math.PI - 0.3, 0.3, 0.1, [-0.2, 0.55, -1], 0.02));
      break;
    }
    case 'crew': {
      // 吊隆、撇干：贴头平头，发际线方正
      const d: Dome = { hl: hairline([[0, 0.262], [0.6, 0.256], [1.0, 0.225], [1.3, 0.2], [1.75, 0.2], [2.2, 0.12], [Math.PI, 0.065]]), t: 0.016, bulk: 0.008, top: 0.006, brim: 0 };
      parts.push(cap(d), ...sideburns(0.014, 0.15));
      break;
    }
    // ── 路人款：形状更普通 ──
    case 'buzz':
      parts.push(cap({ hl: line(0.272, 0.2, 0.09), t: 0.01, bulk: 0.004, top: 0, brim: 0 }));
      break;
    case 'short':
      parts.push(cap({ hl: line(0.258), t: 0.022, bulk: 0.025, top: 0.01, brim: 0.01 }), ...sideburns(0.02));
      break;
    case 'messy': {
      const d: Dome = { hl: line(0.25), t: 0.025, bulk: 0.04, top: 0.015, brim: 0.015 };
      parts.push(cap(d));
      for (const th of [0.4, -0.6, 2.4]) parts.push(tuft(d, th, 0.31, 0.11, [Math.sin(th) * 0.6, 1, Math.cos(th) * 0.4 - 0.4], 0.035));
      break;
    }
    case 'side': {
      const d: Dome = { hl: line(0.25), t: 0.025, bulk: 0.035, top: 0.015, brim: 0.02 };
      parts.push(cap(d), tuft(d, -0.2, 0.27, 0.14, [-0.8, -0.6, 0.3], 0.04));
      break;
    }
  }
  return parts;
}

/** 上衣正面在高度 y 处的 z（手办单位，未乘厚度） */
function torsoFront(y: number) {
  for (let i = 0; i < TORSO.length - 1; i++) {
    const [y0, , d0] = TORSO[i], [y1, , d1] = TORSO[i + 1];
    if (y <= y1) return lerp(d0, d1, clamp01((y - y0) / (y1 - y0))) / 2;
  }
  return TORSO[TORSO.length - 1][2] / 2;
}

export type PoseName =
  | 'stand' | 'walk' | 'sit_play' | 'sit_phone' | 'sit_relax' | 'sit_eat' | 'sleep_desk' | 'slump'
  | 'rage' | 'cheer' | 'chat' | 'drink' | 'watch' | 'lie' | 'reach';

interface Pose {
  hipsY: number; bodyRX: number; bodyY: number; spineRX: number; spineRY: number; spineRZ: number; headRX: number; headRY: number; headRZ: number;
  sh: [number, number][]; el: number[]; hp: number[]; kn: number[];
}

interface Limb {
  sh: THREE.Group;
  el: THREE.Group;
}

export class Character {
  id: string;
  root = new THREE.Group();
  body = new THREE.Group();
  hips = new THREE.Group();
  spine = new THREE.Group();
  neck = new THREE.Group();
  head = new THREE.Group();
  headset = new THREE.Group();
  /** 挂脖耳机（弟必展示用），默认不显示 */
  neckphones = new THREE.Group();
  arms: Limb[] = [];
  legs: { hp: THREE.Group; kn: THREE.Group }[] = [];
  phone: THREE.Mesh;
  phoneScreen: THREE.MeshStandardMaterial;
  cup: THREE.Mesh;
  hit: THREE.Mesh;
  tagEl: HTMLDivElement;
  tagStatus: HTMLElement;
  bubbleEl: HTMLDivElement;
  bubbleUntil = 0;
  // 运动状态
  pos = new THREE.Vector3();
  facing = 0;
  targetFacing = 0;
  path: THREE.Vector3[] = [];
  poseName: PoseName = 'stand';
  arrivePose: PoseName = 'stand';
  arriveFacing: number | null = null;
  hidden = false;
  onArrive: (() => void) | null = null;
  onSlam: (() => void) | null = null;
  private s: number;
  private legLen: number;
  private t = Math.random() * 10;
  private phase = Math.random() * 10;
  private cur: Pose | null = null;
  private lastSlam = 0;
  private blinkAt = 2 + Math.random() * 3;
  /** 站位页、截图用：不眨眼 */
  noBlink = false;
  private eyes: THREE.Group[] = [];

  constructor(public def: MemberDef) {
    this.id = def.id;
    const L = def.look;
    const s = (this.s = L.height), g = L.girth;
    const U = FIG * s;
    this.legLen = HIP_Y * U;
    this.root.userData.memberId = def.id;
    this.root.add(this.body);

    // 胖瘦：躯干宽厚跟 girth 走；四肢、头只跟一部分
    const fat = clamp01((g - 1) / 0.3);
    const tw = g, td = 1 + (g - 1) * 0.9;
    const lw = 1.12 + (g - 1) * 0.55;
    const sw = 1 + (g - 1) * 0.8;
    const hw = 1 + (g - 1) * 0.3;

    const flat = (color: number, roughness = 0.82) => mat(color, { roughness, flatShading: true });
    const shirt = flat(L.shirt);
    const shirtDark = flat(new THREE.Color(L.shirt).multiplyScalar(0.8).getHex());
    const pants = flat(L.pants);
    const skin = flat(L.skin, 0.7);
    const skinShade = flat(new THREE.Color(L.skin).multiplyScalar(0.88).getHex(), 0.7);
    const hairM = flat(L.hair, 0.78);
    const dark = flat(0x1b1b1f, 0.5);
    const white = flat(0xffffff, 0.4);
    const lum = (c: number) => new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l;
    const hairLum = lum(L.hair);
    const browM = flat(hairLum > 0.35 ? new THREE.Color(L.hair).multiplyScalar(0.62).getHex() : 0x1e1e22, 0.7);

    /** 挂在关节下的一层，用手办单位建模，再整体缩放到世界尺寸 */
    const skinOf = (joint: THREE.Object3D, sx: number, sz: number, m = 1) => {
      const k = new THREE.Group();
      k.scale.set(U * sx * m, U * m, U * sz * m);
      joint.add(k);
      return k;
    };
    const add = (parent: THREE.Object3D, pts: P3[], m: THREE.Material) => {
      const mesh = solid(hull(pts), m);
      parent.add(mesh);
      return mesh;
    };
    const box = (parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = solid(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };

    // ── 骨盆 + 短裤裤腰 ──
    this.hips.position.y = this.legLen;
    this.body.add(this.hips);
    const hipsK = skinOf(this.hips, tw, td);
    add(hipsK, [...ring(0.07, 0.3, 0.19, 0.45), ...ring(0.0, 0.33, 0.205, 0.45), ...ring(-0.055, 0.33, 0.205, 0.4)], pants);

    // ── 上衣：肩宽、略收腰的方块 T 恤；胖子肚子往前顶 ──
    this.hips.add(this.spine);
    const spineK = skinOf(this.spine, tw, td);
    const tee: P3[] = [];
    for (const [y, w, d] of TORSO) tee.push(...ring(y, w, d, 0.32));
    if (fat > 0) tee.push(...ring(0.02, 0.33, 0.21, 0.4, { zf: 0.105 + 0.035 * fat }), ...ring(0.1, 0.32, 0.205, 0.4, { zf: 0.1 + 0.03 * fat }));
    add(spineK, tee, shirt);
    // 下摆一圈略深的边
    // 下摆深色边：只比上衣最下面一圈大一点，贴着衣服，不凸出来
    add(spineK, [...ring(-0.014, 0.349, 0.226, 0.32), ...ring(0.004, 0.347, 0.224, 0.32)], shirtDark);
    // 脖子 + V 领露出的皮肤
    const fzAt = (y: number) => torsoFront(y) + (fat > 0 && y < 0.15 ? 0.03 * fat : 0);
    const vTip = 0.185, vTop = 0.256, vW = 0.058;
    add(spineK, [
      ...ring(0.215, 0.09, 0.085, 0.3, { z0: -0.005 }), ...ring(NECK_Y + 0.03, 0.085, 0.08, 0.3, { z0: -0.005 }),
      [0, vTip, fzAt(vTip) + 0.003], [vW, vTop, fzAt(vTop) + 0.003], [-vW, vTop, fzAt(vTop) + 0.003],
    ], flat(new THREE.Color(L.skin).multiplyScalar(0.86).getHex(), 0.7));
    // 领口包边
    for (const sx of [-1, 1]) add(spineK, bar([0, vTip - 0.004, fzAt(vTip) + 0.004], [sx * (vW + 0.006), vTop + 0.002, fzAt(vTop) + 0.004], 0.012, 0.004), shirtDark);
    // 胸口队标：白六边形里套一个衫色小六边形（衫色太浅就反过来）
    if (L.badge) {
      const light = lum(L.shirt) > 0.7;
      const outer = solid(new THREE.CylinderGeometry(0.03 * U, 0.03 * U, 0.006 * U, 6).rotateX(Math.PI / 2), flat(light ? 0x2a2c33 : 0xffffff, 0.5));
      outer.rotation.z = Math.PI / 2;
      const by = 0.155;
      outer.position.set(0.08 * tw * U, by * U, (fzAt(by) * td + 0.002 + 0.03 * fat) * U);
      this.spine.add(outer);
      const inner = solid(new THREE.CylinderGeometry(0.014 * U, 0.014 * U, 0.006 * U, 6).rotateX(Math.PI / 2), flat(light ? L.shirt : new THREE.Color(L.shirt).multiplyScalar(0.55).getHex(), 0.5));
      inner.rotation.copy(outer.rotation);
      inner.position.copy(outer.position).add(new THREE.Vector3(0, 0, 0.0025 * U));
      this.spine.add(inner);
    }

    // 挂脖耳机（弟必，展示用）
    {
      const k = skinOf(this.spine, 1, 1);
      k.add(this.neckphones);
      const hc = L.headset?.color ?? L.shirt;
      const band = solid(new THREE.TorusGeometry(0.105, 0.017, 4, 10, Math.PI), flat(hc, 0.4));
      band.rotation.x = -(Math.PI / 2 - 0.35);
      band.position.set(0, NECK_Y - 0.02, 0.05);
      this.neckphones.add(band);
      for (const sx of [-1, 1]) {
        // 耳罩挂在锁骨两侧：外壳朝外前方，灰色耳垫贴着脖子
        const dir = new THREE.Vector3(sx * 0.85, 0.1, 0.5).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        const at = new THREE.Vector3(sx * 0.105, NECK_Y - 0.035, 0.07);
        const cup = solid(new THREE.CylinderGeometry(0.056, 0.064, 0.05, 8), flat(hc, 0.4));
        cup.quaternion.copy(q);
        cup.position.copy(at);
        this.neckphones.add(cup);
        const pad = solid(new THREE.CylinderGeometry(0.058, 0.058, 0.024, 8), flat(0x8e8b84, 0.85));
        pad.quaternion.copy(q);
        pad.position.copy(at).addScaledVector(dir, -0.034);
        this.neckphones.add(pad);
        const yoke = solid(new THREE.BoxGeometry(0.016, 0.07, 0.03), flat(new THREE.Color(hc).multiplyScalar(0.8).getHex(), 0.5));
        yoke.position.set(sx * 0.1, NECK_Y + 0.012, 0.03);
        yoke.rotation.z = -sx * 0.5;
        this.neckphones.add(yoke);
      }
      this.neckphones.visible = false;
    }

    // ── 头 ──
    this.neck.position.y = NECK_Y * U;
    this.spine.add(this.neck);
    this.head.position.y = HEAD_Y * U;
    this.neck.add(this.head);
    const headK = skinOf(this.head, hw, 1, HEAD_SCALE);
    const headPts: P3[] = [];
    for (const [y, w, d, z0] of HEAD) headPts.push(...ring(y, w, d, 0.36, { z0 }));
    add(headK, headPts, skin);
    // 耳朵
    for (const sx of [-1, 1]) {
      add(headK, [...ring(0.098, 0.03, 0.05, 0.4, { x0: sx * 0.13, z0: -0.01 }), ...ring(0.13, 0.05, 0.07, 0.4, { x0: sx * 0.146, z0: -0.014 }), ...ring(0.175, 0.046, 0.074, 0.45, { x0: sx * 0.148, z0: -0.016 }), [sx * 0.135, 0.196, -0.018]], skin);
      // 耳窝：略深一点的一小块
      add(headK, [...ring(0.12, 0.012, 0.03, 0.4, { x0: sx * 0.168, z0: -0.008 }), ...ring(0.165, 0.012, 0.04, 0.4, { x0: sx * 0.168, z0: -0.01 })], skinShade);
    }
    // 鼻子：小楔子
    add(headK, [[-0.013, 0.118, FZ - 0.002], [0.013, 0.118, FZ - 0.002], [0, 0.155, FZ - 0.001], [0, 0.112, FZ + 0.02], [-0.009, 0.106, FZ + 0.004], [0.009, 0.106, FZ + 0.004]], skin);
    // 嘴：一道短线
    box(headK, 0.038, 0.007, 0.008, flat(0x7a3e30, 0.7), 0, 0.076, 0.121);
    // 眼睛：竖六边形黑眼珠 + 一点高光（眨眼时整组压扁）
    const stern = L.brows === 'stern';
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.052, 0.145, FZ + 0.001);
      headK.add(eye);
      const pupil = solid(new THREE.CylinderGeometry(0.0118, 0.0118, 0.008, 8), flat(0x1c1512, 0.4));
      pupil.rotation.x = Math.PI / 2;
      pupil.scale.set(1, 1, 1.6);
      eye.add(pupil);
      box(eye, 0.0055, 0.0055, 0.004, white, sx * 0.003 + 0.003, 0.009, 0.004);
      this.eyes.push(eye);
      const brow = box(headK, 0.056, 0.014, 0.012, browM, sx * 0.055, stern ? 0.186 : 0.192, FZ + 0.002);
      brow.rotation.z = stern ? sx * 0.24 : -sx * 0.06;
    }
    // 发型
    for (const pts of hairParts(L.hairStyle)) add(headK, pts, hairM);
    if (L.helmet != null) {
      // 外卖头盔：比发盖再大一圈，前沿压到眉上
      const hl = hairline([[0, 0.235], [1.0, 0.21], [1.57, 0.17], [2.4, 0.11], [Math.PI, 0.1]]);
      add(headK, cap({ hl, t: 0.05, bulk: 0.02, top: 0.02, brim: 0 }), flat(L.helmet, 0.45));
      add(headK, [...ring(0.228, 0.22, 0.05, 0.3, { z0: 0.16 }), ...ring(0.242, 0.23, 0.07, 0.3, { z0: 0.16 })], flat(0x1a1a1a, 0.5));
    }
    // 眼镜：粗黑框方镜
    if (L.glasses) {
      const frame = flat(0x151517, 0.35);
      const lens = new THREE.MeshStandardMaterial({ color: 0xcfe0ff, transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0.2, depthWrite: false });
      const W = 0.094, H = 0.066, T = 0.013, z = FZ + 0.014, y = 0.15;
      for (const sx of [-1, 1]) {
        const cx = sx * 0.058;
        box(headK, W, T, 0.012, frame, cx, y + H / 2 - T / 2, z);
        box(headK, W, T, 0.012, frame, cx, y - H / 2 + T / 2, z);
        box(headK, T, H, 0.012, frame, cx - W / 2 + T / 2, y, z);
        box(headK, T, H, 0.012, frame, cx + W / 2 - T / 2, y, z);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - T * 2, H - T * 2), lens);
        glass.position.set(cx, y, z - 0.002);
        headK.add(glass);
        add(headK, bar([sx * (0.058 + W / 2 - 0.004), y + 0.012, z], [sx * 0.137, y + 0.012, z - 0.03], 0.01, 0.01), frame);
        add(headK, bar([sx * 0.137, y + 0.012, z - 0.03], [sx * 0.137, y + 0.008, -0.03], 0.01, 0.01), frame);
      }
      box(headK, 0.03, 0.012, 0.012, frame, 0, y + 0.008, z);
    }
    // 头戴耳机（比赛时戴）：罩色默认跟衫，弟必是白色不带麦
    {
      const k = skinOf(this.head, hw, 1, HEAD_SCALE);
      k.add(this.headset);
      const hc = L.headset?.color ?? L.shirt;
      const hm = flat(hc, 0.45);
      const band = solid(new THREE.TorusGeometry(0.2, 0.018, 4, 14, Math.PI), hm);
      band.scale.set(0.83, 1, 1.5);
      band.position.set(0, 0.15, -0.01);
      this.headset.add(band);
      for (const sx of [-1, 1]) {
        const cup = solid(new THREE.CylinderGeometry(0.058, 0.058, 0.045, 8), hm);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(sx * 0.166, 0.15, -0.01);
        this.headset.add(cup);
        const pad = solid(new THREE.CylinderGeometry(0.05, 0.05, 0.016, 8), dark);
        pad.rotation.z = Math.PI / 2;
        pad.position.set(sx * 0.141, 0.15, -0.01);
        this.headset.add(pad);
      }
      if (L.headset?.mic !== false) {
        add(this.headset, bar([0.17, 0.12, 0.03], [0.07, 0.075, 0.14], 0.011, 0.011), dark);
        add(this.headset, [...ring(0.065, 0.026, 0.026, 0.3, { x0: 0.062, z0: 0.145 }), ...ring(0.088, 0.026, 0.026, 0.3, { x0: 0.062, z0: 0.145 })], dark);
      }
      this.headset.visible = false;
    }

    // ── 手臂：短袖 → 上臂 → 前臂 + 方拳头 ──
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(sx * SHOULDER_X * tw * U, SHOULDER_Y * U, 0);
      this.spine.add(sh);
      const shK = skinOf(sh, lw, lw);
      // 短袖：顺着溜肩往下斜，袖口往外张、开口斜切（腋下高、外侧低）
      add(shK, [
        ...ring(0.05, 0.05, 0.13, 0.35, { x0: -sx * 0.055 }),
        ...ring(0.02, 0.1, 0.13, 0.32, { x0: -sx * 0.01 }),
        ...ring(-0.05, 0.112, 0.124, 0.3, { x0: sx * 0.006 }),
        [sx * 0.06, -0.116, 0.05], [sx * 0.06, -0.116, -0.05], [-sx * 0.045, -0.088, 0.048], [-sx * 0.045, -0.088, -0.048],
      ], shirt);
      add(shK, [[sx * 0.062, -0.11, 0.054], [sx * 0.062, -0.11, -0.054], [-sx * 0.047, -0.082, 0.052], [-sx * 0.047, -0.082, -0.052],
        [sx * 0.062, -0.122, 0.054], [sx * 0.062, -0.122, -0.054], [-sx * 0.047, -0.094, 0.052], [-sx * 0.047, -0.094, -0.052]], shirtDark);
      add(shK, [...ring(-0.07, 0.07, 0.074, 0.3, { x0: sx * 0.01 }), ...ring(-0.16, 0.068, 0.072, 0.3, { x0: sx * 0.004 })], skin);
      const el = new THREE.Group();
      el.position.y = -UPPER_ARM * U;
      sh.add(el);
      const elK = skinOf(el, lw, lw);
      add(elK, [...ring(0.012, 0.068, 0.07, 0.3), ...ring(-0.06, 0.07, 0.072, 0.3), ...ring(-0.105, 0.062, 0.064, 0.3)], skin);
      // 方拳头：手背、指节一排，大拇指压在前面
      add(elK, [...ring(-0.095, 0.064, 0.066, 0.3), ...ring(-0.12, 0.088, 0.09, 0.32), ...ring(-0.175, 0.086, 0.09, 0.32), ...ring(-0.198, 0.066, 0.072, 0.42)], skin);
      add(elK, [...ring(-0.165, 0.07, 0.03, 0.3, { x0: sx * 0.002, z0: 0.03 }), ...ring(-0.2, 0.06, 0.028, 0.3, { x0: sx * 0.002, z0: 0.026 })], skinShade);
      add(elK, [...ring(-0.115, 0.03, 0.03, 0.3, { x0: -sx * 0.036, z0: 0.034 }), ...ring(-0.158, 0.028, 0.028, 0.3, { x0: -sx * 0.04, z0: 0.046 })], skin);
      this.arms.push({ sh, el });
    }
    // 手机（摸鱼时拿在右手，屏幕颜色随 App 变）
    this.phoneScreen = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x6fa8ff, emissiveIntensity: 0.9 });
    const phoneBody = mat(0x1b1b1f, { roughness: 0.45 });
    this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.14, 0.012), [phoneBody, phoneBody, phoneBody, phoneBody, this.phoneScreen, phoneBody]);
    this.phone.position.set(0, -0.17 * U, 0.045 * U);
    this.phone.rotation.x = -0.3;
    this.phone.visible = false;
    this.arms[1].el.add(this.phone);
    // 杯子（喝水 / 饮料）
    this.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.12, 8), flat(0xf3e2c7));
    this.cup.position.set(0, -0.17 * U, 0.06 * U);
    this.cup.visible = false;
    this.arms[1].el.add(this.cup);

    // ── 腿：短裤 → 膝 → 小腿 → 脚 ──
    const flop = L.shoes ?? 0x2458c0;
    for (const sx of [-1, 1]) {
      const hp = new THREE.Group();
      hp.position.set(sx * 0.075 * tw * U, 0, 0);
      this.hips.add(hp);
      const shortsK = skinOf(hp, sw, sw);
      add(shortsK, [...ring(-0.015, 0.155, 0.18, 0.45, { x0: sx * 0.004 }), ...ring(-0.06, 0.175, 0.195, 0.3, { x0: sx * 0.01 }), ...ring(-0.19, 0.18, 0.19, 0.3, { x0: sx * 0.016 })], pants);
      const thighK = skinOf(hp, lw, lw);
      add(thighK, [...ring(-0.11, 0.098, 0.104, 0.3), ...ring(-0.182, 0.094, 0.1, 0.3)], skin);
      const kn = new THREE.Group();
      kn.position.y = -THIGH * U;
      hp.add(kn);
      const knK = skinOf(kn, lw, lw);
      add(knK, [...ring(0.015, 0.095, 0.1, 0.3), ...ring(-0.05, 0.096, 0.106, 0.3, { z0: -0.006 }), ...ring(-0.142, 0.078, 0.082, 0.3), ...ring(-0.165, 0.074, 0.078, 0.3)], skin);
      const foot = new THREE.Group();
      foot.position.y = -SHIN * U;
      kn.add(foot);
      const fK = skinOf(foot, 1, 1);
      if (L.flipflops) {
        // 光脚 + 蓝色人字拖（薄底 + V 形带）
        // 光脚：脚背 + 一排脚趾
        add(fK, [...ring(0.0, 0.07, 0.074, 0.3), ...ring(-0.024, 0.096, 0.15, 0.3, { z0: 0.032 }), ...ring(-0.034, 0.1, 0.18, 0.38, { z0: 0.04 })], skin);
        add(fK, [...ring(-0.022, 0.09, 0.03, 0.4, { z0: 0.122 }), ...ring(-0.035, 0.094, 0.036, 0.4, { z0: 0.124 })], skinShade);
        // 人字拖：厚底 + 粗 V 字带
        const flopM = flat(flop, 0.55);
        add(fK, [...ring(-0.034, 0.122, 0.226, 0.4, { z0: 0.042 }), ...ring(-0.05, 0.122, 0.226, 0.4, { z0: 0.042 })], flopM);
        add(fK, [...ring(-0.0335, 0.11, 0.214, 0.4, { z0: 0.042 }), ...ring(-0.0345, 0.11, 0.214, 0.4, { z0: 0.042 })], flat(new THREE.Color(flop).lerp(new THREE.Color(0xffffff), 0.25).getHex(), 0.6));
        for (const ex of [-1, 1]) add(fK, bar([ex * 0.004, -0.012, 0.118], [ex * 0.054, -0.03, 0.034], 0.024, 0.014), flopM);
      } else {
        // 路人：运动鞋 + 白底
        add(fK, [...ring(0.008, 0.08, 0.086, 0.3), ...ring(-0.02, 0.104, 0.19, 0.35, { z0: 0.038 }), ...ring(-0.032, 0.108, 0.208, 0.42, { z0: 0.042 })], flat(L.shoes ?? 0x2e2e34, 0.6));
        add(fK, [...ring(-0.031, 0.114, 0.216, 0.42, { z0: 0.042 }), ...ring(-0.05, 0.114, 0.216, 0.42, { z0: 0.042 })], flat(0xf2f2ef, 0.7));
      }
      this.legs.push({ hp, kn });
    }

    // 碰撞体（点击用）
    const hit = (this.hit = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * g, 0.34 * g, 1.08 * U, 8), new THREE.MeshBasicMaterial({ visible: false })));
    hit.position.y = 0.54 * U;
    hit.userData.memberId = def.id;
    this.root.add(hit);

    // 头顶昵称与气泡（CSS2D）
    const topY = (HIP_Y + NECK_Y + HEAD_Y + HEAD_TOP * HEAD_SCALE) * U;
    const tag = (this.tagEl = document.createElement('div'));
    tag.className = 'name-tag';
    tag.innerHTML = `<span class="dot" style="background:#${L.shirt.toString(16).padStart(6, '0')}"></span><b>${def.name}</b><i class="st"></i>`;
    tag.dataset.memberId = def.id;
    this.tagStatus = tag.querySelector('.st')!;
    const tagObj = new CSS2DObject(tag);
    tagObj.position.set(0, topY + 0.3, 0);
    this.root.add(tagObj);
    const bubble = (this.bubbleEl = document.createElement('div'));
    bubble.className = 'bubble';
    const bubbleObj = new CSS2DObject(bubble);
    bubbleObj.position.set(0, topY + 0.68, 0);
    this.root.add(bubbleObj);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== hit && !((o as THREE.Mesh).material as THREE.Material).transparent) {
        o.userData.memberId = def.id;
        o.castShadow = true;
      }
    });
  }

  // ── 指令 ──
  teleport(p: THREE.Vector3, facing: number, pose: PoseName) {
    this.pos.copy(p);
    this.facing = this.targetFacing = facing;
    this.path = [];
    this.poseName = pose;
    this.cur = null;
  }

  walkTo(points: { x: number; z: number }[], finalPose: PoseName, finalFacing: number | null, onArrive?: () => void) {
    this.path = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.arrivePose = finalPose;
    this.arriveFacing = finalFacing;
    this.onArrive = onArrive || null;
    if (this.path.length) this.poseName = 'walk';
    else this.setPose(finalPose, finalFacing);
  }

  setPose(name: PoseName, facing?: number | null) {
    this.poseName = name;
    if (facing != null) this.targetFacing = facing;
  }

  setHidden(h: boolean) {
    this.hidden = h;
    this.root.visible = !h;
    this.tagEl.style.display = h ? 'none' : '';
    if (h) this.bubbleEl.classList.remove('show');
  }

  say(text: string, ms = 4200, kind = '') {
    if (this.hidden) return;
    this.bubbleEl.textContent = text;
    this.bubbleEl.className = `bubble show ${kind}`;
    this.bubbleUntil = performance.now() + ms;
  }

  setStatusIcon(icon: string) {
    if (this.tagStatus.textContent !== icon) this.tagStatus.textContent = icon;
  }

  setPhoneScreen(color: number) {
    this.phoneScreen.emissive.setHex(color);
  }

  // ── 姿态表：返回各关节目标角 ──
  private poseTargets(name: PoseName, t: number): Pose {
    const P: Pose = {
      hipsY: this.legLen, bodyRX: 0, bodyY: 0, spineRX: 0, spineRY: 0, spineRZ: 0, headRX: 0, headRY: 0, headRZ: 0,
      sh: [[0, 0.08], [0, -0.08]], el: [0, 0], hp: [0, 0], kn: [0, 0],
    };
    const sit = () => {
      P.hipsY = SEAT_H;
      P.hp = [-Math.PI / 2 + 0.05, -Math.PI / 2 + 0.05];
      P.kn = [Math.PI / 2 - 0.05, Math.PI / 2 - 0.05];
    };
    switch (name) {
      case 'stand':
        P.spineRX = Math.sin(t * 1.4) * 0.015;
        P.headRY = Math.sin(t * 0.5) * 0.12;
        P.sh = [[Math.sin(t * 0.9) * 0.04, 0.1], [-Math.sin(t * 0.9) * 0.04, -0.1]];
        P.el = [-0.12, -0.12];
        break;
      case 'walk': {
        const w = t * 7.5;
        P.hp = [Math.sin(w) * 0.5, -Math.sin(w) * 0.5];
        P.kn = [Math.max(0, -Math.sin(w)) * 0.75, Math.max(0, Math.sin(w)) * 0.75];
        P.sh = [[-Math.sin(w) * 0.45, 0.1], [Math.sin(w) * 0.45, -0.1]];
        P.el = [-0.3, -0.3];
        P.bodyY = Math.abs(Math.sin(w)) * 0.035;
        P.spineRX = 0.05;
        P.spineRY = Math.sin(w) * 0.06;
        break;
      }
      case 'sit_play':
        sit();
        P.spineRX = 0.16 + Math.sin(t * 1.3) * 0.02;
        P.headRX = 0.08 + Math.sin(t * 2.1) * 0.03;
        P.sh = [[-0.85 + Math.sin(t * 13) * 0.04, 0.12], [-0.8 + Math.sin(t * 3.1) * 0.06, -0.05]];
        P.el = [-0.85 + Math.sin(t * 15) * 0.07, -0.95 + Math.sin(t * 4) * 0.05];
        break;
      case 'sit_phone':
        sit();
        P.spineRX = 0.3;
        P.headRX = 0.5;
        P.headRZ = Math.sin(t * 0.6) * 0.06;
        P.sh = [[-0.35, 0.15], [-0.55, -0.25]];
        P.el = [-0.8, -1.7 + Math.sin(t * 2) * 0.05];
        break;
      case 'sit_relax':
        sit();
        P.spineRX = -0.22;
        P.headRX = -0.05 + Math.sin(t * 0.7) * 0.05;
        P.headRZ = 0.12;
        P.sh = [[-0.4, 0.45], [-0.4, -0.45]];
        P.el = [-1.9, -1.9];
        P.hp = [-Math.PI / 2 + 0.25, -Math.PI / 2 + 0.25];
        P.kn = [Math.PI / 2 - 0.35, Math.PI / 2 - 0.35];
        break;
      case 'sit_eat':
        sit();
        P.spineRX = 0.2;
        P.headRX = 0.2;
        P.sh = [[-0.6, 0.1], [-0.4 - Math.max(0, Math.sin(t * 1.6)) * 0.6, -0.1]];
        P.el = [-0.9, -1.2 - Math.max(0, Math.sin(t * 1.6)) * 0.9];
        break;
      case 'sleep_desk':
        sit();
        P.spineRX = 0.95 + Math.sin(t * 0.9) * 0.02;
        P.headRX = 0.25;
        P.headRZ = 0.5;
        P.sh = [[-1.25, 0.35], [-1.25, -0.35]];
        P.el = [-1.6, -1.6];
        break;
      case 'slump':
        sit();
        P.spineRX = 0.45;
        P.headRX = 0.55;
        P.sh = [[0.1, 0.15], [0.1, -0.15]];
        P.el = [-0.2, -0.2];
        break;
      case 'rage': {
        P.spineRX = 0.28;
        P.headRX = 0.2;
        const ph = (t * 1.9) % 1;
        const up = ph < 0.65 ? ph / 0.65 : 1 - Math.pow((ph - 0.65) / 0.35, 2);
        P.sh = [[lerp(-0.95, -2.7, up), 0.15], [lerp(-0.95, -2.5, ph < 0.65 ? up * 0.8 : up), -0.15]];
        P.el = [-0.25, -0.35];
        P.hp = [-0.12, -0.12];
        P.kn = [0.15, 0.15];
        P.hipsY = this.legLen - 0.03;
        if (ph > 0.95 && t - this.lastSlam > 0.3) {
          this.lastSlam = t;
          this.onSlam?.();
        }
        break;
      }
      case 'cheer':
        P.sh = [[-2.8 + Math.sin(t * 9) * 0.25, 0.35], [-2.8 - Math.sin(t * 9) * 0.25, -0.35]];
        P.el = [-0.3, -0.3];
        P.bodyY = Math.max(0, Math.sin(t * 9)) * 0.12;
        P.headRX = -0.25;
        break;
      case 'chat':
        P.sh = [[-0.2 + Math.sin(t * 2.2) * 0.15, 0.12], [-0.7 + Math.sin(t * 3.1 + 1) * 0.35, -0.2]];
        P.el = [-0.3, -1.1 + Math.sin(t * 3.3) * 0.3];
        P.headRX = Math.sin(t * 2.4) * 0.08;
        P.headRY = Math.sin(t * 0.9) * 0.15;
        P.spineRY = Math.sin(t * 0.8) * 0.08;
        break;
      case 'drink':
        P.sh = [[0, 0.1], [-0.35 - Math.max(0, Math.sin(t * 1.2)) * 0.55, -0.15]];
        P.el = [0, -1.5 - Math.max(0, Math.sin(t * 1.2)) * 0.6];
        P.headRX = -Math.max(0, Math.sin(t * 1.2)) * 0.2;
        break;
      case 'reach':
        // 开冰箱、在零食柜前挑东西：手往前伸、头左右看
        P.spineRX = 0.18;
        P.headRX = 0.15;
        P.headRY = Math.sin(t * 1.3) * 0.3;
        P.sh = [[-0.25, 0.1], [-1.25 + Math.sin(t * 1.6) * 0.15, -0.1]];
        P.el = [-0.3, -0.25];
        break;
      case 'watch':
        P.sh = [[-0.45, 0.5], [-0.45, -0.5]];
        P.el = [-1.85, -1.85];
        P.headRX = 0.15;
        P.spineRX = 0.05 + Math.sin(t * 1.1) * 0.02;
        break;
      case 'lie':
        P.hipsY = this.legLen;
        P.bodyRX = -Math.PI / 2;
        P.sh = [[-0.5, 0.3], [-0.5, -0.3]];
        P.el = [-1.4, -1.4];
        P.headRX = -0.15;
        P.headRZ = 0.25;
        P.hp = [0.05, -0.05];
        P.kn = [0.1, 0.2];
        P.spineRX = Math.sin(t * 0.8) * 0.015;
        break;
    }
    return P;
  }

  update(dt: number, nowMs: number) {
    this.t += dt;
    // 沿路径行走
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = WALK_SPEED * dt;
      this.targetFacing = Math.atan2(dx, dz);
      if (d <= step) {
        this.pos.set(target.x, 0, target.z);
        this.path.shift();
        if (!this.path.length) {
          this.poseName = this.arrivePose;
          if (this.arriveFacing != null) this.targetFacing = this.arriveFacing;
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
      }
    }
    // 转身
    let df = this.targetFacing - this.facing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    this.facing += df * Math.min(1, dt * 8);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;

    // 关节插值
    const P = this.poseTargets(this.poseName, this.t + this.phase);
    const k = this.cur ? Math.min(1, dt * 9) : 1;
    const c = (this.cur ||= structuredClone(P));
    for (const key of ['hipsY', 'bodyRX', 'bodyY', 'spineRX', 'spineRY', 'spineRZ', 'headRX', 'headRY', 'headRZ'] as const) c[key] = lerp(c[key], P[key], k);
    for (let i = 0; i < 2; i++) {
      c.sh[i][0] = lerp(c.sh[i][0], P.sh[i][0], k);
      c.sh[i][1] = lerp(c.sh[i][1], P.sh[i][1], k);
      c.el[i] = lerp(c.el[i], P.el[i], k);
      c.hp[i] = lerp(c.hp[i], P.hp[i], k);
      c.kn[i] = lerp(c.kn[i], P.kn[i], k);
    }
    this.hips.position.y = c.hipsY + c.bodyY;
    this.body.rotation.x = c.bodyRX;
    this.spine.rotation.set(c.spineRX, c.spineRY, c.spineRZ);
    this.head.rotation.set(c.headRX, c.headRY, c.headRZ);
    this.arms.forEach((a, i) => {
      a.sh.rotation.set(c.sh[i][0], 0, c.sh[i][1]);
      a.el.rotation.x = c.el[i];
    });
    this.legs.forEach((l, i) => {
      l.hp.rotation.x = c.hp[i];
      l.kn.rotation.x = c.kn[i];
    });
    // 躺姿：整个身体绕脚底转 -90°（脸朝上、头朝 -z），再抬到沙发坐垫高度并居中
    if (this.poseName === 'lie') this.body.position.set(0, 0.62, 0.85 * this.s);
    else this.body.position.set(0, 0, 0);

    // 眨眼；睡觉时闭眼
    const sleeping = this.poseName === 'sleep_desk' || this.poseName === 'lie';
    this.blinkAt -= dt;
    let open = 1;
    if (sleeping) open = 0.12;
    else if (this.blinkAt < 0.12 && !this.noBlink) open = 0.15;
    if (this.blinkAt < 0) this.blinkAt = 2.5 + Math.random() * 3.5;
    for (const e of this.eyes) e.scale.y = open;

    if (this.bubbleUntil && nowMs > this.bubbleUntil) {
      this.bubbleEl.classList.remove('show');
      this.bubbleUntil = 0;
    }
  }
}
