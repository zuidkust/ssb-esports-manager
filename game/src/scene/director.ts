// 导演层：把模拟里的“此刻在干嘛”翻译成画面里的走位、姿态、道具和显示器
import * as THREE from 'three';
import { PHONE_APP_BY_ID } from '../data/phoneApps';
import type { Member, World, ActivityKind } from '../sim/world';
import { Character, type PoseName } from './character';
import type { Desk } from './office';
import { screenTexture, type ScreenKind } from './textures';
import type { Stage } from './stage';
import { Courier } from './courier';
import type { Spot, Venue } from './venue';

const STATUS_ICON: Partial<Record<ActivityKind, string>> = {
  solo: '🎮', team: '🎧', duo: '🎮', training: '🎯', match: '🏆', sub: '🎙️', meeting: '📋',
  slack_phone: '📱', slack_stream: '📺', snack: '🍪', drink: '🥤', fridge: '🧃', chat: '💬', toilet: '🚽',
  spectate: '👀', wait_food: '⏳', eat: '🍱', nap_desk: '💤', nap_sofa: '💤',
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
  private deskOf: Record<string, Desk> = {};
  private screenTex: Record<'game' | 'game2' | 'stream' | 'idle', THREE.Texture>[];
  private shake = 0;
  private courier: Courier;

  constructor(private stage: Stage, private office: Venue, private world: World) {
    this.screenTex = office.desks.map((_, i) => ({
      game: screenTexture('game', i * 3 + 1), game2: screenTexture('game', i * 3 + 2), stream: screenTexture('stream', i), idle: screenTexture('idle', i),
    }));
    for (const m of world.members) {
      const c = new Character(m.def);
      c.setHidden(true);
      c.pos.copy(office.exit);
      stage.scene.add(c.root);
      stage.pickables.push(c.hit);
      this.chars[m.id] = c;
      c.onSlam = () => {
        const desk = this.deskOf[m.id];
        if (desk) desk.jiggle = 1;
        this.shake = Math.max(this.shake, 0.6);
      };
    }
    this.courier = new Courier(stage.scene);
    this.setVenue(office);
  }

  // 换场地（读档、搬家、买设施后重建场景）：人物保留，之后调用 snapAll 瞬移到新位置
  setVenue(v: Venue) {
    this.office = v;
    this.deskOf = Object.fromEntries(v.desks.map((d) => [d.owner, d]));
    for (const id in this.place) this.place[id] = null;
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
    const go = (key: string, s: Spot, pose: PoseName, extra: Partial<Placement> = {}): Placement => ({
      key, at: s.at, approach: s.approach, facing: s.facing, pose, screen: 'idle', ...extra,
    });
    const sp = this.office.spots;
    switch (a.kind) {
      case 'absent':
        return { key: 'out', hidden: true, screen: a.label === '已下班' ? (idx % 3 === 0 ? 'standby' : 'off') : 'off' };
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
      case 'wait_food':
        return seat('sit_phone', 'stream', { phone: 0x6fa8ff, key: 'desk:wait' });
      case 'eat':
        return seat('sit_eat', 'stream');
      case 'nap_desk':
        return seat('sleep_desk', 'idle');
      // 模拟层已按场地设施过滤；万一设施刚被移除（读档换场地的那一帧），就留在座位上
      case 'nap_sofa':
        return sp.sofa ? go('sofa', sp.sofa, 'lie') : seat('sleep_desk', 'idle');
      case 'snack':
        return sp.snack ? go('snack', sp.snack[idx % sp.snack.length], 'reach') : seat('sit_relax', 'idle');
      case 'fridge':
        return sp.fridge ? go('fridge', sp.fridge, 'reach') : seat('sit_relax', 'idle');
      case 'drink': {
        // 同时接水的人排开站，第一个人站在饮水机正前方
        const order = this.world.members.filter((x) => x.activity.kind === 'drink').indexOf(m);
        return go(`drink${order}`, sp.drink[Math.max(0, order) % sp.drink.length], 'drink', { cup: true });
      }
      case 'meeting': {
        const order = this.world.members.filter((x) => x.activity.kind === 'meeting').indexOf(m);
        const s = sp.meeting(Math.max(0, order));
        return go(`board${order}`, s, s.lead ? 'chat' : 'watch');
      }
      case 'sub':
        return go('sub', sp.sub, 'watch', { screen: 'off' });
      case 'chat':
        return go(`chat:${a.host}`, sp.chat[a.host ? 0 : 1], 'chat');
      case 'spectate': {
        // 站在打游戏的队友椅子斜后方，看他的屏幕
        const d = this.deskOf[a.partner!];
        if (!d) return seat('sit_relax', 'game');
        const at = new THREE.Vector3(d.seat.x + 0.38, 0, d.seat.z + 0.62);
        return { key: `spectate:${a.partner}`, at, approach: d.approach, facing: Math.atan2(d.seat.x - at.x, d.seat.z - 1.2 - at.z), pose: 'watch', screen: 'idle' };
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
      const out = this.office.exit;
      if (instant || c.hidden) {
        c.setHidden(true);
        c.teleport(out, 0, 'stand');
        return;
      }
      const pts = this.office.nav.route(c.pos.x, c.pos.z, this.office.door, out.x, out.z, this.exitNode(m.id, c));
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
      const out = this.office.exit;
      c.setHidden(false);
      c.teleport(out, Math.PI, 'walk');
      c.walkTo(this.office.nav.route(out.x, out.z, p.approach!, at.x, at.z, this.office.door), pose, facing);
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
    c.walkTo(this.office.nav.route(c.pos.x, c.pos.z, p.approach!, at.x, at.z, this.exitNode(m.id, c)), pose, facing);
  }

  // 从座位 / 沙发起身时先回到过道节点，避免穿过桌子
  private exitNode(id: string, c: Character): string | undefined {
    const desk = this.deskOf[id];
    if (c.pos.distanceTo(desk.seat) < 0.6) return desk.approach;
    const sofa = this.office.spots.sofa;
    if (sofa && c.pos.distanceTo(sofa.at) < 0.8) return sofa.approach;
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
    this.courier.sync(this.office, this.world.courierJob(minute), minute);
    this.courier.char.update(dt, tnow);
    this.office.update?.(dt, tnow);

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
    const chars = [...Object.values(this.chars), this.courier.char];
    const [dx, dz] = this.office.nav.nodes[this.office.door];
    const nearDoor = chars.some((c) => !c.hidden && Math.hypot(c.pos.x - dx, c.pos.z - (dz - 0.6)) < 1.35);
    const dp = this.office.doorPivot;
    dp.rotation.y += ((nearDoor ? -1.35 : 0) - dp.rotation.y) * Math.min(1, dt * 4);
    const fd = this.office.fridgeDoor, fs = this.office.spots.fridge;
    if (fd && fs) {
      const atFridge = chars.some((c) => !c.hidden && !c.path.length && c.pos.distanceTo(fs.at) < 0.2);
      fd.rotation.y += ((atFridge ? -1.6 : 0) - fd.rotation.y) * Math.min(1, dt * 4);
    }
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
