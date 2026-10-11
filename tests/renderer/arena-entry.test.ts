import { beforeAll, describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS, type ArenaSettings } from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { setAudience, tickAudience } from '../../src/renderer/arena/audience.ts';
import {
  ENTRY,
  PILOT,
  arenaLife,
  arenaLike,
  flights,
  gifters,
  likeHearts,
  queue,
  queueOrder,
  rings,
} from '../../src/renderer/arena/entry.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import {
  alive,
  arena,
  cellId,
  cellX,
  cellY,
  kill,
  leave,
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

function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** A new round on an empty board, seeded, past GET READY. */
function fresh(extra: Partial<ArenaSettings> = {}, seed = 7): void {
  setArenaSettings({ ...ARENA_DEFAULTS, pilot: false, wildSnakes: 0, ...extra });
  arena.rand = seeded(seed);
  arena.viewers.clear();
  rings.clear();
  queue.length = 0;
  gifters.length = 0;
  flights.length = 0;
  likeHearts.length = 0;
  game.queue = [];
  newRound();
  run(4);
}

const give = (nickname: string, berries: number): void => {
  board.gift(nickname, undefined, berries, true);
};

/** A snake already out of its egg, lying on `cells`, head first; immune so nothing kills it. */
function place(name: string | null, cells: readonly number[]): Snake {
  const s = spawn(name ? viewer(name) : null);
  if (!s) throw new Error('no place for a snake');
  const head = cells[0] ?? 0;
  s.egg = null;
  s.in = true;
  s.safe = 0;
  s.immune = true;
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

/** Four snakes on a board of four places: two viewers', a wild one and the pilot. */
function fullBoard(): Snake[] {
  fresh({ places: 4 });
  return [
    place('ann', row(3, 12, 4)),
    place('bob', row(10, 12, 4)),
    place(null, row(17, 12, 4)),
    place(PILOT.key, row(24, 12, 4)),
  ];
}

describe('snake arena: a snake leaves the board only by dying', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  it('a gift on a full board puts nobody out: the gifter waits NEXT, ring full, berries in the flower', () => {
    const four = fullBoard();
    give('gus', 10);
    run(1);
    expect(four.every((s) => s.alive)).toBe(true);
    expect(alive()).toHaveLength(4);
    expect(snakeOf('gus')).toBeUndefined();
    expect(rings.get('gus')).toBeGreaterThanOrEqual(ENTRY.likesNeeded);
    expect(queueOrder()[0]).toBe('gus');
    expect(waitingFor('gus')).toBe(10);
  });

  it('the waiting gifter goes in at the next death, its picture flying, and its berries pour', () => {
    const [ann] = fullBoard();
    give('gus', 10);
    run(1);
    if (!ann) throw new Error('no snake');
    ann.immune = false;
    kill(ann, null, 'headon');
    // The death plays: the body pops, it is not simply gone.
    expect(arena.dying.some((d) => d.s === ann)).toBe(true);
    run(STEP * 2);
    const gus = snakeOf('gus');
    expect(gus?.egg).toBeTruthy();
    expect(flights.some((f) => f.nickname === 'gus')).toBe(true);
    run(12);
    expect(waitingFor('gus')).toBe(0);
    expect(gus?.immune).toBe(true);
  });

  it('several gifters on a full board: first come, first in', () => {
    const [ann, bob] = fullBoard();
    give('first', 5);
    run(0.3);
    give('second', 5);
    run(0.3);
    for (let k = 0; k < 4; k++) queueOrder();
    expect(queueOrder().slice(0, 2)).toEqual(['first', 'second']);
    if (!ann || !bob) throw new Error('no snake');
    ann.immune = false;
    kill(ann, null, 'headon');
    run(STEP * 2);
    expect(snakeOf('first')).toBeDefined();
    expect(snakeOf('second')).toBeUndefined();
    bob.immune = false;
    kill(bob, null, 'headon');
    run(STEP * 2);
    expect(snakeOf('second')).toBeDefined();
  });

  it('a gifter goes before a full ring of likes, and takes a spot when every spot is held', () => {
    fullBoard();
    for (const n of ['q1', 'q2', 'q3']) arenaLike(n, undefined, 1);
    arenaLike('max', undefined, ENTRY.likesNeeded * 2);
    run(0.3);
    expect(queue.every((w) => w !== null)).toBe(true);
    give('gus', 1);
    run(0.3);
    expect(queueOrder()).toContain('gus');
    expect(queueOrder()[0]).toBe('gus');
    // The animal that made way keeps its likes.
    expect(rings.get('max')).toBe(ENTRY.likesNeeded * 2);
  });

  it('a life gift on a full board also waits NEXT, its life kept for its snake', () => {
    fullBoard();
    arenaLife('liv', undefined, 1);
    run(0.5);
    expect(alive()).toHaveLength(4);
    expect(queueOrder()[0]).toBe('liv');
    expect(arena.viewers.get('liv')?.lives).toBe(1);
  });

  it('no wild snake takes a place while a gifter waits for it', () => {
    fresh({ places: 4, wildSnakes: 4 });
    for (let k = 0; k < 900 && alive().length < 4; k++) advanceArena(STEP);
    const wild = alive();
    expect(wild.filter((s) => s.wild)).toHaveLength(4);
    for (const s of wild) s.immune = true;
    for (const n of ['q1', 'q2', 'q3', 'q4']) arenaLike(n, undefined, 1);
    run(0.2);
    // q2 to q4 keep liking; q1 goes quiet and its spot frees, not yet free to take again.
    for (let k = 0; k < 600 && queue.every((w) => w !== null); k++) {
      if (k % 15 === 0) for (const n of ['q2', 'q3', 'q4']) arenaLike(n, undefined, 1);
      advanceArena(STEP);
    }
    expect(queue.some((w) => w === null)).toBe(true);
    give('gus', 3);
    expect(queueOrder()).not.toContain('gus');
    const first = wild[0];
    if (!first) throw new Error('no snake');
    first.immune = false;
    kill(first, null, 'headon');
    run(0.3);
    expect(alive().filter((s) => s.wild)).toHaveLength(3);
    expect(snakeOf('gus')).toBeUndefined();
    run(1);
    expect(snakeOf('gus')).toBeDefined();
    expect(alive().filter((s) => s.wild)).toHaveLength(3);
  });

  it('a busy live: every snake that goes off the board dies on screen, no paid berry is left without its snake', () => {
    fresh({ places: 4, wildSnakes: 2, pilot: true, lifeOn: true, roundLength: 60 }, 13);
    const rand = seeded(5);
    setAudience(100, rand);
    let was = new Set(alive()),
      round = arena.round,
      silent = 0,
      orphan = 0,
      deaths = 0;
    for (let i = 0; i < Math.round(150 / STEP); i++) {
      // Now and then a snake dies as a crash would kill it, whatever protects it.
      const live = alive(),
        victim = live[i % Math.max(1, live.length)];
      if (i % 90 === 45 && victim) kill(victim, null, 'headon');
      tickAudience(
        STEP,
        {
          like: (who, n, avatar) => {
            board.like(who, avatar, n);
          },
          gift: (who, coins, avatar) => {
            if (coins === 30) arenaLife(who, avatar, 1);
            else board.gift(who, avatar, Math.min(coins, 30), true);
          },
        },
        rand,
      );
      advanceArena(STEP);
      if (arena.round === round)
        for (const s of was)
          if (!s.alive) {
            deaths++;
            if (!arena.dying.some((d) => d.s === s)) silent++;
          }
      round = arena.round;
      was = new Set(alive());
      for (const f of arena.food) if (f.by !== '' && !snakeOf(f.by)) orphan++;
    }
    expect(deaths).toBeGreaterThan(0);
    expect(silent).toBe(0);
    expect(orphan).toBe(0);
  });

  it('a snake taken off by a switch hands its paid berries back to the flower, as a death does', () => {
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
    leave(s);
    expect(arena.food.filter((f) => f.by === 'dan')).toHaveLength(0);
    expect(waitingFor('dan')).toBe(1);
  });
});
