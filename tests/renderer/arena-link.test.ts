import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ARENA_DEFAULTS,
  decodeArenaState,
  type ArenaSettingName,
} from '../../src/shared/arena-protocol.ts';
import {
  advanceArena,
  arenaStatus,
  endArenaRound,
  newArenaRound,
  setArenaSettings,
} from '../../src/renderer/arena/arena.ts';
import {
  ARENA_STORAGE_KEY,
  applyArenaCommand,
  arenaSettings,
  arenaSnapshot,
  arenaStorage,
  countOnArena,
  linkArenaControl,
  restoreArenaSettings,
} from '../../src/renderer/arena/link.ts';
import {
  applyFeedCommand,
  receiveFeedEvent,
  type FeedLinkDeps,
} from '../../src/renderer/feed/control-link.ts';
import { game, newRound } from '../../src/renderer/feed/state.ts';
import {
  restoreSupporters,
  settingsIn,
  supportersText,
} from '../../src/renderer/feed/supporters.ts';

function store(map = new Map<string, string>()): FeedLinkDeps['storage'] {
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

function deps(storage = store(), connected = false): FeedLinkDeps {
  return {
    bridge: {
      start: () => undefined,
      stop: () => undefined,
      process: () => undefined,
      state: () => ({ connected }),
    },
    storage,
    metrics: () => ({ fps: 60, slowFrames: 0, errors: 0 }),
    setCrowd: () => undefined,
    crowd: () => 0,
    someone: () => 'tester',
    shareSettings: false,
  };
}

const setting = (name: ArenaSettingName, value: unknown, map = new Map<string, string>()): void => {
  applyArenaCommand({ cmd: 'arena-setting', name, value }, { storage: store(map) });
};

describe('arena link', () => {
  beforeAll(() => {
    countOnArena();
  });

  beforeEach(() => {
    game.queue = [];
    newRound(() => 0.5);
    Object.assign(arenaSettings, ARENA_DEFAULTS);
    setArenaSettings({ ...ARENA_DEFAULTS });
    newArenaRound();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('likes and gifts from the live reach the board and the round', () => {
    receiveFeedEvent({ type: 'like', nickname: 'ana', n: 5 });
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 2, nickname: 'ben' });
    expect(arenaStatus()).toMatchObject({ likes: 5, eaten: 20 });
    // The round keeps them too, for the flower and the end screen's rankings.
    expect(game.likes.get('ana')?.likes).toBe(5);
    expect(game.fans.get('ben')?.coins).toBe(20);
  });

  it('comments, joins, follows, shares and unpriced gifts do nothing on the board', () => {
    for (const type of ['comment', 'join', 'follow', 'share', 'viewers'] as const)
      receiveFeedEvent({ type, nickname: 'cara', total: 12 });
    receiveFeedEvent({ type: 'gift', name: 'Lion', value: 29999, nickname: 'cara' });
    expect(arenaStatus()).toMatchObject({ likes: 0, eaten: 0 });
  });

  it('test gifts, test likes and berries given by hand reach the board', () => {
    const d = deps();
    applyFeedCommand({ cmd: 'gift', gift: 'rosa', count: 1 }, d);
    applyFeedCommand({ cmd: 'likes', count: 25 }, d);
    applyFeedCommand({ cmd: 'grant', nickname: 'dan', count: 7 }, d);
    expect(arenaStatus()).toMatchObject({ likes: 25, eaten: 17 });
  });

  it('during a real live, rehearsal gifts and likes reach nothing', () => {
    const live = deps(store(), true);
    applyFeedCommand({ cmd: 'gift', gift: 'rosa', count: 5 }, live);
    applyFeedCommand({ cmd: 'likes', count: 25 }, live);
    expect(arenaStatus()).toMatchObject({ likes: 0, eaten: 0 });
    // Berries given back by hand still count on a live.
    applyFeedCommand({ cmd: 'grant', nickname: 'eve', count: 3 }, live);
    expect(arenaStatus().eaten).toBe(3);
  });

  it('the round clock runs out once, at the length set when the round began', () => {
    setting('roundLength', 60);
    newArenaRound();
    setting('roundLength', 600);
    expect(arenaStatus().roundLength).toBe(60);
    expect(advanceArena(59.5)).toBe(false);
    expect(advanceArena(1)).toBe(true);
    expect(advanceArena(1)).toBe(false);
    expect(arenaStatus().secondsLeft).toBe(0);
    newArenaRound();
    expect(arenaStatus().secondsLeft).toBe(600);
  });

  it('a gift sent once the round is over plays in the next one', () => {
    endArenaRound();
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 1, nickname: 'late' });
    expect(arenaStatus().eaten).toBe(0);
    expect(advanceArena(1)).toBe(false);
    newArenaRound();
    expect(arenaStatus().eaten).toBe(10);
  });

  it('keeps the tuning values the game accepts, under its own key, and reads them back', () => {
    const map = new Map<string, string>();
    setting('places', 12, map);
    setting('places', 13, map);
    setting('giftBerries', 'shared', map);
    setting('speed' as ArenaSettingName, 3, map);
    expect(arenaSettings.places).toBe(12);
    expect(JSON.parse(map.get(ARENA_STORAGE_KEY) ?? '{}')).toEqual({
      ...ARENA_DEFAULTS,
      places: 12,
      giftBerries: 'shared',
    });
    Object.assign(arenaSettings, ARENA_DEFAULTS);
    restoreArenaSettings(store(map));
    expect(arenaSnapshot().settings).toEqual({
      ...ARENA_DEFAULTS,
      places: 12,
      giftBerries: 'shared',
    });
  });

  it("keeps the arena's Feed settings apart from Feed's own", () => {
    const map = new Map<string, string>(),
      storage = arenaStorage(store(map));
    applyFeedCommand({ cmd: 'setting', name: 'weather', value: 'snow' }, deps(storage));
    storage.setItem(ARENA_STORAGE_KEY, '{}');
    store(map).setItem('other', 'x');
    expect([...map.keys()].sort()).toEqual(['other', 'viper-arena-game', 'viper-arena-settings']);
    expect(storage.getItem('viper-feed-settings')).toBe(map.get('viper-arena-settings'));
  });

  it("leaves Feed's settings in the supporters list when the arena changes its own", () => {
    restoreSupporters(
      JSON.stringify({
        savedAt: 1,
        supporters: [{ id: 'x', nickname: 'x', berries: 1 }],
        settings: { startFill: 0.5 },
      }),
    );
    applyFeedCommand({ cmd: 'setting', name: 'startFill', value: 0.75 }, deps());
    expect(settingsIn(supportersText() ?? '')?.startFill).toBe(0.5);
    // Feed's own link still sends them along.
    applyFeedCommand(
      { cmd: 'setting', name: 'startFill', value: 0.9 },
      { ...deps(), shareSettings: true },
    );
    expect(settingsIn(supportersText() ?? '')?.startFill).toBe(0.9);
    applyFeedCommand({ cmd: 'setting', name: 'startFill', value: 0 }, deps());
  });

  it('publishes the board and applies tuning values from the channel', () => {
    vi.useFakeTimers();
    const sent: unknown[] = [],
      listeners: ((event: MessageEvent<unknown>) => void)[] = [];
    const stop = linkArenaControl(
      { storage: store() },
      {
        postMessage: (message) => sent.push(message),
        addEventListener: (_type, listener) => listeners.push(listener),
      },
    );
    const post = (data: unknown): void => {
      for (const listener of listeners) listener({ data } as MessageEvent<unknown>);
    };
    // Feed's commands travel on the same channel: they are Feed's link's to apply.
    post({ cmd: 'round' });
    post({ cmd: 'arena-setting', name: 'wildSnakes', value: 6 });
    vi.advanceTimersByTime(500);
    expect(decodeArenaState(sent[0])?.settings.wildSnakes).toBe(6);
    stop();
    vi.advanceTimersByTime(2000);
    expect(sent).toHaveLength(1);
  });
});
