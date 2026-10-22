// 日常模拟（M1）：每人按当日计划和性格决定“此刻在干嘛”，状态随时间漂移，关键节点写一条日常动态
// 事件引擎（M2）会在这一层之上挑选和结算事件
import { dayInfo, MATCH_MINUTE, opponentForRound, PREMATCH_MINUTE } from '../core/calendar';
import { TIER_CN } from '../data/leagues';
import { PHONE_APPS } from '../data/phoneApps';
import { fmtHM } from '../core/clock';
import { pick, range, seeded, weightedPick, type Rand } from '../core/rng';
import { POSITIONS, ROSTER, positionFit, type MemberDef, type Position } from '../data/roster';
import type { GameState, LogEntry, MemberState, StatusKey } from '../save/state';
import { buildPlans, MATCH_END, segmentAt, type DayPlan } from './schedule';

export type ActivityKind =
  | 'absent' | 'out' | 'toilet'
  | 'training' | 'solo' | 'duo' | 'team' | 'match' | 'sub' | 'meeting'
  | 'slack_phone' | 'slack_stream' | 'snack' | 'drink' | 'fridge' | 'chat'
  | 'eat' | 'nap_desk' | 'nap_sofa';

export interface Activity {
  kind: ActivityKind;
  label: string;
  partner?: string;
  host?: boolean;
  app?: string; // 刷手机时在用的 App（data/phoneApps.ts）
}

const HIDDEN: ActivityKind[] = ['absent', 'out', 'toilet'];
const SLACK: ActivityKind[] = ['slack_phone', 'slack_stream', 'snack', 'drink', 'fridge', 'chat', 'toilet', 'nap_desk', 'nap_sofa'];
const PLAYING: ActivityKind[] = ['training', 'solo', 'duo', 'team', 'match'];

export class Member {
  activity: Activity = { kind: 'absent', label: '还没到' };
  slackMin = 0; // 今天摸鱼分钟
  constructor(public def: MemberDef, public state: MemberState) {}
  get id() {
    return this.def.id;
  }
  get name() {
    return this.def.name;
  }
  get present() {
    return !HIDDEN.includes(this.activity.kind);
  }
  get slacking() {
    return SLACK.includes(this.activity.kind);
  }
  get playing() {
    return PLAYING.includes(this.activity.kind);
  }
}

export class World {
  members: Member[];
  byId: Record<string, Member>;
  plans: Record<string, DayPlan> = {};
  planDay = -1;
  starters: string[] = [];
  private listeners = new Set<(e: LogEntry) => void>();

  constructor(public state: GameState) {
    this.members = ROSTER.map((def) => new Member(def, state.roster.find((r) => r.id === def.id)!));
    this.byId = Object.fromEntries(this.members.map((m) => [m.id, m]));
  }

  // 读档：换成另一份存档，画面层继续用同一批人物
  reset(state: GameState) {
    this.state = state;
    for (const m of this.members) m.state = state.roster.find((r) => r.id === m.id)!;
    this.planDay = -1;
    this.lastSeg = null;
  }

  onLog(fn: (e: LogEntry) => void) {
    this.listeners.add(fn);
  }

  // ───── 查询 ─────
  get today() {
    return dayInfo(this.state.clock.day);
  }
  presentCount() {
    return this.members.filter((m) => m.present).length;
  }
  bond(a: string, b: string) {
    return this.state.relations[a < b ? `${a}|${b}` : `${b}|${a}`]?.bond ?? 30;
  }
  segment(minute: number) {
    return segmentAt(minute, this.today.round != null);
  }
  opponentToday() {
    const r = this.today.round;
    return r == null ? null : opponentForRound(this.state.season.tier, r);
  }

  // 首发：每个位置选“能力 × 位置适性 + 心情”最高的人；上单在施颠和批菊之间竞争
  // M3 改成老板在赛前手动选
  computeStarters(): string[] {
    const used = new Set<string>();
    const out: string[] = [];
    const score = (m: Member, pos: Position) => {
      const a = m.state.ability;
      const core = pos === 'top' ? a.lane + a.mech : pos === 'jungle' ? a.roam + a.sense : pos === 'mid' ? a.lane + a.fight : pos === 'adc' ? a.mech + a.fight : a.sense + a.roam;
      return core * positionFit(m.def, pos) + m.state.status.心情 * 0.2;
    };
    for (const pos of POSITIONS) {
      const best = this.members.filter((m) => !used.has(m.id)).sort((x, y) => score(y, pos) - score(x, pos))[0];
      used.add(best.id);
      out.push(best.id);
    }
    return out;
  }

  // ───── 推进 ─────
  startDay(day: number, fresh: boolean) {
    this.planDay = day;
    const info = dayInfo(day);
    if (fresh) this.overnight(day);
    this.plans = buildPlans(this.state.seed, day, this.members, info.round != null);
    this.starters = this.computeStarters();
    for (const m of this.members) m.slackMin = 0;
  }

  // 过夜恢复：体力、饥饿、专注部分重置，手感每天随机
  private overnight(day: number) {
    for (const m of this.members) {
      const r = seeded(this.state.seed, 'night', day, m.id);
      const s = m.state.status;
      s.体力 = Math.min(100, Math.max(s.体力 + 40, range(r, 70, 92)));
      s.饥饿 = range(r, 22, 38);
      s.专注 = range(r, 50, 80);
      s.手感 = range(r, 35, 85);
      s.心情 += (66 - s.心情) * 0.5;
      s.疲劳 *= 0.4;
      s.压力 *= 0.6;
    }
  }

  // minute：当前时刻；advanced：本帧推进的游戏分钟；jumped：读档、跳时间等瞬移，不写动态
  update(minute: number, advanced: number, jumped: boolean) {
    const day = this.state.clock.day;
    if (day !== this.planDay) this.startDay(day, !jumped);
    for (const m of this.members) {
      const prev = m.activity;
      const next = this.activityAt(m, minute);
      if (prev.kind !== next.kind || prev.label !== next.label) {
        m.activity = next;
        if (!jumped) this.routine(m, prev, next, minute);
      }
      if (advanced > 0) {
        this.drift(m, advanced);
        if (m.slacking) m.slackMin += advanced;
      }
    }
    if (!jumped) this.segmentLines(minute, advanced);
  }

  private activityAt(m: Member, t: number): Activity {
    const info = this.today;
    const plan = this.plans[m.id];
    const matchDay = info.round != null;
    if (t < plan.arrive) return { kind: 'absent', label: '还没到' };
    if (t >= plan.leave) return { kind: 'absent', label: '已下班' };
    if (matchDay && t >= MATCH_MINUTE && t < MATCH_END) {
      return this.starters.includes(m.id) ? { kind: 'match', label: '比赛中' } : { kind: 'sub', label: '台下 · 第二解说' };
    }
    if (matchDay && t >= PREMATCH_MINUTE && t < MATCH_MINUTE) return { kind: 'meeting', label: '白板前开赛前会' };
    if (t < 9 * 60) return { kind: 'training', label: '早到热身（训练模式）' };
    if (t >= plan.lunch[0] && t < plan.lunch[1]) return plan.lunchOut ? { kind: 'out', label: '出去吃午饭了' } : { kind: 'eat', label: '在工位吃午饭' };
    if (plan.nap && t >= plan.nap[0] && t < plan.nap[1]) return plan.sofa ? { kind: 'nap_sofa', label: '沙发午睡“想战术”' } : { kind: 'nap_desk', label: '趴桌午睡' };
    if (t >= plan.dinner[0] && t < plan.dinner[1]) return plan.dinnerOut ? { kind: 'out', label: '出去吃晚饭了' } : { kind: 'eat', label: '在工位吃晚饭' };

    const block = Math.floor(t / 10);
    const sub = t - block * 10;
    const r = seeded(this.state.seed, 'blk', info.day, m.id, block);
    const seg = this.segment(t).id;
    if (seg === 'team') {
      // 组排时段：偶尔起身喝水、上厕所，其余时间都在五黑
      if (r() < 0.07 && sub < 5) return r() < 0.6 ? { kind: 'drink', label: '起身接杯水' } : { kind: 'toilet', label: '去趟厕所' };
      return { kind: 'team', label: '五黑组排中' };
    }
    if (seg === 'lunch' || seg === 'nap' || seg === 'dinner') return this.idle(m, r, sub, t, true);
    return this.idle(m, r, sub, t, false);
  }

  // 自由时段：按性格和状态挑自主行为（设计文档 6.1.1）
  private idle(m: Member, r: Rand, sub: number, t: number, breakTime: boolean): Activity {
    const p = m.state.persona;
    const s = m.state.status;
    const pair = this.chatPair(Math.floor(t / 10));
    if (pair && pair.includes(m.id)) {
      const other = this.byId[pair[0] === m.id ? pair[1] : pair[0]];
      if (this.presentAt(other, t)) return { kind: 'chat', label: `和${other.name}闲聊`, partner: other.id, host: pair[0] === m.id };
    }
    let slackP = 0.08 + (p.摸鱼倾向 / 100) * 0.36 + (s.专注 < 45 ? 0.12 : 0);
    if (breakTime) slackP += 0.35;
    if (this.today.round != null) slackP *= 0.6;
    if (r() < slackP) {
      const kinds: [ActivityKind, number, string][] = [
        ['slack_phone', 2 + p.摸鱼倾向 / 30, '耍手机'],
        ['slack_stream', 1 + p.话痨 / 50, '在电脑上看直播“复盘”'],
        ['snack', s.饥饿 > 55 ? 3 : 0.8, '去零食柜觅食'],
        ['fridge', 0.8, '开冰箱拿饮料'],
        ['drink', 1.2, '去饮水机接水'],
        ['toilet', 0.8, '带薪如厕'],
      ];
      const k = weightedPick(r, kinds, (x) => x[1])!;
      // 去茶水区、厕所只占半个时间块，其余时间回去单排
      if ((k[0] === 'snack' || k[0] === 'fridge' || k[0] === 'drink' || k[0] === 'toilet') && sub >= 5) return { kind: 'solo', label: '单排冲分' };
      if (k[0] === 'slack_phone') {
        const app = weightedPick(r, PHONE_APPS, (a) => a.weight)!;
        return { kind: 'slack_phone', label: `${app.label}（摸鱼）`, app: app.id };
      }
      return { kind: k[0], label: k[2] };
    }
    if (r() < 0.14) {
      const buddy = this.members.find((o) => o !== m && this.bond(m.id, o.id) >= 45 && this.presentAt(o, t));
      if (buddy) return { kind: 'duo', label: `和${buddy.name}双排`, partner: buddy.id };
    }
    return { kind: 'solo', label: breakTime ? '饭后单排一把' : '单排冲分' };
  }

  // 每 10 分钟块最多一对人闲聊，话痨的人更容易被抽中
  private chatPair(block: number): [string, string] | null {
    const r = seeded(this.state.seed, 'chat', this.state.clock.day, block);
    if (r() > 0.3) return null;
    const w = (m: Member) => 0.5 + m.state.persona.话痨 / 50;
    const a = weightedPick(r, this.members, w)!;
    const b = weightedPick(r, this.members.filter((x) => x !== a), w)!;
    return [a.id, b.id];
  }

  private presentAt(m: Member, t: number) {
    const p = this.plans[m.id];
    if (t < p.arrive || t >= p.leave) return false;
    if (t >= p.lunch[0] && t < p.lunch[1]) return !p.lunchOut;
    if (t >= p.dinner[0] && t < p.dinner[1]) return !p.dinnerOut;
    if (p.nap && t >= p.nap[0] && t < p.nap[1]) return false;
    return true;
  }

  private drift(m: Member, d: number) {
    const s = m.state.status;
    const k = m.activity.kind;
    const clamp = (key: StatusKey, v: number) => (s[key] = Math.max(0, Math.min(100, v)));
    clamp('体力', s.体力 - d * (m.playing ? 0.035 : 0.012) + (k === 'nap_desk' || k === 'nap_sofa' ? d * 0.25 : 0));
    clamp('饥饿', s.饥饿 + d * 0.07 - (k === 'eat' || k === 'out' || k === 'snack' ? d * 1.2 : 0));
    clamp('专注', s.专注 + ((s.体力 * 0.8 - s.专注) * d) / 300);
    clamp('心情', s.心情 + ((62 - s.心情) * d) / 600 + (k === 'chat' || k === 'fridge' ? d * 0.08 : 0));
    clamp('疲劳', s.疲劳 + (m.playing ? d * 0.03 : -d * 0.01) - (k === 'nap_desk' || k === 'nap_sofa' ? d * 0.2 : 0));
    clamp('压力', s.压力 + (k === 'match' || k === 'meeting' ? d * 0.06 : -d * 0.005));
  }

  // ───── 日常动态 ─────
  private routine(m: Member, prev: Activity, next: Activity, t: number) {
    const r = seeded(this.state.seed, 'line', this.state.clock.day, m.id, Math.floor(t));
    const plan = this.plans[m.id];
    let text: string | null = null;
    if (prev.kind === 'absent' && prev.label === '还没到' && next.kind !== 'absent') {
      text = plan.late
        ? pick(r, [`${m.name} ${fmtHM(t)} 才到，进门时所有人都在看他。`, `${m.name}踩着迟到线冲进门，假装自己一直都在。`])
        : t < 8 * 60 + 45
          ? pick(r, [`${m.name}第一批到，开灯、开机。`, `${m.name}早早到了，办公室还很安静。`])
          : pick(r, [`${m.name}到了，先去接了杯水。`, `${m.name}到了，开机，登录，排队。`]);
    } else if (next.kind === 'absent' && next.label === '已下班') {
      text = t < 20 * 60 + 30
        ? pick(r, [`${m.name}收拾背包先撤了。`, `${m.name}：“我先走了。”门一关，人已经到电梯口。`])
        : pick(r, [`${m.name}加练到很晚，顺手关了自己的台灯。`, `${m.name}打完最后一把，伸了个懒腰下班。`]);
    } else if (next.kind === 'nap_sofa') text = `${m.name}占领了沙发，说是去“想战术”。`;
    else if (next.kind === 'out' && prev.kind !== 'out') text = next.label.includes('午') ? `${m.name}出去吃午饭了。` : `${m.name}出去吃晚饭了。`;
    if (text) this.log('日常', text, [m.id]);
  }

  private lastSeg: string | null = null;
  private segmentLines(t: number, advanced: number) {
    const seg = this.segment(t);
    if (seg.id === this.lastSeg) return;
    const prevSeg = this.lastSeg;
    this.lastSeg = seg.id;
    if (prevSeg == null || advanced <= 0) return;
    const opp = this.opponentToday();
    const lines: Partial<Record<typeof seg.id, string>> = {
      morning: this.today.round != null && opp ? `今天比赛日：晚上 19:00 ${TIER_CN[this.state.season.tier]}第 ${this.today.round} 轮，对手「${opp.name}」。` : '09:00，上班。有人在单排，有人在刷手机。',
      lunch: '饭点到了，办公室里开始讨论吃什么。',
      team: '下午组排开始，耳机都戴上了，办公室安静下来。',
      dinner: '组排结束，晚饭时间。',
      free: this.today.round != null ? '比赛结束，大家还没散。' : '自由时间：想加练的加练，想摸鱼的摸鱼。',
      prematch: '赛前会：所有人围到白板前。',
      match: opp ? `比赛开始！vs「${opp.name}」。（比赛引擎 M3 实装）` : '比赛开始！',
    };
    const text = lines[seg.id];
    if (text) this.log(seg.id === 'match' || (seg.id === 'morning' && this.today.round != null) ? '有趣' : '日常', text, []);
  }

  log(level: LogEntry['level'], text: string, ids: string[]) {
    const e: LogEntry = { id: this.state.nextLogId++, day: this.state.clock.day, minute: Math.floor(this.state.clock.minute), level, text, ids };
    this.state.eventLog.unshift(e);
    if (this.state.eventLog.length > 300) this.state.eventLog.length = 300;
    for (const fn of this.listeners) fn(e);
  }
}
