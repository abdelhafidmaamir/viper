// Snake Arena, step 1: the qualifying. For QUALIFY.time seconds the board holds no snake: one egg
// per place, ranked 1st to last in two rows, each with the picture of the viewer holding that
// seat and a heart badge with their likes in this qualifying; a cut line under them; under it the
// three best challengers without a seat. Everyone starts at 0, last round's players and winner too.
//
// The rule is read on screen: a seat changes hands only when the first challenger's number passes
// the weakest seat's number, the two pictures crossing the cut line together, at most one swap
// every QUALIFY.swapGap seconds. While gifts buy seats (Money tab), a gift locks a seat for its
// giver: the flower opens on their face as for any gift, their picture leaves it for a free egg,
// or for the weakest like seat, whose holder crosses down to the challengers as in any swap; the
// egg turns gold as it lands. The seats keep a strict order: the paid ones first in the order the
// gifts came, then the most likes. Every number on screen rolls up to the likes counted (hearts pop
// round the picture with each like, entry.ts), and the rules read those same numbers. Nothing
// presses: the clock is the ring alone, no seat is ever shown at risk. Everything moves eased,
// slowly enough to follow.
//
// At 0:00 everything freezes for QUALIFY.freeze seconds and the challengers fade; then Feed's
// 3, 2, 1 plays over the closed eggs, and at GO every egg hatches in one beat (the empty ones hatch
// wild snakes up to the usual count): a fair start (round.ts).

import { READY_TIME, hooks, game, type Pour } from '../feed/state.ts';
import { FCOLS, MOUTH } from '../feed/grid.ts';
import {
  PILOT,
  bumps,
  clearQueue,
  faceOf,
  leaveQueue,
  pilotPlaying,
  qualHooks,
  queueLike,
  updatePilot,
} from './entry.ts';
import {
  EMERGE,
  TUNING,
  arena,
  cellId,
  cellX,
  cellY,
  places,
  spawn,
  toPx,
  viewer,
  type Viewer,
} from './rules.ts';

/** Seconds into Feed's countdown when GO! shows: the eggs burst then (hud.ts paintReady). */
const HATCH_AT = READY_TIME - 0.6;

export const QUALIFY = {
  /** Seconds of the qualifying; 0 skips it (tests of the battle alone). */
  time: 30,
  /** Seconds at least between two seats changing hands on likes. */
  swapGap: 0.6,
  /** Seconds at least between two changes in the challengers' row. */
  reorderGap: 0.6,
  /** Seconds everything holds still at 0:00 before the eggs hatch. */
  freeze: 0.5,
  /** Challengers shown under the cut line. */
  challengers: 3,
  /** Seconds of a slide in the ranking, of a swap across the cut, of a flight to or from the beach. */
  slide: 0.9,
  swap: 0.9,
  fly: 0.9,
  /** Seconds the flower shows a gift's giver before their picture leaves it for the egg. */
  show: 1.6,
  /** Seconds a number takes to roll up to its new value. */
  roll: 0.3,
};

/** Seat pictures and challengers' pictures, in game units. */
export const SEAT_R = 60,
  CHALLENGER_R = 44;
/**
 * The eggs' rows on the board, in cells; the cut line and the challengers' row, in pixels, low on
 * the board. The two rows of seats stand evenly between the board's top (clear of the clock's pill
 * by about a picture's radius) and the cut line; the challengers near the board's bottom edge.
 */
const EGG_ROWS = [9, 19],
  PHOTO_ABOVE = 112;
export const CUT_Y = 1018,
  CHALLENGER_Y = 1132;

export interface Seat {
  readonly cell: number;
  holder: string | null;
}

/** The seats in rank order on screen: 1st top left to last bottom right. */
export const seats: Seat[] = [];
/** The challengers' row, best first. */
export let challengers: string[] = [];
/** Locked seats' holders, in the order they gave. */
export const locked: string[] = [];
/** Locked seats whose picture has landed: their egg is gold. */
const golden = new Set<string>();
/** Likes per viewer counted this qualifying, and the numbers on screen rolling up to them. */
export const qualLikes = new Map<string, number>();
const rolled = new Map<string, number>();
/** Seconds into the qualifying, since the last swap and the last reorder. */
export const qual = { t: 0, swapT: 0, reorderT: 0 };

/** Gifts the flower shows in turn before each giver's picture leaves it for their egg. */
interface Show {
  readonly pour: Pour;
  t: number;
}
const shows: Show[] = [];
let showId = -1;

/**
 * A picture on the qualifying board, gliding toward where it belongs: its seat, its place in the
 * challengers' row, or back down to its animal on the beach.
 */
export interface Actor {
  readonly nickname: string;
  x: number;
  y: number;
  r: number;
  alpha: number;
  from: { x: number; y: number; r: number; alpha: number };
  to: { x: number; y: number; r: number; alpha: number };
  t: number;
  dur: number;
  /** Sideways bow of the path, in pixels (a swap's two pictures bow opposite ways). */
  arc: number;
  /** Going back down to the beach: removed once there. */
  leaving: boolean;
  /** Flying from the flower to a gift's egg, which turns gold as it lands. */
  gift: boolean;
  /** Rising from its animal on the beach: its name and number show once it is nearly there. */
  rising: boolean;
}
export const actors = new Map<string, Actor>();

export const qualifying = (): boolean => arena.phase === 'qualify';
/** Seconds left on the qualifying's clock. */
export const qualLeft = (): number => Math.max(0, QUALIFY.time - qual.t);
/** The race is over: the board holds still, then hatches. */
export const frozen = (): boolean => qual.t >= QUALIFY.time;

/** A viewer's number on screen this qualifying (and the one the rules read). */
export const likesOf = (nickname: string | null): number =>
  nickname ? Math.round(rolled.get(nickname) ?? 0) : 0;

/** The most likes on screen. */
export function topLikes(): number {
  let top = 0;
  for (const n of rolled.keys()) top = Math.max(top, likesOf(n));
  return top;
}

const seated = (nickname: string): Seat | undefined => seats.find((s) => s.holder === nickname);
export const seatOf = seated;
export const isLocked = (nickname: string | null): boolean =>
  !!nickname && locked.includes(nickname);
/** A locked seat whose picture has landed: gold egg, gold outline. */
export const isGold = (nickname: string | null): boolean =>
  !!nickname && golden.has(nickname) && isLocked(nickname);

/**
 * Seats' cells: the first row takes the larger half, each row spread evenly across the board, the
 * same whole number of cells between two eggs (8 places: 4 a row, 7 cells apart).
 */
export function seatCells(n: number): number[] {
  const out: number[] = [],
    rows = n <= 3 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
  rows.forEach((count, r) => {
    const y = EGG_ROWS[rows.length === 1 ? 1 : r] ?? 0;
    out.push(...rowCells(count).map((x) => cellId(x, y)));
  });
  return out;
}

/** `count` columns evenly spread across the board, centred. */
function rowCells(count: number): number[] {
  const gap = Math.floor(FCOLS / Math.max(1, count)),
    first = Math.round((FCOLS - 1 - gap * (count - 1)) / 2);
  return Array.from({ length: count }, (_, i) => first + gap * i);
}

/** Where a seat's picture sits, over its egg. */
export function seatSpot(i: number): { x: number; y: number; r: number } {
  const seat = seats[i],
    p = seat ? toPx(cellX(seat.cell), cellY(seat.cell)) : { x: 0, y: 0 };
  return { x: p.x, y: p.y - PHOTO_ABOVE, r: SEAT_R };
}

/** Where the i-th challenger stands: their row spread evenly across the board, centred. */
export function challengerSpot(i: number): { x: number; y: number; r: number } {
  const x = rowCells(QUALIFY.challengers)[i] ?? 0;
  return { x: toPx(x, 0).x, y: CHALLENGER_Y, r: CHALLENGER_R };
}

/** Ease in and out (cubic): every move starts and ends softly. */
export const easeInOut = (v: number): number => {
  const x = Math.max(0, Math.min(1, v));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

/** Sends a picture gliding to `to`; a new one starts from `from` (its animal on the beach). */
function aim(
  nickname: string,
  to: { x: number; y: number; r: number },
  how: {
    alpha?: number;
    from?: { x: number; y: number; r: number };
    dur?: number;
    arc?: number;
    gift?: boolean;
  } = {},
): void {
  const alpha = how.alpha ?? 1;
  let a = actors.get(nickname);
  if (!a) {
    const start = how.from ?? faceOf(nickname),
      a0 = how.from ? 1 : 0.3;
    a = {
      nickname,
      x: start.x,
      y: start.y,
      r: start.r,
      alpha: a0,
      from: { x: start.x, y: start.y, r: start.r, alpha: a0 },
      to: { ...to, alpha },
      t: 0,
      dur: how.dur ?? QUALIFY.fly,
      arc: how.arc ?? 0,
      leaving: false,
      gift: how.gift ?? false,
      rising: !how.from,
    };
    actors.set(nickname, a);
    return;
  }
  a.leaving = false;
  if (a.to.x === to.x && a.to.y === to.y && a.to.r === to.r && a.to.alpha === alpha) return;
  a.from = { x: a.x, y: a.y, r: a.r, alpha: a.alpha };
  a.to = { ...to, alpha };
  a.t = 0;
  a.dur = how.dur ?? QUALIFY.slide;
  a.arc = how.arc ?? 0;
}

/** The picture goes back down to its animal on the beach and fades into it. */
function sendDown(nickname: string): void {
  const a = actors.get(nickname);
  if (!a || a.leaving) return;
  queueLike(nickname);
  const to = faceOf(nickname);
  a.from = { x: a.x, y: a.y, r: a.r, alpha: a.alpha };
  a.to = { x: to.x, y: to.y, r: to.r * 0.8, alpha: 0 };
  a.t = 0;
  a.dur = QUALIFY.fly;
  a.arc = 0;
  a.leaving = true;
}

/** Pictures glide on, eased; a gift's picture turns its egg gold as it lands. */
function glide(dt: number): void {
  for (const [n, a] of actors) {
    a.t += dt;
    const u = easeInOut(a.t / a.dur),
      bow = Math.sin(u * Math.PI),
      lift = a.leaving || a.gift ? bow * 70 : 0,
      dx = a.to.x - a.from.x,
      dy = a.to.y - a.from.y,
      len = Math.hypot(dx, dy) || 1;
    // The arc bows sideways to the way it goes: across a row it passes above or below.
    a.x = a.from.x + dx * u + (-dy / len) * bow * a.arc;
    a.y = a.from.y + dy * u + (dx / len) * bow * a.arc - lift;
    a.r = a.from.r + (a.to.r - a.from.r) * u;
    a.alpha = a.from.alpha + (a.to.alpha - a.from.alpha) * u;
    if (a.rising && a.t >= a.dur) a.rising = false;
    if (a.gift && a.t >= a.dur) {
      a.gift = false;
      golden.add(n);
      bumps.set(n, arena.clock);
      hooks.land(0);
    }
    if (a.leaving && a.t >= a.dur) actors.delete(n);
  }
}

/** The numbers on screen roll up to the likes counted. */
function roll(dt: number): void {
  const k = 1 - Math.exp(-dt / (QUALIFY.roll / 3));
  for (const [n, counted] of qualLikes) {
    const target = counted,
      was = rolled.get(n) ?? 0,
      next = was + (target - was) * k;
    rolled.set(n, Math.abs(target - next) < 0.02 ? target : next);
  }
}

/**
 * The qualifying opens: the eggs are laid empty, every count starts at 0. `owed` is this round's
 * batch of the paid queue: each gets a locked seat in that order, shown by the flower.
 */
export function startQualifying(owed: readonly Pour[] = []): void {
  qualLikes.clear();
  rolled.clear();
  actors.clear();
  locked.length = 0;
  golden.clear();
  shows.length = 0;
  challengers = [];
  seats.length = 0;
  for (const cell of seatCells(places())) seats.push({ cell, holder: null });
  qual.t = 0;
  qual.swapT = QUALIFY.swapGap;
  qual.reorderT = QUALIFY.reorderGap;
  arena.phase = 'qualify';
  // Feed's countdown waits: it plays once the eggs have hatched.
  game.ready = -1;
  for (const v of arena.viewers.values())
    if (v.state !== 'none') {
      v.state = 'out';
      v.snake = -1;
    }
  for (const p of owed) lockSeat(viewer(p.nickname, p.avatar), { ...p, carried: false });
}

/** The holder of the weakest seat a like can take: the fewest likes, the lowest on screen. */
function weakest(): Seat | undefined {
  let best: Seat | undefined;
  for (const s of seats)
    if (s.holder && !isLocked(s.holder) && (!best || likesOf(s.holder) <= likesOf(best.holder)))
      best = s;
  return best;
}

/** A card of its own for the flower, one gift and no berry: the seat gift, or a seat owed. */
const card = (v: Viewer): Pour => ({
  id: showId--,
  nickname: v.nickname,
  avatar: v.avatar,
  n: 1,
  total: 1,
  title: '',
});

/**
 * A gift locks a seat for its giver: theirs, an empty one, or the weakest unlocked holder's, who
 * crosses down to the first challenger's place as in any swap, quietly. The flower shows the gift,
 * then the picture flies from it to the egg. False when every seat is paid.
 */
function lockSeat(v: Viewer, pour?: Pour): boolean {
  if (locked.includes(v.nickname)) return true;
  let seat = seated(v.nickname);
  if (!seat) {
    seat = seats.find((s) => !s.holder) ?? weakest();
    if (!seat) return false;
    const down = seat.holder;
    if (down) out(down);
    seat.holder = v.nickname;
    challengers = challengers.filter((n) => n !== v.nickname);
    leaveQueue(v.nickname);
    if (down) {
      challengers = [down, ...challengers.filter((n) => n !== down)].slice(0, QUALIFY.challengers);
      qual.swapT = 0;
      qual.reorderT = 0;
      if (actors.has(down)) aim(down, challengerSpot(0), { dur: QUALIFY.swap, arc: -50 });
    }
  }
  locked.push(v.nickname);
  // The flower shows what the gift bought, a seat: a gold egg on its card (a copy: the berries
  // waiting in the flower show as berries when they pour in the battle).
  const shown = pour ?? game.queue.find((q) => q.nickname === v.nickname) ?? card(v);
  shows.push({ pour: { ...shown, seat: true }, t: shows.length ? -0.1 : 0 });
  return true;
}

/** A holder loses their seat. */
function out(nickname: string): void {
  const seat = seated(nickname);
  if (seat) seat.holder = null;
  const i = locked.indexOf(nickname);
  if (i >= 0) locked.splice(i, 1);
  golden.delete(nickname);
}

qualHooks.like = (nickname, n) => {
  qualLikes.set(nickname, (qualLikes.get(nickname) ?? 0) + n);
  if (!seated(nickname) && !challengers.includes(nickname)) queueLike(nickname);
};
// Once the clock is out, or every seat is paid, a gift goes to the paid queue (entry.ts). The seat
// gift brings no berries: its card is its own, never the giver's earlier gifts.
qualHooks.gift = (v, entry) => !frozen() && lockSeat(v, entry ? card(v) : undefined);

/** The gift the flower shows now, if any: round.ts opens the flower on it. */
export const showing = (): Pour | null => {
  const s = shows[0];
  return s && s.t >= 0 ? s.pour : null;
};

/** The flower's show moves on; when it ends, the giver's picture leaves the flower. */
function stepShows(dt: number): void {
  const s = shows[0];
  if (!s) return;
  s.t += dt;
  if (s.t < QUALIFY.show) return;
  shows.shift();
  const next = shows[0];
  if (next) next.t = Math.min(next.t, -0.1);
  const n = s.pour.nickname,
    seat = seated(n);
  if (!seat) return;
  if (actors.has(n)) {
    // Already on its egg: the egg turns gold where it stands.
    golden.add(n);
    bumps.set(n, arena.clock);
    hooks.land(0);
    return;
  }
  aim(n, seatSpot(seats.indexOf(seat)), {
    from: { x: MOUTH.x, y: MOUTH.y, r: 30 },
    dur: QUALIFY.fly,
    gift: true,
  });
}

/** Still waiting in the flower's show: their picture is not on the board yet. */
const inShow = (nickname: string): boolean => shows.some((s) => s.pour.nickname === nickname);

/** Likers without a seat, the most likes first. */
function waiting(): string[] {
  return [...qualLikes.keys()]
    .filter((n) => !seated(n) && likesOf(n) > 0)
    .sort((p, q) => likesOf(q) - likesOf(p));
}

/** A clear lead: how many likes more it takes to move up on screen. */
const lead = (): number => Math.max(2, Math.round(topLikes() * 0.05));

/**
 * Orders `names` by likes, starting from their order on screen: a picture moves up only past one
 * it leads clearly, so ties and near ties never shuffle.
 */
function settle(names: string[], first: (n: string) => number = () => 0): string[] {
  const out = [...names],
    h = lead();
  // Bubble passes until nothing moves: at most one per name.
  let passes = names.length,
    moved = true;
  while (moved && passes-- > 0) {
    moved = false;
    for (let i = 0; i + 1 < out.length; i++) {
      const a = out[i] ?? '',
        b = out[i + 1] ?? '',
        ka = first(a),
        kb = first(b);
      if (kb < ka || (kb === ka && likesOf(b) > likesOf(a) + h)) {
        out[i] = b;
        out[i + 1] = a;
        moved = true;
      }
    }
  }
  return out;
}

/**
 * The seats' holders in their strict order: the paid seats first, in the order the gifts came,
 * then the like seats, the most likes first (a tie keeps its place), the empty seats last.
 */
export function ranked(): (string | null)[] {
  const holders = seats.map((s) => s.holder).filter((n): n is string => !!n),
    at = (n: string): number => seats.findIndex((s) => s.holder === n),
    paid = (n: string): number => {
      const i = locked.indexOf(n);
      return i >= 0 ? i : Infinity;
    };
  holders.sort(
    (p, q) =>
      (paid(p) === paid(q) ? 0 : paid(p) < paid(q) ? -1 : 1) ||
      likesOf(q) - likesOf(p) ||
      at(p) - at(q),
  );
  return seats.map((_, i) => holders[i] ?? null);
}

/** The challengers' row: the best likers without a seat, a newcomer only with a clear lead. */
function bestChallengers(): string[] {
  const all = waiting(),
    row = challengers.filter((n) => !seated(n) && likesOf(n) > 0),
    h = lead();
  for (const n of all) {
    if (row.includes(n)) continue;
    if (row.length < QUALIFY.challengers) {
      row.push(n);
      continue;
    }
    let low = 0;
    row.forEach((m, i) => {
      if (likesOf(m) < likesOf(row[low] ?? '')) low = i;
    });
    if (likesOf(n) > likesOf(row[low] ?? '') + h) row[low] = n;
  }
  return settle(row);
}

/**
 * The seats always stand in their strict order: each holder out of place slides to its seat,
 * eased, those moving up bowing one way and those moving down the other, so none pass through
 * another.
 */
function reorderSeats(): void {
  const order = ranked(),
    was = new Map(seats.map((s, i) => [s.holder, i] as const));
  order.forEach((n, i) => {
    const seat = seats[i];
    if (!seat || seat.holder === n) return;
    seat.holder = n;
    const from = n ? (was.get(n) ?? i) : i;
    if (n && actors.has(n)) aim(n, seatSpot(i), { arc: from > i ? 30 : -30 });
  });
}

/** One change in the challengers' row: a newcomer in, or two trading places. */
function reorderChallengers(): boolean {
  const best = bestChallengers();
  if (best.join() === challengers.join()) return false;
  const gone = challengers.find((n) => !best.includes(n)),
    come = best.find((n) => !challengers.includes(n));
  if (gone !== undefined || come !== undefined) {
    // One in, one out, at the same place; the order settles on the next ticks.
    const at = gone !== undefined ? challengers.indexOf(gone) : challengers.length;
    const next = challengers.filter((n) => n !== gone);
    if (come !== undefined) next.splice(Math.min(at, next.length), 0, come);
    challengers = next.slice(0, QUALIFY.challengers);
    return true;
  }
  const i = best.findIndex((n, k) => n !== challengers[k]);
  const j = challengers.indexOf(best[i] ?? '');
  if (i < 0 || j < 0) return false;
  const next = [...challengers];
  next[j] = next[i] ?? '';
  next[i] = best[i] ?? '';
  challengers = next;
  aim(next[i] ?? '', challengerSpot(i), { arc: 40 });
  aim(next[j] ?? '', challengerSpot(j), { arc: -40 });
  return true;
}

/** Every seat is held by a gift whose picture has landed. */
export const allLocked = (): boolean =>
  seats.length > 0 && !shows.length && seats.every((s) => isGold(s.holder));

/** One step of the qualifying. */
export function stepQualifying(dt: number): void {
  qual.t += dt;
  glide(dt);
  roll(dt);
  stepShows(dt);
  if (frozen()) {
    holdStill();
    if (qual.t >= QUALIFY.time + QUALIFY.freeze) endQualifying();
    return;
  }
  // Every seat held by a gift: likes can change nothing more, the qualifying ends at once (once
  // the last gift's picture has landed on its egg).
  if (allLocked()) {
    qual.t = QUALIFY.time;
    return;
  }
  qual.swapT += dt;
  qual.reorderT += dt;
  updatePilot(dt);
  if (pilotPlaying() && !arena.viewers.has(PILOT.key)) viewer(PILOT.key);
  // Empty seats go to the best likers at once.
  for (const seat of seats) {
    if (seat.holder) continue;
    const n = waiting()[0];
    if (!n) break;
    seat.holder = n;
    challengers = challengers.filter((c) => c !== n);
    leaveQueue(n);
  }
  swap();
  reorderSeats();
  // The challengers' row: at most one change every reorderGap seconds, so the eye can follow it.
  if (qual.reorderT >= QUALIFY.reorderGap && reorderChallengers()) qual.reorderT = 0;
  place();
}

/**
 * The cut: the first challenger on screen passes the weakest seat's number; the two cross the
 * line together, on gentle opposite arcs.
 */
function swap(): void {
  // The best liker without a seat, wherever they stand: the screen is right within a second.
  const first = waiting()[0],
    seat = weakest();
  if (
    qual.swapT < QUALIFY.swapGap ||
    !first ||
    !seat?.holder ||
    seats.some((s) => !s.holder) ||
    likesOf(first) <= likesOf(seat.holder)
  )
    return;
  const down = seat.holder,
    at = Math.max(0, challengers.indexOf(first)),
    i = seats.indexOf(seat);
  seat.holder = first;
  challengers = challengers.filter((n) => n !== first);
  challengers.splice(at, 0, down);
  challengers = challengers.slice(0, QUALIFY.challengers);
  leaveQueue(first);
  qual.swapT = 0;
  qual.reorderT = 0;
  aim(first, seatSpot(i), { dur: QUALIFY.swap, arc: 50 });
  aim(down, challengerSpot(at), { dur: QUALIFY.swap, arc: -50 });
  hooks.land(0);
}

/** Every picture heads for where it belongs now. */
function place(): void {
  seats.forEach((s, i) => {
    if (s.holder && (actors.has(s.holder) || !inShow(s.holder))) aim(s.holder, seatSpot(i));
  });
  challengers.forEach((n, i) => {
    leaveQueue(n);
    aim(n, challengerSpot(i));
  });
  for (const n of actors.keys()) if (!seated(n) && !challengers.includes(n)) sendDown(n);
}

/**
 * 0:00: nothing changes hands any more. The challengers fade where they stand; each seat's
 * picture settles where its snake's photo will float, so the hatch reads as one move.
 */
function holdStill(): void {
  seats.forEach((s) => {
    if (!s.holder) return;
    const p = toPx(cellX(s.cell), cellY(s.cell)),
      to = { x: p.x, y: p.y - 84, r: TUNING.photoR };
    if (actors.has(s.holder)) aim(s.holder, to, { dur: QUALIFY.freeze });
  });
  for (const n of challengers) {
    const a = actors.get(n);
    if (a) aim(n, { x: a.to.x, y: a.to.y, r: a.to.r }, { alpha: 0, dur: QUALIFY.freeze });
  }
}

/**
 * The countdown starts over the closed eggs: every holder's, and the empty eggs' wild snakes up to
 * the usual count. Each egg is timed to burst at GO, all in one beat (round.ts plays the rest).
 */
export function endQualifying(): void {
  arena.phase = 'ready';
  game.ready = 0;
  shows.length = 0;
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
    s.paid = !!v && isLocked(v.nickname);
    s.egg.t = EMERGE - HATCH_AT;
  }
  arena.started = arena.snakes.filter((s) => s.alive && !s.wild && s.nickname !== PILOT.key).length;
  seats.length = 0;
  challengers = [];
  actors.clear();
  clearQueue();
}
