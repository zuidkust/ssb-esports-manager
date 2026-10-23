// 老板动作：行动点、联赛倍率、对人冷却、7 天滑动递减（第 4 次起反噬）。
import { isMatchDay } from './worldcup';
import { seeded, pick, type Rand } from '../core/rng';
import { ACTION_BY_ID, actionCooldownKey, ACTIONS, type ActionDef } from '../data/actions';
import { actionPointMax, tierCashMult } from '../data/economy';
import { availableFacilities, VENUE_CN } from '../data/facilities';
import { ABILITY_KEYS, pairKey, ROSTER_BY_ID } from '../data/roster';
import type { GameState, LogEntry, StatusKey } from '../save/state';
import { REST_LINES, bossLine } from '../data/voice';
import { addBond, addKnot, clearOneKnot, hasKnot } from './relations';

export function effectScale(nth: number): { mult: number; backfire: boolean } {
  if (nth <= 1) return { mult: 1, backfire: false };
  if (nth === 2) return { mult: 0.7, backfire: false };
  if (nth === 3) return { mult: 0.4, backfire: false };
  return { mult: -0.5, backfire: true };
}

export function actionCost(state: GameState, def: ActionDef): number {
  return Math.round(def.cash * tierCashMult(state.season.tier));
}

function scopeTarget(def: ActionDef, targets: string[]): string | undefined {
  if (def.scope === 'global') return undefined;
  if (def.scope === 'member') return targets[0];
  return pairKey(targets[0], targets[1]);
}

export function recentUses(state: GameState, actionId: string, target: string | undefined, day: number): number {
  const from = day - 6;
  return state.actionHistory.filter((h) => {
    if (h.action !== actionId || h.day < from || h.day > day) return false;
    if (target == null) return true;
    return h.target === target;
  }).length;
}

export function nextTreatMeal(state: GameState, day: number, minute: number): 'lunch' | 'dinner' | null {
  const same = state.meals.day === day;
  const lunchDone = same && state.meals.lunch != null;
  const dinnerDone = same && state.meals.dinner != null;
  if (!lunchDone && minute < 13 * 60 + 30) return 'lunch';
  if (!dinnerDone && minute < 18 * 60 + 25) return 'dinner';
  return null;
}

export interface ActionPreview {
  ok: boolean;
  reason?: string;
  nth: number;
  mult: number;
  backfire: boolean;
  cost: number;
}

function knownTarget(id: string): boolean {
  return !!ROSTER_BY_ID[id];
}

export function previewAction(state: GameState, actionId: string, targets: string[], day: number, minute: number): ActionPreview {
  const def = ACTION_BY_ID[actionId];
  const fail = (reason: string): ActionPreview => ({ ok: false, reason, nth: 1, mult: 1, backfire: false, cost: def ? actionCost(state, def) : 0 });
  if (!def) return fail('没有这个动作');
  if (state.bankrupt) return fail('战队已经破产');
  if (state.venueLevel < def.venue) return fail(`${VENUE_CN[def.venue]}之后才解锁`);
  if (actionId === 'review' && !availableFacilities(state.venueLevel, state.facilities).has('whiteboard')) return fail('要先买白板');
  if (state.flags.restDay === day && actionId === 'overtime') return fail('今天已经放假');
  if (state.flags.overtimeDay === day && actionId === 'rest') return fail('今天已经在加班');
  if (def.scope === 'member') {
    if (targets.length !== 1 || !knownTarget(targets[0])) return fail('先选一个队员');
  } else if (def.scope === 'pair') {
    if (targets.length !== 2 || targets[0] === targets[1] || !knownTarget(targets[0]) || !knownTarget(targets[1])) return fail('要选两个不同的队员');
    if (def.needsKnot && !hasKnot(state, targets[0], targets[1])) return fail('这两人现在没有心结');
  }
  if (actionId === 'host' && !nextTreatMeal(state, day, minute)) return fail('今天的饭点都过了');
  const target = scopeTarget(def, targets);
  const key = actionCooldownKey(def, target);
  const until = state.cooldowns[key] ?? 0;
  if (def.cooldownDays > 0 && until > day) return fail(`还要等 ${until - day} 天`);
  if (state.actionPoints < def.ap) return fail('行动点不够');
  const cost = actionCost(state, def);
  if (cost > 0 && state.cash < cost) return fail('现金不够');
  const nth = recentUses(state, def.id, def.scope === 'global' ? undefined : target, day) + 1;
  const { mult, backfire } = effectScale(nth);
  return { ok: true, nth, mult, backfire, cost };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function bump(state: GameState, id: string, key: StatusKey, delta: number): void {
  if (!delta) return;
  const m = state.roster.find((r) => r.id === id);
  if (!m) return;
  m.status[key] = clamp(m.status[key] + delta);
}

function bumpAll(state: GameState, key: StatusKey, delta: number): void {
  for (const m of state.roster) bump(state, m.id, key, delta);
}

const BACKFIRE = [
  '有人在群里说：老板又来了。',
  '这招用得太勤，大家当没听见。',
  '第七天里的第四次。效果反了。',
  '队员之间交换了一个眼神，没人接话。',
];

export function performAction(
  state: GameState,
  actionId: string,
  targets: string[],
  opts: { day: number; minute: number; rand?: Rand; log: (level: LogEntry['level'], text: string, ids: string[]) => void },
): { ok: boolean; reason?: string } {
  const preview = previewAction(state, actionId, targets, opts.day, opts.minute);
  if (!preview.ok) return { ok: false, reason: preview.reason };
  const def = ACTION_BY_ID[actionId];
  const rand = opts.rand ?? seeded(state.seed, 'act', actionId, opts.day, Math.floor(opts.minute), targets.join(','), state.actionHistory.length);
  const sc = (n: number) => Math.round(n * preview.mult);
  const targetKey = scopeTarget(def, targets);
  state.actionPoints -= def.ap;
  if (preview.cost > 0) state.cash -= preview.cost;
  if (def.cooldownDays > 0) state.cooldowns[actionCooldownKey(def, targetKey)] = opts.day + def.cooldownDays;
  state.actionHistory.push({ action: def.id, target: targetKey, day: opts.day });
  state.actionHistory = state.actionHistory.filter((h) => h.day >= opts.day - 6);

  const name = (id: string) => ROSTER_BY_ID[id]?.name ?? id;
  const ids = def.scope === 'global' ? state.roster.map((m) => m.id) : targets;
  let text = '';

  switch (def.id) {
    case 'talk': {
      bump(state, targets[0], '心情', sc(8));
      bump(state, targets[0], '压力', sc(-6));
      const custom = preview.backfire ? null : bossLine('talk', targets[0], rand);
      text = custom ?? (preview.backfire
        ? `${name(targets[0])}听老板说了两句，反而更烦了。`
        : pick(rand, [`老板把${name(targets[0])}叫到一边说了会儿话。`, `${name(targets[0])}点点头，回到座位上。`, `单独谈完，${name(targets[0])}的肩膀松了一点。`, `老板没当着大家的面说，${name(targets[0])}听完没接话。`]));
      break;
    }
    case 'milktea': {
      bumpAll(state, '心情', sc(6));
      const quiet = [...state.roster].sort((a, b) => a.persona.话痨 - b.persona.话痨)[0];
      const lines = [
        `老板请了奶茶。${name(quiet.id)}那杯最后才被找到。`,
        '六杯奶茶放到桌上，先到的人先拿。',
        '奶茶到了。有人拍了照，有人直接插上吸管。',
        `老板请奶茶。${name(quiet.id)}的那杯被挡在袋子最里面。`,
      ];
      const used = state.actionHistory.filter((h) => h.action === 'milktea').length;
      const aji = preview.backfire ? '' : bossLine('milktea', 'aji', rand) ?? '';
      text = preview.backfire ? '奶茶又来了。有人连杯子都没拿。' : `${lines[(used - 1) % lines.length]}${aji}`;
      break;
    }
    case 'host': {
      const which = nextTreatMeal(state, opts.day, opts.minute)!;
      state.flags.hostDay = opts.day;
      state.flags.hostMeal = which;
      bumpAll(state, '心情', sc(4));
      text = preview.backfire
        ? `老板说${which === 'lunch' ? '午饭' : '晚饭'}他请。群里回了个表情，没什么人接。`
        : `老板说今天${which === 'lunch' ? '午饭' : '晚饭'}他请，按菜单实价从公司走。`;
      break;
    }
    case 'duo': {
      state.flags.duoDay = opts.day;
      state.flags.duoA = targets[0];
      state.flags.duoB = targets[1];
      if (preview.backfire) addKnot(state, targets[0], targets[1], '被安排双排', opts.day);
      else addBond(state, targets[0], targets[1], 2);
      text = preview.backfire
        ? `老板安排${name(targets[0])}和${name(targets[1])}双排。两个人都没说好。`
        : `老板安排${name(targets[0])}和${name(targets[1])}今天双排。`;
      break;
    }
    case 'praise': {
      bump(state, targets[0], '心情', sc(10));
      for (const m of state.roster) if (m.id !== targets[0]) bump(state, m.id, '心情', sc(-2));
      const custom = preview.backfire ? null : bossLine('praise', targets[0], rand);
      text = custom ?? (preview.backfire
        ? `老板又当众夸${name(targets[0])}。旁边的人没什么反应。`
        : pick(rand, [
            `老板当众表扬了${name(targets[0])}。`,
            `${name(targets[0])}被点名夸了。有人鼓掌，有人在看自己的屏幕。`,
            `表扬完，${name(targets[0])}耳根有点红。`,
            `老板说${name(targets[0])}最近打得好。其余的人没接话。`,
          ]));
      break;
    }
    case 'scold': {
      const m = state.roster.find((r) => r.id === targets[0])!;
      const fired = m.persona.胜负心 >= 75 && m.persona.逆风意志 >= 50 && preview.mult > 0;
      const thin = m.id === 'aji' ? 0.35 : m.id === 'dibi' ? 0.55 : m.id === 'gouliang' ? 0.75 : m.id === 'dangdeng' || m.id === 'piegan' ? 1.2 : 1;
      bump(state, targets[0], '心情', fired ? sc(4) : sc(-8 * thin));
      bump(state, targets[0], '压力', sc(m.id === 'aji' ? 2 : 6));
      const custom = preview.backfire ? null : bossLine('scold', targets[0], rand);
      text = custom ?? (preview.backfire
        ? `老板点名说了${name(targets[0])}。对方回了句“知道了”，语气很硬。`
        : fired
          ? `${name(targets[0])}被点名之后反而坐直了，说下一把打回来。`
          : `老板点名批评了${name(targets[0])}。座位那边安静了一会儿。`);
      break;
    }
    case 'mediate': {
      if (preview.backfire || rand() > Math.max(0.15, 0.9 - ((ROSTER_BY_ID[targets[0]].persona.嘴硬 + ROSTER_BY_ID[targets[1]].persona.嘴硬) / 2) / 120)) {
        bump(state, targets[0], '心情', preview.backfire ? -8 : -6);
        bump(state, targets[1], '心情', preview.backfire ? -8 : -6);
        text = `${name(targets[0])}和${name(targets[1])}没谈拢，对老板也有点意见。`;
      } else {
        clearOneKnot(state, targets[0], targets[1]);
        addBond(state, targets[0], targets[1], 4);
        bump(state, targets[0], '心情', sc(4));
        bump(state, targets[1], '心情', sc(4));
        text = `老板把${name(targets[0])}和${name(targets[1])}拉到一起。心结解开了一层。`;
      }
      break;
    }
    case 'overtime': {
      if (!preview.backfire) {
        state.flags.overtimeDay = opts.day;
        bumpAll(state, '心情', -8);
        bumpAll(state, '疲劳', 12);
        text = '老板宣布今天加班。训练心得会多一截，没人看起来很高兴。';
      } else {
        bumpAll(state, '心情', -12);
        bumpAll(state, '疲劳', 16);
        text = '老板又说加班。大家开着训练模式，人已经不在了。';
      }
      break;
    }
    case 'party': {
      bumpAll(state, '心情', sc(8));
      if (preview.backfire) {
        const i = Math.floor(rand() * state.roster.length);
        let j = Math.floor(rand() * (state.roster.length - 1));
        if (j >= i) j += 1;
        addKnot(state, state.roster[i].id, state.roster[j].id, '团建太勤', opts.day);
      } else {
        for (let i = 0; i < state.roster.length; i++) for (let j = i + 1; j < state.roster.length; j++) addBond(state, state.roster[i].id, state.roster[j].id, 2);
      }
      text = preview.backfire ? '团建又来了。饭吃完，群里比去之前更安静。' : '团建聚餐。饭桌上聊的还是昨天那把。';
      break;
    }
    case 'rest': {
      if (!preview.backfire) {
        state.flags.restDay = opts.day;
        for (const m of state.roster) {
          m.status.心情 = 100;
          m.status.疲劳 = 0;
        }
        text = pick(rand, REST_LINES);
      } else {
        bumpAll(state, '心情', -8);
        bumpAll(state, '疲劳', 8);
        text = '老板说放假，但这个月已经放过了。没人真的走。';
      }
      break;
    }
    case 'review': {
      state.insight = Math.max(0, state.insight + (preview.backfire ? -12 : sc(20)));
      if (preview.backfire || rand() < 0.25) {
        const a = state.roster[Math.floor(rand() * state.roster.length)];
        const b = state.roster.filter((m) => m !== a)[Math.floor(rand() * (state.roster.length - 1))];
        bump(state, a.id, '心情', -4);
        bump(state, b.id, '心情', -4);
        addKnot(state, a.id, b.id, '复盘吵起来', opts.day);
        text = `白板复盘说到一半，${name(a.id)}和${name(b.id)}吵了起来。`;
      } else text = '白板前开了个复盘会。心得记上了一笔。';
      break;
    }
    case 'coach': {
      const m = state.roster.find((r) => r.id === targets[0])!;
      if (!preview.backfire) {
        let best: (typeof ABILITY_KEYS)[number] = ABILITY_KEYS[0];
        for (const k of ABILITY_KEYS) if (m.ability[k] > m.ability[best]) best = k;
        m.ability[best] = Math.min(99, m.ability[best] + 2);
        bump(state, m.id, '心情', 4);
        text = `教练带${name(m.id)}加练了一天。`;
      } else {
        bump(state, m.id, '心情', -6);
        text = `教练来了，${name(m.id)}听得心不在焉。钱是花了。`;
      }
      break;
    }
    case 'scrim': {
      if (!preview.backfire) {
        state.insight += sc(40);
        text = '约了一场拉练。打完大家都说有收获，具体收获明天才知道。';
      } else {
        bumpAll(state, '疲劳', 10);
        text = '拉练赛约了，状态不对，打完只剩下累。';
      }
      break;
    }
    case 'media': {
      const m = state.roster.find((r) => r.id === targets[0])!;
      if (preview.backfire || rand() < 0.2) {
        bump(state, m.id, '心情', -8);
        text = `${name(m.id)}接受了采访，有一句话说拧了。群里在补救。`;
      } else {
        state.record.fame += 1;
        bump(state, m.id, '心情', 3);
        text = `${name(m.id)}出镜接受了个小采访。`;
      }
      break;
    }
    case 'camp': {
      if (!preview.backfire) {
        bumpAll(state, '心情', 12);
        bumpAll(state, '疲劳', -25);
        state.insight += 80;
        text = '出国集训这几天，白天练、晚上也在聊游戏。';
      } else {
        bumpAll(state, '心情', -10);
        text = '集训的机票订了，人却各想各的。钱已经扣了。';
      }
      break;
    }
    case 'fanmeet': {
      const quiet = [...state.roster].sort((a, b) => a.persona.话痨 - b.persona.话痨)[0];
      if (!preview.backfire) {
        bumpAll(state, '心情', 12);
        bump(state, quiet.id, '心情', -6);
        text = `粉丝见面会结束。${name(quiet.id)}站在边上，不太说话。`;
      } else {
        bumpAll(state, '心情', -6);
        text = '见面会冷场了。回去的路上没人说话。';
      }
      break;
    }
    default:
      text = `${def.name}做完了。`;
  }

  if (preview.backfire) opts.log('有趣', pick(rand, BACKFIRE), ids);
  opts.log(preview.backfire ? '有趣' : '剧情', text, ids);
  return { ok: true };
}

export function actionPointLabel(state: GameState, day: number): string {
  const max = actionPointMax(state.venueLevel, isMatchDay(state, day));
  return `${state.actionPoints}/${max}`;
}

export const ACTION_LIST = ACTIONS;
