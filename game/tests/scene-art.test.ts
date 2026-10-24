import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mergeStatic } from '../src/scene/merge';
import { rainAmount } from '../src/scene/weather';

describe('静态合批', () => {
  it('同一父节点下同材质的叶子网格合成一个，会动的子组保留并各自合并', () => {
    const red = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x0000ff });
    const root = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red);
      m.position.x = i;
      root.add(m);
    }
    root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), blue));
    const chair = new THREE.Group();
    chair.position.z = 3;
    chair.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red));
    root.add(chair);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), red);
    hand.userData.noMerge = true;
    root.add(hand);

    const r = mergeStatic(root);
    const meshes = root.children.filter((c) => (c as THREE.Mesh).isMesh);
    // 5 红合 1 + 蓝 1 + 跳过合批的 1
    expect(meshes.length).toBe(3);
    expect(root.children).toContain(chair);
    expect(root.children).toContain(hand);
    expect(chair.children.length).toBe(1);
    expect(r.after).toBeLessThan(r.before);
    // 合并后几何体保留原来的位置（在父节点坐标里）
    const merged = meshes.find((m) => (m as THREE.Mesh).material === red && m !== hand) as THREE.Mesh;
    merged.geometry.computeBoundingBox();
    expect(merged.geometry.boundingBox!.min.x).toBeCloseTo(-0.5, 5);
    expect(merged.geometry.boundingBox!.max.x).toBeCloseTo(4.5, 5);
  });

  it('不同投影设置的同材质网格不合在一起', () => {
    const mat = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    const b = new THREE.Mesh(new THREE.BoxGeometry(), mat);
    a.castShadow = true;
    root.add(a, b);
    mergeStatic(root);
    expect(root.children.length).toBe(2);
  });
});

describe('天气（纯画面）', () => {
  it('同一天同一时刻的雨量固定，范围 0..1', () => {
    for (let day = 1; day <= 60; day++) {
      for (let m = 8 * 60; m < 24 * 60; m += 37) {
        const v = rainAmount(day, m);
        expect(v).toBe(rainAmount(day, m));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('大约四分之一的日子会下雨，下雨的日子雨量能到满', () => {
    const rainy = [];
    for (let day = 1; day <= 400; day++) {
      let peak = 0;
      for (let m = 0; m < 24 * 60; m += 5) peak = Math.max(peak, rainAmount(day, m));
      if (peak > 0) {
        rainy.push(day);
        expect(peak).toBe(1);
      }
    }
    expect(rainy.length).toBeGreaterThan(60);
    expect(rainy.length).toBeLessThan(140);
  });
});
