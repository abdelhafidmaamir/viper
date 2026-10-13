/**
 * Verifies that the Arena control room omits the controls and info that have no effect there,
 * and that Feed's control room still shows them.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import type { ArenaSide } from '../../src/renderer/arena-control/arena-state.ts';
import { seatCard } from '../../src/renderer/arena-control/cards.ts';
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
      state: () => ({ settings: { ...ARENA_DEFAULTS, ...settings }, secondsLeft: 60 }),
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
