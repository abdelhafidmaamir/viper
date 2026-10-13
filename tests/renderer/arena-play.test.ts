import { beforeAll, describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS, type ArenaSettings } from '../../src/shared/arena-protocol.ts';
import { BERRY_STAY, chooseNext, updateMode } from '../../src/renderer/arena/ai.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { flights, likePops, queue, rings, paidQueue } from '../../src/renderer/arena/entry.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import { CATCH_UP, moveInto } from '../../src/renderer/arena/round.ts';
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
  waitingFor,
  type Food,
  type Snake,
} from '../../src/renderer/arena/rules.ts';
import { board } from '../../src/renderer/feed/control-link.ts';
import { FALL_TIME, game, hooks, newRound } from '../../src/renderer/feed/state.ts';
import { QUALIFY } from '../../src/renderer/arena/qualify.ts';

// These tests play the round as it was before the qualifying: straight to GET READY.
QUALIFY.time = 0;

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
  likePops.length = 0;
  game.queue = [];
  paidQueue.length = 0;
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

  it('the calm brain flees a bigger head right there, its own berries waiting or not', () => {
    fresh({ superAI: false, backing: 'off' });
    const me = place('ana', row(10, 10, 3));
    const big = place(null, [...col(12, 11, 29), ...row(29, 13, 16)]);
    berry(cellId(16, 10), 'ana');
    me.mode = 'defend';
    me.target = big.id;
    expect(next(me)).toBe(cellId(10, 9));
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
});

describe('snake arena: a snake never turns back onto its neck', () => {
  it('with no growth owed, its tail is not a way back when it is also its neck', () => {
    for (const superAI of [true, false]) {
      fresh({ superAI, backing: 'off' });
      const me = place('ana', [cellId(0, 0), cellId(1, 0)]);
      // The only other way, down, is another snake's body.
      place(null, [...col(0, 1, 6).reverse(), cellId(1, 1), cellId(2, 1)]);
      expect(next(me)).not.toBe(cellId(1, 0));
    }
  });

  it('boxed in ahead and on both sides, it passes over the least bad cell, never back', () => {
    fresh();
    const me = place('ana', [cellId(1, 0), cellId(2, 0)]);
    const other = place(null, [...col(0, 1, 6).reverse(), cellId(1, 1), cellId(2, 1)]);
    // Into the corner: the wall twice and another body; its neck is behind.
    moveInto(me, cellId(0, 0));
    expect(me.alive).toBe(true);
    expect(me.next).not.toBe(cellId(1, 0));
    expect(me.next).toBe(cellId(0, 1));
    moveInto(me, me.next);
    expect(me.alive && other.alive).toBe(true);
  });

  it('never reverses in a busy round, whatever the brain', () => {
    for (const superAI of [true, false]) {
      fresh({ superAI, places: 8, wildSnakes: 8 }, 5);
      let reversed = 0;
      for (let i = 0; i < 60 * 30; i++) {
        advanceArena(STEP);
        for (const s of alive())
          if (s.in && s.cells.length > 1 && s.next === s.cells[1]) reversed++;
      }
      expect(reversed).toBe(0);
    }
  });
});

describe('snake arena: a like seat that keeps liking is not the favourite prey', () => {
  it('a bigger snake goes after the passive like seat, not the one that keeps liking', () => {
    fresh({ superAI: false, backing: 'strong' });
    // Two small like seats at the same distance from a big head; a mid-size snake far away holds
    // the second place, so neither small one counts among the two biggest.
    const hunter = place('hunter', row(10, 25, 8)),
      mid = place('mid', row(25, 20, 11)),
      liking = place('liking', row(8, 23, 20)),
      passive = place('passive', row(12, 23, 20));
    mid.backing = 1;
    liking.backing = passive.backing = 0;
    liking.active = true;
    passive.active = false;
    hunter.backing = 1;
    for (let k = 0; k < 40 && hunter.mode !== 'chase'; k++)
      updateMode(hunter, [mid, liking, passive], 0.05, k * 0.05, new Map());
    expect(hunter.mode).toBe('chase');
    expect(hunter.target).toBe(passive.id);
  });
});

describe('snake arena: a leader grows less from gift berries', () => {
  it('a gift berry is a full cell, half a cell once the snake leads the second by a fifth', () => {
    fresh();
    const lead = place('lead', row(5, 22, 3)),
      other = place('other', row(20, 22, 7));
    // 20 cells against 16: a lead of a quarter.
    const eat = (s: Snake, by: string): number => {
      const before = s.grow,
        cell = cellId(cellX(s.cells[0] ?? 0) + 1, cellY(s.cells[0] ?? 0));
      berry(cell, by);
      const f = arena.foodAt.get(cell);
      if (f) f.t = FALL_TIME + BERRY_STAY + 0.1;
      moveInto(s, cell);
      return s.grow - before;
    };
    expect(lead.len / other.len).toBeGreaterThan(1.2);
    expect(eat(lead, 'lead')).toBe(CATCH_UP.slow);
    expect(eat(lead, '')).toBe(1);
    expect(eat(other, 'other')).toBe(1);
  });
});

describe('snake arena: a berry stays on the board half a second', () => {
  it('a head crossing a berry in its first half second on the board leaves it there', () => {
    fresh();
    const me = place('ana', row(5, 5, 3));
    const young = cellId(6, 5),
      old = cellId(7, 5);
    berry(young, '');
    berry(old, '');
    const y = arena.foodAt.get(young),
      o = arena.foodAt.get(old);
    if (!y || !o) throw new Error('no berries');
    y.t = FALL_TIME + BERRY_STAY - 0.1;
    o.t = FALL_TIME + BERRY_STAY;
    moveInto(me, young);
    moveInto(me, old);
    expect(arena.foodAt.get(young)).toBe(y);
    expect(arena.foodAt.has(old)).toBe(false);
  });

  it('gift berries are seen half a second at least, then eaten, by every brain', () => {
    for (const brain of [{ superAI: true }, { superAI: false, backing: 'off' as const }])
      for (const seed of [3, 11]) {
        fresh({ ...brain, wildSnakes: 3 }, seed);
        place('gina', row(20, 10, 3));
        run(3);
        board.gift('gina', undefined, 10, true);
        const seen: number[] = [],
          lying = new Map<Food, number>();
        for (let i = 0; i < 14 / STEP; i++) {
          advanceArena(STEP);
          for (const [f, t] of lying)
            if (!arena.food.includes(f)) {
              if (alive().some((s) => s.cells[0] === f.cell)) seen.push(t + STEP);
              lying.delete(f);
            }
          for (const f of arena.food) if (f.t >= FALL_TIME) lying.set(f, f.t - FALL_TIME);
        }
        expect(seen.length).toBeGreaterThan(0);
        expect(Math.min(...seen)).toBeGreaterThanOrEqual(BERRY_STAY - 1e-6);
        expect(arena.food.filter((f) => f.by === 'gina')).toHaveLength(0);
        expect(waitingFor('gina')).toBe(0);
      }
  });
});

describe('snake arena: berries wait for the countdown', () => {
  it('no berry on the board before the countdown ends, then they pour', () => {
    fresh({ plainEvery: 2 });
    // A paid berry left on the board does not carry over: its giver gets a seat instead.
    place('lia', row(12, 10, 3));
    berry(cellId(20, 20), 'lia');
    newRound();
    expect(game.ready).toBe(0);
    place('gina', row(20, 10, 3));
    board.gift('gina', undefined, 10, true);
    let most = 0;
    while (game.ready >= 0) {
      advanceArena(STEP);
      if (game.ready >= 0) most = Math.max(most, arena.food.length);
    }
    expect(most).toBe(0);
    run(3);
    expect(waitingFor('gina')).toBeLessThan(10);
  });
});
