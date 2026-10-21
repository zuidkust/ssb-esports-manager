// 用本机 Chrome 打开构建好的样板，截取不同时段 / 状态的画面
// 用法：npm run build && npm run shots   （可选：node scripts/screenshots.mjs 只截某几张：morning,noon）
import puppeteer from 'puppeteer-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, '..', '截图');
fs.mkdirSync(outDir, { recursive: true });
const page0 = pathToFileURL(path.join(root, 'dist', 'index.html')).href;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const desktop = { width: 1600, height: 900, deviceScaleFactor: 1.5 };
const phone = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

// 周三（普通工作日）与周五（周赛日）
const SHOTS = [
  { name: '01-早晨-0825', q: 't=08:25&wd=3', vp: desktop, wait: 6000 },
  { name: '02-上午-1030', q: 't=10:30&wd=3', vp: desktop, wait: 9000 },
  { name: '03-午休-1315', q: 't=13:15&wd=3', vp: desktop, wait: 6000 },
  { name: '04-下午组排-1450', q: 't=14:50&wd=2', vp: desktop, wait: 9000 },
  { name: '05-傍晚-1735', q: 't=17:35&wd=3', vp: desktop, wait: 6000 },
  { name: '06-夜晚加班-2010', q: 't=20:10&wd=4', vp: desktop, wait: 6000 },
  { name: '07-深夜无人-2330', q: 't=23:30&wd=3', vp: desktop, wait: 4000 },
  { name: '08-人物卡片', q: 't=10:40&wd=3&card=shidian', vp: desktop, wait: 6000 },
  { name: '09-周赛文字直播', q: 't=15:00&wd=5&match=1', vp: desktop, wait: 30000 },
  { name: '10-手机竖屏', q: 't=11:05&wd=3&review=0', vp: phone, wait: 7000 },
  { name: '11-手机竖屏-抽屉展开', q: 't=16:10&wd=3&review=0&drawer=1', vp: phone, wait: 7000 },
];

const only = process.argv[2]?.split(',');
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--allow-file-access-from-files'],
});
const errors = [];
for (const s of SHOTS) {
  if (only && !only.some((o) => s.name.includes(o))) continue;
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`[${s.name}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${s.name}] console: ${m.text()}`));
  await page.setViewport(s.vp);
  await page.goto(`${page0}?${s.q}`, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, s.wait));
  const file = path.join(outDir, `${s.name}.png`);
  await page.screenshot({ path: file });
  console.log('✓', file);
  await page.close();
}
await browser.close();
if (errors.length) {
  console.log('\n页面错误：');
  for (const e of errors) console.log(e);
  process.exitCode = 1;
}
