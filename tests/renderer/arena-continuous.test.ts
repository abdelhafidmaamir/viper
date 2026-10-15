import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS, type ArenaSettings } from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { beachCrowd, arrive } from '../../src/renderer/arena/continuous.ts';
import { BOOST, fired, paidQueue, rings } from '../../src/renderer/arena/entry.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import { qualifying } from '../../src/renderer/arena/qualify.ts';
import { moveInto } from '../../src/renderer/arena/round.ts';
import {
  TUNING,
  alive,
  arena,
  cellId,
  cellX,
  cellY,
  placeFood,
  snakeOf,
  type Snake,
} from '../../src/renderer/arena/rules.ts';
import { board } from '../../src/renderer/feed/control-link.ts';
import { drainJournal } from '../../src/renderer/feed/journal.ts';
import { game, hooks, newRound, roundHold } from '../../src/renderer/feed/state.ts';

const STEP = 1 / 30;
const run = (seconds: number): void => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) advanceArena(STEP);
};

/** A new continuous round, seeded, its eggs hatched. */
function fresh(extra: Partial<ArenaSettings> = {}, seed = 7): void {
  setArenaSettings({ ...ARENA_DEFAULTS, pilot: false, ...extra });
  let s = seed;
  arena.rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  arena.viewers.clear();
  arena.snakes = [];
  arena.line.length = 0;
  arena.arrivals.length = 0;
  rings.clear();
  fired.clear();
  game.queue = [];
  game.full = -1;
  paidQueue.length = 0;
  newRound();
  run(1);
  drainJournal(false);
}

const computer = (): Snake[] => alive().filter((s) => s.wild);
const events = (): string[] =>
  drainJournal(false)
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(';').slice(1, 2).concat(line.split(';').slice(6, 7)).join(' '));

/** Plays until `s` is out of its egg, a step at a time. */
function hatch(s: Snake): void {
  for (let i = 0; i < 200 && !s.in; i++) advanceArena(STEP);
  expect(s.in).toBe(true);
}

/** Lays `s` on a straight row ending at `head`, going right, its next cell the one after it. */
function lay(s: Snake, y: number, head: number, len = 6): void {
  s.body.cells.length = 0;
  for (let x = head; x > head - len; x--) s.body.cells.push(cellId(x, y));
  s.len = len;
  s.grow = 0;
  s.safe = 0;
  s.shield = 0;
  s.next = cellId(head + 1, y);
  s.x = cellX(cellId(head, y));
  s.y = cellY(cellId(head, y));
}

describe('snake arena: continuous play', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });
  beforeEach(() => {
    fresh();
  });

  it('a round starts at once, no qualifying and no 3, 2, 1: the places all play, the computer’s', () => {
    expect(qualifying()).toBe(false);
    expect(arena.phase).toBe('play');
    expect(game.ready).toBe(-1);
    expect(alive()).toHaveLength(6);
    expect(computer().every((s) => s.in)).toBe(true);
  });

  it('a like takes a free computer snake at once; past the places, a line', () => {
    const before = computer()[0];
    board.like('ana', undefined, 1);
    const s = snakeOf('ana');
    expect(s).toBeDefined();
    expect(s).not.toBe(before);
    expect(before?.alive).toBe(false);
    expect(s?.taken).toBe(arena.clock);
    expect(computer()).toHaveLength(5);
    expect(events()).toContain('takes a snake ana');
    for (const name of ['b1', 'b2', 'b3', 'b4', 'b5']) board.like(name, undefined, 1);
    expect(computer()).toHaveLength(0);
    board.like('late', undefined, 1);
    board.like('later', undefined, 1);
    expect(snakeOf('late')).toBeUndefined();
    expect(arena.line.map((w) => w.nickname)).toEqual(['late', 'later']);
    // A gift goes ahead of the likes.
    board.gift('rich', undefined, 1);
    expect(arena.line.map((w) => w.nickname)).toEqual(['rich', 'late', 'later']);
    expect(beachCrowd().map((c) => c.nickname)).toEqual(['rich', 'late', 'later']);
    expect(beachCrowd().every((c) => c.waiting)).toBe(true);
  });

  it('a snake taken leaves the board: an egg at its place, never on a body, and the viewer’s snake hatches at the starting length', () => {
    const big = computer()[0];
    if (!big) throw new Error('no snake');
    lay(big, 15, 20, 21);
    big.len = 30;
    const head = big.cells[0] ?? 0,
      body = [...big.cells];
    board.like('ana', undefined, 1);
    const s = snakeOf('ana');
    if (!s?.egg) throw new Error('no egg');
    expect(big.alive).toBe(false);
    expect(body).not.toContain(s.egg.cell);
    for (const o of alive()) if (o !== s) expect(o.cells).not.toContain(s.egg.cell);
    expect(
      Math.abs(cellX(s.egg.cell) - cellX(head)) + Math.abs(cellY(s.egg.cell) - cellY(head)),
    ).toBeLessThanOrEqual(3);
    expect(s.colour).toBe(big.colour);
    expect(s.in).toBe(false);
    hatch(s);
    expect(s.len + s.grow).toBeCloseTo(TUNING.startLen, 5);
  });

  it('a snake given back: the computer’s hatches at its place at the starting length', () => {
    fresh({ idleRelease: 30 });
    board.like('idle', undefined, 1);
    run(1.5);
    const mine = snakeOf('idle'),
      v = arena.viewers.get('idle');
    if (!mine || !v) throw new Error('no snake');
    mine.len = 25;
    v.acts = [arena.clock - 31];
    mine.taken = arena.clock - 31;
    const others = new Set(alive());
    run(STEP);
    expect(mine.alive).toBe(false);
    const back = alive().find((o) => !others.has(o));
    if (!back) throw new Error('no snake back');
    expect(back.wild).toBe(true);
    hatch(back);
    expect(back.len + back.grow).toBeCloseTo(TUNING.startLen, 5);
  });

  it('a snake freed goes to the first in line; a crash with no life left frees it after its egg', () => {
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) board.like(name, undefined, 1);
    board.like('next', undefined, 1);
    run(1.5);
    const a = snakeOf('a'),
      b = snakeOf('b');
    if (!a || !b) throw new Error('no snakes');
    lay(b, 10, 12);
    lay(a, 12, 4);
    a.next = cellId(10, 10);
    moveInto(a, cellId(10, 10));
    expect(a.alive).toBe(false);
    expect(events()).toContain('snake back to the computer a');
    run(4);
    expect(snakeOf('next')).toBeDefined();
    expect(arena.line).toHaveLength(0);
    expect(alive()).toHaveLength(6);
  });

  it('each gift gives a life up to "Lives at most"; a life takes a crash, the snake plays on', () => {
    fresh({ livesMax: 2 });
    board.gift('zoe', undefined, 5);
    const s = snakeOf('zoe');
    expect(s?.lives).toBe(1);
    board.gift('zoe', undefined, 5);
    board.gift('zoe', undefined, 5);
    expect(s?.lives).toBe(2);
    const other = computer()[0];
    if (!s || !other) throw new Error('no snakes');
    lay(other, 10, 12);
    lay(s, 12, 4);
    moveInto(s, cellId(10, 10));
    expect(s.alive).toBe(true);
    expect(s.lives).toBe(1);
    expect(s.safe).toBeGreaterThan(0);
    expect(s.cells[0]).not.toBe(cellId(10, 10));
    expect(arena.breaks).toHaveLength(1);
    expect(events()).toContain('life used zoe');
  });

  it("a gift's berries are the giver's alone: another snake's head leaves them in place", () => {
    board.like('ana', undefined, 1);
    const s = snakeOf('ana'),
      other = computer()[0];
    if (!s || !other) throw new Error('no snakes');
    lay(other, 8, 10);
    const at = cellId(11, 8);
    placeFood({
      cell: at,
      x: 11,
      y: 8,
      value: 1,
      t: 9,
      by: 'ana',
      colour: s.colour,
      glow: false,
      fx: 0,
      fy: 0,
    });
    moveInto(other, at);
    expect(arena.foodAt.get(at)?.by).toBe('ana');
    lay(s, 20, 10);
    const mine = cellId(11, 20);
    placeFood({
      cell: mine,
      x: 11,
      y: 20,
      value: 1,
      t: 9,
      by: 'ana',
      colour: s.colour,
      glow: false,
      fx: 0,
      fy: 0,
    });
    moveInto(s, mine);
    expect(arena.foodAt.has(mine)).toBe(false);
  });

  it('a full likes ring gives 2 s of speed and no length', () => {
    board.like('ana', undefined, 1);
    const s = snakeOf('ana');
    if (!s) throw new Error('no snake');
    const grow = s.grow;
    board.like('ana', undefined, BOOST.likes);
    expect(s.boost).toBeCloseTo(2, 5);
    expect(s.grow).toBe(grow);
  });

  it('a player with no life left who stops liking gives the snake back; with a life, never', () => {
    fresh({ idleRelease: 30 });
    board.like('idle', undefined, 1);
    board.gift('kept', undefined, 1);
    const idle = snakeOf('idle'),
      kept = snakeOf('kept');
    run(1);
    expect(idle && snakeOf('idle')).toBe(idle);
    // 31 s since either liked or gave.
    for (const name of ['idle', 'kept']) {
      const v = arena.viewers.get(name),
        s = snakeOf(name);
      if (!v || !s) throw new Error('no snake');
      v.acts = [arena.clock - 31];
      s.taken = arena.clock - 31;
    }
    run(STEP);
    expect(idle?.alive).toBe(false);
    expect(snakeOf('idle')).toBeUndefined();
    expect(kept && snakeOf('kept')).toBe(kept);
    expect(events()).toContain('snake back to the computer idle');
  });

  it('the clock alone ends the round; the next starts at once, small, owners and lives kept', () => {
    fresh({ roundLength: 60 });
    board.gift('zoe', undefined, 1);
    const was = snakeOf('zoe');
    if (!was) throw new Error('no snake');
    was.len = 30;
    run(60);
    expect(game.full).toBeGreaterThanOrEqual(0);
    expect(arena.time).toBeGreaterThanOrEqual(60);
    expect(events()).toContain('round won zoe');
    // A like during the end screen: in line for the next round, no snake yet.
    board.like('newbie', undefined, 1);
    expect(snakeOf('newbie')).toBeUndefined();
    expect(arena.line.map((w) => w.nickname)).toEqual(['newbie']);
    run(roundHold() + 0.2);
    expect(game.full).toBe(-1);
    expect(arena.phase).toBe('play');
    const now = snakeOf('zoe');
    expect(now).toBeDefined();
    expect(now?.colour).toBe(was.colour);
    expect(now?.lives).toBe(1);
    run(1);
    expect(snakeOf('newbie')).toBeDefined();
    for (const s of alive()) expect(s.len).toBeLessThanOrEqual(TUNING.startLen);
  });

  it('switched off, the next round is the qualifying', () => {
    fresh({ roundLength: 60 });
    setArenaSettings({ ...ARENA_DEFAULTS, pilot: false, roundLength: 60, continuous: false });
    expect(arena.continuous).toBe(true);
    run(60 + roundHold() + 0.2);
    expect(qualifying()).toBe(true);
    expect(arena.continuous).toBe(false);
  });

  it('the beach left of the podium: the line first, then the latest arrivals, five at most', () => {
    for (const name of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) board.like(name, undefined, 1);
    board.like('waits', undefined, 1);
    for (const name of ['j1', 'j2', 'j3', 'j4', 'j5', 'p1']) arrive(name, undefined);
    const crowd = beachCrowd();
    expect(crowd.map((c) => c.nickname)).toEqual(['waits', 'j5', 'j4', 'j3', 'j2']);
    expect(crowd.map((c) => c.waiting)).toEqual([true, false, false, false, false]);
  });
});

describe("snake arena: the pilot shows skohlds' own picture", () => {
  it('found by name among the photos the live sent, else in the supporters list, else none', async () => {
    const { PILOT, pilotAvatar } = await import('../../src/renderer/arena/entry.ts');
    const { notePhoto } = await import('../../src/renderer/feed/state.ts');
    const { restoreSupporters } = await import('../../src/renderer/feed/supporters.ts');
    expect(pilotAvatar(0)).toBeUndefined();
    restoreSupporters(
      JSON.stringify({
        savedAt: 1,
        supporters: [
          { id: 'skohlds', nickname: 'skohlds', berries: 3, avatar: 'https://p.test/kept.jpg' },
        ],
      }),
    );
    // Asked again a second later: the list has it now.
    expect(pilotAvatar(2)).toBe('https://p.test/kept.jpg');
    // An event from skohlds on the live: the latest link wins.
    notePhoto('skohlds', 'https://p.test/live.jpg');
    expect(pilotAvatar(3)).toBe('https://p.test/live.jpg');
    expect(PILOT.name.toLowerCase()).toBe('skohlds');
  });
});

describe('snake arena: continuous play on screen', () => {
  it("a player's hearts sit on the rim of their own photo", async () => {
    const { HEART, rimHeart } = await import('../../src/renderer/arena/lives.ts');
    const r = TUNING.photoR;
    for (let i = 0; i < 5; i++)
      for (const x of [300, 1050]) {
        const p = rimHeart(x, 600, r, i);
        expect(Math.hypot(p.x - x, p.y - 600)).toBeLessThanOrEqual(r + HEART.board / 2);
        expect(p.y).toBeGreaterThan(600);
      }
  });

  it('the end screen shows the berries eaten, no seconds before the next round', async () => {
    const { setCtx } = await import('../../src/renderer/engine/canvas.ts');
    const { paintRoundEnd } = await import('../../src/renderer/feed/leaderboard.ts');
    const texts: string[] = [];
    const fake = new Proxy(
      {},
      {
        get: (_t, key) =>
          key === 'fillText'
            ? (text: string) => texts.push(text)
            : key === 'measureText'
              ? () => ({ width: 10 })
              : key === 'createLinearGradient' || key === 'createRadialGradient'
                ? () => ({ addColorStop: () => undefined })
                : () => undefined,
        set: () => true,
      },
    );
    const was = setCtx(fake as unknown as CanvasRenderingContext2D);
    game.full = 1;
    game.eaten = 26;
    try {
      paintRoundEnd(1, 0, 'GUS WINS', [], false);
    } finally {
      setCtx(was);
      game.full = -1;
    }
    expect(texts.some((t) => t.includes('26'))).toBe(true);
    expect(texts.some((t) => /next round|\ds\b/.test(t))).toBe(false);
  });
});
