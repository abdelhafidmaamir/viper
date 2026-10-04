import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearCrabs,
  crabLike,
  crabSeen,
  crabsState,
  sleepersState,
  stepSleepers,
} from '../../src/renderer/feed/crabs.ts';

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

describe('the sleeping crabs on the beach', () => {
  it('shows the latest join first and never a viewer whose crab is out', () => {
    crabSeen('old', undefined, true);
    crabSeen('new', undefined, true);
    crabLike('liker', undefined, 1);
    stepSleepers(20, 'sea');
    expect(sleepersState()).toEqual([{ who: 'new', flying: 0 }]);
    stepSleepers(23, 'sea');
    expect(sleepersState()[0]?.who).toBe('old');
  });

  it('wakes the viewer it shows only once their heart has landed', () => {
    crabSeen('Lina', undefined, true);
    stepSleepers(1, 'sea');
    crabLike('Lina', undefined, 5);
    expect(crabsState()).toHaveLength(0);
    expect(sleepersState()[0]?.flying).toBe(5);
    stepSleepers(2, 'sea');
    expect(crabsState()).toMatchObject([{ nickname: 'Lina', total: 5 }]);
    expect(sleepersState()[0]?.who).toBeUndefined();
  });

  it('keeps the likers clear of the sleepers', () => {
    stepSleepers(1, 'sea');
    for (const who of ['a', 'b', 'c', 'd', 'e']) crabLike(who, undefined, 1);
    expect(crabsState()).toHaveLength(4);
  });
});
