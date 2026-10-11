// Snake Arena: what lives on the board. Feed's berries on their cells (falling from the flower for
// a gift, in the giver's colour), every snake painted by Feed's own code, and over each viewer's
// head what Feed shows for its leader: the photo floating above the head on its stem, the crown on
// the biggest, plus the red likes ring round the photo and the name under it.
//
// Each body is a prod Body (path.ts): its trace comes from paint.snakeTrace, its skin from
// paint.paintScales in its own colour and skin, and the stroke from the ambience's paintSnake at
// Feed's fat scale, exactly as Feed paints its one snake. paint.ts holds one colour at a time, so
// the colour and skin are set before each snake is painted and given back after.

import { SNAKE_COLOURS, type SnakeColour } from '../../shared/feed-protocol.ts';
import { ctx } from '../engine/canvas.ts';
import { GOLD } from '../engine/palette.ts';
import { paintEgg } from '../engine/eggshell.ts';
import { CELL, W } from '../engine/layout.ts';
import { HATCH_TIME } from '../engine/rules.ts';
import type { Ambience, AmbienceFrame } from '../engine/types-api.ts';
import type { Point } from '../engine/types.ts';
import { BOARD_H, BOARD_W, FX0, FY0, K } from '../feed/grid.ts';
import {
  FONT,
  berrySprite,
  crown,
  currentSnakeColour,
  currentSnakeSkin,
  keepScaleSprites,
  paintFace,
  paintScales,
  setSnakeColour,
  setBerryColours,
  setSnakeSkin,
  snakeTint,
  snakeTrace,
  tintedBerrySprite,
} from '../feed/paint.ts';
import { FALL_TIME, game } from '../feed/state.ts';
import { bumps, faceOf, shownName } from './entry.ts';
import { FADE_OUT } from './round.ts';
import { paintBrokenHeart, paintSnakeHearts } from './lives.ts';
import {
  DEATH_TIME,
  TUNING,
  alive,
  arena,
  cellX,
  cellY,
  freeColour,
  options,
  snakeOf,
  toPx,
  type Snake,
} from './rules.ts';

const BERRY_R = 44,
  BERRY_FRAMES = 32,
  RED = '#ff3b5c',
  /** Feed's fat snake: the duel's body drawn 30% thicker than the grid alone would give. */
  FAT = K * 1.3;
/** A player's name under their picture, in game units. */
const NAME_SIZE = 34;
/** The crown holder's picture radius, and its crown's size: the stake, the largest on the board. */
const CROWN_R = 60,
  CROWN_SIZE = 1.8;
/** The stem from the head to the picture, in the snake's colour. */
const STEM = 6;

/** Each colour's hex, read from paint.ts itself. */
export const COLOURS = ((): Record<SnakeColour, string> => {
  const was = currentSnakeColour(),
    out = {} as Record<SnakeColour, string>;
  for (const c of SNAKE_COLOURS) {
    setSnakeColour(c);
    out[c] = snakeTint();
  }
  setSnakeColour(was);
  return out;
})();

// Every colour is painted each frame: paint.ts keeps each colour's chevron sprite once drawn.
keepScaleSprites();

// A paid berry wears its giver's colour wherever Feed's cards draw it (thanks, tray, entrances,
// end screen): their snake's, or the one their snake will get.
setBerryColours((giver) => {
  const colour = snakeOf(giver)?.colour ?? freeColour(giver);
  return colour ? COLOURS[colour] : null;
});

const phaseOf = (t: number): number =>
  ((Math.round(((t * 3.4) / (Math.PI * 2)) * BERRY_FRAMES) % BERRY_FRAMES) + BERRY_FRAMES) %
  BERRY_FRAMES;

/** paint.berry, for a berry at any point: free berries as Feed's, paid ones in the giver's colour. */
function berry(x: number, y: number, t: number, colour: SnakeColour | null, size = 1): void {
  const phase = phaseOf(t),
    r = BERRY_R * size;
  ctx.drawImage(
    colour ? tintedBerrySprite(phase, COLOURS[colour]) : berrySprite(phase),
    x - r,
    y - r,
    r * 2,
    r * 2,
  );
}

/** paint.paintBerries over the arena's food: a landed berry bounces, a falling one arcs from the flower. */
export function paintFood(t: number): void {
  const c = ctx;
  // A dead snake's own berries fade off the board with it.
  for (const { f, t: ft } of arena.fading) {
    const to = toPx(f.x, f.y);
    c.save();
    c.globalAlpha = Math.max(0, 1 - ft / FADE_OUT);
    berry(to.x, to.y, t + f.x, f.colour, 1 - 0.4 * (ft / FADE_OUT));
    c.restore();
  }
  for (const f of arena.food) {
    const to = toPx(f.x, f.y),
      // Paid berries wear their giver's colour; plain and body berries stay Feed's.
      colour = f.by !== '' ? f.colour : null;
    if (f.t >= FALL_TIME) {
      const k = f.t - FALL_TIME,
        bounce = k < 0.3 ? Math.sin((k / 0.3) * Math.PI) * 8 * (1 - k / 0.3) : 0;
      berry(to.x, to.y - bounce, t + f.x, colour);
      if (colour && options.ownerOnly) {
        // When berries are their giver's alone: a ring in the giver's colour says whose.
        c.save();
        c.strokeStyle = COLOURS[colour];
        c.globalAlpha = 0.9;
        c.lineWidth = 3;
        c.beginPath();
        c.arc(to.x, to.y - bounce, 15, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
      continue;
    }
    const from = toPx(f.fx, f.fy),
      u = f.t / FALL_TIME,
      e = u * u,
      x = from.x + (to.x - from.x) * u,
      y = from.y + (to.y - from.y) * e - Math.sin(u * Math.PI) * 110;
    c.save();
    c.globalAlpha = 0.25 * u;
    c.fillStyle = '#0b120d';
    c.beginPath();
    c.ellipse(to.x, to.y + 8, 8 + 10 * u, 3 + 3 * u, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    berry(x, y, f.t, colour, 0.7 + 0.3 * u);
  }
}

/**
 * The body as paint.snakeTrace draws it: prod reads the one snake from `game`, so the snake's
 * body, next cell, length and slide are lent to it for the call and given back after.
 */
export function traceOf(s: Snake): Point[] {
  const kept = { body: game.body, next: game.next, len: game.len, sub: game.sub, full: game.full };
  game.body = s.body;
  game.next = s.next;
  game.len = s.len;
  game.sub = s.sub;
  game.full = -1;
  const pts = snakeTrace();
  game.body = kept.body;
  game.next = kept.next;
  game.len = kept.len;
  game.sub = kept.sub;
  game.full = kept.full;
  return pts;
}

/** The body and its skin, as Feed paints its snake, clipped to the board so a newborn comes up. */
function paintBody(
  c: CanvasRenderingContext2D,
  a: Ambience,
  s: Snake,
  trace: Point[],
  e: AmbienceFrame,
): void {
  const wasColour = currentSnakeColour(),
    wasSkin = currentSnakeSkin();
  setSnakeColour(s.colour);
  setSnakeSkin(s.skin);
  c.save();
  c.beginPath();
  c.rect(FX0 - 6, FY0 - 6, BOARD_W + 12, BOARD_H + 12);
  c.clip();
  if (s.safe > 0) c.globalAlpha = 0.5 + 0.4 * Math.abs(Math.sin(s.born * 11));
  c.save();
  c.scale(FAT, FAT);
  a.paintSnake(
    c,
    trace.map((p) => ({ x: p.x / FAT, y: p.y / FAT })),
    CELL,
    { ...e, tint: snakeTint() },
  );
  c.restore();
  paintScales(trace, c);
  c.restore();
  setSnakeColour(wasColour);
  setSnakeSkin(wasSkin);
}

/** paint.paintGulps for one snake. */
function paintGulps(s: Snake, trace: Point[]): void {
  const c = ctx;
  for (const g of s.gulps) {
    const p = trace[Math.min(trace.length - 1, Math.round(g * 3))];
    if (!p) continue;
    const fade = Math.max(0, 1 - g / 40),
      r = (17 + 7 * fade) * FAT;
    c.save();
    c.fillStyle = '#f7d9a0';
    c.globalAlpha = 0.55 + 0.45 * fade;
    c.beginPath();
    c.arc(p.x, p.y, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,250,235,0.6)';
    c.beginPath();
    c.arc(p.x - r * 0.3, p.y - r * 0.35, r * 0.35, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}

/** A picture swells a little as a like heart lands in it. */
export function bumpOf(nickname: string): number {
  const at = bumps.get(nickname);
  if (at === undefined) return 1;
  const u = (arena.clock - at) / 0.25;
  return u >= 0 && u < 1 ? 1 + 0.15 * Math.sin(u * Math.PI) : 1;
}

/**
 * paint.paintHead for one snake: the viewer's photo floats above the head on its stem, both
 * outlined in the snake's own colour so each face is matched to its body, with the crown (and a
 * bigger photo) when this snake is the biggest, and the name under it. No ring: the likes' ring
 * is on the player's animal on the beach.
 */
function paintHead(s: Snake, t: number): void {
  const c = ctx,
    head = toPx(s.x, s.y),
    b = s.bite,
    squash = b < 0.25 ? 1 + 0.22 * Math.sin((b / 0.25) * Math.PI) * (1 - b / 0.25) : 1;
  if (s.wild) {
    if (arena.crown === s.id)
      crown(head.x, head.y - 24 + Math.sin(t * 4) * 2, 0.8, { x: head.x, y: head.y, r: 16 });
    return;
  }
  const crowned = arena.crown === s.id,
    size = faceR(s),
    r = size * squash,
    colour = COLOURS[s.colour],
    bob = Math.sin(t * 3) * 3,
    fx = Math.min(W - 60, Math.max(60, head.x)),
    // A bigger picture rises by what it gains, so it stands as far above the head.
    fy = Math.max(r + 70, head.y - 64 - (size - TUNING.photoR) + bob);
  c.save();
  if (s.safe > 0) c.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(s.born * 11));
  c.strokeStyle = colour;
  c.lineWidth = STEM;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(head.x, head.y - 8);
  c.lineTo(fx, fy + r);
  c.stroke();
  c.save();
  c.globalAlpha *= 0.25;
  c.fillStyle = colour;
  c.beginPath();
  c.arc(fx, fy, r + 10, 0, Math.PI * 2);
  c.fill();
  c.restore();
  paintFace(s, fx, fy, r, colour);
  if (crowned) crown(fx, fy - r - 17, CROWN_SIZE, { x: fx, y: fy, r });
  // Lives: prod hearts in a row by the photo.
  paintSnakeHearts(s, fx, fy, r);
  const full = shownName(s),
    name = full.length > 16 ? full.slice(0, 15) + '…' : full;
  // Read on a phone: TikTok shows the stream about 390 px wide, a third of a unit per pixel.
  c.font = `800 ${String(NAME_SIZE)}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'top';
  c.lineJoin = 'round';
  c.lineWidth = 5;
  c.strokeStyle = 'rgba(12,20,15,0.8)';
  c.strokeText(name, fx, fy + r + 12);
  c.fillStyle = '#fff';
  c.fillText(name, fx, fy + r + 12);
  c.restore();
}

/** A viewer's picture radius on the board: the crown holder's is the largest. */
const faceR = (s: Snake): number => (arena.crown === s.id ? CROWN_R : TUNING.photoR);

/**
 * The likes ring, on a picture's outline itself: same radius and width as the ring
 * paint.paintFace strokes round a photo of radius `r`, drawn over it in red from the top
 * clockwise, so the outline turns red as it fills.
 */
export function likesRing(x: number, y: number, r: number, fill: number): void {
  if (fill <= 0) return;
  const c = ctx;
  c.save();
  c.lineCap = 'butt';
  c.lineWidth = Math.max(2, r * 0.13);
  c.strokeStyle = RED;
  c.beginPath();
  c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, fill));
  c.stroke();
  c.restore();
}

/**
 * Speed streaks: short lines trailing behind a point moving at `angle`, in `colour`, fading fast,
 * flickering, spread across `spread` pixels; `k` from 0 to 1 is how strong.
 */
export function speedStreaks(
  x: number,
  y: number,
  angle: number,
  colour: string,
  k: number,
  t: number,
  spread: number,
): void {
  if (k <= 0.02) return;
  const c = ctx,
    dx = Math.cos(angle),
    dy = Math.sin(angle),
    beat = Math.floor(t * 24);
  c.save();
  c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const v = Math.sin((beat + i * 7) * 12.9898) * 43758.5453,
      flick = v - Math.floor(v),
      off = (i - 1) * spread * 0.6,
      ox = x - dy * off - dx * (6 + flick * 8),
      oy = y + dx * off - dy * (6 + flick * 8),
      len = (34 + 34 * flick) * (0.6 + 0.4 * k),
      g = c.createLinearGradient(ox, oy, ox - dx * len, oy - dy * len);
    g.addColorStop(0, colour);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalAlpha = Math.min(1, k * (0.75 + 0.35 * flick));
    c.strokeStyle = g;
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(ox, oy);
    c.lineTo(ox - dx * len, oy - dy * len);
    c.stroke();
  }
  c.restore();
}

/**
 * A boosted snake: speed streaks behind its head and along its last segments in its own colour,
 * and a light ripple running down its back faster than it moves. Nothing round the body.
 */
function paintBoost(s: Snake, trace: Point[], t: number): void {
  if (s.boost <= 0 || trace.length < 4) return;
  const k = Math.min(1, s.boost / 1.5),
    colour = COLOURS[s.colour],
    at = (i: number): { p: Point; a: number } | null => {
      const p = trace[Math.min(trace.length - 1, i)],
        q = trace[Math.max(0, Math.min(trace.length - 1, i - 2))];
      if (!p || !q) return null;
      return { p, a: Math.atan2(q.y - p.y, q.x - p.x) };
    };
  const head = at(2);
  if (head) speedStreaks(head.p.x, head.p.y, head.a, colour, k, t, 30);
  for (const share of [0.55, 0.85]) {
    const seg = at(Math.round((trace.length - 1) * share));
    if (seg) speedStreaks(seg.p.x, seg.p.y, seg.a, colour, k * 0.7, t + share, 26);
  }
  // The ripple: soft light bands running head to tail.
  const c = ctx;
  c.save();
  c.globalAlpha = 0.35 * k;
  c.fillStyle = '#fff';
  for (let j = 0; j < 3; j++) {
    const u = (t * 2.2 + j / 3) % 1,
      p = trace[Math.round(u * (trace.length - 1))];
    if (!p) continue;
    c.beginPath();
    c.arc(p.x, p.y, 7 * FAT, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

/** Every living snake, the smallest first so the big ones lie on top; the photos over everything. */
export function paintSnakes(
  c: CanvasRenderingContext2D,
  a: Ambience,
  e: AmbienceFrame,
  t: number,
): void {
  paintDying(c, a, e);
  const live = alive().sort((p, q) => p.len - q.len);
  for (const s of live) {
    if (s.cells.length) {
      const trace = traceOf(s);
      paintBody(c, a, s, trace, e);
      paintGulps(s, trace);
      paintBoost(s, trace, t);
    }
    if (s.egg) paintEggOf(c, s);
  }
  // A picture shows once its snake is out of the egg; the bigger pictures lie on top.
  const heads = live.filter((s) => s.in && !s.wild).sort((p, q) => faceR(p) - faceR(q));
  for (const s of live) if (s.in && s.wild) paintHead(s, t);
  for (const s of heads) paintHead(s, t);
}

/**
 * The dying: the body as it pops (round.ts takes its cells away from the tail), the picture
 * shrinking and dropping to its animal on the beach. When a life saved it, a heart breaks and the
 * picture flies to the new egg instead (entry.ts).
 */
export function paintDying(c: CanvasRenderingContext2D, a: Ambience, e: AmbienceFrame): void {
  for (const d of arena.dying) {
    const s = d.s;
    if (s.cells.length > 1) paintBody(c, a, s, traceOf(s), e);
    const u = Math.min(1, d.t / DEATH_TIME);
    // A life used: the picture flies to the new egg instead (entry.ts), and a heart breaks.
    if (d.lifeUsed) paintBrokenHeart(s, d.from, u);
    if (!s.wild && !(d.lifeUsed && snakeOf(s.nickname))) {
      const to = faceOf(s.nickname),
        drop = u * u,
        x = d.from.x + (to.x - d.from.x) * drop,
        y = d.from.y + (to.y - d.from.y) * drop,
        r = TUNING.photoR * (1 - 0.55 * u);
      c.save();
      c.globalAlpha = 1 - 0.6 * u;
      paintFace(s, x, y, r);
      c.restore();
    }
  }
}

/** The Duel's egg, hatching where the snake is laid, at the size of the arena's snakes. */
function paintEggOf(c: CanvasRenderingContext2D, s: Snake): void {
  const egg = s.egg;
  if (!egg) return;
  const p = toPx(cellX(egg.cell), cellY(egg.cell));
  if (s.seat && !egg.hatched) {
    // A seat won in the qualifying: the egg stays closed through the countdown, trembling only
    // just before GO; the picture stays over it until the snake is out, where its photo floats.
    if (egg.t < 0) paintStillEgg(c, p.x, p.y, arena.clock + egg.cell);
    else {
      c.save();
      c.translate(p.x, p.y);
      c.scale(FAT, FAT);
      paintEgg(c, 0, 0, egg.t, egg.t / HATCH_TIME);
      c.restore();
    }
    if (!s.wild) paintFace(s, p.x, p.y - 64, TUNING.photoR);
    return;
  }
  if (egg.t < 0) {
    // The picture is on its way: only a faint mark where it will land.
    c.save();
    c.globalAlpha = 0.22;
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(p.x, p.y, 14, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    return;
  }
  c.save();
  c.translate(p.x, p.y);
  c.scale(FAT, FAT);
  paintEgg(c, 0, 0, egg.t, egg.t / HATCH_TIME);
  c.restore();
}

/**
 * The Duel's egg at rest, barely breathing, at the size of the arena's snakes; trembling when its
 * seat is at risk, its shell gold when a gift holds it.
 */
export function paintStillEgg(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  look: { wobble?: boolean; gold?: boolean } = {},
): void {
  c.save();
  c.translate(x, y);
  c.scale(FAT, FAT);
  paintEgg(c, 0, 0, t, look.wobble ? 0.32 : 0.04);
  c.restore();
  if (!look.gold) return;
  c.save();
  c.globalCompositeOperation = 'multiply';
  c.fillStyle = GOLD;
  c.beginPath();
  c.ellipse(x, y + 2, CELL * 0.42 * FAT, CELL * 0.6 * FAT, 0, 0, Math.PI * 2);
  c.fill();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 0.25 + 0.1 * Math.sin(t * 3);
  c.beginPath();
  c.ellipse(x, y + 2, CELL * 0.5 * FAT, CELL * 0.68 * FAT, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** The colour of the snake wearing the crown, null when nobody does. */
export function crownColour(): string | null {
  const s = arena.snakes.find((x) => x.id === arena.crown && x.alive);
  return s ? COLOURS[s.colour] : null;
}
