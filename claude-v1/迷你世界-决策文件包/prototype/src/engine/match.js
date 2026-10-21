// 比赛模拟器（样板版）：开赛前一次性算完整场"剧本"，再按节奏逐条播放
// 实力 = 五人能力加权 × 当日状态 × 团队配合 + 随机（《成长属性体系》第 5 节）
// 正式版：赛前锁定种子与双方面板并存档，管理员无法影响

import { seeded, pick, range } from './rng.js';

const OPP_HEROES = ['亚索', '劫', '李青', '卡莉斯塔', '阿卡丽', '佛耶戈', '塞拉斯', '厄斐琉斯', '巴德', '杰斯', '酒桶'];

function playerPower(m) {
  const a = m.ability, s = m.status;
  const base = a.操作 * 0.3 + a.意识 * 0.25 + a.对线 * 0.2 + a.发育 * 0.15 + a.团队 * 0.1;
  const form = 0.85 + s.心情 / 400 + s.手感 / 500;
  return base * form;
}

export function createMatch(world, now, opponent) {
  const r = seeded('match', now.dateKey, opponent.name, Date.now() >> 16);
  const starters = world.computeStarters().map((id) => world.byId[id]);
  const sub = world.members.find((m) => !starters.includes(m));
  const pos = {
    top: starters.find((m) => m.id === 'shidian' || m.id === 'piju'),
    jg: world.byId.dangdeng, mid: world.byId.dibi, ad: world.byId.dishu, sup: world.byId.diaolong,
  };
  const teamwork = 1 + (pos.sup.ability.团队 - 50) / 300;
  const us = (starters.reduce((s, m) => s + playerPower(m), 0) / 5) * teamwork;
  const them = opponent.power * range(r, 0.92, 1.08);

  const lines = [];
  let gold = 0, kUs = 0, kThem = 0;
  let minute = 0;
  const push = (phase, text, tone = 'neutral', actors = [], extra = {}) => lines.push({ min: minute, phase, text, tone, actors: actors.map((m) => m.id), us: kUs, them: kThem, gold, ...extra });
  const hero = (m) => pick(r, m.def.heroes);
  const oppHero = () => pick(r, OPP_HEROES);
  const edge = () => (us - them) / 10 + range(r, -1, 1); // >0 对我方有利
  const texts = (id) => world.eventById[id]?.texts || [];
  const fill = (s, map) => s.replace(/\{([^}]+)\}/g, (_, k) => map[k] ?? (k.includes('/') ? pick(r, k.split('/')) : k));

  // ── 开赛 / BP ──
  push('开赛', fill(pick(r, texts('C_周赛开赛')), { 对手: opponent.name, 对手风格: opponent.style }), 'neutral', starters);
  push('开赛', `BP：${opponent.name}一手禁掉了${pos.ad.name}的${hero(pos.ad)}。吊龙："没事，我们拿${hero(pos.sup)}。"`, 'neutral', [pos.sup]);
  const topHero = pos.top.id === 'shidian' ? pick(r, ['全暴击石头人', '辅助装诺手', '肉装加里奥']) : hero(pos.top);
  push('开赛', `首发：上${pos.top.name}（${topHero}）、野${pos.jg.name}、中${pos.mid.name}、AD ${pos.ad.name}、辅${pos.sup.name}。替补席：${sub.name}。`, 'neutral', starters);

  // ── 对线期 ──
  minute = 3;
  if (/抓上|入侵/.test(opponent.style) && pos.top.id === 'piju' && edge() > -0.6) {
    push('对线', fill(pick(r, texts('C_批菊比赛被针对')), { 对手: opponent.name }), 'good', [pos.top]);
  } else if (edge() + (pos.top.ability.对线 - 40) / 20 > 0) {
    kUs++; gold += 400;
    push('对线', `3 分钟，上路${pos.top.name}抓住对面${oppHero()}的失误，换血赢了还拿下一血！`, 'good', [pos.top]);
  } else {
    kThem++; gold -= 400;
    push('对线', `3 分钟，${opponent.name}打野越塔，上路${pos.top.name}被拿下一血。${pos.top.name}："他这伤害不对劲。"`, 'bad', [pos.top]);
  }
  minute = 6;
  if (edge() + (pos.jg.ability.意识 - 42) / 25 > 0) {
    kUs += 2; gold += 600;
    push('对线', `6 分钟，${pos.jg.name}下路反蹲成功，配合${pos.sup.name}打出一换二。当邓："看我这波节奏。"`, 'good', [pos.jg, pos.sup]);
  } else {
    kThem++; gold -= 300;
    push('对线', `6 分钟，${pos.jg.name}的野区被反，对面打野疑似住在他家。`, 'bad', [pos.jg]);
  }
  minute = 9;
  if (pos.mid.ability.对线 + range(r, -15, 15) < 42) {
    kThem++; gold -= 350;
    push('对线', `9 分钟，中路${pos.mid.name}被单杀，但他默默回线继续补刀，补刀数居然不落后。`, 'bad', [pos.mid]);
  } else {
    gold += 250;
    push('对线', `9 分钟，${pos.mid.name}中路稳住了，还偷到一波河道蟹。`, 'good', [pos.mid]);
  }
  minute = 12;
  gold += Math.round(edge() * 450);
  push('对线', `${pos.ad.name}下路补刀 ${Math.round(range(r, 88, 112))}，零失误。地鼠："如何评价这条下路？"`, 'good', [pos.ad]);
  minute = 14;
  push('对线', `对线期结束，${Math.abs(gold) < 100 ? '双方经济持平' : `我方经济${gold > 0 ? '领先' : '落后'} ${(Math.abs(gold) / 1000).toFixed(1)}k`}，人头 ${kUs}:${kThem}。`, gold >= 0 ? 'good' : 'bad', []);

  // ── 团战期 ──
  minute = 17;
  const dragonWin = edge() + (pos.sup.ability.团队 - 55) / 30 > 0;
  if (dragonWin) {
    kUs += 2; kThem += 1; gold += 1200;
    push('团战', `17 分钟小龙团，吊龙一声"开"，我方 2 换 1 拿下小龙！`, 'good', [pos.sup]);
  } else {
    kThem += 3; kUs += 1; gold -= 1500;
    push('团战', `17 分钟小龙团，${pos.top.name}先手开团，回头一看队友都在回城。1 换 3。`, 'bad', [pos.top]);
  }
  minute = 21;
  push('团战', fill(pick(r, texts('C_吊龙比赛指挥')), {}), 'neutral', [pos.sup]);
  minute = 24;
  const g24 = Math.round(edge() * 900 + range(r, -800, 800));
  gold += g24;
  if (g24 >= 0) { kUs += 3; kThem += 1; push('团战', `24 分钟中路团战，${pos.ad.name}站桩输出打出 3 换 1，推掉中路二塔。`, 'good', [pos.ad]); }
  else { kUs += 1; kThem += 3; push('团战', `24 分钟中路团战失利，对面${oppHero()}绕后切到了${pos.ad.name}。`, 'bad', [pos.ad]); }

  if (gold < -2500) {
    minute = 26;
    if (pos.jg.persona.逆风意志 >= 55) push('团战', fill(pick(r, texts('C_当邓比赛不投了')), {}), 'good', [pos.jg]);
    else push('团战', fill(texts('C_赛中投降争议')[0] || '', {}).replace('0:6', `${kUs}:${kThem}`), 'bad', [pos.jg, pos.sup], { behind: true });
  }

  // ── 转折点 ──
  minute = 31;
  let comeback = 0;
  if (pos.top.id === 'shidian' && r() < 0.12) {
    push('转折点', fill(pick(r, texts('C_发明流奇袭比赛')), { 对手: opponent.name }), 'good', [pos.top], { highlight: true });
    comeback = 4000; kUs += 4;
  } else if (gold < 0 && pos.mid.ability.发育 + range(r, -10, 15) >= 68) {
    push('转折点', fill(pick(r, texts('C_弟必比赛翻盘')), { 对手: opponent.name }), 'good', [pos.mid], { highlight: true });
    comeback = 6000; kUs += 4; kThem += 1;
  } else {
    const hero2 = gold >= 0 ? pick(r, starters) : pos.mid;
    const decisive = edge() + gold / 3000;
    if (decisive > 0) {
      push('转折点', `第 ${minute} 分钟大龙团，吊龙一声"开"，${hero2.name}闪现进场！我方拿下大龙。`, 'good', [hero2], { highlight: true });
      comeback = 2500; kUs += 3; kThem += 1;
    } else {
      push('转折点', `第 ${minute} 分钟大龙团，对面抢下大龙，${hero2.name}的大招放空，墙都比敌人先吃到伤害。`, 'bad', [hero2], { highlight: true });
      comeback = -2500; kThem += 3; kUs += 1;
    }
  }
  gold += comeback;

  // ── 结局 ──
  minute = Math.round(range(r, 34, 39));
  const win = gold > 0;
  const resultTexts = texts('C_比赛结局');
  const resultText = fill(win ? resultTexts[0] : resultTexts[1], { 对手: opponent.name });
  push('结局', `${resultText}（${minute} 分钟，人头 ${kUs}:${kThem}）`, win ? 'good' : 'bad', starters, { highlight: true, final: true, win });
  const after = win ? texts('C_赛后庆功') : texts('C_赛后复盘吵架');
  push('赛后', pick(r, after), win ? 'good' : 'bad', starters);
  if (pos.top.id === 'piju' || sub.id === 'piju') push('赛后', pick(r, texts('C_批菊比赛嘴硬采访')), 'neutral', [world.byId.piju]);

  return { opponent, starters: starters.map((m) => m.id), subId: sub.id, lines, win, us, them };
}
