// 事件板：时间倒序；日常灰色可折叠、有趣正常、剧情高亮卡片、重大置顶
import { MEMBERS } from '../config.js';

const COLOR = Object.fromEntries(MEMBERS.map((m) => [m.id, '#' + m.look.shirt.toString(16).padStart(6, '0')]));
const NAMES = MEMBERS.map((m) => m.name);
const NAME_RE = new RegExp(`(${NAMES.join('|')})`, 'g');
const LEVEL_CLASS = { 日常: 'daily', 有趣: 'fun', 剧情: 'story', 重大: 'major' };

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Board {
  constructor({ onMember }) {
    this.feed = document.getElementById('feed');
    this.pinned = document.getElementById('pinned');
    this.count = document.getElementById('boardCount');
    this.foldDaily = document.getElementById('foldDaily');
    this.onMember = onMember;
    this.entries = [];
    this.filter = 'all';
    this.expanded = new Set();
    this.openFolds = new Set();
    this.pins = [];

    this.foldDaily.addEventListener('change', () => this.render());
    document.querySelectorAll('.seg[data-filter]').forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll('.seg[data-filter]').forEach((x) => x.classList.toggle('on', x === b));
        this.filter = b.dataset.filter;
        this.render();
      }),
    );
    this.feed.addEventListener('click', (e) => this.onClick(e));
    this.pinned.addEventListener('click', (e) => this.onClick(e));

    // 手机抽屉
    const board = document.getElementById('board');
    document.getElementById('drawerHandle').addEventListener('click', () => board.classList.toggle('open'));
    let startY = null;
    board.addEventListener('touchstart', (e) => {
      if (e.target.closest('#drawerHandle, .board-head')) startY = e.touches[0].clientY;
    }, { passive: true });
    board.addEventListener('touchend', (e) => {
      if (startY == null) return;
      const dy = e.changedTouches[0].clientY - startY;
      if (dy < -30) board.classList.add('open');
      if (dy > 30) board.classList.remove('open');
      startY = null;
    });
  }

  onClick(e) {
    const chip = e.target.closest('[data-member]');
    if (chip) {
      e.stopPropagation();
      this.onMember(chip.dataset.member);
      return;
    }
    const fold = e.target.closest('.fold-row');
    if (fold) {
      this.openFolds.add(fold.dataset.fold);
      this.render();
      return;
    }
    const ev = e.target.closest('.ev');
    if (!ev) return;
    const uid = +ev.dataset.uid;
    if (this.expanded.has(uid)) this.expanded.delete(uid);
    else this.expanded.add(uid);
    this.render();
  }

  add(entry) {
    this.entries.unshift(entry);
    if (this.entries.length > 300) this.entries.pop();
    if (entry.level === '重大' && !entry.divider) {
      this.pins.unshift(entry);
      this.pins = this.pins.slice(0, 2);
    }
    this.render(entry.uid);
  }

  divider(text) {
    this.entries.unshift({ uid: `d${Date.now()}${Math.random()}`, divider: true, text });
    this.render();
  }

  // 定格图片到达后刷新（仅在展开时可见）
  refresh(uid) {
    if (this.expanded.has(uid)) this.render();
  }

  textHtml(entry) {
    return esc(entry.text).replace(NAME_RE, (n) => {
      const m = MEMBERS.find((x) => x.name === n);
      return `<span class="name-link" data-member="${m.id}">${n}</span>`;
    });
  }

  entryHtml(e, fresh) {
    const cls = LEVEL_CLASS[e.level] || 'fun';
    const anim = fresh ? '' : ' style="animation:none"';
    const tone = e.tone ? ` ${e.tone}` : '';
    const ml = e.matchLine ? ' match-line' : '';
    let head = `<div class="meta"><span class="time">${e.time}</span>`;
    if (cls === 'daily') {
      return `<div class="ev daily" data-uid="${e.uid}"${anim}><span class="time">${e.time}</span><span class="text">${this.textHtml(e)}</span>${this.detailHtml(e)}</div>`;
    }
    head += `<span class="tag">${e.matchLine ? '比赛' : e.category}</span>`;
    if (cls === 'story' || cls === 'major') head += `<span class="title">${e.level} · ${esc(e.name)}</span>`;
    head += '</div>';
    const next = cls === 'story' && e.next?.length ? `<div class="next">后续可能：${e.next.map(esc).join('、')}……</div>` : '';
    return `<div class="ev ${cls}${ml}${tone}" data-uid="${e.uid}"${anim}>${head}<div class="text">${this.textHtml(e)}</div>${next}${this.detailHtml(e)}</div>`;
  }

  detailHtml(e) {
    if (!this.expanded.has(e.uid)) return '';
    const ps = e.participants.map((p) => `<span class="pchip" data-member="${p.id}"><i style="background:${COLOR[p.id]}"></i>${p.name}</span>`).join('');
    const parts = [`<div><b>参与者</b>${ps || '—'}</div>`];
    if (e.cause) parts.push(`<div><b>前因</b>${this.textHtml({ text: e.cause })}</div>`);
    if (e.effects?.length) parts.push(`<div><b>后果</b>${e.effects.map(esc).join('；')}</div>`);
    if (e.next?.length) parts.push(`<div><b>连锁</b>提高了「${e.next.map(esc).join('」「')}」今天发生的概率</div>`);
    parts.push(e.snap ? `<div><b>画面定格</b><img src="${e.snap}" alt="当时画面" /></div>` : '<div><b>画面定格</b>（回填的历史事件没有定格）</div>');
    if (e.eventId) parts.push(`<div class="id">${e.eventId}</div>`);
    return `<div class="detail">${parts.join('')}</div>`;
  }

  render(freshUid) {
    const fold = this.foldDaily.checked;
    // 已置顶的重大事件不在信息流里重复出现
    const list = this.entries.filter((e) => !this.pins.includes(e) && (e.divider || this.filter === 'all' || e.level !== '日常'));
    const html = [];
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const key = String(run[run.length - 1].uid);
      if (fold && run.length >= 2 && !this.openFolds.has(key)) {
        html.push(this.entryHtml(run[0], run[0].uid === freshUid));
        html.push(`<div class="fold-row" data-fold="${key}">··· 还有 ${run.length - 1} 条日常（点击展开）</div>`);
      } else for (const e of run) html.push(this.entryHtml(e, e.uid === freshUid));
      run = [];
    };
    for (const e of list) {
      if (e.divider) {
        flush();
        html.push(`<div class="divider">${esc(e.text)}</div>`);
      } else if (e.level === '日常') run.push(e);
      else {
        flush();
        html.push(this.entryHtml(e, e.uid === freshUid));
      }
    }
    flush();
    const scroll = this.feed.scrollTop;
    this.feed.innerHTML = html.join('');
    this.feed.scrollTop = scroll;
    this.pinned.innerHTML = this.pins.map((e) => this.entryHtml(e, false)).join('');
    const n = this.entries.filter((e) => !e.divider).length;
    this.count.textContent = `今日 ${n} 条`;
  }
}
