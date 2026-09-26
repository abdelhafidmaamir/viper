/**
 * Boots the real renderer scripts in Node against a fake canvas.
 *
 * `node --check` cannot see a function that was deleted but is still called. Running the actual
 * update and draw loops does, with no browser involved.
 *
 * With a `seed`, the run is fully deterministic: `Math.random` is a seeded generator and
 * `performance.now` follows the simulated clock. With `record`, every canvas call and every
 * context property write is folded into a digest, which makes the draw stream comparable across
 * refactors (see tests/engine-golden.test.ts).
 */
import { createHash, type Hash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const SCRIPTS = path.resolve(import.meta.dirname, '../../src/renderer/scripts');

/** Load order of game.html, minus the network bridge and the simulated audience. */
const GAME_SCRIPTS = [
  'forest-ambience.js',
  'ai-human.js',
  'ai-super.js',
  'snake-ending.js',
  'game.js',
] as const;

const DRAW_OPS = [
  'save',
  'restore',
  'beginPath',
  'closePath',
  'moveTo',
  'lineTo',
  'quadraticCurveTo',
  'bezierCurveTo',
  'arc',
  'arcTo',
  'ellipse',
  'rect',
  'roundRect',
  'fill',
  'stroke',
  'clip',
  'translate',
  'rotate',
  'scale',
  'transform',
  'setTransform',
  'resetTransform',
  'fillRect',
  'strokeRect',
  'clearRect',
  'drawImage',
  'fillText',
  'strokeText',
  'setLineDash',
  'createPattern',
  'putImageData',
] as const;

/** Context state a real 2D context starts with; scripts read these before writing them. */
const CONTEXT_DEFAULTS = {
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  fillStyle: '#000000',
  strokeStyle: '#000000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  miterLimit: 10,
  lineDashOffset: 0,
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  shadowBlur: 0,
  shadowColor: 'rgba(0, 0, 0, 0)',
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  filter: 'none',
  imageSmoothingEnabled: true,
} as const;

/** Mulberry32: tiny, fast, and good enough to make gameplay reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Folds canvas activity into a running SHA-256. Numbers are rounded to absorb float noise. */
class DrawRecorder {
  calls = 0;
  private hash: Hash | null;
  private readonly ids = new WeakMap<object, string>();
  private nextId = 0;

  constructor(enabled: boolean) {
    this.hash = enabled ? createHash('sha256') : null;
  }

  label(value: object, kind: string): void {
    this.ids.set(value, `${kind}#${String(this.nextId++)}`);
  }

  record(entry: string, args: readonly unknown[] = []): void {
    this.calls++;
    if (!this.hash) return;
    this.hash.update(entry);
    for (const arg of args) this.hash.update(`|${this.encode(arg)}`);
    this.hash.update('\n');
  }

  /** Returns the digest of everything recorded since the previous call. */
  digest(): string {
    if (!this.hash) throw new Error('Recording is off: boot with { record: true }.');
    const value = this.hash.digest('hex');
    this.hash = createHash('sha256');
    return value;
  }

  private encode(value: unknown): string {
    if (typeof value === 'number') return String(Math.round(value * 1e4) / 1e4);
    if (typeof value === 'string' || typeof value === 'boolean') return String(value);
    if (value === null || value === undefined) return String(value);
    if (Array.isArray(value)) return `[${value.map((item) => this.encode(item)).join(',')}]`;
    if (typeof value === 'object') {
      const id = this.ids.get(value);
      if (id) return id;
      if ('src' in value) return `img:${String(value.src)}`;
    }
    return typeof value;
  }
}

interface FakeCanvas {
  width: number;
  height: number;
  style: Record<string, string>;
  getContext(): object;
  getBoundingClientRect(): { width: number; height: number; left: number; top: number };
  addEventListener(): void;
  removeEventListener(): void;
}

const pixels = (width: number, height: number) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

function fakeCanvas(width: number, height: number, recorder: DrawRecorder): FakeCanvas {
  const state: Record<string | symbol, unknown> = { ...CONTEXT_DEFAULTS };
  const methods: Record<string, (...args: never[]) => unknown> = {};

  for (const op of DRAW_OPS) {
    methods[op] = (...args: unknown[]) => {
      recorder.record(op, args);
    };
  }
  const gradient =
    (kind: string) =>
    (...args: unknown[]) => {
      recorder.record(kind, args);
      const value = {
        addColorStop: (...stop: unknown[]) => {
          recorder.record('addColorStop', stop);
        },
      };
      recorder.label(value, 'gradient');
      return value;
    };
  methods.createLinearGradient = gradient('createLinearGradient');
  methods.createRadialGradient = gradient('createRadialGradient');
  methods.createImageData = (w: number, h: number) => {
    recorder.record('createImageData', [w, h]);
    return pixels(w, h);
  };
  methods.getImageData = (_x: number, _y: number, w: number, h: number) => pixels(w, h);
  methods.measureText = () => ({ width: 10 });
  methods.getLineDash = () => [];
  methods.isPointInPath = () => false;

  const canvas: FakeCanvas = {
    width,
    height,
    style: {},
    getContext: () => context,
    getBoundingClientRect: () => ({ width: width / 2, height: height / 2, left: 0, top: 0 }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  state.canvas = canvas;

  const context: object = new Proxy(state, {
    get: (target, key) => (typeof key === 'string' && key in methods ? methods[key] : target[key]),
    set: (target, key, value) => {
      target[key] = value;
      if (typeof key === 'string') recorder.record(`set:${key}`, [value]);
      return true;
    },
  });
  recorder.label(canvas, 'canvas');
  return canvas;
}

/** Renderer API surface the suites use (French names until the engine is migrated). */
export interface GameUnderTest {
  reglages: Record<string, unknown>;
  nouvelleManche(): void;
  avancer(dt: number): void;
  remettreScore(): void;
  razMoments(): void;
  finirTest(team: 'or' | 'ombre'): void;
  reglerHeure(hour: number): void;
  lancerScene(name: string, seconds: number): void;
  stopScene(): void;
  manches(): { camp: string; duree: number }[];
  score(): { serpent: number; viewers: number };
  mesures(): { erreurs: number; derniereErreur: string | null };
  duel(): unknown;
}

export interface BootOptions {
  /** Seeds `Math.random` and ties `performance.now` to the simulated clock. */
  readonly seed?: number;
  /** Folds every canvas call into a digest readable through `digest()`. */
  readonly record?: boolean;
}

export interface BootedGame {
  readonly game: GameUnderTest;
  /** Canvas calls so far. */
  readonly drawCalls: () => number;
  /** Digest of the draw stream since the previous call (requires `record`). */
  readonly digest: () => string;
  send(event: Record<string, unknown>): void;
  /** Advances the simulation by `dt` seconds, then draws exactly one frame. */
  frame(dt?: number): void;
  /** Advances the simulation without drawing: fast headless play. */
  step(dt?: number): void;
}

/**
 * Installs browser-like globals, loads the game scripts in page order and returns the game API.
 * Call once per test file: the scripts register themselves on `globalThis`.
 */
export function bootGame({ seed, record = false }: BootOptions = {}): BootedGame {
  const recorder = new DrawRecorder(record);
  const pendingFrames: ((time: number) => void)[] = [];
  const scene = fakeCanvas(1080, 1920, recorder);
  const noop = (): void => undefined;
  let clockMs = 0;

  if (seed !== undefined) {
    Math.random = seededRandom(seed);
    // Each read advances a few microseconds, so time-budgeted code (the search AI) terminates
    // after a reproducible amount of work instead of depending on the machine.
    let reads = 0;
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: { now: () => clockMs + ++reads * 0.005 },
    });
  }

  Object.assign(globalThis, {
    window: globalThis,
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 1200,
    addEventListener: noop,
    removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: (callback: (time: number) => void) => pendingFrames.push(callback),
    // Images resolve instantly, so avatar and gift artwork paths are exercised.
    Image: class {
      src = '';
      referrerPolicy = '';
      complete = true;
      width = 64;
      height = 64;
      naturalWidth = 64;
      naturalHeight = 64;
    },
    document: {
      getElementById: (id: string) => (id === 'scene' ? scene : null),
      createElement: (tag: string) =>
        tag === 'canvas'
          ? fakeCanvas(256, 256, recorder)
          : {
              style: {},
              appendChild: noop,
              addEventListener: noop,
              setAttribute: noop,
              classList: { add: noop, remove: noop, toggle: noop },
            },
      addEventListener: noop,
      body: { appendChild: noop },
    },
  });

  for (const file of GAME_SCRIPTS) require(path.join(SCRIPTS, file));

  const scope = globalThis as unknown as {
    VipereBase: GameUnderTest;
    recevoirEvenement(event: Record<string, unknown>): unknown;
  };
  const game = scope.VipereBase;

  return {
    game,
    drawCalls: () => recorder.calls,
    digest: () => recorder.digest(),
    send: (event) => {
      scope.recevoirEvenement(event);
    },
    frame(dt = 1 / 60) {
      clockMs += dt * 1000;
      game.avancer(dt);
      const draw = pendingFrames.pop();
      pendingFrames.length = 0;
      draw?.(clockMs);
    },
    step(dt = 1 / 30) {
      clockMs += dt * 1000;
      game.avancer(dt);
      pendingFrames.length = 0;
    },
  };
}
