// 白底六人站位（?lineup=1）：和稿 B 锁定图同排列、同角度，站在八角彩色底座上，用来逐个对照造型
import * as THREE from 'three';
import { HEAD_MID, STAND_TOP, fromLegacyScale } from './body';
import type { Character } from './character';
import type { Stage } from './stage';
import type { Lighting } from './lighting';
import type { Venue } from './venue';

export const LINEUP_ORDER = ['aji', 'dangdeng', 'gouliang', 'dibi', 'diaolong', 'piegan'];
// 间距和底座跟着人一起缩，六人仍是一排手办，不会叠在一起
const SPACING = fromLegacyScale(1.15);
const BASE_R = fromLegacyScale(0.42);
const BASE_H = fromLegacyScale(0.1);

export function setupLineup(stage: Stage, venue: Venue, lighting: Lighting, chars: Record<string, Character>) {
  document.documentElement.classList.add('lineup-mode');
  venue.root.visible = false;
  stage.studio = true;
  stage.composer = null;
  stage.bloom = null;
  stage.sidePanel = 0;
  stage.renderer.toneMappingExposure = 0.92;
  stage.scene.environmentIntensity = 0.3;
  stage.scene.background = new THREE.Color(0xffffff);
  for (const l of [lighting.hemi, lighting.sun, lighting.moon, lighting.ceiling, lighting.warm]) l.intensity = 0;

  const root = new THREE.Group();
  stage.scene.add(root);
  root.add(new THREE.HemisphereLight(0xffffff, 0xd8cfc4, 0.55));
  const key = new THREE.DirectionalLight(0xfff6ea, 2.9);
  key.position.set(-5, 6.5, 5.5);
  key.castShadow = stage.quality.shadows;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 4, bottom: -2, near: 1, far: 30 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 6;
  root.add(key);
  const fill = new THREE.DirectionalLight(0xeef2ff, 0.55);
  fill.position.set(5, 2.5, 5);
  root.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);

  LINEUP_ORDER.forEach((id, i) => {
    const c = chars[id];
    if (!c) return;
    const x = (i - (LINEUP_ORDER.length - 1) / 2) * SPACING;
    // 八角底座：衫色，侧面略深
    const top = new THREE.MeshStandardMaterial({ color: c.def.look.shirt, roughness: 0.75, flatShading: true });
    const side = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.def.look.shirt).multiplyScalar(0.82), roughness: 0.75, flatShading: true });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(BASE_R * 0.96, BASE_R, BASE_H, 8), [side, top, side]);
    base.rotation.y = Math.PI / 8;
    base.position.set(x, BASE_H / 2, 0);
    base.castShadow = base.receiveShadow = true;
    root.add(base);

    c.setHidden(false);
    c.noBlink = true;
    c.path = [];
    // 锁定图是微侧身的手办摆拍：整体朝画面左转一点
    c.teleport(new THREE.Vector3(x, BASE_H, 0), -0.28, 'stand');
    c.headset.visible = id === 'diaolong' || id === 'piegan';
    c.neckphones.visible = !!c.def.look.neckphones;
    c.phone.visible = false;
    c.cup.visible = false;
    c.root.traverse((o) => {
      const label = o as THREE.Object3D & { isCSS2DObject?: boolean; element?: HTMLElement };
      if (label.isCSS2DObject && label.element === c.tagEl) label.position.set(0, -0.32, 0.4);
    });
    c.update(0, performance.now());
  });

  const c = stage.controls;
  c.minPolarAngle = 0.2;
  c.maxPolarAngle = Math.PI / 2;
  c.minAzimuthAngle = -Infinity;
  c.maxAzimuthAngle = Infinity;
  c.minDistance = 1;
  c.maxDistance = 40;
  stage.resize();
  const focus = new URLSearchParams(location.search).get('focus');
  const fi = focus ? LINEUP_ORDER.indexOf(focus) : -1;
  const q = new URLSearchParams(location.search);
  const feet = BASE_H;
  const headY = feet + HEAD_MID;
  if (q.get('heads') === '1') {
    // 六个头一排：?lineup=1&heads=1（看发型、五官、配饰）
    const span = SPACING * (LINEUP_ORDER.length - 1) + fromLegacyScale(0.7);
    const dist = fitWidth(stage, span);
    stage.camera.position.set(0, headY + fromLegacyScale(0.04), dist);
    c.target.set(0, headY, 0);
  } else if (fi >= 0) {
    // 单人近景：?lineup=1&focus=aji；加 &head=1 只拍头，&yaw=3.14 转到背面
    const x = (fi - (LINEUP_ORDER.length - 1) / 2) * SPACING;
    const yaw = +(q.get('yaw') ?? 0);
    const head = q.get('head') === '1';
    const d = fromLegacyScale(head ? 2.3 : 4.2);
    const ty = head ? headY : feet + STAND_TOP * 0.48;
    stage.camera.position.set(x + Math.sin(yaw) * d, ty + fromLegacyScale(head ? 0.08 : 0.25), Math.cos(yaw) * d);
    c.target.set(x, ty, 0);
  } else {
    const span = SPACING * (LINEUP_ORDER.length - 1) + fromLegacyScale(0.9);
    const dist = Math.max(fitWidth(stage, span), fromLegacyScale(9));
    stage.camera.position.set(0, feet + STAND_TOP * 0.59, dist);
    c.target.set(0, feet + STAND_TOP * 0.46, 0);
  }
  c.update();

  return (dt: number) => {
    for (const id of LINEUP_ORDER) chars[id]?.update(dt, performance.now());
  };
}

/** 让横向 span 米刚好落进当前画面，fov 用舞台相机的竖向视角 */
function fitWidth(stage: Stage, span: number) {
  const aspect = stage.camera.aspect || 16 / 9;
  const v = (stage.camera.fov * Math.PI) / 180;
  const halfW = Math.tan(v / 2) * aspect;
  return (span / 2) / halfW * 1.06;
}
