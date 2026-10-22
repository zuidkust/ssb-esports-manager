// 经营面板：老板动作、设施、赞助和账本
import { ACTIONS } from '../data/actions';
import { FACILITIES, VENUE_CN } from '../data/facilities';
import { SPONSORS } from '../data/sponsors';
import { actionPointLabel, performAction, previewAction } from '../sim/actions';
import { buyFacility, dropSponsor, goalProgress, ledgerMonthLabel, monthlyDue, monthlyRent, monthlySalaryTotal, nextPaydayIn, signSponsor, skim, sponsorIncome, sponsorLockReason } from '../sim/economy';
import type { World } from '../sim/world';

export interface ManageHooks {
  toast: (msg: string) => void;
  onFacilities: () => void;
  onClose: () => void;
  rerender: (pick: [string, string]) => void;
}

export function manageHtml(world: World, pick: [string, string]): string {
  const s = world.state;
  const day = s.clock.day;
  const minute = s.clock.minute;
  const names = world.members.map((m) => `<option value="${m.id}" ${m.id === pick[0] ? 'selected' : ''}>${m.name}</option>`).join('');
  const namesB = world.members.map((m) => `<option value="${m.id}" ${m.id === pick[1] ? 'selected' : ''}>${m.name}</option>`).join('');
  const due = monthlyDue(s);
  const targetsFor = (id: string) => {
    const def = ACTIONS.find((a) => a.id === id)!;
    if (def.scope === 'global') return [];
    if (def.scope === 'member') return [pick[0]];
    return pick;
  };
  const actions = ACTIONS.map((a) => {
    const preview = previewAction(s, a.id, targetsFor(a.id), day, minute);
    const cost = preview.cost > 0 ? ` · ${preview.cost.toLocaleString('zh-CN')}` : a.id === 'host' ? ' · 餐费按实价' : a.cash === 0 ? ' · 不花钱' : '';
    const scale = preview.ok ? (preview.backfire ? '本次会反噬' : preview.nth > 1 ? `本周第 ${preview.nth} 次 · 效果 ${Math.round(preview.mult * 100)}%` : '效果 100%') : preview.reason;
    return `<div class="act">
      <div><b>${a.name}</b><small>${a.ap} 行动点${cost}<br>${a.blurb}<br>${scale}</small></div>
      <button class="btn" data-act="${a.id}" ${preview.ok ? '' : 'disabled'}${preview.ok ? '' : ` title="${preview.reason}"`}>使用</button>
    </div>`;
  }).join('');
  const facs = FACILITIES.filter((f) => f.price > 0 && f.venue === s.venueLevel).map((f) => {
    const owned = s.facilities.includes(f.id);
    const locked = s.venueLevel < f.venue;
    const reason = owned ? '已购买' : locked ? `${VENUE_CN[f.venue]}解锁` : s.cash < f.price ? '现金不够' : '';
    const price = f.monthly ? `${f.price.toLocaleString('zh-CN')}/月` : f.price.toLocaleString('zh-CN');
    return `<div class="act">
      <div><b>${f.name}</b><small>${VENUE_CN[f.venue]} · ${price}${reason ? ` · ${reason}` : ''}</small></div>
      <button class="btn" data-buy="${f.id}" ${owned || locked || s.cash < f.price ? 'disabled' : ''}${reason ? ` title="${reason}"` : ''}>${owned ? '已有' : '购买'}</button>
    </div>`;
  }).join('');
  const sponsors = SPONSORS.map((sp) => {
    const signed = s.sponsors.includes(sp.id);
    const lock = sponsorLockReason(s, sp.id);
    return `<div class="act">
      <div><b>${sp.name}</b><small>月入 ${sp.income.toLocaleString('zh-CN')} · 目标：${sp.goal}<br>进度：${goalProgress(s, sp.id)}${lock && !signed ? `<br>${lock}` : ''}</small></div>
      ${signed ? `<button class="btn" data-drop="${sp.id}">解约</button>` : `<button class="btn" data-sign="${sp.id}" ${lock ? 'disabled' : ''}${lock ? ` title="${lock}"` : ''}>签约</button>`}
    </div>`;
  }).join('');
  return `
    <h2>经营</h2>
    <p class="sub">${ledgerMonthLabel(day)} · 距发薪 ${nextPaydayIn(day)} 天 · 行动点 ${actionPointLabel(s, day)}</p>
    <div class="ledger">
      <span>现金 <b>${Math.round(s.cash).toLocaleString('zh-CN')}</b></span>
      <span>私房钱 <b>${Math.round(s.privateStash).toLocaleString('zh-CN')}</b></span>
      <span>心得 <b>${s.insight}</b></span>
      <span>本月开支 <b>${due.toLocaleString('zh-CN')}</b></span>
      <span>赞助 <b>${sponsorIncome(s).toLocaleString('zh-CN')}</b></span>
      <span>欠薪 <b>${s.unpaidMonths}/3</b></span>
    </div>
    <p class="sub">工资 ${monthlySalaryTotal(s).toLocaleString('zh-CN')} · 房租 ${monthlyRent(s).toLocaleString('zh-CN')}。付不出时先动私房钱，连续 3 个月才破产。</p>
    <h3>抽成</h3>
    <p class="sub">抽成把公司账上的现金转进老板自己的私房钱。公司少一笔，私房钱多一笔。</p>
    <div class="act-list">
      ${[1000, 5000].map((n) => {
        const why = s.cash < n ? `现金不够 ${n.toLocaleString('zh-CN')}，按不了` : '从公司现金划到私房钱';
        return `<div class="act">
          <div><b>抽成 ${n.toLocaleString('zh-CN')}</b><small>${why}</small></div>
          <button class="btn" data-skim="${n}" ${s.cash < n ? 'disabled' : ''} title="${why}">抽成</button>
        </div>`;
      }).join('')}
    </div>
    <h3>对象</h3>
    <div class="row">
      <select id="actA">${names}</select>
      <select id="actB">${namesB}</select>
    </div>
    <p class="sub">单人动作用左边，双人动作用两个下拉框。全队动作不用选。</p>
    <h3>老板动作</h3>
    <div class="act-list">${actions}</div>
    <h3>设施</h3>
    <p class="sub">只列出${VENUE_CN[s.venueLevel]}能买的。买了才出现在这块场地里。</p>
    <div class="act-list">${facs}</div>
    <h3>赞助</h3>
    <p class="sub">同时最多 2 个。完成上一档目标才解锁下一档。赢场和名次会在比赛打完后推进。</p>
    <div class="act-list">${sponsors}</div>
    <div class="row"><button class="btn accent" id="manageClose">回到场地</button></div>`;
}

function selectedPick(): [string, string] {
  const a = (document.getElementById('actA') as HTMLSelectElement | null)?.value ?? '';
  const b = (document.getElementById('actB') as HTMLSelectElement | null)?.value ?? '';
  return [a, b];
}

export function bindManage(world: World, hooks: ManageHooks) {
  const root = document.getElementById('modalBody')!;
  const targetsFor = (id: string) => {
    const def = ACTIONS.find((a) => a.id === id)!;
    const [a, b] = selectedPick();
    if (def.scope === 'global') return [];
    if (def.scope === 'member') return [a];
    return [a, b];
  };
  const refresh = () => hooks.rerender(selectedPick());
  root.querySelectorAll('select').forEach((el) => el.addEventListener('change', refresh));
  root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.act!;
      const r = performAction(world.state, id, targetsFor(id), {
        day: world.state.clock.day,
        minute: world.state.clock.minute,
        log: (level, text, ids) => world.log(level, text, ids),
      });
      if (!r.ok) hooks.toast(r.reason ?? '做不到');
      else hooks.toast('做完了');
      refresh();
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = buyFacility(world.state, btn.dataset.buy!);
      if (!r.ok) hooks.toast(r.reason ?? '买不了');
      else {
        world.refreshVenue();
        hooks.onFacilities();
        hooks.toast('买好了，已经摆到场地里');
      }
      refresh();
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-sign]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = signSponsor(world.state, btn.dataset.sign!);
      hooks.toast(r.ok ? '签约了' : r.reason ?? '签不了');
      if (r.ok) world.log('剧情', `签下了赞助：${SPONSORS.find((s) => s.id === btn.dataset.sign)?.name}。`, []);
      refresh();
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-drop]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = SPONSORS.find((s) => s.id === btn.dataset.drop)?.name ?? '';
      dropSponsor(world.state, btn.dataset.drop!);
      world.log('日常', `和「${name}」解约了。`, []);
      refresh();
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-skim]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = +btn.dataset.skim!;
      const r = skim(world.state, n);
      hooks.toast(r.ok ? `私房钱 +${n}` : r.reason ?? '抽不了');
      refresh();
    });
  });
  document.getElementById('manageClose')?.addEventListener('click', () => hooks.onClose());
}
