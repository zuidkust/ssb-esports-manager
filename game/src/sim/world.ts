// 日常模拟（M1）：每人按当日计划和性格决定“此刻在干嘛”，状态随时间漂移，关键节点写一条日常动态
// 自主行为只用当前场地里有的物件（data/facilities.ts）：网吧角落没有冰箱，就不会有人去开冰箱
// 事件引擎（M2）会在这一层之上挑选和结算事件
import { dayInfo, MATCH_MINUTE, opponentForRound, PREMATCH_MINUTE } from '../core/calendar';
import { DAY_START } from '../core/clock';
import { availableFacilities, VENUE_CN, type FacilityId } from '../data/facilities';
import { actionPointMax, isPayday } from '../data/economy';
import { TIER_CN } from '../data/leagues';
import { PHONE_APPS } from '../data/phoneApps';
import { DISH_BY_ID } from '../data/takeout';
import { pick, range, seeded, shuffle, weightedPick, type Rand } from '../core/rng';
import { ROSTER, type MemberDef } from '../data/roster';
import { habitLine, phoneLabel, phoneWeight, snackWeightMul, soloLabel } from '../data/voice';
import { tryPersonaEvent } from './personaEvents';
import type { GameState, LogEntry, MemberState, StatusKey } from '../save/state';
import { performAction } from './actions';
import { grantDailyInsight, runPayday } from './economy';
import { expireKnots } from './relations';
import { enterDay, roundSettled } from './league';
import { lineupSlots } from './lineup';
import { buildPlans, MATCH_END, segmentAt, type DayPlan } from './schedule';
import { courierTrack, orderFor, planMorning, resolveMeal, settleMeals, type CourierTrack, type TakeoutPerson } from './takeout';

export type ActivityKind =
  | 'absent' | 'toilet'
  | 'training' | 'solo' | 'duo' | 'team' | 'match' | 'sub' | 'meeting'
  | 'slack_phone' | 'slack_stream' | 'snack' | 'drink' | 'fridge' | 'chat'
  | 'wait_food' | 'eat' | 'nap_desk' | 'nap_sofa' | 'spectate';

export interface Activity {
  kind: ActivityKind;
  label: string;
  partner?: string;
  host?: boolean;
  app?: string; // 刷手机时在用的 App（data/phoneApps.ts）
  bench?: boolean; // 下午组排这一局轮空（五黑只要 5 个人）
}

// 下午组排：英雄联盟一局 5 个人，约 35 分钟一局；局间 4 分钟排队，可以起身接水、上厕所
const TEAM_START = 14 * 60 + 30;
const GAME_MIN = 35;
const QUEUE_MIN = 4;

const HIDDEN: ActivityKind[] = ['absent', 'toilet'];
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
  facilities: Set<FacilityId>;
  private lastLine: Record<string, number> = {};
  private lastPersonaBlock = -1;
  private benchCache = new Map<number, Set<string>>(); // 日常动态节流：成员:类别 → 上次写动态的时刻
  private listeners = new Set<(e: LogEntry) => void>();

  constructor(public state: GameState) {
    this.members = ROSTER.map((def) => new Member(def, state.roster.find((r) => r.id === def.id)!));
    this.byId = Object.fromEntries(this.members.map((m) => [m.id, m]));
    this.facilities = availableFacilities(state.venueLevel, state.facilities);
  }

  // 读档：换成另一份存档，画面层继续用同一批人物
  reset(state: GameState) {
    this.state = state;
    for (const m of this.members) m.state = state.roster.find((r) => r.id === m.id)!;
    this.planDay = -1;
    this.lastSeg = null;
    this.refreshVenue();
  }

  // 场地或设施变了（读档、搬家、买设施）：重算可用物件；当天作息里的沙发午睡也跟着重排
  refreshVenue() {
    this.facilities = availableFacilities(this.state.venueLevel, this.state.facilities);
    this.planDay = -1;
  }

  has(f: FacilityId) {
    return this.facilities.has(f);
  }

  // 动态文案里对场地的称呼
  get placeName() {
    return VENUE_CN[this.state.venueLevel] ?? '网吧角落';
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

  // 当天确认过的首发优先；还没确认就按能力 × 位置适性 + 心情自动排，赛前可以改
  computeStarters(): string[] {
    return lineupSlots(this.state, this.state.clock.day);
  }

  // ───── 推进 ─────
  startDay(day: number, fresh: boolean) {
    for (const text of enterDay(this.state, day, fresh)) this.logAt('剧情', text, [], DAY_START);
    if (fresh && day > 1) {
      const gained = grantDailyInsight(this.state, this.members.map((m) => m.slackMin), day - 1);
      expireKnots(this.state, day);
      if (gained > 0) this.logAt('日常', `昨天的训练记进心得：+${gained}。`, [], DAY_START);
      if (isPayday(day)) {
        const pay = runPayday(this.state, day);
        this.logAt(pay.bankrupt ? '重大' : '剧情', pay.text, [], DAY_START);
      }
      this.overnight(day);
    }
    const apMax = actionPointMax(this.state.venueLevel, dayInfo(day).round != null);
    const spentToday = this.state.actionHistory.some((h) => h.day === day);
    // 比赛日多出来的 1 点写进当天的池子。旧档没记 apDay、或记了当天但池子还是平日的 3，且今天还没花过，就补齐。
    if (this.state.apDay !== day || (!spentToday && this.state.actionPoints !== apMax)) {
      this.state.actionPoints = apMax;
      this.state.apDay = day;
    }
    this.planDay = day;
    const info = dayInfo(day);
    this.plans = buildPlans(this.state.seed, day, this.members, info.round != null, { sofa: this.has('sofa') });
    if (this.state.meals.day !== day) {
      this.state.meals = { day, morning: planMorning(this.state, this.takeoutPeople(), day) };
    }
    this.starters = this.computeStarters();
    for (const m of this.members) m.slackMin = 0;
    this.lastLine = {};
    this.lastPersonaBlock = -1;
    this.benchCache.clear();
  }

  private takeoutPeople(): TakeoutPerson[] {
    return this.members.map((m) => ({
      id: m.id,
      name: m.name,
      persona: { 摸鱼倾向: m.state.persona.摸鱼倾向, 话痨: m.state.persona.话痨 },
      status: { 饥饿: m.state.status.饥饿, 心情: m.state.status.心情 },
      late: this.plans[m.id]?.late ?? false,
    }));
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
    this.ensureMeals(minute);
    for (const m of this.members) {
      const prev = m.activity;
      const next = this.activityAt(m, minute);
      if (prev.kind !== next.kind || prev.label !== next.label) {
        m.activity = next;
        if (!jumped) this.routine(m, prev, next, minute);
      }
      if (advanced > 0) {
        this.drift(m, advanced);
        if (m.slacking && !m.activity.bench) m.slackMin += advanced; // 轮空不算摸鱼
      }
    }
    if (!jumped) {
      this.segmentLines(minute, advanced);
      this.personaTick(minute);
    } else this.lastPersonaBlock = Math.floor(minute / 20);
  }

  private activityAt(m: Member, t: number): Activity {
    const info = this.today;
    const plan = this.plans[m.id];
    const matchDay = info.round != null;
    if (t < plan.arrive) return { kind: 'absent', label: '还没到' };
    if (t >= plan.leave) return { kind: 'absent', label: '已下班' };
    if (matchDay && t >= MATCH_MINUTE && t < MATCH_END) {
      const done = roundSettled(this.state);
      if (this.starters.includes(m.id)) return { kind: 'match', label: done ? '赛后还坐在机位上' : '比赛中' };
      return { kind: 'sub', label: done ? '台下 · 第二解说收工' : '台下 · 第二解说' };
    }
    if (matchDay && t >= PREMATCH_MINUTE && t < MATCH_MINUTE) return { kind: 'meeting', label: this.meetingLabel() };
    const meal = this.mealActivity(m, t);
    // 非比赛日晚饭：在岗的人都在吃，不要还坐成平时单排的样子
    if (!matchDay && this.segment(t).id === 'dinner') {
      if (meal?.kind === 'eat') return meal;
      return { kind: 'eat', label: meal?.kind === 'wait_food' ? '晚饭时间，外卖还在路上' : '在工位吃晚饭' };
    }
    if (meal) return meal;
    if (t < 9 * 60 + 15) return { kind: 'training', label: '到岗热身（训练模式）' };
    const partner = this.assignedPartner(m, t);
    const segId = this.segment(t).id;
    if (partner && (segId === 'morning' || segId === 'free')) return { kind: 'duo', label: `和${partner.name}双排（老板安排）`, partner: partner.id };
    if (plan.nap && t >= plan.nap[0] && t < plan.nap[1]) return plan.sofa ? { kind: 'nap_sofa', label: '沙发午睡“想战术”' } : { kind: 'nap_desk', label: '趴桌午睡' };

    const block = Math.floor(t / 10);
    const sub = t - block * 10;
    const r = seeded(this.state.seed, 'blk', info.day, m.id, block);
    const seg = this.segment(t).id;
    if (seg === 'team') return this.teamActivity(m, t);
    if (seg === 'lunch' || seg === 'nap' || seg === 'dinner') return this.idle(m, r, sub, t, true);
    return this.idle(m, r, sub, t, false);
  }

  // 这一局谁轮空：在场超过 5 人时，按每天洗一次牌的顺序轮流坐板凳
  benchedFor(game: number): Set<string> {
    let out = this.benchCache.get(game);
    if (out) return out;
    const gStart = TEAM_START + game * GAME_MIN;
    const order = shuffle(seeded(this.state.seed, 'bench', this.state.clock.day), this.members);
    const avail = order.filter((o) => this.presentAt(o, gStart));
    const extra = Math.max(0, avail.length - 5);
    out = new Set<string>();
    for (let i = 0; i < extra; i++) out.add(avail[(game * extra + i) % avail.length].id);
    this.benchCache.set(game, out);
    return out;
  }

  private teamActivity(m: Member, t: number): Activity {
    const game = Math.floor((t - TEAM_START) / GAME_MIN);
    const inGame = t - TEAM_START - game * GAME_MIN;
    if (this.benchedFor(game).has(m.id)) return this.benchActivity(m, game, inGame, t);
    // 局间排队：偶尔起身接水、上厕所
    if (inGame < QUEUE_MIN && game > 0) {
      const r = seeded(this.state.seed, 'queue', this.state.clock.day, m.id, game);
      if (r() < 0.25) return r() < 0.6 ? { kind: 'drink', label: '局间起身接杯水' } : { kind: 'toilet', label: '局间去趟厕所' };
      return { kind: 'team', label: '五黑排队中' };
    }
    return { kind: 'team', label: '五黑组排中' };
  }

  // 轮空的人：观战、吃点东西、耍手机、看直播，每 10 分钟可能换一件事
  private benchActivity(m: Member, game: number, inGame: number, t: number): Activity {
    const r = seeded(this.state.seed, 'benchAct', this.state.clock.day, m.id, game, Math.floor(inGame / 10));
    const players = this.members.filter((o) => o !== m && !this.benchedFor(game).has(o.id) && this.presentAt(o, t));
    const p = m.state.persona;
    const kinds: [string, number][] = [
      ['spectate', players.length ? 3 + p.胜负心 / 40 : 0],
      ['phone', 1.5 + p.摸鱼倾向 / 40],
      ['stream', 0.8 + p.话痨 / 80],
      ['eat', inGame < 15 ? 1 + m.state.status.饥饿 / 40 : 0],
    ];
    const k = weightedPick(r, kinds, (x) => x[1])![0];
    if (k === 'spectate') {
      const who = pick(r, players);
      return { kind: 'spectate', label: `这把轮空，站在${who.name}身后观战`, partner: who.id, bench: true };
    }
    if (k === 'eat') return { kind: 'eat', label: '这把轮空，趁空吃点东西', bench: true };
    if (k === 'stream') return { kind: 'slack_stream', label: '这把轮空，在电脑上看比赛直播', bench: true };
    const app = weightedPick(r, PHONE_APPS, (a) => phoneWeight(m.def, a))!;
    return { kind: 'slack_phone', label: `${phoneLabel(m.def, app)}（这把轮空）`, app: app.id, bench: true };
  }

  // 点了外卖的人等外卖员；没点的人继续待在工位上干别的。煎饼、泡面不叫外卖
  private mealActivity(m: Member, t: number): Activity | null {
    const plan = this.plans[m.id];
    const morning = this.state.meals.morning.find((s) => s.memberId === m.id);
    if (morning && t >= plan.arrive && t < plan.arrive + 12) return { kind: 'eat', label: '边走边吃煎饼果子' };
    const o = orderFor(this.state.meals, m.id, t);
    if (!o) return null;
    const dish = DISH_BY_ID[o.dishId]?.name ?? '外卖';
    if (!o.delivery || t >= o.deliveredAt) return { kind: 'eat', label: o.dishId === 'instant' ? '在工位吃泡面' : `在工位吃${dish}` };
    return { kind: 'wait_food', label: `等外卖 · ${dish}` };
  }

  private assignedPartner(m: Member, t: number): Member | null {
    const f = this.state.flags;
    if (f.duoDay !== this.state.clock.day) return null;
    const otherId = f.duoA === m.id ? f.duoB : f.duoB === m.id ? f.duoA : '';
    if (!otherId) return null;
    const other = this.byId[otherId];
    if (!other || !this.presentAt(m, t) || !this.presentAt(other, t)) return null;
    return other;
  }

  private ensureMeals(minute: number) {
    const day = this.state.clock.day;
    if (this.state.meals.day !== day) return;
    const people = this.takeoutPeople();
    if (minute >= 12 * 60 && !this.state.meals.lunch) {
      const r = resolveMeal({ state: this.state, people, day, meal: 'lunch', place: this.placeName });
      this.state.meals.lunch = r.record;
      for (const l of r.logs) this.logAt(l.level, l.text, l.ids, l.minute);
    }
    if (minute >= 18 * 60 && !this.state.meals.dinner) {
      const r = resolveMeal({ state: this.state, people, day, meal: 'dinner', place: this.placeName });
      this.state.meals.dinner = r.record;
      for (const l of r.logs) this.logAt(l.level, l.text, l.ids, l.minute);
    }
    settleMeals(this.state, minute);
  }

  courierJob(minute: number): CourierTrack | null {
    return courierTrack(this.state.meals, minute);
  }

  act(actionId: string, targets: string[]) {
    return performAction(this.state, actionId, targets, {
      day: this.state.clock.day,
      minute: this.state.clock.minute,
      log: (level, text, ids) => this.log(level, text, ids),
    });
  }

  private meetingLabel() {
    if (this.state.venueLevel === 0) return '围在机位后面开赛前会';
    return this.has('whiteboard') ? '白板前开赛前会' : '围在一起开赛前会';
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
      // 物件类行为只在场地里有这件设施时才会发生
      const kinds: [ActivityKind, number, string][] = [
        ['slack_phone', 2 + p.摸鱼倾向 / 30, '耍手机'],
        ['slack_stream', 1 + p.话痨 / 50, '在电脑上看直播“复盘”'],
        ['snack', (!this.has('snack') ? 0 : s.饥饿 > 55 ? 3 : 0.8) * snackWeightMul(m.id), '去零食柜觅食'],
        ['fridge', this.has('fridge') ? 0.8 : 0, '开冰箱拿饮料'],
        ['drink', this.has('cooler') ? 1.2 : 0, '去饮水机接水'],
        ['toilet', 0.8, '带薪如厕'],
      ];
      const k = weightedPick(r, kinds, (x) => x[1])!;
      // 去茶水区、厕所只占半个时间块，其余时间回去单排
      if ((k[0] === 'snack' || k[0] === 'fridge' || k[0] === 'drink' || k[0] === 'toilet') && sub >= 5) return { kind: 'solo', label: soloLabel(m.id, breakTime, r) };
      if (k[0] === 'slack_phone') {
        const app = weightedPick(r, PHONE_APPS, (a) => phoneWeight(m.def, a))!;
        return { kind: 'slack_phone', label: `${phoneLabel(m.def, app)}（摸鱼）`, app: app.id };
      }
      return { kind: k[0], label: k[2] };
    }
    if (r() < 0.14) {
      const buddy = this.members.find((o) => o !== m && this.bond(m.id, o.id) >= 45 && this.presentAt(o, t));
      if (buddy) return { kind: 'duo', label: `和${buddy.name}双排`, partner: buddy.id };
    }
    return { kind: 'solo', label: soloLabel(m.id, breakTime, r) };
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
    if (p.nap && t >= p.nap[0] && t < p.nap[1]) return false;
    return true;
  }

  private drift(m: Member, d: number) {
    const s = m.state.status;
    const k = m.activity.kind;
    const clamp = (key: StatusKey, v: number) => (s[key] = Math.max(0, Math.min(100, v)));
    clamp('体力', s.体力 - d * (m.playing ? 0.035 : 0.012) + (k === 'nap_desk' || k === 'nap_sofa' ? d * 0.25 : 0));
    clamp('饥饿', s.饥饿 + d * 0.07 - (k === 'eat' || k === 'snack' ? d * 1.2 : 0));
    clamp('专注', s.专注 + ((s.体力 * 0.8 - s.专注) * d) / 300);
    clamp('心情', s.心情 + ((62 - s.心情) * d) / 600 + (k === 'chat' || k === 'fridge' ? d * 0.08 : 0));
    clamp('疲劳', s.疲劳 + (m.playing ? d * 0.03 : -d * 0.01) - (k === 'nap_desk' || k === 'nap_sofa' ? d * 0.2 : 0));
    clamp('压力', s.压力 + (k === 'match' || k === 'meeting' ? d * 0.06 : -d * 0.005));
  }

  // ───── 日常动态 ─────
  // 到岗、下班每人一条；摸鱼、午睡、刷手机、看直播这类日常按类别节流，看板上能一眼看到大家在干嘛
  private routine(m: Member, prev: Activity, next: Activity, t: number) {
    const r = seeded(this.state.seed, 'line', this.state.clock.day, m.id, Math.floor(t));
    const plan = this.plans[m.id];
    const n = m.name;
    let text: string | null = null;
    if (prev.kind === 'absent' && prev.label === '还没到' && next.kind !== 'absent') {
      text = plan.late
        ? pick(r, [`${n}才到，进门时所有人都在看他。`, `${n}踩着迟到线冲进门，假装自己一直都在。`])
        : t < 9 * 60 + 5
          ? pick(r, [`${n}第一批到，开机、登录。`, `${n}早早到了，${this.placeName}还很安静。`])
          : pick(r, [`${n}到了，先去接了杯水。`, `${n}到了，开机，登录，排队。`]);
    } else if (next.kind === 'absent' && next.label === '已下班') {
      text = t < 20 * 60 + 30
        ? pick(r, [`${n}收拾背包先撤了。`, `${n}：“我先走了。”人已经到门口了。`])
        : pick(r, [`${n}加练到很晚，打完最后一把才走。`, `${n}打完最后一把，伸了个懒腰下班。`]);
    } else if (next.kind === 'nap_sofa') text = `${n}占领了沙发，说是去“想战术”。`;
    else if (next.kind === 'nap_desk') {
      const habit = habitLine(m.id, 'nap_desk', '', undefined, r);
      text = habit ?? (m.state.persona.爱睡觉 >= 60
        ? pick(r, [`${n}又趴在键盘上睡着了，屏幕上全是 jjjjjj。`, `${n}：“我就眯五分钟。”然后呼噜声响起。`, `${n}头一点一点，最后整个人趴下了。`])
        : pick(r, [`${n}趴在桌上午睡。`, `${n}把外套往头上一盖，趴下了。`]));
    } else if (next.bench) {
      // 轮空：只在刚下场时写一条
      if (!prev.bench) text = `${n}这把轮空，${this.benchLine(next)}。`;
    } else if (this.throttle(m, next.kind, t)) text = this.slackLine(m, next, r);
    if (text) this.log('日常', text, next.partner ? [m.id, next.partner] : [m.id]);
  }

  // 同一个人同一类日常，隔一段时间才再写一条，避免刷屏
  private throttle(m: Member, kind: ActivityKind, t: number): boolean {
    const gap: Partial<Record<ActivityKind, number>> = { slack_phone: 75, slack_stream: 90, duo: 120, chat: 60, snack: 90, fridge: 90, drink: 120, toilet: 150 };
    const g = gap[kind];
    if (g == null) return false;
    const key = `${m.id}:${kind}`;
    if (t - (this.lastLine[key] ?? -1e9) < g) return false;
    this.lastLine[key] = t;
    return true;
  }

  private benchLine(a: Activity): string {
    switch (a.kind) {
      case 'spectate':
        return `站到${this.byId[a.partner!].name}身后观战`;
      case 'eat':
        return '趁空吃点东西';
      case 'slack_stream':
        return '在电脑上看比赛直播';
      default:
        return `摸出手机${a.label.replace('（这把轮空）', '')}`;
    }
  }

  private slackLine(m: Member, a: Activity, r: Rand): string | null {
    const n = m.name;
    const other = a.partner ? this.byId[a.partner].name : '';
    switch (a.kind) {
      case 'slack_phone': {
        const voiced = habitLine(m.id, 'slack_phone', '', a.app, r);
        if (voiced) return voiced;
        const app = a.label.replace('（摸鱼）', '').replace('（这把轮空）', '');
        if (a.app === 'douyin') return pick(r, [`${n}摸出手机${app}，外放声音有点大。`, `${n}${app}，一刷就停不下来。`, `${n}${app}，嘴角疯狂上扬。`]);
        if (a.app === 'generic') return pick(r, [`${n}低头耍手机，不知道在看什么。`, `${n}把手机藏在键盘后面耍。`]);
        return pick(r, [`${n}摸出手机${app}。`, `${n}趁没人注意，${app}。`]);
      }
      case 'slack_stream':
        return habitLine(m.id, 'slack_stream', '', undefined, r) ?? pick(r, [`${n}在电脑上开了个直播，说是在“复盘”。`, `${n}看起了主播的直播，声称在学思路。`]);
      case 'duo':
        return a.partner && a.partner < m.id ? null : `${n}拉上${other}双排。`;
      case 'chat':
        if (!a.host) return null;
        return habitLine(m.id, 'chat', other, undefined, r) ?? pick(r, [`${n}溜到${other}旁边闲聊。`, `${n}和${other}聊起了昨晚那把。`]);
      case 'snack':
        return habitLine(m.id, 'snack', '', undefined, r) ?? pick(r, [`${n}去零食柜翻了翻，拿走一包薯片。`, `${n}在零食柜前犹豫了很久。`]);
      case 'fridge':
        return habitLine(m.id, 'fridge', '', undefined, r) ?? pick(r, [`${n}打开冰箱拿了瓶饮料。`, `${n}在冰箱前站了半天，不知道在找什么。`]);
      case 'drink':
        return habitLine(m.id, 'drink', '', undefined, r) ?? `${n}起身去饮水机接水。`;
      case 'toilet':
        return pick(r, [`${n}起身去了趟厕所，带薪的那种。`, `${n}：“我去趟厕所。”手机也一起带走了。`]);
      default:
        return null;
    }
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
      morning: this.today.round != null && opp ? `今天比赛日：晚上 19:00 ${TIER_CN[this.state.season.tier]}第 ${this.today.round} 轮，对手「${opp.name}」。` : '上班了。有人在单排，有人在刷手机。',
      lunch: `饭点到了，${this.placeName}里开始讨论吃什么。`,
      team: `下午组排开始，耳机都戴上了，${this.placeName}安静下来。`,
      dinner: '组排结束，晚饭时间。',
      free: this.today.round != null ? '比赛结束，大家还没散。' : '自由时间：想加练的加练，想摸鱼的摸鱼。',
      prematch: this.state.venueLevel === 0
        ? '赛前会：大家站到自己机位后面。'
        : this.has('whiteboard')
          ? '赛前会：大家在白板前分开站好。'
          : '赛前会：大家在空地上分开站好。',
      match: opp ? `直播打开了，对阵「${opp.name}」。` : '直播打开了。',
    };
    const text = lines[seg.id];
    if (text) this.log(seg.id === 'match' || (seg.id === 'morning' && this.today.round != null) ? '有趣' : '日常', text, []);
  }

  private personaTick(minute: number) {
    const block = Math.floor(minute / 20);
    if (block === this.lastPersonaBlock) return;
    this.lastPersonaBlock = block;
    const present = this.members.filter((m) => m.present).map((m) => m.id);
    const fired = tryPersonaEvent(this.state, present, this.segment(minute).id, this.state.clock.day, minute);
    if (fired) this.log(fired.level, fired.text, fired.ids);
  }

  log(level: LogEntry['level'], text: string, ids: string[]) {
    this.logAt(level, text, ids, this.state.clock.minute);
  }

  logAt(level: LogEntry['level'], text: string, ids: string[], minute: number) {
    const e: LogEntry = { id: this.state.nextLogId++, day: this.state.clock.day, minute: Math.floor(minute), level, text, ids };
    this.state.eventLog.unshift(e);
    if (this.state.eventLog.length > 300) this.state.eventLog.length = 300;
    for (const fn of this.listeners) fn(e);
  }
}
