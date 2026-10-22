// 头发：发际线、发盖、发尖、刘海。点在头的局部空间里，头组上的 HEAD_SCALE 会连头发一起放大。
import * as THREE from 'three';
import type { Look } from '../data/roster';
import { HEAD_TOP } from './body';
import type { P3 } from './figure';

/** 头的截面：y、宽、深、前后偏移。下巴 y=0，最后一圈的 y 必须等于 HEAD_TOP。 */
export const HEAD: [number, number, number, number][] = [
  [0.0, 0.17, 0.085, 0.058],
  [0.035, 0.232, 0.175, 0.034],
  [0.09, 0.254, 0.232, 0.012],
  [0.17, 0.262, 0.25, 0],
  [0.25, 0.258, 0.256, -0.004],
  [0.305, 0.215, 0.215, -0.01],
  [HEAD_TOP, 0.13, 0.13, -0.012],
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function headAt(y: number) {
  const yy = Math.min(HEAD_TOP, Math.max(0, y));
  for (let i = 0; i < HEAD.length - 1; i++) {
    const [y0, w0, d0, z0] = HEAD[i], [y1, w1, d1, z1] = HEAD[i + 1];
    if (yy <= y1) {
      const t = (yy - y0) / (y1 - y0);
      return { hw: lerp(w0, w1, t) / 2, hd: lerp(d0, d1, t) / 2, z0: lerp(z0, z1, t) };
    }
  }
  const [, w, d, z0] = HEAD[HEAD.length - 1];
  return { hw: w / 2, hd: d / 2, z0 };
}

/** 头壳表面一点：th=0 正前方（+z），th>0 朝人物左手（+x） */
function shell(th: number, y: number, t = 0): P3 {
  const { hw, hd, z0 } = headAt(y);
  const s = Math.sin(th), c = Math.cos(th);
  const px = Math.sign(s) * Math.pow(Math.abs(s), 0.5);
  const pz = Math.sign(c) * Math.pow(Math.abs(c), 0.5);
  return [px * (hw + t), y, z0 + pz * (hd + t)];
}

/** 发际线：按 |th| 分段插值 [角度, 高度] */
function hairline(pts: [number, number][]) {
  return (th: number) => {
    const a = Math.abs(th);
    for (let i = 0; i < pts.length - 1; i++) {
      if (a <= pts[i + 1][0]) return lerp(pts[i][1], pts[i + 1][1], (a - pts[i][0]) / (pts[i + 1][0] - pts[i][0]));
    }
    return pts[pts.length - 1][1];
  };
}

/**
 * 一顶头发的外壳：发际线 hl 处厚 t，越往头顶越厚（bulk，体积感），
 * 额前发际线往前探出一道发檐（brim），头顶整体再抬高 top。
 */
interface Dome { hl: (th: number) => number; t: number; bulk: number; top: number; brim: number }

/** 外壳在 (th, y) 处离头皮的厚度 */
function domeT(d: Dome, th: number, y: number) {
  const y0 = d.hl(th);
  const k = clamp01((y - y0) / Math.max(0.01, HEAD_TOP - y0));
  // 两侧贴头皮，体积堆在头顶和前后
  const side = 0.45 + 0.55 * Math.abs(Math.cos(th));
  // 发际线附近贴着长，越往上越蓬：额前不会出现一大片朝下的发檐底面
  return d.t + d.bulk * Math.pow(k, 0.9) * lerp(side, 1, k * k);
}

/** 外壳表面一点；inset 往里缩（给凸起埋根用） */
function domeAt(d: Dome, th: number, y: number, inset = 0): P3 {
  const p = shell(th, Math.min(y, HEAD_TOP - 0.01), domeT(d, th, y) - inset);
  const k = clamp01((y - (HEAD_TOP - 0.08)) / 0.08);
  p[1] += (d.top + domeT(d, th, y) * 0.4) * k * k;
  return p;
}

function cap(d: Dome): P3[] {
  const pts: P3[] = [];
  const N = 20;
  for (let i = 0; i < N; i++) {
    const th = -Math.PI + (i / N) * Math.PI * 2;
    const y0 = d.hl(th);
    const front = Math.max(0, Math.cos(th));
    // 额前发际线做成锯齿：隔一个点往下、往外戳一点，像一缕缕刘海
    const back = Math.max(0, -Math.cos(th));
    const jag = (front > 0.35 || back > 0.5) && i % 2 === 0 ? 1 : 0;
    const edge = shell(th, y0 - jag * (0.016 * front + 0.012 * back), d.t + d.brim * front * front * (0.5 + jag) + jag * 0.004 * back);
    pts.push(edge);
    for (let y = Math.ceil(y0 / 0.045) * 0.045; y < HEAD_TOP - 0.01; y += 0.045) if (y > y0 + 0.02) pts.push(domeAt(d, th, y));
    // 顶圈往里收，头顶是个平缓的拱，不是平顶
    const tp = shell(th, HEAD_TOP - 0.01, domeT(d, th, HEAD_TOP) * 0.45);
    tp[1] += d.top + domeT(d, th, HEAD_TOP) * 0.55;
    pts.push(tp);
  }
  pts.push([0, HEAD_TOP + d.t + d.bulk + d.top + 0.012, -0.02]);
  return pts;
}

/**
 * 一个发尖：根埋在外壳里，只露出一截棱角分明的尖。
 * w 是根部宽度，dir 是尖的朝向，len 是露出外壳的长度。
 */
function tuft(d: Dome, th: number, y: number, w: number, dir: P3, len: number): P3[] {
  const { hw } = headAt(Math.min(y, HEAD_TOP - 0.02));
  const dth = w / 2 / Math.max(0.06, hw);
  const v = new THREE.Vector3(...dir).normalize();
  const c = domeAt(d, th, y, 0.002);
  const deep = domeT(d, th, y) * 0.8;
  return [
    domeAt(d, th - dth, y - 0.02, deep), domeAt(d, th + dth, y - 0.02, deep),
    domeAt(d, th - dth * 0.6, y + 0.03, deep), domeAt(d, th + dth * 0.6, y + 0.03, deep),
    domeAt(d, th - dth * 0.5, y, 0.003), domeAt(d, th + dth * 0.5, y, 0.003),
    [c[0] + v.x * len, c[1] + v.y * len, c[2] + v.z * len],
  ];
}

/** 一小片刘海：贴在额前 th0~th1 之间，从发际线盖到 yb，下沿在 tipTh 处收成尖 */
function bang(d: Dome, th0: number, th1: number, yb: number, tipTh: number, t = 0.026): P3[] {
  const yt = d.hl((th0 + th1) / 2) + 0.03;
  return [
    domeAt(d, th0, yt, 0.004), domeAt(d, th1, yt, 0.004), shell(th0, yt, 0.004), shell(th1, yt, 0.004),
    shell(th0, yb + 0.014, t), shell(th1, yb + 0.014, t), shell(th0, yb + 0.014, 0.004), shell(th1, yb + 0.014, 0.004),
    shell(tipTh, yb - 0.01, t * 0.9), shell(tipTh, yb - 0.01, 0.004),
  ];
}

/** 鬓角：耳前一小块 */
function sideburns(t: number, bottom = 0.135): P3[][] {
  return [-1, 1].map((sx) => {
    const th = sx * 1.32;
    return [shell(th, 0.215, t), shell(th + sx * 0.18, 0.215, t), shell(th, bottom, t - 0.006), shell(th + sx * 0.14, bottom + 0.01, t - 0.006), shell(th + sx * 0.08, 0.2, t + 0.012)];
  });
}

/** 发际线常用形：前额高 f，耳上 e，后脑 n */
const line = (f: number, e = 0.19, n = 0.075) => hairline([[0, f], [0.55, f - 0.008], [1.05, f - 0.04], [1.35, e], [1.75, e + 0.005], [2.3, 0.12], [Math.PI, n]]);

/** 各发型：返回若干个凸包点云 */
export function hairParts(style: Look['hairStyle']): P3[][] {
  const parts: P3[][] = [];
  switch (style) {
    case 'tousled': {
      // 阿鸡：短碎发，贴头皮，头顶和后脑几撮小翘，额前两小撮碎尖
      const d: Dome = { hl: line(0.264), t: 0.014, bulk: 0.02, top: 0.004, brim: 0.006 };
      parts.push(cap(d), ...sideburns(0.014));
      parts.push(tuft(d, 0.35, 0.325, 0.09, [0.5, 1, 0.1], 0.03));
      parts.push(tuft(d, -0.4, 0.325, 0.09, [-0.5, 1, 0.2], 0.026));
      parts.push(tuft(d, 1.0, 0.3, 0.09, [1, 0.7, -0.1], 0.022));
      parts.push(tuft(d, 2.5, 0.3, 0.1, [0.4, 0.6, -1], 0.026));
      parts.push(tuft(d, -2.6, 0.29, 0.1, [-0.3, 0.5, -1], 0.022));
      parts.push(bang(d, -0.45, -0.05, 0.238, -0.3, 0.024), bang(d, 0.1, 0.45, 0.245, 0.32, 0.022));
      break;
    }
    case 'quiff': {
      // 当邓：短发，前额那撮往上、往人物左手边抓起来，其余贴头
      const d: Dome = { hl: line(0.27), t: 0.014, bulk: 0.026, top: 0.008, brim: 0.006 };
      parts.push(cap(d), ...sideburns(0.014));
      parts.push(tuft(d, 0.0, 0.3, 0.14, [0.45, 1, 0.45], 0.04));
      parts.push(tuft(d, 0.6, 0.31, 0.11, [1, 0.8, 0.1], 0.032));
      parts.push(tuft(d, Math.PI - 0.3, 0.3, 0.1, [-0.2, 0.55, -1], 0.02));
      break;
    }
    case 'fringe': {
      // 狗粮：短发，短刘海往下压到额头一半，中间一个小分叉
      const d: Dome = { hl: line(0.262), t: 0.016, bulk: 0.022, top: 0.006, brim: 0.01 };
      parts.push(cap(d), ...sideburns(0.014));
      parts.push(bang(d, -0.62, -0.22, 0.228, -0.45), bang(d, -0.24, 0.16, 0.222, -0.05), bang(d, 0.14, 0.58, 0.232, 0.4));
      parts.push(tuft(d, 0.4, 0.33, 0.1, [0.7, 1, 0.1], 0.024));
      parts.push(tuft(d, Math.PI - 0.3, 0.3, 0.1, [-0.2, 0.55, -1], 0.02));
      break;
    }
    case 'sweep': {
      // 弟必：短侧分，刘海从人物左上薄薄地斜扫到右眉上方
      const d: Dome = { hl: line(0.272), t: 0.014, bulk: 0.02, top: 0.006, brim: 0.004 };
      parts.push(cap(d), ...sideburns(0.014));
      parts.push([
        domeAt(d, 0.95, 0.3, 0.004), domeAt(d, 0.6, 0.272, -0.004), shell(0.2, 0.25, 0.036), shell(-0.3, 0.225, 0.036), shell(-0.75, 0.215, 0.03),
        shell(-1.0, 0.25, 0.026), domeAt(d, -0.55, 0.3, -0.008), domeAt(d, 0.1, 0.32, -0.008), domeAt(d, 0.7, 0.33, -0.004),
        domeAt(d, 0, 0.29, 0.012), domeAt(d, -0.6, 0.27, 0.012),
      ]);
      parts.push(tuft(d, -0.7, 0.24, 0.08, [-0.55, -1, 0.35], 0.022));
      parts.push(tuft(d, Math.PI - 0.3, 0.3, 0.1, [-0.2, 0.55, -1], 0.02));
      break;
    }
    case 'crew': {
      // 吊隆、撇干：贴头平头，发际线方正
      const d: Dome = { hl: hairline([[0, 0.262], [0.6, 0.256], [1.0, 0.225], [1.3, 0.2], [1.75, 0.2], [2.2, 0.12], [Math.PI, 0.065]]), t: 0.016, bulk: 0.008, top: 0.006, brim: 0 };
      parts.push(cap(d), ...sideburns(0.014, 0.15));
      break;
    }
    // ── 路人款：形状更普通 ──
    case 'buzz':
      parts.push(cap({ hl: line(0.272, 0.2, 0.09), t: 0.01, bulk: 0.004, top: 0, brim: 0 }));
      break;
    case 'short':
      parts.push(cap({ hl: line(0.258), t: 0.022, bulk: 0.025, top: 0.01, brim: 0.01 }), ...sideburns(0.02));
      break;
    case 'messy': {
      const d: Dome = { hl: line(0.25), t: 0.025, bulk: 0.04, top: 0.015, brim: 0.015 };
      parts.push(cap(d));
      for (const th of [0.4, -0.6, 2.4]) parts.push(tuft(d, th, 0.31, 0.11, [Math.sin(th) * 0.6, 1, Math.cos(th) * 0.4 - 0.4], 0.035));
      break;
    }
    case 'side': {
      const d: Dome = { hl: line(0.25), t: 0.025, bulk: 0.035, top: 0.015, brim: 0.02 };
      parts.push(cap(d), tuft(d, -0.2, 0.27, 0.14, [-0.8, -0.6, 0.3], 0.04));
      break;
    }
  }
  return parts;
}

/** 外卖头盔外壳：比发盖再大一圈，前沿压到眉上 */
export function helmetShell(): P3[] {
  const hl = hairline([[0, 0.235], [1.0, 0.21], [1.57, 0.17], [2.4, 0.11], [Math.PI, 0.1]]);
  return cap({ hl, t: 0.05, bulk: 0.02, top: 0.02, brim: 0 });
}
