// Snake Arena: around the board. The ring as the clock (Feed's ring, full at the start of each
// step and emptying with its time, the time left in a pill at its top, which says QUALIFYING
// during the qualifying), the beach (during the qualifying the newest likers' animals; during the
// battle the players' animals on a podium of sand, each with its flag and its boost ring), the
// likes' hearts popping on the qualifying board, and a picture flying to the new egg a life gives.

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
  nextSeats,
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
 * step starts, emptying clockwise from the top centre to 0:00, full again at once at the next.
 */
export function paintArenaRing(t: number): void {
  const clock = clockNow(),
    fill = clock ? Math.max(0, Math.min(1, clock.left / clock.length)) : 0,
    urgent = clock?.urgent ?? false,
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
    const glow = urgent ? 0.6 + 0.4 * Math.sin(t * 7) : 0.9;
    c.setLineDash([perim * fill, perim * 2]);
    c.lineDashOffset = 0;
    const g = c.createLinearGradient(x, y + h, x, y);
    g.addColorStop(0, RING_GREEN);
    g.addColorStop(1, GOLD);
    c.strokeStyle = urgent ? `rgba(242,197,124,${String(0.25 * glow)})` : 'rgba(155,226,138,0.18)';
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
 * The time left in a pill at the ring's top centre, painted after the flower, which reaches over
 * it. In the qualifying it reads "QUALIFYING  0:24", smaller than the battle's, and beats once a
 * second in gold through the last five: the only word on the qualifying's screen.
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
    // The battle's pill: the time at 40. The qualifying's is smaller: the word at 24, spaced a
    // little, the time at 30, the pill a tenth lower and as wide as what it holds.
    size = q ? 30 : 40,
    h = q ? 47 : 52,
    pad = q ? 16 : 15;
  c.save();
  c.translate(x, y);
  if (beat > 0) c.scale(pop, pop);
  c.textBaseline = 'middle';
  c.font = `900 24px ${FONT}`;
  c.letterSpacing = '1.5px';
  const ww = word ? c.measureText(word).width : 0;
  c.letterSpacing = '0px';
  c.font = `900 ${String(size)}px ${FONT}`;
  const gap = word ? 12 : 0,
    tw = c.measureText(time).width,
    w = ww + gap + tw + pad * 2;
  c.fillStyle = 'rgba(8,12,10,0.8)';
  c.beginPath();
  c.roundRect(-w / 2, -h / 2, w, h, h / 2);
  c.fill();
  c.textAlign = 'left';
  if (word) {
    c.font = `900 24px ${FONT}`;
    c.letterSpacing = '1.5px';
    c.fillStyle = '#fff';
    c.fillText(word, -w / 2 + pad, 2);
    c.letterSpacing = '0px';
  }
  c.font = `900 ${String(size)}px ${FONT}`;
  c.fillStyle = clock.urgent ? GOLD : '#fff';
  c.fillText(time, -w / 2 + pad + ww + gap, 2);
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
  const extra = qualifying()
    ? 0
    : nextSeats.filter((n) => !alive().some((s) => !s.wild && s.nickname === n)).length;
  podium.u = width / (Math.max(3, places()) + 0.4 + (extra ? extra * 0.8 + 0.4 : 0));
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
      .sort((p, q) => p.id - q.id),
    // Next round's: battle givers without a snake, in a small group on the left.
    waiting = nextSeats.filter((n) => !players.some((s) => s.nickname === n)),
    unit = podium.u,
    scale = Math.max(0.55, Math.min(1, (unit - 10) / (2 * PHOTO)));
  waiting.forEach((nickname, i) => {
    spots.push({
      nickname,
      avatar: arena.viewers.get(nickname)?.avatar,
      x: margin + unit * 0.5 + i * unit * 0.8,
      ring: GOLD,
    });
  });
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
      // A gift in this battle: next round's seat is theirs, the outline says it.
      ring: nextSeats.includes(nickname) ? GOLD : COLOURS[s.colour],
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
