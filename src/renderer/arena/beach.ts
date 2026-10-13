// Snake Arena: around the board. The ring as the clock (Feed's ring, full at the start of each
// step and emptying with its time, no digits; a pill at its top says QUALIFYING during the
// qualifying), the beach (during the qualifying the newest likers' animals; during the
// battle the players' animals on a podium of sand, each with its flag and its boost ring), the
// likes' hearts popping round the pictures on the qualifying board, and a picture flying to the new
// egg a life gives.

import { ctx } from '../engine/canvas.ts';
import { tr } from '../engine/i18n.ts';
import { GOLD, berryTint } from '../engine/palette.ts';
import { BOARD_H, BOARD_W, FX0, FY0 } from '../feed/grid.ts';
import { FONT, crown, paintFace } from '../feed/paint.ts';
import {
  beachLine,
  crabFaces,
  setCrabSpots,
  setSleeperPool,
  sleeperHearts,
  sleepersFrom,
  type CrabSpot,
} from '../feed/crabs.ts';
import { W } from '../engine/layout.ts';
import {
  BOLT,
  COLOURS,
  crownColour,
  likesRing,
  paintBolt,
  paintBoostBolt,
  paintStillEgg,
  speedStreaks,
} from './board-paint.ts';
import {
  BOOST,
  FLIGHT,
  POP_TIME,
  QUEUE,
  fired,
  flights,
  likePops,
  queueOrder,
  rings,
} from './entry.ts';
import { bigHeart } from '../feed/alert-fx.ts';
import { QUALIFY, actors, challengers, qualLeft, qualifying, seatOf } from './qualify.ts';
import { TUNING, alive, arena } from './rules.ts';

const smooth = (v: number): number => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};

/**
 * The clock of the step on screen: the qualifying's or the battle's, calm to the end. Only the
 * ring round the board shows it, emptying: no digits, no beat, no change of colour near the end.
 */
function clockNow(): { left: number; length: number } | null {
  if (qualifying()) return { left: qualLeft(), length: QUALIFY.time };
  if (arena.phase !== 'play' && arena.phase !== 'ready') return null;
  return { left: Math.max(0, TUNING.roundTime - arena.time), length: TUNING.roundTime };
}

/**
 * The rounded frame round the board as one path that starts at its top centre and runs
 * clockwise back to it, so a dash from 0 covers exactly the share asked, from the top centre.
 * (Feed's paintRing traces the prod roundRect, which starts at the top left corner: offset to the
 * top centre, its dash never covers the stretch from that corner to the centre, and the clock
 * looked stuck for the first eighth of every step.)
 */
function frame(x: number, y: number, w: number, h: number, r: number): void {
  const c = ctx;
  c.beginPath();
  c.moveTo(x + w / 2, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * Feed's ring as the clock, in its colours, twice its width (read on a phone): full when the
 * step starts, emptying clockwise from the top centre to 0:00, full again at once at the next. The
 * only clock on screen: no digits, and calm to the end.
 */
export function paintArenaRing(): void {
  const clock = clockNow(),
    fill = clock ? Math.max(0, Math.min(1, clock.left / clock.length)) : 0,
    tint = qualifying() ? undefined : (crownColour() ?? undefined),
    c = ctx,
    x = FX0 - 26,
    y = FY0 - 26,
    w = BOARD_W + 52,
    h = BOARD_H + 52,
    r = 30,
    perim = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
  c.save();
  c.lineWidth = 14;
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,255,255,0.1)';
  frame(x, y, w, h, r);
  c.stroke();
  if (fill > 0.001) {
    c.setLineDash([perim * fill, perim * 2]);
    c.lineDashOffset = 0;
    const g = c.createLinearGradient(x, y + h, x, y);
    g.addColorStop(0, RING_GREEN);
    g.addColorStop(1, GOLD);
    c.strokeStyle = 'rgba(155,226,138,0.18)';
    c.lineWidth = 34;
    frame(x, y, w, h, r);
    c.stroke();
    c.strokeStyle = tint ?? g;
    c.lineWidth = 14;
    c.stroke();
  }
  c.restore();
}
const RING_GREEN = berryTint(null);

/**
 * The word QUALIFYING in a pill at the ring's top centre during the qualifying, painted after the
 * flower, which reaches over it: the only word on the qualifying's screen. No time in it, and no
 * pill at all in the battle: the ring round the board alone shows the time left, emptying calmly.
 */
export function paintArenaTime(): void {
  if (!qualifying()) return;
  const c = ctx,
    word = tr('arena.qualifying'),
    // The word at 24, spaced a little, in a pill as wide as what it holds.
    h = 47,
    pad = 16;
  c.save();
  c.translate(FX0 + BOARD_W / 2, FY0 - 30);
  c.textBaseline = 'middle';
  c.font = `900 24px ${FONT}`;
  c.letterSpacing = '1.5px';
  const w = c.measureText(word).width + pad * 2;
  c.fillStyle = 'rgba(8,12,10,0.8)';
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, h / 2);
  c.fill();
  c.textAlign = 'left';
  c.fillStyle = '#fff';
  c.fillText(word, -w / 2 + pad, 2);
  c.letterSpacing = '0px';
  c.restore();
}

/** A picture's radius at full size. */
const PHOTO = 39;
/** The players' order on the beach: the board's, changing at most once every RANK_GAP seconds. */
let ranking: string[] = [];
let rankedAt = -Infinity;
const RANK_GAP = 1;
/** Seconds of a crab's move to its new place, eased. */
const MOVE = 0.6;

/**
 * The podium on the sand during the battle, at the beach's right end: three mounds, the 1st's on
 * the right and highest, the 2nd's in the middle lower, the 3rd's on its left lower still; the
 * other players stand at ground level on the podium's left, the ranking going on right to left.
 * In the qualifying the mounds flatten into the beach.
 */
const MOUNDS = [70, 46, 30];
/** `x1` is the 1st's spot, the rightmost; `u` the space from one place to the next. */
const podium = { k: 0, at: -1, x1: 0, u: 0, scale: 1, crownY: -1 };
/**
 * The podium's measures, in pixels at full size: an animal's width, claws out; the room its flag
 * takes on the right of its picture; the space between two animals; the screen's right edge kept
 * clear. TikTok's comments cover the screen's lower left up to about COMMENTS of its width: the
 * 1st and 2nd stand right of it, the others may go under it.
 */
const CRAB_W = 112,
  FLAG = 1.8 * PHOTO,
  SPACE = 12,
  EDGE = 14,
  COMMENTS = 0.81,
  /** Ground between the podium's 3rd and the 4th, in places. */
  STEP_DOWN = 0.4;

/**
 * Where the player ranked `r` (0 the first) stands: the 1st on the right, the 2nd in the middle,
 * the 3rd on its left; the others at ground level further left, the 4th nearest.
 */
function podiumX(r: number): number {
  const { x1, u } = podium;
  return r < 3 ? x1 - r * u : x1 - (r + STEP_DOWN) * u;
}

/**
 * The podium's size for `n` players on the beach from `left` to `right`: as big as it can be (at
 * most full size) with half the 2nd's picture right of the comments, every animal on the beach
 * and no two touching.
 */
export function podiumFor(
  n: number,
  left: number,
  right: number,
): { x1: number; u: number; scale: number; width: number } {
  const far = Math.max(3, n) - 1 + STEP_DOWN,
    // The 1st's flag stays on screen; the 2nd stands right of the comments, half its picture clear.
    second = (right - EDGE - SPACE - COMMENTS * W) / (FLAG + CRAB_W + PHOTO / 2),
    // The last one's claws stay on the beach.
    all = (right - EDGE - left - SPACE * far) / (FLAG + CRAB_W * far + CRAB_W / 2),
    scale = Math.max(0.55, Math.min(1, second, all)),
    u = CRAB_W * scale + SPACE;
  return { x1: right - EDGE - FLAG * scale, u, scale, width: CRAB_W * scale };
}

/** Height of the podium's sand at x, above the crabs' line. */
function podiumHeight(x: number): number {
  if (podium.k <= 0.001) return 0;
  const w = podium.u * 0.62;
  let h = 0;
  MOUNDS.forEach((top, r) => {
    const v = Math.abs(x - podiumX(r)) / w,
      f = v < 0.4 ? 1 : v < 1 ? 0.5 + 0.5 * Math.cos((Math.PI * (v - 0.4)) / 0.6) : 0;
    h = Math.max(h, top * f);
  });
  return h * podium.k;
}

/** The podium rises for the battle and flattens for the qualifying, eased. */
function raisePodium(): void {
  const dt = podium.at < 0 ? 0 : Math.min(0.1, Math.max(0, arena.clock - podium.at));
  podium.at = arena.clock;
  const want = qualifying() ? 0 : 1;
  podium.k += Math.sign(want - podium.k) * Math.min(Math.abs(want - podium.k), dt / 0.8);
}

/**
 * Raised sand in the beach's own colours and grain, with a soft shadow and a sunlit rim: between
 * `from` and `to`, `height(x)` above the line `base`.
 */
function paintSand(from: number, to: number, base: number, height: (x: number) => number): void {
  const c = ctx,
    top = (x: number): number => base - height(x);
  let peak = 0;
  for (let x = from; x <= to; x += 8) peak = Math.max(peak, height(x));
  const trace = (): void => {
    c.beginPath();
    c.moveTo(from, base + 26);
    for (let x = from; x <= to; x += 4) c.lineTo(x, top(x));
    c.lineTo(to, base + 26);
    c.closePath();
  };
  c.save();
  // A soft shadow round the raised sand.
  c.shadowColor = 'rgba(70,48,24,0.35)';
  c.shadowBlur = 16;
  c.shadowOffsetY = 5;
  const fill = c.createLinearGradient(0, base - peak, 0, base + 26);
  fill.addColorStop(0, 'rgba(240,221,172,1)');
  fill.addColorStop(0.75, 'rgba(222,198,146,1)');
  fill.addColorStop(1, 'rgba(222,198,146,0)');
  c.fillStyle = fill;
  trace();
  c.fill();
  c.restore();
  // The grain, as on the beach: fine darker specks.
  c.save();
  trace();
  c.clip();
  c.fillStyle = 'rgba(150,118,76,0.35)';
  const n = Math.round((to - from) / 6);
  for (let i = 0; i < n; i++) {
    const v = Math.sin(i * 12.9898) * 43758.5453,
      fx = v - Math.floor(v),
      g = Math.sin(i * 78.233) * 12543.21,
      fy = g - Math.floor(g),
      x = from + fx * (to - from),
      y = top(x) + 3 + fy * (base + 20 - top(x));
    c.fillRect(x, y, 1.6, 1.6);
  }
  c.restore();
  // The sunlit rim along the crest.
  c.save();
  c.strokeStyle = 'rgba(255,248,226,0.85)';
  c.lineWidth = 2.5;
  c.beginPath();
  let on = false;
  for (let x = from; x <= to; x += 4) {
    const up = height(x) > 3;
    if (up && !on) c.moveTo(x, top(x));
    else if (up) c.lineTo(x, top(x));
    on = up;
  }
  c.stroke();
  c.restore();
}

/** The mounds of the podium, painted on the beach before the crabs that stand on them. */
export function paintPodium(rise: number): void {
  if (podium.k <= 0.01 || podium.u <= 0) return;
  const w = podium.u * 0.62,
    base = beachLine(rise) - 4;
  paintSand(podiumX(2) - w - 8, podiumX(0) + w + 8, base, podiumHeight);
}

/**
 * The sleeping crab lies above the board, top right beside the flower, centred on the flower's
 * band, at a size where its face reads on a phone (photo radius 41): `x` its middle, `y` the line
 * its shadow lies on, `scale` its size there. Measured on a frame: the closed flower stands from
 * 113 to 211 units (98 tall); the sleeper with its picture and heart is 182 units tall at full
 * size, its photo radius 39, so it cannot be both as tall as the flower and readable.
 */
export const SLEEPER_SPOT = { x: 966, y: 263, scale: 1.05 };

/**
 * The beach on Feed's ground line, laid out each frame, clear of the sleeping crabs on the right.
 * During the qualifying, the newest likers without a picture on the board, in the order they came
 * up from the sand. Otherwise one animal per viewer's snake on the podium: the biggest on the
 * highest mound on the right, crowned, the 2nd and 3rd on the lower ones to its left, the others
 * further left at ground level, each with a flag of its snake's colour; one change of rank a
 * second at most, eased; a fallen player's animal buries itself where it stands.
 */
export function layOutBeach(): void {
  // The sleeper lies above the board (main.ts): the beach is all the animals'.
  const margin = 70,
    right = Math.min(W - 70, sleepersFrom()),
    width = right - margin,
    spots: CrabSpot[] = [];
  raisePodium();
  // In the battle the sleepers show the players who have not liked lately: a like is speed.
  setSleeperPool(
    qualifying()
      ? null
      : alive()
          .filter((s) => !s.wild)
          .map((s) => s.nickname),
  );
  const walks = { ease: MOVE, ground: podiumHeight };
  if (qualifying()) {
    // One compact group, evenly spaced (a picture's width between two), centred on the beach;
    // as animals come and go the others ease together, no gap left open.
    const unit = Math.min(width / QUEUE.spots, 3 * PHOTO),
      scale = Math.max(0.55, Math.min(1, unit / (3 * PHOTO))),
      names = queueOrder().filter((n) => !seatOf(n) && !challengers.includes(n)),
      from = (margin + right) / 2 - ((names.length - 1) * unit) / 2;
    names.forEach((nickname, i) => {
      spots.push({
        nickname,
        avatar: arena.viewers.get(nickname)?.avatar,
        x: from + i * unit,
      });
    });
    setCrabSpots(spots, { scale, lane: 0, step: unit, ...walks });
    return;
  }
  const players = alive()
    .filter((s) => !s.wild)
    .sort((p, q) => p.id - q.id);
  const size = podiumFor(players.length, 20, Math.min(W, sleepersFrom()));
  podium.x1 = size.x1;
  podium.u = size.u;
  podium.scale = size.scale;
  // The players stand in the board's order: the crowned snake on the 1st mound, then the others,
  // the biggest first (ties keep their places), re-sorted at most once a second. The animals
  // ease to their new places.
  ranking = ranking.filter((n) => players.some((s) => s.nickname === n));
  for (const s of players) if (!ranking.includes(s.nickname)) ranking.push(s.nickname);
  const lenOf = (n: string): number => players.find((s) => s.nickname === n)?.len ?? 0,
    crowned = players.find((s) => s.id === arena.crown)?.nickname,
    sorted = [...ranking].sort(
      (p, q) =>
        Number(q === crowned) - Number(p === crowned) ||
        Math.floor(lenOf(q)) - Math.floor(lenOf(p)) ||
        ranking.indexOf(p) - ranking.indexOf(q),
    );
  if (sorted.join() !== ranking.join() && arena.clock - rankedAt >= RANK_GAP) {
    ranking = sorted;
    rankedAt = arena.clock;
  }
  ranking.forEach((nickname, i) => {
    const s = players.find((p) => p.nickname === nickname);
    if (!s) return;
    spots.push({ nickname, avatar: s.avatar, x: podiumX(i), ring: COLOURS[s.colour] });
  });
  setCrabSpots(spots, { scale: podium.scale, lane: 0, step: podium.u, ...walks });
}

/**
 * The crown belongs to the 1st mound, not to an animal: it stays above its top while the animals
 * slide from mound to mound; whoever stands on the 1st is under it.
 */
export function paintPodiumCrown(t: number): void {
  if (qualifying() || podium.k < 0.5) return;
  const x = podiumX(0),
    first = ranking[0],
    f = first ? crabFaces().get(first) : undefined;
  // Its height is read once an animal stands there, and kept.
  if (f && Math.abs(f.x - x) < 6) podium.crownY = f.y - f.r * 0.95;
  if (podium.crownY < 0) return;
  const r = PHOTO * podium.scale;
  ctx.save();
  // Dimmed until a snake wears it (nobody does at GO: they are all equal).
  ctx.globalAlpha = Math.min(1, (podium.k - 0.5) * 2) * (arena.crown < 0 ? 0.35 : 1);
  crown(x, podium.crownY - 14 + Math.sin(t * 3) * 1.5, 1.33 * podium.scale, {
    x,
    y: podium.crownY + r,
    r,
  });
  ctx.restore();
}

/** A player's flag: a small pennant in their snake's colour, held up beside the picture. */
export function paintFlags(t: number): void {
  const c = ctx;
  for (const s of alive()) {
    if (s.wild) continue;
    const f = crabFaces().get(s.nickname);
    if (!f) continue;
    const x = f.x + f.r * 0.95,
      top = f.y - f.r * 1.5,
      wave = Math.sin(t * 5 + s.id) * 3;
    c.save();
    c.strokeStyle = 'rgba(60,40,20,0.9)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(x, f.y + f.r * 0.6);
    c.lineTo(x, top);
    c.stroke();
    c.fillStyle = COLOURS[s.colour];
    c.beginPath();
    c.moveTo(x, top);
    c.lineTo(x + f.r * 0.85, top + f.r * 0.25 + wave);
    c.lineTo(x, top + f.r * 0.55);
    c.closePath();
    c.fill();
    c.restore();
  }
}

/** An animal's picture is drawn at 28 of its 32 half-size units (crabs.ts paints it so). */
const CRAB_PHOTO = 28 / 32,
  /** Seconds a boost's flash and its run on the spot last. */
  FLASH = 0.45;

/**
 * In the battle, the red ring round each player's animal: their likes toward the next speed
 * boost. When it fills, it flashes, the animal runs on the spot with speed streaks in its snake's
 * colour, a bolt shows over it as long as the boost lasts (the same as on the snake's photo), and
 * the ring starts again from what was left over. The sleeping crab's heart holds a bolt: a like
 * is speed.
 */
export function paintBeachRings(t: number): void {
  if (qualifying()) return;
  const c = ctx;
  for (const s of alive()) {
    if (s.wild) continue;
    const f = crabFaces().get(s.nickname);
    if (!f) continue;
    const r = f.r * CRAB_PHOTO,
      fill = (rings.get(s.nickname) ?? 0) / BOOST.likes,
      since = arena.clock - (fired.get(s.nickname) ?? -Infinity);
    if (fill > 0.005) likesRing(f.x, f.y, r, Math.min(1, fill));
    if (since < FLASH) {
      const u = since / FLASH;
      c.save();
      c.globalAlpha = 1 - u;
      c.strokeStyle = '#fff';
      c.lineWidth = Math.max(3, r * 0.2) * (1 - u * 0.5);
      c.beginPath();
      c.arc(f.x, f.y, r * (1 + 0.35 * u), 0, Math.PI * 2);
      c.stroke();
      c.restore();
      speedStreaks(f.x - r * 0.9, f.y + r * 0.6, 0, COLOURS[s.colour], 1 - u, t, r * 0.7);
    }
    // The same bolt as on the snake's photo, above the animal, for as long as the boost lasts.
    paintBoostBolt(s, f.x + r * 0.75, f.y - r * 1.3, BOLT * 0.9, t);
  }
}

/** 0 in the qualifying (an egg in the sleeper's heart), 1 in the battle (a bolt), eased. */
const heartIcon = { k: 0, at: -1 };

/**
 * The sleeping crab's heart holds what a like does now: a small egg in the qualifying (a like is
 * a seat), the bolt in the battle (a like is speed), one fading into the other at the change.
 */
export function paintSleeperHeart(): void {
  const dt = heartIcon.at < 0 ? 1 : Math.min(0.1, Math.max(0, arena.clock - heartIcon.at)),
    want = qualifying() ? 0 : 1;
  heartIcon.at = arena.clock;
  heartIcon.k += Math.sign(want - heartIcon.k) * Math.min(Math.abs(want - heartIcon.k), dt / 0.5);
  const k = heartIcon.k,
    c = ctx;
  for (const h of sleeperHearts()) {
    if (k > 0.01) paintBolt(h.x, h.y + h.size * 0.02, h.size * 0.5, k);
    if (k < 0.99) {
      c.save();
      c.globalAlpha *= 1 - k;
      c.translate(h.x, h.y + h.size * 0.04);
      c.scale((h.size * 0.5) / EGG_TALL, (h.size * 0.5) / EGG_TALL);
      paintStillEgg(c, 0, 0, arena.clock);
      c.restore();
    }
  }
}
/** The arena's egg is about this tall at its own size (board-paint.ts paintStillEgg). */
const EGG_TALL = 54;

/**
 * Each like on the qualifying board: prod hearts pop round the liker's picture, each leaving its
 * edge at its own angle, rising a little and fading. On the beach the animals show their own hearts.
 */
export function paintLikePops(): void {
  if (!qualifying()) return;
  const c = ctx,
    sprite = bigHeart(true);
  for (const p of likePopSpots()) {
    const u = p.t / POP_TIME,
      size = 30 * (0.6 + 0.4 * smooth(Math.min(1, u / 0.25))),
      { x, y } = p;
    c.save();
    c.globalAlpha = 1 - smooth((u - 0.5) / 0.5);
    c.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    c.restore();
  }
}

interface PopSpot {
  readonly nickname: string;
  readonly x: number;
  readonly y: number;
  readonly t: number;
  /** The centre and radius of the picture it pops round. */
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/**
 * Where each like heart of the qualifying board shows now: from its picture's edge, at its own
 * angle, drifting out and up as it fades.
 */
export function likePopSpots(): PopSpot[] {
  const out: PopSpot[] = [];
  for (const h of likePops) {
    const a = actors.get(h.nickname);
    if (!a || a.leaving || h.t < 0) continue;
    const u = smooth(h.t / POP_TIME),
      edge = a.r + 10 + 14 * u;
    out.push({
      nickname: h.nickname,
      x: a.x + Math.cos(h.angle) * edge,
      y: a.y + Math.sin(h.angle) * edge - 30 * u,
      t: h.t,
      cx: a.x,
      cy: a.y,
      r: a.r,
    });
  }
  return out;
}

/** A life used: the picture flies from where its snake fell to the new egg. */
export function paintFlights(): void {
  for (const f of flights) {
    const u = smooth(f.t / FLIGHT),
      x = f.x + (f.tx - f.x) * u,
      y = f.y + (f.ty - f.y) * u - Math.sin(u * Math.PI) * 120,
      r = 45 - 20 * u;
    paintFace(f, x, y, r, GOLD);
  }
}
