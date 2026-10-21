// 交互自测：高速跑一整天、点击人物、展开事件、强制触发几类动作并截近景
import puppeteer from 'puppeteer-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = pathToFileURL(path.join(root, 'dist', 'index.html')).href;
const out = process.argv[2] || '/tmp';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1.5 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) 600 倍速从 16:00 跑过午夜
await page.goto(`${url}?t=16:00&wd=3&speed=600`);
await sleep(25000);
const s1 = await page.evaluate(() => ({ time: document.getElementById('clockTime').textContent, events: __mw.world.log.length, present: __mw.world.presentCount() }));
console.log('高速运行后', s1);

// 2) 回到工作时间，点击施颠
await page.goto(`${url}?t=10:20&wd=2`);
await sleep(3500);
const pos = await page.evaluate(() => {
  const { stage, director } = __mw;
  const c = director.chars.shidian;
  const v = c.pos.clone();
  v.y = 1.0;
  v.project(stage.camera);
  const r = stage.renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, hidden: c.hidden };
});
await page.mouse.click(pos.x, pos.y);
await sleep(600);
const cardOpen = await page.evaluate(() => !document.getElementById('card').classList.contains('hidden') && document.querySelector('.card-name')?.textContent);
console.log('点击施颠 →', pos.hidden ? '（施颠不在场）' : `卡片：${cardOpen}`);

// 3) 强制触发：拍桌（连跪红温）、串门吵架（甩锅）、白板开会；然后拉近镜头
await page.evaluate(() => {
  const { world, clock } = __mw;
  const now = clock.now();
  world.fire('G_连跪红温', now, { 主角: world.byId.dangdeng });
  const blame = world.events.find((e) => e.roles.includes('甩锅者') && e.roles.includes('被甩者'));
  if (blame) world.fire(blame.id, now, { 甩锅者: world.byId.piju, 被甩者: world.byId.shidian });
  __mw.select(null);
  const { stage } = __mw;
  stage.camera.position.set(9, 9.5, 10);
  stage.controls.target.set(-1.6, 0.6, -1.8);
});
await sleep(4500);
await page.screenshot({ path: path.join(out, '近景-拍桌与串门.png') });
await page.evaluate(() => {
  const { world, clock } = __mw;
  const ev = world.events.find((e) => /排行榜上墙/.test(e.name)) || world.events.find((e) => /复盘会/.test(e.name));
  world.fire(ev.id, clock.now(), {});
  __mw.stage.camera.position.set(1.5, 8, 7);
  __mw.stage.controls.target.set(-5.2, 0.8, -1.4);
});
await sleep(6000);
await page.screenshot({ path: path.join(out, '近景-白板前开会.png') });

// 4) 展开第一条非日常事件，检查定格图
await page.evaluate(() => document.querySelector('#feed .ev.fun, #feed .ev.story')?.click());
await sleep(500);
const snap = await page.evaluate(() => !!document.querySelector('#feed .detail img'));
console.log('事件详情含画面定格:', snap);

await browser.close();
console.log(errors.length ? '页面错误：\n' + errors.join('\n') : '无页面错误');
