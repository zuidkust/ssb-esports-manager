// 渲染舞台：渲染器、镜头、后期辉光、CSS2D 标签层、点击拾取、画面定格
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 画质档位：桌面高画质；手机中画质；帧率持续过低时自动降到低画质
export function detectQuality() {
  const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const forced = new URLSearchParams(location.search).get('q');
  const tiers = {
    high: { name: 'high', dpr: Math.min(devicePixelRatio, 2), shadows: true, shadowSize: 2048, bloom: true, screenLights: true },
    medium: { name: 'medium', dpr: Math.min(devicePixelRatio, 1.5), shadows: true, shadowSize: 1024, bloom: false, screenLights: true },
    low: { name: 'low', dpr: 1, shadows: false, shadowSize: 512, bloom: false, screenLights: false },
  };
  return tiers[forced] || (mobile ? tiers.medium : tiers.high);
}

export class Stage {
  constructor(container, quality) {
    this.container = container;
    this.quality = quality;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(quality.dpr);
    r.shadowMap.enabled = quality.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.5, 200);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0.6, 0);
    this.controls.minPolarAngle = 0.55;
    this.controls.maxPolarAngle = 1.15;
    this.controls.minAzimuthAngle = Math.PI / 4 - 0.75;
    this.controls.maxAzimuthAngle = Math.PI / 4 + 0.75;
    this.controls.screenSpacePanning = true;
    this.controls.zoomToCursor = true;

    this.composer = null;
    if (quality.bloom) {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.55, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.raycaster = new THREE.Raycaster();
    this.pickables = [];
    this.onPick = null;
    this.snapRequests = [];
    this._bindPick();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.resetView();
  }

  // 默认等距视角：从东南方向斜上方俯视，竖屏时拉远以装下整个房间
  resetView() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const aspect = w / Math.max(1, h);
    const dist = aspect < 0.8 ? 64 / Math.max(aspect, 0.45) * 0.56 : aspect < 1.3 ? 46 : 33;
    const dir = new THREE.Vector3(1, 0.98, 1.12).normalize();
    this.controls.target.set(aspect < 0.8 ? -0.2 : 0.4, 0.4, aspect < 0.8 ? 0.2 : -0.2);
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.controls.minDistance = 14;
    this.controls.maxDistance = Math.max(80, dist * 1.4);
    this.controls.update();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    // 桌面端右侧有事件板：把投影中心向左平移半个面板宽，房间落在可见区域正中
    const side = w > 760 ? (w > 1180 ? 400 : 336) : 0;
    if (side) this.camera.setViewOffset(w, h, side / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  _bindPick() {
    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const rect = el.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(p, this.camera);
      const hits = this.raycaster.intersectObjects(this.pickables, false);
      const hit = hits.find((h) => h.object.parent?.visible !== false && h.object.userData.memberId);
      this.onPick?.(hit ? hit.object.userData.memberId : null);
    });
  }

  // 镜头平滑移向某人
  focusOn(pos) {
    this.focusTarget = pos.clone().setY(0.8);
  }

  // 请求一张缩略定格图（渲染完成后立即读取）
  requestSnapshot(cb) {
    this.snapRequests.push(cb);
  }

  render(dt, night) {
    if (this.focusTarget) {
      const t = this.controls.target;
      const delta = this.focusTarget.clone().sub(t).multiplyScalar(Math.min(1, dt * 3));
      t.add(delta);
      this.camera.position.add(delta);
      if (delta.length() < 0.002) this.focusTarget = null;
    }
    this.controls.update();
    this.renderer.toneMappingExposure = 1.02 + night * 0.25;
    if (this.bloom) {
      this.bloom.strength = 0.22 + night * 0.6;
      this.bloom.threshold = 0.88 - night * 0.25;
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    if (this.snapRequests.length) {
      const src = this.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = Math.round((320 * src.height) / src.width);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.72);
      for (const cb of this.snapRequests.splice(0)) cb(url);
    }
  }
}
