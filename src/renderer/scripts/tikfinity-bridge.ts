/* tikfinity-bridge.ts : connects the game to the TikFinity desktop app Event API.
   Endpoint: ws://localhost:21213/. Messages: {"event":"chat|gift|share|follow|like|roomUser|subscribe","data":{...}},
   payloads follow the TikTok-Live-Connector format.
   Streak rule: a streakable gift (giftType 1) emits one message per streak step then a final one
   with repeatEnd:true and the total count; only that final message is counted.
   A non-streakable gift (giftType != 1) is counted immediately.
   Exposes window.TikFinityBridge: { start, stop, state(), process(obj), surChangement }. */

import type { TikFinityState, TikFinityPayload } from '../engine/types-api.ts';

/* Mutable internal copy: TikFinityState is read-only for callers */
interface InternalState {
  connected: boolean;
  url: string;
  events: number;
  gifts: number;
  last: string;
  raw: string;
  error: string;
}

const URL_PONT = 'ws://localhost:21213/';
let ws: WebSocket | null = null;
let intended = false;
let attempts = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const state: InternalState = {
  connected: false,
  url: URL_PONT,
  events: 0,
  gifts: 0,
  last: '',
  raw: '',
  error: '',
};
let onChange: ((s: TikFinityState) => void) | null = null;
function notify(): void {
  if (typeof onChange === 'function') {
    try {
      onChange(state);
    } catch {
      /* swallow listener errors */
    }
  }
}

/* Gift diamonds: diamondCount is per-unit in TikTok-Live-Connector;
   the value forwarded to the game stays per-unit and n carries the count. */
function process(m: unknown): number | null {
  if (!m || typeof m !== 'object') return null;
  const msg = m as Record<string, unknown>;
  const event = msg.event;
  if (!event || typeof event !== 'string') return null;
  const rawData = msg.data;
  const d = (rawData !== null && typeof rawData === 'object' ? rawData : {}) as TikFinityPayload;
  state.events++;
  /* raw trace: last message as received, for diagnosing what TikFinity actually sends */
  state.raw = `${event} ${JSON.stringify(d).slice(0, 300)}`;
  if (event === 'like') {
    const nl = Math.max(1, parseInt(String(d.likeCount ?? '')) || 1);
    state.last = `like x${String(nl)}${d.uniqueId ? ` @${d.uniqueId}` : ''}`;
    notify();
    /* cast: legacy AudienceEvent lacks avatar, but receiveEvent uses it at runtime */
    return window.receiveEvent({
      type: 'like',
      n: nl,
      nickname: d.nickname ?? d.uniqueId ?? '',
      id: d.uniqueId ?? '',
      avatar: d.profilePictureUrl ?? '',
    } as AudienceEvent);
  }
  /* joins, shares, follows: forwarded to the game for the activity banner. TikTok sends follows
     and shares as a 'social' message whose displayType or label names the action. */
  const social =
    event === 'social'
      ? /follow/i.test(`${d.displayType ?? ''} ${d.label ?? ''}`)
        ? 'follow'
        : /share/i.test(`${d.displayType ?? ''} ${d.label ?? ''}`)
          ? 'share'
          : null
      : null;
  if (social || event === 'member' || event === 'join' || event === 'share' || event === 'follow') {
    const ty = social ?? (event === 'share' ? 'share' : event === 'follow' ? 'follow' : 'join');
    // The same follow or share can come both as 'social' and as its own event: count it once.
    const key = `${ty}|${d.uniqueId ?? d.nickname ?? ''}`,
      now = Date.now();
    if (ty !== 'join' && now - (recentSocial.get(key) ?? -1e9) < SOCIAL_DEDUPE_MS) {
      notify();
      return null;
    }
    recentSocial.set(key, now);
    if (recentSocial.size > 500) recentSocial.clear();
    state.last = `${ty}${d.uniqueId ? ` @${d.uniqueId}` : ''}`;
    notify();
    return window.receiveEvent({
      type: ty,
      n: 1,
      nickname: d.nickname ?? d.uniqueId ?? '',
      id: d.uniqueId ?? '',
      mod: isModerator(d),
      avatar: d.profilePictureUrl ?? '',
    } as AudienceEvent);
  }
  /* viewer count: tier milestones acknowledged by the banner */
  if (event === 'roomUser') {
    const vc = parseInt(String(d.viewerCount ?? '')) || 0;
    state.last = `viewers ${String(vc)}`;
    notify();
    return window.receiveEvent({ type: 'viewers', total: vc } as AudienceEvent);
  }
  if (event !== 'gift') {
    notify();
    return null;
  }
  /* streak: giftType 1 means count only the final message (repeatEnd true) */
  const streakable = d.giftType === 1 || d.gift?.gift_type === 1;
  const isFinal = d.repeatEnd === true || d.gift?.repeat_end === 1;
  // Live streaks (Feed): every step of a streak counts at once, as the difference with the step
  // before, so a burst pays as it happens and nothing is lost if the final message never comes.
  if (streakable && liveStreaks) {
    const key = `${d.uniqueId ?? d.nickname ?? ''}|${d.giftName ?? ''}`,
      total = Math.max(1, parseInt(String(d.repeatCount ?? '')) || 1),
      now = Date.now(),
      seen = streaks.get(key),
      // A count lower than what was paid means a new streak began (the last one's final message
      // was lost), and a streak silent for a while is over: both start again from zero.
      counted = seen && total >= seen.count && now - seen.at < STREAK_IDLE_MS ? seen.count : 0,
      delta = total - counted;
    if (isFinal) streaks.delete(key);
    else streaks.set(key, { count: Math.max(counted, total), at: now });
    if (delta <= 0) {
      notify();
      return null;
    }
    return forwardGift(d, delta);
  }
  if (streakable && !isFinal) {
    state.last = `streak in progress (${d.giftName ?? '?'})`;
    notify();
    return null;
  }
  return forwardGift(d, Math.max(1, parseInt(String(d.repeatCount ?? '')) || 1));
}

/** Whether TikTok says the viewer moderates this live: the flag, or a moderator badge. */
function isModerator(d: TikFinityPayload): boolean {
  const badges: readonly { readonly type?: string; readonly name?: string }[] = Array.isArray(
    d.userBadges,
  )
    ? d.userBadges
    : [];
  return (
    d.isModerator === true ||
    badges.some((b) => /moderator/i.test(`${b.type ?? ''} ${b.name ?? ''}`))
  );
}

/** Follows and shares seen lately, so one arriving twice is announced once. */
const recentSocial = new Map<string, number>();
const SOCIAL_DEDUPE_MS = 5000;

/** Counted streaks in live mode: gift key to the repeat count already forwarded, and when. */
const streaks = new Map<string, { count: number; at: number }>();
const STREAK_IDLE_MS = 60_000;
let liveStreaks = false;

function forwardGift(d: TikFinityPayload, n: number): number | null {
  const value = parseInt(String(d.diamondCount ?? '')) || 0;
  const giftName = d.giftName ?? '';
  state.gifts += n;
  state.last = `${giftName} x${String(n)} (${String(value)} diamonds)${d.uniqueId ? ` @${d.uniqueId}` : ''}`;
  notify();
  return window.receiveEvent({
    type: 'gift',
    n,
    value,
    name: giftName,
    nickname: d.nickname ?? d.uniqueId ?? '',
    id: d.uniqueId ?? '',
    avatar: d.profilePictureUrl ?? '',
  } as AudienceEvent);
}

function connect(): void {
  if (!intended) return;
  try {
    ws = new WebSocket(state.url);
  } catch (e) {
    state.error = String((e instanceof Error ? e.message : null) ?? e);
    reschedule();
    return;
  }
  ws.onopen = function () {
    attempts = 0;
    state.connected = true;
    state.error = '';
    notify();
  };
  ws.onmessage = function (ev: MessageEvent) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(ev.data as string);
    } catch {
      state.error = 'unreadable message';
      notify();
      return;
    }
    try {
      process(parsed);
    } catch (e) {
      state.error = `processing: ${String((e instanceof Error ? e.message : null) ?? e)}`;
      notify();
    }
  };
  ws.onclose = function () {
    state.connected = false;
    notify();
    reschedule();
  };
  ws.onerror = function () {
    /* onclose always follows; reconnect lives there */
  };
}
/* reconnect backoff: 1 s, 2 s, 4 s... capped at 10 s, as long as start() was called */
function reschedule(): void {
  if (!intended) return;
  const delay = Math.min(10000, 1000 * Math.pow(2, attempts++));
  clearTimeout(timer);
  timer = setTimeout(connect, delay);
}
function start(url?: string): void {
  intended = true;
  if (url) state.url = url;
  attempts = 0;
  clearTimeout(timer);
  if (ws) {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    ws = null;
  }
  connect();
}
function stop(): void {
  intended = false;
  clearTimeout(timer);
  if (ws) {
    try {
      ws.close();
    } catch {
      /* already closed */
    }
    ws = null;
  }
  state.connected = false;
  notify();
}

const bridge = {
  start,
  stop,
  process,
  /** Feed: count each step of a streak at once instead of waiting for its final message. */
  liveStreaks(on: boolean): void {
    liveStreaks = on;
    streaks.clear();
  },
  state(): TikFinityState & { readonly raw: string } {
    return {
      connected: state.connected,
      url: state.url,
      events: state.events,
      gifts: state.gifts,
      last: state.last,
      raw: state.raw,
      error: state.error,
    };
  },
  get surChangement(): ((s: TikFinityState) => void) | null {
    return onChange;
  },
  set surChangement(f: ((s: TikFinityState) => void) | null) {
    onChange = f;
  },
};
window.TikFinityBridge = bridge;
