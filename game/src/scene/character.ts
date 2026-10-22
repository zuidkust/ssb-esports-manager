// 低多边形人物：基础几何体拼装，关节为空 Group，姿态用关节角度插值实现
// 外形按设计文档区分：眼镜、胖瘦、高矮、阿鸡的人字拖；头部比真人略大，远看也能认出是谁
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { MemberDef } from '../data/roster';
import { mat } from './office';

const SEAT_H = 0.5;
const WALK_SPEED = 1.35;
const HEAD_R = 0.15;

function capsule(r: number, len: number, material: THREE.Material, seg = 14) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, seg), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function sphere(r: number, material: THREE.Material, w = 18, h = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), material);
  m.castShadow = true;
  return m;
}

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
  private eyes: THREE.Group[] = [];

  constructor(public def: MemberDef) {
    this.id = def.id;
    const L = def.look;
    const s = (this.s = L.height), g = L.girth;
    this.legLen = 0.84 * s;
    this.root.userData.memberId = def.id;
    this.root.add(this.body);

    const shirt = mat(L.shirt, { roughness: 0.85 });
    const shirtDark = mat(new THREE.Color(L.shirt).multiplyScalar(0.72).getHex(), { roughness: 0.85 });
    const pants = mat(L.pants, { roughness: 0.85 });
    const skin = mat(L.skin, { roughness: 0.62 });
    const hair = mat(L.hair, { roughness: 0.8 });
    const dark = mat(0x1b1b1f, { roughness: 0.45 });
    const white = mat(0xffffff, { roughness: 0.3 });

    // 骨盆 + 皮带
    this.hips.position.y = this.legLen;
    this.body.add(this.hips);
    const pelvis = capsule(0.14 * g, 0.12 * g, pants);
    pelvis.rotation.z = Math.PI / 2;
    pelvis.scale.set(1, 1, 0.85);
    this.hips.add(pelvis);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.155 * g, 0.155 * g, 0.035, 20), mat(0x2a2420, { roughness: 0.5 }));
    belt.scale.set(1, 1, 0.86);
    belt.position.y = 0.06;
    this.hips.add(belt);

    // 躯干：车削出肩宽腰窄的轮廓
    this.spine.position.y = 0.04;
    this.hips.add(this.spine);
    const torsoLen = 0.3 * s;
    const R = 0.17 * g;
    const torsoProfile = [
      [0, 0], [R * 0.92, 0], [R * 0.98, torsoLen * 0.25], [R * (g > 1.12 ? 1.08 : 0.94), torsoLen * 0.55], [R * 1.04, torsoLen * 0.88],
      [R * 0.92, torsoLen + 0.1], [R * 0.55, torsoLen + 0.16], [0.06, torsoLen + 0.19], [0, torsoLen + 0.19],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 24), shirt);
    torso.position.y = 0.03;
    torso.scale.set(1, 1, 0.8);
    torso.castShadow = true;
    this.spine.add(torso);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(R * 0.93, 0.014, 6, 24), shirtDark);
    hem.rotation.x = Math.PI / 2;
    hem.scale.set(1, 0.8, 1);
    hem.position.y = 0.04;
    this.spine.add(hem);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.016, 6, 18), shirtDark);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = torsoLen + 0.2;
    this.spine.add(collar);
    // 胸前队徽
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.032, 16), mat(0xe9c46a, { roughness: 0.4, metalness: 0.4 }));
    badge.position.set(R * 0.45, torsoLen * 0.78, R * 0.83);
    badge.rotation.y = 0.35;
    this.spine.add(badge);
    if (g > 1.12) {
      const belly = sphere(0.16 * g, shirt);
      belly.position.set(0, 0.17, 0.05 * g);
      belly.scale.set(1, 0.95, 0.82);
      this.spine.add(belly);
    }
    const shoulderY = torsoLen + 0.16;

    // 头
    this.neck.position.y = torsoLen + 0.22;
    this.spine.add(this.neck);
    const neckM = capsule(0.048, 0.04, skin, 10);
    neckM.position.y = 0.0;
    this.neck.add(neckM);
    this.head.position.y = 0.17;
    this.neck.add(this.head);
    const headW = 0.95 + (g - 1) * 0.22;
    const headM = sphere(HEAD_R, skin, 28, 20);
    headM.scale.set(headW, 1.04, 0.98);
    this.head.add(headM);
    const jaw = sphere(HEAD_R * 0.8, skin, 20, 12);
    jaw.position.set(0, -0.045, 0.012);
    jaw.scale.set(headW * 1.05, 0.8, 1);
    this.head.add(jaw);
    const fz = HEAD_R * 0.93; // 脸部表面
    for (const sx of [-1, 1]) {
      const ear = sphere(0.032, skin, 10, 8);
      ear.scale.set(0.6, 1, 0.9);
      ear.position.set(sx * HEAD_R * headW * 0.98, -0.005, -0.005);
      this.head.add(ear);
      // 眼睛：眼白 + 瞳孔 + 高光（眨眼时整组压扁）
      const eye = new THREE.Group();
      eye.position.set(sx * 0.052, 0.012, fz - 0.012);
      this.head.add(eye);
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10), white);
      sclera.scale.set(1, 1.1, 0.5);
      eye.add(sclera);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.015, 12, 8), dark);
      pupil.position.set(0, -0.002, 0.009);
      pupil.scale.set(1, 1.15, 0.5);
      eye.add(pupil);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 6, 4), white);
      glint.position.set(sx * -0.004 + 0.004, 0.006, 0.016);
      eye.add(glint);
      this.eyes.push(eye);
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.034, 2, 6), hair);
      brow.rotation.z = Math.PI / 2 + sx * 0.12;
      brow.position.set(sx * 0.052, 0.058, fz - 0.002);
      this.head.add(brow);
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), new THREE.MeshStandardMaterial({ color: 0xf08a7a, transparent: true, opacity: 0.35, roughness: 1 }));
      blush.position.set(sx * 0.082, -0.03, fz - 0.026);
      blush.rotation.y = sx * 0.55;
      this.head.add(blush);
    }
    const nose = sphere(0.017, skin, 8, 6);
    nose.scale.set(1, 0.9, 1.1);
    nose.position.set(0, -0.012, fz + 0.004);
    this.head.add(nose);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0045, 4, 12, Math.PI), mat(0x7a3b30, { roughness: 0.6 }));
    mouth.rotation.z = Math.PI;
    mouth.position.set(0, -0.045, fz - 0.008);
    this.head.add(mouth);

    // 发型：主发盖 + 后脑 + 各自的刘海
    const capPhi = L.hairStyle === 'buzz' ? 0.42 : 0.52;
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R * 1.06, 28, 14, 0, Math.PI * 2, 0, Math.PI * capPhi), hair);
    hairCap.scale.set(headW, 1.04, 1.0);
    hairCap.position.set(0, 0.01, -0.006);
    hairCap.rotation.x = -0.28;
    hairCap.castShadow = true;
    this.head.add(hairCap);
    if (L.hairStyle !== 'buzz') {
      const back = sphere(HEAD_R * 1.0, hair, 20, 12);
      back.scale.set(headW * 1.02, 0.82, 0.8);
      back.position.set(0, 0.01, -0.045);
      this.head.add(back);
    }
    if (L.hairStyle === 'messy') {
      for (let i = 0; i < 9; i++) {
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.1, 5), hair);
        const a = (i / 9) * Math.PI * 2;
        tuft.position.set(Math.cos(a) * 0.08, 0.13, Math.sin(a) * 0.08 - 0.02);
        tuft.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
        tuft.castShadow = true;
        this.head.add(tuft);
      }
    } else if (L.hairStyle === 'side') {
      const fringe = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 10), hair);
      fringe.rotation.z = Math.PI / 2 - 0.3;
      fringe.position.set(0.02, 0.105, 0.1);
      fringe.scale.set(1, 1, 0.7);
      this.head.add(fringe);
    } else if (L.hairStyle === 'short') {
      const fringe = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.15, 4, 10), hair);
      fringe.rotation.z = Math.PI / 2;
      fringe.position.set(0, 0.11, 0.098);
      fringe.scale.set(1, 1, 0.6);
      this.head.add(fringe);
    }
    // 眼镜
    if (L.glasses) {
      const frameMat = mat(0x111114, { roughness: 0.3, metalness: 0.4 });
      const lens = new THREE.MeshStandardMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.2 });
      for (const sx of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0065, 6, 18), frameMat);
        ring.position.set(sx * 0.052, 0.012, fz + 0.012);
        this.head.add(ring);
        const glass = new THREE.Mesh(new THREE.CircleGeometry(0.032, 16), lens);
        glass.position.set(sx * 0.052, 0.012, fz + 0.012);
        this.head.add(glass);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.13), frameMat);
        arm.position.set(sx * HEAD_R * headW * 0.92, 0.018, 0.06);
        this.head.add(arm);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), frameMat);
      bridge.position.set(0, 0.018, fz + 0.016);
      this.head.add(bridge);
    }
    // 耳机（打游戏时戴）
    const band = new THREE.Mesh(new THREE.TorusGeometry(HEAD_R * headW + 0.018, 0.014, 6, 20, Math.PI), dark);
    band.position.y = 0.02;
    this.headset.add(band);
    for (const sx of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.045, 16), mat(L.shirt, { roughness: 0.45 }));
      cup.rotation.z = Math.PI / 2;
      cup.position.set(sx * (HEAD_R * headW + 0.018), 0.0, 0);
      this.headset.add(cup);
    }
    const mic = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.09, 2, 6), dark);
    mic.position.set(-0.13, -0.05, 0.07);
    mic.rotation.set(0.9, 0, 0.3);
    this.headset.add(mic);
    this.headset.visible = false;
    this.head.add(this.headset);

    // 手臂：肩 → 肘；短袖露出小臂
    const armR = 0.05 * Math.sqrt(g);
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(sx * (0.17 * g + 0.035), shoulderY, 0);
      this.spine.add(sh);
      const sleeve = capsule(armR + 0.012, 0.11 * s, shirt, 12);
      sleeve.position.y = -0.07 * s;
      sh.add(sleeve);
      const upper = capsule(armR - 0.002, 0.2 * s, skin, 10);
      upper.position.y = -0.14 * s;
      sh.add(upper);
      const el = new THREE.Group();
      el.position.y = -0.27 * s;
      sh.add(el);
      const fore = capsule(armR - 0.008, 0.18 * s, skin, 10);
      fore.position.y = -0.11 * s;
      el.add(fore);
      const hand = sphere(0.045, skin, 12, 8);
      hand.scale.set(0.85, 1.15, 0.7);
      hand.position.y = -0.245 * s;
      el.add(hand);
      const thumb = capsule(0.013, 0.025, skin, 6);
      thumb.position.set(-sx * 0.03, -0.23 * s, 0.02);
      thumb.rotation.z = sx * 0.6;
      el.add(thumb);
      this.arms.push({ sh, el });
    }
    // 手机（摸鱼时拿在右手，屏幕颜色随 App 变）
    this.phoneScreen = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x6fa8ff, emissiveIntensity: 0.9 });
    this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.14, 0.012), [dark, dark, dark, dark, this.phoneScreen, dark]);
    this.phone.position.set(0, -0.28 * s, 0.035);
    this.phone.rotation.x = -0.3;
    this.phone.visible = false;
    this.arms[1].el.add(this.phone);
    // 杯子（喝水 / 饮料）
    this.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.12, 14), mat(0xf3e2c7));
    this.cup.position.set(0, -0.28 * s, 0.045);
    this.cup.visible = false;
    this.arms[1].el.add(this.cup);

    // 腿：髋 → 膝
    for (const sx of [-1, 1]) {
      const hp = new THREE.Group();
      hp.position.set(sx * 0.085 * g, 0, 0);
      this.hips.add(hp);
      const thigh = capsule(0.074 * Math.sqrt(g), 0.3 * s, pants, 12);
      thigh.position.y = -0.21 * s;
      hp.add(thigh);
      const kn = new THREE.Group();
      kn.position.y = -0.42 * s;
      hp.add(kn);
      const shin = capsule(0.06 * Math.sqrt(g), 0.28 * s, pants, 12);
      shin.position.y = -0.19 * s;
      kn.add(shin);
      const foot = new THREE.Group();
      foot.position.y = -0.42 * s;
      kn.add(foot);
      if (L.flipflops) {
        // 人字拖：薄底 + 露出的脚
        const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.15, 4, 10), mat(0x2f7fd1, { roughness: 0.6 }));
        sole.rotation.x = Math.PI / 2;
        sole.scale.set(1, 1, 0.2);
        sole.position.set(0, -0.008, 0.05);
        foot.add(sole);
        const bare = capsule(0.042, 0.13, skin, 10);
        bare.rotation.x = Math.PI / 2;
        bare.scale.set(1, 1, 0.65);
        bare.position.set(0, 0.022, 0.05);
        foot.add(bare);
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 12, Math.PI), mat(0x2f7fd1));
        strap.position.set(0, 0.04, 0.08);
        strap.rotation.x = -Math.PI / 2;
        foot.add(strap);
      } else {
        // 圆头运动鞋 + 白色鞋底
        const shoe = capsule(0.056, 0.14, mat(L.shoes ?? 0xe9e9e9, { roughness: 0.6 }), 12);
        shoe.rotation.x = Math.PI / 2;
        shoe.scale.set(1, 1, 0.68);
        shoe.position.set(0, 0.03, 0.045);
        foot.add(shoe);
        const sole = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.14, 4, 12), mat(0xf4f4f2, { roughness: 0.7 }));
        sole.rotation.x = Math.PI / 2;
        sole.scale.set(1, 1, 0.2);
        sole.position.set(0, -0.004, 0.045);
        foot.add(sole);
      }
      this.legs.push({ hp, kn });
    }

    // 碰撞体（点击用）
    const hit = (this.hit = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * g, 0.32 * g, 1.85 * s, 8), new THREE.MeshBasicMaterial({ visible: false })));
    hit.position.y = 0.92 * s;
    hit.userData.memberId = def.id;
    this.root.add(hit);

    // 头顶昵称与气泡（CSS2D）
    const tag = (this.tagEl = document.createElement('div'));
    tag.className = 'name-tag';
    tag.innerHTML = `<span class="dot" style="background:#${L.shirt.toString(16).padStart(6, '0')}"></span><b>${def.name}</b><i class="st"></i>`;
    tag.dataset.memberId = def.id;
    this.tagStatus = tag.querySelector('.st')!;
    const tagObj = new CSS2DObject(tag);
    tagObj.position.set(0, 2.1 * s + 0.14, 0);
    this.root.add(tagObj);
    const bubble = (this.bubbleEl = document.createElement('div'));
    bubble.className = 'bubble';
    const bubbleObj = new CSS2DObject(bubble);
    bubbleObj.position.set(0, 2.1 * s + 0.52, 0);
    this.root.add(bubbleObj);

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o !== hit) {
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
    else if (this.blinkAt < 0.12) open = 0.15;
    if (this.blinkAt < 0) this.blinkAt = 2.5 + Math.random() * 3.5;
    for (const e of this.eyes) e.scale.y = open;

    if (this.bubbleUntil && nowMs > this.bubbleUntil) {
      this.bubbleEl.classList.remove('show');
      this.bubbleUntil = 0;
    }
  }
}
