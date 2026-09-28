/**
 * Packages the app as a portable Windows folder (no installer, runs from any directory).
 *
 *   npm run package                       -> out/Viper-win32-x64
 *   OUT_DIR=out/dist65 npm run package    -> out/dist65/Viper-win32-x64
 */
import path from 'node:path';

import { packager } from '@electron/packager';

import pkg from '../package.json' with { type: 'json' };

const root = path.resolve(import.meta.dirname, '..');

/** Only the runtime ships: the compiled main process, the built renderer and package.json. */
const RUNTIME = /^\/(dist(\/(main|renderer)(\/|$)|$)|package\.json$)/;

const paths = await packager({
  dir: root,
  out: path.resolve(root, process.env.OUT_DIR ?? 'out'),
  platform: 'win32',
  arch: 'x64',
  name: 'Viper',
  appVersion: pkg.version,
  appCopyright: `Copyright ${String(new Date().getFullYear())} Abdel Maamir`,
  win32metadata: {
    CompanyName: 'Abdel Maamir',
    ProductName: 'Viper',
    FileDescription: 'Viper',
  },
  asar: true,
  overwrite: true,
  prune: true,
  // Paths arrive relative to `dir`, with a leading slash; '' is the root itself. Source maps
  // stay out of the shipped app.
  ignore: (file: string) => file !== '' && (!RUNTIME.test(file) || file.endsWith('.map')),
});

console.info('Packaged:', paths.join(', '));
