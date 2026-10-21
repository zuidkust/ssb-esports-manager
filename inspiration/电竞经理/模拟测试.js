"use strict";
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "引擎调试台.html"), "utf8");
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!m) throw new Error("engine script not found");
const api = new Function(m[1] + "\nreturn {DEFAULT_PLAYERS,PRESETS,DEFAULT_OPTS,simulateMatch,simulateBatch,resolveRosters,makeRng,createSeason,playSeasonRound,runPlayoffs,statAvg};")();
const P = JSON.parse(JSON.stringify(api.DEFAULT_PLAYERS));
const opts = Object.assign({}, api.DEFAULT_OPTS);

console.log("=== 1000 场平衡校验（v0.2 经济模型：追赶补偿+高地决战 · σ" + opts.sigma + " 雪球" + opts.snowball + "）===");
for (const pr of api.PRESETS) {
  const r = api.resolveRosters(P, pr);
  const res = api.simulateBatch(P, r.A, r.B, opts, 1000, 12345);
  const kmTotal = res.kmGames[2] + res.kmGames[1] + res.kmGames[0];
  const kmInfo = kmTotal > 0
    ? " | 神开局" + (res.kmGames[2] / 10).toFixed(0) + "%(胜" + (res.kmGames[2] ? (res.kmWins[2] / res.kmGames[2] * 100).toFixed(0) : "-") + "%) 鬼开局" + (res.kmGames[0] / 10).toFixed(0) + "%(胜" + (res.kmGames[0] ? (res.kmWins[0] / res.kmGames[0] * 100).toFixed(0) : "-") + "%)"
    : "";
  console.log(
    pr.label.padEnd(28),
    "A胜率", (res.winsA / 10).toFixed(1) + "%",
    "| 节点", res.avgNodes.toFixed(1),
    "| 碾压", (res.blowoutRate * 100).toFixed(0) + "%",
    "| 经济差", Math.round(res.avgDiff) + "g",
    "| 翻转", (res.flips / 1000).toFixed(2),
    kmInfo
  );
}

console.log("\n=== 阿鸡觉醒对比（每档 500 场，vs LD）===");
const prHard = api.PRESETS[1];
const rh = api.resolveRosters(P, prHard);
const ra = api.simulateBatch(P, rh.A, rh.B, Object.assign({}, opts, { awakened: false }), 500, 777);
const rb = api.simulateBatch(P, rh.A, rh.B, Object.assign({}, opts, { awakened: true }), 500, 778);
console.log("  未觉醒:", (ra.winsA / 5).toFixed(1) + "%", "| 已觉醒:", (rb.winsA / 5).toFixed(1) + "%");

console.log("\n=== 计分板冒烟（种子 42）===");
const pr0 = api.PRESETS[0];
const r0 = api.resolveRosters(P, pr0);
const mm = api.simulateMatch(P, r0.A, r0.B, opts, api.makeRng(42));
console.log("win=" + mm.win + " mvp=" + (P[mm.mvpId] ? P[mm.mvpId].name : mm.mvpId));
mm.box.forEach(b => {
  console.log("  [" + b.side + "] " + b.slot + " " + b.name + " " + b.k + "/" + b.d + "/" + b.a + " 参团" + b.join + "% 输出" + b.share.toFixed(1) + "% 评级" + b.grade + (b.mvp ? " ★MVP" : "") + (b.kami ? " [" + b.kami + "]" : ""));
});

console.log("\n=== 赛季模式冒烟测试（16 队 · 15 轮 BO1 + BO3 季后赛）===");
for (let trial = 0; trial < 3; trial++) {
  const st = api.createSeason(api.DEFAULT_PLAYERS, 4000 + trial * 111);
  let awakenMsg = "";
  while (st.phase === "regular") {
    const ev = api.playSeasonRound(st, opts, 3000 + st.round * 17 + trial * 91);
    if (ev.awaken && !awakenMsg) awakenMsg = ev.awaken.slice(0, 12) + "...";
  }
  api.runPlayoffs(st, opts, 9000 + trial * 37);
  const her = st.teams[0];
  const sorted = st.teams.slice().sort((a, b) => b.W - a.W);
  const rank = sorted.indexOf(her) + 1;
  const ajiBase = st.herBase["aji"];
  const ajiNow = api.statAvg(st.P["aji"]);
  const mvpTop = Object.keys(st.mvp).map(k => [st.P[k] ? st.P[k].name : k, st.mvp[k]]).sort((a, b) => b[1] - a[1])[0];
  console.log("  试炼" + (trial + 1) + ": 你的常规赛 " + her.W + "-" + her.L + "（第" + rank + "名）| 阿鸡 " + ajiBase.toFixed(1) + "→" + ajiNow.toFixed(1) + (st.awakened ? "（第" + st.awakenRound + "轮觉醒）" : "（未觉醒）") + " | 冠军 " + st.champion + " | MVP王 " + mvpTop[0] + "×" + mvpTop[1]);
  if (trial === 0) {
    console.log("  -- 试炼1 积分榜前5：");
    sorted.slice(0, 5).forEach((t, i) => console.log("     " + (i + 1) + ". " + t.name + " " + t.W + "-" + t.L + " (" + t.tag + ")"));
    console.log("  -- 你的队员成长：");
    st.teams[0].roster.forEach(id => {
      const p = st.P[id];
      console.log("     " + p.name + " " + st.herBase[id].toFixed(1) + " → " + api.statAvg(p).toFixed(1) + " (潜力" + p.potential + ")" + (p.awakened ? " 已觉醒" : ""));
    });
    console.log("  -- 季后赛前4行：");
    st.playoffLog.slice(0, 4).forEach(l => console.log("     " + l));
  }
}
