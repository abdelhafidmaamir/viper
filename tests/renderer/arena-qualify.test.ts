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
  paidQueue,
  queue,
  rings,
} from '../../src/renderer/arena/entry.ts';
import { arenaPodium, eatenBy } from '../../src/renderer/arena/arena.ts';
import {
  alertsState,
  resetAlerts,
  setAlertsOn,
  updateAlerts,
} from '../../src/renderer/feed/alerts.ts';
import { tr } from '../../src/renderer/engine/i18n.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import {
  CUT_Y,
  QUALIFY,
  SEAT_R,
  challengerSpot,
  isGold,
  locked,
  qualLikes,
  qualifying,
  seatSpot,
  seats,
} from '../../src/renderer/arena/qualify.ts';
import { column } from '../../src/renderer/arena/qualify-paint.ts';
import { FIELD, tierOf } from '../../src/renderer/arena/round.ts';
import { EMERGE, alive, arena, kill, snakeOf } from '../../src/renderer/arena/rules.ts';
import { board } from '../../src/renderer/feed/control-link.ts';
import { READY_TIME, game, hooks, newRound } from '../../src/renderer/feed/state.ts';

const STEP = 1 / 30;
const run = (seconds: number): void => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) advanceArena(STEP);
};

/** A new round, seeded: the qualifying opens on an empty board. */
function fresh(extra: Partial<ArenaSettings> = {}, seed = 7): void {
  setArenaSettings({ ...ARENA_DEFAULTS, places: 6, pilot: false, wildSnakes: 0, ...extra });
  let s = seed;
  arena.rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  arena.viewers.clear();
  rings.clear();
  fired.clear();
  queue.length = 0;
  flights.length = 0;
  likePops.length = 0;
  game.queue = [];
  paidQueue.length = 0;
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
const inLine = (): string[] => paidQueue.map((q) => q.nickname);
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

  it('8 places by default: two rows of 4 eggs evenly spaced, pictures, names and badges clear of each other', () => {
    expect(ARENA_DEFAULTS.places).toBe(8);
    fresh({ places: ARENA_DEFAULTS.places });
    expect(seats).toHaveLength(8);
    const spots = seats.map((_, i) => seatSpot(i)),
      rows = [spots.slice(0, 4), spots.slice(4)];
    for (const row of rows) {
      // One line, the same gap between every two.
      expect(new Set(row.map((p) => p.y)).size).toBe(1);
      const gaps = row.slice(1).map((p, i) => p.x - (row[i]?.x ?? 0));
      expect(new Set(gaps).size).toBe(1);
      // A name is cut to its column, a badge is narrower than a picture's column: no two touch.
      for (const g of gaps) {
        expect(g).toBeGreaterThan(column() + 8);
        expect(g).toBeGreaterThan(2 * SEAT_R + 40);
      }
    }
    // The picture's name above it (34 px), its badge under it (46 px), its egg under that.
    const top = (p: { y: number; r: number }): number => p.y - p.r - 6 - 34,
      bottom = (p: { y: number; r: number }): number => p.y + 112 + 30;
    const [r1, r2] = rows.map((row) => row[0] ?? { x: 0, y: 0, r: 0 });
    if (!r1 || !r2) throw new Error('two rows');
    // Under the clock's pill, the two rows apart, all of it above the cut and the challengers.
    expect(top(r1)).toBeGreaterThan(300);
    expect(bottom(r1)).toBeLessThan(top(r2));
    expect(bottom(r2)).toBeLessThan(CUT_Y);
    const ch = challengerSpot(0);
    expect(ch.y - ch.r - 40).toBeGreaterThan(CUT_Y);
    // The two gaps (pill to row 1, row 1 to row 2, row 2 to the cut) within a third of each other.
    const gaps = [top(r1) - 296, top(r2) - bottom(r1), CUT_Y - bottom(r2)];
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.35);
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

  it('one swap at the cut every 0.6 s at most', () => {
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

  it('the seats are right within a second: several pending swaps clear one after another', () => {
    fresh();
    for (let i = 0; i < 6; i++) like(`seat${String(i)}`, 10 + i);
    run(0.5);
    // Three challengers pass three seats at once.
    like('up1', 40);
    like('up2', 30);
    like('up3', 20);
    run(2);
    for (const n of ['up1', 'up2', 'up3']) expect(seated(n)).toBe(true);
    for (const n of ['seat0', 'seat1', 'seat2']) expect(seated(n)).toBe(false);
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

  it('no berry carries over: the flower empties; a battle giver plays the next round on a paid seat', () => {
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

  it('every 100 likes of a player fire one speed boost and grow its snake; the ring keeps what is left over', () => {
    fresh({ roundLength: 120 });
    like('speedy', 30);
    like('slow', 20);
    toBattle();
    const s = snakeOf('speedy');
    expect(s).toBeDefined();
    if (!s) return;
    s.boost = 0;
    const grow = s.grow;
    like('speedy', BOOST.likes);
    expect(s.boost).toBe(BOOST.seconds);
    // A full ring also grows the snake, as berries do.
    expect(s.grow - grow).toBe(BOOST.cells);
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

  it('a gift in the battle puts its giver in the paid queue, one place each, told once', () => {
    fresh({ roundLength: 120 });
    setAlertsOn(true);
    like('player', 30);
    like('rival', 20);
    toBattle();
    resetAlerts();
    // A viewer without a snake, then a player: both in line, in the order they gave; more gifts
    // from the same viewer do not move them.
    give('outsider', 10);
    give('outsider', 10);
    give('player', 5);
    give('outsider', 10);
    expect(inLine()).toEqual(['outsider', 'player']);
    // One card each, however many gifts.
    const { current, queued } = alertsState();
    expect((current ? 1 : 0) + queued).toBe(2);
    // The player's gift still lifts its snake's tier.
    const p = snakeOf('player');
    if (p) expect(tierOf(p)).toBe(1);
    const r = snakeOf('rival');
    if (r) kill(r, null, 'accident');
    run(15);
    expect(qualifying()).toBe(true);
    expect(holders().slice(0, 2)).toEqual(['outsider', 'player']);
    expect(locked.slice(0, 2)).toEqual(['outsider', 'player']);
    expect(inLine()).toHaveLength(0);
  });

  it('a non-player gift in the battle is a gift and a place in line, nothing on the board', () => {
    fresh({ roundLength: 120 });
    like('a1', 30);
    like('a2', 20);
    toBattle();
    const before = alive().length;
    give('stranger', 10);
    run(1);
    // No snake comes in, no seat is held now: only the flower's thanks and the queue.
    expect(alive()).toHaveLength(before);
    expect(snakeOf('stranger')).toBeUndefined();
    expect(inLine()).toEqual(['stranger']);
  });

  it('each round takes the next batch of the queue, as many as the places (6); the rest waits', () => {
    fresh({ roundLength: 120 });
    setAlertsOn(true);
    like('a1', 30);
    like('a2', 20);
    toBattle();
    const card = (): string => {
      updateAlerts(0.01);
      const a = alertsState().current;
      // The card's words, and its badge: the place in line.
      return a ? `${tr(a.phrase, { name: a.nickname })} #${String(a.likes)}` : '';
    };
    for (let i = 0; i < 8; i++) {
      resetAlerts();
      give(`donor${String(i)}`, 5);
      const said = card();
      // #6 plays the next round with 6 places, #7 waits in line.
      if (i === 5) expect(said).toBe('donor5 PLAYS NEXT ROUND #6');
      if (i === 6) expect(said).toBe('donor6 IS IN LINE #7');
    }
    expect(inLine()).toHaveLength(8);
    const a2 = snakeOf('a2');
    if (a2) kill(a2, null, 'accident');
    run(15);
    // The first six on gold eggs, in queue order: every seat is paid, the qualifying ends at once.
    expect(qualifying()).toBe(true);
    expect(holders()).toEqual(['donor0', 'donor1', 'donor2', 'donor3', 'donor4', 'donor5']);
    expect(inLine()).toEqual(['donor6', 'donor7']);
    let waited = 0;
    while (qualifying() && waited < 12) {
      // A gift in such a short qualifying joins the queue.
      if (waited === 0) give('late', 5);
      run(0.1);
      waited += 0.1;
    }
    expect(waited).toBeLessThan(12);
    expect(inLine()).toEqual(['donor6', 'donor7', 'late']);
    // The round after: the rest of the queue first.
    const any = alive().find((s) => !s.wild);
    run(READY_TIME + 1);
    for (const s of alive()) if (s !== any) kill(s, null, 'accident');
    run(15);
    expect(qualifying()).toBe(true);
    expect(holders().slice(0, 3)).toEqual(['donor6', 'donor7', 'late']);
    expect(inLine()).toHaveLength(0);
  });

  it('with 8 places, #3 plays the next round and #12 is in line', () => {
    fresh({ roundLength: 120, places: 8 });
    setAlertsOn(true);
    like('a1', 30);
    like('a2', 20);
    toBattle();
    const said: string[] = [];
    for (let i = 1; i <= 12; i++) {
      resetAlerts();
      give(`d${String(i)}`, 5);
      updateAlerts(0.01);
      const a = alertsState().current;
      said.push(a ? `${tr(a.phrase, { name: a.nickname })} #${String(a.likes)}` : '');
    }
    expect(said[2]).toBe('d3 PLAYS NEXT ROUND #3');
    expect(said[7]).toBe('d8 PLAYS NEXT ROUND #8');
    expect(said[8]).toBe('d9 IS IN LINE #9');
    expect(said[11]).toBe('d12 IS IN LINE #12');
  });

  it("the flower's card shows a gold egg for a gift that buys a seat, the berry for a player's battle gift", () => {
    fresh({ roundLength: 120 });
    like('player', 30);
    like('rival', 20);
    // A qualifying gift locks a seat: its card shows the gold egg.
    give('payer', 10);
    run(0.2);
    expect(game.pour?.nickname).toBe('payer');
    expect(game.pour?.seat).toBe(true);
    // Its berries wait in the flower as berries: they pour in the battle.
    expect(game.queue.find((q) => q.nickname === 'payer')?.seat).toBeFalsy();
    toBattle();
    run(3);
    // A viewer without a snake buys a place in line: the gold egg.
    give('stranger', 10);
    run(0.1);
    expect(game.pour?.nickname).toBe('stranger');
    expect(game.pour?.seat).toBe(true);
    run(2);
    // A player's battle gift gives berries: the berry.
    give('player', 5);
    run(0.1);
    expect(game.pour?.nickname).toBe('player');
    expect(game.pour?.seat).toBeFalsy();
  });

  it('a gift in the end screen joins the paid queue, behind the battle givers', () => {
    fresh({ roundLength: 120 });
    like('b1', 30);
    like('b2', 20);
    toBattle();
    give('early', 5);
    const b2 = snakeOf('b2');
    if (b2) kill(b2, null, 'accident');
    run(2);
    expect(game.full).toBeGreaterThanOrEqual(0);
    give('late', 5);
    // Nothing is locked in the end screen: the giver only takes a place in line.
    expect(locked).not.toContain('late');
    expect(inLine()).toEqual(['early', 'late']);
    run(13);
    expect(qualifying()).toBe(true);
    expect(holders().slice(0, 2)).toEqual(['early', 'late']);
  });

  it("the end screen's podium counts the berries each snake ate, gift or plain, in the result order", () => {
    fresh({ roundLength: 120 });
    // No plain berries for this count: the numbers are the test's own.
    FIELD.count = 0;
    arena.food = [];
    arena.foodAt.clear();
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
    FIELD.count = 3;
  });
});
