// 可复现的种子随机数：同一个种子永远得到同一串结果
// 日程、行为都由 (存档种子, 游戏日, 成员, 时间块) 派生，读档后画面与读档前一致

export type Rand = () => number;

export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seeded(...parts: (string | number)[]): Rand {
  return mulberry32(hashString(parts.join('|')));
}

export function pick<T>(rand: Rand, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

export function range(rand: Rand, a: number, b: number): number {
  return a + (b - a) * rand();
}

export function weightedPick<T>(rand: Rand, items: readonly T[], weightOf: (it: T) => number): T | null {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return null;
  let r = rand() * total;
  let last: T | null = null;
  for (const it of items) {
    const w = weightOf(it);
    if (w <= 0) continue; // 权重为 0 的永远不会被抽中
    last = it;
    r -= w;
    if (r <= 0) return it;
  }
  return last;
}

// 洗牌（Fisher–Yates），返回新数组
export function shuffle<T>(rand: Rand, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
