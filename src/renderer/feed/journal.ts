// The live's activity journal: one spreadsheet row per thing that happened (a gift, a follow, a
// round filled, TikFinity dropping out), so a live can be read back afterwards and two settings
// compared. Likes and joins come too fast for a row each: they are summed every 10 seconds, the
// viewer count is noted every 30. The app collects the rows every second and appends them to the
// live's file (src/main/feed-journal.ts).

import { TOTAL, game } from './state.ts';

/** Where a row came from: the live itself, the operator, or the rehearsal audience. */
export type Source = 'tiktok' | 'manual' | 'simulated';

export interface Row {
  readonly event: string;
  readonly source?: Source;
  readonly nickname?: string;
  readonly id?: string;
  readonly gift?: string;
  readonly count?: number;
  readonly berries?: number;
  readonly viewers?: number;
  readonly detail?: string;
  /** Coins a gift cost the viewer, for reading what a live earned. */
  readonly coins?: number;
}

export const COLUMNS = [
  'time',
  'event',
  'source',
  'live',
  'round',
  'fill %',
  'nickname',
  'tiktok id',
  'gift',
  'count',
  'berries',
  'viewers',
  'detail',
  'coins',
] as const;

const LIKES_EVERY_MS = 10_000,
  VIEWERS_EVERY_MS = 30_000,
  /** Rows kept while the app does not collect them (a stalled window): the oldest go first. */
  MAX_WAITING = 20_000;

const rows: string[] = [];
let live = false,
  likes = 0,
  likers = new Set<string>(),
  joins = 0,
  newcomers = 0,
  sumsFrom = 0,
  viewers = -1,
  viewersAt = 0,
  lastRound = 0,
  lastFull = false,
  lastLive: boolean | null = null;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local time, the way a spreadsheet reads it. */
export function stamp(at: number): string {
  const d = new Date(at);
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * One spreadsheet cell: quoted when it holds the separator, a quote or a line break, and a name
 * starting like a formula (=, +, -, @) is kept as text so a nickname can never run in Excel.
 */
export function cell(value: string | number | undefined): string {
  if (value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Notes one row now. */
export function note(row: Row, at = Date.now()): void {
  // A round picked back up after a restart is the same round, not a new one.
  if (row.event === 'round restored') lastRound = game.round;
  const fill = Math.round(Math.min(1, game.len / TOTAL) * 1000) / 10;
  rows.push(
    [
      stamp(at),
      row.event,
      row.source ?? '',
      live ? 'yes' : 'no',
      game.round,
      fill,
      row.nickname,
      row.id,
      row.gift,
      row.count,
      row.berries,
      row.viewers,
      row.detail,
      row.coins,
    ]
      .map(cell)
      .join(';'),
  );
  if (rows.length > MAX_WAITING) rows.splice(0, rows.length - MAX_WAITING);
}

/** Likes from the live, summed into one row every 10 seconds. */
export function noteLikes(who: string, n: number): void {
  likes += n;
  if (likers.size < 100_000) likers.add(who);
}

/** A viewer arriving; `first` when the game has never seen them before. */
export function noteJoin(first: boolean): void {
  joins++;
  if (first) newcomers++;
}

/** The live's viewer count, as TikTok last reported it. */
export function noteViewers(total: number): void {
  viewers = total;
}

function flushSums(now: number): void {
  if (now - sumsFrom < LIKES_EVERY_MS) return;
  if (likes > 0)
    note(
      { event: 'likes', source: 'tiktok', count: likes, detail: `${String(likers.size)} viewers` },
      now,
    );
  if (joins > 0)
    note(
      { event: 'joins', source: 'tiktok', count: joins, detail: `${String(newcomers)} first time` },
      now,
    );
  likes = joins = newcomers = 0;
  likers = new Set();
  sumsFrom = now;
}

/**
 * The rows since the last call, one per line, and the checks that need no event of their own: a
 * round starting or filling, TikFinity connecting or dropping out, the sums and the viewer count.
 * `connected` is whether TikFinity is live right now.
 */
export function drainJournal(connected: boolean, now = Date.now()): string {
  live = connected;
  if (lastLive !== connected) {
    if (lastLive !== null || connected)
      note({ event: connected ? 'tiktok connected' : 'tiktok lost' }, now);
    lastLive = connected;
  }
  if (game.round !== lastRound) {
    lastRound = game.round;
    lastFull = false;
    note({ event: 'round start' }, now);
  }
  const full = game.full >= 0;
  if (full && !lastFull)
    note({ event: 'round filled', detail: `${String(game.eaten)} berries eaten` }, now);
  lastFull = full;
  flushSums(now);
  if (viewers >= 0 && now - viewersAt >= VIEWERS_EVERY_MS) {
    note({ event: 'viewers', source: 'tiktok', viewers }, now);
    viewersAt = now;
  }
  const text = rows.join('\n');
  rows.length = 0;
  return text;
}

/** For tests: forget everything. */
export function resetJournal(): void {
  rows.length = 0;
  live = false;
  likes = joins = newcomers = sumsFrom = viewersAt = lastRound = 0;
  likers = new Set();
  viewers = -1;
  lastFull = false;
  lastLive = null;
}
