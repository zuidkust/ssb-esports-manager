// 存档槽位：1 个自动存档 + 3 个手动槽位；导出 / 导入为 JSON 文件
import { dayInfo } from '../core/calendar';
import { fmtHM } from '../core/clock';
import type { KeyValueStore } from './platform';
import { migrate, SaveError } from './migrate';
import type { GameState } from './state';

export const SLOTS = ['auto', '1', '2', '3'] as const;
export type SlotId = (typeof SLOTS)[number];
const PREFIX = 'ssb-esports-manager/save/';

export interface SlotInfo {
  slot: SlotId;
  empty: boolean;
  label: string; // “第 1 赛季 第 3 天 周三 14:50”
  savedAt: number | null;
  broken?: string;
}

export function describeState(s: GameState): string {
  const d = dayInfo(s.clock.day);
  return `第 ${d.season} 赛季 第 ${d.dayInSeason} 天 ${d.weekdayCn} ${fmtHM(s.clock.minute)}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// 存档列表和导出文件名用本地墙钟。不要用 toISOString（那是 UTC，文件名会差几个小时）。
export function formatWallTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatWallStamp(ms: number): string {
  return formatWallTime(ms).replace(/[-: ]/g, '');
}

export class SaveManager {
  constructor(private store: KeyValueStore) {}

  save(slot: SlotId, state: GameState): void {
    state.savedAt = Date.now();
    this.store.set(PREFIX + slot, JSON.stringify(state));
  }

  load(slot: SlotId): GameState | null {
    const raw = this.store.get(PREFIX + slot);
    if (raw == null) return null;
    return migrate(JSON.parse(raw));
  }

  remove(slot: SlotId): void {
    this.store.remove(PREFIX + slot);
  }

  info(slot: SlotId): SlotInfo {
    const raw = this.store.get(PREFIX + slot);
    if (raw == null) return { slot, empty: true, label: '空', savedAt: null };
    try {
      const s = migrate(JSON.parse(raw));
      return { slot, empty: false, label: describeState(s), savedAt: s.savedAt };
    } catch (e) {
      return { slot, empty: false, label: '存档损坏', savedAt: null, broken: (e as Error).message };
    }
  }

  list(): SlotInfo[] {
    return SLOTS.map((s) => this.info(s));
  }

  // 最近一次保存的槽位（“继续游戏”用）
  latest(): SlotId | null {
    let best: SlotInfo | null = null;
    for (const i of this.list()) if (!i.empty && !i.broken && (!best || (i.savedAt ?? 0) > (best.savedAt ?? 0))) best = i;
    return best?.slot ?? null;
  }

  static exportText(state: GameState): string {
    return JSON.stringify({ ...state, savedAt: Date.now() }, null, 2);
  }

  static exportFilename(state: GameState, now = Date.now()): string {
    const d = dayInfo(state.clock.day);
    return `SSB电竞经理-存档-S${d.season}D${d.dayInSeason}-${formatWallStamp(now)}.json`;
  }

  // 解析导入文件；格式不对会抛 SaveError，界面负责提示
  static importText(text: string): GameState {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new SaveError('文件不是 JSON 格式');
    }
    return migrate(raw);
  }
}
