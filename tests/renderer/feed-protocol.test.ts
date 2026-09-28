import { describe, expect, it } from 'vitest';

import {
  berriesPerGift,
  decodeFeedState,
  isFeedCommand,
  sanitizeSetting,
} from '../../src/shared/feed-protocol.ts';

describe('feed protocol', () => {
  it('only the Rose and the Rosa feed the snake', () => {
    expect(berriesPerGift('Rose')).toBe(1);
    expect(berriesPerGift(' rosa ')).toBe(10);
    expect(berriesPerGift('ROSA')).toBe(10);
    for (const other of ['Lion', 'Rose rouge', 'Bouquet', 'TikTok', '', undefined])
      expect(berriesPerGift(other)).toBe(0);
  });

  it('accepts known commands only', () => {
    expect(isFeedCommand({ cmd: 'round' })).toBe(true);
    expect(isFeedCommand({ cmd: 'gift', gift: 'rose', count: 1 })).toBe(true);
    expect(isFeedCommand({ cmd: 'scene' })).toBe(false);
    expect(isFeedCommand(null)).toBe(false);
    expect(isFeedCommand('round')).toBe(false);
  });

  it('clamps settings to values the game accepts', () => {
    expect(sanitizeSetting('weather', 'snow')).toBe('snow');
    expect(sanitizeSetting('weather', 'lava')).toBeUndefined();
    expect(sanitizeSetting('hour', 0.5)).toBe(0.5);
    expect(sanitizeSetting('hour', 1)).toBeUndefined();
    expect(sanitizeSetting('autoAmbience', 'yes')).toBeUndefined();
    expect(sanitizeSetting('language', 'fr')).toBe('fr');
    expect(sanitizeSetting('language', 'de')).toBeUndefined();
  });

  it('decodes a state message and rejects anything else', () => {
    const feed = { fill: 0.4, settings: {}, leaders: [] };
    expect(decodeFeedState({ feed })).toBe(feed);
    expect(decodeFeedState({ state: feed })).toBeNull();
    expect(decodeFeedState({ feed: { fill: '40%', settings: {}, leaders: [] } })).toBeNull();
  });
});
