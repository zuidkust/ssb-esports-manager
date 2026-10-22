// 方案 B：低多边形切面手办。身体 / 发型 / 眼镜 / 耳机来自 glTF，运行时按 look 换色、显隐、身高与胖瘦。
// 关节仍是同名空节点，poseTargets 把欧拉角写到 hips/spine/head 与 sh/el/hp/kn。Capsule 拼装已退役。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { Look, MemberDef } from '../data/roster';
import { mat } from './office';
import { girthScale, OFFICE_FIT, SEAT_H } from './figurine';
import bodyUrl from './figurine/body.glb';
import hairMessyUrl from './figurine/hair_messy.glb';
import hairShortUrl from './figurine/hair_short.glb';
import hairSideUrl from './figurine/hair_side.glb';
import hairBuzzUrl from './figurine/hair_buzz.glb';
import glassesUrl from './figurine/glasses.glb';
import headsetUrl from './figurine/headset.glb';

const WALK_SPEED = 1.35;

const HAIR_URL: Record<Look['hairStyle'], string> = {
  messy: hairMessyUrl,
  short: hairShortUrl,
  side: hairSideUrl,
  buzz: hairBuzzUrl,
};

interface Kit {
  body: THREE.Group;
  hair: Record<Look['hairStyle'], THREE.Group>;
  glasses: THREE.Group;
  headset: THREE.Group;
}

let kit: Kit | null = null;
let kitPromise: Promise<void> | null = null;

const loader = new GLTFLoader();

function loadGltf(url: string): Promise<THREE.Group> {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`手办模板加载失败 ${url}`);
    return res.arrayBuffer();
  }).then((buf) => new Promise((resolve, reject) => {
    loader.parse(buf, '', (gltf) => resolve(gltf.scene), (err) => reject(err));
  }));
}

/** 进场景前调用一次。六人、路人、外卖员共用这一套模板。 */
export function loadFigurineKit(): Promise<void> {
  if (kit) return Promise.resolve();
  kitPromise ??= (async () => {
    try {
      const [body, messy, short, side, buzz, glasses, headset] = await Promise.all([
        loadGltf(bodyUrl),
        loadGltf(HAIR_URL.messy),
        loadGltf(HAIR_URL.short),
        loadGltf(HAIR_URL.side),
        loadGltf(HAIR_URL.buzz),
        loadGltf(glassesUrl),
        loadGltf(headsetUrl),
      ]);
      kit = { body, hair: { messy, short, side, buzz }, glasses, headset };
    } catch (err) {
      kitPromise = null;
      throw err;
    }
  })();
  return kitPromise;
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
  sh: THREE.Object3D;
  el: THREE.Object3D;
}

const GIRTH_NODES = [
  'torso', 'pelvis',
  'thighL', 'thighR', 'shinL', 'shinR',
  'upperL', 'upperR', 'foreL', 'foreR', 'handL', 'handR',
  'soleL', 'soleR', 'strapL', 'strapR', 'toesL', 'toesR',
];

function node(root: THREE.Object3D, name: string): THREE.Object3D {
  const found = root.getObjectByName(name);
  if (!found) throw new Error(`手办模板缺少节点 ${name}`);
  return found;
}

function cloneMaterials(root: THREE.Object3D) {
  const map = new Map<THREE.Material, THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = list.map((m) => {
      let copy = map.get(m);
      if (!copy) {
        copy = m.clone();
        map.set(m, copy);
      }
      return copy;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function paint(root: THREE.Object3D, look: Look) {
  const slots: Record<string, number> = {
    matSkin: look.skin,
    matHair: look.hair,
    matShirt: look.shirt,
    matPants: look.pants,
    matShoes: look.shoes ?? 0x2f7fd1,
    matBadge: 0xffffff,
    matGlasses: 0x111114,
    matHeadsetBand: 0x1b1b1f,
    matHeadsetCup: look.shirt,
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) {
      const std = m as THREE.MeshStandardMaterial;
      const color = slots[std.name];
      if (color != null && std.color) std.color.setHex(color);
    }
  });
}

export class Character {
  id: string;
  root = new THREE.Group();
  body = new THREE.Group();
  hips: THREE.Object3D;
  spine: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  headset: THREE.Object3D;
  arms: Limb[] = [];
  legs: { hp: THREE.Object3D; kn: THREE.Object3D }[] = [];
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
  private s: number;
  private fit: number;
  private legLen: number;
  private t = Math.random() * 10;
  private phase = Math.random() * 10;
  private cur: Pose | null = null;
  private lastSlam = 0;
  private blinkAt = 2 + Math.random() * 3;
  private eyes: THREE.Object3D[] = [];

  constructor(public def: MemberDef) {
    if (!kit) throw new Error('先调用 loadFigurineKit()');
    this.id = def.id;
    const L = def.look;
    this.s = L.height;
    this.fit = L.height * OFFICE_FIT;
    this.root.userData.memberId = def.id;
    this.root.scale.setScalar(this.fit);
    this.root.add(this.body);

    const model = kit.body.clone(true);
    cloneMaterials(model);
    paint(model, L);
    this.body.add(model);

    const g = girthScale(L.girth);
    for (const name of GIRTH_NODES) {
      const part = model.getObjectByName(name);
      if (part) part.scale.set(g, 1, g);
    }
    for (const name of ['armL_sh', 'armR_sh', 'legL_hp', 'legR_hp']) {
      node(model, name).position.x *= g;
    }

    this.hips = node(model, 'hips');
    this.spine = node(model, 'spine');
    this.neck = node(model, 'neck');
    this.head = node(model, 'head');
    this.legLen = this.hips.position.y;
    this.arms = [
      { sh: node(model, 'armR_sh'), el: node(model, 'armR_el') },
      { sh: node(model, 'armL_sh'), el: node(model, 'armL_el') },
    ];
    this.legs = [
      { hp: node(model, 'legR_hp'), kn: node(model, 'legR_kn') },
      { hp: node(model, 'legL_hp'), kn: node(model, 'legL_kn') },
    ];
    this.eyes = [node(model, 'eyeL'), node(model, 'eyeR')];

    const hair = kit.hair[L.hairStyle].clone(true);
    cloneMaterials(hair);
    paint(hair, L);
    node(model, 'socket_hair').add(hair);

    if (L.glasses) {
      const glasses = kit.glasses.clone(true);
      cloneMaterials(glasses);
      paint(glasses, L);
      node(model, 'socket_glasses').add(glasses);
    }

    const headset = kit.headset.clone(true);
    cloneMaterials(headset);
    paint(headset, L);
    headset.visible = false;
    node(model, 'socket_headset').add(headset);
    this.headset = headset;

    const dark = mat(0x1b1b1f, { roughness: 0.45 });
    this.phoneScreen = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x6fa8ff, emissiveIntensity: 0.9 });
    this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.08, 0.008), [dark, dark, dark, dark, this.phoneScreen, dark]);
    this.phone.position.set(0, -0.05, 0.03);
    this.phone.rotation.x = -0.3;
    this.phone.visible = false;
    node(model, 'handL').add(this.phone);

    this.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.055, 8), mat(0xf3e2c7));
    this.cup.position.set(0, -0.02, 0.03);
    this.cup.visible = false;
    node(model, 'handL').add(this.cup);

    const hit = (this.hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 1.05, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    ));
    hit.position.y = 0.52;
    hit.userData.memberId = def.id;
    this.root.add(hit);

    const tag = (this.tagEl = document.createElement('div'));
    tag.className = 'name-tag';
    tag.innerHTML = `<span class="dot" style="background:#${L.shirt.toString(16).padStart(6, '0')}"></span><b>${def.name}</b><i class="st"></i>`;
    tag.dataset.memberId = def.id;
    this.tagStatus = tag.querySelector('.st')!;
    const tagObj = new CSS2DObject(tag);
    tagObj.position.set(0, 1.12, 0);
    this.root.add(tagObj);
    const bubble = (this.bubbleEl = document.createElement('div'));
    bubble.className = 'bubble';
    const bubbleObj = new CSS2DObject(bubble);
    bubbleObj.position.set(0, 1.38, 0);
    this.root.add(bubbleObj);

    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && o !== hit) {
        mesh.userData.memberId = def.id;
        mesh.castShadow = true;
      }
    });
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
      // SEAT_H 是世界高度。root 带了身高缩放，关节局部 y 要除掉 fit，坐下才落在椅面上。
      P.hipsY = SEAT_H / this.fit;
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
        P.hipsY = this.legLen - 0.03 / OFFICE_FIT;
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
    this.hips.position.y = c.hipsY + c.bodyY / OFFICE_FIT;
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
    if (this.poseName === 'lie') this.body.position.set(0, 0.62 / this.fit, (0.85 * this.s) / this.fit);
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
