// 人物卡片：此刻在干嘛、状态、能力（7 属性）、性格、交情
import { ABILITY_CN, ABILITY_KEYS, PERSONA_KEYS, POSITION_CN, comboOf } from '../data/roster';
import { DISH_BY_ID } from '../data/takeout';
import { fmtHM } from '../core/clock';
import { visibleLogText } from './board';
import { STATUS_KEYS } from '../save/state';
import type { World } from '../sim/world';

const STATUS_COLOR: Record<string, string> = { 体力: '#5dd39e', 心情: '#f0a35e', 专注: '#5a8dee', 手感: '#e9c46a', 饥饿: '#ff7b6b', 疲劳: '#9aa3b5', 压力: '#c77dff' };
const BOND_TIERS: [number, string][] = [[85, '铁哥们'], [65, '好兄弟'], [40, '朋友'], [20, '队友'], [0, '同事']];
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Card {
  el = document.getElementById('card')!;
  memberId: string | null = null;
  private lastHtml = '';

  constructor(private onClose: () => void) {
    this.el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.card-close')) this.close();
    });
  }

  open(id: string) {
    this.memberId = id;
    this.lastHtml = '';
    this.el.classList.remove('hidden');
  }

  close() {
    this.memberId = null;
    this.el.classList.add('hidden');
    this.onClose();
  }

  private bar(label: string, v: number, color: string) {
    return `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.max(2, v)}%;background:${color}"></div></div><span class="num">${Math.round(v)}</span></div>`;
  }

  render(world: World) {
    if (!this.memberId) return;
    const m = world.byId[this.memberId];
    const d = m.def;
    const st = m.state;
    const bonds = world.members.filter((o) => o !== m).map((o) => ({ o, v: world.bond(m.id, o.id) })).sort((a, b) => b.v - a.v);
    const tier = (v: number) => BOND_TIERS.find(([t]) => v >= t)![1];
    const mine = world.state.eventLog.filter((e) => e.ids.includes(m.id)).slice(0, 4);
    const combos = world.members.map((o) => comboOf(m.id, o.id)).filter((c): c is NonNullable<ReturnType<typeof comboOf>> => !!c);
    const html = `
      <div class="card-head">
        <div class="avatar" style="background:linear-gradient(135deg, ${hex(d.look.shirt)}, #1d2333)">${d.name[0]}</div>
        <div>
          <div class="card-name">${d.name}</div>
          <div class="card-sub">${POSITION_CN[d.position]}${d.secondary ? ` / 次位 ${POSITION_CN[d.secondary]}` : ''}${world.starters.includes(m.id) ? ' · 首发' : ' · 替补'}</div>
        </div>
        <button class="icon-btn card-close" title="关闭">✕</button>
      </div>
      <p class="card-tagline">${esc(d.tagline)}</p>
      <div class="card-now"><small>此刻在干嘛</small>${esc(m.activity.label)}</div>
      <div class="card-sec"><h4>人设</h4>
        <div class="card-events">
          ${d.aliases.length ? `<div>外号　${esc(d.aliases.join('、'))}</div>` : ''}
          ${d.roles.length ? `<div>角色　${esc(d.roles.join('、'))}</div>` : ''}
          <div>英雄　${esc(d.heroes.join('、'))}${d.heroNote ? `。${esc(d.heroNote)}` : ''}</div>
          ${d.avoidHeroes?.length ? `<div>不玩　${esc(d.avoidHeroes.join('、'))}</div>` : ''}
          <div>口头禅　${esc(d.signature[0] ?? '')}</div>
          <div>外卖　${esc(d.taste.favorites.length ? d.taste.favorites.map((id) => DISH_BY_ID[id]?.name ?? id).join('、') : '不挑')}${d.taste.avoidNote ? `，${esc(d.taste.avoidNote)}` : ''}${d.taste.noMilktea ? '，奶茶换成可乐' : ''}</div>
          <div>饮料　${esc(d.taste.drinks.join('、'))}</div>
          <div>哄法　${esc(d.cheer)}</div>
          ${d.softSpots.length ? `<div>雷点　${esc(d.softSpots.join('、'))}</div>` : '<div>雷点　几乎没有</div>'}
          ${combos.map((c) => `<div>连招　${esc(c.roles)}　${esc(c.name)}</div>`).join('')}
        </div></div>
      <div class="card-sec"><h4>状态 <span>今天摸鱼 ${Math.round(m.slackMin)} 分钟</span></h4>
        ${STATUS_KEYS.map((k) => this.bar(k, st.status[k], STATUS_COLOR[k])).join('')}</div>
      <div class="card-sec"><h4>能力 <span>人设初值</span></h4>
        ${ABILITY_KEYS.map((k) => this.bar(ABILITY_CN[k], st.ability[k], 'linear-gradient(90deg,#5a8dee,#8fb3ff)')).join('')}</div>
      <div class="card-sec"><h4>性格</h4>
        <div class="persona">${PERSONA_KEYS.map((k) => `<span>${k}<em>${Math.round(st.persona[k])}</em></span>`).join('')}</div></div>
      <div class="card-sec"><h4>交情</h4>
        <div class="card-events">${bonds.map(({ o, v }) => `<div>${o.name}　<b>${tier(v)}</b>（${Math.round(v)}）</div>`).join('')}</div></div>
      <div class="card-sec"><h4>最近动态</h4>
        <div class="card-events">${mine.length ? mine.map((e) => `<div><time>${fmtHM(e.minute)}</time>${visibleLogText(e.minute, e.text)}</div>`).join('') : '<div style="color:var(--dim)">还没有他的动态</div>'}</div></div>`;
    if (html !== this.lastHtml) {
      this.el.innerHTML = html;
      this.lastHtml = html;
    }
  }
}
