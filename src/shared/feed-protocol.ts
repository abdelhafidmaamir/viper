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

/** Berries a TikTok gift is worth in this mode: a Rose drops 1, a Rosa 10, any other gift 0. */
export function berriesPerGift(name: string | undefined): number {
  const key = (name ?? '').trim().toLowerCase();
  return key === 'rose' || key === 'rosa' ? FEED_GIFTS[key] : 0;
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
] as const;
export type FeedWeather = (typeof FEED_WEATHERS)[number];

/** Time-of-day presets, in [0, 1): 0 is midnight, 0.5 is noon. */
export const FEED_HOURS = [0.02, 0.22, 0.5, 0.78] as const;

/** Simulated audience size: 0 is off. */
export const CROWD_LEVELS = [0, 1, 2, 3] as const;
export type CrowdLevel = (typeof CROWD_LEVELS)[number];

/** Board share a round starts at: 0 is the normal start (short snake, sprint to 40%). */
export const START_FILLS = [0, 0.5, 0.75, 0.9, 0.95] as const;

export interface FeedSettings {
  readonly weather: FeedWeather;
  readonly hour: number;
  /** Each round draws a new weather and hour. */
  readonly autoAmbience: boolean;
  readonly language: 'en' | 'fr';
  /** Length the snake starts each round at, as a share of the board (START_FILLS). */
  readonly startFill: number;
  /** Viewer alerts under the board (joins, likes, shares, follows). */
  readonly alerts: boolean;
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
    case 'autoAmbience':
      return typeof value === 'boolean' ? ok(value) : undefined;
    case 'language':
      return value === 'en' || value === 'fr' ? ok(value) : undefined;
    case 'alerts':
      return typeof value === 'boolean' ? ok(value) : undefined;
    case 'startFill':
      return START_FILLS.includes(value as (typeof START_FILLS)[number]) ? ok(value) : undefined;
  }
  return undefined;
}
