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
  orientation === 'landscape' ? 'horizontal' : 'vertical';

/**
 * Each weather at an hour that shows it off (snow in the morning light, embers at dusk, aurora
 * at night), so a per-weather measurement exercises its most expensive layers.
 */
export const WEATHER_SHOWCASE: readonly (readonly [weather: string, hour: number])[] = [
  ['pluie', 0.5],
  ['neige', 0.36],
  ['automne', 0.78],
  ['printemps', 0.36],
  ['ete', 0.5],
  ['orage', 0.02],
  ['braises', 0.78],
  ['aurore', 0.02],
  ['etoiles', 0.02],
  ['lucioles', 0.02],
  ['brume', 0.22],
];
