// 进门排队。纯数据，测试不用建 WebGL。
// 人还在门外时，活动一变也不能把路径拽回门口，否则会卡在墙外，名册却显示在岗。

import { doorQueueSpot } from './spots';

export const ENTRY_WALK_SPEED = 1.35;
/** 过了后墙才露脸。墙在 z = -5。 */
export const UNHIDE_Z = -5.15;

export interface XZ {
  x: number;
  z: number;
}

export interface EntryGoal {
  approach: string;
  x: number;
  z: number;
  pose: string;
  facing: number;
}

export interface EntryCtx {
  mouth: XZ;
  doorZ: number;
  route: (from: XZ, goal: EntryGoal, startAtDoor: boolean) => XZ[];
}

export type EntryOrder =
  | { kind: 'queue'; at: XZ }
  | { kind: 'hold' }
  | { kind: 'enter'; path: XZ[]; pose: string; facing: number }
  | { kind: 'free' };

export interface EntryPump {
  unhide: string[];
  start: { id: string; path: XZ[]; pose: string; facing: number } | null;
}

function goalKey(g: EntryGoal): string {
  return `${g.approach}|${g.pose}|${g.x.toFixed(2)}|${g.z.toFixed(2)}|${g.facing.toFixed(2)}`;
}

/** 还没过门洞才先走到门口。已经朝屋里走了，就从脚下接着走，不退回门口。 */
export function entryPath(pos: XZ, ctx: EntryCtx, goal: EntryGoal): XZ[] {
  const passedMouth = pos.z > ctx.mouth.z + 0.3;
  if (passedMouth) return ctx.route(pos, goal, pos.z < ctx.doorZ + 0.2);
  const via = ctx.route(ctx.mouth, goal, true);
  const pts: XZ[] = [];
  if (Math.hypot(pos.x - ctx.mouth.x, pos.z - ctx.mouth.z) > 0.25) pts.push({ x: ctx.mouth.x, z: ctx.mouth.z });
  return pts.concat(via);
}

export class DoorEntry {
  private queue: string[] = [];
  private phase = new Map<string, 'wait' | 'walk'>();
  private keys = new Map<string, string>();
  private goals = new Map<string, EntryGoal>();
  private slot = new Map<string, number>();

  reset() {
    this.queue = [];
    this.phase.clear();
    this.keys.clear();
    this.goals.clear();
    this.slot.clear();
  }

  drop(id: string) {
    this.phase.delete(id);
    this.keys.delete(id);
    this.goals.delete(id);
    this.slot.delete(id);
    this.queue = this.queue.filter((x) => x !== id);
  }

  private takeSlot(): number {
    const used = new Set(this.slot.values());
    let i = 0;
    while (used.has(i)) i++;
    return i;
  }

  claim(id: string, pos: XZ, hidden: boolean, cameFromOutside: boolean, goal: EntryGoal, ctx: EntryCtx): EntryOrder {
    const key = goalKey(goal);
    const phase = this.phase.get(id);
    if (phase === 'walk') {
      const changed = this.keys.get(id) !== key;
      this.keys.set(id, key);
      this.goals.set(id, goal);
      if (!changed) return { kind: 'hold' };
      const path = entryPath(pos, ctx, goal);
      return { kind: 'enter', path, pose: goal.pose, facing: goal.facing };
    }
    const stillOutside = hidden || pos.z <= ctx.doorZ + 0.15;
    if (phase === 'wait' || (cameFromOutside && stillOutside)) {
      if (!this.queue.includes(id)) {
        this.slot.set(id, this.takeSlot());
        this.queue.push(id);
      }
      this.phase.set(id, 'wait');
      this.keys.set(id, key);
      this.goals.set(id, goal);
      return { kind: 'queue', at: doorQueueSpot(this.slot.get(id)!) };
    }
    return { kind: 'free' };
  }

  pump(pos: Record<string, XZ & { hidden: boolean }>, ctx: EntryCtx): EntryPump {
    const unhide: string[] = [];
    for (const id of [...this.queue]) {
      if (this.phase.get(id) !== 'walk') continue;
      const p = pos[id];
      if (!p) continue;
      if (p.hidden && p.z > UNHIDE_Z) unhide.push(id);
      const passed = p.z > ctx.doorZ + 0.45 && Math.hypot(p.x - ctx.mouth.x, p.z - ctx.mouth.z) > 1.2;
      if (passed) this.drop(id);
    }
    const front = this.queue[0];
    if (front && this.phase.get(front) === 'wait') {
      const goal = this.goals.get(front);
      const p = pos[front];
      if (goal && p) {
        this.phase.set(front, 'walk');
        return { unhide, start: { id: front, path: entryPath(p, ctx, goal), pose: goal.pose, facing: goal.facing } };
      }
    }
    return { unhide, start: null };
  }
}
