// Feed the Snake: the rules. One snake walks a fixed loop that covers the whole board, so it can
// never bite itself. Every coin gifted drops one berry on a free cell; every berry eaten makes the
// snake one cell longer. The room wins the round when the snake fills the board.

import { tr, type I18nKey } from '../engine/i18n.ts';
import { FCOLS, FROWS } from './grid.ts';
import { buildLoop, type Cell } from './loop-path.ts';
import { ahead, cellOf, makeBody, nextCell, stepInto } from './path.ts';

export const TOTAL = FCOLS * FROWS;
/**
 * A round opens short and slow; after a beat the forest drops its own line of berries and the
 * snake eats through them up to WARM_LEN before the viewers take over. One speed, always.
 */
export const START_LEN = 3;
export const WARM_LEN = Math.round(TOTAL * 0.4);
export const READY_TIME = 3.6; // GET READY 3, 2, 1, GO! before the snake moves
export const SPEED = 9;
/** Share of the head's pace the tail gives up while the snake grows: it never stops. */
const GROW_SHARE = 0.5; // cells per second, the normal pace
const HOUSE_AHEAD = 15; // start-up berries on the board at once
// The start-up berries count for more than they show: 12 of them take the snake to WARM_LEN in
// about ten seconds, each still showing "+1": the tail holds still while the head sprints ahead.
const HOUSE_BERRIES = 12;
export const PATTERNS = [7, 19, 42, 77, 123]; // seeds of the five hand-picked loops
const HOUSE_GAP = 30; // loop cells between two start-up berries
const START_SPRINT = 5.2; // pace multiplier while the snake eats the start-up berries
const DROP_EVERY = 0.045; // seconds between two berries leaving the dispenser
export const FALL_TIME = 0.5;
export const FULL_HOLD = 8; // seconds of celebration before the next round
/** Only a guard against a garbled event: a real gift always drops all its berries. */
const MAX_PER_GIFT = 100000;
const GULP_SPEED = 26; // cells per second, the swallow travels faster than the snake

// Daily titles, like the original's "REEF GUARDIAN · 300+ TODAY", in the forest's words.
const TITLES = [1000, 300, 100, 30, 1] as const;

export interface Berry {
  /** Cell id. */
  at: number;
  /** Its bite sound already played (ahead of time, to land on the frame it is eaten). */
  heard?: boolean;
  /** Seconds since it was dropped; it lands at FALL_TIME. */
  t: number;
  by: string;
}

export interface Fan {
  nickname: string;
  avatar: string | undefined;
  coins: number;
}

export interface Liker {
  nickname: string;
  avatar: string | undefined;
  likes: number;
}

/** A gift being poured: the flower shows it until its last berry has dripped. */
export interface Pour {
  id: number;
  nickname: string;
  n: number;
  total: number;
  title: string;
  /** Berries owed from the round before: the flower says so. */
  carried?: boolean;
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  gold: boolean;
}

export interface Pop {
  x: number;
  y: number;
  t: number;
  by: string;
}

/** What the sound layer listens to. */
export const hooks: {
  eat: (combo: number) => void;
  /** Seconds the sound output lags behind the screen. */
  lead: () => number;
  land: (delay: number) => void;
  gift: (n: number) => void;
  full: () => void;
  /** A new round starts (the control room rolls the ambience here). */
  round: () => void;
} = {
  eat: () => undefined,
  lead: () => 0,
  land: () => undefined,
  gift: () => undefined,
  full: () => undefined,
  round: () => undefined,
};

/** Random source for the drops: the caller's, so a seeded test replays exactly. */
let rng: () => number = Math.random;

/** Coins per viewer since the page opened: the daily title survives the rounds. */
const today = new Map<string, number>();

export const game = {
  loop: [] as Cell[],
  /** Head cell id, the body (cells, loop order) and the cell the head is sliding into. */
  head: 0,
  body: makeBody([], 0, 0),
  next: 0,
  len: START_LEN,
  grow: 0,
  /** Cells per second the body is growing by, eased so the tail never jerks. */
  growRate: 0,
  sub: 0,
  berries: new Map<number, Berry>(),
  /** Gifts still to drop, in order, each with its berries left. */
  queue: [] as Pour[],
  dropTimer: 0,
  fans: new Map<string, Fan>(),
  likes: new Map<string, Liker>(),
  /** The gift the flower shows, and seconds since it started or since the flower emptied. */
  pour: null as Pour | null,
  pourT: 0,
  closeT: 9,
  pours: 0,
  speed: 9,
  /** Start-up berries still to lay. */
  house: 0,
  /** Loop position of the next start-up berry. */
  houseAt: 0,
  /** Start-up bonus growth still owed: the snake sprints until it is paid. */
  stretch: 0,
  /** Seconds since a berry last left the flower. */
  dripT: 9,
  pops: [] as Pop[],
  sparks: [] as Spark[],
  /** Swallow bulges, as a distance from the head in cells. */
  gulps: [] as number[],
  /** Seconds since the last bite, for the head squash and the rising notes. */
  bite: 9,
  combo: 0,
  /** Seconds into GET READY, or -1 once the snake is off. */
  ready: -1,
  /** Seconds since the board filled, or -1 while playing. */
  full: -1,
  round: 0,
  eaten: 0,
};

export const cellAt = (i: number): Cell => cellOf(i);

/** Cells under the body: the length is continuous while it grows. */
export const cells = (): number => Math.ceil(game.len - 1e-6);

export const isFree = (i: number): boolean => !game.body.occ[i];

/** Growth to reserve room for: what is owed, plus what the start-up berries still to eat will give. */
function owed(): number {
  let own = game.house;
  for (const b of game.berries.values()) if (b.by === '') own++;
  return (
    game.grow +
    game.berries.size +
    waiting() +
    own * (Math.ceil((WARM_LEN - START_LEN) / HOUSE_BERRIES) - 1)
  );
}

function placeBody(headPos: number, len: number): void {
  game.body = makeBody(game.loop, headPos, len);
  game.head = game.body.cells[0] ?? 0;
  game.next = nextCell(game.body, game.berries.keys(), owed(), true);
}

export const waiting = (): number => game.queue.reduce((s, q) => s + q.n, 0);

export const fanOf = (nickname: string): Fan | undefined => game.fans.get(nickname);

/** The round's leaderboard, best first. */
export const leaders = (n = 5): Fan[] =>
  [...game.fans.values()].sort((a, b) => b.coins - a.coins).slice(0, n);

export function titleFor(coins: number): string {
  const min = TITLES.find((m) => coins >= m);
  return min ? tr('feed.today', { q: tr(`feed.title.${String(min)}` as I18nKey), n: min }) : '';
}

/** Gifts sent while the end screen shows: they open the next round. */
const late: { nickname: string; avatar: string | undefined; n: number }[] = [];

/** Share of the board a round starts at: 0 is the normal start, a short snake and its sprint. */
let startFill = 0;

/** Sets how long the snake is when the next rounds start (control room, "Start length"). */
export function setStartFill(fill: number): void {
  startFill = Math.max(0, Math.min(0.97, fill));
}

export function newRound(rand: () => number = Math.random): void {
  // Nobody's berries are lost: what lay uneaten on the board, what the flower still owed, and
  // what came in during the end screen, pour again in the new round.
  const onBoard = new Map<string, number>();
  for (const b of game.berries.values())
    if (b.by !== '') onBoard.set(b.by, (onBoard.get(b.by) ?? 0) + 1);
  const carry = [
    ...[...onBoard].map(([nickname, n]) => ({ nickname, avatar: fanOf(nickname)?.avatar, n })),
    ...game.queue
      .filter((q) => q.nickname !== '' && q.n > 0)
      .map((q) => ({ nickname: q.nickname, avatar: fanOf(q.nickname)?.avatar, n: q.n })),
    ...late.splice(0),
  ];
  // Five fixed patterns, one per round in turn: each round has its own recognisable route.
  let seed = PATTERNS[game.round % PATTERNS.length] ?? 1;
  game.loop = buildLoop(
    FCOLS,
    FROWS,
    () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646,
  );
  game.berries.clear();
  game.grow = 0;
  // A long start skips the start-up sprint: the snake is already as long as asked.
  const startLen = startFill > 0 ? Math.max(START_LEN, Math.round(TOTAL * startFill)) : START_LEN;
  placeBody(Math.floor(rand() * TOTAL), startLen);
  game.len = startLen;
  game.ready = 0;
  game.house = 0;
  game.stretch = 0;
  game.speed = SPEED;
  game.grow = 0;
  game.growRate = 0;
  game.sub = 0;
  game.berries.clear();
  game.queue = [];
  game.fans.clear();
  game.likes.clear();
  game.pour = null;
  game.closeT = 9;
  game.gulps = [];
  game.full = -1;
  game.round++;
  game.eaten = 0;
  game.combo = 0;
  for (const c of carry) pourIn(c.nickname, c.avatar, c.n, true);
  hooks.round();
}

/** Likes only rank: the end screen crowns the round's like champion. */
export function like(nickname: string, avatar: string | undefined, n: number): void {
  const l = game.likes.get(nickname) ?? { nickname, avatar, likes: 0 };
  l.likes += n;
  if (avatar) l.avatar = avatar;
  game.likes.set(nickname, l);
}

export const likers = (n = 4): Liker[] =>
  [...game.likes.values()].sort((a, b) => b.likes - a.likes).slice(0, n);

/** A gift: its coins become berries, its giver climbs the leaderboard. */
export function gift(nickname: string, avatar: string | undefined, coins: number): void {
  const n = Math.max(1, Math.min(MAX_PER_GIFT, Math.round(coins)));
  today.set(nickname, (today.get(nickname) ?? 0) + n);
  if (game.full >= 0) {
    late.push({ nickname, avatar, n });
    hooks.gift(n);
    return;
  }
  pourIn(nickname, avatar, n);
  hooks.gift(n);
}

/** Berries paid for and not eaten yet, per viewer: in the flower, waiting, or on the board. */
export function unpaid(): { nickname: string; n: number }[] {
  const owedTo = new Map<string, number>();
  const add = (nickname: string, n: number): void => {
    if (nickname && n > 0) owedTo.set(nickname, (owedTo.get(nickname) ?? 0) + n);
  };
  for (const q of game.queue) add(q.nickname, q.n);
  for (const l of late) add(l.nickname, l.n);
  for (const b of game.berries.values()) add(b.by, 1);
  return [...owedTo].map(([nickname, n]) => ({ nickname, n }));
}

/** Pours again what a previous session still owed (the app was closed or crashed mid-live). */
export function repay(owed: readonly { nickname: string; n: number }[]): void {
  for (const { nickname, n } of owed) if (n > 0) pourIn(nickname, undefined, n, true);
}

/** Puts a viewer's berries in the flower and ranks them on the round's leaderboard. */
function pourIn(nickname: string, avatar: string | undefined, n: number, carried = false): void {
  const fan = game.fans.get(nickname) ?? { nickname, avatar, coins: 0 };
  fan.coins += n;
  if (avatar) fan.avatar = avatar;
  game.fans.set(nickname, fan);
  const day = today.get(nickname) ?? n;
  const lastQ = game.queue[game.queue.length - 1];
  if (lastQ?.nickname === nickname) {
    // Same viewer again: their pour grows, the flower's count with it.
    lastQ.n += n;
    lastQ.total += n;
    lastQ.title = titleFor(day);
  } else
    game.queue.push({ id: ++game.pours, nickname, n, total: n, title: titleFor(day), carried });
}

function dropOne(by: string): boolean {
  // Anywhere in the free zone, spread at random like the original's apples, never under the body
  // and never within the head's reach before the berry lands.
  const near = Math.ceil(game.speed * (FALL_TIME + 0.2)) + 2,
    free = TOTAL - cells() - game.berries.size;
  if (free <= 0) return false;
  const tight = free <= 40;
  for (let tries = 0; tries < (tight ? 400 : 80); tries++) {
    const at = Math.floor(rng() * TOTAL),
      reach = ahead(game.body, game.head, at);
    if (!game.berries.has(at) && isFree(at) && reach >= (tight ? 2 : near)) {
      game.berries.set(at, { at, t: 0, by });
      hooks.land(FALL_TIME);
      if (by) game.dripT = 0;
      return true;
    }
  }
  return false;
}

/** Keeps a handful of start-up berries ahead of the head until they are all laid. */
/** The start-up sprint is on while its berries or their bonus are still to come. */
function startingUp(): boolean {
  if (game.house > 0 || game.stretch > 0) return true;
  for (const b of game.berries.values()) if (b.by === '') return true;
  return false;
}

/**
 * Start-up berries go on the loop itself, evenly spaced ahead of the head: the snake glides along
 * its corridors (no shortcuts during the sprint) and eats one at a steady beat.
 */
function houseTopUp(): void {
  let own = 0;
  for (const b of game.berries.values()) if (b.by === '') own++;
  while (game.house > 0 && own < HOUSE_AHEAD) {
    const pos = ((game.houseAt % TOTAL) + TOTAL) % TOTAL,
      at = game.body.at[pos] ?? 0;
    game.houseAt += HOUSE_GAP;
    if (!isFree(at) || game.berries.has(at)) continue;
    game.berries.set(at, { at, t: 0, by: '' });
    hooks.land(FALL_TIME);
    game.house--;
    own++;
  }
}

function eat(at: number, by: string, rand: () => number, heard = false): void {
  game.grow++;
  game.eaten++;
  if (!heard) game.combo = game.bite < 0.6 ? game.combo + 1 : 0;
  game.bite = 0;
  game.gulps.push(0);
  const c = cellAt(at);
  // "+1" where a berry is eaten, start-up ones included (they secretly give more, see HOUSE_BERRIES).
  game.pops.push({ x: c.x, y: c.y, t: 0, by });
  if (!by) {
    const bonus = Math.ceil((WARM_LEN - START_LEN) / HOUSE_BERRIES) - 1;
    game.grow += bonus;
    game.stretch += bonus;
  }
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2,
      v = 2.5 + rand() * 4;
    game.sparks.push({
      x: c.x,
      y: c.y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      t: 0,
      life: 0.35 + rand() * 0.35,
      gold: i % 3 === 0,
    });
  }
  if (!heard) hooks.eat(game.combo);
}

/** Advances the rules by dt seconds. Returns true on the frame the board fills. */
export function advance(dt: number, rand: () => number = Math.random): boolean {
  rng = rand;
  for (const b of game.berries.values()) b.t += dt;
  // The flower follows the queue: open on the gift being poured, closing once it is empty.
  const pouring = game.queue.find((q) => q.nickname !== '');
  if (pouring && pouring.id !== game.pour?.id) {
    game.pour = pouring;
    game.pourT = 0;
  }
  game.pourT += dt;
  game.dripT += dt;
  game.closeT = game.queue.some((q) => q.nickname !== '') ? 0 : game.closeT + dt;
  for (const p of game.pops) p.t += dt;
  game.pops = game.pops.filter((p) => p.t < 0.9);
  for (const s of game.sparks) {
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 1 - 4 * dt;
    s.vy *= 1 - 4 * dt;
  }
  game.sparks = game.sparks.filter((s) => s.t < s.life);
  game.gulps = game.gulps.map((g) => g + GULP_SPEED * dt).filter((g) => g < game.len);
  game.bite += dt;
  if (game.full >= 0) {
    game.full += dt;
    if (game.full > FULL_HOLD) newRound(rand);
    return false;
  }
  // GET READY: the forest lays its own line of berries (no giver, no card) up to WARM_LEN while
  // the countdown runs; at GO! the snake sets off through them at its one and only speed.
  if (game.ready >= 0) {
    // Nothing falls during the countdown: the berries start at GO!
    if (game.ready === 0 && game.len < WARM_LEN) {
      game.house = HOUSE_BERRIES;
      game.houseAt = (game.body.ord[game.head] ?? 0) + HOUSE_GAP;
    }
    game.ready += dt;
    if (game.ready < READY_TIME) return false;
    game.ready = -1;
  }
  // The forest's start-up berries, a handful at a time; the viewers' berries fall alongside.
  houseTopUp();
  // Berries drip out of the flower one by one: about 3 a second, faster for a big gift.
  const first = game.queue[0],
    every = first ? 1 / Math.min(10, 3 + first.n / 12) : DROP_EVERY;
  game.dropTimer += dt;
  while (game.queue.length && game.dropTimer >= every) {
    const q = game.queue[0];
    if (!q) break;
    game.dropTimer -= every;
    if (!dropOne(q.nickname)) break;
    if (--q.n <= 0) game.queue.shift();
  }
  if (game.dropTimer > every) game.dropTimer = every;
  // One speed, always: berries only feed. Each berry eaten adds one cell, which appears at the
  // tail: the tail keeps crawling, only a little slower than the head, and never stops.
  // Start-up sprint: while the forest's own berries are still being eaten the snake runs fast,
  // then it eases back to its normal pace for the rest of the round. Viewers' berries never
  // change the speed.
  let houseLeft = game.house > 0 || game.stretch > 0;
  if (!houseLeft) for (const b of game.berries.values()) if (b.by === '') houseLeft = true;
  const target = houseLeft ? SPEED * START_SPRINT : SPEED;
  // Quick to launch the sprint, slow and soft to settle back to the normal pace.
  game.speed += (target - game.speed) * Math.min(1, dt * (target > game.speed ? 3 : 0.8));
  // Safety valve: growth waits while the head is close behind the tail (the tail keeps moving
  // and frees room), so the snake can never run into itself however fast berries come.
  const tail = game.body.cells[game.body.cells.length - 1] ?? game.head,
    step = dt * game.speed,
    room = ahead(game.body, game.head, tail) - 1,
    // During the start-up sprint the tail keeps its normal pace and the body stretches between a
    // fast head and a steady tail. Afterwards the tail slows softly to no less than
    // 1 - GROW_SHARE of the head's pace while berries are owed, then eases back.
    sprint = startingUp();
  const want = !sprint && game.grow > 0 ? GROW_SHARE * game.speed : 0;
  game.growRate += (want - game.growRate) * Math.min(1, dt * 6);
  const stretchable = sprint
      ? Math.max(0, step - dt * SPEED)
      : Math.min(step * GROW_SHARE, game.growRate * dt),
    // Never more than the free cells between head and tail: the snake cannot run into itself.
    g = Math.max(0, Math.min(game.grow, stretchable, room > 4 ? Infinity : room));
  game.len = Math.min(TOTAL, game.len + g);
  game.grow -= g;
  game.stretch = Math.max(0, game.stretch - g);
  game.sub += step;
  // The bite is heard exactly when it is seen: play it the output lag ahead of the head's arrival.
  const coming = game.berries.get(game.next);
  if (coming && !coming.heard && (1 - game.sub) / Math.max(1, game.speed) <= hooks.lead()) {
    coming.heard = true;
    game.combo = game.bite < 0.6 ? game.combo + 1 : 0;
    hooks.eat(game.combo);
  }
  while (game.sub >= 1) {
    game.sub -= 1;
    stepInto(game.body, game.next, Math.max(1, cells()));
    game.head = game.next;
    const b = game.berries.get(game.head);
    if (b) {
      game.berries.delete(game.head);
      eat(game.head, b.by, rand, b.heard === true);
    }
    game.next = nextCell(game.body, game.berries.keys(), owed(), true);
  }
  // Full when only the cell under the head's nose is left: nothing can land there anyway.
  if (cells() >= TOTAL - 1) {
    game.len = TOTAL;
    game.grow = 0;
    game.sub = 0;
    game.full = 0;
    // Berries still in the flower are not lost: newRound pours them again.
    game.berries.clear();
    hooks.full();
    return true;
  }
  return false;
}

/** Test shortcut: grows the snake to a few cells from full, clearing berries it now covers. */
export function nearFull(left = 12): void {
  if (game.full >= 0) return;
  game.len = Math.max(game.len, TOTAL - left);
  placeBody(game.body.ord[game.head] ?? 0, cells());
  for (const at of [...game.berries.keys()]) if (!isFree(at)) game.berries.delete(at);
  game.next = nextCell(game.body, game.berries.keys(), owed(), true);
}
