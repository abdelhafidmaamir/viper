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

import { ctx } from '../engine/canvas.ts';
import { tr, type I18nKey } from '../engine/i18n.ts';
import { W } from '../engine/layout.ts';
import { GOLD } from '../engine/palette.ts';
import { BOARD_H, FY0 } from './grid.ts';
import { burstSprite } from './alert-fx.ts';
import { FONT, crown, paintFace } from './paint.ts';
import { LOTUS, paintBloom, paintLoosePetals, visitNumber } from './welcome.ts';

/** 'kill' is Snake Arena's: a snake eliminated. Feed never sends it. */
export type AlertKind = 'join' | 'like' | 'share' | 'follow' | 'kill';

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

const CX = W / 2,
  // Sized for a phone screen: the viewer's photo and name must read at a glance on a live.
  CY = FY0 + BOARD_H + 132,
  CARD_W = 790,
  CARD_H = 114,
  AVATAR = 86;
const STAY: Readonly<Record<AlertKind, number>> = {
  join: 3.2,
  like: 3.8,
  share: 4,
  follow: 3.8,
  kill: 4,
};
/** Icons bursting when a card comes up; likes burst one per like instead. */
const BURST: Readonly<Record<AlertKind, number>> = {
  join: 0,
  like: 0,
  share: 14,
  follow: 12,
  // A kill's card comes up plain: no blossoms.
  kill: 0,
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

/** 0 first: follows, shares and returning supporters, then likes and ranked joins, plain joins last. */
const rank = (a: Pick<Alert, 'kind' | 'supporter' | 'ranked'>): number =>
  a.kind === 'share' || a.kind === 'follow' || a.kind === 'kill' || a.supporter !== undefined
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
};
/** Hearts per like event, at most: a flood of likes must not cover the screen. */
const HEARTS_PER_EVENT = 24,
  MAX_HEARTS = 70,
  HEARTS_PER_SECOND = 20;
const PHRASES: Readonly<Record<AlertKind, readonly I18nKey[]>> = {
  join: ['join.0', 'join.1', 'join.2'],
  like: ['like.0', 'like.1'],
  share: ['share.0', 'share.1'],
  follow: ['follow.0', 'follow.1'],
  kill: ['kill.0'],
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

let alertsOn = true;

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
  if (!nickname || !alertsOn) return;
  if (kind === 'like') {
    const same = [current, ...queue].find((a) => a?.kind === 'like' && a.nickname === nickname);
    if (same) {
      same.likes += n;
      same.hearts += Math.min(HEARTS_PER_EVENT, n);
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
    hearts: kind === 'like' ? Math.min(HEARTS_PER_EVENT, n) : BURST[kind],
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

/** A point on the card's outline, for icons to leave from. */
function edgePoint(): { x: number; y: number; nx: number; ny: number } {
  const u = Math.random();
  if (u < 0.35)
    return { x: CX - CARD_W / 2 + Math.random() * CARD_W, y: CY - CARD_H / 2, nx: 0, ny: -1 };
  if (u < 0.5) return { x: CX - CARD_W / 2, y: CY + (Math.random() - 0.5) * CARD_H, nx: -1, ny: 0 };
  if (u < 0.65) return { x: CX + CARD_W / 2, y: CY + (Math.random() - 0.5) * CARD_H, nx: 1, ny: 0 };
  // Around the photo, where the eye is: its left half only, so no icon drifts onto the text.
  const a = Math.PI / 2 + Math.random() * Math.PI,
    ax = CX - CARD_W / 2 + 18 + AVATAR / 2;
  return {
    x: ax + Math.cos(a) * (AVATAR / 2 + 4),
    y: CY + Math.sin(a) * (AVATAR / 2 + 4),
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
    if (a && a.waited > (EXPIRES[rank(a)] ?? Infinity)) queue.splice(i, 1);
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
    if (show > 0.01) {
      c.save();
      c.globalAlpha = show;
      c.translate(CX, CY + (1 - show) * 14);
      c.scale(pop, pop);
      const x = -CARD_W / 2,
        y = -CARD_H / 2;
      c.fillStyle = 'rgba(8,12,10,0.78)';
      c.beginPath();
      c.roundRect(x, y, CARD_W, CARD_H, CARD_H / 2);
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
      const ax = x + 18 + AVATAR / 2;
      // A join is the viewer's first impression: the flower's petals open around their photo.
      // A moderator's welcome opens their blue lotus instead of the berry flower.
      const flower = a.supporter !== undefined && a.supporter < 0 ? LOTUS : undefined;
      if (a.kind === 'join') paintBloom(ax, 0, AVATAR / 2, a.age, a.age, flower);
      paintFace(a, ax, 0, AVATAR / 2, a.ranked ? 'rgb(242,197,124)' : `rgb(${accent})`);
      if (a.supporter === 1) crown(ax, -AVATAR / 2 - 6, 1.1, { x: ax, y: 0, r: AVATAR / 2 });
      // Text: regular words in light, the name bold in gold, shrunk to fit one line.
      const [before, name, after] = sentence(a),
        // The bloom reaches past the photo: the welcome's text starts a little further right.
        tx = ax + AVATAR / 2 + (a.kind === 'join' ? AVATAR * 0.6 : 18),
        // A kill keeps the right end for the winner's photo.
        room = x + CARD_W - 24 - tx - (a.by ? AVATAR + 12 : 0);
      if (a.by) paintFace(a.by, x + CARD_W - 18 - AVATAR / 2, 0, AVATAR / 2, GOLD);
      const widths = (px: number): [number, number, number] => {
        c.font = `500 ${String(px)}px ${FONT}`;
        const b = c.measureText(before).width,
          af = c.measureText(after).width;
        c.font = `800 ${String(px)}px ${FONT}`;
        return [b, c.measureText(name).width, af];
      };
      let size = 38,
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
        paintLoosePetals(ax, 0, AVATAR / 2, a.age, 20, CARD_H / 2, CARD_W - AVATAR - 60, flower);
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

/** Clears everything (tests, new session). */
export function resetAlerts(): void {
  queue.length = 0;
  current = null;
  hearts = [];
}

/** For tests: the alert on screen and the waiting ones. */
export const alertsState = (): { current: Alert | null; queued: number; hearts: number } => ({
  current,
  queued: queue.length,
  hearts: hearts.length,
});
