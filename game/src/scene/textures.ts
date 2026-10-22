// 程序化贴图：全部用 Canvas 现画，样板不依赖任何外部美术资源
import * as THREE from 'three';
import { mulberry32 } from '../core/rng';

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c: HTMLCanvasElement, { repeat = [1, 1], srgb = true }: { repeat?: [number, number]; srgb?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 木地板：暖色橡木长条拼板
export function floorTexture() {
  const c = canvas(1024, 1024);
  const g = c.getContext('2d')!;
  const r = mulberry32(7);
  const plankH = 64;
  for (let y = 0; y < 1024; y += plankH) {
    let x = -Math.floor(r() * 400);
    while (x < 1024) {
      const len = 300 + r() * 420;
      const base = 0.85 + r() * 0.18;
      const col = [Math.round(176 * base), Math.round(124 * base), Math.round(82 * base)];
      g.fillStyle = `rgb(${col.join(',')})`;
      g.fillRect(x, y, len, plankH);
      // 木纹
      for (let i = 0; i < 14; i++) {
        const yy = y + 4 + r() * (plankH - 8);
        g.strokeStyle = `rgba(${r() < 0.5 ? '90,55,30' : '220,170,120'},${0.08 + r() * 0.12})`;
        g.lineWidth = 1 + r() * 1.5;
        g.beginPath();
        g.moveTo(x, yy);
        for (let xx = x; xx < x + len; xx += 40) g.lineTo(xx, yy + Math.sin(xx * 0.02 + i) * 2);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,24,12,0.55)';
      g.fillRect(x, y, 2, plankH);
      x += len;
    }
    g.fillStyle = 'rgba(40,24,12,0.5)';
    g.fillRect(0, y, 1024, 2);
  }
  return toTexture(c, { repeat: [3.2, 3.2] });
}

// 墙面：细微肌理的灰泥（石灰水洗墙）
export function plasterTexture() {
  const c = canvas(512, 512);
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 512);
  const r = mulberry32(11);
  for (let i = 0; i < 9000; i++) {
    const v = 225 + Math.floor(r() * 30);
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.35)`;
    g.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3);
  }
  return toTexture(c, { repeat: [3, 1.5] });
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

// 地毯：米色编织纹 + 锈橙色边
export function rugTexture(main = '#d9c7aa', border = '#b5643a') {
  const c = canvas(512, 512);
  const g = c.getContext('2d')!;
  g.fillStyle = border;
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = main;
  g.fillRect(28, 28, 456, 456);
  const r = mulberry32(5);
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
    g.fillRect(r() * 512, r() * 512, 2, 2);
  }
  g.strokeStyle = 'rgba(120,70,40,0.35)';
  g.lineWidth = 3;
  g.strokeRect(48, 48, 416, 416);
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
  const t = new THREE.CanvasTexture(c);
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
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
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
    this.texture = new THREE.CanvasTexture(this.canvas);
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
  const t = new THREE.CanvasTexture(c);
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
  const t = new THREE.CanvasTexture(c);
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
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
