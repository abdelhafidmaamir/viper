import { mkdir } from 'node:fs/promises';

import type { BrowserWindow } from 'electron';

import type { DiagnosticName, DiagnosticOptions, Orientation } from '../config.js';
import { evaluate } from '../page/evaluate.js';
import { installPageKit } from '../page/page-kit.js';
import { createContext, type Diagnostic } from './context.ts';
import { cpuProfile } from './cpu-profile.ts';
import { drawCalls } from './draw-calls.ts';
import { frameTiming } from './frame-timing.ts';
import { screenshots } from './screenshots.ts';

const REGISTRY: Readonly<Record<DiagnosticName, Diagnostic>> = {
  screenshots,
  'frame-timing': frameTiming,
  'cpu-profile': cpuProfile,
  'draw-calls': drawCalls,
};

/**
 * Runs one diagnostic against a loaded game window and returns the process exit code, so the
 * packaged app can be scripted (`ViperDuel.exe --diagnostic=... && next-step`).
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
