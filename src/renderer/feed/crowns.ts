// The other crowns the control room can pick for the round's top giver. Same material as the
// classic crown in paint.ts: a gold gradient, a dark rim and a red jewel. Each one is drawn around
// the photo it belongs to, so it fits whatever size that photo is drawn at.

import type { CrownStyle } from '../../shared/feed-protocol.ts';

/** A photo: its centre and its radius, in the coordinates it was painted in. */
export interface Face {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

type Ctx = CanvasRenderingContext2D;

const RIM = 'rgba(12,20,15,0.92)';
const JEWEL = '#e8455a';

function gold(c: Ctx, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, '#fff4c2');
  g.addColorStop(0.55, '#ffd24a');
  g.addColorStop(1, '#e08a1e');
  return g;
}

interface Leaf {
  readonly x: number;
  readonly y: number;
  /** Direction from the foot to the tip. */
  readonly a: number;
  readonly len: number;
  readonly wide: number;
}

function leafPath(c: Ctx, len: number, wide: number): void {
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(len * 0.3, -wide, len * 0.75, -wide * 0.8, len, 0);
  c.bezierCurveTo(len * 0.75, wide * 0.8, len * 0.3, wide, 0, 0);
  c.closePath();
}

/** All the rims first, then all the fills: the whole branch keeps one clean dark outline. */
function paintLeaves(c: Ctx, leaves: readonly Leaf[], rim: number): void {
  for (const pass of ['rim', 'fill'] as const)
    for (const l of leaves) {
      c.save();
      c.translate(l.x, l.y);
      c.rotate(l.a);
      leafPath(c, l.len, l.wide);
      if (pass === 'rim') {
        c.lineWidth = rim;
        c.lineJoin = 'round';
        c.strokeStyle = RIM;
        c.stroke();
      } else {
        c.fillStyle = gold(c, l.len, -l.wide, 0, l.wide);
        c.fill();
        // The vein.
        c.beginPath();
        c.moveTo(l.len * 0.12, 0);
        c.lineTo(l.len * 0.82, 0);
        c.lineWidth = Math.max(0.8, l.wide * 0.16);
        c.strokeStyle = 'rgba(176,104,20,0.55)';
        c.stroke();
      }
      c.restore();
    }
}

function jewel(c: Ctx, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.lineWidth = r * 0.7;
  c.strokeStyle = RIM;
  c.stroke();
  c.fillStyle = JEWEL;
  c.fill();
  c.beginPath();
  c.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fill();
}

/** A winner's wreath: two branches rising from under the photo, open at the top. */
function laurel(c: Ctx, { x, y, r }: Face): void {
  const leaves: Leaf[] = [],
    R = r * 1.2;
  for (const side of [-1, 1])
    for (let i = 0; i < 7; i++) {
      const th = Math.PI / 2 + side * (0.22 + i * 0.335),
        px = x + Math.cos(th) * R,
        py = y + Math.sin(th) * R,
        along = th + (side * Math.PI) / 2,
        size = 1 - i * 0.05;
      // Two leaves per step, one leaning out and one in, for a full branch.
      leaves.push({
        x: px,
        y: py,
        a: along - side * 0.62,
        len: r * 0.5 * size,
        wide: r * 0.17 * size,
      });
      leaves.push({
        x: px,
        y: py,
        a: along + side * 0.5,
        len: r * 0.42 * size,
        wide: r * 0.15 * size,
      });
    }
  paintLeaves(c, leaves, r * 0.11);
  jewel(c, x, y + R + r * 0.02, r * 0.13);
}

/** Five laurel leaves fanned over the photo, a jewel at their foot. */
function diadem(c: Ctx, { x, y, r }: Face): void {
  const foot = y - r * 0.98,
    leaves: Leaf[] = [];
  for (const [a, k] of [
    [-2.55, 0.74],
    [-0.59, 0.74],
    [-2.1, 0.9],
    [-1.04, 0.9],
    [-Math.PI / 2, 1.05],
  ] as const)
    leaves.push({ x, y: foot, a, len: r * 0.86 * k, wide: r * 0.27 * k });
  paintLeaves(c, leaves, r * 0.11);
  jewel(c, x, foot - r * 0.04, r * 0.17);
}

/** One gold star standing on the photo. */
function star(c: Ctx, { x, y, r }: Face): void {
  const cy = y - r * 1.42,
    R = r * 0.5;
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5,
      d = i % 2 ? R * 0.46 : R;
    c.lineTo(x + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = r * 0.16;
  c.strokeStyle = RIM;
  c.stroke();
  c.fillStyle = gold(c, x, cy - R, x, cy + R);
  c.fill();
  c.beginPath();
  c.arc(x - R * 0.18, cy - R * 0.2, R * 0.14, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,0.75)';
  c.fill();
}

/** The game's own flower in the crown's gold, open on top of the photo. */
function lotus(c: Ctx, { x, y, r }: Face): void {
  const foot = y - r * 0.92;
  // Angle, length and width of each petal, outer ones first so the middle one sits on top.
  const petals = [
    [-1.2, 0.6, 0.24],
    [1.2, 0.6, 0.24],
    [-0.62, 0.8, 0.27],
    [0.62, 0.8, 0.27],
    [0, 0.96, 0.3],
  ] as const;
  for (const pass of ['rim', 'fill'] as const)
    for (const [a, len, wide] of petals) {
      const L = r * len,
        w = r * wide;
      c.save();
      c.translate(x, foot);
      c.rotate(a);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(w, -L * 0.35, w * 0.8, -L * 0.95, 0, -L);
      c.bezierCurveTo(-w * 0.8, -L * 0.95, -w, -L * 0.35, 0, 0);
      if (pass === 'rim') {
        c.lineWidth = r * 0.11;
        c.lineJoin = 'round';
        c.strokeStyle = RIM;
        c.stroke();
      } else {
        c.fillStyle = gold(c, 0, -L, 0, 0);
        c.fill();
        c.lineWidth = Math.max(0.8, r * 0.022);
        c.strokeStyle = 'rgba(255,250,225,0.6)';
        c.stroke();
      }
      c.restore();
    }
}

const PAINTERS: Record<Exclude<CrownStyle, 'classic'>, (c: Ctx, face: Face) => void> = {
  laurel,
  diadem,
  star,
  lotus,
};

/** Paints a crown other than the classic one around `face`. */
export function paintCrownStyle(c: Ctx, style: Exclude<CrownStyle, 'classic'>, face: Face): void {
  c.save();
  PAINTERS[style](c, face);
  c.restore();
}
