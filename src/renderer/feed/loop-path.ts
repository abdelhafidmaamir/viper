// The loop: one closed path that visits every cell of the board exactly once. The snake only ever
// follows it, so it can never bite itself; the board simply fills up.
//
// Built the classic way: a random spanning tree on the half-size grid (every tree node is a 2x2
// block of cells), then the path walks around the tree like a hand on a maze wall. A tree that
// prefers going straight gives long corridors and the spiral blocks the mode is known for.

export interface Cell {
  x: number;
  y: number;
}

type Rand = () => number;

const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
] as const;

/**
 * Spanning tree on a w x h grid, as edges [from, to] between node indices. The grid is cut into
 * blocks (the original's quadrants); each block grows its own spiral-leaning tree, then one edge
 * per neighbouring block ties them together.
 */
function spanningTree(w: number, h: number, rand: Rand): [number, number][] {
  const bx = 2,
    by = h >= 9 && rand() < 0.5 ? 3 : 2;
  const block = (x: number, y: number): number =>
    Math.min(by - 1, Math.floor((y * by) / h)) * bx + Math.min(bx - 1, Math.floor((x * bx) / w));
  const seen = new Uint8Array(w * h),
    edges: [number, number][] = [];
  for (let b = 0; b < bx * by; b++) {
    const members: number[] = [];
    for (let i = 0; i < w * h; i++) if (block(i % w, Math.floor(i / w)) === b) members.push(i);
    const start = members[Math.floor(rand() * members.length)] ?? 0;
    const hand = rand() < 0.5 ? 1 : 3;
    const stack: { node: number; dir: number }[] = [{ node: start, dir: Math.floor(rand() * 4) }];
    seen[start] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (!top) break;
      const x = top.node % w,
        y = Math.floor(top.node / w);
      // Straight ahead first, then always the same hand: that is what curls into spirals.
      const order =
        rand() < 0.8
          ? [top.dir, (top.dir + hand) % 4, (top.dir + 4 - hand) % 4, (top.dir + 2) % 4]
          : [(top.dir + hand) % 4, top.dir, (top.dir + 4 - hand) % 4, (top.dir + 2) % 4];
      let moved = false;
      for (const d of order) {
        const dir = DIRS[d];
        if (!dir) continue;
        const nx = x + dir.x,
          ny = y + dir.y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || block(nx, ny) !== b) continue;
        const next = ny * w + nx;
        if (seen[next]) continue;
        seen[next] = 1;
        edges.push([top.node, next]);
        stack.push({ node: next, dir: d });
        moved = true;
        break;
      }
      if (!moved) stack.pop();
    }
  }
  // Tie the blocks: along each row of blocks, and down the first column (a tree of blocks).
  const bridge = (b1: number, b2: number): void => {
    const pairs: [number, number][] = [];
    for (let i = 0; i < w * h; i++) {
      const x = i % w,
        y = Math.floor(i / w);
      if (block(x, y) !== b1) continue;
      for (const dir of DIRS) {
        const nx = x + dir.x,
          ny = y + dir.y;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && block(nx, ny) === b2)
          pairs.push([i, ny * w + nx]);
      }
    }
    const pick = pairs[Math.floor(rand() * pairs.length)];
    if (pick) edges.push(pick);
  };
  for (let r = 0; r < by; r++) for (let q = 0; q + 1 < bx; q++) bridge(r * bx + q, r * bx + q + 1);
  for (let r = 0; r + 1 < by; r++) bridge(r * bx, (r + 1) * bx);
  return edges;
}

/** A closed path through every cell of a cols x rows board (both even), in walking order. */
export function buildLoop(cols: number, rows: number, rand: Rand = Math.random): Cell[] {
  const hw = cols / 2,
    hh = rows / 2;
  const key = (x: number, y: number): number => y * cols + x;
  const links = new Map<number, Set<number>>();
  const link = (a: number, b: number, on: boolean): void => {
    for (const [p, q] of [
      [a, b],
      [b, a],
    ] as const) {
      let s = links.get(p);
      if (!s) links.set(p, (s = new Set()));
      if (on) s.add(q);
      else s.delete(q);
    }
  };
  // Every block starts as its own little square loop.
  for (let j = 0; j < hh; j++)
    for (let i = 0; i < hw; i++) {
      const a = key(2 * i, 2 * j),
        b = key(2 * i + 1, 2 * j),
        c = key(2 * i + 1, 2 * j + 1),
        d = key(2 * i, 2 * j + 1);
      link(a, b, true);
      link(b, c, true);
      link(c, d, true);
      link(d, a, true);
    }
  // Every tree edge opens the wall between two blocks and joins their loops into one.
  for (const [p, q] of spanningTree(hw, hh, rand)) {
    const lo = Math.min(p, q),
      hi = Math.max(p, q);
    const i = lo % hw,
      j = Math.floor(lo / hw);
    if (hi - lo === 1) {
      const x = 2 * i + 1;
      link(key(x, 2 * j), key(x, 2 * j + 1), false);
      link(key(x + 1, 2 * j), key(x + 1, 2 * j + 1), false);
      link(key(x, 2 * j), key(x + 1, 2 * j), true);
      link(key(x, 2 * j + 1), key(x + 1, 2 * j + 1), true);
    } else {
      const y = 2 * j + 1;
      link(key(2 * i, y), key(2 * i + 1, y), false);
      link(key(2 * i, y + 1), key(2 * i + 1, y + 1), false);
      link(key(2 * i, y), key(2 * i, y + 1), true);
      link(key(2 * i + 1, y), key(2 * i + 1, y + 1), true);
    }
  }
  // Walk it once.
  const path: Cell[] = [];
  let prev = -1,
    cur = 0;
  for (let n = 0; n < cols * rows; n++) {
    path.push({ x: cur % cols, y: Math.floor(cur / cols) });
    const next = [...(links.get(cur) ?? [])].find((v) => v !== prev);
    if (next === undefined) break;
    prev = cur;
    cur = next;
  }
  return path;
}
