// 赛季结算、休赛期、世界赛对阵、夺冠结局
import { MOVE_FEE, MOVE_REFUND_RATE } from '../data/economy';
import { VENUE_CN } from '../data/facilities';
import { TIER_CN } from '../data/leagues';
import { ROUTE_BY_ID, ROUTE_CHANGE_INSIGHT, ROUTE_GRIND_DAYS, routeFit } from '../data/routes';
import { ROSTER, ROSTER_BY_ID } from '../data/roster';
import { SPONSORS } from '../data/sponsors';
import type { GameState } from '../save/state';
import { actionPointMax } from '../data/economy';
import { goalProgress, signSponsor, sponsorLockReason } from '../sim/economy';
import { changeRoute, moveVenue, recruitMember, routeChoices, talkSalary, venueGate } from '../sim/offseason';
import { roundPairsOf, teamName, WORLD_ROUND_CN } from '../sim/worldcup';

const esc = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
const yuan = (n: number) => n.toLocaleString('zh-CN');

export function settlementHtml(state: GameState): string {
  const report = state.season.report;
  const from = report ? TIER_CN[report.from] : TIER_CN[state.season.tier];
  const rank = report?.rank ?? 8;
  const prize = report?.prize ?? 0;
  const move = report?.move ?? 'stay';
  const to = report ? TIER_CN[report.to] : TIER_CN[state.season.tier];
  const headline = move === 'up' ? `升入${to}` : move === 'down' ? `降到${to}` : report?.world ? '留在国内联赛，拿到世界赛资格' : '留在原联赛';
  const world = report?.world
    ? '休赛周里打世界赛：八强、半决赛、决赛，每两天一场，都是 BO3。'
    : '这一周是休赛期。';
  return `
    <div class="season-end">
      <p class="kicker">${esc(from)} · 第 ${state.meta.seasonCount} 个赛季</p>
      <h2>第 ${rank} 名</h2>
      <p class="season-move">${esc(headline)}</p>
      <p>${prize > 0 ? `排名奖 +${yuan(prize)}。` : '这一名没有排名奖。'}</p>
      <p>${world}可以搬家、换训练路线、谈赞助。招新人是 DLC，这 6 个人先不走。</p>
      <p class="sub">网吧联赛垫底不降级。降级也不强制搬家，房租照旧。</p>
      <div class="row">
        ${report?.world ? '<button class="btn" id="toBracket">看世界赛对阵</button>' : ''}
        <button class="btn accent" id="toBreak">进入休赛期</button>
      </div>
    </div>`;
}

export function bracketHtml(state: GameState): string {
  const cup = state.worldCup;
  if (!cup) {
    return `<h2>世界赛</h2><p>还没有对阵。</p><div class="row"><button class="btn accent" id="bracketClose">回到场地</button></div>`;
  }
  const rounds = [0, 1, 2].map((round) => {
    const played = cup.games.filter((g) => g.round === round);
    const pairs = played.length ? played.map((g) => [g.a, g.b, g.winner] as const) : roundPairsOf(cup, round).map((p) => [p[0], p[1], ''] as const);
    if (!pairs.length && round > 0 && played.length === 0) {
      return `<section><h3>${WORLD_ROUND_CN[round]}</h3><p class="sub">上一轮打完才出对阵。</p></section>`;
    }
    const rows = pairs.map(([a, b, winner]) => {
      const us = a === 'ssb' || b === 'ssb';
      const mark = (id: string) => `${esc(teamName(id))}${winner === id ? ' · 胜' : ''}`;
      return `<div class="pair${us ? ' us' : ''}${winner ? ' done' : ''}"><span>${mark(a)}</span><span>${mark(b)}</span></div>`;
    }).join('');
    return `<section><h3>${WORLD_ROUND_CN[round]} · BO3</h3>${rows}</section>`;
  }).join('');
  const status = cup.champion ? 'SSB 是冠军。' : cup.done ? '这一届结束了。' : '每两天一场，今晚 19:00 开打。';
  return `
    <h2>世界赛对阵</h2>
    <p class="sub">国内前两名加上 6 支海外队。单败淘汰。${status}</p>
    <div class="bracket">${rounds}</div>
    <div class="row">
      <button class="btn" id="bracketBreak">去休赛安排</button>
      <button class="btn accent" id="bracketClose">回到场地</button>
    </div>`;
}

export function endingHtml(state: GameState): string {
  const aji = ROSTER_BY_ID.aji?.name ?? '阿鸡';
  const dang = ROSTER_BY_ID.dangdeng?.name ?? '当邓';
  const prize = state.worldCup?.champion ? '冠军奖金已经进账。' : '';
  return `
    <div class="ending">
      <p class="kicker">主结局</p>
      <h2>世界冠军</h2>
      <p>决赛打完，六个人把奖杯抬了回来。庆功宴上${esc(aji)}先切了蛋糕，${esc(dang)}说明天照常训练。</p>
      <p>${prize}这是这一程的主结局。存档还在，联赛下一季继续，想退租也行。</p>
      <div class="row"><button class="btn accent" id="endingContinue">继续经营</button></div>
    </div>`;
}

function movePlan(state: GameState, level: number): { text: string; ok: boolean } {
  if (level === state.venueLevel) return { text: '当前场地', ok: false };
  const gate = venueGate(state, level);
  if (gate) return { text: gate, ok: false };
  if (level > state.venueLevel + 1) return { text: '要一阶一阶搬', ok: false };
  if (level < state.venueLevel - 1) return { text: '要一阶一阶退', ok: false };
  if (level > state.venueLevel) {
    const fee = MOVE_FEE[level] ?? 0;
    const ap = actionPointMax(level, false);
    if (state.cash < fee) return { text: `搬家费 ${yuan(fee)}，现金不够`, ok: false };
    return { text: `搬家费 ${yuan(fee)} · 行动点 ${ap}`, ok: true };
  }
  const back = Math.round((MOVE_FEE[state.venueLevel] ?? 0) * MOVE_REFUND_RATE);
  return { text: `退租返还 ${yuan(back)}`, ok: true };
}

export function offseasonHtml(state: GameState): string {
  const moves = VENUE_CN.map((name, level) => {
    const here = level === state.venueLevel;
    const plan = movePlan(state, level);
    return `<div class="act">
      <div><b>${esc(name)}</b><small>${esc(plan.text)}</small></div>
      <button class="btn" data-move="${level}" ${here || !plan.ok ? 'disabled' : ''}>${here ? '现在' : level > state.venueLevel ? '搬过去' : '退回去'}</button>
    </div>`;
  }).join('');
  const who = state.roster.map((m) => {
    const name = ROSTER_BY_ID[m.id]?.name ?? m.id;
    const route = m.route ? ROUTE_BY_ID_NAME(m.route) : '还没定路线';
    return `<option value="${m.id}">${esc(name)} · ${esc(route)}</option>`;
  }).join('');
  const routes = routeChoices().map((r) => {
    const sample = state.roster[0];
    const fit = sample ? routeFit(sample.ability, sample.persona, r) : 'A';
    return `<button class="btn" data-route="${r.id}">${esc(r.name)} <small>适配 ${fit}</small></button>`;
  }).join('');
  const salary = state.season.report?.move === 'up'
    ? state.roster.map((m) => {
        const name = ROSTER_BY_ID[m.id]?.name ?? m.id;
        if (m.salaryDeal) return `<div class="act"><div><b>${esc(name)}</b><small>已经谈过，月薪 ${yuan(m.salary)}</small></div></div>`;
        return `<div class="act">
          <div><b>${esc(name)}</b><small>照表 / 少涨一点 / 兄弟价（要有好兄弟）</small></div>
          <span class="row tight">
            <button class="btn" data-pay="table" data-who="${m.id}">照表</button>
            <button class="btn" data-pay="low" data-who="${m.id}">少涨</button>
            <button class="btn" data-pay="bond" data-who="${m.id}">兄弟价</button>
          </span>
        </div>`;
      }).join('')
    : '<p class="sub">这次没有升级，工资按现在的联赛级别走，不用逐个谈。</p>';
  const sponsors = SPONSORS.map((sp) => {
    const signed = state.sponsors.includes(sp.id);
    const lock = sponsorLockReason(state, sp.id);
    return `<div class="act">
      <div><b>${esc(sp.name)}</b><small>月入 ${yuan(sp.income)} · ${esc(sp.goal)}<br>${esc(goalProgress(state, sp.id))}${lock && !signed ? `<br>${esc(lock)}` : ''}</small></div>
      ${signed ? '<button class="btn" disabled>已签</button>' : `<button class="btn" data-sponsor="${sp.id}" ${lock ? 'disabled' : ''}>谈下来</button>`}
    </div>`;
  }).join('');
  const cup = state.worldCup && !state.worldCup.done
    ? '<div class="row"><button class="btn" id="breakBracket">世界赛对阵</button></div>'
    : '';
  return `
    <h2>休赛期</h2>
    <p class="sub">一周时间：搬家、换路线、谈赞助。招新人留给 DLC。比赛日的行动点仍按场地等级，世界赛当晚额外 +1。</p>
    ${cup}
    <h3>搬家</h3>
    <div class="act-list">${moves}</div>
    <h3>招人</h3>
    <div class="act">
      <div><b>再招一个人</b><small>本体固定 6 人。后 6 位朋友是 DLC。</small></div>
      <button class="btn" id="recruitBtn" type="button">DLC</button>
    </div>
    <h3>换路线</h3>
    <p class="sub">花 ${ROUTE_CHANGE_INSIGHT} 心得，磨合 ${ROUTE_GRIND_DAYS} 天。下面的适配度按左边选中的人算，点按钮时以那个人为准。换路线会清掉已练成的路线特性。</p>
    <div class="row"><select id="routeWho">${who}</select></div>
    <p class="sub" id="routeNow"></p>
    <div class="route-picks" id="routePicks">${routes}</div>
    <h3>谈薪</h3>
    <div class="act-list">${salary}</div>
    <h3>谈赞助</h3>
    <p class="sub">和经营面板是同一条赞助链，这里只是休赛期集中谈。</p>
    <div class="act-list">${sponsors}</div>
    <div class="row"><button class="btn accent" id="breakClose">回到场地</button></div>`;
}

function ROUTE_BY_ID_NAME(id: string): string {
  return routeChoices().find((r) => r.id === id)?.name ?? id;
}

export interface SeasonHooks {
  toast: (msg: string) => void;
  log: (text: string) => void;
  onVenue: () => void;
  refresh: () => void;
  openBracket: () => void;
  openOffseason: () => void;
  close: () => void;
  continueEnding: () => void;
}

export function bindSettlement(hooks: SeasonHooks): void {
  document.getElementById('toBreak')?.addEventListener('click', () => hooks.openOffseason());
  document.getElementById('toBracket')?.addEventListener('click', () => hooks.openBracket());
}

export function bindBracket(hooks: SeasonHooks): void {
  document.getElementById('bracketClose')?.addEventListener('click', () => hooks.close());
  document.getElementById('bracketBreak')?.addEventListener('click', () => hooks.openOffseason());
}

export function bindEnding(hooks: SeasonHooks): void {
  document.getElementById('endingContinue')?.addEventListener('click', () => hooks.continueEnding());
}

export function bindOffseason(state: GameState, hooks: SeasonHooks): void {
  const root = document.getElementById('modalBody');
  if (!root) return;
  const tell = (logs: string[], ok: boolean, reason?: string) => {
    if (!ok) hooks.toast(reason ?? '现在不行');
    for (const line of logs) hooks.log(line);
    if (ok) hooks.toast(logs[0] ?? '好了');
    hooks.refresh();
  };
  root.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = moveVenue(state, Number(btn.dataset.move));
      if (r.ok) hooks.onVenue();
      tell(r.logs, r.ok, r.reason);
    });
  });
  document.getElementById('recruitBtn')?.addEventListener('click', () => {
    const r = recruitMember();
    if (!r.ok) {
      hooks.toast(r.reason ?? '招新人是 DLC，本体一直是这 6 个人');
      return;
    }
    tell(r.logs, r.ok, r.reason);
  });
  const paintRoutes = () => {
    const id = (document.getElementById('routeWho') as HTMLSelectElement | null)?.value ?? ROSTER[0]?.id;
    const member = state.roster.find((m) => m.id === id);
    root.querySelectorAll<HTMLButtonElement>('[data-route]').forEach((btn) => {
      const route = routeChoices().find((r) => r.id === btn.dataset.route);
      if (!route || !member) return;
      const fit = routeFit(member.ability, member.persona, route);
      btn.innerHTML = `${esc(route.name)} <small>适配 ${fit}</small>`;
    });
    const now = document.getElementById('routeNow');
    if (!now || !member) return;
    const cur = member.route ? (ROUTE_BY_ID[member.route] ?? null) : null;
    const fit = cur ? routeFit(member.ability, member.persona, cur) : null;
    const grind = member.routeGrindUntil >= state.clock.day ? ` · 磨合到第 ${member.routeGrindUntil} 天` : '';
    const trait = member.routeTrait ? ` · 特性「${member.routeTrait}」` : '';
    now.textContent = cur
      ? `当前：${cur.name}（适配 ${fit}）${grind}${trait}`
      : '当前：还没定路线';
  };
  document.getElementById('routeWho')?.addEventListener('change', paintRoutes);
  paintRoutes();
  root.querySelectorAll<HTMLButtonElement>('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (document.getElementById('routeWho') as HTMLSelectElement | null)?.value ?? '';
      if (state.insight < ROUTE_CHANGE_INSIGHT) {
        hooks.toast(`心得不够。换路线要 ${ROUTE_CHANGE_INSIGHT}，现在只有 ${state.insight}。`);
        return;
      }
      const r = changeRoute(state, id, btn.dataset.route ?? '');
      tell(r.logs, r.ok, r.reason);
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-pay]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = btn.dataset.pay as 'table' | 'low' | 'bond';
      const r = talkSalary(state, btn.dataset.who ?? '', choice);
      tell(r.logs, r.ok, r.reason);
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-sponsor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = signSponsor(state, btn.dataset.sponsor ?? '');
      if (r.ok) {
        const name = SPONSORS.find((s) => s.id === btn.dataset.sponsor)?.name ?? '';
        hooks.log(`休赛期谈下了赞助：${name}。`);
        hooks.toast(`签了 ${name}`);
      } else hooks.toast(r.reason ?? '谈不下来');
      hooks.refresh();
    });
  });
  document.getElementById('breakBracket')?.addEventListener('click', () => hooks.openBracket());
  document.getElementById('breakClose')?.addEventListener('click', () => hooks.close());
}
