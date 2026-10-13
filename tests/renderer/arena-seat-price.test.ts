import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ARENA_DEFAULTS,
  readArenaSettings,
  readSeatPrice,
  sanitizeArenaSetting,
  type ArenaSettings,
} from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import {
  fired,
  flights,
  likePops,
  paidQueue,
  queue,
  rings,
  arenaLike,
} from '../../src/renderer/arena/entry.ts';
import {
  ARENA_STORAGE_KEY,
  applyArenaCommand,
  arenaSettings,
  countOnArena,
  restoreArenaSettings,
} from '../../src/renderer/arena/link.ts';
import { QUALIFY, locked, qualifying } from '../../src/renderer/arena/qualify.ts';
import { tierOf } from '../../src/renderer/arena/round.ts';
import { arena, kill, snakeOf } from '../../src/renderer/arena/rules.ts';
import {
  applyFeedCommand,
  receiveFeedEvent,
  settings,
  type FeedLinkDeps,
} from '../../src/renderer/feed/control-link.ts';
import { READY_TIME, game, hooks, newRound } from '../../src/renderer/feed/state.ts';

const STEP = 1 / 30;
const run = (seconds: number): void => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) advanceArena(STEP);
};

function store(map = new Map<string, string>()): FeedLinkDeps['storage'] {
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

function deps(): FeedLinkDeps {
  return {
    bridge: {
      start: () => undefined,
      stop: () => undefined,
      process: () => undefined,
      state: () => ({ connected: false }),
    },
    storage: store(),
    metrics: () => ({ fps: 60, slowFrames: 0, errors: 0 }),
    setCrowd: () => undefined,
    crowd: () => 0,
    someone: () => 'tester',
    shareSettings: false,
  };
}

/** A new round, seeded: the qualifying opens on an empty board. */
function fresh(extra: Partial<ArenaSettings> = {}, seed = 7): void {
  setArenaSettings({
    ...ARENA_DEFAULTS,
    places: 6,
    pilot: false,
    wildSnakes: 0,
    giftSeats: true,
    ...extra,
  });
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
  arena.food = [];
  arena.foodAt.clear();
  arena.snakes = [];
  newRound();
}

/** A live gift: `n` of a gift worth `coins` each. */
const gift = (nickname: string, coins: number, n = 1): void => {
  receiveFeedEvent({ type: 'gift', name: 'Test gift', value: coins, n, nickname });
};
const inLine = (): string[] => paidQueue.map((q) => q.nickname);
const berriesOf = (nickname: string): number =>
  game.queue.filter((q) => q.nickname === nickname).reduce((k, q) => k + q.n, 0);

/** Runs the qualifying out: 0:00, the freeze, the countdown over the closed eggs and GO. */
function toBattle(): void {
  run(QUALIFY.time + QUALIFY.freeze + READY_TIME + 0.2);
}

/** Two like seats, then the battle. */
function battle(extra: Partial<ArenaSettings> = {}): void {
  fresh({ roundLength: 120, ...extra });
  arenaLike('player', undefined, 30);
  arenaLike('rival', undefined, 20);
  toBattle();
  expect(snakeOf('player')).toBeDefined();
}

describe('snake arena: the seat price', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  beforeEach(() => {
    // Every value below is priced: 30 and 99 coins would drop berries if they were plain gifts.
    settings.pricing = '1:1,10:10,30:30,99:99';
    settings.otherGifts = true;
  });

  it('is a whole number of coins from 0, 0 by default; a wrong entry keeps the last value', () => {
    expect(ARENA_DEFAULTS.seatPrice).toBe(0);
    expect(sanitizeArenaSetting('seatPrice', 0)).toBe(0);
    expect(sanitizeArenaSetting('seatPrice', 99)).toBe(99);
    expect(sanitizeArenaSetting('seatPrice', 50000)).toBe(50000);
    expect(sanitizeArenaSetting('seatPrice', 50001)).toBeUndefined();
    expect(sanitizeArenaSetting('seatPrice', -1)).toBeUndefined();
    expect(sanitizeArenaSetting('seatPrice', 2.5)).toBeUndefined();
    expect(sanitizeArenaSetting('seatPrice', '99')).toBeUndefined();
    expect(readSeatPrice('99', 5)).toBe(99);
    expect(readSeatPrice(' 7 ', 5)).toBe(7);
    expect(readSeatPrice('0', 5)).toBe(0);
    for (const wrong of ['', '  ', 'abc', '2.5', '-3', '1e3', '60000'])
      expect(readSeatPrice(wrong, 5)).toBe(5);
    expect(readArenaSettings(JSON.stringify({ seatPrice: 199 })).seatPrice).toBe(199);
    expect(readArenaSettings(JSON.stringify({ seatPrice: 'x' })).seatPrice).toBe(0);
  });

  it('is saved under the game key and read back after a restart', () => {
    const map = new Map<string, string>();
    Object.assign(arenaSettings, ARENA_DEFAULTS);
    applyArenaCommand(
      { cmd: 'arena-setting', name: 'seatPrice', value: 99 },
      { storage: store(map) },
    );
    applyArenaCommand(
      { cmd: 'arena-setting', name: 'seatPrice', value: 1.5 },
      { storage: store(map) },
    );
    expect(arenaSettings.seatPrice).toBe(99);
    expect(JSON.parse(map.get(ARENA_STORAGE_KEY) ?? '{}')).toMatchObject({ seatPrice: 99 });
    Object.assign(arenaSettings, ARENA_DEFAULTS);
    restoreArenaSettings(store(map));
    expect(arenaSettings.seatPrice).toBe(99);
    Object.assign(arenaSettings, ARENA_DEFAULTS);
    setArenaSettings({ ...ARENA_DEFAULTS });
  });

  it('0: any gift buys a seat in the qualifying and a place in line in the battle, as before', () => {
    fresh();
    gift('ana', 10);
    expect(locked).toContain('ana');
    expect(berriesOf('ana')).toBe(10);
    battle();
    gift('stranger', 30);
    gift('player', 1);
    expect(inLine()).toEqual(['stranger', 'player']);
  });

  it('99: only the 99-coin gift locks a seat in the qualifying; a 30-coin gift is a plain gift', () => {
    fresh({ seatPrice: 99 });
    gift('plain', 30);
    expect(locked).not.toContain('plain');
    expect(berriesOf('plain')).toBe(30);
    // The flower thanks the plain gift with its berry, not a gold egg.
    run(0.1);
    expect(game.pour?.nickname).toBe('plain');
    expect(game.pour?.seat).toBeFalsy();
    run(2);
    gift('payer', 99);
    expect(locked).toContain('payer');
    // An entry and nothing else: no berry waits for it, even with 99 in the price list.
    expect(berriesOf('payer')).toBe(0);
    run(0.1);
    expect(game.pour?.nickname).toBe('payer');
    expect(game.pour?.seat).toBe(true);
    expect(game.pour?.total).toBe(1);
    expect(inLine()).toHaveLength(0);
    // The plain gift is not thanked a second time when the battle starts.
    run(QUALIFY.time + QUALIFY.freeze + READY_TIME);
    expect(qualifying()).toBe(false);
    run(0.2);
    expect(game.closeT).toBeGreaterThan(0);
  });

  it('99: in the battle the seat gift buys a place in line and no berry, even from a player', () => {
    battle({ seatPrice: 99 });
    const p = snakeOf('player');
    if (!p) throw new Error('no player');
    gift('player', 99);
    expect(inLine()).toEqual(['player']);
    expect(berriesOf('player')).toBe(0);
    expect(game.fans.get('player')?.coins ?? 0).toBe(0);
    // A gift all the same: the player moves up a tier.
    expect(tierOf(p)).toBe(1);
    run(2);
    expect(arena.food.some((f) => f.by === 'player')).toBe(false);
    // A viewer without a snake: a place in line, and the flower's gold egg.
    gift('stranger', 99);
    run(0.1);
    expect(inLine()).toEqual(['player', 'stranger']);
    expect(game.pour?.nickname).toBe('stranger');
    expect(game.pour?.seat).toBe(true);
  });

  it('99: a 30-coin gift in the battle gives berries, no place in line', () => {
    battle({ seatPrice: 99 });
    gift('player', 30);
    expect(berriesOf('player')).toBe(30);
    expect(inLine()).toHaveLength(0);
    const p = snakeOf('player');
    if (p) expect(tierOf(p)).toBe(1);
    // The player's berries pour first; then the flower is free.
    run(8);
    expect(berriesOf('player')).toBe(0);
    // A viewer without a snake: the flower's thanks with the berry, no gold egg, no place.
    gift('stranger', 30);
    run(0.1);
    expect(game.pour?.nickname).toBe('stranger');
    expect(game.pour?.seat).toBeFalsy();
    expect(inLine()).toHaveLength(0);
  });

  it('a streak of the seat gift is one place, one card, no berry', () => {
    battle({ seatPrice: 99 });
    gift('streak', 99, 5);
    gift('streak', 99, 3);
    expect(inLine()).toEqual(['streak']);
    expect(berriesOf('streak')).toBe(0);
    run(0.1);
    expect(game.pour?.nickname).toBe('streak');
    const first = game.pour?.id,
      cards = new Set<number>();
    for (let i = 0; i < 60; i++) {
      run(1 / 30);
      if (game.pour?.nickname === 'streak') cards.add(game.pour.id);
    }
    // One card only: the flower does not open on the second step of the streak (it may open for
    // a plain berry, with nobody's picture).
    expect([...cards]).toEqual([first]);
  });

  it('at the extra-life price, the life wins: a life, no seat; another life price buys no seat either', () => {
    fresh({ seatPrice: 30, lifeOn: true, lifePrice: 30 });
    gift('liv', 30);
    expect(arena.viewers.get('liv')?.lives).toBe(1);
    expect(locked).not.toContain('liv');
    fresh({ seatPrice: 99, lifeOn: true, lifePrice: 30 });
    gift('liv', 30);
    expect(arena.viewers.get('liv')?.lives).toBe(1);
    expect(locked).not.toContain('liv');
    gift('liv', 99);
    expect(locked).toContain('liv');
  });

  it('a seat gift in the end screen joins the line; test gifts and gifts by hand follow the price', () => {
    battle({ seatPrice: 99 });
    const r = snakeOf('rival');
    if (r) kill(r, null, 'accident');
    run(2);
    expect(game.full).toBeGreaterThanOrEqual(0);
    gift('late', 30);
    gift('late2', 99);
    expect(inLine()).toEqual(['late2']);
    fresh({ seatPrice: 99 });
    const d = deps();
    applyFeedCommand({ cmd: 'gift', gift: 'rose', count: 1, coins: 99, nickname: 'tst' }, d);
    applyFeedCommand({ cmd: 'grant', nickname: 'dan', count: 7 }, d);
    expect(locked).toContain('tst');
    expect(locked).not.toContain('dan');
  });
});
