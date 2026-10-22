// 存档版本迁移：每次改存档结构，SAVE_VERSION +1，并在 MIGRATIONS 里补一个 “旧版本 → 新版本” 函数
import { DAY_START } from '../core/clock';
import { ROSTER_BY_ID } from '../data/roster';
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
};

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
