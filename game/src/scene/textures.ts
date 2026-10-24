// 程序化贴图：全部用 Canvas 现画，样板不依赖任何外部美术资源
import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function desat(r: number, g: number, b: number, amount = 0.36): [number, number, number] {
  const l = r * 0.299 + g * 0.587 + b * 0.114;
  return [Math.round(r + (l - r) * amount), Math.round(g + (l - g) * amount), Math.round(b + (l - b) * amount)];
}

function pixelate(t: THREE.CanvasTexture): THREE.CanvasTexture {
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.anisotropy = 1;
  return t;
}

function toTexture(c: HTMLCanvasElement, { repeat = [1, 1], srgb = true }: { repeat?: [number, number]; srgb?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  pixelate(t);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 木地板：宽木板条，两三种去饱和色块，没有细木纹（低分采样不会出摩尔纹）
export function floorTexture() {
  const c = canvas(512, 512);
  const g = c.getContext('2d')!;
  const plankH = 128;
  const tones: [number, number, number][] = [[168, 132, 96], [146, 116, 84], [178, 142, 108]];
  tones.forEach((tone, i) => {
    const y = i * plankH;
    const col = desat(tone[0], tone[1], tone[2], 0.38);
    g.fillStyle = `rgb(${col.join(',')})`;
    g.fillRect(0, y, 512, plankH);
    const seam = desat(92, 66, 46, 0.28);
    g.fillStyle = `rgb(${seam.join(',')})`;
    g.fillRect(0, y, 512, 8);
    g.fillRect(70 + i * 120, y, 8, plankH);
  });
  const last = desat(158, 124, 90, 0.38);
  g.fillStyle = `rgb(${last.join(',')})`;
  g.fillRect(0, 384, 512, 128);
  const seam = desat(92, 66, 46, 0.28);
  g.fillStyle = `rgb(${seam.join(',')})`;
  g.fillRect(0, 384, 512, 8);
  g.fillRect(300, 384, 8, 128);
  return toTexture(c, { repeat: [2.1, 2.1] });
}

// 墙面：近白底 + 稀疏的浅色斑点（乘材质颜色），像素尺度，不出大色块
export function plasterTexture() {
  const c = canvas(32, 32);
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2f2f2';
  g.fillRect(0, 0, 32, 32);
  const r = mulberry32(5);
  for (let n = 0; n < 70; n++) {
    g.fillStyle = r() < 0.6 ? '#e3e3e3' : '#fafafa';
    g.fillRect(Math.floor(r() * 32), Math.floor(r() * 32), 1, 1);
  }
  return toTexture(c, { repeat: [6, 1.4] });
}

// 胡桃木竖条格栅
export function slatTexture() {
  const c = canvas(512, 512);
  const g = c.getContext('2d')!;
  const r = mulberry32(3);
  for (let x = 0; x < 512; x += 32) {
    const b = 0.85 + r() * 0.2;
    g.fillStyle = `rgb(${Math.round(120 * b)},${Math.round(78 * b)},${Math.round(48 * b)})`;
    g.fillRect(x, 0, 24, 512);
    g.fillStyle = '#2a1a10';
    g.fillRect(x + 24, 0, 8, 512);
  }
  return toTexture(c, { repeat: [2, 1] });
}

// 地毯：大块双色格，没有细碎噪点
export function rugTexture(main = '#d9c7aa', border = '#b5643a') {
  const c = canvas(256, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = border;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = main;
  g.fillRect(18, 18, 220, 220);
  const cell = 28;
  for (let y = 28; y < 228; y += cell) {
    for (let x = 28; x < 228; x += cell) {
      if (((x + y) / cell) % 2 < 1) continue;
      g.fillStyle = 'rgba(90,70,48,0.16)';
      g.fillRect(x, y, cell - 2, cell - 2);
    }
  }
  g.strokeStyle = 'rgba(120,70,40,0.45)';
  g.lineWidth = 6;
  g.strokeRect(28, 28, 200, 200);
  return toTexture(c);
}

// 显示器画面
export type ScreenKind = 'game' | 'stream' | 'idle' | 'chat' | 'off';

export function screenTexture(kind: ScreenKind, seed = 1): THREE.CanvasTexture {
  const c = canvas(256, 160);
  const g = c.getContext('2d')!;
  const r = mulberry32(seed * 31 + kind.length);
  if (kind === 'game') {
    // 类峡谷俯视画面：绿地、河道、小兵与技能光效
    const grd = g.createLinearGradient(0, 0, 256, 160);
    grd.addColorStop(0, '#24452b');
    grd.addColorStop(1, '#1b3322');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 160);
    g.strokeStyle = '#3a6a86';
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(0, 150);
    g.quadraticCurveTo(130, 90, 256, 10);
    g.stroke();
    for (let i = 0; i < 26; i++) {
      g.fillStyle = r() < 0.5 ? '#5ab0ff' : '#ff5a5a';
      g.beginPath();
      g.arc(r() * 256, r() * 140, 2 + r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,220,120,0.8)';
    g.beginPath();
    g.arc(120 + r() * 30, 70 + r() * 20, 9, 0, Math.PI * 2);
    g.fill();
    // HUD
    g.fillStyle = 'rgba(10,14,20,0.85)';
    g.fillRect(70, 136, 116, 24);
    g.fillRect(200, 104, 56, 56);
    g.fillStyle = '#3ad16b';
    g.fillRect(76, 140, 104 * (0.4 + r() * 0.6), 6);
    g.fillStyle = '#3a8bd1';
    g.fillRect(76, 150, 104 * (0.3 + r() * 0.7), 5);
    g.fillStyle = '#2f5a35';
    g.fillRect(203, 107, 50, 50);
    g.fillStyle = 'rgba(10,14,20,0.8)';
    g.fillRect(0, 0, 256, 12);
    g.fillStyle = '#e8d9a8';
    g.font = '9px sans-serif';
    g.fillText(`${Math.floor(r() * 12)} / ${Math.floor(r() * 8)} / ${Math.floor(r() * 10)}     ${10 + Math.floor(r() * 25)}:${String(Math.floor(r() * 60)).padStart(2, '0')}`, 90, 9);
  } else if (kind === 'stream') {
    g.fillStyle = '#18141f';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#3d2a5c';
    g.fillRect(6, 8, 180, 110);
    g.fillStyle = '#7a5fb0';
    g.beginPath();
    g.arc(96, 63, 28, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e04050';
    g.fillRect(10, 12, 26, 9);
    g.fillStyle = '#fff';
    g.font = 'bold 7px sans-serif';
    g.fillText('LIVE', 13, 19);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = `hsl(${r() * 360},60%,70%)`;
      g.fillRect(192, 10 + i * 12, 20 + r() * 40, 5);
    }
    g.fillStyle = '#2a2234';
    g.fillRect(6, 124, 180, 30);
  } else if (kind === 'idle') {
    const grd = g.createRadialGradient(128, 80, 10, 128, 80, 150);
    grd.addColorStop(0, '#3a6fd8');
    grd.addColorStop(1, '#0d1840');
    g.fillStyle = grd;
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 18px sans-serif';
    g.textAlign = 'center';
    g.fillText('休眠中', 128, 86);
  } else if (kind === 'chat') {
    // 队伍群聊 / 战绩网站
    g.fillStyle = '#f2f2f2';
    g.fillRect(0, 0, 256, 160);
    g.fillStyle = '#2d8cf0';
    g.fillRect(0, 0, 256, 16);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#d7f0c8' : '#ffffff';
      const w = 60 + r() * 120;
      g.fillRect(i % 2 ? 250 - w : 8, 22 + i * 17, w, 12);
    }
  } else {
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, 256, 160);
  }
  const t = pixelate(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 白板：标题和排行内容随模拟实时更新（默认是“摸鱼排行榜”）
export interface WhiteboardContent {
  title: string;
  rows: { name: string; minutes: number }[];
  footer: string;
  date: string;
}

export class WhiteboardTexture {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  private lastKey = '';
  constructor() {
    this.canvas = canvas(768, 512);
    this.texture = pixelate(new THREE.CanvasTexture(this.canvas));
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.lastKey = '';
  }

  draw({ title, rows, footer, date }: WhiteboardContent) {
    const key = JSON.stringify([title, rows, footer, date]);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.canvas.getContext('2d')!;
    g.fillStyle = '#f7f6f1';
    g.fillRect(0, 0, 768, 512);
    // 擦不干净的旧痕迹
    g.strokeStyle = 'rgba(80,100,140,0.08)';
    g.lineWidth = 18;
    g.beginPath();
    g.moveTo(480, 60);
    g.bezierCurveTo(600, 30, 700, 120, 740, 90);
    g.stroke();
    g.fillStyle = '#c0392b';
    g.font = 'bold 54px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText(title, 36, 76);
    g.fillStyle = '#34495e';
    g.font = '26px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText(date, 340, 72);
    g.strokeStyle = '#c0392b';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(36, 92);
    g.lineTo(320, 96);
    g.stroke();
    const max = Math.max(30, ...rows.map((row) => row.minutes));
    rows.forEach((row, i) => {
      const y = 140 + i * 52;
      g.fillStyle = i === 0 ? '#c0392b' : '#2c3e50';
      g.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif';
      g.fillText(`${i + 1}. ${row.name}`, 40, y + 14);
      g.fillStyle = i === 0 ? 'rgba(192,57,43,0.75)' : 'rgba(41,128,185,0.6)';
      g.fillRect(230, y - 14, (380 * row.minutes) / max, 26);
      g.fillStyle = '#2c3e50';
      g.font = '28px "PingFang SC","Microsoft YaHei",sans-serif';
      g.fillText(`${Math.round(row.minutes)} 分钟`, 620, y + 12);
      if (i === 0) {
        g.font = '24px sans-serif';
        g.fillText('👑', 196, y + 10);
      }
    });
    g.fillStyle = '#2d6a4f';
    g.font = 'bold 28px "PingFang SC","Microsoft YaHei",sans-serif';
    g.fillText(footer, 40, 486);
    this.texture.needsUpdate = true;
  }
}

// 窗外天空 + 城市剪影，按时段重画
export class SkyTexture {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  private buildings: { x: number; w: number; h: number; lit: number[] }[];
  private lastKey = '';
  constructor() {
    this.canvas = canvas(512, 256);
    this.texture = pixelate(new THREE.CanvasTexture(this.canvas));
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const r = mulberry32(21);
    this.buildings = [];
    let x = 0;
    while (x < 512) {
      const w = 24 + r() * 50;
      this.buildings.push({ x, w, h: 50 + r() * 120, lit: Array.from({ length: 40 }, () => r()) });
      x += w + 2 + r() * 6;
    }
    this.lastKey = '';
  }

  draw(top: string, bottom: string, night: number) {
    const key = `${top}|${bottom}|${night.toFixed(2)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.canvas.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, top);
    grd.addColorStop(1, bottom);
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 256);
    for (const b of this.buildings) {
      const shade = Math.round(70 - night * 55);
      g.fillStyle = `rgb(${shade},${shade + 6},${shade + 18})`;
      g.fillRect(b.x, 256 - b.h, b.w, b.h);
      let i = 0;
      for (let yy = 256 - b.h + 8; yy < 250; yy += 12) {
        for (let xx = b.x + 4; xx < b.x + b.w - 6; xx += 9) {
          const on = b.lit[i++ % 40] < 0.15 + night * 0.45;
          g.fillStyle = on ? (night > 0.5 ? 'rgba(255,210,140,0.9)' : 'rgba(255,255,255,0.18)') : 'rgba(0,0,0,0.12)';
          g.fillRect(xx, yy, 4, 6);
        }
      }
    }
    this.texture.needsUpdate = true;
  }
}

// 底座侧面文字
export function plinthLabel(text: string, size = 60): THREE.CanvasTexture {
  const c = canvas(1024, 128);
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 1024, 128);
  g.fillStyle = 'rgba(232,170,96,0.9)';
  g.font = `bold ${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
  g.textBaseline = 'middle';
  g.fillText(text, 40, 66);
  const t = pixelate(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 墙上挂画：参考图那种抽象色块
export function artTexture(seed: number): THREE.CanvasTexture {
  const c = canvas(256, 320);
  const g = c.getContext('2d')!;
  const r = mulberry32(seed);
  g.fillStyle = '#efe6d6';
  g.fillRect(0, 0, 256, 320);
  const palette = ['#c8693a', '#e0a46a', '#7b4b2a', '#d9c3a0', '#3f4a5a'];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = palette[Math.floor(r() * palette.length)];
    g.beginPath();
    if (r() < 0.5) g.arc(40 + r() * 170, 60 + r() * 200, 30 + r() * 60, 0, Math.PI * (1 + r()));
    else g.fillRect(30 + r() * 120, 40 + r() * 180, 50 + r() * 90, 50 + r() * 90);
    g.fill();
  }
  const t = pixelate(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 电竞海报
export function posterTexture(): THREE.CanvasTexture {
  const c = canvas(256, 360);
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 360);
  grd.addColorStop(0, '#13233f');
  grd.addColorStop(1, '#0a1020');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 360);
  g.strokeStyle = '#c89b3c';
  g.lineWidth = 6;
  g.strokeRect(14, 14, 228, 332);
  g.fillStyle = '#c89b3c';
  g.font = 'bold 64px "PingFang SC",sans-serif';
  g.textAlign = 'center';
  g.fillText('SSB', 128, 140);
  g.font = 'bold 38px "PingFang SC",sans-serif';
  g.fillText('电竞经理', 128, 196);
  g.font = '18px "PingFang SC",sans-serif';
  g.fillStyle = '#d8c79a';
  g.fillText('本赛季目标：升级城市联赛', 128, 260);
  g.fillText('（打印版奖杯已备好）', 128, 290);
  const t = pixelate(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 网吧地砖：像素尺度（一块砖 10 贴素 ≈ 0.7 米），米白砖 + 深一点的砖缝 + 少量斑点，偶尔一块旧砖
export function tileTexture() {
  const c = canvas(40, 40);
  const g = c.getContext('2d')!;
  const r = mulberry32(7);
  const tones = ['#d6ccb4', '#d0c5ab', '#dad1bb', '#c4b89c'];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      g.fillStyle = tones[r() < 0.18 ? 3 : Math.floor(r() * 3)];
      g.fillRect(i * 10, j * 10, 10, 10);
    }
  }
  for (let n = 0; n < 90; n++) {
    g.fillStyle = r() < 0.5 ? '#bfb398' : '#e2dac6';
    g.fillRect(Math.floor(r() * 40), Math.floor(r() * 40), 1, 1);
  }
  g.fillStyle = '#9d927c';
  for (let i = 0; i < 40; i += 10) {
    g.fillRect(i, 0, 1, 40);
    g.fillRect(0, i, 40, 1);
  }
  return toTexture(c, { repeat: [14 / 2.8, 10 / 2.8] });
}

export interface SignSpec {
  w: number; // 画布像素
  h: number;
  bg: string;
  fg: string;
  border?: string;
  title?: string;
  titleSize?: number;
  lines?: string[];
  lineSize?: number;
  align?: 'center' | 'left';
}

// 印刷标牌：价目表、提示牌、横幅、机号牌等
export function signTexture(sp: SignSpec): THREE.CanvasTexture {
  const c = canvas(sp.w, sp.h);
  const g = c.getContext('2d')!;
  g.fillStyle = sp.bg;
  g.fillRect(0, 0, sp.w, sp.h);
  if (sp.border) {
    g.strokeStyle = sp.border;
    g.lineWidth = Math.max(4, sp.w / 60);
    g.strokeRect(g.lineWidth, g.lineWidth, sp.w - g.lineWidth * 2, sp.h - g.lineWidth * 2);
  }
  const font = '"PingFang SC","Microsoft YaHei",sans-serif';
  g.fillStyle = sp.fg;
  g.textBaseline = 'middle';
  const lines = sp.lines ?? [];
  const ts = sp.titleSize ?? Math.round(sp.h * 0.18);
  const ls = sp.lineSize ?? Math.round(sp.h * 0.09);
  const total = (sp.title ? ts * 1.5 : 0) + lines.length * ls * 1.55;
  let y = (sp.h - total) / 2;
  if (sp.title) {
    g.font = `bold ${ts}px ${font}`;
    g.textAlign = 'center';
    g.fillText(sp.title, sp.w / 2, y + ts * 0.75);
    y += ts * 1.5;
  }
  g.font = `${ls}px ${font}`;
  g.textAlign = sp.align ?? 'center';
  const x = sp.align === 'left' ? sp.w * 0.1 : sp.w / 2;
  for (const l of lines) {
    g.fillText(l, x, y + ls * 0.78);
    y += ls * 1.55;
  }
  const t = pixelate(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 霓虹灯字：暗底 + 发光描边字，做发光贴图
export function neonTexture(text: string, color: string, sub?: string): THREE.CanvasTexture {
  const c = canvas(1024, 256);
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 1024, 256);
  const font = '"PingFang SC","Microsoft YaHei",sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 28;
  g.fillStyle = color;
  g.font = `bold ${sub ? 128 : 150}px ${font}`;
  g.fillText(text, 512, sub ? 104 : 128);
  g.shadowBlur = 8;
  g.fillStyle = '#fff6fb';
  g.fillText(text, 512, sub ? 104 : 128);
  if (sub) {
    g.shadowBlur = 16;
    g.shadowColor = '#5ff0ff';
    g.fillStyle = '#9ff6ff';
    g.font = `bold 46px ${font}`;
    g.fillText(sub, 512, 210);
  }
  const t = pixelate(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── 漂浮街区用的像素贴图：一个贴素 ≈ 一个低分像素（约 7 cm），世界坐标 UV，每 4.5 米重复一次 ──
export const TEXEL_TILE_M = 4.5;

function speckle(size: number, base: string, specks: [string, number][], seed: number) {
  const c = canvas(size, size);
  const g = c.getContext('2d')!;
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const r = mulberry32(seed);
  for (const [col, density] of specks) {
    g.fillStyle = col;
    const n = Math.round(size * size * density);
    for (let i = 0; i < n; i++) g.fillRect(Math.floor(r() * size), Math.floor(r() * size), 1, 1);
  }
  return { c, g, r };
}

// 草皮：亮绿底 + 深浅草点 + 零星土黄点（视频里路边草地的样子）
export function grassTexture() {
  const { c, g, r } = speckle(64, '#4a8a36', [['#3d7a2f', 0.16], ['#5a9a40', 0.12], ['#2f6629', 0.04], ['#9a6a34', 0.014]], 11);
  // 大块深浅草斑：视频里草地不是一整片匀色
  for (let i = 0; i < 9; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(40,90,36,0.45)' : 'rgba(110,160,70,0.3)';
    const x = Math.floor(r() * 60), y = Math.floor(r() * 60), w = 3 + Math.floor(r() * 6), h = 2 + Math.floor(r() * 4);
    g.fillRect(x, y, w, h);
  }
  return toTexture(c);
}

// 人行道：浅灰方砖 + 砖缝 + 少量污点
export function pavingTexture() {
  const { c, g, r } = speckle(64, '#b8bbba', [['#a9adac', 0.12], ['#c6c8c6', 0.08], ['#8e9292', 0.02]], 12);
  g.fillStyle = '#8f9393';
  for (let i = 0; i < 64; i += 16) {
    g.fillRect(i, 0, 1, 64);
    g.fillRect(0, i, 64, 1);
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(70,72,74,0.5)';
    g.fillRect(Math.floor(r() * 62), Math.floor(r() * 62), 2, 1);
  }
  return toTexture(c);
}

// 柏油路：深灰 + 颗粒
export function asphaltTexture() {
  const { c } = speckle(64, '#3d4044', [['#45494d', 0.18], ['#34373a', 0.12], ['#5a5e62', 0.02]], 13);
  return toTexture(c);
}

// 红砖墙：每块砖 4×2 贴素，砖缝浅；窗户另外建模
export function brickTexture() {
  const c = canvas(64, 64);
  const g = c.getContext('2d')!;
  g.fillStyle = '#8a8178';
  g.fillRect(0, 0, 64, 64);
  const r = mulberry32(14);
  const tones = ['#9c4a35', '#a5543c', '#8e4130', '#b05f43'];
  for (let y = 0; y < 64; y += 3) {
    const off = (y / 3) % 2 ? 2 : 0;
    for (let x = -off; x < 64; x += 5) {
      g.fillStyle = tones[Math.floor(r() * tones.length)];
      g.fillRect(x, y, 4, 2);
    }
  }
  return toTexture(c);
}

// 土层、岩石侧面：横向分层的颗粒
export function soilTexture() {
  const { c } = speckle(64, '#6e4526', [['#5d3a20', 0.18], ['#7f5230', 0.1], ['#4a2e19', 0.04]], 15);
  return toTexture(c);
}
