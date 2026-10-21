import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 构建为单个 HTML 文件：双击 dist/index.html 即可打开，无需本地服务器
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: { fs: { allow: ['..'] } },
  build: { chunkSizeWarningLimit: 2000 },
});
