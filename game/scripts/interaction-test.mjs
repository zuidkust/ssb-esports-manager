// 交互自测：真实时间流逝、比赛日 18:30 自动暂停（含暂停中关页再读档）、场地切换、存档 / 刷新 / 继续游戏（file:// 下）
import puppeteer from 'puppeteer-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { findChrome } from './chrome.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = pathToFileURL(path.join(root, 'dist/index.html')).href;
const CHROME = findChrome();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: path.join(root, '.tmp/chrome-profile-' + Date.now()) });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 860 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const g = (fn) => page.evaluate(fn);

// 1. 比赛日 18:20 极快档开跑，应在 18:30 自动停下并弹出赛前窗口
await page.goto(`${html}?t=18:20&day=2&speed=x10`);
await page.waitForFunction(
  () => {
    const modal = document.getElementById('modal');
    return __ssb.clock.paused && Math.abs(__ssb.clock.minute - 1110) < 0.01 && !!modal && !modal.classList.contains('hidden');
  },
  { timeout: 20000 },
);
let s = await g(() => ({ min: __ssb.clock.minute, paused: __ssb.clock.paused, modal: !document.getElementById('modal').classList.contains('hidden') }));
check('18:30 自动暂停并弹出赛前窗口', s.paused && Math.abs(s.min - 1110) < 0.01 && s.modal, JSON.stringify(s));

// 1b. 必须在 18:30 暂停已经发生之后、确认之前，把时钟写进自动存档再关页
await page.evaluate(() => {
  __ssb.state.clock = __ssb.clock.snapshot();
  __ssb.saves.save('auto', __ssb.state);
});
const savedWhilePaused = await g(() => {
  const raw = localStorage.getItem('ssb-esports-manager/save/auto');
  const parsed = raw ? JSON.parse(raw) : null;
  return { minute: parsed?.clock?.minute, paused: parsed?.clock?.paused, confirmed: parsed?.prematchConfirmedDay };
});
check('暂停当下已经把 18:30 写入自动存档', Math.abs(savedWhilePaused.minute - 1110) < 0.01 && savedWhilePaused.confirmed !== 2, JSON.stringify(savedWhilePaused));
await page.goto(html);
await sleep(1500);
await page.click('#tContinue');
await sleep(1200);
s = await g(() => ({ min: __ssb.clock.minute, paused: __ssb.clock.paused, pm: !!document.getElementById('pmOk') }));
check('暂停中关页后读档，仍弹首发确认', s.paused && s.pm && Math.abs(s.min - 1110) < 0.01, JSON.stringify(s));
await page.click('#pmOk');
await page.evaluate(() => document.activeElement && document.activeElement.blur());
await page.keyboard.press('Space');
await sleep(300);
s = await g(() => ({ min: __ssb.clock.minute, paused: __ssb.clock.paused }));
check('确认后先停住，不越过 19:00', s.paused && s.min < 1140, JSON.stringify(s));

// 1c. 确认后读档不再弹
s = await g(() => __ssb.state.prematchConfirmedDay);
check('确认首发写进存档', s === 2, String(s));

// 2. 暂停键与速度键
const m1 = await g(() => __ssb.clock.minute);
await sleep(800);
const m2 = await g(() => __ssb.clock.minute);
check('空格暂停', m1 === m2);
await page.keyboard.press('1');
const speedSample = await page.evaluate(() => ({ t: performance.now(), m: __ssb.clock.minute }));
await sleep(1000);
const speedSample2 = await page.evaluate(() => ({ t: performance.now(), m: __ssb.clock.minute }));
const rate = (speedSample2.m - speedSample.m) / ((speedSample2.t - speedSample.t) / 1000);
check('按 1 恢复正常速度', rate > 0.9 && rate < 2.6, `${rate.toFixed(2)} 游戏分钟/秒`);
await page.keyboard.press('Space');
await sleep(200);

// 3. 存进槽位 1，刷新后标题能继续
await page.keyboard.press('Escape');
await sleep(300);
await page.click('[data-save="1"]');
await sleep(300);
const savedDay = await g(() => __ssb.state.clock.day);
const savedMin = await g(() => __ssb.state.clock.minute);
await page.goto(html);
await sleep(1500);
const cont = await g(() => !document.getElementById('tContinue').disabled);
check('刷新后“继续游戏”可用（file:// 下 localStorage 可写）', cont);
await page.click('[data-load="1"]');
await sleep(800);
s = await g(() => ({ day: __ssb.state.clock.day, min: __ssb.clock.minute, version: __ssb.state.version, route: __ssb.state.roster[0].route }));
check('读档回到保存的时刻', s.day === savedDay && Math.abs(s.min - savedMin) < 2.5, JSON.stringify(s));
check('存档 v7 带默认路线', s.version === 7 && !!s.route, JSON.stringify({ version: s.version, route: s.route }));
await page.evaluate(() => document.activeElement && document.activeElement.blur());
await page.keyboard.press('3');
await sleep(3000);
s = await g(() => ({ min: __ssb.clock.minute, kinds: __ssb.world.members.map((m) => m.activity.kind) }));
check('读档继续走到 19:00 开赛', s.min >= 1140 && s.kinds.filter((k) => k === 'match').length === 5, JSON.stringify(s));

// 4. 夜间快进：22:25（已过 22:00 下班）起，几秒内进入第二天 09:00
await page.goto(`${html}?t=22:25&day=3&speed=x10`);
await sleep(9000);
s = await g(() => ({ day: __ssb.clock.day, min: __ssb.clock.minute, version: __ssb.state.version, route: __ssb.state.roster[0].route, gain: __ssb.state.roster[0].lastGain }));
check('夜间快进到第二天早上', s.day === 4 && s.min >= 540 && s.min < 600, JSON.stringify(s));
check('跨天后 v7 存档有训练成长', s.version === 7 && !!s.route && Object.keys(s.gain ?? {}).length > 0, JSON.stringify({ version: s.version, route: s.route, gain: s.gain }));

// 5. 场地：新开档是网吧角落（无沙发冰箱零食柜），切到小办公室后家具齐全
await page.goto(`${html}?t=10:00&day=3`);
await sleep(1500);
s = await g(() => ({ level: __ssb.venue.level, sofa: !!__ssb.venue.spots.sofa, fridge: !!__ssb.venue.spots.fridge, snack: !!__ssb.venue.spots.snack }));
check('新开档是网吧角落，没有沙发、冰箱、零食柜', s.level === 0 && !s.sofa && !s.fridge && !s.snack, JSON.stringify(s));
await g(() => __ssb.setVenue(1, ['snack', 'fridge', 'sofa', 'whiteboard']));
await sleep(800);
s = await g(() => ({ level: __ssb.venue.level, sofa: !!__ssb.venue.spots.sofa, fridge: !!__ssb.venue.spots.fridge, snack: !!__ssb.venue.spots.snack, wb: !!__ssb.venue.wb }));
check('切到小办公室后家具齐全', s.level === 1 && s.sofa && s.fridge && s.snack && s.wb, JSON.stringify(s));

check('没有页面报错', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('✗')) ? 1 : 0);
