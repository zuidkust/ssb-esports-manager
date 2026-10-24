import { describe, expect, it } from 'vitest';
import { ROSTER } from '../src/data/roster';
import { lowResSize, parseRenderMode, snapOffset, verticalFrustum, worldUnitsPerPixel } from '../src/scene/pixelPass';

describe('像素管线参数', () => {
  it('默认是 PIXEL，粒度为 3', () => {
    expect(parseRenderMode('')).toEqual({ mode: 'pixel', pixelSize: 3 });
    expect(parseRenderMode('t=14:30&skip=1')).toEqual({ mode: 'pixel', pixelSize: 3 });
  });

  it('raw3d 和 render=raw 进入原始 3D', () => {
    expect(parseRenderMode('raw3d=1').mode).toBe('raw');
    expect(parseRenderMode('render=raw').mode).toBe('raw');
    expect(parseRenderMode('render=raw&pixel=4')).toEqual({ mode: 'raw', pixelSize: 4 });
  });

  it('只接受 2 / 3 / 4 三档像素', () => {
    expect(parseRenderMode('pixel=2').pixelSize).toBe(2);
    expect(parseRenderMode('pixel=4').pixelSize).toBe(4);
    expect(parseRenderMode('pixel=8').pixelSize).toBe(3);
    expect(parseRenderMode('pixel=0').pixelSize).toBe(3);
  });

  it('竖屏放大视锥，横屏保持基准 14', () => {
    expect(verticalFrustum(1.6)).toBe(14);
    expect(verticalFrustum(1.15)).toBeCloseTo(17.2 / 1.15, 5);
    expect(verticalFrustum(0.5)).toBeCloseTo(17.2 / 0.5, 5);
  });

  it('低分辨率按像素粒度取整', () => {
    expect(lowResSize(1440, 900, 3)).toEqual({ w: 480, h: 300 });
    expect(lowResSize(1440, 900, 4)).toEqual({ w: 360, h: 225 });
    expect(lowResSize(100, 90, 2)).toEqual({ w: 50, h: 45 });
  });

  it('像素格对齐用视锥除以低分高度', () => {
    expect(worldUnitsPerPixel(14, 300)).toBeCloseTo(14 / 300, 8);
    expect(snapOffset(1.2, 0.5)).toBeCloseTo(-0.2, 8);
    expect(snapOffset(0.25, 0.5)).toBeCloseTo(0.25, 8);
    expect(snapOffset(0, 0.05)).toBe(0);
  });
});

describe('方块手办配色', () => {
  const look = Object.fromEntries(ROSTER.map((m) => [m.id, m.look]));

  it('六人队服和特征对得上', () => {
    expect(look.aji).toMatchObject({ shirt: 0xff8a2b, hairStyle: 'messy', glasses: true, frame: 'thick', flipflops: true, shoes: 0xff8a2b });
    expect(look.dangdeng).toMatchObject({ shirt: 0x2f8a4a, hairStyle: 'flat', lens: 'glow', height: 0.84 });
    expect(look.gouliang).toMatchObject({ shirt: 0x4a8ad4, hairStyle: 'bangs', shoes: 0xffffff, glasses: true });
    expect(look.dibi).toMatchObject({ shirt: 0xf2efe8, hairStyle: 'side', glasses: true });
    expect(look.diaolong).toMatchObject({ shirt: 0x1e3a6e, hairStyle: 'buzz', glasses: false });
    expect(look.piegan).toMatchObject({ shirt: 0xc43a3a, hairStyle: 'fluffy', glasses: false, eyeBags: true, earmuffs: true });
  });

  it('当邓最矮，弟必最高，撇干最壮', () => {
    const heights = ROSTER.map((m) => m.look.height);
    expect(Math.min(...heights)).toBe(look.dangdeng.height);
    expect(Math.max(...heights)).toBe(look.dibi.height);
    const girths = ROSTER.map((m) => m.look.girth);
    expect(Math.max(...girths)).toBe(look.piegan.girth);
  });
});
