// Everything that sits on the board besides the snakes: berries (with their offering glow),
// rocks and brambles, each pre-rendered once into a sprite and reused every frame.

import { ctx, setCtx } from './canvas.ts';
import { CELL, X0, Y0 } from './layout.ts';
import { berryGlow, berryTint } from './palette.ts';
import {
  STONE_WARNING,
  SEED_GROW_TIME,
  BRAMBLE_WARNING,
  STONE_LIFE,
  BRAMBLE_LIFE,
} from './rules.ts';
import type { Bramble, BrambleSegment, Point, Team } from './types.ts';
import { berries, seeds, settings, stones, brambles } from '../scripts/game.ts';

/** Convert grid coordinates to the canvas pixel center of that cell. */
const px = (gx: number, gy: number): Point => ({
  x: X0 + gx * CELL + CELL / 2,
  y: Y0 + gy * CELL + CELL / 2,
});

// What viewers offer: the seed falls, the shadow closes in, the berry opens.
const BERRY_SPRITE_R = 58,
  BERRY_FRAMES = 48,
  berryCache = new Map<string, HTMLCanvasElement>();

function berrySprite(phase: number, team: Team | null | undefined): HTMLCanvasElement {
  const key = `${String(phase)}d${team ?? ''}`;
  const cached = berryCache.get(key);
  if (cached) return cached;
  const sinVal = Math.sin((phase / BERRY_FRAMES) * Math.PI * 2),
    beatScale = 1 + 0.09 * sinVal;
  const s = document.createElement('canvas');
  s.width = 2 * BERRY_SPRITE_R;
  s.height = 2 * BERRY_SPRITE_R;
  // getContext never returns null for an in-memory canvas element.
  const ctx2dB = s.getContext('2d');
  if (!ctx2dB) return s;
  const prev = setCtx(ctx2dB);
  ctx.translate(BERRY_SPRITE_R, BERRY_SPRITE_R);
  try {
    ctx.globalAlpha = 0.35 + 0.15 * sinVal;
    ctx.strokeStyle = berryTint(team);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 24 * beatScale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowColor = berryGlow(0.9, team);
    ctx.shadowBlur = 26;
    ctx.fillStyle = berryTint(team);
    ctx.beginPath();
    ctx.arc(0, 0, 17 * beatScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,246,228,0.55)';
    ctx.beginPath();
    ctx.arc(-5, -5, 5, 0, Math.PI * 2);
    ctx.fill();
  } finally {
    setCtx(prev);
  }
  berryCache.set(key, s);
  return s;
}

export function paintOfferings(): void {
  seeds.forEach((g) => {
    const p = px(g.x, g.y),
      u = Math.min(1, g.t / SEED_GROW_TIME),
      fall = Math.min(1, u / 0.7);
    if (fall < 1) {
      const y = p.y - CELL * 3.2 * (1 - fall) * (1 - fall);
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.3 * fall;
      ctx.fillStyle = '#0b120d';
      ctx.beginPath();
      ctx.ellipse(p.y ? p.x : p.x, p.y + 6, 10 + 8 * fall, 3 + 2 * fall, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowColor = berryGlow(0.8, g.team);
      ctx.shadowBlur = 20;
      ctx.fillStyle = berryTint(g.team);
      ctx.beginPath();
      ctx.arc(p.x, y, 5 + 3 * fall, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      const s = (u - 0.7) / 0.3;
      ctx.save();
      ctx.strokeStyle = 'rgba(159,199,164,0.85)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 12);
      ctx.lineTo(p.x, p.y + 12 - 14 * s);
      ctx.stroke();
      ctx.shadowColor = berryGlow(0.9, g.team);
      ctx.shadowBlur = 24;
      ctx.fillStyle = berryTint(g.team);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
  berries.forEach((b) => {
    const p = px(b.x, b.y);
    // All berries beat at the same rhythm, offset by their age: the drawing depends only
    // on the beat phase. 48 frames are shared by all berries on the board.
    // This is where the real cost lies: `shadowBlur` is the most expensive canvas 2D
    // operation, and it was paid once PER BERRY PER FRAME. It is now baked into the
    // sprite, paid 48 times for the entire match.
    const phase =
      ((Math.round(((b.t * 3.4) / (Math.PI * 2)) * BERRY_FRAMES) % BERRY_FRAMES) + BERRY_FRAMES) %
      BERRY_FRAMES;
    ctx.drawImage(
      berrySprite(phase, b.team),
      Math.round(p.x) - BERRY_SPRITE_R,
      Math.round(p.y) - BERRY_SPRITE_R,
    );
  });
}

// Stone emergence: nothing falls from the sky. The ground bulges, moss lifts,
// then the stone rises out of the soil. The warning stays readable; the gesture feels organic.
export function bump(x: number, y: number, rx: number, ry: number, force: number): void {
  const g = ctx.createRadialGradient(x, y - ry * 0.35, rx * 0.12, x, y, rx);
  g.addColorStop(0, `rgba(58,70,56,${String(0.55 * force)})`);
  g.addColorStop(0.55, `rgba(35,45,36,${String(0.5 * force)})`);
  g.addColorStop(1, 'rgba(20,30,23,0)');
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Soil plates: the ground surface splits into wedges that tilt outward.
// Each rotates around its inner edge, so the stone appears to force through, not slide.
export function plates(x: number, y: number, opening: number, j: number): void {
  for (let i = 0; i < 4; i++) {
    const an = (i / 4) * Math.PI * 2 + j * 0.21,
      r0 = 9,
      r1 = 20 + 13 * opening;
    const baseRatio = 0.34 + 0.06 * ((i + j + 8) % 3); // unequal wedges, none is the mirror of another
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.46);
    ctx.rotate(an);
    ctx.beginPath();
    ctx.moveTo(r0, -r0 * baseRatio);
    ctx.lineTo(r1, -r1 * baseRatio * 0.9);
    ctx.lineTo(r1, r1 * baseRatio * 0.9);
    ctx.lineTo(r0, r0 * baseRatio);
    ctx.closePath();
    ctx.fillStyle = `rgba(31,40,32,${String(0.62 + 0.28 * opening)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(150,180,140,${String(0.26 * opening)})`;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }
}

// Crack: three dark branches opening from the center before anything breaks the surface.
export function crack(x: number, y: number, opening: number, j: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.46);
  ctx.strokeStyle = `rgba(6,10,7,${String(0.75 * Math.min(1, opening * 2))})`;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const an = (i / 3) * Math.PI * 2 + j * 0.4,
      LL = 13 + 20 * opening;
    ctx.lineWidth = 3.2 - 1.1 * i * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(
      Math.cos(an + 0.3) * LL * 0.55,
      Math.sin(an + 0.3) * LL * 0.55,
      Math.cos(an) * LL,
      Math.sin(an) * LL,
    );
    ctx.stroke();
  }
  ctx.restore();
}

// A clod torn from the stone's flank: it rolls, falls, and settles at the base.
function clod(x: number, y: number, k: number, i: number, j: number): void {
  if (k <= 0 || k >= 1) return;
  const side = i % 2 ? 1 : -1,
    d = 8 + 5 * ((i + j + 5) % 3);
  const px2 = x + side * d * (0.4 + 0.6 * k),
    py2 = y - 16 + 34 * k * k;
  ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
  ctx.fillStyle = '#2a3529';
  ctx.beginPath();
  ctx.ellipse(px2, py2, 3.4 - 1.2 * k, 2.8 - 1 * k, side * k * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Grain hash, same principle as ambience: deterministic noise, so a stone always has
// exactly the same shape and moss as long as it stays at the same position.
const HASH = (i: number, d: number): number => {
  const v = Math.sin((i + 1) * 12.9898 + (d + 7) * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/** Light descriptor derived from the current hour. */
interface LightInfo {
  readonly x: number;
  readonly y: number;
  readonly k: number;
  readonly tint: string;
}

// A single light for everything on the ground, derived from the ambience keys: it comes
// from the left at sunrise, from zenith at noon, from the right at sunset, and is dim
// and cold at night. Without it, an object looks like a flat sticker on a painted image.
export function light(): LightInfo {
  const h = (((settings.hour || 0) % 1) + 1) % 1;
  const daylight = Math.max(0, Math.min(1, (Math.cos((h - 0.5) * Math.PI * 2) + 0.35) / 1.35));
  const an = Math.PI * (-0.82 + 0.62 * Math.min(1, Math.max(0, (h - 0.2) / 0.58)));
  const warm = [248, 226, 186],
    cool = [164, 192, 214];
  const tint = warm.map((c, i) => Math.round(c + ((cool[i] ?? 0) - c) * (1 - daylight)));
  return { x: Math.cos(an), y: Math.sin(an), k: 0.28 + 0.72 * daylight, tint: tint.join(',') };
}

/** A vertex on the stone silhouette. */
interface StonePt {
  readonly x: number;
  readonly y: number;
  readonly an: number;
}

// Stone: an irregular silhouette with eleven vertices, two sharp facet planes, a crack
// lit on one side, grain, moss on the lit side, and a light rim running only
// on edges facing the light source.
function stonePoints(j: number, scale?: number): StonePt[] {
  const n = 11,
    R = 23 * (scale ?? 1),
    pts: StonePt[] = [];
  for (let i = 0; i < n; i++) {
    const an = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = R * (0.8 + 0.28 * HASH(i, j));
    pts.push({ x: Math.cos(an) * r, y: Math.sin(an) * r * 0.9 + 2, an });
  }
  return pts;
}

function traceStone(pts: readonly StonePt[]): void {
  const first = pts[0];
  if (first === undefined) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const pt = pts[i];
    if (pt === undefined) continue;
    ctx.lineTo(pt.x, pt.y);
  }
  ctx.closePath();
}

function stoneBody(j: number): void {
  const LL = light(),
    pts = stonePoints(j);
  // body: a gradient oriented by the light, from the lit flank to the shadow flank
  traceStone(pts);
  const g = ctx.createLinearGradient(-26 * LL.x, -26 * LL.y, 26 * LL.x, 26 * LL.y);
  g.addColorStop(0, '#7c8798');
  g.addColorStop(0.44, '#4f5a6c');
  g.addColorStop(1, '#212934');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  traceStone(pts);
  ctx.clip();
  // top facet, sharply broken: it gives the volume, not a lighter surface
  ctx.beginPath();
  ctx.moveTo(-28, -4 + 1.5 * j);
  ctx.lineTo(-5, -16);
  ctx.lineTo(13, -10 + j);
  ctx.lineTo(28, -3);
  ctx.lineTo(28, -34);
  ctx.lineTo(-28, -34);
  ctx.closePath();
  const g2 = ctx.createLinearGradient(0, -26, 0, 2);
  g2.addColorStop(0, `rgba(${LL.tint},${String(0.34 * LL.k)})`);
  g2.addColorStop(1, `rgba(${LL.tint},0)`);
  ctx.fillStyle = g2;
  ctx.fill();
  // crack: carved with a dark stroke, highlighted with a light stroke on the lit side
  ctx.strokeStyle = 'rgba(14,18,24,0.72)';
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6 + 2 * j, -15);
  ctx.quadraticCurveTo(2, -2, -2 + j, 17);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${LL.tint},${String(0.2 * LL.k)})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6 + 2 * j - 1.4 * LL.x, -15 - 1.4 * LL.y);
  ctx.quadraticCurveTo(2 - 1.4 * LL.x, -2 - 1.4 * LL.y, -2 + j - 1.4 * LL.x, 17 - 1.4 * LL.y);
  ctx.stroke();
  // grain: fourteen flecks, half dark half light, always the same
  for (let i = 0; i < 14; i++) {
    const an = HASH(i, j) * Math.PI * 2,
      r = HASH(i + 9, j) * 19;
    ctx.globalAlpha = 0.09 + 0.09 * HASH(i + 3, j);
    ctx.fillStyle = i % 2 ? '#0d1218' : '#a9b5c5';
    ctx.beginPath();
    ctx.arc(Math.cos(an) * r, Math.sin(an) * r * 0.88, 0.8 + 1.2 * HASH(i + 5, j), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // moss: three tufts on top, on the lit side, with a lighter tip
  for (let i = 0; i < 3; i++) {
    const an = -Math.PI / 2 + (HASH(i + 2, j) - 0.5) * 1.6,
      r = 9 + 6 * HASH(i + 7, j);
    const x = Math.cos(an) * r + LL.x * 4,
      y = Math.sin(an) * r * 0.8;
    ctx.fillStyle = 'rgba(78,110,66,0.58)';
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + 2.6 * HASH(i, j), 2.3 + 1.2 * HASH(i + 1, j), an, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(148,182,126,0.26)';
    ctx.beginPath();
    ctx.ellipse(x - LL.x * 1.2, y - 1.4, 2.4 + 1.3 * HASH(i, j), 1.2, an, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // rim: only edges whose normal faces the light
  ctx.strokeStyle = `rgba(${LL.tint},${String(0.46 * LL.k)})`;
  ctx.lineWidth = 2.1;
  ctx.lineJoin = 'round';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    if (p === undefined || q === undefined) continue;
    const mx = (p.x + q.x) / 2,
      my = (p.y + q.y) / 2;
    const n = Math.hypot(mx, my) || 1;
    if ((mx / n) * LL.x + (my / n) * LL.y > 0.15) continue; // edge in shadow, no rim
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
}

// Stone sprite cache. A stone's body depends only on its variant `j` and the light,
// never on its position or emergence animation, which are transforms applied by the caller.
// It was previously repainted entirely each frame, per stone: two gradients, a clip,
// fourteen grain flecks, six moss ellipses and eleven rim edges. Measured by profiler at
// `routines/profil-rendu.js`: 2170 of 4582 canvas operations per frame, i.e. 47%.
// It is now painted once per variant and per light level into an offscreen canvas.
const STONE_SPRITE_R = 40,
  stoneCache = new Map<number, HTMLCanvasElement>();

let stoneCacheKey: number | null = null;

function stoneSprite(j: number): HTMLCanvasElement {
  const key = Math.round(((((settings.hour || 0) % 1) + 1) % 1) * 180);
  if (key !== stoneCacheKey) {
    stoneCache.clear();
    stoneCacheKey = key;
  }
  const cached = stoneCache.get(j);
  if (cached) return cached;
  const s = document.createElement('canvas');
  s.width = 2 * STONE_SPRITE_R;
  s.height = 2 * STONE_SPRITE_R;
  // getContext never returns null for an in-memory canvas element.
  const ctx2dS = s.getContext('2d');
  if (!ctx2dS) return s;
  const prev = setCtx(ctx2dS);
  ctx.translate(STONE_SPRITE_R, STONE_SPRITE_R);
  try {
    stoneBody(j);
  } finally {
    setCtx(prev);
  }
  stoneCache.set(j, s);
  return s;
}

// Replaces a stoneBody call: same drawing, same origin, a single canvas operation.
function placeStone(j: number): void {
  ctx.drawImage(stoneSprite(j), -STONE_SPRITE_R, -STONE_SPRITE_R);
}

export function paintStones(): void {
  stones.forEach((r) => {
    const p = px(r.x, r.y),
      j = ((r.x * 13 + r.y * 7) % 7) - 3;
    if (r.t < STONE_WARNING) {
      const u = r.t / STONE_WARNING,
        rise = u * u * (3 - 2 * u); // smoothstep bulge
      // Stone breaks early and the rise has a hitch: it pushes, slips slightly around 60%,
      // then breaks through. That pause makes it feel heavy rather than springing.
      const exitProgress = Math.max(0, (u - 0.18) / 0.82);
      let emergeAmount = exitProgress * exitProgress * (3 - 2 * exitProgress);
      emergeAmount -=
        0.085 *
        Math.max(0, Math.sin(Math.min(1, Math.max(0, (exitProgress - 0.46) / 0.26)) * Math.PI));
      emergeAmount = Math.max(0, Math.min(1, emergeAmount));
      ctx.save();
      // drop shadow of the mound, lengthening as it rises
      ctx.globalAlpha = 0.3 * rise;
      ctx.fillStyle = '#050907';
      ctx.beginPath();
      ctx.ellipse(p.x + 6 * rise, p.y + 13, 26 * rise + 6, 8 * rise + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // ground lifting, then cracking
      bump(p.x, p.y + 6, 20 + 14 * rise, 9 + 9 * rise, rise);
      crack(p.x, p.y + 4, rise, j);
      // stone emerges: clip to show only what rises above ground level
      if (emergeAmount > 0.001) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.x - 42, p.y - 48, 84, 48 + 12);
        ctx.clip();
        ctx.translate(p.x, p.y + 34 * (1 - emergeAmount));
        ctx.rotate((1 - emergeAmount) * 0.22 * (j > 0 ? 1 : -1));
        ctx.scale(0.86 + 0.14 * emergeAmount, 0.86 + 0.14 * emergeAmount);
        placeStone(j);
        ctx.restore();
      }
      // soil plates tip over the stone's base: the stone is forcing through
      plates(p.x, p.y + 5, rise, j);
      // clods torn free roll down the flank during emergence
      for (let i = 0; i < 3; i++) clod(p.x, p.y, (emergeAmount - (0.3 + 0.16 * i)) / 0.42, i, j);
      ctx.restore();
      return;
    }
    // once emerged, a sharp settle: downward only, no bounce
    const d = r.t - STONE_WARNING,
      k = d < 0.18 ? Math.sin((d / 0.18) * Math.PI) : 0;
    const sx = 1 + 0.05 * k,
      sy = 1 - 0.08 * k;
    const f = r.t > STONE_LIFE - 2 ? (STONE_LIFE - r.t) / 2 : 1;
    ctx.save();
    // disturbed earth remains visible at the base, then settles
    ctx.globalAlpha = f * (d < 1.4 ? 1 - d / 1.4 : 0) * 0.8;
    if (ctx.globalAlpha > 0.01) bump(p.x, p.y + 8, 30, 14, 0.7);
    // ring of dust thrown by the impact
    if (d < 0.45) {
      const q = d / 0.45;
      ctx.globalAlpha = f * (1 - q) * 0.42;
      ctx.strokeStyle = 'rgba(168,176,150,1)';
      ctx.lineWidth = 3 - 2 * q;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 13, 20 + 34 * q, 7 + 12 * q, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = f * 0.45;
    ctx.fillStyle = '#050907';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 15, 21 * sx, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = f;
    ctx.translate(p.x, p.y);
    ctx.scale(sx, sy);
    placeStone(j);
    ctx.restore();
  });
}

// Bramble: a vine, not a line. The body is a filled outline, thick at the root and thin at
// the tip, with a contact shadow on the ground, a light ribbon on the source side,
// veined leaves and hooked thorns that appear only on the lethal segment.

/** A computed point along a bramble vine. */
interface BramblePt {
  x: number;
  y: number;
  readonly duration: boolean;
  eyeOpen: number;
  readonly i: number;
}

function bramblePoints(R: Bramble): BramblePt[] {
  const pts: BramblePt[] = [];
  R.seg.forEach((g: BrambleSegment, i: number) => {
    const p = px(g.x, g.y),
      u = Math.min(1, g.t / BRAMBLE_WARNING),
      opening = u * u * (3 - 2 * u);
    const v = R.seg[i - 1] ?? R.seg[i + 1];
    if (!v || opening >= 1) {
      pts.push({ x: p.x, y: p.y, duration: u >= 1, eyeOpen: opening, i });
      return;
    }
    const q = px(v.x, v.y);
    pts.push({
      x: q.x + (p.x - q.x) * opening,
      y: q.y + (p.y - q.y) * opening,
      duration: false,
      eyeOpen: opening,
      i,
    });
  });
  return pts;
}

// Stem outline: traverse the line on one side, return on the other; half-thickness
// decreases toward the tip. This makes it read as a plant, not a constant-width tube.
function brambleOutline(pts: BramblePt[], thickness: number, dx = 0, dy = 0): void {
  const n = pts.length;
  const normal = (i: number): { x: number; y: number } => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const vx = (b?.x ?? 0) - (a?.x ?? 0),
      vy = (b?.y ?? 0) - (a?.y ?? 0),
      l = Math.hypot(vx, vy) || 1;
    return { x: -vy / l, y: vx / l };
  };
  const e = (i: number): number =>
    thickness *
    (1 - 0.52 * (i / Math.max(1, n - 1))) *
    Math.min(1, 0.35 + 0.65 * (pts[i]?.eyeOpen ?? 0));
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const u = normal(i),
      w = e(i);
    const pt = pts[i];
    const x = (pt?.x ?? 0) + u.x * w + dx,
      y = (pt?.y ?? 0) + u.y * w + dy;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  for (let i = n - 1; i >= 0; i--) {
    const u = normal(i),
      w = e(i);
    const pt = pts[i];
    ctx.lineTo((pt?.x ?? 0) - u.x * w + dx, (pt?.y ?? 0) - u.y * w + dy);
  }
  ctx.closePath();
}

export function leaf(
  x: number,
  y: number,
  an: number,
  L: number,
  bright: boolean,
  f: number,
  opening: number,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(an);
  ctx.globalAlpha = f * Math.min(1, opening * 1.2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(L * 0.5, -L * 0.34, L, 0);
  ctx.quadraticCurveTo(L * 0.5, L * 0.34, 0, 0);
  ctx.fillStyle = bright ? '#46603a' : '#2c3d25';
  ctx.fill();
  ctx.strokeStyle = 'rgba(158,190,138,0.30)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(L * 0.08, 0);
  ctx.lineTo(L * 0.86, 0);
  ctx.stroke();
  ctx.restore();
}

function thorn(x: number, y: number, an: number, L: number, tint: string, f: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(an);
  ctx.globalAlpha = f * 0.92;
  ctx.beginPath();
  ctx.moveTo(0, -2.4);
  ctx.quadraticCurveTo(L * 0.72, -L * 0.3, L, -L * 0.06); // hook, curved backward
  ctx.quadraticCurveTo(L * 0.52, L * 0.12, 0, 2.4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, L, 0);
  g.addColorStop(0, '#5d7a4c');
  g.addColorStop(1, 'rgba(' + tint + ',0.92)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

// Bramble sprite cache. A vine's drawing depends only on its nodes, their opening, its
// fade `f` and the light: never on time passing. It was fully rebuilt each frame:
// two leaves and three thorns per node, each with its own save, rotation and curves.
// Measured by profiler: 1406 of 4582 canvas operations per frame, i.e. 31%.
// A settled bramble no longer moves, so its sprite is repainted only on opening and on death.
// The offset is integer so the blit is pixel-exact and not resampled.
const BRAMBLE_MARGIN = 26;

export function paintBrambles(): void {
  const LL = light();
  const lightKey = Math.round(((((settings.hour || 0) % 1) + 1) % 1) * 180);
  brambles.forEach((R) => {
    const f = R.t > BRAMBLE_LIFE - 2 ? (BRAMBLE_LIFE - R.t) / 2 : 1;
    const pts = bramblePoints(R);
    if (pts.length < 1) return;
    let ax = Infinity,
      ay = Infinity,
      bx = -Infinity,
      by = -Infinity;
    for (const p of pts) {
      if (p.x < ax) ax = p.x;
      if (p.x > bx) bx = p.x;
      if (p.y < ay) ay = p.y;
      if (p.y > by) by = p.y;
    }
    const ox = Math.floor(ax - BRAMBLE_MARGIN),
      oy = Math.floor(ay - BRAMBLE_MARGIN);
    let signature = `${String(lightKey)}|${f.toFixed(2)}|${String(ox)}|${String(oy)}|${String(pts.length)}`;
    for (const q of pts)
      signature += `|${String(Math.round(q.eyeOpen * 24))}${q.duration ? 'd' : ''}`;
    if (R.sig !== signature) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(bx + BRAMBLE_MARGIN) - ox);
      c.height = Math.max(1, Math.ceil(by + BRAMBLE_MARGIN) - oy);
      // getContext never returns null for an in-memory canvas element.
      const ctx2dC = c.getContext('2d');
      if (!ctx2dC) return;
      const prev = setCtx(ctx2dC);
      ctx.translate(-ox, -oy);
      try {
        brambleBody(pts, f, LL, R);
      } finally {
        setCtx(prev);
      }
      R.sprite = c;
      R.sig = signature;
    }
    if (R.sprite) ctx.drawImage(R.sprite, ox, oy);
  });
}

function brambleBody(pts: BramblePt[], f: number, LL: LightInfo, R: Bramble): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // contact shadow: same stem shifted onto the ground, blurred by an alpha step
  ctx.globalAlpha = f * 0.42;
  ctx.fillStyle = '#070c07';
  brambleOutline(pts, 8.5, 2.5, 6);
  ctx.fill();
  ctx.globalAlpha = f * 0.22;
  brambleOutline(pts, 11, 3.5, 9);
  ctx.fill();
  // body, gradient along the vine: dark at the root, greener toward the live tip
  ctx.globalAlpha = f;
  const q0 = pts[0],
    q1 = pts[pts.length - 1];
  const gb = ctx.createLinearGradient(q0?.x ?? 0, q0?.y ?? 0, q1?.x ?? 0, q1?.y ?? 0);
  gb.addColorStop(0, '#1b2616');
  gb.addColorStop(0.55, '#26331d');
  gb.addColorStop(1, '#354823');
  brambleOutline(pts, 8);
  ctx.fillStyle = gb;
  ctx.fill();
  // light ribbon on the source side, narrower than the body
  ctx.globalAlpha = f * (0.3 + 0.34 * LL.k);
  brambleOutline(pts, 3.1, LL.x * 2.6, LL.y * 2.6);
  ctx.fillStyle = 'rgba(' + LL.tint + ',0.55)';
  ctx.fill();
  // leaves: two per node, never symmetric, the bright one on the lit side
  pts.forEach((p, i) => {
    const v = pts[i - 1] ?? pts[i + 1] ?? p;
    const an = Math.atan2(p.y - v.y, p.x - v.x),
      h = HASH(i, R.seg.length);
    for (let k = 0; k < 2; k++) {
      const side = k ? 1 : -1;
      const leafAngle = an + side * (0.78 + 0.34 * h);
      const bright = Math.cos(leafAngle) * LL.x + Math.sin(leafAngle) * LL.y < 0;
      leaf(p.x, p.y, leafAngle, 8.5 + 3.5 * HASH(i + k, 3), bright, f, p.eyeOpen);
    }
  });
  // thorns: only on the live segment. They are the only signal that it kills.
  pts.forEach((p, i) => {
    if (!p.duration) return;
    const v = pts[i - 1] ?? pts[i + 1] ?? p;
    const an = Math.atan2(p.y - v.y, p.x - v.x);
    for (let k = 0; k < 3; k++) {
      const leafAngle = an + (k === 1 ? -Math.PI / 2 : Math.PI / 2) + (k - 1) * 0.38;
      thorn(p.x, p.y, leafAngle, 7.5 + 2 * HASH(i + k, 5), LL.tint, f);
    }
  });
  ctx.restore();
}
