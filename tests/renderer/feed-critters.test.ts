import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearCrabs,
  crabLike,
  crabSeen,
  crabViewers,
  crabsState,
  setSleepers,
  sleepersState,
  stepSleepers,
} from '../../src/renderer/feed/crabs.ts';

// Pictures load at once, except a 'slow' one that never finishes and a 'broken' one that fails.
// A slow picture finishes as soon as `arrive` is called.
const slow: FakeImage[] = [];
class FakeImage {
  complete = false;
  naturalWidth = 0;
  crossOrigin = '';
  set src(url: string) {
    if (url.includes('slow')) {
      slow.push(this);
      return;
    }
    this.complete = true;
    this.naturalWidth = url.includes('broken') ? 0 : 64;
  }
}
function arrive(): void {
  for (const img of slow.splice(0)) {
    img.complete = true;
    img.naturalWidth = 64;
  }
}
Object.assign(globalThis, { Image: FakeImage });

const pic = (name: string): string => `https://p16.example/${name}.jpg`;

beforeEach(() => {
  clearCrabs();
  setSleepers(1);
});

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
  it('shows who just joined first, then the others still watching', () => {
    crabSeen('talker', pic('talker'), false);
    crabSeen('old', pic('old'), true);
    crabSeen('new', pic('new'), true);
    crabLike('liker', pic('liker'), 1);
    stepSleepers(20, 'sea');
    expect(sleepersState()).toEqual([{ who: 'new', flying: 0 }]);
    stepSleepers(23, 'sea');
    expect(sleepersState()[0]?.who).toBe('old');
    stepSleepers(26, 'sea');
    expect(sleepersState()[0]?.who).toBe('talker');
  });

  it('wakes the viewer it shows only once their heart has landed', () => {
    crabSeen('Lina', pic('Lina'), true);
    stepSleepers(1, 'sea');
    crabLike('Lina', pic('Lina'), 5);
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

  it('never shows a viewer without a picture or with a broken one', () => {
    crabSeen('nopic', undefined, true);
    crabSeen('broken', pic('broken'), true);
    stepSleepers(1, 'sea');
    stepSleepers(5, 'sea');
    expect(sleepersState()[0]?.who).toBeUndefined();
    crabSeen('Lina', pic('Lina'), false);
    stepSleepers(8, 'sea');
    expect(sleepersState()[0]?.who).toBe('Lina');
  });

  it('keeps its face while the next picture is still loading', () => {
    crabSeen('Lina', pic('Lina'), false);
    stepSleepers(1, 'sea');
    expect(sleepersState()[0]?.who).toBe('Lina');
    crabSeen('Sam', pic('slow-Sam'), true);
    for (let t = 2; t < 12; t += 0.5) stepSleepers(t, 'sea');
    expect(sleepersState()[0]?.who).toBe('Lina');
    arrive();
    stepSleepers(14, 'sea');
    expect(sleepersState()[0]?.who).toBe('Sam');
  });

  it('forgets a viewer not seen for two minutes', () => {
    crabSeen('Lina', pic('Lina'), true);
    stepSleepers(1, 'sea');
    expect(sleepersState()[0]?.who).toBe('Lina');
    stepSleepers(119, 'sea');
    expect(sleepersState()[0]?.who).toBe('Lina');
    stepSleepers(121, 'sea');
    expect(sleepersState()[0]?.who).toBeUndefined();
  });

  it('shows no more viewers than TikTok counts, the latest seen kept', () => {
    setSleepers(2);
    crabSeen('gone', pic('gone'), true);
    stepSleepers(1, 'sea');
    crabSeen('here', pic('here'), false);
    crabViewers(1);
    for (let t = 2; t < 10; t += 0.5) stepSleepers(t, 'sea');
    expect(sleepersState().map((s) => s.who)).toEqual(['here', undefined]);
  });

  it('takes the top viewers TikTok lists as here, and only them when they are all of them', () => {
    crabSeen('gone', pic('gone'), false);
    stepSleepers(1, 'sea');
    crabViewers(1, [{ nickname: 'top', avatar: pic('top') }]);
    stepSleepers(2, 'sea');
    expect(sleepersState()[0]?.who).toBe('top');
  });
});
