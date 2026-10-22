// 赛前 / 局间：选 5 个首发和战术
import { dayInfo, opponentForRound } from '../core/calendar';
import { TIER_CN } from '../data/leagues';
import { POSITION_CN, POSITIONS, ROSTER } from '../data/roster';
import { TACTICS, type TacticId } from '../data/tactics';
import type { GameState } from '../save/state';
import { winsNeeded, standings } from '../sim/league';
import { lineupSlots, researchTactic } from '../sim/lineup';

const esc = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

export function prematchHtml(state: GameState, intermission: boolean): string {
  const info = dayInfo(state.clock.day);
  const opp = info.round == null ? null : opponentForRound(state.season.tier, info.round);
  const slots = state.lineup?.day === state.clock.day && state.lineup.slots.length === 5 ? state.lineup.slots : lineupSlots(state, state.clock.day);
  const tactic = state.lineup?.day === state.clock.day ? state.lineup.tactic : (state.tactics[0] ?? 'engage');
  const bench = ROSTER.filter((m) => !slots.includes(m.id)).map((m) => m.name);
  const series = state.series;
  const bo = winsNeeded(state.season.tier) === 1 ? 'BO1' : 'BO3';
  const table = standings(state)
    .map((r) => `<tr class="${r.id === 'ssb' ? 'us' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.w}</td><td>${r.l}</td></tr>`)
    .join('');
  const options = (current: string) =>
    ROSTER.map((m) => `<option value="${m.id}" ${m.id === current ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const tactics = TACTICS.map((t) => {
    const owned = state.tactics.includes(t.id);
    if (owned) {
      return `<label class="tac"><input type="radio" name="tac" value="${t.id}" ${t.id === tactic ? 'checked' : ''}/> <b>${t.name}</b><small>${esc(t.desc)}</small></label>`;
    }
    const why = state.insight < t.cost ? `心得 ${state.insight}/${t.cost}` : `花 ${t.cost} 心得`;
    return `<div class="tac locked"><b>${t.name}</b><small>${esc(t.desc)}</small><button class="btn" data-research="${t.id}" ${state.insight < t.cost ? 'disabled' : ''}>${why}</button></div>`;
  }).join('');
  return `
    <h2>${intermission ? '局间换人' : '比赛日'} · 第 ${info.round ?? '?'} 轮</h2>
    <p>${TIER_CN[state.season.tier]} · ${bo}${series && intermission ? ` · 目前 ${series.us}:${series.them}` : ''} · 19:00 vs <b>${esc(opp?.name ?? '对手')}</b></p>
    <p class="sub">${esc(opp?.blurb ?? '')}</p>
    <h3>首发</h3>
    <div class="lineup pick">
      ${POSITIONS.map((pos, i) => `<label>${POSITION_CN[pos]}<select id="slot${i}">${options(slots[i] ?? '')}</select></label>`).join('')}
    </div>
    <p class="sub" id="benchLine">台下第二解说：${esc(bench.join('、') || '—')}</p>
    <h3>战术</h3>
    <div class="tac-list">${tactics}</div>
    <h3>积分榜</h3>
    <table class="standings"><tr><th>#</th><th>战队</th><th>胜</th><th>负</th></tr>${table}</table>
    <div class="row"><button class="btn accent" id="pmOk">${intermission ? '确认，打下一局' : '确认首发，开赛'}</button></div>`;
}

export function bindPrematch(
  state: GameState,
  hooks: { onConfirm: (slots: string[], tactic: TacticId) => void; onRefresh: () => void; toast: (s: string) => void },
): void {
  const root = document.getElementById('modalBody');
  if (!root) return;
  const readSlots = () => POSITIONS.map((_, i) => (root.querySelector(`#slot${i}`) as HTMLSelectElement).value);
  const paintBench = () => {
    const slots = readSlots();
    const names = ROSTER.filter((m) => !slots.includes(m.id)).map((m) => m.name);
    const el = document.getElementById('benchLine');
    if (el) el.textContent = `台下第二解说：${names.join('、') || '有人重复了，先改开'}`;
  };
  root.querySelectorAll('select').forEach((sel) => sel.addEventListener('change', paintBench));
  root.querySelectorAll<HTMLButtonElement>('[data-research]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.research as TacticId;
      const res = researchTactic(state, id);
      if (!res.ok) hooks.toast(res.reason ?? '研究不了');
      else hooks.toast(`学会了${TACTICS.find((t) => t.id === id)?.name ?? ''}`);
      hooks.onRefresh();
    });
  });
  document.getElementById('pmOk')?.addEventListener('click', () => {
    const slots = readSlots();
    if (new Set(slots).size !== 5) {
      hooks.toast('五个人不能重复');
      return;
    }
    const picked = root.querySelector<HTMLInputElement>('input[name="tac"]:checked');
    const tactic = (picked?.value ?? state.tactics[0] ?? 'engage') as TacticId;
    if (!state.tactics.includes(tactic)) {
      hooks.toast('这个战术还没研究');
      return;
    }
    hooks.onConfirm(slots, tactic);
  });
}
