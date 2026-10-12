import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ARENA_DEFAULTS, type ArenaSettings } from '../../src/shared/arena-protocol.ts';
import { setCtx } from '../../src/renderer/engine/canvas.ts';
import { W } from '../../src/renderer/engine/layout.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import {
  FLIGHT,
  arenaLife,
  flights,
  likePops,
  queue,
  rings,
  nextSeats,
} from '../../src/renderer/arena/entry.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import {
  HEART,
  beachHeart,
  boardHeart,
  paintCrabHearts,
  paintSnakeHearts,
  shownLives,
} from '../../src/renderer/arena/lives.ts';
import {
  EMERGE,
  arena,
  cellId,
  cellX,
  cellY,
  kill,
  snakeOf,
  spawn,
  toPx,
  viewer,
  type Snake,
} from '../../src/renderer/arena/rules.ts';
import { game, hooks, newRound } from '../../src/renderer/feed/state.ts';
import { QUALIFY } from '../../src/renderer/arena/qualify.ts';

// These tests play the round as it was before the qualifying: straight to GET READY.
QUALIFY.time = 0;

const STEP = 1 / 30;
const run = (seconds: number): void => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) advanceArena(STEP);
};

/** A new round on an empty board, seeded, past GET READY, the life gift on. */
function fresh(extra: Partial<ArenaSettings> = {}, seed = 7): void {
  setArenaSettings({ ...ARENA_DEFAULTS, pilot: false, wildSnakes: 0, lifeOn: true, ...extra });
  let s = seed;
  arena.rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  arena.viewers.clear();
  rings.clear();
  queue.length = 0;
  flights.length = 0;
  likePops.length = 0;
  game.queue = [];
  nextSeats.length = 0;
  newRound();
  run(4);
}

/** A snake already out of its egg, lying on `cells`, head first. */
function place(name: string | null, cells: readonly number[]): Snake {
  const s = spawn(name ? viewer(name) : null);
  if (!s) throw new Error('no place for a snake');
  const head = cells[0] ?? 0;
  s.egg = null;
  s.in = true;
  s.safe = 0;
  s.body.cells.length = 0;
  s.body.cells.push(...cells);
  s.len = cells.length;
  s.grow = 0;
  s.next = head;
  s.x = cellX(head);
  s.y = cellY(head);
  return s;
}

const row = (y: number, from: number, to: number): number[] => {
  const out: number[] = [];
  for (let x = from; x >= to; x--) out.push(cellId(x, y));
  return out;
};

/** Counts the hearts a painter stamps, on a stand-in canvas. */
function heartsPainted(paint: () => void): number {
  let n = 0;
  const fake = {
    drawImage: () => {
      n++;
    },
    save: () => undefined,
    restore: () => undefined,
  };
  const was = setCtx(fake as unknown as CanvasRenderingContext2D);
  try {
    paint();
  } finally {
    setCtx(was);
  }
  return n;
}

describe('snake arena: lives shown on the snake and its crab', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
    // The heart sprite is drawn once on a canvas of its own.
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => null }),
    });
  });

  it('a life gift adds its heart by the picture at once, the flower stays out of it', () => {
    fresh();
    const s = place('liv', row(5, 22, 3));
    arenaLife('liv', undefined, 1);
    expect(s.lives).toBe(1);
    expect(shownLives('liv')).toBe(1);
    run(STEP * 2);
    expect(game.pour?.nickname).not.toBe('liv');
    expect(shownLives('liv')).toBe(1);
  });

  it('a life used: a heart breaks and the picture flies from where it died to the new egg', () => {
    fresh();
    const s = place('liv', row(5, 22, 3));
    arenaLife('liv', undefined, 2);
    run(1.5);
    expect(shownLives('liv')).toBe(2);
    const lenAtDeath = s.len;
    kill(s, null, 'headon');
    // The body pops as at a death.
    const dying = arena.dying.find((d) => d.s === s);
    expect(dying?.lifeUsed).toBe(true);
    const back = snakeOf('liv'),
      flight = flights.find((f) => f.nickname === 'liv'),
      egg = back?.egg;
    expect(back?.lives).toBe(1);
    expect(back?.hatchLen).toBe(Math.max(1, Math.round(lenAtDeath * 0.5)));
    expect(shownLives('liv')).toBe(1);
    if (!egg || !flight || !dying) throw new Error('no flight to the egg');
    const to = toPx(cellX(egg.cell), cellY(egg.cell));
    expect(flight).toMatchObject({ x: dying.from.x, y: dying.from.y, tx: to.x, ty: to.y });
    // The egg waits for the picture to land.
    expect(egg.t).toBeLessThan(0);
    run(FLIGHT + EMERGE + 0.3);
    expect(snakeOf('liv')?.in).toBe(true);
  });

  it('the snake and its crab show the same hearts, as many as its lives', () => {
    fresh();
    const s = place('liv', row(5, 22, 3));
    arenaLife('liv', undefined, 3);
    const face = { x: 300, y: 1700, r: 40 };
    // While the hearts are in the air, both show the same count.
    run(0.9);
    expect(
      heartsPainted(() => {
        paintSnakeHearts(s, 500, 600, 40);
      }),
    ).toBe(
      heartsPainted(() => {
        paintCrabHearts('liv', face);
      }),
    );
    run(1.5);
    expect(
      heartsPainted(() => {
        paintSnakeHearts(s, 500, 600, 40);
      }),
    ).toBe(3);
    expect(
      heartsPainted(() => {
        paintCrabHearts('liv', face);
      }),
    ).toBe(3);
    kill(s, null, 'headon');
    const back = snakeOf('liv');
    if (!back) throw new Error('no snake back');
    expect(
      heartsPainted(() => {
        paintSnakeHearts(back, 500, 600, 40);
      }),
    ).toBe(2);
    expect(
      heartsPainted(() => {
        paintCrabHearts('liv', face);
      }),
    ).toBe(2);
  });

  it('a viewer waiting on the beach shows the lives kept for their snake', () => {
    fresh({ places: 4 });
    for (let k = 0; k < 4; k++) place(`p${String(k)}`, row(3 + 6 * k, 20, 6)).shield = 99;
    arenaLife('wai', undefined, 2);
    run(1.5);
    expect(snakeOf('wai')).toBeUndefined();
    expect(arena.viewers.get('wai')?.lives).toBe(2);
    expect(
      heartsPainted(() => {
        paintCrabHearts('wai', { x: 300, y: 1700, r: 40 });
      }),
    ).toBe(2);
  });

  it('hearts are big enough to read and stand clear of the picture', () => {
    expect(HEART.board).toBeGreaterThanOrEqual(30);
    expect(HEART.board).toBeLessThanOrEqual(34);
    const r = 40;
    for (let i = 0; i < 5; i++) {
      const p = boardHeart(540, 900, r, i, 5);
      expect(Math.hypot(p.x - 540, p.y - 900)).toBeGreaterThanOrEqual(r + HEART.board / 2);
      const q = beachHeart({ x: 300, y: 1700, r }, i, 5);
      expect(Math.hypot(q.x - 300, q.y - 1700)).toBeGreaterThanOrEqual((r * 28) / 32 + 12);
    }
    // Near the right edge the row goes out from the left side.
    expect(boardHeart(W - 60, 900, r, 0, 5).x).toBeLessThan(W - 60);
  });
});
