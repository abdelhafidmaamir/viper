// The welcome a viewer gets when they join: the first impression of the live. The berry flower's
// petals open around their photo, the way a gifter is framed in the flower, then a few petals come
// loose and drift away. The game remembers who has been here before, so a first visit and a return
// are greeted differently.

import { ctx } from '../engine/canvas.ts';

const STORAGE_KEY = 'viper-feed-visits',
  MAX_REMEMBERED = 5000;

let visits: Map<string, number> | null = null;
/** Visit number shown to each viewer this session: a viewer joining twice is not counted twice. */
const thisSession = new Map<string, number>();

function load(): Map<string, number> {
  if (visits) return visits;
  visits = new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (typeof saved === 'object' && saved !== null)
      for (const [name, n] of Object.entries(saved))
        if (typeof n === 'number' && n > 0) visits.set(name, n);
  } catch {
    /* no storage: every viewer is new this session, the welcome still works */
  }
  return visits;
}

/** Which visit this is for the viewer: 1 the first time they ever join, then 2, 3... */
export function visitNumber(nickname: string): number {
  const known = thisSession.get(nickname);
  if (known !== undefined) return known;
  const all = load(),
    n = (all.get(nickname) ?? 0) + 1;
  // Most recent last, so the oldest names are the ones forgotten past the cap.
  all.delete(nickname);
  all.set(nickname, n);
  thisSession.set(nickname, n);
  for (const old of all.keys()) {
    if (all.size <= MAX_REMEMBERED) break;
    all.delete(old);
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(all)));
  } catch {
    /* storage full or off: the welcome still shows */
  }
  return n;
}

/** For tests: forget everything. */
export function resetVisits(): void {
  visits = new Map();
  thisSession.clear();
}

const PETALS = 10;

const easeOutBack = (u: number): number => {
  const x = Math.min(1, Math.max(0, u)) - 1;
  return 1 + 2.4 * x * x * x + 1.4 * x * x;
};

/** One petal of the berry flower, pointing up from the origin. */
function petal(len: number, wide: number): void {
  const c = ctx,
    g = c.createLinearGradient(0, 0, 0, -len);
  g.addColorStop(0, 'rgb(200,84,110)');
  g.addColorStop(1, '#f6b8c4');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(wide, -len * 0.35, wide * 0.8, -len * 0.95, 0, -len);
  c.bezierCurveTo(-wide * 0.8, -len * 0.95, -wide, -len * 0.35, 0, 0);
  c.fill();
  c.strokeStyle = 'rgba(255,235,240,0.35)';
  c.lineWidth = 1.2;
  c.stroke();
}

/** Petals opening around a photo of radius r at (x, y), `age` seconds after the card appeared. */
export function paintBloom(x: number, y: number, r: number, age: number, t: number): void {
  const c = ctx;
  c.save();
  c.translate(x, y);
  // A soft pink glow behind the flower, like the berry flower's.
  const open = easeOutBack((age - 0.08) / 0.7),
    halo = c.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.6);
  halo.addColorStop(0, `rgba(246,184,196,${String(0.45 * Math.min(1, open))})`);
  halo.addColorStop(1, 'rgba(246,184,196,0)');
  c.fillStyle = halo;
  c.beginPath();
  c.arc(0, 0, r * 2.6, 0, Math.PI * 2);
  c.fill();
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < PETALS; i++) {
      // Each petal opens a beat after the previous one, with a soft spring, then breathes.
      const o = easeOutBack((age - 0.08 - i * 0.035) / 0.55);
      if (o <= 0) continue;
      const a =
          (i / PETALS) * Math.PI * 2 + (pass ? Math.PI / PETALS : 0) + 0.03 * Math.sin(t * 2 + i),
        len = (r * 0.7 + r * 1.3 * o) * (pass ? 0.78 : 1) * (1 + 0.03 * Math.sin(t * 2.4 + i)),
        wide = r * (0.4 + 0.22 * o);
      c.save();
      c.rotate(a);
      petal(len, wide);
      c.restore();
    }
  c.restore();
}

/**
 * Petals come loose from the bloom and drift to the right along the card's top and bottom edges,
 * never over the text: `count` petals, reaching up to `reach` from the photo, the card being
 * `halfH` tall on each side of its middle. Over the card's stay they settle and sway there.
 */
export function paintLoosePetals(
  x: number,
  y: number,
  r: number,
  age: number,
  count: number,
  halfH: number,
  reach: number,
): void {
  const c = ctx;
  for (let i = 0; i < count; i++) {
    const s = age - 0.7 - i * 0.12;
    if (s <= 0) continue;
    // Alternate top and bottom; each petal goes a little further than the one before.
    const top = i % 2 === 0,
      k = (i + 1) / count,
      travel = 1 - Math.exp(-s * 1.4),
      px = x + r * 0.6 + travel * reach * (0.25 + 0.75 * k) + Math.sin(s * 1.5 + i) * 6,
      py =
        y +
        (top ? -1 : 1) * (halfH + 10 + (i % 3) * 5) * Math.min(1, s * 2.5 + 0.35) +
        Math.sin(s * 2.1 + i * 2) * 4;
    c.save();
    c.globalAlpha *= Math.min(1, s / 0.25);
    c.translate(px, py);
    c.rotate(0.8 + i + s * (0.7 + (i % 4) * 0.15));
    petal(r * 0.75, r * 0.38);
    c.restore();
  }
}
