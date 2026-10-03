// A supporter's grand entrance: someone who has given berries before joins the live and the game
// itself greets them, over the board, the way a gifter is framed in the flower but bigger. Every
// gifter gets the entrance; the three biggest get their own, grander one (a crown for the first,
// rays in their medal's colour, a longer stay). One entrance at a time, a few seconds, then the
// snake is back in full view.
//
// Every gift is thanked the same way, on the spot: the giver's photo in the flower, their name and
// what they gave, for a few seconds. Someone's very first gift gets the grander version (rays, a
// longer stay): it is the gift that turns a viewer into a supporter. It only thanks; nothing on
// it asks for anything.

import { ctx } from '../engine/canvas.ts';
import { W } from '../engine/layout.ts';
import { GOLD } from '../engine/palette.ts';
import { burstSprite } from './alert-fx.ts';
import { alertSounds } from './alerts.ts';
import { BOARD_H, BOARD_W, FX0, FY0 } from './grid.ts';
import { FONT, berrySprite, crown, paintFace } from './paint.ts';
import { paintTray, resetTray, trayGift, updateTray } from './gift-tray.ts';
import { LOTUS, paintBloom } from './welcome.ts';

export interface Entrance {
  readonly nickname: string;
  readonly avatar?: string | undefined;
  /** 1 to 3 for the top supporters, 0 for every other gifter. */
  readonly rank: number;
  /** Berries they have given, over every live. */
  readonly berries: number;
  /** Their first gift ever, just sent: thanked now instead of welcomed back. */
  readonly first?: boolean;
  /** A gift just sent by someone who gave before; `berries` is then what this gift brings. */
  readonly thanks?: boolean;
  /**
   * Set when a gift just lifted them past this supporter in the top three: instead of arriving,
   * they knock the one they passed off the spot.
   */
  readonly passed?: { readonly nickname: string; readonly avatar?: string | undefined };
  /** One of the live's moderators: a shield instead of the flower, and a MOD badge. */
  readonly mod?: boolean;
}

interface Showing extends Entrance {
  age: number;
  /** Seconds it stays: shorter when others are waiting their turn. */
  length: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  spin: number;
  berry: boolean;
}

const CX = W / 2,
  CY = FY0 + BOARD_H / 2 - 120,
  FADE = 0.45,
  /** A pass: seconds before the new supporter lands on the old one's spot. */
  IMPACT = 0.8;

/** Seconds on screen: the top three stay longer, a pass longer still. */
const stay = (e: Entrance): number =>
  e.passed ? 6.6 : e.thanks ? 3.4 : e.rank > 0 ? 5.6 : e.first ? 5 : e.mod ? 4.8 : 4.2;
/** Seconds before the entrance proper starts: a pass first plays the knock. */
const lead = (e: Entrance): number => (e.passed ? IMPACT : 0);

/** Medal colours: gold, silver, bronze, and the berry flower's pink for every other gifter. */
export const TIER: readonly { main: string; glow: string }[] = [
  { main: '#f6b8c4', glow: '246,184,196' },
  { main: GOLD, glow: '242,197,124' },
  { main: '#dfe7f0', glow: '214,226,240' },
  { main: '#e6a36d', glow: '230,163,109' },
];

const queue: Entrance[] = [];
let current: Showing | null = null;
let sparks: Spark[] = [];

/**
 * How often the same supporter gets their big entrance, set live from the control room: 0 at
 * every arrival, a number of milliseconds between two, Infinity once per live, or -1 never (the
 * gold alert at the bottom only). A pass is always shown: it cost a gift.
 */
let welcomeEvery = 0;
export function setEntranceGap(ms: number): void {
  welcomeEvery = ms;
}

/** When each supporter last had their big entrance. */
const welcomed = new Map<string, number>();

/** What became of an entrance: waiting its turn, or not now (the caller shows the gold alert). */
export type EntranceOutcome = 'queued' | 'not now';

const order = (q: Entrance): number =>
  q.passed ? 0 : q.first ? 4 : q.thanks ? 6 : q.rank || (q.mod ? 5 : 9);

export function welcomeSupporter(e: Entrance, now = Date.now()): EntranceOutcome {
  const key = e.nickname.toLowerCase();
  if (e.first || e.thanks) {
    // Shown whatever the setting says: like a pass, it cost a gift.
    if (e.first) welcomed.set(key, now);
  } else if (!e.passed) {
    if (welcomeEvery < 0 || now - (welcomed.get(key) ?? -Infinity) < welcomeEvery) return 'not now';
    // Already waiting: arriving twice in a row is one arrival.
    if (queue.some((q) => !q.passed && q.nickname === e.nickname)) return 'queued';
    welcomed.set(key, now);
  }
  // A pass goes first, then the top three, first gifts, the moderators, gifts, every other
  // gifter arriving. Nobody is skipped: when several wait, each plays shorter.
  const at = queue.findIndex((q) => order(q) > order(e));
  if (at < 0) queue.push(e);
  else queue.splice(at, 0, e);
  return 'queued';
}

/** A thanks kept up by more gifts from its giver never stays longer than this in all. */
const THANKS_MAX = 9;

/**
 * More berries from someone whose thanks is on screen or waiting (a streak arrives one step at a
 * time): the count goes up and the thanks stays a moment longer. False when they have none.
 */
export function growGift(nickname: string, berries: number): boolean {
  const mine = (q: Entrance): boolean => (!!q.first || !!q.thanks) && q.nickname === nickname;
  if (current && mine(current)) {
    current = {
      ...current,
      berries: current.berries + berries,
      length: Math.min(THANKS_MAX, Math.max(current.length, current.age + 1.6)),
    };
    return true;
  }
  const at = queue.findIndex(mine);
  const waiting = queue[at];
  if (!waiting) return false;
  queue[at] = { ...waiting, berries: waiting.berries + berries };
  return true;
}

/** Where a gift from someone who gave before is thanked: by the flower, on the tray, or here. */
export type GiftThanks = 'flower' | 'tray' | 'classic';
let giftThanks: GiftThanks = 'flower';
export function setGiftThanks(mode: GiftThanks): void {
  giftThanks = mode;
}

/**
 * Every gift is thanked, wherever it comes from: the live, the control room, the rehearsal
 * audience. A first gift ever always gets its entrance over the board. The others are thanked
 * where the control room says: by the flower itself, on the tray, or with an entrance too.
 */
export function thankGift(
  nickname: string,
  avatar: string | undefined,
  berries: number,
  first = false,
): void {
  if (!nickname || berries <= 0 || growGift(nickname, berries)) return;
  if (first || giftThanks === 'classic') {
    welcomeSupporter({
      nickname,
      avatar: avatar === '' ? undefined : avatar,
      rank: 0,
      berries,
      ...(first ? { first: true } : { thanks: true }),
    });
    return;
  }
  if (giftThanks === 'tray') trayGift(nickname, avatar, berries);
  // The flower shows it; this is its sound.
  else alertSounds.thanks(false);
}

/** The control room's Skip: the entrance on screen leaves now. */
export function skipEntrance(): void {
  if (current) current.age = Math.max(current.age, current.length - FADE);
}

const smooth = (v: number): number => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};
const easeOutBack = (v: number): number => {
  const x = Math.max(0, Math.min(1, v)) - 1;
  return 1 + 2.7 * x * x * x + 1.7 * x * x;
};

function shown(s: Showing): number {
  return smooth(s.age / FADE) * (1 - smooth((s.age - (s.length - FADE)) / FADE));
}

function burst(s: Showing, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2,
      v = 180 + Math.random() * 420;
    sparks.push({
      x: CX + Math.cos(a) * 60,
      y: CY + Math.sin(a) * 60,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 120,
      age: 0,
      life: 1.4 + Math.random() * 1.6,
      size: 10 + Math.random() * 14,
      spin: (Math.random() - 0.5) * 6,
      berry: (s.rank > 0 || !!s.first) && Math.random() < 0.45,
    });
  }
}

/** `hold` while the board is not in play (get ready, end screen): entrances wait, none is lost. */
export function updateSupporters(dt: number, hold = false): void {
  if (!current && !hold) {
    const next = queue.shift();
    if (next)
      current = {
        ...next,
        age: 0,
        length: queue.length ? Math.max(next.passed ? 3.8 : 2.6, stay(next) * 0.6) : stay(next),
      };
    // A thanks has its own sound, played when it shows, not when the gift arrived.
    if (next && (next.first || next.thanks)) alertSounds.thanks(!!next.first);
  }
  if (current) play(current, dt);
  updateTray(dt);
  for (const p of sparks) {
    p.age += dt;
    p.vx *= Math.exp(-dt * 2.2);
    p.vy = p.vy * Math.exp(-dt * 2.2) + 140 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  sparks = sparks.filter((p) => p.age < p.life);
}

function play(s: Showing, dt: number): void {
  const l = lead(s),
    was = s.age - l;
  s.age += dt;
  const now = s.age - l;
  // The burst lands with the photo (or the knock), a second wave for the top three.
  if (was < 0.28 && now >= 0.28) burst(s, s.passed ? 110 : s.rank > 0 || s.first ? 70 : 34);
  if (s.rank > 0 && was < 1.3 && now >= 1.3) burst(s, 40);
  if (s.age >= s.length) current = null;
}

function rays(color: string, alpha: number, t: number): void {
  const c = ctx,
    n = 18,
    reach = 470;
  c.save();
  c.translate(CX, CY);
  c.rotate(t * 0.25);
  const g = c.createRadialGradient(0, 0, 40, 0, 0, reach);
  g.addColorStop(0, `rgba(${color},${String(alpha)})`);
  g.addColorStop(1, `rgba(${color},0)`);
  c.fillStyle = g;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    c.moveTo(0, 0);
    c.arc(0, 0, reach, a, a + (Math.PI / n) * 0.55);
    c.closePath();
  }
  c.fill();
  c.restore();
}

/** The moderators' colour, a periwinkle blue that no gift tier uses. */
const MOD = { main: '#b9c6ff', glow: '176,190,255' };

/** A round badge marked MOD on a photo's corner, cut like the rank medals. */
function modBadge(x: number, y: number, pop: number): void {
  const c = ctx,
    size = Math.max(0.5, 30 * pop);
  c.fillStyle = MOD.main;
  c.beginPath();
  c.arc(x, y, size, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = 'rgba(16,20,40,0.85)';
  c.stroke();
  c.fillStyle = '#141a3a';
  c.font = `900 ${String(Math.max(1, Math.round(17 * pop)))}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('MOD', x, y + 1);
}

/** A medal with the rank on a photo's corner. */
export function medal(x: number, y: number, size: number, rank: number, color: string): void {
  const c = ctx;
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, Math.max(0.5, size), 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 4;
  c.strokeStyle = 'rgba(20,16,10,0.85)';
  c.stroke();
  c.fillStyle = '#1d1408';
  c.font = `900 ${String(Math.max(1, Math.round(size)))}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(`#${String(rank)}`, x, y + 2);
}

/**
 * A pass: the supporter who held the spot sits in the middle wearing its medal; the new one falls
 * from above, lands on them, and they are pushed aside, smaller, one rank down.
 */
function paintKnock(s: Showing, R: number, color: string, t: number): void {
  const c = ctx,
    old = s.passed;
  if (!old) return;
  const a = s.age - IMPACT,
    fall = smooth(s.age / IMPACT);
  if (a < 0) {
    // Before the knock: the old holder, and the new one dropping onto them.
    paintFace(old, CX, CY, R * 0.9, color);
    medal(CX + R * 0.66, CY + R * 0.66, 28, s.rank, color);
    const y = CY - 560 + 560 * fall * fall;
    if (s.age > 0.15) paintFace(s, CX, y, R * 0.85, color);
    return;
  }
  // After: pushed to the side, fading, with the rank below the one they lost.
  const push = smooth(a / 0.45),
    x = CX + 300 * push,
    y = CY + 40 * push + Math.sin(t * 2) * 2,
    r = R * (0.9 - 0.42 * push);
  c.save();
  c.globalAlpha *= 1 - 0.45 * push;
  paintFace(old, x, y, r, 'rgba(200,200,200,0.8)');
  if (s.rank < 3) medal(x + r * 0.7, y + r * 0.7, 18, s.rank + 1, 'rgba(210,210,210,0.9)');
  c.restore();
}

/** Text with letters spread apart, centred on x. */
function spaced(text: string, x: number, y: number, gap: number): void {
  const c = ctx;
  c.letterSpacing = `${String(gap)}px`;
  c.textAlign = 'center';
  // The spacing trails the last letter too: shift by half a gap to stay centred.
  c.fillText(text, x + gap / 2, y);
  c.letterSpacing = '0px';
}

const firstText = (n: number): string =>
  `+${n.toLocaleString('en-US').replace(/,/g, ' ')} ${n === 1 ? 'berry' : 'berries'} · thank you!`;

const berriesText = (n: number): string =>
  `${n.toLocaleString('en-US').replace(/,/g, ' ')} ${n === 1 ? 'berry' : 'berries'} given`;

export function paintSupporters(t: number): void {
  const c = ctx,
    s = current;
  paintTray(t);
  if (s) {
    const show = shown(s),
      // A moderator who is not in the top three wears the moderators' colour.
      tier = s.mod && !s.rank ? MOD : (TIER[s.rank] ?? TIER[0]),
      top = s.rank > 0,
      guard = !!s.mod && !top;
    if (tier && show > 0.01) {
      c.save();
      // The board dims around the entrance so it reads, the snake still showing at the edges.
      c.beginPath();
      c.roundRect(FX0, FY0, BOARD_W, BOARD_H, 18);
      c.clip();
      const veil = c.createRadialGradient(CX, CY, 60, CX, CY, 640);
      veil.addColorStop(0, `rgba(6,10,8,${String(0.78 * show)})`);
      veil.addColorStop(0.6, `rgba(6,10,8,${String(0.5 * show)})`);
      veil.addColorStop(1, `rgba(6,10,8,${String(0.18 * show)})`);
      c.fillStyle = veil;
      c.fillRect(FX0, FY0, BOARD_W, BOARD_H);
      c.globalAlpha = show;
      if (top || guard || s.first) rays(tier.glow, 0.3, t);
      const halo = c.createRadialGradient(CX, CY, 20, CX, CY, top ? 330 : 250);
      halo.addColorStop(0, `rgba(${tier.glow},0.55)`);
      halo.addColorStop(1, `rgba(${tier.glow},0)`);
      c.fillStyle = halo;
      c.fillRect(FX0, FY0, BOARD_W, BOARD_H);

      const R = top ? 108 : 92,
        a = s.age - lead(s),
        // The spring overshoots, never below zero: a radius must stay positive.
        pop = Math.max(0, easeOutBack((a - 0.05) / 0.55)),
        r = R * (0.25 + 0.75 * pop);
      if (s.passed) paintKnock(s, R, tier.main, t);
      if (a > 0) {
        // The knock shakes the board for a moment.
        const shake = a < 0.3 ? (1 - a / 0.3) * 9 : 0;
        c.translate(Math.sin(a * 90) * shake, Math.cos(a * 70) * shake);
        // The berry flower opens around the photo, bigger than any other welcome.
        paintBloom(CX, CY, r, a * 0.9, t, guard ? LOTUS : undefined);
        c.shadowColor = `rgba(${tier.glow},0.9)`;
        c.shadowBlur = 36;
        paintFace(s, CX, CY, s.passed ? R * (0.85 + 0.15 * pop) : r, tier.main);
        c.shadowBlur = 0;
      }
      if (s.rank === 1 && a > 0)
        crown(CX, CY - r - 26 + Math.sin(t * 3) * 3, 2.6 * pop, { x: CX, y: CY, r });
      if (top && a > 0) {
        // The medal on the photo's corner: #1, #2, #3.
        medal(CX + r * 0.74, CY + r * 0.74, 30 * pop, s.rank, tier.main);
      }
      // A moderator's badge on the other corner, whatever their rank.
      if (s.mod && a > 0) modBadge(CX - r * 0.74, CY + r * 0.74, pop);

      // The words come in after the photo, one line after the other.
      const line = (delay: number): number => smooth((a - delay) / 0.4);
      // Below the open flower (its petals reach twice the photo's radius).
      const y0 = CY + 2 * R + 40;
      c.textBaseline = 'middle';
      c.textAlign = 'center';
      let k = line(0.45);
      c.globalAlpha = show * k;
      c.fillStyle = tier.main;
      c.font = `${s.passed ? '900 40px' : '800 26px'} ${FONT}`;
      spaced(
        s.passed
          ? `NEW #${String(s.rank)}!`
          : s.first
            ? 'FIRST GIFT'
            : s.thanks
              ? 'THANK YOU'
              : 'WELCOME BACK',
        CX,
        y0 + (1 - k) * 16,
        s.passed ? 9 : 7,
      );
      k = line(0.6);
      c.globalAlpha = show * k;
      let size = top ? 72 : 62;
      c.font = `900 ${String(size)}px ${FONT}`;
      const name = s.nickname.length > 20 ? s.nickname.slice(0, 19) + '…' : s.nickname;
      while (size > 34 && c.measureText(name).width > BOARD_W - 120)
        c.font = `900 ${String(--size)}px ${FONT}`;
      c.lineWidth = 8;
      c.strokeStyle = 'rgba(10,8,4,0.7)';
      c.textAlign = 'center';
      c.strokeText(name, CX, y0 + 66 + (1 - k) * 18);
      const shine = c.createLinearGradient(CX - 300, 0, CX + 300, 0),
        sweep = ((t * 0.5) % 1.6) - 0.3;
      shine.addColorStop(0, GOLD);
      shine.addColorStop(Math.max(0, Math.min(1, sweep)), '#fff6dc');
      shine.addColorStop(1, GOLD);
      c.fillStyle = top ? shine : GOLD;
      c.fillText(name, CX, y0 + 66 + (1 - k) * 18);
      k = line(0.8);
      c.globalAlpha = show * k;
      const detail = s.passed
        ? `passes ${s.passed.nickname}`
        : top
          ? `Top supporter #${String(s.rank)} · ${berriesText(s.berries)}`
          : s.first
            ? 'Thank you!'
            : s.thanks
              ? firstText(s.berries)
              : s.mod
                ? 'Moderator · keeping the live safe'
                : berriesText(s.berries);
      size = 32;
      c.font = `600 ${String(size)}px ${FONT}`;
      while (size > 20 && c.measureText(detail).width > BOARD_W - 80)
        c.font = `600 ${String(--size)}px ${FONT}`;
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillText(detail, CX, y0 + 128 + (1 - k) * 14);
      c.restore();
    }
  }
  if (!sparks.length) return;
  const sparkle = burstSprite('join'),
    berry = berrySprite(0);
  c.save();
  const fade = s ? shown(s) : 1;
  for (const p of sparks) {
    const life = 1 - p.age / p.life;
    c.globalAlpha = Math.max(0, Math.min(1, life * 2.2)) * fade;
    const sz = p.size * (0.5 + 0.5 * Math.min(1, p.age * 6)),
      turn = p.spin * p.age;
    c.translate(p.x, p.y);
    c.rotate(turn);
    c.drawImage(p.berry ? berry : sparkle, -sz, -sz, sz * 2, sz * 2);
    c.rotate(-turn);
    c.translate(-p.x, -p.y);
  }
  c.restore();
}

/** Clears everything (tests, new session). */
export function resetSupporterEntrances(): void {
  queue.length = 0;
  current = null;
  sparks = [];
  welcomed.clear();
  resetTray();
}

/** For tests: the entrance on screen and those waiting. */
export const entranceState = (): { current: Entrance | null; waiting: readonly Entrance[] } => ({
  current,
  waiting: [...queue],
});
