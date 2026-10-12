import { beforeAll, describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS, type ArenaSettings } from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import {
  arenaLife,
  flights,
  likePops,
  queue,
  rings,
  nextSeats,
} from '../../src/renderer/arena/entry.ts';
import { moveInto } from '../../src/renderer/arena/round.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import {
  DEATH_TIME,
  arena,
  cellId,
  cellX,
  cellY,
  kill,
  placeFood,
  snakeOf,
  spawn,
  viewer,
  waitingFor,
  type Snake,
} from '../../src/renderer/arena/rules.ts';
import { board } from '../../src/renderer/feed/control-link.ts';
import { game, hooks, newRound } from '../../src/renderer/feed/state.ts';
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
  nextSeats.length = 0;
  newRound();
  run(4);
}

/** A gift as the live sends it: the round keeps it, the board gets it. */
function give(nickname: string, berries: number): void {
  board.gift(nickname, undefined, berries, true);
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

describe('snake arena', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  it('lays an egg a safe distance from every snake', () => {
    fresh({ places: 8 });
    const bodies = [place(null, row(10, 5, 20)), place(null, row(20, 25, 10))];
    for (let k = 0; k < 6; k++) {
      const s = spawn(null);
      if (!s?.egg) continue;
      const egg = s.egg.cell;
      for (const b of bodies)
        for (const c of b.cells)
          expect(
            Math.abs(cellX(c) - cellX(egg)) + Math.abs(cellY(c) - cellY(egg)),
          ).toBeGreaterThanOrEqual(3);
      s.alive = false;
    }
  });

  it('pours a gift from the flower to its snake, which eats it all', () => {
    fresh();
    const s = place('gina', row(20, 10, 3));
    give('gina', 10);
    run(10);
    expect(arena.food.filter((f) => f.by === 'gina')).toHaveLength(0);
    expect(waitingFor('gina')).toBe(0);
    expect(s.len).toBeGreaterThan(ARENA_DEFAULTS.places);
  });

  it('every brain goes for its own berries and eats them all', () => {
    for (const brain of [
      { superAI: true },
      { superAI: false, backing: 'off' as const },
      { superAI: false, backing: 'strong' as const },
    ])
      for (const seed of [3, 11, 29]) {
        fresh({ ...brain, wildSnakes: 3 }, seed);
        place('gina', row(20, 10, 3));
        run(3);
        give('gina', 10);
        run(14);
        expect(arena.food.filter((f) => f.by === 'gina')).toHaveLength(0);
        expect(waitingFor('gina')).toBe(0);
      }
  });

  it('a head into a body dies, a shielded one turns away; nothing else is unbeatable', () => {
    fresh();
    const wall = place('wall', row(15, 12, 3)),
      hit = place('hit', [cellId(8, 13), cellId(8, 12)]);
    moveInto(hit, cellId(8, 14));
    moveInto(hit, cellId(8, 15));
    expect(hit.alive).toBe(false);
    const safe = place('safe', [cellId(6, 13), cellId(6, 12)]);
    safe.shield = 5;
    moveInto(safe, cellId(6, 14));
    moveInto(safe, cellId(6, 15));
    expect(safe.alive).toBe(true);
    expect(wall.alive).toBe(true);
    // A snake whose giver's berries it ate is no longer spared.
    const fed = place('fed', [cellId(4, 13), cellId(4, 12)]);
    fed.eaten = 10;
    moveInto(fed, cellId(4, 14));
    moveInto(fed, cellId(4, 15));
    expect(fed.alive).toBe(false);
  });

  it('never dies by its own body: boxed in by itself, it passes over itself', () => {
    fresh();
    // A coil in the corner: every cell round the head is its own body, and it owes growth.
    const s = place('coil', [cellId(0, 0), cellId(0, 1), cellId(1, 1), cellId(1, 0), cellId(2, 0)]);
    s.grow = 4;
    run(2);
    expect(s.alive).toBe(true);
    expect(arena.deaths.trapped).toBe(0);
  });

  it("a death leaves nothing to eat; the dead snake's own berries go back to the flower", () => {
    fresh();
    const s = place('dan', row(12, 10, 2));
    placeFood({
      cell: cellId(20, 20),
      x: 20,
      y: 20,
      value: 1,
      t: 1,
      by: 'dan',
      colour: s.colour,
      glow: false,
      fx: 0,
      fy: 0,
    });
    placeFood({
      cell: cellId(21, 20),
      x: 21,
      y: 20,
      value: 1,
      t: 1,
      by: '',
      colour: null,
      glow: false,
      fx: 0,
      fy: 0,
    });
    const before = arena.food.length;
    kill(s, null, 'headon');
    // At once: its berry is off the board and back in the flower, nothing new to eat.
    expect(arena.food.filter((f) => f.by === 'dan')).toHaveLength(0);
    expect(arena.food.length).toBe(before - 1);
    expect(waitingFor('dan')).toBe(1);
    run(DEATH_TIME + 0.5);
    expect(arena.dying).toHaveLength(0);
  });

  it('ends at 0:00 straight into the end screen', () => {
    fresh({ roundLength: 60 });
    while (arena.time < 59.9) advanceArena(STEP);
    expect(game.full).toBeLessThan(0);
    run(0.2);
    expect(game.full).toBeGreaterThanOrEqual(0);
    expect(game.full).toBeLessThan(0.3);
  });

  it('drips plain berries rarely, a few at a time, never many lying', () => {
    fresh({ plainEvery: 25, plainAmount: 1 });
    let most = 0;
    for (let k = 0; k < 100; k++) {
      run(1);
      most = Math.max(most, arena.food.filter((f) => f.by === '').length);
    }
    expect(most).toBeGreaterThanOrEqual(1);
    expect(most).toBeLessThanOrEqual(4);
  });

  it('a life gift saves the snake once: it comes back from an egg, same colour, half as long', () => {
    fresh({ lifeOn: true, lifePrice: 30 });
    const s = place('liv', row(5, 22, 3)),
      colour = s.colour;
    arenaLife('liv', undefined, 1);
    expect(s.lives).toBe(1);
    kill(s, null, 'headon');
    const back = snakeOf('liv');
    expect(back).toBeDefined();
    expect(back).not.toBe(s);
    expect(back?.colour).toBe(colour);
    expect(back?.hatchLen).toBe(10);
    expect(back?.lives).toBe(0);
  });
});
