import type { GameState } from '../../../src/shared/control-protocol.ts';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** A plausible state message from the game window, with overrides. */
export function gameState(overrides: Partial<Mutable<GameState>> = {}): GameState {
  return {
    bridge: { connected: false, url: '', events: 0, gifts: 0, last: '', error: '' },
    advantage: 0,
    underdog: false,
    crowd: null,
    platform: 'tiktok',
    smooth: false,
    giftFeedback: 'G1',
    banner: 'P1',
    ranking: 'C3',
    weather: 'rain',
    autoAmbience: true,
    hour: 0.06,
    donorNames: true,
    superAi: false,
    aiDebug: false,
    scene: null,
    duel: { t: 10, winner: null, gold: { length: 4 }, shadow: { length: 4 } },
    metrics: { errors: 0 },
    ...overrides,
  };
}

export const LIVE_BRIDGE = {
  connected: true,
  url: 'ws://localhost:21213/',
  events: 1204,
  gifts: 87,
  last: 'gift Rose x1',
  error: '',
};
