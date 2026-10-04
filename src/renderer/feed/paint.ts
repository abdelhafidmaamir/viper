// Feed the Snake: what lives on the board. Berries in the duel's style falling from the dispenser
// with their giver's face, the smooth body, the swallow bulge, the bite sparks and the crowned head.

import { ctx } from '../engine/canvas.ts';
import { W } from '../engine/layout.ts';
import { FCELL, FX0, FY0, K, MOUTH } from './grid.ts';
import { GOLD, berryGlow, berryTint } from '../engine/palette.ts';
import type { Point } from '../engine/types.ts';
import { FALL_TIME, cellAt, game, leaders } from './state.ts';
import { paintCrownStyle, type Face } from './crowns.ts';
import type { CrownStyle, SnakeColour, SnakeSkin } from '../../shared/feed-protocol.ts';

export const px = (gx: number, gy: number): Point => ({
  x: FX0 + gx * FCELL + FCELL / 2,
  y: FY0 + gy * FCELL + FCELL / 2,
});

export const FONT = 'system-ui, sans-serif';
const DROP_FROM = MOUTH;

// ---- faces ---------------------------------------------------------------------------------

const avatars = new Map<string, HTMLImageElement>();
function avatarImage(url: string | undefined): HTMLImageElement | null {
  if (!url) return null;
  let img = avatars.get(url);
  if (!img) {
    img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    avatars.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * Where a viewer's picture stands: loaded, still on its way, or broken. Asking starts the
 * download, unless `load` is false.
 */
export function photo(url: string | undefined, load = true): 'ready' | 'loading' | 'failed' {
  if (!url) return 'failed';
  if (!load && !avatars.has(url)) return 'loading';
  if (avatarImage(url)) return 'ready';
  // A broken picture is complete too, with nothing in it.
  return avatars.get(url)?.complete ? 'failed' : 'loading';
}

/** A viewer's picture once it has loaded, null until then. */
export function photoImage(url: string | undefined): HTMLImageElement | null {
  return avatarImage(url);
}

// Stable colour per name, so a viewer without a picture is still recognisable.
function hue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return h;
}

/** A round face: the avatar when it loaded, the initials on the viewer's colour otherwise. */
export function paintFace(
  fan: { nickname: string; avatar?: string | undefined },
  x: number,
  y: number,
  r: number,
  ring: string | null = GOLD,
): void {
  const c = ctx;
  c.save();
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  const img = avatarImage(fan.avatar);
  c.fillStyle = img ? '#1b2a1f' : `hsl(${String(hue(fan.nickname))} 38% 34%)`;
  c.fill();
  c.save();
  c.clip();
  if (img) c.drawImage(img, x - r, y - r, r * 2, r * 2);
  else {
    const letters = (fan.nickname.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2) || '?').toUpperCase();
    c.fillStyle = '#f3f7ec';
    c.font = `800 ${String(Math.round(r * 0.8))}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(letters, x, y + r * 0.05);
  }
  c.restore();
  if (ring) {
    c.lineWidth = Math.max(2, r * 0.13);
    c.strokeStyle = ring;
    c.stroke();
  }
  c.restore();
}

/** Which crown the round's top giver wears (control room, "Crown"). */
let crownStyle: CrownStyle = 'classic';
export function setCrownStyle(style: CrownStyle): void {
  crownStyle = style;
}

/**
 * The classic crown sits at (x, y) at scale s. The others are drawn around the photo they crown,
 * so callers pass that photo too.
 */
export function crown(x: number, y: number, s: number, face: Face): void {
  const c = ctx;
  if (crownStyle !== 'classic') {
    paintCrownStyle(c, crownStyle, face);
    return;
  }
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.beginPath();
  c.moveTo(-14, 8);
  c.lineTo(-16, -8);
  c.lineTo(-7, 0);
  c.lineTo(0, -12);
  c.lineTo(7, 0);
  c.lineTo(16, -8);
  c.lineTo(14, 8);
  c.closePath();
  // The snake is gold too: a dark rim and a bright face keep the crown readable over the body.
  c.lineJoin = 'round';
  c.lineWidth = 5;
  c.strokeStyle = 'rgba(12,20,15,0.92)';
  c.stroke();
  const g = c.createLinearGradient(0, -12, 0, 8);
  g.addColorStop(0, '#fff4c2');
  g.addColorStop(0.55, '#ffd24a');
  g.addColorStop(1, '#e08a1e');
  c.fillStyle = g;
  c.fill();
  c.fillStyle = '#e8455a';
  for (const [jx, jy] of [
    [-8, 4],
    [0, 3],
    [8, 4],
  ] as const) {
    c.beginPath();
    c.arc(jx, jy, 2.2, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// ---- snake ---------------------------------------------------------------------------------

/** Cell k along the body: 0 is the head, -1 the next cell ahead. */
const vertex = (k: number): { x: number; y: number } => {
  const cells = game.body.cells;
  if (k < 0) return cellAt(game.next);
  return cellAt(cells[Math.min(k, cells.length - 1)] ?? game.head);
};

function pointOn(p: number): Point {
  const k = Math.round(p),
    u = Math.min(1, Math.max(0, p - k + 0.5));
  const a = vertex(k - 1),
    v = vertex(k),
    b = vertex(k + 1);
  const Ax = (a.x + v.x) / 2,
    Ay = (a.y + v.y) / 2,
    Bx = (v.x + b.x) / 2,
    By = (v.y + b.y) / 2,
    i = 1 - u;
  return px(i * i * Ax + 2 * u * i * v.x + u * u * Bx, i * i * Ay + 2 * u * i * v.y + u * u * By);
}

/** The body as a smooth polyline, head first, sliding between cells. */
export function snakeTrace(): Point[] {
  const moving = game.full < 0,
    s = moving ? game.sub : 0;
  const pt = game.len - 1 - s,
    pts: Point[] = [];
  for (let p = -s; p < pt; p += 1 / 3) pts.push(pointOn(p));
  pts.push(pointOn(pt));
  return pts;
}

/** The snake's skin (control room, "Snake skin"). */
let snakeSkin: SnakeSkin = 'classic';
export function setSnakeSkin(skin: SnakeSkin): void {
  snakeSkin = skin;
}
export const currentSnakeSkin = (): SnakeSkin => snakeSkin;

const COLOURS: Record<SnakeColour, string> = {
  sand: '#F2C57C',
  leaf: '#7CC45A',
  coral: '#F2937A',
  seafoam: '#7FD3B6',
  lagoon: '#6EC1D9',
  lavender: '#B39CE6',
  rose: '#F2A6BC',
  pearl: '#E6ECF2',
};
/** The sand's own browns; other colours get the same shades worked out in their hue. */
const SAND_TONES = { dark: '122,78,26', mid: '150,108,48', light: '255,236,190' };

/** 'r,g,b' for a hue (degrees), saturation and lightness (0..1). */
function hslTriplet(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)].join(',');
}

function tonesFor(hex: string): typeof SAND_TONES {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min,
    l = (max + min) / 2,
    s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d > 0) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return {
    dark: hslTriplet(h, s * 0.75, 0.29),
    mid: hslTriplet(h, s * 0.6, 0.39),
    light: hslTriplet(h, Math.min(1, s * 1.1), 0.88),
  };
}

/** The snake's colour (control room, "Snake colour"). */
let snakeColour: SnakeColour = 'sand',
  tones = SAND_TONES;
export function setSnakeColour(colour: SnakeColour): void {
  if (colour === snakeColour) return;
  snakeColour = colour;
  tones = colour === 'sand' ? SAND_TONES : tonesFor(COLOURS[colour]);
  scaleCanvas = null; // the chevron sprite was drawn in the old shade
}
export const currentSnakeColour = (): SnakeColour => snakeColour;
/** The body's colour, as the ambience's snake painter takes it. */
export const snakeTint = (): string => COLOURS[snakeColour];

/** Cells between two bands, and the length of one band. */
const BAND_EVERY = 5,
  BAND_LEN = 1.6;

/**
 * The skin: wide bands every few cells and chevrons every half cell, all at a fixed distance
 * from the head. The body is one piece, so its skin travels with it: every mark slides along the
 * loop at the snake's speed, and the whole body reads as moving, not just the head and the tail.
 * `trace` holds a point every third of a cell from the head, so distance q is index q * 3.
 */
export function paintScales(trace: Point[], c: CanvasRenderingContext2D = ctx): void {
  if (trace.length < 3) return;
  const end = (trace.length - 1) / 3 - 0.6,
    spacing = 0.5;
  if (snakeSkin === 'dark-back') paintDarkBack(trace, c);
  else paintBands(trace, end, c);
  paintChevrons(trace, end, spacing, c);
}

/**
 * A darker line down the back with a thin light in its middle, in place of the bands. On a full
 * board the bands line up row after row into a chessboard; a line along each row does not.
 */
function paintDarkBack(trace: Point[], c: CanvasRenderingContext2D): void {
  const first = trace[3];
  if (!first) return;
  const back = new Path2D();
  back.moveTo(first.x, first.y);
  for (let i = 4; i < trace.length; i++) {
    const pt = trace[i];
    if (pt) back.lineTo(pt.x, pt.y);
  }
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = `rgba(${tones.dark},0.34)`;
  c.lineWidth = 11;
  c.stroke(back);
  c.strokeStyle = `rgba(${tones.light},0.4)`;
  c.lineWidth = 2.4;
  c.stroke(back);
  c.restore();
}

function paintBands(trace: Point[], end: number, c: CanvasRenderingContext2D): void {
  // Perf: all bands go into one path, stroked twice.
  const bands = new Path2D();
  for (let q = 1.2; q < end; q += BAND_EVERY) {
    const from = Math.round(q * 3),
      to = Math.min(trace.length - 1, Math.round(Math.min(end, q + BAND_LEN) * 3));
    const first = trace[from];
    if (!first) break;
    bands.moveTo(first.x, first.y);
    for (let i = from + 1; i <= to; i++) {
      const pt = trace[i];
      if (pt) bands.lineTo(pt.x, pt.y);
    }
  }
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = `rgba(${tones.dark},0.42)`;
  c.lineWidth = 20;
  c.stroke(bands);
  c.strokeStyle = `rgba(${tones.light},0.22)`;
  c.lineWidth = 6;
  c.stroke(bands);
  c.restore();
}

function paintChevrons(
  trace: Point[],
  end: number,
  spacing: number,
  c: CanvasRenderingContext2D,
): void {
  // Perf: one chevron sprite, stamped and turned along the body. Stroking ~1800 small shapes as
  // one path cost the GPU a third of the frame on a full board; stamping costs almost nothing.
  const sprite = scaleSprite(),
    base = c.getTransform(),
    k = Math.hypot(base.a, base.b);
  for (let q = spacing; q < end; q += spacing) {
    const f = q * 3,
      i = Math.floor(f),
      a = trace[i],
      b = trace[i + 1];
    if (!a || !b) break;
    const u = f - i,
      x = a.x + (b.x - a.x) * u,
      y = a.y + (b.y - a.y) * u;
    let dx = a.x - b.x,
      dy = a.y - b.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    // Game units to device pixels, turned so the chevron points toward the head.
    c.setTransform(
      k * dx,
      k * dy,
      -k * dy,
      k * dx,
      base.a * x + base.c * y + base.e,
      base.b * x + base.d * y + base.f,
    );
    c.drawImage(sprite, -SCALE_HALF, -SCALE_HALF, SCALE_HALF * 2, SCALE_HALF * 2);
  }
  c.setTransform(base);
}

/** Half the size of the chevron sprite, in game units, and its resolution factor. */
const SCALE_HALF = 12,
  SCALE_RES = 3;
let scaleCanvas: HTMLCanvasElement | null = null;

/** A chevron pointing along +x with its soft highlight, drawn once. */
function scaleSprite(): HTMLCanvasElement {
  if (scaleCanvas) return scaleCanvas;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SCALE_HALF * 2 * SCALE_RES;
  const g = cv.getContext('2d');
  if (g) {
    g.scale(SCALE_RES, SCALE_RES);
    g.translate(SCALE_HALF, SCALE_HALF);
    const w = 9,
      d = 5;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = `rgba(${tones.mid},0.55)`;
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(-d, w);
    g.lineTo(d, 0);
    g.lineTo(-d, -w);
    g.stroke();
    g.fillStyle = 'rgba(255,244,214,0.35)';
    g.beginPath();
    g.arc(0, 4, 1.8, 0, Math.PI * 2);
    g.fill();
  }
  scaleCanvas = cv;
  return cv;
}

export function paintGulps(trace: Point[]): void {
  const c = ctx;
  for (const g of game.gulps) {
    const p = trace[Math.min(trace.length - 1, Math.round(g * 3))];
    if (!p) continue;
    const fade = Math.max(0, 1 - g / 40),
      r = (17 + 7 * fade) * K * 1.3;
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
 * The head carries the round's top gifter, big: their face floats above the head in a gold ring
 * with the crown, nothing else. Kept inside the frame near the edges.
 */
export function paintHead(head: Point, t: number): void {
  const c = ctx,
    king = leaders(1)[0];
  // Squash on the bite, then a small spring back.
  const b = game.bite,
    squash = b < 0.25 ? 1 + 0.22 * Math.sin((b / 0.25) * Math.PI) * (1 - b / 0.25) : 1;
  if (!king) {
    crown(head.x, head.y - 24 + Math.sin(t * 4) * 2, 0.8, { x: head.x, y: head.y, r: 16 });
    return;
  }
  const r = 40 * squash,
    bob = Math.sin(t * 3) * 3,
    fx = Math.min(W - 60, Math.max(60, head.x)),
    fy = Math.max(r + 70, head.y - 64 + bob);
  // Stem from the head up to the face.
  c.save();
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
  c.restore();
  paintFace(king, fx, fy, r);
  crown(fx, fy - r - 12, 1.2, { x: fx, y: fy, r });
}

// ---- berries -------------------------------------------------------------------------------

// Perf: a berry's glow is a shadow blur, the most expensive canvas operation. It is baked once
// into 32 beat frames and every berry on the board just copies its frame.
const BERRY_R = 44,
  BERRY_FRAMES = 32,
  berrySprites: HTMLCanvasElement[] = [];

export function berrySprite(phase: number): HTMLCanvasElement {
  const cached = berrySprites[phase];
  if (cached) return cached;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = BERRY_R * 2;
  const g = sprite.getContext('2d');
  if (!g) return sprite;
  const beat = 1 + 0.09 * Math.sin((phase / BERRY_FRAMES) * Math.PI * 2),
    s = K;
  g.translate(BERRY_R, BERRY_R);
  g.globalAlpha = 0.35 + 0.15 * Math.sin((phase / BERRY_FRAMES) * Math.PI * 2);
  g.strokeStyle = berryTint(null);
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, 24 * beat * s, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  g.shadowColor = berryGlow(0.9, null);
  g.shadowBlur = 20;
  g.fillStyle = berryTint(null);
  g.beginPath();
  g.arc(0, 0, 17 * beat * s, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,246,228,0.55)';
  g.beginPath();
  g.arc(-5 * s, -5 * s, 5 * s, 0, Math.PI * 2);
  g.fill();
  berrySprites[phase] = sprite;
  return sprite;
}

function berry(x: number, y: number, t: number, size = 1): void {
  const phase =
    ((Math.round(((t * 3.4) / (Math.PI * 2)) * BERRY_FRAMES) % BERRY_FRAMES) + BERRY_FRAMES) %
    BERRY_FRAMES;
  const r = BERRY_R * size;
  ctx.drawImage(berrySprite(phase), x - r, y - r, r * 2, r * 2);
}

export function paintBerries(): void {
  const c = ctx;
  for (const b of game.berries.values()) {
    const cell = cellAt(b.at),
      to = px(cell.x, cell.y);
    if (b.t >= FALL_TIME) {
      // Lands with a little bounce.
      const k = b.t - FALL_TIME,
        bounce = k < 0.3 ? Math.sin((k / 0.3) * Math.PI) * 8 * (1 - k / 0.3) : 0;
      berry(to.x, to.y - bounce, b.t);
      continue;
    }
    // Leaves the dispenser in an arc, carrying its giver's face; its shadow closes in on the cell.
    const u = b.t / FALL_TIME,
      e = u * u;
    const x = DROP_FROM.x + (to.x - DROP_FROM.x) * u,
      y = DROP_FROM.y + (to.y - DROP_FROM.y) * e - Math.sin(u * Math.PI) * 110;
    c.save();
    c.globalAlpha = 0.25 * u;
    c.fillStyle = '#0b120d';
    c.beginPath();
    c.ellipse(to.x, to.y + 8, 8 + 10 * u, 3 + 3 * u, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    berry(x, y, b.t, 0.7 + 0.3 * u);
  }
}

export function paintBites(): void {
  const c = ctx;
  for (const s of game.sparks) {
    const p = px(s.x, s.y),
      k = 1 - s.t / s.life;
    c.save();
    c.globalAlpha = k;
    c.fillStyle = s.gold ? GOLD : berryTint(null);
    c.beginPath();
    c.arc(p.x, p.y, 3 + 4 * k, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  for (const pop of game.pops) {
    const at = px(pop.x, pop.y),
      u = pop.t / 0.9;
    c.save();
    c.globalAlpha = 1 - u;
    c.strokeStyle = berryTint(null);
    c.lineWidth = 5 * (1 - u) + 1;
    c.beginPath();
    c.arc(at.x, at.y, 16 + 46 * Math.sqrt(u), 0, Math.PI * 2);
    c.stroke();
    // "+1" rising with the giver's face.
    const y = at.y - 34 - 44 * u;
    c.fillStyle = '#fff';
    c.font = `900 28px ${FONT}`;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.lineWidth = 5;
    c.strokeStyle = 'rgba(12,20,15,0.7)';
    c.strokeText('+1', at.x - 2, y);
    c.fillText('+1', at.x - 2, y);
    c.restore();
  }
}
