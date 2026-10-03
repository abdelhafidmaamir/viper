/**
 * The money advisor: reads the recorded segments (feed-perf.ts) and says which set-up to run
 * next. Every piece of advice carries the numbers it rests on and how sure it is, and an action
 * the control room can apply in one click. It only knows what the lives measured: with little
 * data it says so instead of guessing.
 */
import {
  berriesForCoins,
  cellsToFill,
  formatPricing,
  parsePricing,
  pricingWarnings,
  PRICE_TIERS_MAX,
  PRICING_PRESETS,
  type PriceTier,
} from './feed-pricing.ts';
import { START_FILLS } from './feed-protocol.ts';
import { lastHours, rateTest, setupKey, totals, type PerfSegment } from './feed-perf.ts';

export type AdviceTone = 'do' | 'warn' | 'info';

export interface AdviceAction {
  readonly name: 'pricing' | 'startFill' | 'otherGifts';
  readonly value: string | number | boolean;
}

export interface Advice {
  readonly tone: AdviceTone;
  readonly title: string;
  readonly detail: string;
  readonly apply?: readonly AdviceAction[];
}

export interface AdvisorInput {
  readonly segments: readonly PerfSegment[];
  readonly pricing: string;
  readonly startFill: number;
  readonly otherGifts: boolean;
  /** Cells on the board. */
  readonly total: number;
}

/** A round should end every 10 to 20 minutes: often enough to pay givers back on screen. */
export const ROUND_MINUTES = 15;
/** Live hours the pace is read over. */
const PACE_HOURS = 6;
/** Below this, prices are not what limits the money: the audience is. */
const SMALL_COINS_PER_HOUR = 30;
/** Usual TikTok gift prices, to suggest a next line people can actually send. */
const GIFT_PRICES = [1, 5, 10, 15, 20, 30, 49, 99, 100, 199, 299, 500, 999, 1000, 2000, 5000];

const fmt = (n: number, digits = 0): string =>
  n.toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
const startLabel = (f: number): string => (f === 0 ? 'normal' : `${fmt(f * 100)}%`);
const round5 = (n: number): number => Math.max(5, Math.round(n / 5) * 5);

/** How sure: from the number of giving moments and hours behind a figure. */
export function confidence(moments: number, hours: number): 'low' | 'medium' | 'high' {
  if (moments >= 60 && hours >= 10) return 'high';
  if (moments >= 20 && hours >= 3) return 'medium';
  return 'low';
}

/** Berries an hour the recorded gifts would drop under a price list. */
function berriesPerHour(
  byPrice: Readonly<Record<string, number>>,
  hours: number,
  pricing: string,
  others: boolean,
): number {
  if (hours <= 0) return 0;
  let berries = 0;
  for (const [price, units] of Object.entries(byPrice))
    berries += units * berriesForCoins(Number(price), pricing, others);
  return berries / hours;
}

/** The start length whose rounds end closest to ROUND_MINUTES at a pace in berries an hour. */
export function bestStart(perHour: number, total: number): { fill: number; minutes: number } {
  let best = { fill: 0.95, minutes: Infinity },
    gap = Infinity;
  for (const fill of START_FILLS) {
    const minutes = perHour > 0 ? (cellsToFill(total, fill) / perHour) * 60 : Infinity;
    const g = Math.abs(Math.log(minutes / ROUND_MINUTES));
    if (g < gap) {
      gap = g;
      best = { fill, minutes };
    }
  }
  return best;
}

/**
 * How well a price list suits a round of `toFill` berries: the cheapest gift visible but not
 * ending the round, one gift that ends it, and no bigger gift worse per coin. 0 to 3.
 */
export function fitScore(tiers: readonly PriceTier[], toFill: number): number {
  const first = tiers[0];
  if (!first) return 0;
  const share = first.berries / toFill;
  return (
    (share >= 0.02 && share <= 0.15 ? 1 : 0) +
    (tiers.some((t) => t.berries >= toFill && t.berries <= toFill * 3) ? 1 : 0) +
    (pricingWarnings(tiers).length === 0 ? 1 : 0)
  );
}

const minutesText = (m: number): string =>
  !Number.isFinite(m)
    ? 'never at this pace'
    : m >= 120
      ? `every ${fmt(m / 60, 1)} h`
      : `every ${fmt(m)} min`;

export function advise(input: AdvisorInput): Advice[] {
  const { segments, pricing, startFill, otherGifts, total } = input;
  const out: Advice[] = [];
  const all = totals(segments);
  const tiers = parsePricing(pricing) ?? [];

  if (all.hours < 1) {
    out.push({
      tone: 'info',
      title: `Learning: ${fmt(all.hours * 60)} min of live recorded`,
      detail:
        'The advisor reads lives as they happen. Its advice firms up after about 3 hours on air and 20 giving moments.',
    });
  }

  // Money lost: gifts that dropped nothing.
  const recent = totals(lastHours(segments, 10));
  if (recent.unpaid > 0 && !otherGifts)
    out.push({
      tone: 'warn',
      title: `${fmt(recent.unpaid)} gifts dropped no berry`,
      detail:
        'Viewers paid for gifts at prices your list does not name. Count them at the closest line’s rate so nobody pays for nothing.',
      apply: [{ name: 'otherGifts', value: true }],
    });

  for (const w of pricingWarnings(tiers))
    out.push({ tone: 'warn', title: 'Price list trap', detail: w });

  // The pace, priced with today's list, sets the start length.
  const pace = lastHours(segments, PACE_HOURS),
    p = totals(pace),
    perHour = berriesPerHour(p.byPrice, p.hours, pricing, otherGifts),
    coinsPerHour = p.hours > 0 ? p.coins / p.hours : 0,
    sure = confidence(p.moments, p.hours);
  const now = cellsToFill(total, startFill),
    nowMinutes = perHour > 0 ? (now / perHour) * 60 : Infinity,
    best = bestStart(perHour, total);
  if (p.hours >= 0.5 && perHour > 0) {
    const same = best.fill === startFill;
    out.push({
      tone: same ? 'info' : 'do',
      title: same
        ? `Start length ${startLabel(startFill)} fits your pace`
        : `Set the start length to ${startLabel(best.fill)}`,
      detail: `Last ${fmt(p.hours, 1)} h: ${fmt(coinsPerHour, 1)} coins/h, so ${fmt(perHour)} berries/h at your prices. A round ends ${minutesText(nowMinutes)} at ${startLabel(startFill)}${same ? '' : `, ${minutesText(best.minutes)} at ${startLabel(best.fill)}`}. Aim: a round every ${String(ROUND_MINUTES)} min. Confidence: ${sure}.`,
      ...(same ? {} : { apply: [{ name: 'startFill', value: best.fill }] }),
    });
  }

  // The price list against the board it will run on.
  const target = cellsToFill(total, p.hours >= 0.5 && perHour > 0 ? best.fill : startFill);
  if (tiers.length > 0 && fitScore(tiers, target) < 3) {
    const better = PRICING_PRESETS.map((pr) => ({
      pr,
      score: fitScore(parsePricing(pr.pricing) ?? [], target),
    }))
      .filter((x) => x.pr.pricing !== pricing)
      .sort((a, b) => b.score - a.score)[0];
    const first = tiers[0],
      top = tiers[tiers.length - 1];
    const why =
      first && first.berries / target > 0.5
        ? `Your cheapest gift alone fills ${fmt((first.berries / target) * 100)}% of a round: rounds end too cheaply.`
        : top && top.berries < target
          ? `No gift ends a round (${fmt(target)} berries needed, your top line drops ${fmt(top.berries)}): the strongest pay-off on screen is out of reach.`
          : 'The cheapest gift barely shows on this board, or a bigger gift pays less per coin.';
    out.push({
      tone: 'do',
      title:
        better && better.score > fitScore(tiers, target)
          ? `Switch prices to “${better.pr.label}”`
          : 'Rework the price list',
      detail: `${why} ${better ? `${better.pr.label} (${better.pr.pricing}): ${better.pr.hint}` : ''}`,
      ...(better && better.score > fitScore(tiers, target)
        ? { apply: [{ name: 'pricing', value: better.pr.pricing }] }
        : {}),
    });
  }

  // Scaling up: the top line is being sent, offer a bigger one.
  const top = tiers[tiers.length - 1];
  if (top) {
    const sentTop = recent.byPrice[String(top.coins)] ?? 0;
    const givers = new Set(
      lastHours(segments, 10)
        .filter((s) => (s.byPrice[String(top.coins)] ?? 0) > 0)
        .flatMap((s) => Object.keys(s.donors)),
    ).size;
    const next = GIFT_PRICES.find((c) => c >= top.coins * 3);
    if (sentTop >= 3 && givers >= 2 && next !== undefined) {
      const rate = (top.berries / top.coins) * 1.05,
        added: PriceTier = { coins: next, berries: round5(next * rate) },
        lines = [...tiers, added].slice(-PRICE_TIERS_MAX);
      out.push({
        tone: 'do',
        title: `Add a ${String(next)}-coin gift`,
        detail: `Your top line (${String(top.coins)} coins) was sent ${fmt(sentTop)} times in the last 10 h. Givers are ready for more: ${String(next)} coins → ${fmt(added.berries)} berries, a slightly better rate. Add that gift to the LIVE Studio panel too.`,
        apply: [{ name: 'pricing', value: formatPricing(lines) }],
      });
    } else if (
      recent.hours >= 8 &&
      sentTop === 0 &&
      tiers.length >= 2 &&
      recent.units >= 10 &&
      !out.some((o) => o.apply?.some((x) => x.name === 'pricing'))
    )
      out.push({
        tone: 'info',
        title: `Nobody sent the ${String(top.coins)}-coin gift in ${fmt(recent.hours)} h`,
        detail:
          'A top gift is also an anchor that makes the others look cheap, so keep it if you like. If your givers never get there, a top line about 3 times the one below converts more easily.',
      });
  }

  // Set-ups compared, on giving moments per viewer-hour, so a bigger audience does not fake a win.
  const bySetup = new Map<string, PerfSegment[]>();
  for (const s of segments) bySetup.set(setupKey(s), [...(bySetup.get(setupKey(s)) ?? []), s]);
  const nowKey = setupKey({ pricing, startFill, otherGifts }),
    mine = totals(bySetup.get(nowKey) ?? []);
  const rivals = [...bySetup]
    .filter(([k]) => k !== nowKey)
    .map(([k, segs]) => ({ k, t: totals(segs), seg: segs[segs.length - 1] }))
    .filter((r) => r.t.hours >= 1 && r.t.viewerHours > 0 && r.seg);
  if (mine.hours >= 1 && mine.viewerHours > 0)
    for (const r of rivals) {
      const a = mine.moments / mine.viewerHours,
        b = r.t.moments / r.t.viewerHours,
        pv = rateTest(r.t.moments, r.t.viewerHours, mine.moments, mine.viewerHours),
        label = r.seg ? `${r.seg.pricing} at ${startLabel(r.seg.startFill)}` : r.k;
      if (b > a && pv < 0.1 && r.seg)
        out.push({
          tone: 'do',
          title: `Go back to ${label}`,
          detail: `It got ${fmt(b * 100, 1)} giving moments per 100 viewer-hours against ${fmt(a * 100, 1)} now (${fmt(r.t.hours, 1)} h against ${fmt(mine.hours, 1)} h, p = ${fmt(pv, 3)}: unlikely to be luck).${r.t.topShare > 0.5 ? ` Careful: one giver brought ${fmt(r.t.topShare * 100)}% of its coins.` : ''}`,
          apply: [
            { name: 'pricing', value: r.seg.pricing },
            { name: 'startFill', value: r.seg.startFill },
            { name: 'otherGifts', value: r.seg.otherGifts },
          ],
        });
      else if (pv >= 0.1)
        out.push({
          tone: 'info',
          title: `No real difference yet against ${label}`,
          detail: `${fmt(b * 100, 1)} against ${fmt(a * 100, 1)} giving moments per 100 viewer-hours (p = ${fmt(pv, 2)}). Keep running one set-up at a time; change a single setting between tests.`,
        });
    }

  if (all.topShare > 0.5 && all.coins >= 20)
    out.push({
      tone: 'warn',
      title: `${fmt(all.topShare * 100)}% of all coins come from one giver`,
      detail: `${all.topDonor}: their mood decides every result. Results firm up only once more givers come in.`,
    });

  // The honest ceiling: on a small pace, the audience limits the money more than any price.
  if (p.hours >= 1 && coinsPerHour < SMALL_COINS_PER_HOUR) {
    const perViewer = p.viewerHours > 0 ? (p.coins / p.viewerHours) * 100 : 0;
    out.push({
      tone: 'info',
      title: 'The audience is the bottleneck, not the prices',
      detail: `${fmt(coinsPerHour, 1)} coins/h with ${fmt(p.hours > 0 ? p.viewerHours / p.hours : 0, 1)} viewers on average (${fmt(perViewer, 1)} coins per 100 viewer-hours). Prices can lift this a little; more viewers lift it a lot. Keep the set-up steady and grow the audience.`,
    });
  }
  return out;
}
