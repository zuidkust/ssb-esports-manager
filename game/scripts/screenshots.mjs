// 用本机 Chrome 打开构建好的 dist/index.html，按几个时刻截图到 shots/，并收集页面报错
import puppeteer from 'puppeteer-core';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = pathToFileURL(path.join(root, 'dist/index.html')).href;
const out = path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const cases = process.argv[2]
  ? [{ name: 'custom', q: process.argv[2] }]
  : [
      { name: '01-title', q: '' },
      { name: '02-morning-0920', q: 't=09:20&day=3&paused=1' },
      { name: '03-team-1520', q: 't=15:20&day=3&paused=1' },
      { name: '04-lunch-1325', q: 't=13:40&day=3&paused=1' },
      { name: '05-night-2140', q: 't=21:40&day=3&paused=1' },
      { name: '06-card', q: 't=10:30&day=3&paused=1&card=shidian' },
      { name: '07-match-1910', q: 't=19:10&day=2&paused=1' },
    ];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
for (const c of cases) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(`${c.name}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${c.name}: ${m.text()}`));
  await page.goto(`${html}${c.q ? '?' + c.q : ''}`);
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: path.join(out, `${c.name}.png`) });
  await page.close();
}
await browser.close();
console.log(errors.length ? `页面报错：\n${errors.join('\n')}` : '没有页面报错');
