// Crowd energy: likes belong to no team, so they fill one shared orb. The fuller it is, the faster
// both snakes move (the round clock never changes), and a full bar starts a short frenzy where the
// forest feeds both sides. Built to stay calm with any crowd size: the bar follows the like RATE,
// not a running total, it saturates, it moves slowly, and every frenzy is followed by a cooldown.

import { ctx } from './canvas.ts';
import { H, SC_CY, W } from './layout.ts';
import { getAvatar } from './announcements.ts';

// Likes in the pool lose half their weight every 15 s, so the bar tracks the recent rhythm.
const POOL_HALF_LIFE = 15;
// Pool size for a 63 % bar. Steady state is about 22 x likes per second: 10/s gives 0.84.
const POOL_SCALE = 120;
// The bar never moves faster than this per second, whatever the burst.
const EASE = 0.12;
// Snake speed bonus at a full bar, and on top of it during a frenzy.
const TEMPO_MAX = 0.15;
const FRENZY_TEMPO = 0.15;
const FRENZY_AT = 0.97;
const FRENZY_TIME = 8;
// No new frenzy for this long after one ends; the bar also stops short of full meanwhile.
const COOLDOWN = 45;
const FRENZY_BERRY_EVERY = 1.6;
// A liker's face takes this long to fly into the orb.
const FLY_TIME = 0.9;
/** Frenzy berries on the board at once. */
export const FRENZY_BERRIES = 3;

let pool = 0,
  energy = 0,
  frenzy = 0,
  cooldown = 0,
  drop = 0,
  shown = 0,
  nextFlyer = 0,
  beat = 0,
  quiet = 0,
  flyerSeq = 0,
  playingNow = false;
// Likers' faces fly from the bottom of the screen into the orb, so every viewer sees their own
// taps go in. The rate is capped: a flood of likes looks like a steady stream, never a cloud.
const FLY_EVERY = 0.16;
const MAX_FLYERS = 12;
interface Liker {
  readonly nickname: string;
  readonly avatar: string | undefined;
}
let waiting: Liker[] = [];
let flyers: { age: number; sx: number; bend: number; who: Liker }[] = [];

export function addLikes(n: number, nickname = '', avatar?: string): void {
  pool += n;
  quiet = 0;
  // One face per batch is enough; the queue stays short so faces never lag far behind the taps.
  if (waiting.length < 8) waiting.push({ nickname, avatar });
}

// 0 -> 1 -> 0 over the frenzy, with one-second ramps, so the speed change is never a jolt.
function frenzyLevel(): number {
  if (frenzy <= 0) return 0;
  return Math.min(1, FRENZY_TIME - frenzy, frenzy);
}

/** Speed factor for the snakes' steps. */
export function tempo(): number {
  return 1 + TEMPO_MAX * energy + FRENZY_TEMPO * frenzyLevel();
}

/** The highest tempo reachable within the next second, for hazard warnings. */
export function tempoCeiling(): number {
  return cooldown <= 0 && energy > FRENZY_AT - 0.1 ? 1 + TEMPO_MAX + FRENZY_TEMPO : tempo() + 0.02;
}

export const inFrenzy = (): boolean => frenzy > 0;

/**
 * Advances the bar. Returns 'start' on the frame a frenzy begins, 'drop' when a frenzy berry is
 * due, otherwise null. Outside a round a frenzy stops at once.
 */
export function updateEnergy(dt: number, playing: boolean): 'start' | 'drop' | null {
  playingNow = playing;
  pool *= Math.pow(0.5, dt / POOL_HALF_LIFE);
  const target = Math.min(cooldown > 0 ? 0.9 : 1, 1 - Math.exp(-pool / POOL_SCALE));
  energy += Math.max(-EASE * dt, Math.min(EASE * dt, target - energy));
  shown += (energy - shown) * Math.min(1, dt * 6);
  beat = Math.max(0, beat - dt * 3);
  quiet += dt;
  nextFlyer -= dt;
  const who = waiting[0];
  if (who && nextFlyer <= 0 && flyers.length < MAX_FLYERS) {
    waiting.shift();
    nextFlyer = FLY_EVERY;
    // Spread along the bottom by the golden ratio, not Math.random: the game's seeded draws stay
    // untouched by what the crowd looks like.
    flyerSeq++;
    const spread = (flyerSeq * 0.618034) % 1;
    flyers.push({
      age: 0,
      sx: 0.15 + spread * 0.7,
      bend: ((flyerSeq * 0.414214) % 1) * 2 - 1,
      who,
    });
  }
  for (const f of flyers) {
    f.age += dt;
    if (f.age >= FLY_TIME) beat = 1;
  }
  flyers = flyers.filter((f) => f.age < FLY_TIME);
  if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
  if (!playing) {
    frenzy = 0;
    return null;
  }
  if (frenzy > 0) {
    frenzy = Math.max(0, frenzy - dt);
    drop -= dt;
    if (drop <= 0 && frenzy > 1) {
      drop = FRENZY_BERRY_EVERY;
      return 'drop';
    }
    return null;
  }
  if (cooldown <= 0 && energy >= FRENZY_AT) {
    frenzy = FRENZY_TIME;
    cooldown = FRENZY_TIME + COOLDOWN;
    drop = 0.6;
    return 'start';
  }
  return null;
}

/** For tests and a fresh session. */
export function resetEnergy(): void {
  pool = energy = frenzy = cooldown = drop = shown = nextFlyer = beat = quiet = 0;
  waiting = [];
  flyers = [];
}

// TikTok's like color, and the welcome green of the frenzy berries.
const PINK = '254,44,85';
const GREEN = '134,204,112';
const PILL_W = 330,
  PILL_H = 48,
  ORB_R = 32;
// After this long without a like, a big hand invites the room to double tap, a few seconds at a
// time so it never sits on the board.
const QUIET_AFTER = 6,
  HINT_EVERY = 12,
  HINT_SHOWN = 4;

// A pointing hand in the classic "touch" icon shape (24-unit grid, fingertip near (11.5, 6)).
const HAND_PATH =
  'M18.84 15.87l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5' +
  'v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94' +
  'c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2' +
  ' 0-.62-.38-1.16-.91-1.41z';
let hand: Path2D | null = null;
// Built on first use: the test environment has no Path2D, and never paints the hand.
function handPath(): Path2D | null {
  if (typeof Path2D === 'undefined') return null;
  return (hand ??= new Path2D(HAND_PATH));
}

// Two quick presses every 2.4 s: 0 at rest, 1 at the bottom of a press.
function doubleTap(now: number): number {
  const ph = now % 2.4;
  return Math.max(0, 1 - Math.abs(ph - 0.1) / 0.1, 1 - Math.abs(ph - 0.35) / 0.1);
}

// Speed chevrons in the pill: as many light up as the likes are worth, and a shimmer runs through
// them faster as the snakes speed up. Green during a frenzy, dim while recharging.
const CHEVRONS = 6;

function paintChevrons(
  c: CanvasRenderingContext2D,
  x: number,
  cy: number,
  fill: number,
  cooling: boolean,
  now: number,
): void {
  const lit = fill * CHEVRONS,
    color = frenzy > 0 ? GREEN : PINK,
    wave = (now * (1.5 + 4 * fill)) % (CHEVRONS + 2);
  c.lineWidth = 6;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (let k = 0; k < CHEVRONS; k++) {
    const on = Math.max(0, Math.min(1, lit - k)),
      shine = on > 0 && !cooling ? Math.max(0, 1 - Math.abs(wave - 1 - k)) : 0,
      cx = x + k * 30;
    // Lit chevrons in the team-free like color, flashing white as the shimmer passes.
    c.strokeStyle =
      on <= 0
        ? 'rgba(255,255,255,0.13)'
        : shine > 0.3
          ? `rgba(255,255,255,${String(shine)})`
          : `rgba(${color},${String(cooling ? 0.4 : 0.55 + 0.45 * on)})`;
    c.beginPath();
    c.moveTo(cx - 6, cy - 11);
    c.lineTo(cx + 6, cy);
    c.lineTo(cx - 6, cy + 11);
    c.stroke();
  }
  const pct = Math.round(TEMPO_MAX * energy * 100 + FRENZY_TEMPO * frenzyLevel() * 100);
  c.font = '900 22px system-ui, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = pct > 0 ? `rgb(${color})` : 'rgba(255,255,255,0.35)';
  c.fillText(`+${String(pct)}%`, x + CHEVRONS * 30 + 2, cy + 1);
}

function paintFace(c: CanvasRenderingContext2D, who: Liker, x: number, y: number, r: number): void {
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.clip();
  c.drawImage(getAvatar(who.avatar, who.nickname), x - r, y - r, r * 2, r * 2);
  c.restore();
  c.strokeStyle = `rgb(${PINK})`;
  c.lineWidth = 2.5;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
}

// When likes have gone quiet, a big hand taps the orb itself: the gesture and its target in one
// picture, no words.
function paintHint(c: CanvasRenderingContext2D, ox: number, oy: number, now: number): void {
  if (!playingNow || frenzy > 0 || quiet < QUIET_AFTER) return;
  const ph = (quiet - QUIET_AFTER) % HINT_EVERY;
  if (ph > HINT_SHOWN) return;
  const a = Math.min(1, ph / 0.4, (HINT_SHOWN - ph) / 0.4),
    s = 3.4,
    tapPh = now % 2.4;
  c.save();
  c.strokeStyle = `rgb(${PINK})`;
  c.lineWidth = 4;
  for (const at of [0.1, 0.35]) {
    const q = (tapPh - at) / 0.7;
    if (q <= 0 || q >= 1) continue;
    c.globalAlpha = a * (1 - q);
    c.beginPath();
    c.arc(ox, oy, ORB_R + 10 + 50 * q, 0, Math.PI * 2);
    c.stroke();
  }
  c.globalAlpha = a;
  c.translate(ox - 11.5 * s, oy - 6 * s + 8 * doubleTap(now) - 8);
  c.scale(s, s);
  c.lineJoin = 'round';
  c.shadowColor = 'rgba(0,0,0,0.6)';
  c.shadowBlur = 6;
  c.strokeStyle = `rgb(${PINK})`;
  c.lineWidth = 1.4;
  const path = handPath();
  if (path) {
    c.stroke(path);
    c.fillStyle = '#fff';
    c.fill(path);
  }
  c.restore();
}

/**
 * The like orb under the score plate: likers' faces fly into it, a ring around it shows how full
 * it is, and the pill next to it says what the taps do. When likes go quiet, a big hand on the
 * board invites the room to double tap.
 */
export function paintEnergy(): void {
  const c = ctx as CanvasRenderingContext2D | null;
  if (!c) return;
  const now = performance.now() / 1000,
    f = frenzyLevel(),
    cooling = cooldown > 0 && frenzy <= 0,
    fill = frenzy > 0 ? 1 : shown,
    px = W / 2 - PILL_W / 2,
    cy = SC_CY + 60,
    ox = px + 8,
    oy = cy;
  c.save();
  c.fillStyle = 'rgba(6,11,8,0.55)';
  c.beginPath();
  c.roundRect(px, cy - PILL_H / 2, PILL_W, PILL_H, PILL_H / 2);
  c.fill();
  paintChevrons(c, ox + ORB_R + 36, cy, fill, cooling, now);

  // The orb: a dark socket, a ring that fills with the likes, a pink core that swells with them.
  c.fillStyle = 'rgba(6,11,8,0.85)';
  c.beginPath();
  c.arc(ox, oy, ORB_R + 8, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = 5;
  c.strokeStyle = 'rgba(255,255,255,0.14)';
  c.beginPath();
  c.arc(ox, oy, ORB_R + 3, 0, Math.PI * 2);
  c.stroke();
  const ringColor = frenzy > 0 ? GREEN : PINK;
  c.globalAlpha = cooling ? 0.45 : 1;
  if (fill > 0.005) {
    c.strokeStyle = `rgb(${ringColor})`;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(ox, oy, ORB_R + 3, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2);
    c.stroke();
  }
  const r = (10 + 17 * fill) * (1 + 0.18 * beat + 0.08 * f * Math.sin(now * 10));
  const g = c.createRadialGradient(ox - r * 0.35, oy - r * 0.35, r * 0.1, ox, oy, r);
  g.addColorStop(0, 'rgba(255,190,210,1)');
  g.addColorStop(1, `rgba(${ringColor},1)`);
  if (f > 0 || beat > 0) {
    c.shadowColor = `rgba(${ringColor},0.9)`;
    c.shadowBlur = 16 * Math.max(beat, f);
  }
  c.fillStyle = g;
  c.beginPath();
  c.arc(ox, oy, r, 0, Math.PI * 2);
  c.fill();
  c.restore();

  paintHint(c, ox, oy, now);

  // Faces on their way in, from the bottom of the screen along a gentle curve.
  c.save();
  for (const fl of flyers) {
    const p = fl.age / FLY_TIME,
      e = p * p * (3 - 2 * p),
      sx = W * fl.sx,
      sy = H - 280,
      mx = (sx + ox) / 2 + fl.bend * 220,
      my = Math.min(sy, oy) + 60,
      x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * ox,
      y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * oy;
    c.globalAlpha = Math.min(1, p / 0.15) * (p > 0.85 ? (1 - p) / 0.15 : 1);
    paintFace(c, fl.who, x, y, 30 - 14 * e);
  }
  c.restore();
}
