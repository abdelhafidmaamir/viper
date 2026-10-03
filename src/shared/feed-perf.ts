/**
 * What lives earned, measured so two set-ups can be compared fairly. The game cuts its time on
 * air into segments: a segment runs while TikFinity is live and the money settings (price list,
 * start length, other gifts) stay the same. Changing one of them starts a new segment, so each
 * segment is one set-up under test.
 */

export interface PerfSegment {
  readonly start: number;
  readonly end: number;
  readonly pricing: string;
  readonly startFill: number;
  readonly otherGifts: boolean;
  /** Coins viewers paid, every gift counted, fed the snake or not. */
  readonly coins: number;
  readonly berries: number;
  /** Gifts, a streak counting each of its gifts. */
  readonly units: number;
  /**
   * Giving moments: a viewer's gifts less than a minute apart are one moment. Moments, unlike
   * coins, are roughly independent events, which is what the comparison test needs.
   */
  readonly moments: number;
  /** Coins per giver (TikTok id or nickname), to see when one person carries the whole result. */
  readonly donors: Readonly<Record<string, number>>;
  /** Givers whose first gift ever came in this segment. */
  readonly newDonors: number;
  /** Viewers times minutes on air: the audience the segment had. */
  readonly viewerMinutes: number;
  readonly peakViewers: number;
  readonly joins: number;
  readonly likes: number;
  readonly roundsFilled: number;
  /** Gifts by price in coins. */
  readonly byPrice: Readonly<Record<string, number>>;
  /** Gifts that dropped no berry (a price missing from the list). */
  readonly unpaid: number;
}

export interface PerfTotals {
  readonly hours: number;
  readonly coins: number;
  readonly units: number;
  readonly moments: number;
  readonly viewerHours: number;
  readonly donors: number;
  /** Share of the coins that came from the biggest giver, 0 to 1. */
  readonly topShare: number;
  readonly topDonor: string;
  readonly newDonors: number;
  readonly roundsFilled: number;
  readonly joins: number;
  readonly unpaid: number;
  readonly byPrice: Readonly<Record<string, number>>;
}

const hoursOf = (s: PerfSegment): number => Math.max(0, s.end - s.start) / 3_600_000;

export function totals(segments: readonly PerfSegment[]): PerfTotals {
  const donors = new Map<string, number>(),
    byPrice: Record<string, number> = {};
  let hours = 0,
    coins = 0,
    units = 0,
    moments = 0,
    viewerMinutes = 0,
    newDonors = 0,
    roundsFilled = 0,
    joins = 0,
    unpaid = 0;
  for (const s of segments) {
    hours += hoursOf(s);
    coins += s.coins;
    units += s.units;
    moments += s.moments;
    viewerMinutes += s.viewerMinutes;
    newDonors += s.newDonors;
    roundsFilled += s.roundsFilled;
    joins += s.joins;
    unpaid += s.unpaid;
    for (const [k, v] of Object.entries(s.donors)) donors.set(k, (donors.get(k) ?? 0) + v);
    for (const [k, v] of Object.entries(s.byPrice)) byPrice[k] = (byPrice[k] ?? 0) + v;
  }
  let topDonor = '',
    top = 0;
  for (const [k, v] of donors)
    if (v > top) {
      top = v;
      topDonor = k;
    }
  return {
    hours,
    coins,
    units,
    moments,
    viewerHours: viewerMinutes / 60,
    donors: donors.size,
    topShare: coins > 0 ? top / coins : 0,
    topDonor,
    newDonors,
    roundsFilled,
    joins,
    unpaid,
    byPrice,
  };
}

/** The set-up a segment tested, as one key. */
export const setupKey = (s: Pick<PerfSegment, 'pricing' | 'startFill' | 'otherGifts'>): string =>
  `${s.pricing}|${String(s.startFill)}|${s.otherGifts ? 'others' : 'listed'}`;

/** The most recent segments that add up to `hours` on air, newest first. */
export function lastHours(segments: readonly PerfSegment[], hours: number): PerfSegment[] {
  const out: PerfSegment[] = [];
  let sum = 0;
  for (let i = segments.length - 1; i >= 0 && sum < hours; i--) {
    const s = segments[i];
    if (!s) continue;
    out.push(s);
    sum += hoursOf(s);
  }
  return out;
}

/**
 * Two-sided exact test that two event rates differ: `a` events over exposure `ea` against `b`
 * over `eb` (the conditional binomial test for Poisson rates). Returns the p-value: the chance of
 * a gap at least this big if both set-ups were in fact the same. Small means a real difference.
 */
export function rateTest(a: number, ea: number, b: number, eb: number): number {
  const n = a + b;
  if (n === 0 || ea <= 0 || eb <= 0) return 1;
  const p = ea / (ea + eb),
    lnF = [0];
  for (let i = 1; i <= n; i++) lnF.push((lnF[i - 1] ?? 0) + Math.log(i));
  const pmf: number[] = [];
  for (let k = 0; k <= n; k++) {
    const lnC = (lnF[n] ?? 0) - (lnF[k] ?? 0) - (lnF[n - k] ?? 0);
    pmf.push(Math.exp(lnC + k * Math.log(p) + (n - k) * Math.log(1 - p)));
  }
  const seen = pmf[a] ?? 0;
  let sum = 0;
  for (const q of pmf) if (q <= seen * (1 + 1e-9)) sum += q;
  return Math.min(1, sum);
}
