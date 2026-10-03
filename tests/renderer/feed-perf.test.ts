import { beforeEach, describe, expect, it } from 'vitest';

import {
  perfGift,
  perfSegments,
  perfTick,
  perfViewers,
  resetPerf,
  restorePerf,
} from '../../src/renderer/feed/perf.ts';

const memory = (): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
};

const small = { pricing: '1:5,10:55,30:175', startFill: 0.95, otherGifts: false };

describe('live earnings record', () => {
  beforeEach(() => {
    resetPerf();
  });

  it('records nothing off air', () => {
    const store = memory();
    perfTick(0, false, small, false, store);
    perfGift('a', 1, 5, 1, true, 1);
    expect(perfSegments()).toEqual([]);
  });

  it('sums a live: coins, moments, audience, gift sizes', () => {
    const store = memory();
    perfViewers(6);
    for (let t = 0; t <= 120_000; t += 1000) perfTick(t, true, small, false, store);
    perfGift('a', 10, 55, 1, true, 10, 10_000);
    perfGift('a', 1, 5, 1, false, 1, 30_000); // same viewer within a minute: same moment
    perfGift('b', 1, 5, 1, true, 1, 40_000);
    const [s] = perfSegments();
    expect(s?.coins).toBe(12);
    expect(s?.moments).toBe(2);
    expect(s?.newDonors).toBe(2);
    expect(s?.byPrice).toEqual({ '1': 2, '10': 1 });
    expect(s?.viewerMinutes).toBeCloseTo(12, 5);
  });

  it('starts a new segment when the set-up changes, and keeps them across a restart', () => {
    const store = memory();
    for (let t = 0; t <= 90_000; t += 1000) perfTick(t, true, small, false, store);
    const big = { ...small, startFill: 0 };
    for (let t = 91_000; t <= 200_000; t += 1000) perfTick(t, true, big, false, store);
    perfTick(201_000, false, big, false, store);
    expect(perfSegments().map((s) => s.startFill)).toEqual([0.95, 0]);
    resetPerf();
    restorePerf(store);
    expect(perfSegments()).toHaveLength(2);
  });
});
