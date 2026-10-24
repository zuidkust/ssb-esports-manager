// 方块手办：头身比约 2.5，关节仍是原来的 15 个空 Group，姿态用关节角度插值
// 头用指定倒角盒；五官只留竖长豆豆眼。躯干四肢都是方柱，特征块放大到低分下能认出来
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { MemberDef } from '../data/roster';
import { mat } from './office';

const HEAD_W = 0.34;
const HEAD_H = 0.34;
const HEAD_D = 0.32;
const NECK_H = 0.04;
const TORSO_H = 0.2;
const THIGH_H = 0.145;
const SHIN_H = 0.125;
const TARGET_HEIGHT = 1.7;

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
  private seatH: number;
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
    const legLen = (this.legLen = THIGH_H + SHIN_H);
    const crown = legLen + TORSO_H + NECK_H + HEAD_H - 0.012;
    const fit = (TARGET_HEIGHT * s) / crown;
    this.seatH = 0.5 / fit;
    this.root.userData.memberId = def.id;
    this.body.scale.setScalar(fit);
    this.root.add(this.body);

    const shirt = mat(L.shirt, { roughness: 0.72 });
    const shirtDark = mat(new THREE.Color(L.shirt).multiplyScalar(0.72).getHex(), { roughness: 0.72 });
    const pants = mat(L.pants, { roughness: 0.78 });
    const skin = mat(L.skin, { roughness: 0.7 });
    const hair = mat(L.hair, { roughness: 0.8 });
    const dark = mat(0x141414, { roughness: 0.4 });
    const eyeMat = mat(0x16181c, { roughness: 0.35 });

    const torsoW = 0.26 * g;
    const torsoD = 0.15 * (0.82 + 0.18 * Math.min(g, 1.3));
    const limb = 0.055 * Math.sqrt(g);

    this.hips.position.y = legLen;
    this.body.add(this.hips);
    block(0.2 * g, 0.07, 0.12 * Math.min(g, 1.2), pants, this.hips, 0, -0.02, 0);
    block(0.22 * g, 0.028, 0.132, dark, this.hips, 0, 0.02, 0);

    this.spine.position.y = 0;
    this.hips.add(this.spine);
    block(torsoW, TORSO_H, torsoD, shirt, this.spine, 0, TORSO_H / 2, 0);
    block(torsoW * 0.72, 0.028, torsoD * 0.4, shirtDark, this.spine, 0, TORSO_H - 0.01, torsoD * 0.42);
    block(0.045, 0.045, 0.012, mat(0xe9c46a, { roughness: 0.4, metalness: 0.35 }), this.spine, torsoW * 0.22, TORSO_H * 0.62, torsoD * 0.52);
    if (g >= 1.08) block(torsoW * 0.72, TORSO_H * 0.42, torsoD * 0.45, shirt, this.spine, 0, TORSO_H * 0.38, torsoD * 0.42);

    this.neck.position.y = TORSO_H;
    this.spine.add(this.neck);
    block(0.09, NECK_H, 0.09, skin, this.neck, 0, NECK_H / 2, 0);

    this.head.position.y = NECK_H + HEAD_H / 2 - 0.012;
    this.neck.add(this.head);
    const headGeo = new RoundedBoxGeometry(HEAD_W, HEAD_H, HEAD_D, 1, 0.04);
    const headM = new THREE.Mesh(headGeo, skin);
    headM.castShadow = true;
    headM.receiveShadow = true;
    this.head.add(headM);

    const faceZ = HEAD_D / 2;
    for (const sx of [-1, 1] as const) {
      const eye = new THREE.Group();
      // 整块豆豆眼都露在脸前面，避免倒角头把眼睛吃进去，低分下只剩一条缝
      eye.position.set(sx * 0.072, 0.02, faceZ + 0.016);
      this.head.add(eye);
      block(0.038, 0.065, 0.015, eyeMat, eye, 0, 0, 0);
      this.eyes.push(eye);
      if (!L.earmuffs) block(0.04, 0.07, 0.03, skin, this.head, sx * (HEAD_W / 2 + 0.01), -0.01, 0);
    }
    if (L.eyeBags) {
      const bag = mat(0x2a6270, { roughness: 0.7 });
      for (const sx of [-1, 1] as const) block(0.07, 0.032, 0.02, bag, this.head, sx * 0.072, -0.028, faceZ + 0.02);
    }

    this.addHair(L.hairStyle, hair);
    if (L.glasses) this.addGlasses(L.lens === 'glow', def.id === 'aji' || L.frame === 'thick', faceZ);
    if (L.earmuffs) this.addEarmuffs();
    this.addHeadset(dark, L.shirt);

    const shoulderY = TORSO_H * 0.82;
    const upperLen = 0.16;
    const foreLen = 0.14;
    for (const sx of [-1, 1] as const) {
      const sh = new THREE.Group();
      sh.position.set(sx * (torsoW / 2 + limb * 0.15), shoulderY, 0);
      this.spine.add(sh);
      block(limb * 1.15, upperLen * 0.42, limb * 1.15, shirt, sh, 0, -upperLen * 0.2, 0);
      block(limb, upperLen, limb, skin, sh, 0, -upperLen / 2, 0);
      const el = new THREE.Group();
      el.position.y = -upperLen;
      sh.add(el);
      block(limb * 0.92, foreLen, limb * 0.92, skin, el, 0, -foreLen / 2, 0);
      block(limb * 1.15, 0.05, limb * 0.9, skin, el, 0, -foreLen - 0.01, 0);
      this.arms.push({ sh, el });
    }

    this.phoneScreen = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x6fa8ff, emissiveIntensity: 0.9 });
    this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.1, 0.012), [dark, dark, dark, dark, this.phoneScreen, dark]);
    this.phone.position.set(0, -foreLen - 0.02, 0.04);
    this.phone.rotation.x = -0.35;
    this.phone.visible = false;
    this.phone.castShadow = true;
    this.arms[1].el.add(this.phone);

    this.cup = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.07, 0.045), mat(0xf3e2c7, { roughness: 0.45 }));
    this.cup.position.set(0, -foreLen - 0.01, 0.045);
    this.cup.visible = false;
    this.cup.castShadow = true;
    this.arms[1].el.add(this.cup);

    for (const sx of [-1, 1] as const) {
      const hp = new THREE.Group();
      hp.position.set(sx * 0.07 * g, 0, 0);
      this.hips.add(hp);
      block(limb * 1.25, THIGH_H, limb * 1.25, pants, hp, 0, -THIGH_H / 2, 0);
      const kn = new THREE.Group();
      kn.position.y = -THIGH_H;
      hp.add(kn);
      block(limb * 1.05, SHIN_H, limb * 1.05, skin, kn, 0, -SHIN_H / 2, 0);
      const foot = new THREE.Group();
      foot.position.y = -SHIN_H;
      kn.add(foot);
      if (L.flipflops) {
        const flop = L.shoes ?? L.shirt;
        const soleMat = mat(flop, { roughness: 0.55 });
        block(0.11, 0.022, 0.2, soleMat, foot, 0, 0.012, 0.04);
        block(0.08, 0.035, 0.14, skin, foot, 0, 0.038, 0.03);
        block(0.085, 0.02, 0.04, soleMat, foot, 0, 0.05, 0.07);
      } else {
        const shoeMat = mat(L.shoes ?? 0xe9e9e9, { roughness: 0.5 });
        block(0.12, 0.055, 0.2, shoeMat, foot, 0, 0.04, 0.045);
        block(0.125, 0.022, 0.21, mat(0xf4f4f2, { roughness: 0.6 }), foot, 0, 0.012, 0.045);
      }
      this.legs.push({ hp, kn });
    }

    const hit = (this.hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.46 * g, crown, 0.36),
      new THREE.MeshBasicMaterial({ visible: false }),
    ));
    hit.position.y = (crown * fit) / 2;
    hit.userData.memberId = def.id;
    this.root.add(hit);

    const tag = (this.tagEl = document.createElement('div'));
    tag.className = 'name-tag';
    tag.innerHTML = `<span class="dot" style="background:#${L.shirt.toString(16).padStart(6, '0')}"></span><b>${def.name}</b><i class="st"></i>`;
    tag.dataset.memberId = def.id;
    this.tagStatus = tag.querySelector('.st')!;
    const tagObj = new CSS2DObject(tag);
    tagObj.position.set(0, crown * fit + 0.1, 0);
    this.root.add(tagObj);
    const bubble = (this.bubbleEl = document.createElement('div'));
    bubble.className = 'bubble';
    const bubbleObj = new CSS2DObject(bubble);
    bubbleObj.position.set(0, crown * fit + 0.34, 0);
    this.root.add(bubbleObj);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== hit) {
        o.userData.memberId = def.id;
        o.castShadow = true;
      }
    });
  }

  private addHair(style: MemberDef['look']['hairStyle'], hairMat: THREE.Material) {
    const cap = (w: number, h: number, d: number, y: number, z = -0.01) => block(w, h, d, hairMat, this.head, 0, y, z);
    if (style === 'buzz') {
      cap(0.32, 0.055, 0.3, 0.15);
      return;
    }
    if (style === 'messy') {
      cap(0.36, 0.1, 0.32, 0.16, -0.01);
      const tufts: [number, number, number, number, number][] = [
        [-0.1, 0.22, 0.02, 0.35, 0.2],
        [0.09, 0.24, 0.03, -0.4, -0.15],
        [0.0, 0.25, -0.02, 0.1, 0],
        [-0.13, 0.16, -0.04, 0.55, 0.3],
        [0.13, 0.17, -0.03, -0.5, -0.2],
        [0.02, 0.2, 0.08, 0.15, -0.4],
      ];
      for (const [x, y, z, rz, rx] of tufts) {
        const tuft = block(0.08, 0.14, 0.07, hairMat, this.head, x, y, z);
        tuft.rotation.set(rx, 0, rz);
      }
      return;
    }
    if (style === 'flat') {
      cap(0.33, 0.06, 0.3, 0.16);
      for (const x of [-0.08, 0, 0.08]) {
        const spike = block(0.05, 0.055, 0.11, hairMat, this.head, x, 0.15, 0.12);
        spike.rotation.x = -0.65;
      }
      return;
    }
    if (style === 'bangs') {
      cap(0.33, 0.08, 0.3, 0.15);
      const bang = block(0.22, 0.07, 0.08, hairMat, this.head, 0.05, 0.07, 0.15);
      bang.rotation.set(0.15, 0, -0.28);
      return;
    }
    if (style === 'side') {
      cap(0.34, 0.1, 0.31, 0.15);
      const bang = block(0.26, 0.12, 0.1, hairMat, this.head, -0.04, 0.05, 0.14);
      bang.rotation.z = 0.32;
      return;
    }
    if (style === 'fluffy') {
      cap(0.4, 0.16, 0.36, 0.16);
      block(0.14, 0.12, 0.14, hairMat, this.head, -0.15, 0.08, 0.02);
      block(0.14, 0.12, 0.14, hairMat, this.head, 0.15, 0.08, 0.02);
      return;
    }
    cap(0.32, 0.09, 0.3, 0.15);
  }

  private addGlasses(glow: boolean, thick: boolean, faceZ: number) {
    const bar = thick ? 0.062 : 0.048;
    const frame = mat(0x111114, { roughness: 0.35, metalness: 0.25 });
    const lens = glow
      ? new THREE.MeshStandardMaterial({ color: 0xb8fff8, emissive: 0x5ff0ff, emissiveIntensity: 1.8, roughness: 0.18, metalness: 0.05 })
      : new THREE.MeshStandardMaterial({ color: 0xd5e2f0, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0.1, depthWrite: false });
    const ow = 0.13;
    const oh = 0.1;
    for (const sx of [-1, 1] as const) {
      const x = sx * 0.072;
      block(ow, bar, 0.02, frame, this.head, x, 0.02 + oh / 2 - bar / 2, faceZ + 0.012);
      block(ow, bar, 0.02, frame, this.head, x, 0.02 - oh / 2 + bar / 2, faceZ + 0.012);
      block(bar, oh, 0.02, frame, this.head, x - sx * (ow / 2 - bar / 2), 0.02, faceZ + 0.012);
      block(bar, oh, 0.02, frame, this.head, x + sx * (ow / 2 - bar / 2), 0.02, faceZ + 0.012);
      const glass = block(ow - bar * 1.4, oh - bar * 1.4, 0.012, lens, this.head, x, 0.02, faceZ + 0.02);
      glass.renderOrder = 2;
      block(0.02, bar, 0.12, frame, this.head, sx * (HEAD_W / 2 + 0.004), 0.03, 0.04);
    }
    block(0.05, bar * 0.8, 0.016, frame, this.head, 0, 0.03, faceZ + 0.014);
  }

  private addEarmuffs() {
    const red = mat(0xe23b3b, { roughness: 0.45 });
    block(0.3, 0.04, 0.04, red, this.neck, 0, 0.02, 0);
    for (const sx of [-1, 1] as const) block(0.1, 0.1, 0.08, red, this.neck, sx * 0.16, 0.04, 0.01);
  }

  private addHeadset(dark: THREE.Material, shirt: number) {
    const cupMat = mat(shirt, { roughness: 0.45 });
    block(0.3, 0.035, 0.035, dark, this.headset, 0, HEAD_H * 0.34, 0);
    block(0.035, 0.12, 0.035, dark, this.headset, -0.15, HEAD_H * 0.16, 0);
    block(0.035, 0.12, 0.035, dark, this.headset, 0.15, HEAD_H * 0.16, 0);
    for (const sx of [-1, 1] as const) block(0.09, 0.12, 0.08, cupMat, this.headset, sx * 0.18, 0.0, 0);
    const mic = block(0.016, 0.09, 0.016, dark, this.headset, -0.16, -0.08, 0.06);
    mic.rotation.x = 0.7;
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
