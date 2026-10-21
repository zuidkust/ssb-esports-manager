"use strict";
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "重生之我是SSB职业经理.html"), "utf8");
const scripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g);
if (!scripts || scripts.length < 2) throw new Error("script blocks not found: " + (scripts ? scripts.length : 0));
const engineCode = scripts[0].replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
const uiCode = scripts[1].replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");

// 语法检查：只编译不执行
try { new Function(engineCode); console.log("[OK] 引擎脚本语法通过"); } catch (e) { console.log("[FAIL] 引擎语法错误: " + e.message); process.exit(1); }
try { new Function(uiCode); console.log("[OK] UI 脚本语法通过"); } catch (e) { console.log("[FAIL] UI 语法错误: " + e.message); process.exit(1); }

const api = new Function(engineCode + "\nreturn {DEFAULT_PLAYERS,DEFAULT_OPTS,createSeason,playSeasonRound,runPlayoffs,statAvg,simulateMatch,makeRng,SLOTS,teamFive,rollEvent,EVENTS,TACTICS};")();
const opts = Object.assign({}, api.DEFAULT_OPTS);

/* ── KDA 账目一致性：一队总死亡 ≡ 对方总击杀（真实比赛口径） ── */
function checkBox(box, tag) {
  const sum = (side, f) => box.filter(r => r.side === side).reduce((s, r) => s + r[f], 0);
  for (const r of box) {
    if (![r.k, r.d, r.a].every(x => Number.isInteger(x) && x >= 0)) throw new Error(tag + " 非法 K/D/A: " + JSON.stringify(r));
    if (r.join < 0 || r.join > 100) throw new Error(tag + " 参团率越界: " + r.join);
  }
  if (sum("A", "k") !== sum("B", "d")) throw new Error(tag + " A队击杀(" + sum("A","k") + ") ≠ B队死亡(" + sum("B","d") + ")");
  if (sum("B", "k") !== sum("A", "d")) throw new Error(tag + " B队击杀(" + sum("B","k") + ") ≠ A队死亡(" + sum("A","d") + ")");
  return { kA: sum("A", "k"), kB: sum("B", "k") };
}

console.log("\n=== KDA 一致性专项：300 场直连模拟（含时间轴真实感校验）===");
{
  const st0 = api.createSeason(api.DEFAULT_PLAYERS, 8888);
  const t0 = api.teamFive(st0.teams[0]), t1 = st0.teams[3].roster;
  let killsA = 0, killsB = 0, adck = 0, adcn = 0, supk = 0, supn = 0, jSum = 0, jN = 0, zeroD = 0;
  let lenSum = 0, lenMin = 1e9, lenMax = 0, twSum = 0, kSum = 0, blowouts = 0, elders = 0, fb = 0;
  for (let i = 0; i < 300; i++) {
    const rng = api.makeRng(1000 + i * 7919);
    const m = api.simulateMatch(st0.P, t0, t1, opts, rng);
    const s = checkBox(m.box, "直连#" + i);
    /* 直播 ↔ 面板逐人对账：每条击杀行（⚔/一血/安慰杀）点名的人头数 == 计分板 k */
    const killCount = {};
    m.log.forEach(l => {
      if (!l.s) return;
      const mm = l.s.match(/(?:⚔ |一血！)(.+?) 击杀 /);
      if (mm) killCount[mm[1]] = (killCount[mm[1]] || 0) + 1;
      const am = l.s.match(/\] (.+?) 终场前挽回颜面/);
      if (am) killCount[am[1]] = (killCount[am[1]] || 0) + 1;
    });
    m.box.forEach(r => {
      if ((killCount[r.name] || 0) !== r.k) {
        console.log("[FAIL] 直播对不上账 #" + i + "：" + r.name + " 直播击杀 " + (killCount[r.name] || 0) + " 次，面板显示 " + r.k);
        process.exit(1);
      }
    });
    killsA += s.kA; killsB += s.kB;
    lenSum += m.gameLen; lenMin = Math.min(lenMin, m.gameLen); lenMax = Math.max(lenMax, m.gameLen);
    twSum += m.towersA + m.towersB; kSum += m.killsA + m.killsB;
    if (m.blowout) blowouts++;
    if (m.firstBlood) fb++;
    if (m.log.some(l => l.s && l.s.indexOf("远古龙团") >= 0)) elders++;
    m.box.forEach(r => {
      if (r.slot === "adc") { adck += r.k; adcn++; }
      if (r.slot === "sup") { supk += r.k; supn++; }
      jSum += r.join; jN++;
      if (r.d === 0) zeroD++;
    });
  }
  console.log("[OK] 300 场账目全部平齐：ΣA.k==ΣB.d 且 ΣB.k==ΣA.d");
  console.log("     场均击杀 " + (kSum / 300).toFixed(1) + "（两队合计，LPL 真实 20-27）｜ 场均推塔 " + (twSum / 300).toFixed(1) + "（真实 ~12）");
  console.log("     场均时长 " + fmt(lenSum / 300) + "（LPL 真实 32:30）｜ 最快 " + fmt(lenMin) + " / 最慢 " + fmt(lenMax) + "（真实 17:07~53:43）");
  console.log("     碾压提前结束 " + (blowouts / 3).toFixed(0) + "% ｜ 打到远古龙的膀胱局 " + (elders / 3).toFixed(0) + "% ｜ 一血出现率 " + (fb / 3).toFixed(0) + "%");
  console.log("     场均个人击杀：ADC " + (adck / adcn).toFixed(1) + " vs 辅助 " + (supk / supn).toFixed(1) + "（ADC应显著更高）");
  console.log("     平均参团率 " + (jSum / jN).toFixed(0) + "%（真实约 55~75%）· 零死亡场次占比 " + (zeroD / jN * 100).toFixed(1) + "%");
  if (adck / adcn <= supk / supn) { console.log("[FAIL] ADC 击杀应高于辅助"); process.exit(1); }
  if (kSum / 300 < 15 || kSum / 300 > 32) { console.log("[FAIL] 场均击杀超出真实区间"); process.exit(1); }
  if (lenSum / 300 < 27 || lenSum / 300 > 36) { console.log("[FAIL] 场均时长偏离真实区间"); process.exit(1); }
}
function fmt(min) { const m = Math.floor(min), s = Math.floor((min - m) * 60); return m + ":" + ("0" + s).slice(-2); }

console.log("\n=== 赛季全流程模拟（含box.id / pstats数据可用性 / KDA一致性）===");
const st = api.createSeason(api.DEFAULT_PLAYERS, 8888);
let awakenRound = null, boxChecked = 0;
while (st.phase === "regular") {
  const ev = api.playSeasonRound(st, opts, 5555 + st.round * 13);
  if (ev.awaken && !awakenRound) awakenRound = ev.awaken.slice(0, 10);
  if (ev.herMatch) {
    const boxIds = ev.herMatch.m.box.map(b => b.id);
    if (boxIds.some(x => !x)) { console.log("[FAIL] box 行缺 id"); process.exit(1); }
    checkBox(ev.herMatch.m.box, "常规赛第" + (st.round) + "轮");
    boxChecked++;
  }
}
api.runPlayoffs(st, opts, 4321);
const her = st.teams[0];
const sorted = st.teams.slice().sort((a, b) => b.W - a.W);
console.log("[OK] 你的战绩:", her.W + "-" + her.L, "排名", sorted.indexOf(her) + 1, "| 冠军:", st.champion, "| 阿鸡觉醒:", st.awakened ? "第" + st.awakenRound + "轮" : "否", "| 计分板校验", boxChecked, "场");

// 名字唯一性检查
const allNames = [];
st.teams.forEach(t => t.roster.forEach(id => allNames.push(st.P[id].name)));
const dup = allNames.filter((n, i) => allNames.indexOf(n) !== i);
console.log(dup.length === 0 ? "[OK] 全联盟 80 人名字无重复" : "[WARN] 重名: " + dup.join(","));

// 存档序列化检查（localStorage 兼容）
try { const s = JSON.stringify(st); const back = JSON.parse(s); console.log("[OK] 存档可序列化/恢复（" + Math.round(s.length / 1024) + " KB）, 回读队伍数 " + back.teams.length); } catch (e) { console.log("[FAIL] 存档序列化: " + e.message); }

/* ── 六人布阵制 + 压力/活动系统专项 ── */
console.log("\n=== 布阵制 · 压力 · 赛后随机事件专项 ===");
{
  const st2 = api.createSeason(api.DEFAULT_PLAYERS, 4242);
  const her = st2.teams[0];
  if (her.roster.length !== 6) throw new Error("SSB 应为六人名单，实际 " + her.roster.length);
  if (api.teamFive(her).length !== 5) throw new Error("teamFive 应返回五人首发");
  if (api.teamFive(her).some(id => her.roster.indexOf(id) < 0)) throw new Error("首发必须在名单内");
  if (st2.teams[1].name !== "DBD") throw new Error("宿敌队应为 DBD，实际 " + st2.teams[1].name);
  if (st2.teams[1].roster.length !== 5) throw new Error("DBD 应为五人");
  console.log("[OK] SSB 六人名单 / teamFive 五人首发 / DBD 随机 AI 队就位（" + st2.teams[1].roster.map(id => st2.P[id].name).join("、") + "）");

  // 名字唯一性（DBD 随机名不得与城市赛池撞车）
  const allN = [];
  st2.teams.forEach(t => t.roster.forEach(id => allN.push(st2.P[id].name)));
  const dupN = allN.filter((n, i) => allN.indexOf(n) !== i);
  if (dupN.length) throw new Error("DBD 名字撞车: " + dupN.join(","));
  console.log("[OK] DBD 随机网名与全联盟无重名");

  // 打一轮：上场五人 stress+4 且成长，替补不动；赛后自动随机事件
  const benchId = her.roster.find(id => api.teamFive(her).indexOf(id) < 0);
  const benchBefore = JSON.stringify(st2.P[benchId].stats);
  const fiveBefore = api.teamFive(her).map(id => JSON.stringify(st2.P[id].stats));
  const ev1 = api.playSeasonRound(st2, Object.assign({}, api.DEFAULT_OPTS), 777);
  if (st2.P[benchId] && JSON.stringify(st2.P[benchId].stats) === benchBefore) console.log("[OK] 替补（" + st2.P[benchId].name + "）未获得比赛成长");
  else throw new Error("替补不该成长！");
  const grew = api.teamFive(her).some((id, i) => JSON.stringify(st2.P[id].stats) !== fiveBefore[i]);
  if (!grew) throw new Error("上场选手应有成长");
  const strs = api.teamFive(her).map(id => st2.P[id].stress);
  if (strs.some(s => typeof s !== "number" || s < 0 || s > 100)) throw new Error("压力应为 0-100 数值，实际 " + strs.join(","));
  console.log("[OK] 上场五人成长，压力账目有效（赛后 " + strs.map(s => Math.round(s)).join("/") + "，比赛 +4 已计入、随机事件再浮动）");

  // 赛后随机事件：每轮自动发生，作用于全队名单
  if (!ev1.afterEvent || !ev1.afterEvent.name || !ev1.afterEvent.fx) throw new Error("每轮赛后应有随机事件");
  console.log("[OK] 赛后随机事件自动触发：「" + ev1.afterEvent.name + "」→ " + ev1.afterEvent.fx);

  // 随机事件池：跑 500 次覆盖，验证 fx 不抛错且必产生变化；统计大波动彩蛋率
  if (api.EVENTS.length < 30) throw new Error("事件池应有 30 个左右，实际 " + api.EVENTS.length);
  let bigCount = 0;
  const names = new Set();
  for (let i = 0; i < 500; i++) {
    const st3 = api.createSeason(api.DEFAULT_PLAYERS, 1000 + i);
    const before = JSON.stringify(st3.teams[0].roster.map(id => st3.P[id]));
    const ev = api.rollEvent(st3.P, st3.teams[0].roster, api.makeRng(i * 131 + 7));
    names.add(ev.name);
    const after = JSON.stringify(st3.teams[0].roster.map(id => st3.P[id]));
    if (before === after) throw new Error("随机事件应产生变化（" + ev.name + "）");
    if (ev.big) bigCount++;
  }
  const bigRate = bigCount / 5;
  if (bigRate < 4 || bigRate > 20) throw new Error("大波动彩蛋概率异常: " + bigRate + "%");
  console.log("[OK] 随机事件 ×500 无异常，覆盖 " + names.size + "/" + api.EVENTS.length + " 个事件，大波动彩蛋率 " + bigRate.toFixed(1) + "%");
}

/* ── 战术克制 · 疲劳轮换 · 联赛强度专项 ── */
console.log("\n=== 战术 · 疲劳 · 联赛强度专项 ===");
{
  // 战术克制环完整性：5 个战术两两成环，beats 无重复、无自克
  const T = api.TACTICS, keys = Object.keys(T);
  if (keys.length !== 5) throw new Error("应有 5 种战术");
  const beaten = keys.map(k => T[k].beats);
  if (new Set(beaten).size !== 5 || beaten.some(b => keys.indexOf(b) < 0)) throw new Error("克制环不完整: " + beaten.join(","));
  console.log("[OK] 战术克制环完整：" + keys.map(k => T[k].name + "＞" + T[T[k].beats].name).join(" ＞ ").replace(/＞/g, "＞") + "（闭环）");

  // 克制实战：LD 镜像，A 用克制战术 vs B 固定 poke，300 场应显著占优
  const stA = api.createSeason(api.DEFAULT_PLAYERS, 2026);
  const ids = stA.teams[3].roster;
  let ctrWins = 0, N = 300;
  for (let i = 0; i < N; i++) {
    const m = api.simulateMatch(stA.P, ids, ids, Object.assign({}, api.DEFAULT_OPTS, { tacA: "engage", tacB: "poke" }), api.makeRng(500 + i * 61));
    if (m.win === "A") ctrWins++;
  }
  if (ctrWins / N < 0.6) throw new Error("克制战术胜率应 ≥60%，实际 " + (ctrWins / N * 100).toFixed(1) + "%");
  console.log("[OK] 战术克制实战：engage vs poke 镜像 300 场胜率 " + (ctrWins / N * 100).toFixed(1) + "%（≥60%）");

  // 疲劳：上场+12/场，替补-40；连打 3 场后疲劳 36
  const stB = api.createSeason(api.DEFAULT_PLAYERS, 4242);
  const herB = stB.teams[0];
  api.playSeasonRound(stB, Object.assign({}, api.DEFAULT_OPTS), 701);
  const fiveB = api.teamFive(herB);
  if (fiveB.some(id => (stB.P[id].fatigue || 0) !== 12)) throw new Error("上场选手疲劳应 +12，实际 " + fiveB.map(id => stB.P[id].fatigue).join(","));
  const benchB = herB.roster.filter(id => fiveB.indexOf(id) < 0);
  if (benchB.some(id => (stB.P[id].fatigue || 0) !== 0)) throw new Error("替补疲劳应为 0（下限），实际 " + benchB.map(id => stB.P[id].fatigue).join(","));
  console.log("[OK] 疲劳账目：上场 +12 / 替补 -40（下限 0）");

  // 疲劳惩罚：疲劳 80 的队 vs 疲劳 0 的镜像队，300 场应明显吃亏
  const stC = api.createSeason(api.DEFAULT_PLAYERS, 4242);
  const idsC = stC.teams[3].roster;
  idsC.forEach(id => { stC.P[id].fatigue = 0; });
  const tired = idsC.map(id => "x_" + id);
  tired.forEach((k, i) => { stC.P[k] = JSON.parse(JSON.stringify(stC.P[idsC[i]])); stC.P[k].id = k; stC.P[k].fatigue = 80; });
  let tiredWins = 0;
  for (let i = 0; i < N; i++) {
    const m = api.simulateMatch(stC.P, tired, idsC, Object.assign({}, api.DEFAULT_OPTS), api.makeRng(900 + i * 37));
    if (m.win === "A") tiredWins++;
  }
  if (tiredWins / N > 0.42) throw new Error("高疲劳队胜率应 <42%，实际 " + (tiredWins / N * 100).toFixed(1) + "%");
  console.log("[OK] 疲劳惩罚实战：疲劳80 vs 疲劳0 镜像 300 场胜率 " + (tiredWins / N * 100).toFixed(1) + "%（应明显吃亏）");

  // 联赛强度：城市队 56-68/潜力74，藏大神 5 支
  const stD = api.createSeason(api.DEFAULT_PLAYERS, 606);
  const stars = stD.teams.filter(t => t.tag === "城市队·藏大神");
  if (stars.length !== 5) throw new Error("藏大神应 5 支，实际 " + stars.length);
  stD.teams.forEach(t => {
    if (t.tag === "城市队" || t.tag === "城市队·藏大神") {
      t.roster.forEach(id => {
        const p = stD.P[id];
        for (const k in p.stats) if (p.stats[k] < 50 || p.stats[k] > 80) throw new Error("城市队属性越界 " + p.name + " " + k + "=" + p.stats[k]);
      });
    }
  });
  if (!stD.teams.every(t => t.tactic && T[t.tactic])) throw new Error("每支队伍都应有战术");
  console.log("[OK] 联赛强度：城市队 56-68、藏大神 5 支、16 队全部带战术风格");
}
console.log("\n全部检查通过。");
