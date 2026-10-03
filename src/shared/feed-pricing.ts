/**
 * What a gift is worth on the board. The operator sets a price list in the control room: each
 * line is a gift price in coins and the berries one such gift drops ("1:5,10:55,30:175"). It is
 * read on every gift, so a new list applies to the next gift without a new build.
 *
 * A gift is matched by its coin price, not its name: every 1-coin gift is worth the 1-coin line.
 * A gift at a price the list does not name drops nothing, unless `others` is on: then it gets the
 * berries per coin of the closest line below it, so nothing a viewer paid for is lost.
 */

export interface PriceTier {
  readonly coins: number;
  readonly berries: number;
}

/** Lines a list can hold: the LIVE Studio gift panel shows four. */
export const PRICE_TIERS_MAX = 4;
const COINS_MAX = 50_000;
const BERRIES_MAX = 100_000;

/** One coin, one berry, Rose and Rosa: what the game always did. */
export const DEFAULT_PRICING = '1:1,10:10';

/** Usual prices of the gifts known by name, for events that come without a coin value. */
const NAMED_COINS: Readonly<Record<string, number>> = { rose: 1, rosa: 10 };

export interface PricingPreset {
  readonly id: string;
  readonly label: string;
  readonly pricing: string;
  readonly hint: string;
}

export const PRICING_PRESETS: readonly PricingPreset[] = [
  {
    id: 'classic',
    label: '1 coin = 1 berry',
    pricing: DEFAULT_PRICING,
    hint: 'The original rule. Rose 1, Rosa 10.',
  },
  {
    id: 'small',
    label: 'Small audience',
    pricing: '1:5,10:55,30:175',
    hint: 'Pair with a 95% start: a Rose shows, a Rosa ends the round.',
  },
  {
    id: 'big',
    label: 'Big audience',
    pricing: '1:5,10:55,100:600',
    hint: 'Pair with a normal or 50% start: the 100 ends the round.',
  },
  {
    id: 'flat',
    label: 'Flat x5',
    pricing: '1:5,10:50,30:150,100:500',
    hint: 'Every gift at 5 berries per coin. For short boards (90% and up).',
  },
];

const whole = (value: unknown, max: number): number | undefined => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : undefined;
};

/**
 * Reads a price list, or null when any line is broken. Lines are sorted by price; a price given
 * twice keeps its last line.
 */
export function parsePricing(text: unknown): PriceTier[] | null {
  if (typeof text !== 'string') return null;
  const byCoins = new Map<number, number>();
  for (const part of text.split(/[,;\n]+/)) {
    if (!part.trim()) continue;
    const [c, b, extra] = part.split(':').map((s) => s.trim());
    const coins = whole(c, COINS_MAX),
      berries = whole(b, BERRIES_MAX);
    if (extra !== undefined || coins === undefined || coins < 1 || berries === undefined)
      return null;
    byCoins.set(coins, berries);
  }
  if (byCoins.size === 0 || byCoins.size > PRICE_TIERS_MAX) return null;
  return [...byCoins].sort((a, b) => a[0] - b[0]).map(([coins, berries]) => ({ coins, berries }));
}

export function formatPricing(tiers: readonly PriceTier[]): string {
  return tiers.map((t) => `${String(t.coins)}:${String(t.berries)}`).join(',');
}

/** The one spelling of a list, so the control room can tell it was applied; undefined if broken. */
export function normalizePricing(value: unknown): string | undefined {
  const tiers = parsePricing(value);
  return tiers ? formatPricing(tiers) : undefined;
}

/** The price of one gift in coins: TikTok's own figure when it came, else the known name's. */
export function giftCoins(name: string | undefined, coins?: number): number {
  if (coins !== undefined && Number.isFinite(coins) && coins >= 1 && coins <= COINS_MAX)
    return Math.round(coins);
  return NAMED_COINS[(name ?? '').trim().toLowerCase()] ?? 0;
}

/** Berries one gift of `coins` drops under a price list. */
export function berriesForCoins(coins: number, pricing: string, others: boolean): number {
  if (coins < 1) return 0;
  const tiers = parsePricing(pricing) ?? parsePricing(DEFAULT_PRICING) ?? [];
  const exact = tiers.find((t) => t.coins === coins);
  if (exact) return exact.berries;
  if (!others) return 0;
  const below = [...tiers].reverse().find((t) => t.coins < coins) ?? tiers[0];
  return below ? Math.round((coins * below.berries) / below.coins) : 0;
}

/** What to type in the LIVE Studio gift panel for a line (20 characters at most). */
export function panelText(berries: number): string {
  return `${String(berries)} ${berries === 1 ? 'BERRY' : 'BERRIES'}`;
}

/**
 * What is wrong with a list as a way to make money, in plain words. Empty when nothing is.
 * The main trap: a bigger gift giving fewer berries per coin, so splitting it into Roses pays more.
 */
export function pricingWarnings(tiers: readonly PriceTier[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < tiers.length; i++) {
    const lo = tiers[i - 1],
      hi = tiers[i];
    if (!lo || !hi) continue;
    if (hi.berries / hi.coins < lo.berries / lo.coins)
      out.push(
        `${String(hi.coins)} coins gives fewer berries per coin than ${String(lo.coins)}: viewers get more by sending ${String(lo.coins)}-coin gifts.`,
      );
  }
  if (tiers.some((t) => t.berries === 0)) out.push('A line at 0 berries takes coins for nothing.');
  return out;
}

/** Share of the board the house fills by itself on a normal start (the opening). */
const OPENING_SHARE = 0.4;

/**
 * Berries the viewers must give to fill one round: from the start length to a full board (the
 * last cell stays free). A normal start (0) counts from the end of the opening.
 */
export function cellsToFill(total: number, startFill: number): number {
  const start = Math.round(total * (startFill > 0 ? startFill : OPENING_SHARE));
  return Math.max(1, total - 1 - start);
}
