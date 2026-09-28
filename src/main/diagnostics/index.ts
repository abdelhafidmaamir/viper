import { mkdir } from 'node:fs/promises';

import type { BrowserWindow } from 'electron';

import type { DiagnosticName, DiagnosticOptions, Orientation } from '../config.js';
import { evaluate } from '../page/evaluate.js';
import { installPageKit } from '../page/page-kit.js';
import { createContext, type Diagnostic } from './context.js';
import { cpuProfile } from './cpu-profile.js';
import { drawCalls } from './draw-calls.js';
import { feedTiming } from './feed-timing.js';
import { frameTiming } from './frame-timing.js';
import { screenshots } from './screenshots.js';
import { visual } from './visual.js';

const REGISTRY: Readonly<Record<DiagnosticName, Diagnostic>> = {
  'feed-timing': feedTiming,
  screenshots,
  'frame-timing': frameTiming,
  'cpu-profile': cpuProfile,
  'draw-calls': drawCalls,
  visual,
};

/**
 * Runs one diagnostic against a loaded game window and returns the process exit code, so the
 * packaged app can be scripted (`Viper.exe --diagnostic=... && next-step`).
 */
export async function runDiagnostic(
  game: BrowserWindow,
  name: DiagnosticName,
  orientation: Orientation,
  options: DiagnosticOptions,
): Promise<number> {
  await mkdir(options.outDir, { recursive: true });
  const context = createContext(game, orientation, options);
  try {
    await evaluate(game.webContents, installPageKit);
    await REGISTRY[name](context);
    console.info(`[diagnostic] ${name} done, artefacts in ${options.outDir}`);
    return 0;
  } catch (error) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    await context.write(`${name}.error.txt`, detail).catch(() => undefined);
    console.error(`[diagnostic] ${name} failed:\n${detail}`);
    return 1;
  }
}
