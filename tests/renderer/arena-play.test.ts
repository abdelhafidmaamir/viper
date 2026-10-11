import { beforeAll, describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS, type ArenaSettings } from '../../src/shared/arena-protocol.ts';
import { chooseNext } from '../../src/renderer/arena/ai.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { flights, likeHearts, queue, rings } from '../../src/renderer/arena/entry.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import {
  alive,
  arena,
  cellId,
  cellX,
  cellY,
  occupancy,
  placeFood,
  spawn,
  viewer,
  type Snake,
} from '../../src/renderer/arena/rules.ts';
import { game, hooks, newRound } from '../../src/renderer/feed/state.ts';

const STEP = 1 / 30;
const run = (seconds: number): void => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) advanceArena(STEP);
};

/** A new round on an empty board, seeded, past GET READY. */
function fresh(extra: Partial<ArenaSettings> = {}, seed = 7): void {
  setArenaSettings({ ...ARENA_DEFAULTS, pilot: false, wildSnakes: 0, ...extra });
  let s = seed;
  arena.rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  arena.viewers.clear();
  rings.clear();
  queue.length = 0;
  flights.length = 0;
  likeHearts.length = 0;
  game.queue = [];
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
  for (let x = from; from <= to ? x <= to : x >= to; x += from <= to ? 1 : -1)
    out.push(cellId(x, y));
  return out;
};

const col = (x: number, from: number, to: number): number[] => {
  const out: number[] = [];
  for (let y = from; y <= to; y++) out.push(cellId(x, y));
  return out;
};

/** A landed berry on `cell`, `by` its giver ('' for a plain one). */
function berry(cell: number, by: string): void {
  placeFood({
    cell,
    x: cellX(cell),
    y: cellY(cell),
    value: 1,
    t: 5,
    by,
    colour: null,
    glow: false,
    fx: 0,
    fy: 0,
  });
}

/** The cell the snake's brain picks now. */
function next(s: Snake): number {
  const { occ, reserved } = occupancy();
  return chooseNext(s, { occ, reserved, foodAt: arena.foodAt, snakes: alive() }, () => 0.5);
}

const apart = (a: number, b: number): number =>
  Math.abs(cellX(a) - cellX(b)) + Math.abs(cellY(a) - cellY(b));

describe('snake arena: a snake goes for its own berries', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  it('the calm brain takes no detour round a crowd to reach its own berries', () => {
    fresh({ superAI: false, backing: 'off' });
    const me = place('ana', row(10, 10, 3));
    // Another head three cells below the straight road: the cell ahead is crowded, not dangerous.
    place(null, col(11, 13, 17));
    berry(cellId(14, 10), 'ana');
    expect(next(me)).toBe(cellId(11, 10));
  });

  it('the calm brain does not trade its own berries for a plain one on a calmer road', () => {
    fresh({ superAI: false, backing: 'off' });
    const me = place('ana', row(10, 10, 3));
    place(null, col(11, 13, 17));
    // Its own berry lies in the other head's crowd; a plain one lies far off on a quiet road.
    const own = cellId(12, 11);
    berry(own, 'ana');
    berry(cellId(10, 3), '');
    const step = next(me);
    expect(apart(step, own)).toBeLessThan(apart(cellId(10, 10), own));
  });

  it('the calm brain flees a bigger head right there, unless it cannot die', () => {
    fresh({ superAI: false, backing: 'off' });
    const me = place('ana', row(10, 10, 3));
    const big = place(null, [...col(12, 11, 29), ...row(29, 13, 16)]);
    berry(cellId(16, 10), 'ana');
    me.mode = 'defend';
    me.target = big.id;
    expect(next(me)).toBe(cellId(10, 9));
    me.immune = true;
    expect(next(me)).toBe(cellId(11, 10));
  });

  it('the strong brain is not turned off its own berries by where a bigger head may go', () => {
    fresh({ superAI: true });
    const me = place('ana', row(10, 12, 5));
    // A bigger head three cells below, going up: its road crosses the snake's two cells ahead.
    const big = place(null, [...col(13, 13, 29), ...row(29, 14, 16)]);
    big.next = cellId(13, 12);
    berry(cellId(24, 10), 'ana');
    expect(next(me)).toBe(cellId(13, 10));
  });

  it('the strong brain does not flee with its own berries waiting once it cannot die', () => {
    fresh({ superAI: true });
    const me = place('ana', row(10, 12, 5));
    const big = place(null, [...col(14, 12, 29), ...row(29, 15, 16)]);
    big.next = cellId(14, 11);
    berry(cellId(26, 10), 'ana');
    me.immune = true;
    expect(next(me)).toBe(cellId(13, 10));
  });
});
