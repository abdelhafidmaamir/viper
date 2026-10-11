// Snake Arena: around the board. The ring as the clock (Feed's ring, full at the start of each
// step and emptying with its time, the time left in a pill at its top, which says QUALIFYING
// during the qualifying), the beach (during the qualifying the newest likers' animals; during the
// battle the players' animals on a podium of sand, each with its flag and its boost ring), the
// likes' hearts popping on the qualifying board, and a picture flying to the new egg a life gives.

import { ctx } from '../engine/canvas.ts';
import { tr } from '../engine/i18n.ts';
import { GOLD } from '../engine/palette.ts';
import { paintRing } from '../feed/hud.ts';
import { BOARD_W, FX0, FY0 } from '../feed/grid.ts';
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
import { COLOURS, crownColour, likesRing, speedStreaks } from './board-paint.ts';
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
import { QUALIFY, actors, badgeOf, challengers, qualLeft, qualifying, seatOf } from './qualify.ts';
import { TUNING, alive, arena, places } from './rules.ts';

const smooth = (v: number): number => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};

/** "1:42" */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/** The clock of the step on screen: the qualifying's, or the battle's. */
function clockNow(): { left: number; length: number; urgent: boolean } | null {
  if (qualifying()) {
    const left = qualLeft();
    return { left, length: QUALIFY.time, urgent: left <= 5 };
  }
  if (arena.phase !== 'play' && arena.phase !== 'ready') return null;
  const left = Math.max(0, TUNING.roundTime - arena.time);
  return { left, length: TUNING.roundTime, urgent: left <= 20 && arena.phase === 'play' };
}

/** Feed's ring as the clock: full when the step starts, empty at 0:00. */
export function paintArenaRing(t: number): void {
  const clock = clockNow();
  paintRing(
    t,
    clock ? clock.left / clock.length : 0,
    clock?.urgent ?? false,
    qualifying() ? undefined : (crownColour() ?? undefined),
    // Twice Feed's width: on a phone Feed's rail is barely more than a pixel.
    2,
  );
}

/**
 * The time left in a pill at the ring's top centre, painted after the flower, which reaches over
 * it. In the qualifying it reads "QUALIFYING  0:24", a little larger, and beats once a second in
 * gold through the last five: the only word on the qualifying's screen.
 */
export function paintArenaTime(): void {
  const clock = clockNow();
  if (!clock) return;
  const q = qualifying(),
    c = ctx,
    x = FX0 + BOARD_W / 2,
    y = FY0 - 30,
    time = clockText(clock.left),
    word = q ? tr('arena.qualifying') : '',
    beat = q && clock.urgent && clock.left > 0 ? 1 - (clock.left % 1) : 0,
    pop = 1 + 0.14 * Math.max(0, 1 - beat * 4),
    size = q ? 44 : 40,
    h = q ? 60 : 52;
  c.save();
  c.translate(x, y);
  if (beat > 0) c.scale(pop, pop);
  c.font = `900 ${String(size)}px ${FONT}`;
  c.textBaseline = 'middle';
  const gap = word ? 22 : 0,
    ww = word ? c.measureText(word).width : 0,
    tw = c.measureText(time).width,
    w = ww + gap + tw + 36;
  c.fillStyle = 'rgba(8,12,10,0.8)';
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, h / 2);
  c.fill();
  c.textAlign = 'left';
  if (word) {
    c.fillStyle = '#fff';
    c.fillText(word, -w / 2 + 18, 2);
  }
  c.fillStyle = clock.urgent ? GOLD : '#fff';
  c.fillText(time, -w / 2 + 18 + ww + gap, 2);
  c.restore();
}

/** A picture's radius at full size. */
const PHOTO = 39;
/** The players' order on the beach: the board's. */
let ranking: string[] = [];
/** Seconds of a crab's move to its new place, eased. */
const MOVE = 0.6;

/**
 * The podium on the sand during the battle: three mounds, the 1st's in the middle and highest,
 * the 2nd's on its left lower, the 3rd's on its right lower still; the other players stand at
 * ground level beside it. In the qualifying the mounds flatten into the beach.
 */
const MOUNDS = [70, 46, 30];
/** The podium stands at the beach's right end: `x3` is the 3rd's spot, the rightmost. */
const podium = { k: 0, at: -1, x3: 0, u: 0, scale: 1, crownY: -1 };

/**
 * Where the player ranked `r` (0 the first) stands: the 1st in the podium's middle, the 2nd on
 * its left, the 3rd on its right; the others at ground level on the podium's left, the 4th
 * nearest.
 */
function podiumX(r: number): number {
  const { x3, u } = podium;
  return r === 0 ? x3 - u : r === 1 ? x3 - 2 * u : r === 2 ? x3 : x3 - (r + 0.4) * u;
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
  const w = podium.u * 0.62;
  paintSand(podiumX(1) - w - 8, podiumX(2) + w + 8, beachLine(rise) - 4, podiumHeight);
}

/**
 * The sleeping crab lies above the board, top right beside the flower, on a small patch of the
 * beach's sand so it never floats on the sky: `x` its middle, `y` the line its shadow lies on.
 */
export const SLEEPER_SPOT = { x: 958, y: 256 };
export function paintSleeperSand(): void {
  const { x, y } = SLEEPER_SPOT,
    half = 96;
  paintSand(x - half, x + half, y + 4, (px) => {
    const v = Math.abs(px - x) / half;
    return v < 1 ? 16 * (0.5 + 0.5 * Math.cos(Math.PI * v)) + 6 * (1 - v) : 0;
  });
}

/**
 * The beach on Feed's ground line, laid out each frame, clear of the sleeping crabs on the right.
 * During the qualifying, the newest likers without a picture on the board, in the order they came
 * up from the sand. Otherwise one animal per viewer's snake on the podium: the biggest on the
 * highest mound, crowned, the 2nd and 3rd on the lower ones, the others beside it at ground level,
 * each with a flag of its snake's colour; one change of rank a second at most, eased; a fallen
 * player's animal buries itself where it stands.
 */
export function layOutBeach(): void {
  // The sleeper lies above the board (main.ts): the beach is all the animals'.
  const margin = 70,
    right = Math.min(W - 70, sleepersFrom()),
    width = right - margin,
    spots: CrabSpot[] = [];
  raisePodium();
  podium.u = width / (Math.max(3, places()) + 0.4);
  podium.x3 = right - podium.u / 2;
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
    const unit = width / QUEUE.spots,
      scale = Math.max(0.55, Math.min(1, (unit - 10) / (2 * PHOTO)));
    queueOrder()
      .filter((n) => !seatOf(n) && !challengers.includes(n))
      .forEach((nickname, i) => {
        spots.push({
          nickname,
          avatar: arena.viewers.get(nickname)?.avatar,
          x: margin + unit / 2 + i * unit,
        });
      });
    setCrabSpots(spots, { scale, lane: 0, step: unit, ...walks });
    return;
  }
  const players = alive()
      .filter((s) => !s.wild)
      .sort((p, q) => p.id - q.id),
    unit = podium.u,
    scale = Math.max(0.55, Math.min(1, (unit - 10) / (2 * PHOTO)));
  podium.scale = scale;
  // The players stand in the board's order: the crowned snake on the 1st mound, then the others,
  // the biggest first (ties keep their places). The animals ease to their new places.
  ranking = ranking.filter((n) => players.some((s) => s.nickname === n));
  for (const s of players) if (!ranking.includes(s.nickname)) ranking.push(s.nickname);
  const lenOf = (n: string): number => players.find((s) => s.nickname === n)?.len ?? 0,
    crowned = players.find((s) => s.id === arena.crown)?.nickname,
    was = [...ranking];
  ranking.sort(
    (p, q) =>
      Number(q === crowned) - Number(p === crowned) ||
      Math.floor(lenOf(q)) - Math.floor(lenOf(p)) ||
      was.indexOf(p) - was.indexOf(q),
  );
  ranking.forEach((nickname, i) => {
    const s = players.find((p) => p.nickname === nickname);
    if (!s) return;
    spots.push({
      nickname,
      avatar: s.avatar,
      x: podiumX(i),
      ring: COLOURS[s.colour],
    });
  });
  setCrabSpots(spots, { scale, lane: 0, step: unit, ...walks });
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
  ctx.globalAlpha = Math.min(1, (podium.k - 0.5) * 2);
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
 * colour, and the ring starts again from what was left over. The sleepers' hearts carry the same
 * streaks: a like is speed.
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
  }
  for (const h of sleeperHearts()) speedStreaks(h.x - 42, h.y, 0, '#ffffff', 0.55, t, 26);
}

/**
 * Each like on the qualifying board: the prod heart pops on the liker's badge, rises a little and
 * fades; a burst of likes pops one bigger heart. On the beach the animals show their own hearts.
 */
export function paintLikePops(): void {
  if (!qualifying()) return;
  const c = ctx,
    sprite = bigHeart(true);
  for (const h of likePops) {
    const a = actors.get(h.nickname);
    if (!a || a.leaving) continue;
    const at = badgeOf(a),
      u = h.t / POP_TIME,
      grow = Math.min(1, u / 0.25),
      big = 1 + Math.min(0.8, Math.log10(Math.max(1, h.n)) * 0.4),
      size = 30 * big * (0.6 + 0.4 * smooth(grow)),
      y = at.y - 28 - 34 * smooth(u);
    c.save();
    c.globalAlpha = 1 - smooth((u - 0.5) / 0.5);
    c.drawImage(sprite, at.x - size / 2, y - size / 2, size, size);
    c.restore();
  }
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
