// 前端简易世界模拟器（样板用）
// 负责：每人每天的作息日程、当前行为、状态漂移、单排胜负、按条件挑选事件、冷却、连锁加权、效果结算
// 正式版这些逻辑全部搬到服务端世界进程，前端只负责展示

import eventsData from '../../../data/events.json';
import { MEMBERS, INITIAL_RELATIONS, OPPONENTS, MATCH_WEEKDAY, MATCH_MINUTE, STATUS_KEYS } from '../config.js';
import { seeded, mulberry32, pick, range, weightedPick } from './rng.js';
import { parseCondition, evalConditions, describeEffect, parseDelta } from './rules.js';
import { fmtHM, beijingParts } from '../world/clock.js';

const LEVEL_WEIGHT = { 日常: 42, 有趣: 40, 剧情: 14, 重大: 2 };
const LEVEL_ORDER = ['重大', '剧情', '有趣', '日常'];

// 作为"条件主语"的槽位名
const SUBJECT_ROLES = ['主角', '摸鱼者', '发起者', '甩锅者', '睡觉者', '迟到者', '红温者', '早到者', '加班者', '病号', '请假者', '寿星', '炫耀者', '打野者', '分享者', '请客者', '漏单者', '阴阳者', '制作者', '赢家', '持有者', '报复者'];
// 甩锅类事件里的"受害者"槽位：优先抽到施颠（甩锅链）
const VICTIM_ROLES = ['被甩者', '背锅者', '目标'];

// 通用状态型 flag：不来自具体事件，而由当前世界状态计算
const TAG_RULES = [
  [/甩锅/, ['甩锅', '被甩锅']],
  [/吵|争/, ['争吵', '争论']],
  [/超神|五杀|翻盘|奇袭|高光/, ['高光', '名场面']],
  [/单杀|被打爆/, ['被单杀']],
  [/曝光|群里/, ['被曝光']],
  [/拍|把柄/, ['把柄']],
  [/举报/, ['被举报', '举报中']],
  [/冷战/, ['冷战']],
  [/外卖/, ['点外卖']],
  [/围观|演员/, ['围观源']],
  [/批|指出|点评/, ['被指出失误', '被队友指责']],
  [/惨败/, ['组排惨败', '输局']],
  [/投降/, ['对局逆风']],
];

export class Member {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.ability = { ...def.ability };
    this.persona = { ...def.persona };
    this.status = { 体力: 80, 心情: 70, 专注: 65, 手感: 60, 饥饿: 30 };
    this.extra = {};
    this.activity = { kind: 'absent', label: '还没到' };
    this.action = null; // 事件触发的临时动作（由导演层读取）
    this.resetToday();
  }

  resetToday() {
    this.today = { wins: 0, losses: 0, winStreak: 0, loseStreak: 0, slackMin: 0, blamed: 0, playMin: 0, lastHero: null, lastKda: null };
  }

  get(attr) {
    if (attr in this.status) return this.status[attr];
    if (attr in this.ability) return this.ability[attr];
    if (attr in this.persona) return this.persona[attr];
    return this.extra[attr] ?? 0;
  }

  add(attr, v) {
    const clamp = (x) => Math.max(0, Math.min(100, x));
    if (attr in this.status) this.status[attr] = clamp(this.status[attr] + v);
    else if (attr in this.ability) this.ability[attr] = clamp(this.ability[attr] + v);
    else if (attr in this.persona) this.persona[attr] = clamp(this.persona[attr] + v);
    else this.extra[attr] = (this.extra[attr] ?? 0) + v;
  }

  isPresent() {
    return !['absent', 'toilet', 'lunch_out'].includes(this.activity.kind);
  }

  isSlacking() {
    return ['slack_phone', 'slack_stream', 'snack', 'chat', 'toilet', 'nap_desk', 'nap_sofa'].includes(this.activity.kind);
  }

  isPlaying() {
    return ['solo', 'team', 'duo', 'training', 'match'].includes(this.activity.kind);
  }
}

export class World {
  constructor() {
    this.members = MEMBERS.map((d) => new Member(d));
    this.byId = Object.fromEntries(this.members.map((m) => [m.id, m]));
    this.byName = Object.fromEntries(this.members.map((m) => [m.name, m]));
    this.relations = { ...INITIAL_RELATIONS };
    this.events = eventsData.events.filter((e) => !e.hiddenAdmin);
    this.eventById = Object.fromEntries(eventsData.events.map((e) => [e.id, e]));
    for (const e of this.events) e._conds = e.conditions.map(parseCondition);
    this.byLevel = {};
    for (const e of this.events) (this.byLevel[e.level] ||= []).push(e);

    this.flags = new Map(); // 事件 flag：id → { subjectId, participantIds, at, time }
    this.cooldowns = new Map(); // `${eventId}|${memberId}` → 冷却结束的演示分钟
    this.chainWeights = new Map(); // eventId → 加权百分比（当日清零）
    this.variantCursor = new Map();
    this.demoMin = 0; // 演示分钟：样板把事件密度放大，冷却等按此计时
    this.rand = mulberry32(Date.now() & 0xffffffff);
    this.log = []; // 事件板条目（新的在前）
    this.listeners = new Set();
    this.recentSubjects = [];
    this.recentTeamGame = false;
    this.match = null; // 比赛直播进行中时由比赛模块写入
    this.dayKey = null;
    this.lastMinute = null;
    this.uid = 1;
  }

  onEvent(fn) {
    this.listeners.add(fn);
  }

  emit(entry, opts = {}) {
    this.log.unshift(entry);
    if (this.log.length > 400) this.log.pop();
    for (const fn of this.listeners) fn(entry, opts);
  }

  // ───────────── 查询 ─────────────
  presentMembers() {
    return this.members.filter((m) => m.isPresent());
  }
  presentCount() {
    return this.presentMembers().length;
  }
  isPresentByName(name) {
    return !!this.byName[name]?.isPresent();
  }
  teamMood() {
    const p = this.presentMembers();
    if (!p.length) return 60;
    return p.reduce((s, m) => s + m.status.心情, 0) / p.length;
  }
  rel(a, b) {
    return this.relations[`${a.id}>${b.id}`] ?? 50;
  }
  addRel(a, b, v) {
    const k = `${a.id}>${b.id}`;
    this.relations[k] = Math.max(0, Math.min(100, (this.relations[k] ?? 50) + v));
  }

  opponentFor(now) {
    // 按 ISO 周轮换对手
    const d = new Date(Date.UTC(now.year, now.month - 1, now.day));
    const week = Math.floor((d.getTime() / 86400000 + 3) / 7);
    return OPPONENTS[week % OPPONENTS.length];
  }

  daysToMatch(now) {
    let d = MATCH_WEEKDAY - now.weekday;
    if (d < 0 || (d === 0 && now.minuteOfDay > MATCH_MINUTE + 60)) d += 7;
    return d;
  }

  hoursToMatch(now) {
    return this.daysToMatch(now) * 24 + (MATCH_MINUTE - now.minuteOfDay) / 60;
  }

  // 顶部"今日状态"文案
  dayStatus(now) {
    const d = this.daysToMatch(now);
    const opp = this.opponentFor(now);
    if (this.match?.running) return `周赛进行中 · vs ${this.match.opponent.name}`;
    if (d === 0) {
      const mins = MATCH_MINUTE - now.minuteOfDay;
      if (mins > 0) return `今天 15:00 周赛 · vs ${opp.name}（还有 ${Math.floor(mins / 60)} 小时 ${Math.floor(mins % 60)} 分）`;
      return `今日周赛已结束 · 下周再战`;
    }
    if (d === 1) return `明天周赛 · vs ${opp.name} · 备战中`;
    return `距周赛还有 ${d} 天 · 下个对手：${opp.name}`;
  }

  officePhase(now) {
    const t = now.minuteOfDay;
    if (now.weekday >= 6) return '周末 · 自愿加练';
    if (t < 7 * 60 + 30) return '夜深了 · 办公室熄灯';
    if (t < 9 * 60) return '清晨 · 早到的人在练';
    if (t < 11 * 60 + 30) return '上午 · 单排冲分';
    if (t < 13 * 60) return '午饭时间';
    if (t < 15 * 60) return '午后犯困时段';
    if (t < 17 * 60) return '下午 · 组排时间';
    if (t < 21 * 60) return '下班后 · 有人加班';
    return '夜深了 · 只剩显示器的光';
  }

  hasFlag(name, member) {
    // 状态型 flag
    switch (name) {
      case '比赛中': return this.match?.running ? 1 : 0;
      case '比赛逆风': return this.match?.running && this.match.behind ? 1 : 0;
      case '睡觉中': return member && ['nap_desk', 'nap_sofa'].includes(member.activity.kind) ? 1 : 0;
      case '摸鱼中': return member?.isSlacking() ? 1 : 0;
      case '全员摸鱼': return this.presentMembers().filter((m) => m.isSlacking()).length >= 4 ? 1 : 0;
      case '输局': return member && member.today.loseStreak > 0 ? 1 : 0;
      case '组排': return this.recentTeamGame ? 1 : 0;
    }
    return this.flags.has(name) ? 1 : 0;
  }

  // ───────────── 日程 ─────────────
  // 每人每天的作息由 (日期, 成员) 种子决定：拖动时间滑杆时画面前后一致
  buildSchedule(now) {
    const key = now.dateKey;
    const weekend = now.weekday >= 6;
    const prematch = now.weekday === MATCH_WEEKDAY - 1;
    const matchDay = now.weekday === MATCH_WEEKDAY;
    const sched = {};
    let sofaTaken = false;
    for (const m of this.members) {
      const r = seeded('sched', key, m.id);
      const s = { late: false };
      if (weekend) {
        s.off = r() > 0.3;
        s.arrive = 13 * 60 + range(r, 0, 60);
        s.leave = 17 * 60 + range(r, 0, 90);
      } else {
        if (m.def.schedule === 'early') s.arrive = range(r, 7 * 60 + 35, 8 * 60 + 20);
        else s.arrive = range(r, 8 * 60 + 40, 9 * 60 + 4);
        if (m.def.schedule !== 'early' && r() < 0.12) {
          s.arrive = range(r, 9 * 60 + 8, 9 * 60 + 45);
          s.late = true;
        }
        const overtimeP = 0.22 + (m.persona.胜负心 >= 70 ? 0.2 : 0);
        if (m.def.schedule === 'dayonly') s.leave = r() < 0.88 ? range(r, 17 * 60, 17 * 60 + 12) : range(r, 18 * 60, 19 * 60);
        else if (r() < overtimeP) s.leave = range(r, 19 * 60, 21 * 60 + 45);
        else s.leave = range(r, 17 * 60, 17 * 60 + 45);
        if (prematch) s.leave = Math.max(s.leave, range(r, 19 * 60 + 20, 20 * 60 + 40));
        s.lunchStart = range(r, 11 * 60 + 45, 12 * 60 + 5);
        s.lunchEnd = s.lunchStart + range(r, 45, 62);
        s.lunchOut = r() < 0.4;
        s.nap = r() < 0.5 + (m.persona.摸鱼倾向 - 50) / 100;
        s.napStart = range(r, 12 * 60 + 52, 13 * 60 + 5);
        s.napEnd = s.napStart + range(r, 20, 40);
        if (s.nap && !sofaTaken && r() < 0.6) {
          s.sofa = true;
          sofaTaken = true;
        }
      }
      sched[m.id] = s;
    }
    // 组排时段（全办公室）
    const r = seeded('team', key);
    const teamSlots = [];
    if (!weekend) {
      if (prematch) teamSlots.push([10 * 60 + 30, 11 * 60 + 30], [14 * 60, 16 * 60 + 30]);
      else if (matchDay) teamSlots.push([10 * 60 + 30, 11 * 60 + 20], [14 * 60, 14 * 60 + 50]);
      else if (r() < 0.6) teamSlots.push([14 * 60 + range(r, 0, 40), 15 * 60 + 30 + range(r, 0, 60)]);
    }
    return { members: sched, teamSlots, weekend, prematch, matchDay };
  }

  // 某人某时刻的"基础行为"（不含事件触发的临时动作）
  baseActivity(m, t, day, now) {
    const s = day.members[m.id];
    // 比赛期间全员到场（样板演示可在任意时刻开赛）
    if (this.match?.running) {
      return this.match.starters.includes(m.id) ? { kind: 'match', label: '周赛进行中' } : { kind: 'sub', label: '替补席 · 场边指导' };
    }
    if (s.off) return { kind: 'absent', label: '周末没来' };
    if (t < s.arrive) return { kind: 'absent', label: '还没到' };
    if (t >= s.leave) return { kind: 'absent', label: '已下班' };
    if (!day.weekend) {
      if (t >= s.lunchStart && t < s.lunchEnd) return s.lunchOut ? { kind: 'lunch_out', label: '出去吃午饭了' } : { kind: 'lunch_in', label: '在工位吃午饭' };
      if (s.nap && t >= s.napStart && t < s.napEnd) return s.sofa ? { kind: 'nap_sofa', label: '沙发午睡"想战术"' } : { kind: 'nap_desk', label: '趴桌午睡' };
      for (const [a, b] of day.teamSlots) if (t >= a && t < b) return { kind: 'team', label: '五黑组排中' };
      if (t < 9 * 60) return { kind: 'training', label: '早到练习（训练模式）' };
    }
    if (t >= 17 * 60 + 50) return { kind: 'solo', label: '加班冲分' };

    // 10 分钟一个行为块
    const block = Math.floor(t / 10);
    const sub = t - block * 10;
    const pair = this.chatPair(now.dateKey, block);
    if (pair && pair.includes(m.id) && pair.every((id) => this._presentAt(id, t, day))) {
      const other = this.byId[pair[0] === m.id ? pair[1] : pair[0]];
      return { kind: 'chat', label: `和${other.name}闲聊`, partner: other.id, host: pair[0] };
    }
    const r = seeded('blk', now.dateKey, m.id, block);
    const prematch = day.prematch || day.matchDay;
    let slackP = 0.1 + (m.persona.摸鱼倾向 / 100) * 0.38;
    if (t >= 13 * 60 && t < 15 * 60) slackP *= 1.4;
    if (prematch) slackP *= 0.6;
    if (r() < slackP) {
      const kinds = [
        ['slack_phone', 3, '刷手机（摸鱼）'],
        ['slack_stream', 2, '看直播"学习"（摸鱼）'],
        ['snack', 2, '去茶水区觅食'],
        ['toilet', 1.2, '带薪如厕'],
      ];
      const k = weightedPick(r, kinds, (x) => x[1]);
      if ((k[0] === 'snack' && sub >= 5) || (k[0] === 'toilet' && sub >= 6)) return { kind: 'solo', label: '单排冲分' };
      return { kind: k[0], label: k[2] };
    }
    if (r() < 0.12) {
      const buddy = this.members.find((o) => o !== m && this.rel(m, o) >= 60 && this._presentAt(o.id, t, day));
      if (buddy) return { kind: 'duo', label: `和${buddy.name}双排`, partner: buddy.id };
    }
    return { kind: 'solo', label: '单排冲分' };
  }

  chatPair(dateKey, block) {
    const r = seeded('chat', dateKey, block);
    if (r() > 0.32) return null;
    const a = Math.floor(r() * 6);
    let b = Math.floor(r() * 5);
    if (b >= a) b++;
    return [this.members[a].id, this.members[b].id];
  }

  _presentAt(id, t, day) {
    const s = day.members[id];
    if (s.off || t < s.arrive || t >= s.leave) return false;
    if (!day.weekend && t >= s.lunchStart && t < s.lunchEnd && s.lunchOut) return false;
    return true;
  }

  // 比赛日首发：上单位置在施颠和批菊之间按能力+心情决定（"替补之争"）
  computeStarters() {
    const sd = this.byId.shidian, pj = this.byId.piju;
    const score = (m) => m.ability.对线 + m.ability.操作 + m.status.心情 * 0.2;
    const top = score(sd) > score(pj) ? sd : pj;
    return ['dangdeng', 'dibi', 'dishu', 'diaolong', top.id];
  }

  // ───────────── 推进 ─────────────
  dailyReset(now) {
    this.dayKey = now.dateKey;
    this.day = this.buildSchedule(now);
    this.flags.clear();
    this.chainWeights.clear();
    for (const [k, v] of this.cooldowns) if (v === Infinity) this.cooldowns.delete(k);
    this.recentTeamGame = false;
    this.matchStarters = this.computeStarters();
    for (const m of this.members) {
      m.resetToday();
      const r = seeded('status', now.dateKey, m.id);
      m.status.体力 = range(r, 65, 95);
      m.status.心情 = range(r, 50, 85);
      m.status.专注 = range(r, 45, 80) - (now.weekday === 1 ? 10 : 0);
      m.status.手感 = range(r, 35, 85);
      m.status.饥饿 = range(r, 20, 40);
    }
  }

  // realDt：真实流逝秒数
  update(now, realDt) {
    if (now.dateKey !== this.dayKey) {
      this.dailyReset(now);
      this.lastMinute = null;
    }
    const t = now.minuteOfDay;
    const jumped = this.lastMinute == null || Math.abs(t - this.lastMinute) > 20;
    const worldDelta = jumped ? 0 : Math.max(0, t - this.lastMinute);
    const demoDelta = Math.max(worldDelta, realDt); // 至少每真实秒推进 1 个演示分钟
    this.demoMin += demoDelta;
    this.lastMinute = t;

    for (const m of this.members) {
      const prev = m.activity;
      const next = this.baseActivity(m, t, this.day, now);
      if (prev.kind !== next.kind || prev.label !== next.label) {
        m.activity = { ...next, since: t };
        if (!jumped) this.routineLine(m, prev, next, now);
      }
      if (m.activity.kind === 'team') this.recentTeamGame = true;
      this.drift(m, demoDelta);
      if (!jumped && m.isPlaying() && m.activity.kind !== 'match') {
        m.today.playMin += demoDelta;
        if (m.today.playMin >= 26) {
          m.today.playMin = 0;
          this.resolveGame(m, now);
        }
      }
      if (!jumped && m.isSlacking()) m.today.slackMin += worldDelta > 0 ? worldDelta : demoDelta * 0.25;
    }
    // 过期 flag 由每日重置清理；动作过期由导演层判断
  }

  drift(m, dMin) {
    const s = m.status;
    const playing = m.isPlaying();
    s.体力 = Math.max(0, s.体力 - dMin * (playing ? 0.02 : 0.008));
    if (['nap_desk', 'nap_sofa'].includes(m.activity.kind)) s.体力 = Math.min(100, s.体力 + dMin * 0.12);
    s.饥饿 = Math.min(100, s.饥饿 + dMin * 0.05);
    if (['lunch_in', 'lunch_out', 'snack'].includes(m.activity.kind)) s.饥饿 = Math.max(0, s.饥饿 - dMin * 0.6);
    s.专注 += ((s.体力 * 0.8 - s.专注) * dMin) / 300;
    s.心情 += ((62 - s.心情) * dMin) / 600;
  }

  // 单排/组排一局结束
  resolveGame(m, now, silent = false) {
    const r = this.rand;
    const ab = m.ability;
    const skill = (ab.操作 + ab.意识 + ab.对线 + ab.发育) / 4;
    let p = 0.5 + (m.status.手感 - 55) / 260 + (skill - 45) / 220;
    if (m.status.饥饿 > 70) p -= 0.05;
    const win = r() < p;
    const hero = pick(r, m.def.heroes);
    const k = Math.floor(range(r, win ? 4 : 0, win ? 14 : 7));
    const d = Math.floor(range(r, win ? 0 : 4, win ? 6 : 12));
    const a = Math.floor(range(r, 2, 14));
    m.today.lastHero = hero;
    m.today.lastKda = `${k}/${d}/${a}`;
    if (win) {
      m.today.wins++;
      m.today.winStreak++;
      m.today.loseStreak = 0;
      m.add('心情', 4);
      m.add('手感', 2);
    } else {
      m.today.losses++;
      m.today.loseStreak++;
      m.today.winStreak = 0;
      m.add('心情', -5);
    }
    // 有效练习：能力缓慢增长，越高越难涨（边际递减），专注与手感是倍率
    const gain = 0.06 * (1 - ab.操作 / 120) * (0.5 + m.status.专注 / 100);
    m.add('操作', gain);
    m.add('意识', gain * 0.8);
    if (!silent && r() < 0.45) {
      const mode = m.activity.kind === 'team' ? '组排' : m.activity.kind === 'duo' ? '双排' : '单排';
      const lines = win
        ? [`${m.name}${mode}赢了一把，${hero} ${k}/${d}/${a}。`, `${m.name}拿下一局，${hero}打出 ${k}/${d}/${a}，顺手点了个赞。`]
        : [`${m.name}${mode}输了一把，${hero} ${k}/${d}/${a}，沉默地点了下一把。`, `${m.name}这把${hero}打得很艰难，${k}/${d}/${a}。`];
      this.emitRoutine(now, pick(r, lines), [m]);
    }
  }

  routineLine(m, prev, next, now) {
    const r = this.rand;
    let text = null;
    if (prev.kind === 'absent' && next.kind !== 'absent' && prev.label === '还没到') {
      const s = this.day.members[m.id];
      text = s.late
        ? pick(r, [`${m.name} ${fmtHM(now.minuteOfDay)} 才到岗，进门时所有人都在看他。`, `${m.name}踩着迟到线冲进门，假装自己一直都在。`])
        : now.minuteOfDay < 8 * 60 + 30
          ? pick(r, [`${m.name}第一个推开办公室的门，开灯、开机。`, `${m.name}早早到岗，办公室还很安静。`])
          : pick(r, [`${m.name}到岗，先去接了杯水。`, `${m.name}到了，开机，登录，排队。`]);
    } else if (next.kind === 'absent' && next.label === '已下班') {
      text = now.minuteOfDay < 17 * 60 + 20
        ? pick(r, [`${m.name}准点下班，背包早就收好了。`, `${m.name}：“我先撤了。”门一关，人已经到电梯口。`])
        : pick(r, [`${m.name}加完班终于走了，顺手关了自己的台灯。`, `${m.name}打完最后一把，伸了个懒腰下班。`]);
    } else if (next.kind === 'lunch_out') text = `${m.name}出去吃午饭了。`;
    else if (next.kind === 'team' && prev.kind !== 'team' && m === this.presentMembers()[0]) text = '下午组排开始，耳机都戴上了，办公室安静下来。';
    if (text) this.emitRoutine(now, text, [m]);
  }

  emitRoutine(now, text, members) {
    this.emit({
      uid: this.uid++, at: now.ms, time: fmtHM(now.minuteOfDay), level: '日常', category: '流水',
      eventId: null, name: '日常流水', text, participants: members.map((m) => ({ id: m.id, name: m.name })),
      effects: [], cause: null, next: [], routine: true,
    });
  }

  // ───────────── 事件挑选 ─────────────
  modifiers(ev, subject, now) {
    const t = now.minuteOfDay;
    const name = ev.name + ev.id;
    let w = 1;
    const cat = ev.category;
    if (t >= 11 * 60 + 30 && t < 13 * 60) {
      if (cat === '生活') w *= 3;
      if (cat === '对局') w *= 0.3;
    }
    if (t >= 13 * 60 && t < 15 * 60 && /睡|闭目/.test(name)) w *= 2.5;
    if (t >= 15 * 60 && t < 16 * 60 + 30 && /奶茶|桌游|下午茶/.test(name)) w *= 2;
    if (t < 9 * 60 && cat === '生活') w *= 2;
    if (this.daysToMatch(now) <= 2) {
      if (cat === '比赛') w *= 2.5;
      if (cat === '摸鱼') w *= 0.6;
      if (cat === '监督') w *= 1.5;
    }
    if (ev.exclusiveTo.length) w *= 1.6;
    if (subject) {
      const p = subject.persona, s = subject.status;
      if (subject.id === 'shidian' && /发明流|版本研究/.test(name)) w *= 2.5;
      if (subject.id === 'dangdeng' && /投降/.test(name)) w *= 3;
      if (subject.id === 'dishu' && /如何评价/.test(name)) w *= 3;
      if (subject.id === 'diaolong' && /复盘|指挥|阵容/.test(name)) w *= 2;
      if (/甩锅/.test(name) && p.甩锅倾向 >= 60) w *= 2;
      if (s.体力 < 30 && (cat === '摸鱼' || /睡/.test(name))) w *= 2.5;
      if (s.心情 < 35 && /红温|阴阳|赌气/.test(name)) w *= 2;
      if (s.手感 > 80 && /超神|五杀/.test(name)) w *= 3;
      if (s.饥饿 > 70 && /外卖|零食|拼单/.test(name)) w *= 3;
      if (p.摸鱼倾向 >= 50 && cat === '摸鱼') w *= 1.5;
      // 打散：最近刚当过主角的人降权
      const recent = this.recentSubjects.filter((id) => id === subject.id).length;
      w *= Math.pow(0.5, recent);
    }
    const chain = this.chainWeights.get(ev.id) || 0;
    w *= 1 + (chain / 100) * 2;
    return w;
  }

  subjectRole(ev) {
    return ev.roles.find((r) => SUBJECT_ROLES.includes(r)) || ev.roles.find((r) => !this.byName[r] && r !== '全员' && r !== '对手') || null;
  }

  // 收集候选：(事件, 主语成员, 权重)
  candidates(level, now) {
    const present = this.presentMembers();
    const out = [];
    for (const ev of this.byLevel[level] || []) {
      if (ev.category === '比赛' && !this.match?.running && ev._conds.some((c) => c.key === 'flag' && /比赛/.test(c.value))) continue;
      let subjects;
      if (ev.exclusiveTo.length) {
        const m = this.byName[ev.exclusiveTo[0]];
        subjects = m && m.isPresent() ? [m] : [];
      } else if (this.subjectRole(ev)) {
        subjects = present;
        // 前置 flag 来自具体事件时，主语限定为当时的参与者，保证连锁剧情落在同一批人身上
        for (const c of ev._conds) {
          if (c.key === 'flag' && this.flags.has(c.value)) {
            const f = this.flags.get(c.value);
            const limited = present.filter((m) => f.participantIds.includes(m.id));
            if (limited.length) subjects = limited;
          }
        }
      } else {
        subjects = present.length >= 3 ? [null] : [];
      }
      for (const m of subjects) {
        if (m && (this.cooldowns.get(`${ev.id}|${m.id}`) ?? -1) > this.demoMin) continue;
        if ((this.cooldowns.get(`${ev.id}|*`) ?? -1) > this.demoMin) continue;
        const p = evalConditions(ev._conds, { world: this, member: m, now });
        if (p <= 0) continue;
        out.push({ ev, subject: m, weight: p * this.modifiers(ev, m, now) });
      }
    }
    return out;
  }

  bindRoles(ev, subject, now) {
    const present = this.presentMembers();
    const used = new Set();
    const bindings = {};
    const subjRole = this.subjectRole(ev);
    const r = this.rand;
    const relCond = ev._conds.find((c) => c.key === '关系');
    const chatterCond = ev._conds.find((c) => c.key.startsWith('旁人'));

    for (const role of ev.roles) {
      if (role === '全员') {
        bindings[role] = present;
        continue;
      }
      if (role === '对手') {
        bindings[role] = { name: (this.match?.opponent || this.opponentFor(now)).name, opponent: true };
        continue;
      }
      if (this.byName[role]) {
        const m = this.byName[role];
        if (!m.isPresent()) return null;
        bindings[role] = m;
        used.add(m.id);
        continue;
      }
      if (['候选甲', '候选乙', '胜者', '败者'].includes(role)) {
        // 上单位替补之争：施颠 vs 批菊；solo 胜负按对线+操作+随机
        const [a, b] = [this.byId.shidian, this.byId.piju];
        const aWins = a.ability.对线 + a.ability.操作 + range(r, -15, 15) > b.ability.对线 + b.ability.操作;
        const m = { 候选甲: a, 候选乙: b, 胜者: aWins ? a : b, 败者: aWins ? b : a }[role];
        if (!m.isPresent() || used.has(m.id)) return null;
        bindings[role] = m;
        used.add(m.id);
        continue;
      }
      if (role === '替补') {
        const sub = this.members.find((m) => !this.computeStarters().includes(m.id));
        if (!sub.isPresent()) return null;
        bindings[role] = sub;
        used.add(sub.id);
        continue;
      }
      if (role === subjRole && subject) {
        bindings[role] = subject;
        used.add(subject.id);
        continue;
      }
      let pool = present.filter((m) => !used.has(m.id));
      if (!pool.length) return null;
      const anchor = subject || Object.values(bindings).find((b) => b && b.id);
      let weightOf = () => 1;
      if (VICTIM_ROLES.includes(role)) weightOf = (m) => (m.id === 'shidian' ? 4 : 1);
      if (relCond && anchor) {
        const v = +relCond.value;
        const ok = pool.filter((m) => (relCond.op.includes('>') ? this.rel(anchor, m) >= v : this.rel(anchor, m) <= v));
        if (ok.length) pool = ok;
      }
      if (chatterCond && role !== subjRole) {
        const attr = chatterCond.key.slice(2);
        const ok = pool.filter((m) => m.get(attr) >= +chatterCond.value);
        if (ok.length) pool = ok;
      }
      const m = weightedPick(r, pool, weightOf);
      bindings[role] = m;
      used.add(m.id);
    }
    return bindings;
  }

  renderText(ev, bindings, now) {
    const idx = (this.variantCursor.get(ev.id) ?? Math.floor(this.rand() * ev.texts.length)) % ev.texts.length;
    this.variantCursor.set(ev.id, idx + 1); // 变体轮换，避免同一句反复出现
    const opp = this.match?.opponent || this.opponentFor(now);
    // 成长播报：{属性} 取主语最接近整十的能力，{数值} 为那个整十
    const subj = Object.values(bindings).find((b) => b?.ability);
    let attr = null;
    if (subj) attr = Object.entries(subj.ability).sort((a, b) => (a[1] % 10) - (b[1] % 10))[0];
    const used = new Set(Object.values(bindings).flat().filter((b) => b?.id).map((b) => b.id));
    return ev.texts[idx].replace(/\{([^}]+)\}/g, (_, k) => {
      if (k === '对手') return opp.name;
      if (k === '对手风格') return opp.style;
      if (k.includes('/')) return pick(this.rand, k.split('/'));
      if (k === '属性') return attr ? attr[0] : '操作';
      if (k === '数值') return ev.category === '比赛' ? `${range(this.rand, 0.4, 3.2).toFixed(1)}k` : String(attr ? Math.floor(attr[1] / 10) * 10 : 50);
      const b = bindings[k];
      if (!b) {
        // 文案里出现、但槽位表里没有的角色：从在场的其他人里补一个
        const extra = this.presentMembers().find((m) => !used.has(m.id));
        if (!extra) return '有人';
        used.add(extra.id);
        bindings[k] = extra;
        return extra.name;
      }
      if (Array.isArray(b)) return '全员';
      return b.name;
    });
  }

  applyEffects(ev, bindings) {
    const out = [];
    const membersOf = (slot) => {
      const b = bindings[slot];
      if (slot === '全员' || slot === '队伍') return this.presentMembers();
      if (!b) return [];
      if (Array.isArray(b)) return b;
      return b.id ? [b] : [];
    };
    for (const eff of ev.effects) {
      if (eff.raw) continue;
      const d = parseDelta(eff.delta);
      let v = d.random ? range(this.rand, -d.value, d.value) : d.value;
      if (eff.attr === '关系') {
        const both = eff.target.includes('<>');
        const [a, b] = eff.target.split(both ? '<>' : '>');
        for (const x of membersOf(a)) for (const y of membersOf(b)) {
          if (x === y) continue;
          this.addRel(x, y, v);
          if (both) this.addRel(y, x, v);
        }
      } else {
        for (const m of membersOf(eff.target)) m.add(eff.attr, v);
      }
      const desc = describeEffect(eff, bindings);
      if (desc) out.push(desc);
    }
    for (const role of VICTIM_ROLES) if (bindings[role]?.today) bindings[role].today.blamed++;
    return out;
  }

  // 生成一条事件；opts.silent 用于回填历史（不触发动画）
  generate(now, opts = {}) {
    if (!this.presentCount()) return null;
    const r = this.rand;
    const firstLevel = weightedPick(r, Object.keys(LEVEL_WEIGHT), (k) => LEVEL_WEIGHT[k]);
    const order = [firstLevel, ...LEVEL_ORDER.slice(LEVEL_ORDER.indexOf(firstLevel) + 1)];
    for (const level of order) {
      const cands = this.candidates(level, now);
      for (let tries = 0; tries < 6 && cands.length; tries++) {
        const c = weightedPick(r, cands, (x) => x.weight);
        const bindings = this.bindRoles(c.ev, c.subject, now);
        if (!bindings) {
          cands.splice(cands.indexOf(c), 1);
          continue;
        }
        return this.commit(c.ev, c.subject, bindings, now, opts);
      }
    }
    return null;
  }

  // 按事件 id 强制触发（比赛模块、调试用）
  fire(eventId, now, presetBindings = {}, opts = {}) {
    const ev = this.eventById[eventId];
    if (!ev) return null;
    const subjRole = this.subjectRole(ev);
    const subject = presetBindings[subjRole] || null;
    const bindings = { ...this.bindRoles(ev, subject, now), ...presetBindings };
    return this.commit(ev, subject, bindings, now, opts);
  }

  commit(ev, subject, bindings, now, opts) {
    const participants = [];
    for (const b of Object.values(bindings)) {
      const list = Array.isArray(b) ? b : [b];
      for (const m of list) if (m?.id && !participants.includes(m)) participants.push(m);
    }
    const text = this.renderText(ev, bindings, now);
    const effects = this.applyEffects(ev, bindings);

    // 前因：如果由 flag 触发，找到那条事件
    let cause = null;
    for (const c of ev._conds) {
      if (c.key === 'flag' && this.flags.has(c.value)) {
        const f = this.flags.get(c.value);
        cause = `${f.time} ${f.text}`;
      }
    }
    // 冷却、flag、连锁加权
    const cdKeys = participants.length && !ev.roles.every((x) => x === '全员' || x === '对手') ? participants.map((m) => m.id) : ['*'];
    for (const id of cdKeys) this.cooldowns.set(`${ev.id}|${id}`, this.demoMin + Math.max(ev.cooldownMinutes, 30) * 0.6);
    // 剧情级同一事件全办公室 4 小时内不重复；重大级（含一次性里程碑）每天最多一次
    if (ev.level === '剧情') this.cooldowns.set(`${ev.id}|*`, this.demoMin + 240);
    if (ev.level === '重大') this.cooldowns.set(`${ev.id}|*`, Infinity);
    const flag = { subjectId: subject?.id, participantIds: participants.map((m) => m.id), at: this.demoMin, time: fmtHM(now.minuteOfDay), text };
    this.flags.set(ev.id, flag);
    for (const [re, tags] of TAG_RULES) if (re.test(ev.name)) for (const tg of tags) this.flags.set(tg, flag);
    this.chainWeights.delete(ev.id);
    for (const c of ev.chainNext) this.chainWeights.set(c.id, (this.chainWeights.get(c.id) || 0) + c.weightPct);
    if (subject) {
      this.recentSubjects.push(subject.id);
      if (this.recentSubjects.length > 5) this.recentSubjects.shift();
    }

    const entry = {
      uid: this.uid++, at: now.ms, time: fmtHM(now.minuteOfDay), level: ev.level, category: ev.category,
      eventId: ev.id, name: ev.name, text, participants: participants.map((m) => ({ id: m.id, name: m.name })),
      effects, cause, next: ev.chainNext.map((c) => this.eventById[c.id]?.name).filter(Boolean),
      bindings: Object.fromEntries(Object.entries(bindings).map(([k, v]) => [k, Array.isArray(v) ? v.map((m) => m.id) : v?.id || v?.name])),
      subjectId: subject?.id || participants[0]?.id,
    };
    this.emit(entry, opts);
    return entry;
  }

  // 首次打开时回填今天早些时候的事件，事件板不至于空着
  backfill(now) {
    if (now.dateKey !== this.dayKey) this.dailyReset(now);
    const day = this.day;
    const arrivals = this.members.map((m) => day.members[m.id]).filter((s) => !s.off).map((s) => s.arrive);
    if (!arrivals.length) return;
    const start = Math.min(...arrivals);
    const end = Math.min(now.minuteOfDay, 23 * 60);
    if (end <= start + 5) return;
    const n = Math.min(18, Math.max(4, Math.floor((end - start) / 25)));
    const r = seeded('backfill', now.dateKey);
    const times = Array.from({ length: n }, () => range(r, start + 3, end - 1)).sort((a, b) => a - b);
    const dayStart = now.ms - now.minuteOfDay * 60000;
    // 到岗流水
    const arr = this.members.filter((m) => !day.members[m.id].off && day.members[m.id].arrive < end).sort((a, b) => day.members[a.id].arrive - day.members[b.id].arrive);
    const queue = [...arr.map((m) => ({ t: day.members[m.id].arrive, m })), ...times.map((t) => ({ t }))].sort((a, b) => a.t - b.t);
    for (const q of queue) {
      const p = beijingParts(dayStart + q.t * 60000);
      for (const m of this.members) m.activity = this.baseActivity(m, q.t, day, p);
      this.demoMin += 12;
      if (q.m) this.emitRoutine(p, day.members[q.m.id].late ? `${q.m.name} ${fmtHM(q.t)} 才到岗，进门时所有人都在看他。` : `${q.m.name}到岗，开机，登录，排队。`, [q.m]);
      else this.generate(p, { silent: true });
    }
    // 粗略补算今天的摸鱼时长和单排战绩（不出事件）
    for (let t = start; t < end; t += 5) {
      const p = beijingParts(dayStart + t * 60000);
      for (const m of this.members) {
        m.activity = this.baseActivity(m, t, day, p);
        if (m.isSlacking()) m.today.slackMin += 5;
        if (m.isPlaying() && (m.today.playMin += 5) >= 30) {
          m.today.playMin = 0;
          this.resolveGame(m, p, true);
        }
      }
    }
    for (const m of this.members) m.activity = this.baseActivity(m, now.minuteOfDay, day, now);
    this.lastMinute = now.minuteOfDay;
  }
}
