// The Feed the Snake window's end of its control room: settings (ambience, language) restored
// from the last session, commands applied, and the round published twice a second.

import {
  berriesPerGift,
  CROWD_LEVELS,
  FEED_CHANNEL,
  FEED_GIFTS,
  FEED_STATE_INTERVAL_MS,
  FEED_WEATHERS,
  isFeedCommand,
  sanitizeSetting,
  type CrowdLevel,
  type FeedCommand,
  type FeedGiftLine,
  type FeedSettingName,
  type FeedSettings,
  type FeedState,
  type FeedStateMessage,
} from '../../shared/feed-protocol.ts';
import { setLanguage } from '../engine/i18n.ts';
import { alertViewer, setAlertsOn } from './alerts.ts';
import type { AudienceEvent } from '../engine/types.ts';
import {
  PATTERNS,
  TOTAL,
  cells,
  game,
  gift,
  leaders,
  like,
  nearFull,
  newRound,
  repay,
  setStartFill,
  unpaid,
  waiting,
} from './state.ts';

const STORAGE_KEY = 'viper-feed-settings';
/** Berries viewers paid for and did not get yet, saved twice a second. */
const UNPAID_KEY = 'viper-feed-unpaid';

/** Gives back what the last session still owed; call once the first round has started. */
export function restoreUnpaid(storage: FeedLinkDeps['storage']): void {
  const raw = safely(() => storage.getItem(UNPAID_KEY));
  const saved = raw ? safely(() => JSON.parse(raw) as unknown) : null;
  if (!Array.isArray(saved)) return;
  repay(
    saved.flatMap((e: unknown) =>
      typeof e === 'object' &&
      e !== null &&
      'nickname' in e &&
      'n' in e &&
      typeof e.nickname === 'string' &&
      typeof e.n === 'number' &&
      e.n > 0 &&
      e.n <= 100000
        ? [{ nickname: e.nickname, n: Math.round(e.n) }]
        : [],
    ),
  );
}

export const settings: { -readonly [K in FeedSettingName]: FeedSettings[K] } = {
  weather: 'rain',
  hour: 0.06,
  autoAmbience: true,
  language: 'en',
  startFill: 0,
  alerts: true,
};

export interface FrameMetrics {
  readonly fps: number;
  readonly slowFrames: number;
  readonly errors: number;
}

export interface FeedLinkDeps {
  readonly bridge: TikFinityBridge;
  readonly storage: Pick<Storage, 'getItem' | 'setItem'>;
  readonly metrics: () => FrameMetrics;
  /** Sets the simulated audience size. */
  readonly setCrowd: (level: CrowdLevel) => void;
  readonly crowd: () => CrowdLevel;
  /** A random name for test gifts sent without one. */
  readonly someone: () => string;
}

/** TikFinity is connected: a real live, where nothing fake may reach the board. */
export function isLive(bridge: TikFinityBridge): boolean {
  try {
    const state = bridge.state();
    return typeof state === 'object' && state !== null && 'connected' in state
      ? state.connected === true
      : false;
  } catch {
    return false;
  }
}

/** Rehearsal commands: refused during a real live, so a stray key can never fake a gift. */
const REHEARSAL: ReadonlySet<FeedCommand['cmd']> = new Set(['gift', 'likes', 'near-full']);

/** Storage can throw (quota, disabled storage). Preferences are a convenience, never fatal. */
function safely<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

function apply(name: FeedSettingName, value: unknown): boolean {
  const clean = sanitizeSetting(name, value);
  if (clean === undefined) return false;
  Object.assign(settings, { [name]: clean });
  if (name === 'language') setLanguage(settings.language);
  if (name === 'startFill') setStartFill(settings.startFill);
  if (name === 'alerts') setAlertsOn(settings.alerts);
  return true;
}

export function restoreSettings(storage: FeedLinkDeps['storage']): void {
  const raw = safely(() => storage.getItem(STORAGE_KEY));
  if (!raw) return;
  const saved = safely(() => JSON.parse(raw) as unknown);
  if (typeof saved !== 'object' || saved === null) return;
  for (const name of Object.keys(settings) as FeedSettingName[])
    if (name in saved) apply(name, (saved as Record<string, unknown>)[name]);
}

/** A new weather and a fitting hour each round, as in the duel. */
export function rollAmbience(rand: () => number = Math.random): void {
  if (!settings.autoAmbience) return;
  const others = FEED_WEATHERS.filter((w) => w !== settings.weather);
  settings.weather = others[Math.floor(rand() * others.length)] ?? 'rain';
  const hours = [0.02, 0.22, 0.36, 0.5, 0.64, 0.78] as const;
  settings.hour =
    settings.weather === 'stars' ||
    settings.weather === 'aurora' ||
    settings.weather === 'fireflies'
      ? 0.02
      : settings.weather === 'embers'
        ? 0.78
        : settings.weather === 'spring'
          ? 0.36
          : (hours[Math.floor(rand() * hours.length)] ?? 0.22);
}

/** Every gift received, newest first, so the operator can check what each one gave. */
const GIFT_LOG = 12;
const giftLog: FeedGiftLine[] = [];

/**
 * Live events from the bridge: only the Rose (1 berry) and the Rosa (10 berries) feed the snake,
 * likes rank. Every other gift and event does nothing in this mode. Returns the gifts counted.
 */
export function receiveFeedEvent(ev: AudienceEvent | null | undefined): number {
  // A streak counts whole: Rose x500 drops 500 berries.
  const n = Math.max(1, Math.min(parseInt(String(ev?.n ?? 1)) || 1, 10000));
  if (ev?.type === 'like') {
    like(ev.nickname ?? 'viewer', ev.avatar, n);
    alertViewer('like', ev.nickname ?? '', ev.avatar, n);
  }
  if (ev?.type === 'join' || ev?.type === 'share' || ev?.type === 'follow')
    alertViewer(ev.type, ev.nickname ?? '', ev.avatar);
  if (ev?.type !== 'gift') return 0;
  const berries = berriesPerGift(ev.name ?? ev.gift, ev.value);
  giftLog.unshift({
    at: Date.now(),
    nickname: ev.nickname ?? 'viewer',
    name: ev.name ?? ev.gift ?? '?',
    count: n,
    berries: berries * n,
  });
  if (giftLog.length > GIFT_LOG) giftLog.length = GIFT_LOG;
  if (!berries) return 0;
  gift(ev.nickname ?? 'viewer', ev.avatar, berries * n);
  return n;
}

const count = (value: number): number => Math.max(1, Math.min(100, Math.round(value) || 1));

export function applyFeedCommand(command: FeedCommand, deps: FeedLinkDeps): void {
  const live = isLive(deps.bridge);
  if (live && REHEARSAL.has(command.cmd)) return;
  switch (command.cmd) {
    case 'gift':
      if (!(command.gift in FEED_GIFTS)) return;
      gift(
        command.nickname ?? deps.someone(),
        undefined,
        FEED_GIFTS[command.gift] * count(command.count),
      );
      return;
    case 'likes':
      like(command.nickname ?? deps.someone(), undefined, count(command.count));
      return;
    case 'bridge-start':
      deps.bridge.start(command.url);
      return;
    case 'bridge-stop':
      deps.bridge.stop();
      return;
    case 'round':
      newRound();
      return;
    case 'near-full':
      nearFull();
      return;
    case 'crowd':
      if (CROWD_LEVELS.includes(command.level)) deps.setCrowd(live ? 0 : command.level);
      return;
    case 'setting':
      if (!Object.hasOwn(settings, command.name) || !apply(command.name, command.value)) return;
      safely(() => {
        deps.storage.setItem(STORAGE_KEY, JSON.stringify(settings));
      });
      return;
  }
}

export function feedSnapshot(deps: FeedLinkDeps): FeedState {
  const m = deps.metrics();
  let likes = 0;
  for (const l of game.likes.values()) likes += l.likes;
  return {
    bridge: deps.bridge.state(),
    phase: game.full >= 0 ? 'full' : game.ready >= 0 ? 'ready' : 'playing',
    round: game.round,
    pattern: ((game.round - 1) % PATTERNS.length) + 1,
    fill: Math.min(1, game.len / TOTAL),
    cells: cells(),
    total: TOTAL,
    berries: game.berries.size,
    waiting: waiting(),
    eaten: game.eaten,
    leaders: leaders(5).map((f) => ({ nickname: f.nickname, coins: f.coins })),
    likes,
    gifts: [...giftLog],
    crowd: deps.crowd(),
    settings: { ...settings },
    fps: m.fps,
    slowFrames: m.slowFrames,
    errors: m.errors,
  };
}

export interface FeedChannel {
  readonly postMessage: (message: FeedStateMessage) => void;
  readonly addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
  readonly close: () => void;
}

/** Restores the settings, applies incoming commands and publishes state. Returns a disposer. */
export function linkFeedControl(
  deps: FeedLinkDeps,
  channel: FeedChannel = new BroadcastChannel(FEED_CHANNEL),
): () => void {
  restoreSettings(deps.storage);
  channel.addEventListener('message', ({ data }) => {
    if (!isFeedCommand(data)) return;
    try {
      applyFeedCommand(data, deps);
    } catch (error) {
      // A bad command from the control room must never stop the show.
      console.error(`[feed control] "${data.cmd}" failed`, error);
    }
  });
  const timer = setInterval(() => {
    channel.postMessage({ feed: feedSnapshot(deps) });
    safely(() => {
      deps.storage.setItem(UNPAID_KEY, JSON.stringify(unpaid()));
    });
  }, FEED_STATE_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    channel.close();
  };
}
