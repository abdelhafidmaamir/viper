// Board hazards: where stones and brambles may appear. Nothing ever spawns in the lane a snake
// will cross before it becomes solid.

import type { Body, Bramble, BrambleSegment, Cell, Direction, Berry } from './types.ts';
import { playBramble, playBrambleStep } from './audio.ts';
import { tier } from './crowd.ts';
import { COLS, ROWS } from './layout.ts';
import { STONE_CLEARANCE, BRAMBLE_WARNING, SPEED } from './rules.ts';
import { tempoCeiling } from './crowd-energy.ts';
import {
  activeIndex,
  rival,
  berries,
  bodies,
  requestAiMove,
  dir,
  seeds,
  settings,
  stones,
  brambles,
  snake,
} from '../scripts/game.ts';

export function freeCells(): Cell[] {
  const typedSnake: Cell[] = snake;
  const occupied = new Set(typedSnake.map((s) => String(s.x) + ',' + String(s.y)));
  const a: Body | null = rival();
  if (a) {
    a.snake.forEach((s) => {
      occupied.add(String(s.x) + ',' + String(s.y));
    });
  }
  const typedSeeds: Cell[] = seeds;
  const typedBerries: Berry[] = berries;
  const typedStones: Cell[] = stones;
  typedSeeds.concat(typedBerries, typedStones).forEach((o) => {
    occupied.add(String(o.x) + ',' + String(o.y));
  });
  const typedBrambles: Bramble[] = brambles;
  typedBrambles.forEach((R) => {
    R.seg.forEach((g) => {
      occupied.add(String(g.x) + ',' + String(g.y));
    });
  });
  const l: Cell[] = [];
  for (let x = 0; x < COLS; x++)
    for (let y = 0; y < ROWS; y++) if (!occupied.has(String(x) + ',' + String(y))) l.push({ x, y });
  return l;
}

// Rule for ALL blocking objects, stone or bramble, anchor or growth: never place anything ahead of
// the snake if it will cross the cell before the object becomes solid. Otherwise the object appears
// under the snake, the animation is useless, and neither player nor viewer understands what happened.
export function isDeadZone(c: Cell, delay: number): boolean {
  const typedSnake: Cell[] = snake;
  const typedDir: Direction = dir;
  if (!typedSnake.length) return false;
  const h = typedSnake[0];
  if (!h) return false;
  const dx = c.x - h.x,
    dy = c.y - h.y;
  const devant = dx * typedDir.x + dy * typedDir.y,
    side = Math.abs(dx * typedDir.y - dy * typedDir.x);
  if (devant > 0 && side <= 1 && devant <= SPEED * tempoCeiling() * (delay + 0.25)) return true;
  const a: Body | null = rival();
  if (a?.snake.length) {
    const h2 = a.snake[0];
    if (!h2) return false;
    const dx2 = c.x - h2.x,
      dy2 = c.y - h2.y;
    const dev2 = dx2 * a.dir.x + dy2 * a.dir.y,
      cot2 = Math.abs(dx2 * a.dir.y - dy2 * a.dir.x);
    if (dev2 > 0 && cot2 <= 1 && dev2 <= SPEED * tempoCeiling() * (delay + 0.25)) return true;
  }
  return false;
}

// The already-solid bramble segments that can kill.
export function activeBrambles(k: number): BrambleSegment[] {
  const l: BrambleSegment[] = [];
  const typedBrambles: Bramble[] = brambles;
  typedBrambles.forEach((R) => {
    R.seg.forEach((g) => {
      if (g.t >= BRAMBLE_WARNING * (k || 1)) l.push(g);
    });
  });
  return l;
}

export const maxBrambles = (): number => Math.max(1, Math.round(tier.maxStones / 2));

// Roots outside the dead zone like a stone, then grows across the snake's lane: it closes a lane,
// not a single cell.
export function plantBramble(nickname: string): boolean {
  const typedSnake: Cell[] = snake;
  const typedDir: Direction = dir;
  if (!typedSnake.length) return false;
  const typedSettings: { caps?: boolean } = settings;
  const typedBrambles: Bramble[] = brambles;
  if (typedSettings.caps && typedBrambles.length >= maxBrambles()) return false;
  const h = typedSnake[0];
  if (!h) return false;
  const range = STONE_CLEARANCE();
  const isInLane = (c: Cell): boolean => isDeadZone(c, BRAMBLE_WARNING);
  const candidates = freeCells().filter(
    (c) => Math.abs(c.x - h.x) + Math.abs(c.y - h.y) >= 3 && !isInLane(c),
  );
  if (!candidates.length) return false;
  // Anchors at the entry of the lane the snake was heading into, slightly offset.
  const farAhead = Math.ceil(range) + 2;
  const aimPoint = {
    x: h.x + typedDir.x * farAhead + typedDir.y * 2,
    y: h.y + typedDir.y * farAhead + typedDir.x * 2,
  };
  candidates.sort(
    (a, b) =>
      Math.abs(a.x - aimPoint.x) +
      Math.abs(a.y - aimPoint.y) -
      (Math.abs(b.x - aimPoint.x) + Math.abs(b.y - aimPoint.y)),
  );
  const c = candidates[Math.floor(Math.random() * Math.min(4, candidates.length))];
  if (!c) return false;
  // Grows perpendicular to the snake's direction, toward the wider side of the board.
  let axis: Direction = { x: Math.abs(typedDir.y), y: Math.abs(typedDir.x) };
  if (!axis.x && !axis.y) axis = { x: 1, y: 0 };
  const growDir: 1 | -1 = axis.x ? (c.x < COLS / 2 ? 1 : -1) : c.y < ROWS / 2 ? 1 : -1;
  typedBrambles.push({
    seg: [{ x: c.x, y: c.y, t: 0 }],
    ax: axis,
    direction: growDir,
    t: 0,
    step: 0,
    nickname: nickname || '',
  });
  playBramble();
  return true;
}

// Extends one cell at a time; reverses direction if the wide side is blocked.
export function extendBramble(R: Bramble): boolean {
  const typedSnake: Cell[] = snake;
  const occupied = new Set(typedSnake.map((g) => String(g.x) + ',' + String(g.y)));
  const typedStones: Cell[] = stones;
  typedStones.forEach((r) => {
    occupied.add(String(r.x) + ',' + String(r.y));
  });
  const typedBrambles: Bramble[] = brambles;
  typedBrambles.forEach((o) => {
    o.seg.forEach((g) => {
      occupied.add(String(g.x) + ',' + String(g.y));
    });
  });
  for (const direction of [R.direction, -R.direction] as (1 | -1)[]) {
    const tip = direction === R.direction ? R.seg[R.seg.length - 1] : R.seg[0];
    if (!tip) continue;
    const n: BrambleSegment = {
      x: tip.x + R.ax.x * direction,
      y: tip.y + R.ax.y * direction,
      t: 0,
    };
    if (
      n.x < 0 ||
      n.y < 0 ||
      n.x >= COLS ||
      n.y >= ROWS ||
      occupied.has(String(n.x) + ',' + String(n.y))
    )
      continue;
    if (isDeadZone(n, BRAMBLE_WARNING)) continue; // never grows into the snake's dead zone either
    if (direction === R.direction) R.seg.push(n);
    else R.seg.unshift(n);
    R.direction = direction;
    playBrambleStep(R.seg.length - 1);
    requestAiMove(undefined);
    return true;
  }
  return false;
}

// Gifted berries are visible immediately: a viewer action has a visible effect without delay.
// A berry reserved for the rival team is invisible to this AI: it never targets it.
export function allFruits(): { x: number; y: number; gifted: boolean }[] {
  const typedBodies: Body[] = bodies;
  const myTeam = typedBodies[activeIndex]?.team ?? null;
  const allBerries: Berry[] = berries;
  return allBerries
    .filter((b) => !b.owner || !myTeam || b.owner === myTeam)
    .map((b) => ({ x: b.x, y: b.y, gifted: true }));
}
