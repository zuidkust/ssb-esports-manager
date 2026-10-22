// 事件看板：新的在上；按天分隔；日常可折叠成一行
import { fmtHM } from '../core/clock';
import { dayInfo } from '../core/calendar';
import { ROSTER } from '../data/roster';
import type { LogEntry } from '../save/state';

const LEVEL_CLASS: Record<LogEntry['level'], string> = { 日常: 'daily', 有趣: 'fun', 剧情: 'story', 重大: 'major' };
const NAMES = ROSTER.map((m) => m.name);
const NAME_RE = new RegExp(`(${NAMES.join('|')})`, 'g');

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export class Board {
  private feed = document.getElementById('feed')!;
  private count = document.getElementById('boardCount')!;
  private fold = document.getElementById('foldDaily') as HTMLInputElement;
  private entries: LogEntry[] = [];
  private openFolds = new Set<number>();

  constructor(private onName: (id: string) => void) {
    this.fold.addEventListener('change', () => this.render());
    this.feed.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const who = t.closest<HTMLElement>('.who');
      if (who) return this.onName(ROSTER.find((m) => m.name === who.textContent)!.id);
      const f = t.closest<HTMLElement>('.fold-row');
      if (f) {
        this.openFolds.add(+f.dataset.k!);
        this.render();
      }
    });
  }

  set(entries: LogEntry[]) {
    this.entries = entries;
    this.render();
  }

  render() {
    const out: string[] = [];
    let lastDay = -1;
    let foldRun: LogEntry[] = [];
    const flush = () => {
      if (!foldRun.length) return;
      const k = foldRun[foldRun.length - 1].id;
      if (this.fold.checked && foldRun.length > 2 && !this.openFolds.has(k)) {
        out.push(this.item(foldRun[0]));
        out.push(`<div class="fold-row" data-k="${k}">· · · 还有 ${foldRun.length - 1} 条日常（点击展开）</div>`);
      } else out.push(...foldRun.map((e) => this.item(e)));
      foldRun = [];
    };
    for (const e of this.entries.slice(0, 160)) {
      if (e.day !== lastDay) {
        flush();
        const d = dayInfo(e.day);
        out.push(`<div class="day-divider">第 ${d.season} 赛季 · 第 ${d.dayInSeason} 天 ${d.weekdayCn}${d.round ? ` · 第 ${d.round} 轮比赛日` : ''}</div>`);
        lastDay = e.day;
      }
      if (e.level === '日常') foldRun.push(e);
      else {
        flush();
        out.push(this.item(e));
      }
    }
    flush();
    this.feed.innerHTML = out.join('') || '<div class="day-divider">还没有动态</div>';
    const today = this.entries.length ? this.entries.filter((e) => e.day === this.entries[0].day).length : 0;
    this.count.textContent = `今日 ${today} 条`;
  }

  private item(e: LogEntry) {
    const text = esc(e.text).replace(NAME_RE, '<span class="who name-link">$1</span>');
    if (e.level === '日常') return `<div class="ev daily"><span class="time">${fmtHM(e.minute)}</span><span class="text">${text}</span></div>`;
    return `<div class="ev ${LEVEL_CLASS[e.level]}"><div class="meta"><span class="time">${fmtHM(e.minute)}</span><span class="tag">${e.level}</span></div><div class="text">${text}</div></div>`;
  }
}
