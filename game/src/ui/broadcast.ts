// 直播：一条一条放事件，不是一键出结果
import type { BoxRow } from '../engine/match';
import { SLOT_CN } from '../engine/match';
import type { Cue } from '../sim/script';

export function mountBroadcast(opts: {
  title: string;
  sub: string;
  cues: Cue[];
  start: number;
  box: BoxRow[];
  button: string;
  onCursor: (n: number) => void;
  onDone: () => void;
}): () => void {
  const root = document.getElementById('modalBody');
  if (!root) return () => {};
  root.classList.add('live', 'sheet');
  root.innerHTML = `
    <div class="sheet-scroll">
    <div class="live-head">
      <div>
        <h2>${opts.title}</h2>
        <p class="sub">${opts.sub}</p>
      </div>
      <div class="scorebug"><b id="bugUs">0</b><span>:</span><b id="bugThem">0</b><small id="bugGold">经济 +0</small></div>
    </div>
    <div class="live-feed" id="liveFeed"></div>
    <div id="liveBoard" class="hidden"></div>
    <div class="danmaku-layer" id="danmakuLayer"></div>
    </div>
    <div class="dock">
      <button class="btn" id="livePause">暂停直播</button>
      <button class="btn" id="liveFast">快进</button>
      <button class="btn accent hidden" id="liveDone">${opts.button}</button>
    </div>`;

  const feed = document.getElementById('liveFeed')!;
  const layer = document.getElementById('danmakuLayer')!;
  let i = Math.max(0, Math.min(opts.start, opts.cues.length));
  let gap = 720;
  let stopped = false;
  let playing = false;
  let raf = 0;
  let acc = 0;
  let lastTick = 0;
  const flyQueue: string[] = [];
  let flyBusy = false;
  let flyAnim: Animation | null = null;

  // 弹幕只进底轨，不写进事件列表。快进时排队，避免一条还没飞完就被下一条挤掉。
  const pumpFly = () => {
    if (stopped || flyBusy || !flyQueue.length) return;
    const text = flyQueue.shift();
    if (!text) return;
    flyBusy = true;
    const fly = document.createElement('span');
    fly.className = 'danmaku-fly';
    fly.textContent = text;
    layer.replaceChildren(fly);
    const laneW = layer.clientWidth || layer.getBoundingClientRect().width || 480;
    const textW = fly.offsetWidth || 160;
    const start = Math.max(8, laneW - Math.min(textW, laneW - 24));
    flyAnim = fly.animate(
      [
        { transform: `translate3d(${start}px,0,0)` },
        { transform: `translate3d(${-textW - 8}px,0,0)` },
      ],
      { duration: 6500, easing: 'linear', fill: 'forwards' },
    );
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      flyBusy = false;
      flyAnim = null;
      if (!flyQueue.length && fly.isConnected) fly.remove();
      pumpFly();
    };
    flyAnim.onfinish = done;
    window.setTimeout(done, 6800);
  };

  const paint = (cue: Cue) => {
    const us = document.getElementById('bugUs');
    const them = document.getElementById('bugThem');
    const gold = document.getElementById('bugGold');
    if (us) us.textContent = String(cue.killsUs);
    if (them) them.textContent = String(cue.killsThem);
    if (gold) {
      const d = cue.goldUs - cue.goldThem;
      gold.textContent = `经济 ${d >= 0 ? '+' : ''}${d}`;
    }
    if (cue.kind === 'danmaku') {
      flyQueue.push(cue.text);
      pumpFly();
      return;
    }
    const row = document.createElement('div');
    row.className = `live-line ${cue.kind}`;
    row.textContent = cue.text;
    feed.appendChild(row);
    feed.scrollTop = feed.scrollHeight;
  };

  const stopLoop = () => {
    playing = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const showEnd = () => {
    stopLoop();
    const board = document.getElementById('liveBoard');
    if (board) {
      board.classList.remove('hidden');
      const rows = opts.box.filter((r) => r.side === 'A');
      board.innerHTML = `<table class="standings"><tr><th>位置</th><th>选手</th><th>英雄</th><th>KDA</th><th></th></tr>${rows
        .map((r) => `<tr><td>${SLOT_CN[r.slot]}</td><td>${r.name}${r.mvp ? ' · MVP' : ''}</td><td>${r.hero}</td><td>${r.k}/${r.d}/${r.a}</td><td>${r.grade}</td></tr>`)
        .join('')}</table>`;
    }
    document.getElementById('liveDone')?.classList.remove('hidden');
    document.getElementById('liveFast')?.classList.add('hidden');
  };

  const step = () => {
    if (stopped) return;
    if (i >= opts.cues.length) {
      showEnd();
      return;
    }
    paint(opts.cues[i]);
    i++;
    opts.onCursor(i);
    if (i >= opts.cues.length) showEnd();
  };

  const frame = (now: number) => {
    if (stopped || !playing) return;
    const fast = gap <= 50;
    const dt = Math.min(fast ? 500 : 100, Math.max(0, now - lastTick));
    lastTick = now;
    acc += dt;
    let burst = 0;
    const burstMax = fast ? 8 : 1;
    while (playing && !stopped && acc >= gap && i < opts.cues.length && burst < burstMax) {
      acc -= gap;
      step();
      burst++;
    }
    if (stopped || !playing || i >= opts.cues.length) return;
    raf = requestAnimationFrame(frame);
  };

  const arm = () => {
    stopLoop();
    if (i >= opts.cues.length) {
      showEnd();
      return;
    }
    playing = true;
    acc = 0;
    lastTick = performance.now();
    raf = requestAnimationFrame(frame);
  };

  if (i > 0) {
    for (let k = 0; k < i && k < opts.cues.length; k++) paint(opts.cues[k]);
  }
  if (i >= opts.cues.length) showEnd();
  else arm();

  document.getElementById('livePause')?.addEventListener('click', () => {
    const btn = document.getElementById('livePause');
    if (playing) {
      stopLoop();
      if (btn) btn.textContent = '继续直播';
    } else if (i < opts.cues.length) {
      if (btn) btn.textContent = '暂停直播';
      arm();
    }
  });
  document.getElementById('liveFast')?.addEventListener('click', () => {
    gap = 40;
    acc = gap;
    if (!playing && i < opts.cues.length) arm();
  });
  document.getElementById('liveDone')?.addEventListener('click', () => {
    stopped = true;
    stopLoop();
    opts.onDone();
  });

  return () => {
    stopped = true;
    flyQueue.length = 0;
    flyAnim?.cancel();
    stopLoop();
    root.classList.remove('live', 'sheet');
  };
}
