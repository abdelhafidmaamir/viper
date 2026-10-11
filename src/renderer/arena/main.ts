// Snake Arena, the third mode: one snake per viewer on a shared board, driven by likes and gifts
// only. Everything around the board is Feed's, imported as it is: the forest, the ring, the
// flower, the likers' animals, the alerts, the supporter entrances and gift thanks, the end
// screen, the journal and the supporters list. The board is arena.ts. Live events arrive through
// the same TikFinity bridge and Feed's link, on the arena's own channel and storage (link.ts).

import '../scripts/forest-ambience.ts';
import '../scripts/tikfinity-bridge.ts';
import '../game/game.css';

import { ARENA_CHANNEL } from '../../shared/arena-protocol.ts';
import { berriesPerGift, type CrowdLevel } from '../../shared/feed-protocol.ts';
import { bindCanvas, ctx } from '../engine/canvas.ts';
import { tr } from '../engine/i18n.ts';
import { H, OX, W, WF } from '../engine/layout.ts';
import type { AmbienceFrame } from '../engine/types-api.ts';
import { paintAlerts, updateAlerts } from '../feed/alerts.ts';
import {
  applyFeedCommand,
  board,
  isLive,
  linkFeedControl,
  receiveFeedEvent,
  rollAmbience,
  settings,
  type FeedLinkDeps,
} from '../feed/control-link.ts';
import { crabLike, paintCrabs } from '../feed/crabs.ts';
import { paintFlower } from '../feed/flower.ts';
import { BOARD_H, BOARD_W, FCELL, FCOLS, FROWS, FX0, FY0 } from '../feed/grid.ts';
import { paintReady, paintRing } from '../feed/hud.ts';
import { COLUMNS, drainJournal, note } from '../feed/journal.ts';
import { paintRoundEnd } from '../feed/leaderboard.ts';
import { updateRainBed } from '../feed/rain-sound.ts';
import { armSound } from '../feed/sound.ts';
import { restoreSupporters, supportersText } from '../feed/supporters.ts';
import { READY_TIME, game, hooks, newRound, roundHold } from '../feed/state.ts';
import { paintSupporters, thankGift, updateSupporters } from '../feed/vip.ts';
import {
  advanceArena,
  arenaClock,
  arenaStatus,
  endArenaRound,
  newArenaRound,
  paintArena,
} from './arena.ts';
import { arenaStorage, countOnArena, linkArenaControl } from './link.ts';

const NAMES = [
  'mira.lux',
  'tobi_77',
  'Pomelo',
  'kazu2041',
  'Nadia R.',
  'Elio',
  'fern',
  'Ioana',
  'rikko5150',
  'Saulmx',
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

let liveCheck = 0;

/** The rehearsal audience: likes and gifts sent the way the live sends them, to the board too. */
function simulate(dt: number): void {
  if (crowd === 0) return;
  // A real live switches the simulated audience off, whatever was left on from a rehearsal.
  liveCheck -= dt;
  if (liveCheck <= 0) {
    liveCheck = 0.5;
    if (isLive(window.TikFinityBridge)) {
      crowd = 0;
      return;
    }
  }
  simTimer -= dt;
  likeTimer -= dt;
  if (likeTimer <= 0) {
    likeTimer = (0.3 + Math.random()) / crowd;
    const who = someone(),
      n = 1 + Math.floor(Math.random() * 15);
    board.like(who, undefined, n);
    crabLike(who, undefined, n);
  }
  if (simTimer > 0) return;
  const [lo, hi] = GIFT_GAP[crowd];
  simTimer = lo + Math.random() * (hi - lo);
  // Mostly Roses, some Rosas, priced like real ones, times the streak.
  const berries = berriesPerGift(
    Math.random() < 0.8 ? 'Rose' : 'Rosa',
    undefined,
    settings.pricing,
    settings.otherGifts,
  );
  if (!berries) return;
  const nickname = someone(),
    n = berries * (1 + Math.floor(Math.random() * 3));
  board.gift(nickname, undefined, n);
  thankGift(nickname, undefined, n);
  note({ event: 'gift', source: 'simulated', nickname, berries: n });
}

window.receiveEvent = receiveFeedEvent;

// ---- the round around the board ------------------------------------------------------------

/** Seconds the flower shows a gift once its count stops growing: the berries are already in play. */
const SHOW_GIFT = 2.6;
let shownId = -1,
  shownTotal = 0,
  shownFor = 0;

/**
 * The flower opens on each gift in turn and closes once all are shown. In Feed it pours the
 * berries one by one; here they reach the board at once (arena.ts), so it only shows the gift.
 */
function showGifts(dt: number): void {
  const q = game.queue[0];
  if (q && q.id !== game.pour?.id) {
    game.pour = q;
    game.pourT = 0;
  }
  game.pourT += dt;
  game.dripT += dt;
  game.closeT = game.queue.length ? 0 : game.closeT + dt;
  if (!q) return;
  // A streak keeps adding to the gift on show: it stays while the count goes up.
  if (q.id !== shownId || q.total !== shownTotal) {
    if (q.id === shownId) game.dripT = 0;
    shownId = q.id;
    shownTotal = q.total;
    shownFor = 0;
  }
  shownFor += dt;
  if (shownFor >= SHOW_GIFT) game.queue.shift();
}

/** The round's time is up: its end screen, then the next round (newRound, after the hold). */
function endRound(): void {
  if (game.full >= 0) return;
  endArenaRound();
  game.ready = -1;
  game.eaten = arenaStatus().eaten;
  game.full = 0;
  // Only the gift on show stays in the flower: the others are counted and on the board already,
  // and the next round must not rank them a second time as carried over.
  game.queue.splice(1);
  hooks.full();
}

/** GET READY, the round itself on the arena's clock, then the end screen and a new round. */
function playRound(dt: number): void {
  showGifts(dt);
  if (game.full >= 0) {
    game.full += dt;
    if (game.full > roundHold()) newRound();
    return;
  }
  if (game.ready >= 0) {
    game.ready += dt;
    if (game.ready >= READY_TIME) game.ready = -1;
    return;
  }
  if (advanceArena(dt)) endRound();
}

// ---- the frame -----------------------------------------------------------------------------

const CENTRE = { x: FX0 + BOARD_W / 2, y: FY0 + BOARD_H / 2 };

function frame(dt: number, elapsed: number): AmbienceFrame {
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
    head: CENTRE,
    world: 0,
    worldKind: null,
    silence: 0,
    hour,
    weather: settings.weather,
    weatherSnap: snap,
    subStep: elapsed,
    progression: 0,
    tension: Math.max(0, (elapsed - 0.85) * 6),
    reduced: reducedMotion.matches,
  };
}

/** Eases the hour toward the chosen one along the short way round the clock. */
function easeHour(dt: number): void {
  // The day running by itself: the chosen hour moves on, and the sky follows it as usual.
  if (settings.dayCycle > 0) settings.hour = (settings.hour + dt / (settings.dayCycle * 60)) % 1;
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
    updateRainBed(settings.weather === 'rain' ? settings.rainSound : 'off');
    step(dt);
  } catch (error) {
    errors++;
    if (errors < 5) console.error('[arena] frame failed', error);
  }
}

function step(dt: number): void {
  t += dt;
  simulate(dt);
  playRound(dt);
  updateAlerts(dt);
  // Supporter entrances wait while the board is not in play (get ready, end screen).
  updateSupporters(dt, game.ready >= 0 || game.full >= 0);
  easeHour(dt);
  const c = ctx as CanvasRenderingContext2D | null,
    a = ambience();
  if (c && a) {
    // The ring fills with the round's time and pulses in its last ten seconds.
    const clock = arenaClock(),
      elapsed = Math.min(1, Math.max(0, 1 - clock.secondsLeft / clock.roundLength)),
      e = frame(dt, elapsed);
    a.paintBack(c, e);
    paintRing(t, elapsed, clock.secondsLeft <= 10 && game.full < 0 && game.ready < 0);
    paintArena(c, t, hour);
    a.paintFront(c, e);
    paintCrabs(t, e.subStep, e.reduced, settings.weather);
    paintFlower(t);
    if (game.full >= 0) paintRoundEnd(performance.now() / 1000, 0, tr('arena.over'));
    paintReady();
    paintSupporters(t);
    paintAlerts();
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
  // The arena opens on the beach and keeps it from round to round until the control room says
  // otherwise; saved settings, read by the link below, win over these.
  settings.weather = 'sea';
  settings.autoAmbience = false;
  countOnArena();
  // One channel for both links: Feed's commands and state, and the arena's own.
  const channel = new BroadcastChannel(ARENA_CHANNEL),
    storage = arenaStorage(localStorage);
  const deps: FeedLinkDeps = {
    bridge: window.TikFinityBridge,
    storage,
    metrics: () => ({ fps, slowFrames, errors }),
    setCrowd: (level) => {
      crowd = level;
      simTimer = 0.5;
    },
    crowd: () => crowd,
    someone,
    // The supporters list carries Feed's control room settings, never the arena's.
    shareSettings: false,
  };
  linkFeedControl(deps, channel);
  linkArenaControl({ storage }, channel);
  hooks.round = () => {
    rollAmbience();
    snap = true;
    newArenaRound();
  };
  newRound();
  // The live's journal and the lifetime supporters, saved by the app (src/main/feed-journal.ts),
  // the same list Feed keeps. The arena has no round worth saving after a crash yet.
  (window as unknown as { __viperFeed: unknown }).__viperFeed = {
    journal: () => {
      for (const detail of window.TikFinityBridge.takeSamples?.() ?? [])
        note({ event: 'raw sample', source: 'tiktok', detail });
      return drainJournal(isLive(window.TikFinityBridge));
    },
    journalHeader: () => COLUMNS.join(';'),
    supporters: supportersText,
    // Supporters from before, shipped with the build as JSON: added once, ever.
    seedSupporters: (json: string) => {
      try {
        const list = JSON.parse(json) as unknown;
        if (Array.isArray(list))
          applyFeedCommand({ cmd: 'seed-supporters', lines: list as never }, deps);
      } catch {
        /* a broken file adds nothing */
      }
    },
    // The list's settings are Feed's: kept in it untouched, not applied here.
    restoreSupporters,
  };
  requestAnimationFrame(loop);
  // Live gifts when TikFinity runs on this machine; a page that may not open it still plays.
  try {
    window.TikFinityBridge.liveStreaks?.(true);
    window.TikFinityBridge.comments?.(true);
    window.TikFinityBridge.start();
  } catch {
    /* no bridge: the control room's test gifts and the simulated audience still work */
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
