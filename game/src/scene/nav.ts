// 极简寻路：办公室过道节点图 + Dijkstra
// 节点坐标 (x, z)，单位米；办公室范围 x∈[-7,7]，z∈[-5,5]，门在后墙左侧

export const NODES: Record<string, [number, number]> = {
  D: [-5.85, -4.75], DI: [-5.85, -3.7],
  AL: [-5.0, -2.85], A0: [-3.6, -2.85], A1: [-1.5, -2.85], A2: [0.6, -2.85], AR: [2.1, -2.85],
  S1: [3.4, -3.15], SN: [4.3, -3.75], ST: [4.3, -1.6],
  WB: [-5.6, -1.6],
  BL: [-5.0, 0.05], B0: [-3.6, 0.05], B1: [-1.5, 0.05], B2: [0.6, 0.05], BR: [2.1, 0.05],
  L2: [-5.0, 1.3], SO: [-5.5, 2.4],
  C: [0.0, 1.8], CH: [3.1, 1.0], LG: [4.4, 2.0],
  WC: [2.05, -3.85], FR: [6.0, -3.75],
};

const EDGES = [
  'D-DI', 'DI-AL', 'AL-A0', 'A0-A1', 'A1-A2', 'A2-AR', 'AR-S1', 'S1-SN', 'AR-ST', 'ST-S1',
  'AL-WB', 'WB-BL', 'AL-BL', 'BL-B0', 'B0-B1', 'B1-B2', 'B2-BR', 'BR-AR', 'BR-CH', 'CH-LG',
  'BR-C', 'C-L2', 'BL-L2', 'L2-SO', 'C-CH', 'ST-CH', 'AR-WC', 'S1-WC', 'SN-FR',
];

const ADJ: Record<string, [string, number][]> = {};
for (const e of EDGES) {
  const [a, b] = e.split('-');
  const d = Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]);
  (ADJ[a] ||= []).push([b, d]);
  (ADJ[b] ||= []).push([a, d]);
}

export function nearestNode(x: number, z: number): string {
  let best = 'C', bd = Infinity;
  for (const [k, [nx, nz]] of Object.entries(NODES)) {
    const d = Math.hypot(nx - x, nz - z);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

export function shortestPath(from: string, to: string): string[] {
  if (from === to) return [from];
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, string> = {};
  const open = new Set([from]);
  while (open.size) {
    let u: string | null = null;
    for (const n of open) if (u === null || dist[n] < dist[u]) u = n;
    if (u === null) break;
    open.delete(u);
    if (u === to) break;
    for (const [v, w] of ADJ[u] || []) {
      const nd = dist[u] + w;
      if (nd < (dist[v] ?? Infinity)) {
        dist[v] = nd;
        prev[v] = u;
        open.add(v);
      }
    }
  }
  const path = [to];
  let cur = to;
  while (prev[cur]) path.unshift((cur = prev[cur]));
  return path[0] === from ? path : [from, to];
}

// 从当前位置走到目标点：当前位置 → 起点附近节点 → … → 目标接近节点 → 目标点
export function route(fromX: number, fromZ: number, approach: string, toX: number, toZ: number, startNode?: string): { x: number; z: number }[] {
  const a = startNode || nearestNode(fromX, fromZ);
  const nodes = shortestPath(a, approach);
  const pts = nodes.map((n) => ({ x: NODES[n][0], z: NODES[n][1] }));
  pts.push({ x: toX, z: toZ });
  // 去掉与起点重合的点
  return pts.filter((p, i) => i > 0 || Math.hypot(p.x - fromX, p.z - fromZ) > 0.05);
}
