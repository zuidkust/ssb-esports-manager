// 导演层：把模拟里的“此刻在干嘛”翻译成画面里的走位、姿态、道具和显示器
import * as THREE from 'three';
import { PHONE_APP_BY_ID } from '../data/phoneApps';
import type { Member, World, ActivityKind } from '../sim/world';
import { Character, type PoseName } from './character';
import { NODES, route } from './nav';
import type { Desk, Office } from './office';
import { screenTexture, type ScreenKind } from './textures';
import type { Stage } from './stage';

const OUTSIDE = new THREE.Vector3(-5.85, 0, -5.7);

const STATUS_ICON: Partial<Record<ActivityKind, string>> = {
  solo: '🎮', team: '🎧', duo: '🎮', training: '🎯', match: '🏆', sub: '🎙️', meeting: '📋',
  slack_phone: '📱', slack_stream: '📺', snack: '🍪', drink: '🥤', fridge: '🧃', chat: '💬', toilet: '🚽',
  eat: '🍱', nap_desk: '💤', nap_sofa: '💤',
};

interface Placement {
  key: string;
  at?: THREE.Vector3;
  approach?: string;
  facing?: number;
  pose?: PoseName;
  hidden?: boolean;
  headset?: boolean;
  cup?: boolean;
  phone?: number; // 手机屏幕颜色
  chairBack?: boolean;
  screen: ScreenKind | 'standby';
}

export class Director {
  chars: Record<string, Character> = {};
  private place: Record<string, string | null> = {};
  private deskOf: Record<string, Desk>;
  private screenTex: Record<'game' | 'game2' | 'stream' | 'idle', THREE.Texture>[];
  private shake = 0;

  constructor(private stage: Stage, private office: Office, private world: World) {
    this.deskOf = Object.fromEntries(office.desks.map((d) => [d.owner, d]));
    this.screenTex = office.desks.map((_, i) => ({
      game: screenTexture('game', i * 3 + 1), game2: screenTexture('game', i * 3 + 2), stream: screenTexture('stream', i), idle: screenTexture('idle', i),
    }));
    for (const m of world.members) {
      const c = new Character(m.def);
      c.setHidden(true);
      c.pos.copy(OUTSIDE);
      stage.scene.add(c.root);
      stage.pickables.push(c.hit);
      this.chars[m.id] = c;
      const desk = this.deskOf[m.id];
      c.onSlam = () => {
        desk.jiggle = 1;
        this.shake = Math.max(this.shake, 0.6);
      };
    }
  }

  // 读档、跳时间之后：所有人直接瞬移到应在的位置
  snapAll() {
    for (const m of this.world.members) {
      this.place[m.id] = null;
      this.apply(m, true);
    }
  }

  private placement(m: Member): Placement {
    const desk = this.deskOf[m.id];
    const a = m.activity;
    const seat = (pose: PoseName, screen: Placement['screen'], extra: Partial<Placement> = {}): Placement => ({
      key: `desk:${pose}:${screen}:${extra.headset ?? false}`, at: desk.seat, approach: desk.approach, facing: Math.PI, pose, screen, ...extra,
    });
    const idx = this.world.members.indexOf(m);
    switch (a.kind) {
      case 'absent':
        return { key: 'out', hidden: true, screen: a.label === '已下班' ? (idx % 3 === 0 ? 'standby' : 'off') : 'off' };
      case 'out':
      case 'toilet':
        return { key: 'out', hidden: true, screen: 'idle' };
      case 'solo':
      case 'duo':
      case 'training':
        return seat('sit_play', idx % 2 ? 'game' : 'game2' as ScreenKind);
      case 'team':
      case 'match':
        return seat('sit_play', 'game', { headset: true });
      case 'slack_phone':
        return seat('sit_phone', 'idle', { phone: PHONE_APP_BY_ID[a.app ?? 'generic']?.screen ?? 0x6fa8ff, key: `desk:phone:${a.app}` });
      case 'slack_stream':
        return seat('sit_relax', 'stream');
      case 'eat':
        return seat('sit_eat', 'stream');
      case 'nap_desk':
        return seat('sleep_desk', 'idle');
      case 'nap_sofa':
        return { key: 'sofa', at: this.office.spots.sofa, approach: 'SO', facing: Math.PI / 2, pose: 'lie', screen: 'idle' };
      case 'snack':
        return { key: 'snack', at: this.office.spots.snack[idx % 3], approach: 'SN', facing: Math.PI, pose: 'reach', screen: 'idle' };
      case 'fridge':
        return { key: 'fridge', at: this.office.spots.fridge, approach: 'FR', facing: Math.PI, pose: 'reach', screen: 'idle' };
      case 'drink': {
        // 同时接水的人排开站，第一个人站在饮水机正前方
        const order = this.world.members.filter((x) => x.activity.kind === 'drink').indexOf(m);
        const at = this.office.spots.drink[Math.max(0, order) % 3];
        return { key: `drink${order}`, at, approach: 'WC', facing: Math.atan2(2.05 - at.x, -4.6 - at.z), pose: 'drink', cup: true, screen: 'idle' };
      }
      case 'meeting': {
        const order = this.world.members.filter((x) => x.activity.kind === 'meeting').indexOf(m);
        const at = this.office.spots.whiteboard(Math.max(0, order));
        return { key: `board${order}`, at, approach: 'WB', facing: Math.atan2(-7 - at.x, -1.6 - at.z), pose: order === 0 ? 'chat' : 'watch', screen: 'idle' };
      }
      case 'sub':
        return { key: 'sub', at: this.office.spots.sub, approach: 'B1', facing: Math.PI, pose: 'watch', screen: 'off' };
      case 'chat': {
        const at = this.office.spots.chat[a.host ? 0 : 1];
        return { key: `chat:${a.host}`, at, approach: 'CH', facing: a.host ? Math.PI / 2 : -Math.PI / 2, pose: 'chat', screen: 'idle' };
      }
    }
  }

  private apply(m: Member, instant = false) {
    const c = this.chars[m.id];
    const desk = this.deskOf[m.id];
    const p = this.placement(m);

    c.headset.visible = !!p.headset;
    c.phone.visible = p.phone != null;
    if (p.phone != null) c.setPhoneScreen(p.phone);
    c.cup.visible = !!p.cup;
    this.setScreen(desk, p.screen);
    desk.chairTarget = p.chairBack ? desk.chairBaseZ + 0.35 : p.key.startsWith('desk') ? desk.chairBaseZ : desk.chairBaseZ + 0.15;
    c.setStatusIcon(STATUS_ICON[m.activity.kind] ?? '');

    if (this.place[m.id] === p.key) return;
    const prevKey = this.place[m.id];
    this.place[m.id] = p.key;

    if (p.hidden) {
      if (instant || c.hidden) {
        c.setHidden(true);
        c.teleport(OUTSIDE, 0, 'stand');
        return;
      }
      const pts = route(c.pos.x, c.pos.z, 'D', OUTSIDE.x, OUTSIDE.z, this.exitNode(m.id, c));
      c.walkTo(pts, 'stand', null, () => {
        if (this.place[m.id] === 'out') c.setHidden(true);
      });
      return;
    }
    const at = p.at!, pose = p.pose!, facing = p.facing!;
    if (instant) {
      c.setHidden(false);
      c.teleport(at, facing, pose);
      return;
    }
    if (c.hidden || prevKey === 'out') {
      // 从门外进来
      c.setHidden(false);
      c.teleport(OUTSIDE, Math.PI, 'walk');
      c.walkTo(route(OUTSIDE.x, OUTSIDE.z, p.approach!, at.x, at.z, 'D'), pose, facing);
      return;
    }
    if (c.pos.distanceTo(at) < 0.9) {
      c.path = [new THREE.Vector3(at.x, 0, at.z)];
      c.arrivePose = pose;
      c.arriveFacing = facing;
      if (c.pos.distanceTo(at) < 0.02) c.setPose(pose, facing);
      else c.poseName = 'walk';
      return;
    }
    c.walkTo(route(c.pos.x, c.pos.z, p.approach!, at.x, at.z, this.exitNode(m.id, c)), pose, facing);
  }

  // 从座位 / 沙发起身时先回到过道节点，避免穿过桌子
  private exitNode(id: string, c: Character): string | undefined {
    const desk = this.deskOf[id];
    if (c.pos.distanceTo(desk.seat) < 0.6) return desk.approach;
    if (c.pos.distanceTo(this.office.spots.sofa) < 0.8) return 'SO';
    return undefined;
  }

  private setScreen(desk: Desk, kind: Placement['screen']) {
    if (desk.screenKind === kind) return;
    desk.screenKind = kind;
    const tex = this.screenTex[this.office.desks.indexOf(desk)];
    for (const s of desk.screens) {
      if (kind === 'off') {
        s.emissiveIntensity = 0;
        continue;
      }
      if (kind === 'standby') {
        s.emissiveMap = tex.idle;
        s.emissiveIntensity = 0.3;
      } else {
        s.emissiveMap = tex[kind as keyof typeof tex] ?? tex.idle;
        s.emissiveIntensity = kind === 'idle' ? 0.55 : 1;
      }
      s.needsUpdate = true;
    }
  }

  update(dt: number, minute: number, night: number) {
    const tnow = performance.now();
    for (const m of this.world.members) this.apply(m);
    for (const m of this.world.members) this.chars[m.id].update(dt, tnow);

    const q = this.stage.quality;
    for (const d of this.office.desks) {
      const on = d.screenKind && d.screenKind !== 'off' && d.screenKind !== 'standby';
      d.screenLight.intensity = !q.screenLights ? 0 : on ? 0.9 + night * 3.2 : d.screenKind === 'standby' ? night * 1.1 : 0;
      d.screenLight.color.setHex(d.screenKind === 'stream' ? 0xc6a2ff : 0x9cc2ff);
      d.rgbMat.emissiveIntensity = on ? 0.9 : 0.15;
      d.kbGlow.emissiveIntensity = on ? 0.5 : 0.05;
      d.pcGlow.emissiveIntensity = on ? 0.6 : 0.08;
      if (d.lamp) d.lamp.mat.emissiveIntensity = on && night > 0.3 ? 2 : 0;
      d.chair.position.z += ((d.chairTarget ?? d.chairBaseZ) - d.chair.position.z) * Math.min(1, dt * 5);
      if (d.jiggle > 0) {
        d.jiggle = Math.max(0, d.jiggle - dt * 3);
        d.monitor.position.y = 0.77 + Math.abs(Math.sin(tnow * 0.08) * 0.012 * d.jiggle);
      }
    }
    // 有人经过时开门；有人在冰箱前时开冰箱门
    const chars = Object.values(this.chars);
    const nearDoor = chars.some((c) => !c.hidden && Math.hypot(c.pos.x - NODES.D[0], c.pos.z - (NODES.D[1] - 0.6)) < 1.25);
    const dp = this.office.doorPivot;
    dp.rotation.y += ((nearDoor ? -1.35 : 0) - dp.rotation.y) * Math.min(1, dt * 4);
    const atFridge = chars.some((c) => !c.hidden && !c.path.length && c.pos.distanceTo(this.office.spots.fridge) < 0.2);
    const fd = this.office.fridgeDoor;
    fd.rotation.y += ((atFridge ? -1.6 : 0) - fd.rotation.y) * Math.min(1, dt * 4);
    // 墙钟
    const h = (minute / 60) % 12;
    this.office.clock.hourHand.rotation.z = -(h / 12) * Math.PI * 2;
    this.office.clock.minHand.rotation.z = -((minute % 60) / 60) * Math.PI * 2;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      this.stage.camera.position.y += Math.sin(tnow * 0.09) * 0.02 * this.shake;
    }
  }
}
