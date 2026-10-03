/**
 * Messages between the Feed the Snake window and its control room, over their own
 * `BroadcastChannel`: the duel's channel and protocol stay untouched, so neither mode can break
 * the other.
 */

export const FEED_CHANNEL = 'viper-feed';

/** How often the game publishes its state to the control room. */
export const FEED_STATE_INTERVAL_MS = 500;

/** The two gifts that feed the snake, and the berries one of each drops. Nothing else counts. */
export const FEED_GIFTS = { rose: 1, rosa: 10 } as const;
export type FeedGift = keyof typeof FEED_GIFTS;

/**
 * Berries one of a TikTok gift is worth in this mode: one per coin, for the Rose (1) and the Rosa
 * (10) only; any other gift is worth 0. The coin value TikFinity reports wins over the name's
 * usual price, so what a viewer paid is exactly what drops.
 */
export function berriesPerGift(name: string | undefined, coins?: number): number {
  const key = (name ?? '').trim().toLowerCase();
  if (key !== 'rose' && key !== 'rosa') return 0;
  return coins !== undefined && coins >= 1 && coins <= 100 ? Math.round(coins) : FEED_GIFTS[key];
}

/** One gift as the game received it, for the control room's proof list. */
export interface FeedGiftLine {
  readonly at: number;
  readonly nickname: string;
  readonly name: string;
  readonly count: number;
  /** Berries it gave; 0 for a gift that does not feed the snake. */
  readonly berries: number;
}

/** Forest weathers, the same set the duel offers. */
export const FEED_WEATHERS = [
  'rain',
  'snow',
  'autumn',
  'summer',
  'spring',
  'storm',
  'stars',
  'aurora',
  'fireflies',
  'embers',
  'mist',
  'sea',
] as const;
export type FeedWeather = (typeof FEED_WEATHERS)[number];

/** Time-of-day presets, in [0, 1): 0 is midnight, 0.5 is noon. */
export const FEED_HOURS = [0.02, 0.22, 0.5, 0.78] as const;

/** Simulated audience size: 0 is off. */
export const CROWD_LEVELS = [0, 1, 2, 3] as const;
export type CrowdLevel = (typeof CROWD_LEVELS)[number];

/** Board share a round starts at: 0 is the normal start (short snake, sprint to 40%). */
export const START_FILLS = [0, 0.5, 0.75, 0.9, 0.95] as const;

/**
 * How often the same supporter gets their big entrance, in minutes: 0 at every arrival, 9999 once
 * per live, -1 never (the gold alert at the bottom only).
 */
/** Seconds the round's end screen stays up before the next round starts. */
export const ROUND_HOLDS = [5, 10, 15, 20, 25, 30] as const;

export const ENTRANCE_GAPS = [0, 5, 15, 30, 9999, -1] as const;
export const ONCE_PER_LIVE = 9999;

/**
 * How a gift from someone who has given before is thanked: around the flower that pours it, on a
 * tray in the board's corner (the row sliding in, or its photo coming down from the flower one
 * of four ways), or with an entrance over the board. A first gift ever always gets the entrance.
 */
export const GIFT_THANKS = [
  'flower',
  'tray',
  'tray-arc',
  'tray-comet',
  'tray-rings',
  'tray-butterflies',
  'classic',
] as const;
export type GiftThanksSetting = (typeof GIFT_THANKS)[number];

/** What the round's top giver wears over their photo: the classic crown or one of the others. */
export const CROWN_STYLES = ['classic', 'laurel', 'diadem', 'star', 'lotus'] as const;
export type CrownStyle = (typeof CROWN_STYLES)[number];

/**
 * Gifter level across TikTok from which a viewer who has not given here gets the ranked welcome
 * (a gold edge on their arrival card, a little more time on screen); 0 turns it off.
 */
export const RANKED_WELCOME_LEVELS = [0, 10, 20, 30, 40] as const;

/** The snake's skin: the classic bands and chevrons, or chevrons on a darker back. */
export const SNAKE_SKINS = ['classic', 'dark-back'] as const;
export type SnakeSkin = (typeof SNAKE_SKINS)[number];

/** Minutes the sky takes to go once round the clock, night to night: 0 keeps the hour still. */
export const DAY_CYCLES = [0, 10, 20, 30, 60] as const;

export interface FeedSettings {
  readonly weather: FeedWeather;
  readonly hour: number;
  /** The hour moves on by itself, a full day every so many minutes (DAY_CYCLES). */
  readonly dayCycle: number;
  /** Each round draws a new weather and hour. */
  readonly autoAmbience: boolean;
  readonly language: 'en' | 'fr';
  /** Length the snake starts each round at, as a share of the board (START_FILLS). */
  readonly startFill: number;
  /** Viewer alerts under the board (joins, likes, shares, follows). */
  readonly alerts: boolean;
  /** Supporter entrances over the board: minutes between two for the same person (ENTRANCE_GAPS). */
  readonly entranceGap: number;
  /** Moderators' TikTok @handles, comma separated, for when TikTok does not say so itself. */
  readonly mods: string;
  /** Seconds the end screen and its leaderboard stay up (ROUND_HOLDS). */
  readonly roundHold: number;
  /** How a gift is thanked (GIFT_THANKS). */
  readonly giftThanks: GiftThanksSetting;
  /** The tray's rows show the giver's title of the day. */
  readonly giftTitles: boolean;
  /** The likers' animals show their like count on the picture. */
  readonly likeCount: boolean;
  /** What the round's top giver wears (CROWN_STYLES). */
  readonly crownStyle: CrownStyle;
  /** The snake's skin (SNAKE_SKINS). */
  readonly snakeSkin: SnakeSkin;
  /** Ranked welcome threshold (RANKED_WELCOME_LEVELS). */
  readonly rankedWelcome: number;
}

export type FeedSettingName = keyof FeedSettings;

export type FeedCommand =
  /** A test gift from the control room, as if `nickname` sent `count` of it. */
  | {
      readonly cmd: 'gift';
      readonly gift: FeedGift;
      readonly count: number;
      readonly nickname?: string;
    }
  | { readonly cmd: 'likes'; readonly count: number; readonly nickname?: string }
  | { readonly cmd: 'bridge-start'; readonly url?: string }
  | { readonly cmd: 'bridge-stop' }
  | { readonly cmd: 'round' }
  /** Test shortcut: jumps a few cells from a full board, to rehearse the end screen. */
  | { readonly cmd: 'near-full' }
  | { readonly cmd: 'crowd'; readonly level: CrowdLevel }
  /** Gives a viewer berries by hand (to make up for a loss): they rank like a gift. */
  | { readonly cmd: 'grant'; readonly nickname: string; readonly count: number }
  /** Supporters from before the game kept count (TikTok's top viewers list): name and coins. */
  | {
      readonly cmd: 'seed-supporters';
      readonly lines: readonly {
        readonly nickname: string;
        readonly berries: number;
        readonly id?: string;
      }[];
    }
  /** Ends the supporter entrance on screen now. */
  | { readonly cmd: 'skip-entrance' }
  /**
   * Rehearsal: a made-up supporter arrives (a gifter, a top 3 place, or a moderator), or sends
   * their first gift.
   */
  | {
      readonly cmd: 'test-entrance';
      readonly rank?: number;
      readonly mod?: boolean;
      readonly first?: boolean;
    }
  | { readonly cmd: 'setting'; readonly name: FeedSettingName; readonly value: unknown };

export interface FeedLeader {
  readonly nickname: string;
  readonly coins: number;
}

export interface FeedState {
  readonly bridge: unknown;
  readonly phase: 'ready' | 'playing' | 'full';
  readonly round: number;
  /** Which of the five routes this round follows, 1 to 5. */
  readonly pattern: number;
  /** Board filled, 0 to 1. */
  readonly fill: number;
  readonly cells: number;
  readonly total: number;
  readonly berries: number;
  /** Berries still waiting in the flower. */
  readonly waiting: number;
  readonly eaten: number;
  readonly leaders: readonly FeedLeader[];
  readonly likes: number;
  /** The last gifts received, newest first. */
  readonly gifts: readonly FeedGiftLine[];
  readonly crowd: CrowdLevel;
  readonly settings: FeedSettings;
  /** Frames per second over the last second, as the game window renders them. */
  readonly fps: number;
  /** Frames slower than 20 ms over the last second. */
  readonly slowFrames: number;
  readonly errors: number;
}

export interface FeedStateMessage {
  readonly feed: FeedState;
}

const COMMANDS: ReadonlySet<string> = new Set<FeedCommand['cmd']>([
  'gift',
  'likes',
  'bridge-start',
  'bridge-stop',
  'round',
  'near-full',
  'crowd',
  'setting',
  'grant',
  'skip-entrance',
  'test-entrance',
  'seed-supporters',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Narrows an untrusted channel payload to a command with a known `cmd`. */
export function isFeedCommand(value: unknown): value is FeedCommand {
  return isRecord(value) && typeof value.cmd === 'string' && COMMANDS.has(value.cmd);
}

/** Narrows an untrusted channel payload to a state message; anything else is ignored. */
export function decodeFeedState(data: unknown): FeedState | null {
  if (!isRecord(data) || !isRecord(data.feed)) return null;
  const feed = data.feed;
  if (typeof feed.fill !== 'number' || !isRecord(feed.settings) || !Array.isArray(feed.leaders))
    return null;
  return feed as unknown as FeedState;
}

/** Clamps a setting sent over the channel to a value the game accepts, or undefined. */
export function sanitizeSetting<K extends FeedSettingName>(
  name: K,
  value: unknown,
): FeedSettings[K] | undefined {
  const ok = (v: unknown): FeedSettings[K] => v as FeedSettings[K];
  switch (name) {
    case 'weather':
      return FEED_WEATHERS.includes(value as FeedWeather) ? ok(value) : undefined;
    case 'hour':
      return typeof value === 'number' && value >= 0 && value < 1 ? ok(value) : undefined;
    case 'dayCycle':
      return DAY_CYCLES.includes(value as (typeof DAY_CYCLES)[number]) ? ok(value) : undefined;
    case 'autoAmbience':
      return typeof value === 'boolean' ? ok(value) : undefined;
    case 'language':
      return value === 'en' || value === 'fr' ? ok(value) : undefined;
    case 'alerts':
      return typeof value === 'boolean' ? ok(value) : undefined;
    case 'startFill':
      return START_FILLS.includes(value as (typeof START_FILLS)[number]) ? ok(value) : undefined;
    case 'entranceGap':
      return ENTRANCE_GAPS.includes(value as (typeof ENTRANCE_GAPS)[number])
        ? ok(value)
        : undefined;
    case 'mods':
      return typeof value === 'string' ? ok(value.slice(0, 600)) : undefined;
    case 'roundHold':
      return ROUND_HOLDS.includes(value as (typeof ROUND_HOLDS)[number]) ? ok(value) : undefined;
    case 'giftThanks':
      return GIFT_THANKS.includes(value as GiftThanksSetting) ? ok(value) : undefined;
    case 'rankedWelcome':
      return RANKED_WELCOME_LEVELS.includes(value as (typeof RANKED_WELCOME_LEVELS)[number])
        ? ok(value)
        : undefined;
    case 'snakeSkin':
      return SNAKE_SKINS.includes(value as SnakeSkin) ? ok(value) : undefined;
    case 'crownStyle':
      return CROWN_STYLES.includes(value as CrownStyle) ? ok(value) : undefined;
    case 'likeCount':
    case 'giftTitles':
      return typeof value === 'boolean' ? ok(value) : undefined;
  }
  return undefined;
}
