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
import { faceOf, shownName } from './entry.ts';
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

/**
 * paint.paintHead for one snake: the viewer's photo floats above the head in a gold ring on its
 * stem, with the crown when this snake is the biggest, the red likes ring and the name under it.
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
  const r = TUNING.photoR * squash,
    bob = Math.sin(t * 3) * 3,
    fx = Math.min(W - 60, Math.max(60, head.x)),
    fy = Math.max(r + 70, head.y - 64 + bob);
  c.save();
  if (s.safe > 0) c.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(s.born * 11));
  c.strokeStyle = 'rgba(242,197,124,0.7)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(head.x, head.y - 8);
  c.lineTo(fx, fy + r);
  c.stroke();
  c.fillStyle = 'rgba(242,197,124,0.25)';
  c.beginPath();
  c.arc(fx, fy, r + 10, 0, Math.PI * 2);
  c.fill();
  paintFace(s, fx, fy, r);
  // The likes ring on the photo's outline: what is left of the boost, from the top clockwise.
  const fill = s.boost / TUNING.boostCap;
  if (fill > 0.01) likesRing(fx, fy, r, fill);
  if (arena.crown === s.id) crown(fx, fy - r - 12, 1.2, { x: fx, y: fy, r });
  // Lives: prod hearts in a row by the photo.
  paintSnakeHearts(s, fx, fy, r);
  const full = shownName(s),
    name = full.length > 16 ? full.slice(0, 15) + '…' : full;
  c.font = `800 22px ${FONT}`;
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
    }
    if (s.egg) paintEggOf(c, s);
  }
  // A picture shows once its snake is out of the egg.
  for (const s of live) if (s.in) paintHead(s, t);
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

/** The colour of the snake wearing the crown, null when nobody does. */
export function crownColour(): string | null {
  const s = arena.snakes.find((x) => x.id === arena.crown && x.alive);
  return s ? COLOURS[s.colour] : null;
}
