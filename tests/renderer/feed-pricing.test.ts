import { describe, expect, it } from 'vitest';

import { advise, bestStart, fitScore } from '../../src/shared/feed-advisor.ts';
import { rateTest, totals, type PerfSegment } from '../../src/shared/feed-perf.ts';
import {
  berriesForCoins,
  cellsToFill,
  giftCoins,
  normalizePricing,
  panelText,
  parsePricing,
  pricingWarnings,
} from '../../src/shared/feed-pricing.ts';
import { berriesPerGift, sanitizeSetting } from '../../src/shared/feed-protocol.ts';

const HOUR = 3_600_000;

function segment(over: Partial<PerfSegment> = {}): PerfSegment {
  return {
    start: 0,
    end: HOUR,
    pricing: '1:5,10:55,30:175',
    startFill: 0.95,
    otherGifts: false,
    coins: 0,
    berries: 0,
    units: 0,
    moments: 0,
    donors: {},
    newDonors: 0,
    viewerMinutes: 180,
    peakViewers: 6,
    joins: 0,
    likes: 0,
    roundsFilled: 0,
    byPrice: {},
    unpaid: 0,
    ...over,
  };
}

describe('price list', () => {
  it('reads, sorts and spells a list one way', () => {
    expect(parsePricing(' 10:55 ; 1:5,30:175 ')).toEqual([
      { coins: 1, berries: 5 },
      { coins: 10, berries: 55 },
      { coins: 30, berries: 175 },
    ]);
    expect(normalizePricing('30:175,1:5')).toBe('1:5,30:175');
  });

  it('refuses broken lists', () => {
    for (const bad of ['', '0:5', '1:-1', '1:2:3', 'a:b', '1.5:3', '1:1,2:2,3:3,4:4,5:5', 7])
      expect(parsePricing(bad)).toBeNull();
    expect(sanitizeSetting('pricing', '1:5,x')).toBeUndefined();
    expect(sanitizeSetting('pricing', '10:55,1:5')).toBe('1:5,10:55');
  });

  it('prices a gift by its coins, the name only when TikTok sends none', () => {
    expect(giftCoins('Rose')).toBe(1);
    expect(giftCoins('Lion', 29999)).toBe(29999);
    expect(giftCoins('Lion')).toBe(0);
    expect(berriesForCoins(10, '1:5,10:55', false)).toBe(55);
    // A price the list does not name: nothing, unless other gifts count.
    expect(berriesForCoins(5, '1:5,10:55', false)).toBe(0);
    expect(berriesForCoins(5, '1:5,10:55', true)).toBe(25);
    expect(berriesForCoins(100, '1:5,10:55', true)).toBe(550);
  });

  it('keeps the old rule by default: a Rose is 1 berry, a Rosa 10', () => {
    expect(berriesPerGift('Rose')).toBe(1);
    expect(berriesPerGift('rosa', 10)).toBe(10);
    expect(berriesPerGift('Rose', 1, '1:5,10:55,30:175')).toBe(5);
  });

  it('names the trap of a bigger gift paying less per coin', () => {
    expect(pricingWarnings(parsePricing('1:5,10:15,30:35,100:100') ?? [])).toHaveLength(3);
    expect(pricingWarnings(parsePricing('1:5,10:55,30:175') ?? [])).toEqual([]);
  });

  it('writes the panel text within LIVE Studio’s 20 characters', () => {
    expect(panelText(1)).toBe('1 BERRY');
    expect(panelText(100000).length).toBeLessThanOrEqual(20);
  });

  it('counts what a round needs from each start length', () => {
    expect(cellsToFill(900, 0)).toBe(539);
    expect(cellsToFill(900, 0.5)).toBe(449);
    expect(cellsToFill(900, 0.95)).toBe(44);
  });
});

describe('advisor', () => {
  it('picks the start length whose rounds last about 15 minutes', () => {
    expect(bestStart(25, 900).fill).toBe(0.95);
    expect(bestStart(400, 900).fill).toBe(0.9);
    expect(bestStart(2200, 900).fill).toBe(0);
  });

  it('scores a list against the board it runs on', () => {
    expect(fitScore(parsePricing('1:5,10:55,30:175') ?? [], 44)).toBe(3);
    expect(fitScore(parsePricing('1:1,10:10') ?? [], 44)).toBeLessThan(3);
  });

  it('says it is still learning with no data', () => {
    const advice = advise({
      segments: [],
      pricing: '1:1,10:10',
      startFill: 0,
      otherGifts: false,
      total: 900,
    });
    expect(advice[0]?.title).toMatch(/Learning/);
  });

  it('moves a small audience to the short board, with the numbers', () => {
    const segs = [
      segment({ end: 6 * HOUR, coins: 30, units: 30, moments: 12, byPrice: { '1': 30 } }),
    ];
    const advice = advise({
      segments: segs,
      pricing: '1:5,10:55,30:175',
      startFill: 0,
      otherGifts: false,
      total: 900,
    });
    const start = advice.find((a) => a.title.startsWith('Set the start length'));
    expect(start?.apply).toEqual([{ name: 'startFill', value: 0.95 }]);
    expect(advice.some((a) => a.title.includes('audience is the bottleneck'))).toBe(true);
  });

  it('flags gifts that dropped nothing and offers to count them', () => {
    const advice = advise({
      segments: [segment({ units: 3, unpaid: 3, byPrice: { '5': 3 } })],
      pricing: '1:5,10:55',
      startFill: 0.95,
      otherGifts: false,
      total: 900,
    });
    expect(advice.find((a) => a.title.includes('dropped no berry'))?.apply).toEqual([
      { name: 'otherGifts', value: true },
    ]);
  });

  it('offers a bigger gift once the top line sells', () => {
    const advice = advise({
      segments: [
        segment({
          coins: 90,
          units: 3,
          moments: 3,
          byPrice: { '30': 3 },
          donors: { a: 60, b: 30 },
        }),
      ],
      pricing: '1:5,10:55,30:175',
      startFill: 0.95,
      otherGifts: false,
      total: 900,
    });
    expect(advice.find((a) => a.title === 'Add a 99-coin gift')?.apply?.[0]?.value).toBe(
      '1:5,10:55,30:175,99:605',
    );
  });

  it('only calls a set-up better when the gap is unlikely to be luck', () => {
    expect(rateTest(5, 10, 4, 10)).toBeGreaterThan(0.5);
    expect(rateTest(40, 10, 10, 10)).toBeLessThan(0.001);
    expect(totals([segment({ coins: 10, donors: { a: 8, b: 2 } })]).topShare).toBe(0.8);
  });
});
