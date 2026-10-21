// 导演层：把模拟器里的"行为/事件"翻译成画面里的走位、姿态、气泡和道具状态
import * as THREE from 'three';
import { Character } from './character.js';
import { route, NODES } from './nav.js';
import { screenTexture } from './textures.js';

const OUTSIDE = new THREE.Vector3(-5.85, 0, -5.7);
const ACTION_SECONDS = 11;

// 事件 → 动作（按顺序匹配，先到先得）
const ACTION_RULES = [
  [/红温|拍桌|连跪|送人头|空大|一换五|演员|掉线|挂机|惨败|被单杀|打字|迁怒|赌气/, 'rage'],
  [/超神|五杀|连胜|翻盘|奇袭|晋级|偷塔|大胜|升段|突破|绝活|夺冠|庆功|生日|开窍|觉醒/, 'cheer'],
  [/睡|闭目/, 'sleep'],
  [/奶茶|零食|外卖|饮料|夜宵|早餐|咖啡|蛋糕|请客|打水|下午茶/, 'snack'],
  [/如厕|厕所/, 'toilet'],
  [/排行榜|白板|复盘|阵容|投票|甩锅大会|首发|开会|录像|抽签/, 'board'],
  [/手机|短视频|刷|直播|小号/, 'phone'],
  [/甩锅|吵|怼|阴阳|批|嘲讽|打赌|和好|安慰|教|评价|聊|点评|举报|包庇|拍|曝光|放风|联盟|反驳|护短|嘴硬|道歉|奶|炫耀|指点|搭子|围观|吃瓜|挑衅/, 'chat'],
];

const STATUS_ICON = {
  solo: '🎮', team: '🎧', duo: '🎮', training: '🎯', match: '🏆', sub: '👀',
  slack_phone: '📱', slack_stream: '📺', snack: '🧋', chat: '💬', toilet: '🚽',
  lunch_in: '🍱', nap_desk: '💤', nap_sofa: '💤',
};

const ACTION_ICON = { rage: '😡', cheer: '🎉', sleep: '💤', snack: '🧋', toilet: '🚽', board: '📋', phone: '📱', chat: '💬' };

export class Director {
  constructor(stage, office, world) {
    this.stage = stage;
    this.office = office;
    this.world = world;
    this.chars = {};
    this.place = {}; // 每人当前"站位描述"的 key，变化时才重新走位
    this.actions = {}; // 事件触发的临时动作：id → { type, until, ... }
    this.deskOf = Object.fromEntries(office.desks.map((d) => [d.owner, d]));
    this.screenTex = office.desks.map((_, i) => ({
      game: screenTexture('game', i * 3 + 1), game2: screenTexture('game', i * 3 + 2), stream: screenTexture('stream', i), idle: screenTexture('idle', i),
    }));
    this.shake = 0;

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

  // 拖动时间等"跳变"后：所有人直接瞬移到应在的位置
  snapAll() {
    this.actions = {};
    for (const m of this.world.members) {
      this.place[m.id] = null;
      this.apply(m, true);
    }
  }

  // 由事件触发临时动作
  onEvent(entry) {
    if (!entry.eventId || entry.silent) return;
    const name = entry.name + entry.text;
    let type = null;
    for (const [re, t] of ACTION_RULES) if (re.test(name)) { type = t; break; }
    const ids = entry.participants.map((p) => p.id).filter((id) => this.world.byId[id]?.isPresent());
    if (!ids.length) return;
    const subject = ids.includes(entry.subjectId) ? entry.subjectId : ids[0];
    const until = performance.now() + ACTION_SECONDS * 1000;
    const quotes = extractQuotes(entry.text, this.world);

    if (type === 'board' && ids.length >= 3) {
      ids.forEach((id, i) => (this.actions[id] = { type: 'board', until, slot: i }));
    } else if (type === 'cheer' && ids.length >= 3) {
      ids.forEach((id) => (this.actions[id] = { type: 'cheer', until: until - 4000 }));
    } else if (type === 'chat' && ids.length >= 2) {
      const other = ids.find((id) => id !== subject);
      const host = this.world.byId[other].activity.kind === 'absent' ? subject : other;
      const guest = host === subject ? other : subject;
      this.actions[guest] = { type: 'visit', host, until };
      this.actions[host] = { type: 'host', guest, until };
    } else if (type && type !== 'chat') {
      this.actions[subject] = { type, until: type === 'toilet' ? until + 6000 : until };
    }
    // 气泡：引号里的台词优先给说话人
    let quoted = false;
    for (const q of quotes) {
      const c = this.chars[q.id];
      if (c && !c.hidden) {
        setTimeout(() => c.say(q.text, 5200), q.order * 1600 + 900);
        quoted = true;
      }
    }
    if (!quoted && type) this.chars[subject]?.say(ACTION_ICON[type], 3500, 'emoji');
    for (const id of ids) this.place[id] = null;
  }

  // 根据行为（或临时动作）计算目标站位，并在变化时安排走位
  apply(m, instant = false) {
    const c = this.chars[m.id];
    const desk = this.deskOf[m.id];
    let act = this.actions[m.id];
    if (act && performance.now() > act.until) {
      delete this.actions[m.id];
      act = null;
    }
    if (act && !m.isPresent()) {
      delete this.actions[m.id];
      act = null;
    }
    const kind = m.activity.kind;
    let p; // { key, at: Vector3, approach: 节点, facing, pose, hidden, headset, chairBack, screen }
    const seatFacing = Math.PI;
    const seat = (pose, screen, headset = false) => ({ key: `desk:${pose}:${screen}:${headset}`, at: desk.seat, approach: desk.approach, facing: seatFacing, pose, screen, headset });

    if (act) {
      switch (act.type) {
        case 'rage': p = { key: 'rage', at: desk.standSpot, approach: desk.approach, facing: seatFacing, pose: 'rage', chairBack: true, screen: 'game' }; break;
        case 'cheer': p = { key: 'cheer', at: desk.standSpot, approach: desk.approach, facing: seatFacing + 0.6, pose: 'cheer', chairBack: true, screen: 'game' }; break;
        case 'sleep': p = seat('sleep_desk', 'idle'); break;
        case 'phone': p = seat('sit_phone', 'idle'); break;
        case 'snack': {
          const i = Object.keys(this.actions).indexOf(m.id) % 3;
          p = { key: 'snack', at: this.office.spots.snack[i], approach: 'SN', facing: Math.PI, pose: 'drink', cup: true, screen: 'idle' };
          break;
        }
        case 'toilet': p = { key: 'out', hidden: true, screen: 'idle' }; break;
        case 'board': {
          const at = this.office.spots.whiteboard(act.slot);
          p = { key: `board${act.slot}`, at, approach: 'WB', facing: Math.atan2(-7 - at.x, -1.6 - at.z), pose: act.slot === 0 ? 'chat' : 'watch', screen: 'game' };
          break;
        }
        case 'visit': {
          const hd = this.deskOf[act.host];
          const at = hd.standSpot.clone().add(new THREE.Vector3(0.75, 0, 0.55));
          p = { key: `visit:${act.host}`, at, approach: hd.approach, facing: Math.atan2(hd.standSpot.x - at.x, hd.standSpot.z - at.z), pose: 'chat', screen: 'idle' };
          break;
        }
        case 'host': {
          const at = desk.standSpot.clone().add(new THREE.Vector3(0.1, 0, 0.25));
          p = { key: `host:${act.guest}`, at, approach: desk.approach, facing: 0.9, pose: 'chat', chairBack: true, screen: 'game' };
          break;
        }
      }
    }
    if (!p) {
      switch (kind) {
        case 'absent': case 'lunch_out': case 'toilet':
          p = { key: 'out', hidden: true, screen: kind === 'toilet' || kind === 'lunch_out' ? 'idle' : m.activity.label === '已下班' ? 'standby' : 'off' };
          break;
        case 'solo': case 'duo': case 'training': p = seat('sit_play', m.id.length % 2 ? 'game' : 'game2'); break;
        case 'team': case 'match': p = seat('sit_play', 'game', true); break;
        case 'slack_phone': p = seat('sit_phone', 'idle'); break;
        case 'slack_stream': p = seat('sit_relax', 'stream'); break;
        case 'lunch_in': p = seat('sit_eat', 'stream'); break;
        case 'nap_desk': p = seat('sleep_desk', 'idle'); break;
        case 'nap_sofa': p = { key: 'sofa', at: this.office.spots.sofa, approach: 'SO', facing: Math.PI / 2, pose: 'lie', screen: 'idle' }; break;
        case 'snack': p = { key: 'snack', at: this.office.spots.snack[this.world.members.indexOf(m) % 3], approach: 'SN', facing: Math.PI, pose: 'drink', cup: true, screen: 'idle' }; break;
        case 'sub': {
          const at = new THREE.Vector3(-0.45, 0, 0.75);
          p = { key: 'sub', at, approach: 'B1', facing: Math.PI, pose: 'watch', screen: 'off' };
          break;
        }
        case 'chat': {
          const host = m.activity.host === m.id;
          const at = this.office.spots.chat[host ? 0 : 1];
          p = { key: `chat:${host}`, at, approach: 'CH', facing: host ? Math.PI / 2 : -Math.PI / 2, pose: 'chat', screen: 'idle' };
          break;
        }
        default: p = seat('sit_play', 'game');
      }
    }

    // 道具与显示器
    c.headset.visible = !!p.headset;
    c.phone.visible = p.pose === 'sit_phone';
    c.cup.visible = !!p.cup;
    this.setScreen(desk, p.screen);
    desk.chairTarget = p.chairBack ? desk.chairBaseZ + 0.35 : p.key.startsWith('desk') ? desk.chairBaseZ : desk.chairBaseZ + 0.15;
    c.setStatusIcon(act ? ACTION_ICON[act.type] || '💬' : STATUS_ICON[kind] || '');

    if (this.place[m.id] === p.key) return;
    const prevKey = this.place[m.id];
    this.place[m.id] = p.key;

    if (p.hidden) {
      if (instant || c.hidden) {
        c.setHidden(true);
        c.teleport(OUTSIDE, 0, 'stand');
        return;
      }
      const pts = route(c.pos.x, c.pos.z, 'D', OUTSIDE.x, OUTSIDE.z);
      c.walkTo(pts, 'stand', null, () => {
        if (this.place[m.id] === 'out') c.setHidden(true);
      });
      return;
    }
    if (instant) {
      c.setHidden(false);
      c.teleport(p.at, p.facing, p.pose);
      return;
    }
    if (c.hidden || prevKey === 'out') {
      // 从门外进来
      c.setHidden(false);
      c.teleport(OUTSIDE, Math.PI, 'walk');
      const pts = route(OUTSIDE.x, OUTSIDE.z, p.approach, p.at.x, p.at.z, 'D');
      c.walkTo(pts, p.pose, p.facing);
      return;
    }
    const sameSpot = c.pos.distanceTo(p.at) < 0.9;
    if (sameSpot) {
      c.path = [new THREE.Vector3(p.at.x, 0, p.at.z)];
      c.arrivePose = p.pose;
      c.arriveFacing = p.facing;
      if (c.pos.distanceTo(p.at) < 0.02) c.setPose(p.pose, p.facing);
      else c.poseName = 'walk';
      return;
    }
    // 从座位起身时先退到椅子后面，避免穿过桌子
    const start = c.poseName.startsWith('sit') || c.poseName === 'sleep_desk' || c.poseName === 'lie' ? null : undefined;
    const pts = route(c.pos.x, c.pos.z, p.approach, p.at.x, p.at.z, start === null ? this.exitNode(m.id, c) : undefined);
    c.walkTo(pts, p.pose, p.facing);
  }

  exitNode(id, c) {
    const desk = this.deskOf[id];
    if (c.pos.distanceTo(desk.seat) < 0.6) return desk.approach;
    if (c.pos.distanceTo(this.office.spots.sofa) < 0.8) return 'SO';
    return undefined;
  }

  setScreen(desk, kind) {
    const i = this.office.desks.indexOf(desk);
    if (desk.screenKind === kind) return;
    desk.screenKind = kind;
    const tex = this.screenTex[i];
    desk.screens.forEach((s) => {
      if (kind === 'off') {
        s.emissiveIntensity = 0;
        return;
      }
      if (kind === 'standby') {
        // 下班没关的显示器：暗淡的屏保
        s.emissiveMap = tex.idle;
        s.emissiveIntensity = 0.3;
        s.needsUpdate = true;
        return;
      }
      s.emissiveMap = tex[kind] || tex.idle;
      s.emissiveIntensity = kind === 'idle' ? 0.55 : 1;
      s.needsUpdate = true;
    });
  }

  update(dt, now, night) {
    const tnow = performance.now();
    for (const m of this.world.members) this.apply(m);
    for (const m of this.world.members) this.chars[m.id].update(dt, tnow);

    // 显示器补光与桌面 RGB
    const q = this.stage.quality;
    for (const d of this.office.desks) {
      const on = d.screenKind && d.screenKind !== 'off' && d.screenKind !== 'standby';
      d.screenLight.intensity = !q.screenLights ? 0 : on ? 0.9 + night * 3.2 : d.screenKind === 'standby' ? night * 1.1 : 0;
      d.screenLight.color.setHex(d.screenKind === 'stream' ? 0xc6a2ff : 0x9cc2ff);
      d.rgbMat.emissiveIntensity = on ? 0.9 : 0.15;
      d.kbGlow.emissiveIntensity = on ? 0.5 : 0.05;
      if (d.lamp) d.lamp.mat.emissiveIntensity = on && night > 0.3 ? 2 : 0;
      // 椅子推拉、拍桌震动
      d.chair.position.z += ((d.chairTarget ?? d.chairBaseZ) - d.chair.position.z) * Math.min(1, dt * 5);
      if (d.jiggle > 0) {
        d.jiggle = Math.max(0, d.jiggle - dt * 3);
        const j = Math.sin(tnow * 0.08) * 0.012 * d.jiggle;
        for (const g of d.monitorGroups) g.position.y = 0.77 + Math.abs(j);
      }
    }
    // 有人经过时开门
    const nearDoor = Object.values(this.chars).some((c) => Math.hypot(c.pos.x - NODES.D[0], c.pos.z - (NODES.D[1] - 0.6)) < 1.25 && (c.path.length || !c.hidden));
    const dp = this.office.doorPivot;
    dp.rotation.y += ((nearDoor ? -1.35 : 0) - dp.rotation.y) * Math.min(1, dt * 4);
    // 墙钟
    const h = (now.minuteOfDay / 60) % 12;
    this.office.clock.hourHand.rotation.z = -(h / 12) * Math.PI * 2;
    this.office.clock.minHand.rotation.z = -((now.minuteOfDay % 60) / 60) * Math.PI * 2;
    // 拍桌镜头轻震
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      this.stage.camera.position.y += Math.sin(tnow * 0.09) * 0.02 * this.shake;
    }
  }
}

// 从文案里抽取"某人：“台词”"
function extractQuotes(text, world) {
  const out = [];
  const re = /([一-龥]{2})[：:]\s*["“「]([^"”」]{1,40})["”」]/g;
  let m;
  let order = 0;
  while ((m = re.exec(text))) {
    const mem = world.byName[m[1]];
    if (mem) out.push({ id: mem.id, text: m[2], order: order++ });
  }
  return out;
}
