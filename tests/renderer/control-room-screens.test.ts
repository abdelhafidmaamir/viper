/**
 * Verifies that the Arena control room omits the controls and info that have no effect there,
 * and that Feed's control room still shows them.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import type { ArenaSide } from '../../src/renderer/arena-control/arena-state.ts';
import {
  arenaCard,
  giftSeatsCard,
  paidQueueCard,
  seatCard,
} from '../../src/renderer/arena-control/cards.ts';
import { pricingCard } from '../../src/renderer/feed-control/money.ts';
import { ARENA_DEFAULTS, type ArenaSettings } from '../../src/shared/arena-protocol.ts';
import { createSetupScreen } from '../../src/renderer/feed-control/screens.ts';
import type { FeedControlState, FeedControlStore } from '../../src/renderer/feed-control/store.ts';
import type { FeedState } from '../../src/shared/feed-protocol.ts';

// ---------------------------------------------------------------------------
// Minimal DOM mock
// ---------------------------------------------------------------------------

interface MockEl {
  tagName: string;
  textContent: string;
  className: string;
  children: MockEl[];
  attrs: Record<string, string | undefined>;
  hidden: boolean;
  disabled: boolean;
  value: string;
  type: string;
  isContentEditable: boolean;
  tabIndex: number;
  style: { getPropertyValue(name: string): string; setProperty(name: string, value: string): void };
  classList: { contains(name: string): boolean; toggle(name: string, on?: boolean): void };
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  removeAttribute(name: string): void;
  append(...items: (MockEl | string)[]): void;
  prepend(...items: (MockEl | string)[]): void;
  replaceChildren(...items: MockEl[]): void;
  contains(other: MockEl | null): boolean;
  addEventListener(): void;
  focus(): void;
}

function makeMockEl(tag: string): MockEl {
  const classes = new Set<string>();
  const styleProps: Record<string, string> = {};
  const el: MockEl = {
    tagName: tag.toUpperCase(),
    textContent: '',
    className: '',
    children: [],
    attrs: {},
    hidden: false,
    disabled: false,
    value: '',
    type: '',
    isContentEditable: false,
    tabIndex: -1,
    style: {
      getPropertyValue(name: string): string {
        return styleProps[name] ?? '';
      },
      setProperty(name: string, value: string): void {
        styleProps[name] = value;
      },
    },
    classList: {
      contains(name: string): boolean {
        return classes.has(name);
      },
      toggle(name: string, on?: boolean): void {
        const next = on ?? !classes.has(name);
        if (next) classes.add(name);
        else classes.delete(name);
      },
    },
    setAttribute(name: string, value: string): void {
      el.attrs[name] = value;
    },
    getAttribute(name: string): string | null {
      return el.attrs[name] ?? null;
    },
    hasAttribute(name: string): boolean {
      return el.attrs[name] !== undefined;
    },
    removeAttribute(name: string): void {
      el.attrs[name] = undefined;
    },
    append(...items: (MockEl | string)[]): void {
      for (const item of items) {
        if (typeof item === 'string') el.textContent += item;
        else el.children.push(item);
      }
    },
    prepend(...items: (MockEl | string)[]): void {
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item === undefined) continue;
        if (typeof item === 'string') el.textContent = item + el.textContent;
        else el.children.unshift(item);
      }
    },
    replaceChildren(...items: MockEl[]): void {
      el.children = [...items];
    },
    contains(other: MockEl | null): boolean {
      if (other === null) return false;
      return el === other || el.children.some((c) => c.contains(other));
    },
    addEventListener(): void {
      return;
    },
    focus(): void {
      return;
    },
  };
  return el;
}

/** Recursively collect all text reachable from an element. */
function allText(el: MockEl): string {
  return [el.textContent, ...el.children.map(allText)].join(' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Minimal state helpers
// ---------------------------------------------------------------------------

function makeGameState(overrides: Partial<FeedState> = {}): FeedState {
  return {
    bridge: null,
    phase: 'playing',
    round: 1,
    pattern: 1,
    fill: 0,
    cells: 0,
    total: 900,
    berries: 0,
    waiting: 0,
    eaten: 0,
    leaders: [],
    gifts: [],
    likes: 0,
    crowd: 0,
    settings: {
      weather: 'rain',
      hour: 0.02,
      autoAmbience: true,
      dayCycle: 0,
      language: 'en',
      startFill: 0,
      alerts: true,
      entranceGap: 0,
      mods: '',
      roundHold: 10,
      giftThanks: 'flower',
      giftTitles: false,
      likeCount: true,
      sleepers: 1,
      sleeperLook: 'colorFaceGreyCrab',
      sleeperLife: 'shuffle',
      crownStyle: 'classic',
      snakeSkin: 'classic',
      snakeColour: 'sand',
      rainSound: 'off',
      rankedWelcome: 0,
      pricing: '1:5,10:55',
      otherGifts: false,
    },
    fps: 60,
    slowFrames: 0,
    errors: 0,
    ...overrides,
  };
}

function makeState(overrides: Partial<FeedControlState> = {}): FeedControlState {
  return {
    gameState: null,
    lastStateAt: null,
    now: 1000,
    tab: 'live',
    pending: {},
    armed: null,
    armedAt: null,
    ...overrides,
  };
}

function makeStore(state: FeedControlState): FeedControlStore {
  return {
    get: () => state,
    patch: () => {
      return;
    },
    subscribe: () => () => {
      return;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Arena and Feed control room screens', () => {
  beforeAll(() => {
    (globalThis as Record<string, unknown>).document = {
      createElement: (tag: string) => makeMockEl(tag),
      activeElement: null,
    };
  });

  describe('Setup screen: Look card (snake appearance)', () => {
    const dispatch = (): void => {
      return;
    };
    const reason = (): null => null;

    it('Arena setup omits Snake colour and Snake skin, keeps Top giver wears', () => {
      const setup = createSetupScreen(dispatch, reason, {
        nearFullBoard: false,
        snakeAppearance: false,
        tabCount: 4,
      });
      const text = allText(setup.el as unknown as MockEl);
      expect(text).not.toContain('Snake colour');
      expect(text).not.toContain('Snake skin');
      expect(text).toContain('Top giver wears');
    });

    it('Feed setup keeps Snake colour, Snake skin and Top giver wears', () => {
      const setup = createSetupScreen(dispatch, reason, {});
      const text = allText(setup.el as unknown as MockEl);
      expect(text).toContain('Snake colour');
      expect(text).toContain('Snake skin');
      expect(text).toContain('Top giver wears');
    });
  });

  describe('Setup screen: keyboard shortcuts', () => {
    const dispatch = (): void => {
      return;
    };
    const reason = (): null => null;

    it('Arena setup shows Alt+1/2/3/4 and Money in the shortcuts card', () => {
      const setup = createSetupScreen(dispatch, reason, {
        nearFullBoard: false,
        snakeAppearance: false,
        tabCount: 4,
      });
      const text = allText(setup.el as unknown as MockEl);
      expect(text).toContain('Alt+1/2/3/4');
      expect(text).toContain('Money');
    });

    it('Feed setup shows Alt+1/2/3 without a fourth tab in the shortcuts card', () => {
      const setup = createSetupScreen(dispatch, reason, {});
      const text = allText(setup.el as unknown as MockEl);
      expect(text).toContain('Alt+1/2/3');
      expect(text).not.toContain('Alt+1/2/3/4');
    });
  });

  describe('Pricing card: round info', () => {
    // A state where the game is linked and a valid pricing is active.
    const connectedState = makeState({
      gameState: makeGameState(),
      lastStateAt: 4500,
      now: 5000,
    });

    it('Arena pricing card hides percent-of-round info and round-needs status', () => {
      const store = makeStore(connectedState);
      const card = pricingCard(
        store,
        () => {
          return;
        },
        { roundInfo: false },
      );
      card.update(connectedState);
      const text = allText(card.el as unknown as MockEl);
      expect(text).not.toContain('% of a round');
      expect(text).not.toContain('a round needs');
    });

    it('Feed pricing card shows percent-of-round info and round-needs status', () => {
      const store = makeStore(connectedState);
      const card = pricingCard(store, () => {
        return;
      });
      card.update(connectedState);
      const text = allText(card.el as unknown as MockEl);
      expect(text).toContain('% of a round');
      expect(text).toContain('a round needs');
    });
  });
  describe('Arena Money tab: seat price', () => {
    const arenaSide = (settings: Partial<ArenaSettings>): ArenaSide => ({
      state: () => ({
        settings: { ...ARENA_DEFAULTS, continuous: false, giftSeats: true, ...settings },
        secondsLeft: 60,
      }),
      pending: () => ({}),
      send: () => {
        return;
      },
    });
    const linked = makeState({ gameState: makeGameState(), lastStateAt: 4500, now: 5000 });

    it('shows the seat price, its caption and the value in use', () => {
      const card = seatCard(arenaSide({ seatPrice: 99 }), () => {
        return;
      });
      card.update(linked);
      const text = allText(card.el as unknown as MockEl);
      expect(text).toContain('Seat price');
      expect(text).toContain('Coin value of the gift that buys a seat. 0: any gift buys one.');
      expect(text).toContain('In use: the 99-coin gift buys a seat');
      const find = (el: MockEl): MockEl | undefined =>
        el.tagName === 'INPUT' ? el : el.children.map(find).find(Boolean);
      expect(find(card.el as unknown as MockEl)?.value).toBe('99');
    });

    it('"Gifts buy seats", off by default: the seat price greyed, the paid queue hidden', () => {
      const find = (el: MockEl, tag: string): MockEl | undefined =>
        el.tagName === tag ? el : el.children.map((c) => find(c, tag)).find(Boolean);
      const sent: unknown[] = [];
      const side = (on: boolean): ArenaSide => ({
        state: () => ({
          settings: { ...ARENA_DEFAULTS, continuous: false, giftSeats: on, seatPrice: 99 },
          secondsLeft: 60,
          paidQueue: ['ana'],
        }),
        pending: () => ({}),
        send: (command) => {
          sent.push(command);
        },
      });
      expect(ARENA_DEFAULTS.giftSeats).toBe(false);
      const off = side(false),
        toggle = giftSeatsCard(off, () => null),
        seat = seatCard(off, () => undefined),
        line = paidQueueCard(off);
      for (const view of [toggle, seat, line]) view.update(linked);
      const root = toggle.el as unknown as MockEl,
        button = find(root, 'BUTTON');
      expect(allText(root)).toContain('Gifts buy seats');
      expect(button?.getAttribute('aria-checked')).toBe('false');
      expect(find(seat.el as unknown as MockEl, 'INPUT')?.disabled).toBe(true);
      expect(allText(seat.el as unknown as MockEl)).toContain('Off: gifts buy no seats.');
      expect((line.el as unknown as MockEl).hidden).toBe(true);
      // On: the price can be typed, the queue shows.
      const on = side(true),
        seatOn = seatCard(on, () => undefined),
        lineOn = paidQueueCard(on);
      seatOn.update(linked);
      lineOn.update(linked);
      expect(find(seatOn.el as unknown as MockEl, 'INPUT')?.disabled).toBe(false);
      expect((lineOn.el as unknown as MockEl).hidden).toBe(false);
      expect(allText(lineOn.el as unknown as MockEl)).toContain('1. ana');
    });

    it("the Arena card keeps the flower's plain berry settings and the like heart switch", () => {
      const sent: unknown[] = [];
      const side: ArenaSide = {
        state: () => ({ settings: { ...ARENA_DEFAULTS }, secondsLeft: 60 }),
        pending: () => ({}),
        send: (command) => {
          sent.push(command);
        },
      };
      const card = arenaCard(side, () => null);
      card.update(linked);
      const text = allText(card.el as unknown as MockEl);
      // Never to be removed: the dispenser's two settings, as the control room shows them.
      expect(text).toContain('Plain berries on the board');
      expect(text).toContain('Plain berry delay');
      for (const label of ['None', '1', '2', '3', '4', '5', '6']) expect(text).toContain(label);
      for (const label of ['1 s', '2 s', '3 s', '5 s', '10 s', '15 s', '25 s'])
        expect(text).toContain(label);
      expect(text).toContain('Heart on like counts');
    });

    it('continuous play, on by default: "Gifts buy seats" hidden, the seat price greyed, its switch and two settings in the Arena card', () => {
      const find = (el: MockEl, tag: string): MockEl | undefined =>
        el.tagName === tag ? el : el.children.map((c) => find(c, tag)).find(Boolean);
      expect(ARENA_DEFAULTS.continuous).toBe(true);
      const side: ArenaSide = {
        state: () => ({
          settings: { ...ARENA_DEFAULTS, giftSeats: true, seatPrice: 99 },
          secondsLeft: 60,
          paidQueue: ['ana'],
        }),
        pending: () => ({}),
        send: () => undefined,
      };
      const toggle = giftSeatsCard(side, () => null),
        seat = seatCard(side, () => undefined),
        line = paidQueueCard(side),
        card = arenaCard(side, () => null);
      for (const view of [toggle, seat, line, card]) view.update(linked);
      expect((toggle.el as unknown as MockEl).hidden).toBe(true);
      expect((line.el as unknown as MockEl).hidden).toBe(true);
      expect(find(seat.el as unknown as MockEl, 'INPUT')?.disabled).toBe(true);
      const text = allText(card.el as unknown as MockEl);
      for (const label of ['Continuous play', 'Lives at most', 'Free snake back after'])
        expect(text).toContain(label);
      for (const label of ['30 s', '60 s', '90 s', '120 s']) expect(text).toContain(label);
      expect(text).toContain('Plain berries on the board');
      expect(text).toContain('Plain berry delay');
    });

    it('0 reads as any gift; the same price as the life gift is flagged', () => {
      const any = seatCard(arenaSide({}), () => {
        return;
      });
      any.update(linked);
      expect(allText(any.el as unknown as MockEl)).toContain('In use: any gift buys a seat');
      const clash = seatCard(arenaSide({ seatPrice: 30, lifeOn: true, lifePrice: 30 }), () => {
        return;
      });
      clash.update(linked);
      expect(allText(clash.el as unknown as MockEl)).toContain('gives a life, not a seat');
    });
  });
});
