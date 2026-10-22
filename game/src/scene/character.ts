// 低多边形手办人物：关节是空 Group，姿态用关节角度插值实现。
// 外形：大头、短腿、切面块状四肢、V 领短袖、胸口六边形队标、深藏青短裤、蓝人字拖。
// 网格按手办单位写，再乘 FIG 放进房间。六人、路人、外卖员同一套体型。
// 头发在 hair.ts，姿态在 pose.ts，切面在 figure.ts，比例在 body.ts。
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { MemberDef } from '../data/roster';
import { FIG, HEAD_SCALE, HEAD_TOP, HEAD_Y, HIP_Y, NECK_Y, SEAT_H, STANDARD_BODY, fromLegacyScale } from './body';
import { bar, hull, ring, solid, type P3 } from './figure';
import { HEAD, hairParts, helmetShell } from './hair';
import { mat } from './office';
import { poseTargets, type Pose, type PoseName } from './pose';

export type { PoseName };

const WALK_SPEED = 1.35;
/** 四肢横截面。等于旧公式 girth=1 的结果，不再按人加减。 */
const LIMB_XZ = 1.12;
const FZ = 0.125;

const THIGH = 0.178;
const SHIN = 0.17;
const SHOULDER_Y = 0.212;
const SHOULDER_X = 0.205;
const UPPER_ARM = 0.15;

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

/** 上衣正面在高度 y 处的 z（手办单位，未乘厚度） */
function torsoFront(y: number) {
  for (let i = 0; i < TORSO.length - 1; i++) {
    const [y0, , d0] = TORSO[i], [y1, , d1] = TORSO[i + 1];
    if (y <= y1) return lerp(d0, d1, clamp01((y - y0) / (y1 - y0))) / 2;
  }
  return TORSO[TORSO.length - 1][2] / 2;
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
    const U = FIG * STANDARD_BODY.height;
    this.legLen = HIP_Y * U;
    this.root.userData.memberId = def.id;
    this.root.add(this.body);

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
    const hipsK = skinOf(this.hips, 1, 1);
    add(hipsK, [...ring(0.07, 0.3, 0.19, 0.45), ...ring(0.0, 0.33, 0.205, 0.45), ...ring(-0.055, 0.33, 0.205, 0.4)], pants);

    // ── 上衣：肩宽、略收腰的方块 T 恤 ──
    this.hips.add(this.spine);
    const spineK = skinOf(this.spine, 1, 1);
    const tee: P3[] = [];
    for (const [y, w, d] of TORSO) tee.push(...ring(y, w, d, 0.32));
    add(spineK, tee, shirt);
    // 下摆深色边：只比上衣最下面一圈大一点，贴着衣服，不凸出来
    add(spineK, [...ring(-0.014, 0.349, 0.226, 0.32), ...ring(0.004, 0.347, 0.224, 0.32)], shirtDark);
    // 脖子 + V 领露出的皮肤
    const fzAt = (y: number) => torsoFront(y);
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
      outer.position.set(0.08 * U, by * U, (fzAt(by) + 0.002) * U);
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
    const headK = skinOf(this.head, 1, 1, HEAD_SCALE);
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
      add(headK, helmetShell(), flat(L.helmet, 0.45));
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
      const k = skinOf(this.head, 1, 1, HEAD_SCALE);
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
      sh.position.set(sx * SHOULDER_X * U, SHOULDER_Y * U, 0);
      this.spine.add(sh);
      const shK = skinOf(sh, LIMB_XZ, LIMB_XZ);
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
      const elK = skinOf(el, LIMB_XZ, LIMB_XZ);
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
      hp.position.set(sx * 0.075 * U, 0, 0);
      this.hips.add(hp);
      const shortsK = skinOf(hp, 1, 1);
      add(shortsK, [...ring(-0.015, 0.155, 0.18, 0.45, { x0: sx * 0.004 }), ...ring(-0.06, 0.175, 0.195, 0.3, { x0: sx * 0.01 }), ...ring(-0.19, 0.18, 0.19, 0.3, { x0: sx * 0.016 })], pants);
      const thighK = skinOf(hp, LIMB_XZ, LIMB_XZ);
      add(thighK, [...ring(-0.11, 0.098, 0.104, 0.3), ...ring(-0.182, 0.094, 0.1, 0.3)], skin);
      const kn = new THREE.Group();
      kn.position.y = -THIGH * U;
      hp.add(kn);
      const knK = skinOf(kn, LIMB_XZ, LIMB_XZ);
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
    const hit = (this.hit = new THREE.Mesh(new THREE.CylinderGeometry(fromLegacyScale(0.34), fromLegacyScale(0.34), 1.08 * U, 8), new THREE.MeshBasicMaterial({ visible: false })));
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
    tagObj.position.set(0, topY + fromLegacyScale(0.3), 0);
    this.root.add(tagObj);
    const bubble = (this.bubbleEl = document.createElement('div'));
    bubble.className = 'bubble';
    const bubbleObj = new CSS2DObject(bubble);
    bubbleObj.position.set(0, topY + fromLegacyScale(0.68), 0);
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
    const slam = { legLen: this.legLen, seatH: SEAT_H, lastSlam: this.lastSlam, onSlam: this.onSlam };
    const P = poseTargets(this.poseName, this.t + this.phase, slam);
    this.lastSlam = slam.lastSlam;
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
    if (this.poseName === 'lie') this.body.position.set(0, 0.62, fromLegacyScale(0.85));
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
