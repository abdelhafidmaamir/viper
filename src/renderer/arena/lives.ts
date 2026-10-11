// Snake Arena: extra lives on screen. A life gift opens the flower on the giver's picture, as any
// gift does, and a prod heart drops from it to the giver's snake's picture, or to their animal on
// the beach while they wait, where it joins their hearts. The hearts stand by the picture on the
// board and by the animal's picture on the beach, the same count in both places. A life used
// breaks one of them: it drops and fades where it stood.

import { ctx } from '../engine/canvas.ts';
import { W } from '../engine/layout.ts';
import { bigHeart } from '../feed/alert-fx.ts';
import { crabFaces } from '../feed/crabs.ts';
import { MOUTH } from '../feed/grid.ts';
import { game, type Pour } from '../feed/state.ts';
import { TUNING, arena, snakeOf, toPx, type Snake } from './rules.ts';

interface Point {
  x: number;
  y: number;
}
interface Face extends Point {
  r: number;
}

/** A heart's size, in game units: by a snake's picture on the board, by an animal's on the beach. */
export const HEART = { board: 32, beach: 30 };
/** Seconds the flower shows a life gift; its heart leaves once it is open, and its flight. */
export const LIFE_SHOW = 1.4;
const HEART_OUT = 0.45,
  HEART_FLIGHT = 0.9,
  HEART_GAP = 0.15;

/** Life gifts waiting for the flower, the first one on show. */
const shows: { pour: Pour; t: number; hearts: number }[] = [];
/** Hearts on their way from the flower to a picture. */
export const lifeHearts: { nickname: string; t: number }[] = [];

/**
 * A life gift: the flower opens on the giver's picture, the count of gifts on its card, and drops
 * one heart for each life it gave (none once the most a snake holds is reached).
 */
export function lifeGift(
  nickname: string,
  avatar: string | undefined,
  n: number,
  added: number,
): void {
  shows.push({
    pour: { id: ++game.pours, nickname, n: 0, total: n, title: '', avatar, life: true },
    t: 0,
    hearts: added,
  });
}

/** The life gift the flower shows now, if any (round.ts gives it the flower meanwhile). */
export const lifePour = (): Pour | null => shows[0]?.pour ?? null;

export function stepLives(dt: number): void {
  for (let i = lifeHearts.length - 1; i >= 0; i--) {
    const h = lifeHearts[i];
    if (!h) continue;
    h.t += dt;
    if (h.t >= HEART_FLIGHT) lifeHearts.splice(i, 1);
  }
  const show = shows[0];
  if (!show) return;
  const was = show.t;
  show.t += dt;
  if (was < HEART_OUT && show.t >= HEART_OUT) {
    for (let k = 0; k < show.hearts; k++)
      lifeHearts.push({ nickname: show.pour.nickname, t: -k * HEART_GAP });
    show.hearts = 0;
  }
  if (show.t >= LIFE_SHOW) shows.shift();
}

/** Lives the viewer holds, on their snake or kept for the next one. */
function livesOf(nickname: string): number {
  const s = snakeOf(nickname);
  return s ? s.lives : (arena.viewers.get(nickname)?.lives ?? 0);
}

/** Hearts not yet with this viewer: still in the flower, or in the air. */
function flying(nickname: string): number {
  let n = 0;
  for (const show of shows) if (show.pour.nickname === nickname) n += show.hearts;
  for (const h of lifeHearts) if (h.nickname === nickname) n++;
  return n;
}

/** Hearts shown by a viewer's pictures: their lives, less those still on their way. */
export const shownLives = (nickname: string): number =>
  Math.max(0, livesOf(nickname) - flying(nickname));

/**
 * Where the i-th heart stands by a snake's picture on the board (x, y its centre, r its radius):
 * in a row out from its right side, level with the picture, so the face, the crown above and the
 * name below stay clear; out from its left side when the right edge is too near.
 */
export function boardHeart(x: number, y: number, r: number, i: number, n: number): Point {
  const step = HEART.board + 2,
    right = x + r + 10 + n * step <= W - 8,
    k = r + 8 + HEART.board / 2 + i * step;
  return { x: right ? x + k : x - k, y: y - r * 0.15 };
}

/** A row of `n` prod hearts at the places `at` gives, `size` across. */
export function paintHearts(n: number, size: number, at: (i: number) => Point): void {
  if (n <= 0) return;
  const c = ctx,
    heart = bigHeart(true);
  for (let i = 0; i < n; i++) {
    const p = at(i);
    c.drawImage(heart, p.x - size / 2, p.y - size / 2, size, size);
  }
}

/** A snake's picture over its head, where board-paint.ts draws it (without its bob). */
function photoOf(s: Snake): Point {
  const head = toPx(s.x, s.y);
  return {
    x: Math.min(W - 60, Math.max(60, head.x)),
    y: Math.max(TUNING.photoR + 70, head.y - 64),
  };
}

/** An animal's picture is drawn at 28 of its 32 half-size units (crabs.ts paints it so). */
const CRAB_PHOTO = 28 / 32;

/** A heart's size by an animal on the beach: smaller with the animal, never too small to read. */
const beachSize = (r: number): number => Math.max(24, HEART.beach * Math.min(1, r / 44.8));

/**
 * Where the i-th heart stands by an animal's picture on the beach (as crabs.ts drew it): in rows
 * of three just under the picture, so the face, the crown above it and the flag at its side stay
 * clear; the animals stand too close for a row at their side.
 */
export function beachHeart(f: Face, i: number, n: number): Point {
  const size = beachSize(f.r),
    row = Math.floor(i / 3),
    inRow = Math.min(3, n - row * 3),
    k = i % 3;
  return {
    x: f.x + (k - (inRow - 1) / 2) * size * 0.95,
    y: f.y + f.r * CRAB_PHOTO + size * 0.5 + 2 + row * size * 0.8,
  };
}

/** The hearts by an animal's picture on the beach: its snake's lives, or those kept for it. */
export function paintCrabHearts(nickname: string, f: Face): void {
  const n = livesOf(nickname);
  paintHearts(shownLives(nickname), beachSize(f.r), (i) => beachHeart(f, i, n));
}

/** The hearts by every animal's picture on the beach. */
export function paintBeachHearts(): void {
  for (const [nickname, f] of crabFaces()) paintCrabHearts(nickname, f);
}

/**
 * Where the i-th heart of a viewer stands now, and its size: by their snake's picture on the board
 * once the snake is out, else by their animal's picture on the beach. Null when neither shows.
 */
export function heartTarget(nickname: string, i: number): (Point & { size: number }) | null {
  const s = snakeOf(nickname),
    n = livesOf(nickname);
  if (s?.in) {
    const p = photoOf(s);
    return { ...boardHeart(p.x, p.y, TUNING.photoR, i, n), size: HEART.board };
  }
  const f = crabFaces().get(nickname);
  return f ? { ...beachHeart(f, i, n), size: beachSize(f.r) } : null;
}

/** The hearts by a snake's picture on the board. */
export function paintSnakeHearts(s: Snake, x: number, y: number, r: number): void {
  paintHearts(shownLives(s.nickname), HEART.board, (i) => boardHeart(x, y, r, i, s.lives));
}

/**
 * A life used: the last heart by the picture where the snake died drops and fades. `u` runs from
 * 0 to 1 over the dying second.
 */
export function paintBrokenHeart(s: Snake, from: Point, u: number): void {
  const i = Math.max(0, s.lives - 1),
    p = boardHeart(from.x, from.y, TUNING.photoR, i, s.lives),
    size = HEART.board,
    c = ctx;
  c.save();
  c.globalAlpha = Math.max(0, 1 - u);
  c.drawImage(bigHeart(true), p.x - size / 2, p.y + 60 * u * u - size / 2, size, size);
  c.restore();
}

/**
 * The hearts on their way from the flower: each arcs to the place it takes in its viewer's row, by
 * their snake's picture on the board or their animal's on the beach, and joins it on landing. A
 * heart with nowhere to go fades under the flower.
 */
export function paintFlyingHearts(): void {
  const c = ctx,
    heart = bigHeart(true),
    landed = new Map<string, number>();
  for (const h of lifeHearts) {
    if (h.t < 0) continue;
    // Hearts still flying to the same viewer take the next places in the row, in order.
    const k = landed.get(h.nickname) ?? 0;
    landed.set(h.nickname, k + 1);
    const to = heartTarget(h.nickname, shownLives(h.nickname) + k),
      u = Math.min(1, h.t / HEART_FLIGHT),
      e = u * u * (3 - 2 * u);
    c.save();
    if (!to) {
      c.globalAlpha = 1 - u;
      c.drawImage(heart, MOUTH.x - 22, MOUTH.y - 22 + 40 * u, 44, 44);
      c.restore();
      continue;
    }
    const x = MOUTH.x + (to.x - MOUTH.x) * e,
      y = MOUTH.y + (to.y - MOUTH.y) * e - Math.sin(u * Math.PI) * 90,
      size = 44 + (to.size - 44) * e;
    c.drawImage(heart, x - size / 2, y - size / 2, size, size);
    c.restore();
  }
}

/** A new round: nothing left on its way. */
export function clearLives(): void {
  shows.length = 0;
  lifeHearts.length = 0;
}
