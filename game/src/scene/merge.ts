// 静态合批：同一个父节点下、材质相同的叶子网格合成一个网格，draw call 从“每件小物一个”降到“每种材质一个”
// 只合并层级里的叶子网格；关节、门轴、椅子、显示器这些会动的 Group 保留，组内各自合并。
// userData.noMerge 的节点（人物、钟的指针）整棵跳过。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'uv', 'color'] as const;

function prepare(mesh: THREE.Mesh): THREE.BufferGeometry {
  mesh.updateMatrix();
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const name of Object.keys(g.attributes)) if (!(KEEP as readonly string[]).includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  g.morphAttributes = {};
  g = g.applyMatrix4(mesh.matrix);
  return g;
}

function mergeable(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh;
  return !!m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh
    && m.children.length === 0 && !m.userData.noMerge && !Array.isArray(m.material) && m.renderOrder === 0 && m.visible;
}

/** 返回合并前后的网格数，便于测量。 */
export function mergeStatic(root: THREE.Object3D): { before: number; after: number } {
  let before = 0, after = 0;
  const visit = (parent: THREE.Object3D) => {
    const buckets = new Map<string, THREE.Mesh[]>();
    for (const c of [...parent.children]) {
      if (c.userData.noMerge) continue;
      if (mergeable(c)) {
        const mat = c.material as THREE.Material;
        const key = `${mat.uuid}|${c.castShadow ? 1 : 0}${c.receiveShadow ? 1 : 0}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key)!.push(c);
      } else visit(c);
    }
    for (const list of buckets.values()) {
      before += list.length;
      if (list.length < 2) {
        after += list.length;
        continue;
      }
      const geo = mergeGeometries(list.map(prepare), false);
      if (!geo) {
        after += list.length;
        continue;
      }
      const first = list[0];
      const merged = new THREE.Mesh(geo, first.material);
      merged.castShadow = first.castShadow;
      merged.receiveShadow = first.receiveShadow;
      merged.userData = { ...first.userData, merged: list.length };
      for (const m of list) m.removeFromParent();
      parent.add(merged);
      after++;
    }
  };
  visit(root);
  return { before, after };
}
