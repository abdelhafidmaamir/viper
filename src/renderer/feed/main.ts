// Feed the Snake, the second mode: the whole room feeds one snake until it fills the board.
// Same canvas, layout, ring and forest as the duel; its own rules in state.ts. Live gifts and likes
// arrive through the same TikFinity bridge; the Feed control room drives everything else over
// its own channel (control-link.ts).

import '../scripts/forest-ambience.ts';
import '../scripts/tikfinity-bridge.ts';
import '../game/game.css';

import { bindCanvas, ctx } from '../engine/canvas.ts';
import { CELL, H, OX, W, WF } from '../engine/layout.ts';
import { paintFlower } from './flower.ts';
import { FCELL, FCOLS, FROWS, FX0, FY0, K } from './grid.ts';
import type { AmbienceFrame } from '../engine/types-api.ts';
import { paintFull, paintReady, paintRing } from './hud.ts';
import {
  TINT,
  paintBerries,
  paintBites,
  paintGulps,
  paintHead,
  paintScales,
  snakeTrace,
} from './paint.ts';
import { berriesPerGift, type CrowdLevel } from '../../shared/feed-protocol.ts';
import { linkFeedControl, receiveFeedEvent, rollAmbience, settings } from './control-link.ts';
import { armSound } from './sound.ts';
import { TOTAL, advance, game, gift, hooks, like, newRound } from './state.ts';

const NAMES = [
  'lina.snx',
  'moe_88',
  'Capy',
  'jozsor003',
  'Rafa A.S',
  'Caylee',
  'dan',
  'Petra',
  'kedo3838',
  'Leonmx',
];

let t = 0,
  last = performance.now() / 1000,
  crowd: CrowdLevel = 0,
  simTimer = 2,
  likeTimer = 1,
  /** The hour on screen eases toward the chosen one; a new round snaps both. */
  hour = settings.hour,
  snap = true;

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Frame pacing over the last second, for the control room. */
let fps = 0,
  slowFrames = 0,
  errors = 0,
  windowFrames = 0,
  windowSlow = 0,
  windowStart = 0;

const ambience = () => (window.AMBIENCES ?? []).find((a) => a.id === 'forest') ?? null;
const someone = (): string => NAMES[Math.floor(Math.random() * NAMES.length)] ?? 'viewer';

/** Seconds between simulated gifts, per audience size: a small live up to a busy one. */
const GIFT_GAP: Record<Exclude<CrowdLevel, 0>, [number, number]> = {
  1: [3, 8],
  2: [1.2, 3.5],
  3: [0.4, 1.4],
};

function simulate(dt: number): void {
  if (crowd === 0) return;
  simTimer -= dt;
  likeTimer -= dt;
  if (likeTimer <= 0) {
    likeTimer = (0.3 + Math.random()) / crowd;
    like(someone(), undefined, 1 + Math.floor(Math.random() * 15));
  }
  if (simTimer > 0) return;
  const [lo, hi] = GIFT_GAP[crowd];
  simTimer = lo + Math.random() * (hi - lo);
  // The rule: a Rose drops 1 berry, a Rosa drops 10, times the streak.
  const berries = Math.random() < 0.8 ? berriesPerGift('Rose') : berriesPerGift('Rosa');
  gift(someone(), undefined, berries * (1 + Math.floor(Math.random() * 3)));
}

window.receiveEvent = receiveFeedEvent;

function frame(head: { x: number; y: number }, dt: number): AmbienceFrame {
  return {
    t,
    dt,
    W,
    H,
    cell: FCELL,
    x0: FX0,
    y0: FY0,
    cols: FCOLS,
    rows: FROWS,
    head,
    world: 0,
    worldKind: null,
    silence: 0,
    hour,
    weather: settings.weather,
    weatherSnap: snap,
    subStep: game.len / TOTAL,
    progression: 0,
    tension: Math.max(0, (game.len / TOTAL - 0.85) * 6),
    reduced: reducedMotion.matches,
  };
}

/** Eases the hour toward the chosen one along the short way round the clock. */
function easeHour(dt: number): void {
  if (snap) {
    hour = settings.hour;
    return;
  }
  const d = ((settings.hour - hour + 1.5) % 1) - 0.5;
  hour = (hour + d * Math.min(1, dt * 1.5) + 1) % 1;
}

function measure(ms: number, dt: number): void {
  windowFrames++;
  if (dt > 0.02) windowSlow++;
  if (ms - windowStart < 1000) return;
  fps = Math.round((windowFrames * 1000) / (ms - windowStart));
  slowFrames = windowSlow;
  windowFrames = 0;
  windowSlow = 0;
  windowStart = ms;
}

function loop(ms: number): void {
  // Next frame first: an error in this one must never freeze the stream.
  requestAnimationFrame(loop);
  const now = ms / 1000,
    dt = Math.max(0, Math.min(now - last, 0.1));
  last = now;
  measure(ms, dt);
  try {
    step(dt);
  } catch (error) {
    errors++;
    if (errors < 5) console.error('[feed] frame failed', error);
  }
}

function step(dt: number): void {
  t += dt;
  simulate(dt);
  advance(dt);
  easeHour(dt);
  const c = ctx as CanvasRenderingContext2D | null,
    a = ambience();
  if (c && a) {
    const trace = snakeTrace(),
      head = trace[0] ?? { x: W / 2, y: H / 2 },
      e = frame(head, dt);
    a.paintBack(c, e);
    paintRing(t);
    paintBerries();
    // The duel's snake painter, scaled down to the finer grid.
    c.save();
    // A fat snake: the duel's body drawn 30% thicker than the grid alone would give.
    const fat = K * 1.3;
    c.scale(fat, fat);
    a.paintSnake(
      c,
      trace.map((p) => ({ x: p.x / fat, y: p.y / fat })),
      CELL,
      { ...e, tint: TINT },
    );
    c.restore();
    paintScales(trace);
    paintGulps(trace);
    paintHead(head, t);
    paintBites();
    a.paintFront(c, e);
    paintFlower(t);
    paintFull();
    paintReady();
    a.update(dt, e);
  }
  snap = false;
}

function start(): void {
  const el = document.getElementById('scene') as HTMLCanvasElement | null;
  bindCanvas(el);
  if (!el) return;
  const adjust = (): void => {
    const r = el.getBoundingClientRect(),
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = r.width > 0 ? Math.round(r.width * dpr) : W;
    el.width = w;
    el.height = Math.round((w * H) / WF);
    const s = el.width / WF;
    ctx.setTransform(s, 0, 0, s, OX * s, 0);
  };
  adjust();
  window.addEventListener('resize', adjust);
  if ('ResizeObserver' in window) new ResizeObserver(adjust).observe(el);
  // The window allows sound without a click (see windows.ts); a click still arms it in a browser.
  window.addEventListener('pointerdown', armSound, { passive: true });
  armSound();
  // Settings first: the first round rolls its ambience from the saved choice.
  linkFeedControl({
    bridge: window.TikFinityBridge,
    storage: localStorage,
    metrics: () => ({ fps, slowFrames, errors }),
    setCrowd: (level) => {
      crowd = level;
      simTimer = 0.5;
    },
    crowd: () => crowd,
    someone,
  });
  hooks.round = () => {
    rollAmbience();
    snap = true;
  };
  newRound();
  requestAnimationFrame(loop);
  // Live gifts when TikFinity runs on this machine; a page that may not open it still plays.
  try {
    window.TikFinityBridge.start();
  } catch {
    /* no bridge: the control room's test gifts and the simulated audience still work */
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
