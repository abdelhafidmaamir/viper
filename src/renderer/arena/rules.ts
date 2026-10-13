// Snake Arena: the board's state. Up to eight viewers' snakes at once on Feed's 30 x 30 board, one
// per prod colour, each hatched from the Duel's egg at a free place and fed by its owner's gifts. They move as Feed's snake does, cell by cell: a head that enters a body dies; two heads
// for one cell, the bigger survives. A dead snake leaves food on its cells. The biggest alive
// wears the crown and wins when the clock runs out. Every number worth tuning sits in TUNING; the
// frame-by-frame rules are in round.ts, the brains in ai.ts, what viewers do in entry.ts.

import { SNAKE_COLOURS, type SnakeColour, type SnakeSkin } from '../../shared/feed-protocol.ts';
import { EMERGE_TIME, HATCH_TIME, TRAIL_TIME } from '../engine/rules.ts';
import { alertKill } from '../feed/alerts.ts';
import { FCELL, FCOLS, FROWS, FX0, FY0, MOUTH } from '../feed/grid.ts';
import { makeBody, type Body } from '../feed/path.ts';
import { game, repay } from '../feed/state.ts';

export const TOTAL = FCOLS * FROWS;

export const TUNING = {
  /** Snakes on the board at once (6 by default, the settings say): one per colour, so 8 at most. */
  places: 6,
  /** With few viewers, wild snakes make up the numbers to this many. */
  wildUpTo: 4,
  startLen: 8, // cells
  maxLen: 60,
  speed: 7, // cells per second for a small snake (Feed's snake runs at 9)
  /** Bigger is a little slower: a snake this long loses slowBy of its pace. */
  slowAt: 60,
  slowBy: 0.15,
  /** Likes' speed boosts (entry.ts BOOST): the most seconds banked, and their strength. */
  boostCap: 6,
  boostMax: 0.3, // +30 % speed
  /** Seconds a newborn cannot be hurt (it blinks). */
  safeTime: 3,
  roundTime: 120, // seconds
  /**
   * Plain berries for everyone, rare and few, so gifts are what makes a snake big: a drip every
   * houseEvery seconds (give or take a fifth) of 1 to houseAmount berries, while fewer than
   * houseMax lie out.
   */
  houseEvery: 25,
  houseAmount: 1,
  houseMax: 4,
  foodMax: 160,
  /** Where a gift's berries land: this close to the giver's head, in cells. */
  dropRadius: 3,
  /** Coin value of the one gift that buys a seat (entry.ts isSeatGift); 0: any gift buys one. */
  seatPrice: 0,
  /** The extra-life gift: on or off, its price in coins, most lives held, length kept on a life. */
  lifeOn: false,
  lifePrice: 30,
  maxLives: 3,
  lifeKeep: 0.5,
  /** A gift of at least this many berries gives a shield for shieldSeconds (0: never). */
  shieldGift: 30,
  shieldSeconds: 10,
  shieldCap: 20,
  /**
   * Chasing, rare: only a snake this many times bigger than a neighbour within huntRange (or one
   * just boosted by its owner's likes) chases, one chase on the board at a time, for chaseMax
   * seconds at most, then chaseRest seconds of calm. Otherwise snakes keep keepAway cells from
   * each other's heads.
   */
  bigger: 1.5,
  huntRange: 6,
  chaseMax: 6,
  chaseRest: 15,
  keepAway: 3,
  /** Seconds between two snakes entering, and before a wild one fills an empty place. */
  enterGap: 0.9,
  wildGap: 1.5,
  /** Seconds the winner's moment lasts before the end screen. */
  winHold: 4,
  /**
   * The viewer's photo over the head, in game units: about 35 px across on a phone, where the
   * stream is 390 px wide. The crown holder's is bigger still (board-paint.ts).
   */
  photoR: 48,
};

/** Switches from the control room. */
export const options = {
  /** A gift's berries can only be eaten by the giver's snake. */
  ownerOnly: false,
  /** Likes speed up a snake that is in. */
  likeBoost: true,
};

export type Mode = 'eat' | 'chase' | 'defend';
/**
 * How a snake died: a head-on, cut off, into another snake's old body, or closed in by the others.
 * Never by its own body: `trapped` stays at 0, kept so a report can show it.
 */
export type Cause = 'headon' | 'cutoff' | 'accident' | 'trapped' | 'boxed';

export interface Snake {
  id: number;
  nickname: string;
  avatar?: string | undefined;
  wild: boolean;
  colour: SnakeColour;
  skin: SnakeSkin;
  /** The body as path.ts keeps it; `cells` is its cell list, head first (empty in the egg). */
  body: Body;
  /** The egg it hatches from: where, seconds since it was laid, and whether the snake is out. */
  egg: { cell: number; t: number; hatched: boolean } | null;
  cells: number[];
  /** The cell the head slides into, how far along it is, growth still owed and its eased rate (state.ts). */
  next: number;
  sub: number;
  grow: number;
  growRate: number;
  /** The head between cells, in cells, and its heading: for painters and distances. */
  x: number;
  y: number;
  a: number;
  len: number;
  speed: number;
  /** Seconds left of the likes boost, the shield and the newborn's grace. */
  boost: number;
  shield: number;
  safe: number;
  /** The brain: its mode, time in it, who it chases or flees and for how long, who it rests from. */
  mode: Mode;
  modeT: number;
  target: number;
  chaseT: number;
  cool: Map<number, number>;
  alive: boolean;
  /** Out of its egg and playing. */
  in: boolean;
  born: number;
  gulps: number[];
  bite: number;
  eaten: number;
  kills: number;
  idle: number;
  /** Its survival tier as a backing level for the brains (ai.ts backingOfTier): 0 to 3. */
  backing: number;
  /** Its viewer filled a likes ring lately (round.ts ACTIVE): a liking like seat is not prey. */
  active?: boolean;
  /** Extra lives from the life gift, and the length it grows to out of its egg. */
  lives: number;
  hatchLen: number;
  /** The food cell the strong brain is heading for, -1 when none. */
  goal: number;
  /** Hatched from a seat won in the qualifying: its egg shows the picture while it waits. */
  seat?: boolean;
  /** Its seat was paid for (a gift in the qualifying, or berries owed from the round before). */
  paid?: boolean;
}

export interface Food {
  cell: number;
  x: number;
  y: number;
  value: number;
  /** Seconds since it left the flower; lands at FALL_TIME. Body food is born landed. */
  t: number;
  /** The giver, '' for the flower's own berries and for a dead snake's body. */
  by: string;
  colour: SnakeColour | null;
  glow: boolean;
  fx: number;
  fy: number;
}

export interface Viewer {
  nickname: string;
  avatar?: string | undefined;
  state: 'none' | 'in' | 'out';
  snake: number;
  acts: number[];
  gifted: number;
  /** Berries (or lives) given during this round's battle: the survival tier's first step. */
  battle: number;
  wins: number;
  /** Shield seconds and lives bought before the snake was born, and the length a life keeps. */
  shield: number;
  lives: number;
  keep: number;
}

/**
 * A snake dying: for DEATH_TIME seconds its body pops from the tail to the head, leaving nothing
 * to eat, and its picture shrinks and drops to its animal on the beach. `lifeUsed` when a life
 * saved it.
 */
export interface Dying {
  s: Snake;
  t: number;
  /** Segments when it died: the pop runs through them all in DEATH_TIME. */
  segments: number;
  /** The picture where it was when the snake died, in game units. */
  from: { x: number; y: number };
  lifeUsed: boolean;
}
export const DEATH_TIME = 1;

/** A life brings the snake back: entry.ts flies its picture from where it died to the new egg. */
export const lifeHooks: { reborn: (s: Snake, from: { x: number; y: number }) => void } = {
  reborn: () => undefined,
};

export interface RoundRecord {
  winner: string | null;
  topGifter: string | null;
  kills: number;
  /** Berries eaten on the board this round. */
  eaten: number;
  deaths: Record<Cause, number>;
  /** Viewers' snakes that died, and the viewers who played, backed by gifts or by likes only. */
  fallen: { backed: number; likesOnly: number };
  played: { backed: number; likesOnly: number };
}

export const arena = {
  snakes: [] as Snake[],
  food: [] as Food[],
  foodAt: new Map<number, Food>(),
  viewers: new Map<string, Viewer>(),
  phase: 'ready' as 'qualify' | 'ready' | 'play' | 'end',
  time: 0,
  clock: 0,
  crown: -1,
  winner: null as Snake | null,
  /** The round's ranking at its end: the survivors, the biggest first, then the last to fall. */
  ranking: [] as { nickname: string; avatar?: string | undefined; eaten: number }[],
  /** Viewers' snakes that fell this round, in the order they fell. */
  outs: [] as { nickname: string; avatar?: string | undefined }[],
  /** Viewers' snakes that hatched at the start, and how long the fight has been down to one. */
  started: 0,
  lastT: 0,
  houseT: 0,
  dropT: 0,
  round: 0,
  fed: 0,
  kills: 0,
  deaths: { headon: 0, cutoff: 0, accident: 0, trapped: 0, boxed: 0 } as Record<Cause, number>,
  log: [] as RoundRecord[],
  dying: [] as Dying[],
  /** Paid berries fading off the board with their dead snake. */
  fading: [] as { f: Food; t: number }[],
  /** This round: viewers' snakes that died, and who played, backed by gifts or not. */
  fallen: { backed: 0, likesOnly: 0 },
  played: new Map<string, boolean>(),
  nextId: 1,
  rand: Math.random,
};

/** The flower's mouth, in cells: where berries fall from. */
export const MOUTH_CELL = { x: (MOUTH.x - FX0) / FCELL - 0.5, y: (MOUTH.y - FY0) / FCELL - 0.5 };

export const cellX = (c: number): number => ((c % FCOLS) + FCOLS) % FCOLS;
export const cellY = (c: number): number => Math.floor(c / FCOLS);
export const cellId = (x: number, y: number): number => y * FCOLS + x;
export const onBoard = (c: number): boolean => c >= 0 && c < TOTAL;

export const alive = (): Snake[] => arena.snakes.filter((s) => s.alive);
export const snakeOf = (nickname: string): Snake | undefined =>
  arena.snakes.find((s) => s.alive && !s.wild && s.nickname === nickname);
export const places = (): number => Math.min(TUNING.places, SNAKE_COLOURS.length);

export function viewer(nickname: string, avatar?: string): Viewer {
  let v = arena.viewers.get(nickname);
  if (!v) {
    v = {
      nickname,
      avatar,
      state: 'none',
      snake: -1,
      acts: [],
      gifted: 0,
      battle: 0,
      wins: 0,
      shield: 0,
      lives: 0,
      keep: 0,
    };
    arena.viewers.set(nickname, v);
  }
  if (avatar) v.avatar = avatar;
  return v;
}

/** A colour nobody alive wears, the viewer's own usual one when free. */
export function freeColour(nickname: string): SnakeColour | undefined {
  let h = 0;
  for (const ch of nickname) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 1000003;
  const used = new Set(arena.snakes.filter((s) => s.alive).map((s) => s.colour));
  for (let k = 0; k < SNAKE_COLOURS.length; k++) {
    const c = SNAKE_COLOURS[(h + k) % SNAKE_COLOURS.length];
    if (c && !used.has(c)) return c;
  }
  return undefined;
}

/** Cells under any living snake, and the cell each is sliding into. */
export function occupancy(): { occ: Int16Array; reserved: Int16Array } {
  const occ = new Int16Array(TOTAL),
    reserved = new Int16Array(TOTAL);
  for (const s of arena.snakes) {
    if (!s.alive) continue;
    for (const c of s.cells) if (onBoard(c)) occ[c] = s.id + 1;
    // An egg is solid until it hatches: nothing goes through it.
    if (s.egg && !s.egg.hatched) occ[s.egg.cell] = s.id + 1;
    else if (onBoard(s.next)) reserved[s.next] = s.id + 1;
  }
  return { occ, reserved };
}

/** Seconds from an egg being laid to the snake coming out (the Duel's timing). */
export const EMERGE = HATCH_TIME * EMERGE_TIME;
/** Seconds the shell's pieces keep falling after the egg is laid. */
export const SHELL_GONE = HATCH_TIME + TRAIL_TIME;

/** Steps from the nearest of `from` to every cell, walking the grid freely (Manhattan). */
function distanceFrom(from: readonly number[]): Int32Array {
  const out = new Int32Array(TOTAL).fill(TOTAL),
    queue: number[] = [];
  for (const c of from)
    if (onBoard(c) && out[c] !== 0) {
      out[c] = 0;
      queue.push(c);
    }
  // The queue grows while it is read: a breadth-first walk.
  for (const c of queue) {
    const x = cellX(c),
      y = cellY(c),
      d = (out[c] ?? 0) + 1;
    for (const k of [
      x > 0 ? c - 1 : -1,
      x < FCOLS - 1 ? c + 1 : -1,
      y > 0 ? c - FCOLS : -1,
      y < FROWS - 1 ? c + FCOLS : -1,
    ])
      if (k >= 0 && (out[k] ?? 0) > d) {
        out[k] = d;
        queue.push(k);
      }
  }
  return out;
}

/** Free cells reachable from `c`, counted up to `limit`: room for a newborn to grow. */
function roomAt(c: number, occ: Int16Array, limit: number): number {
  const seen = new Set([c]),
    queue = [c];
  for (let i = 0; i < queue.length && seen.size < limit; i++) {
    const at = queue[i] ?? 0,
      x = cellX(at),
      y = cellY(at);
    for (const k of [
      x > 0 ? at - 1 : -1,
      x < FCOLS - 1 ? at + 1 : -1,
      y > 0 ? at - FCOLS : -1,
      y < FROWS - 1 ? at + FCOLS : -1,
    ])
      if (k >= 0 && !occ[k] && !seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
  }
  return seen.size;
}

/**
 * Where to lay an egg: a free cell at random with room to grow, a safe distance from every body
 * and egg, and out of reach of every head before it hatches, so no snake runs into it or over
 * it. When the board is too full for that, the rules ease off a step at a time. -1 when no cell
 * is free at all.
 */
export function eggCell(): number {
  const { occ, reserved } = occupancy(),
    bodies: number[] = [],
    heads: number[] = [];
  for (const s of arena.snakes) {
    if (!s.alive) continue;
    bodies.push(...s.cells);
    if (s.egg && !s.egg.hatched) bodies.push(s.egg.cell);
    const h = s.cells[0];
    if (h !== undefined) heads.push(h);
  }
  const nearBody = distanceFrom(bodies),
    nearHead = distanceFrom(heads),
    reach = Math.ceil(TUNING.speed * (1 + TUNING.boostMax) * (EMERGE + 0.25)) + 1,
    need = TUNING.startLen + 4;
  const steps: readonly [number, number][] = [
    [3, reach],
    [3, TUNING.keepAway + 1],
    [2, 2],
    [1, 1],
  ];
  for (const [body, head] of steps) {
    const ok: number[] = [];
    for (let c = 0; c < TOTAL; c++)
      if (
        !occ[c] &&
        !reserved[c] &&
        !arena.foodAt.has(c) &&
        (nearBody[c] ?? 0) >= body &&
        (nearHead[c] ?? 0) > head &&
        roomAt(c, occ, need) >= need
      )
        ok.push(c);
    if (ok.length) return ok[Math.floor(arena.rand() * ok.length)] ?? -1;
  }
  return -1;
}

/**
 * A snake is laid as the Duel's egg at a free place (eggCell) and hatches from it (round.ts). Null
 * when no colour or no cell is free.
 */
export function spawn(v: Viewer | null, colourWas?: SnakeColour, at?: number): Snake | null {
  const free = colourWas && !arena.snakes.some((o) => o.alive && o.colour === colourWas),
    colour = free ? colourWas : freeColour(v?.nickname ?? 'wild'),
    // A seat's egg (qualify.ts) is laid where it stood, when that cell is still free.
    seatFree = at !== undefined && onBoard(at) && !occupancy().occ[at],
    cell = !colour ? -1 : at !== undefined && seatFree ? at : eggCell();
  if (!colour || cell < 0) return null;
  const id = arena.nextId++,
    body = makeBody([], 0, 0);
  const s: Snake = {
    id,
    nickname: v?.nickname ?? 'WILD',
    avatar: v?.avatar,
    wild: !v,
    colour,
    skin: v ? ((id + v.nickname.length) % 3 === 0 ? 'dark-back' : 'classic') : 'dark-back',
    body,
    egg: { cell, t: 0, hatched: false },
    cells: body.cells,
    next: cell,
    sub: 0,
    grow: 0,
    growRate: 0,
    x: cellX(cell),
    y: cellY(cell),
    a: -Math.PI / 2,
    len: 1,
    speed: TUNING.speed,
    boost: 0,
    shield: v?.shield ?? 0,
    safe: TUNING.safeTime,
    mode: 'eat',
    modeT: 0,
    target: -1,
    chaseT: 0,
    cool: new Map(),
    alive: true,
    in: false,
    born: 0,
    gulps: [],
    bite: 9,
    eaten: 0,
    kills: 0,
    idle: 0,
    backing: 0,
    lives: v?.lives ?? 0,
    goal: -1,
    hatchLen: v && v.keep > 0 ? v.keep : TUNING.startLen,
  };
  if (v) {
    v.state = 'in';
    v.snake = id;
    v.shield = 0;
    v.lives = 0;
    v.keep = 0;
  }
  arena.snakes.push(s);
  return s;
}

/** Puts food on a cell, if it is free of food. */
export function placeFood(f: Food): boolean {
  if (arena.foodAt.has(f.cell) || arena.food.length >= TUNING.foodMax) return false;
  arena.food.push(f);
  arena.foodAt.set(f.cell, f);
  return true;
}

export function removeFood(f: Food): void {
  arena.foodAt.delete(f.cell);
  const i = arena.food.indexOf(f);
  if (i >= 0) arena.food.splice(i, 1);
}

/** A free cell for food: no body, no food. */
export function freeCell(occ: Int16Array, tries = 60): number {
  for (let k = 0; k < tries; k++) {
    const c = Math.floor(arena.rand() * TOTAL);
    if (!occ[c] && !arena.foodAt.has(c)) return c;
  }
  return -1;
}

/** The picture over the head, where board-paint.ts draws it. */
const photoAt = (s: Snake): { x: number; y: number } => {
  const head = toPx(s.x, s.y);
  return { x: head.x, y: Math.max(TUNING.photoR + 70, head.y - 84) };
};

/**
 * The body's last second: it pops from the tail (round.ts) and leaves nothing to eat. The snake's
 * own paid berries still on the board or falling fade away with it and go back to the flower in
 * the giver's name, not ranked twice: they pour again for their next snake.
 */
function dieSlowly(s: Snake, lifeUsed: boolean): void {
  arena.dying.push({ s, t: 0, segments: s.cells.length, from: photoAt(s), lifeUsed });
  handBack(s);
}

/** The snake's own paid berries on the board or falling fade off it, back into the flower. */
function handBack(s: Snake): void {
  if (s.wild) return;
  let mine = 0;
  for (const f of [...arena.food])
    if (f.by === s.nickname) {
      removeFood(f);
      arena.fading.push({ f, t: 0 });
      mine += f.value;
    }
  if (mine > 0) repay([{ nickname: s.nickname, n: mine }], false);
}

/** Berries a viewer paid for that still wait in the flower. */
export const waitingFor = (nickname: string): number =>
  game.queue.reduce((n, q) => n + (q.nickname === nickname ? q.n : 0), 0);

/**
 * The snake is gone: its body pops, its viewer is out of the round (the place stays empty until
 * the next qualifying), the kill on Feed's alert card under the board.
 */
export function kill(s: Snake, by: Snake | null, cause: Cause): void {
  if (!s.alive) return;
  if (s.lives > 0 && !s.wild) {
    useLife(s, by);
    return;
  }
  s.alive = false;
  arena.deaths[cause]++;
  dieSlowly(s, false);
  const v = s.wild ? undefined : arena.viewers.get(s.nickname);
  if (v) {
    if (v.gifted > 0) arena.fallen.backed++;
    else arena.fallen.likesOnly++;
    v.state = 'out';
    v.snake = -1;
    arena.outs.push({ nickname: s.nickname, avatar: s.avatar });
  }
  if (by) {
    by.kills++;
    arena.kills++;
  }
  // Only in the battle: nothing of it shows over the end screen.
  if (!s.wild && arena.phase === 'play') alertKill(s, by && !by.wild ? by : null);
  if (arena.crown === s.id) arena.crown = -1;
}

/**
 * A life saves the snake: its body still pops and leaves its berries, a heart breaks, and the same
 * viewer comes back from a new egg in the same colour, with its photo, a share of its length and
 * one life less. With no cell for the egg right now, the life is spent and the snake falls.
 */
function useLife(s: Snake, by: Snake | null): void {
  s.alive = false;
  dieSlowly(s, true);
  if (by) {
    by.kills++;
    arena.kills++;
  }
  if (arena.crown === s.id) arena.crown = -1;
  const v = viewer(s.nickname, s.avatar);
  v.lives = s.lives - 1;
  v.keep = Math.max(1, Math.round(s.len * TUNING.lifeKeep));
  v.shield = 0;
  v.state = 'out';
  const next = spawn(v, s.colour);
  if (next) lifeHooks.reborn(next, photoAt(s));
  else arena.outs.push({ nickname: s.nickname, avatar: s.avatar });
}

/** The extra-life gift: one more life per gift, up to the most a snake holds. */
export function addLives(v: Viewer, n: number): void {
  const s = snakeOf(v.nickname);
  if (s) s.lives = Math.min(TUNING.maxLives, s.lives + n);
  else v.lives = Math.min(TUNING.maxLives, v.lives + n);
}

/**
 * A snake taken off the board on purpose by a control room switch (the pilot switched off),
 * never to make room. Its paid berries go back to the flower as at a death.
 */
export function leave(s: Snake): void {
  if (!s.alive) return;
  s.alive = false;
  handBack(s);
  const v = s.wild ? undefined : arena.viewers.get(s.nickname);
  if (v) {
    v.state = 'out';
    v.snake = -1;
  }
  if (arena.crown === s.id) arena.crown = -1;
}

export const edibleBy = (f: Food, s: Snake): boolean =>
  !options.ownerOnly || f.by === '' || f.by === s.nickname;

export const toPx = (x: number, y: number): { x: number; y: number } => ({
  x: FX0 + (x + 0.5) * FCELL,
  y: FY0 + (y + 0.5) * FCELL,
});

/** Keeps the prod effect lists ticking (sparks, "+1" pops), as state.advance would. */
export function tickEffects(dt: number): void {
  for (const p of game.pops) p.t += dt;
  game.pops = game.pops.filter((p) => p.t < 0.9);
  for (const sp of game.sparks) {
    sp.t += dt;
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vx *= 1 - 4 * dt;
    sp.vy *= 1 - 4 * dt;
  }
  game.sparks = game.sparks.filter((sp) => sp.t < sp.life);
}
