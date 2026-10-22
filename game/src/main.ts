// 入口：把时钟、日常模拟、3D 场景、界面和存档串起来
import './style.css';
import { dayInfo, MATCH_MINUTE, nextMatch, opponentForRound, PREMATCH_MINUTE } from './core/calendar';
import { fmtHM, GameClock, SPEEDS, sunPosition, type SpeedId } from './core/clock';
import { hashString } from './core/rng';
import { drainRealtime, simBudget } from './core/realtime';
import { actionPointLabel } from './sim/actions';
import { allFacilitiesUpTo, VENUE_CN } from './data/facilities';
import { TIER_CN } from './data/leagues';
import type { TacticId } from './data/tactics';
import { SaveError } from './save/migrate';
import { createWebPlatform } from './save/platform';
import { formatWallTime, SaveManager, SLOTS, type SlotId } from './save/saves';
import { createNewGame, needsLineupConfirm, type GameState } from './save/state';
import { World } from './sim/world';
import { Director } from './scene/director';
import { Lighting } from './scene/lighting';
import { detectQuality, Stage } from './scene/stage';
import { buildVenue, venueKey, type Venue } from './scene/venue';
import { ROSTER } from './data/roster';
import { Board } from './ui/board';
import { Card } from './ui/card';
import { bindManage, manageHtml } from './ui/manage';
import { buyFacility } from './sim/economy';
import { retuneActionPoints } from './sim/offseason';
import { applyGameLoad, catchUpThrough, commitRound, needsBroadcast, needsIntermission, ourRank, roundSettled, winsNeeded } from './sim/league';
import { commitWorldRound, needsWorldBroadcast, needsWorldPrematch, playerWorldOpponent, playerWorldPending, WORLD_ROUND_CN } from './sim/worldcup';
import { benchOf, validLineup } from './sim/lineup';
import { playOurMatch } from './sim/matchprep';
import { cuesFrom } from './sim/script';
import { mountBroadcast } from './ui/broadcast';
import { bindPrematch, prematchHtml, standingsTableHtml } from './ui/prematch';
import { makeRng } from './engine/match';
import { mountGodPanel } from './debug/panel';
import { bindBracket, bindEnding, bindOffseason, bindSettlement, bracketHtml, endingHtml, offseasonHtml, settlementHtml } from './ui/season';

const params = new URLSearchParams(location.search);
const $ = (id: string) => document.getElementById(id)!;
const AUTOSAVE_SECONDS = 60;

// ───────── 平台与存档 ─────────
const platform = createWebPlatform();
const saves = new SaveManager(platform.store);

// ───────── 场景 ─────────
const quality = detectQuality(params.get('q'));
const stage = new Stage($('stage'), quality);
stage.sidePanel = innerWidth > 1180 ? 400 : 336;
stage.resize();
let state: GameState = createNewGame();
const world = new World(state);
let clock = new GameClock(state.clock);
let venue: Venue = buildVenue(stage.scene, state.venueLevel, ROSTER, world.facilities);
let venueId = venueKey(state.venueLevel, world.facilities);
const lighting = new Lighting(stage.scene, venue, quality);
const director = new Director(stage, venue, world);

// 场景按场地等级选，设施按已购买显示；场地或设施变了就重建场景（人物保留）
function syncVenue() {
  const id = venueKey(state.venueLevel, world.facilities);
  if (id === venueId) return;
  venue.root.removeFromParent();
  venue = buildVenue(stage.scene, state.venueLevel, ROSTER, world.facilities);
  venueId = id;
  lighting.office = venue;
  director.setVenue(venue);
  director.snapAll();
}
const board = new Board((id) => select(id, true));
const card = new Card(() => select(null));
world.onLog(() => board.set(state.eventLog));

let selected: string | null = null;
function select(id: string | null, focus = false) {
  if (id && !world.byId[id]) return;
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
  haltBroadcast();
  live = true;
  state = s;
  clock = new GameClock(s.clock);
  world.reset(s);
  $('brandSub').textContent = `${VENUE_CN[s.venueLevel] ?? '网吧角落'} · ${TIER_CN[s.season.tier]}`;
  $('boot').textContent = `正在布置${VENUE_CN[s.venueLevel] ?? '场地'}……`;
  syncVenue();
  world.update(clock.minute, 0, true);
  director.snapAll();
  board.set(s.eventLog);
  select(null);
  if (note) toast(note);
  checkBankrupt();
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
let simDebt = 0;
let fpsFrames = 0, fpsTime = 0, degraded = false;

function frame(t: number) {
  let raw = (t - last) / 1000;
  last = t;
  if (!Number.isFinite(raw) || raw < 0) raw = 0;
  // 画面用短步长，避免一帧卡很久时人物飞出去；时钟按真实经过的时间走，低帧率不会把一天拉长
  const visualDt = Math.min(0.05, raw);
  checkPrematch();
  const running = live && !modalOpen && !clock.paused;
  if (running) simDebt += raw;
  else simDebt = 0;
  if (simDebt > 0) {
    simDebt = drainRealtime(clock, simDebt, simBudget(simDebt), (day) => (dayInfo(day).round != null || playerWorldPending(state, day) ? [PREMATCH_MINUTE, MATCH_MINUTE] : []), (r) => {
      state.clock = clock.snapshot();
      world.update(clock.minute, r.advanced, false);
      if (r.newDay) {
        persist('auto');
        sinceAutosave = 0;
      }
      checkPrematch();
      checkBankrupt();
    });
  } else {
    state.clock = clock.snapshot();
  }
  sinceAutosave += raw;
  if (sinceAutosave > AUTOSAVE_SECONDS && live && !clock.paused) {
    persist('auto');
    sinceAutosave = 0;
  }

  lighting.update({ sun: sunPosition(clock.minute), present: world.presentCount() });
  $('nightHint').classList.toggle('hidden', !clock.night || !live);
  director.update(visualDt * (live ? clock.moveScale : 1), clock.minute, lighting.night);
  stage.render(visualDt, lighting.night);
  updateHud();

  fpsFrames++;
  fpsTime += Math.min(raw, 0.5);
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

// 比赛日 18:30 选首发和战术；19:00 起看直播。确认写进存档，暂停中关页、读档会重新弹出
function checkPrematch() {
  if (!live || state.bankrupt) return;
  state.clock.day = clock.day;
  state.clock.minute = clock.minute;
  if (state.season.report && !state.season.report.acked) {
    if (!clock.isHeld('season-end')) clock.hold('season-end', '赛季结算');
    if (!modalOpen) showSettlement();
    return;
  }
  if (state.worldCup?.champion && !state.meta.endingSeen) {
    if (!clock.isHeld('ending')) clock.hold('ending', '世界赛夺冠');
    if (!modalOpen) showEnding();
    return;
  }
  if (needsWorldPrematch(state, clock.day, clock.minute)) {
    const id = `match-${clock.day}`;
    if (!clock.isHeld(id)) clock.hold(id, '世界赛：等老板确认首发和战术');
    if (!modalOpen) showPrematch(id, false);
    return;
  }
  if (needsLineupConfirm(state, clock.day, clock.minute)) {
    const id = `match-${clock.day}`;
    if (!clock.isHeld(id)) clock.hold(id, '比赛日：等老板确认首发和战术');
    if (!modalOpen) showPrematch(id, false);
    return;
  }
  if (needsIntermission(state, clock.day, clock.minute)) {
    const id = `match-gap-${clock.day}`;
    if (!clock.isHeld(id)) clock.hold(id, '局间：可以换首发和战术');
    if (!modalOpen) showPrematch(id, true);
    return;
  }
  if (needsWorldBroadcast(state, clock.day, clock.minute)) {
    const id = `match-live-${clock.day}`;
    if (!clock.isHeld(id)) clock.hold(id, '世界赛直播');
    if (!modalOpen) showBroadcast(id);
    return;
  }
  if (needsBroadcast(state, clock.day, clock.minute)) {
    const id = `match-live-${clock.day}`;
    if (!clock.isHeld(id)) clock.hold(id, '直播中');
    if (!modalOpen) showBroadcast(id);
  }
}

// ───────── 顶部信息与时间控制 ─────────
let hudTick = 0;
let syncGod: (() => void) | null = null;
function updateHud() {
  $('clockTime').textContent = fmtHM(clock.minute);
  const now = performance.now();
  if (now - hudTick < 250) return;
  hudTick = now;
  const info = dayInfo(clock.day);
  $('clockDate').textContent = `第 ${info.season} 赛季 · 第 ${info.dayInSeason} 天 · ${info.weekdayCn}`;
  $('brandSub').textContent = `${VENUE_CN[state.venueLevel]} · ${TIER_CN[state.season.tier]}`;
  // 资源栏：M1 先显示存档里的初始值，M2 接老板动作和训练产出
  $('resCash').textContent = state.cash.toLocaleString('zh-CN');
  $('resCash').parentElement!.title = state.unpaidMonths > 0 ? `连续 ${state.unpaidMonths} 个月没发出工资` : '公司现金';
  $('resAp').textContent = actionPointLabel(state, clock.day);
  $('resInsight').textContent = String(state.insight);
  const settledNow = info.round != null && clock.minute >= MATCH_MINUTE && roundSettled(state);
  const segName = settledNow ? '赛后' : world.segment(clock.minute).name;
  $('phaseChip').textContent = clock.night ? '夜里 · 快进中' : `${segName} · 在岗 ${world.presentCount()}/6`;
  const nm = nextMatch(clock.day, clock.minute);
  const opp = nm ? world.opponentToday() : null;
  const worldFix = playerWorldOpponent(state, clock.day);
  const inMatch = (info.round != null || worldFix) && clock.minute >= MATCH_MINUTE && world.members.some((m) => m.activity.kind === 'match');
  const rank = state.season.round > 0 ? ourRank(state) : null;
  const breakOn = state.season.phase === 'offseason' || state.season.phase === 'world';
  $('breakBtn').classList.toggle('hidden', !breakOn);
  $('breakBtn').textContent = state.season.phase === 'world' && state.worldCup && !state.worldCup.done ? '世界赛' : '休赛';
  $('matchChip').textContent = worldFix
    ? `世界赛${WORLD_ROUND_CN[worldFix.round]} · vs ${worldFix.opponent.name}`
    : settledNow
    ? `第 ${info.round} 轮已结束 · 目前第 ${rank?.rank ?? ourRank(state).rank} 名`
    : inMatch
    ? `比赛中 · 第 ${info.round} 轮 vs ${world.opponentToday()?.name}`
    : info.offseason || breakOn
    ? `休赛期 · 还有 ${nm ? nm.inDays : '?'} 天开赛`
    : nm && nm.inDays === 0 && opp
      ? `今晚 19:00 第 ${nm.round} 轮 · vs ${opp.name}`
      : nm ? `下一场：${nm.inDays} 天后 · 第 ${nm.round} 轮` : '—';
  $('matchChip').classList.toggle('link', state.season.round > 0 || !!state.worldCup);
  $('matchChip').title = state.worldCup ? '点击看世界赛对阵' : state.season.round > 0 ? '点击看积分榜' : '';
  document.querySelectorAll<HTMLElement>('#speeds button').forEach((b) => {
    b.classList.toggle('on', clock.debugRate == null && b.dataset.s === clock.speed && !clock.paused);
  });
  syncGod?.();
  $('pauseBtn').textContent = clock.paused ? '▶' : '⏸';
  $('pauseBtn').classList.toggle('on', clock.manualPause);
  const holds = clock.holdReasons;
  $('holdBanner').classList.toggle('hidden', !holds.length);
  $('holdBanner').textContent = `⏸ 自动暂停：${holds.join('；')}`;
  if (selected) card.render(world);
  const rows = [...world.members].sort((a, b) => b.slackMin - a.slackMin).slice(0, 5).map((m) => ({ name: m.name, minutes: m.slackMin }));
  venue.wb?.draw({
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
$('menuBtn').addEventListener('click', () => {
  if (modalOpen && !modalClosable) return;
  showMenu();
});
$('manageBtn').addEventListener('click', () => {
  if (modalOpen && !modalClosable) return;
  showManage();
});
$('breakBtn').addEventListener('click', () => {
  if (!live || (modalOpen && !modalClosable)) return;
  if (state.season.phase === 'world' && state.worldCup && !state.worldCup.done) showBracket();
  else showOffseason();
});
$('matchChip').addEventListener('click', () => {
  if (!live) return;
  if (modalOpen && !modalClosable) return;
  if (state.worldCup) showBracket();
  else if (state.season.round > 0) showStandings();
});
addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
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
let stopBroadcast: (() => void) | null = null;
function haltBroadcast() {
  stopBroadcast?.();
  stopBroadcast = null;
}
function openModal(html: string, closable = true) {
  haltBroadcast();
  modalOpen = true;
  modalClosable = closable;
  $('modalBody').classList.remove('live', 'sheet');
  $('modalBody').innerHTML = html;
  $('modal').classList.remove('hidden');
}
function closeModal() {
  if (!modalClosable) return;
  haltBroadcast();
  modalOpen = false;
  $('modalBody').classList.remove('manage', 'live', 'sheet');
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
      const when = i.savedAt ? formatWallTime(i.savedAt) : '';
      const canSave = mode === 'menu' && i.slot !== 'auto';
      const saveBtn = canSave
        ? `<button class="btn" data-save="${i.slot}">保存</button>`
        : '<button class="btn slot-ghost" tabindex="-1" aria-hidden="true">保存</button>';
      return `<div class="slot"><b>${name}</b><div>${i.label}<small>${i.broken ?? when}</small></div>
        ${saveBtn}
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
    <p class="sub">网页试玩版 · M3（比赛、直播、联赛）</p>
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

function showManage(pick?: [string, string]) {
  if (!live || state.bankrupt) return;
  const ids = world.members.map((m) => m.id);
  const sel: [string, string] = pick ?? [selected && ids.includes(selected) ? selected : ids[0], ids[1]];
  $('modalBody').classList.add('manage');
  openModal(manageHtml(world, sel), true);
  bindManage(world, {
    toast,
    onFacilities: () => {
      syncVenue();
      world.update(clock.minute, 0, true);
      director.snapAll();
    },
    onClose: () => {
      modalClosable = true;
      closeModal();
    },
    rerender: (next) => showManage(next),
  });
}

function checkBankrupt() {
  if (!live || !state.bankrupt || clock.isHeld('bankrupt')) return;
  clock.hold('bankrupt', '连续三个月发不出工资');
  openModal(
    `<h2>战队破产</h2>
    <p>连续三个月发不出工资。公司现金和私房钱都垫不上了。</p>
    <p class="sub">这一局停在这里。可以读更早的存档，或者重新开始。</p>
    <div class="row"><button class="btn accent" id="bkTitle">回到标题</button></div>`,
    false,
  );
  $('bkTitle').addEventListener('click', () => {
    clock.release('bankrupt');
    modalClosable = true;
    closeModal();
    live = false;
    showTitle();
  });
}

function seasonHooks() {
  return {
    toast,
    log: (text: string) => {
      world.log('剧情', text, []);
      board.set(state.eventLog);
    },
    onVenue: () => {
      world.refreshVenue();
      syncVenue();
      world.update(clock.minute, 0, true);
      director.snapAll();
    },
    refresh: () => showOffseason(),
    openBracket: () => {
      if (state.season.report) state.season.report.acked = true;
      clock.release('season-end');
      showBracket();
    },
    openOffseason: () => {
      if (state.season.report) state.season.report.acked = true;
      clock.release('season-end');
      showOffseason();
    },
    close: () => {
      modalClosable = true;
      closeModal();
    },
    continueEnding: () => {
      state.meta.endingSeen = true;
      clock.release('ending');
      modalClosable = true;
      closeModal();
      persist('auto');
    },
  };
}

function showSettlement() {
  openModal(settlementHtml(state), false);
  bindSettlement(seasonHooks());
}

function showOffseason() {
  openModal(offseasonHtml(state), true);
  $('modalBody').classList.add('manage');
  bindOffseason(state, seasonHooks());
}

function showBracket() {
  openModal(bracketHtml(state), true);
  $('modalBody').classList.add('manage');
  bindBracket(seasonHooks());
}

function showEnding() {
  openModal(endingHtml(state), false);
  $('modalBody').classList.add('ending-sheet');
  bindEnding(seasonHooks());
}

function showStandings() {
  if (!live) return;
  const row = ourRank(state);
  const info = dayInfo(clock.day);
  openModal(
    `<h2>积分榜 · ${TIER_CN[state.season.tier]}</h2>
    <p>第 ${state.season.round} 轮后，SSB 第 ${row.rank} 名（${row.w} 胜 ${row.l} 负）。${info.round != null && roundSettled(state) ? '这一轮已经记进榜。' : ''}</p>
    <div class="sheet-scroll">${standingsTableHtml(state)}</div>
    <div class="dock"><button class="btn accent" id="stClose">回到网吧</button></div>`,
    true,
  );
  $('modalBody').classList.add('sheet');
  document.getElementById('stClose')?.addEventListener('click', () => {
    modalClosable = true;
    closeModal();
  });
}

function showPrematch(holdId: string, intermission: boolean) {
  openModal(prematchHtml(state, intermission), false);
  $('modalBody').classList.add('sheet');
  bindPrematch(state, {
    toast,
    onRefresh: () => showPrematch(holdId, intermission),
    onConfirm: (slots, tactic: TacticId) => {
      if (!validLineup(slots)) {
        toast('每个选手只能占一个位置');
        return;
      }
      state.lineup = { day: clock.day, slots, tactic };
      world.starters = slots.slice();
      if (intermission && state.series) state.series.phase = 'play';
      else state.prematchConfirmedDay = clock.day;
      clock.release(holdId);
      persist('auto');
      if (intermission) {
        const liveId = `match-live-${clock.day}`;
        clock.hold(liveId, '直播中');
        showBroadcast(liveId);
        return;
      }
      modalClosable = true;
      closeModal();
      world.update(clock.minute, 0, true);
      director.snapAll();
    },
  });
}

function showBroadcast(holdId: string) {
  const info = dayInfo(clock.day);
  const worldFix = playerWorldOpponent(state, clock.day);
  const round = worldFix ? worldFix.round + 1 : (info.round ?? 1);
  if (!worldFix) {
    for (const text of catchUpThrough(state, round - 1)) world.log('剧情', text, []);
    board.set(state.eventLog);
  }
  if (!state.series || state.series.day !== clock.day) {
    state.series = { day: clock.day, game: 1, us: 0, them: 0, phase: 'play', accounted: 0, loaded: 0 };
  }
  const series = state.series;
  const slots = state.lineup?.day === clock.day ? state.lineup.slots : world.starters;
  const tactic = state.lineup?.tactic ?? state.tactics[0] ?? 'engage';
  const opp = worldFix ? worldFix.opponent : opponentForRound(state.season.tier, round);
  const result = playOurMatch(state, clock.day, series.game, slots, tactic, opp);
  const bench = benchOf(slots);
  const seed = hashString([state.seed, 'dm', clock.day, series.game, slots.join(','), bench ?? ''].join('|'));
  const cues = cuesFrom(result, bench, makeRng(seed).next);
  if (!state.broadcast || state.broadcast.day !== clock.day || state.broadcast.game !== series.game || state.broadcast.seed !== seed) {
    state.broadcast = { day: clock.day, game: series.game, cursor: 0, seed };
  }
  const bo = worldFix || winsNeeded(state.season.tier) !== 1 ? `BO3 ${series.us}:${series.them}` : 'BO1';
  const benchName = bench ? (world.byId[bench]?.name ?? bench) : '—';
  const need = worldFix ? 2 : winsNeeded(state.season.tier);
  const usAfter = series.us + (result.win === 'A' ? 1 : 0);
  const themAfter = series.them + (result.win === 'A' ? 0 : 1);
  const seriesOver = usAfter >= need || themAfter >= need;
  modalOpen = true;
  modalClosable = false;
  $('modal').classList.remove('hidden');
  stopBroadcast = mountBroadcast({
    title: worldFix ? `直播 · 世界赛${WORLD_ROUND_CN[worldFix.round]}` : `直播 · 第 ${round} 轮`,
    sub: `${bo} · 第 ${series.game} 局 · vs ${opp.name} · 第二解说 ${benchName}`,
    cues,
    start: state.broadcast.cursor,
    box: result.box,
    button: seriesOver ? (worldFix ? '记入世界赛，回到场地' : '记入积分榜，回到网吧') : '这一局结束，局间换人',
    onCursor: (n) => {
      if (state.broadcast && state.broadcast.day === clock.day && state.broadcast.game === series.game) state.broadcast.cursor = n;
      if (n % 8 === 0) persist('auto');
    },
    onDone: () => finishWatchedGame(holdId, result.win === 'A', slots),
  });
  persist('auto');
}

function finishWatchedGame(holdId: string, won: boolean, slots: string[]) {
  haltBroadcast();
  const series = state.series;
  if (!series) return;
  const game = state.broadcast?.game ?? series.game;
  if (series.loaded < game) {
    applyGameLoad(state, slots);
    series.loaded = game;
  }
  if (series.accounted < game) {
    if (won) series.us++;
    else series.them++;
    series.accounted = game;
  }
  const worldFix = playerWorldOpponent(state, clock.day);
  const need = worldFix ? 2 : winsNeeded(state.season.tier);
  if (series.us >= need || series.them >= need) {
    const logs = worldFix
      ? commitWorldRound(state, worldFix.round, series.us > series.them, slots)
      : commitRound(state, dayInfo(clock.day).round ?? 1, series.us > series.them, slots);
    for (const text of logs) {
      const major = /升入|降到|世界赛|解约|垫底|羞辱|冠军/.test(text);
      world.log(major ? '重大' : '剧情', text, slots);
    }
    state.series = null;
    state.broadcast = null;
    world.starters = slots.slice();
    clock.release(holdId);
    clock.release(`match-gap-${clock.day}`);
    modalClosable = true;
    closeModal();
    world.update(clock.minute, 0, true);
    director.snapAll();
    board.set(state.eventLog);
    persist('auto');
    if (worldFix) {
      if (state.worldCup?.champion && !state.meta.endingSeen) showEnding();
      else showBracket();
    } else if (state.season.report && !state.season.report.acked) showSettlement();
    else showStandings();
    return;
  }
  series.phase = 'gap';
  series.game = game + 1;
  state.broadcast = null;
  clock.release(holdId);
  const gapId = `match-gap-${clock.day}`;
  clock.hold(gapId, '局间：可以换首发和战术');
  showPrematch(gapId, true);
  persist('auto');
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
// ?venue=1 换场地（默认买齐该场地能买的设施），&fac=snack,fridge 指定已买设施，&fac=none 一件不买
if (params.get('day') || params.get('t') || params.get('venue')) {
  const [h, m] = (params.get('t') ?? '10:00').split(':').map(Number);
  const s = createNewGame(+(params.get('seed') ?? 7));
  s.clock.day = +(params.get('day') ?? 1);
  s.clock.minute = h * 60 + (m || 0);
  if (params.get('venue')) {
    s.venueLevel = Math.max(0, Math.min(3, +params.get('venue')!));
    const fac = params.get('fac');
    s.facilities = fac == null ? allFacilitiesUpTo(s.venueLevel) : fac === 'none' ? [] : fac.split(',');
    if (s.venueLevel > 0) {
      const intro = s.eventLog.find((e) => e.text.includes('战队今天正式成立'));
      if (intro) intro.text = `战队在${VENUE_CN[s.venueLevel]}训练。买下来的设施才会摆出来。`;
    }
  }
  startGame(s);
}
if (params.get('speed')) clock.setSpeed(params.get('speed') as SpeedId);
if (!params.get('skip') && !params.get('t') && !params.get('venue')) {
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

// 场地 / 设施变化（M4 的搬家、购买会走这里）
function setVenue(level: number, facilities: string[]) {
  state.venueLevel = level;
  state.facilities = facilities;
  world.refreshVenue();
  syncVenue();
  world.update(clock.minute, 0, true);
  director.snapAll();
}

// 测试面板只在 ?debug=1 时挂上。没有这个参数就不会创建节点。
if (params.get('debug') === '1') {
  const god = mountGodPanel({
    getClock: () => clock,
    world,
    snap: () => director.snapAll(),
    refreshBoard: () => board.set(state.eventLog),
    checkPrematch,
    checkBankrupt,
    setVenueLevel(level) {
      const old = state.venueLevel;
      state.venueLevel = level;
      retuneActionPoints(state, old);
      world.refreshVenue();
      syncVenue();
      world.update(clock.minute, 0, true);
      director.snapAll();
    },
    dismissBlocking() {
      if (!modalOpen) return;
      modalClosable = true;
      closeModal();
    },
    ensureLive() {
      if (live) return;
      live = true;
      modalClosable = true;
      closeModal();
    },
    toast,
    showOffseason: () => showOffseason(),
    showBracket: () => showBracket(),
  });
  syncGod = () => god.sync();
}

(window as unknown as { __ssb: unknown }).__ssb = {
  world, get clock() { return clock; }, get state() { return state; }, get venue() { return venue; }, saves, director, stage, select, setVenue, SLOTS,
  act: (id: string, targets: string[] = []) => world.act(id, targets),
  buy(id: string) {
    const r = buyFacility(state, id);
    if (r.ok) {
      world.refreshVenue();
      syncVenue();
      world.update(clock.minute, 0, true);
      director.snapAll();
    }
    return r;
  },
  showManage: () => showManage(),
};
