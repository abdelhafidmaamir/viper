// Snake Arena: extra lives on screen. The hearts stand by the picture on the board and by the
// animal's picture on the beach, the same count in both places. A life gift adds its heart there
// at once. A life used breaks one of them: it drops and fades where it stood.

import { ctx } from '../engine/canvas.ts';
import { W } from '../engine/layout.ts';
import { bigHeart } from '../feed/alert-fx.ts';
import { crabFaces } from '../feed/crabs.ts';
import { TUNING, arena, snakeOf, type Snake } from './rules.ts';

interface Point {
  x: number;
  y: number;
}
interface Face extends Point {
  r: number;
}

/** A heart's size, in game units: by a snake's picture on the board, by an animal's on the beach. */
export const HEART = { board: 32, beach: 30 };

/** Lives the viewer holds, on their snake or kept for the next one. */
function livesOf(nickname: string): number {
  const s = snakeOf(nickname);
  return s ? s.lives : (arena.viewers.get(nickname)?.lives ?? 0);
}

/** Hearts shown by a viewer's pictures: their lives. */
export const shownLives = (nickname: string): number => livesOf(nickname);

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

/**
 * Continuous play: the i-th heart on the rim of a snake's picture (x, y its centre, r its radius),
 * round its lower side from the right, half over the outline: it belongs to that picture and no
 * other, however close another stands. A heart only on the side away from the screen's edge.
 */
export function rimHeart(x: number, y: number, r: number, i: number): Point {
  const turn = ((20 + i * 32) * Math.PI) / 180,
    side = x + r + HEART.board > W - 8 ? -1 : 1,
    d = r + 4;
  return { x: x + side * Math.cos(turn) * d, y: y + Math.sin(turn) * d };
}

/** Where the i-th heart of `n` stands by a snake's picture, in the round's own way. */
const heartAt = (x: number, y: number, r: number, i: number, n: number): Point =>
  arena.continuous ? rimHeart(x, y, r, i) : boardHeart(x, y, r, i, n);

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

/** The hearts by a snake's picture on the board. */
export function paintSnakeHearts(s: Snake, x: number, y: number, r: number): void {
  paintHearts(shownLives(s.nickname), HEART.board, (i) => heartAt(x, y, r, i, s.lives));
}

/**
 * Continuous play, a life used and the snake playing on: a white ring bursts round its picture at
 * (x, y), and the heart it lost, the last of those on its rim, shown bigger, breaks in two halves
 * that tilt apart, drop and fade. `u` runs from 0 to 1.
 */
export function paintLostHeart(s: Snake, x: number, y: number, u: number): void {
  const r = TUNING.photoR,
    p = rimHeart(x, y, r, s.lives),
    size = HEART.board * 1.6,
    heart = bigHeart(true),
    c = ctx;
  c.save();
  if (u < 0.6) {
    const k = u / 0.6;
    c.globalAlpha = 0.9 * (1 - k);
    c.strokeStyle = '#fff';
    c.lineWidth = 6 * (1 - k * 0.5);
    c.beginPath();
    c.arc(x, y, r * (1.05 + 0.45 * k), 0, Math.PI * 2);
    c.stroke();
  }
  c.globalAlpha = Math.max(0, 1 - u * u);
  for (const side of [-1, 1]) {
    c.save();
    c.translate(p.x + side * 14 * u, p.y + 50 * u * u);
    c.rotate(side * 0.6 * u);
    c.beginPath();
    c.rect(side < 0 ? -size / 2 : 0, -size / 2, size / 2, size);
    c.clip();
    c.drawImage(heart, -size / 2, -size / 2, size, size);
    c.restore();
  }
  c.restore();
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
