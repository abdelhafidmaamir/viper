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
      parsePastSupporters('🟢KAPACH971🇬🇵 ; 210\nskohlds\t194\nNico Arenas, 13 Pièces\n\njunk line'),
    ).toEqual([
      { nickname: '🟢KAPACH971🇬🇵', berries: 210 },
      { nickname: 'skohlds', berries: 194 },
      { nickname: 'Nico Arenas', berries: 13 },
    ]);
  });

  it('matches names loosely: case, emoji and punctuation do not count', () => {
    expect(looseName('🟢KAPACH971🇬🇵')).toBe('kapach971');
    expect(looseName('m.h5m3d🎧')).toBe('mh5m3d');
    expect(looseName('❤️❤️❤️')).toBe('');
  });

  it('ranks them at once, then moves their berries to their account when they come', () => {
    seedSupporters([
      { nickname: '🟢KAPACH971🇬🇵', berries: 210 },
      { nickname: 'skohlds', berries: 194 },
    ]);
    expect(topSupporters(3).map((s) => s.nickname)).toEqual(['🟢KAPACH971🇬🇵', 'skohlds']);
    claimSeed('kapach_real', 'KAPACH971 🇬🇵');
    expect(supporter('kapach_real')?.berries).toBe(210);
    expect(lifetimeRank('kapach_real')).toBe(1);
    expect(topSupporters(3).map((s) => s.nickname)).toEqual(['KAPACH971 🇬🇵', 'skohlds']);
  });

  it('never counts the same list twice, before or after they came', () => {
    const list = [{ nickname: 'skohlds', berries: 194 }];
    seedSupporters(list);
    seedSupporters(list);
    expect(topSupporters(3)[0]?.berries).toBe(194);
    claimSeed('sko', 'skohlds');
    seedSupporters(list);
    claimSeed('sko', 'skohlds');
    expect(supporter('sko')?.berries).toBe(194);
    expect(topSupporters(3)).toHaveLength(1);
  });

  it('puts berries straight on the account when the @handle is given', () => {
    expect(parsePastSupporters('Nico Arenas ; 13 ; @nicoarenas1988')).toEqual([
      { nickname: 'Nico Arenas', berries: 13, id: 'nicoarenas1988' },
    ]);
    seedSupporters([{ nickname: 'Nico Arenas', berries: 13, id: '@NicoArenas1988' }]);
    expect(supporter('nicoarenas1988')?.berries).toBe(13);
    // Again, with or without the handle, and once he comes to a live: still 13.
    seedSupporters([{ nickname: 'Nico Arenas', berries: 13, id: 'nicoarenas1988' }]);
    seedSupporters([{ nickname: 'Nico Arenas', berries: 13 }]);
    claimSeed('nicoarenas1988', 'Nico Arenas');
    expect(supporter('nicoarenas1988')?.berries).toBe(13);
    expect(topSupporters(5)).toHaveLength(1);
  });
});
