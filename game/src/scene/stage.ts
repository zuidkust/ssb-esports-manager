// 渲染舞台：正交等距镜头、像素管线 / 原始 3D、CSS2D 标签层、点击拾取
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PixelPipeline, verticalFrustum, worldUnitsPerPixel, snapOffset, type PixelSize, type RenderMode } from './pixelPass';

export interface Quality {
  name: 'high' | 'medium' | 'low';
  dpr: number;
  shadows: boolean;
  shadowSize: number;
  bloom: boolean;
  screenLights: boolean;
}

export type { PixelSize, RenderMode };

// 画质档位：桌面高画质；小屏中画质；帧率持续过低时自动降到低画质。
// 三档都走像素管线。降档只关辉光、降低像素比，不把画面退回模糊全分辨率。
export function detectQuality(forced?: string | null): Quality {
  const small = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const tiers: Record<Quality['name'], Quality> = {
    high: { name: 'high', dpr: Math.min(devicePixelRatio, 2), shadows: true, shadowSize: 2048, bloom: true, screenLights: true },
    medium: { name: 'medium', dpr: Math.min(devicePixelRatio, 1.5), shadows: true, shadowSize: 1024, bloom: false, screenLights: true },
    low: { name: 'low', dpr: 1, shadows: false, shadowSize: 512, bloom: false, screenLights: false },
  };
  return tiers[forced as Quality['name']] || (small ? tiers.medium : tiers.high);
}

const ISO_DIR = new THREE.Vector3(1, 0.82, 1).normalize();

export class Stage {
  renderer: THREE.WebGLRenderer;
  labels: CSS2DRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  pixel: PixelPipeline;
  renderMode: RenderMode = 'pixel';
  pixelSize: PixelSize = 3;
  pickables: THREE.Object3D[] = [];
  onPick: ((id: string | null) => void) | null = null;
  focusTarget: THREE.Vector3 | null = null;
  sidePanel = 0; // 右侧面板宽度：投影中心左移半个面板，让房间落在可见区域正中
  private raycaster = new THREE.Raycaster();
  private bloomOn: boolean;
  private degraded = false;
  private frustum = 14;
  private savedPos = new THREE.Vector3();
  private snapRight = new THREE.Vector3();
  private snapUp = new THREE.Vector3();
  private snapView = new THREE.Vector3();

  constructor(private container: HTMLElement, public quality: Quality) {
    this.bloomOn = quality.bloom;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 120);
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }));
    r.setPixelRatio(quality.dpr);
    r.shadowMap.enabled = quality.shadows;
    r.shadowMap.type = THREE.BasicShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);

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
    c.minZoom = 0.62;
    c.maxZoom = 3.6;

    this.pixel = new PixelPipeline();
    this.rebuildComposer();

    this.bindPick();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.resetView();
  }

  setRenderMode(mode: RenderMode) {
    this.renderMode = mode;
  }

  setPixelSize(size: PixelSize) {
    this.pixelSize = size;
    this.pixel.setPixelSize(size);
    this.resize();
  }

  // 默认等距视角：东南斜上，约 32° 俯角、45° 方位。竖屏靠放大视锥把房间装下。
  resetView() {
    const dist = 42;
    this.controls.target.set(0, 0.55, -0.35);
    this.camera.position.copy(this.controls.target).addScaledVector(ISO_DIR, dist);
    this.camera.zoom = 1;
    this.camera.near = 0.5;
    this.camera.far = 120;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    const side = w > 760 ? this.sidePanel : 0;
    const aspect = w / Math.max(1, h);
    const visibleAspect = Math.max(1, w - side) / Math.max(1, h);
    this.frustum = verticalFrustum(visibleAspect);
    const cam = this.camera;
    cam.left = -this.frustum * aspect / 2;
    cam.right = this.frustum * aspect / 2;
    cam.top = this.frustum / 2;
    cam.bottom = -this.frustum / 2;
    if (side) cam.setViewOffset(w, h, side / 2, 0, w, h);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    this.pixel.setSize(w, h, this.renderer.getPixelRatio());
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  degrade() {
    this.degraded = true;
    this.bloomOn = false;
    this.bloom = null;
    this.renderer.setPixelRatio(1);
    this.rebuildComposer();
    this.resize();
  }

  private rebuildComposer() {
    this.composer?.dispose();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.bloomOn && !this.degraded) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.55, 0.82);
      this.composer.addPass(this.bloom);
    } else {
      this.bloom = null;
    }
    this.composer.addPass(new OutputPass());
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

  private snapCamera() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    const step = worldUnitsPerPixel((cam.top - cam.bottom) / cam.zoom, this.pixel.lowHeight);
    this.snapView.set(0, 0, 0).applyMatrix4(cam.matrixWorldInverse);
    const dx = snapOffset(this.snapView.x, step);
    const dy = snapOffset(this.snapView.y, step);
    this.snapRight.setFromMatrixColumn(cam.matrixWorld, 0);
    this.snapUp.setFromMatrixColumn(cam.matrixWorld, 1);
    cam.position.addScaledVector(this.snapRight, -dx);
    cam.position.addScaledVector(this.snapUp, -dy);
    cam.updateMatrixWorld();
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
    const exposure = 1.0 + night * 0.25;
    this.renderer.toneMappingExposure = exposure;
    this.scene.environmentIntensity = 0.35 * (1 - night * 0.75);
    if (this.bloom) {
      this.bloom.strength = 0.2 + night * 0.6;
      this.bloom.threshold = 0.88 - night * 0.25;
    }
    if (this.renderMode === 'pixel') {
      this.savedPos.copy(this.camera.position);
      this.snapCamera();
      this.pixel.render(this.renderer, this.scene, this.camera, exposure);
      this.labels.render(this.scene, this.camera);
      this.camera.position.copy(this.savedPos);
      this.camera.updateMatrixWorld();
    } else {
      if (this.composer && this.bloom) this.composer.render();
      else this.renderer.render(this.scene, this.camera);
      this.labels.render(this.scene, this.camera);
    }
  }
}
