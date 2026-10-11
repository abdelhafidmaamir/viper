import { resolve } from 'node:path';

import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname, 'src/renderer');

/** Chromium bundled with the Electron version in package.json. */
const CHROMIUM_TARGET = 'chrome152';

export default defineConfig({
  root,
  // Every page is served from the origin root by the main process.
  base: '/',
  publicDir: resolve(root, 'public'),
  build: {
    outDir: resolve(import.meta.dirname, 'dist/renderer'),
    emptyOutDir: true,
    target: CHROMIUM_TARGET,
    sourcemap: true,
    rollupOptions: {
      input: {
        game: resolve(root, 'game.html'),
        control: resolve(root, 'control.html'),
        feed: resolve(root, 'feed.html'),
        launcher: resolve(root, 'launcher.html'),
        'feed-control': resolve(root, 'feed-control.html'),
        arena: resolve(root, 'arena.html'),
        'arena-control': resolve(root, 'arena-control.html'),
      },
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },
});
