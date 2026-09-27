/* snake-ending.ts : end-of-round snake, happy or sad.
   Fully procedural and deterministic, drawn with 2D canvas. No external dependencies.
   Internal units: R is 250; callers scale the context to R/250 before calling. */

import type { EndingOptions, EndingDrawOptions, TeamColors } from '../engine/types-api.ts';

const TAU = Math.PI * 2;
const R = 250;
const BODY = '#d9e7cc';
const HEAD = '#e8f1dc';
const EYE = '#1b2a1f';
const GOLD = '#F2C57C';
const BLUE = '#8FA8D8';

interface BodyPoint {
  x: number;
  y: number;
  w: number;
}
interface HeadRef {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

function cl(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}
function sm(x: number): number {
  x = cl(x, 0, 1);
  return x * x * (3 - 2 * x);
}
function el(x: number): number {
  /* elastic ease-out, for the bounce-back */
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 1 + Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (TAU / 3));
}
function hs(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function fraction(x: number): number {
  return x - Math.floor(x);
}
/* periodic pulse: zero before t0, then a sine bump of width `duration` every `per` seconds */
function pulse(t: number, t0: number, per: number, duration: number): number {
  if (t < t0) return 0;
  const ph = fraction((t - t0) / per) * per;
  return ph < duration ? Math.sin((Math.PI * ph) / duration) : 0;
}

/* ---------- body geometry, one parametric path function per state ---------- */

/* Happy: tail at the center of a spiral, neck rises out of the last loop,
   head curls inward like a question mark. */
function pathHappy(s: number, t: number): BodyPoint {
  const K = TAU * 1.55;
  const th = K - s * K;
  const r = R * (0.14 + 0.44 * s);
  let x = Math.cos(th) * r - R * 0.14;
  let y = Math.sin(th) * r + R * 0.08;
  let q = sm((s - 0.72) / 0.28);
  q = q * q;
  const lift =
    0.56 * el((t - 0.9) / 1.3) + 0.03 * Math.sin(t * 2.4); /* elastic rise, then breathing */
  y -= R * lift * q;
  x += R * 0.12 * q; /* keeps the neck outside the spiral */
  let p = sm((s - 0.9) / 0.1);
  p = p * p;
  x -=
    R *
    (0.2 + 0.04 * Math.sin(t * 2.4 + 1)) *
    p *
    sm((t - 1.4) / 1); /* head tilts, lagging behind the neck */
  const w =
    Math.sin(s * 9 - t * 3.2) * R * 0.024 * Math.sin(Math.PI * s); /* lateral wave, tail to head */
  return { x, y, w };
}

/* Sad: body flat on the ground, back barely arched, neck rises slightly then
   droops. Sighing swells and relaxes the neck slowly. */
function pathSad(s: number, t: number): BodyPoint {
  const dr = sm((t - 1.9) / 1.5); /* head lowers after entry */
  const sighAmount = sigh(t);
  let x = -0.72 * R + s * 1.34 * R;
  let y = 0.2 * R - 0.09 * R * Math.sin(Math.PI * cl(s / 0.62, 0, 1));
  const n = sm((s - 0.56) / 0.3);
  y -= R * (0.55 - 0.14 * dr + 0.06 * sighAmount) * n * n;
  let d = sm((s - 0.84) / 0.16);
  d = d * d;
  y += R * (0.4 - 0.05 * sighAmount) * d * dr;
  x -= R * 0.06 * d * dr;
  const w =
    Math.sin(s * 6 - t * 1.1) * R * 0.018 * Math.sin(Math.PI * s); /* slow, heavy lateral wave */
  return { x, y, w };
}
/* Draw: left snake rises toward center, face to face with its mirror;
   neutral gaze, small synchronous nod. */
function pFace(s: number, t: number): BodyPoint {
  let x = -1.0 * R + s * 0.72 * R;
  let y = 0.22 * R - 0.06 * R * Math.sin(Math.PI * cl(s / 0.6, 0, 1));
  const n = sm((s - 0.55) / 0.45);
  const n2 = n * n;
  y -= R * 0.5 * el((t - 0.8) / 1.3) * n2;
  x += R * 0.06 * n2;
  y += R * 0.035 * Math.sin(t * 1.5) * n2 * sm((t - 2) / 1);
  const w = Math.sin(s * 7 - t * 1.4) * R * 0.02 * Math.sin(Math.PI * s);
  return { x, y, w };
}
function sigh(t: number): number {
  /* short inhale, long exhale */
  if (t < 3) return 0;
  const ph = fraction((t - 3) / 5.5);
  return ph < 0.3 ? sm(ph / 0.3) : 1 - sm((ph - 0.3) / 0.7);
}

/* samples the curve up to `e`, offsets by the lateral wave, draws a single smooth stroke */
function paintBody(
  g: CanvasRenderingContext2D,
  fn: (s: number, t: number) => BodyPoint,
  t: number,
  e: number,
): HeadRef {
  const N = 56;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= N; i++) {
    const s = (e * i) / N;
    const a = fn(s, t);
    const b = fn(Math.min(s + 0.004, 1), t);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = Math.sqrt(dx * dx + dy * dy) || 1;
    pts.push({ x: a.x - (dy / L) * a.w, y: a.y + (dx / L) * a.w });
  }
  /* pts has N+1 = 57 elements: loop ran i=0..N, all indices 0..N are valid */
  const first = pts[0] ?? { x: 0, y: 0 };
  g.beginPath();
  g.moveTo(first.x, first.y);
  for (let i = 1; i < N; i++) {
    const m = pts[i] ?? { x: 0, y: 0 };
    const n = pts[i + 1] ?? { x: 0, y: 0 };
    g.quadraticCurveTo(m.x, m.y, (m.x + n.x) / 2, (m.y + n.y) / 2);
  }
  const tailPt = pts[N] ?? { x: 0, y: 0 };
  const prevPt = pts[N - 2] ?? { x: 0, y: 0 };
  g.lineTo(tailPt.x, tailPt.y);
  g.stroke();
  const dx = tailPt.x - prevPt.x;
  const dy = tailPt.y - prevPt.y;
  const L = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: tailPt.x, y: tailPt.y, dx: dx / L, dy: dy / L };
}

/* ---------- head, eyes, tongue ---------- */

function paintHead(
  g: CanvasRenderingContext2D,
  h: HeadRef,
  a: number,
  color: string | undefined,
): void {
  g.globalAlpha = a;
  g.fillStyle = color ?? HEAD;
  g.beginPath();
  g.arc(h.x, h.y, 23, 0, TAU);
  g.fill();
}

/* eyes live in the head's local frame: x toward front, y lateral */
function paintEyes(
  g: CanvasRenderingContext2D,
  h: HeadRef,
  happy: boolean | 'neutral',
  t: number,
  a: number,
): void {
  const px = -h.dy;
  const py = h.dx;
  const ang = Math.atan2(h.dy, h.dx);
  const blink = happy ? pulse(t, 2.2, 3.7, 0.24) : pulse(t, 3.4, 5.2, 0.6);
  const eyeOpen = happy ? sm((t - 1.6) / 0.8) : 1; /* eyes squint once the head has risen */
  g.globalAlpha = a;
  g.strokeStyle = EYE;
  g.fillStyle = EYE;
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  for (let i = -1; i <= 1; i += 2) {
    const ex = h.x + h.dx * 9 + px * 8 * i;
    const ey = h.y + h.dy * 9 + py * 8 * i;
    g.save();
    g.translate(ex, ey);
    g.rotate(ang);
    if (happy === 'neutral') {
      /* draw state: round dot, vertical blink */
      g.scale(1, 1 - 0.85 * blink);
      g.beginPath();
      g.arc(0, 0, 3.5, 0, TAU);
      g.fill();
    } else if (happy) {
      g.scale(1 - 0.85 * blink, 1);
      if (eyeOpen < 0.5) {
        g.beginPath();
        g.arc(0, 0, 3.5 * (1 - 0.3 * blink) + 0.01, 0, TAU);
        g.fill();
      } else {
        g.beginPath();
        g.arc(-1.6, 0, 4.4, -1.15, 1.15);
        g.stroke();
      } /* forward-facing arc: smile */
    } else {
      g.scale(1, 1 - 0.7 * blink);
      g.beginPath();
      g.arc(2.2, 0, 4.4, Math.PI - 1.05, Math.PI + 1.05);
      g.stroke(); /* drooping arc, half-closed */
    }
    g.restore();
  }
}

function paintTongue(g: CanvasRenderingContext2D, h: HeadRef, t: number, a: number): void {
  const L = pulse(t, 2.6, 3.4, 0.5);
  if (L <= 0) return;
  const bx = h.x + h.dx * 21;
  const by = h.y + h.dy * 21;
  const tx = bx + h.dx * 17 * L;
  const ty = by + h.dy * 17 * L;
  const c = Math.cos(0.6);
  const s = Math.sin(0.6);
  const fx = h.dx * 6 * L;
  const fy = h.dy * 6 * L;
  g.globalAlpha = a * sm(L * 3);
  g.strokeStyle = GOLD;
  g.lineWidth = 2.4;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(bx, by);
  g.lineTo(tx, ty);
  g.moveTo(tx, ty);
  g.lineTo(tx + fx * c - fy * s, ty + fx * s + fy * c);
  g.moveTo(tx, ty);
  g.lineTo(tx + fx * c + fy * s, ty - fx * s + fy * c);
  g.stroke();
}

/* ---------- accents: halo, sparks, tear ---------- */

function halo(g: CanvasRenderingContext2D, color: string, a: number, radius: number): void {
  const gr = g.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
  gr.addColorStop(0, color);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = a;
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, radius, 0, TAU);
  g.fill();
}

function paintSparks(
  g: CanvasRenderingContext2D,
  t: number,
  u: number,
  color: string | undefined,
): void {
  const entryFade = sm((t - 1.4) / 1);
  if (entryFade <= 0) return;
  g.fillStyle = color ?? GOLD;
  for (let i = 0; i < 8; i++) {
    const ph = fraction(t / 2.8 + hs(i));
    const x = (hs(i + 10) - 0.5) * 1.5 * R + 0.05 * R * Math.sin(t * 1.3 + i);
    const y = 0.55 * R - ph * 1.15 * R;
    const a = Math.sin(Math.PI * ph) * entryFade * u * (0.5 + 0.5 * hs(i + 30));
    const r = 2.2 + 2 * hs(i + 20);
    g.globalAlpha = a * 0.25;
    g.beginPath();
    g.arc(x, y, r * 3, 0, TAU);
    g.fill(); /* soft halo, no shadowBlur */
    g.globalAlpha = a;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }
}

/* tear forms under the outer eye, grows, detaches, falls and fades */
function paintTear(g: CanvasRenderingContext2D, h: HeadRef, t: number, u: number): void {
  if (t < 3.6) return;
  const ph = fraction((t - 3.6) / 6.5);
  const px = -h.dy;
  const py = h.dx;
  const ox = h.x + h.dx * 9 + px * 8 + 2;
  const oy = h.y + h.dy * 9 + py * 8 + 7;
  let r: number;
  let y: number;
  let a: number;
  if (ph < 0.42) {
    r = 4.2 * sm(ph / 0.42);
    y = oy + r * 0.7;
    a = sm(ph / 0.1);
  } else if (ph < 0.72) {
    const f = (ph - 0.42) / 0.3;
    r = 4.2;
    y = oy + 3 + 0.5 * R * f * f;
    a = 1 - sm((f - 0.55) / 0.45);
  } else {
    return;
  }
  g.globalAlpha = u * a * 0.85;
  g.fillStyle = BLUE;
  g.beginPath();
  g.arc(ox, y, r, 0, TAU);
  g.fill();
  g.globalAlpha = u * a * 0.6;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(ox - r * 0.3, y - r * 0.3, r * 0.28, 0, TAU);
  g.fill(); /* highlight; the tear is cold and glossy */
}

/* ---------- public API ---------- */

function paint(g: CanvasRenderingContext2D, o: EndingOptions): void {
  if (typeof g.save !== 'function') return;
  g.save();
  try {
    const happy = o.state !== 'sad';
    let t = o.t;
    if (!(t >= 0)) t = 0;
    const cx = o.cx || 0;
    const cy = o.cy || 0;
    let Rp = o.R;
    if (!(Rp > 0)) Rp = 250;
    let u = o.u;
    if (!(u >= 0)) u = 0;
    if (u > 1) u = 1;
    const k = Rp / R;
    /* o.tint (CSS color) and o.rgb ('r,g,b'): in duel mode the ending snake takes the winning
       team's color; body, head, halo, glow and sparks follow. Without a tint, rendering is unchanged. */
    const bodyColor = o.tint ?? BODY;
    const headColor = o.tint ?? HEAD;
    const rgb = o.rgb ?? '242,197,124';

    g.translate(cx, cy);
    g.scale(k, k);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    if (happy) {
      const e = sm(t / 1.6);
      const aT = sm((e - 0.86) / 0.14);
      halo(g, 'rgba(' + rgb + ',0.22)', u * (0.7 + 0.3 * Math.sin(t * 1.1)) * sm(t / 2), R * 1.15);
      g.save();
      g.scale(1 + 0.012 * Math.sin(t * 1.6), 1 + 0.012 * Math.sin(t * 1.6)); /* breathing */
      g.globalAlpha = u;
      g.strokeStyle = bodyColor;
      g.lineWidth = 38;
      g.shadowColor = 'rgba(' + rgb + ',0.55)';
      g.shadowBlur = 28 * sm((t - 1) / 1.5); /* only shadowBlur in the render */
      const h = paintBody(g, pathHappy, t, e);
      g.shadowBlur = 0;
      if (aT > 0) {
        paintHead(g, h, u * aT, headColor);
        paintEyes(g, h, true, t, u * aT);
        paintTongue(g, h, t, u * aT);
      }
      g.restore();
      paintSparks(g, t, u, o.tint);
    } else {
      const e = sm(t / 2.2);
      const aT = sm((e - 0.86) / 0.14);
      const sighAmount = sigh(t);
      /* sad tint (draw in duel: each snake keeps its own color); without a tint, cold blue */
      const rgbSad = o.tint ? rgb : '143,168,216';
      halo(g, 'rgba(' + rgbSad + ',0.12)', u * (0.75 + 0.25 * sighAmount) * sm(t / 2.5), R * 1.1);
      g.globalAlpha = u;
      g.strokeStyle = bodyColor;
      g.lineWidth = 38 * (1 + 0.06 * sighAmount); /* sigh swells the body */
      g.shadowColor = 'rgba(' + rgbSad + ',0.35)';
      g.shadowBlur = 22 * sm((t - 1.5) / 1.5);
      const h = paintBody(g, pathSad, t, e);
      g.shadowBlur = 0;
      if (aT > 0) {
        paintHead(g, h, u * aT, o.tint ? headColor : undefined);
        paintEyes(g, h, false, t, u * aT);
        paintTear(g, h, t, u * aT);
      }
    }
  } catch {
    /* an animation error must never break the end-of-round */
  }
  g.restore();
}

/* Draw result in duel: two snakes face to face, each with its own color, and the word DRAW above.
   o: t, cx, cy, R, u, gold:{tint,rgb}, shadow:{tint,rgb}. Left is gold, right is its mirror. */
function paintDraw(g: CanvasRenderingContext2D, o: EndingDrawOptions): void {
  if (typeof g.save !== 'function') return;
  g.save();
  try {
    let t = o.t;
    if (!(t >= 0)) t = 0;
    let Rp = o.R;
    if (!(Rp > 0)) Rp = 250;
    let u = o.u;
    if (!(u >= 0)) u = 0;
    if (u > 1) u = 1;
    const k = Rp / R;
    const e = sm(t / 1.6);
    const aT = sm((e - 0.86) / 0.14);
    const teams: [TeamColors, TeamColors] = [
      o.gold ?? { tint: GOLD, rgb: '242,197,124' },
      o.shadow ?? { tint: BLUE, rgb: '143,168,216' },
    ];
    g.translate(o.cx || 0, o.cy || 0);
    g.scale(k, k);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    halo(g, 'rgba(' + teams[0].rgb + ',0.16)', u * sm(t / 2), R * 0.9);
    halo(g, 'rgba(' + teams[1].rgb + ',0.16)', u * sm(t / 2), R * 0.9);
    for (let i = 0; i < 2; i++) {
      const c = teams[i];
      if (c === undefined) continue; /* invariant: teams is a 2-element tuple */
      g.save();
      if (i === 1) g.scale(-1, 1);
      g.globalAlpha = u;
      g.strokeStyle = c.tint;
      g.lineWidth = 38;
      g.shadowColor = 'rgba(' + c.rgb + ',0.5)';
      g.shadowBlur = 26 * sm((t - 1) / 1.5);
      const h = paintBody(g, pFace, t, e);
      g.shadowBlur = 0;
      if (aT > 0) {
        paintHead(g, h, u * aT, c.tint);
        paintEyes(g, h, 'neutral', t, u * aT);
      }
      g.restore();
    }
    const a = sm((t - 2.2) / 0.8); /* DRAW fades in once the heads have risen */
    if (a > 0) {
      g.globalAlpha = u * a;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 78px system-ui, "Segoe UI", sans-serif';
      g.letterSpacing = '14px';
      const gr = g.createLinearGradient(-120, 0, 120, 0);
      gr.addColorStop(0, teams[0].tint);
      gr.addColorStop(1, teams[1].tint);
      g.fillStyle = gr;
      g.fillText('DRAW', 7, -R * 0.62 + R * 0.03 * (1 - a));
    }
  } catch {
    /* an animation error must never break the end-of-round */
  }
  g.restore();
}

window.SnakeEnding = {
  paint,
  paintDraw,
};
