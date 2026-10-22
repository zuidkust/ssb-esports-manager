// 入口：把时钟、日常模拟、3D 场景、界面和存档串起来
import './style.css';
import { dayInfo, MATCH_MINUTE, nextMatch, PREMATCH_MINUTE } from './core/calendar';
import { fmtHM, GameClock, SPEEDS, sunPosition, type SpeedId } from './core/clock';
import { TIER_CN } from './data/leagues';
import { POSITIONS, POSITION_CN } from './data/roster';
import { SaveError } from './save/migrate';
import { createWebPlatform } from './save/platform';
import { SaveManager, SLOTS, type SlotId } from './save/saves';
import { createNewGame, type GameState } from './save/state';
import { World } from './sim/world';
import { Director } from './scene/director';
import { Lighting } from './scene/lighting';
import { buildOffice } from './scene/office';
import { detectQuality, Stage } from './scene/stage';
import { ROSTER } from './data/roster';
import { Board } from './ui/board';
import { Card } from './ui/card';

const params = new URLSearchParams(location.search);
const $ = (id: string) => document.getElementById(id)!;
const AUTOSAVE_SECONDS = 60;
const VENUE_CN = ['网吧角落', '小办公室', '电竞基地', '豪华基地'];

// ───────── 平台与存档 ─────────
const platform = createWebPlatform();
const saves = new SaveManager(platform.store);

// ───────── 场景 ─────────
const quality = detectQuality(params.get('q'));
const stage = new Stage($('stage'), quality);
stage.sidePanel = innerWidth > 1180 ? 400 : 336;
stage.resize();
const office = buildOffice(stage.scene, ROSTER);
const lighting = new Lighting(stage.scene, office, quality);

let state: GameState = createNewGame();
const world = new World(state);
let clock = new GameClock(state.clock);
const director = new Director(stage, office, world);
const board = new Board((id) => select(id, true));
const card = new Card(() => select(null));
world.onLog(() => board.set(state.eventLog));

let selected: string | null = null;
function select(id: string | null, focus = false) {
  selected = id;
  for (const m of world.members) director.chars[m.id].tagEl.classList.toggle('selected', m.id === id);
  if (!id) return card.el.classList.add('hidden');
  card.open(id);
  card.render(world);
  const c = director.chars[id];
  if (focus && !c.hidden) stage.focusOn(c.pos);
}
stage.onPick = (id) => id && select(id);
document.addEventListener('click', (e) => {
  const tag = (e.target as HTMLElement).closest<HTMLElement>('.name-tag');
  if (tag) select(tag.dataset.memberId!);
});

// 开始 / 读入一局
function startGame(s: GameState, note?: string) {
  live = true;
  state = s;
  clock = new GameClock(s.clock);
  world.reset(s);
  world.update(clock.minute, 0, true);
  director.snapAll();
  board.set(s.eventLog);
  select(null);
  if (note) toast(note);
  if (!s.eventLog.length) world.log('剧情', '老板盘下了网吧角落的几台机器，SSB 战队今天正式成立。目标：打出网吧联赛。', []);
}

// 标题画面背后跑的是一局占位世界，玩家选好“继续 / 新游戏”之前不写存档
let live = false;

function persist(slot: SlotId) {
  if (!live) return false;
  state.clock = clock.snapshot();
  try {
    saves.save(slot, state);
    return true;
  } catch (e) {
    toast(`保存失败：${(e as Error).message}`);
    return false;
  }
}

// ───────── 主循环 ─────────
let last = performance.now();
let sinceAutosave = 0;
let fpsFrames = 0, fpsTime = 0, degraded = false;
const handledHolds = new Set<string>();

function frame(t: number) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  const info = dayInfo(clock.day);
  const stops = info.round != null ? [PREMATCH_MINUTE] : [];
  const r = clock.tick(modalOpen ? 0 : dt, stops);
  state.clock = clock.snapshot();
  world.update(clock.minute, r.advanced, false);

  // 比赛日 18:30 自动暂停：赛前选首发和战术
  const holdId = `match-${clock.day}`;
  if (info.round != null && Math.abs(clock.minute - PREMATCH_MINUTE) < 0.01 && !handledHolds.has(holdId)) {
    handledHolds.add(holdId);
    clock.hold(holdId, '比赛日：等老板确认首发');
    showPrematch(holdId);
  }
  if (r.newDay) {
    persist('auto');
    sinceAutosave = 0;
  }
  sinceAutosave += dt;
  if (sinceAutosave > AUTOSAVE_SECONDS && !clock.paused) {
    persist('auto');
    sinceAutosave = 0;
  }

  lighting.update({ sun: sunPosition(clock.minute), present: world.presentCount() });
  director.update(dt, clock.minute, lighting.night);
  stage.render(dt, lighting.night);
  updateHud();

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime > 4) {
    if (fpsFrames / fpsTime < 28 && !degraded) {
      degraded = true;
      stage.degrade();
      toast('帧率偏低，已自动切换到流畅画质');
    }
    fpsFrames = fpsTime = 0;
  }
  requestAnimationFrame(frame);
}

// ───────── 顶部信息与时间控制 ─────────
let hudTick = 0;
function updateHud() {
  $('clockTime').textContent = fmtHM(clock.minute);
  const now = performance.now();
  if (now - hudTick < 250) return;
  hudTick = now;
  const info = dayInfo(clock.day);
  $('clockDate').textContent = `第 ${info.season} 赛季 · 第 ${info.dayInSeason} 天 · ${info.weekdayCn}`;
  $('brandSub').textContent = `${VENUE_CN[state.venueLevel]} · ${TIER_CN[state.season.tier]}`;
  $('phaseChip').textContent = clock.night ? '夜里 · 快进中' : `${world.segment(clock.minute).name} · 在岗 ${world.presentCount()}/6`;
  const nm = nextMatch(clock.day, clock.minute);
  const opp = nm ? world.opponentToday() : null;
  const inMatch = info.round != null && clock.minute >= MATCH_MINUTE && world.members.some((m) => m.activity.kind === 'match');
  $('matchChip').textContent = inMatch
    ? `比赛中 · 第 ${info.round} 轮 vs ${world.opponentToday()?.name}`
    : info.offseason
    ? `休赛期 · 还有 ${nm ? nm.inDays : '?'} 天开赛`
    : nm && nm.inDays === 0 && opp
      ? `今晚 19:00 第 ${nm.round} 轮 · vs ${opp.name}`
      : nm ? `下一场：${nm.inDays} 天后 · 第 ${nm.round} 轮` : '—';
  document.querySelectorAll<HTMLElement>('#speeds button').forEach((b) => b.classList.toggle('on', b.dataset.s === clock.speed && !clock.paused));
  $('pauseBtn').textContent = clock.paused ? '▶' : '⏸';
  $('pauseBtn').classList.toggle('on', clock.manualPause);
  const holds = clock.holdReasons;
  $('holdBanner').classList.toggle('hidden', !holds.length);
  $('holdBanner').textContent = `⏸ 自动暂停：${holds.join('；')}`;
  if (selected) card.render(world);
  const rows = [...world.members].sort((a, b) => b.slackMin - a.slackMin).slice(0, 5).map((m) => ({ name: m.name, minutes: m.slackMin }));
  office.wb.draw({
    title: '摸鱼排行榜',
    rows,
    date: `第 ${info.dayInSeason} 天 ${info.weekdayCn}`,
    footer: info.round != null ? '今晚比赛！全员不许摸鱼' : nm ? `距下一场还有 ${nm.inDays} 天 · 别摸了` : '休赛期',
  });
}

$('speeds').innerHTML = (Object.keys(SPEEDS) as SpeedId[]).map((s) => `<button data-s="${s}">${SPEEDS[s].label}</button>`).join('');
$('speeds').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (b) clock.setSpeed(b.dataset.s as SpeedId);
});
$('pauseBtn').addEventListener('click', () => clock.togglePause());
$('menuBtn').addEventListener('click', () => showMenu());
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === 'Escape') return modalOpen ? closeModal() : showMenu();
  if (modalOpen) return;
  if (e.key === ' ') {
    e.preventDefault();
    clock.togglePause();
  } else if (e.key === '1') clock.setSpeed('x1');
  else if (e.key === '2') clock.setSpeed('x3');
  else if (e.key === '3') clock.setSpeed('x10');
});
addEventListener('beforeunload', () => persist('auto'));

// ───────── 弹窗 ─────────
let modalOpen = false;
let modalClosable = true;
function openModal(html: string, closable = true) {
  modalOpen = true;
  modalClosable = closable;
  $('modalBody').innerHTML = html;
  $('modal').classList.remove('hidden');
}
function closeModal() {
  if (!modalClosable) return;
  modalOpen = false;
  $('modal').classList.add('hidden');
}
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal')) closeModal();
});

const storageWarning = () =>
  platform.persistent
    ? '<p class="sub">存档保存在这个浏览器里。换浏览器、清缓存会丢失，重要进度请“导出存档”到文件。</p>'
    : '<div class="warn">当前浏览器不允许本地存储（可能是隐私模式或直接双击打开的页面受限）。关闭页面进度就会丢，请用“导出存档”保存到文件。</div>';

function slotRows(mode: 'menu' | 'title') {
  return saves
    .list()
    .map((i) => {
      const name = i.slot === 'auto' ? '自动存档' : `存档 ${i.slot}`;
      const when = i.savedAt ? new Date(i.savedAt).toLocaleString('zh-CN', { hour12: false }) : '';
      const canSave = mode === 'menu' && i.slot !== 'auto';
      return `<div class="slot"><b>${name}</b><div>${i.label}<small>${i.broken ?? when}</small></div>
        ${canSave ? `<button class="btn" data-save="${i.slot}">保存</button>` : '<span></span>'}
        <button class="btn" data-load="${i.slot}" ${i.empty || i.broken ? 'disabled' : ''}>读取</button></div>`;
    })
    .join('');
}

function bindSlots(after: () => void) {
  $('modalBody').querySelectorAll<HTMLElement>('[data-save]').forEach((b) =>
    b.addEventListener('click', () => {
      if (persist(b.dataset.save as SlotId)) toast(`已保存到存档 ${b.dataset.save}`);
      after();
    }),
  );
  $('modalBody').querySelectorAll<HTMLElement>('[data-load]').forEach((b) =>
    b.addEventListener('click', () => {
      try {
        const s = saves.load(b.dataset.load as SlotId);
        if (s) {
          modalClosable = true;
          closeModal();
          startGame(s, '已读取存档');
        }
      } catch (e) {
        toast(`读取失败：${(e as Error).message}`);
      }
    }),
  );
}

async function importSave() {
  const text = await platform.pickTextFile();
  if (text == null) return;
  try {
    const s = SaveManager.importText(text);
    modalClosable = true;
    closeModal();
    startGame(s, '已导入存档');
    persist('auto');
  } catch (e) {
    toast(e instanceof SaveError ? `导入失败：${e.message}` : '导入失败：文件无法识别');
  }
}

function showMenu() {
  openModal(`
    <h2>存档</h2>
    ${storageWarning()}
    <h3>存档槽位</h3>${slotRows('menu')}
    <div class="row">
      <button class="btn" id="mExport">导出存档到文件</button>
      <button class="btn" id="mImport">从文件导入</button>
    </div>
    <div class="row">
      <button class="btn ghost" id="mNew">重新开始</button>
      <button class="btn accent" id="mClose">继续游戏</button>
    </div>`);
  bindSlots(showMenu);
  $('mExport').addEventListener('click', () => {
    state.clock = clock.snapshot();
    platform.downloadText(SaveManager.exportFilename(state), SaveManager.exportText(state));
  });
  $('mImport').addEventListener('click', importSave);
  $('mClose').addEventListener('click', closeModal);
  $('mNew').addEventListener('click', () => {
    if (!confirm('重新开始一局？当前进度会先存进自动存档。')) return;
    persist('auto');
    closeModal();
    startGame(createNewGame(), '新的一局开始了');
  });
}

function showTitle() {
  const latest = saves.latest();
  openModal(
    `
    <div class="logo title-logo">S</div>
    <h2>SSB电竞经理</h2>
    <p class="sub">网页试玩版 · M1（日常与时间系统）</p>
    <p>你是 SSB 战队的老板兼经理。六个朋友在网吧角落开始打联赛：白天训练、摸鱼、吃外卖，比赛日晚上 19:00 开打。</p>
    ${storageWarning()}
    <div class="row">
      <button class="btn accent" id="tContinue" ${latest ? '' : 'disabled'}>继续游戏</button>
      <button class="btn" id="tNew">新游戏</button>
      <button class="btn" id="tImport">导入存档</button>
    </div>
    ${latest ? `<h3>全部存档</h3>${slotRows('title')}` : ''}
    <p class="sub" style="margin-top:14px">操作：空格 暂停 · 1/2/3 切换速度 · Esc 存档菜单 · 拖动旋转、滚轮缩放 · 点人物看卡片</p>`,
    false,
  );
  bindSlots(showTitle);
  $('tContinue').addEventListener('click', () => {
    const s = latest && saves.load(latest);
    if (!s) return;
    modalClosable = true;
    closeModal();
    startGame(s, '欢迎回来');
  });
  $('tNew').addEventListener('click', () => {
    modalClosable = true;
    closeModal();
    startGame(createNewGame(), '新的一局开始了');
    persist('auto');
  });
  $('tImport').addEventListener('click', importSave);
}

// 赛前（18:30）：M1 只展示自动首发；M3 改成老板手动选首发和战术
function showPrematch(holdId: string) {
  const opp = world.opponentToday();
  const info = dayInfo(clock.day);
  const starters = world.starters.map((id) => world.byId[id]);
  const bench = world.members.filter((m) => !world.starters.includes(m.id));
  openModal(
    `
    <h2>比赛日 · 第 ${info.round} 轮</h2>
    <p>${TIER_CN[state.season.tier]} · 19:00 vs <b>${opp?.name}</b>（${opp?.blurb}）</p>
    <h3>首发</h3>
    <div class="lineup">${starters.map((m, i) => `<div>${m.name}<small>${POSITION_CN[POSITIONS[i]]}</small></div>`).join('')}</div>
    <p class="sub">台下第二解说：${bench.map((m) => m.name).join('、')}</p>
    <p class="sub">选首发、选战术和比赛直播在 M3 实装；现在先按状态自动排首发。</p>
    <div class="row"><button class="btn accent" id="pmOk">确认首发，开赛</button></div>`,
    false,
  );
  $('pmOk').addEventListener('click', () => {
    clock.release(holdId);
    modalClosable = true;
    closeModal();
  });
}

let toastTimer = 0;
function toast(msg: string) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2600);
}

// ───────── 启动 ─────────
startGame(state);
// 调试 / 截图用：?day=2&t=14:50 直接跳到某个时刻；?skip=1 跳过标题
if (params.get('day') || params.get('t')) {
  const [h, m] = (params.get('t') ?? '10:00').split(':').map(Number);
  const s = createNewGame(+(params.get('seed') ?? 7));
  s.clock.day = +(params.get('day') ?? 1);
  s.clock.minute = h * 60 + (m || 0);
  startGame(s);
}
if (params.get('speed')) clock.setSpeed(params.get('speed') as SpeedId);
if (!params.get('skip') && !params.get('t')) {
  live = false;
  showTitle();
}
requestAnimationFrame((t) => {
  last = t;
  requestAnimationFrame(frame);
  setTimeout(() => $('boot').classList.add('done'), 200);
});
if (params.get('card')) setTimeout(() => select(params.get('card')), 500);
if (params.get('paused')) clock.togglePause();

(window as unknown as { __ssb: unknown }).__ssb = { world, get clock() { return clock; }, get state() { return state; }, saves, director, stage, select, SLOTS };
