import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS } from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import {
  BOOST,
  arenaLike,
  fired,
  joinPaidQueue,
  paidQueue,
  rings,
  roundsToPlay,
} from '../../src/renderer/arena/entry.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import { QUALIFY, qualifying } from '../../src/renderer/arena/qualify.ts';
import { alive, arena, kill, snakeOf } from '../../src/renderer/arena/rules.ts';
import {
  ARENA_ALERTS,
  CHIP,
  STRIP,
  resetStrip,
  stepStrip,
  stripState,
} from '../../src/renderer/arena/strip.ts';
import {
  GAME_TEXT_MIN,
  alertBoost,
  alertKill,
  alertQueued,
  alertViewer,
  alertsState,
  gameCardRow,
  paintAlerts,
  resetAlerts,
  setAlertLook,
  setAlertsOn,
  setLikeAlerts,
  updateAlerts,
} from '../../src/renderer/feed/alerts.ts';
import { game, hooks, newRound } from '../../src/renderer/feed/state.ts';
import { setCtx } from '../../src/renderer/engine/canvas.ts';
import { W } from '../../src/renderer/engine/layout.ts';
import { setLanguage } from '../../src/renderer/engine/i18n.ts';

/** A drawing context that draws nothing and measures a letter as half the font's size. */
function blankCtx(): CanvasRenderingContext2D {
  const props: Record<string, unknown> = { font: '10px sans-serif' };
  const api: Record<string, unknown> = {
    measureText: (text: string) => {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(String(props.font))?.[1] ?? 10);
      return { width: text.length * size * 0.5 };
    },
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  };
  return new Proxy(
    {},
    {
      get: (_, key: string) =>
        key in api ? api[key] : key in props ? props[key] : () => undefined,
      set: (_, key: string, value: unknown) => {
        props[key] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}
const g = globalThis as { document?: unknown };
g.document ??= {
  createElement: () => ({ width: 0, height: 0, getContext: () => blankCtx() }),
};

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

/** A battle of `n` players (4, 6 or 8), each in their seat. */
function battle(n = 8): void {
  setArenaSettings({ ...ARENA_DEFAULTS, places: n, pilot: false, wildSnakes: 0 });
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
  for (let i = 0; i < n; i++) arenaLike(`p${String(i)}`, undefined, 10 + i);
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

  it('the card shows the game first (paid queue, elimination, then boost), then the stream, then likes', () => {
    alertViewer('like', 'liker', undefined, 20);
    alertViewer('follow', 'fan', undefined);
    alertQueued({ nickname: 'payer' }, 3, 1);
    alertKill({ nickname: 'fallen' }, null);
    alertBoost({ nickname: 'fast' }, '#fff');
    // The money cards in the order they came; the boost waited more than 3 s behind them and was
    // dropped; then the follow; the like waited longer than a like stays news, and was dropped.
    expect(shownInTurn()).toEqual(['qualified', 'kill', 'follow']);
    // A welcome comes before a like too.
    resetAlerts();
    alertViewer('like', 'liker2', undefined, 20);
    alertViewer('join', 'newcomer', undefined);
    expect(shownInTurn()).toEqual(['join', 'like']);
  });

  it('money first: the paid queue and an elimination go before any speed boost, which is dropped after 3 s waiting', () => {
    alertBoost({ nickname: 'fast' }, '#fff');
    alertQueued({ nickname: 'payer' }, 3, 1);
    alertKill({ nickname: 'fallen' }, null);
    updateAlerts(0.01);
    // The boost came first but waits behind both.
    expect(alertsState().current?.kind).toBe('qualified');
    expect(shownInTurn()).toEqual(['qualified', 'kill']);
    // A boost card on screen gives way to a paid-queue card once readable.
    resetAlerts();
    alertBoost({ nickname: 'fast' }, '#fff');
    updateAlerts(0.01);
    alertQueued({ nickname: 'payer' }, 4, 1);
    for (let i = 0; i < 8; i++) updateAlerts(0.25);
    expect(alertsState().current?.kind).toBe('qualified');
    // A boost still shows when no money card waits, before the stream's cards.
    resetAlerts();
    alertViewer('follow', 'fan', undefined);
    alertBoost({ nickname: 'fast' }, '#fff');
    expect(shownInTurn()).toEqual(['boost', 'follow']);
  });

  it('a game card never expires; a waiting like does', () => {
    alertViewer('follow', 'fan', undefined);
    updateAlerts(0.01);
    alertViewer('like', 'liker', undefined, 5);
    alertQueued({ nickname: 'payer' }, 12, 2);
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
    // Eight do not fit at full size: every chip shrinks evenly to fit the screen.
    const row = stripState().filter((c) => !c.leaving);
    expect(row[0]?.k).toBeLessThan(STRIP.size);
    expect(new Set(row.map((c) => c.k.toFixed(3))).size).toBe(1);
    expect(row[0]?.left).toBeGreaterThanOrEqual(STRIP.margin - 0.5);
    expect(row.at(-1)?.right).toBeLessThanOrEqual(W - STRIP.margin + 0.5);
    // A player falls: their chip eases out, the others close up.
    const fallen = snakeOf(seats[2] ?? '');
    if (fallen) kill(fallen, null, 'accident');
    run(0.1);
    expect(on()).toEqual(seats.filter((n) => n !== seats[2]));
    run(STRIP.ease + 0.2);
    expect(stripState().some((c) => c.nickname === seats[2])).toBe(false);
    // Six or fewer keep their full size.
    for (const n of seats.slice(3, 4)) {
      const s = snakeOf(n);
      if (s) kill(s, null, 'accident');
    }
    run(1.5);
    expect(stripState().every((c) => Math.abs(c.k - STRIP.size) < 0.01)).toBe(true);
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
  it('one row of chips, 1.2 times the base chip, under the line, inside the screen, never touching', () => {
    for (const n of [4, 6, 8]) {
      battle(n);
      run(1);
      const row = stripState().filter((c) => !c.leaving);
      expect(row).toHaveLength(n);
      // One row: every chip's top on the same line, under the board's bottom line.
      expect(new Set(row.map((c) => c.top.toFixed(2))).size).toBe(1);
      expect(row[0]?.top).toBeGreaterThan(STRIP.line);
      // 4 and 6 at 1.2 times; 8 shrink evenly to fit the screen less the margin each side.
      const fit = (W - 2 * STRIP.margin) / (8 * CHIP.w + 7 * CHIP.gap);
      for (const c of row) expect(c.k).toBeCloseTo(n <= 6 ? STRIP.size : fit, 2);
      expect(row[0]?.left).toBeGreaterThanOrEqual(STRIP.margin - 0.5);
      expect(row.at(-1)?.right).toBeLessThanOrEqual(W - STRIP.margin + 0.5);
      for (let i = 1; i < row.length; i++)
        expect(row[i]?.left ?? 0).toBeGreaterThan(row[i - 1]?.right ?? Infinity);
      // Centred, and the card under the row with a gap.
      expect(((row[0]?.left ?? 0) + (row.at(-1)?.right ?? 0)) / 2).toBeCloseTo(W / 2, 0);
      expect(ARENA_ALERTS.cy - ARENA_ALERTS.h / 2).toBeGreaterThan((row[0]?.bottom ?? 0) + 20);
    }
    // 6 chips at 1.2: a chip is 1.2 times the base, a little wider than the board but on screen.
    battle(6);
    run(1);
    const six = stripState();
    expect((six[0]?.right ?? 0) - (six[0]?.left ?? 0)).toBeCloseTo(CHIP.w * 1.2, 1);
    expect(((six[0]?.bottom ?? 0) - (six[0]?.top ?? 0)) / CHIP.h).toBeCloseTo(1.2, 3);
  });

  it('rounds to play: the next round within the places, then one more round for each batch', () => {
    setArenaSettings({ ...ARENA_DEFAULTS, places: 6 });
    expect([1, 6, 7, 12, 13, 19].map(roundsToPlay)).toEqual([1, 1, 2, 2, 3, 4]);
    setArenaSettings({ ...ARENA_DEFAULTS, places: 8 });
    expect([8, 9, 16, 17].map(roundsToPlay)).toEqual([1, 2, 2, 3]);
  });

  it('every game card reads on one row, its words shrunk to fit, never below 30', () => {
    const previous = setCtx(blankCtx());
    const card = (): ReturnType<typeof gameCardRow> => {
      updateAlerts(0.5);
      paintAlerts();
      return gameCardRow();
    };
    // French runs longer: its words may cut the name to its first letters, never below 30.
    const fits = (row: ReturnType<typeof gameCardRow>, long = false): void => {
      expect(row).not.toBeNull();
      if (!row) return;
      expect(row.size).toBeGreaterThanOrEqual(GAME_TEXT_MIN);
      expect(row.size).toBeLessThanOrEqual(ARENA_ALERTS.text);
      if (long) return;
      expect(row.right - row.left).toBeLessThanOrEqual(row.room + 0.5);
      expect(row.right).toBeLessThanOrEqual(ARENA_ALERTS.w / 2);
    };
    try {
      setLanguage('en');
      // The boost card: no number, the bolt between the name and the words.
      alertBoost({ nickname: 'fast' }, '#fff');
      let row = card();
      expect(row?.text).toBe('fast ⚡ SPEED BOOST');
      expect(row?.text).not.toMatch(/\d/);
      fits(row);
      // A long name: the words shrink to 30 at most, then the name is cut.
      resetAlerts();
      alertBoost({ nickname: 'averyveryverylongname_2026' }, '#fff');
      row = card();
      fits(row);
      expect(row?.text.endsWith(' ⚡ SPEED BOOST')).toBe(true);
      resetAlerts();
      setLanguage('fr');
      alertQueued({ nickname: 'ravi2' }, 3, 1);
      row = card();
      expect(row?.text.endsWith(' a sa place à la prochaine manche')).toBe(true);
      fits(row, true);
      resetAlerts();
      alertQueued({ nickname: 'ravi2' }, 12, 2);
      row = card();
      expect(row?.text.endsWith(' est #12 dans la file : joue dans 2 manches')).toBe(true);
      fits(row, true);
      resetAlerts();
      alertBoost({ nickname: 'fast' }, '#fff');
      row = card();
      expect(row?.text).toBe('fast ⚡ BOOST DE VITESSE');
      fits(row, true);
    } finally {
      setLanguage('en');
      paidQueue.length = 0;
      setCtx(previous);
    }
  });

  it('the battle over, nothing of it shows over the end screen; a gift then joins the line, no card', () => {
    battle(4);
    setArenaSettings({
      ...ARENA_DEFAULTS,
      places: 4,
      pilot: false,
      wildSnakes: 0,
      giftSeats: true,
    });
    const seats = alive()
      .filter((s) => !s.wild)
      .sort((p, q) => p.id - q.id);
    // Battle cards waiting and on screen: a boost, a place in the paid queue, an elimination.
    alertBoost({ nickname: 'p1' }, '#fff');
    updateAlerts(0.01);
    alertQueued({ nickname: 'payer' }, 3, 1);
    alertViewer('follow', 'fan', undefined);
    arenaLike('p2', undefined, 40);
    run(0.2);
    expect(stripState().length).toBeGreaterThan(0);
    // All but one fall: the battle ends and the end screen comes up.
    for (const s of seats.slice(1)) kill(s, null, 'accident');
    for (let i = 0; i < 600 && arena.phase === 'play'; i++) {
      advanceArena(STEP);
      stepStrip();
    }
    expect(arena.phase).toBe('end');
    expect(game.full).toBeGreaterThanOrEqual(0);
    stepStrip();
    expect(stripState()).toHaveLength(0);
    // Only the stream's card is left, no game card waits or shows.
    const kinds = shownInTurn();
    expect(kinds.filter((k) => k === 'boost' || k === 'kill' || k === 'qualified')).toEqual([]);
    expect(kinds).toEqual(['follow']);
    // A gift during the end screen: a place in line for the next round, and no card says it.
    joinPaidQueue('later', undefined);
    updateAlerts(0.01);
    expect(paidQueue.map((q) => q.nickname)).toEqual(['later']);
    expect(alertsState().current).toBeNull();
    expect(alertsState().queued).toBe(0);
    paidQueue.length = 0;
  });
});
