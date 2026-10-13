// Snake Arena: what viewers do. A like shows where it counts: prod hearts pop round the liker's
// picture on the qualifying board, or over their animal on the beach. During the qualifying likes
// count in the race for the seats (qualify.ts). In the battle a player's likes fill the red ring round their animal's
// picture on the beach: every BOOST.likes of them fire a speed boost, the ring flashing, the
// animal running on the spot and the snake dashing. A gift during the qualifying locks a seat; in
// the battle its berries pour from the flower to the giver's snake, the giver's alone, and make it
// grow. Any gift outside the qualifying also puts its giver in the paid queue for the next rounds.
// With a seat price set (control room, Money tab), only the gift of that value buys the seat or
// the place in line, and it gives no berries; every other gift gives berries only. All of this
// only while gifts buy seats (Money tab, off by default): off, no gift buys a seat or a place in
// line, the qualifying goes by likes alone and a gift gives what a gift gives. Comments do
// nothing.
//
// The pilot player, "Skohlds", shows newcomers how it works: it likes as an engaged viewer does,
// in bursts through the qualifying and steadily through the battle, and plays when it gets a seat.
// Its likes and boosts show as a viewer's do (hearts, the like card, its chip, the SPEED BOOST
// card), but it is the game's own: no ranking, no crown, no win, no journal row, no supporters
// list.

import { alertViewer } from '../feed/alerts.ts';
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
 * The pilot player's name on screen. It plays under a key no viewer can have, an "S" and an
 * invisible space: its picture is the prod initials circle, "S".
 */
export const PILOT = { name: 'Skohlds', key: 'S​' };
let pilotOn = false;

/**
 * The qualifying's own rules (qualify.ts), set there: likes count in its race, a gift locks a seat
 * (false when it cannot: the clock is out, or every seat is paid). `entry` is the seat gift: it
 * brings no berries, so the flower shows it on a card of its own.
 */
export const qualHooks: {
  like: (nickname: string, n: number) => void;
  gift: (v: Viewer, entry?: boolean) => boolean;
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
 * A like shows where it counts, never flying across the screen: in the qualifying prod hearts pop
 * round the liker's picture on the board (a liker's animal on the beach shows its own hearts, as
 * Feed's do), in the battle the player's animal on the beach shows them. A like event pops
 * heartsFor(n) hearts, a single like 5, each leaving the picture's edge at its own angle, at most
 * POPS_ONE in the air for one viewer and POPS_MAX in all (the frame rate holds): past that a like
 * still counts.
 */
export interface LikePop {
  nickname: string;
  n: number;
  t: number;
  /** Where on the picture's edge the heart leaves from, in radians (-PI / 2 is the top). */
  angle: number;
}
export const likePops: LikePop[] = [];
export const POP_TIME = 0.6;
const POPS_MAX = 60,
  POPS_ONE = 14;

/** Hearts for a like event of `n` likes: 5 for one, two more for each tenfold, 11 at most. */
export const heartsFor = (n: number): number =>
  Math.min(11, 5 + 2 * Math.floor(Math.log10(Math.max(1, n))));
/** The next heart's place round the picture: a golden-ratio walk, spread and never random. */
let turn = 0;
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

/** Hearts pop round the liker's picture on the qualifying board: plenty, more for a burst. */
function pop(nickname: string, n: number): void {
  const hearts = heartsFor(n);
  let mine = likePops.filter((h) => h.nickname === nickname).length;
  for (let i = 0; i < hearts && mine < POPS_ONE && likePops.length < POPS_MAX; i++, mine++) {
    turn = (turn + 0.618034) % 1;
    // Round the picture's top and sides, never under it, where its badge is.
    likePops.push({ nickname, n, t: -i * 0.05, angle: -Math.PI / 2 + (turn - 0.5) * 3.4 });
  }
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
  likeLands(nickname, n);
}

/** What a like does on the board, a viewer's or the pilot's: the same path for both. */
function likeLands(nickname: string, n: number): void {
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
/**
 * `changed` whenever the queue changes: link.ts saves it. `card` when the seat gift buys a place
 * outside the qualifying: the flower shows a gold egg for it (round.ts), as it does for a gift.
 */
export const paidHooks: {
  changed: () => void;
  card: (nickname: string, avatar: string | undefined) => void;
} = { changed: () => undefined, card: () => undefined };

/**
 * A giver takes the next place in the paid queue. No alert card says it (no reward is announced):
 * the flower thanks them as for any gift, and the control room lists the queue.
 */
export function joinPaidQueue(nickname: string, avatar: string | undefined): void {
  if (!TUNING.giftSeats || nickname === PILOT.key || paidQueue.some((q) => q.nickname === nickname))
    return;
  paidQueue.push({ nickname, avatar });
  paidHooks.changed();
}

/** Nobody waits in line any more: gifts stopped buying seats. */
export function clearPaidQueue(): void {
  if (!paidQueue.length) return;
  paidQueue.length = 0;
  paidHooks.changed();
}

/** In how many rounds the paid queue's `place` plays: 1 the next round, each round taking `places()`. */
export const roundsToPlay = (place: number): number => Math.max(1, Math.ceil(place / places()));

/** This round's paid seats: the first `places()` of the queue, which leave it. */
export function takePaidBatch(): Queued[] {
  if (!TUNING.giftSeats) return [];
  const batch = paidQueue.splice(0, places());
  if (batch.length) paidHooks.changed();
  return batch;
}

/**
 * Gifts buy seats and the seat has no gift of its own (`seatPrice` 0, the default): any gift buys
 * it. Else only the seat gift does (isSeatGift), or none at all while gifts buy no seats.
 */
export const anyGiftBuys = (): boolean => TUNING.giftSeats && TUNING.seatPrice <= 0;

/**
 * What a gift buys for the seats: in the qualifying a seat, while one can be locked; else a place
 * in the paid queue. `entry` is the seat gift: outside the qualifying the flower shows its gold egg
 * on a card of its own, since it brings no berries.
 */
function buySeat(v: Viewer, entry = false): void {
  if (!TUNING.giftSeats) return;
  if (qualifying()) {
    if (qualHooks.gift(v, entry)) return;
  } else if (entry) paidHooks.card(v.nickname, v.avatar);
  joinPaidQueue(v.nickname, v.avatar);
}

/** Any gift in the battle (and its countdown) lifts the player's tier. */
function backs(v: Viewer, n: number): void {
  if (!qualifying() && arena.phase !== 'end') v.battle += n;
}

/** A big gift's shield, on the snake or kept for the one about to be born. */
function shield(v: Viewer, s: Snake | undefined): void {
  if (s) s.shield = Math.min(TUNING.shieldCap, s.shield + TUNING.shieldSeconds);
  else v.shield = Math.min(TUNING.shieldCap, v.shield + TUNING.shieldSeconds);
}

/**
 * A gift, already priced in berries by the control room's list: in the qualifying it locks a seat
 * and its berries wait in the flower for the battle; in the battle the flower pours them to the
 * giver's snake (round.ts). Outside the qualifying the giver joins the paid queue. With a seat
 * price set, it buys neither: its berries are all it gives. A big gift gives a shield.
 */
export function arenaGift(nickname: string, avatar: string | undefined, berries: number): void {
  if (!nickname || berries <= 0 || nickname === PILOT.key) return;
  const v = viewer(nickname, avatar);
  v.acts.push(arena.clock);
  v.gifted += berries;
  backs(v, berries);
  if (anyGiftBuys()) buySeat(v);
  const s = snakeOf(nickname);
  if (s) s.idle = 0;
  if (TUNING.shieldGift > 0 && berries >= TUNING.shieldGift) shield(v, s);
}

/** The extra-life gift, if `coins` is its price. */
export const isLifeGift = (coins: number): boolean => TUNING.lifeOn && coins === TUNING.lifePrice;

/**
 * The seat gift, if gifts buy seats, a seat price is set and `coins` is it. At the extra-life
 * gift's price the life wins: that gift gives a life, never a seat. While gifts buy no seats it is
 * a gift like any other, priced in berries.
 */
export const isSeatGift = (coins: number): boolean =>
  TUNING.giftSeats && TUNING.seatPrice > 0 && coins === TUNING.seatPrice && !isLifeGift(coins);

/**
 * Extra-life gifts, `n` of them: one more life each for the giver's snake, up to the most a snake
 * holds. Without a snake, the lives wait for the next one. With no seat price set it counts as a
 * gift for the seats: in the qualifying it locks one, outside it the giver joins the paid queue.
 */
export function arenaLife(nickname: string, avatar: string | undefined, n: number): void {
  if (!nickname || n <= 0 || nickname === PILOT.key) return;
  const v = viewer(nickname, avatar);
  v.acts.push(arena.clock);
  addLives(v, n);
  backs(v, n);
  if (anyGiftBuys()) buySeat(v);
  const s = snakeOf(nickname);
  if (s) s.idle = 0;
}

/**
 * The seat gift, `n` of it (a streak): an entry and nothing else, never berries. In the qualifying
 * it locks a seat, while one can be locked; else its giver joins the paid queue. One place per
 * viewer, however many. In the battle it lifts the player's tier, as any gift does.
 */
export function arenaSeat(nickname: string, avatar: string | undefined, n: number): void {
  if (!nickname || n <= 0 || nickname === PILOT.key) return;
  const v = viewer(nickname, avatar);
  v.acts.push(arena.clock);
  backs(v, n);
  buySeat(v, true);
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

/**
 * How the pilot likes, as an engaged viewer does: in the qualifying, bursts of `burst` likes (from
 * the first number to the second) every `gap` seconds; in the battle, a burst every `gap` seconds
 * too, sized so that its likes fire a speed boost every `boostEvery` seconds, whatever the likes
 * for a boost are set to. Each range is drawn from anew: a burst's size, the next gap, and the
 * time to the next boost each time one fires.
 */
export const PILOT_LIKES = {
  burst: [5, 15],
  gap: [0.5, 1],
  boostEvery: [15, 25],
} as const;

/** A whole or fractional value drawn evenly between a range's two ends. */
const between = (range: readonly [number, number]): number =>
  range[0] + (range[1] - range[0]) * arena.rand();

/** The pilot's pace: seconds to its next burst, likes owed in the battle, the boost it aims at. */
const pilot = { wait: 0, owed: 0, period: 20, boost: -Infinity };

/**
 * The pilot likes as a viewer would, through the same path: hearts round its picture and the like
 * card in the qualifying, its ring on the beach and on the strip in the battle.
 */
export function updatePilot(dt: number): void {
  const battle = arena.phase === 'play';
  if (!pilotOn || (!qualifying() && !battle)) return;
  viewer(PILOT.key);
  const boosted = fired.get(PILOT.key) ?? -Infinity;
  if (battle && boosted !== pilot.boost) {
    // A boost fired (or the battle began): the next one in a new while.
    pilot.boost = boosted;
    pilot.period = between(PILOT_LIKES.boostEvery);
  }
  // Likes owed in the battle only: none carry over from the qualifying or a round before.
  pilot.owed = battle ? pilot.owed + (BOOST.likes / pilot.period) * dt : 0;
  pilot.wait -= dt;
  if (pilot.wait > 0) return;
  pilot.wait = between(PILOT_LIKES.gap);
  let n: number;
  if (battle) {
    n = Math.floor(pilot.owed);
    pilot.owed -= n;
  } else n = Math.round(between(PILOT_LIKES.burst));
  if (n <= 0) return;
  likeLands(PILOT.key, n);
  // The like card, as a viewer's like gets one (only while the arena shows like cards).
  alertViewer('like', PILOT.name, undefined, n);
}

/** The name under a picture. */
export const nameOf = (nickname: string): string =>
  nickname === PILOT.key ? PILOT.name : nickname;
export const shownName = (s: Snake): string => nameOf(s.nickname);
