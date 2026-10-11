import { describe, expect, it } from 'vitest';

import {
  ARENA_DEFAULTS,
  decodeArenaState,
  isArenaCommand,
  readArenaSettings,
  sanitizeArenaSetting,
} from '../../src/shared/arena-protocol.ts';
import { isFeedCommand } from '../../src/shared/feed-protocol.ts';

describe('arena protocol', () => {
  it('accepts its own commands only, and Feed does not take them for its own', () => {
    expect(isArenaCommand({ cmd: 'arena-setting', name: 'places', value: 6 })).toBe(true);
    expect(isArenaCommand({ cmd: 'arena-setting', name: 'weather', value: 'snow' })).toBe(false);
    expect(isArenaCommand({ cmd: 'arena-setting', value: 6 })).toBe(false);
    expect(isArenaCommand({ cmd: 'round' })).toBe(false);
    expect(isArenaCommand(null)).toBe(false);
    expect(isFeedCommand({ cmd: 'arena-setting', name: 'places', value: 6 })).toBe(false);
  });

  it('clamps settings to values the game accepts', () => {
    expect(sanitizeArenaSetting('places', 8)).toBe(8);
    expect(sanitizeArenaSetting('places', 10)).toBeUndefined();
    expect(sanitizeArenaSetting('places', '6')).toBeUndefined();
    expect(sanitizeArenaSetting('entryLikes', 150)).toBe(150);
    expect(sanitizeArenaSetting('boostCap', 10)).toBe(10);
    expect(sanitizeArenaSetting('boostCap', 1.5)).toBeUndefined();
    expect(sanitizeArenaSetting('shieldGift', 0)).toBe(0);
    expect(sanitizeArenaSetting('roundLength', 240)).toBe(240);
    expect(sanitizeArenaSetting('roundLength', 1e9)).toBeUndefined();
    expect(sanitizeArenaSetting('giftBerries', 'shared')).toBe('shared');
    expect(sanitizeArenaSetting('giftBerries', 'everyone')).toBeUndefined();
    expect(sanitizeArenaSetting('wildSnakes', 0)).toBe(0);
    expect(sanitizeArenaSetting('plainEvery', 25)).toBe(25);
    expect(sanitizeArenaSetting('queueIdle', 5)).toBe(5);
    expect(sanitizeArenaSetting('lifePrice', 30)).toBe(30);
    expect(sanitizeArenaSetting('lifePrice', 0)).toBeUndefined();
    expect(sanitizeArenaSetting('lifeKeep', 0.6)).toBeUndefined();
    expect(sanitizeArenaSetting('backing', 'strong')).toBe('strong');
    for (const name of ['giftEntry', 'lifeOn', 'likeBoost', 'pilot', 'superAI'] as const) {
      expect(sanitizeArenaSetting(name, true)).toBe(true);
      expect(sanitizeArenaSetting(name, 'yes')).toBeUndefined();
    }
  });

  it('starts as Abdel set it: 100 likes in, berries for their giver, no shield, no life gift', () => {
    expect(ARENA_DEFAULTS).toMatchObject({
      places: 6,
      entryLikes: 100,
      giftEntry: true,
      giftBerries: 'owner',
      shieldGift: 0,
      plainEvery: 25,
      plainAmount: 1,
      queueIdle: 5,
      lifeOn: false,
      lifePrice: 30,
      backing: 'off',
      superAI: true,
      pilot: false,
    });
  });

  it('every default is a value the game accepts', () => {
    for (const [name, value] of Object.entries(ARENA_DEFAULTS))
      expect(sanitizeArenaSetting(name as keyof typeof ARENA_DEFAULTS, value)).toBe(value);
  });

  it('reads saved settings back, keeping what is still valid', () => {
    expect(readArenaSettings(null)).toEqual(ARENA_DEFAULTS);
    expect(readArenaSettings('not json')).toEqual(ARENA_DEFAULTS);
    expect(readArenaSettings('[1,2]')).toEqual(ARENA_DEFAULTS);
    expect(
      readArenaSettings(JSON.stringify({ places: 8, roundLength: 61, giftBerries: 'shared' })),
    ).toEqual({ ...ARENA_DEFAULTS, places: 8, giftBerries: 'shared' });
  });

  it('decodes the board state and ignores anything else', () => {
    const arena = { settings: ARENA_DEFAULTS, secondsLeft: 42 };
    expect(decodeArenaState({ arena })).toEqual(arena);
    expect(decodeArenaState({ arena: { ...arena, secondsLeft: '42' } })).toBeNull();
    expect(decodeArenaState({ feed: {} })).toBeNull();
    expect(decodeArenaState(null)).toBeNull();
  });
});
