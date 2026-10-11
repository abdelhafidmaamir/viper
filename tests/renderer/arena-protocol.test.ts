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
    expect(sanitizeArenaSetting('places', 10)).toBe(10);
    expect(sanitizeArenaSetting('places', 7)).toBeUndefined();
    expect(sanitizeArenaSetting('places', '8')).toBeUndefined();
    expect(sanitizeArenaSetting('entryLikes', 100)).toBe(100);
    expect(sanitizeArenaSetting('boostCap', 1.25)).toBe(1.25);
    expect(sanitizeArenaSetting('boostCap', 3)).toBeUndefined();
    expect(sanitizeArenaSetting('shieldGift', 0)).toBe(0);
    expect(sanitizeArenaSetting('roundLength', 300)).toBe(300);
    expect(sanitizeArenaSetting('roundLength', 1e9)).toBeUndefined();
    expect(sanitizeArenaSetting('giftBerries', 'shared')).toBe('shared');
    expect(sanitizeArenaSetting('giftBerries', 'everyone')).toBeUndefined();
    expect(sanitizeArenaSetting('wildSnakes', 0)).toBe(0);
    expect(sanitizeArenaSetting('wildSnakes', -1)).toBeUndefined();
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
      readArenaSettings(JSON.stringify({ places: 12, roundLength: 61, giftBerries: 'shared' })),
    ).toEqual({ ...ARENA_DEFAULTS, places: 12, giftBerries: 'shared' });
  });

  it('decodes the board state and ignores anything else', () => {
    const arena = { settings: ARENA_DEFAULTS, secondsLeft: 42 };
    expect(decodeArenaState({ arena })).toEqual(arena);
    expect(decodeArenaState({ arena: { ...arena, secondsLeft: '42' } })).toBeNull();
    expect(decodeArenaState({ feed: {} })).toBeNull();
    expect(decodeArenaState(null)).toBeNull();
  });
});
