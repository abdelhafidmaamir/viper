import { describe, expect, it } from 'vitest';

import {
  NO_BRIDGE,
  decodeBridge,
  decodeCrowdView,
  decodeEffects,
  decodeScene,
  decodeStateMessage,
} from '../../../src/renderer/control/decode.ts';
import { gameState } from './fixtures.ts';

describe('decodeBridge', () => {
  it('falls back to a disconnected bridge on malformed payloads', () => {
    expect(decodeBridge(null)).toEqual(NO_BRIDGE);
    expect(decodeBridge('connected')).toEqual(NO_BRIDGE);
    expect(decodeBridge([1, 2])).toEqual(NO_BRIDGE);
  });

  it('keeps well-typed fields and defaults the others', () => {
    expect(
      decodeBridge({ connected: 'yes', url: 'ws://x/', events: 3, gifts: Number.NaN, error: 7 }),
    ).toEqual({ connected: false, url: 'ws://x/', events: 3, gifts: 0, last: '', error: '' });
  });
});

describe('decodeScene', () => {
  it('returns null without a named scene', () => {
    expect(decodeScene(null)).toBeNull();
    expect(decodeScene({ remaining: 3 })).toBeNull();
  });

  it('clamps times and narrows effects', () => {
    const scene = decodeScene({
      name: 'ballet',
      remaining: -1,
      duration: 20,
      gold: { stance: 'attack', hunt: 1, lure: true, noKill: 'yes', extra: 1 },
      shadow: 'bad',
    });
    expect(scene).toEqual({
      name: 'ballet',
      remaining: 0,
      duration: 20,
      gold: { stance: 'attack', hunt: 1, lure: true },
      shadow: {},
    });
  });

  it('ignores non-finite effect numbers', () => {
    expect(decodeEffects({ pA: Infinity, flair: 0.25 })).toEqual({ flair: 0.25 });
  });
});

describe('decodeCrowdView', () => {
  it('reads fervor, spend, counts and log lines', () => {
    const view = decodeCrowdView({
      log: ['Gold: shield (x)', 3],
      counts: { gold: { boost: 2, steal: 1, shield: 0, life: 0 } },
      gold: { fervor: 1.4, spend: 42 },
      shadow: { fervor: 0.3 },
    });
    expect(view?.log).toEqual(['Gold: shield (x)']);
    expect(view?.gold).toEqual({
      fervor: 1,
      spend: 42,
      counts: { boost: 2, steal: 1, shield: 0, life: 0 },
    });
    expect(view?.shadow.counts).toEqual({ boost: 0, steal: 0, shield: 0, life: 0 });
  });

  it('rejects a missing view', () => {
    expect(decodeCrowdView(undefined)).toBeNull();
  });
});

describe('decodeStateMessage', () => {
  it('accepts a state message', () => {
    const state = gameState();
    expect(decodeStateMessage({ state })).toBe(state);
  });

  it('accepts a state without a duel', () => {
    expect(decodeStateMessage({ state: gameState({ duel: null }) })).not.toBeNull();
  });

  it('rejects commands and malformed states', () => {
    expect(decodeStateMessage({ cmd: 'round' })).toBeNull();
    expect(decodeStateMessage({ state: { ...gameState(), metrics: null } })).toBeNull();
    expect(decodeStateMessage({ state: { ...gameState(), duel: { t: 'x' } } })).toBeNull();
    expect(decodeStateMessage({ state: { ...gameState(), advantage: '5' } })).toBeNull();
  });
});
