// Canvas preview animations for the launcher cards.

const GOLD = '#F2C57C';
const SHADOW = '#b4d4de';
const BERRY = '#D64A42'; // rose red, visible on dark grid

const GRID_COLOR = 'rgba(255,255,255,0.04)';
const BG = '#0a0e0c';

const MAX_DPR = 2;

function dpr(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const d = dpr();
  const w = Math.round(rect.width * d);
  const h = Math.round(rect.height * d);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  cw: number,
  ch: number,
): void {
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 0; c <= cols; c++) {
    ctx.moveTo(c * cw, 0);
    ctx.lineTo(c * cw, rows * ch);
  }
  for (let r = 0; r <= rows; r++) {
    ctx.moveTo(0, r * ch);
    ctx.lineTo(cols * cw, r * ch);
  }
  ctx.stroke();
}

function drawSnake(
  ctx: CanvasRenderingContext2D,
  segments: readonly { readonly x: number; readonly y: number }[],
  color: string,
  cw: number,
  ch: number,
): void {
  if (segments.length === 0) return;
  const first = segments[0];
  if (!first) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.min(cw, ch) * 0.55;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo((first.x + 0.5) * cw, (first.y + 0.5) * ch);
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    ctx.lineTo((seg.x + 0.5) * cw, (seg.y + 0.5) * ch);
  }
  ctx.stroke();
  // Draw a round head cap slightly larger
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc((first.x + 0.5) * cw, (first.y + 0.5) * ch, ctx.lineWidth * 0.55, 0, Math.PI * 2);
  ctx.fill();
}

function drawBerry(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cw: number,
  ch: number,
): void {
  const r = Math.min(cw, ch) * 0.28;
  ctx.fillStyle = BERRY;
  ctx.beginPath();
  ctx.arc((x + 0.5) * cw, (y + 0.5) * ch, r, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Duel preview
// ---------------------------------------------------------------------------

interface Seg {
  x: number;
  y: number;
}

interface Dir {
  dx: number;
  dy: number;
}

interface DuelState {
  gold: Seg[];
  shadow: Seg[];
  goldDir: Dir;
  shadowDir: Dir;
  berries: Seg[];
  tickAcc: number;
}

const COLS = 18;
const ROWS = 11;

function occupied(state: DuelState, x: number, y: number): boolean {
  return (
    state.gold.some((s) => s.x === x && s.y === y) ||
    state.shadow.some((s) => s.x === x && s.y === y)
  );
}

function freeCells(state: DuelState): Seg[] {
  const cells: Seg[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!occupied(state, c, r) && !state.berries.some((b) => b.x === c && b.y === r)) {
        cells.push({ x: c, y: r });
      }
    }
  }
  return cells;
}

function turnRight(dir: Dir): Dir {
  return { dx: -dir.dy, dy: dir.dx };
}

function turnLeft(dir: Dir): Dir {
  return { dx: dir.dy, dy: -dir.dx };
}

function advanceSnake(
  snake: Seg[],
  dir: Dir,
  berries: Seg[],
  other: Seg[],
): { snake: Seg[]; dir: Dir; newHead: Seg } {
  let newDir = dir;
  const head = snake[0];
  if (!head) return { snake, dir, newHead: { x: 0, y: 0 } };
  // Try forward; if blocked turn right then left
  const candidates = [dir, turnRight(dir), turnLeft(dir)];
  for (const d of candidates) {
    const nx = (head.x + d.dx + COLS) % COLS;
    const ny = (head.y + d.dy + ROWS) % ROWS;
    const blocked =
      snake.some((s) => s.x === nx && s.y === ny) || other.some((s) => s.x === nx && s.y === ny);
    if (!blocked) {
      newDir = d;
      break;
    }
  }
  const nx = (head.x + newDir.dx + COLS) % COLS;
  const ny = (head.y + newDir.dy + ROWS) % ROWS;
  const newHead: Seg = { x: nx, y: ny };
  const ate = berries.some((b) => b.x === nx && b.y === ny);
  const newSnake = [newHead, ...snake.slice(0, ate ? snake.length : snake.length - 1)];
  return { snake: newSnake, dir: newDir, newHead };
}

function initDuelState(): DuelState {
  return {
    gold: [
      { x: 3, y: 5 },
      { x: 2, y: 5 },
      { x: 1, y: 5 },
    ],
    shadow: [
      { x: 14, y: 5 },
      { x: 15, y: 5 },
      { x: 16, y: 5 },
    ],
    goldDir: { dx: 1, dy: 0 },
    shadowDir: { dx: -1, dy: 0 },
    berries: [
      { x: 7, y: 3 },
      { x: 10, y: 7 },
    ],
    tickAcc: 0,
  };
}

function tickDuel(state: DuelState): void {
  const goldRes = advanceSnake(state.gold, state.goldDir, state.berries, state.shadow);
  state.gold = goldRes.snake;
  state.goldDir = goldRes.dir;
  const goldHead = goldRes.newHead;
  let berries = state.berries.filter((b) => !(b.x === goldHead.x && b.y === goldHead.y));

  const shadowRes = advanceSnake(state.shadow, state.shadowDir, berries, state.gold);
  state.shadow = shadowRes.snake;
  state.shadowDir = shadowRes.dir;
  const shadowHead = shadowRes.newHead;
  berries = berries.filter((b) => !(b.x === shadowHead.x && b.y === shadowHead.y));
  state.berries = berries;

  // Trim snakes to max 7
  if (state.gold.length > 7) state.gold = state.gold.slice(0, 7);
  if (state.shadow.length > 7) state.shadow = state.shadow.slice(0, 7);

  // Respawn berries until 2 present
  const allCells = freeCells(state);
  while (state.berries.length < 2 && allCells.length > 0) {
    const idx = Math.floor(Math.random() * allCells.length);
    const cell = allCells.splice(idx, 1)[0];
    if (cell) state.berries.push(cell);
  }
}

export function mountDuelPreview(canvas: HTMLCanvasElement, reducedMotion: boolean): () => void {
  const ctxOrNull = canvas.getContext('2d');
  if (!ctxOrNull) return () => undefined;
  const ctx: CanvasRenderingContext2D = ctxOrNull;
  const state = initDuelState();
  let rafId = 0;
  let last = performance.now();
  const TICK_MS = 220;

  function draw(c: CanvasRenderingContext2D): void {
    resizeCanvas(canvas);
    const W = canvas.width;
    const H = canvas.height;
    const cw = W / COLS;
    const ch = H / ROWS;
    c.clearRect(0, 0, W, H);
    c.fillStyle = BG;
    c.fillRect(0, 0, W, H);
    drawGrid(c, COLS, ROWS, cw, ch);
    for (const b of state.berries) drawBerry(c, b.x, b.y, cw, ch);
    drawSnake(c, state.shadow, SHADOW, cw, ch);
    drawSnake(c, state.gold, GOLD, cw, ch);
  }

  if (reducedMotion) {
    draw(ctx);
    return () => undefined;
  }

  function loop(now: number): void {
    if (document.hidden) {
      last = now;
      rafId = requestAnimationFrame(loop);
      return;
    }
    const dt = now - last;
    state.tickAcc += dt;
    last = now;
    if (state.tickAcc >= TICK_MS) {
      state.tickAcc -= TICK_MS;
      tickDuel(state);
    }
    draw(ctx);
    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(rafId);
  };
}

// ---------------------------------------------------------------------------
// Feed the Snake preview
// ---------------------------------------------------------------------------

interface FeedState {
  snake: Seg[];
  berries: { x: number; y: number; fy: number }[];
  tickAcc: number;
  berryAcc: number;
  step: number;
}

const FEED_COLS = 18;
const FEED_ROWS = 11;

// Serpentine route: snake follows a predetermined zigzag path
function buildRoute(): Seg[] {
  const route: Seg[] = [];
  for (let r = 0; r < FEED_ROWS; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < FEED_COLS; c++) route.push({ x: c, y: r });
    } else {
      for (let c = FEED_COLS - 1; c >= 0; c--) route.push({ x: c, y: r });
    }
  }
  return route;
}

const ROUTE = buildRoute();

function initFeedState(): FeedState {
  return {
    snake: [
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ],
    berries: [],
    tickAcc: 0,
    berryAcc: 0,
    step: 2, // route index for the head
  };
}

function tickFeed(state: FeedState): void {
  // Advance head along route
  state.step = (state.step + 1) % ROUTE.length;
  const newHead = ROUTE[state.step];
  if (!newHead) return;

  // Check if ate a berry
  const ateIdx = state.berries.findIndex(
    (b) => b.x === newHead.x && Math.floor(b.fy) === newHead.y,
  );
  const ate = ateIdx >= 0;
  if (ate) state.berries.splice(ateIdx, 1);

  const newSnake = [{ ...newHead }, ...state.snake];
  const MAX_LEN = 30;
  // Grow if ate, otherwise keep same length
  if (!ate && newSnake.length > state.snake.length) {
    newSnake.length = state.snake.length;
  }

  // Reset if filled too much
  if (newSnake.length >= MAX_LEN) {
    const first = ROUTE[0];
    state.snake = first ? [{ ...first }] : [];
    state.step = 0;
    state.berries = [];
  } else {
    state.snake = newSnake;
  }
}

export function mountFeedPreview(canvas: HTMLCanvasElement, reducedMotion: boolean): () => void {
  const ctxOrNull = canvas.getContext('2d');
  if (!ctxOrNull) return () => undefined;
  const ctx: CanvasRenderingContext2D = ctxOrNull;
  const state = initFeedState();
  let rafId = 0;
  let last = performance.now();
  const TICK_MS = 180;
  const BERRY_INTERVAL = 1200;

  function spawnBerry(): void {
    const col = Math.floor(Math.random() * FEED_COLS);
    state.berries.push({ x: col, y: 0, fy: -1 });
  }

  function draw(c: CanvasRenderingContext2D): void {
    resizeCanvas(canvas);
    const W = canvas.width;
    const H = canvas.height;
    const cw = W / FEED_COLS;
    const ch = H / FEED_ROWS;
    c.clearRect(0, 0, W, H);
    c.fillStyle = BG;
    c.fillRect(0, 0, W, H);
    drawGrid(c, FEED_COLS, FEED_ROWS, cw, ch);
    // Draw falling berries
    for (const b of state.berries) {
      if (b.fy >= 0) drawBerry(c, b.x, b.fy, cw, ch);
    }
    drawSnake(c, state.snake, GOLD, cw, ch);
  }

  if (reducedMotion) {
    draw(ctx);
    return () => undefined;
  }

  function loop(now: number): void {
    if (document.hidden) {
      last = now;
      rafId = requestAnimationFrame(loop);
      return;
    }
    const dt = now - last;
    last = now;

    state.tickAcc += dt;
    if (state.tickAcc >= TICK_MS) {
      state.tickAcc -= TICK_MS;
      tickFeed(state);
    }

    state.berryAcc += dt;
    if (state.berryAcc >= BERRY_INTERVAL) {
      state.berryAcc -= BERRY_INTERVAL;
      spawnBerry();
    }

    // Animate falling berries
    for (const b of state.berries) {
      b.fy += 0.04 * dt;
    }
    // Remove berries that fell off
    state.berries = state.berries.filter((b) => b.fy < FEED_ROWS + 1);

    draw(ctx);
    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(rafId);
  };
}

// ---------------------------------------------------------------------------
// Snake Arena preview
// ---------------------------------------------------------------------------

/** Each viewer's snake gets its own colour on the board. */
const ARENA_COLORS = [GOLD, SHADOW, '#9be28a', '#f6b8c4'] as const;

interface ArenaSnake {
  segs: Seg[];
  dir: Dir;
}

function initArenaSnakes(): ArenaSnake[] {
  const starts: [number, number, Dir][] = [
    [3, 2, { dx: 1, dy: 0 }],
    [14, 8, { dx: -1, dy: 0 }],
    [8, 9, { dx: 0, dy: -1 }],
    [10, 1, { dx: 0, dy: 1 }],
  ];
  return starts.map(([x, y, dir]) => ({
    segs: [0, 1, 2].map((i) => ({ x: x - dir.dx * i, y: y - dir.dy * i })),
    dir,
  }));
}

export function mountArenaPreview(canvas: HTMLCanvasElement, reducedMotion: boolean): () => void {
  const ctxOrNull = canvas.getContext('2d');
  if (!ctxOrNull) return () => undefined;
  const ctx: CanvasRenderingContext2D = ctxOrNull;
  const snakes = initArenaSnakes();
  let berries: Seg[] = [
    { x: 6, y: 5 },
    { x: 12, y: 3 },
    { x: 4, y: 8 },
  ];
  let rafId = 0;
  let last = performance.now();
  let tickAcc = 0;
  const TICK_MS = 200;

  function tick(): void {
    snakes.forEach((snake, i) => {
      const others = snakes.filter((_, j) => j !== i).flatMap((s) => s.segs);
      const res = advanceSnake(snake.segs, snake.dir, berries, others);
      // Now and then a snake turns by itself, so the four do not run in straight lines.
      snake.dir =
        Math.random() < 0.15
          ? Math.random() < 0.5
            ? turnLeft(res.dir)
            : turnRight(res.dir)
          : res.dir;
      snake.segs = res.snake.slice(0, 6);
      berries = berries.filter((b) => !(b.x === res.newHead.x && b.y === res.newHead.y));
    });
    const taken = new Set(
      snakes.flatMap((s) => s.segs.map((p) => `${String(p.x)},${String(p.y)}`)),
    );
    while (berries.length < 3) {
      const cell = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      if (!taken.has(`${String(cell.x)},${String(cell.y)}`)) berries.push(cell);
    }
  }

  function draw(c: CanvasRenderingContext2D): void {
    resizeCanvas(canvas);
    const W = canvas.width;
    const H = canvas.height;
    const cw = W / COLS;
    const ch = H / ROWS;
    c.clearRect(0, 0, W, H);
    c.fillStyle = BG;
    c.fillRect(0, 0, W, H);
    drawGrid(c, COLS, ROWS, cw, ch);
    for (const b of berries) drawBerry(c, b.x, b.y, cw, ch);
    snakes.forEach((s, i) => {
      drawSnake(c, s.segs, ARENA_COLORS[i % ARENA_COLORS.length] ?? GOLD, cw, ch);
    });
  }

  if (reducedMotion) {
    draw(ctx);
    return () => undefined;
  }

  function loop(now: number): void {
    if (document.hidden) {
      last = now;
      rafId = requestAnimationFrame(loop);
      return;
    }
    tickAcc += now - last;
    last = now;
    if (tickAcc >= TICK_MS) {
      tickAcc -= TICK_MS;
      tick();
    }
    draw(ctx);
    rafId = requestAnimationFrame(loop);
  }

  rafId = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(rafId);
  };
}
