import { beforeEach, describe, expect, it } from 'vitest';

import { sanitizeSetting, isFeedCommand } from '../../src/shared/feed-protocol.ts';
import { alertsState, resetAlerts } from '../../src/renderer/feed/alerts.ts';
import {
  applyFeedCommand,
  receiveFeedEvent,
  type FeedLinkDeps,
} from '../../src/renderer/feed/control-link.ts';
import { roundRanking } from '../../src/renderer/feed/leaderboard.ts';
import { advance, like, gift, newRound } from '../../src/renderer/feed/state.ts';
import {
  lifetimeRank,
  resetSupporters,
  supporter,
  supporterGift,
} from '../../src/renderer/feed/supporters.ts';
import {
  entranceState,
  resetSupporterEntrances,
  setEntranceGap,
  skipEntrance,
  updateSupporters,
  welcomeSupporter,
} from '../../src/renderer/feed/vip.ts';

const deps: FeedLinkDeps = {
  bridge: {
    start: () => undefined,
    stop: () => undefined,
    process: () => undefined,
    state: () => null,
  },
  storage: { getItem: () => null, setItem: () => undefined },
  metrics: () => ({ fps: 60, slowFrames: 0, errors: 0 }),
  setCrowd: () => undefined,
  crowd: () => 0,
  someone: () => 'tester',
};
const setting = (name: 'entranceGap' | 'mods', value: unknown): void => {
  applyFeedCommand({ cmd: 'setting', name, value }, deps);
};
const join = (nickname: string, id: string, mod = false): void => {
  receiveFeedEvent({ type: 'join', nickname, id, mod });
};

beforeEach(() => {
  resetSupporters();
  resetSupporterEntrances();
  resetAlerts();
  setting('entranceGap', 0);
  setting('mods', '');
  newRound();
});

describe('supporter entrances', () => {
  it('gives a gifter their big entrance instead of the plain alert', () => {
    supporterGift('lina.snx', 'Lina', 12);
    join('Lina', 'lina.snx');
    expect(entranceState().waiting.map((e) => e.nickname)).toEqual(['Lina']);
    expect(alertsState().queued).toBe(0);
  });

  it('greets someone who never gave with the plain alert', () => {
    join('Moe', 'moe_88');
    expect(entranceState().waiting).toHaveLength(0);
    expect(alertsState().queued).toBe(1);
  });

  it('shows the gold alert when the control room says not yet', () => {
    supporterGift('lina.snx', 'Lina', 12);
    setting('entranceGap', 15);
    join('Lina', 'lina.snx');
    join('Lina', 'lina.snx');
    expect(entranceState().waiting).toHaveLength(1);
    expect(alertsState().queued).toBe(1);
    setting('entranceGap', -1);
    join('Capy', 'capy');
    expect(entranceState().waiting).toHaveLength(1);
  });

  it('counts the gap per person, from the moment of the entrance', () => {
    setEntranceGap(5 * 60_000);
    const e = { nickname: 'Lina', rank: 0, berries: 3 };
    expect(welcomeSupporter(e, 0)).toBe('queued');
    expect(welcomeSupporter(e, 4 * 60_000)).toBe('not now');
    expect(welcomeSupporter(e, 6 * 60_000)).toBe('queued');
  });

  it('recognises a moderator from TikTok or from the control room list', () => {
    join('Leo', 'leo.mod', true);
    setting('mods', '@Yasmine_, other');
    join('Yas', 'yasmine_');
    const waiting = entranceState().waiting;
    expect(waiting.map((e) => [e.nickname, e.mod])).toEqual([
      ['Leo', true],
      ['Yas', true],
    ]);
  });

  it('puts passes first, then the top three, and nobody is dropped', () => {
    for (let i = 0; i < 8; i++)
      welcomeSupporter({ nickname: `g${String(i)}`, rank: 0, berries: 1 });
    welcomeSupporter({ nickname: 'Top', rank: 2, berries: 900 });
    welcomeSupporter({ nickname: 'New', rank: 1, berries: 999, passed: { nickname: 'Old' } });
    const names = entranceState().waiting.map((e) => e.nickname);
    expect(names.slice(0, 2)).toEqual(['New', 'Top']);
    expect(names).toHaveLength(10);
  });

  it('waits while the board is not in play, and Skip ends the one on screen', () => {
    welcomeSupporter({ nickname: 'Lina', rank: 0, berries: 3 });
    updateSupporters(0.1, true);
    expect(entranceState().current).toBeNull();
    updateSupporters(0.1);
    expect(entranceState().current?.nickname).toBe('Lina');
    skipEntrance();
    updateSupporters(0.5);
    expect(entranceState().current).toBeNull();
  });

  it('knocks the holder off the spot when a gift lifts someone into the top three', () => {
    supporterGift('a', 'Anna', 100);
    supporterGift('b', 'Bo', 50);
    supporterGift('c', 'Cy', 20);
    receiveFeedEvent({ type: 'gift', name: 'Rosa', value: 10, n: 9, nickname: 'Cy', id: 'c' });
    expect(supporter('c')?.berries).toBe(110);
    expect(lifetimeRank('c')).toBe(1);
    const pass = entranceState().waiting.find((e) => e.passed);
    expect(pass).toMatchObject({ nickname: 'Cy', rank: 1, passed: { nickname: 'Anna' } });
  });

  it('keeps gifts by day so the ranking can later be counted over a month', () => {
    supporterGift('a', 'Anna', 5, new Date(2026, 8, 29, 12).getTime());
    supporterGift('a', 'Anna', 7, new Date(2026, 8, 30, 12).getTime());
    expect(supporter('a')?.days).toEqual({ '2026-09-29': 5, '2026-09-30': 7 });
  });
});

describe('end of round', () => {
  it('ranks this round by berries first, then likes', () => {
    // Past the countdown: gifts sent during it wait for the round.
    for (let i = 0; i < 80; i++) advance(0.1);
    gift('Ann', undefined, 10);
    gift('Ben', undefined, 10);
    like('Ben', undefined, 5);
    like('Cal', undefined, 50);
    // The berries drip from the flower one by one: the ranking follows them.
    for (let i = 0; i < 300; i++) advance(0.1);
    // Earlier tests' berries carry over with their giver's rank: only this test's viewers matter.
    const mine = roundRanking(10)
      .map((l) => l.nickname)
      .filter((n) => ['Ann', 'Ben', 'Cal'].includes(n));
    expect(mine).toEqual(['Ben', 'Ann', 'Cal']);
  });
});

describe('protocol', () => {
  it('accepts only the offered gaps and a bounded moderators list', () => {
    expect(sanitizeSetting('entranceGap', 15)).toBe(15);
    expect(sanitizeSetting('entranceGap', 7)).toBeUndefined();
    expect(sanitizeSetting('mods', 'x'.repeat(900))).toHaveLength(600);
    expect(isFeedCommand({ cmd: 'skip-entrance' })).toBe(true);
    expect(isFeedCommand({ cmd: 'test-entrance', rank: 1 })).toBe(true);
  });
});
