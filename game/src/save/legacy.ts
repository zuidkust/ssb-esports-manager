// 改名前的存档 id / 昵称。吊隆的 id 仍是 diaolong（拼音没变），只改显示名。
import { pairKey } from '../data/roster';

export const LEGACY_MEMBER_IDS: Record<string, string> = {
  shidian: 'aji',
  dishu: 'gouliang',
  piju: 'piegan',
};

export const LEGACY_NAMES: readonly [string, string][] = [
  ['施颠', '阿鸡'],
  ['地鼠', '狗粮'],
  ['批菊', '撇干'],
  ['吊龙', '吊隆'],
];

export function canonMemberId(id: string): string {
  return LEGACY_MEMBER_IDS[id] ?? id;
}

export function canonPairKey(key: string): string {
  if (!key.includes('|')) return canonMemberId(key);
  const [a, b] = key.split('|');
  return pairKey(canonMemberId(a), canonMemberId(b));
}

export function rewriteLegacyNames(text: string): string {
  let out = text;
  for (const [from, to] of LEGACY_NAMES) out = out.split(from).join(to);
  return out;
}

function canonCooldownKey(key: string): string {
  if (!key.startsWith('act:')) return key;
  const rest = key.slice(4);
  const idx = rest.indexOf(':');
  if (idx < 0) return key;
  return `act:${rest.slice(0, idx)}:${canonPairKey(rest.slice(idx + 1))}`;
}

function mergeRelation(prev: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  const bond = Math.max(Number(prev.bond ?? 0), Number(next.bond ?? 0));
  const knots = [...(Array.isArray(prev.knots) ? prev.knots : []), ...(Array.isArray(next.knots) ? next.knots : [])].slice(0, 2);
  const unlocked = [...new Set([...(Array.isArray(prev.unlocked) ? prev.unlocked : []), ...(Array.isArray(next.unlocked) ? next.unlocked : [])])];
  return { ...next, ...prev, bond, knots, unlocked };
}

function mapIdList(ids: unknown): unknown {
  if (!Array.isArray(ids)) return ids;
  return ids.map((id) => (typeof id === 'string' ? canonMemberId(id) : id));
}

function mapSocial(list: unknown): void {
  if (!Array.isArray(list)) return;
  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    const row = s as { a?: unknown; b?: unknown };
    if (typeof row.a === 'string') row.a = canonMemberId(row.a);
    if (typeof row.b === 'string') row.b = canonMemberId(row.b);
  }
}

function mapMeal(meal: unknown): void {
  if (!meal || typeof meal !== 'object') return;
  const rec = meal as { orders?: unknown; effects?: unknown };
  if (Array.isArray(rec.orders)) {
    for (const o of rec.orders) {
      if (o && typeof o === 'object' && typeof (o as { memberId?: unknown }).memberId === 'string') {
        (o as { memberId: string }).memberId = canonMemberId((o as { memberId: string }).memberId);
      }
    }
  }
  if (Array.isArray(rec.effects)) {
    for (const fx of rec.effects) {
      if (!fx || typeof fx !== 'object') continue;
      const row = fx as { status?: unknown; social?: unknown };
      if (Array.isArray(row.status)) {
        for (const st of row.status) {
          if (st && typeof st === 'object' && typeof (st as { id?: unknown }).id === 'string') {
            (st as { id: string }).id = canonMemberId((st as { id: string }).id);
          }
        }
      }
      mapSocial(row.social);
    }
  }
}

export function remapLegacyRoster(save: Record<string, unknown>): void {
  if (Array.isArray(save.roster)) {
    for (const m of save.roster) {
      if (m && typeof m === 'object' && typeof (m as { id?: unknown }).id === 'string') {
        (m as { id: string }).id = canonMemberId((m as { id: string }).id);
      }
    }
  }
  if (save.relations && typeof save.relations === 'object' && !Array.isArray(save.relations)) {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(save.relations as Record<string, unknown>)) {
      const nk = canonPairKey(k);
      const rel = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
      next[nk] = next[nk] ? mergeRelation(next[nk] as Record<string, unknown>, rel) : rel;
    }
    save.relations = next;
  }
  if (save.cooldowns && typeof save.cooldowns === 'object' && !Array.isArray(save.cooldowns)) {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(save.cooldowns as Record<string, unknown>)) next[canonCooldownKey(k)] = v;
    save.cooldowns = next;
  }
  if (Array.isArray(save.actionHistory)) {
    for (const h of save.actionHistory) {
      if (h && typeof h === 'object' && typeof (h as { target?: unknown }).target === 'string') {
        (h as { target: string }).target = canonPairKey((h as { target: string }).target);
      }
    }
  }
  if (save.flags && typeof save.flags === 'object') {
    const f = save.flags as { duoA?: unknown; duoB?: unknown };
    if (typeof f.duoA === 'string') f.duoA = canonMemberId(f.duoA);
    if (typeof f.duoB === 'string') f.duoB = canonMemberId(f.duoB);
  }
  if (Array.isArray(save.eventLog)) {
    for (const e of save.eventLog) {
      if (!e || typeof e !== 'object') continue;
      const row = e as { text?: unknown; ids?: unknown };
      if (typeof row.text === 'string') row.text = rewriteLegacyNames(row.text);
      row.ids = mapIdList(row.ids);
    }
  }
  if (save.meals && typeof save.meals === 'object') {
    const meals = save.meals as { morning?: unknown; lunch?: unknown; dinner?: unknown };
    if (Array.isArray(meals.morning)) {
      for (const s of meals.morning) {
        if (s && typeof s === 'object' && typeof (s as { memberId?: unknown }).memberId === 'string') {
          (s as { memberId: string }).memberId = canonMemberId((s as { memberId: string }).memberId);
        }
      }
    }
    mapMeal(meals.lunch);
    mapMeal(meals.dinner);
  }
}
