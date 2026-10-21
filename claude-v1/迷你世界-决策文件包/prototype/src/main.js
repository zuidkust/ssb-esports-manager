// 入口：把时钟、模拟器、3D 舞台、导演层和界面串起来
import { WorldClock, sunPosition, fmtHM } from './world/clock.js';
import { World } from './engine/simulator.js';
import { createMatch } from './engine/match.js';
import { Stage, detectQuality } from './scene/stage.js';
import { buildOffice } from './scene/office.js';
import { Lighting } from './scene/lighting.js';
import { Director } from './scene/director.js';
import { Board } from './ui/board.js';
import { Card } from './ui/card.js';
import { MatchPanel } from './ui/matchPanel.js';
import { MEMBERS, MATCH_WEEKDAY } from './config.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ───────── 初始化 ─────────
const clock = new WorldClock();
const world = new World();
const quality = detectQuality();
const stage = new Stage($('stage'), quality);
const office = buildOffice(stage.scene, MEMBERS);
const lighting = new Lighting(stage.scene, office, quality);
const director = new Director(stage, office, world);

let selected = null;
const card = new Card({ onClose: () => select(null) });
const board = new Board({ onMember: (id) => select(id, true) });
const matchPanel = new MatchPanel({ onClose: () => stopMatch() });

function select(id, focus = false) {
  selected = id;
  for (const m of world.members) director.chars[m.id].tagEl.classList.toggle('selected', m.id === id);
  if (!id) {
    card.el.classList.add('hidden');
    card.memberId = null;
    return;
  }
  card.open(id);
  if (innerWidth > 760) $('review').classList.add('collapsed');
  card.render(world, director, world.log);
  const c = director.chars[id];
  if (focus && !c.hidden) stage.focusOn(c.pos);
  $('board').classList.remove('open');
}
stage.onPick = (id) => (id ? select(id) : null);
document.addEventListener('click', (e) => {
  const tag = e.target.closest('.name-tag');
  if (tag) select(tag.dataset.memberId);
});

// 事件 → 事件板 + 画面动作 + 定格
world.onEvent((entry, opts) => {
  if (opts.silent) {
    board.entries.unshift(entry);
    if (entry.level === '重大') board.pins.unshift(entry);
    return;
  }
  board.add(entry);
  director.onEvent(entry);
  // 等人物动起来再截一张定格
  setTimeout(() => stage.requestSnapshot((url) => {
    entry.snap = url;
    board.refresh(entry.uid);
  }), 1600);
  if (selected && entry.participants.some((p) => p.id === selected)) card.render(world, director, world.log);
});

// ───────── 审核链接参数：?t=08:30&wd=3&speed=60&match=1&card=shidian&q=low ─────────
if (params.get('wd')) clock.setWeekday(+params.get('wd'));
if (params.get('t')) {
  const [h, m] = params.get('t').split(':').map(Number);
  clock.setMinuteOfDay(h * 60 + (m || 0));
  clock.setSpeed(+(params.get('speed') ?? 1));
}

let now = clock.now();
world.backfill(now);
board.pins = board.pins.slice(0, 2);
board.render();
director.snapAll();

// ───────── 主循环 ─────────
let last = performance.now();
let simAcc = 0;
let nextEventAt = performance.now() + 2500;
let lastMinute = now.minuteOfDay;
let lastDay = now.dateKey;
let fpsFrames = 0, fpsTime = 0, degraded = false;

function scheduleNextEvent() {
  const fast = clock.speed >= 60;
  nextEventAt = performance.now() + (fast ? 1800 + Math.random() * 1500 : 4200 + Math.random() * 3500);
}

function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  now = clock.now();

  // 时间跳变（拖动滑杆、切换星期）：画面直接瞬移到位
  const jumped = now.dateKey !== lastDay || Math.abs(now.minuteOfDay - lastMinute) > 20;
  simAcc += dt;
  if (simAcc > 0.25 || jumped) {
    world.update(now, simAcc);
    simAcc = 0;
  }
  if (jumped) {
    director.snapAll();
    stage.focusTarget = null;
  }
  lastMinute = now.minuteOfDay;
  lastDay = now.dateKey;

  // 随机事件（比赛直播期间暂停）
  if (!matchState && t > nextEventAt) {
    world.generate(now);
    scheduleNextEvent();
  }
  if (matchState) tickMatch(t);

  lighting.update({ sun: sunPosition(now.ms), present: world.presentCount() });
  director.update(dt, now, lighting.night);
  stage.render(dt, lighting.night);
  updateHud(t);

  // 帧率持续过低时自动降级（关闭辉光、降分辨率）
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime > 4) {
    const fps = fpsFrames / fpsTime;
    if (fps < 28 && !degraded) {
      degraded = true;
      stage.composer = null;
      stage.bloom = null;
      stage.renderer.setPixelRatio(1);
      stage.resize();
      toast('帧率偏低，已自动切换到流畅画质');
    }
    fpsFrames = 0;
    fpsTime = 0;
  }
  requestAnimationFrame(frame);
}

// ───────── 顶部信息 ─────────
let hudTick = 0;
let viewers = 1200 + Math.floor(Math.random() * 300);
function updateHud(t) {
  const s = clock.speed > 1 ? '' : `:${String(now.second).padStart(2, '0')}`;
  $('clockTime').textContent = fmtHM(now.minuteOfDay) + s;
  if (t - hudTick < 500) return;
  hudTick = t;
  $('clockDate').textContent = `${now.month}月${now.day}日 ${now.weekdayCn} · 北京时间`;
  const badge = $('liveBadge');
  badge.textContent = clock.live ? '● 实时' : clock.speed === 1 ? '◆ 审核模式' : `◆ 审核模式 ×${clock.speed}`;
  badge.classList.toggle('review', !clock.live);
  $('phaseChip').textContent = world.officePhase(now) + ` · 在岗 ${world.presentCount()}/6`;
  $('statusChip').textContent = world.dayStatus(now);
  viewers = Math.max(600, viewers + Math.round((Math.random() - 0.48) * 12));
  $('viewerChip').textContent = `👀 ${viewers.toLocaleString()} 人在围观`;
  if (selected) card.render(world, director, world.log);
  // 白板：摸鱼排行榜
  const rows = [...world.members].sort((a, b) => b.today.slackMin - a.today.slackMin).slice(0, 5).map((m) => ({ name: m.name, minutes: m.today.slackMin }));
  const d = world.daysToMatch(now);
  office.wb.draw({ rows, date: `${now.month}/${now.day} ${now.weekdayCn}`, footer: d === 0 ? '今天周赛！全员不许摸鱼' : `距周赛还有 ${d} 天 · 别摸了` });
  syncReview();
}

// ───────── 周赛文字直播（演示） ─────────
let matchState = null;
function startMatch() {
  if (matchState) return;
  const opponent = world.opponentFor(now);
  const script = createMatch(world, now, opponent);
  world.match = { running: true, opponent, starters: script.starters, behind: false };
  matchState = { script, i: 0, nextAt: performance.now() + 1200, done: false, startMin: Math.floor(now.minuteOfDay) };
  $('review').classList.add('collapsed');
  matchPanel.show(script);
  board.divider(`周赛开打 · vs ${opponent.name}`);
  world.update(now, 0);
  director.snapAll();
  $('board').classList.remove('open');
}

function tickMatch(t) {
  const s = matchState;
  if (s.done || t < s.nextAt) return;
  const line = s.script.lines[s.i++];
  if (!line) {
    s.done = true;
    setTimeout(() => {
      if (matchState === s) stopMatch(true);
    }, 9000);
    return;
  }
  world.match.behind = line.gold < -2000;
  matchPanel.push(line);
  const level = line.final ? '重大' : line.highlight ? '剧情' : line.phase === '开赛' && s.i === 1 ? '重大' : '有趣';
  const entry = {
    uid: world.uid++, at: now.ms, time: fmtHM(s.startMin + line.min), level, category: '比赛', matchLine: true, tone: line.tone,
    eventId: null, name: line.final ? (line.win ? '周赛胜利' : '周赛落败') : line.phase === '开赛' ? '周赛开打' : line.phase, text: `${line.phase === '赛后' ? '' : `[${String(line.min).padStart(2, '0')}'] `}${line.text}`,
    participants: line.actors.map((id) => ({ id, name: world.byId[id].name })), effects: [], cause: null, next: [],
  };
  world.log.unshift(entry);
  board.add(entry);
  // 画面反应
  const until = performance.now() + 5000;
  if (line.final) {
    for (const id of s.script.starters) director.actions[id] = { type: line.win ? 'cheer' : 'sleep', until: until + 4000 };
    if (line.win) director.actions[s.script.subId] = { type: 'cheer', until: until + 4000 };
  } else if (line.tone === 'good' && line.highlight) {
    for (const id of s.script.starters) director.actions[id] = { type: 'cheer', until };
  } else if (line.tone === 'bad' && line.actors.length === 1) {
    director.actions[line.actors[0]] = { type: 'rage', until: until - 1500 };
  }
  for (const id of line.actors) {
    const q = line.text.match(/[：:]["“]([^"”]{1,30})["”]/);
    if (q && line.text.startsWith(world.byId[id].name)) director.chars[id].say(q[1], 4500);
  }
  for (const m of world.members) director.place[m.id] = null;
  s.nextAt = t + (line.highlight ? 5200 : 3600);
}

function stopMatch(natural = false) {
  if (!matchState) return;
  matchState = null;
  world.match = null;
  matchPanel.hide();
  if (!natural) board.divider('（演示中止）');
  director.actions = {};
  world.update(now, 0);
  director.snapAll();
  scheduleNextEvent();
}

// ───────── 审核工具 ─────────
const PRESETS = [
  { icon: '🌅', name: '早晨', t: 8 * 60 + 25 },
  { icon: '☀️', name: '正午', t: 12 * 60 + 48 },
  { icon: '🌇', name: '傍晚', t: 17 * 60 + 35 },
  { icon: '🌙', name: '夜晚', t: 22 * 60 + 12 },
];
$('presets').innerHTML = PRESETS.map((p, i) => `<button class="preset" data-i="${i}"><span class="pi">${p.icon}</span><b>${p.name}</b><small>${fmtHM(p.t)}</small></button>`).join('');
$('presets').addEventListener('click', (e) => {
  const b = e.target.closest('.preset');
  if (!b) return;
  jumpTo(PRESETS[+b.dataset.i].t);
});
const slider = $('timeSlider');
slider.addEventListener('input', () => {
  clock.setMinuteOfDay(+slider.value);
  if (clock.speed > 1) clock.setSpeed(clock.speed);
});
slider.addEventListener('change', () => board.divider(`审核：时间调到 ${fmtHM(+slider.value)}`));

const WD = ['一', '二', '三', '四', '五', '六', '日'];
$('weekdays').innerHTML = WD.map((w, i) => `<button data-wd="${i + 1}" class="${i + 1 === MATCH_WEEKDAY ? 'match' : ''}" title="${i + 1 === MATCH_WEEKDAY ? '周赛日' : ''}">周${w}</button>`).join('');
$('weekdays').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  clock.setWeekday(+b.dataset.wd);
  board.divider(`审核：切换到周${WD[+b.dataset.wd - 1]}`);
});

const SPEEDS = [[1, '1×'], [60, '60×'], [600, '600×']];
$('speeds').innerHTML = SPEEDS.map(([v, l]) => `<button data-s="${v}">${l}</button>`).join('');
$('speeds').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  clock.setSpeed(+b.dataset.s);
  scheduleNextEvent();
});
$('liveBtn').addEventListener('click', () => {
  clock.goLive();
  board.divider('回到实时');
});
$('genBtn').addEventListener('click', () => {
  if (!world.generate(now)) toast('办公室里没人，没有事件可以发生');
});
$('matchBtn').addEventListener('click', () => (matchState ? stopMatch() : startMatch()));
$('reviewToggle').addEventListener('click', () => $('review').classList.toggle('collapsed'));
$('reviewFab').addEventListener('click', () => $('review').classList.toggle('mobile-open'));

function jumpTo(min) {
  clock.setMinuteOfDay(min);
  board.divider(`审核：时间调到 ${fmtHM(min)}`);
}

function syncReview() {
  if (document.activeElement !== slider) slider.value = Math.floor(now.minuteOfDay);
  document.querySelectorAll('#weekdays button').forEach((b) => b.classList.toggle('on', +b.dataset.wd === now.weekday));
  document.querySelectorAll('#speeds button').forEach((b) => b.classList.toggle('on', +b.dataset.s === clock.speed));
  document.querySelectorAll('.preset').forEach((b) => b.classList.toggle('on', Math.abs(PRESETS[+b.dataset.i].t - now.minuteOfDay) < 30));
  $('matchBtn').textContent = matchState ? '■ 结束直播' : '▶ 周赛文字直播（演示）';
}

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ───────── 启动 ─────────
scheduleNextEvent();
requestAnimationFrame((t) => {
  last = t;
  requestAnimationFrame(frame);
  setTimeout(() => $('boot').classList.add('done'), 300);
});
if (params.get('match')) setTimeout(startMatch, 600);
if (params.get('card')) setTimeout(() => select(params.get('card')), 800);
if (params.get('review') === '0') $('review').classList.add('collapsed');
if (params.get('drawer') === '1') $('board').classList.add('open');

// 调试/截图用
window.__mw = { world, clock, director, stage, board, startMatch, select };
