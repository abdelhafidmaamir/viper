// Everyone who ever supported the live, remembered across lives by their TikTok id (the @handle,
// which stays when the display name changes): berries given, likes, visits. Some viewers only
// like, some only give, some do both, so each is counted apart. Only what really came from TikTok
// counts: test gifts, the rehearsal audience and berries given back by hand never do. The app
// keeps the list in a file next to the round backup (src/main/feed-journal.ts).

export interface Supporter {
  readonly id: string;
  nickname: string;
  /** Berries from Roses and Rosas, over every live. */
  berries: number;
  likes: number;
  /** Lives joined (a viewer joining twice in one session counts once). */
  visits: number;
  follows: number;
  shares: number;
  first: number;
  last: number;
  /** Their TikTok photo, the last link seen: shown in the Hall of Fame even when they are away. */
  avatar?: string | undefined;
  /** An imported supporter already matched to a viewer on a live (see seedSupporters). */
  claimed?: boolean | undefined;
  /** Berries by day ("2026-09-29"), so the ranking can later be counted over a month too. */
  days?: Record<string, number> | undefined;
}

/** Past this, the viewers seen longest ago and never supporting are forgotten first. */
const MAX_SUPPORTERS = 50_000;

const all = new Map<string, Supporter>();
const joinedThisSession = new Set<string>();
let dirty = false;

const key = (id: string): string => id.trim().toLowerCase();

function entry(id: string, nickname: string, now: number): Supporter | null {
  const k = key(id);
  if (!k) return null;
  let s = all.get(k);
  if (!s) {
    s = {
      id: k,
      nickname,
      berries: 0,
      likes: 0,
      visits: 0,
      follows: 0,
      shares: 0,
      first: now,
      last: now,
    };
    all.set(k, s);
    if (all.size > MAX_SUPPORTERS) forgetSome();
  }
  if (nickname) s.nickname = nickname;
  s.last = Math.max(s.last, now);
  dirty = true;
  return s;
}

/** Drops the tenth of the list that matters least: no berries, fewest likes, oldest. */
function forgetSome(): void {
  const idle = [...all.values()]
    .filter((s) => s.berries === 0)
    .sort((a, b) => a.likes - b.likes || a.last - b.last);
  for (const s of idle.slice(0, Math.ceil(MAX_SUPPORTERS / 10))) all.delete(s.id);
}

export function supporterGift(
  id: string,
  nickname: string,
  berries: number,
  now = Date.now(),
): void {
  const s = entry(id, nickname, now);
  if (!s || berries <= 0) return;
  s.berries += berries;
  const day = dayOf(now);
  s.days ??= {};
  s.days[day] = (s.days[day] ?? 0) + berries;
}

const dayOf = (at: number): string => {
  const d = new Date(at);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Normalises a TikTok id the way the list keys it. */
export const supporterKey = (id: string): string => key(id);

/** Place in the all-time top three (1 to 3), or 0. */
export function lifetimeRank(id: string): number {
  const k = key(id);
  return k ? topSupporters(3).findIndex((s) => s.id === k) + 1 : 0;
}

export function supporterLikes(id: string, nickname: string, n: number, now = Date.now()): void {
  const s = entry(id, nickname, now);
  if (s && n > 0) s.likes += n;
}

/** A viewer arriving. Returns true the very first time the live ever sees them. */
export function supporterJoin(id: string, nickname: string, now = Date.now()): boolean {
  const k = key(id);
  if (!k) return false;
  const known = all.has(k),
    s = entry(id, nickname, now);
  if (s && !joinedThisSession.has(k)) {
    joinedThisSession.add(k);
    s.visits++;
  }
  return !known;
}

export function supporterSocial(
  kind: 'follow' | 'share',
  id: string,
  nickname: string,
  now = Date.now(),
): void {
  const s = entry(id, nickname, now);
  if (!s) return;
  if (kind === 'follow') s.follows++;
  else s.shares++;
}

export function supporter(id: string): Supporter | undefined {
  return all.get(key(id));
}

/** The all-time ranking: berries given first, likes to break a tie and to rank those who only like. */
export function topSupporters(n = 5): Supporter[] {
  return [...all.values()]
    .filter((s) => s.berries > 0 || s.likes > 0)
    .sort((a, b) => b.berries - a.berries || b.likes - a.likes)
    .slice(0, n);
}

/**
 * Supporters from before the game kept count, imported from TikTok's "top viewers" list, which
 * shows display names but no @handle. Each waits under their name, already ranked, until they
 * come to a live: the game then recognises them by name and moves their berries to their real
 * TikTok id. A name is matched loosely: case, emoji, flags and punctuation do not count.
 */
const SEED = '~';
export const looseName = (name: string): string =>
  name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

/** Imports past supporters. Importing the same list again changes nothing. Returns how many came in. */
export function seedSupporters(
  list: readonly { nickname: string; berries: number; id?: string | undefined }[],
  now = Date.now(),
): number {
  let n = 0;
  for (const { nickname, berries, id } of list) {
    const loose = looseName(nickname),
      k = SEED + loose;
    if (!loose || !(berries > 0)) continue;
    const had = all.get(k);
    // Already claimed by a viewer who came to a live: their berries are on their own id now.
    if (had?.claimed) continue;
    const handle = key((id ?? '').replace(/^@/, ''));
    if (handle) {
      // With their @handle they need no matching: the berries go straight to their account, and
      // the name stays marked so importing again (with or without the handle) adds nothing.
      const mine = entry(handle, nickname.trim().slice(0, 60), now);
      if (!mine) continue;
      mine.berries += Math.round(Math.min(berries, 1_000_000));
      all.set(k, { ...(had ?? blank(k, nickname, now)), berries: 0, claimed: true });
      n++;
      continue;
    }
    all.set(k, {
      id: k,
      nickname: nickname.trim().slice(0, 60),
      berries: Math.round(Math.min(berries, 1_000_000)),
      likes: 0,
      visits: 0,
      follows: 0,
      shares: 0,
      first: had?.first ?? now,
      last: had?.last ?? now,
    });
    n++;
  }
  if (n) dirty = true;
  return n;
}

function blank(id: string, nickname: string, now: number): Supporter {
  return {
    id,
    nickname: nickname.trim().slice(0, 60),
    berries: 0,
    likes: 0,
    visits: 0,
    follows: 0,
    shares: 0,
    first: now,
    last: now,
  };
}

/** A viewer seen on a live with their TikTok id: if an imported supporter waits under their name, it is theirs. */
export function claimSeed(id: string, nickname: string, now = Date.now()): void {
  if (!key(id) || !nickname) return;
  const k = SEED + looseName(nickname),
    seed = all.get(k);
  if (!seed || seed.claimed || seed.berries <= 0) return;
  const mine = entry(id, nickname, now);
  if (!mine) return;
  mine.berries += seed.berries;
  mine.first = Math.min(mine.first, seed.first);
  // Kept, empty, so importing the same list again does not count them twice.
  all.set(k, { ...seed, berries: 0, claimed: true });
  dirty = true;
}

/** The whole list to save, or null when nothing changed since the last save. */
/**
 * A supporter's photo link found by their TikTok id or their name, in any case (Snake Arena's
 * pilot plays under a real viewer's picture). Feed never asks.
 */
export function supporterPhotoByName(name: string): string | undefined {
  const k = key(name.replace(/^@/, ''));
  if (!k) return undefined;
  const direct = all.get(k)?.avatar;
  if (direct) return direct;
  for (const s of all.values())
    if (s.avatar && s.nickname.trim().toLowerCase() === k) return s.avatar;
  return undefined;
}

/** Keeps a viewer's latest photo link with their entry. */
export function supporterPhoto(id: string, url: string | undefined): void {
  const s = all.get(key(id));
  if (!s || !url || s.avatar === url || !url.startsWith('https://') || url.length > 1000) return;
  s.avatar = url;
  dirty = true;
}

/** The control room's settings, saved with the list so a new computer gets them back too. */
let settingsSaved: Record<string, unknown> | undefined;
export function supporterSettings(settings: Record<string, unknown>): void {
  settingsSaved = { ...settings };
  dirty = true;
}

/** The settings saved inside a list, if any. */
export function settingsIn(text: string): Record<string, unknown> | null {
  try {
    const s = (JSON.parse(text) as { settings?: unknown }).settings;
    return typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function supportersText(): string | null {
  if (!dirty) return null;
  dirty = false;
  return JSON.stringify({
    savedAt: Date.now(),
    supporters: [...all.values()],
    ...(settingsSaved ? { settings: settingsSaved } : {}),
  });
}

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;

function readDays(v: unknown): Record<string, number> | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const out: Record<string, number> = {};
  for (const [day, n] of Object.entries(v))
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && num(n) > 0) out[day] = num(n);
  return out;
}

/**
 * Loads the saved list. Whatever this session already counted (events can arrive before the file
 * is read) is added on top, never lost. Returns how many supporters came back.
 */
export function restoreSupporters(text: string): number {
  let saved: unknown;
  try {
    saved = JSON.parse(text);
  } catch {
    return 0;
  }
  const list =
    typeof saved === 'object' && saved !== null && 'supporters' in saved ? saved.supporters : null;
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (const raw of list as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || !key(r.id)) continue;
    const k = key(r.id),
      now = all.get(k);
    const back: Supporter = {
      id: k,
      nickname: typeof r.nickname === 'string' ? r.nickname.slice(0, 60) : k,
      berries: num(r.berries),
      likes: num(r.likes),
      visits: num(r.visits),
      follows: num(r.follows),
      shares: num(r.shares),
      first: num(r.first),
      last: num(r.last),
      days: readDays(r.days),
      claimed: r.claimed === true ? true : undefined,
      avatar:
        typeof r.avatar === 'string' && r.avatar.startsWith('https://')
          ? r.avatar.slice(0, 1000)
          : undefined,
    };
    if (now) {
      now.berries += back.berries;
      now.likes += back.likes;
      now.visits += back.visits;
      now.follows += back.follows;
      now.shares += back.shares;
      now.first = Math.min(now.first, back.first || now.first);
      now.avatar ??= back.avatar;
      if (back.claimed) now.claimed = true;
      for (const [day, n] of Object.entries(back.days ?? {})) {
        now.days ??= {};
        now.days[day] = (now.days[day] ?? 0) + n;
      }
    } else all.set(k, back);
    n++;
  }
  if (all.size > MAX_SUPPORTERS) forgetSome();
  settingsSaved ??= settingsIn(text) ?? undefined;
  dirty = true;
  return n;
}

/** For tests: forget everything. */
export function resetSupporters(): void {
  all.clear();
  joinedThisSession.clear();
  dirty = false;
}
