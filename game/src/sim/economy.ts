// 经济结算：月薪、房租、餐补、赞助、私房钱、破产、训练心得、买设施。
// 比赛奖金和比赛心得等 M3 调用 noteMatch。
import { dayInfo } from '../core/calendar';
import { availableFacilities, FACILITY_BY_ID, VENUE_CN, type FacilityId } from '../data/facilities';
import {
  BANKRUPT_MONTHS,
  DAILY_INSIGHT_EACH,
  INSIGHT_FACILITY_BONUS,
  MATCH_INSIGHT,
  MONTH_DAYS,
  RENT,
  SALARY,
  SLACK_CUTOFF,
  START_CASH,
  START_STASH,
} from '../data/economy';
import { MAX_SPONSORS, SPONSOR_BY_ID, SPONSORS, type SponsorDef, type SponsorTier } from '../data/sponsors';
import { seeded } from '../core/rng';
import type { GameState } from '../save/state';
import { anyBondAtLeast } from './relations';

const TIER_RANK: Record<SponsorTier, number> = { netcafe: 0, city: 1, national: 2, world: 3 };

export function monthlySalaryEach(state: GameState): number {
  return SALARY[state.season.tier];
}

export function monthlySalaryTotal(state: GameState): number {
  return state.roster.length * monthlySalaryEach(state);
}

export function monthlyRent(state: GameState): number {
  return RENT[Math.max(0, Math.min(RENT.length - 1, state.venueLevel | 0))] ?? RENT[0];
}

export function mealAllowanceDue(state: GameState): number {
  if (!availableFacilities(state.venueLevel, state.facilities).has('mealAllowance')) return 0;
  return FACILITY_BY_ID.mealAllowance.price;
}

export function sponsorIncome(state: GameState): number {
  let n = 0;
  for (const id of state.sponsors) n += SPONSOR_BY_ID[id]?.income ?? 0;
  return n;
}

export function monthlyDue(state: GameState): number {
  return monthlySalaryTotal(state) + monthlyRent(state) + mealAllowanceDue(state);
}

function tierRank(state: GameState): number {
  if (state.record.worldQualified) return TIER_RANK.world;
  return TIER_RANK[state.season.tier] ?? 0;
}

export function goalMet(state: GameState, sponsorId: string): boolean {
  const r = state.record;
  switch (sponsorId) {
    case 'wang':
      return r.wins >= 3;
    case 'huang':
      return (r.bestRank ?? 99) <= 4 && r.huangmenji >= 10;
    case 'keyboard':
      return r.citySafe;
    case 'milktea':
      return anyBondAtLeast(state, 65);
    case 'energy':
      return r.reachedNational || state.season.tier === 'national';
    case 'peripheral':
      return r.nationalTop4;
    case 'phone':
      return r.worldQualified;
    case 'car':
      return r.worldTop4;
    default:
      return false;
  }
}

export function goalProgress(state: GameState, sponsorId: string): string {
  const r = state.record;
  switch (sponsorId) {
    case 'wang':
      return `赢 ${r.wins}/3 场`;
    case 'huang':
      return `黄焖鸡 ${r.huangmenji}/10 · 最好名次 ${r.bestRank ?? '未出'}`;
    case 'keyboard':
      return r.citySafe ? '已保级' : '还没保级';
    case 'milktea':
      return anyBondAtLeast(state, 65) ? '已有好兄弟' : '还没有好兄弟';
    case 'energy':
      return r.reachedNational || state.season.tier === 'national' ? '已进国内联赛' : '还在更低级别';
    case 'peripheral':
      return r.nationalTop4 ? '国内前 4' : '还没进国内前 4';
    case 'phone':
      return r.worldQualified ? '已有世界赛资格' : '还没有资格';
    case 'car':
      return r.worldTop4 ? '世界赛四强' : '还没进四强';
    default:
      return '';
  }
}

export function sponsorUnlocked(state: GameState, sponsorId: string): boolean {
  const idx = SPONSORS.findIndex((s) => s.id === sponsorId);
  if (idx < 0) return false;
  if (idx === 0) return true;
  return goalMet(state, SPONSORS[idx - 1].id);
}

export function sponsorLockReason(state: GameState, sponsorId: string): string | null {
  const def = SPONSOR_BY_ID[sponsorId];
  if (!def) return '没有这家赞助';
  if (state.sponsors.includes(sponsorId)) return '已经签了';
  if (state.sponsors.length >= MAX_SPONSORS) return '同时最多挂 2 个赞助';
  if (!sponsorUnlocked(state, sponsorId)) {
    const idx = SPONSORS.findIndex((s) => s.id === sponsorId);
    const prev = SPONSORS[idx - 1];
    return `先完成上一档「${prev.name}」：${prev.goal}（${goalProgress(state, prev.id)}）`;
  }
  if (tierRank(state) < TIER_RANK[def.minTier]) {
    const need = def.minTier === 'world' ? '世界赛资格' : def.minTier === 'national' ? '国内联赛' : def.minTier === 'city' ? '城市联赛' : '网吧联赛';
    return `要到${need}才能签`;
  }
  return null;
}

export function signSponsor(state: GameState, sponsorId: string): { ok: boolean; reason?: string } {
  const reason = sponsorLockReason(state, sponsorId);
  if (reason) return { ok: false, reason };
  state.sponsors.push(sponsorId);
  return { ok: true };
}

export function dropSponsor(state: GameState, sponsorId: string): { ok: boolean; reason?: string } {
  if (!state.sponsors.includes(sponsorId)) return { ok: false, reason: '没签这家' };
  state.sponsors = state.sponsors.filter((id) => id !== sponsorId);
  return { ok: true };
}

export interface PaydayResult {
  paid: boolean;
  usedStash: number;
  bankrupt: boolean;
  text: string;
}

export function runPayday(state: GameState, day: number): PaydayResult {
  const each = monthlySalaryEach(state);
  for (const m of state.roster) m.salary = each;
  const salaries = each * state.roster.length;
  const rent = monthlyRent(state);
  const meal = mealAllowanceDue(state);
  const income = sponsorIncome(state);
  state.cash += income;
  const due = salaries + rent + meal;
  const parts = [`工资 ${salaries.toLocaleString('zh-CN')}`, `房租 ${rent.toLocaleString('zh-CN')}`];
  if (meal) parts.push(`餐补 ${meal.toLocaleString('zh-CN')}`);
  if (income) parts.push(`赞助进账 ${income.toLocaleString('zh-CN')}`);
  const head = parts.join('，');

  if (state.cash >= due) {
    state.cash -= due;
    state.unpaidMonths = 0;
    return {
      paid: true,
      usedStash: 0,
      bankrupt: false,
      text: `发薪日。${head}。账上还剩 ${Math.round(state.cash).toLocaleString('zh-CN')}。`,
    };
  }
  const need = due - state.cash;
  if (state.privateStash >= need) {
    state.privateStash -= need;
    state.cash = 0;
    state.unpaidMonths = 0;
    const worry = seeded(state.seed, 'stash', day)() < 0.5;
    const tail = worry
      ? '有人私下问：老板这样垫，还撑得住吗。'
      : '有人看到是私房钱转出来的，群里安静了一小会儿。';
    return {
      paid: true,
      usedStash: need,
      bankrupt: false,
      text: `发薪日。${head}。公司账上不够，老板从私房钱垫了 ${Math.round(need).toLocaleString('zh-CN')}。${tail}`,
    };
  }
  state.unpaidMonths += 1;
  const bankrupt = state.unpaidMonths >= BANKRUPT_MONTHS;
  if (bankrupt) state.bankrupt = true;
  const left = BANKRUPT_MONTHS - state.unpaidMonths;
  const tail = bankrupt
    ? '连续三个月发不出工资，战队破产了。'
    : `这是连续第 ${state.unpaidMonths} 个月。再这样 ${left} 个月，战队就破产。`;
  return { paid: false, usedStash: 0, bankrupt, text: `发薪日。${head}。现金和私房钱都不够，这个月工资发不出来。${tail}` };
}

export function skim(state: GameState, amount: number): { ok: boolean; reason?: string } {
  if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount) !== amount) return { ok: false, reason: '金额不对' };
  if (state.cash < amount) return { ok: false, reason: '现金不够' };
  state.cash -= amount;
  state.privateStash += amount;
  return { ok: true };
}

export function buyFacility(state: GameState, id: string): { ok: boolean; reason?: string } {
  const f = FACILITY_BY_ID[id as FacilityId];
  if (!f) return { ok: false, reason: '没有这件设施' };
  if (f.price <= 0) return { ok: false, reason: '这件是场地自带的' };
  if (state.venueLevel < f.venue) return { ok: false, reason: `要到${VENUE_CN[f.venue]}才能买` };
  if (state.facilities.includes(f.id)) return { ok: false, reason: '已经买过了' };
  if (state.cash < f.price) return { ok: false, reason: '现金不够' };
  state.cash -= f.price;
  state.facilities.push(f.id);
  return { ok: true };
}

// 昨天的训练心得。休息日为 0；摸鱼超阈值的人不产出；加班 +50%
export function grantDailyInsight(state: GameState, slackMins: readonly number[], day: number): number {
  if (state.flags.restDay === day) return 0;
  let n = 0;
  for (const slack of slackMins) if (slack < SLACK_CUTOFF) n += DAILY_INSIGHT_EACH;
  let v = n;
  if (state.flags.overtimeDay === day) v *= 1.5;
  const fac = availableFacilities(state.venueLevel, state.facilities);
  let bonus = 1;
  if (fac.has('headset')) bonus += INSIGHT_FACILITY_BONUS;
  if (fac.has('whiteboard')) bonus += INSIGHT_FACILITY_BONUS;
  v = Math.round(v * bonus);
  state.insight += v;
  return v;
}

// M3 比赛打完调用。胜 +60 心得、负 +30，并记进赞助进度
export function noteMatch(state: GameState, won: boolean): void {
  if (won) state.record.wins += 1;
  else state.record.losses += 1;
  state.record.lastMatchWon = won;
  state.insight += won ? MATCH_INSIGHT.win : MATCH_INSIGHT.loss;
}

export function noteSeasonRank(state: GameState, rank: number): void {
  state.record.bestRank = state.record.bestRank == null ? rank : Math.min(state.record.bestRank, rank);
}

/** 降级之后，级别不够的赞助解约。世界赛赞助只看“已有资格”，不看当前联赛。 */
export function sponsorFitsTier(state: GameState, minTier: SponsorTier): boolean {
  if (minTier === 'world') return state.record.worldQualified;
  return TIER_RANK[state.season.tier] >= TIER_RANK[minTier];
}

export function cutSponsorsAfterMove(state: GameState): SponsorDef[] {
  const dropped: SponsorDef[] = [];
  state.sponsors = state.sponsors.filter((id) => {
    const def = SPONSOR_BY_ID[id];
    if (!def) return false;
    if (sponsorFitsTier(state, def.minTier)) return true;
    dropped.push(def);
    return false;
  });
  return dropped;
}

export function nextPaydayIn(day: number): number {
  const into = (day - 1) % MONTH_DAYS;
  return into === 0 && day > 1 ? MONTH_DAYS : MONTH_DAYS - into;
}

export function ledgerMonthLabel(day: number): string {
  const info = dayInfo(day);
  const n = Math.floor((day - 1) / MONTH_DAYS) + 1;
  return `第 ${n} 个发薪月 · 赛季第 ${info.dayInSeason} 天`;
}

export { START_CASH, START_STASH, MONTH_DAYS };
