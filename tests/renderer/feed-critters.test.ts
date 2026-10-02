import { beforeEach, describe, expect, it } from 'vitest';

import { clearCrabs, crabLike, crabsState } from '../../src/renderer/feed/crabs.ts';

beforeEach(clearCrabs);

describe('the animals of the viewers who like', () => {
  it('gives a viewer one animal and adds their likes up on it', () => {
    crabLike('Lina', undefined, 3);
    crabLike('Lina', undefined, 8);
    expect(crabsState()).toMatchObject([{ nickname: 'Lina', total: 11 }]);
  });

  it('sends up one heart per like of a burst, a dozen at most', () => {
    crabLike('Lina', undefined, 4);
    expect(crabsState()[0]?.hearts).toBe(4);
    clearCrabs();
    crabLike('Lina', undefined, 80);
    expect(crabsState()[0]?.hearts).toBe(12);
  });

  it('owes more hops for a bigger burst, four in a row at most', () => {
    crabLike('Lina', undefined, 1);
    const one = crabsState()[0]?.owed ?? 0;
    crabLike('Lina', undefined, 30);
    const more = crabsState()[0]?.owed ?? 0;
    expect(more).toBeGreaterThan(one);
    for (let k = 0; k < 10; k++) crabLike('Lina', undefined, 30);
    expect(crabsState()[0]?.owed).toBeLessThanOrEqual(4);
  });

  it('holds five places: a sixth viewer takes one, whatever its holder had', () => {
    for (const who of ['a', 'b', 'c', 'd', 'e']) crabLike(who, undefined, 300);
    crabLike('f', undefined, 1);
    const now = crabsState();
    expect(now).toHaveLength(5);
    expect(now.map((c) => c.nickname)).toContain('f');
    // Back after losing the place: the count starts again.
    const out = ['a', 'b', 'c', 'd', 'e'].find((who) => !now.some((c) => c.nickname === who));
    crabLike(out ?? '', undefined, 2);
    expect(crabsState().find((c) => c.nickname === out)?.total).toBe(2);
  });

  it('ignores a like without a name or without a count', () => {
    crabLike('', undefined, 5);
    crabLike('Lina', undefined, 0);
    expect(crabsState()).toHaveLength(0);
  });
});
