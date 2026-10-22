import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROSTER } from '../src/data/roster';
import { girthScale } from '../src/scene/figurine';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/models/character');

interface Gltf {
  nodes?: { name?: string; mesh?: number; translation?: number[]; children?: number[] }[];
  meshes?: { primitives: { attributes: { POSITION: number } }[] }[];
  materials?: { name?: string }[];
  accessors?: { count: number; min?: number[]; max?: number[] }[];
}

function readGlb(name: string): Gltf {
  const buf = fs.readFileSync(path.join(dir, name));
  expect(buf.readUInt32LE(0)).toBe(0x46546c67);
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as Gltf;
}

function tris(gltf: Gltf): number {
  let n = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const p of mesh.primitives) n += (gltf.accessors?.[p.attributes.POSITION].count ?? 0) / 3;
  }
  return n;
}

function names(gltf: Gltf): string[] {
  return (gltf.nodes ?? []).map((n) => n.name ?? '');
}

describe('手办 glTF', () => {
  it('身体在面数预算内，关节名和材质槽对齐短单', () => {
    const gltf = readGlb('body.glb');
    expect(tris(gltf)).toBeLessThanOrEqual(2500);
    expect(tris(gltf)).toBeGreaterThan(200);
    const nodes = names(gltf);
    for (const name of [
      'hips', 'spine', 'neck', 'head',
      'armL_sh', 'armL_el', 'armR_sh', 'armR_el',
      'legL_hp', 'legL_kn', 'legR_hp', 'legR_kn',
      'socket_hair', 'socket_glasses', 'socket_headset',
      'eyeL', 'eyeR',
    ]) expect(nodes).toContain(name);
    const mats = (gltf.materials ?? []).map((m) => m.name);
    for (const name of ['matSkin', 'matShirt', 'matPants', 'matShoes', 'matBadge']) expect(mats).toContain(name);
    const hips = gltf.nodes?.find((n) => n.name === 'hips');
    expect(hips?.translation?.[1]).toBeGreaterThan(0.3);
    expect(hips?.translation?.[1]).toBeLessThan(0.5);
  });

  it('发型、眼镜、耳机各自不超面数', () => {
    expect(tris(readGlb('hair_messy.glb'))).toBeLessThanOrEqual(400);
    expect(tris(readGlb('hair_short.glb'))).toBeLessThanOrEqual(400);
    expect(tris(readGlb('hair_side.glb'))).toBeLessThanOrEqual(400);
    expect(tris(readGlb('hair_buzz.glb'))).toBeLessThanOrEqual(400);
    expect(tris(readGlb('glasses.glb'))).toBeLessThanOrEqual(120);
    expect(tris(readGlb('headset.glb'))).toBeLessThanOrEqual(200);
    expect(names(readGlb('glasses.glb'))).toContain('glasses');
    expect(names(readGlb('headset.glb'))).toContain('headset');
    const mats = (readGlb('headset.glb').materials ?? []).map((m) => m.name);
    expect(mats).toContain('matHeadsetBand');
    expect(mats).toContain('matHeadsetCup');
  });

  it('胖瘦插值：狗粮偏瘦，撇干最胖', () => {
    const byId = Object.fromEntries(ROSTER.map((m) => [m.id, girthScale(m.look.girth)]));
    expect(byId.gouliang).toBeLessThan(1);
    expect(byId.piegan).toBeGreaterThan(byId.aji);
    expect(byId.piegan).toBeCloseTo(1.22, 5);
    expect(byId.dangdeng).toBeCloseTo(0.88, 5);
    const heights = Object.fromEntries(ROSTER.map((m) => [m.id, m.look.height]));
    expect(heights.dibi).toBeGreaterThan(heights.diaolong);
    expect(heights.dangdeng).toBeLessThan(heights.gouliang);
    expect(ROSTER.find((m) => m.id === 'aji')!.look.hair).toBe(0xff8a2b);
    expect(ROSTER.find((m) => m.id === 'dibi')!.look.hair).toBe(0xe8d4a0);
    expect(ROSTER.find((m) => m.id === 'aji')!.look.glasses).toBe(true);
    expect(ROSTER.find((m) => m.id === 'diaolong')!.look.glasses).toBe(false);
    expect(ROSTER.find((m) => m.id === 'piegan')!.look.glasses).toBe(false);
  });
});
