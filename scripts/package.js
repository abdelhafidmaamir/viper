// Packages the app into a portable Windows folder under out/ (no installer, runs from anywhere).
// Usage: npm run package            -> out/ViperDuel-win32-x64
//        OUT_DIR=out/dist65 npm run package
'use strict';
const path = require('node:path');
const { packager } = require('@electron/packager');

const root = path.resolve(__dirname, '..');

/** Everything outside the runtime app stays out of the bundle. */
const ignore = [
  /^\/(\.github|\.vscode|docs|tests|scripts|out|coverage)(\/|$)/,
  /^\/(\.editorconfig|\.gitattributes|\.gitignore|\.nvmrc|\.prettierrc\.json|\.prettierignore)$/,
  /^\/(eslint\.config\.js|vitest\.config\.js|tsconfig\.json|README\.md|CLAUDE\.md)$/,
];

packager({
  dir: root,
  out: path.resolve(root, process.env.OUT_DIR ?? 'out'),
  platform: 'win32',
  arch: 'x64',
  name: 'ViperDuel',
  asar: true,
  overwrite: true,
  prune: true,
  ignore,
})
  .then((paths) => console.log('Packaged:', paths.join(', ')))
  .catch((/** @type {Error} */ error) => {
    console.error('Packaging failed:', error.message);
    process.exit(1);
  });
