// 找本机 Chrome / Chromium：优先用 CHROME 环境变量，其次按系统查常见安装位置
import fs from 'node:fs';
import path from 'node:path';

export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const env = process.env;
  const candidates = {
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    win32: [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean).map((d) => path.join(d, 'Google/Chrome/Application/chrome.exe')),
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
  }[process.platform] ?? [];
  const hit = candidates.find((p) => fs.existsSync(p));
  if (hit) return hit;
  console.error('找不到 Chrome。请用 CHROME 环境变量指定路径，例如：\n  CHROME="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" npm run shots');
  process.exit(1);
}
