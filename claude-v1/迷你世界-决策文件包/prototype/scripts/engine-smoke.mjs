// 引擎冒烟测试：在 Node 里跑一天的模拟，打印事件分布与样例
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { World } = await server.ssrLoadModule('/src/engine/simulator.js');
const { createMatch } = await server.ssrLoadModule('/src/engine/match.js');
const { beijingParts } = await server.ssrLoadModule('/src/world/clock.js');
const w = new World();
const base = Date.UTC(2026, 9, 21, 0, 0) - 8 * 3600e3; // 北京时间 10/21 周三 00:00
const counts = {};
let n = 0;
w.backfill(beijingParts(base + 10.5 * 3600e3));
console.log('回填条数', w.log.length);
for (let min = 7 * 60; min < 22 * 60; min += 2) {
  const now = beijingParts(base + min * 60e3);
  w.update(now, 2);
  if (min % 6 === 0) { const e = w.generate(now); if (e) { counts[e.level] = (counts[e.level] || 0) + 1; n++; } }
}
console.log('生成', n, counts, '日志', w.log.length);
for (const e of w.log.slice(0, 400).filter((e) => !e.routine).slice(0, 25)) console.log(e.time, `[${e.level}/${e.category}]`, e.text, e.cause ? ' ← ' + e.cause : '');
const unresolved = w.log.filter((e) => /\{|\}/.test(e.text));
console.log('残留占位符', unresolved.map((e) => e.text));
const fri = beijingParts(base + 2 * 86400e3 + 15 * 3600e3);
w.update(fri, 1);
const m = createMatch(w, fri, w.opponentFor(fri));
console.log('\n比赛', m.win ? '胜' : '负', m.us.toFixed(1), m.them.toFixed(1));
for (const l of m.lines) console.log(String(l.min).padStart(2), l.phase, l.text);
await server.close();
