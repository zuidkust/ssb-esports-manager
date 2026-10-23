// 把 docs/事件库-v0.1.md 的素材库（data/events.json）转成游戏内可用的 v1 事件库。
// 只接能映射到现行模型的事件；旧的监督 / 天意 / 周赛 / 段位系统一律不进。
// 用法：node scripts/build-event-library.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.dirname(here);
const repoRoot = path.dirname(gameRoot);
const srcPath = path.join(repoRoot, 'data', 'events.json');
const outPath = path.join(gameRoot, 'src', 'data', 'events-v1.json');
const reportPath = path.join(repoRoot, 'docs', '事件库-接入报告-v1.md');

const NAME_ID = { 施颠: 'aji', 当邓: 'dangdeng', 地鼠: 'gouliang', 弟必: 'dibi', 吊龙: 'diaolong', 批菊: 'piegan' };
const NAME_CN = { aji: '阿鸡', dangdeng: '当邓', gouliang: '狗粮', dibi: '弟必', diaolong: '吊隆', piegan: '撇干' };
const OLD_NAMES = Object.keys(NAME_ID);
const RENAME = Object.fromEntries(OLD_NAMES.map((n) => [n, NAME_CN[NAME_ID[n]]]));

const STATUS = new Set(['体力', '心情', '专注', '手感', '饥饿', '疲劳', '压力']);
const PERSONA = new Set(['嘴硬', '心态倾向', '胜负心', '逆风意志', '创新欲', '话痨', '摸鱼倾向', '甩锅倾向', '爱睡觉']);
const ABILITY = { 对线: 'lane', 游走: 'roam', 团战: 'fight', 团队: 'fight', 意识: 'sense', 操作: 'mech', 英雄池: 'pool', 发育: 'lane', 心态: 'mental' };
const DROP_CATEGORY = new Set(['监督', '天意', '比赛']);
const LEVEL_WEIGHT = { 日常: 2, 有趣: 3, 剧情: 4, 重大: 6 };

const ROLE_KIND = new Map([
  ['主角', { kind: 'any' }],
  ['全员', { kind: 'all' }],
  ['摸鱼者', { kind: 'slacker' }],
  ['发现者', { kind: 'other' }],
  ['甲', { kind: 'any' }],
  ['乙', { kind: 'other' }],
  ['队友', { kind: 'other' }],
  ['替补', { kind: 'bench' }],
  ['打野者', { kind: 'jungle' }],
  ['发起者', { kind: 'any' }],
  ['吃瓜者', { kind: 'any' }],
  ['奶人者', { kind: 'other' }],
  ['睡觉者', { kind: 'sleeping' }],
  ['早到者', { kind: 'early' }],
  ['迟到者', { kind: 'late' }],
  ['加班者', { kind: 'overtime' }],
  ['甩锅者', { kind: 'any' }],
  ['背锅者', { kind: 'other' }],
  ['被甩者', { kind: 'other' }],
  ['红温者', { kind: 'any' }],
  ['安慰者', { kind: 'other' }],
  ['指出者', { kind: 'any' }],
  ['目标', { kind: 'other' }],
  ['漏单者', { kind: 'other' }],
  ['阴阳者', { kind: 'other' }],
  ['制作者', { kind: 'other' }],
  ['炫耀者', { kind: 'any' }],
  ['护短者', { kind: 'other' }],
  ['翻账者', { kind: 'other' }],
  ['请客者', { kind: 'any' }],
  ['分享者', { kind: 'other' }],
  ['关灯者', { kind: 'any' }],
  ['赢家', { kind: 'any' }],
  ['输家', { kind: 'other' }],
  ['师', { kind: 'any' }],
  ['徒', { kind: 'other' }],
]);

const DROP_CONDITION = /^(admin|天气|生日|节假日|监督热度|被举报|练习时长|双排次数|发明流胜场|被单杀累计|事件密度|近10局KDA方差|KDA|rank_up|rank_down|game_min|状态|季节|周赛|月初杯赛|重大事件后|连续坐|7天能力增长|任一能力跨越10的倍数|单英雄场次)/;
const DROP_EFFECT = new Set(['把柄', '监督热度', '团队加成', '团队经验', '甩锅次数', '绰号', '被单杀累计', '事件密度', '状态', '团队经验', '胜利', '失败']);

function rename(s) {
  let out = s;
  for (const [oldName, newName] of Object.entries(RENAME)) out = out.split(oldName).join(newName);
  return out;
}

const TEXT_REPLACE = [
  [/周赛/g, '排位赛'],
  [/月杯/g, '联赛'],
  [/晋级赛/g, '排位赛'],
  [/管理员/g, '老板'],
  [/天意/g, '老板'],
  [/监督/g, '盯着'],
  [/举报/g, '告状'],
  [/打卡/g, '到岗'],
  [/铂金/g, '高分段'],
  [/段位/g, '分数'],
];

function cleanText(s) {
  let out = rename(s);
  for (const [re, to] of TEXT_REPLACE) out = out.replace(re, to);
  return out;
}

function idOfName(name) {
  if (NAME_ID[name]) return NAME_ID[name];
  for (const [id, cn] of Object.entries(NAME_CN)) if (cn === name) return id;
  return null;
}

function nameOfId(id) {
  return NAME_CN[id] ?? id;
}

function parseOp(raw, key) {
  const tail = raw.slice(key.length);
  const m = tail.match(/^(<=|>=|<|>|=)(.+)$/);
  return m ? { op: m[1], value: m[2].trim() } : null;
}

function hm(text) {
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
}

function deltaOf(raw) {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^([+-]?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

const reasons = [];
function reject(ev, reason) {
  reasons.push({ id: ev.id, name: ev.name, category: ev.category, reason });
  return null;
}

function convertRole(raw, ev, exclusive) {
  const fixed = idOfName(raw);
  if (fixed) return { key: rename(raw), kind: 'fixed', id: fixed };
  const def = ROLE_KIND.get(raw);
  if (!def) return null;
  const role = { key: rename(raw), ...def };
  if (raw === '主角' && exclusive.length) {
    if (exclusive.length === 1) {
      role.kind = 'fixed';
      role.id = exclusive[0];
    } else role.only = exclusive;
  }
  return role;
}

function convertCondition(raw, ev, roles) {
  const c = raw.trim();
  if (!c) return null;
  if (DROP_CONDITION.test(c)) return { drop: `条件 ${c}` };
  if (c === 'admin') return { drop: 'admin' };
  if (c === '旁人在场') return { cond: { k: 'presentCount', op: '>=', v: 2 } };
  if (c === '摸鱼中') return { cond: { k: 'slacking' } };
  if (c === '昨晚加班=true' || c === '昨晚加班') return { cond: { k: 'overtimeYesterday' } };
  if (c === 'rank_up') return { drop: '段位' };
  if (c === 'rank_down') return { drop: '段位' };
  const otherTalk = c.match(/^旁人话痨(<=|>=|<|>|=)(\d+)$/);
  if (otherTalk) return { cond: { k: 'otherPersona', key: '话痨', op: otherTalk[1], v: Number(otherTalk[2]) } };
  if (c === 'win') return { cond: { k: 'scrimResult', v: 'win' } };
  if (c === 'lose') return { cond: { k: 'scrimResult', v: 'lose' } };
  if (c === 'behind') return { cond: { k: 'scrimResult', v: 'lose' } };
  if (c === 'ahead') return { cond: { k: 'scrimResult', v: 'win' } };
  if (c === '重大事件后') return { drop: '重大事件后' };

  const act = c.match(/^act=(.+)$/);
  if (act) {
    const map = {
      单排: ['solo'],
      组排: ['team'],
      双排: ['duo'],
      对局: ['solo', 'duo', 'team'],
      排队: ['team'],
    };
    if (!map[act[1]]) return { drop: `act=${act[1]}` };
    return { cond: { k: 'act', values: map[act[1]] } };
  }

  const member = c.match(/^成员=(.+?)(?:在场)?$/);
  if (member) {
    const id = idOfName(member[1]);
    if (!id) return { drop: `成员=${member[1]}` };
    return { cond: { k: 'present', ids: [id] } };
  }

  const inTeam = c.match(/^(.+?)在队$/);
  if (inTeam) {
    const id = idOfName(inTeam[1]);
    if (!id) return { drop: `在队=${inTeam[1]}` };
    return { cond: { k: 'present', ids: [id] } };
  }

  const present = c.match(/^(.+?)在场$/);
  if (present) {
    const id = idOfName(present[1]);
    if (!id) return { drop: `在场=${present[1]}` };
    return { cond: { k: 'present', ids: [id] } };
  }

  const time = c.match(/^time=(\d\d:\d\d)-(\d\d:\d\d)$/);
  if (time) {
    let from = hm(time[1]);
    let to = hm(time[2]);
    from = Math.max(9 * 60, Math.min(22 * 60, from));
    to = Math.max(9 * 60, Math.min(22 * 60, to));
    if (to <= from) return { drop: `time=${time[1]}-${time[2]}` };
    return { cond: { k: 'time', from, to } };
  }

  const weekday = c.match(/^weekday=(\d)$/);
  if (weekday) return { cond: { k: 'weekday', op: '=', v: Number(weekday[1]) } };

  const rand = c.match(/^rand<([\d.]+)$/);
  if (rand) return { cond: { k: 'rand', p: Number(rand[1]) } };

  const flag = c.match(/^flag=(.+)$/);
  if (flag) return { flag: rename(flag[1]) };

  const role = c.match(/^role=(.+)$/);
  if (role) return { cond: { k: 'hasRole', role: role[1] === '打野' ? 'jungle' : role[1] } };

  const after = c.match(/^after=(.+)$/);
  if (after) {
    const map = { 组排: 'team', 单排: 'solo', 双排: 'duo', 对局: 'team' };
    if (!map[after[1]]) return { drop: `after=${after[1]}` };
    return { cond: { k: 'after', segment: map[after[1]] } };
  }

  const days = c.match(/^days_to_match(<=|>=|<|>|=)(\d+)$/);
  if (days) return { cond: { k: 'daysToMatch', op: days[1], v: Number(days[2]) } };

  const hours = c.match(/^hours_to_match(<=|>=|<|>|=)(\d+)$/);
  if (hours) return { cond: { k: 'hoursToMatch', op: hours[1], v: Number(hours[2]) } };

  const winStreak = c.match(/^win_streak(<=|>=|<|>|=)(\d+)$/);
  if (winStreak) return { cond: { k: 'scrimStreak', op: winStreak[1], v: Number(winStreak[2]) } };
  const loseStreak = c.match(/^lose_streak(<=|>=|<|>|=)(\d+)$/);
  if (loseStreak) return { cond: { k: 'scrimStreak', op: loseStreak[1] === '>=' ? '<=' : '>=', v: -Number(loseStreak[2]) } };

  const mood = c.match(/^team_mood(<=|>=|<|>|=)(\d+)$/);
  if (mood) return { cond: { k: 'teamMood', op: mood[1], v: Number(mood[2]) } };

  const here = c.match(/^在场(<=|>=|<|>|=)(\d+)$/);
  if (here) return { cond: { k: 'presentCount', op: here[1], v: Number(here[2]) } };

  const relation = c.match(/^关系(<=|>=|<|>|=)(\d+)$/);
  if (relation) return { cond: { k: 'bond', op: relation[1], v: Number(relation[2]) } };

  const attr = c.match(/^([^<>=!]+?)(<=|>=|<|>|=)(\d+)$/);
  if (attr) {
    const key = attr[1].trim();
    const op = attr[2];
    const v = Number(attr[3]);
    if (STATUS.has(key)) return { cond: { k: 'stat', key, op, v } };
    if (PERSONA.has(key)) return { cond: { k: 'persona', key, op, v } };
    if (ABILITY[key]) return { cond: { k: 'ability', key: ABILITY[key], op, v } };
    return { drop: `条件 ${c}` };
  }

  return { drop: `条件 ${c}` };
}

function convertEffect(raw, ev) {
  if (!raw || typeof raw !== 'object') return { skip: '空效果' };
  if (raw.raw) return { skip: 'raw 效果' };
  const attr = raw.attr;
  const d = deltaOf(raw.delta);
  if (!attr || d == null) return { skip: `效果 ${JSON.stringify(raw)}` };
  const target = rename(String(raw.target ?? '')).trim();
  if (attr === '声望') return { eff: { k: 'fame', d } };
  if (attr === '团队经验') return { eff: { k: 'insight', d } };
  if (attr === '团队加成') return { skip: '团队加成' };
  if (attr === '关系') {
    const t = target.replace(/\s+/g, '');
    const who = (x) => idOfName(x) ?? rename(x);
    if (/[<>]/.test(t)) {
      const parts = t.split(/<>|[<>]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length === 2) return { eff: { k: 'bond', a: who(parts[0]), b: who(parts[1]), d } };
      return { skip: `关系目标 ${target}` };
    }
    const key = targetKey(t);
    if (!key) return { skip: `关系目标 ${target}` };
    return { eff: { k: 'bondAll', who: key, d } };
  }
  if (DROP_EFFECT.has(attr)) return { skip: `效果属性 ${attr}` };
  if (STATUS.has(attr)) return { eff: { k: 'status', key: attr, d, who: target } };
  if (PERSONA.has(attr)) return { eff: { k: 'persona', key: attr, d, who: target } };
  if (ABILITY[attr]) return { eff: { k: 'ability', key: ABILITY[attr], d, who: target } };
  return { skip: `效果属性 ${attr}` };
}

function targetKey(target) {
  const t = target.trim();
  if (!t) return null;
  if (t === '全员' || t === '队伍') return 'all';
  if (t === '全局') return 'global';
  const id = idOfName(t);
  if (id) return id;
  if (Object.values(NAME_ID).includes(t)) return t;
  if (ROLE_KIND.has(t)) return t;
  return null;
}

function isFragmentText(text) {
  const s = text.trim();
  if (s.length <= 3) return true;
  if (/^[\d\s.。，、；：%]+$/.test(s)) return true;
  if (/^(?:\{[^}]+\}\s*)?\d+[。.]?$/.test(s)) return true;
  if (/^(地铁|闹钟（三选一）。|当邓开工宣言。)$/.test(s)) return true;
  if (/^(弟必对线 \d+|阿鸡 0|全队崩了，狗粮依然 \d+|天降奇迹：发明流 \d+|\{主角\}本局 \d+)$/.test(s)) return true;
  // KDA 被 gen.py 按“/”切开的碎片：3，但补刀数…… / 2。当邓……
  if (/^\d+[，,。]/.test(s) && s.length < 40) return true;
  // 句子在数字上被切断：下一把阿鸡 0 / 第一把就 0
  if (/\d$/.test(s)) return true;
  return false;
}

function checkTexts(ev, roles) {
  const roleKeys = new Set(roles.map((r) => r.key));
  const warning = [];
  for (const text of ev.texts) {
    for (const m of text.matchAll(/\{([^}]+)\}/g)) {
      const key = m[1];
      if (!roleKeys.has(key)) return { drop: `文案占位符 {${key}}` };
    }
    if (/周赛|月杯|晋级赛|管理员|天意|监督|举报|打卡|铂金|段位/.test(text)) warning.push(text);
  }
  return { warning };
}

function convertEvent(ev) {
  if (ev.hiddenAdmin) return reject(ev, 'admin');
  if (DROP_CATEGORY.has(ev.category)) return reject(ev, `分类 ${ev.category}`);
  const exclusive = (ev.exclusiveTo ?? []).map((n) => idOfName(n)).filter(Boolean);
  const roles = [];
  for (const raw of ev.roles) {
    const role = convertRole(raw, ev, exclusive);
    if (!role) return reject(ev, `角色 ${raw}`);
    roles.push(role);
  }
  if (!roles.length) return reject(ev, '没有角色');

  const conditions = [];
  const flags = [];
  for (const raw of ev.conditions) {
    const got = convertCondition(raw, ev, roles);
    if (!got) continue;
    if (got.drop) return reject(ev, got.drop);
    if (got.cond) conditions.push(got.cond);
    if (got.flag) flags.push(got.flag);
  }
  for (const id of exclusive) {
    if (!conditions.some((c) => c.k === 'present' && c.ids?.includes(id))) conditions.push({ k: 'present', ids: [id] });
  }
  // 状态/性格/属性/排位条件默认落到第一个具体角色上（主角/摸鱼者/固定成员……）
  const subject = roles.find((r) => r.kind !== 'all')?.key ?? 'all';
  for (const c of conditions) {
    if (!('who' in c) && ['stat', 'persona', 'ability', 'scrimResult', 'scrimStreak', 'act', 'slacking'].includes(c.k)) c.who = subject;
  }
  // 关系条件需要两个具体角色；只有「全员 + 一个人」时不算
  const concrete = roles.filter((r) => r.kind !== 'all');
  if (conditions.some((c) => c.k === 'bond')) {
    if (concrete.length < 2) return reject(ev, '关系条件缺少两个角色');
    const [a, b] = concrete.slice(0, 2).map((r) => r.key);
    for (const c of conditions) if (c.k === 'bond') {
      c.a = a;
      c.b = b;
    }
  }

  const effects = [];
  const skipped = [];
  const roleKeys = new Set(roles.map((r) => r.key));
  const knownTarget = (x) => x === '全员' || x === 'all' || roleKeys.has(x) || Object.values(NAME_CN).includes(x) || Object.keys(NAME_ID).includes(x) || Object.values(NAME_ID).includes(x);
  for (const raw of ev.effects) {
    const got = convertEffect(raw, ev);
    if (!got) continue;
    if (got.skip) {
      skipped.push(got.skip);
      continue;
    }
    const eff = got.eff;
    if (eff.k === 'bond') {
      if (!knownTarget(eff.a) || !knownTarget(eff.b)) {
        skipped.push(`关系目标 ${eff.a}<>${eff.b}`);
        continue;
      }
    }
    if ('who' in eff) {
      const key = targetKey(eff.who);
      if (!key) {
        skipped.push(`效果目标 ${eff.who}`);
        continue;
      }
      if (key === 'global' && eff.k !== 'fame') {
        skipped.push(`全局效果 ${eff.k}`);
        continue;
      }
      eff.who = key;
    }
    effects.push(eff);
  }

  const rawTexts = ev.texts.map(cleanText).map((t) => t.trim()).filter(Boolean);
  const texts = rawTexts.filter((t) => !isFragmentText(t));
  if (!texts.length) return reject(ev, '只有碎片文案');
  const textCheck = checkTexts({ ...ev, texts }, roles);
  if (textCheck.drop) return reject(ev, textCheck.drop);

  const id = rename(ev.id);
  const name = rename(ev.name);
  return {
    event: {
      id,
      name,
      category: ev.category,
      level: ev.level,
      weight: LEVEL_WEIGHT[ev.level] ?? 3,
      cooldownMin: ev.cooldownMinutes > 0 ? ev.cooldownMinutes : 180,
      roles,
      conditions,
      texts,
      effects,
      chains: [],
      flags,
      _warnings: [...(textCheck.warning ?? []), ...skipped],
    },
  };
}

const source = JSON.parse(readFileSync(srcPath, 'utf8'));
const converted = [];
for (const ev of source.events) {
  const got = convertEvent(ev);
  if (got) converted.push(got.event);
}

// flag 只能指向已接入的事件；指向旧监督/天意事件的 flag 会让事件永远不触发，直接丢掉这些人。
const survivors = [];
for (const ev of converted) {
  const badFlag = ev.flags.find((f) => !converted.some((x) => x.id === f));
  if (badFlag) {
    reasons.push({ id: ev.id, name: ev.name, category: ev.category, reason: `flag=${badFlag} 不在接入集合` });
    continue;
  }
  survivors.push(ev);
}
const finalIds = new Set(survivors.map((e) => e.id));
const kept = [];
const warnings = [];
for (const ev of survivors) {
  // chainNext 只保留接入集合里的目标
  const chain = (source.events.find((x) => rename(x.id) === ev.id)?.chainNext ?? [])
    .map((c) => ({ id: rename(c.id), pct: c.weightPct }))
    .filter((c) => finalIds.has(c.id));
  ev.chains = chain;
  for (const w of ev._warnings ?? []) warnings.push({ id: ev.id, warning: w });
  delete ev._warnings;
  kept.push(ev);
}

kept.sort((a, b) => a.category.localeCompare(b.category, 'zh') || a.id.localeCompare(b.id, 'zh'));

const out = {
  version: 1,
  generatedFrom: 'data/events.json',
  note: '由 game/scripts/build-event-library.mjs 生成。只含能映射到现行模型的事件；不要手改。',
  events: kept,
};
writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');

const byCat = {};
for (const e of kept) byCat[e.category] = (byCat[e.category] ?? 0) + 1;
const reasonCount = {};
for (const r of reasons) reasonCount[r.reason] = (reasonCount[r.reason] ?? 0) + 1;

const lines = [
  '# 事件库接入报告 v1',
  '',
  `> 由 \`game/scripts/build-event-library.mjs\` 生成；源：\`data/events.json\`（${source.events.length} 条）。`,
  `> 接入 **${kept.length} 条**；未接入 ${reasons.length} 条。`,
  '',
  '## 接入数量',
  '',
  '| 分类 | 条数 |',
  '|---|---:|',
  ...Object.entries(byCat).map(([k, v]) => `| ${k} | ${v} |`),
  '',
  '## 未接入原因',
  '',
  '| 原因 | 条数 |',
  '|---|---:|',
  ...Object.entries(reasonCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
  '',
  '## 未接入明细',
  '',
  '| id | 名称 | 分类 | 原因 |',
  '|---|---|---|---|',
  ...reasons.map((r) => `| ${r.id} | ${r.name} | ${r.category} | ${r.reason} |`),
  '',
  '## 跳过的效果 / 文案提醒',
  '',
  '这些事件已接入，但效果或文案有一部分没有映射；先保留文本，效果留到后续人工补。',
  '',
  '| id | 提醒 |',
  '|---|---|',
  ...(warnings.length ? warnings.map((w) => `| ${w.id} | ${w.warning} |`) : ['| — | 无 |']),
  '',
  '## 说明',
  '',
  '- 比赛日 27 条、监督 26 条、天意 25 条本期整体不接；`S_` / `C_` / `T_` 事件不进游戏。',
  '- 18 条剧本连锁本期不接；只保留 `chainNext` 指向已接入事件的权重加成。',
  '- 文案里的旧昵称和旧系统词（周赛/排位赛/监督/举报/打卡/段位等）已替换；被 gen.py 按“/”切碎的 KDA 碎片已过滤。',
  '- 带 `flag=` 且指向未接入事件的条件会让事件永远不触发，已连同事件一起剔除。',
  '- 未映射的效果会从该事件里删掉，事件文本仍保留；报告中逐条列出。',
  '',
];
writeFileSync(reportPath, lines.join('\n'), 'utf8');

console.log(`kept ${kept.length}/${source.events.length} · warnings ${warnings.length}`);
console.log(Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('top reasons:', Object.entries(reasonCount).sort((a, b) => b[1] - a[1]).slice(0, 12));
