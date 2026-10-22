// 手办风低多边形：用点云凸包生成切面块，法线按面走，看起来像一刀一刀削出来的
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

export type P3 = [number, number, number];

/** 点云 → 切面凸包，再按 (sx, sy, sz) 缩放到世界尺寸 */
export function hull(pts: P3[], sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = new ConvexGeometry(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  g.scale(sx, sy, sz);
  return g;
}

/**
 * 倒角矩形截面（八边形），水平放在 y 高度。
 * w 宽、d 深；c 倒角比例；zf/zb 可让前后不对称；x0/z0 整体平移。
 */
export function ring(y: number, w: number, d: number, c = 0.3, o: { x0?: number; z0?: number; zf?: number; zb?: number } = {}): P3[] {
  const hw = w / 2, hd = d / 2;
  const x0 = o.x0 ?? 0, z0 = o.z0 ?? 0;
  const zf = z0 + (o.zf ?? hd), zb = z0 - (o.zb ?? hd);
  const cx = hw * c, cz = hd * c;
  return [
    [x0 + hw - cx, y, zf], [x0 + hw, y, zf - cz], [x0 + hw, y, zb + cz], [x0 + hw - cx, y, zb],
    [x0 - hw + cx, y, zb], [x0 - hw, y, zb + cz], [x0 - hw, y, zf - cz], [x0 - hw + cx, y, zf],
  ];
}

/** 两点之间的细方条（眼镜腿、麦克风杆、拖鞋带） */
export function bar(a: P3, b: P3, w: number, h = w): P3[] {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const up = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3().crossVectors(d, up).normalize();
  const t = new THREE.Vector3().crossVectors(s, d).normalize();
  const pts: P3[] = [];
  for (const p of [a, b]) {
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pts.push([p[0] + s.x * i * w / 2 + t.x * j * h / 2, p[1] + s.y * i * w / 2 + t.y * j * h / 2, p[2] + s.z * i * w / 2 + t.z * j * h / 2]);
    }
  }
  return pts;
}

export function solid(geo: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]) {
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
