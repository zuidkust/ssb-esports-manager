// 存档版本迁移：每次改存档结构，SAVE_VERSION +1，并在 MIGRATIONS 里补一个 “旧版本 → 新版本” 函数
import { DAY_START } from '../core/clock';
import { LEGACY_ID_MAP, LEGACY_NAME_MAP, ROSTER_BY_ID, mapLegacyId, pairKey } from '../data/roster';
import { emptyFlags, emptyMeals, emptyRecord, SAVE_VERSION, type GameState } from './state';

type AnySave = Record<string, unknown> & { version?: unknown };

// 键是迁移前的版本号。例：2: (s) => ({ ...s, newField: 0, version: 3 })
const MIGRATIONS: Record<number, (s: AnySave) => AnySave> = {
  // v2：设施、赛前确认标记、性格“爱睡觉”
  1: (s) => ({
    ...s,
    facilities: [],
    prematchConfirmedDay: 0,
    roster: Array.isArray(s.roster)
      ? (s.roster as { id: string; persona: Record<string, number> }[]).map((m) => ({
          ...m,
          persona: { 爱睡觉: ROSTER_BY_ID[m.id]?.persona.爱睡觉 ?? 50, ...m.persona },
        }))
      : s.roster,
    version: 2,
  }),
  // v3：外卖当日记录、赞助进度、发薪标记、行动点所属日；战队成立固定在第 1 天早上
  2: (s) => {
    const clock = s.clock as { day?: number } | undefined;
    const day = typeof clock?.day === 'number' ? clock.day : 1;
    const log = Array.isArray(s.eventLog) ? s.eventLog : [];
    for (const e of log) {
      if (e && typeof e === 'object' && typeof (e as { text?: unknown }).text === 'string' && (e as { text: string }).text.includes('战队今天正式成立')) {
        (e as { day: number; minute: number }).day = 1;
        (e as { day: number; minute: number }).minute = DAY_START;
      }
    }
    return {
      ...s,
      eventLog: log,
      bankrupt: typeof s.bankrupt === 'boolean' ? s.bankrupt : false,
      // 旧档没有“行动点是哪一天填的”。记 0，下一次进入当天会按上限补齐（含比赛日 +1），而不是把今天标成已经填过。
      apDay: typeof s.apDay === 'number' ? s.apDay : 0,
      meals: s.meals ?? emptyMeals(day),
      record: s.record ?? emptyRecord(),
      flags: s.flags ?? emptyFlags(),
      version: 3,
    };
  },
  // v4：正式名。旧 id 和动态里的旧昵称改过来，能力 / 性格按人设稿重写，状态和工资保留。
  3: (s) => remapLegacyRoster(s),
};

const LEGACY_ID_RE = /\b(shidian|dishu|piju)\b/g;

function mapIds(text: string): string {
  return text.replace(LEGACY_ID_RE, (id) => LEGACY_ID_MAP[id] ?? id);
}

function mapNames(text: string): string {
  let out = mapIds(text);
  for (const [from, to] of LEGACY_NAME_MAP) out = out.split(from).join(to);
  return out;
}

function mapKey(key: string): string {
  const mapped = mapIds(key);
  const idx = mapped.lastIndexOf(':');
  const head = idx >= 0 ? mapped.slice(0, idx + 1) : '';
  const tail = idx >= 0 ? mapped.slice(idx + 1) : mapped;
  if (!tail.includes('|')) return mapped;
  const parts = tail.split('|');
  if (parts.length !== 2) return mapped;
  return head + pairKey(parts[0], parts[1]);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function remapLegacyRoster(s: AnySave): AnySave {
  const next: AnySave = { ...s, version: 4 };
  if (Array.isArray(s.roster)) {
    next.roster = s.roster.map((raw) => {
      const m = asRecord(raw);
      if (!m || typeof m.id !== 'string') return raw;
      const id = mapLegacyId(m.id);
      const def = ROSTER_BY_ID[id];
      if (!def) return { ...m, id };
      return { ...m, id, ability: { ...def.ability }, persona: { ...def.persona } };
    });
  }
  const relations = asRecord(s.relations);
  if (relations) {
    const merged: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(relations)) {
      const rel = asRecord(raw) ?? {};
      const knots = Array.isArray(rel.knots)
        ? rel.knots.map((k) => {
            const knot = asRecord(k);
            if (!knot || typeof knot.cause !== 'string') return k;
            return { ...knot, cause: mapNames(knot.cause) };
          })
        : rel.knots;
      const mapped: Record<string, unknown> = { ...rel, knots };
      const nk = mapKey(key);
      const prev = asRecord(merged[nk]);
      if (!prev) merged[nk] = mapped;
      else {
        const prevKnots = Array.isArray(prev.knots) ? prev.knots : [];
        const nextKnots = Array.isArray(mapped.knots) ? mapped.knots : [];
        merged[nk] = {
          ...prev,
          ...mapped,
          bond: Math.max(Number(prev.bond) || 0, Number(mapped.bond) || 0),
          knots: [...prevKnots, ...nextKnots].slice(0, 2),
          unlocked: [...new Set([...(Array.isArray(prev.unlocked) ? prev.unlocked : []), ...(Array.isArray(mapped.unlocked) ? mapped.unlocked : [])])],
        };
      }
    }
    next.relations = merged;
  }
  const cooldowns = asRecord(s.cooldowns);
  if (cooldowns) {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(cooldowns)) mapped[mapKey(key)] = value;
    next.cooldowns = mapped;
  }
  if (Array.isArray(s.actionHistory)) {
    next.actionHistory = s.actionHistory.map((raw) => {
      const h = asRecord(raw);
      if (!h) return raw;
      const target = typeof h.target === 'string' ? mapKey(h.target) : h.target;
      return { ...h, target };
    });
  }
  const flags = asRecord(s.flags);
  if (flags) {
    next.flags = {
      ...flags,
      duoA: typeof flags.duoA === 'string' ? mapLegacyId(flags.duoA) : flags.duoA,
      duoB: typeof flags.duoB === 'string' ? mapLegacyId(flags.duoB) : flags.duoB,
    };
  }
  if (Array.isArray(s.eventLog)) {
    next.eventLog = s.eventLog.map((raw) => {
      const e = asRecord(raw);
      if (!e) return raw;
      return {
        ...e,
        text: typeof e.text === 'string' ? mapNames(e.text) : e.text,
        ids: Array.isArray(e.ids) ? e.ids.map((id) => (typeof id === 'string' ? mapLegacyId(id) : id)) : e.ids,
      };
    });
  }
  next.meals = remapMeals(s.meals);
  return next;
}

function remapMeals(raw: unknown): unknown {
  const meals = asRecord(raw);
  if (!meals) return raw;
  const mapOrder = (order: unknown) => {
    const o = asRecord(order);
    if (!o || typeof o.memberId !== 'string') return order;
    return { ...o, memberId: mapLegacyId(o.memberId) };
  };
  const mapEffect = (fx: unknown) => {
    const e = asRecord(fx);
    if (!e) return fx;
    return {
      ...e,
      status: Array.isArray(e.status)
        ? e.status.map((st) => {
            const row = asRecord(st);
            if (!row || typeof row.id !== 'string') return st;
            return { ...row, id: mapLegacyId(row.id) };
          })
        : e.status,
      social: Array.isArray(e.social)
        ? e.social.map((soc) => {
            const row = asRecord(soc);
            if (!row) return soc;
            return {
              ...row,
              a: typeof row.a === 'string' ? mapLegacyId(row.a) : row.a,
              b: typeof row.b === 'string' ? mapLegacyId(row.b) : row.b,
              cause: typeof row.cause === 'string' ? mapNames(row.cause) : row.cause,
            };
          })
        : e.social,
    };
  };
  const mapMeal = (meal: unknown) => {
    const rec = asRecord(meal);
    if (!rec) return meal;
    return {
      ...rec,
      orders: Array.isArray(rec.orders) ? rec.orders.map(mapOrder) : rec.orders,
      effects: Array.isArray(rec.effects) ? rec.effects.map(mapEffect) : rec.effects,
    };
  };
  return {
    ...meals,
    morning: Array.isArray(meals.morning) ? meals.morning.map(mapOrder) : meals.morning,
    lunch: mapMeal(meals.lunch),
    dinner: mapMeal(meals.dinner),
  };
}

export class SaveError extends Error {}

export function migrate(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SaveError('不是有效的存档文件');
  let s = raw as AnySave;
  if (typeof s.version !== 'number') throw new SaveError('存档缺少版本号');
  if (s.version > SAVE_VERSION) throw new SaveError(`存档来自更新的版本（v${s.version}），请先升级游戏`);
  while ((s.version as number) < SAVE_VERSION) {
    const step = MIGRATIONS[s.version as number];
    if (!step) throw new SaveError(`无法从存档版本 v${s.version} 升级`);
    s = step(s);
  }
  validate(s);
  return s as unknown as GameState;
}

// 只检查读档必需的字段，防止导入一个看起来像 JSON 的别的文件
function validate(s: AnySave): void {
  const need = ['seed', 'clock', 'roster', 'relations', 'eventLog'];
  for (const k of need) if (!(k in s)) throw new SaveError(`存档缺少字段：${k}`);
  const c = s.clock as Record<string, unknown>;
  if (typeof c?.day !== 'number' || typeof c?.minute !== 'number') throw new SaveError('存档时间字段损坏');
  if (!Array.isArray(s.roster) || s.roster.length === 0) throw new SaveError('存档队员列表损坏');
}
