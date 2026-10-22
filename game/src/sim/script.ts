// 把一场比赛的日志收成直播条目，并插进替补的第二解说
import { pick, type Rand } from '../core/rng';
import { ROSTER_BY_ID } from '../data/roster';
import type { MatchEvent, MatchResult } from '../engine/match';

export type CueKind = 'draft' | 'node' | 'kill' | 'note' | 'highlight' | 'blunder' | 'danmaku' | 'result';

export interface Cue {
  kind: CueKind;
  text: string;
  killsUs: number;
  killsThem: number;
  goldUs: number;
  goldThem: number;
}

const BENCH_EXTRA: Record<string, string[]> = {
  piegan: [
    '让我上我也不拿石头人',
    '对面什么打野啊，3 分钟来一次，5 分钟又来一次',
    '这波要是我，剑魔直接开大',
    '上路这样，对面上单要成大爹了',
  ],
  aji: ['这套出装有理论的', '我要拿出我的兜裆布了', '五个位置哪里都能撑，哪里都能崩'],
  dangdeng: ['三分钟没优势就没得打', '你这出装谁教的', '早说投了'],
  gouliang: ['记住了，我只玩一把', '是我的', 'my bad', '这波反杀看见没'],
  dibi: ['没事，下一把', '又碰到刺客了'],
  diaolong: ['最新外号，这波叫“空气钩”', '钩子要是我来，这波就开了'],
};

export function benchLines(id: string): string[] {
  const def = ROSTER_BY_ID[id];
  return [...(def?.catchphrases ?? []), ...(BENCH_EXTRA[id] ?? ['这波我在台下都看笑了'])];
}

export function benchQuip(id: string, rng: Rand): string {
  const lines = benchLines(id);
  return pick(rng, lines);
}

function kindOf(ev: MatchEvent): CueKind {
  if (ev.t === 'draft') return 'draft';
  if (ev.t === 'bl') return 'blunder';
  if (ev.t === 'hl') return 'highlight';
  if (ev.t === 'nd') return ev.s.includes('比赛结束') ? 'result' : 'node';
  if (ev.s.includes('击杀')) return 'kill';
  return 'note';
}

export function cuesFrom(result: MatchResult, benchId: string | null, rng: Rand): Cue[] {
  const name = benchId ? (ROSTER_BY_ID[benchId]?.name ?? benchId) : '';
  const cues: Cue[] = [];
  let nodes = 0;
  for (const ev of result.log) {
    const kind = kindOf(ev);
    const cue: Cue = {
      kind,
      text: ev.s,
      killsUs: ev.killsA,
      killsThem: ev.killsB,
      goldUs: ev.goldA,
      goldThem: ev.goldB,
    };
    cues.push(cue);
    if (benchId && kind === 'node') {
      nodes++;
      if (nodes % 2 === 1) {
        cues.push({
          kind: 'danmaku',
          text: `【第二解说 · ${name}】${benchQuip(benchId, rng)}`,
          killsUs: ev.killsA,
          killsThem: ev.killsB,
          goldUs: ev.goldA,
          goldThem: ev.goldB,
        });
      }
    }
  }
  return cues;
}
