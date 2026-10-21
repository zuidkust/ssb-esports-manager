// 可复现的种子随机数：同一个种子永远得到同一串结果
// 正式版服务端用 (世界种子, 分钟序号) 派生每个 tick 的随机数，保证可回放

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seeded(...parts) {
  return mulberry32(hashString(parts.join('|')));
}

export function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

export function range(rand, a, b) {
  return a + (b - a) * rand();
}

export function weightedPick(rand, items, weightOf) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return null;
  let r = rand() * total;
  for (const it of items) {
    r -= Math.max(0, weightOf(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
