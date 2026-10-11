// Snake Arena: what viewers do. Likes fill the red ring on their animal's picture on the beach
// (the prod likers' animals); a full ring lays the Duel's egg at a free place on the board, the
// picture flies to it and their snake hatches from it. Once in, likes fill the same ring on the
// snake's head: its speed gauge, when the boost is on. A gift's berries pour from the flower to
// the giver's snake and make it grow; a gift from someone without a snake brings it in at once (a
// control room switch), or on a full board to the front of the queue, and a big one gives a
// shield. Comments do nothing. Nobody is ever put off the board to make room.
//
// The pilot player, "Skohlds", shows newcomers how it works: its ring fills by itself, its
// picture flies to its egg, its snake plays like any other and comes back after a death. It is the
// game's own: no ranking, no crown, no thanks, no alert, no journal row, no supporters list.

import { crabFaces, crabGone } from '../feed/crabs.ts';
import { H, W } from '../engine/layout.ts';
import {
  TUNING,
  addLives,
  alive,
  arena,
  leave,
  options,
  cellX,
  cellY,
  places,
  snakeOf,
  spawn,
  toPx,
  viewer,
  type Snake,
  type Viewer,
} from './rules.ts';

export const ENTRY = {
  /** Likes that fill an animal's ring (control room, "Likes to fill the entry ring"). */
  likesNeeded: 100,
  /** A gift from a viewer without a snake brings it in at once. */
  giftEntry: true,
};

/**
 * The pilot player's name on screen, and seconds its ring takes to fill. It plays under a key no
 * viewer can have, an "S" and an invisible space: its picture is the prod initials circle, "S".
 */
export const PILOT = { name: 'Skohlds', key: 'S\u200b', fill: 20 };
let pilotOn = false;

/** Likes toward entry per viewer, since their last birth or death. */
export const rings = new Map<string, number>();

/** A picture on its way from the beach to the egg its snake hatches from. */
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
/** Seconds of the flight from the beach to the egg's spot; the egg starts when it lands. */
export const FLIGHT = 0.84;

/** The picture of a viewer's animal as drawn this frame, or where the beach would have it. */
export function faceOf(nickname: string): { x: number; y: number; r: number } {
  return crabFaces().get(nickname) ?? { x: W / 2, y: H - 220, r: 45 };
}

/**
 * A place is free. A snake on the board is never put out to make room, not a viewer's, not a wild
 * one, not the pilot: a place frees only when a snake dies.
 */
const hasRoom = (): boolean => alive().length < places();

/**
 * Viewers who gave on a full board, in the order they gave: their ring is full, their animal
 * stands at the front of the queue, and they go in first at the next free place.
 */
export const gifters: string[] = [];

/**
 * The viewer comes in: their egg is laid at once; for a full ring, their picture flies from the
 * beach to it. On a full board nothing happens: they wait on the beach. With a place but no
 * colour or cell free, they wait in the line for the next place.
 */
function enter(v: Viewer, instant: boolean): void {
  if (v.state === 'in' || v.state === 'line') return;
  const wait = (): void => {
    v.state = 'line';
    if (!arena.line.includes(v.nickname)) arena.line.push(v.nickname);
  };
  // The round is over: a place at the start of the next one.
  if (arena.phase === 'end') {
    rings.set(v.nickname, 0);
    wait();
    return;
  }
  if (!hasRoom()) return;
  rings.set(v.nickname, 0);
  const s = spawn(v);
  if (!s?.egg) {
    wait();
    return;
  }
  if (instant) return;
  const from = faceOf(v.nickname),
    to = toPx(cellX(s.egg.cell), cellY(s.egg.cell));
  // The egg waits for the picture: it only starts once the picture has landed on its spot.
  s.egg.t = -FLIGHT;
  flights.push({
    nickname: v.nickname,
    avatar: v.avatar,
    x: from.x,
    y: from.y,
    tx: to.x,
    ty: to.y,
    t: 0,
  });
}

/** Pictures on their way to the eggs, and like hearts on theirs to the rings. */
export function updateFlights(dt: number): void {
  for (let i = likeHearts.length - 1; i >= 0; i--) {
    const h = likeHearts[i];
    if (!h) continue;
    h.t += dt;
    if (h.t >= h.delay + HEART_FLIGHT) likeHearts.splice(i, 1);
  }
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    if (!f) continue;
    f.t += dt;
    if (f.t >= FLIGHT) flights.splice(i, 1);
  }
}

/**
 * Like hearts on their way into a ring on the beach, from the corner TikTok's own hearts rise in:
 * each burst sends a few, so a like is seen landing where it counts.
 */
export const likeHearts: { nickname: string; t: number; delay: number }[] = [];
export const HEART_FLIGHT = 0.7;
const HEARTS_PER_LIKE = 3,
  HEARTS_MAX = 40;

/** Likes: the entry ring on the beach, or the speed ring on the head. */
export function arenaLike(nickname: string, avatar: string | undefined, n: number): void {
  if (!nickname || n <= 0 || nickname === PILOT.key) return;
  const v = viewer(nickname, avatar);
  v.acts.push(arena.clock);
  for (let k = 0; k < Math.min(n, HEARTS_PER_LIKE) && likeHearts.length < HEARTS_MAX; k++)
    likeHearts.push({ nickname, t: 0, delay: k * 0.08 });
  const s = v.state === 'in' ? snakeOf(nickname) : undefined;
  if (s) {
    if (options.likeBoost) s.boost = Math.min(TUNING.boostCap, s.boost + n * TUNING.likeBoost);
    s.idle = 0;
    return;
  }
  if (v.state === 'line') return;
  rings.set(nickname, (rings.get(nickname) ?? 0) + n);
  queueLike(nickname);
}

/** A big gift's shield, on the snake or kept for the one about to be born. */
function shield(v: Viewer, s: Snake | undefined): void {
  if (s) s.shield = Math.min(TUNING.shieldCap, s.shield + TUNING.shieldSeconds);
  else v.shield = Math.min(TUNING.shieldCap, v.shield + TUNING.shieldSeconds);
}

/**
 * A gift from a viewer without a snake: with a free place they come in at once. On a full board
 * nobody makes way: their ring fills at once and their animal waits at the front of the queue,
 * NEXT, gifters in the order they gave, until a snake dies.
 */
function giftIn(v: Viewer): void {
  if (arena.phase === 'end' || hasRoom()) {
    enter(v, true);
    return;
  }
  if (v.state === 'in' || v.state === 'line') return;
  rings.set(v.nickname, Math.max(rings.get(v.nickname) ?? 0, ENTRY.likesNeeded));
  if (!gifters.includes(v.nickname)) gifters.push(v.nickname);
  queueLike(v.nickname);
}

/**
 * A gift, already priced in berries by the control room's list: the flower pours them to the
 * giver's snake (round.ts), a viewer without one comes in when the switch says so, and a big gift
 * gives a shield. Berries never get lost: without a snake they wait in the flower.
 */
export function arenaGift(nickname: string, avatar: string | undefined, berries: number): void {
  if (!nickname || berries <= 0 || nickname === PILOT.key) return;
  const v = viewer(nickname, avatar);
  v.acts.push(arena.clock);
  v.gifted += berries;
  if (v.state !== 'in' && ENTRY.giftEntry) giftIn(v);
  const s = snakeOf(nickname);
  if (s) s.idle = 0;
  if (TUNING.shieldGift > 0 && berries >= TUNING.shieldGift) shield(v, s);
}

/** The extra-life gift, if `coins` is its price. */
export const isLifeGift = (coins: number): boolean => TUNING.lifeOn && coins === TUNING.lifePrice;

/**
 * Extra-life gifts, `n` of them: one more life each for the giver's snake, up to the most a snake
 * holds; a viewer without a snake comes in with them as with any gift.
 */
export function arenaLife(nickname: string, avatar: string | undefined, n: number): void {
  if (!nickname || n <= 0 || nickname === PILOT.key) return;
  const v = viewer(nickname, avatar);
  v.acts.push(arena.clock);
  addLives(v, n);
  if (v.state !== 'in') giftIn(v);
  const s = snakeOf(nickname);
  if (s) s.idle = 0;
}

// ---- the queue on the beach ----------------------------------------------------------------

/**
 * The queue is a fixed row of spots on the beach, read by motion alone: a liker without a spot
 * takes a free one (their animal walks in), keeps it while they keep liking and walks away after
 * `idle` seconds without a like, never before `least` seconds on screen. The first animal on
 * screen whose ring is full goes in. Likes count while a viewer has no spot: when they come back
 * their animal walks in with its ring as full as they left it.
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
/** The line as it stands, and how far a ring must pass another's to overtake it. */
let line: string[] = [];
const OVERTAKE = 0.06;
/** Animals that took or left a queue spot, for the tests' count of the churn. */
export const queueMoves = { count: 0 };

/** A like from someone waiting: their spot stays theirs, or they take a free one. */
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
      queueMoves.count++;
      return;
    }
  // A gifter waiting for a place is never kept off the beach: with every spot taken, the quietest
  // animal without a gift leaves its spot to them (its likes are kept).
  if (!gifters.includes(nickname) || queue.some((w) => !w)) return;
  let at = -1;
  queue.forEach((w, i) => {
    if (w && !gifters.includes(w.nickname) && (at < 0 || w.liked < (queue[at]?.liked ?? 0))) at = i;
  });
  if (at < 0) return;
  queue[at] = { nickname, since: now, liked: now };
  queueMoves.count += 2;
}

/**
 * Someone with a full ring waiting on the beach, or a gifter waiting for a place: a wild snake
 * never takes a place they are waiting for.
 */
export const fullRingWaiting = (): boolean =>
  gifters.length > 0 || queue.some((w) => !!w && (rings.get(w.nickname) ?? 0) >= ENTRY.likesNeeded);

/**
 * The queue between frames: who leaves their spot, and who goes in at a free place. A gifter
 * waiting goes first, in the order they gave; then the fullest ring, once the viewers owed a
 * place in the line (round.ts lets them in) have theirs.
 */
export function stepQueue(): void {
  const now = arena.clock;
  // Gifters who went in, or into the line, wait here no more.
  for (let i = gifters.length - 1; i >= 0; i--) {
    const st = arena.viewers.get(gifters[i] ?? '')?.state;
    if (st !== 'none' && st !== 'out') gifters.splice(i, 1);
  }
  queue.length = QUEUE.spots;
  for (let i = 0; i < QUEUE.spots; i++) {
    const w = queue[i];
    if (!w) {
      queue[i] = null;
      continue;
    }
    const v = arena.viewers.get(w.nickname),
      gone = !v || v.state === 'in' || v.state === 'line',
      quiet =
        !gifters.includes(w.nickname) && now - w.liked > QUEUE.idle && now - w.since > QUEUE.least;
    if (gone || quiet) {
      queue[i] = null;
      freedAt[i] = now;
      queueMoves.count++;
    }
  }
  for (const n of gifters) queueLike(n);
  if (arena.phase === 'end' || !hasRoom()) return;
  const here = (n: string): boolean => queue.some((w) => w?.nickname === n),
    gifter = gifters.find(here),
    full = queue
      .filter((w): w is Waiting => !!w && (rings.get(w.nickname) ?? 0) >= ENTRY.likesNeeded)
      .sort((p, q) => (rings.get(q.nickname) ?? 0) - (rings.get(p.nickname) ?? 0))[0],
    likes = !gifters.length && alive().length + arena.line.length < places(),
    next = gifter ?? (likes ? full?.nickname : undefined);
  if (!next) return;
  const v = arena.viewers.get(next);
  if (v && v.state !== 'in' && v.state !== 'line') enter(v, false);
}

/**
 * The waiting animals in the order they stand: the fullest ring first, nearest the arena group,
 * so more likes is seen as moving up the line.
 */
export function queueOrder(): string[] {
  const here = queue.filter((w): w is Waiting => !!w).map((w) => w.nickname);
  // Who left is gone from the line; who came stands at its end.
  line = line.filter((n) => here.includes(n));
  for (const n of here) if (!line.includes(n)) line.push(n);
  // Gifters waiting for a place stand at the front, in the order they gave.
  const first = gifters.filter((n) => line.includes(n));
  line = [...first, ...line.filter((n) => !first.includes(n))];
  // One overtake at a time, and only by a clear margin: the swap is a short walk to watch.
  const margin = ENTRY.likesNeeded * OVERTAKE;
  for (let i = first.length; i + 1 < line.length; i++) {
    const a = line[i] ?? '',
      b = line[i + 1] ?? '';
    if ((rings.get(b) ?? 0) > (rings.get(a) ?? 0) + margin) {
      line[i] = b;
      line[i + 1] = a;
      break;
    }
  }
  return [...line];
}

// ---- the pilot player ----------------------------------------------------------------------

export const isPilot = (s: Snake): boolean => !s.wild && s.nickname === PILOT.key;

/** The control room's "Pilot player" switch. Off takes its animal and its snake away at once. */
export function setPilot(on: boolean): void {
  if (on === pilotOn) return;
  pilotOn = on;
  if (on) return;
  const s = snakeOf(PILOT.key);
  if (s) leave(s);
  for (let i = flights.length - 1; i >= 0; i--)
    if (flights[i]?.nickname === PILOT.key) flights.splice(i, 1);
  arena.line = arena.line.filter((n) => n !== PILOT.key);
  arena.viewers.delete(PILOT.key);
  rings.delete(PILOT.key);
  crabGone(PILOT.key);
}

export const pilotPlaying = (): boolean => pilotOn;

/**
 * The pilot's ring fills steadily, as a viewer's would with a trickle of likes. Its animal comes
 * out on the beach first; its likes never reach the round's rankings or the journal.
 */
export function updatePilot(dt: number): void {
  if (!pilotOn) return;
  const v = viewer(PILOT.key);
  if (v.state !== 'out' && v.state !== 'none') return;
  rings.set(PILOT.key, (rings.get(PILOT.key) ?? 0) + (ENTRY.likesNeeded / PILOT.fill) * dt);
  queueLike(PILOT.key);
}

/** The name under a snake's picture. */
export const shownName = (s: Snake): string => (isPilot(s) ? PILOT.name : s.nickname);
