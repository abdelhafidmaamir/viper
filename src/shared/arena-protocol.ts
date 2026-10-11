/**
 * Snake Arena, the third mode: one snake per viewer on a shared board, driven by likes and gifts
 * only. Its window reuses the Feed scene and the Feed protocol (feed-protocol.ts) for everything
 * around the board, on a channel of its own. This file adds what only the arena has: the game's
 * tuning values, the command that sets them, and the state the board publishes.
 */

export const ARENA_CHANNEL = 'viper-arena';

/** Snakes on the board at once. Viewers past that wait for a place. */
export const ARENA_PLACES = [4, 6, 8, 10, 12] as const;
/** Likes a viewer sends to fill their entry ring and bring their snake onto the board. */
export const ARENA_ENTRY_LIKES = [10, 25, 50, 100, 200] as const;
/** Fastest a snake may go on likes, as a multiple of its normal speed. */
export const ARENA_BOOST_CAPS = [1, 1.25, 1.5, 2] as const;
/** Berries one gift must be worth to give its owner's snake a shield; 0 never does. */
export const ARENA_SHIELD_GIFTS = [0, 5, 10, 30, 100] as const;
/** Seconds a round lasts before its end screen. */
export const ARENA_ROUND_LENGTHS = [60, 120, 180, 300, 600] as const;
/** Who may eat a gift's berries: only the snake of the viewer who sent it, or any snake. */
export const ARENA_GIFT_BERRIES = ['owner', 'shared'] as const;
export type ArenaGiftBerries = (typeof ARENA_GIFT_BERRIES)[number];
/** The board keeps at least this many snakes, adding wild ones while few viewers play; 0 is off. */
export const ARENA_WILD_SNAKES = [0, 2, 3, 4, 6] as const;

export interface ArenaSettings {
  /** Snakes on the board at once (ARENA_PLACES). */
  readonly places: number;
  /** Likes to fill the entry ring (ARENA_ENTRY_LIKES). */
  readonly entryLikes: number;
  /** Speed cap on likes (ARENA_BOOST_CAPS). */
  readonly boostCap: number;
  /** Gift size, in berries, that buys a shield (ARENA_SHIELD_GIFTS). */
  readonly shieldGift: number;
  /** Round length in seconds (ARENA_ROUND_LENGTHS). */
  readonly roundLength: number;
  /** Whether a gift's berries are for its owner only (ARENA_GIFT_BERRIES). */
  readonly giftBerries: ArenaGiftBerries;
  /** Least snakes on the board, wild ones filling in (ARENA_WILD_SNAKES). */
  readonly wildSnakes: number;
}

export type ArenaSettingName = keyof ArenaSettings;

export const ARENA_DEFAULTS: ArenaSettings = {
  places: 8,
  entryLikes: 50,
  boostCap: 1.5,
  shieldGift: 10,
  roundLength: 180,
  giftBerries: 'owner',
  wildSnakes: 3,
};

/** One of the game's tuning values; the Feed settings travel as Feed commands. */
export interface ArenaCommand {
  readonly cmd: 'arena-setting';
  readonly name: ArenaSettingName;
  readonly value: unknown;
}

export interface ArenaState {
  readonly settings: ArenaSettings;
  /** Seconds before the round ends, counted only while it plays. */
  readonly secondsLeft: number;
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
    case 'wildSnakes':
      return listed(ARENA_WILD_SNAKES, value) ? ok(value) : undefined;
  }
  return undefined;
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
