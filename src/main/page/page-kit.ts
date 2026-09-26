/**
 * Page-side toolkit used by the diagnostics. `installPageKit` is serialised into the game page
 * (see `evaluate`), so it must stay self-contained: everything it needs is defined inside it.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameStats {
  readonly frames: number;
  readonly fps: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly worstMs: number;
  /** Frames slower than 20 ms, i.e. visibly dropped at 60 Hz. */
  readonly slowFrames: number;
}

export interface DrawCallReport {
  readonly frames: number;
  readonly canvas: string;
  readonly callsPerFrame: Readonly<Record<string, number>>;
  readonly shadowBlurPerFrame: number;
  readonly drawImageKpxPerFrame: number;
  /** Hottest call sites, formatted as `<call>  <file>:<line>:<col> : <n>/frame`. */
  readonly hotSites: readonly string[];
}

export interface PageEnvironment {
  readonly window: string;
  readonly devicePixelRatio: number;
  readonly canvas: string;
  readonly snakeLengths: readonly [number | null, number | null];
}

export interface PageKit {
  sceneRect(): Rect;
  environment(): PageEnvironment;
  startDuel(settings: Partial<GameSettings>): void;
  /** Starts the simulated audience at `level` (1 to 3). Idempotent. */
  startCrowd(level: number): void;
  stopCrowd(): void;
  measureFrames(durationMs: number): Promise<FrameStats>;
  countDrawCalls(frames: number): Promise<DrawCallReport>;
}

declare global {
  interface Window {
    /** Present once `installPageKit` ran; the diagnostics runner installs it before any use. */
    __viperKit: PageKit;
  }
}

export function installPageKit(): void {
  const round = (value: number, digits = 1): number => Number(value.toFixed(digits));

  const percentile = (sorted: readonly number[], p: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

  const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

  const canvas = (): HTMLCanvasElement => {
    const element = document.getElementById('scene');
    if (!(element instanceof HTMLCanvasElement)) throw new Error('#scene canvas not found');
    return element;
  };

  const callSite = (depth: number): string => {
    const line = new Error().stack?.split('\n')[depth] ?? '';
    return line.slice(line.lastIndexOf('/') + 1).replace(/\)$/, '');
  };

  let crowdTimer: number | undefined;

  window.__viperKit = {
    sceneRect() {
      const { left, top, width, height } = canvas().getBoundingClientRect();
      return {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(width),
        height: Math.round(height),
      };
    },

    environment() {
      const element = canvas();
      const duel = window.Viper.duel();
      return {
        window: `${String(innerWidth)}x${String(innerHeight)}`,
        devicePixelRatio,
        canvas: `${String(element.width)}x${String(element.height)}`,
        snakeLengths: [duel?.gold?.length ?? null, duel?.shadow?.length ?? null],
      };
    },

    startDuel(settings) {
      const game = window.Viper;
      Object.assign(game.settings, { mode: 'duel' }, settings);
      game.newRound();
    },

    startCrowd(level) {
      if (crowdTimer !== undefined) return;
      const crowd = window.ViperCrowd.create();
      crowd.configure(level);
      crowdTimer = window.setInterval(() => {
        const state = window.ViperCrowd.readState(window.Viper);
        for (const event of crowd.tick(state, 0.5)) window.receiveEvent(event);
      }, 500);
    },

    stopCrowd() {
      window.clearInterval(crowdTimer);
      crowdTimer = undefined;
    },

    async measureFrames(durationMs) {
      const intervals: number[] = [];
      const start = await nextFrame();
      let previous = start;
      for (let now = await nextFrame(); now - start < durationMs; now = await nextFrame()) {
        intervals.push(now - previous);
        previous = now;
      }
      const sorted = [...intervals].sort((a, b) => a - b);
      const mean = intervals.reduce((sum, value) => sum + value, 0) / Math.max(1, intervals.length);
      return {
        frames: intervals.length,
        fps: round(1000 / mean),
        medianMs: round(percentile(sorted, 0.5)),
        p95Ms: round(percentile(sorted, 0.95)),
        p99Ms: round(percentile(sorted, 0.99)),
        worstMs: round(sorted.at(-1) ?? 0),
        slowFrames: intervals.filter((value) => value > 20).length,
      };
    },

    async countDrawCalls(frames) {
      const proto = CanvasRenderingContext2D.prototype as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      const methods = [
        'drawImage',
        'fill',
        'stroke',
        'fillRect',
        'fillText',
        'save',
        'restore',
        'clip',
        'createRadialGradient',
        'createLinearGradient',
        'arc',
        'roundRect',
        'setTransform',
        'translate',
      ];
      const originals = new Map<string, (...args: unknown[]) => unknown>();
      const totals = new Map<string, number>();
      const sites = new Map<string, number>();
      let drawnArea = 0;

      for (const name of methods) {
        const original = proto[name];
        if (!original) continue;
        originals.set(name, original);
        proto[name] = function (this: unknown, ...args: unknown[]) {
          totals.set(name, (totals.get(name) ?? 0) + 1);
          const key = `${name}  ${callSite(3)}`;
          sites.set(key, (sites.get(key) ?? 0) + 1);
          if (name === 'drawImage') {
            const source = args[0] as { width?: number; height?: number };
            const [w, h] =
              args.length >= 9
                ? [args[7], args[8]]
                : args.length >= 5
                  ? [args[3], args[4]]
                  : [source.width, source.height];
            drawnArea += Math.abs(Number(w ?? 0) * Number(h ?? 0));
          }
          return original.apply(this, args);
        };
      }

      const blur = Object.getOwnPropertyDescriptor(
        CanvasRenderingContext2D.prototype,
        'shadowBlur',
      );
      let blurs = 0;
      if (blur?.set) {
        Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', {
          ...blur,
          set(this: CanvasRenderingContext2D, value: number) {
            if (value > 0) blurs++;
            blur.set?.call(this, value);
          },
        });
      }

      try {
        for (let i = 0; i < frames; i++) await nextFrame();
      } finally {
        for (const [name, original] of originals) proto[name] = original;
        if (blur) Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', blur);
      }

      const element = canvas();
      return {
        frames,
        canvas: `${String(element.width)}x${String(element.height)}`,
        callsPerFrame: Object.fromEntries(
          [...totals].map(([name, count]) => [name, round(count / frames)]),
        ),
        shadowBlurPerFrame: round(blurs / frames),
        drawImageKpxPerFrame: Math.round(drawnArea / frames / 1000),
        hotSites: [...sites]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 40)
          .map(([key, count]) => `${key} : ${(count / frames).toFixed(1)}/frame`),
      };
    },
  };
}
