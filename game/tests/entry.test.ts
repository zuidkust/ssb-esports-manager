import { describe, expect, it } from 'vitest';
import { OFFICE_NAV } from '../src/scene/nav';
import { DoorEntry, ENTRY_WALK_SPEED, SEAT_GRACE_MINUTES, UNHIDE_Z, entryPath, needsSeatSnap, type EntryCtx, type EntryGoal, type XZ } from '../src/scene/entry';

const MOUTH = { x: -5.85, z: -5.7 };
const DOOR_Z = OFFICE_NAV.nodes.D[1];

function ctx(): EntryCtx {
  return {
    mouth: MOUTH,
    doorZ: DOOR_Z,
    route: (from, goal, startAtDoor) => OFFICE_NAV.route(from.x, from.z, goal.approach, goal.x, goal.z, startAtDoor ? 'D' : undefined),
  };
}

interface Body {
  id: string;
  x: number;
  z: number;
  hidden: boolean;
  path: XZ[];
  onDuty: boolean;
}

const SEATS: { id: string; approach: string; x: number; z: number }[] = [
  { id: 'diaolong', approach: 'A0', x: -3.6, z: -3.55 },
  { id: 'dishu', approach: 'A1', x: -1.5, z: -3.55 },
  { id: 'dibi', approach: 'A2', x: 0.6, z: -3.55 },
  { id: 'shidian', approach: 'B0', x: -3.6, z: -0.85 },
  { id: 'dangdeng', approach: 'B1', x: -1.5, z: -0.85 },
  { id: 'piju', approach: 'B2', x: 0.6, z: -0.85 },
];

function goal(seat: (typeof SEATS)[number], pose: string): EntryGoal {
  return { approach: seat.approach, x: seat.x, z: seat.z, pose, facing: Math.PI };
}

function step(b: Body, dt: number) {
  let left = ENTRY_WALK_SPEED * dt;
  while (b.path.length && left > 0) {
    const t = b.path[0];
    const d = Math.hypot(t.x - b.x, t.z - b.z);
    if (d <= left + 1e-6) {
      b.x = t.x;
      b.z = t.z;
      left -= d;
      b.path.shift();
    } else {
      b.x += ((t.x - b.x) / d) * left;
      b.z += ((t.z - b.z) / d) * left;
      left = 0;
    }
  }
}

describe('进门', () => {
  it('在岗的人会走进场地，活动变了也不会被拽回门口', () => {
    const doors = new DoorEntry();
    const c = ctx();
    const bodies: Body[] = SEATS.map((s) => ({
      id: s.id, x: MOUTH.x, z: MOUTH.z, hidden: true, path: [], onDuty: true,
    }));
    const byId = Object.fromEntries(bodies.map((b) => [b.id, b]));
    let pose = 'sit_play';
    const claimAll = () => {
      for (const seat of SEATS) {
        const b = byId[seat.id];
        const order = doors.claim(b.id, b, b.hidden, b.hidden || b.z <= DOOR_Z, goal(seat, pose), c);
        if (order.kind === 'queue') {
          b.x = order.at.x;
          b.z = order.at.z;
          b.hidden = true;
          b.path = [];
        } else if (order.kind === 'enter') b.path = order.path.map((p) => ({ ...p }));
      }
    };
    claimAll();
    for (let t = 0; t < 75; t += 0.05) {
      const next = Math.floor(t / 2) % 2 === 0 ? 'sit_play' : 'sit_phone';
      if (next !== pose) {
        pose = next;
        claimAll();
      }
      const pos = Object.fromEntries(bodies.map((b) => [b.id, { x: b.x, z: b.z, hidden: b.hidden }]));
      const pumped = doors.pump(pos, c);
      for (const id of pumped.unhide) byId[id].hidden = false;
      if (pumped.start) {
        const b = byId[pumped.start.id];
        b.path = pumped.start.path.map((p) => ({ ...p }));
      }
      for (const b of bodies) step(b, 0.05);
    }
    for (const b of bodies) {
      expect(b.onDuty).toBe(true);
      expect(b.hidden, b.id).toBe(false);
      expect(b.z, b.id).toBeGreaterThan(UNHIDE_Z);
      expect(b.x, b.id).toBeGreaterThanOrEqual(-7);
      expect(b.x, b.id).toBeLessThanOrEqual(7);
      expect(Math.hypot(b.x - MOUTH.x, b.z - MOUTH.z), b.id).toBeGreaterThan(1.2);
    }
    expect(byId.dibi.hidden).toBe(false);
  });

  it('过了门口之后换目标，路径不会退回门外', () => {
    const c = ctx();
    const pos = { x: MOUTH.x, z: MOUTH.z + 0.8 };
    const g: EntryGoal = { approach: 'A1', x: -1.5, z: -3.55, pose: 'sit_play', facing: Math.PI };
    const path = entryPath(pos, c, g);
    expect(path.length).toBeGreaterThan(0);
    expect(path[0].z).toBeGreaterThan(pos.z - 0.05);
    expect(path.some((p) => p.z > UNHIDE_Z)).toBe(true);
  });

  it('在岗几分钟还没到座位，就该直接放过去', () => {
    expect(needsSeatSnap(9 * 60, 9 * 60 + SEAT_GRACE_MINUTES - 0.1)).toBe(false);
    expect(needsSeatSnap(9 * 60, 9 * 60 + SEAT_GRACE_MINUTES)).toBe(true);
    expect(SEAT_GRACE_MINUTES).toBeLessThanOrEqual(5);
  });
});
