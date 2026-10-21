// 人物卡片：属性条、当前状态、今日战绩、此刻在干嘛、最近相关事件
import { ABILITY_KEYS, STATUS_KEYS, PERSONA_KEYS } from '../config.js';

const STATUS_COLOR = { 体力: '#5dd39e', 心情: '#f0a35e', 专注: '#5a8dee', 手感: '#e9c46a', 饥饿: '#ff7b6b' };
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class Card {
  constructor({ onClose }) {
    this.el = document.getElementById('card');
    this.onClose = onClose;
    this.memberId = null;
    this.el.addEventListener('click', (e) => {
      if (e.target.closest('.card-close')) this.close();
    });
  }

  open(id) {
    this.memberId = id;
    this.el.classList.remove('hidden');
    this.el.style.animation = 'none';
    void this.el.offsetWidth;
    this.el.style.animation = '';
  }

  close() {
    this.memberId = null;
    this.el.classList.add('hidden');
    this.onClose?.();
  }

  bar(label, v, color) {
    return `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.max(2, v)}%;background:${color}"></div></div><span class="num">${Math.round(v)}</span></div>`;
  }

  render(world, director, log) {
    if (!this.memberId) return;
    const m = world.byId[this.memberId];
    const d = m.def;
    const act = director.actions[m.id];
    const actText = act
      ? { rage: '红温中，正在拍桌', cheer: '正在欢呼', sleep: '趴在桌上睡着了', snack: '在茶水区觅食', toilet: '带薪如厕中', board: '围在白板前开会', phone: '低头刷手机', visit: '跑到别人工位聊天', host: '站起来跟来访的人理论' }[act.type]
      : null;
    const now = actText || m.activity.label;
    const t = m.today;
    const games = t.wins + t.losses;
    const rels = world.members.filter((o) => o !== m).map((o) => ({ o, v: world.rel(m, o) })).sort((a, b) => b.v - a.v);
    const mine = log.filter((e) => !e.divider && e.participants?.some((p) => p.id === m.id)).slice(0, 4);

    this.el.innerHTML = `
      <div class="card-head">
        <div class="avatar" style="background:linear-gradient(135deg, ${hex(d.look.shirt)}, #1d2333)">${d.name[0]}</div>
        <div>
          <div class="card-name">${d.name}</div>
          <div class="card-sub">${d.role} · ${d.rank} · 进化方向：${d.evolve}</div>
        </div>
        <button class="icon-btn card-close" title="关闭">✕</button>
      </div>
      <p class="card-tagline">${d.tagline}</p>
      <div class="card-now"><small>此刻在干嘛</small>${now}</div>
      <div class="card-sec">
        <h4>今日战绩</h4>
        <div class="stats-row">
          <div class="stat"><b>${t.wins}-${t.losses}</b><span>胜-负</span></div>
          <div class="stat"><b>${games ? Math.round((t.wins / games) * 100) + '%' : '—'}</b><span>胜率</span></div>
          <div class="stat"><b>${Math.round(t.slackMin)}</b><span>摸鱼(分)</span></div>
          <div class="stat"><b>${t.blamed}</b><span>背锅次数</span></div>
        </div>
        ${t.lastHero ? `<div class="card-tagline" style="margin-top:8px;color:var(--muted)">上一局：${t.lastHero} ${t.lastKda}</div>` : ''}
      </div>
      <div class="card-sec">
        <h4>当前状态 <span>每天早上部分重置</span></h4>
        ${STATUS_KEYS.map((k) => this.bar(k, m.status[k], STATUS_COLOR[k])).join('')}
      </div>
      <div class="card-sec">
        <h4>能力 <span>只靠有效练习增长</span></h4>
        ${ABILITY_KEYS.map((k) => this.bar(k, m.ability[k], 'linear-gradient(90deg,#5a8dee,#8fb3ff)')).join('')}
      </div>
      <div class="card-sec">
        <h4>性格</h4>
        <div class="persona">${PERSONA_KEYS.map((k) => `<span>${k}<em>${Math.round(m.persona[k])}</em></span>`).join('')}</div>
      </div>
      <div class="card-sec">
        <h4>关系</h4>
        <div class="card-events"><div>最铁：<b>${rels[0].o.name}</b>（${Math.round(rels[0].v)}）　最不对付：<b>${rels[rels.length - 1].o.name}</b>（${Math.round(rels[rels.length - 1].v)}）</div></div>
      </div>
      <div class="card-sec">
        <h4>最近相关事件</h4>
        <div class="card-events">${mine.length ? mine.map((e) => `<div><time>${e.time}</time>${e.text}</div>`).join('') : '<div style="color:var(--dim)">今天还没有他的事件</div>'}</div>
      </div>`;
  }
}
