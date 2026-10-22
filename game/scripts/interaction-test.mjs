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
await sleep(4000);
let s = await g(() => ({ min: __ssb.clock.minute, paused: __ssb.clock.paused, modal: !document.getElementById('modal').classList.contains('hidden') }));
check('18:30 自动暂停并弹出赛前窗口', s.paused && Math.abs(s.min - 1110) < 0.01 && s.modal, JSON.stringify(s));

// 1b. 暂停中直接关页（不确认），回来读自动存档：应重新弹出首发确认
await page.goto(html);
await sleep(1500);
await page.click('#tContinue');
await sleep(1200);
s = await g(() => ({ min: __ssb.clock.minute, paused: __ssb.clock.paused, pm: !!document.getElementById('pmOk') }));
check('暂停中关页后读档，仍弹首发确认', s.paused && s.pm && Math.abs(s.min - 1110) < 0.01, JSON.stringify(s));
await page.click('#pmOk');
await sleep(3000);
s = await g(() => ({ min: __ssb.clock.minute, kinds: __ssb.world.members.map((m) => m.activity.kind) }));
check('确认首发后时间继续走、19:00 后开赛', s.min > 1140 && s.kinds.filter((k) => k === 'match').length === 5, JSON.stringify(s));

// 1c. 确认后读档不再弹
s = await g(() => __ssb.state.prematchConfirmedDay);
check('确认首发写进存档', s === 2, String(s));

// 2. 暂停键与速度键
await page.keyboard.press('Space');
const m1 = await g(() => __ssb.clock.minute);
await sleep(800);
const m2 = await g(() => __ssb.clock.minute);
check('空格暂停', m1 === m2);
await page.keyboard.press('1');
await sleep(1000);
const m3 = await g(() => __ssb.clock.minute);
check('按 1 恢复正常速度', m3 > m2 && m3 - m2 < 3, `${(m3 - m2).toFixed(2)} 分钟/秒`);

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
s = await g(() => ({ day: __ssb.state.clock.day, min: __ssb.clock.minute }));
check('读档回到保存的时刻', s.day === savedDay && Math.abs(s.min - savedMin) < 2.5, JSON.stringify(s));

// 4. 夜间快进：22:25（已过 22:00 下班）起，几秒内进入第二天 09:00
await page.goto(`${html}?t=22:25&day=3&speed=x10`);
await sleep(9000);
s = await g(() => ({ day: __ssb.clock.day, min: __ssb.clock.minute }));
check('夜间快进到第二天早上', s.day === 4 && s.min >= 540 && s.min < 600, JSON.stringify(s));

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
