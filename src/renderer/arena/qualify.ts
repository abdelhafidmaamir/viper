// Snake Arena: the qualifying. Between the end screen and GET READY, for QUALIFY.time seconds, the
// board holds no snake: one egg per place, each with the picture of the viewer holding that seat.
// Everyone starts at 0, last round's players and winner too. The most likes during the qualifying
// hold the seats. Seats are not ordered: one changes hands only at the cut, when someone without a
// seat passes the weakest holder, at most one swap every QUALIFY.swapGap seconds. A gift locks a
// seat for its giver: their ring turns full gold and nobody pushes them out. At 0:00 the holders
// hatch from their eggs one by one, the empty eggs hatch wild snakes, then 3, 2, 1 and the battle.

import { game } from '../feed/state.ts';
import { FLIGHT, faceOf, leaveQueue, qualHooks, queueLike, rings, gifters } from './entry.ts';
import {
  TUNING,
  arena,
  cellX,
  cellY,
  cellId,
  places,
  spawn,
  toPx,
  viewer,
  type Viewer,
} from './rules.ts';
import { FCOLS, FROWS } from '../feed/grid.ts';

export const QUALIFY = {
  /** Seconds of the qualifying; 0 skips it, as before (straight to GET READY). */
  time: 30,
  /** Seconds at least between two seats changing hands on likes. */
  swapGap: 1.5,
};

export interface Seat {
  readonly cell: number;
  holder: string | null;
  /** A gift holds it: never pushed out. */
  locked: boolean;
  /** Seconds since the holder's picture left the beach for this egg. */
  since: number;
}

export const seats: Seat[] = [];
/** Likes per viewer during this qualifying. */
export const qualLikes = new Map<string, number>();
/** Seconds into the qualifying. */
export const qual = { t: 0, swapT: 0 };
/** Gifts sent during the end screen: they lock a seat as soon as the qualifying opens. */
const lateGifts: string[] = [];

/** A picture flying between the beach and a seat's egg. */
export interface SeatFlight {
  nickname: string;
  avatar?: string | undefined;
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
  /** Down to the beach: it grows as it lands, instead of shrinking. */
  down: boolean;
}
export const seatFlights: SeatFlight[] = [];

export const qualifying = (): boolean => arena.phase === 'qualify';

/** Seconds left in the qualifying. */
export const qualLeft = (): number => Math.max(0, QUALIFY.time - qual.t);

/** The picture over a seat's egg, in game units. */
export function seatPhoto(seat: Seat): { x: number; y: number } {
  const p = toPx(cellX(seat.cell), cellY(seat.cell));
  return { x: p.x, y: p.y - 64 };
}

/**
 * The seats' cells, spread over the board: one row for three places or fewer, else two rows,
 * the second set between the first's columns, clear of the board's edges.
 */
export function seatCells(n: number): number[] {
  const out: number[] = [];
  if (n <= 0) return out;
  const rows = n <= 3 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)],
    ys =
      rows.length === 1
        ? [Math.round(FROWS * 0.62)]
        : [Math.round(FROWS * 0.3), Math.round(FROWS * 0.75)];
  rows.forEach((count, r) => {
    const y = ys[r] ?? 0;
    for (let i = 0; i < count; i++) {
      const x = Math.round(((i + 0.5) * FCOLS) / count);
      out.push(cellId(Math.min(FCOLS - 3, Math.max(2, x)), y));
    }
  });
  return out;
}

/** The qualifying opens: the eggs are laid empty, every count starts at 0. */
export function startQualifying(): void {
  qualLikes.clear();
  seatFlights.length = 0;
  seats.length = 0;
  for (const cell of seatCells(places()))
    seats.push({ cell, holder: null, locked: false, since: 9 });
  qual.t = 0;
  qual.swapT = QUALIFY.swapGap;
  arena.phase = 'qualify';
  // Feed's countdown waits: it plays at the end of the qualifying.
  game.ready = -1;
  rings.clear();
  gifters.length = 0;
  for (const v of arena.viewers.values())
    if (v.state !== 'none') {
      v.state = 'out';
      v.snake = -1;
    }
  arena.line = [];
  for (const n of lateGifts.splice(0)) lockSeat(viewer(n));
}

const seated = (nickname: string): Seat | undefined => seats.find((s) => s.holder === nickname);
const likesOf = (nickname: string | null): number =>
  nickname ? (qualLikes.get(nickname) ?? 0) : 0;

/** The most likes anyone has this qualifying: a full ring. */
export function topLikes(): number {
  let top = 0;
  for (const n of qualLikes.values()) if (n > top) top = n;
  return top;
}

/** A picture leaves the beach for the seat's egg. */
function takeSeat(seat: Seat, nickname: string): void {
  const v = arena.viewers.get(nickname),
    from = faceOf(nickname),
    to = seatPhoto(seat);
  seat.holder = nickname;
  seat.since = 0;
  leaveQueue(nickname);
  seatFlights.push({
    nickname,
    avatar: v?.avatar,
    x: from.x,
    y: from.y,
    tx: to.x,
    ty: to.y,
    t: 0,
    down: false,
  });
}

/** The holder's picture goes back down to the beach, where their animal walks in. */
function leaveSeat(seat: Seat): void {
  const nickname = seat.holder;
  seat.holder = null;
  seat.locked = false;
  if (!nickname) return;
  queueLike(nickname);
  const v = arena.viewers.get(nickname),
    from = seatPhoto(seat),
    to = faceOf(nickname);
  seatFlights.push({
    nickname,
    avatar: v?.avatar,
    x: from.x,
    y: from.y,
    tx: to.x,
    ty: to.y,
    t: 0,
    down: true,
  });
}

/** The unlocked holder with the fewest likes this qualifying. */
function weakest(): Seat | undefined {
  let best: Seat | undefined;
  for (const s of seats)
    if (s.holder && !s.locked && (!best || likesOf(s.holder) < likesOf(best.holder))) best = s;
  return best;
}

/** A gift locks a seat for its giver: theirs, an empty one, or the weakest unlocked holder's. */
function lockSeat(v: Viewer): void {
  const mine = seated(v.nickname);
  if (mine) {
    mine.locked = true;
    return;
  }
  const seat = seats.find((s) => !s.holder) ?? weakest();
  if (!seat) return;
  if (seat.holder) leaveSeat(seat);
  takeSeat(seat, v.nickname);
  seat.locked = true;
}

qualHooks.like = (nickname, n) => {
  qualLikes.set(nickname, likesOf(nickname) + n);
  if (!seated(nickname)) queueLike(nickname);
};
qualHooks.gift = (v) => {
  lockSeat(v);
};
qualHooks.late = (nickname) => {
  if (!lateGifts.includes(nickname)) lateGifts.push(nickname);
};

/** The best liker without a seat. */
function challenger(): string | null {
  let best: string | null = null;
  for (const [n, likes] of qualLikes)
    if (likes > 0 && !seated(n) && (!best || likes > likesOf(best))) best = n;
  return best;
}

/** One step of the qualifying: empty seats fill, the cut swaps, and 0:00 hatches the eggs. */
export function stepQualifying(dt: number): void {
  qual.t += dt;
  qual.swapT += dt;
  for (const s of seats) s.since += dt;
  // Empty seats go to the best likers at once.
  for (const seat of seats) {
    if (seat.holder) continue;
    const n = challenger();
    if (!n) break;
    takeSeat(seat, n);
  }
  // The cut: one swap at a time, when a challenger passes the weakest unlocked holder.
  if (qual.swapT >= QUALIFY.swapGap) {
    const n = challenger(),
      seat = weakest();
    if (n && seat && likesOf(n) > likesOf(seat.holder)) {
      leaveSeat(seat);
      takeSeat(seat, n);
      qual.swapT = 0;
    }
  }
  if (qual.t >= QUALIFY.time) endQualifying();
}

/** Seat flights move on. */
export function updateSeatFlights(dt: number): void {
  for (let i = seatFlights.length - 1; i >= 0; i--) {
    const f = seatFlights[i];
    if (!f) continue;
    f.t += dt;
    if (f.t >= FLIGHT) seatFlights.splice(i, 1);
  }
}

/**
 * 0:00: the holders become the round's players, hatching from their eggs one by one; the empty
 * eggs hatch wild snakes up to the usual count; then Feed's 3, 2, 1 and the battle.
 */
export function endQualifying(): void {
  arena.phase = 'ready';
  game.ready = 0;
  seatFlights.length = 0;
  let k = 0;
  const holders = seats.filter((s) => s.holder).length,
    wild = Math.max(0, Math.min(TUNING.wildUpTo, places()) - holders);
  let wilds = 0;
  for (const seat of seats) {
    const v = seat.holder ? viewer(seat.holder) : null;
    if (!v && wilds >= wild) continue;
    const s = spawn(v, undefined, seat.cell);
    if (!s?.egg) continue;
    if (!v) wilds++;
    s.seat = true;
    s.egg.t = -k * TUNING.enterGap;
    k++;
  }
  // The usual entries wait for the eggs.
  arena.enterT = k * TUNING.enterGap + 0.3;
  arena.wildT = arena.enterT + 1;
  seats.length = 0;
}
