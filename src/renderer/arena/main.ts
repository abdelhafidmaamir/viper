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
import { H, OX, W, WF } from '../engine/layout.ts';
import type { AmbienceFrame } from '../engine/types-api.ts';
import { paintAlerts, setAlertLook, setLikeAlerts, updateAlerts } from '../feed/alerts.ts';
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
import { crabLike, paintCrabs, setCrabRanks, setLikeCount, setSleeperSpot } from '../feed/crabs.ts';
import { paintFlower, setFlowerMotes } from '../feed/flower.ts';
import { BOARD_H, BOARD_W, FCELL, FCOLS, FROWS, FX0, FY0 } from '../feed/grid.ts';
import { paintReady } from '../feed/hud.ts';
import { COLUMNS, drainJournal, note } from '../feed/journal.ts';
import { paintRoundEnd } from '../feed/leaderboard.ts';
import { paintBites } from '../feed/paint.ts';
import { updateRainBed } from '../feed/rain-sound.ts';
import { armSound } from '../feed/sound.ts';
import { restoreSupporters, supportersText } from '../feed/supporters.ts';
import { game, hooks, newRound } from '../feed/state.ts';
import { paintSupporters, thankGift, updateSupporters } from '../feed/vip.ts';
import {
  advanceArena,
  arenaFocus,
  arenaHeadline,
  arenaProgress,
  arenaPodium,
  layOutBeach,
  newArenaRound,
  paintArena,
  paintArenaBeach,
  paintArenaClock,
  paintArenaTime,
  paintPodium,
  qualifying,
  SLEEPER_SPOT,
} from './arena.ts';
import { AUDIENCE, audienceSize, qualifyingGifts, setAudience, tickAudience } from './audience.ts';
import { arenaLife, isLifeGift } from './entry.ts';
import { arenaStorage, countOnArena, linkArenaControl } from './link.ts';
import { alive } from './rules.ts';
import { ARENA_ALERTS, paintStrip } from './strip.ts';

let t = 0,
  last = performance.now() / 1000,
  crowd: CrowdLevel = 0,
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
/**
 * A name for test gifts and likes sent from the control room without one: a viewer whose snake
 * is on the board, so the test shows at once; a tester only while no viewer plays.
 */
const someone = (): string => {
  const playing = alive().filter((s) => !s.wild);
  const s = playing[Math.floor(Math.random() * playing.length)];
  return s ? s.nickname : `tester${String(1 + Math.floor(Math.random() * 9))}`;
};

let liveCheck = 0;

/**
 * The rehearsal audience (audience.ts): its likes and gifts go the way the control room's test
 * buttons send theirs, to the round, the animals and the board, priced like real gifts.
 */
function simulate(dt: number): void {
  if (crowd === 0) return;
  // A real live switches the simulated audience off, whatever was left on from a rehearsal.
  liveCheck -= dt;
  if (liveCheck <= 0) {
    liveCheck = 0.5;
    if (isLive(window.TikFinityBridge)) {
      crowd = 0;
      setAudience(0);
      return;
    }
  }
  tickAudience(
    dt,
    {
      like: (who, n, avatar) => {
        board.like(who, avatar, n);
        crabLike(who, avatar, n);
      },
      gift: (nickname, coins, avatar) => {
        if (isLifeGift(coins)) {
          arenaLife(nickname, avatar, 1);
          note({ event: 'life gift', source: 'simulated', nickname, coins });
          return;
        }
        const berries = berriesPerGift(undefined, coins, settings.pricing, settings.otherGifts);
        if (!berries) return;
        board.gift(nickname, avatar, berries);
        thankGift(nickname, avatar, berries);
        note({ event: 'gift', source: 'simulated', nickname, berries });
      },
    },
    Math.random,
    // In the qualifying, far fewer gifts: the likes race must show.
    qualifying() ? qualifyingGifts(audienceSize()) : undefined,
  );
}

window.receiveEvent = receiveFeedEvent;

// ---- the frame -----------------------------------------------------------------------------

const CENTRE = { x: FX0 + BOARD_W / 2, y: FY0 + BOARD_H / 2 };

function frame(dt: number, progress: number): AmbienceFrame {
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
    head: arenaFocus(CENTRE),
    world: 0,
    worldKind: null,
    silence: 0,
    hour,
    weather: settings.weather,
    weatherSnap: snap,
    subStep: progress,
    progression: 0,
    tension: Math.max(0, (progress - 0.85) * 6),
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
    if (errors < 5)
      console.error(
        '[arena] frame failed',
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
  }
}

function step(dt: number): void {
  t += dt;
  simulate(dt);
  advanceArena(dt);
  // Likes are on the card in the qualifying only: in the battle the like strip shows them.
  setLikeAlerts(qualifying());
  updateAlerts(dt);
  // Supporter entrances wait while the board is not in play (qualifying, get ready, end screen).
  updateSupporters(dt, game.ready >= 0 || game.full >= 0 || qualifying());
  easeHour(dt);
  const c = ctx as CanvasRenderingContext2D | null,
    a = ambience();
  if (c && a) {
    const e = frame(dt, arenaProgress());
    a.paintBack(c, e);
    paintArenaClock(t);
    paintArena(c, a, e, t);
    paintBites();
    a.paintFront(c, e);
    layOutBeach();
    paintPodium(e.subStep);
    paintCrabs(t, e.subStep, e.reduced, settings.weather);
    paintArenaBeach(t);
    paintFlower(t);
    paintArenaTime();
    // No berry carries over in the arena: the end screen shows the battle's ranking.
    if (game.full >= 0) paintRoundEnd(performance.now() / 1000, 0, arenaHeadline(), arenaPodium());
    paintReady();
    paintSupporters(t);
    paintAlerts();
    // Over the alert card: its rising particles pass behind the strip.
    paintStrip();
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
  // No like counts under the animals here, unless the control room turns them on.
  settings.likeCount = false;
  setLikeCount(false);
  // The beach has no likes ranking here: the only crown is on the biggest snake.
  setCrabRanks(false);
  // The sleeping crab lies above the board, top right, a little smaller.
  setSleeperSpot(SLEEPER_SPOT);
  // The gift thanks at the top keeps its cards and photo, without the particles thrown around it.
  setFlowerMotes(false);
  // The alert card: the arena's order, smaller and lower, under the like strip.
  setAlertLook(ARENA_ALERTS);
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
      setAudience(AUDIENCE[level]);
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
