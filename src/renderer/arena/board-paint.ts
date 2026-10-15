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
import { flowerHooks } from '../feed/flower.ts';
import { FALL_TIME, game } from '../feed/state.ts';
import { PLAY } from './continuous.ts';
import { bumps, faceOf, fired, shownName } from './entry.ts';
import { FADE_OUT } from './round.ts';
import { paintBrokenHeart, paintLostHeart, paintSnakeHearts } from './lives.ts';
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
/** A player's name over their picture, in game units. */
const NAME_SIZE = 26;
/** The crown's size over the biggest snake's picture: every picture is the same size. */
const CROWN_SIZE = 1.2;
/** The stem from the head to the picture, in the snake's colour. */
const STEM = 6;
/** The arena board's shade over the ambience's surface. */
const BOARD_SHADE = 'rgba(4,10,9,0.3)';

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

/**
 * The board one step darker than Feed's, inside the ring and under it (the ring keeps its look):
 * the pastel snakes stand out from it on a phone. Feed's own board is left as it is.
 */
export function paintBoardShade(): void {
  const c = ctx;
  c.save();
  c.fillStyle = BOARD_SHADE;
  c.beginPath();
  // The ring's own path (feed/hud.ts paintRing): 26 units outside the board, corners of 30.
  c.roundRect(FX0 - 26, FY0 - 26, BOARD_W + 52, BOARD_H + 52, 30);
  c.fill();
  c.restore();
}

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
      if (colour && (options.ownerOnly || arena.continuous)) {
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

/** Where a viewer's picture stands this frame, and its size (a bite squashes it a moment). */
function photoOf(s: Snake, t: number): { x: number; y: number; r: number; name: number } {
  const b = s.bite,
    squash = b < 0.25 ? 1 + 0.22 * Math.sin((b / 0.25) * Math.PI) * (1 - b / 0.25) : 1,
    spot = laidOut.get(s) ?? { ...photoSpot(s, toPx(s.x, s.y), t), name: 1 };
  return { x: spot.x, y: spot.y, r: TUNING.photoR * squash, name: spot.name };
}

/**
 * paint.paintHead for one snake: the viewer's photo floats above the head on its stem, both
 * outlined in the snake's own colour so each face is matched to its body, its name above it, its
 * lives by it. Over the bodies; the heads are painted over it again (paintSnakes). No ring: the
 * likes' ring is on the player's animal on the beach.
 */
function paintPhoto(s: Snake, t: number): void {
  const c = ctx,
    head = toPx(s.x, s.y),
    colour = COLOURS[s.colour],
    { x: fx, y: fy, r, name: shown } = photoOf(s, t);
  if (s.wild) {
    paintComputer(s, head, fx, fy, r);
    return;
  }
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
  // Lives: prod hearts in a row by the photo.
  paintSnakeHearts(s, fx, fy, r);
  const full = shownName(s),
    name = full.length > 16 ? full.slice(0, 15) + '…' : full;
  // Above the picture, read on a phone, with the prod outline; hidden while it would cover a
  // bigger snake's name.
  if (shown > 0.01) {
    c.globalAlpha *= shown;
    c.font = `800 ${String(NAME_SIZE)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    c.lineJoin = 'round';
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(12,20,15,0.85)';
    c.strokeText(name, fx, fy - r - 6);
    c.fillStyle = '#fff';
    c.fillText(name, fx, fy - r - 6);
  }
  c.restore();
}

/**
 * A computer snake's picture (continuous play) on its stem: the arena's white egg on the dark disc
 * of a photo, the same size, outlined in the snake's colour, no name. It says the snake is free.
 */
function paintComputer(
  s: Snake,
  head: { x: number; y: number },
  fx: number,
  fy: number,
  r: number,
): void {
  const c = ctx,
    colour = COLOURS[s.colour];
  c.save();
  if (s.safe > 0) c.globalAlpha *= 0.5 + 0.5 * Math.abs(Math.sin(s.born * 11));
  c.strokeStyle = colour;
  c.lineWidth = STEM;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(head.x, head.y - 8);
  c.lineTo(fx, fy + r);
  c.stroke();
  c.fillStyle = 'rgba(14,16,20,0.92)';
  c.beginPath();
  c.arc(fx, fy, r, 0, Math.PI * 2);
  c.fill();
  c.lineWidth = Math.max(2, r * 0.13);
  c.strokeStyle = colour;
  c.stroke();
  // The arena's egg, white, filling the circle: one like hatches a snake of one's own here.
  const k = (r * 1.25) / EGG_TALL;
  c.translate(fx, fy + r * 0.04);
  c.scale(k, k);
  paintStillEgg(c, 0, 0, arena.clock + s.id);
  c.restore();
}

/**
 * Over everything, bodies included: the crown above the leader's name (on a wild snake's head)
 * and a boosted player's bolt at its photo's top right, as on its animal on the beach.
 */
function paintHeadMarks(s: Snake, t: number): void {
  const head = toPx(s.x, s.y);
  if (s.wild) {
    if (arena.crown === s.id)
      crown(head.x, head.y - 24 + Math.sin(t * 4) * 2, 0.8, { x: head.x, y: head.y, r: 16 });
    return;
  }
  const { x, y, r } = photoOf(s, t);
  ctx.save();
  if (s.safe > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(s.born * 11));
  if (arena.crown === s.id) crown(x, y - r - NAME_SIZE - 22, CROWN_SIZE, { x, y, r });
  paintBoostBolt(s, x + r * 0.82, y - r * 0.82, BOLT, t);
  ctx.restore();
}

/** Each picture's place this frame, apart from the others, and its name's opacity. */
const laidOut = new Map<Snake, { x: number; y: number; name: number }>();
/** Each picture's eased push away from the others, and its name's eased opacity. */
const apart = new WeakMap<Snake, { x: number; y: number; name: number; at: number }>();
/** Two pictures overlap by a fifth of a radius at most. */
const OVERLAP = 0.2;

/**
 * Lays the viewers' pictures out for this frame: each where its spring has it, then softly
 * pushed apart so two never overlap by more than a fifth of a radius, the push eased; and when
 * two names would still overlap, the bigger snake's shows and the other fades until there is room.
 */
function layOutHeads(heads: readonly Snake[], t: number): void {
  laidOut.clear();
  const r = TUNING.photoR,
    min = 2 * r * (1 - OVERLAP / 2),
    base = heads.map((s) => ({ s, ...photoSpot(s, toPx(s.x, s.y), t) })),
    want = base.map(() => ({ x: 0, y: 0 }));
  // A few passes: a cluster of three or more settles, not only the pairs.
  for (let pass = 0; pass < 4; pass++)
    for (let i = 0; i < base.length; i++)
      for (let j = i + 1; j < base.length; j++) {
        const a = base[i],
          b = base[j],
          wa = want[i],
          wb = want[j];
        if (!a || !b || !wa || !wb) continue;
        let dx = b.x + wb.x - (a.x + wa.x),
          dy = b.y + wb.y - (a.y + wa.y);
        const d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 0.01) {
          dx = 1;
          dy = 0;
        } else {
          dx /= d;
          dy /= d;
        }
        const push = (min - d) / 2;
        wa.x -= dx * push;
        wa.y -= dy * push;
        wb.x += dx * push;
        wb.y += dy * push;
      }
  // Names: the smaller snake's name gives way where two would overlap.
  const label = (x: number, y: number, name: string): [number, number, number, number] => {
    const w = Math.min(16, name.length) * NAME_SIZE * 0.55;
    return [x - w / 2, y - r - 6 - NAME_SIZE, x + w / 2, y - r - 6];
  };
  const placed = base.map((b, i) => {
    const s = b.s,
      prev = apart.get(s),
      dt = prev ? Math.min(0.1, Math.max(0, arena.clock - prev.at)) : 1,
      k = 1 - Math.exp(-dt * 8),
      w = want[i] ?? { x: 0, y: 0 },
      ox = prev ? prev.x + (w.x - prev.x) * k : w.x,
      oy = prev ? prev.y + (w.y - prev.y) * k : w.y;
    return { s, x: b.x + ox, y: b.y + oy, ox, oy, prev, k };
  });
  // The eased push may lag behind a picture that has just come (a hatch, a snake taken): the
  // pictures are moved apart at once wherever they still overlap by more than OVERLAP, and the
  // ease goes on from there, so two never lie on top of each other, not even for a frame.
  for (let pass = 0; pass < 4; pass++)
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i],
          b = placed[j];
        if (!a || !b) continue;
        let dx = b.x - a.x,
          dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 0.01) {
          dx = 1;
          dy = 0;
        } else {
          dx /= d;
          dy /= d;
        }
        const push = (min - d) / 2;
        a.x -= dx * push;
        a.y -= dy * push;
        a.ox -= dx * push;
        a.oy -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
        b.ox += dx * push;
        b.oy += dy * push;
      }
  for (const p of placed) {
    const mine = label(p.x, p.y, p.s.wild ? '' : shownName(p.s)),
      hidden = placed.some((o) => {
        if (o === p || o.s.len < p.s.len || (o.s.len === p.s.len && o.s.id > p.s.id)) return false;
        const other = label(o.x, o.y, o.s.wild ? '' : shownName(o.s)),
          // The other picture's square, its name over it.
          face: [number, number, number, number] = [o.x - r, o.y - r, o.x + r, o.y + r],
          meets = (q: [number, number, number, number]): boolean =>
            mine[0] < q[2] && q[0] < mine[2] && mine[1] < q[3] && q[1] < mine[3];
        return meets(other) || meets(face);
      }),
      was = p.prev?.name ?? 1,
      name = was + ((hidden ? 0 : 1) - was) * Math.min(1, p.k * 1.5);
    apart.set(p.s, { x: p.ox, y: p.oy, name, at: arena.clock });
    laidOut.set(p.s, { x: p.x, y: p.y, name });
  }
}

/** How far above the head a picture floats, and how fast it follows (a critically damped spring). */
const LIFT = 84,
  FOLLOW = 16;
/** Each picture's spring: where it is, its speed, and the clock it was last moved at. */
const springs = new WeakMap<Snake, { x: number; y: number; vx: number; vy: number; at: number }>();

/**
 * Where a snake's picture floats this frame: straight above its head at a fixed height, following
 * it through a critically damped spring, so its path is a smooth curve and it never snaps. Near an
 * edge or under the clock's pill its target eases away from them; the spring smooths that too.
 */
function photoSpot(s: Snake, head: { x: number; y: number }, t: number): { x: number; y: number } {
  const r = TUNING.photoR,
    tx = Math.min(W - 60, Math.max(60, head.x)),
    // Near the pill, eased by distance: the picture and its name stay below it.
    near = 1 - Math.min(1, Math.max(0, (Math.abs(tx - (FX0 + BOARD_W / 2)) - PILL_HALF) / (2 * r))),
    floor = r + NAME_SIZE + 40 + (FY0 + 12 - 40) * near * near * (3 - 2 * near),
    ty = Math.max(floor, head.y - LIFT);
  let p = springs.get(s);
  if (!p) {
    p = { x: tx, y: ty, vx: 0, vy: 0, at: arena.clock };
    springs.set(s, p);
  }
  let dt = Math.min(0.1, Math.max(0, arena.clock - p.at));
  p.at = arena.clock;
  // Small steps keep the spring exact whatever the frame's length.
  while (dt > 0) {
    const h = Math.min(dt, 1 / 120),
      k = FOLLOW * FOLLOW,
      d = 2 * FOLLOW;
    p.vx += (k * (tx - p.x) - d * p.vx) * h;
    p.vy += (k * (ty - p.y) - d * p.vy) * h;
    p.x += p.vx * h;
    p.y += p.vy * h;
    dt -= h;
  }
  return { x: p.x, y: p.y + Math.sin(t * 3) * 3 };
}

/** Half the widest clock pill (beach.ts paintArenaTime): pictures keep clear of it. */
const PILL_HALF = 190;

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

/** The speed bolt's size, in game units. */
export const BOLT = 44;

/**
 * The speed bolt, in the prod badges' manner: a warm gold lightning bolt with a dark outline,
 * `size` units tall, centred on x, y.
 */
export function paintBolt(x: number, y: number, size: number, alpha = 1): void {
  if (alpha <= 0.01) return;
  const c = ctx,
    k = size / 44,
    pts: readonly (readonly [number, number])[] = [
      [4, -22],
      [-13, 3],
      [-1, 3],
      [-7, 22],
      [13, -5],
      [1, -5],
      [9, -22],
    ];
  c.save();
  c.globalAlpha *= alpha;
  c.translate(x, y);
  c.scale(k, k);
  c.beginPath();
  pts.forEach(([px, py], i) => {
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  });
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = 5;
  c.strokeStyle = 'rgba(38,24,8,0.92)';
  c.stroke();
  const g = c.createLinearGradient(0, -22, 0, 22);
  g.addColorStop(0, '#ffe08a');
  g.addColorStop(1, '#f2a93b');
  c.fillStyle = g;
  c.fill();
  c.restore();
}

/**
 * A snake's boost as a bolt at (x, y): it pops in with a small scale-up when the boost fires,
 * pulses softly while it lasts and fades out as it ends. Nothing when the snake is not boosted.
 */
export function paintBoostBolt(s: Snake, x: number, y: number, size: number, t: number): void {
  if (s.boost <= 0 || s.wild) return;
  const since = arena.clock - (fired.get(s.nickname) ?? -Infinity),
    pop = since < 0.3 ? 1 + 0.45 * Math.sin((since / 0.3) * Math.PI) : 1,
    pulse = 1 + 0.06 * Math.sin(t * 8),
    fade = Math.min(1, s.boost / 0.4);
  paintBolt(x, y, size * pop * pulse, fade);
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

/**
 * Every living snake, the smallest first so the big ones lie on top, bodies and heads; then every
 * photo with its name, over all of them: no part of any snake, its own head included, is ever
 * drawn over a player's photo. The crowns and the boost bolts over all.
 */
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
  // A picture shows once its snake is out of the egg; the crowned picture last, on top.
  const heads = placePhotos(t);
  for (const s of heads) paintPhoto(s, t);
  for (const s of live) if (s.in && s.wild && !arena.continuous) paintHeadMarks(s, t);
  for (const s of heads) paintHeadMarks(s, t);
  // Continuous play: a life used, its heart breaking by the picture.
  for (const b of arena.breaks) {
    const at = laidOut.get(b.s);
    if (at) paintLostHeart(b.s, at.x, at.y, Math.min(1, b.t / PLAY.heart));
  }
}

/**
 * The viewers' snakes whose pictures show, in painting order (the crowned one last), each
 * picture laid out for this frame (`photoPlace`).
 */
export function placePhotos(t: number): Snake[] {
  // In continuous play the computer's snakes show their egg pictures with the players' photos.
  const heads = alive()
    .sort((p, q) => p.len - q.len)
    .filter((s) => (s.in || eggPhoto(s)) && (!s.wild || arena.continuous))
    .sort((p, q) => Number(p.id === arena.crown) - Number(q.id === arena.crown));
  layOutHeads(heads, t);
  return heads;
}

/** Continuous play: a viewer's egg shows their picture over it, laid out with the others. */
const eggPhoto = (s: Snake): boolean =>
  arena.continuous && !s.wild && !!s.seat && !!s.egg && !s.egg.hatched;

/** Where a snake's picture was laid out this frame, if it shows. */
export const photoPlace = (s: Snake): { x: number; y: number } | undefined => laidOut.get(s);

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
    // In continuous play the egg's picture is laid out with the snakes' (placePhotos).
    if (!s.wild && !arena.continuous) paintFace(s, p.x, p.y - 84, TUNING.photoR);
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
 * The Duel's egg at rest, barely breathing, at the size of the arena's snakes; its shell gold when
 * a gift holds it.
 */
export function paintStillEgg(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  look: { gold?: boolean } = {},
): void {
  c.save();
  c.translate(x, y);
  c.scale(FAT, FAT);
  paintEgg(c, 0, 0, t, 0.04);
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

/** The arena's egg is about this tall at its own size (paintStillEgg). */
const EGG_TALL = 54;

// What a seat gift buys shows on the flower's card where Feed shows the berry: a gold egg.
flowerHooks.seat = (c, x, y, size) => {
  const k = (size * 0.55) / EGG_TALL;
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  paintStillEgg(c, 0, -2, arena.clock, { gold: true });
  c.restore();
};

/** The colour of the snake wearing the crown, null when nobody does. */
export function crownColour(): string | null {
  const s = arena.snakes.find((x) => x.id === arena.crown && x.alive);
  return s ? COLOURS[s.colour] : null;
}
