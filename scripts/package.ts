/**
 * Packages the app as a portable Windows folder (no installer, runs from any directory).
 *
 *   npm run package                       -> out/ViperDuel-win32-x64
 *   OUT_DIR=out/dist65 npm run package    -> out/dist65/ViperDuel-win32-x64
 */
import path from 'node:path';

import { packager } from '@electron/packager';

const root = path.resolve(import.meta.dirname, '..');

/** Only the runtime ships: compiled main process, renderer and package.json. */
const RUNTIME = /^\/(dist\/main|src\/renderer|package\.json$)/;

const paths = await packager({
  dir: root,
  out: path.resolve(root, process.env.OUT_DIR ?? 'out'),
  platform: 'win32',
  arch: 'x64',
  name: 'ViperDuel',
  asar: true,
  overwrite: true,
  prune: true,
  ignore: (file: string) => file !== '' && !RUNTIME.test(file) && !isParentOfRuntime(file),
});

function isParentOfRuntime(file: string): boolean {
  return ['/dist', '/src'].includes(file);
}

console.info('Packaged:', paths.join(', '));
