// 极简寻路：过道节点图 + Dijkstra。每个场地有自己的节点图（office.ts / netcafe.ts）
// 节点坐标 (x, z)，单位米；房间范围 x∈[-7,7]，z∈[-5,5]，门在后墙左侧

export class NavGraph {
  private adj: Record<string, [string, number][]> = {};

  constructor(public nodes: Record<string, [number, number]>, edges: string[]) {
    for (const e of edges) {
      const [a, b] = e.split('-');
      const d = Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1]);
      (this.adj[a] ||= []).push([b, d]);
      (this.adj[b] ||= []).push([a, d]);
    }
  }

  nearestNode(x: number, z: number): string {
    let best = '', bd = Infinity;
    for (const [k, [nx, nz]] of Object.entries(this.nodes)) {
      const d = Math.hypot(nx - x, nz - z);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  shortestPath(from: string, to: string): string[] {
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
      for (const [v, w] of this.adj[u] || []) {
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

  // 从 from 出发能走到的所有节点（自测用：节点图不能有孤岛）
  reachable(from: string): Set<string> {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length) {
      for (const [v] of this.adj[queue.shift()!] || []) {
        if (seen.has(v)) continue;
        seen.add(v);
        queue.push(v);
      }
    }
    return seen;
  }

  // 从当前位置走到目标点：当前位置 → 起点附近节点 → … → 目标接近节点 → 目标点
  route(fromX: number, fromZ: number, approach: string, toX: number, toZ: number, startNode?: string): { x: number; z: number }[] {
    const a = startNode || this.nearestNode(fromX, fromZ);
    const nodes = this.shortestPath(a, approach);
    const pts = nodes.map((n) => ({ x: this.nodes[n][0], z: this.nodes[n][1] }));
    pts.push({ x: toX, z: toZ });
    // 去掉与起点重合的点
    return pts.filter((p, i) => i > 0 || Math.hypot(p.x - fromX, p.z - fromZ) > 0.05);
  }
}

// 小办公室的过道
export const OFFICE_NAV = new NavGraph(
  {
    D: [-5.85, -4.75], DI: [-5.85, -3.7],
    AL: [-5.0, -2.85], A0: [-3.6, -2.85], A1: [-1.5, -2.85], A2: [0.6, -2.85], AR: [2.1, -2.85],
    S1: [3.4, -3.15], SN: [4.3, -3.75], ST: [4.3, -1.6],
    WB: [-5.6, -1.6],
    BL: [-5.0, 0.05], B0: [-3.6, 0.05], B1: [-1.5, 0.05], B2: [0.6, 0.05], BR: [2.1, 0.05],
    L2: [-5.0, 1.3], SO: [-5.5, 2.4],
    C: [0.0, 1.8], CH: [3.1, 1.0], LG: [4.4, 2.0],
    WC: [2.05, -3.85], FR: [6.0, -3.75],
  },
  [
    'D-DI', 'DI-AL', 'AL-A0', 'A0-A1', 'A1-A2', 'A2-AR', 'AR-S1', 'S1-SN', 'AR-ST', 'ST-S1',
    'AL-WB', 'WB-BL', 'AL-BL', 'BL-B0', 'B0-B1', 'B1-B2', 'B2-BR', 'BR-AR', 'BR-CH', 'CH-LG',
    'BR-C', 'C-L2', 'BL-L2', 'L2-SO', 'C-CH', 'ST-CH', 'AR-WC', 'S1-WC', 'SN-FR',
  ],
);
