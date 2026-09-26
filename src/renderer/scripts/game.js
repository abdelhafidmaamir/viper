// Viper Live: game loop module. Single AI-driven snake duel in the forest.
// Constant speed, self-collision always kills, no canvas text, no background sound.

import { W, H, COLS, ROWS, CELL, X0, Y0, OX, WF, setFormat } from '../engine/layout.js';
import { canvas, ctx, bindCanvas } from '../engine/canvas.js';
import {
  armSound,
  toggleSound,
  isSoundActive,
  playBite,
  playHatch,
  playStone,
  isSoundReady,
} from '../engine/audio.js';
import { announceStreak, resetRoundDonations, announceRescue } from '../engine/announcements.js';
import { SHADOW, GOLD } from '../engine/palette.js';
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
} from '../engine/rules.js';
import { cadence, forceLength, maxLength, updateTier, tier, jitter } from '../engine/crowd.js';
import {
  extendBramble,
  freeCells,
  plantBramble,
  activeBrambles,
  allFruits,
  isDeadZone,
} from '../engine/hazards.js';
import { sceneState, endScene, launchScene, scene } from '../engine/scenes.js';
import { updateTension, tension } from '../engine/tension.js';
import { receiveEvent } from '../engine/audience-events.js';
import { clearGiftFeedback } from '../engine/gift-feedback.js';
import { drawFrame } from '../engine/frame.js';

let adjustCanvas = null;

// Applies the format requested in settings; called at the start of each round (never mid-round).
function applyFormat() {
  if (!setFormat(settings.format)) return;
  if (canvas) {
    canvas.style.aspectRatio = WF + '/' + H;
    if (WF > H) {
      canvas.style.width = '100vw';
      canvas.style.height = 'auto';
    } else {
      canvas.style.width = '';
      canvas.style.height = '100vh';
    }
  }
  if (adjustCanvas) adjustCanvas();
}

export let brambles = [];

export let halos = [];
export let snake = [],
  positionHistory = [],
  dir = { x: 1, y: 0 },
  nextDir = { x: 1, y: 0 };
export let fruit = null,
  subStep = 0,
  grew = false,
  aiMemory = {},
  trace = [];
// segments still to push out of the shell: the body grows step by step from the egg
let toPush = 0;
// Viewer gifts: a seed drops, germinates in 1 s, becomes an edible berry. At most 3 active.
export let seeds = [],
  berries = [],
  sparks = [],
  gifted = 0,
  giftsEaten = 0;

// Two teams, two snakes: gold feeds (sun), shadow blocks (moon). The round decides between them.
export let stones = [],
  round = null,
  rounds = [],
  berrylessTime = 0;
let aiAdjustments = 0,
  aiHolds = 0; // anti-wiggle: re-decisions at crossing, and decisions held
let tickOrder = 0; // duel: alternates which snake resolves first each tick (fairness)

let wildDelay = 0;

// A silently swallowed render error once broke the game with no indication: keep the last message.
let lastError = null;
const firstLine = (err) =>
  ((err && err.stack ? err.stack : '').split(String.fromCharCode(10))[1] || '').trim();
export let t = 0,
  pause = 0,
  berriesEaten = 0,
  stonesPlaced = 0,
  hits = 0,
  deaths = 0,
  errors = 0,
  turns = 0,
  staircases = 0,
  avoidable = 0,
  deathLengths = [],
  dirs = [];
// Single mode: gold vs shadow duel.
// caps: false by default, so stones, brambles, and berries can be placed without limit until the
// board is full. True restores tier caps, the only state where balance harnesses measure
// something comparable.
export const settings = {
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

export const px = (gx, gy) => ({ x: X0 + gx * CELL + CELL / 2, y: Y0 + gy * CELL + CELL / 2 });
export const getAmbience = () => (window.AMBIENCES || []).find((a) => a.id === 'forest') || null;

export let HOLD_SECONDS = 5; // seconds to hold the full ring to win (setHoldSeconds for the harness)
// engagement-moment counters (proxy for profit): holds started, reprieve periods, parries
let moments = { holds: 0, reprieve: 0, parries: 0, rounds: 0 };

// burstSegments: converts segments into active berries (duel cut or duel death).
// Call under loadBody(i): isDeadZone uses the correct head context (duel checks both).
// team: dropped segments keep the color of the snake that lost them. No team = neutral green berry.
function burstSegments(segs, team) {
  segs.forEach((s) => {
    if (isDeadZone(s, 0)) return;
    const p = px(s.x, s.y);
    burst(
      p.x,
      p.y,
      4,
      team === 'gold' ? 'gift-gold' : team === 'shadow' ? 'gift-shadow' : 'neutral-burst',
    );
    berries.push({ x: s.x, y: s.y, nickname: '', t: 0, wild: false, team: team || null });
  });
}

// plantSeedFor(i, nickname): plants a berry in the half of the board nearest to body i's head.
// Must be called while processing a duel event; call loadBody(0) after the loop.
export function plantSeedFor(i, nickname) {
  const headIndex = bodies[i] && bodies[i].snake[0];
  const rivalHeadIndex = bodies[1 - i] && bodies[1 - i].snake[0];
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
  const dirI = bodies[i].dir || { x: 1, y: 0 };
  const inFront = l.filter((c) => (c.x - headIndex.x) * dirI.x + (c.y - headIndex.y) * dirI.y > 0);
  if (inFront.length) l = inFront;
  l.sort(
    (p, q) =>
      Math.abs(p.x - headIndex.x) +
      Math.abs(p.y - headIndex.y) -
      (Math.abs(q.x - headIndex.x) + Math.abs(q.y - headIndex.y)),
  );
  const c = l[Math.floor(Math.random() * Math.min(4, l.length))];
  seeds.push({
    x: c.x,
    y: c.y,
    nickname: nickname || '',
    t: 0,
    team: bodies[i].team,
    owner: bodies[i].team,
  }); // tinted by the team, and RESERVED for that team (no stealing berries)
  gifted++;
  storeBody();
  return 1;
}

// cutDuel(adverseIdx, k): removes k segments from the tail of the opponent body, bursting them as berries.
// Returns the number of segments actually cut. Ends with storeBody() but NOT loadBody(0).
export function cutDuel(adverseIdx, k, thiefIndex) {
  loadBody(adverseIdx);
  if (!snake.length) {
    storeBody();
    return 0;
  }
  if (bodies[adverseIdx].shieldTime > 0) {
    // the shield parries the entire cut while active; the rail and head display it
    bodies[adverseIdx].parryTime = 0.9;
    moments.parries++;
    announceRescue(adverseIdx, 'shield');
    // Balance test: the parried cut is GIVEN BACK to the shielded snake; it grows by the amount that would have been cut.
    const gain = Math.max(1, Math.round(snake.length * CUT_FRACTION));
    toPush += gain;
    const pos = px(snake[0].x, snake[0].y);
    burst(pos.x, pos.y, 20, 'shell');
    storeBody();
    return 0;
  }
  let count = Math.min(k, Math.max(0, snake.length - 1));
  if (count <= 0) {
    storeBody();
    return 0;
  }
  if (snake.length - count < 3 && !bodies[adverseIdx].adult) {
    // young snake (never reaches 10 segments): cut down to YOUNG_MIN_LENGTH, never kill a snake in its shell
    count = Math.max(0, snake.length - YOUNG_MIN_LENGTH);
    if (count <= 0) {
      storeBody();
      return 0;
    }
  }
  if (snake.length - count < 3 && bodies[adverseIdx].lives > 0) {
    // a life absorbs the death: cut stops at 3 segments
    bodies[adverseIdx].lives--;
    bodies[adverseIdx].parryTime = 0.9;
    announceRescue(adverseIdx, 'life');
    count = Math.max(0, snake.length - 3);
    if (count <= 0) {
      storeBody();
      return 0;
    }
  }
  bodies[adverseIdx].ringPeak = snake.length / TARGET_LENGTH;
  bodies[adverseIdx].recoilTime = 0.9;
  bodies[adverseIdx].cutTime = 0.9;
  const segs = snake.slice(-count);
  snake = snake.slice(0, snake.length - count);
  positionHistory = positionHistory.slice(0, Math.max(1, snake.length + 3));
  if (segs.length) {
    const p = px(segs[0].x, segs[0].y);
    burst(p.x, p.y, 16, 'neutral-burst');
  }
  if (thiefIndex !== undefined && bodies[thiefIndex]) {
    // Steal: segments do not drop as berries, they pass directly to the thieving team's snake.
    bodies[thiefIndex].toPush = (bodies[thiefIndex].toPush || 0) + segs.length;
    segs.forEach((sg) => {
      const p = px(sg.x, sg.y);
      burst(p.x, p.y, 3, bodies[thiefIndex].team === 'gold' ? 'gift-gold' : 'gift-shadow');
    });
  } else burstSegments(segs, bodies[adverseIdx].team);
  if (snake.length < 3 && bodies[adverseIdx].adult) {
    snake = [];
    // adverseIdx lost: the opposing team wins
    const gagnant = bodies[adverseIdx].team === 'shadow' ? 'gold' : 'shadow';
    storeBody();
    endRound(gagnant, 'place');
    return count;
  }
  storeBody();
  requestAiMove();
  return count;
}

// opt controls burst strength: speed, upward thrust, gravity, size, opacity.
export function burst(x, y, n, tint, opt) {
  const o = opt || {},
    v0 = o.v0 !== undefined ? o.v0 : 60,
    v1 = o.v1 !== undefined ? o.v1 : 240;
  const upBoost = o.top !== undefined ? o.top : 40,
    g = o.g !== undefined ? o.g : 520;
  const r = o.r !== undefined ? o.r : 1,
    a0 = o.a !== undefined ? o.a : 1,
    d = o.duration !== undefined ? o.duration : 0.5;
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
      k: o.frein || 0,
    });
  }
}

window.receiveEvent = receiveEvent;

// Sky race: sun on the left, moon on the right, both starting low.
// Each berry eaten raises the sun one notch; each stone placed raises the moon.
// First to the top ends the round. The snake is the ball, not the player.
function newRound() {
  applyFormat();
  settings.advantage = 0; // advantage is a one-time nudge, not a persistent setting
  clearGiftFeedback();
  resetRoundDonations();
  if (settings.autoAmbience) {
    const weatherOptions = [
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
    ].filter((keyMap) => keyMap !== settings.weather);
    settings.weather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
    settings.hour = ['stars', 'aurora', 'fireflies'].includes(settings.weather)
      ? 0.02
      : settings.weather === 'embers'
        ? 0.78
        : settings.weather === 'spring'
          ? 0.36
          : [0.02, 0.22, 0.36, 0.5, 0.64, 0.78][Math.floor(Math.random() * 6)];
  }
  endScene(); // scene does not survive the round; underdog state does (explicit toggle)
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
    topSun: tier.skySun,
    topMoon: tier.skyMoon,
    pulseSun: 9,
    pulseMoon: 9,
    target: tier.target,
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
    loadBody(i);
    spawn(false, bodies[i].x0, bodies[i].y0, bodies[i].dir0);
    storeBody();
  }
  loadBody(0);
}

// Turnout grows: the sky only stretches, never shrinks, and the orb keeps its on-screen height.
// Without this, a rush of viewers would push the sun back down, breaking race readability.
function stretchSky(team, target, increment) {
  const heightKey = 'top' + team,
    skyKey = 'sky' + team,
    h = round[heightKey];
  if (target <= h) return;
  const newHeight = Math.min(target, h + increment);
  round[skyKey] *= newHeight / h;
  round[heightKey] = newHeight;
}

// Advance one notch for a team. First to the top of the sky wins.
export function rise(team, n) {
  return;
}

// Streak counter. Counts ROUNDS won, not points, and survives across rounds:
// it is the only persistent score a viewer joining mid-stream can read at a glance.
// `pulse` resets to zero when a team scores, triggering the number-grow animation;
// without this, the increment would go unnoticed under the end-of-round veil.
export let snakeScore = 0,
  scoreViewers = 0,
  snakePulse = 9,
  viewersPulse = 9;
const isSnakeTeam = (c) => c === 'snake' || c === 'sun' || c === 'gold';

function endRound(team, cause) {
  if (!round || round.state !== 'playing') return;
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
    cause: cause || 'unknown',
    duration: round.t,
    length: snake.length,
    sun: round.sun,
    moon: round.moonEvents,
    skySun: round.skySun,
    skyMoon: round.skyMoon,
    target: round.target,
    harvest: round.harvest,
    mode: settings.mode,
    tier: tier.id,
  });
}

export let egg = null;

// Multi-body architecture: load/store pattern.
// Load body i into module variables, work on it, then store back.
function createBody(team, tint, x0, y0, dir0) {
  return {
    team: team,
    tint: tint,
    flair: FLAIR_BY_TEAM[team] || 0,
    hunt: HUNT_BY_TEAM[team] || 0,
    x0: x0 !== undefined ? x0 : Math.floor(COLS / 2),
    y0: y0 !== undefined ? y0 : Math.floor(ROWS / 2),
    dir0: dir0 || { x: 1, y: 0 },
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
export let bodies = [],
  activeIndex = 0;

export function loadBody(i) {
  activeIndex = i;
  const c = bodies[i];
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
export function storeBody() {
  const c = bodies[activeIndex];
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
export const rival = () => (bodies.length > 1 ? bodies[1 - activeIndex] : null);

function spawn(keep, x0, y0, dir0) {
  const cx = x0 !== undefined ? x0 : Math.floor(COLS / 2);
  const cy = y0 !== undefined ? y0 : Math.floor(ROWS / 2);
  snake = [];
  positionHistory = [];
  trace = [];
  egg = { t: 0, x: cx, y: cy, keep: !!keep, dir0: dir0 || null };
  if (!keep) {
    seeds = [];
    berries = [];
  }
}

function hatch(keep) {
  const cx = egg ? egg.x : Math.floor(COLS / 2);
  const cy = egg ? egg.y : Math.floor(ROWS / 2);
  const d0 = egg && egg.dir0 ? egg.dir0 : { x: 1, y: 0 };
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
    const isOccupied = (c) => snake.some((s) => s.x === c.x && s.y === c.y);
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
function opponentCrown(a) {
  const h = a.snake[0];
  if (!h) return [];
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
    .map(([x, y]) => ({ x: h.x + x, y: h.y + y }))
    .filter((c) => c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS);
}
export function requestAiMove(keep) {
  if (!settings.ai || !window.ViperAi || !snake.length) return;
  try {
    const otherBody = rival();
    const state = {
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
      advantage: bodies[activeIndex]
        ? ((bodies[activeIndex].team === 'gold' ? 1 : -1) * (settings.advantage || 0)) / 100
        : 0,
      flair: bodies[activeIndex] ? bodies[activeIndex].flair : 0,
      hunt: bodies[activeIndex] ? bodies[activeIndex].hunt : 0,
      opponent: otherBody ? otherBody.snake : null,
      opponentInvincible: !!(otherBody && otherBody.invincibleTime > 0),
      memory: aiMemory,
    };
    // Scene: the half concerning the active body's team is applied to state.
    if (scene && bodies[activeIndex]) {
      const teamScene = scene[bodies[activeIndex].team] || {};
      if (teamScene.stance) state.forcedStance = teamScene.stance;
      if (teamScene.pA) state.attackRange = teamScene.pA;
      if (teamScene.pD) state.defenseRange = teamScene.pD;
      if (teamScene.hunt != null) state.forcedHunt = teamScene.hunt;
      if (teamScene.flair != null) state.forcedFlair = teamScene.flair;
      if (teamScene.recklessness != null) state.recklessness = teamScene.recklessness;
      if (teamScene.berryRace) state.berryRace = true;
      if (teamScene.immediateTrap) state.immediateTrap = true;
      if (teamScene.lure) state.lure = true;
      if (teamScene.repel) state.repel = true;
      if (teamScene.encircle) state.encircle = true;
      if (teamScene.noKill) state.noKill = true;
    }
    // Underdog: the shorter snake silently gets +recklessness and +2 cells of range.
    if (settings.underdog && bodies.length === 2) {
      const myLength = bodies[activeIndex].snake.length,
        oppLength = bodies[1 - activeIndex].snake.length;
      if (myLength < oppLength) {
        state.recklessness = (state.recklessness || 0) + 0.03;
        state.attackRange = (state.attackRange || 12) + 2;
        state.defenseRange = (state.defenseRange || 10) + 2;
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
    const superActive = !!(
      !scene &&
      window.ViperSuperAi &&
      bodies[activeIndex] &&
      (settings.superAi === true || settings.superAi === bodies[activeIndex].team)
    );
    if (superActive && keep) state.preferred = nextDir;
    let d = superActive ? window.ViperSuperAi.choose(state) : window.ViperAi.choose(state);
    // Hold: a direction already announced (and drawn) is kept if the AI still judges it safe.
    if (
      !superActive &&
      keep &&
      d &&
      (d.x !== nextDir.x || d.y !== nextDir.y) &&
      window.ViperAi.safeStep &&
      window.ViperAi.safeStep(state, nextDir)
    )
      d = nextDir;
    // The back is the neck segment, not the last attempted direction (after a failed step into a wall,
    // dir points into the wall and its inverse may be the only way out).
    const neck = snake[1]
      ? { x: snake[1].x - snake[0].x, y: snake[1].y - snake[0].y }
      : { x: -dir.x, y: -dir.y };
    if (d && !(d.x === neck.x && d.y === neck.y)) nextDir = d;
  } catch (err) {
    errors++;
    lastError =
      'ai: ' + err.message + ' | ' + (err.stack || '').split('\n').slice(0, 3).join(' > ');
  }
}

function die(cause) {
  if (bodies[activeIndex]) bodies[activeIndex].deathCause = cause || 'self'; // for probes: cause of death
  // Avoidable death: the head still had a free neighbor cell.
  // The tail does not free its cell on a bite step: it counts as occupied.
  const h = snake[0],
    currentSegs = grew ? snake : snake.slice(0, -1);
  if (
    [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ].some(([x, y]) => {
      const a = h.x + x,
        b = h.y + y;
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
  if (bodies[activeIndex].shieldTime > 0) {
    // the shield parries the collision: no segments lost, respawns invincible
    bodies[activeIndex].parryTime = 0.9;
    bodies[activeIndex].invincibleTime = 1.5;
    announceRescue(activeIndex, 'shield');
    if (snake.length) {
      const pos = px(snake[0].x, snake[0].y);
      burst(pos.x, pos.y, 20, 'shell');
    }
    requestAiMove();
    return;
  }
  // Self fault (wall, own body): NO segments lost. Respawns invincible for 1.5 s and re-decides.
  // Only the opponent's body and head-on collisions (the opponent's trap) cost half the body.
  // Exception: if the opponent cornered it (within 2 cells of the head), it counts as an opponent
  // trap, not a self fault.
  const opponentBody = rival();
  const h0 = snake[0];
  const cornered = !!(
    opponentBody &&
    h0 &&
    opponentBody.snake.some((q) => Math.abs(q.x - h0.x) + Math.abs(q.y - h0.y) <= 2)
  );
  if (cornered && (cause === 'wall' || cause === 'self')) {
    cause = 'adverse';
    bodies[activeIndex].deathCause = 'adverse';
  }
  if (cause === 'wall' || cause === 'self') {
    bodies[activeIndex].invincibleTime = 1.5;
    bodies[activeIndex].parryTime = 0.4;
    if (snake.length) {
      const pos = px(snake[0].x, snake[0].y);
      burst(pos.x, pos.y, 10, 'dust');
    }
    requestAiMove();
    return;
  }
  const L = snake.length;
  const threshold = Math.max(bodies[activeIndex].adult ? 3 : YOUNG_MIN_LENGTH, Math.floor(L / 2));
  const lostSegments = snake.slice(threshold);
  snake = snake.slice(0, threshold);
  positionHistory = positionHistory.slice(0, Math.max(1, threshold + 3));
  bodies[activeIndex].invincibleTime = 1.5;
  bodies[activeIndex].ringPeak = L / TARGET_LENGTH;
  bodies[activeIndex].recoilTime = 0.9;
  bodies[activeIndex].cutTime = 0.9;
  burstSegments(lostSegments, bodies[activeIndex].team);
  if (snake.length < 3 && bodies[activeIndex].adult) {
    snake = [];
    const opponent = rival();
    endRound(opponent ? opponent.team : 'gold', 'place');
  } else requestAiMove(); // otherwise it keeps heading into the wall and dies again when invincibility ends
  return;
}

function step() {
  if (!snake.length) return false;
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
      x: snake[0].x,
      y: snake[0].y,
    };
  if (nextDir.x !== dir.x || nextDir.y !== dir.y) {
    turns++;
    // staircase: a, b, a, b over four consecutive steps
    const n = dirs.length,
      c = nextDir;
    if (
      n >= 3 &&
      dirs[n - 1] !== dirs[n - 2] &&
      dirs[n - 2] !== dirs[n - 3] &&
      dirs[n - 2].x === c.x &&
      dirs[n - 2].y === c.y &&
      dirs[n - 1].x === dirs[n - 3].x &&
      dirs[n - 1].y === dirs[n - 3].y
    )
      staircases++;
  }
  dir = nextDir;
  dirs.push(dir);
  if (dirs.length > 4) dirs.shift();
  const nx = snake[0].x + dir.x,
    ny = snake[0].y + dir.y;
  // temporary invincibility (after a life absorbs a death, or after a head-on collision in a duel)
  const isInvincible = bodies[activeIndex].invincibleTime > 0;
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
  if (activeBrambles().some((g) => g.x === nx && g.y === ny)) {
    die('bramble');
    return false;
  }
  // berry reserved for the other team: the snake passes over it without eating
  const myTeam = bodies[activeIndex] ? bodies[activeIndex].team : null;
  const berryIdx = berries.findIndex(
    (b) => b.x === nx && b.y === ny && !(b.owner && myTeam && b.owner !== myTeam),
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
    const opponentHead = otherBodyDuel && otherBodyDuel.snake[0];
    if (
      opponentHead &&
      opponentHead.x === nx &&
      opponentHead.y === ny &&
      otherBodyDuel.invincibleTime <= 0
    ) {
      const myIdx = activeIndex;
      die('headOn');
      if (round && round.state === 'playing') {
        storeBody();
        loadBody(1 - myIdx);
        die('headOn');
        storeBody();
        loadBody(myIdx);
      }
      return false;
    }
    die(
      otherBodyDuel && otherBodyDuel.snake.some((s) => s.x === nx && s.y === ny)
        ? 'adverse'
        : 'self',
    );
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
    if (!b || !b.wild) giftsEaten++;
    // halo tinted by the eaten berry: gold, shadow, or green (no team)
    halos.push({
      x: p.x,
      y: p.y,
      t: 0,
      duration: b && b.wild ? 0.85 : 1.1,
      tint:
        b && b.wild
          ? 'nature'
          : b && b.team === 'gold'
            ? 'gift-gold'
            : b && b.team === 'shadow'
              ? 'gift-shadow'
              : 'gifted',
    });
    rise('sun', 1);
    const a = getAmbience();
    playBite(a);
  }
  requestAiMove();
  return true;
}

// Smooth trace: one Bezier arc per cell, midpoint to midpoint (rounded turns, exact continuity).
function vertex(k) {
  if (k < 0) {
    const h = positionHistory[0];
    return { x: h.x + nextDir.x, y: h.y + nextDir.y };
  }
  return positionHistory[Math.min(k, positionHistory.length - 1)];
}
function pointOn(p) {
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
function computeTrace() {
  const L = snake.length;
  if (!L) return [];
  const ph = 1 - subStep,
    pt = grew ? L - 1 : L - subStep,
    pts = [];
  for (let p = ph; p < pt; p += 1 / 3) pts.push(pointOn(p));
  pts.push(pointOn(pt));
  return pts;
}

// Advances logic by dt seconds (no rendering: also used by the Node harness).
function advance(dt) {
  t += dt;
  updateTier(dt);
  // score animation lives OUTSIDE the round: it starts exactly when the round ends
  snakePulse += dt;
  viewersPulse += dt;
  // day cycle advances on its own: night, sunrise, noon, sunset, looping
  if (settings.cycle > 0) settings.hour = (settings.hour + dt / settings.cycle) % 1;
  if (scene && round && round.state === 'playing') {
    scene.remaining -= dt;
    if (scene.remaining <= 0) endScene();
  }
  // seeds: they germinate, then become edible berries
  for (let i = seeds.length - 1; i >= 0; i--) {
    const g = seeds[i];
    g.t += dt;
    if (g.t >= SEED_GROW_TIME) {
      seeds.splice(i, 1);
      berries.push({
        x: g.x,
        y: g.y,
        nickname: g.nickname,
        t: 0,
        team: g.team || null,
        owner: g.owner || null,
      });
      burst(
        px(g.x, g.y).x,
        px(g.x, g.y).y,
        6,
        g.team === 'gold' ? 'gift-gold' : g.team === 'shadow' ? 'gift-shadow' : 'gifted',
      );
      requestAiMove();
    }
  }
  berries.forEach((b) => {
    b.t += dt;
  });
  updateTension(dt);
  for (let i = halos.length - 1; i >= 0; i--) {
    halos[i].t += dt;
    if (halos[i].t >= halos[i].duration) halos.splice(i, 1);
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const e = sparks[i];
    e.t += dt;
    if (e.t >= e.duration) {
      sparks.splice(i, 1);
      continue;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vy += (e.g === undefined ? 520 : e.g) * dt;
    if (e.k) {
      const fr = Math.max(0, 1 - e.k * dt);
      e.vx *= fr;
      e.vy *= fr;
    }
  }
  // stones: shadow first, then the stone, then fade out
  for (let i = stones.length - 1; i >= 0; i--) {
    const r = stones[i];
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
    bramble.t += dt;
    bramble.seg.forEach((g) => (g.t += dt));
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
      stretchSky('Sun', tier.skySun, dt * 14);
      stretchSky('Moon', tier.skyMoon, dt * 2);
      // Target grows with turnout, so harvest rescales the same way stretchSky() does for the orbs.
      // Without this, a full ring would fall to 17 % when the crowd arrived and viewers would see
      // progress GO BACKWARD.
      if (tier.target > round.target) {
        const avant = round.target;
        round.target = Math.min(tier.target, round.target + dt * 14);
        if (avant > 0 && round.target > avant) round.harvest *= round.target / avant;
      }
      round.pulseSun += dt;
      round.pulseMoon += dt;
      // Duel, ring win: a team wins when its half-ring is full (TARGET_LENGTH segments)
      // and it holds for HOLD_SECONDS without being cut below. The timer is the fallback.
      const fullBodies = [];
      for (let i = 0; i < bodies.length; i++) {
        const c = bodies[i];
        const prevHold = c.hold || 0;
        c.hold = c.snake.length >= TARGET_LENGTH ? (c.hold || 0) + dt : 0;
        if (prevHold === 0 && c.hold > 0) moments.holds++;
        if (c.snake.length >= ADULT_LENGTH) c.adult = true;
        const enSursis = !c.egg && c.snake.length > 0 && c.snake.length < REPRIEVE_LENGTH;
        if (enSursis && !c.reprieve) moments.reprieve++;
        c.reprieve = enSursis;
        if (c.hold >= HOLD_SECONDS) fullBodies.push(c);
      }
      // Strict tie-break: previously the loop broke on the first body holding its ring,
      // so gold could beat shadow by array order alone. Both are now evaluated: longer hold wins;
      // identical hold = draw.
      if (fullBodies.length === 1) endRound(fullBodies[0].team, 'ring');
      else if (fullBodies.length > 1) {
        const a = fullBodies[0],
          b = fullBodies[1];
        endRound(a.hold === b.hold ? 'draw' : a.hold > b.hold ? a.team : b.team, 'ring');
      }
      if (round.state !== 'playing') return;
      // duel: round timer (balance test: at 120 s, calm audiences never fill the ring)
      if (round.t >= (settings.duelDuration || settings.duration)) {
        // Longer wins. Both snakes at or below START_LENGTH: draw, no point.
        const l0 = bodies[0].snake.length,
          l1 = bodies[1].snake.length;
        // Strict tie-break: equal length was silently awarded to shadow (team bias). Without viewers,
        // both snakes often end at the same length (5 % of measured rounds): that is a draw, no point.
        if (l0 === l1) endRound('draw', 'timeout');
        else if (l0 <= START_LENGTH && l1 <= START_LENGTH) endRound('draw', 'timeout');
        else endRound(l0 > l1 ? 'gold' : 'shadow', 'timeout');
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
          let l = freeCells().filter((c) => !isDeadZone(c, SEED_GROW_TIME));
          if (bodies[0] && bodies[1] && bodies[0].snake[0] && bodies[1].snake[0]) {
            const a = bodies[0].snake[0],
              b = bodies[1].snake[0];
            const distDiff = (c) =>
              Math.abs(
                Math.abs(c.x - a.x) +
                  Math.abs(c.y - a.y) -
                  (Math.abs(c.x - b.x) + Math.abs(c.y - b.y)),
              );
            const equidistantCells = l.filter(
              (c) => distDiff(c) <= 1 && !isDeadZone(c, SEED_GROW_TIME),
            );
            if (equidistantCells.length) l = equidistantCells;
            else {
              l.sort((p, q) => distDiff(p) - distDiff(q));
              l = l.slice(0, 4);
            }
          }
          if (!l.length) l = freeCells();
          if (l.length) {
            const c = l[Math.floor(Math.random() * l.length)];
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
function advanceBody(dt) {
  // per-body timers in duel (boostTime, invincibleTime, cutTime)
  if (bodies[activeIndex].boostTime > 0)
    bodies[activeIndex].boostTime = Math.max(0, bodies[activeIndex].boostTime - dt);
  if (bodies[activeIndex].invincibleTime > 0)
    bodies[activeIndex].invincibleTime = Math.max(0, bodies[activeIndex].invincibleTime - dt);
  if (bodies[activeIndex].cutTime > 0)
    bodies[activeIndex].cutTime = Math.max(0, bodies[activeIndex].cutTime - dt);
  if (bodies[activeIndex].parryTime > 0)
    bodies[activeIndex].parryTime = Math.max(0, bodies[activeIndex].parryTime - dt);
  if (bodies[activeIndex].shieldTime > 0)
    bodies[activeIndex].shieldTime = Math.max(0, bodies[activeIndex].shieldTime - dt);
  if (bodies[activeIndex].recoilTime > 0)
    bodies[activeIndex].recoilTime = Math.max(0, bodies[activeIndex].recoilTime - dt);
  if (pause > 0) {
    pause -= dt;
    if (pause <= 0) {
      pause = 0;
      spawn(!!(round && round.state === 'playing'));
    }
    return;
  }
  if (egg) {
    const avant = egg.t;
    egg.t += dt;
    const a0 = getAmbience();
    if (isSoundReady() && a0 && a0.hatchSound) {
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
    if (!egg || !egg.emerged) return;
  }
  const boosted = bodies[activeIndex].boostTime > 0;
  subStep += dt * SPEED * (boosted ? BOOST_FACTOR : 1); // like: boost cadence
  while (subStep >= 1) {
    subStep -= 1;
    if (!step()) return;
  }
}

let lastFrameTime = 0;
function loop(ts) {
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
  trace = bodies[0] ? bodies[0].trace : [];
  try {
    drawFrame(dt);
  } catch (err) {
    errors++;
    lastError = 'render: ' + err.message + ' | ' + firstLine(err);
  }
  requestAnimationFrame(loop);
}

window.Viper = {
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
  endTest: (team) => {
    endRound(team || 'gold', 'test');
  },
  soundOn: isSoundActive,
  tier: () => ({
    id: tier.id,
    cadence: Math.round(cadence),
    topSun: round ? Math.round(round.topSun) : tier.skySun,
    topMoon: round ? Math.round(round.topMoon) : tier.skyMoon,
  }),
  round: () =>
    round && {
      state: round.state,
      t: round.t,
      sun: round.sun,
      moon: round.moonEvents,
      winner: round.winner,
      skySun: round.skySun,
      skyMoon: round.skyMoon,
      harvest: round.harvest,
      target: round.target,
    },
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
  duel: () => ({
    t: round && round.t,
    winner: round && round.winner,
    gold: bodies[0]
      ? {
          length: bodies[0].snake.length,
          stance: (bodies[0].aiMemory && bodies[0].aiMemory.activeStance) || 'neutral',
          reason: bodies[0].aiMemory && bodies[0].aiMemory.reason,
          hold: bodies[0].hold || 0,
          shieldTime: bodies[0].shieldTime,
          lives: bodies[0].lives,
          boostTime: bodies[0].boostTime,
          invincibleTime: bodies[0].invincibleTime,
          cutTime: bodies[0].cutTime,
          recoilTime: bodies[0].recoilTime,
        }
      : null,
    shadow: bodies[1]
      ? {
          length: bodies[1].snake.length,
          stance: (bodies[1].aiMemory && bodies[1].aiMemory.activeStance) || 'neutral',
          reason: bodies[1].aiMemory && bodies[1].aiMemory.reason,
          hold: bodies[1].hold || 0,
          shieldTime: bodies[1].shieldTime,
          lives: bodies[1].lives,
          boostTime: bodies[1].boostTime,
          invincibleTime: bodies[1].invincibleTime,
          cutTime: bodies[1].cutTime,
          recoilTime: bodies[1].recoilTime,
        }
      : null,
  }),
  // race parameters for the balance harnesses
  setSky: (id, sun, moon) => {
    const p = TIERS.find((x) => x.id === id);
    if (!p) return;
    if (sun) p.skySun = sun;
    if (moon) p.skyMoon = moon;
  },
  setTarget: (id, c) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.target = c;
  },
  setMaxLength: forceLength,
  setMaxStones: (id, v) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.maxStones = v;
  },
  setHit: (id, v) => {
    const p = TIERS.find((x) => x.id === id);
    if (p) p.hit = v;
  },
  // per-team flair in duel (control room, harnesses): applied to current and future bodies
  setFlair: (team, v) => {
    FLAIR_BY_TEAM[team] = v;
    bodies.forEach((c) => {
      if (c.team === team) c.flair = v;
    });
  },
  setHoldSeconds: (s) => {
    HOLD_SECONDS = Math.max(0.5, +s || 5);
  },
  moments: () => Object.assign({}, moments),
  resetMoments: () => {
    moments = { holds: 0, reprieve: 0, parries: 0, rounds: 0 };
  },
  setHunt: (team, v) => {
    HUNT_BY_TEAM[team] = v;
    bodies.forEach((c) => {
      if (c.team === team) c.hunt = v;
    });
  },
  setHour: (h) => {
    settings.hour = ((h % 1) + 1) % 1;
  },
  egg: () => egg && { t: egg.t, duration: HATCH_TIME },
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
    berries: berries.map((b) => ({ x: b.x, y: b.y, team: b.team || null })),
    seeds: seeds.map((g) => ({ x: g.x, y: g.y })),
    body: bodies.map((c) => ({
      team: c.team,
      length: c.snake.length,
      head: c.snake[0] || null,
      snake: c.snake.map((s) => ({ x: s.x, y: s.y })),
      dir: { ...c.dir },
      invincibleTime: c.invincibleTime,
      deathCause: c.deathCause || null,
      debug: c.aiMemory.debug || null,
    })),
  }),
};

function start() {
  bindCanvas(document.getElementById('scene'));
  if (!canvas) return;
  // sharp render: canvas surface matches displayed size and screen pixel ratio
  const adjust = () => {
    const r = canvas.getBoundingClientRect(),
      dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = r.width > 0 ? Math.round(r.width * dpr) : W;
    canvas.width = w;
    canvas.height = Math.round((w * H) / WF);
    const s = canvas.width / WF;
    ctx.setTransform(s, 0, 0, s, OX * s, 0);
  };
  adjust();
  window.addEventListener('resize', adjust);
  adjustCanvas = adjust;
  ['pointerdown', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, armSound, { once: false, passive: true }),
  );
  if (window.ResizeObserver)
    try {
      new ResizeObserver(adjust).observe(canvas);
    } catch (e) {}
  document.addEventListener('keydown', (ev) => {
    const keyMap = {
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
