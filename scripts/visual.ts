/**
 * Pixel regression for the game canvas. Runs the `visual` diagnostic (seeded page, virtual clock,
 * software rendering), then compares each capture with its committed baseline.
 *
 *   npm run visual            -> fails when a capture drifts from its baseline
 *   npm run visual -- --update -> accepts the current captures as the new baselines
 *
 * Baselines are Windows captures: the canvas text uses system fonts, so another platform
 * rasterises it differently. Diffs land in out/visual/diff for inspection.
 */
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import electron from 'electron';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** Outside Electron, the package's default export is the path of its binary, whatever its typings say. */
const electronBinary = electron as unknown as string;

const root = path.resolve(import.meta.dirname, '..');
const BASELINES = path.join(root, 'tests', 'visual', 'baselines');
const OUT = path.join(root, 'out', 'visual');
const ACTUAL = path.join(OUT, 'actual');
const DIFF = path.join(OUT, 'diff');

/** Per-pixel colour distance pixelmatch ignores (0 to 1); anti-aliased edges are skipped too. */
const COLOUR_THRESHOLD = 0.1;
/**
 * Share of pixels allowed to differ. Zero: a seeded run is pixel-exact on the same platform, and a
 * recoloured HUD detail already moves only a few hundred pixels.
 */
const MAX_DIFF_RATIO = 0;

const { values } = parseArgs({ options: { update: { type: 'boolean', default: false } } });

await rm(OUT, { recursive: true, force: true });
const run = spawnSync(electronBinary, ['.', '--diagnostic=visual', `--out=${ACTUAL}`], {
  cwd: root,
  stdio: 'inherit',
});
if (run.status !== 0) {
  console.error(`The visual diagnostic failed (exit ${String(run.status)}).`);
  process.exit(1);
}

const captures = (await readdir(ACTUAL)).filter((file) => file.endsWith('.png')).sort();
if (captures.length === 0) {
  console.error('The visual diagnostic produced no capture.');
  process.exit(1);
}

if (values.update) {
  await rm(BASELINES, { recursive: true, force: true });
  await mkdir(BASELINES, { recursive: true });
  for (const file of captures) await copyFile(path.join(ACTUAL, file), path.join(BASELINES, file));
  console.info(
    `Updated ${String(captures.length)} baselines in ${path.relative(root, BASELINES)}.`,
  );
  process.exit(0);
}

const readPng = async (file: string): Promise<PNG> => PNG.sync.read(await readFile(file));

const baselines = new Set((await readdir(BASELINES)).filter((file) => file.endsWith('.png')));
const failures: string[] = [];
for (const file of captures) {
  if (!baselines.delete(file)) {
    failures.push(`${file}: no baseline (run npm run visual -- --update)`);
    continue;
  }
  const actual = await readPng(path.join(ACTUAL, file));
  const expected = await readPng(path.join(BASELINES, file));
  if (actual.width !== expected.width || actual.height !== expected.height) {
    failures.push(
      `${file}: ${String(actual.width)}x${String(actual.height)}, baseline is ` +
        `${String(expected.width)}x${String(expected.height)}`,
    );
    continue;
  }
  const { width, height } = actual;
  const diff = new PNG({ width, height });
  const changed = pixelmatch(expected.data, actual.data, diff.data, width, height, {
    threshold: COLOUR_THRESHOLD,
  });
  const ratio = changed / (width * height);
  const line = `${file}: ${String(changed)} pixels differ (${(ratio * 100).toFixed(3)} %)`;
  if (changed > 0) {
    await mkdir(DIFF, { recursive: true });
    await writeFile(path.join(DIFF, file), PNG.sync.write(diff));
  }
  if (ratio > MAX_DIFF_RATIO) failures.push(line);
  else console.info(line);
}
for (const file of baselines) failures.push(`${file}: baseline without a capture`);

if (failures.length > 0) {
  console.error(`Visual regression:\n  ${failures.join('\n  ')}`);
  console.error(
    `Captures in ${path.relative(root, ACTUAL)}, diffs in ${path.relative(root, DIFF)}.`,
  );
  process.exit(1);
}
console.info(`All ${String(captures.length)} captures match their baselines.`);
