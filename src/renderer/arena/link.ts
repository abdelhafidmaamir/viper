// Snake Arena's end of its control room. What the arena shares with Feed (ambience, alerts,
// entrances, gift thanks and prices, test gifts, the TikFinity bridge, the simulated audience)
// goes through Feed's own link, feed/control-link.ts, on the arena's channel and under the arena's
// storage keys. This file adds the rest: the board hears every like and gift Feed's link counts,
// and the game's tuning values are set, kept and published here.

import {
  ARENA_DEFAULTS,
  isArenaCommand,
  readArenaSettings,
  sanitizeArenaSetting,
  type ArenaCommand,
  type ArenaSettingName,
  type ArenaSettings,
  type ArenaState,
  type ArenaStateMessage,
} from '../../shared/arena-protocol.ts';
import { FEED_STATE_INTERVAL_MS } from '../../shared/feed-protocol.ts';
import { board, type FeedLinkDeps } from '../feed/control-link.ts';
import { note } from '../feed/journal.ts';
import { gift, like } from '../feed/state.ts';
import { arenaGift, arenaLike, arenaStatus, setArenaSettings } from './arena.ts';
import { arenaLife, isLifeGift } from './entry.ts';

type Store = FeedLinkDeps['storage'];

/** The game's tuning values, under a key of their own next to the renamed Feed ones. */
export const ARENA_STORAGE_KEY = 'viper-arena-game';

const FEED_PREFIX = 'viper-feed-',
  ARENA_PREFIX = 'viper-arena-';

/**
 * Feed's link saves its settings and its money segments under `viper-feed-...` keys. Both windows
 * share one origin, so one storage: handed this instead, the arena keeps its own copies under
 * `viper-arena-...` and never changes what Feed reads back.
 */
export function arenaStorage(storage: Store): Store {
  const rename = (key: string): string =>
    key.startsWith(FEED_PREFIX) ? ARENA_PREFIX + key.slice(FEED_PREFIX.length) : key;
  return {
    getItem: (key) => storage.getItem(rename(key)),
    setItem: (key, value) => {
      storage.setItem(rename(key), value);
    },
  };
}

/**
 * Every like and gift Feed's link counts, from the live, a test button or the rehearsal audience:
 * the round keeps them for the flower and the end screen's rankings, and the board gets them too.
 */
export function countOnArena(): void {
  board.gift = (nickname, avatar, berries, live) => {
    gift(nickname, avatar, berries, live);
    arenaGift(nickname, avatar, berries);
  };
  // The life gift's price buys a life, not berries, whatever the price list says.
  board.instead = isLifeGift;
  board.unpriced = (nickname, avatar, coins, n) => {
    if (!isLifeGift(coins)) return false;
    arenaLife(nickname, avatar, n);
    return true;
  };
  board.like = (nickname, avatar, n) => {
    like(nickname, avatar, n);
    arenaLike(nickname, avatar, n);
  };
}

export const arenaSettings: { -readonly [K in ArenaSettingName]: ArenaSettings[K] } = {
  ...ARENA_DEFAULTS,
};

/** Storage can throw (quota, disabled storage). Preferences are a convenience, never fatal. */
function safely<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

/** Reads the tuning values saved last session and hands them to the board. */
export function restoreArenaSettings(storage: Store): void {
  Object.assign(arenaSettings, readArenaSettings(safely(() => storage.getItem(ARENA_STORAGE_KEY))));
  setArenaSettings({ ...arenaSettings });
}

export interface ArenaLinkDeps {
  readonly storage: Store;
}

/** A tuning value from the control room: kept if the game accepts it, applied and saved. */
export function applyArenaCommand(command: ArenaCommand, deps: ArenaLinkDeps): void {
  const clean = sanitizeArenaSetting(command.name, command.value);
  if (clean === undefined) return;
  Object.assign(arenaSettings, { [command.name]: clean });
  setArenaSettings({ ...arenaSettings });
  note({ event: 'setting', source: 'manual', detail: `${command.name} = ${String(clean)}` });
  safely(() => {
    deps.storage.setItem(ARENA_STORAGE_KEY, JSON.stringify(arenaSettings));
  });
}

export function arenaSnapshot(): ArenaState {
  const s = arenaStatus();
  return {
    settings: { ...arenaSettings },
    secondsLeft: s.secondsLeft,
    snakes: s.snakes,
    trapped: s.trapped,
  };
}

export interface ArenaChannel {
  readonly postMessage: (message: ArenaStateMessage) => void;
  readonly addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
}

/**
 * Restores the tuning values, applies the arena's commands and publishes the board twice a
 * second, on the channel Feed's link also uses. Returns a disposer; the channel is Feed's to close.
 */
export function linkArenaControl(deps: ArenaLinkDeps, channel: ArenaChannel): () => void {
  restoreArenaSettings(deps.storage);
  channel.addEventListener('message', ({ data }) => {
    if (!isArenaCommand(data)) return;
    try {
      applyArenaCommand(data, deps);
    } catch (error) {
      // A bad command from the control room must never stop the show.
      console.error(`[arena control] "${data.name}" failed`, error);
    }
  });
  const timer = setInterval(() => {
    channel.postMessage({ arena: arenaSnapshot() });
  }, FEED_STATE_INTERVAL_MS);
  return () => {
    clearInterval(timer);
  };
}
