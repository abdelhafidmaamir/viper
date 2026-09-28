import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyFeedCommand,
  feedSnapshot,
  receiveFeedEvent,
  restoreSettings,
  restoreUnpaid,
  settings,
  type FeedLinkDeps,
} from '../../src/renderer/feed/control-link.ts';
import {
  TOTAL,
  advance,
  game,
  nearFull,
  newRound,
  unpaid,
  waiting,
} from '../../src/renderer/feed/state.ts';

function deps(storage = new Map<string, string>()): FeedLinkDeps {
  let crowd: 0 | 1 | 2 | 3 = 0;
  return {
    bridge: {
      start: () => undefined,
      stop: () => undefined,
      process: () => undefined,
      state: () => null,
    },
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
    },
    metrics: () => ({ fps: 60, slowFrames: 0, errors: 0 }),
    setCrowd: (level) => {
      crowd = level;
    },
    crowd: () => crowd,
    someone: () => 'tester',
  };
}

describe('feed control link', () => {
  beforeEach(() => {
    game.queue = [];
    newRound(() => 0.5);
  });

  it('a Rose drops 1 berry, a Rosa 10, other gifts nothing', () => {
    expect(receiveFeedEvent({ type: 'gift', name: 'Rose', n: 3, nickname: 'a' })).toBe(3);
    expect(waiting()).toBe(3);
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 2, nickname: 'b' });
    expect(waiting()).toBe(23);
    expect(receiveFeedEvent({ type: 'gift', name: 'Lion', value: 29999, nickname: 'c' })).toBe(0);
    expect(waiting()).toBe(23);
    expect(game.fans.has('c')).toBe(false);
  });

  it('a whole streak counts, however long', () => {
    receiveFeedEvent({ type: 'gift', name: 'Rose', n: 500, nickname: 'fan' });
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 60, nickname: 'fan' });
    expect(waiting()).toBe(1100);
    expect(game.queue[0]?.total).toBe(1100);
  });

  it('during a real live nothing fake reaches the board', () => {
    let crowd = 3;
    const live: FeedLinkDeps = {
      ...deps(),
      bridge: {
        start: () => undefined,
        stop: () => undefined,
        process: () => undefined,
        state: () => ({ connected: true }),
      },
      setCrowd: (level) => {
        crowd = level;
      },
    };
    applyFeedCommand({ cmd: 'gift', gift: 'rosa', count: 5 }, live);
    applyFeedCommand({ cmd: 'likes', count: 25 }, live);
    applyFeedCommand({ cmd: 'crowd', level: 2 }, live);
    expect(waiting()).toBe(0);
    expect(game.likes.size).toBe(0);
    expect(crowd).toBe(0);
    // Real gifts from TikFinity still count.
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 1, nickname: 'real' });
    expect(waiting()).toBe(10);
  });

  it('a Rosa gives exactly its coins in berries, and every gift is logged', () => {
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 5, value: 10, nickname: 'fan' });
    receiveFeedEvent({ type: 'gift', name: 'Rose', n: 1, value: 1, nickname: 'fan' });
    receiveFeedEvent({ type: 'gift', name: 'Lion', n: 1, value: 29999, nickname: 'rich' });
    expect(waiting()).toBe(51);
    const log = feedSnapshot(deps()).gifts;
    expect(log.slice(0, 3).map((g) => [g.name, g.count, g.berries])).toEqual([
      ['Lion', 1, 0],
      ['Rose', 1, 1],
      ['Rosa', 5, 50],
    ]);
  });

  it('what viewers paid survives the app closing mid-live', () => {
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 3, value: 10, nickname: 'fan' });
    const saved = JSON.stringify(unpaid());
    game.queue = [];
    newRound(() => 0.5);
    expect(waiting()).toBe(0);
    restoreUnpaid({ getItem: () => saved, setItem: () => undefined });
    expect(waiting()).toBe(30);
    expect(game.queue[0]?.carried).toBe(true);
  });

  it('berries carried from the last round keep their giver on the leaderboard', () => {
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 3, value: 10, nickname: 'old' });
    newRound(() => 0.5);
    expect(waiting()).toBe(30);
    expect(game.fans.get('old')?.coins).toBe(30);
  });

  it('berries given back after a restart drop but do not take the crown', () => {
    game.queue = [];
    newRound(() => 0.5);
    restoreUnpaid({
      getItem: () => JSON.stringify([{ nickname: 'jg', n: 40 }]),
      setItem: () => undefined,
    });
    expect(waiting()).toBe(40);
    expect(game.fans.has('jg')).toBe(false);
    receiveFeedEvent({ type: 'gift', name: 'Rose', n: 1, value: 1, nickname: 'first' });
    expect([...game.fans.keys()]).toEqual(['first']);
  });

  it('rehearsal gifts are never brought back after a restart', () => {
    applyFeedCommand({ cmd: 'gift', gift: 'rosa', count: 5 }, deps());
    expect(unpaid()).toEqual([]);
  });

  it('test gifts from the control room follow the same rule', () => {
    const d = deps();
    applyFeedCommand({ cmd: 'gift', gift: 'rosa', count: 5 }, d);
    applyFeedCommand({ cmd: 'gift', gift: 'rose', count: 1 }, d);
    expect(waiting()).toBe(51);
    expect(game.fans.get('tester')?.coins).toBe(51);
  });

  it('gifts sent during the end screen open the next round', () => {
    nearFull(0);
    game.full = 0;
    receiveFeedEvent({ type: 'gift', name: 'Rosa', n: 1, nickname: 'late' });
    expect(waiting()).toBe(0);
    newRound(() => 0.5);
    expect(waiting()).toBe(10);
    expect(game.fans.get('late')?.coins).toBe(10);
  });

  it('berries still in the flower survive a new round', () => {
    receiveFeedEvent({ type: 'gift', name: 'Rose', n: 7, nickname: 'x' });
    newRound(() => 0.5);
    expect(waiting()).toBe(7);
  });

  it('saves settings and restores them in the next session', () => {
    const storage = new Map<string, string>();
    applyFeedCommand({ cmd: 'setting', name: 'weather', value: 'snow' }, deps(storage));
    applyFeedCommand({ cmd: 'setting', name: 'language', value: 'fr' }, deps(storage));
    applyFeedCommand({ cmd: 'setting', name: 'weather', value: 'lava' }, deps(storage));
    settings.weather = 'rain';
    settings.language = 'en';
    restoreSettings(deps(storage).storage);
    expect(settings.weather).toBe('snow');
    expect(settings.language).toBe('fr');
    settings.language = 'en';
  });

  it('starts rounds at the chosen length, without the start-up sprint', () => {
    const d = deps();
    applyFeedCommand({ cmd: 'setting', name: 'startFill', value: 0.9 }, d);
    newRound(() => 0.5);
    expect(game.len).toBe(Math.round(TOTAL * 0.9));
    expect(new Set(game.body.cells).size).toBe(game.body.cells.length);
    for (let f = 0; f < 60 * 5; f++) advance(1 / 60, () => 0.5);
    expect(game.house).toBe(0);
    expect(game.full).toBeLessThan(0);
    applyFeedCommand({ cmd: 'setting', name: 'startFill', value: 0.33 }, d);
    expect(settings.startFill).toBe(0.9);
    applyFeedCommand({ cmd: 'setting', name: 'startFill', value: 0 }, d);
    newRound(() => 0.5);
    expect(game.len).toBe(3);
  });

  it('publishes the round for the control room', () => {
    const d = deps();
    applyFeedCommand({ cmd: 'crowd', level: 2 }, d);
    const state = feedSnapshot(d);
    expect(state.phase).toBe('ready');
    expect(state.pattern).toBeGreaterThanOrEqual(1);
    expect(state.pattern).toBeLessThanOrEqual(5);
    expect(state.crowd).toBe(2);
    expect(state.fps).toBe(60);
  });
});
