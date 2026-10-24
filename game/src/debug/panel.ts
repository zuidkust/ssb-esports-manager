// 只有 ?debug=1 才会挂上这块面板。平时不要调用。
import { fmtHM, SPEEDS, type GameClock } from '../core/clock';
import { VENUE_CN } from '../data/facilities';
import { CHAINS, DISHES } from '../data/takeout';
import type { World } from '../sim/world';
import {
  applyJump,
  clampVenue,
  clearCooldowns,
  forceTakeout,
  jumpToNextEvent,
  jumpToNextMatch,
  jumpToNextPayday,
  jumpToNextTakeout,
  parseHM,
  setActionPoints,
  setCash,
  armWorldCup,
  crownWorld,
  jumpToOffseason,
  jumpToSeasonEnd,
  setSeasonRank,
} from './god';

export interface GodHooks {
  getClock: () => GameClock;
  world: World;
  snap: () => void;
  refreshBoard: () => void;
  checkPrematch: () => void;
  checkBankrupt: () => void;
  setVenueLevel: (level: number) => void;
  dismissBlocking: () => void;
  ensureLive: () => void;
  toast: (msg: string) => void;
  showOffseason: () => void;
  showBracket: () => void;
  refreshCheatModal: () => void;
  getPixelSize: () => 2 | 3 | 4;
  setPixelSize: (size: 2 | 3 | 4) => void;
}

export function mountGodPanel(hooks: GodHooks): { sync: () => void } {
  const root = document.createElement('div');
  root.id = 'god';
  root.className = 'collapsed';
  const delivery = DISHES.filter((d) => d.id !== 'jianbing' && d.id !== 'instant' && d.slots.some((s) => s === 'lunch' || s === 'dinner'));
  const chains = [...CHAINS.map((c) => ({ id: c.id, name: c.name })), { id: 'luosifen', name: '螺蛳粉抗议' }];
  const members = hooks.world.members;

  root.innerHTML = `
    <button type="button" class="god-toggle" id="godToggle">调试</button>
    <div class="god-body">
      <div class="god-row god-wrap">
        <label>第 <input id="godDay" type="text" name="ssb-debug-day" maxlength="6" autocomplete="off" spellcheck="false" aria-label="第几天" /> 天</label>
        <label>时刻 <input id="godTime" type="text" name="ssb-debug-time" placeholder="12:00" maxlength="5" autocomplete="off" spellcheck="false" aria-label="时刻" /></label>
        <button type="button" id="godJump">跳到</button>
      </div>
      <div class="god-row god-wrap">
        <button type="button" data-jump="takeout">下一顿外卖</button>
        <button type="button" data-jump="match">下一场比赛</button>
        <button type="button" data-jump="payday">下一次发薪</button>
        <button type="button" data-jump="event">下一事件</button>
      </div>
      <div class="god-row god-wrap">
        <button type="button" data-jump="seasonEnd">跳到赛季末</button>
        <button type="button" data-jump="offseason">跳到休赛期</button>
        <button type="button" data-jump="world">触发世界赛</button>
        <button type="button" data-jump="crown">直接夺冠</button>
      </div>
      <div class="god-row">
        <label>名次 <input id="godRank" type="text" name="ssb-debug-rank" maxlength="2" value="8" autocomplete="off" spellcheck="false" aria-label="赛季末名次" /></label>
        <button type="button" id="godRankSet">指定赛季末名次</button>
      </div>
      <div class="god-row">
        <label class="god-grow">倍速 <b id="godRate">×1</b>
          <input id="godSlider" type="range" min="1" max="60" step="1" value="1" aria-label="倍速" />
        </label>
        <button type="button" id="godPause">暂停</button>
      </div>
      <p class="god-note">夜间快进大约 6 秒，不吃这个倍率。底部的正常 / ×3 / ×10 会把它清掉。</p>
      <div class="god-row">
        <label>现金 <input id="godCash" type="text" name="ssb-debug-cash" maxlength="12" autocomplete="off" spellcheck="false" aria-label="现金" /></label>
        <button type="button" id="godCashSet">设置</button>
      </div>
      <div class="god-row">
        <label>行动点 <input id="godAp" type="text" name="ssb-debug-ap" maxlength="2" autocomplete="off" spellcheck="false" aria-label="行动点" /></label>
        <button type="button" id="godApSet">设置</button>
      </div>
      <div class="god-row">
        <label class="god-grow">场地
          <select id="godVenue">${VENUE_CN.map((name, i) => `<option value="${i}">${name}</option>`).join('')}</select>
        </label>
        <button type="button" id="godVenueSet">设置</button>
      </div>
      <div class="god-row">
        <label class="god-grow">队员
          <select id="godMember">${members.map((m) => `<option value="${m.id}">${m.name}</option>`).join('')}</select>
        </label>
      </div>
      <div class="god-row">
        <label class="god-grow">外卖
          <select id="godDish">${delivery.map((d) => `<option value="${d.id}">${d.name}</option>`).join('')}</select>
        </label>
        <button type="button" id="godOrder">点这单</button>
      </div>
      <div class="god-row">
        <label class="god-grow">连锁
          <select id="godChain">${chains.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
        </label>
        <button type="button" id="godChainGo">触发</button>
      </div>
      <div class="god-row">
        <span>像素粒度</span>
        <button type="button" data-px="2">2</button>
        <button type="button" data-px="3">3</button>
        <button type="button" data-px="4">4</button>
      </div>
      <div class="god-row">
        <button type="button" id="godClear">清空冷却</button>
      </div>
    </div>`;
  document.getElementById('app')!.appendChild(root);

  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const dayInput = $('godDay') as HTMLInputElement;
  const timeInput = $('godTime') as HTMLInputElement;
  const cashInput = $('godCash') as HTMLInputElement;
  const apInput = $('godAp') as HTMLInputElement;
  const rankInput = $('godRank') as HTMLInputElement;
  const slider = $('godSlider') as HTMLInputElement;
  const rateLabel = $('godRate');
  const pauseBtn = $('godPause');
  let composing = false;

  // 焦点在调试面板的输入框里、或输入法还在组字时，不要改任何一个框的 value。
  // 顶栏每 250ms 会走 sync。快打时哪怕改的是旁边的「第几天」，也会把还在排队的按键冲掉，现金框就会少掉开头几位。
  function godEditing(): boolean {
    if (composing) return true;
    const active = document.activeElement;
    return !!active && root.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  }
  function canWrite(input: HTMLInputElement): boolean {
    return !godEditing() && document.activeElement !== input;
  }
  function fillClock() {
    if (godEditing()) return;
    const clock = hooks.getClock();
    dayInput.value = String(clock.day);
    timeInput.value = fmtHM(clock.minute);
  }
  function sync() {
    const clock = hooks.getClock();
    const mult = clock.debugRate ?? SPEEDS[clock.speed].mult;
    rateLabel.textContent = clock.manualPause ? `暂停 · ×${mult}` : `×${mult}`;
    pauseBtn.textContent = clock.manualPause ? '继续' : '暂停';
    if (!godEditing() && document.activeElement !== slider) slider.value = String(mult);
    const px = hooks.getPixelSize();
    root.querySelectorAll<HTMLButtonElement>('[data-px]').forEach((b) => b.classList.toggle('on', Number(b.dataset.px) === px));
    fillClock();
  }
  function afterTime(note: string) {
    hooks.ensureLive();
    hooks.dismissBlocking();
    hooks.snap();
    hooks.refreshBoard();
    hooks.checkPrematch();
    hooks.checkBankrupt();
    fillClock();
    sync();
    hooks.toast(note);
  }

  $('godToggle').addEventListener('click', () => {
    const open = root.classList.toggle('collapsed');
    $('godToggle').setAttribute('aria-expanded', open ? 'false' : 'true');
    if (!root.classList.contains('collapsed')) {
      fillClock();
      if (canWrite(cashInput)) cashInput.value = String(hooks.world.state.cash);
      if (canWrite(apInput)) apInput.value = String(hooks.world.state.actionPoints);
      ( $('godVenue') as HTMLSelectElement).value = String(hooks.world.state.venueLevel);
      sync();
    }
  });
  $('godToggle').setAttribute('aria-expanded', 'false');
  // 输入框的按键必须冒泡。拦掉之后中文输入法和数字组字收不到，快打会丢前面的字；弹窗开着时名次框会一个字都进不去。
  root.addEventListener('compositionstart', () => {
    composing = true;
  });
  root.addEventListener('compositionend', () => {
    composing = false;
  });
  root.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.stopPropagation();
  });

  $('godJump').addEventListener('click', () => {
    const minute = parseHM(timeInput.value);
    if (minute == null) {
      hooks.toast('时间写成 12:00 这样');
      return;
    }
    const at = applyJump(hooks.world, hooks.getClock(), Number(dayInput.value), minute);
    afterTime(`已跳到第 ${at.day} 天 ${fmtHM(at.minute)}`);
  });

  root.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const clock = hooks.getClock();
      const kind = btn.dataset.jump;
      if (kind === 'takeout') {
        const at = jumpToNextTakeout(hooks.world, clock);
        afterTime(at ? `下一顿外卖 · 第 ${at.day} 天 ${fmtHM(at.minute)}` : '这几天没有外卖');
      } else if (kind === 'match') {
        const at = jumpToNextMatch(hooks.world, clock);
        afterTime(at ? `下一场比赛 · 第 ${at.day} 天 ${fmtHM(at.minute)}` : '没有下一场比赛');
      } else if (kind === 'payday') {
        const at = jumpToNextPayday(hooks.world, clock);
        afterTime(`发薪日 · 第 ${at.day} 天 ${fmtHM(at.minute)}`);
      } else if (kind === 'event') {
        const beat = jumpToNextEvent(hooks.world, clock);
        afterTime(`下一事件 · ${beat.label} · 第 ${beat.day} 天 ${fmtHM(beat.minute)}`);
      } else if (kind === 'seasonEnd') {
        const at = jumpToSeasonEnd(hooks.world, clock);
        afterTime(`赛季结算 · 第 ${at.day} 天 ${fmtHM(at.minute)}`);
      } else if (kind === 'offseason') {
        const at = jumpToOffseason(hooks.world, clock);
        afterTime(`休赛期 · 第 ${at.day} 天 ${fmtHM(at.minute)}`);
        hooks.showOffseason();
      } else if (kind === 'world') {
        const at = armWorldCup(hooks.world, clock);
        afterTime(`世界赛对阵 · 第 ${at.day} 天 ${fmtHM(at.minute)}`);
        hooks.showBracket();
      } else if (kind === 'crown') {
        const at = crownWorld(hooks.world, clock);
        afterTime(`夺冠结局 · 第 ${at.day} 天 ${fmtHM(at.minute)}`);
      }
    });
  });

  $('godRankSet').addEventListener('click', () => {
    const raw = Number(rankInput.value.trim());
    if (!Number.isInteger(raw) || raw < 1 || raw > 8) {
      hooks.toast('名次要写 1 到 8');
      return;
    }
    const at = setSeasonRank(hooks.world, hooks.getClock(), raw);
    afterTime(`赛季末第 ${at.rank} 名 · 第 ${at.day} 天 ${fmtHM(at.minute)}`);
  });

  slider.addEventListener('input', () => {
    hooks.ensureLive();
    hooks.getClock().setDebugRate(Number(slider.value));
    sync();
  });
  pauseBtn.addEventListener('click', () => {
    hooks.ensureLive();
    hooks.getClock().togglePause();
    sync();
  });

  $('godCashSet').addEventListener('click', () => {
    hooks.ensureLive();
    const n = setCash(hooks.world.state, Number(cashInput.value));
    cashInput.value = String(n);
    hooks.refreshCheatModal();
    hooks.toast(`现金改为 ${n.toLocaleString('zh-CN')}`);
  });
  $('godApSet').addEventListener('click', () => {
    hooks.ensureLive();
    const n = setActionPoints(hooks.world.state, Number(apInput.value));
    apInput.value = String(n);
    hooks.toast(`行动点改为 ${n}`);
  });
  $('godVenueSet').addEventListener('click', () => {
    hooks.ensureLive();
    hooks.dismissBlocking();
    const level = clampVenue(Number(($('godVenue') as HTMLSelectElement).value));
    hooks.setVenueLevel(level);
    hooks.refreshBoard();
    hooks.checkPrematch();
    hooks.checkBankrupt();
    hooks.toast(`场地改为${VENUE_CN[level]}`);
  });

  function order(chain: string | null) {
    const memberId = ($('godMember') as HTMLSelectElement).value;
    const dishId = ($('godDish') as HTMLSelectElement).value;
    const at = forceTakeout(hooks.world, hooks.getClock(), memberId, dishId, chain);
    const who = members.find((m) => m.id === memberId)?.name ?? memberId;
    afterTime(chain ? `已触发连锁 · ${who} · 第 ${at.day} 天 ${fmtHM(at.minute)}` : `已点外卖 · ${who} · 第 ${at.day} 天 ${fmtHM(at.minute)}`);
  }
  $('godOrder').addEventListener('click', () => order(null));
  $('godChainGo').addEventListener('click', () => order(($('godChain') as HTMLSelectElement).value));
  root.querySelectorAll<HTMLButtonElement>('[data-px]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = Number(btn.dataset.px);
      if (size !== 2 && size !== 3 && size !== 4) return;
      hooks.setPixelSize(size);
      sync();
    });
  });
  $('godClear').addEventListener('click', () => {
    hooks.ensureLive();
    clearCooldowns(hooks.world.state);
    hooks.toast('冷却已清空');
  });

  return { sync };
}
