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
  if (s && berries > 0) s.berries += berries;
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

/** The whole list to save, or null when nothing changed since the last save. */
export function supportersText(): string | null {
  if (!dirty) return null;
  dirty = false;
  return JSON.stringify({ savedAt: Date.now(), supporters: [...all.values()] });
}

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;

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
    };
    if (now) {
      now.berries += back.berries;
      now.likes += back.likes;
      now.visits += back.visits;
      now.follows += back.follows;
      now.shares += back.shares;
      now.first = Math.min(now.first, back.first || now.first);
    } else all.set(k, back);
    n++;
  }
  if (all.size > MAX_SUPPORTERS) forgetSome();
  dirty = true;
  return n;
}

/** For tests: forget everything. */
export function resetSupporters(): void {
  all.clear();
  joinedThisSession.clear();
  dirty = false;
}
