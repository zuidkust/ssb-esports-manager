/// <reference types="vitest/config" />
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 开发时浏览器会自己要 /favicon.ico，有时还会要带子路径的。public 里的文件挂到站点根上。
function faviconDev(): Plugin {
  const file = path.resolve('public/favicon.ico');
  return {
    name: 'favicon-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.endsWith('/favicon.ico') && url !== '/favicon.ico') return next();
        if (!fs.existsSync(file)) return next();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/x-icon');
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

// 构建为单个 HTML 文件：双击 dist/index.html 即可打开，不需要本地服务器
export default defineConfig({
  base: './',
  assetsInclude: ['**/*.glb'],
  plugins: [faviconDev(), viteSingleFile()],
  build: { chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
