/**
 * Development loop: the Vite dev server serves the renderer with hot reload and Electron loads it
 * from there. Extra arguments are forwarded to the app.
 *
 *   npm run dev
 *   npm run dev -- --orientation=landscape
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import { createServer } from 'vite';

const require = createRequire(import.meta.url);
/** In Node, the `electron` package resolves to the path of the Electron binary. */
const electronBinary = require('electron') as string;

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();

const origin = server.resolvedUrls?.local[0];
if (!origin) {
  await server.close();
  throw new Error('Vite did not report a local URL.');
}
server.printUrls();

const app = spawn(electronBinary, ['.', `--renderer-url=${origin}`, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

const shutdown = async (code: number): Promise<never> => {
  await server.close();
  process.exit(code);
};

app.on('exit', (code) => void shutdown(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.kill(signal);
  });
}
