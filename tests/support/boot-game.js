// Boots the real renderer scripts in Node against a recording fake canvas.
// Why: `node --check` cannot see a function that was deleted but is still called. Running the
// actual update and draw loop does, and it needs no browser.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SCRIPTS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/renderer/scripts',
);

const CANVAS_OPS = [
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
];

/** @param {{ calls: number }} counter */
function fakeContext(counter) {
  /** @type {Record<string, unknown>} */
  const ctx = { canvas: null };
  for (const op of CANVAS_OPS) ctx[op] = () => void counter.calls++;
  const gradient = { addColorStop() {} };
  ctx.createLinearGradient = () => (counter.calls++, gradient);
  ctx.createRadialGradient = () => (counter.calls++, gradient);
  ctx.measureText = () => ({ width: 10 });
  /** @param {number} w @param {number} h */
  const pixels = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
  ctx.createImageData = (/** @type {number} */ w, /** @type {number} */ h) => (
    counter.calls++,
    pixels(w, h)
  );
  ctx.getImageData = (
    /** @type {number} */ _x,
    /** @type {number} */ _y,
    /** @type {number} */ w,
    /** @type {number} */ h,
  ) => pixels(w, h);
  return ctx;
}

/** @param {number} width @param {number} height @param {{ calls: number }} counter */
function fakeCanvas(width, height, counter) {
  const ctx = fakeContext(counter);
  const el = {
    width,
    height,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: width / 2, height: height / 2, left: 0, top: 0 }),
    addEventListener() {},
    removeEventListener() {},
  };
  ctx.canvas = el;
  return el;
}

/**
 * Installs browser-like globals, loads the live duel scripts in page order and returns the
 * game API plus a `frame(dt)` helper that runs one update and one draw.
 */
export function bootGame() {
  const counter = { calls: 0 };
  /** @type {FrameRequestCallback[]} */
  const frames = [];
  const g = /** @type {any} */ (globalThis);
  g.window = g;
  g.devicePixelRatio = 1;
  g.innerWidth = 800;
  g.innerHeight = 1200;
  g.addEventListener = () => {};
  g.removeEventListener = () => {};
  g.matchMedia = () => ({ matches: false, addEventListener() {} });
  g.requestAnimationFrame = (/** @type {FrameRequestCallback} */ cb) => frames.push(cb);
  g.Image = class {
    src = '';
    complete = false;
  };
  const scene = fakeCanvas(1080, 1920, counter);
  g.document = {
    getElementById: (/** @type {string} */ id) => (id === 'scene' ? scene : null),
    createElement: (/** @type {string} */ tag) =>
      tag === 'canvas'
        ? fakeCanvas(256, 256, counter)
        : {
            style: {},
            appendChild() {},
            addEventListener() {},
            classList: { add() {}, remove() {}, toggle() {} },
            setAttribute() {},
          },
    addEventListener() {},
    body: { appendChild() {} },
  };

  for (const file of [
    'forest-ambience.js',
    'ai-human.js',
    'ai-super.js',
    'snake-ending.js',
    'game.js',
  ]) {
    require(path.join(SCRIPTS, file));
  }

  const game = g.VipereBase;
  let clock = 0;
  return {
    game,
    counter,
    /** @param {object} event */
    send: (event) => g.recevoirEvenement(event),
    /** Advances the simulation by `dt` seconds, then draws exactly one frame. */
    frame(dt = 1 / 60) {
      clock += dt;
      game.avancer(dt);
      const draw = frames.pop();
      frames.length = 0;
      draw?.(clock * 1000);
    },
    /** Advances the simulation without drawing (fast headless play). */
    step(dt = 1 / 30) {
      game.avancer(dt);
      frames.length = 0;
    },
  };
}
