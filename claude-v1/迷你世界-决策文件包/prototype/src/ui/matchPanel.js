// 周赛文字直播面板：比分、经济差、阶段进度（开赛→对线→团战→转折点→结局）、逐条解说
import { TEAM_NAME } from '../config.js';

const PHASES = ['开赛', '对线', '团战', '转折点', '结局'];

export class MatchPanel {
  constructor({ onClose }) {
    this.el = document.getElementById('match');
    this.onClose = onClose;
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('.m-close')) this.onClose?.();
    });
  }

  show(match) {
    this.match = match;
    this.el.classList.remove('hidden');
    this.el.innerHTML = `
      <div class="mh"><span class="live">● LIVE</span><span class="title">本周周赛 · 文字直播（样板演示，节奏已加速）</span><button class="icon-btn m-close" title="关闭">✕</button></div>
      <div class="score">
        <div class="team">${TEAM_NAME}<small>我方</small></div>
        <div><div class="k" id="mk">0 : 0</div><div class="gclock" id="mclock">00:00</div></div>
        <div class="team them">${match.opponent.name}<small>${match.opponent.style}</small></div>
      </div>
      <div class="goldbar"><div class="g" id="mgold"></div><div class="mid"></div></div>
      <div class="goldtxt" id="mgoldtxt">经济持平</div>
      <div class="phases">${PHASES.map((p) => `<span data-p="${p}">${p}</span>`).join('')}</div>
      <div class="mlines" id="mlines"></div>
      <div id="mres"></div>`;
  }

  hide() {
    this.el.classList.add('hidden');
    this.match = null;
  }

  push(line) {
    const $ = (id) => this.el.querySelector(id);
    $('#mk').textContent = `${line.us} : ${line.them}`;
    $('#mclock').textContent = `${String(line.min).padStart(2, '0')}:00`;
    const g = line.gold;
    const pct = Math.min(50, (Math.abs(g) / 8000) * 50);
    const bar = $('#mgold');
    bar.style.left = g >= 0 ? '50%' : `${50 - pct}%`;
    bar.style.width = `${pct}%`;
    bar.style.background = g >= 0 ? 'var(--good)' : 'var(--bad)';
    $('#mgoldtxt').textContent = Math.abs(g) < 100 ? '经济持平' : `我方经济${g > 0 ? '领先' : '落后'} ${(Math.abs(g) / 1000).toFixed(1)}k`;
    const phase = line.phase === '赛后' ? '结局' : line.phase;
    const idx = PHASES.indexOf(phase);
    this.el.querySelectorAll('.phases span').forEach((s, i) => {
      s.classList.toggle('on', i === idx);
      s.classList.toggle('done', i < idx);
    });
    const div = document.createElement('div');
    div.className = `ml ${line.tone}${line.highlight ? ' hl' : ''}`;
    div.innerHTML = `<span class="mt">${line.phase === '赛后' ? '赛后' : String(line.min).padStart(2, '0') + "'"}</span>${line.text}`;
    const box = $('#mlines');
    box.prepend(div);
    if (line.final) $('#mres').innerHTML = `<div class="mresult ${line.win ? 'win' : 'lose'}">${line.win ? '🏆 胜利' : '惜败'} · ${line.us} : ${line.them}</div>`;
  }
}
