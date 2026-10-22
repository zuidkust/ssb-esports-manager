// 饭点外卖：谁点、点什么、谁付钱、连锁。本命和忌口看 roster.ts 的 taste。
import { dayInfo, PREMATCH_MINUTE } from '../core/calendar';
import { pick, seeded, weightedPick, type Rand } from '../core/rng';
import { availableFacilities } from '../data/facilities';
import { ROSTER, ROSTER_BY_ID } from '../data/roster';
import {
  CHAIN_CHANCE,
  CHAIN_COOLDOWN_DAYS,
  CHAINS,
  chainCooldownKey,
  DISH_BY_ID,
  DISHES,
  LUOSIFEN_PROTEST_CHANCE,
  SATIETY_HUNGER,
  type DishDef,
  type MealSlot,
} from '../data/takeout';
import type { MealEffect, MealOrder, MealRecord, MealsState, MorningSnack, SocialDelta, StatusDelta, StatusKey } from '../save/state';
import type { GameState } from '../save/state';
import { addBond, addKnot } from './relations';

export interface TakeoutPerson {
  id: string;
  name: string;
  persona: { 摸鱼倾向: number; 话痨: number };
  status: { 饥饿: number; 心情: number };
  late: boolean;
}

const H = (h: number, m = 0) => h * 60 + m;

export function orderProbability(p: TakeoutPerson, ctx: { unpaid: boolean; monthEnd: boolean }): number {
  let v = 0.4;
  if (p.status.饥饿 >= 60) v += 0.3;
  if (p.persona.摸鱼倾向 >= 60) v += 0.15;
  if (p.status.心情 < 45) v += 0.1;
  if (ctx.unpaid || ctx.monthEnd) v -= 0.2;
  return Math.min(0.92, Math.max(0.05, v));
}

export function isMonthEnd(day: number): boolean {
  const into = (day - 1) % 28;
  return into >= 23; // 发薪月最后 5 天【待定】
}

function deliveryPool(slot: MealSlot, ctx: { lastMatchWon: boolean; lowMood: boolean; monthEnd: boolean; unpaid: boolean; matchEve: boolean; thursday: boolean }): DishDef[] {
  return DISHES.filter((d) => {
    if (!d.slots.includes(slot) || d.id === 'instant' || d.id === 'jianbing') return false;
    if (d.afterWin && !ctx.lastMatchWon) return false;
    return true;
  });
}

export function memberDishWeight(
  memberId: string,
  d: DishDef,
  ctx: { lowMood: boolean; monthEnd: boolean; unpaid: boolean; matchEve: boolean; thursday: boolean },
): number {
  let w = 1;
  if (ctx.monthEnd || ctx.unpaid) {
    if (d.tags.includes('便宜')) w += 2;
    if (d.tags.includes('贵')) w *= 0.25;
  }
  if (ctx.lowMood && (d.id === 'milktea' || d.id === 'friedchicken')) w += 2;
  if (ctx.matchEve && d.tags.includes('稳')) w += 2;
  // 赛前晚饭大家都避开螺蛳粉。阿鸡不挑，什么都吃，仍按正常权重。
  if (ctx.matchEve && d.id === 'luosifen') w = memberId === 'aji' ? 1.2 : 0.05;
  if (ctx.thursday && d.id === 'mcd') w *= 2;
  const taste = ROSTER_BY_ID[memberId]?.taste;
  if (taste?.avoids.includes(d.id)) w *= 0.05;
  if (taste?.favorites.includes(d.id)) w *= taste.favoriteMul;
  if (taste?.noMilktea && d.id === 'milktea') w *= 0.15;
  return w;
}

function cooldownOk(state: GameState, chainId: string, day: number): boolean {
  return (state.cooldowns[chainCooldownKey(chainId)] ?? 0) <= day;
}

function markCooldown(state: GameState, chainId: string, day: number): void {
  state.cooldowns[chainCooldownKey(chainId)] = day + CHAIN_COOLDOWN_DAYS;
}

interface ChainPick {
  id: string;
  otherId?: string;
}

function rollChain(rand: Rand, state: GameState, day: number, order: MealOrder, orders: MealOrder[], everyone: string[], tierRank: number): ChainPick | null {
  const room = everyone.filter((id) => id !== order.memberId);
  if (order.dishId === 'luosifen' && cooldownOk(state, 'luosifen', day) && rand() < LUOSIFEN_PROTEST_CHANCE) {
    return { id: 'luosifen', otherId: room.length ? pick(rand, room) : undefined };
  }
  if (order.dishId === 'luosifen') return null;
  if (!order.delivery) return null;
  if (rand() >= CHAIN_CHANCE) return null;

  const same = orders.filter((o) => o.memberId !== order.memberId && o.dishId === order.dishId);
  const otherOrders = orders.filter((o) => o.memberId !== order.memberId);
  const weights = CHAINS.map((c) => {
    if (!cooldownOk(state, c.id, day)) return 0;
    if (c.id === 'famous' && tierRank < 1) return 0;
    if (c.id === 'share' && otherOrders.length === 0) return 0;
    if (c.id === 'same' && same.length === 0) return 0;
    if (c.id === 'spicybill') return order.dishId === 'malatang' ? 30 : 0;
    if (c.id === 'mooch' && order.dishId === 'friedchicken') return c.weight + 15;
    if (c.id === 'late' && order.dishId === 'claypot') return c.weight + 15;
    return c.weight;
  });
  const bag = CHAINS.map((c, i) => ({ c, w: weights[i] }));
  const picked = weightedPick(rand, bag, (x) => x.w);
  if (!picked) return null;
  let otherId: string | undefined;
  if (picked.c.id === 'same') otherId = pick(rand, same).memberId;
  else if (picked.c.id === 'share') otherId = pick(rand, otherOrders).memberId;
  else if (room.length && (picked.c.id === 'mooch' || picked.c.id === 'spill' || picked.c.id === 'wrong')) otherId = pick(rand, room);
  return { id: picked.c.id, otherId };
}

function statusOf(id: string, patch: Partial<Record<StatusKey, number>>): StatusDelta {
  const d: StatusDelta = { id };
  for (const [k, v] of Object.entries(patch) as [StatusKey, number][]) if (v) d[k] = v;
  return d;
}

const LINES: Record<string, readonly string[]> = {
  luosifen: [
    '{a}的螺蛳粉一开，{place}里有人捏住鼻子去开窗。',
    '螺蛳粉的味道漫过来。有人在群里发起投票：这东西还能不能点。',
    '{a}埋头吃螺蛳粉，旁边的人把椅子往外挪了挪。',
    '外卖一拆，全场短暂沉默。然后有人说：下次能不能在门口吃完再进来。',
  ],
  mooch: [
    '{b}凑过来看{a}的外卖，筷子已经伸过去了。',
    '{a}的{dish}还没动两口，{b}就开始“帮他尝尝”。',
    '一份外卖两个人吃。{a}没说话，但看了{b}一眼。',
    '{b}：“就一口。”一口完了还有第二口。',
  ],
  wrong: [
    '外卖员把{a}的{dish}放到了{b}的桌上。等发现的时候已经被动过了。',
    '群里开始追：地址到底是谁填的。{a}的{dish}在{b}那儿。',
    '送错工位。{b}说自己没注意看名字，{a}不这么想。',
    '外卖袋上的名字写得挺清楚，还是放错了人。',
  ],
  spill: [
    '{a}的{dish}洒了一桌子。汤顺着桌沿往下滴。',
    '袋子底部是漏的。{a}的键盘边上一小摊。',
    '外卖员道歉的时候，汤已经从袋角渗出来了。',
    '{dish}洒了。有人抽纸，有人把椅子往后推。',
  ],
  late: [
    '外卖员迟到了。{a}的{dish}到的时候饭点已经过了一截。',
    '{a}刷新了三次订单，{dish}还在路上。',
    '超时。{a}下午开头那一把明显心不在焉。',
    '餐到得晚。{a}说了句“算了”，但表情不是算了。',
  ],
  share: [
    '{a}和{b}凑了一单满减。谁付零头，两个人算了半天。',
    '拼单成功。{a}和{b}对着手机把优惠拆开。',
    '{a}、{b}拼单。满减是省了，零头的归属还没定。',
    '两个人的外卖合在一个袋子里。群里先确认哪盒是谁的。',
  ],
  same: [
    '{a}和{b}点了一模一样的{dish}。有人说心有灵犀。',
    '两份{dish}同时到。{a}和{b}对视了一下。',
    '{a}：“你也点这个？”{b}把手机倒扣过去。',
    '同一家，同一份。群里发了个省略号。',
  ],
  famous: [
    '外卖员在门口停了一下：“你们就是那个战队？”',
    '送餐的认出来了，多看了眼机箱上的贴纸。',
    '“我看过你们打网吧赛。”外卖员把袋子放下，语气挺认真。',
    '门口这单被认出来了。大家一下子坐直了点。',
  ],
  spicybill: [
    '{a}的麻辣烫自己选着选着变成了 60。群里开始复盘哪一串这么贵。',
    '结算页 60 块。{a}盯着明细看了很久。',
    '麻辣烫到了，价格却不是菜单上那个数。{a}把截图发到群里。',
    '“我就加了几串。”账单说不是。',
  ],
  host: [
    '这顿老板说了算，公司报销。点单的时候大家安静了两秒。',
    '今天我请。有人把购物车里的东西换了一下，又换回去。',
    '报销的消息发出来之后，点单快了不少。',
    '老板请客。没人把最贵的那个按下去，但也没人点泡面。',
  ],
  subsidy: [
    '公司餐补把这顿报了。',
    '餐补到账的那种报法：吃完记得把单子留一下。',
    '这顿走餐补。有人还是点了最便宜的那个。',
    '餐补生效。外卖软件上的付款人换成了公司。',
  ],
  short: [
    '公司现金不够付这顿外卖，改成大家自己付钱。',
    '账上不够报销，这顿外卖改回队员自付。',
    '公司现金付不出这单，大家还是自己掏了。',
    '报销没通过：现金不够，外卖改成自己付。',
  ],
  summary: [
    '{meal}：{list}。穿黄色美团外卖服的外卖员进了{place}。',
    '{meal}点好了。{list}。黄衣服的外卖员在门口找工位。',
    '外卖员把袋子放到桌上。{list}。',
    '{place}的饭点：{list}。',
  ],
  instant: [
    '{names}没点外卖，烧了热水泡面。',
    '桶面的味道混在外卖里。{names}说这个月先这样。',
    '{names}撕开泡面盖。没人接话。',
    '有人点外卖，{names}在吃泡面。',
  ],
};

function line(rand: Rand, id: string, map: Record<string, string>): string {
  return pick(rand, LINES[id] ?? ['发生了一件和外卖有关的事。']).replace(/\{(\w+)\}/g, (_, k) => map[k] ?? '');
}

// 把一次连锁写进效果和动态。调用方负责冷却；这里不掷骰。
function attachChain(
  rand: Rand,
  state: GameState,
  order: MealOrder,
  chain: ChainPick,
  people: TakeoutPerson[],
  place: string,
  mealEnd: number,
  effects: MealEffect[],
  logs: ResolvedMeal['logs'],
): void {
  const dish = DISH_BY_ID[order.dishId];
  const other = chain.otherId;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const social: SocialDelta[] = [];
  const extra: StatusDelta[] = [];
  if (chain.id === 'luosifen' && other) {
    if (rand() < 0.5) social.push({ type: 'knot', a: order.memberId, b: other, cause: '螺蛳粉' });
    else social.push({ type: 'bond', a: order.memberId, b: other, n: 1 });
  } else if (chain.id === 'mooch' && other) {
    if (rand() < 0.5) social.push({ type: 'bond', a: order.memberId, b: other, n: 2 });
    else social.push({ type: 'knot', a: order.memberId, b: other, cause: '蹭外卖' });
  } else if (chain.id === 'spill') {
    extra.push(statusOf(order.memberId, { 心情: -5 }));
    if (other && rand() < 0.5) social.push({ type: 'bond', a: order.memberId, b: other, n: 1 });
  } else if (chain.id === 'late') {
    extra.push(statusOf(order.memberId, { 心情: -4, 专注: -4 }));
    order.deliveredAt = Math.min(mealEnd - 4, order.deliveredAt + 8);
    order.eatUntil = Math.min(mealEnd, order.deliveredAt + 16);
  } else if (chain.id === 'wrong' && other) {
    extra.push(statusOf(order.memberId, { 心情: -3 }));
  } else if (chain.id === 'share' && other) {
    social.push({ type: 'bond', a: order.memberId, b: other, n: 1 });
  } else if (chain.id === 'famous') {
    for (const p of people) extra.push(statusOf(p.id, { 心情: 3 }));
    state.record.fame += 1;
  } else if (chain.id === 'spicybill') {
    order.price = 60;
    extra.push(statusOf(order.memberId, { 心情: -2 }));
  }
  effects.push({ at: order.deliveredAt, status: extra, social, applied: false });
  logs.push({
    level: '有趣',
    minute: order.deliveredAt,
    text: line(rand, chain.id, {
      a: nameOf(order.memberId),
      b: other ? nameOf(other) : '旁边的人',
      dish: dish.name,
      place,
    }),
    ids: other ? [order.memberId, other] : [order.memberId],
  });
}

export interface ResolveInput {
  state: GameState;
  people: TakeoutPerson[];
  day: number;
  meal: 'lunch' | 'dinner';
  place: string;
}

export interface ResolvedMeal {
  record: MealRecord;
  logs: { level: '日常' | '有趣'; minute: number; text: string; ids: string[] }[];
}

export function resolveMeal(input: ResolveInput): ResolvedMeal {
  const { state, people, day, meal, place } = input;
  const info = dayInfo(day);
  const matchEve = meal === 'dinner' && info.round != null;
  const monthEnd = isMonthEnd(day);
  const unpaid = state.unpaidMonths > 0;
  const thursday = info.weekday === 4;
  const rand = seeded(state.seed, 'takeout', day, meal);
  const tierRank = state.season.tier === 'national' ? 2 : state.season.tier === 'city' ? 1 : 0;
  const mealStart = meal === 'lunch' ? H(12) : H(18);
  const mealEnd = meal === 'lunch' ? H(13, 30) : matchEve ? PREMATCH_MINUTE - 2 : H(19);

  const orders: MealOrder[] = [];
  for (const p of people) {
    const prob = orderProbability(p, { unpaid, monthEnd });
    if (rand() < prob) {
      const pool = deliveryPool(meal, { lastMatchWon: !!state.record.lastMatchWon, lowMood: p.status.心情 < 45, monthEnd, unpaid, matchEve, thursday });
      const dish = weightedPick(rand, pool, (d) => memberDishWeight(p.id, d, { lowMood: p.status.心情 < 45, monthEnd, unpaid, matchEve, thursday })) ?? pool[0];
      orders.push({
        memberId: p.id,
        dishId: dish.id,
        price: dish.price,
        payer: 'self',
        deliveredAt: 0,
        eatUntil: 0,
        delivery: true,
      });
    } else if (rand() < (unpaid || monthEnd ? 0.45 : 0.06)) {
      orders.push({
        memberId: p.id,
        dishId: 'instant',
        price: DISH_BY_ID.instant.price,
        payer: 'self',
        deliveredAt: mealStart,
        eatUntil: Math.min(mealEnd, mealStart + 20),
        delivery: false,
      });
    }
  }

  const seat = (id: string) => Math.max(0, ROSTER.findIndex((m) => m.id === id));
  const drops = orders.filter((o) => o.delivery);
  drops.sort((a, b) => seat(a.memberId) - seat(b.memberId));
  let t = mealStart + (matchEve ? 6 : 8);
  for (const o of drops) {
    const dish = DISH_BY_ID[o.dishId];
    if (dish.slow) t += 6;
    o.deliveredAt = Math.min(mealEnd - 6, t);
    o.eatUntil = Math.min(mealEnd, o.deliveredAt + 18);
    t += matchEve ? 4 : 5;
  }

  const subsidy = availableFacilities(state.venueLevel, state.facilities).has('mealAllowance');
  const hosted = state.flags.hostDay === day && state.flags.hostMeal === meal;
  const payer = subsidy ? 'subsidy' : hosted ? 'host' : 'self';
  if (payer !== 'self') for (const o of drops) o.payer = payer;

  const chains: string[] = [];
  const effects: MealEffect[] = [];
  const logs: ResolvedMeal['logs'] = [];
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const everyone = people.map((p) => p.id);

  for (const o of orders) {
    const dish = DISH_BY_ID[o.dishId];
    const status: StatusDelta[] = [statusOf(o.memberId, { ...dish.self, 饥饿: -SATIETY_HUNGER[dish.satiety] })];
    if (dish.others) for (const p of people) if (p.id !== o.memberId) status.push(statusOf(p.id, dish.others));
    if (o.payer === 'subsidy') status.push(statusOf(o.memberId, { 心情: 2 }));
    effects.push({ at: o.deliveredAt, status, social: [], applied: false });
  }

  for (const o of drops) {
    const chain = rollChain(rand, state, day, o, drops, everyone, tierRank);
    if (!chain) continue;
    if (!cooldownOk(state, chain.id, day)) continue;
    markCooldown(state, chain.id, day);
    chains.push(chain.id);
    attachChain(rand, state, o, chain, people, place, mealEnd, effects, logs);
  }

  let short = false;
  const dueOrders = drops.filter((o) => o.payer !== 'self');
  const due = dueOrders.reduce((s, o) => s + o.price, 0);
  if (due > 0) {
    if (state.cash >= due) state.cash -= due;
    else {
      short = true;
      for (const o of dueOrders) o.payer = 'self';
    }
  }

  if (drops.length) {
    const list = drops.map((o) => `${nameOf(o.memberId)}点了${DISH_BY_ID[o.dishId].name}`).join('，');
    const mealName = meal === 'lunch' ? '午饭' : '晚饭';
    let text = line(rand, 'summary', { meal: mealName, list, place });
    if (thursday && drops.some((o) => o.dishId === 'mcd')) text += '今天周四，快餐的单子比平时多。';
    logs.unshift({ level: '日常', minute: drops[0].deliveredAt - 4, text, ids: drops.map((o) => o.memberId) });
  }
  if (hosted && drops.length) {
    logs.push({
      level: short ? '有趣' : '日常',
      minute: mealStart,
      text: short ? line(rand, 'short', {}) : line(rand, 'host', {}),
      ids: [],
    });
  } else if (subsidy && drops.length) {
    logs.push({
      level: short ? '有趣' : '日常',
      minute: mealStart,
      text: short ? line(rand, 'short', {}) : line(rand, 'subsidy', {}),
      ids: [],
    });
  }
  const noodles = orders.filter((o) => o.dishId === 'instant');
  if (noodles.length) {
    logs.push({
      level: '日常',
      minute: mealStart + 2,
      text: line(rand, 'instant', { names: noodles.map((o) => nameOf(o.memberId)).join('、') }),
      ids: noodles.map((o) => o.memberId),
    });
  }
  for (const o of drops) if (o.dishId === 'huangmen') state.record.huangmenji += 1;

  const fav = drops.find((o) => ROSTER_BY_ID[o.memberId]?.taste.favorites.includes(o.dishId));
  if (fav) {
    logs.push({
      level: '日常',
      minute: fav.deliveredAt,
      text: `${nameOf(fav.memberId)}点了${DISH_BY_ID[fav.dishId].name}，说这就是本命。`,
      ids: [fav.memberId],
    });
  } else {
    const easy = drops.find((o) => ROSTER_BY_ID[o.memberId]?.taste.favorites.length === 0);
    if (easy && rand() < 0.45) {
      logs.push({
        level: '日常',
        minute: easy.deliveredAt,
        text: `${nameOf(easy.memberId)}说随便，什么都吃，点了${DISH_BY_ID[easy.dishId].name}。`,
        ids: [easy.memberId],
      });
    }
  }

  return { record: { meal, orders, effects, chains }, logs };
}

export function planMorning(state: GameState, people: TakeoutPerson[], day: number): MorningSnack[] {
  const rand = seeded(state.seed, 'takeout', day, 'morning');
  const out: MorningSnack[] = [];
  for (const p of people) {
    if (!p.late) continue;
    if (rand() < 0.35) out.push({ memberId: p.id, dishId: 'jianbing' });
  }
  return out;
}

const STATUS_KEYS: StatusKey[] = ['体力', '心情', '专注', '手感', '饥饿', '疲劳', '压力'];

function clampStatus(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export function settleMeals(state: GameState, minute: number): void {
  for (const rec of [state.meals.lunch, state.meals.dinner]) {
    if (!rec) continue;
    for (const fx of rec.effects) {
      if (fx.applied || minute + 1e-6 < fx.at) continue;
      fx.applied = true;
      for (const st of fx.status) {
        const m = state.roster.find((r) => r.id === st.id);
        if (!m) continue;
        for (const k of STATUS_KEYS) {
          const d = st[k];
          if (d) m.status[k] = clampStatus(m.status[k] + d);
        }
      }
      for (const s of fx.social) {
        if (s.type === 'bond' && s.n) addBond(state, s.a, s.b, s.n);
        else if (s.type === 'knot' && s.cause) addKnot(state, s.a, s.b, s.cause, state.clock.day);
      }
    }
  }
}

export function orderFor(meals: MealsState, memberId: string, minute: number): MealOrder | null {
  for (const rec of [meals.lunch, meals.dinner]) {
    if (!rec) continue;
    const o = rec.orders.find((x) => x.memberId === memberId);
    if (!o) continue;
    const start = o.delivery ? o.deliveredAt - 6 : o.deliveredAt;
    if (minute >= start && minute < o.eatUntil) return o;
  }
  return null;
}

export interface CourierTrack {
  key: string;
  enter: number;
  leave: number;
  stops: { memberId: string; at: number }[];
}

const FORCE_CHAINS = new Set<string>([...CHAINS.map((c) => c.id), 'luosifen']);

export interface ForceDeliveryInput {
  state: GameState;
  people: TakeoutPerson[];
  day: number;
  meal: 'lunch' | 'dinner';
  memberId: string;
  dishId: string;
  chainId?: string | null;
  place: string;
}

export interface ForcedDelivery {
  minute: number;
  chainId: string | null;
  logs: ResolvedMeal['logs'];
}

// 调试：不掷概率、不看冷却，直接加一单（需要搭档的连锁再加一单），并套用同一套连锁效果。
export function forceDelivery(input: ForceDeliveryInput): ForcedDelivery {
  const { state, people, day, meal, place } = input;
  const chainId = input.chainId && FORCE_CHAINS.has(input.chainId) ? input.chainId : null;
  let dishId = input.dishId;
  if (chainId === 'luosifen') dishId = 'luosifen';
  else if (chainId === 'spicybill') dishId = 'malatang';
  if (!DISH_BY_ID[dishId] || dishId === 'instant' || dishId === 'jianbing') dishId = 'huangmen';
  const dish = DISH_BY_ID[dishId];

  const info = dayInfo(day);
  const matchEve = meal === 'dinner' && info.round != null;
  const mealStart = meal === 'lunch' ? H(12) : H(18);
  const mealEnd = meal === 'lunch' ? H(13, 30) : matchEve ? PREMATCH_MINUTE - 2 : H(19);

  if (state.meals.day !== day) state.meals = { day, morning: [] };
  let rec = meal === 'lunch' ? state.meals.lunch : state.meals.dinner;
  if (!rec) {
    rec = { meal, orders: [], effects: [], chains: [] };
    if (meal === 'lunch') state.meals.lunch = rec;
    else state.meals.dinner = rec;
  }

  const order: MealOrder = {
    memberId: input.memberId,
    dishId,
    price: dish.price,
    payer: 'self',
    deliveredAt: Math.min(mealEnd - 6, mealStart + 8),
    eatUntil: 0,
    delivery: true,
  };
  order.eatUntil = Math.min(mealEnd, order.deliveredAt + 18);
  rec.orders = rec.orders.filter((o) => o.memberId !== input.memberId);
  rec.orders.push(order);

  const others = people.filter((p) => p.id !== input.memberId);
  const partner = others[0];
  const needsPartner = chainId === 'same' || chainId === 'share';
  let partnerOrder: MealOrder | null = null;
  if (needsPartner && partner) {
    const partnerDish = chainId === 'same' ? dish : dishId === 'shaxian' ? DISH_BY_ID.huangmen : DISH_BY_ID.shaxian;
    partnerOrder = {
      memberId: partner.id,
      dishId: partnerDish.id,
      price: partnerDish.price,
      payer: 'self',
      deliveredAt: order.deliveredAt,
      eatUntil: order.eatUntil,
      delivery: true,
    };
    rec.orders = rec.orders.filter((o) => o.memberId !== partner.id);
    rec.orders.push(partnerOrder);
  }

  const logs: ResolvedMeal['logs'] = [];
  for (const o of [order, partnerOrder].filter((o): o is MealOrder => !!o)) {
    const d = DISH_BY_ID[o.dishId];
    const status: StatusDelta[] = [statusOf(o.memberId, { ...d.self, 饥饿: -SATIETY_HUNGER[d.satiety] })];
    if (d.others) for (const p of people) if (p.id !== o.memberId) status.push(statusOf(p.id, d.others));
    rec.effects.push({ at: o.deliveredAt, status, social: [], applied: false });
  }

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  if (chainId) {
    markCooldown(state, chainId, day);
    rec.chains.push(chainId);
    const rand = seeded(state.seed, 'takeout-force', day, meal, input.memberId, chainId);
    attachChain(rand, state, order, { id: chainId, otherId: partner?.id }, people, place, mealEnd, rec.effects, logs);
  }
  logs.unshift({
    level: '日常',
    minute: Math.max(mealStart, order.deliveredAt - 4),
    text: `${meal === 'lunch' ? '午饭' : '晚饭'}：${nameOf(order.memberId)}点了${DISH_BY_ID[order.dishId].name}。`,
    ids: partnerOrder ? [order.memberId, partnerOrder.memberId] : [order.memberId],
  });
  if (order.dishId === 'huangmen') state.record.huangmenji += 1;
  return { minute: order.deliveredAt, chainId, logs };
}

export function courierTrack(meals: MealsState, minute: number): CourierTrack | null {
  for (const rec of [meals.lunch, meals.dinner]) {
    if (!rec) continue;
    const stops = rec.orders.filter((o) => o.delivery).map((o) => ({ memberId: o.memberId, at: o.deliveredAt })).sort((a, b) => a.at - b.at);
    if (!stops.length) continue;
    const enter = stops[0].at - 6;
    const leave = stops[stops.length - 1].at + 4;
    if (minute < enter || minute > leave) continue;
    return { key: `${meals.day}:${rec.meal}`, enter, leave, stops };
  }
  return null;
}
