import { parseArgs } from 'node:util';

export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export const DIAGNOSTICS = [
  'screenshots',
  'frame-timing',
  'cpu-profile',
  'draw-calls',
  'visual',
] as const;
export type DiagnosticName = (typeof DIAGNOSTICS)[number];

export interface DiagnosticOptions {
  /** Where artefacts are written. Created if missing. */
  readonly outDir: string;
  /** Weather used by single-weather runs. */
  readonly weather: string;
  /** Time of day in [0, 1): 0 is midnight, 0.5 is noon. */
  readonly hour: number;
  /** Seconds of play before sampling, so the board is as loaded as it gets on stream. */
  readonly settleSeconds: number;
  /** frame-timing only: sample every weather instead of one. */
  readonly allWeathers: boolean;
}

export interface AppConfig {
  readonly orientation: Orientation;
  /**
   * Development only: origin of the Vite dev server that serves the renderer with hot reload.
   * Null in production, where the main process serves the built renderer itself.
   */
  readonly rendererOrigin: string | null;
  readonly diagnostic: {
    readonly name: DiagnosticName;
    readonly options: DiagnosticOptions;
  } | null;
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

const DEFAULTS = {
  outDir: 'diagnostics',
  weather: 'rain',
  hour: 0.5,
  settleSeconds: 25,
} as const;

function oneOf<T extends string>(flag: string, value: string, allowed: readonly T[]): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new ConfigError(`--${flag} must be one of ${allowed.join(', ')} (got "${value}").`);
}

/** Only a loopback http origin is accepted: these windows must never load remote content. */
function loopbackOrigin(flag: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`--${flag} must be a URL (got "${value}").`);
  }
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'http:' || !loopback) {
    throw new ConfigError(`--${flag} must be an http loopback URL (got "${value}").`);
  }
  return url.origin;
}

function numberIn(flag: string, value: string, min: number, max: number): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= min && parsed <= max) return parsed;
  throw new ConfigError(
    `--${flag} must be a number in [${String(min)}, ${String(max)}] (got "${value}").`,
  );
}

/**
 * Parses the app's command line. Unknown flags are ignored on purpose: Chromium and Electron
 * forward their own switches through the same argv.
 *
 * @example
 *   ViperDuel.exe --orientation=landscape
 *   ViperDuel.exe --diagnostic=frame-timing --out=perf --all-weathers
 */
export function parseConfig(argv: readonly string[]): AppConfig {
  const { values } = parseArgs({
    args: [...argv],
    strict: false,
    allowPositionals: true,
    options: {
      orientation: { type: 'string' },
      'renderer-url': { type: 'string' },
      diagnostic: { type: 'string' },
      out: { type: 'string' },
      weather: { type: 'string' },
      hour: { type: 'string' },
      settle: { type: 'string' },
      'all-weathers': { type: 'boolean' },
    },
  });

  const text = (key: keyof typeof values): string | undefined => {
    const value = values[key];
    return typeof value === 'string' ? value : undefined;
  };

  const orientationFlag = text('orientation');
  const orientation = orientationFlag
    ? oneOf('orientation', orientationFlag, ORIENTATIONS)
    : 'portrait';

  const rendererFlag = text('renderer-url');
  const rendererOrigin = rendererFlag ? loopbackOrigin('renderer-url', rendererFlag) : null;

  const diagnosticFlag = text('diagnostic');
  if (!diagnosticFlag) return { orientation, rendererOrigin, diagnostic: null };

  const hour = text('hour');
  const settle = text('settle');
  return {
    orientation,
    rendererOrigin,
    diagnostic: {
      name: oneOf('diagnostic', diagnosticFlag, DIAGNOSTICS),
      options: {
        outDir: text('out') ?? DEFAULTS.outDir,
        weather: text('weather') ?? DEFAULTS.weather,
        hour: hour === undefined ? DEFAULTS.hour : numberIn('hour', hour, 0, 1),
        settleSeconds:
          settle === undefined ? DEFAULTS.settleSeconds : numberIn('settle', settle, 0, 600),
        allWeathers: values['all-weathers'] === true,
      },
    },
  };
}
