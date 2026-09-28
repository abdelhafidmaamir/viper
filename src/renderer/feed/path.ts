// The snake's brain. The fixed loop is its safety net: following it, the snake can never bite
// itself. On top of it, the snake takes shortcuts toward the nearest berry, the classic trick of
// board-filling snake AIs: a shortcut may only skip cells that are free and lie between the head
// and the tail along the loop, so the body always stays in loop order behind the head and the
// loop successor of the head is always free. When the snake gets long, shortcuts stop and it
// packs the board along the loop.

import { FCOLS, FROWS } from './grid.ts';
import type { Cell } from './loop-path.ts';

export const TOTAL = FCOLS * FROWS;
const SHORTCUTS_UNTIL = 0.55; // share of the board above which the snake sticks to the loop
const MARGIN = 4; // cells kept between a shortcut and the tail

export const id = (c: Cell): number => c.y * FCOLS + c.x;
export const cellOf = (i: number): Cell => ({ x: i % FCOLS, y: Math.floor(i / FCOLS) });

export interface Body {
  /** Loop order of each cell id. */
  ord: Int32Array;
  /** Cell id at each loop position. */
  at: Int32Array;
  /** Cell ids under the body, head first. */
  cells: number[];
  occ: Uint8Array;
}

export function makeBody(loop: Cell[], headPos: number, len: number): Body {
  const ord = new Int32Array(TOTAL),
    at = new Int32Array(TOTAL);
  loop.forEach((c, i) => {
    ord[id(c)] = i;
    at[i] = id(c);
  });
  const body: Body = { ord, at, cells: [], occ: new Uint8Array(TOTAL) };
  for (let k = 0; k < len; k++) {
    const c = at[(((headPos - k) % TOTAL) + TOTAL) % TOTAL] ?? 0;
    body.cells.push(c);
    body.occ[c] = 1;
  }
  return body;
}

/** Distance from a to b going forward along the loop. */
export const ahead = (b: Body, from: number, to: number): number =>
  ((((b.ord[to] ?? 0) - (b.ord[from] ?? 0)) % TOTAL) + TOTAL) % TOTAL;

/** The next cell for the head. `targets` are the berry cells; `owed` is growth still to come. */
export function nextCell(
  b: Body,
  targets: Iterable<number>,
  owed: number,
  loopOnly = false,
): number {
  const head = b.cells[0] ?? 0,
    succ = b.at[((b.ord[head] ?? 0) + 1) % TOTAL] ?? 0;
  if (loopOnly || b.cells.length + owed > TOTAL * SHORTCUTS_UNTIL) return succ;
  // The nearest berry along the loop: the snake never jumps past it.
  let goal = Infinity;
  for (const t of targets) {
    const d = ahead(b, head, t);
    if (d > 0 && d < goal) goal = d;
  }
  if (goal === Infinity) return succ;
  const tail = b.cells[b.cells.length - 1] ?? head,
    room = ahead(b, head, tail) - owed - MARGIN;
  const hx = head % FCOLS,
    hy = Math.floor(head / FCOLS);
  let best = succ,
    bestD = 1;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const x = hx + dx,
      y = hy + dy;
    if (x < 0 || y < 0 || x >= FCOLS || y >= FROWS) continue;
    const n = y * FCOLS + x;
    if (b.occ[n]) continue;
    const d = ahead(b, head, n);
    if (d > bestD && d <= goal && d < room) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/** Stretches the body backward from the tail along the loop, up to n cells. Returns cells added. */
export function stretchTail(b: Body, n: number, blocked: (cell: number) => boolean): number {
  let added = 0;
  while (added < n) {
    const tail = b.cells[b.cells.length - 1];
    if (tail === undefined) break;
    const back = b.at[((b.ord[tail] ?? 0) - 1 + TOTAL) % TOTAL] ?? 0;
    if (b.occ[back] || blocked(back)) break;
    b.cells.push(back);
    b.occ[back] = 1;
    added++;
  }
  return added;
}

/** Moves the head into `cell`; the tail follows unless the body is to be `keep` cells long. */
export function stepInto(b: Body, cell: number, keep: number): void {
  b.cells.unshift(cell);
  b.occ[cell] = 1;
  while (b.cells.length > keep) {
    const gone = b.cells.pop();
    if (gone !== undefined) b.occ[gone] = 0;
  }
}
