// 赛前 / 局间：选 5 个首发和战术
import { dayInfo, opponentForRound } from '../core/calendar';
import { TIER_CN } from '../data/leagues';
import { POSITION_CN, POSITIONS, ROSTER } from '../data/roster';
import { TACTICS, type TacticId } from '../data/tactics';
import type { GameState } from '../save/state';
import { winsNeeded, standings } from '../sim/league';
import { lineupSlots, researchTactic, validLineup } from '../sim/lineup';

const esc = (s: string) => s.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));

export function standingsTableHtml(state: GameState): string {
  const table = standings(state)
    .map((r) => `<tr class="${r.id === 'ssb' ? 'us' : ''}"><td>${r.rank}</td><td>${esc(r.name)}</td><td>${r.w}</td><td>${r.l}</td></tr>`)
    .join('');
  return `<table class="standings"><tr><th>#</th><th>战队</th><th>胜</th><th>负</th></tr>${table}</table>`;
}

export function prematchHtml(state: GameState, intermission: boolean): string {
  const info = dayInfo(state.clock.day);
  const opp = info.round == null ? null : opponentForRound(state.season.tier, info.round);
  const slots = lineupSlots(state, state.clock.day);
  const tactic = state.lineup?.day === state.clock.day ? state.lineup.tactic : (state.tactics[0] ?? 'engage');
  const bench = ROSTER.filter((m) => !slots.includes(m.id)).map((m) => m.name);
  const series = state.series;
  const bo = winsNeeded(state.season.tier) === 1 ? 'BO1' : 'BO3';
  const takenElsewhere = (index: number) => new Set(slots.filter((_, j) => j !== index));
  const options = (current: string, index: number) => {
    const taken = takenElsewhere(index);
    return ROSTER.map((m) => `<option value="${m.id}" ${m.id === current ? 'selected' : ''} ${taken.has(m.id) ? 'disabled' : ''}>${esc(m.name)}</option>`).join('');
  };
  const tactics = TACTICS.map((t) => {
    const owned = state.tactics.includes(t.id);
    if (owned) {
      return `<label class="tac"><input type="radio" name="tac" value="${t.id}" ${t.id === tactic ? 'checked' : ''}/> <b>${t.name}</b><small>${esc(t.desc)}</small></label>`;
    }
    const why = state.insight < t.cost ? `心得 ${state.insight}/${t.cost}` : `花 ${t.cost} 心得`;
    return `<div class="tac locked"><b>${t.name}</b><small>${esc(t.desc)}</small><button class="btn" data-research="${t.id}" ${state.insight < t.cost ? 'disabled' : ''}>${why}</button></div>`;
  }).join('');
  return `
    <div class="sheet-scroll">
    <h2>${intermission ? '局间换人' : '比赛日'} · 第 ${info.round ?? '?'} 轮</h2>
    <p>${TIER_CN[state.season.tier]} · ${bo}${series && intermission ? ` · 目前 ${series.us}:${series.them}` : ''} · 19:00 vs <b>${esc(opp?.name ?? '对手')}</b></p>
    <p class="sub">${esc(opp?.blurb ?? '')}</p>
    <h3>首发</h3>
    <div class="lineup pick">
      ${POSITIONS.map((pos, i) => `<label>${POSITION_CN[pos]}<select id="slot${i}">${options(slots[i] ?? '', i)}</select></label>`).join('')}
    </div>
    <p class="sub" id="benchLine">台下第二解说：${esc(bench.join('、') || '—')}</p>
    <h3>战术</h3>
    <div class="tac-list">${tactics}</div>
    <h3>积分榜</h3>
    ${standingsTableHtml(state)}
    </div>
    <div class="dock">
      <p class="warn hidden" id="pmErr"></p>
      <button class="btn accent" id="pmOk">${intermission ? '确认，打下一局' : '确认首发，开赛'}</button>
    </div>`;
}

export function bindPrematch(
  state: GameState,
  hooks: { onConfirm: (slots: string[], tactic: TacticId) => void; onRefresh: () => void; toast: (s: string) => void },
): void {
  const root = document.getElementById('modalBody');
  if (!root) return;
  const selects = () => POSITIONS.map((_, i) => root.querySelector(`#slot${i}`) as HTMLSelectElement);
  const readSlots = () => selects().map((sel) => sel.value);
  const showErr = (text: string) => {
    const err = document.getElementById('pmErr');
    if (!err) return;
    err.textContent = text;
    err.classList.toggle('hidden', !text);
  };
  const lockOptions = () => {
    const slots = readSlots();
    selects().forEach((sel, i) => {
      const taken = new Set(slots.filter((_, j) => j !== i));
      for (const opt of sel.options) opt.disabled = taken.has(opt.value);
    });
  };
  const paintBench = () => {
    const slots = readSlots();
    const names = ROSTER.filter((m) => !slots.includes(m.id)).map((m) => m.name);
    const el = document.getElementById('benchLine');
    const dup = new Set(slots).size !== slots.length;
    if (el) el.textContent = dup ? '有人占了两个位置，先改开' : `台下第二解说：${names.join('、') || '—'}`;
  };
  const onPick = (changed: HTMLSelectElement) => {
    for (const other of selects()) {
      if (other === changed || other.value !== changed.value) continue;
      const used = new Set(selects().filter((s) => s !== other).map((s) => s.value));
      const free = ROSTER.find((m) => !used.has(m.id));
      if (free) other.value = free.id;
    }
    lockOptions();
    paintBench();
    showErr('');
  };
  lockOptions();
  selects().forEach((sel) => sel.addEventListener('change', () => onPick(sel)));
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
    if (!validLineup(slots)) {
      const text = '每个选手只能占一个位置';
      showErr(text);
      hooks.toast(text);
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
