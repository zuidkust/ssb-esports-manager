// 站位（纯数据，测试不用建 WebGL 场景）
// 赛前会每人一个点，两两至少隔开约 1.2 米，避免身体和名字叠在一起。
// 早上进门在后墙外横向排开，同一时间只有排头走进门。

export interface StandingSpot {
  x: number;
  z: number;
  approach: string;
  facing: number;
  lead: boolean;
}

function face(x: number, z: number, fx: number, fz: number) {
  return Math.atan2(fx - x, fz - z);
}

// 与 netcafe.ts 的 TEAM_X 一致：每人站在自己那台机器的过道上
const TEAM_X = [-4.3, -2.9, -1.5, -0.1, 1.3, 2.7];

export function netcafeMeetingSpots(): StandingSpot[] {
  return TEAM_X.map((x, i) => ({
    x,
    // 前后错开半步，名字在画面上不会排成一条
    z: i % 2 === 0 ? -2.15 : -2.6,
    approach: `A${i}`,
    facing: Math.PI,
    lead: i === 0,
  }));
}

export function officeMeetingSpots(whiteboard: boolean): StandingSpot[] {
  if (whiteboard) {
    // 白板在左墙。两列站在过道里，避开工位（最左桌面约到 x=-4.45）
    const cols = [-6.2, -5.0];
    const rows = [-2.95, -1.6, 0.05];
    const spots: StandingSpot[] = [];
    cols.forEach((x, col) => {
      rows.forEach((z, row) => {
        const i = col * rows.length + row;
        spots.push({ x, z, approach: 'WB', facing: face(x, z, -7, -1.6), lead: i === 0 });
      });
    });
    return spots;
  }
  // 没有白板：空地两排，面向中间
  const xs = [-2.4, -0.9, 0.6];
  const zs = [1.15, 2.55];
  const spots: StandingSpot[] = [];
  zs.forEach((z, row) => {
    xs.forEach((x, col) => {
      const i = row * xs.length + col;
      spots.push({ x, z, approach: 'C', facing: face(x, z, -0.9, 1.85), lead: i === 0 });
    });
  });
  return spots;
}

/** 门外等候。墙在 z=-5，门洞大约 x∈[-6.4,-5.3]。沿墙外横向排开。 */
export function doorQueueSpot(index: number): { x: number; z: number } {
  const col = index % 3;
  const row = Math.floor(index / 3);
  const xs = [-7.05, -5.85, -4.65];
  return { x: xs[col], z: -6.35 - row * 1.25 };
}

export function minSeparation(pts: { x: number; z: number }[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
      if (d < best) best = d;
    }
  }
  return best;
}
