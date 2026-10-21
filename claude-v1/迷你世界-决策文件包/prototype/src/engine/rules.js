// 事件条件 / 效果 DSL 的解析与求值（样板版）
// 条件求值返回"概率系数"：0 表示不满足，1 表示满足，0~1 之间表示按概率满足
// 正式版：启动时编译为谓词函数，未知条件直接报错；样板里未知条件按 30% 粗略放行

import { STATUS_KEYS, ABILITY_KEYS, PERSONA_KEYS } from '../config.js';

const CMP_RE = /^(.+?)(<=|>=|<|>|=)(.+)$/;
const NUMERIC_ATTRS = new Set([...STATUS_KEYS, ...ABILITY_KEYS, ...PERSONA_KEYS]);
export const UNKNOWN_PASS = 0.3;

export function parseCondition(raw) {
  const s = raw.trim();
  const m = s.match(CMP_RE);
  if (!m) return { raw: s, key: s, op: null, value: null };
  return { raw: s, key: m[1].trim(), op: m[2], value: m[3].trim() };
}

function cmp(a, op, b) {
  switch (op) {
    case '<': return a < b;
    case '>': return a > b;
    case '<=': return a <= b;
    case '>=': return a >= b;
    case '=': return a === b;
  }
  return false;
}

function hm(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

// 对局中"胜/负/顺风/逆风"在样板里不追踪逐局细节，按概率近似
const GAME_ACTS = { 对局: ['solo', 'team', 'duo'], 单排: ['solo'], 组排: ['team'], 双排: ['duo', 'solo'], 排队: ['solo'], 晋级赛: ['solo'] };
const ACT_PROB = { 双排: 0.5, 排队: 0.5, 晋级赛: 0.2 };

// ctx: { world, member, others（候选的其他参与者）, now }
export function evalCondition(cond, ctx) {
  const { world, member, now } = ctx;
  const { key, op, value } = cond;

  if (key === 'admin') return 0; // 天意：只能由管理员投放

  if (key === '成员') return member && member.name === value ? 1 : 0;

  if (key === 'time') {
    const [a, b] = value.split('-');
    const t = now.minuteOfDay;
    return t >= hm(a) && t <= hm(b) ? 1 : 0;
  }

  if (key === 'act') {
    if (!member) return 0;
    const acts = GAME_ACTS[value];
    if (!acts) return UNKNOWN_PASS;
    return acts.includes(member.activity.kind) ? ACT_PROB[value] ?? 1 : 0;
  }

  if (key === 'after') return world.recentTeamGame ? 1 : 0;
  if (key === 'role') return member && member.def.role.includes(value) ? 1 : 0;

  if (['win', 'lose', 'behind', 'ahead'].includes(key)) return 0.5;
  if (key === 'game_min') return 0.6;
  if (key === 'win_streak') return member && cmp(member.today.winStreak, op, +value) ? 1 : 0;
  if (key === 'lose_streak') return member && cmp(member.today.loseStreak, op, +value) ? 1 : 0;

  // rand<p：样板事件密度放大约 5 倍，基础概率同步放大
  if (key === 'rand') return Math.min(1, +value * 5);

  if (key === 'flag') return world.hasFlag(value, member) ? 1 : 0;

  if (key === '在场') return cmp(world.presentCount(), op, +value) ? 1 : 0;
  if (key.endsWith('在场') && key.length > 2 && key !== '旁人在场') {
    const name = key.slice(0, -2);
    return world.isPresentByName(name) ? 1 : 0;
  }
  if (key === '旁人在场') return world.presentCount() >= 2 ? 1 : 0;

  if (key === 'team_mood') return cmp(world.teamMood(), op, +value) ? 1 : 0;
  if (key === 'days_to_match') return cmp(world.daysToMatch(now), op, +value) ? 1 : 0;
  if (key === 'hours_to_match') return cmp(world.hoursToMatch(now), op, +value) ? 1 : 0;
  if (key === 'weekday') return now.weekdayCn === value || String(now.weekday) === value ? 1 : 0;

  // 旁人话痨>=60：在场的其他人里有人满足
  if (key.startsWith('旁人')) {
    const attr = key.slice(2);
    return world.presentMembers().some((o) => o !== member && cmp(o.get(attr), op, +value)) ? 1 : 0;
  }

  // 关系：在挑选第二个槽位时再精确匹配，这里只判断"是否存在满足的人"
  if (key === '关系') {
    if (!member) return UNKNOWN_PASS;
    return world.presentMembers().some((o) => o !== member && cmp(world.rel(member, o), op, +value)) ? 1 : 0;
  }

  if (NUMERIC_ATTRS.has(key) && member) return cmp(member.get(key), op, +value) ? 1 : 0;

  // 比赛流程事件只由比赛模块触发；其余日历/统计型条件给出保守概率
  if (key === '周赛时间') return 0;
  if (key === '月初杯赛') return now.day <= 7 && now.weekday === 1 ? 1 : 0;
  if (key.endsWith('首发')) {
    const m = world.byName[key.slice(0, -2)];
    return m && world.match?.starters.includes(m.id) ? 1 : 0;
  }
  if (key === 'rank_up' || key === 'rank_down') return 0.04;
  if (key === '生日当天') return 0.02;
  if (key === '节假日后') return 0;

  // 摸鱼中 / 睡觉中 等状态型条件
  if (key === '摸鱼中') return member && member.isSlacking() ? 1 : 0;

  return UNKNOWN_PASS;
}

export function evalConditions(conds, ctx) {
  let p = 1;
  for (const c of conds) {
    p *= evalCondition(c, ctx);
    if (p <= 0) return 0;
  }
  return p;
}

// 效果："+10" "-3" "±5" "+20%"
export function parseDelta(delta) {
  const pct = delta.endsWith('%');
  const body = pct ? delta.slice(0, -1) : delta;
  if (body.startsWith('±')) return { value: +body.slice(1), random: true, pct };
  return { value: parseFloat(body), random: false, pct };
}

// 把效果翻译成旁观者能读懂的一句话（用于事件详情"后果"）
export function describeEffect(eff, bindings) {
  if (eff.raw) return null;
  const { attr, delta, target } = eff;
  const nameOf = (slot) => {
    const b = bindings[slot];
    if (!b) return slot;
    return Array.isArray(b) ? '全员' : b.name;
  };
  if (attr === '关系') {
    if (target.includes('<>')) {
      const [a, b] = target.split('<>');
      return `${nameOf(a)} 与 ${nameOf(b)} 关系 ${delta}`;
    }
    if (target.includes('>')) {
      const [a, b] = target.split('>');
      return `${nameOf(a)} 对 ${nameOf(b)} 的好感 ${delta}`;
    }
  }
  return `${nameOf(target)} ${attr} ${delta}`;
}
