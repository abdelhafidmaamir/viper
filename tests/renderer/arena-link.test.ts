import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ARENA_DEFAULTS,
  decodeArenaState,
  type ArenaSettingName,
} from '../../src/shared/arena-protocol.ts';
import { newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { queue, rings, paidQueue } from '../../src/renderer/arena/entry.ts';
import { locked, qualLikes } from '../../src/renderer/arena/qualify.ts';
import {
  ARENA_STORAGE_KEY,
  applyArenaCommand,
  arenaSettings,
  arenaSnapshot,
  arenaStorage,
  countOnArena,
  PAID_QUEUE_KEY,
  linkArenaControl,
  restoreArenaSettings,
  restorePaidQueue,
} from '../../src/renderer/arena/link.ts';
import { arena } from '../../src/renderer/arena/rules.ts';
import {
  applyFeedCommand,
  receiveFeedEvent,
  type FeedLinkDeps,
} from '../../src/renderer/feed/control-link.ts';
import { game, hooks, newRound } from '../../src/renderer/feed/state.ts';
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
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  beforeEach(() => {
    Object.assign(arenaSettings, ARENA_DEFAULTS, { continuous: false });
    // Gifts buy seats on the board here (the Money tab's switch on), unless a test says otherwise.
    setArenaSettings({
      ...ARENA_DEFAULTS,
      continuous: false,
      pilot: 0,
      wildSnakes: 0,
      giftSeats: true,
    });
    arena.viewers.clear();
    rings.clear();
    queue.length = 0;
    game.queue = [];
    paidQueue.length = 0;
    arena.snakes = [];
    arena.food = [];
    arena.foodAt.clear();
    newRound(() => 0.5);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('likes from the live count in the qualifying and for the round', () => {
    receiveFeedEvent({ type: 'like', nickname: 'ana', n: 5 });
    expect(qualLikes.get('ana')).toBe(5);
    expect(game.likes.get('ana')?.likes).toBe(5);
  });

  it('a gift from the live locks its giver a seat and counts for the round', () => {
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 2, nickname: 'ben' });
    expect(locked).toContain('ben');
    expect(game.fans.get('ben')?.coins).toBe(20);
  });

  it('comments, joins, follows, shares and unpriced gifts do nothing on the board', () => {
    for (const type of ['comment', 'join', 'follow', 'share', 'viewers'] as const)
      receiveFeedEvent({ type, nickname: 'cara', total: 12 });
    receiveFeedEvent({ type: 'gift', name: 'Lion', value: 29999, nickname: 'cara' });
    expect(arena.viewers.has('cara')).toBe(false);
    expect(rings.has('cara')).toBe(false);
  });

  it('test gifts, test likes and berries given by hand reach the board', () => {
    const d = deps();
    applyFeedCommand({ cmd: 'gift', gift: 'rosa', count: 1 }, d);
    applyFeedCommand({ cmd: 'likes', count: 25, nickname: 'lou' }, d);
    applyFeedCommand({ cmd: 'grant', nickname: 'dan', count: 7 }, d);
    expect(locked.some((n) => n.startsWith('tester'))).toBe(true);
    expect(qualLikes.get('lou')).toBe(25);
    expect(locked).toContain('dan');
  });

  it('during a real live, rehearsal gifts and likes reach nothing', () => {
    const live = deps(store(), true);
    applyFeedCommand({ cmd: 'gift', gift: 'rosa', count: 5 }, live);
    applyFeedCommand({ cmd: 'likes', count: 25, nickname: 'lou' }, live);
    expect(locked).toHaveLength(0);
    expect(qualLikes.has('lou')).toBe(false);
    // Berries given back by hand still count on a live.
    applyFeedCommand({ cmd: 'grant', nickname: 'eve', count: 3 }, live);
    expect(locked).toContain('eve');
  });

  it('a gift at the life price gives a life, not berries, only with the life gift on', () => {
    receiveFeedEvent({ type: 'gift', name: 'Hat', value: 30, nickname: 'off' });
    expect(arena.viewers.get('off')?.lives ?? 0).toBe(0);
    setArenaSettings({
      ...ARENA_DEFAULTS,
      continuous: false,
      pilot: 0,
      wildSnakes: 0,
      giftSeats: true,
      lifeOn: true,
    });
    receiveFeedEvent({ type: 'gift', name: 'Hat', value: 30, nickname: 'liv' });
    expect(arena.viewers.get('liv')?.lives).toBe(1);
    expect(locked).toContain('liv');
    expect(game.queue.some((q) => q.nickname === 'liv')).toBe(false);
  });

  it('keeps the tuning values the game accepts, under its own key, and reads them back', () => {
    const map = new Map<string, string>();
    setting('places', 8, map);
    setting('places', 13, map);
    setting('giftBerries', 'shared', map);
    setting('speed', 'fast', map);
    expect(arenaSettings.places).toBe(8);
    expect(JSON.parse(map.get(ARENA_STORAGE_KEY) ?? '{}')).toEqual({
      ...ARENA_DEFAULTS,
      continuous: false,
      places: 8,
      giftBerries: 'shared',
    });
    Object.assign(arenaSettings, ARENA_DEFAULTS, { continuous: false });
    restoreArenaSettings(store(map));
    expect(arenaSnapshot().settings).toEqual({
      ...ARENA_DEFAULTS,
      continuous: false,
      places: 8,
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

  it('the paid queue is saved as it changes, read back after a reload and shown to the room', () => {
    vi.useFakeTimers();
    const map = new Map<string, string>([
        [ARENA_STORAGE_KEY, JSON.stringify({ giftSeats: true, continuous: false })],
      ]),
      sent: unknown[] = [];
    const stop = linkArenaControl(
      { storage: store(map) },
      { postMessage: (message) => sent.push(message), addEventListener: () => undefined },
    );
    newArenaRound();
    // Two givers outside the qualifying: in line, saved.
    arena.phase = 'play';
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 1, nickname: 'ana' });
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 1, nickname: 'ben' });
    expect(paidQueue.map((q) => q.nickname)).toEqual(['ana', 'ben']);
    expect(JSON.parse(map.get(PAID_QUEUE_KEY) ?? '[]')).toHaveLength(2);
    vi.advanceTimersByTime(500);
    expect(decodeArenaState(sent.at(-1))?.paidQueue).toEqual(['ana', 'ben']);
    stop();
    // The window reloads: the queue comes back as it was; anything broken is left out.
    paidQueue.length = 0;
    map.set(
      PAID_QUEUE_KEY,
      JSON.stringify([
        ...(JSON.parse(map.get(PAID_QUEUE_KEY) ?? '[]') as unknown[]),
        { nick: 1 },
        'x',
      ]),
    );
    restorePaidQueue(store(map));
    expect(paidQueue.map((q) => q.nickname)).toEqual(['ana', 'ben']);
    // Gifts switched off: the queue empties, its save too, and a reload brings nobody back.
    const saved = { storage: store(map) };
    applyArenaCommand({ cmd: 'arena-setting', name: 'giftSeats', value: false }, saved);
    expect(paidQueue).toHaveLength(0);
    expect(JSON.parse(map.get(PAID_QUEUE_KEY) ?? '[1]')).toEqual([]);
    expect(JSON.parse(map.get(ARENA_STORAGE_KEY) ?? '{}')).toMatchObject({ giftSeats: false });
    map.set(PAID_QUEUE_KEY, JSON.stringify([{ nickname: 'ana' }]));
    restorePaidQueue(store(map));
    expect(paidQueue).toHaveLength(0);
  });
});
