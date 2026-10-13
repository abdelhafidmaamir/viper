// Viewer alerts, bottom center under the board: who joined, followed, shared or is liking. The
// duel's banner look (dark card, round photo, name in bold), one alert at a time, nothing flies
// onto the board. Little icons burst around the card and fade there, one icon per kind
// (alert-fx.ts): hearts for likes (one per like), sparkles for a join, blossoms for a share,
// butterflies for a follow. The same viewer liking or sharing again keeps their card up.
//
// Who goes first: a follow, a share or a returning supporter (they are rare and cost the viewer
// something), then likes, then plain joins. A card on screen gives way to a more important one
// once it has been readable for a moment, and a like card only stays past its time when nobody
// is waiting. Waiting joins and likes expire; follows, shares and supporters never do.
//
// Snake Arena sets its own order and place (setAlertLook): its game cards first (a snake
// eliminated, a place in the paid queue, then a speed boost reached), then the stream's (follows,
// shares, supporters, welcomes), then likes, during its qualifying only (setLikeAlerts); Feed's
// card size, lower under the board, below its like strip. Its game cards read on one row, and go
// at the battle's end (clearGameAlerts). Feed never calls any of these.

import { ctx } from '../engine/canvas.ts';
import { tr, type I18nKey } from '../engine/i18n.ts';
import { W } from '../engine/layout.ts';
import { GOLD } from '../engine/palette.ts';
import { BOARD_H, FY0 } from './grid.ts';
import { burstSprite } from './alert-fx.ts';
import { FONT, crown, paintFace } from './paint.ts';
import { LOTUS, paintBloom, paintLoosePetals, visitNumber } from './welcome.ts';

/**
 * 'kill', 'qualified' and 'boost' are Snake Arena's: a snake eliminated, a giver's place in the
 * paid queue for the next rounds, a player's likes reaching a speed boost. Feed never sends them.
 */
export type AlertKind = 'join' | 'like' | 'share' | 'follow' | 'kill' | 'qualified' | 'boost';

interface Alert {
  kind: AlertKind;
  nickname: string;
  avatar: string | undefined;
  /** Likes shown on the card: the viewer's likes while this card is up. */
  likes: number;
  phrase: I18nKey;
  /** Seconds since the card last came up or was refreshed: drives its fade. */
  age: number;
  /** Seconds on screen in all, refreshes included. */
  shown: number;
  /** Seconds spent waiting in the queue. */
  waited: number;
  /** How long this card stays: shorter when others wait, or when cut for a more important one. */
  stay: number;
  /** Icons still to burst out of the card. */
  hearts: number;
  /** For a join: which visit this is, 1 the first time the viewer ever joins. */
  visit: number;
  /**
   * For a join by someone who has given before and already had their big entrance lately: 0 for
   * a gifter, 1 to 3 for the top three, -1 for a moderator. Undefined for everyone else.
   */
  supporter: number | undefined;
  /** A join by someone with a high gifter level on TikTok who has not given here: the gold edge. */
  ranked: boolean;
  /** For a kill: the snake that did it, its photo at the card's right end. */
  by?: { nickname: string; avatar?: string | undefined } | undefined;
  /** For a speed boost: the snake's colour, light, for the name and the photo's outline. */
  tint?: string | undefined;
  /** For a place in the paid queue: in how many rounds the giver plays, 1 the next one. */
  rounds?: number | undefined;
}

interface Heart {
  /** The card it belongs to: it lives and fades with it. */
  owner: Alert;
  kind: AlertKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  size: number;
  spin: number;
  phase: number;
}

/**
 * Where the card sits and its size: Feed's, sized for a phone screen (the viewer's photo and name
 * must read at a glance on a live). `arena` switches Snake Arena's order of importance on.
 */
/** The card's middle, Feed's: under the board. */
export const FEED_CARD_Y = FY0 + BOARD_H + 132;
const look = {
  cx: W / 2,
  cy: FEED_CARD_Y,
  w: 790,
  h: 114,
  avatar: 86,
  text: 38,
  arena: false,
};
/** Snake Arena's card: its place, size and order (Feed never calls it). */
export function setAlertLook(next: Partial<typeof look>): void {
  Object.assign(look, next);
}
const STAY: Readonly<Record<AlertKind, number>> = {
  join: 3.2,
  like: 3.8,
  share: 4,
  follow: 3.8,
  kill: 4,
  qualified: 4,
  boost: 3,
};
/** Icons bursting when a card comes up; likes burst one per like instead. */
const BURST: Readonly<Record<AlertKind, number>> = {
  join: 0,
  like: 0,
  share: 14,
  follow: 12,
  // A kill's card comes up plain: no particles. The arena's paid queue throws gold eggs, its
  // speed boost gold bolts.
  kill: 0,
  qualified: 8,
  boost: 9,
};
const FADE = 0.35;
/** A card is readable for at least this long before a more important one may cut it. */
const MIN_SHOW = 1.2,
  /** More likes stop extending a like card once it has been up this long. */
  LIKE_MAX = 6,
  /** With this many cards waiting, each one stays a shorter time. */
  BUSY = 2,
  BUSY_STAY = 0.7;
/** Extra seconds on screen for a ranked join. */
const RANKED_EXTRA = 1.5;

/** Seconds a waiting card stays worth showing. Follows, shares and supporters never expire. */
const EXPIRES: Readonly<Record<number, number>> = { 1: 10, 2: 6 };
/**
 * Snake Arena's: a speed boost's card is dropped after 3 s waiting (its gold chip showed it),
 * likes after 6, the stream's after 10; an elimination and a place in the paid queue never.
 */
const ARENA_EXPIRES: Readonly<Record<number, number>> = { 1: 3, 2: 6, 3: 10 };
const expiry = (a: Alert): number => (look.arena ? ARENA_EXPIRES : EXPIRES)[rank(a)] ?? Infinity;

/**
 * 0 first: follows, shares and returning supporters, then likes and ranked joins, plain joins last.
 * In Snake Arena, the game first: an elimination and a place in the paid queue, then a speed boost
 * (shown only when neither waits), then likes, then the stream's (follows, shares, supporters,
 * welcomes).
 */
const rank = (a: Pick<Alert, 'kind' | 'supporter' | 'ranked'>): number =>
  look.arena ? arenaRank(a.kind) : feedRank(a);
const arenaRank = (kind: AlertKind): number =>
  kind === 'kill' || kind === 'qualified' ? 0 : kind === 'boost' ? 1 : kind === 'like' ? 2 : 3;
const feedRank = (a: Pick<Alert, 'kind' | 'supporter' | 'ranked'>): number =>
  a.kind === 'share' ||
  a.kind === 'follow' ||
  a.kind === 'kill' ||
  a.kind === 'qualified' ||
  a.kind === 'boost' ||
  a.supporter !== undefined
    ? 0
    : a.kind === 'like' || a.ranked
      ? 1
      : 2;
const ACCENT: Readonly<Record<AlertKind, string>> = {
  like: '255,143,168',
  share: '246,184,196',
  follow: '255,159,184',
  join: '242,197,124',
  kill: '255,143,168',
  qualified: '242,197,124',
  boost: '242,197,124',
};
/** Hearts per like event, at most: a flood of likes must not cover the screen. */
const HEARTS_PER_EVENT = 24,
  MAX_HEARTS = 70,
  HEARTS_PER_SECOND = 20,
  /** Snake Arena's like card: at least this many hearts for any like event, a single like too. */
  ARENA_HEARTS_LEAST = 2;

/** Hearts a like event of `n` likes gives its card: one per like, Snake Arena's at least a few. */
const likeHearts = (n: number): number =>
  Math.max(look.arena ? ARENA_HEARTS_LEAST : 0, Math.min(HEARTS_PER_EVENT, n));
const PHRASES: Readonly<Record<AlertKind, readonly I18nKey[]>> = {
  join: ['join.0', 'join.1', 'join.2'],
  like: ['like.0', 'like.1'],
  share: ['share.0', 'share.1'],
  follow: ['follow.0', 'follow.1'],
  kill: ['kill.0'],
  qualified: ['arena.playsNext', 'arena.inLine'],
  boost: ['arena.boost'],
};

/** What the sound layer listens to. */
export const alertSounds: {
  show: (kind: AlertKind, first?: boolean) => void;
  heart: () => void;
  /** A gift's thanks comes up over the board; `first` for someone's first gift ever. */
  thanks: (first: boolean) => void;
} = {
  show: () => undefined,
  heart: () => undefined,
  thanks: () => undefined,
};

const queue: Alert[] = [];
let current: Alert | null = null;
let hearts: Heart[] = [];
let heartClock = 0;
const lastPhrase: Partial<Record<AlertKind, I18nKey>> = {};

function pickPhrase(kind: AlertKind): I18nKey {
  const options = PHRASES[kind].filter((p) => p !== lastPhrase[kind]);
  const phrase =
    options[Math.floor(Math.random() * options.length)] ?? PHRASES[kind][0] ?? 'join.0';
  lastPhrase[kind] = phrase;
  return phrase;
}

let alertsOn = true,
  likeAlertsOn = true;

/**
 * Snake Arena's battle keeps likes off the card (its like strip shows them): off drops the likes
 * waiting and cuts a like card on screen short. Feed never calls it.
 */
export function setLikeAlerts(on: boolean): void {
  if (on === likeAlertsOn) return;
  likeAlertsOn = on;
  if (on) return;
  for (let i = queue.length - 1; i >= 0; i--) if (queue[i]?.kind === 'like') queue.splice(i, 1);
  if (current?.kind === 'like') current.stay = Math.min(current.stay, current.age + FADE);
}

/** The control room's "Viewer alerts" switch; off clears what is on screen. */
export function setAlertsOn(on: boolean): void {
  alertsOn = on;
  if (!on) resetAlerts();
}

/** A viewer joined, followed, shared or liked (`n` likes). */
export function alertViewer(
  kind: AlertKind,
  nickname: string,
  avatar: string | undefined,
  n = 1,
  supporter?: number,
  ranked = false,
): void {
  if (!nickname || !alertsOn || (kind === 'like' && !likeAlertsOn)) return;
  if (kind === 'like') {
    const same = [current, ...queue].find((a) => a?.kind === 'like' && a.nickname === nickname);
    if (same) {
      same.likes += n;
      same.hearts += likeHearts(n);
      if (avatar) same.avatar = avatar;
      // Keep the card up while the likes keep coming, without replaying its entrance: only
      // while nobody waits, and never for ever, or one fast tapper would hold the spot.
      if (same === current && !queue.length && same.shown < LIKE_MAX)
        same.age = Math.min(same.age, FADE);
      return;
    }
  }
  if (kind === 'share') {
    const same = [current, ...queue].find((a) => a?.kind === 'share' && a.nickname === nickname);
    if (same) {
      if (same === current) {
        same.age = Math.min(same.age, FADE);
        same.hearts += BURST.share;
        alertSounds.show('share');
      }
      return;
    }
  }
  if (kind === 'join') {
    // Joins come in waves: a busy queue skips them rather than lag behind the live. A returning
    // supporter is not part of the wave.
    if (supporter === undefined && !ranked && queue.length >= BUSY) return;
    if (queue.some((a) => a.nickname === nickname) || current?.nickname === nickname) return;
  }
  const visit = kind === 'join' ? visitNumber(nickname) : 0;
  const next: Alert = {
    kind,
    nickname,
    avatar,
    likes: kind === 'like' ? n : 0,
    phrase:
      kind !== 'join'
        ? pickPhrase(kind)
        : supporter !== undefined
          ? supporter > 0
            ? 'welcome.top'
            : supporter < 0
              ? 'welcome.mod'
              : 'welcome.supporter'
          : visit === 1
            ? 'welcome.new'
            : 'welcome.back',
    visit,
    supporter: kind === 'join' ? supporter : undefined,
    ranked: kind === 'join' && supporter === undefined && ranked,
    age: 0,
    shown: 0,
    waited: 0,
    stay: STAY[kind] + (ranked ? RANKED_EXTRA : 0),
    hearts: kind === 'like' ? likeHearts(n) : BURST[kind],
  };
  const at = queue.findIndex((a) => rank(a) > rank(next));
  if (at < 0) queue.push(next);
  else queue.splice(at, 0, next);
  if (queue.length > 5) queue.length = 5;
}

/**
 * Snake Arena: a snake eliminated. The same card as a share (first in line, never expires) with
 * no blossoms, the loser's photo and sentence, the winner's photo at the right end when there is
 * one.
 */
export function alertKill(
  victim: { nickname: string; avatar?: string | undefined },
  by: { nickname: string; avatar?: string | undefined } | null,
): void {
  if (!victim.nickname || !alertsOn) return;
  const next: Alert = {
    kind: 'kill',
    nickname: victim.nickname,
    avatar: victim.avatar,
    by: by ?? undefined,
    likes: 0,
    phrase: by ? 'kill.by' : 'kill.0',
    visit: 0,
    supporter: undefined,
    ranked: false,
    age: 0,
    shown: 0,
    waited: 0,
    stay: STAY.kill,
    hearts: BURST.kill,
  };
  const at = queue.findIndex((a) => rank(a) > rank(next));
  if (at < 0) queue.push(next);
  else queue.splice(at, 0, next);
  if (queue.length > 5) queue.length = 5;
}

/**
 * Snake Arena: a giver joined the paid queue at `place` and plays in `rounds` rounds (1 the next
 * one): "{name} has a seat in the next round" with a gold "#3" badge, else "{name} is #12 in
 * line: plays in 2 rounds". The place rides in `likes`, the number the card's sentence reads.
 */
export function alertQueued(
  who: { nickname: string; avatar?: string | undefined },
  place: number,
  rounds: number,
): void {
  if (!who.nickname || !alertsOn) return;
  const next: Alert = {
    kind: 'qualified',
    nickname: who.nickname,
    avatar: who.avatar,
    by: undefined,
    likes: place,
    rounds: Math.max(1, rounds),
    phrase: rounds <= 1 ? 'arena.playsNext' : 'arena.inLine',
    visit: 0,
    supporter: undefined,
    ranked: false,
    age: 0,
    shown: 0,
    waited: 0,
    stay: STAY.qualified,
    hearts: BURST.qualified,
  };
  const at = queue.findIndex((a) => rank(a) > rank(next));
  if (at < 0) queue.push(next);
  else queue.splice(at, 0, next);
  if (queue.length > 5) queue.length = 5;
}

/**
 * Snake Arena: a player's likes reached a speed boost. The gold card: the photo in a full gold
 * ring, "{name} ⚡ SPEED BOOST" with a lit bolt, no number, the name in the snake's colour, gold
 * bolts around it.
 */
export function alertBoost(
  who: { nickname: string; avatar?: string | undefined },
  tint: string,
): void {
  if (!who.nickname || !alertsOn) return;
  const next: Alert = {
    kind: 'boost',
    nickname: who.nickname,
    avatar: who.avatar,
    by: undefined,
    likes: 0,
    phrase: 'arena.boost',
    visit: 0,
    supporter: undefined,
    ranked: false,
    age: 0,
    shown: 0,
    waited: 0,
    stay: STAY.boost,
    hearts: BURST.boost,
    tint,
  };
  const at = queue.findIndex((a) => rank(a) > rank(next));
  if (at < 0) queue.push(next);
  else queue.splice(at, 0, next);
  if (queue.length > 5) queue.length = 5;
}

/** Snake Arena's game cards: an elimination, a place in the paid queue, a speed boost. */
const isGameCard = (a: Alert | null | undefined): boolean =>
  a?.kind === 'kill' || a?.kind === 'qualified' || a?.kind === 'boost';

/**
 * Snake Arena: the battle is over. Its game cards go at once, waiting or on screen, with their
 * icons: nothing of the battle shows over the end screen. The stream's cards stay.
 */
export function clearGameAlerts(): void {
  for (let i = queue.length - 1; i >= 0; i--) if (isGameCard(queue[i])) queue.splice(i, 1);
  if (isGameCard(current)) current = null;
  hearts = hearts.filter((h) => h.owner === current);
}

/** A point on the card's outline, for icons to leave from. */
function edgePoint(): { x: number; y: number; nx: number; ny: number } {
  const u = Math.random();
  if (u < 0.35)
    return {
      x: look.cx - look.w / 2 + Math.random() * look.w,
      y: look.cy - look.h / 2,
      nx: 0,
      ny: -1,
    };
  if (u < 0.5)
    return { x: look.cx - look.w / 2, y: look.cy + (Math.random() - 0.5) * look.h, nx: -1, ny: 0 };
  if (u < 0.65)
    return { x: look.cx + look.w / 2, y: look.cy + (Math.random() - 0.5) * look.h, nx: 1, ny: 0 };
  // Around the photo, where the eye is: its left half only, so no icon drifts onto the text.
  const a = Math.PI / 2 + Math.random() * Math.PI,
    ax = look.cx - look.w / 2 + 18 + look.avatar / 2;
  return {
    x: ax + Math.cos(a) * (look.avatar / 2 + 4),
    y: look.cy + Math.sin(a) * (look.avatar / 2 + 4),
    nx: Math.cos(a),
    ny: Math.sin(a),
  };
}

/** The next card comes up with its sound. */
function showNext(): void {
  current = queue.shift() ?? null;
  if (!current) return;
  if (queue.length >= BUSY) current.stay = STAY[current.kind] * BUSY_STAY;
  alertSounds.show(current.kind, current.visit === 1);
}

let heartsOut = 0;

export function updateAlerts(dt: number): void {
  // What waited too long is no longer news.
  for (const a of queue) a.waited += dt;
  for (let i = queue.length - 1; i >= 0; i--) {
    const a = queue[i];
    if (a && a.waited > expiry(a)) queue.splice(i, 1);
  }
  if (!current && queue.length) showNext();
  if (current) {
    current.age += dt;
    current.shown += dt;
    // A more important card is waiting: this one leaves as soon as it has been readable.
    const waiting = queue[0];
    if (waiting && rank(waiting) < rank(current))
      current.stay = Math.min(current.stay, Math.max(current.age, MIN_SHOW) + FADE);
    if (current.age > current.stay) showNext();
  }
  // Icons leave the card a few at a time, so twenty likes read as twenty.
  heartClock += dt;
  const a = current;
  while (a && a.hearts > 0 && heartClock >= 1 / HEARTS_PER_SECOND) {
    heartClock -= 1 / HEARTS_PER_SECOND;
    a.hearts--;
    // Past the cap the oldest icon makes room: new likes always show.
    if (hearts.length >= MAX_HEARTS) hearts.shift();
    // A soft pop every few hearts: a patter, not a machine gun.
    if (a.kind === 'like' && heartsOut++ % 3 === 0) alertSounds.heart();
    // A short burst out of the card's edge that settles and fades around it: the hearts frame
    // the card, they never drift onto the board.
    // Butterflies stay close to the card and flutter there.
    const e = edgePoint(),
      speed = (80 + Math.random() * 90) * (a.kind === 'follow' ? 0.4 : 1);
    hearts.push({
      owner: a,
      kind: a.kind,
      x: e.x,
      y: e.y,
      // Never pushed rightward from the photo, where the text starts.
      vx: e.nx < 0 ? e.nx * speed + (Math.random() - 0.5) * 30 : e.nx * speed + Math.random() * 15,
      vy: e.ny * speed - 10 - Math.random() * 20,
      age: 0,
      size: 22 + Math.random() * 14,
      spin: (Math.random() - 0.5) * 1.2,
      phase: Math.random() * Math.PI * 2,
    });
  }
  if (!a || a.hearts <= 0) heartClock = Math.min(heartClock, 1 / HEARTS_PER_SECOND);
  for (const h of hearts) {
    h.age += dt;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    // Strong drag: the burst stops within a few tens of pixels of the card.
    h.vx *= Math.max(0, 1 - 5 * dt);
    h.vy = h.vy * Math.max(0, 1 - 5 * dt) - 12 * dt;
  }
  // Icons leave with their card, which has faded out by then.
  hearts = hearts.filter((h) => h.owner === current);
}

/** How visible a card is: fades in, holds, fades out at the end of its stay. */
function cardShow(a: Alert): number {
  return smooth(a.age / FADE) * (1 - smooth((a.age - (a.stay - FADE)) / FADE));
}

const smooth = (v: number): number => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};

/** The sentence with the name cut out, so the name can be drawn bold in gold. */
function sentence(a: Alert): [string, string, string] {
  if (a.kind === 'kill') return killSentence(a);
  const text = tr(a.phrase, { n: a.phrase === 'welcome.top' ? (a.supporter ?? 0) : a.likes }),
    at = text.indexOf('{name}'),
    name = a.nickname.length > 18 ? a.nickname.slice(0, 17) + '…' : a.nickname;
  return at < 0 ? [text, '', ''] : [text.slice(0, at), name, text.slice(at + 6)];
}

/** A kill's sentence: who fell, and who got them when it was another viewer's snake. */
function killSentence(a: Alert): [string, string, string] {
  const cut = (name: string): string => (name.length > 14 ? name.slice(0, 13) + '…' : name),
    text = tr(a.phrase, { q: a.by ? cut(a.by.nickname) : '' }),
    at = text.indexOf('{name}');
  return at < 0 ? [text, '', ''] : [text.slice(0, at), cut(a.nickname), text.slice(at + 6)];
}

export function paintAlerts(): void {
  const c = ctx,
    a = current;
  if (a) {
    const show = cardShow(a),
      pop =
        a.age < 0.5
          ? 0.9 + 0.1 * smooth(a.age / 0.3) + 0.04 * Math.sin((a.age / 0.5) * Math.PI)
          : 1;
    if (show > 0.01 && (a.kind === 'boost' || a.kind === 'qualified')) {
      c.save();
      c.globalAlpha = show;
      c.translate(look.cx, look.cy + (1 - show) * 14);
      c.scale(pop, pop);
      if (a.kind === 'boost') paintBoostCard(a);
      else paintQueueCard(a);
      c.restore();
    } else if (show > 0.01) {
      c.save();
      c.globalAlpha = show;
      c.translate(look.cx, look.cy + (1 - show) * 14);
      c.scale(pop, pop);
      const x = -look.w / 2,
        y = -look.h / 2;
      c.fillStyle = 'rgba(8,12,10,0.78)';
      c.beginPath();
      c.roundRect(x, y, look.w, look.h, look.h / 2);
      c.fill();
      // A supporter's card is gold, the colour of their big entrance.
      const accent =
        a.supporter === undefined
          ? ACCENT[a.kind]
          : a.supporter < 0
            ? '176,190,255'
            : '242,197,124';
      c.fillStyle = `rgba(${accent},${(0.12 * (1 - Math.min(1, a.age / 1.4))).toFixed(3)})`;
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = `rgba(${accent},0.45)`;
      c.stroke();
      // A ranked join: a thin gold edge, nothing more. The full gold card stays the supporters'.
      if (a.ranked) {
        c.lineWidth = 2.6;
        c.strokeStyle = 'rgba(242,197,124,0.9)';
        c.stroke();
      }
      const ax = x + 18 + look.avatar / 2;
      // A join is the viewer's first impression: the flower's petals open around their photo.
      // A moderator's welcome opens their blue lotus instead of the berry flower.
      const flower = a.supporter !== undefined && a.supporter < 0 ? LOTUS : undefined;
      if (a.kind === 'join') paintBloom(ax, 0, look.avatar / 2, a.age, a.age, flower);
      paintFace(a, ax, 0, look.avatar / 2, a.ranked ? 'rgb(242,197,124)' : `rgb(${accent})`);
      if (a.supporter === 1)
        crown(ax, -look.avatar / 2 - 6, 1.1, { x: ax, y: 0, r: look.avatar / 2 });
      // Text: regular words in light, the name bold in gold, shrunk to fit one line.
      const [before, name, after] = sentence(a),
        // The bloom reaches past the photo: the welcome's text starts a little further right.
        tx = ax + look.avatar / 2 + (a.kind === 'join' ? look.avatar * 0.6 : 18),
        // A kill keeps the right end for the winner's photo.
        room = x + look.w - 24 - tx - (a.by ? look.avatar + 12 : 0);
      if (a.by) paintFace(a.by, x + look.w - 18 - look.avatar / 2, 0, look.avatar / 2, GOLD);
      const widths = (px: number): [number, number, number] => {
        c.font = `500 ${String(px)}px ${FONT}`;
        const b = c.measureText(before).width,
          af = c.measureText(after).width;
        c.font = `800 ${String(px)}px ${FONT}`;
        return [b, c.measureText(name).width, af];
      };
      let size = look.text,
        [wB, wN, wA] = widths(size);
      while (size > 22 && wB + wN + wA > room) [wB, wN, wA] = widths(--size);
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.font = `500 ${String(size)}px ${FONT}`;
      c.fillStyle = 'rgba(255,255,255,0.88)';
      c.fillText(before, tx, 2);
      c.fillText(after, tx + wB + wN, 2);
      c.font = `800 ${String(size)}px ${FONT}`;
      c.fillStyle = GOLD;
      c.fillText(name, tx + wB, 2);
      // Repeat shares: a badge on the corner that jumps at each new one.
      // Loose petals along the card's edges; only the words tell a first visit from a return.
      if (a.kind === 'join')
        paintLoosePetals(
          ax,
          0,
          look.avatar / 2,
          a.age,
          20,
          look.h / 2,
          look.w - look.avatar - 60,
          flower,
        );
      c.restore();
    }
  }
  if (!hearts.length) return;
  c.save();
  for (const h of hearts) {
    const sprite = burstSprite(h.kind);
    const grow = Math.min(1, h.age / 0.14),
      s = h.size * (0.4 + 0.6 * grow) * (1 + 0.06 * Math.sin(h.age * 3 + h.phase)),
      // Once the burst has settled, a slow float in place until the card leaves.
      y = h.y + Math.sin(h.age * 1.8 + h.phase) * 3 * Math.min(1, h.age),
      turn = h.spin * Math.min(h.age, 0.8),
      flutter = h.kind === 'follow',
      // A butterfly beats its wings and wanders a little around where it settled.
      flap = flutter ? 0.35 + 0.65 * Math.abs(Math.sin(h.age * 9 + h.phase)) : 1,
      x = h.x + (flutter ? Math.sin(h.age * 1.3 + h.phase) * 7 : 0);
    c.globalAlpha = cardShow(h.owner);
    c.translate(x, y);
    c.rotate(turn);
    c.drawImage(sprite, -s * flap, -s, s * 2 * flap, s * 2);
    c.rotate(-turn);
    c.translate(-x, -y);
  }
  c.restore();
}

/** The arena's game cards: a dark pill, its outline lit in `edge`. */
function pill(w: number, h: number, edge: string): void {
  const c = ctx;
  c.fillStyle = 'rgba(14,16,20,0.92)';
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, h / 2);
  c.fill();
  c.lineWidth = 2.4;
  c.strokeStyle = edge;
  c.stroke();
}

/** The name cut to `max` pixels at the current font. */
function fitName(name: string, max: number): string {
  const c = ctx;
  if (c.measureText(name).width <= max) return name;
  let n = name;
  while (n.length > 1 && c.measureText(n + '…').width > max) n = n.slice(0, -1);
  return n + '…';
}

/** A lightning bolt, lit (gold) or not (faint), `size` tall, centred on (x, y). */
export function paintCardBolt(x: number, y: number, size: number, lit: boolean): void {
  const c = ctx;
  c.save();
  c.translate(x, y);
  c.scale(size / 20, size / 20);
  c.beginPath();
  c.moveTo(3, -10);
  c.lineTo(-6, 2);
  c.lineTo(-0.5, 2);
  c.lineTo(-3, 10);
  c.lineTo(6.5, -2.5);
  c.lineTo(1, -2.5);
  c.closePath();
  c.fillStyle = lit ? GOLD : 'rgba(255,255,255,0.3)';
  c.fill();
  c.lineWidth = 1.6;
  c.strokeStyle = lit ? '#5c3b00' : 'rgba(0,0,0,0.4)';
  c.stroke();
  c.restore();
}

/** A game card's words shrink to fit their row down to this size, then the name is cut. */
export const GAME_TEXT_MIN = 30;

/**
 * One stretch of a game card's row: its words, colour and weight; the `name` may be cut to fit. A
 * `bolt` is the lit bolt drawn in the words' place, its text "⚡" read by tests only.
 */
interface Piece {
  readonly text: string;
  readonly colour: string;
  readonly weight: number;
  readonly name?: boolean;
  readonly bolt?: boolean;
}

/** A bolt piece's width and height on a row of words at `size`. */
const boltWidth = (size: number): number => size * 0.8;

/** A piece's width on a row at `size`, the font set for it. */
function pieceWidth(p: Piece, size: number): number {
  if (p.bolt) return boltWidth(size);
  ctx.font = `${String(p.weight)} ${String(size)}px ${FONT}`;
  return ctx.measureText(p.text).width;
}

/** What the last game card painted on its row: for tests. */
let lastRow: { text: string; size: number; left: number; right: number; room: number } | null =
  null;

/** The row at the size that fits `room`: the card's text size down to GAME_TEXT_MIN, then the name cut. */
function fitRow(pieces: readonly Piece[], room: number): { size: number; pieces: Piece[] } {
  const c = ctx,
    width = (size: number, list: readonly Piece[]): number =>
      list.reduce((sum, p) => sum + pieceWidth(p, size), 0);
  let size = look.text;
  while (size > GAME_TEXT_MIN && width(size, pieces) > room) size--;
  if (width(size, pieces) <= room) return { size, pieces: [...pieces] };
  const others = width(
    size,
    pieces.filter((p) => !p.name),
  );
  return {
    size,
    pieces: pieces.map((p) => {
      if (!p.name) return p;
      c.font = `${String(p.weight)} ${String(size)}px ${FONT}`;
      return { ...p, text: fitName(p.text, Math.max(40, room - others)) };
    }),
  };
}

/** Paints a game card's words on one row from `tx`, within `room`; returns where the row ends. */
function paintRow(pieces: readonly Piece[], tx: number, room: number): number {
  const c = ctx,
    row = fitRow(pieces, room);
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  let x = tx;
  for (const p of row.pieces) {
    const w = pieceWidth(p, row.size);
    if (p.bolt) paintCardBolt(x + w / 2, 0, row.size * 1.05, true);
    else {
      c.fillStyle = p.colour;
      c.fillText(p.text, x, 2);
    }
    x += w;
  }
  lastRow = {
    text: row.pieces.map((p) => p.text).join(''),
    size: row.size,
    left: tx,
    right: x,
    room,
  };
  return x;
}

/** The card's sentence split round the name, the name in `colour`, the words in light. */
function pieces(a: Alert, text: string, colour: string): Piece[] {
  const at = text.indexOf('{name}'),
    name = a.nickname.length > 18 ? a.nickname.slice(0, 17) + '…' : a.nickname,
    words = (t: string): Piece => ({ text: t, colour: 'rgba(255,255,255,0.9)', weight: 500 });
  if (at < 0) return [words(text)];
  return [
    words(text.slice(0, at)),
    { text: name, colour, weight: 800, name: true },
    words(text.slice(at + 6)),
  ].filter((p) => p.text);
}

/**
 * A speed boost reached, on Feed's card (look), one row: the photo in a full gold ring, "{name} ⚡
 * SPEED BOOST" (the name in the snake's colour, a lit bolt for the "⚡", the words after it in
 * gold). No number: the card thanks, it sets no target.
 */
function paintBoostCard(a: Alert): void {
  const c = ctx,
    w = look.w,
    h = look.h,
    r = look.avatar / 2,
    x = -w / 2,
    tint = a.tint ?? '#fff';
  pill(w, h, 'rgba(242,193,78,0.75)');
  const px = x + 18 + r;
  paintFace(a, px, 0, r, tint);
  c.lineWidth = 7;
  c.strokeStyle = GOLD;
  c.beginPath();
  c.arc(px, 0, r + 8, 0, Math.PI * 2);
  c.stroke();
  // The "⚡" is the lit bolt; the words after it shout in gold: "SPEED BOOST".
  const list = pieces(a, tr('arena.boost'), tint),
    last = list.at(-1),
    cut = last && !last.name ? last.text.indexOf('⚡') : -1;
  if (last && cut >= 0) {
    list.pop();
    list.push(
      ...[
        { ...last, text: last.text.slice(0, cut) },
        { text: '⚡', colour: GOLD, weight: 900, bolt: true },
        { text: last.text.slice(cut + 1), colour: GOLD, weight: 900 },
      ].filter((p) => p.text),
    );
  }
  const tx = px + r + 28;
  paintRow(list, tx, x + w - 28 - tx);
}

/**
 * A place in the paid queue, on Feed's card (look), one row: in the next round's batch, a small
 * gold egg on the photo, "{name} has a seat in the next round" and a gold "#3" badge; further back,
 * "{name} is #12 in line: plays in 2 rounds", the place in bold.
 */
function paintQueueCard(a: Alert): void {
  const c = ctx,
    next = a.phrase === 'arena.playsNext',
    w = look.w,
    h = look.h,
    r = look.avatar / 2,
    x = -w / 2;
  pill(w, h, next ? 'rgba(242,193,78,0.6)' : 'rgba(255,255,255,0.18)');
  const px = x + 18 + r,
    tx = px + r + 18;
  paintFace(a, px, 0, r, next ? GOLD : 'rgba(255,255,255,0.85)');
  const place = `#${String(a.likes)}`,
    text = tr(a.phrase, { n: a.likes, r: a.rounds ?? 1 });
  if (!next) {
    // The place reads bold in the sentence.
    const list = pieces(a, text, GOLD).flatMap((p): Piece[] => {
      const at = p.name ? -1 : p.text.indexOf(place);
      return at < 0
        ? [p]
        : [
            { ...p, text: p.text.slice(0, at) },
            { text: place, colour: '#fff', weight: 800 },
            { ...p, text: p.text.slice(at + place.length) },
          ].filter((q) => q.text);
    });
    paintRow(list, tx, x + w - 28 - tx);
    return;
  }
  // The gold badge at the right end, the egg just before it.
  const bh = h * 0.52;
  c.font = `900 ${String(Math.round(bh * 0.58))}px ${FONT}`;
  const bw = Math.max(bh * 1.3, c.measureText(place).width + bh * 0.6),
    bx = x + w - 24 - bw;
  c.fillStyle = GOLD;
  c.beginPath();
  c.roundRect(bx, -bh / 2, bw, bh, bh / 2);
  c.fill();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#3a2600';
  c.fillText(place, bx + bw / 2, 1);
  // The small gold egg on the photo's lower right, like a seat's.
  const es = h * 0.46;
  c.drawImage(burstSprite('qualified'), px + r * 0.62 - es / 2, r * 0.5 - es / 2, es, es);
  paintRow(pieces(a, text, GOLD), tx, bx - 16 - tx);
}

/** For tests: the words of the last game card painted, their size and where the row ran. */
export const gameCardRow = (): typeof lastRow => lastRow;

/** Clears everything (tests, new session). */
export function resetAlerts(): void {
  queue.length = 0;
  current = null;
  hearts = [];
  lastRow = null;
}

/** For tests: the alert on screen and the waiting ones. */
export const alertsState = (): { current: Alert | null; queued: number; hearts: number } => ({
  current,
  queued: queue.length,
  hearts: hearts.length,
});
