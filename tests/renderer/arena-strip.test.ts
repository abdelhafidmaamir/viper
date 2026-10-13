import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS } from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { BOOST, arenaLike, fired, paidQueue, rings } from '../../src/renderer/arena/entry.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import { QUALIFY, qualifying } from '../../src/renderer/arena/qualify.ts';
import { alive, arena, kill, snakeOf } from '../../src/renderer/arena/rules.ts';
import {
  ARENA_ALERTS,
  STRIP,
  resetStrip,
  stepStrip,
  stripState,
} from '../../src/renderer/arena/strip.ts';
import {
  alertBoost,
  alertKill,
  alertQueued,
  alertViewer,
  alertsState,
  resetAlerts,
  setAlertLook,
  setAlertsOn,
  setLikeAlerts,
  updateAlerts,
} from '../../src/renderer/feed/alerts.ts';
import { game, hooks, newRound } from '../../src/renderer/feed/state.ts';

const STEP = 1 / 30;
const run = (seconds: number): void => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    advanceArena(STEP);
    stepStrip();
  }
};

/** The kinds the card shows, in turn, until nothing waits. */
function shownInTurn(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 40; i++) {
    updateAlerts(0.25);
    const kind = alertsState().current?.kind;
    if (kind && out.at(-1) !== kind) out.push(kind);
  }
  return out;
}

/** A battle of 8 players, each in their seat. */
function battle(): void {
  setArenaSettings({ ...ARENA_DEFAULTS, places: 8, pilot: false, wildSnakes: 0 });
  let s = 7;
  arena.rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  arena.viewers.clear();
  rings.clear();
  fired.clear();
  game.queue = [];
  paidQueue.length = 0;
  arena.snakes = [];
  arena.food = [];
  arena.foodAt.clear();
  resetStrip();
  newRound();
  for (let i = 0; i < 8; i++) arenaLike(`p${String(i)}`, undefined, 10 + i);
  while (qualifying() || arena.phase === 'ready') advanceArena(STEP);
  run(0.5);
}

describe('snake arena: the alert card and the like strip', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
    QUALIFY.time = 2;
  });
  afterAll(() => {
    QUALIFY.time = 30;
  });
  beforeEach(() => {
    setAlertsOn(true);
    setAlertLook(ARENA_ALERTS);
    setLikeAlerts(true);
    resetAlerts();
  });

  it('the card shows the game first (elimination, boost, paid queue), then the stream, then likes', () => {
    alertViewer('like', 'liker', undefined, 20);
    alertViewer('follow', 'fan', undefined);
    alertQueued({ nickname: 'payer' }, 3, true);
    alertKill({ nickname: 'fallen' }, null);
    alertBoost({ nickname: 'fast' }, '#fff');
    // The game's three in the order they came, then the follow; the like waited behind them all
    // longer than a like stays news, and was dropped.
    expect(shownInTurn()).toEqual(['qualified', 'kill', 'boost', 'follow']);
    // A welcome comes before a like too.
    resetAlerts();
    alertViewer('like', 'liker2', undefined, 20);
    alertViewer('join', 'newcomer', undefined);
    expect(shownInTurn()).toEqual(['join', 'like']);
  });

  it('a game card never expires; a waiting like does', () => {
    alertViewer('follow', 'fan', undefined);
    updateAlerts(0.01);
    alertViewer('like', 'liker', undefined, 5);
    alertQueued({ nickname: 'payer' }, 12, false);
    // The follow stays its time, the queue card waits behind it as long as it takes.
    for (let i = 0; i < 60; i++) updateAlerts(0.25);
    expect(alertsState().queued).toBe(0);
  });

  it('in the battle, likes are not on the card: the strip shows them', () => {
    alertViewer('like', 'early', undefined, 5);
    expect(alertsState().queued).toBe(1);
    setLikeAlerts(false);
    // The like waiting is dropped and new ones are not taken.
    expect(alertsState().queued).toBe(0);
    alertViewer('like', 'late', undefined, 5);
    expect(alertsState().queued).toBe(0);
    // A follow still comes.
    alertViewer('follow', 'fan', undefined);
    expect(alertsState().queued).toBe(1);
  });

  it('a chip for every living player from GO, 0 % included, in seat order; a fallen one leaves', () => {
    battle();
    const on = (): string[] =>
      stripState()
        .filter((c) => !c.leaving)
        .map((c) => c.nickname);
    const seats = alive()
      .filter((s) => !s.wild)
      .sort((p, q) => p.id - q.id)
      .map((s) => s.nickname);
    expect(on()).toEqual(seats);
    expect(on()).toHaveLength(8);
    expect(stripState().every((c) => c.percent === 0 || c.percent > 0)).toBe(true);
    // Likes never reshuffle the row.
    arenaLike(seats[7] ?? '', undefined, 40);
    run(0.5);
    expect(on()).toEqual(seats);
    // Eight do not fit at full size: every chip shrinks evenly to fit the board.
    const row = stripState().filter((c) => !c.leaving);
    expect(row[0]?.k).toBeLessThan(1);
    expect(new Set(row.map((c) => c.k.toFixed(3))).size).toBe(1);
    const span = (row.at(-1)?.x ?? 0) - (row[0]?.x ?? 0) + 148 * (row[0]?.k ?? 1);
    expect(span).toBeLessThanOrEqual(930 + 1);
    // A player falls: their chip eases out, the others close up.
    const fallen = snakeOf(seats[2] ?? '');
    if (fallen) kill(fallen, null, 'accident');
    run(0.1);
    expect(on()).toEqual(seats.filter((n) => n !== seats[2]));
    run(STRIP.ease + 0.2);
    expect(stripState().some((c) => c.nickname === seats[2])).toBe(false);
    // Six or fewer keep their full size.
    for (const n of seats.slice(3, 5)) {
      const s = snakeOf(n);
      if (s) kill(s, null, 'accident');
    }
    run(1.5);
    expect(stripState().every((c) => Math.abs(c.k - 1) < 0.01)).toBe(true);
  });

  it('at 100 % the chip turns gold, the card says SPEED BOOST, then the ring starts again', () => {
    battle();
    BOOST.likes = 100;
    arenaLike('p3', undefined, 60);
    run(0.1);
    expect(stripState().find((c) => c.nickname === 'p3')).toMatchObject({
      full: false,
      percent: 60,
    });
    arenaLike('p3', undefined, 50);
    run(0.1);
    expect(stripState().find((c) => c.nickname === 'p3')).toMatchObject({
      full: true,
      percent: 10,
    });
    updateAlerts(0.01);
    expect(alertsState().current?.kind).toBe('boost');
    expect(alertsState().current?.nickname).toBe('p3');
    run(STRIP.full + 0.1);
    expect(stripState().find((c) => c.nickname === 'p3')).toMatchObject({
      full: false,
      percent: 10,
    });
  });

  it('a viewer without a snake never gets a chip', () => {
    battle();
    arenaLike('stranger', undefined, 50);
    run(0.1);
    expect(stripState().some((c) => c.nickname === 'stranger')).toBe(false);
  });
});
