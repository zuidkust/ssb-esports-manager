// 人物卡片：此刻在干嘛、状态、训练路线、能力（7 属性）、性格、交情
import { ABILITY_CN, ABILITY_KEYS, PERSONA_KEYS, POSITION_CN, ROSTER_BY_ID, comboOf, type AbilityKey } from '../data/roster';
import { routeFit } from '../data/routes';
import { fmtHM } from '../core/clock';
import { visibleLogText } from './board';
import { STATUS_KEYS } from '../save/state';
import { activeTraitRoute, routeOf } from '../sim/growth';
import type { World } from '../sim/world';

const STATUS_COLOR: Record<string, string> = { 体力: '#5dd39e', 心情: '#f0a35e', 专注: '#5a8dee', 手感: '#e9c46a', 饥饿: '#ff7b6b', 疲劳: '#9aa3b5', 压力: '#c77dff' };
const BOND_TIERS: [number, string][] = [[85, '铁哥们'], [65, '好兄弟'], [40, '朋友'], [20, '队友'], [0, '同事']];
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

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
    const food = d.taste.favorites.length ? '汉堡炸鸡' : '不挑';
    const tea = d.taste.milkTea ? '奶茶随便' : '奶茶换成可乐';
    const offal = d.taste.avoidTags.length ? `，不吃${d.taste.avoidTags.join('、')}` : '';
    const combo = comboOf(d.id);
    const partner = combo ? ROSTER_BY_ID[combo.a === d.id ? combo.b : combo.a]?.name : '';
    const route = routeOf(st);
    const fit = route ? routeFit(st.ability, st.persona, route) : null;
    const trait = activeTraitRoute(st);
    const main = route?.main ?? null;
    const mainVal = main ? st.ability[main] : 0;
    const progress = main ? Math.min(100, (mainVal / 70) * 100) : 0;
    const lastText = (Object.entries(st.lastGain ?? {}) as [AbilityKey, number][])
      .filter(([, v]) => v >= 0.05)
      .map(([k, v]) => `${ABILITY_CN[k]} +${v.toFixed(1)}`)
      .join(' · ');
    const html = `
      <div class="card-head">
        <div class="avatar" style="background:linear-gradient(135deg, ${hex(d.look.shirt)}, #1d2333)">${d.name[0]}</div>
        <div>
          <div class="card-name">${d.name}</div>
          <div class="card-sub">${POSITION_CN[d.position]}${d.secondary ? ` / 次位 ${POSITION_CN[d.secondary]}` : ''}${world.starters.includes(m.id) ? ' · 首发' : ' · 替补'}</div>
        </div>
        <button class="icon-btn card-close" title="关闭">✕</button>
      </div>
      <p class="card-tagline">${d.tagline}</p>
      <div class="card-now"><small>此刻在干嘛</small>${m.activity.label}</div>
      <div class="card-sec"><h4>状态 <span>今天摸鱼 ${Math.round(m.slackMin)} 分钟</span></h4>
        ${STATUS_KEYS.map((k) => this.bar(k, st.status[k], STATUS_COLOR[k])).join('')}</div>
      <div class="card-sec"><h4>训练 <span>${route ? `适配 ${fit}` : '还没定路线'}</span></h4>
        ${route
          ? `<div>路线「${route.name}」${st.routeGrindUntil >= world.state.clock.day ? ` · 磨合到第 ${st.routeGrindUntil} 天` : ''}</div>
             <div>主属性 ${main ? ABILITY_CN[main] : '—'}${main && mainVal >= 70 && !st.routeTrait ? ' · 已到 70，等一场比赛开窍' : ''}</div>
             <div class="bar"><span>开窍线</span><div class="track"><div class="fill" style="width:${Math.max(2, progress)}%;background:linear-gradient(90deg,#f0a35e,#ffd08a)"></div></div><span class="num">${main ? Math.round(mainVal) : '—'}</span></div>
             ${st.routeTrait ? `<div>已开窍：特性「${st.routeTrait}」${trait ? ` · ${trait.traitNote}` : ''}</div>` : ''}
             <div>昨日：${lastText || '没有明显增长'}</div>`
          : '<div>休赛期可以选一条路线。每天按路线成长。</div>'}
      </div>
      <div class="card-sec"><h4>人设</h4>
        <div>招牌 ${d.heroes.join('、')}${d.heroNote ? `。${d.heroNote}` : ''}</div>
        ${d.draft?.neverPicks.length ? `<div>不选 ${d.draft.neverPicks.join('、')}。队伍想要开团上单，尤其${d.draft.teamWants.join('、')}，他不拿。</div>` : ''}
        <div>口头禅「${d.catchphrases[0] ?? ''}」</div>
        <div>外卖 ${food}（${d.taste.drinks}；${tea}${offal}）</div>
        <div>怎么哄 ${d.cheer}</div>
        ${combo ? `<div>和${partner}的${combo.lane}连招 ${combo.name}</div>` : ''}
      </div>
      <div class="card-sec"><h4>能力 <span>当前能力</span></h4>
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
