// 低多边形人物（画风对标《Corner Pitch》的小球员）：真人比例，头身约 1:5.6
// 方块拼装、平直着色：短袖 T 恤 + 短裤 + 露小腿 + 白袜 + 鞋。低分下约 20 个像素高，靠衫色和发型认人。
// 关节仍是原来的空 Group（hips/spine/neck/head、sh/el、hp/kn），15 个姿态用关节角度插值。
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { MemberDef } from '../data/roster';
import { mergeStatic } from './merge';
import { mat } from './office';

const SEAT_H = 0.5;
const HEAD_W = 0.23;
const HEAD_H = 0.26;
const HEAD_D = 0.24;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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

function block(w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// 上宽下窄的躯干块：底面按 bottom 比例收窄（肩宽、腰窄）
function taper(w: number, h: number, d: number, bottom: number, material: THREE.Material, parent: THREE.Object3D, y: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) < 0) {
      p.setX(i, p.getX(i) * bottom);
      p.setZ(i, p.getZ(i) * (0.5 + bottom * 0.5));
    }
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.position.y = y + h / 2;
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
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
  private seatH = SEAT_H;
  private t = Math.random() * 10;
  private phase = Math.random() * 10;
  private cur: Pose | null = null;
  private lastSlam = 0;
  private blinkAt = 2 + Math.random() * 3;
  private eyes: THREE.Group[] = [];

  constructor(public def: MemberDef) {
    this.id = def.id;
    const L = def.look;
    const s = L.height;
    const g = L.girth;
    const sg = Math.sqrt(g);
    const legLen = (this.legLen = 0.84 * s);
    const torsoLen = 0.3 * s;
    this.root.userData.memberId = def.id;
    this.root.userData.noMerge = true;
    this.root.add(this.body);

    const shirt = mat(L.shirt, { roughness: 0.85 });
    const shirtDark = mat(new THREE.Color(L.shirt).multiplyScalar(0.74).getHex(), { roughness: 0.85 });
    const pants = mat(L.pants, { roughness: 0.85 });
    const skin = mat(L.skin, { roughness: 0.7 });
    const hair = mat(L.hair, { roughness: 0.85 });
    const dark = mat(0x18191c, { roughness: 0.5 });
    const sock = mat(0xf2f2ee, { roughness: 0.8 });

    // 胯：短裤裤腰
    this.hips.position.y = legLen;
    this.body.add(this.hips);
    block(0.31 * g, 0.17, 0.2 * sg, pants, this.hips, 0, 0.02, 0);

    // 躯干：上宽下窄的 T 恤 + 下摆深色一圈；胖的多一块肚子
    this.spine.position.y = 0.04;
    this.hips.add(this.spine);
    const shoulderW = 0.37 * g;
    const torsoD = 0.2 * sg;
    const torsoH = torsoLen + 0.17;
    taper(shoulderW, torsoH, torsoD, 0.82, shirt, this.spine, 0.0);
    block(shoulderW * 0.83, 0.05, torsoD * 0.93, shirtDark, this.spine, 0, 0.03, 0);
    if (g > 1.12) block(shoulderW * 0.7, torsoH * 0.42, 0.08, shirt, this.spine, 0, torsoH * 0.32, torsoD / 2 + 0.02);
    // 胸口白色小队标（视频球衣的号码块）
    block(0.06, 0.06, 0.01, mat(0xf4f4f0, { roughness: 0.6 }), this.spine, shoulderW * 0.2, torsoH * 0.72, torsoD / 2 + 0.006);

    // 脖子 + 头
    this.neck.position.y = torsoH + 0.01;
    this.spine.add(this.neck);
    block(0.1, 0.07, 0.1, skin, this.neck, 0, 0.02, 0);
    this.head.position.y = 0.05 + HEAD_H / 2;
    this.neck.add(this.head);
    block(HEAD_W, HEAD_H, HEAD_D, skin, this.head);
    const faceZ = HEAD_D / 2;
    for (const sx of [-1, 1] as const) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.055, 0.005, faceZ + 0.004);
      this.head.add(eye);
      block(0.034, 0.05, 0.01, mat(0x15171b, { roughness: 0.4 }), eye);
      this.eyes.push(eye);
      block(0.03, 0.06, 0.05, skin, this.head, sx * (HEAD_W / 2 + 0.012), -0.005, 0);
    }
    if (L.eyeBags) {
      const bag = mat(0x2a6270, { roughness: 0.7 });
      for (const sx of [-1, 1] as const) block(0.05, 0.022, 0.01, bag, this.head, sx * 0.055, -0.035, faceZ + 0.004);
    }
    this.addHair(L.hairStyle, hair);
    if (L.glasses) this.addGlasses(L.lens === 'glow', L.frame === 'thick', faceZ);
    if (L.earmuffs) this.addEarmuffs();
    this.addHeadset(dark, L.shirt);

    // 手臂：短袖露小臂；肘以下是小臂 + 手
    const arm = 0.085 * sg;
    for (const sx of [-1, 1] as const) {
      const sh = new THREE.Group();
      sh.position.set(sx * (shoulderW / 2 + arm * 0.45), torsoLen + 0.12, 0);
      this.spine.add(sh);
      block(arm + 0.025, 0.14 * s, arm + 0.025, shirt, sh, 0, -0.05 * s, 0);
      block(arm, 0.27 * s, arm, skin, sh, 0, -0.135 * s, 0);
      const el = new THREE.Group();
      el.position.y = -0.27 * s;
      sh.add(el);
      block(arm * 0.9, 0.22 * s, arm * 0.9, skin, el, 0, -0.11 * s, 0);
      block(arm * 0.95, 0.08, arm * 0.75, skin, el, 0, -0.24 * s, 0);
      this.arms.push({ sh, el });
    }

    this.phoneScreen = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x6fa8ff, emissiveIntensity: 0.9 });
    this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.014), [dark, dark, dark, dark, this.phoneScreen, dark]);
    this.phone.position.set(0, -0.28 * s, 0.04);
    this.phone.rotation.x = -0.3;
    this.phone.visible = false;
    this.phone.castShadow = true;
    this.arms[1].el.add(this.phone);

    this.cup = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.07), mat(0xf3e2c7, { roughness: 0.45 }));
    this.cup.position.set(0, -0.28 * s, 0.05);
    this.cup.visible = false;
    this.cup.castShadow = true;
    this.arms[1].el.add(this.cup);

    // 腿：短裤盖住大腿上段，小腿露肤，白袜 + 鞋（或人字拖）
    const leg = 0.11 * sg;
    for (const sx of [-1, 1] as const) {
      const hp = new THREE.Group();
      hp.position.set(sx * 0.085 * g, 0, 0);
      this.hips.add(hp);
      block(leg + 0.03, 0.26 * s, leg + 0.03, pants, hp, 0, -0.1 * s, 0);
      block(leg, 0.42 * s, leg, skin, hp, 0, -0.21 * s, 0);
      const kn = new THREE.Group();
      kn.position.y = -0.42 * s;
      hp.add(kn);
      block(leg * 0.88, 0.4 * s, leg * 0.88, skin, kn, 0, -0.2 * s, 0);
      const foot = new THREE.Group();
      foot.position.y = -0.42 * s;
      kn.add(foot);
      if (L.flipflops) {
        const sole = mat(L.shoes ?? L.shirt, { roughness: 0.55 });
        block(0.11, 0.025, 0.25, sole, foot, 0, 0.012, 0.05);
        block(0.09, 0.05, 0.2, skin, foot, 0, 0.045, 0.045);
        block(0.095, 0.02, 0.04, sole, foot, 0, 0.07, 0.08);
      } else {
        block(leg * 0.92, 0.09, leg * 0.92, sock, foot, 0, 0.1, 0);
        block(0.11, 0.08, 0.25, mat(L.shoes ?? 0xe9e9e9, { roughness: 0.55 }), foot, 0, 0.04, 0.045);
        block(0.115, 0.02, 0.26, mat(0xf4f4f2, { roughness: 0.6 }), foot, 0, 0.01, 0.045);
      }
      this.legs.push({ hp, kn });
    }

    const crown = legLen + 0.04 + torsoH + 0.06 + HEAD_H + 0.05;
    const hit = (this.hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.5 * g, crown, 0.4),
      new THREE.MeshBasicMaterial({ visible: false }),
    ));
    hit.position.y = crown / 2;
    hit.userData.memberId = def.id;
    this.root.add(hit);

    const tag = (this.tagEl = document.createElement('div'));
    tag.className = 'name-tag';
    tag.innerHTML = `<span class="dot" style="background:#${L.shirt.toString(16).padStart(6, '0')}"></span><b>${def.name}</b><i class="st"></i>`;
    tag.dataset.memberId = def.id;
    this.tagStatus = tag.querySelector('.st')!;
    const tagObj = new CSS2DObject(tag);
    tagObj.position.set(0, crown + 0.12, 0);
    this.root.add(tagObj);
    const bubble = (this.bubbleEl = document.createElement('div'));
    bubble.className = 'bubble';
    const bubbleObj = new CSS2DObject(bubble);
    bubbleObj.position.set(0, crown + 0.36, 0);
    this.root.add(bubbleObj);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== hit) {
        o.userData.memberId = def.id;
        o.castShadow = true;
      }
    });
    // 每个关节组内按材质合批（关节照常转动）；拾取柱、杯子要单独开关，不合
    hit.userData.noMerge = true;
    this.cup.userData.noMerge = true;
    mergeStatic(this.root);
  }

  // 头发：头顶盖 + 后脑勺一块，再按发型加刘海 / 发撮
  private addHair(style: MemberDef['look']['hairStyle'], hairMat: THREE.Material) {
    const top = HEAD_H / 2;
    const b = (w: number, h: number, d: number, x: number, y: number, z: number) => block(w, h, d, hairMat, this.head, x, y, z);
    const capAndBack = (thick: number, back = true) => {
      b(HEAD_W + 0.02, thick, HEAD_D + 0.02, 0, top + thick / 2 - 0.02, -0.005);
      if (back) b(HEAD_W + 0.02, HEAD_H * 0.62, 0.04, 0, top - HEAD_H * 0.3, -HEAD_D / 2 - 0.01);
    };
    if (style === 'buzz') {
      capAndBack(0.035);
      return;
    }
    if (style === 'messy') {
      capAndBack(0.07);
      const tufts: [number, number, number, number, number][] = [
        [-0.07, 0.06, 0.03, 0.4, 0.2], [0.06, 0.07, 0.0, -0.45, -0.1], [0.0, 0.08, -0.06, 0.1, -0.3], [-0.1, 0.03, -0.07, 0.6, 0], [0.09, 0.03, 0.08, -0.5, 0.4],
      ];
      for (const [x, y, z, rz, rx] of tufts) b(0.07, 0.09, 0.06, x, top + y, z).rotation.set(rx, 0, rz);
      return;
    }
    if (style === 'flat') {
      capAndBack(0.05);
      b(HEAD_W + 0.02, 0.05, 0.05, 0, top - 0.02, HEAD_D / 2 + 0.01).rotation.x = -0.3;
      return;
    }
    if (style === 'bangs') {
      capAndBack(0.06);
      b(HEAD_W + 0.02, 0.07, 0.04, 0, top - 0.04, HEAD_D / 2 + 0.005);
      return;
    }
    if (style === 'side') {
      capAndBack(0.07);
      const bang = b(HEAD_W * 0.8, 0.08, 0.05, -0.03, top - 0.03, HEAD_D / 2 + 0.01);
      bang.rotation.z = 0.25;
      return;
    }
    if (style === 'fluffy') {
      capAndBack(0.1);
      b(0.06, 0.12, HEAD_D * 0.8, -HEAD_W / 2 - 0.03, top - 0.04, -0.01);
      b(0.06, 0.12, HEAD_D * 0.8, HEAD_W / 2 + 0.03, top - 0.04, -0.01);
      return;
    }
    capAndBack(0.06);
  }

  private addGlasses(glow: boolean, thick: boolean, faceZ: number) {
    const frame = mat(0x111114, { roughness: 0.35 });
    const lens = glow
      ? new THREE.MeshStandardMaterial({ color: 0xb8fff8, emissive: 0x5ff0ff, emissiveIntensity: 1.6, roughness: 0.2 })
      : mat(0x9fb6cc, { roughness: 0.15, metalness: 0.2 });
    const h = thick ? 0.07 : 0.055;
    block(HEAD_W + 0.01, 0.022, 0.016, frame, this.head, 0, 0.005 + h / 2, faceZ + 0.008);
    for (const sx of [-1, 1] as const) {
      block(0.075, h, 0.012, lens, this.head, sx * 0.055, 0.005, faceZ + 0.01);
      block(0.012, h, 0.016, frame, this.head, sx * (0.055 + 0.04), 0.005, faceZ + 0.008);
      block(0.015, 0.02, HEAD_D * 0.8, frame, this.head, sx * (HEAD_W / 2 + 0.006), 0.02, 0);
    }
    if (thick) block(HEAD_W + 0.01, 0.022, 0.016, frame, this.head, 0, 0.005 - h / 2, faceZ + 0.008);
  }

  // 挂脖红耳罩
  private addEarmuffs() {
    const red = mat(0xe23b3b, { roughness: 0.5 });
    block(0.22, 0.035, 0.035, red, this.neck, 0, 0.0, -0.06);
    for (const sx of [-1, 1] as const) block(0.07, 0.08, 0.08, red, this.neck, sx * 0.12, 0.0, 0.0);
  }

  private addHeadset(dark: THREE.Material, shirt: number) {
    const cupMat = mat(shirt, { roughness: 0.5 });
    const top = HEAD_H / 2;
    block(HEAD_W + 0.06, 0.03, 0.04, dark, this.headset, 0, top + 0.05, 0);
    for (const sx of [-1, 1] as const) {
      block(0.03, 0.14, 0.04, dark, this.headset, sx * (HEAD_W / 2 + 0.03), top - 0.03, 0);
      block(0.05, 0.1, 0.09, cupMat, this.headset, sx * (HEAD_W / 2 + 0.035), -0.01, 0);
    }
    const mic = block(0.015, 0.015, 0.11, dark, this.headset, -HEAD_W / 2 - 0.03, -0.06, 0.07);
    mic.rotation.y = 0.3;
    this.headset.visible = false;
    this.head.add(this.headset);
  }

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

  private poseTargets(name: PoseName, t: number): Pose {
    const P: Pose = {
      hipsY: this.legLen, bodyRX: 0, bodyY: 0, spineRX: 0, spineRY: 0, spineRZ: 0, headRX: 0, headRY: 0, headRZ: 0,
      sh: [[0, 0.08], [0, -0.08]], el: [0, 0], hp: [0, 0], kn: [0, 0],
    };
    const sit = () => {
      P.hipsY = this.seatH;
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
    if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      const step = 1.35 * dt;
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
    let df = this.targetFacing - this.facing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    this.facing += df * Math.min(1, dt * 8);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;

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
    if (this.poseName === 'lie') this.body.position.set(0, 0.5, 0.55);
    else this.body.position.set(0, 0, 0);

    const sleeping = this.poseName === 'sleep_desk' || this.poseName === 'lie';
    this.blinkAt -= dt;
    let open = 1;
    if (sleeping) open = 0.12;
    else if (this.blinkAt < 0.12) open = 0.15;
    if (this.blinkAt < 0) this.blinkAt = 2.5 + Math.random() * 3.5;
    for (const e of this.eyes) e.scale.y = open;

    if (this.bubbleUntil && nowMs > this.bubbleUntil) {
      this.bubbleEl.classList.remove('show');
      this.bubbleUntil = 0;
    }
  }
}
