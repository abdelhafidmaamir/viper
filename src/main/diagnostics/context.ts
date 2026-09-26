import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import type { DiagnosticOptions, Orientation } from '../config.js';

export interface DiagnosticContext {
  readonly game: BrowserWindow;
  readonly orientation: Orientation;
  readonly options: DiagnosticOptions;
  /** Writes an artefact under `options.outDir` and returns its absolute path. */
  readonly write: (fileName: string, data: string | Uint8Array) => Promise<string>;
}

export type Diagnostic = (context: DiagnosticContext) => Promise<void>;

export function createContext(
  game: BrowserWindow,
  orientation: Orientation,
  options: DiagnosticOptions,
): DiagnosticContext {
  return {
    game,
    orientation,
    options,
    write: async (fileName, data) => {
      const file = path.resolve(options.outDir, fileName);
      await writeFile(file, data);
      return file;
    },
  };
}

export const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Maps the app orientation to the renderer's format setting. */
export const formatOf = (orientation: Orientation): GameSettings['format'] =>
  orientation === 'landscape' ? 'landscape' : 'portrait';

/**
 * Each weather at an hour that shows it off (snow in the morning light, embers at dusk, aurora
 * at night), so a per-weather measurement exercises its most expensive layers.
 */
export const WEATHER_SHOWCASE: readonly (readonly [weather: string, hour: number])[] = [
  ['rain', 0.5],
  ['snow', 0.36],
  ['autumn', 0.78],
  ['spring', 0.36],
  ['summer', 0.5],
  ['storm', 0.02],
  ['embers', 0.78],
  ['aurora', 0.02],
  ['stars', 0.02],
  ['fireflies', 0.02],
  ['mist', 0.22],
];
