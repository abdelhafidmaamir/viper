// What each live earned, for the control room's advisor: time on air is cut into segments, one
// per set-up (price list, start length, other gifts), each summing coins, giving moments, the
// audience and the gift sizes. Kept in the window's storage across launches. See
// src/shared/feed-perf.ts for what each figure means.

import { setupKey, type PerfSegment } from '../../shared/feed-perf.ts';

const STORAGE_KEY = 'viper-feed-perf';
/** Segments kept: about a few hundred hours of lives. */
const KEEP = 400;
/** Segments sent to the control room twice a second. */
const PUBLISH = 120;
/** A segment shorter than this with no gift is noise (a setting tried and changed back). */
const MIN_MS = 60_000;
/** Gifts from one viewer closer than this are one giving moment. */
const MOMENT_MS = 60_000;
const SAVE_EVERY_MS = 30_000;
const DONORS_MAX = 300;

type Store = Pick<Storage, 'getItem' | 'setItem'>;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface Open extends Mutable<Omit<PerfSegment, 'donors' | 'byPrice'>> {
  donors: Record<string, number>;
  byPrice: Record<string, number>;
}

export interface PerfSetup {
  readonly pricing: string;
  readonly startFill: number;
  readonly otherGifts: boolean;
}

let done: PerfSegment[] = [];
let open: Open | null = null;
let viewers = 0,
  lastTick: number | null = null,
  lastSave = 0,
  wasFull = false;
const lastGift = new Map<string, number>();

function blank(setup: PerfSetup, now: number): Open {
  return {
    start: now,
    end: now,
    pricing: setup.pricing,
    startFill: setup.startFill,
    otherGifts: setup.otherGifts,
    coins: 0,
    berries: 0,
    units: 0,
    moments: 0,
    donors: {},
    newDonors: 0,
    viewerMinutes: 0,
    peakViewers: 0,
    joins: 0,
    likes: 0,
    roundsFilled: 0,
    byPrice: {},
    unpaid: 0,
  };
}

const isSegment = (v: unknown): v is PerfSegment =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as PerfSegment).start === 'number' &&
  typeof (v as PerfSegment).end === 'number' &&
  typeof (v as PerfSegment).pricing === 'string' &&
  typeof (v as PerfSegment).coins === 'number' &&
  typeof (v as PerfSegment).moments === 'number';

function close(): void {
  if (!open) return;
  const s = open;
  open = null;
  if (s.end - s.start >= MIN_MS || s.units > 0) done.push({ ...s });
  if (done.length > KEEP) done = done.slice(-KEEP);
}

function save(storage: Store): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ done, open }));
  } catch {
    /* storage full or off: the advisor loses history, the show goes on */
  }
}

/** Reads back what earlier launches recorded; a segment cut by a crash is closed where it stopped. */
export function restorePerf(storage: Store): void {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as { done?: unknown; open?: unknown }) : null;
    done = Array.isArray(saved?.done) ? saved.done.filter(isSegment).slice(-KEEP) : [];
    if (isSegment(saved?.open)) done.push(saved.open);
  } catch {
    done = [];
  }
  open = null;
}

/**
 * Once a second: opens, extends or closes the segment. `live` is whether TikFinity is connected,
 * `full` whether the board is full right now.
 */
export function perfTick(
  now: number,
  live: boolean,
  setup: PerfSetup,
  full: boolean,
  storage: Store,
): void {
  const dt = lastTick === null ? 0 : Math.min(5_000, Math.max(0, now - lastTick));
  lastTick = now;
  if (open && (!live || setupKey(open) !== setupKey(setup))) {
    close();
    save(storage);
  }
  if (live && !open) open = blank(setup, now);
  if (open) {
    open.end = now;
    open.viewerMinutes += (viewers * dt) / 60_000;
    if (full && !wasFull) open.roundsFilled++;
  }
  wasFull = full;
  if (now - lastSave >= SAVE_EVERY_MS) {
    lastSave = now;
    save(storage);
  }
}

/** A gift from the live: `coins` and `berries` for the whole streak step, `n` gifts. */
export function perfGift(
  who: string,
  coins: number,
  berries: number,
  n: number,
  first: boolean,
  unitCoins: number,
  now = Date.now(),
): void {
  if (!open) return;
  open.coins += coins;
  open.berries += berries;
  open.units += n;
  if (berries === 0) open.unpaid += n;
  if (unitCoins > 0) open.byPrice[String(unitCoins)] = (open.byPrice[String(unitCoins)] ?? 0) + n;
  const key = who || '?';
  if (now - (lastGift.get(key) ?? -Infinity) >= MOMENT_MS) open.moments++;
  lastGift.set(key, now);
  if (key in open.donors || Object.keys(open.donors).length < DONORS_MAX)
    open.donors[key] = (open.donors[key] ?? 0) + coins;
  if (first) open.newDonors++;
}

export function perfViewers(total: number): void {
  viewers = total;
  if (open) open.peakViewers = Math.max(open.peakViewers, total);
}

export function perfJoin(): void {
  if (open) open.joins++;
}

export function perfLikes(n: number): void {
  if (open) open.likes += n;
}

/** The latest segments, the one running included, oldest first. */
export function perfSegments(): PerfSegment[] {
  const list = open ? [...done, { ...open }] : done;
  return list.slice(-PUBLISH);
}

/** For tests: forget everything. */
export function resetPerf(): void {
  done = [];
  open = null;
  viewers = lastSave = 0;
  lastTick = null;
  wasFull = false;
  lastGift.clear();
}
