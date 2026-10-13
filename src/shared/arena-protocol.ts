/**
 * Snake Arena, the third mode: one snake per viewer on a shared board, driven by likes and gifts
 * only. Its window reuses the Feed scene and the Feed protocol (feed-protocol.ts) for everything
 * around the board, on a channel of its own. This file adds what only the arena has: the game's
 * tuning values, the command that sets them, and the state the board publishes.
 */

export const ARENA_CHANNEL = 'viper-arena';

/** Snakes on the board at once, one per snake colour, so 8 at most. Viewers past that wait. */
export const ARENA_PLACES = [4, 6, 8] as const;
/** Likes that fill a viewer's entry ring round their animal's picture: their snake is born. */
export const ARENA_ENTRY_LIKES = [25, 50, 100, 150, 200] as const;
/** Seconds of speed boost likes can bank at most, while the boost is on. */
export const ARENA_BOOST_CAPS = [3, 6, 10] as const;
/** Berries one gift must be worth to give its owner's snake a shield; 0 never does. */
export const ARENA_SHIELD_GIFTS = [0, 10, 30, 100] as const;
/** Seconds a round lasts before its end screen. */
export const ARENA_ROUND_LENGTHS = [60, 120, 180, 240, 300] as const;
/** Who may eat a gift's berries: only the snake of the viewer who sent it, or any snake. */
export const ARENA_GIFT_BERRIES = ['owner', 'shared'] as const;
export type ArenaGiftBerries = (typeof ARENA_GIFT_BERRIES)[number];
/** With few viewers, wild snakes make up the board to this many; 0 is off. */
export const ARENA_WILD_SNAKES = [0, 2, 4, 6] as const;
/** A small snake's speed, in cells per second (Feed's snake runs at 9). */
export const ARENA_SPEEDS = [5, 6, 7, 8, 9] as const;
/** Seconds between two drips of plain berries for everyone, give or take a fifth. */
export const ARENA_PLAIN_EVERY = [15, 25, 40, 60] as const;
/** Most plain berries in one drip (each drip drops 1 up to this many). */
export const ARENA_PLAIN_AMOUNTS = [1, 2, 3, 5] as const;
/** Coins of the one gift that gives an extra life instead of berries, when the life gift is on. */
export const ARENA_LIFE_PRICES = [10, 20, 30, 99, 199] as const;
/**
 * Highest coin value the seat gift can be set to, the gift price rows' own bound. The seat gift's
 * value is typed in the control room, a whole number of coins; 0 means any gift buys a seat.
 */
export const ARENA_SEAT_PRICE_MAX = 50000;
/** Most lives a snake can hold. */
export const ARENA_MAX_LIVES = [1, 2, 3, 5] as const;
/** Share of its length a snake keeps when a life brings it back. */
export const ARENA_LIFE_KEEPS = [0.25, 0.5, 0.75, 1] as const;
/** Seconds without a like before a waiting animal leaves its queue spot. */
export const ARENA_QUEUE_IDLES = [3, 5, 10, 15] as const;
/** How much a viewer's gifts make their snake smarter and safer, against likes-only ones. */
export const ARENA_BACKING = ['off', 'light', 'strong'] as const;
export type ArenaBacking = (typeof ARENA_BACKING)[number];

export interface ArenaSettings {
  /** Snakes on the board at once (ARENA_PLACES). */
  readonly places: number;
  /** Likes for one speed boost in the battle (ARENA_ENTRY_LIKES; the name is the old one). */
  readonly entryLikes: number;
  /** A gift from a viewer without a snake brings it in at once. */
  readonly giftEntry: boolean;
  /** Likes speed up the viewer's snake once it is in. */
  readonly likeBoost: boolean;
  /** Most seconds of boost likes can bank (ARENA_BOOST_CAPS). */
  readonly boostCap: number;
  /** Gift size, in berries, that buys a shield (ARENA_SHIELD_GIFTS). */
  readonly shieldGift: number;
  /** Round length in seconds (ARENA_ROUND_LENGTHS). */
  readonly roundLength: number;
  /** Whether a gift's berries are for its owner only (ARENA_GIFT_BERRIES). */
  readonly giftBerries: ArenaGiftBerries;
  /** Wild snakes fill the board up to this many (ARENA_WILD_SNAKES). */
  readonly wildSnakes: number;
  /** Speed in cells per second (ARENA_SPEEDS). */
  readonly speed: number;
  /** Seconds between two plain drips (ARENA_PLAIN_EVERY). */
  readonly plainEvery: number;
  /** Most plain berries per drip (ARENA_PLAIN_AMOUNTS). */
  readonly plainAmount: number;
  /** Gifts make a snake's brain smarter and safer (ARENA_BACKING). */
  readonly backing: ArenaBacking;
  /** Seconds without a like before a queue animal walks away (ARENA_QUEUE_IDLES). */
  readonly queueIdle: number;
  /**
   * Coin value of the one gift that buys a seat in the qualifying, or a place in the paid queue
   * outside it; that gift gives no berries. 0: any gift buys one (control room, Money tab).
   */
  readonly seatPrice: number;
  /** The extra-life gift is on (control room, Money tab). */
  readonly lifeOn: boolean;
  /** The extra-life gift's price in coins (ARENA_LIFE_PRICES). */
  readonly lifePrice: number;
  /** Most lives a snake holds (ARENA_MAX_LIVES). */
  readonly maxLives: number;
  /** Share of length kept on a life (ARENA_LIFE_KEEPS). */
  readonly lifeKeep: number;
  /** The game's own player, "Viper", plays to show viewers how it works. */
  readonly pilot: boolean;
  /** Every snake plays the strong brain; off, the calm one. */
  readonly superAI: boolean;
}

export type ArenaSettingName = keyof ArenaSettings;

export const ARENA_DEFAULTS: ArenaSettings = {
  places: 6,
  entryLikes: 100,
  giftEntry: true,
  likeBoost: true,
  boostCap: 6,
  shieldGift: 0,
  roundLength: 120,
  giftBerries: 'owner',
  wildSnakes: 4,
  speed: 7,
  plainEvery: 25,
  plainAmount: 1,
  backing: 'strong',
  queueIdle: 5,
  seatPrice: 0,
  lifeOn: false,
  lifePrice: 30,
  maxLives: 3,
  lifeKeep: 0.5,
  pilot: false,
  superAI: false,
};

/** One of the game's tuning values; the Feed settings travel as Feed commands. */
export interface ArenaCommand {
  readonly cmd: 'arena-setting';
  readonly name: ArenaSettingName;
  readonly value: unknown;
}

/** Snakes on the board: viewers', wild ones, and whether the pilot plays. */
export interface ArenaSnakeCount {
  readonly viewers: number;
  readonly wild: number;
  readonly pilot: boolean;
}

export interface ArenaState {
  readonly settings: ArenaSettings;
  /** Seconds before the round ends, counted only while it plays. */
  readonly secondsLeft: number;
  readonly snakes?: ArenaSnakeCount;
  /** Snakes that boxed themselves in this round. */
  readonly trapped?: number;
  /** The paid queue's names, first in line first: the next rounds' paid seats. */
  readonly paidQueue?: readonly string[];
}

export interface ArenaStateMessage {
  readonly arena: ArenaState;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const NAMES: ReadonlySet<string> = new Set<ArenaSettingName>(
  Object.keys(ARENA_DEFAULTS) as ArenaSettingName[],
);

/** Narrows an untrusted channel payload to an arena command; Feed commands are not. */
export function isArenaCommand(value: unknown): value is ArenaCommand {
  return (
    isRecord(value) &&
    value.cmd === 'arena-setting' &&
    typeof value.name === 'string' &&
    NAMES.has(value.name)
  );
}

/** Narrows an untrusted channel payload to the arena's state; anything else is ignored. */
export function decodeArenaState(data: unknown): ArenaState | null {
  if (!isRecord(data) || !isRecord(data.arena)) return null;
  const arena = data.arena;
  if (typeof arena.secondsLeft !== 'number' || !isRecord(arena.settings)) return null;
  return arena as unknown as ArenaState;
}

const listed = (list: readonly number[], value: unknown): boolean =>
  typeof value === 'number' && list.includes(value);

/** Clamps a setting sent over the channel to a value the game accepts, or undefined. */
export function sanitizeArenaSetting<K extends ArenaSettingName>(
  name: K,
  value: unknown,
): ArenaSettings[K] | undefined {
  const ok = (v: unknown): ArenaSettings[K] => v as ArenaSettings[K];
  switch (name) {
    case 'places':
      return listed(ARENA_PLACES, value) ? ok(value) : undefined;
    case 'entryLikes':
      return listed(ARENA_ENTRY_LIKES, value) ? ok(value) : undefined;
    case 'boostCap':
      return listed(ARENA_BOOST_CAPS, value) ? ok(value) : undefined;
    case 'shieldGift':
      return listed(ARENA_SHIELD_GIFTS, value) ? ok(value) : undefined;
    case 'roundLength':
      return listed(ARENA_ROUND_LENGTHS, value) ? ok(value) : undefined;
    case 'giftBerries':
      return ARENA_GIFT_BERRIES.includes(value as ArenaGiftBerries) ? ok(value) : undefined;
    case 'lifePrice':
      return listed(ARENA_LIFE_PRICES, value) ? ok(value) : undefined;
    case 'seatPrice':
      return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= ARENA_SEAT_PRICE_MAX
        ? ok(value)
        : undefined;
    case 'maxLives':
      return listed(ARENA_MAX_LIVES, value) ? ok(value) : undefined;
    case 'lifeKeep':
      return listed(ARENA_LIFE_KEEPS, value) ? ok(value) : undefined;
    case 'queueIdle':
      return listed(ARENA_QUEUE_IDLES, value) ? ok(value) : undefined;
    case 'backing':
      return ARENA_BACKING.includes(value as ArenaBacking) ? ok(value) : undefined;
    case 'wildSnakes':
      return listed(ARENA_WILD_SNAKES, value) ? ok(value) : undefined;
    case 'speed':
      return listed(ARENA_SPEEDS, value) ? ok(value) : undefined;
    case 'plainEvery':
      return listed(ARENA_PLAIN_EVERY, value) ? ok(value) : undefined;
    case 'plainAmount':
      return listed(ARENA_PLAIN_AMOUNTS, value) ? ok(value) : undefined;
    case 'giftEntry':
    case 'lifeOn':
    case 'likeBoost':
    case 'pilot':
    case 'superAI':
      return typeof value === 'boolean' ? ok(value) : undefined;
  }
  return undefined;
}

/**
 * The seat gift's value as the operator typed it: a whole number of coins from 0 to
 * ARENA_SEAT_PRICE_MAX. Anything else, an empty entry included, keeps `last`.
 */
export function readSeatPrice(typed: string, last: number): number {
  const text = typed.trim();
  if (!/^\d+$/.test(text)) return last;
  return sanitizeArenaSetting('seatPrice', Number(text)) ?? last;
}

/**
 * The settings saved in storage, read back: each value kept if the game still accepts it, the
 * default otherwise. Anything unreadable gives the defaults.
 */
export function readArenaSettings(raw: string | null | undefined): ArenaSettings {
  let saved: unknown;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  const out: Record<string, unknown> = { ...ARENA_DEFAULTS };
  if (isRecord(saved))
    for (const name of Object.keys(ARENA_DEFAULTS) as ArenaSettingName[]) {
      const clean = sanitizeArenaSetting(name, saved[name]);
      if (clean !== undefined) out[name] = clean;
    }
  return out as unknown as ArenaSettings;
}
