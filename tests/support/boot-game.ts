/**
 * Boots the real renderer scripts in Node against a recording fake canvas.
 *
 * `node --check` cannot see a function that was deleted but is still called. Running the actual
 * update and draw loops does, with no browser involved.
 */
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const SCRIPTS = path.resolve(import.meta.dirname, '../../src/renderer/scripts');

/** Load order of game.html, minus the network bridge. */
const GAME_SCRIPTS = [
  'forest-ambience.js',
  'ai-human.js',
  'ai-super.js',
  'snake-ending.js',
  'game.js',
] as const;

const RECORDED_OPS = [
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
  'getLineDash',
  'createPattern',
  'putImageData',
  'isPointInPath',
] as const;

export interface DrawCounter {
  calls: number;
}

type FakeContext = Record<string, unknown> & { canvas: FakeCanvas | null };

interface FakeCanvas {
  width: number;
  height: number;
  style: Record<string, string>;
  getContext(): FakeContext;
  getBoundingClientRect(): { width: number; height: number; left: number; top: number };
  addEventListener(): void;
  removeEventListener(): void;
}

const pixels = (width: number, height: number) => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4),
});

function fakeCanvas(width: number, height: number, counter: DrawCounter): FakeCanvas {
  const gradient = { addColorStop: () => undefined };
  const ctx: FakeContext = { canvas: null };
  for (const op of RECORDED_OPS) {
    ctx[op] = () => {
      counter.calls++;
    };
  }
  ctx.createLinearGradient = () => (counter.calls++, gradient);
  ctx.createRadialGradient = () => (counter.calls++, gradient);
  ctx.createImageData = (w: number, h: number) => (counter.calls++, pixels(w, h));
  ctx.getImageData = (_x: number, _y: number, w: number, h: number) => pixels(w, h);
  ctx.measureText = () => ({ width: 10 });

  const canvas: FakeCanvas = {
    width,
    height,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: width / 2, height: height / 2, left: 0, top: 0 }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  ctx.canvas = canvas;
  return canvas;
}

/** Renderer API surface the suites use (French names until roadmap step 4). */
export interface GameUnderTest {
  reglages: Record<string, unknown>;
  nouvelleManche(): void;
  avancer(dt: number): void;
  remettreScore(): void;
  razMoments(): void;
  manches(): { camp: string; duree: number }[];
  score(): { serpent: number; viewers: number };
  mesures(): { erreurs: number; derniereErreur: string | null };
}

export interface BootedGame {
  readonly game: GameUnderTest;
  readonly counter: DrawCounter;
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
export function bootGame(): BootedGame {
  const counter: DrawCounter = { calls: 0 };
  const pendingFrames: ((time: number) => void)[] = [];
  const scene = fakeCanvas(1080, 1920, counter);
  const noop = (): void => undefined;

  Object.assign(globalThis, {
    window: globalThis,
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 1200,
    addEventListener: noop,
    removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    requestAnimationFrame: (callback: (time: number) => void) => pendingFrames.push(callback),
    Image: class {
      src = '';
      complete = false;
    },
    document: {
      getElementById: (id: string) => (id === 'scene' ? scene : null),
      createElement: (tag: string) =>
        tag === 'canvas'
          ? fakeCanvas(256, 256, counter)
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
  let clock = 0;

  return {
    game,
    counter,
    send: (event) => {
      scope.recevoirEvenement(event);
    },
    frame(dt = 1 / 60) {
      clock += dt;
      game.avancer(dt);
      const draw = pendingFrames.pop();
      pendingFrames.length = 0;
      draw?.(clock * 1000);
    },
    step(dt = 1 / 30) {
      game.avancer(dt);
      pendingFrames.length = 0;
    },
  };
}
