// Viper Live: game loop module. Single AI-driven snake duel in the forest.
// Constant speed, self-collision always kills, no canvas text, no background sound.

import { W, H, COLS, ROWS, CELL, X0, Y0, OX, WF, setFormat } from '../engine/layout.ts';
import { canvas, ctx, bindCanvas } from '../engine/canvas.ts';
import {
  armSound,
  toggleSound,
  isSoundActive,
  playBite,
  playHatch,
  playStone,
  isSoundReady,
} from '../engine/audio.ts';
import {
  announceStreak,
  resetRoundDonations,
  announceRescue,
  addAnnouncement,
} from '../engine/announcements.ts';
import { updateEnergy, tempo, FRENZY_BERRIES } from '../engine/crowd-energy.ts';
import { SHADOW, GOLD } from '../engine/palette.ts';
import {
  ADULT_LENGTH,
  STONE_WARNING,
  HUNT_BY_TEAM,
  CUT_FRACTION,
  START_LENGTH,
  HATCH_TIME,
  FLAIR_BY_TEAM,
  FOREST_BERRY_INTERVAL,
  SEED_GROW_TIME,
  TARGET_LENGTH,
  YOUNG_MIN_LENGTH,
  TIERS,
  BRAMBLE_WARNING,
  BRAMBLE_MAX_SEGMENTS,
  BRAMBLE_STEP,
  EMERGE_TIME,
  BOOST_FACTOR,
  REPRIEVE_LENGTH,
  TRAIL_TIME,
  STONE_LIFE,
  BRAMBLE_LIFE,
  SPEED,
} from '../engine/rules.ts';
import { cadence, forceLength, maxLength, updateTier, tier, jitter } from '../engine/crowd.ts';
import {
  extendBramble,
  freeCells,
  plantBramble,
  activeBrambles,
  allFruits,
  isDeadZone,
} from '../engine/hazards.ts';
import { sceneState, endScene, launchScene, scene } from '../engine/scenes.ts';
import { updateTension, tension } from '../engine/tension.ts';
import { receiveEvent } from '../engine/audience-events.ts';
import { clearGiftFeedback } from '../engine/gift-feedback.ts';
import { drawFrame } from '../engine/frame.ts';
import type {
  AiMemory,
  Berry,
  Body,
  Bramble,
  BurstOptions,
  Cell,
  DeathCause,
  Direction,
  Egg,
  EndCause,
  Halo,
  Moments,
  Point,
  Round,
  RoundRecord,
  RoundWinner,
  Scene,
  Seed,
  Settings,
  Spark,
  SparkTint,
  Stone,
  Team,
  Tier,
} from '../engine/types.ts';
import type { Ambience, AiState } from '../engine/types-api.ts';

// canvas and ctx are exported as `null` from canvas.ts (not yet typed there);
// at runtime they are HTMLCanvasElement / CanvasRenderingContext2D after bindCanvas.
// The declared return types make callers handle nullability without touching canvas.ts.
// canvas.ts declares canvas as HTMLElement | null; at runtime it is always an HTMLCanvasElement
// (set by bindCanvas). The cast narrows to the more specific type without touching canvas.ts.
const getCanvas = (): HTMLCanvasElement | null => canvas as HTMLCanvasElement | null;
const getCtx = (): CanvasRenderingContext2D | null => ctx;
// scene is exported as `null` from scenes.ts; at runtime it is Scene | null.
const getScene = (): Scene | null => scene;
// tier is always a valid Tier: crowd.ts initialises it to TIERS[0] and only reassigns
// it to elements of TIERS (which is never empty).
const getTier = (): Tier => tier;

let adjustCanvas: (() => void) | null = null;

// Applies the format requested in settings; called at the start of each round (never mid-round).
function applyFormat(): void {
  if (!setFormat(settings.format)) return;
  const c = getCanvas();
  if (c) {
    c.style.aspectRatio = `${String(WF)}/${String(H)}`;
    if (WF > H) {
      c.style.width = '100vw';
      c.style.height = 'auto';
    } else {
      c.style.width = '';
      c.style.height = '100vh';
    }
  }
  if (adjustCanvas) adjustCanvas();
}

export let brambles: Bramble[] = [];

export const halos: Halo[] = [];
export let snake: Cell[] = [],
  positionHistory: Cell[] = [],
  dir: Direction = { x: 1, y: 0 },
  nextDir: Direction = { x: 1, y: 0 };
export const fruit = null;
export let subStep = 0,
  grew = false,
  aiMemory: AiMemory = {},
  trace: Point[] = [];
// segments still to push out of the shell: the body grows step by step from the egg
let toPush = 0;
// Viewer gifts: a seed drops, germinates in 1 s, becomes an edible berry. At most 3 active.
export let seeds: Seed[] = [],
  berries: Berry[] = [],
  gifted = 0,
  giftsEaten = 0;
export const sparks: Spark[] = [];

// Two teams, two snakes: gold feeds (sun), shadow blocks (moon). The round decides between them.
export let stones: Stone[] = [],
  round: Round | null = null,
  berrylessTime = 0;
export const rounds: RoundRecord[] = [];
let aiAdjustments = 0,
  aiHolds = 0; // anti-wiggle: re-decisions at crossing, and decisions held
let tickOrder = 0; // duel: alternates which snake resolves first each tick (fairness)

let wildDelay = 0;

// A silently swallowed render error once broke the game with no indication: keep the last message.
let lastError: string | null = null;
const firstLine = (err: unknown): string => {
  const stack = err instanceof Error ? (err.stack ?? '') : '';
  return (stack.split(String.fromCharCode(10))[1] ?? '').trim();
};
export let t = 0,
  pause = 0,
  berriesEaten = 0,
  deaths = 0,
  errors = 0,
  turns = 0,
  staircases = 0,
  avoidable = 0;
export const stonesPlaced = 0,
  hits = 0;
export const deathLengths: number[] = [];
export const dirs: Direction[] = [];
// Single mode: gold vs shadow duel.
// caps: false by default, so stones, brambles, and berries can be placed without limit until the
// board is full. True restores tier caps, the only state where balance harnesses measure
// something comparable.
export const settings: Settings = {
  ai: true,
  mockup: false,
  timeScale: 1,
  recklessness: 0,
  zones: false,
  duration: 240,
  duelDuration: 120,
  wild: 1,
  mode: 'duel',
  cycle: 480,
  hour: 0.06,
  caps: false,
  // advantage (super admin, control room): -100 favors shadow, 0 neutral, +100 favors gold.
  // Not shown on screen: affects AI play quality only. Reset to 0 each round.
  advantage: 0,
  // underdog (super admin): the shorter snake silently gets +recklessness and +reach. No display.
  underdog: false,
  // platform (control room): 'tiktok' shows the gift legend and status columns it feeds;
  // 'neutral' (YouTube, gameplay tests) hides them. The game itself does not change.
  platform: 'tiktok',
  // giftFeedback (control room): gift arrival feedback variant.
  // 'none', 'G1' lit row + donor + draining bar, 'G2' ring around the icon,
  // 'G3' counter badge, 'G4' donor banner above the column.
  giftFeedback: 'G1',
  // giftDisplay (control room): legend layout. 'full' = two vertical columns with price + effect
  // (off-live tests). 'none' = hidden. 'scroll' = sliding banners, animated icons, EFFECT in full
  // caps WITHOUT price or send verb (live-safe: the 25/07 rule targets price and call-to-action,
  // not the reaction to a gift). Gift arrival feedback is still carried by the P1 banner.
  giftDisplay: 'scroll',
  // 'scroll' mode visibility pattern (configurable in control room, testable live): seconds visible
  // then seconds hidden, looping. scrollHidden=0 => always visible (off-live tests only).
  scrollVisible: 8,
  scrollHidden: 12,
  // donorNames (control room): whether to show the viewer's nickname on the gift row (G1) and banner (G4).
  donorNames: true,
  // banner (control room): activity banner at top-center (joins, gifts, likes, shares), rendered as
  // a mini snake. 'none', 'P1' orbit, 'P2' carrier, 'P3' mascot.
  // weather (control room): forest weather. 'rain' default, 'snow', 'autumn', 'summer', 'storm', 'stars', 'mist'.
  // autoAmbience: each round draws a random hour and weather.
  weather: 'rain',
  autoAmbience: true,
  // format (control room): 'portrait' 9:16 (TikTok) or 'landscape' 16:9 (YouTube), applied at next round.
  format: 'portrait',
  banner: 'P1',
  // ranking (control room): end-of-round donor ranking screen.
  // 'none', 'C1' podium, 'C2' two columns by team, 'C3' MVP; MVP highlights: 'M1' crown and rays,
  // 'M2' crown with orbiting snake, 'M3' three-step podium.
  ranking: 'C3',
  // smooth (control room): disables all blur halos (shadowBlur) on the game canvas.
  // Measured in the exe engine on a loaded board: 28 fps with blur, 45 without. Changes the look.
  smooth: false,
  // superAi (super admin): true = both teams use the adversarial search AI.
  // 'gold' or 'shadow' = one team only (harness tournaments). Suspended during a scene.
  superAi: false,
  // aiDebug (super admin, control room): AI decision overlay on the board. Off by default;
  // when off, the AI fills nothing and the overlay is not drawn (zero effect on gameplay).
  aiDebug: false,
};

export const px = (gx: number, gy: number): Point => ({
  x: X0 + gx * CELL + CELL / 2,
  y: Y0 + gy * CELL + CELL / 2,
});
export const getAmbience = (): Ambience | null =>
  (window.AMBIENCES ?? []).find((a) => a.id === 'forest') ?? null;

export let HOLD_SECONDS = 5; // seconds to hold the full ring to win (setHoldSeconds for the harness)
// engagement-moment counters (proxy for profit): holds started, reprieve periods, parries
let moments: Moments = { holds: 0, reprieve: 0, parries: 0, rounds: 0 };

// burstSegments: converts segments into active berries (duel cut or duel death).
// Call under loadBody(i): isDeadZone uses the correct head context (duel checks both).
// team: dropped segments keep the color of the snake that lost them. No team = neutral green berry.
function burstSegments(segs: Cell[], team: Team | undefined): void {
  segs.forEach((s) => {
    if (isDeadZone(s, 0)) return;
    const p = px(s.x, s.y);
    burst(
      p.x,
      p.y,
      4,
      team === 'gold' ? 'gift-gold' : team === 'shadow' ? 'gift-shadow' : 'neutral-burst',
    );
    berries.push({ x: s.x, y: s.y, nickname: '', t: 0, wild: false, team: team ?? null });
  });
}

// plantSeedFor(i, nickname): plants a berry in the half of the board nearest to body i's head.
// Must be called while processing a duel event; call loadBody(0) after the loop.
export function plantSeedFor(i: number, nickname: string): number {
  const headIndex = bodies[i]?.snake[0];
  const rivalHeadIndex = bodies[1 - i]?.snake[0];
  if (!headIndex) return 0;
  loadBody(i);
  let l = freeCells().filter((c) => !isDeadZone(c, SEED_GROW_TIME));
  if (rivalHeadIndex) {
    const preferred = l.filter(
      (c) =>
        Math.abs(c.x - headIndex.x) + Math.abs(c.y - headIndex.y) <
        Math.abs(c.x - rivalHeadIndex.x) + Math.abs(c.y - rivalHeadIndex.y),
    );
    if (preferred.length) l = preferred;
  }
  if (!l.length) l = freeCells();
  if (!l.length) {
    storeBody();
    return 0;
  }
  // Berry drops NEAR the team's head, not anywhere in its half.
  // Cells sorted by distance from head (outside dead zone, so never crossed before activating);
  // pick among the 4 closest. A burst of 15 gifts clusters around the head, eaten within seconds;
  // cells fill outward from the head.
  // Prefer cells ahead: keep those with a positive dot product against the snake's direction
  // (ahead or side-ahead); fall back to all cells if none.
  const bi = bodies[i];
  const dirI: Direction = bi?.dir ?? { x: 1, y: 0 };
  const inFront = l.filter((c) => (c.x - headIndex.x) * dirI.x + (c.y - headIndex.y) * dirI.y > 0);
  if (inFront.length) l = inFront;
  l.sort(
    (p, q) =>
      Math.abs(p.x - headIndex.x) +
      Math.abs(p.y - headIndex.y) -
      (Math.abs(q.x - headIndex.x) + Math.abs(q.y - headIndex.y)),
  );
  const idx = Math.floor(Math.random() * Math.min(4, l.length));
  const c = l[idx];
  if (!c) {
    storeBody();
    return 0;
  } // invariant: idx < l.length since l is non-empty
  seeds.push({
    x: c.x,
    y: c.y,
    nickname: nickname || '',
    t: 0,
    team: bi?.team ?? 'gold',
    owner: bi?.team ?? 'gold',
  }); // tinted by the team, and RESERVED for that team (no stealing berries)
  gifted++;
  storeBody();
  return 1;
}

// A free cell about as far from both heads (within 1 cell), outside the dead zone, so neither
// snake gets it for free. Used by the forest's own berries and by the welcome berry.
function fairCell(): Cell | undefined {
  let l = freeCells().filter((c) => !isDeadZone(c, SEED_GROW_TIME));
  const b0w = bodies[0],
    b1w = bodies[1];
  if (b0w && b1w) {
    const a = b0w.snake[0],
      b = b1w.snake[0];
    if (a && b) {
      const distDiff = (c: Cell): number =>
        Math.abs(
          Math.abs(c.x - a.x) + Math.abs(c.y - a.y) - (Math.abs(c.x - b.x) + Math.abs(c.y - b.y)),
        );
      const equidistantCells = l.filter((c) => distDiff(c) <= 1 && !isDeadZone(c, SEED_GROW_TIME));
      if (equidistantCells.length) l = equidistantCells;
      else {
        l.sort((p, q) => distDiff(p) - distDiff(q));
        l = l.slice(0, 4);
      }
    }
  }
  if (!l.length) l = freeCells();
  return l[Math.floor(Math.random() * l.length)];
}

// Welcome berries on the board at once; past this, a join only gets its banner.
const MAX_WELCOME_BERRIES = 3;

/** A viewer joined: a neutral green berry carrying their name, fair to both snakes. */
export function plantWelcomeBerry(nickname: string): Berry | null {
  if (round?.state !== 'playing' || !nickname) return null;
  if (berries.filter((b) => b.wild && b.nickname).length >= MAX_WELCOME_BERRIES) return null;
  const c = fairCell();
  if (!c) return null;
  const b: Berry = { x: c.x, y: c.y, nickname, t: 0, wild: true };
  berries.push(b);
  requestAiMove();
  return b;
}

// cutDuel(adverseIdx, k): removes k segments from the tail of the opponent body, bursting them as berries.
// Returns the number of segments actually cut. Ends with storeBody() but NOT loadBody(0).
export function cutDuel(adverseIdx: number, k: number, thiefIndex?: number): number {
  loadBody(adverseIdx);
  const body = bodies[adverseIdx];
  if (!snake.length || !body) {
    storeBody();
    return 0;
  }
  if (body.shieldTime > 0) {
    // the shield parries the entire cut while active; the rail and head display it
    body.parryTime = 0.9;
    moments.parries++;
    announceRescue(adverseIdx, 'shield');
    // Balance test: the parried cut is GIVEN BACK to the shielded snake; it grows by the amount that would have been cut.
    const gain = Math.max(1, Math.round(snake.length * CUT_FRACTION));
    toPush += gain;
    const head0 = snake[0];
    if (head0) burst(px(head0.x, head0.y).x, px(head0.x, head0.y).y, 20, 'shell');
    storeBody();
    return 0;
  }
  let count = Math.min(k, Math.max(0, snake.length - 1));
  if (count <= 0) {
    storeBody();
    return 0;
  }
  if (snake.length - count < 3 && !body.adult) {
    // young snake (never reaches 10 segments): cut down to YOUNG_MIN_LENGTH, never kill a snake in its shell
    count = Math.max(0, snake.length - YOUNG_MIN_LENGTH);
    if (count <= 0) {
      storeBody();
      return 0;
    }
  }
  if (snake.length - count < 3 && body.lives > 0) {
    // a life absorbs the death: cut stops at 3 segments
    body.lives--;
    body.parryTime = 0.9;
    announceRescue(adverseIdx, 'life');
    count = Math.max(0, snake.length - 3);
    if (count <= 0) {
      storeBody();
      return 0;
    }
  }
  body.ringPeak = snake.length / TARGET_LENGTH;
  body.recoilTime = 0.9;
  body.cutTime = 0.9;
  const segs = snake.slice(-count);
  snake = snake.slice(0, snake.length - count);
  positionHistory = positionHistory.slice(0, Math.max(1, snake.length + 3));
  const segs0 = segs[0];
  if (segs.length && segs0) {
    const p = px(segs0.x, segs0.y);
    burst(p.x, p.y, 16, 'neutral-burst');
  }
  if (thiefIndex !== undefined) {
    const thief = bodies[thiefIndex];
    if (thief) {
      // Steal: segments do not drop as berries, they pass directly to the thieving team's snake.
      thief.toPush += segs.length;
      segs.forEach((sg) => {
        const p = px(sg.x, sg.y);
        burst(p.x, p.y, 3, thief.team === 'gold' ? 'gift-gold' : 'gift-shadow');
      });
    }
  } else burstSegments(segs, body.team);
  if (snake.length < 3 && body.adult) {
    snake = [];
    // adverseIdx lost: the opposing team wins
    const gagnant: RoundWinner = body.team === 'shadow' ? 'gold' : 'shadow';
    storeBody();
    endRound(gagnant, 'place');
    return count;
  }
  storeBody();
  requestAiMove();
  return count;
}

// opt controls burst strength: speed, upward thrust, gravity, size, opacity.
export function burst(x: number, y: number, n: number, tint: SparkTint, opt?: BurstOptions): void {
  const o = opt ?? {},
    v0 = o.v0 ?? 60,
    v1 = o.v1 ?? 240;
  const upBoost = o.top ?? 40,
    g = o.g ?? 520;
  const r = o.r ?? 1,
    a0 = o.a ?? 1,
    d = o.duration ?? 0.5;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2,
      v = v0 + Math.random() * (v1 - v0);
    sparks.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - upBoost,
      t: 0,
      duration: d + Math.random() * 0.4 * d,
      tint: tint,
      r,
      g,
      a: a0,
      k: o.frein ?? 0,
    });
  }
}

window.receiveEvent = receiveEvent;

// Sky race: sun on the left, moon on the right, both starting low.
// Each berry eaten raises the sun one notch; each stone placed raises the moon.
// First to the top ends the round. The snake is the ball, not the player.
function newRound(): void {
  applyFormat();
  settings.advantage = 0; // advantage is a one-time nudge, not a persistent setting
  clearGiftFeedback();
  resetRoundDonations();
  if (settings.autoAmbience) {
    const weatherOptions = (
      [
        'rain',
        'snow',
        'autumn',
        'summer',
        'spring',
        'storm',
        'stars',
        'aurora',
        'fireflies',
        'embers',
        'mist',
      ] as const
    ).filter((keyMap) => keyMap !== settings.weather);
    const widx = Math.floor(Math.random() * weatherOptions.length);
    const wopt = weatherOptions[widx];
    if (wopt) settings.weather = wopt;
    settings.hour = (['stars', 'aurora', 'fireflies'] as const).includes(
      settings.weather as 'stars' | 'aurora' | 'fireflies',
    )
      ? 0.02
      : settings.weather === 'embers'
        ? 0.78
        : settings.weather === 'spring'
          ? 0.36
          : (() => {
              const hourOpts = [0.02, 0.22, 0.36, 0.5, 0.64, 0.78] as const;
              return hourOpts[Math.floor(Math.random() * 6)] ?? 0.22;
            })();
  }
  endScene(); // scene does not survive the round; underdog state does (explicit toggle)
  const t0 = getTier();
  round = {
    t: 0,
    state: 'playing',
    sun: 0,
    moon: 0,
    moonEvents: 0,
    winner: null,
    end: 0,
    skySun: 0,
    skyMoon: 0,
    topSun: t0.skySun,
    topMoon: t0.skyMoon,
    pulseSun: 9,
    pulseMoon: 9,
    target: t0.target,
    harvest: 0,
  };
  stones = [];
  brambles = [];
  berrylessTime = 0;
  bodies = [
    createBody('gold', GOLD, COLS / 2 - 1, Math.floor(ROWS / 2), { x: -1, y: 0 }),
    createBody('shadow', SHADOW, COLS / 2, Math.floor(ROWS / 2), { x: 1, y: 0 }),
  ];
  for (let i = 0; i < bodies.length; i++) {
    const bi = bodies[i];
    if (!bi) continue; // invariant: bodies has 2 elements from the createBody calls above
    loadBody(i);
    spawn(false, bi.x0, bi.y0, bi.dir0);
    storeBody();
  }
  loadBody(0);
}

type SkyTeam = 'Sun' | 'Moon';

// Turnout grows: the sky only stretches, never shrinks, and the orb keeps its on-screen height.
// Without this, a rush of viewers would push the sun back down, breaking race readability.
function stretchSky(team: SkyTeam, target: number, increment: number): void {
  if (!round) return; // invariant: only called inside round.state === 'playing'
  const heightKey = ('top' + team) as 'topSun' | 'topMoon';
  const skyKey = ('sky' + team) as 'skySun' | 'skyMoon';
  const h = round[heightKey];
  if (target <= h) return;
  const newHeight = Math.min(target, h + increment);
  round[skyKey] *= newHeight / h;
  round[heightKey] = newHeight;
}

// Streak counter. Counts ROUNDS won, not points, and survives across rounds:
// it is the only persistent score a viewer joining mid-stream can read at a glance.
// `pulse` resets to zero when a team scores, triggering the number-grow animation;
// without this, the increment would go unnoticed under the end-of-round veil.
export let snakeScore = 0,
  scoreViewers = 0,
  snakePulse = 9,
  viewersPulse = 9;
const isSnakeTeam = (c: string): boolean => c === 'snake' || c === 'sun' || c === 'gold';

function endRound(team: RoundWinner, cause?: EndCause): void {
  if (round?.state !== 'playing') return;
  round.state = 'over';
  round.winner = team;
  round.end = 0;
  moments.rounds++;
  if (team === 'gold' || team === 'shadow') {
    announceStreak(team);
  }
  if (team === 'draw') {
    /* draw: no point */
  } else if (isSnakeTeam(team)) {
    snakeScore++;
    snakePulse = 0;
  } else {
    scoreViewers++;
    viewersPulse = 0;
  }
  rounds.push({
    team: team,
    cause: cause ?? 'unknown',
    duration: round.t,
    length: snake.length,
    sun: round.sun,
    moon: round.moonEvents,
    skySun: round.skySun,
    skyMoon: round.skyMoon,
    target: round.target,
    harvest: round.harvest,
    mode: settings.mode,
    tier: getTier().id,
  });
}

export let egg: Egg | null = null;

// Multi-body architecture: load/store pattern.
// Load body i into module variables, work on it, then store back.
function createBody(team: Team, tint: string, x0: number, y0: number, dir0: Direction): Body {
  return {
    team: team,
    tint: tint,
    flair: FLAIR_BY_TEAM[team],
    hunt: HUNT_BY_TEAM[team],
    x0: x0,
    y0: y0,
    dir0: dir0,
    snake: [],
    positionHistory: [],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    subStep: 0,
    grew: false,
    aiMemory: {},
    trace: [],
    toPush: 0,
    egg: null,
    boostTime: 0,
    invincibleTime: 0,
    cutTime: 0,
    recoilTime: 0,
    likeCredit: 0,
    ring: 0,
    ringPeak: 0,
    shieldTime: 0,
    lives: 0,
    parryTime: 0,
  };
}
export let bodies: Body[] = [],
  activeIndex = 0;

export function loadBody(i: number): void {
  activeIndex = i;
  const c = bodies[i];
  if (!c) return; // invariant: called with valid index (newRound, loadBody(0), etc.)
  snake = c.snake;
  positionHistory = c.positionHistory;
  dir = c.dir;
  nextDir = c.nextDir;
  subStep = c.subStep;
  grew = c.grew;
  aiMemory = c.aiMemory;
  trace = c.trace;
  toPush = c.toPush;
  egg = c.egg;
}
export function storeBody(): void {
  const c = bodies[activeIndex];
  if (!c) return; // invariant: called after loadBody, activeIndex is always valid
  c.snake = snake;
  c.positionHistory = positionHistory;
  c.dir = dir;
  c.nextDir = nextDir;
  c.subStep = subStep;
  c.grew = grew;
  c.aiMemory = aiMemory;
  c.trace = trace;
  c.toPush = toPush;
  c.egg = egg;
}
export const rival = (): Body | null =>
  bodies.length > 1 ? (bodies[1 - activeIndex] ?? null) : null;

function spawn(keep: boolean, x0?: number, y0?: number, dir0?: Direction | null): void {
  const cx = x0 ?? Math.floor(COLS / 2);
  const cy = y0 ?? Math.floor(ROWS / 2);
  snake = [];
  positionHistory = [];
  trace = [];
  egg = { t: 0, x: cx, y: cy, keep: keep, dir0: dir0 ?? null };
  if (!keep) {
    seeds = [];
    berries = [];
  }
}

function hatch(keep: boolean): void {
  const cx = egg ? egg.x : Math.floor(COLS / 2);
  const cy = egg ? egg.y : Math.floor(ROWS / 2);
  const d0: Direction = egg?.dir0 ?? { x: 1, y: 0 };
  snake = [{ x: cx, y: cy }];
  toPush = START_LENGTH - 1;
  positionHistory = snake.map((s) => ({ ...s }));
  dir = { ...d0 };
  nextDir = { ...d0 };
  subStep = 0;
  grew = false;
  aiMemory = {};
  // Mid-round respawn: viewer offerings stay; only the spawn cell is cleared.
  if (keep) {
    const isOccupied = (c: Cell): boolean => snake.some((s) => s.x === c.x && s.y === c.y);
    seeds = seeds.filter((g) => !isOccupied(g));
    berries = berries.filter((b) => !isOccupied(b));
    stones = stones.filter((r) => !isOccupied(r) && Math.abs(r.x - cx) + Math.abs(r.y - cy) > 2);
  }
  requestAiMove();
}

// In a duel, the opponent's head moves at the same time as ours. Both snakes approached
// the same berry and collided head-on (probe: 48 head-ons in 90 s, all lost by gold resolved
// first in the loop). The four neighbors of the opponent's head are therefore forbidden to the
// AI: it routes around instead of charging.
function opponentCrown(a: Body): Cell[] {
  const h = a.snake[0];
  if (!h) return [];
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
    .map(([x, y]) => ({ x: h.x + (x ?? 0), y: h.y + (y ?? 0) }))
    .filter((c) => c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS);
}
export function requestAiMove(keep?: boolean): void {
  if (!settings.ai || !window.ViperAi || !snake.length) return;
  try {
    const otherBody = rival();
    const sc = getScene();
    const body = bodies[activeIndex]; // always valid: called after loadBody
    const state: AiState = {
      cols: COLS,
      rows: ROWS,
      body: snake,
      dir,
      fruits: allFruits(),
      obstacles: stones
        .filter((r) => r.t >= STONE_WARNING * 0.6)
        .map((r) => ({ x: r.x, y: r.y }))
        .concat(activeBrambles(0.6).map((g) => ({ x: g.x, y: g.y })))
        .concat(otherBody ? otherBody.snake : []),
      avoid: otherBody ? opponentCrown(otherBody) : [],
      toGrow: toPush,
      recklessness: settings.recklessness,
      advantage: body ? ((body.team === 'gold' ? 1 : -1) * settings.advantage) / 100 : 0,
      flair: body?.flair ?? 0,
      hunt: body?.hunt ?? 0,
      opponent: otherBody ? otherBody.snake : null,
      opponentInvincible: otherBody !== null && otherBody.invincibleTime > 0,
      memory: aiMemory,
    };
    // Scene: the half concerning the active body's team is applied to state.
    if (sc && body) {
      const teamScene = sc[body.team];
      if (teamScene.stance) state.forcedStance = teamScene.stance;
      if (teamScene.pA) state.attackRange = teamScene.pA;
      if (teamScene.pD) state.defenseRange = teamScene.pD;
      if (teamScene.hunt !== undefined) state.forcedHunt = teamScene.hunt;
      if (teamScene.flair !== undefined) state.forcedFlair = teamScene.flair;
      if (teamScene.recklessness !== undefined) state.recklessness = teamScene.recklessness;
      if (teamScene.berryRace) state.berryRace = true;
      if (teamScene.immediateTrap) state.immediateTrap = true;
      if (teamScene.lure) state.lure = true;
      if (teamScene.repel) state.repel = true;
      if (teamScene.encircle) state.encircle = true;
      if (teamScene.noKill) state.noKill = true;
    }
    // Underdog: the shorter snake silently gets +recklessness and +2 cells of range.
    if (settings.underdog && bodies.length === 2) {
      const myLength = body?.snake.length ?? 0;
      const opp = bodies[1 - activeIndex];
      const oppLength = opp?.snake.length ?? 0;
      if (myLength < oppLength) {
        state.recklessness = state.recklessness + 0.03;
        state.attackRange = (state.attackRange ?? 12) + 2;
        state.defenseRange = (state.defenseRange ?? 10) + 2;
      }
    }
    if (settings.aiDebug) {
      state.debug = true;
      aiMemory.dbgAvoid = state.avoid;
    } else if (aiMemory.debug) {
      delete aiMemory.debug;
      delete aiMemory.dbgAvoid;
      delete aiMemory.dbgFlash;
    }
    const superActive =
      !sc &&
      window.ViperSuperAi !== undefined &&
      body !== undefined &&
      (settings.superAi === true || settings.superAi === body.team);
    if (superActive && keep) state.preferred = nextDir;
    let d: Direction =
      superActive && window.ViperSuperAi
        ? window.ViperSuperAi.choose(state)
        : window.ViperAi.choose(state);
    // Hold: a direction already announced (and drawn) is kept if the AI still judges it safe.
    if (
      !superActive &&
      keep &&
      (d.x !== nextDir.x || d.y !== nextDir.y) &&
      window.ViperAi.safeStep(state, nextDir)
    )
      d = nextDir;
    // The back is the neck segment, not the last attempted direction (after a failed step into a wall,
    // dir points into the wall and its inverse may be the only way out).
    const s0 = snake[0];
    const s1 = snake[1];
    const neck: Direction =
      s1 && s0 ? { x: s1.x - s0.x, y: s1.y - s0.y } : { x: -dir.x, y: -dir.y };
    if (!(d.x === neck.x && d.y === neck.y)) nextDir = d;
  } catch (err) {
    errors++;
    const e = err instanceof Error ? err : new Error(String(err));
    lastError = 'ai: ' + e.message + ' | ' + (e.stack ?? '').split('\n').slice(0, 3).join(' > ');
  }
}

function die(cause: DeathCause): void {
  const body = bodies[activeIndex];
  if (body) body.deathCause = cause; // for probes: cause of death
  // Avoidable death: the head still had a free neighbor cell.
  // The tail does not free its cell on a bite step: it counts as occupied.
  const head = snake[0];
  if (!head) return; // invariant: die() only called when snake is non-empty
  const currentSegs = grew ? snake : snake.slice(0, -1);
  if (
    [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ].some(([x, y]) => {
      const a = head.x + (x ?? 0),
        b = head.y + (y ?? 0);
      return (
        a >= 0 && b >= 0 && a < COLS && b < ROWS && !currentSegs.some((c) => c.x === a && c.y === b)
      );
    })
  )
    avoidable++;
  deathLengths.push(snake.length);
  deaths++;
  trace = [];
  // Death no longer ends the round: it advances the moon a few notches, then the snake respawns.
  // Duel: no respawn pause. Shrink to max(3, floor(L/2)).
  // The lost half bursts into berries. Below 3 segments: outright death, the opposing team wins.
  if ((body?.shieldTime ?? 0) > 0) {
    // the shield parries the collision: no segments lost, respawns invincible
    if (body) {
      body.parryTime = 0.9;
      body.invincibleTime = 1.5;
    }
    announceRescue(activeIndex, 'shield');
    const pos = px(head.x, head.y);
    burst(pos.x, pos.y, 20, 'shell');
    requestAiMove();
    return;
  }
  // Self fault (wall, own body): NO segments lost. Respawns invincible for 1.5 s and re-decides.
  // Only the opponent's body and head-on collisions (the opponent's trap) cost half the body.
  // Exception: if the opponent cornered it (within 2 cells of the head), it counts as an opponent
  // trap, not a self fault.
  const opponentBody = rival();
  const cornered =
    opponentBody?.snake.some((q) => Math.abs(q.x - head.x) + Math.abs(q.y - head.y) <= 2) ?? false;
  let effectiveCause: DeathCause = cause;
  if (cornered && (cause === 'wall' || cause === 'self')) {
    effectiveCause = 'adverse';
    if (body) body.deathCause = 'adverse';
  }
  if (effectiveCause === 'wall' || effectiveCause === 'self') {
    if (body) {
      body.invincibleTime = 1.5;
      body.parryTime = 0.4;
    }
    burst(head.x * CELL + X0 + CELL / 2, head.y * CELL + Y0 + CELL / 2, 10, 'dust');
    requestAiMove();
    return;
  }
  const L = snake.length;
  const threshold = Math.max((body?.adult ?? false) ? 3 : YOUNG_MIN_LENGTH, Math.floor(L / 2));
  const lostSegments = snake.slice(threshold);
  snake = snake.slice(0, threshold);
  positionHistory = positionHistory.slice(0, Math.max(1, threshold + 3));
  if (body) {
    body.invincibleTime = 1.5;
    body.ringPeak = L / TARGET_LENGTH;
    body.recoilTime = 0.9;
    body.cutTime = 0.9;
  }
  burstSegments(lostSegments, body?.team);
  if (snake.length < 3 && (body?.adult ?? false)) {
    snake = [];
    const opponent = rival();
    endRound(opponent ? opponent.team : 'gold', 'place');
  } else requestAiMove(); // otherwise it keeps heading into the wall and dies again when invincibility ends
}

function step(): boolean {
  if (!snake.length) return false;
  const head = snake[0];
  if (!head) return false; // invariant: snake.length > 0 checked above
  const activeBody = bodies[activeIndex];
  if (!activeBody) return false; // invariant: activeIndex is always valid when step() is called
  // Duel: the opponent has moved since the last decision; re-decide on its real position.
  // Without this, all deaths were "avoidable" (probe): the head charged into a cell the opponent
  // had just taken. With it, the opponent's crown is current and head-ons vanish.
  // Anti-wiggle: the head is drawn sliding toward the cell targeted by nextDir, decided at the end
  // of the previous step. Re-deciding here often reversed course head-to-head (3,262 times in 45 min
  // of duel): the head tilted one way then launched the other, its tip jumping half a cell.
  // We always re-decide, but KEEP the announced direction as long as the AI judges it safe
  // (safeStep): full reactivity to danger stays, only spurious changes are dropped.
  const prevDir = { ...nextDir };
  requestAiMove(!window.VIPER_ALWAYS_REDECIDE);
  if (prevDir.x !== nextDir.x || prevDir.y !== nextDir.y) aiAdjustments++;
  else aiHolds++;
  if (settings.aiDebug)
    aiMemory.dbgFlash = {
      t,
      change: prevDir.x !== nextDir.x || prevDir.y !== nextDir.y,
      x: head.x,
      y: head.y,
    };
  if (nextDir.x !== dir.x || nextDir.y !== dir.y) {
    turns++;
    // staircase: a, b, a, b over four consecutive steps
    const n = dirs.length,
      c = nextDir;
    if (n >= 3) {
      const dn1 = dirs[n - 1] ?? dir;
      const dn2 = dirs[n - 2] ?? dir;
      const dn3 = dirs[n - 3] ?? dir;
      if (
        dn1 !== dn2 &&
        dn2 !== dn3 &&
        dn2.x === c.x &&
        dn2.y === c.y &&
        dn1.x === dn3.x &&
        dn1.y === dn3.y
      )
        staircases++;
    }
  }
  dir = nextDir;
  dirs.push(dir);
  if (dirs.length > 4) dirs.shift();
  const nx = head.x + dir.x,
    ny = head.y + dir.y;
  // temporary invincibility (after a life absorbs a death, or after a head-on collision in a duel)
  const isInvincible = activeBody.invincibleTime > 0;
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
    if (!isInvincible) {
      die('wall');
      return false;
    }
    requestAiMove();
    return true;
  }
  if (stones.some((r) => r.t >= STONE_WARNING && r.x === nx && r.y === ny)) {
    die('stone');
    return false;
  }
  if (activeBrambles(1).some((g) => g.x === nx && g.y === ny)) {
    die('bramble');
    return false;
  }
  // berry reserved for the other team: the snake passes over it without eating
  const myTeam = activeBody.team;
  const berryIdx = berries.findIndex(
    (b) =>
      b.x === nx &&
      b.y === ny &&
      !(b.owner !== undefined && b.owner !== null && b.owner !== myTeam),
  );
  const eating = berryIdx >= 0;
  const isPushing = toPush > 0;
  const growByEating = eating && snake.length < maxLength();
  const growing = isPushing || growByEating;
  if (isPushing) toPush--;
  // the tail frees its cell on the same step, except when eating; in a duel, the opponent's body also blocks
  const otherBodyDuel = rival();
  const blocking = (growing ? snake : snake.slice(0, -1)).concat(
    otherBodyDuel ? otherBodyDuel.snake : [],
  );
  if (!isInvincible && blocking.some((s) => s.x === nx && s.y === ny)) {
    // Duel, head-on: both snakes take the hit (shared fault). Otherwise the snake resolved first in
    // the loop absorbs all head-ons.
    const opponentHead = otherBodyDuel?.snake[0];
    if (
      opponentHead?.x === nx &&
      opponentHead.y === ny &&
      (otherBodyDuel?.invincibleTime ?? 1) <= 0
    ) {
      const myIdx = activeIndex;
      die('headOn');
      if (round?.state === 'playing') {
        storeBody();
        loadBody(1 - myIdx);
        die('headOn');
        storeBody();
        loadBody(myIdx);
      }
      return false;
    }
    die(otherBodyDuel?.snake.some((s) => s.x === nx && s.y === ny) ? 'adverse' : 'self');
    return false;
  }
  snake = growing ? [{ x: nx, y: ny }, ...snake] : [{ x: nx, y: ny }, ...snake.slice(0, -1)];
  positionHistory.unshift({ x: nx, y: ny });
  if (positionHistory.length > snake.length + 3) positionHistory.length = snake.length + 3;
  grew = growing;
  if (eating) {
    berriesEaten++;
    const p = px(nx, ny);
    const b = berries[berryIdx];
    berries.splice(berryIdx, 1);
    if (!b?.wild) giftsEaten++;
    // halo tinted by the eaten berry: gold, shadow, or green (no team)
    halos.push({
      x: p.x,
      y: p.y,
      t: 0,
      duration: b?.wild ? 0.85 : 1.1,
      tint: b?.wild
        ? 'nature'
        : b?.team === 'gold'
          ? 'gift-gold'
          : b?.team === 'shadow'
            ? 'gift-shadow'
            : 'gifted',
    });
    const a = getAmbience();
    if (a) playBite(a);
  }
  requestAiMove();
  return true;
}

// Smooth trace: one Bezier arc per cell, midpoint to midpoint (rounded turns, exact continuity).
function vertex(k: number): Cell {
  if (k < 0) {
    const h = positionHistory[0];
    if (!h) return { x: nextDir.x, y: nextDir.y }; // invariant: positionHistory is non-empty when called
    return { x: h.x + nextDir.x, y: h.y + nextDir.y };
  }
  const idx = Math.min(k, positionHistory.length - 1);
  return positionHistory[idx] ?? { x: 0, y: 0 }; // invariant: idx >= 0 when positionHistory is non-empty
}
function pointOn(p: number): Point {
  const k = Math.round(p),
    u = Math.min(1, Math.max(0, p - k + 0.5));
  const a = vertex(k - 1),
    v = vertex(k),
    b = vertex(k + 1);
  const Ax = (a.x + v.x) / 2,
    Ay = (a.y + v.y) / 2,
    Bx = (v.x + b.x) / 2,
    By = (v.y + b.y) / 2,
    i = 1 - u;
  return px(i * i * Ax + 2 * u * i * v.x + u * u * Bx, i * i * Ay + 2 * u * i * v.y + u * u * By);
}
function computeTrace(): Point[] {
  const L = snake.length;
  if (!L) return [];
  const ph = 1 - subStep,
    pt = grew ? L - 1 : L - subStep,
    pts: Point[] = [];
  for (let p = ph; p < pt; p += 1 / 3) pts.push(pointOn(p));
  pts.push(pointOn(pt));
  return pts;
}

// Advances logic by dt seconds (no rendering: also used by the Node harness).
function advance(dt: number): void {
  t += dt;
  updateTier(dt);
  const surge = updateEnergy(dt, round?.state === 'playing');
  if (surge === 'start')
    addAnnouncement({
      kind: 'tier',
      nickname: '',
      text: 'Your likes wake the forest: berries for both!',
    });
  else if (
    surge === 'drop' &&
    berries.filter((b) => b.wild && !b.nickname).length < FRENZY_BERRIES
  ) {
    const c = fairCell();
    if (c) {
      berries.push({ x: c.x, y: c.y, nickname: '', t: 0, wild: true });
      requestAiMove();
    }
  }
  // score animation lives OUTSIDE the round: it starts exactly when the round ends
  snakePulse += dt;
  viewersPulse += dt;
  // day cycle advances on its own: night, sunrise, noon, sunset, looping
  if (settings.cycle > 0) settings.hour = (settings.hour + dt / settings.cycle) % 1;
  const sc = getScene();
  if (sc && round?.state === 'playing') {
    sc.remaining -= dt;
    if (sc.remaining <= 0) endScene();
  }
  // seeds: they germinate, then become edible berries
  for (let i = seeds.length - 1; i >= 0; i--) {
    const g = seeds[i];
    if (!g) continue; // invariant: backward loop, i < seeds.length
    g.t += dt;
    if (g.t >= SEED_GROW_TIME) {
      seeds.splice(i, 1);
      berries.push({
        x: g.x,
        y: g.y,
        nickname: g.nickname,
        t: 0,
        team: g.team,
        owner: g.owner,
      });
      burst(px(g.x, g.y).x, px(g.x, g.y).y, 6, g.team === 'gold' ? 'gift-gold' : 'gift-shadow');
      requestAiMove();
    }
  }
  berries.forEach((b) => {
    b.t += dt;
  });
  updateTension(dt);
  for (let i = halos.length - 1; i >= 0; i--) {
    const h = halos[i];
    if (!h) continue; // invariant: backward loop, i < halos.length
    h.t += dt;
    if (h.t >= h.duration) halos.splice(i, 1);
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const e = sparks[i];
    if (!e) continue; // invariant: backward loop, i < sparks.length
    e.t += dt;
    if (e.t >= e.duration) {
      sparks.splice(i, 1);
      continue;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vy += e.g * dt;
    if (e.k) {
      const fr = Math.max(0, 1 - e.k * dt);
      e.vx *= fr;
      e.vy *= fr;
    }
  }
  // stones: shadow first, then the stone, then fade out
  for (let i = stones.length - 1; i >= 0; i--) {
    const r = stones[i];
    if (!r) continue; // invariant: backward loop, i < stones.length
    r.t += dt;
    if (r.t >= STONE_LIFE) stones.splice(i, 1);
    else if (r.t >= STONE_WARNING && r.t - dt < STONE_WARNING) {
      requestAiMove();
      playStone();
      const pixelPos = px(r.x, r.y);
      // clods of dirt falling at the base, never shooting outward
      burst(pixelPos.x, pixelPos.y + 14, 7, 'dust', {
        v0: 18,
        v1: 65,
        top: -4,
        g: 260,
        frein: 3.4,
        r: 0.8,
        a: 0.4,
        duration: 0.55,
      });
    }
  }
  for (let i = brambles.length - 1; i >= 0; i--) {
    const bramble = brambles[i];
    if (!bramble) continue; // invariant: backward loop, i < brambles.length
    bramble.t += dt;
    bramble.seg.forEach((g) => {
      g.t += dt;
    });
    if (bramble.t >= BRAMBLE_LIFE) {
      brambles.splice(i, 1);
      requestAiMove();
      continue;
    }
    bramble.step += dt;
    if (bramble.step >= BRAMBLE_STEP && bramble.seg.length < BRAMBLE_MAX_SEGMENTS) {
      bramble.step = 0;
      extendBramble(bramble);
    }
    // each segment that hardens kicks up dirt at its base
    bramble.seg.forEach((g) => {
      if (g.t >= BRAMBLE_WARNING && g.t - dt < BRAMBLE_WARNING) {
        const pixelPos = px(g.x, g.y);
        burst(pixelPos.x, pixelPos.y + 10, 4, 'dust', {
          v0: 12,
          v1: 44,
          top: -6,
          g: 200,
          frein: 3.2,
          r: 0.6,
          a: 0.32,
          duration: 0.45,
        });
      }
    });
  }
  if (round) {
    if (round.state === 'playing') {
      round.t += dt;
      // target rises only with turnout: a rush does not trivialize the round,
      // and a thinning crowd does not punish remaining viewers
      const t0 = getTier();
      stretchSky('Sun', t0.skySun, dt * 14);
      stretchSky('Moon', t0.skyMoon, dt * 2);
      // Target grows with turnout, so harvest rescales the same way stretchSky() does for the orbs.
      // Without this, a full ring would fall to 17 % when the crowd arrived and viewers would see
      // progress GO BACKWARD.
      if (t0.target > round.target) {
        const avant = round.target;
        round.target = Math.min(t0.target, round.target + dt * 14);
        if (avant > 0 && round.target > avant) round.harvest *= round.target / avant;
      }
      round.pulseSun += dt;
      round.pulseMoon += dt;
      // Duel, ring win: a team wins when its half-ring is full (TARGET_LENGTH segments)
      // and it holds for HOLD_SECONDS without being cut below. The timer is the fallback.
      const fullBodies: Body[] = [];
      for (const c of bodies) {
        const prevHold = c.hold ?? 0;
        c.hold = c.snake.length >= TARGET_LENGTH ? (c.hold ?? 0) + dt : 0;
        if (prevHold === 0 && (c.hold ?? 0) > 0) moments.holds++;
        if (c.snake.length >= ADULT_LENGTH) c.adult = true;
        const enSursis = !c.egg && c.snake.length > 0 && c.snake.length < REPRIEVE_LENGTH;
        if (enSursis && !c.reprieve) moments.reprieve++;
        c.reprieve = enSursis;
        if ((c.hold ?? 0) >= HOLD_SECONDS) fullBodies.push(c);
      }
      // Strict tie-break: previously the loop broke on the first body holding its ring,
      // so gold could beat shadow by array order alone. Both are now evaluated: longer hold wins;
      // identical hold = draw.
      if (fullBodies.length === 1) {
        const fb = fullBodies[0];
        if (fb) {
          endRound(fb.team, 'ring');
          return;
        }
      } else if (fullBodies.length > 1) {
        const fa = fullBodies[0],
          fb = fullBodies[1];
        if (fa && fb) {
          endRound(
            (fa.hold ?? 0) === (fb.hold ?? 0)
              ? 'draw'
              : (fa.hold ?? 0) > (fb.hold ?? 0)
                ? fa.team
                : fb.team,
            'ring',
          );
          return;
        }
      }
      // duel: round timer (balance test: at 120 s, calm audiences never fill the ring)
      if (round.t >= (settings.duelDuration || settings.duration)) {
        // Longer wins. Both snakes at or below START_LENGTH: draw, no point.
        const b0 = bodies[0],
          b1 = bodies[1];
        if (b0 && b1) {
          const l0 = b0.snake.length,
            l1 = b1.snake.length;
          // Strict tie-break: equal length was silently awarded to shadow (team bias). Without viewers,
          // both snakes often end at the same length (5 % of measured rounds): that is a draw, no point.
          if (l0 === l1) endRound('draw', 'timeout');
          else if (l0 <= START_LENGTH && l1 <= START_LENGTH) endRound('draw', 'timeout');
          else endRound(l0 > l1 ? 'gold' : 'shadow', 'timeout');
        }
      }
      // Safety net: without viewers the board stays empty and nothing can happen.
      // Viewer gifts are unlimited (no cap on seeds), but the forest feeds on its own
      // only when the board is empty of all food, and its cadence slows as viewer generosity
      // grows, falling silent at high turnout.
      if (!seeds.length && !berries.length) {
        berrylessTime += dt;
        // The more active the audience, the quieter the forest: viewer generosity sets abundance,
        // not a fixed clock. At cadence 20, the forest is already 2x slower; at cadence 200, 11x.
        // Duel: the forest provides a moderate supply when the board is empty, placing a neutral
        // green berry at intervals, equidistant from both heads (within 1 cell).
        const wildFreqBase = FOREST_BERRY_INTERVAL;
        const wildFreq = wildFreqBase / (1 + cadence / 20);
        if (!wildDelay) wildDelay = jitter(wildFreq);
        if (wildFreq > 0 && berrylessTime >= wildDelay) {
          berrylessTime = 0;
          wildDelay = jitter(wildFreq);
          // Wild berries follow the same dead-zone rule as seeded ones. Zero delay means they
          // cannot be crossed before activating, but the rule does more than that: food appearing
          // right under the snake's nose is a free gift requiring no decision; it should behave
          // like any seeded berry. Same delay, GERMINATES.
          const c = fairCell();
          if (c) {
            berries.push({ x: c.x, y: c.y, nickname: '', t: 0, wild: true });
            requestAiMove();
          }
        }
      } else {
        berrylessTime = 0;
        wildDelay = 0;
      }
    } else {
      round.end += dt;
      if (round.end >= 8) newRound();
      return;
    }
  }
  // Duel fairness: always resolving gold then shadow gives the first-served team permanent
  // initiative (bench: 38-2). Order alternates each tick so no team keeps the advantage.
  tickOrder = 1 - tickOrder;
  if (tickOrder) {
    for (let _i = bodies.length - 1; _i >= 0; _i--) {
      loadBody(_i);
      advanceBody(dt);
      storeBody();
    }
  } else
    for (let _i = 0; _i < bodies.length; _i++) {
      loadBody(_i);
      advanceBody(dt);
      storeBody();
    }
  loadBody(0);
}

// Advances the loaded (active) body by dt seconds. Called from advance() after loadBody(i).
function advanceBody(dt: number): void {
  const body = bodies[activeIndex];
  if (!body) return; // invariant: called after loadBody, activeIndex is always valid
  if (body.boostTime > 0) body.boostTime = Math.max(0, body.boostTime - dt);
  if (body.invincibleTime > 0) body.invincibleTime = Math.max(0, body.invincibleTime - dt);
  if (body.cutTime > 0) body.cutTime = Math.max(0, body.cutTime - dt);
  if (body.parryTime > 0) body.parryTime = Math.max(0, body.parryTime - dt);
  if (body.shieldTime > 0) body.shieldTime = Math.max(0, body.shieldTime - dt);
  if (body.recoilTime > 0) body.recoilTime = Math.max(0, body.recoilTime - dt);
  if (pause > 0) {
    pause -= dt;
    if (pause <= 0) {
      pause = 0;
      spawn(round?.state === 'playing');
    }
    return;
  }
  if (egg) {
    const avant = egg.t;
    egg.t += dt;
    const a0 = getAmbience();
    if (isSoundReady() && a0?.hatchSound) {
      const uu = egg.t / HATCH_TIME,
        ua = avant / HATCH_TIME;
      [0.34, 0.46, 0.55].forEach((keyMap) => {
        if (ua < keyMap && uu >= keyMap) playHatch(a0, 'crack');
      });
      if (ua < EMERGE_TIME && uu >= EMERGE_TIME) playHatch(a0, 'birth');
    }
    // the snake emerges before the animation ends; the shell finishes opening behind it
    if (!egg.emerged && egg.t >= HATCH_TIME * EMERGE_TIME) {
      egg.emerged = true;
      const p = px(egg.x, egg.y);
      burst(p.x, p.y, 18, 'shell');
      hatch(egg.keep);
    }
    if (egg.t >= HATCH_TIME + TRAIL_TIME) egg = null;
    if (!egg?.emerged) return;
  }
  const boosted = body.boostTime > 0;
  // Likes speed both snakes (never the round clock), see crowd-energy.ts.
  subStep += dt * SPEED * tempo() * (boosted ? BOOST_FACTOR : 1);
  while (subStep >= 1) {
    subStep -= 1;
    if (!step()) return;
  }
}

let lastFrameTime = 0;
function loop(ts: number): void {
  const now = ts / 1000,
    dt = Math.min(now - lastFrameTime, 0.1);
  lastFrameTime = now;
  const n = settings.timeScale;
  for (let i = 0; i < n; i++) advance(dt);
  // trace computed per body; invariant: body[0] is loaded on exit.
  // storeBody() copies the module variable `trace` back into the body, so fill that one.
  for (let _i = 0; _i < bodies.length; _i++) {
    loadBody(_i);
    trace = computeTrace();
    storeBody();
  }
  loadBody(0);
  const b0 = bodies[0];
  trace = b0 ? b0.trace : [];
  try {
    drawFrame(dt);
  } catch (err) {
    errors++;
    const e = err instanceof Error ? err : new Error(String(err));
    lastError = 'render: ' + e.message + ' | ' + firstLine(e);
  }
  requestAnimationFrame(loop);
}

const viperPublic = {
  settings: settings,
  spawn: spawn,
  advance: advance,
  toggleSound: toggleSound,
  newRound: newRound,
  tension: () => tension,
  // Current scene (super admin): read, launch by name, stop immediately.
  scene: sceneState,
  launchScene: launchScene,
  stopScene: endScene,
  endTest: (team?: RoundWinner) => {
    endRound(team ?? 'gold', 'test');
  },
  soundOn: isSoundActive,
  tier: () => {
    const t0 = getTier();
    return {
      id: t0.id,
      cadence: Math.round(cadence),
      topSun: round ? Math.round(round.topSun) : t0.skySun,
      topMoon: round ? Math.round(round.topMoon) : t0.skyMoon,
    };
  },
  round: () =>
    round
      ? {
          state: round.state,
          t: round.t,
          sun: round.sun,
          moon: round.moonEvents,
          winner: round.winner,
          skySun: round.skySun,
          skyMoon: round.skyMoon,
          harvest: round.harvest,
          target: round.target,
        }
      : null,
  rounds: () => rounds,
  score: () => ({ snake: snakeScore, viewers: scoreViewers }),
  resetScore: () => {
    snakeScore = 0;
    scoreViewers = 0;
    snakePulse = 9;
    viewersPulse = 9;
  },
  shake: () => ({ adjustments: aiAdjustments, holds: aiHolds }),
  metrics: () => ({
    length: snake.length,
    berriesEaten: berriesEaten,
    deaths: deaths,
    errors: errors,
    lastError: lastError,
    t,
    turns: turns,
    staircases: staircases,
    avoidable: avoidable,
    deathLengths: deathLengths,
    giftsSpawned: gifted,
    giftsEaten: giftsEaten,
    stonesPlaced: stonesPlaced,
    hits: hits,
    berries: berries.length + seeds.length,
  }),
  duel: () => {
    const g = bodies[0],
      s = bodies[1];
    return {
      t: round?.t ?? 0,
      winner: round?.winner ?? null,
      gold: g
        ? {
            length: g.snake.length,
            stance: g.aiMemory.activeStance ?? 'neutral',
            reason: g.aiMemory.reason,
            hold: g.hold ?? 0,
            shieldTime: g.shieldTime,
            lives: g.lives,
            boostTime: g.boostTime,
            invincibleTime: g.invincibleTime,
            cutTime: g.cutTime,
            recoilTime: g.recoilTime,
          }
        : null,
      shadow: s
        ? {
            length: s.snake.length,
            stance: s.aiMemory.activeStance ?? 'neutral',
            reason: s.aiMemory.reason,
            hold: s.hold ?? 0,
            shieldTime: s.shieldTime,
            lives: s.lives,
            boostTime: s.boostTime,
            invincibleTime: s.invincibleTime,
            cutTime: s.cutTime,
            recoilTime: s.recoilTime,
          }
        : null,
    };
  },
  // race parameters for the balance harnesses
  setSky: (id: string, sun?: number, moon?: number) => {
    const p = TIERS.find((x) => x.id === id);
    if (!p) return;
    if (sun) p.skySun = sun;
    if (moon) p.skyMoon = moon;
  },
  setTarget: (id: string, c: number) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.target = c;
  },
  setMaxLength: forceLength,
  setMaxStones: (id: string, v: number) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.maxStones = v;
  },
  setHit: (id: string, v: number) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.hit = v;
  },
  // per-team flair in duel (control room, harnesses): applied to current and future bodies
  setFlair: (team: Team, v: number) => {
    FLAIR_BY_TEAM[team] = v;
    bodies.forEach((c) => {
      if (c.team === team) c.flair = v;
    });
  },
  setHoldSeconds: (s: number) => {
    HOLD_SECONDS = Math.max(0.5, s || 5);
  },
  moments: () => Object.assign({}, moments),
  resetMoments: () => {
    moments = { holds: 0, reprieve: 0, parries: 0, rounds: 0 };
  },
  setHunt: (team: Team, v: number) => {
    HUNT_BY_TEAM[team] = v;
    bodies.forEach((c) => {
      if (c.team === team) c.hunt = v;
    });
  },
  setHour: (h: number) => {
    settings.hour = ((h % 1) + 1) % 1;
  },
  egg: () => (egg ? { t: egg.t, duration: HATCH_TIME } : null),
  plantBramble: () => plantBramble('probe'),
  internal: () => ({
    snake: snake,
    fruit,
    dir,
    stones: stones.map((r) => ({ x: r.x, y: r.y, t: r.t })),
    brambles: brambles.map((bramble) => ({
      t: bramble.t,
      seg: bramble.seg.map((g) => ({ x: g.x, y: g.y, t: g.t })),
    })),
    warning: STONE_WARNING,
    speed: SPEED,
    brambleWarning: BRAMBLE_WARNING,
    brambleMax: BRAMBLE_MAX_SEGMENTS,
    berries: berries.map((b) => ({ x: b.x, y: b.y, team: b.team ?? null })),
    seeds: seeds.map((g) => ({ x: g.x, y: g.y })),
    body: bodies.map((c) => ({
      team: c.team,
      length: c.snake.length,
      head: c.snake[0] ?? null,
      snake: c.snake.map((s) => ({ x: s.x, y: s.y })),
      dir: { ...c.dir },
      invincibleTime: c.invincibleTime,
      deathCause: c.deathCause ?? null,
      debug: c.aiMemory.debug ?? null,
    })),
  }),
};

// window.Viper is typed via legacy-globals.d.ts (GameApi, a loose subset);
// the full API is structurally compatible at runtime.
window.Viper = viperPublic as unknown as typeof window.Viper;

function start(): void {
  bindCanvas(document.getElementById('scene'));
  const localCanvas = getCanvas();
  if (!localCanvas) return;
  // sharp render: canvas surface matches displayed size and screen pixel ratio
  const adjust = () => {
    const r = localCanvas.getBoundingClientRect(),
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = r.width > 0 ? Math.round(r.width * dpr) : W;
    localCanvas.width = w;
    localCanvas.height = Math.round((w * H) / WF);
    const s = localCanvas.width / WF;
    // ctx is always non-null after bindCanvas
    const c = getCtx();
    if (c) c.setTransform(s, 0, 0, s, OX * s, 0);
  };
  adjust();
  window.addEventListener('resize', adjust);
  adjustCanvas = adjust;
  ['pointerdown', 'keydown'].forEach((ev) => {
    window.addEventListener(ev, armSound, { once: false, passive: true });
  });
  // Absent in headless runs; the window resize listener above still keeps the canvas fitted.
  if ('ResizeObserver' in window) new ResizeObserver(adjust).observe(localCanvas);
  document.addEventListener('keydown', (ev) => {
    const keyMap: Record<string, Direction> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const d = keyMap[ev.key];
    if (d && !settings.ai && !(d.x === -dir.x && d.y === -dir.y)) {
      nextDir = d;
      ev.preventDefault();
    }
  });
  newRound();
  lastFrameTime = performance.now() / 1000;
  requestAnimationFrame(loop);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
