import { beforeEach, describe, expect, it } from 'vitest';

import { sanitizeSetting, isFeedCommand } from '../../src/shared/feed-protocol.ts';
import { alertsState, resetAlerts } from '../../src/renderer/feed/alerts.ts';
import {
  applyFeedCommand,
  receiveFeedEvent,
  type FeedLinkDeps,
} from '../../src/renderer/feed/control-link.ts';
import { roundRanking } from '../../src/renderer/feed/leaderboard.ts';
import { trayState } from '../../src/renderer/feed/gift-tray.ts';
import { advance, game, like, gift, newRound } from '../../src/renderer/feed/state.ts';
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
const setting = (
  name: 'entranceGap' | 'mods' | 'giftThanks' | 'roundHold',
  value: unknown,
): void => {
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
  setting('giftThanks', 'flower');
  setting('roundHold', 10);
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

describe('thanking a gift', () => {
  const rose = (nickname: string, id: string, n = 1): void => {
    receiveFeedEvent({ type: 'gift', name: 'Rose', value: 1, n, nickname, id });
  };

  it('thanks a first gift ever over the board, grander than the others', () => {
    rose('Zoe', 'zoe');
    expect(entranceState().waiting).toMatchObject([{ nickname: 'Zoe', first: true, berries: 1 }]);
    expect(alertsState().queued).toBe(0);
    updateSupporters(0.5);
    expect(entranceState().current?.first).toBe(true);
  });

  it('follows the streak that opened with the first gift', () => {
    rose('Zoe', 'zoe');
    rose('Zoe', 'zoe');
    updateSupporters(0.1);
    rose('Zoe', 'zoe', 3);
    expect(entranceState().current?.berries).toBe(5);
    expect(entranceState().waiting).toHaveLength(0);
    expect(alertsState().queued).toBe(0);
  });

  it('shows the first gift whatever the entrance setting says', () => {
    setting('entranceGap', -1);
    rose('Zoe', 'zoe');
    expect(entranceState().waiting).toHaveLength(1);
  });

  it('leaves a gift from someone who already gave to the flower that pours it', () => {
    supporterGift('moe', 'Moe', 20);
    rose('Moe', 'moe');
    expect(entranceState().waiting).toHaveLength(0);
    expect(trayState()).toHaveLength(0);
    expect(alertsState().queued).toBe(0);
  });

  it('thanks on the tray when asked to, one row for a streak, three rows at most', () => {
    setting('giftThanks', 'tray');
    supporterGift('moe', 'Moe', 20);
    rose('Moe', 'moe');
    rose('Moe', 'moe', 4);
    expect(trayState()).toMatchObject([{ nickname: 'Moe', berries: 5 }]);
    expect(entranceState().waiting).toHaveLength(0);
    for (const who of ['Ana', 'Bo', 'Cy']) {
      supporterGift(who, who, 20);
      rose(who, who);
    }
    expect(trayState().map((row) => row.nickname)).toEqual(['Ana', 'Bo', 'Cy']);
    updateSupporters(6);
    expect(trayState()).toHaveLength(0);
  });

  it('still gives a first gift its entrance when the tray thanks the others', () => {
    setting('giftThanks', 'tray-comet');
    rose('Zoe', 'zoe');
    expect(entranceState().waiting).toMatchObject([{ nickname: 'Zoe', first: true }]);
    expect(trayState()).toHaveLength(0);
  });

  it('thanks someone who already gave over the board when asked to, one thanks for a streak', () => {
    setting('giftThanks', 'classic');
    supporterGift('moe', 'Moe', 20);
    rose('Moe', 'moe');
    rose('Moe', 'moe', 4);
    expect(entranceState().waiting).toMatchObject([{ nickname: 'Moe', thanks: true, berries: 5 }]);
    expect(alertsState().queued).toBe(0);
  });

  it('a thanks kept up by a streak still ends', () => {
    setting('giftThanks', 'classic');
    supporterGift('moe', 'Moe', 20);
    rose('Moe', 'moe');
    let up = 0;
    for (let t = 0; t < 14; t += 0.25) {
      rose('Moe', 'moe');
      updateSupporters(0.25);
      if (entranceState().current) up += 0.25;
      else break;
    }
    expect(up).toBeLessThan(10);
  });

  it('does not thank a gift that feeds nothing, nor twice when it is a pass', () => {
    receiveFeedEvent({ type: 'gift', name: 'Lion', value: 29999, nickname: 'Zoe', id: 'zoe' });
    expect(entranceState().waiting).toHaveLength(0);
    supporterGift('a', 'Ana', 50);
    supporterGift('b', 'Bo', 30);
    supporterGift('c', 'Cy', 10);
    rose('Dee', 'dee', 40);
    expect(entranceState().waiting).toMatchObject([
      { nickname: 'Dee', passed: { nickname: 'Bo' } },
    ]);
    expect(alertsState().queued).toBe(0);
  });
});

describe('end of round', () => {
  it('keeps the end screen up as long as the control room says', () => {
    const held = (): number => {
      game.full = 0;
      let t = 0;
      while (game.full >= 0 && t < 60) {
        advance(0.25);
        t += 0.25;
      }
      return t;
    };
    expect(held()).toBeCloseTo(10.25);
    setting('roundHold', 30);
    expect(held()).toBeCloseTo(30.25);
    setting('roundHold', 5);
    expect(held()).toBeCloseTo(5.25);
  });

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
    expect(sanitizeSetting('giftThanks', 'tray-rings')).toBe('tray-rings');
    expect(sanitizeSetting('giftThanks', 'ribbon')).toBeUndefined();
    expect(sanitizeSetting('crownStyle', 'laurel')).toBe('laurel');
    expect(sanitizeSetting('crownStyle', 'tiara')).toBeUndefined();
    expect(sanitizeSetting('snakeSkin', 'dark-back')).toBe('dark-back');
    expect(sanitizeSetting('snakeSkin', 'stripes')).toBeUndefined();
    expect(sanitizeSetting('snakeColour', 'leaf')).toBe('leaf');
    expect(sanitizeSetting('snakeColour', '#7CC45A')).toBeUndefined();
    expect(sanitizeSetting('sleepers', 2)).toBe(2);
    expect(sanitizeSetting('sleepers', 3)).toBeUndefined();
    expect(sanitizeSetting('rankedWelcome', 20)).toBe(20);
    expect(sanitizeSetting('rankedWelcome', 15)).toBeUndefined();
    expect(sanitizeSetting('roundHold', 25)).toBe(25);
    expect(sanitizeSetting('roundHold', 12)).toBeUndefined();
    expect(sanitizeSetting('roundHold', 35)).toBeUndefined();
    expect(sanitizeSetting('mods', 'x'.repeat(900))).toHaveLength(600);
    expect(isFeedCommand({ cmd: 'skip-entrance' })).toBe(true);
    expect(isFeedCommand({ cmd: 'test-entrance', rank: 1 })).toBe(true);
  });
});
