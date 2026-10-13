// Snake Arena: what viewers do. A like shows where it counts: a prod heart pops on the liker's
// badge on the qualifying board, or over their animal on the beach. During the qualifying likes
// count in the race for the seats (qualify.ts). In the battle a player's likes fill the red ring round their animal's
// picture on the beach: every BOOST.likes of them fire a speed boost, the ring flashing, the
// animal running on the spot and the snake dashing. A gift during the qualifying locks a seat; in
// the battle its berries pour from the flower to the giver's snake, the giver's alone, and make it
// grow. Any gift outside the qualifying also puts its giver in the paid queue for the next rounds.
// Comments do nothing.
//
// The pilot player, "Skohlds", shows newcomers how it works: it likes a little during the
// qualifying like any viewer and plays when it gets a seat. It is the game's own: no ranking, no
// crown, no thanks, no alert, no journal row, no supporters list.

import { alertQueued } from '../feed/alerts.ts';
import { crabFaces, crabGone, crabRun } from '../feed/crabs.ts';
import { H, W } from '../engine/layout.ts';
import {
  TUNING,
  addLives,
  arena,
  leave,
  options,
  places,
  cellX,
  cellY,
  lifeHooks,
  snakeOf,
  toPx,
  viewer,
  type Snake,
  type Viewer,
} from './rules.ts';

/**
 * The pilot player's name on screen and the likes it sends per second in the qualifying. It plays
 * under a key no viewer can have, an "S" and an invisible space: its picture is the prod initials
 * circle, "S".
 */
export const PILOT = { name: 'Skohlds', key: 'S​', likes: 1 };
let pilotOn = false;

/**
 * The qualifying's own rules (qualify.ts), set there: likes count in its race, a gift locks a seat
 * (false when it cannot: the clock is out, or every seat is paid).
 */
export const qualHooks: {
  like: (nickname: string, n: number) => void;
  gift: (v: Viewer) => boolean;
} = { like: () => undefined, gift: () => false };

const qualifying = (): boolean => arena.phase === 'qualify';

/** A player's like in the battle, for the like strip (strip.ts), set there. */
export const likeHooks: { battle: (nickname: string, n: number) => void } = {
  battle: () => undefined,
};

/** A picture flying from where a snake died to the new egg a life gives it. */
export interface Flight {
  nickname: string;
  avatar?: string | undefined;
  x: number;
  y: number;
  /** The egg, in game units. */
  tx: number;
  ty: number;
  t: number;
}
export const flights: Flight[] = [];
/** Seconds of a picture's flight; the egg starts when it lands. */
export const FLIGHT = 0.84;

/**
 * The picture of a viewer's animal as drawn this frame, or where the beach would have it: on the
 * line the animals' pictures stand on, in the middle.
 */
export function faceOf(nickname: string): { x: number; y: number; r: number } {
  return crabFaces().get(nickname) ?? { x: W / 2, y: H - 100, r: 36 };
}

/** The picture flies from `from` to the snake's egg, which waits for it to land before it plays. */
function flyToEgg(s: Snake, from: { x: number; y: number }): void {
  if (!s.egg) return;
  const to = toPx(cellX(s.egg.cell), cellY(s.egg.cell));
  s.egg.t = -FLIGHT;
  flights.push({
    nickname: s.nickname,
    avatar: s.avatar,
    x: from.x,
    y: from.y,
    tx: to.x,
    ty: to.y,
    t: 0,
  });
}

// A life used: the picture flies from where the snake died to its new egg.
lifeHooks.reborn = flyToEgg;

// ---- likes ---------------------------------------------------------------------------------

/**
 * A like shows where it counts, never flying across the screen: in the qualifying a prod heart
 * pops on the liker's badge on the board (a liker's animal on the beach shows its own hearts, as
 * Feed's do), in the battle the player's animal on the beach shows them. One pop per like event,
 * a burst of likes is one bigger pop, at most POPS_MAX at once: past that a like still counts.
 */
export interface LikePop {
  nickname: string;
  n: number;
  t: number;
}
export const likePops: LikePop[] = [];
export const POP_TIME = 0.6;
const POPS_MAX = 24,
  /** Likes from one viewer this close together share one pop. */
  MERGE = 0.4;
/**
 * The battle's speed boosts: every `likes` likes of a player (control room, "Likes for a speed
 * boost") give `seconds` of speed, banked up to the "Likes boost, at most" cap, and grow the snake
 * by `cells`, as berries do: likes count in the race for size.
 */
export const BOOST = { likes: 100, seconds: 4, cells: 3 };
/** Likes toward each player's next boost: the red ring round their animal's picture. */
export const rings = new Map<string, number>();
/** When each player's last boost fired: its ring flashes. */
export const fired = new Map<string, number>();
/** When each picture last took a like: it bumps. */
export const bumps = new Map<string, number>();

/**
 * What a like does, at once: in the battle it fills the player's ring, and each full ring fires a
 * boost; what is left over starts the next ring.
 */
function land(nickname: string, n: number): void {
  bumps.set(nickname, arena.clock);
  const s = snakeOf(nickname);
  if (!s || qualifying() || !options.likeBoost) return;
  let ring = (rings.get(nickname) ?? 0) + n;
  while (ring >= BOOST.likes) {
    ring -= BOOST.likes;
    s.boost = Math.min(TUNING.boostCap, s.boost + BOOST.seconds);
    s.grow += BOOST.cells;
    s.gulps.push(0);
    fired.set(nickname, arena.clock);
    crabRun(nickname);
  }
  rings.set(nickname, ring);
}

/** A heart pops on the liker's picture on the qualifying board. */
function pop(nickname: string, n: number): void {
  const same = likePops.find((h) => h.nickname === nickname && h.t < MERGE);
  if (same) same.n += n;
  else if (likePops.length < POPS_MAX) likePops.push({ nickname, n, t: 0 });
}

/** Pictures on their way to a life's egg, and the likes' pops. */
export function updateFlights(dt: number): void {
  for (let i = likePops.length - 1; i >= 0; i--) {
    const h = likePops[i];
    if (!h) continue;
    h.t += dt;
    if (h.t >= POP_TIME) likePops.splice(i, 1);
  }
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    if (!f) continue;
    f.t += dt;
    if (f.t >= FLIGHT) flights.splice(i, 1);
  }
}

/**
 * Likes: in the qualifying they count in the race (their number rolls up on the board); in the
 * battle a player's likes fill their boost ring on the beach. Anyone else's likes in the battle
 * do nothing on the board.
 */
export function arenaLike(nickname: string, avatar: string | undefined, n: number): void {
  if (!nickname || n <= 0 || nickname === PILOT.key) return;
  const v = viewer(nickname, avatar);
  v.acts.push(arena.clock);
  if (qualifying()) {
    qualHooks.like(nickname, n);
    pop(nickname, n);
    land(nickname, n);
    return;
  }
  const s = snakeOf(nickname);
  if (!s) return;
  s.idle = 0;
  land(nickname, n);
  likeHooks.battle(nickname, n);
}

/**
 * The paid queue: whoever gives outside the qualifying (in the battle, the countdown or the end
 * screen, or once every seat of a qualifying is paid) takes the next place in it, one place per
 * viewer, first come first served, with no limit; more gifts do not move them. Each qualifying
 * opens with the first `places()` of it on gold eggs (round.ts), the rest wait for the rounds
 * after. Each giver is told once, on the alert card, when they join. It lasts the session and
 * survives a reload of the game window (link.ts); a viewer who left the live keeps their place.
 */
export interface Queued {
  readonly nickname: string;
  readonly avatar?: string | undefined;
}
export const paidQueue: Queued[] = [];
/** Called whenever the queue changes: link.ts saves it. */
export const paidHooks = { changed: (): void => undefined };

export function joinPaidQueue(nickname: string, avatar: string | undefined): void {
  if (nickname === PILOT.key || paidQueue.some((q) => q.nickname === nickname)) return;
  paidQueue.push({ nickname, avatar });
  const place = paidQueue.length;
  alertQueued({ nickname, avatar }, place, roundsToPlay(place));
  paidHooks.changed();
}

/** In how many rounds the paid queue's `place` plays: 1 the next round, each round taking `places()`. */
export const roundsToPlay = (place: number): number => Math.max(1, Math.ceil(place / places()));

/** This round's paid seats: the first `places()` of the queue, which leave it. */
export function takePaidBatch(): Queued[] {
  const batch = paidQueue.splice(0, places());
  if (batch.length) paidHooks.changed();
  return batch;
}

/**
 * What a gift buys besides its berries: in the qualifying a seat, while one can be locked; else a
 * place in the paid queue. In the battle (and its countdown) it also lifts the player's tier.
 */
function buySeat(v: Viewer, n: number): void {
  if (qualifying()) {
    if (qualHooks.gift(v)) return;
  } else if (arena.phase !== 'end') v.battle += n;
  joinPaidQueue(v.nickname, v.avatar);
}

/** A big gift's shield, on the snake or kept for the one about to be born. */
function shield(v: Viewer, s: Snake | undefined): void {
  if (s) s.shield = Math.min(TUNING.shieldCap, s.shield + TUNING.shieldSeconds);
  else v.shield = Math.min(TUNING.shieldCap, v.shield + TUNING.shieldSeconds);
}

/**
 * A gift, already priced in berries by the control room's list: in the qualifying it locks a seat
 * and its berries wait in the flower for the battle; in the battle the flower pours them to the
 * giver's snake (round.ts). Outside the qualifying the giver joins the paid queue. A big gift
 * gives a shield.
 */
export function arenaGift(nickname: string, avatar: string | undefined, berries: number): void {
  if (!nickname || berries <= 0 || nickname === PILOT.key) return;
  const v = viewer(nickname, avatar);
  v.acts.push(arena.clock);
  v.gifted += berries;
  buySeat(v, berries);
  const s = snakeOf(nickname);
  if (s) s.idle = 0;
  if (TUNING.shieldGift > 0 && berries >= TUNING.shieldGift) shield(v, s);
}

/** The extra-life gift, if `coins` is its price. */
export const isLifeGift = (coins: number): boolean => TUNING.lifeOn && coins === TUNING.lifePrice;

/**
 * Extra-life gifts, `n` of them: one more life each for the giver's snake, up to the most a snake
 * holds. Without a snake, the lives wait for the next one. It counts as a gift for the seats: in the
 * qualifying it locks one, outside it the giver joins the paid queue.
 */
export function arenaLife(nickname: string, avatar: string | undefined, n: number): void {
  if (!nickname || n <= 0 || nickname === PILOT.key) return;
  const v = viewer(nickname, avatar);
  v.acts.push(arena.clock);
  addLives(v, n);
  buySeat(v, n);
  const s = snakeOf(nickname);
  if (s) s.idle = 0;
}

// ---- the likers on the beach, during the qualifying -----------------------------------------

/**
 * During the qualifying the beach shows the newest likers: an animal comes up from the sand at
 * its viewer's first like and stays while they keep liking, walking away after `idle` seconds
 * without a like, never before `least` seconds on screen.
 */
export const QUEUE = { spots: 4, idle: 5, least: 3 };
interface Waiting {
  readonly nickname: string;
  readonly since: number;
  liked: number;
}
export const queue: (Waiting | null)[] = [];
/** When each spot was freed: it is taken again only once its last animal has buried itself. */
const freedAt: number[] = [];
const REUSE = 0.7;

/** A like from someone without a seat: their spot stays theirs, or they take a free one. */
export function queueLike(nickname: string): void {
  const now = arena.clock,
    mine = queue.find((w) => w?.nickname === nickname);
  if (mine) {
    mine.liked = now;
    return;
  }
  for (let i = 0; i < QUEUE.spots; i++)
    if (!queue[i] && now - (freedAt[i] ?? -Infinity) >= REUSE) {
      queue[i] = { nickname, since: now, liked: now };
      return;
    }
}

/** The viewer's animal leaves its spot (its picture went up to the board, or the race is over). */
export function leaveQueue(nickname: string): void {
  const i = queue.findIndex((w) => w?.nickname === nickname);
  if (i < 0) return;
  queue[i] = null;
  freedAt[i] = arena.clock;
}

/** Every animal leaves the beach's spots: the qualifying is over. */
export function clearQueue(): void {
  for (const w of queue) if (w) leaveQueue(w.nickname);
}

/** The quiet animals walk away. */
export function stepQueue(): void {
  const now = arena.clock;
  queue.length = QUEUE.spots;
  for (let i = 0; i < QUEUE.spots; i++) {
    const w = queue[i];
    if (!w) {
      queue[i] = null;
      continue;
    }
    if (now - w.liked > QUEUE.idle && now - w.since > QUEUE.least) {
      queue[i] = null;
      freedAt[i] = now;
    }
  }
}

/** The waiting animals in the order they came. */
export const queueOrder = (): string[] =>
  queue.filter((w): w is Waiting => !!w).map((w) => w.nickname);

// ---- the pilot player ----------------------------------------------------------------------

export const isPilot = (s: Snake): boolean => !s.wild && s.nickname === PILOT.key;

/** The control room's "Pilot player" switch. Off takes its snake away at once. */
export function setPilot(on: boolean): void {
  if (on === pilotOn) return;
  pilotOn = on;
  if (on) return;
  const s = snakeOf(PILOT.key);
  if (s) leave(s);
  for (let i = flights.length - 1; i >= 0; i--)
    if (flights[i]?.nickname === PILOT.key) flights.splice(i, 1);
  arena.viewers.delete(PILOT.key);
  crabGone(PILOT.key);
}

export const pilotPlaying = (): boolean => pilotOn;

/** The pilot likes steadily during the qualifying, as a viewer would with a trickle of likes. */
let pilotLikes = 0;
export function updatePilot(dt: number): void {
  if (!pilotOn || !qualifying()) return;
  viewer(PILOT.key);
  pilotLikes += PILOT.likes * dt;
  if (pilotLikes < 1) return;
  const n = Math.floor(pilotLikes);
  pilotLikes -= n;
  qualHooks.like(PILOT.key, n);
  pop(PILOT.key, n);
  land(PILOT.key, n);
}

/** The name under a picture. */
export const nameOf = (nickname: string): string =>
  nickname === PILOT.key ? PILOT.name : nickname;
export const shownName = (s: Snake): string => nameOf(s.nickname);
