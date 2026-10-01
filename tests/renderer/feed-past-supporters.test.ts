import { beforeEach, describe, expect, it } from 'vitest';

import { parsePastSupporters } from '../../src/renderer/feed-control/screens.ts';
import {
  claimSeed,
  lifetimeRank,
  looseName,
  resetSupporters,
  seedSupporters,
  supporter,
  topSupporters,
} from '../../src/renderer/feed/supporters.ts';

beforeEach(() => {
  resetSupporters();
});

describe('importing past supporters', () => {
  it('reads one per line, name ; coins, and skips what does not read', () => {
    expect(
      parsePastSupporters('🟢MAPLE482🇨🇦 ; 210\nriverfox\t194\nSam Carter, 13 Pièces\n\njunk line'),
    ).toEqual([
      { nickname: '🟢MAPLE482🇨🇦', berries: 210 },
      { nickname: 'riverfox', berries: 194 },
      { nickname: 'Sam Carter', berries: 13 },
    ]);
  });

  it('matches names loosely: case, emoji and punctuation do not count', () => {
    expect(looseName('🟢MAPLE482🇨🇦')).toBe('maple482');
    expect(looseName('m.h5m3d🎧')).toBe('mh5m3d');
    expect(looseName('❤️❤️❤️')).toBe('');
  });

  it('ranks them at once, then moves their berries to their account when they come', () => {
    seedSupporters([
      { nickname: '🟢MAPLE482🇨🇦', berries: 210 },
      { nickname: 'riverfox', berries: 194 },
    ]);
    expect(topSupporters(3).map((s) => s.nickname)).toEqual(['🟢MAPLE482🇨🇦', 'riverfox']);
    claimSeed('maple_real', 'MAPLE482 🇨🇦');
    expect(supporter('maple_real')?.berries).toBe(210);
    expect(lifetimeRank('maple_real')).toBe(1);
    expect(topSupporters(3).map((s) => s.nickname)).toEqual(['MAPLE482 🇨🇦', 'riverfox']);
  });

  it('never counts the same list twice, before or after they came', () => {
    const list = [{ nickname: 'riverfox', berries: 194 }];
    seedSupporters(list);
    seedSupporters(list);
    expect(topSupporters(3)[0]?.berries).toBe(194);
    claimSeed('riv', 'riverfox');
    seedSupporters(list);
    claimSeed('riv', 'riverfox');
    expect(supporter('riv')?.berries).toBe(194);
    expect(topSupporters(3)).toHaveLength(1);
  });

  it('puts berries straight on the account when the @handle is given', () => {
    expect(parsePastSupporters('Sam Carter ; 13 ; @samcarter2001')).toEqual([
      { nickname: 'Sam Carter', berries: 13, id: 'samcarter2001' },
    ]);
    seedSupporters([{ nickname: 'Sam Carter', berries: 13, id: '@SamCarter2001' }]);
    expect(supporter('samcarter2001')?.berries).toBe(13);
    // Again, with or without the handle, and once he comes to a live: still 13.
    seedSupporters([{ nickname: 'Sam Carter', berries: 13, id: 'samcarter2001' }]);
    seedSupporters([{ nickname: 'Sam Carter', berries: 13 }]);
    claimSeed('samcarter2001', 'Sam Carter');
    expect(supporter('samcarter2001')?.berries).toBe(13);
    expect(topSupporters(5)).toHaveLength(1);
  });
});
