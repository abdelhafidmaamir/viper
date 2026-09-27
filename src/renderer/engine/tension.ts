// Tension: how cornered the leading snake is, from reachable space, length and dead cells nearby.
// Sampled ten times a second, rising fast and easing slowly; the camera and HUD read it.

import type { Cell } from './types.ts';
import { tier } from './crowd.ts';
import { activeBrambles } from './hazards.ts';
import { COLS, ROWS } from './layout.ts';
import { STONE_WARNING } from './rules.ts';
import { rival, stones, snake } from '../scripts/game.ts';

// Tension drives the camera tightening. Round progress says nothing about risk: a snake can be one
// berry from winning in open space, or cornered at the second. Three factors feed it: reachable
// space from the head, snake length, and dead cells adjacent to the head.
export let tension = 0,
  tensionTarget = 0,
  tensionTimer = 0;

// Remeasured ten times a second, then smoothed: rises fast, eases slowly.
export function updateTension(dt: number): void {
  tensionTimer -= dt;
  if (tensionTimer <= 0) {
    tensionTimer = 0.1;
    tensionTarget = measureTension();
  }
  tension += (tensionTarget - tension) * Math.min(1, dt * (tensionTarget > tension ? 3.5 : 0.9));
}

export function measureTension(): number {
  if (!snake.length) return 0;
  const head = snake[0];
  if (!head) return 0; // invariant: snake.length > 0 checked above; guard for noUncheckedIndexedAccess
  const wall = new Set<string>();
  for (let i = 0; i < snake.length - 1; i++) {
    const cell = snake[i];
    if (!cell) continue; // invariant: i < snake.length; guard for noUncheckedIndexedAccess
    wall.add(String(cell.x) + ',' + String(cell.y));
  }
  const a = rival();
  if (a) a.snake.forEach((s) => wall.add(String(s.x) + ',' + String(s.y)));
  stones.forEach((r) => {
    if (r.t >= STONE_WARNING) wall.add(String(r.x) + ',' + String(r.y));
  });
  // Pass 1 explicitly: k is used as (k || 1), so undefined and 1 are equivalent.
  activeBrambles(1).forEach((g) => wall.add(String(g.x) + ',' + String(g.y)));
  const VOISINS: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  // 1. flood-fill from the head; the board is small enough for BFS every sample
  const visited = new Set([String(head.x) + ',' + String(head.y)]);
  let queue: Cell[] = [head],
    n = 0;
  while (queue.length) {
    const nextCells: Cell[] = [];
    for (const c of queue) {
      for (const d of VOISINS) {
        const x = c.x + d[0],
          y = c.y + d[1],
          k = String(x) + ',' + String(y);
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS || visited.has(k) || wall.has(k)) continue;
        visited.add(k);
        n++;
        nextCells.push({ x, y });
      }
    }
    queue = nextCells;
  }
  const totalFree = Math.max(1, COLS * ROWS - wall.size);
  // cutOff: snake walled into a pocket of the board
  const cutOff = 1 - Math.min(1, n / totalFree);
  // narrow: even without a pocket, not enough room left to manoeuvre
  const narrow = 1 - Math.min(1, n / (snake.length * 2 + 16));
  // lengthFactor: length alone, which weighs even in open space
  const lengthFactor = Math.min(1, snake.length / (COLS * ROWS * 0.3));
  // stuckFactor: head neighbours blocked by wall, body or stone
  let blockedCount = 0;
  for (const d of VOISINS) {
    const x = head.x + d[0],
      y = head.y + d[1];
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS || wall.has(String(x) + ',' + String(y)))
      blockedCount++;
  }
  const stuckFactor = Math.min(1, blockedCount / 3);
  // stoneRatio: each active stone removes a cell and closes an escape lane
  const stoneRatio = Math.min(
    1,
    stones.filter((r) => r.t >= STONE_WARNING).length / Math.max(1, tier.maxStones),
  );
  return Math.max(
    0,
    Math.min(
      1,
      0.3 * cutOff + 0.25 * narrow + 0.28 * lengthFactor + 0.1 * stuckFactor + 0.07 * stoneRatio,
    ),
  );
}
