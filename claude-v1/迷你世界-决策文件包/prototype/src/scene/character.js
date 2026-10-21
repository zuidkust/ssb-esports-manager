// 低多边形人物：用基础几何体拼装，关节为空 Group，姿态用关节角度插值实现
// 外形按设计文档区分：眼镜、胖瘦、高矮、施颠的人字拖
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mat } from './office.js';

const SEAT_H = 0.5;
const WALK_SPEED = 1.35;

function capsule(r, len, material, seg = 10) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, seg), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function sphere(r, material, w = 14, h = 10) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), material);
  m.castShadow = true;
  return m;
}

const lerp = (a, b, t) => a + (b - a) * t;

export class Character {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    const L = def.look;
    const s = L.height, g = L.girth;
    this.s = s;
    this.g = g;
    this.legLen = 0.84 * s;
    this.root = new THREE.Group();
    this.root.userData.memberId = def.id;
    this.body = new THREE.Group();
    this.root.add(this.body);

    const shirt = mat(L.shirt, { roughness: 0.85 });
    const pants = mat(L.pants, { roughness: 0.85 });
    const skin = mat(L.skin, { roughness: 0.7 });
    const hair = mat(L.hair, { roughness: 0.9 });
    const dark = mat(0x1b1b1f, { roughness: 0.5 });

    // 骨盆
    this.hips = new THREE.Group();
    this.hips.position.y = this.legLen;
    this.body.add(this.hips);
    const pelvis = capsule(0.14 * g, 0.12 * g, pants);
    pelvis.rotation.z = Math.PI / 2;
    pelvis.scale.set(1, 1, 0.85);
    this.hips.add(pelvis);

    // 躯干
    this.spine = new THREE.Group();
    this.spine.position.y = 0.04;
    this.hips.add(this.spine);
    const torsoLen = 0.3 * s;
    const torso = capsule(0.165 * g, torsoLen, shirt, 12);
    torso.position.y = torsoLen / 2 + 0.12;
    torso.scale.set(1, 1, 0.78);
    this.spine.add(torso);
    if (g > 1.12) {
      const belly = sphere(0.16 * g, shirt);
      belly.position.set(0, 0.17, 0.06 * g);
      belly.scale.set(1, 0.95, 0.8);
      this.spine.add(belly);
    }
    const shoulderY = torsoLen + 0.2;

    // 头
    this.neck = new THREE.Group();
    this.neck.position.y = shoulderY + 0.06;
    this.spine.add(this.neck);
    const neckM = capsule(0.05, 0.05, skin, 8);
    neckM.position.y = 0.02;
    this.neck.add(neckM);
    this.head = new THREE.Group();
    this.head.position.y = 0.16;
    this.neck.add(this.head);
    const headM = sphere(0.135, skin, 16, 12);
    headM.scale.set(0.95 + (g - 1) * 0.25, 1.05, 1);
    this.head.add(headM);
    for (const sx of [-1, 1]) {
      const ear = sphere(0.03, skin, 6, 5);
      ear.position.set(sx * 0.13 * (0.95 + (g - 1) * 0.25), 0, 0);
      this.head.add(ear);
      const eye = sphere(0.017, dark, 6, 5);
      eye.position.set(sx * 0.047, 0.015, 0.125);
      this.head.add(eye);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.01, 0.01), hair);
      brow.position.set(sx * 0.048, 0.055, 0.128);
      this.head.add(brow);
    }
    const nose = sphere(0.018, skin, 6, 5);
    nose.position.set(0, -0.015, 0.135);
    this.head.add(nose);
    // 发型
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.142, 16, 10, 0, Math.PI * 2, 0, Math.PI * (L.hairStyle === 'buzz' ? 0.42 : 0.5)), hair);
    hairM.scale.copy(headM.scale);
    hairM.position.y = 0.012;
    hairM.rotation.x = -0.22;
    hairM.castShadow = true;
    this.head.add(hairM);
    if (L.hairStyle === 'messy') {
      for (let i = 0; i < 7; i++) {
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 4), hair);
        const a = (i / 7) * Math.PI * 2;
        tuft.position.set(Math.cos(a) * 0.08, 0.12, Math.sin(a) * 0.08 - 0.02);
        tuft.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        this.head.add(tuft);
      }
    } else if (L.hairStyle === 'side') {
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.08), hair);
      fringe.position.set(0.03, 0.1, 0.09);
      fringe.rotation.z = -0.25;
      this.head.add(fringe);
    }
    // 眼镜
    if (L.glasses) {
      const frameMat = mat(0x111114, { roughness: 0.3, metalness: 0.3 });
      for (const sx of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.007, 6, 14), frameMat);
        ring.position.set(sx * 0.048, 0.015, 0.137);
        this.head.add(ring);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.13), frameMat);
        arm.position.set(sx * 0.12, 0.02, 0.075);
        this.head.add(arm);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), frameMat);
      bridge.position.set(0, 0.022, 0.14);
      this.head.add(bridge);
    }
    // 耳机（打游戏时戴）
    this.headset = new THREE.Group();
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 6, 18, Math.PI), dark);
    band.position.y = 0.02;
    this.headset.add(band);
    for (const sx of [-1, 1]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), mat(L.shirt, { roughness: 0.5 }));
      cup.rotation.z = Math.PI / 2;
      cup.position.set(sx * 0.15, 0.0, 0);
      this.headset.add(cup);
    }
    this.headset.visible = false;
    this.head.add(this.headset);

    // 手臂：肩 → 肘
    const armR = 0.05 * Math.sqrt(g);
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(sx * (0.17 * g + 0.04), shoulderY, 0);
      this.spine.add(sh);
      const upper = capsule(armR + 0.006, 0.2 * s, shirt, 8);
      upper.position.y = -0.13 * s;
      sh.add(upper);
      const el = new THREE.Group();
      el.position.y = -0.27 * s;
      sh.add(el);
      const fore = capsule(armR - 0.006, 0.18 * s, skin, 8);
      fore.position.y = -0.11 * s;
      el.add(fore);
      const hand = sphere(0.045, skin, 8, 6);
      hand.position.y = -0.24 * s;
      el.add(hand);
      this.arms.push({ sh, el, hand, side: sx });
    }
    // 手机（摸鱼时拿在右手）
    this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.012), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x6fa8ff, emissiveIntensity: 0.6 }));
    this.phone.position.set(0, -0.27 * s, 0.03);
    this.phone.rotation.x = -0.3;
    this.phone.visible = false;
    this.arms[1].el.add(this.phone);
    // 杯子（喝水/奶茶）
    this.cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.12, 10), mat(0xf3e2c7));
    this.cup.position.set(0, -0.27 * s, 0.04);
    this.cup.visible = false;
    this.arms[1].el.add(this.cup);

    // 腿：髋 → 膝
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hp = new THREE.Group();
      hp.position.set(sx * 0.085 * g, 0, 0);
      this.hips.add(hp);
      const thigh = capsule(0.072 * Math.sqrt(g), 0.3 * s, pants, 8);
      thigh.position.y = -0.21 * s;
      hp.add(thigh);
      const kn = new THREE.Group();
      kn.position.y = -0.42 * s;
      hp.add(kn);
      const shin = capsule(0.058 * Math.sqrt(g), 0.28 * s, pants, 8);
      shin.position.y = -0.19 * s;
      kn.add(shin);
      const foot = new THREE.Group();
      foot.position.y = -0.42 * s;
      kn.add(foot);
      if (L.flipflops) {
        // 人字拖：薄底 + 露出的脚
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.26), mat(0x2f7fd1));
        sole.position.set(0, -0.005, 0.05);
        foot.add(sole);
        const bare = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.22), skin);
        bare.position.set(0, 0.03, 0.05);
        bare.castShadow = true;
        foot.add(bare);
        const strap = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 10, Math.PI), mat(0x2f7fd1));
        strap.position.set(0, 0.04, 0.08);
        strap.rotation.x = -Math.PI / 2;
        foot.add(strap);
      } else {
        const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), mat(sx < 0 ? 0xe9e9e9 : 0xe9e9e9));
        shoe.position.set(0, 0.025, 0.045);
        shoe.castShadow = true;
        foot.add(shoe);
        const sole = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.02, 0.25), dark);
        sole.position.set(0, -0.005, 0.045);
        foot.add(sole);
      }
      this.legs.push({ hp, kn, side: sx });
    }

    // 碰撞体（点击用）
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * g, 0.3 * g, 1.8 * s, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.9 * s;
    hit.userData.memberId = def.id;
    this.root.add(hit);
    this.hit = hit;

    // 头顶昵称与气泡（CSS2D）
    const tag = document.createElement('div');
    tag.className = 'name-tag';
    tag.innerHTML = `<span class="dot" style="background:#${L.shirt.toString(16).padStart(6, '0')}"></span><b>${def.name}</b><i class="st"></i>`;
    tag.dataset.memberId = def.id;
    this.tagEl = tag;
    this.tagStatus = tag.querySelector('.st');
    this.tag = new CSS2DObject(tag);
    this.tag.position.set(0, 2.05 * s + 0.12, 0);
    this.root.add(this.tag);
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    this.bubbleEl = bubble;
    this.bubble = new CSS2DObject(bubble);
    this.bubble.position.set(0, 2.05 * s + 0.5, 0);
    this.root.add(this.bubble);
    this.bubbleUntil = 0;

    // 运动状态
    this.pos = new THREE.Vector3();
    this.facing = 0;
    this.targetFacing = 0;
    this.path = [];
    this.poseName = 'stand';
    this.arrivePose = 'stand';
    this.arriveFacing = null;
    this.t = Math.random() * 10;
    this.phase = Math.random() * 10;
    this.cur = null; // 当前关节角（插值用）
    this.hidden = false;
    this.onArrive = null;
    this.onSlam = null;
    this.lastSlam = 0;
    this.root.traverse((o) => {
      if (o.isMesh && o !== hit) o.userData.memberId = def.id;
    });
  }

  // ── 指令 ──
  teleport(p, facing, pose) {
    this.pos.copy(p);
    this.facing = this.targetFacing = facing;
    this.path = [];
    this.poseName = pose;
    this.cur = null;
  }

  walkTo(points, finalPose, finalFacing, onArrive) {
    this.path = points.map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.arrivePose = finalPose;
    this.arriveFacing = finalFacing;
    this.onArrive = onArrive || null;
    if (this.path.length) this.poseName = 'walk';
    else this.setPose(finalPose, finalFacing);
  }

  setPose(name, facing) {
    this.poseName = name;
    if (facing != null) this.targetFacing = facing;
  }

  setHidden(h) {
    this.hidden = h;
    this.root.visible = !h;
    this.tagEl.style.display = h ? 'none' : '';
    if (h) this.bubbleEl.classList.remove('show');
  }

  say(text, ms = 4200, kind = '') {
    if (this.hidden) return;
    this.bubbleEl.textContent = text;
    this.bubbleEl.className = `bubble show ${kind}`;
    this.bubbleUntil = performance.now() + ms;
  }

  setStatusIcon(icon) {
    if (this.tagStatus.textContent !== icon) this.tagStatus.textContent = icon;
  }

  // ── 姿态表：返回各关节目标角 ──
  poseTargets(name, t) {
    const P = {
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
        P.sh = [[Math.sin(t * 0.9) * 0.04, 0.1], [-Math.sin(t * 0.9) * 0.04, -0.1]];
        break;
      case 'walk': {
        const w = t * 7.5;
        P.hp = [Math.sin(w) * 0.5, -Math.sin(w) * 0.5];
        P.kn = [Math.max(0, -Math.sin(w)) * 0.75, Math.max(0, Math.sin(w)) * 0.75];
        P.sh = [[-Math.sin(w) * 0.45, 0.1], [Math.sin(w) * 0.45, -0.1]];
        P.el = [-0.3, -0.3];
        P.bodyY = Math.abs(Math.sin(w)) * 0.035;
        P.spineRX = 0.05;
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
        const a = lerp(-0.95, -2.7, up);
        P.sh = [[a, 0.15], [lerp(-0.95, -2.5, ph < 0.65 ? up * 0.8 : up), -0.15]];
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

  update(dt, now) {
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
    const c = (this.cur ||= JSON.parse(JSON.stringify(P)));
    for (const key of ['hipsY', 'bodyRX', 'bodyY', 'spineRX', 'spineRY', 'spineRZ', 'headRX', 'headRY', 'headRZ']) c[key] = lerp(c[key], P[key], k);
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
    // 躺下时整体抬高到沙发坐垫上
    // 躺姿：整个身体绕脚底转 -90°（脸朝上、头朝 -z），再抬到沙发坐垫高度并居中
    if (this.poseName === 'lie') this.body.position.set(0, 0.62, 0.85 * this.s);
    else this.body.position.set(0, 0, 0);

    if (this.bubbleUntil && now > this.bubbleUntil) {
      this.bubbleEl.classList.remove('show');
      this.bubbleUntil = 0;
    }
  }
}
