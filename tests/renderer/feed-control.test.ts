import { describe, expect, it } from 'vitest';

import {
  armVm,
  cleanPending,
  controlsReason,
  rehearsalReason,
  fpsTone,
  isGameLinkStale,
  resolvePending,
  type FeedControlState,
  type PendingSlot,
} from '../../src/renderer/feed-control/store.ts';
import type { FeedState } from '../../src/shared/feed-protocol.ts';

// Minimal FeedState for testing
function makeGameState(overrides?: Partial<FeedState>): FeedState {
  return {
    bridge: null,
    phase: 'playing',
    round: 1,
    pattern: 1,
    fill: 0,
    cells: 0,
    total: 320,
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
      crownStyle: 'classic',
      snakeSkin: 'classic',
      snakeColour: 'sand',
      rankedWelcome: 0,
      pricing: '1:1,10:10',
      otherGifts: false,
    },
    fps: 60,
    slowFrames: 0,
    errors: 0,
    ...overrides,
  };
}

function makeState(overrides?: Partial<FeedControlState>): FeedControlState {
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

describe('fpsTone', () => {
  it('returns live for fps >= 58', () => {
    expect(fpsTone(60)).toBe('live');
    expect(fpsTone(58)).toBe('live');
  });

  it('returns warn for 45 <= fps < 58', () => {
    expect(fpsTone(57)).toBe('warn');
    expect(fpsTone(45)).toBe('warn');
  });

  it('returns danger for fps < 45', () => {
    expect(fpsTone(44)).toBe('danger');
    expect(fpsTone(0)).toBe('danger');
  });
});

describe('isGameLinkStale', () => {
  it('is stale when no state has arrived', () => {
    expect(isGameLinkStale({ lastStateAt: null, now: 5000 })).toBe(true);
  });

  it('is stale when the last state is 2000 ms old', () => {
    expect(isGameLinkStale({ lastStateAt: 3000, now: 5000 })).toBe(true);
  });

  it('is not stale when the last state arrived recently', () => {
    expect(isGameLinkStale({ lastStateAt: 4500, now: 5000 })).toBe(false);
  });

  it('is not stale right at the threshold (exclusive)', () => {
    expect(isGameLinkStale({ lastStateAt: 3001, now: 5000 })).toBe(false);
  });
});

describe('controlsReason', () => {
  it('returns waiting message before first state', () => {
    const reason = controlsReason(makeState());
    expect(reason).toBe('Waiting for the game window');
  });

  it('returns not responding when stale', () => {
    const reason = controlsReason(makeState({ lastStateAt: 0, now: 3000 }));
    expect(reason).toBe('Game not responding');
  });

  it('returns null when link is healthy', () => {
    const reason = controlsReason(makeState({ lastStateAt: 4500, now: 5000 }));
    expect(reason).toBeNull();
  });
});

describe('rehearsalReason', () => {
  it('locks rehearsal tools while TikFinity is live', () => {
    const live = makeState({
      lastStateAt: 4500,
      now: 5000,
      gameState: makeGameState({ bridge: { connected: true, url: 'ws://x', events: 1, gifts: 0 } }),
    });
    expect(rehearsalReason(live)).toBe('Off while TikFinity is live');
    expect(controlsReason(live)).toBeNull();
  });

  it('allows them off live', () => {
    const off = makeState({ lastStateAt: 4500, now: 5000, gameState: makeGameState() });
    expect(rehearsalReason(off)).toBeNull();
  });
});

describe('resolvePending', () => {
  it('returns idle when no slot', () => {
    expect(resolvePending('rain', undefined, 1000)).toEqual({ value: 'rain', status: 'idle' });
  });

  it('returns idle when state confirms the pending value', () => {
    const slot: PendingSlot = { value: 'snow', sentAt: 0 };
    expect(resolvePending('snow', slot, 1000)).toEqual({ value: 'snow', status: 'idle' });
  });

  it('returns pending with optimistic value before timeout', () => {
    const slot: PendingSlot = { value: 'snow', sentAt: 500 };
    expect(resolvePending('rain', slot, 1000)).toEqual({ value: 'snow', status: 'pending' });
  });

  it('returns error with state value after timeout', () => {
    const slot: PendingSlot = { value: 'snow', sentAt: 0 };
    expect(resolvePending('rain', slot, 3000)).toEqual({ value: 'rain', status: 'error' });
  });
});

describe('armVm', () => {
  it('returns not armed when no arm set', () => {
    expect(armVm(makeState(), 'round')).toEqual({ armed: false, fraction: 0 });
  });

  it('returns not armed for a different key', () => {
    const state = makeState({ armed: 'mode', armedAt: 1000, now: 1500 });
    expect(armVm(state, 'round')).toEqual({ armed: false, fraction: 0 });
  });

  it('returns armed with correct fraction', () => {
    const state = makeState({ armed: 'round', armedAt: 1000, now: 1000 });
    const vm = armVm(state, 'round');
    expect(vm.armed).toBe(true);
    expect(vm.fraction).toBeCloseTo(1.0);
  });

  it('returns armed with decreasing fraction as time passes', () => {
    const state = makeState({ armed: 'round', armedAt: 1000, now: 2500 });
    const vm = armVm(state, 'round');
    expect(vm.armed).toBe(true);
    expect(vm.fraction).toBeCloseTo(0.5);
  });

  it('returns not armed after timeout', () => {
    const state = makeState({ armed: 'round', armedAt: 1000, now: 4001 });
    expect(armVm(state, 'round')).toEqual({ armed: false, fraction: 0 });
  });
});

describe('cleanPending', () => {
  it('removes confirmed slots', () => {
    const gs = makeGameState({
      settings: {
        weather: 'snow',
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
        crownStyle: 'classic',
        snakeSkin: 'classic',
        snakeColour: 'sand',
        rankedWelcome: 0,
        pricing: '1:1,10:10',
        otherGifts: false,
      },
    });
    const pending = { weather: { value: 'snow', sentAt: 0 } };
    const result = cleanPending(pending, gs.settings, 1000);
    expect(result).not.toHaveProperty('weather');
  });

  it('removes expired slots', () => {
    const gs = makeGameState();
    const pending = { weather: { value: 'snow', sentAt: 0 } };
    const result = cleanPending(pending, gs.settings, 3000);
    expect(result).not.toHaveProperty('weather');
  });

  it('keeps in-flight pending slots', () => {
    const gs = makeGameState();
    const pending = { weather: { value: 'snow', sentAt: 500 } };
    const result = cleanPending(pending, gs.settings, 1000);
    expect(result).toHaveProperty('weather');
  });

  it('returns the same reference when nothing changed', () => {
    const gs = makeGameState();
    const pending = {};
    expect(cleanPending(pending, gs.settings, 1000)).toBe(pending);
  });
});
