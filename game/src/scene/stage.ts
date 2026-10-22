// 渲染舞台：渲染器、镜头、后期辉光、CSS2D 标签层、点击拾取
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export interface Quality {
  name: 'high' | 'medium' | 'low';
  dpr: number;
  shadows: boolean;
  shadowSize: number;
  bloom: boolean;
  screenLights: boolean;
}

// 画质档位：桌面高画质；小屏中画质；帧率持续过低时自动降到低画质
export function detectQuality(forced?: string | null): Quality {
  const small = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const tiers: Record<Quality['name'], Quality> = {
    high: { name: 'high', dpr: Math.min(devicePixelRatio, 2), shadows: true, shadowSize: 2048, bloom: true, screenLights: true },
    medium: { name: 'medium', dpr: Math.min(devicePixelRatio, 1.5), shadows: true, shadowSize: 1024, bloom: false, screenLights: true },
    low: { name: 'low', dpr: 1, shadows: false, shadowSize: 512, bloom: false, screenLights: false },
  };
  return tiers[forced as Quality['name']] || (small ? tiers.medium : tiers.high);
}

export class Stage {
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(26, 1, 0.5, 200);
  controls: OrbitControls;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  pickables: THREE.Object3D[] = [];
  onPick: ((id: string | null) => void) | null = null;
  focusTarget: THREE.Vector3 | null = null;
  sidePanel = 0; // 右侧面板宽度：投影中心左移半个面板，让房间落在可见区域正中
  private raycaster = new THREE.Raycaster();

  constructor(private container: HTMLElement, public quality: Quality) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }));
    r.setPixelRatio(quality.dpr);
    r.shadowMap.enabled = quality.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);

    // 环境光照：给木头、金属、屏幕一点柔和的反射，比纯色补光更有层次
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    container.appendChild(this.labels.domElement);

    const c = (this.controls = new OrbitControls(this.camera, r.domElement));
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minPolarAngle = 0.55;
    c.maxPolarAngle = 1.15;
    c.minAzimuthAngle = Math.PI / 4 - 0.75;
    c.maxAzimuthAngle = Math.PI / 4 + 0.75;
    c.screenSpacePanning = true;
    c.zoomToCursor = true;

    if (quality.bloom) {
      this.composer = new EffectComposer(r);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.55, 0.82);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.bindPick();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.resetView();
  }

  // 默认等距视角：从东南方向斜上方俯视，竖屏时拉远以装下整个房间
  resetView() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const aspect = w / Math.max(1, h);
    const dist = aspect < 0.8 ? (64 / Math.max(aspect, 0.45)) * 0.56 : aspect < 1.3 ? 46 : 33;
    const dir = new THREE.Vector3(1, 0.98, 1.12).normalize();
    this.controls.target.set(aspect < 0.8 ? -0.2 : 0.4, 0.4, aspect < 0.8 ? 0.2 : -0.2);
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.controls.minDistance = 12;
    this.controls.maxDistance = Math.max(80, dist * 1.4);
    this.controls.update();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    const side = w > 760 ? this.sidePanel : 0;
    if (side) this.camera.setViewOffset(w, h, side / 2, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  degrade() {
    this.composer = null;
    this.bloom = null;
    this.renderer.setPixelRatio(1);
    this.resize();
  }

  private bindPick() {
    const el = this.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    el.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      const rect = el.getBoundingClientRect();
      const p = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(p, this.camera);
      const hits = this.raycaster.intersectObjects(this.pickables, false);
      const hit = hits.find((h) => h.object.parent?.visible !== false && h.object.userData.memberId);
      this.onPick?.(hit ? (hit.object.userData.memberId as string) : null);
    });
  }

  focusOn(pos: THREE.Vector3) {
    this.focusTarget = pos.clone().setY(0.8);
  }

  render(dt: number, night: number) {
    if (this.focusTarget) {
      const t = this.controls.target;
      const delta = this.focusTarget.clone().sub(t).multiplyScalar(Math.min(1, dt * 3));
      t.add(delta);
      this.camera.position.add(delta);
      if (delta.length() < 0.002) this.focusTarget = null;
    }
    this.controls.update();
    this.renderer.toneMappingExposure = 1.0 + night * 0.25;
    this.scene.environmentIntensity = 0.35 * (1 - night * 0.75);
    if (this.bloom) {
      this.bloom.strength = 0.2 + night * 0.6;
      this.bloom.threshold = 0.88 - night * 0.25;
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}
