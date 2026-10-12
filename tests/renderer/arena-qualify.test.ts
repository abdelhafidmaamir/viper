import { beforeAll, describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS, type ArenaSettings } from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import {
  audienceSize,
  qualifyingGifts,
  setAudience,
  tickAudience,
} from '../../src/renderer/arena/audience.ts';
import {
  BOOST,
  arenaLike,
  fired,
  flights,
  likePops,
  nextSeats,
  queue,
  rings,
} from '../../src/renderer/arena/entry.ts';
import { arenaPodium, eatenBy } from '../../src/renderer/arena/arena.ts';
import { alertsState, resetAlerts, setAlertsOn } from '../../src/renderer/feed/alerts.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import {
  QUALIFY,
  isGold,
  locked,
  qualLikes,
  qualifying,
  seats,
} from '../../src/renderer/arena/qualify.ts';
import { tierOf } from '../../src/renderer/arena/round.ts';
import { EMERGE, alive, arena, kill, snakeOf } from '../../src/renderer/arena/rules.ts';
import { board } from '../../src/renderer/feed/control-link.ts';
import { READY_TIME, game, hooks, newRound } from '../../src/renderer/feed/state.ts';

const STEP = 1 / 30;
const run = (seconds: number): void => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) advanceArena(STEP);
};

/** A new round, seeded: the qualifying opens on an empty board. */
function fresh(extra: Partial<ArenaSettings> = {}, seed = 7): void {
  setArenaSettings({ ...ARENA_DEFAULTS, pilot: false, wildSnakes: 0, ...extra });
  let s = seed;
  arena.rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  arena.viewers.clear();
  rings.clear();
  fired.clear();
  queue.length = 0;
  flights.length = 0;
  likePops.length = 0;
  game.queue = [];
  nextSeats.length = 0;
  // Nothing left from a test before: no berry lying on the board, no snake.
  arena.food = [];
  arena.foodAt.clear();
  arena.snakes = [];
  newRound();
}

const like = (nickname: string, n: number): void => {
  arenaLike(nickname, undefined, n);
};
const give = (nickname: string, berries: number): void => {
  board.gift(nickname, undefined, berries, true);
};
const holders = (): (string | null)[] => seats.map((s) => s.holder);
const seated = (nickname: string): boolean => holders().includes(nickname);

/** Runs the qualifying out: 0:00, the freeze, the countdown over the closed eggs and GO. */
function toBattle(): void {
  run(QUALIFY.time - (arena.phase === 'qualify' ? 0 : 0) + QUALIFY.freeze + READY_TIME + 0.2);
}

describe('snake arena: the qualifying', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  it('opens on empty eggs, one per place, every count at 0', () => {
    fresh();
    expect(qualifying()).toBe(true);
    expect(seats).toHaveLength(6);
    expect(holders().every((h) => h === null)).toBe(true);
    expect(qualLikes.size).toBe(0);
    expect(alive()).toHaveLength(0);
    expect(game.ready).toBe(-1);
  });

  it('a liker takes a free egg at once; at the cut the bigger number goes up; a gift takes the weakest like seat, then the next', () => {
    fresh();
    like('a', 10);
    like('b', 20);
    like('c', 30);
    run(0.5);
    // Three likers, three of six eggs, ranked by likes, the empty eggs last.
    expect(holders()).toEqual(['c', 'b', 'a', null, null, null]);
    like('d', 5);
    like('e', 15);
    like('f', 25);
    run(0.5);
    expect(holders()).toEqual(['c', 'f', 'b', 'e', 'a', 'd']);
    // A seventh with more likes than the weakest seat takes it at the cut.
    like('g', 8);
    run(2);
    expect(seated('g')).toBe(true);
    expect(seated('d')).toBe(false);
    // A gift takes the weakest like seat (g, 8), and its seat ranks first.
    give('x', 10);
    run(0.2);
    expect(seated('g')).toBe(false);
    expect(holders()[0]).toBe('x');
    // A second gift takes the next weakest (a, 10); paid seats first, in the order they gave.
    give('y', 10);
    run(0.2);
    expect(seated('a')).toBe(false);
    expect(holders()).toEqual(['x', 'y', 'c', 'f', 'b', 'e']);
  });

  it('keeps a strict order: paid seats first in gift order, then the most likes', () => {
    fresh();
    for (const [n, k] of [
      ['p', 3],
      ['q', 9],
      ['r', 6],
      ['s', 12],
    ] as const)
      like(n, k);
    run(0.5);
    give('gold1', 10);
    run(0.2);
    like('p', 20);
    run(0.5);
    give('gold2', 10);
    run(0.5);
    expect(holders()).toEqual(['gold1', 'gold2', 'p', 's', 'q', 'r']);
  });

  it('one swap at the cut every 1.5 s at most', () => {
    fresh();
    for (let i = 0; i < 6; i++) like(`seat${String(i)}`, 10);
    run(0.5);
    let swaps = 0,
      before = holders().join();
    for (let k = 0; k < 60; k++) {
      // A new challenger every 0.1 s, each with more likes than any seat.
      like(`rush${String(k)}`, 20 + k);
      run(0.1);
      const now = holders().join();
      if (now !== before) {
        // A reorder among the holders is not a swap: count only someone new seated.
        const was = new Set(before.split(','));
        if (now.split(',').some((n) => !was.has(n))) swaps++;
        before = now;
      }
    }
    expect(swaps).toBeGreaterThan(0);
    expect(swaps).toBeLessThanOrEqual(Math.floor(6 / QUALIFY.swapGap) + 1);
  });

  it('a seat a gift holds is never lost, whatever the likes', () => {
    fresh();
    give('patron', 5);
    for (let i = 0; i < 30; i++) {
      like(`fan${String(i)}`, 1000 + i);
      run(0.3);
    }
    expect(seated('patron')).toBe(true);
    expect(locked).toContain('patron');
  });

  it('ends at once when every seat is paid: freeze, 3, 2, 1 over closed eggs, all hatching at GO', () => {
    fresh();
    for (let i = 0; i < 6; i++) give(`patron${String(i)}`, 5);
    // Each gift shows on the flower, then its picture flies to its egg; then it ends at once.
    let waited = 0;
    while (qualifying() && waited < 12) {
      run(0.1);
      waited += 0.1;
    }
    expect(waited).toBeLessThan(12);
    expect(arena.phase).toBe('ready');
    expect(alive()).toHaveLength(6);
    // The countdown runs over closed eggs...
    run(READY_TIME - 0.6 - 0.3);
    expect(alive().every((s) => !s.egg?.hatched)).toBe(true);
    // ...and every egg bursts in one beat, at GO.
    run(0.4);
    expect(alive().every((s) => s.in)).toBe(true);
    expect(new Set(alive().map((s) => s.len)).size).toBe(1);
  });

  it('at 0:00 the top likers hatch from their seats, all together, and nobody moves before GO', () => {
    fresh();
    for (let i = 0; i < 8; i++) like(`v${String(i)}`, 10 + i * 5);
    run(QUALIFY.time + QUALIFY.freeze + 0.1);
    expect(arena.phase).toBe('ready');
    const names = alive()
      .map((s) => s.nickname)
      .sort();
    expect(names).toEqual(['v2', 'v3', 'v4', 'v5', 'v6', 'v7']);
    run(READY_TIME - 0.6 + EMERGE * 0);
    const heads = alive().map((s) => s.cells[0]);
    run(0.3);
    expect(alive().map((s) => s.cells[0])).toEqual(heads);
    run(0.6);
    expect(arena.phase).toBe('play');
  });

  it('the next qualifying starts everyone at 0: no free seat, not even for the winner', () => {
    fresh({ roundLength: 60 });
    like('champ', 50);
    like('other', 40);
    toBattle();
    const loser = snakeOf('other');
    if (loser) kill(loser, null, 'accident');
    run(2);
    expect(game.full).toBeGreaterThanOrEqual(0);
    expect(arena.winner?.nickname).toBe('champ');
    run(15);
    expect(qualifying()).toBe(true);
    expect(seated('champ')).toBe(false);
    expect(qualLikes.size).toBe(0);
  });

  it('no berry carries over: an unspent giver gets a locked seat at the next qualifying instead', () => {
    fresh({ roundLength: 60 });
    like('p1', 30);
    like('p2', 20);
    toBattle();
    // A viewer without a snake gives during the battle: the berries wait in the flower.
    give('outsider', 10);
    run(1);
    expect(game.queue.some((q) => q.nickname === 'outsider')).toBe(true);
    const p2 = snakeOf('p2');
    if (p2) kill(p2, null, 'accident');
    run(15);
    expect(qualifying()).toBe(true);
    expect(game.queue.some((q) => q.nickname === 'outsider' && q.n > 0)).toBe(false);
    expect(locked).toContain('outsider');
    expect(seated('outsider')).toBe(true);
  });

  it('a rehearsal medium room sends about one gift a qualifying', () => {
    let gifts = 0,
      s = 3;
    const rand = (): number => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    setAudience(100, rand);
    expect(audienceSize()).toBe(100);
    for (let k = 0; k < 100 * 30 * 30; k++)
      tickAudience(
        STEP,
        { like: () => undefined, gift: () => gifts++ },
        rand,
        qualifyingGifts(100),
      );
    // 100 qualifyings of 30 s.
    expect(gifts / 100).toBeGreaterThan(0.6);
    expect(gifts / 100).toBeLessThan(1.5);
    setAudience(0);
  });
});

describe('snake arena: the battle', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  it('plays only the qualified: nobody comes in during the battle, likes or gifts', () => {
    fresh({ roundLength: 120 });
    like('in1', 30);
    like('in2', 20);
    toBattle();
    expect(arena.phase).toBe('play');
    const n = alive().length;
    like('late', 1000);
    give('late2', 50);
    run(5);
    expect(snakeOf('late')).toBeUndefined();
    expect(snakeOf('late2')).toBeUndefined();
    expect(alive().length).toBeLessThanOrEqual(n);
  });

  it('ends when one viewer snake is left, and that viewer wins', () => {
    fresh({ roundLength: 120 });
    for (const [n, k] of [
      ['w1', 30],
      ['w2', 20],
      ['w3', 10],
    ] as const)
      like(n, k);
    toBattle();
    for (const n of ['w2', 'w3']) {
      const s = snakeOf(n);
      if (s) kill(s, null, 'accident');
    }
    run(0.5);
    expect(game.full).toBeLessThan(0);
    run(1.5);
    expect(game.full).toBeGreaterThanOrEqual(0);
    expect(arena.winner?.nickname).toBe('w1');
    expect(arena.ranking.map((r) => r.nickname)).toEqual(['w1', 'w3', 'w2']);
  });

  it('every 100 likes of a player fire one speed boost; the ring keeps what is left over', () => {
    fresh({ roundLength: 120 });
    like('speedy', 30);
    like('slow', 20);
    toBattle();
    const s = snakeOf('speedy');
    expect(s).toBeDefined();
    if (!s) return;
    s.boost = 0;
    like('speedy', BOOST.likes);
    expect(s.boost).toBe(BOOST.seconds);
    expect(rings.get('speedy')).toBe(0);
    s.boost = 0;
    like('speedy', 250);
    expect(s.boost).toBe(Math.min(6, 2 * BOOST.seconds));
    expect(rings.get('speedy')).toBe(50);
    expect(fired.has('speedy')).toBe(true);
  });

  it('nobody wears the crown at GO; the first to eat takes it; a tie keeps it where it is', () => {
    fresh({ roundLength: 120 });
    like('k1', 30);
    like('k2', 20);
    toBattle();
    run(0.2);
    expect(arena.crown).toBe(-1);
    const a = snakeOf('k1'),
      b = snakeOf('k2');
    if (!a || !b) throw new Error('both should play');
    b.eaten = 1;
    b.len += 1;
    run(0.1);
    expect(arena.crown).toBe(b.id);
    a.eaten = 1;
    a.len = b.len;
    run(0.1);
    expect(arena.crown).toBe(b.id);
    a.len = b.len + 2;
    run(0.1);
    expect(arena.crown).toBe(a.id);
  });

  it('survival tiers: a like seat is 3, a paid seat 2, a gift during the battle makes it 1 at once', () => {
    fresh({ roundLength: 120 });
    like('liker', 30);
    give('payer', 5);
    like('later', 20);
    toBattle();
    const liker = snakeOf('liker'),
      payer = snakeOf('payer'),
      later = snakeOf('later');
    if (!liker || !payer || !later) throw new Error('all three should play');
    expect(isGold('payer') || payer.paid).toBeTruthy();
    expect(tierOf(liker)).toBe(3);
    expect(tierOf(payer)).toBe(2);
    expect(tierOf(later)).toBe(3);
    give('later', 1);
    expect(tierOf(later)).toBe(1);
    run(0.2);
    expect(later.backing).toBe(3);
    expect(liker.backing).toBe(0);
    expect(payer.backing).toBe(1);
  });

  it('a gift in the battle qualifies its giver for the next round, a paid seat first, told once', () => {
    fresh({ roundLength: 120 });
    setAlertsOn(true);
    like('player', 30);
    like('rival', 20);
    toBattle();
    resetAlerts();
    // A viewer without a snake, then a player: both qualified, in the order they gave.
    give('outsider', 10);
    give('outsider', 10);
    give('player', 5);
    expect(nextSeats).toEqual(['outsider', 'player']);
    // One card each, however many gifts.
    const { current, queued } = alertsState();
    expect((current ? 1 : 0) + queued).toBe(2);
    const p = snakeOf('player');
    if (p) expect(tierOf(p)).toBe(1);
    const r = snakeOf('rival');
    if (r) kill(r, null, 'accident');
    run(15);
    expect(qualifying()).toBe(true);
    expect(holders().slice(0, 2)).toEqual(['outsider', 'player']);
    expect(locked.slice(0, 2)).toEqual(['outsider', 'player']);
    expect(nextSeats).toHaveLength(0);
  });

  it('more battle givers than places: the first get the seats, the others keep priority for the round after', () => {
    fresh({ roundLength: 120 });
    like('a1', 30);
    like('a2', 20);
    toBattle();
    for (let i = 0; i < 8; i++) give(`donor${String(i)}`, 5);
    const a2 = snakeOf('a2');
    if (a2) kill(a2, null, 'accident');
    run(15);
    expect(qualifying()).toBe(true);
    expect(holders()).toEqual(['donor0', 'donor1', 'donor2', 'donor3', 'donor4', 'donor5']);
    expect(nextSeats).toEqual(['donor6', 'donor7']);
  });

  it("the end screen's podium counts the berries each snake ate, gift or plain, in the result order", () => {
    fresh({ roundLength: 120 });
    like('eater', 30);
    like('other', 20);
    toBattle();
    const e = snakeOf('eater'),
      o = snakeOf('other');
    if (!e || !o) throw new Error('both should play');
    e.eaten = 7;
    o.eaten = 3;
    kill(o, null, 'accident');
    run(2);
    expect(game.full).toBeGreaterThanOrEqual(0);
    const podium = arenaPodium();
    expect(podium.map((l) => [l.nickname, l.berries, l.likes])).toEqual([
      ['eater', 7, 0],
      ['other', 3, 0],
    ]);
    expect(eatenBy('eater')).toBe(7);
    expect(game.eaten).toBe(10);
  });
});
