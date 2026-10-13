// The Duel's egg, hatching: it breathes, cracks, holds its breath, then bursts open, and the
// snake comes out. Drawn here once for every mode that lays one: the Duel (effects.ts) and Snake
// Arena, each giving the egg's place and its clock.

import { CELL } from './layout.ts';
import { SHELL } from './palette.ts';
import { HATCH_TIME, EMERGE_TIME, TRAIL_TIME } from './rules.ts';

// Animates snake birth: an egg lands, cracks and bursts.
// Call each frame with u from 0 to 1. Purely visual, no side effects.
// The egg breathes, cracks, holds its breath, then bursts open and the snake emerges.
// All transitions are smooth functions; nothing starts or stops abruptly.
export const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

const easeOut = (x: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export const noise = (i: number, d: number): number => {
  const v = Math.sin(i * 12.9898 + d * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

/**
 * The egg at (x, y), `t` seconds after it was laid, `u` its progress from 0 to 1 over HATCH_TIME
 * (past 1 while the shell's pieces finish falling). Purely visual, no side effects.
 */
export function paintEgg(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  u: number,
): void {
  const RX = CELL * 0.5,
    RY = CELL * 0.66;
  const S = EMERGE_TIME; // split point, as a fraction of the animation
  const preFrac = Math.min(1, u / S); // before the shell breaks
  const postFrac = Math.max(0, (u - S) / (1 + TRAIL_TIME / HATCH_TIME - S)); // after, until the full fade

  c.save();
  c.translate(x, y);

  if (u < S) {
    // 1. it breathes and trembles, increasingly, then freezes just before giving way
    const breath = smooth(preFrac / 0.82); // agitation build-up
    const holdback = smooth(Math.max(0, (preFrac - 0.82) / 0.18)); // suspended hold before the break
    const vivid = 1 - holdback;
    const frequency = 16 + 26 * breath;
    const sway = Math.sin(t * frequency) * 3.6 * breath * vivid;
    const roll = Math.sin(t * frequency * 0.5) * 0.09 * breath * vivid;
    // squash and stretch: it squashes when trembling, stretches when holding
    const squash = 1 + 0.07 * Math.sin(t * frequency * 2) * breath * vivid + 0.1 * holdback;
    const stretch = 1 - 0.05 * Math.sin(t * frequency * 2) * breath * vivid - 0.06 * holdback;
    const rx = RX * stretch,
      ry = RY * squash;

    c.translate(sway, 0);
    c.rotate(roll);
    // shadow, narrowing as the egg straightens up
    c.globalAlpha = 0.38;
    c.fillStyle = 'rgba(5,8,6,0.65)';
    c.beginPath();
    c.ellipse(0, RY * 0.94, rx * (0.95 - 0.2 * holdback), RY * 0.2, 0, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;

    // halo, growing then pulling back onto the egg before the break
    const halo = breath * (1 - 0.55 * holdback);
    if (halo > 0.01) {
      const R = ry * (1.35 + 0.7 * halo),
        g = c.createRadialGradient(0, 0, ry * 0.5, 0, 0, R);
      g.addColorStop(0, `rgba(246,243,234,${String(0.16 * halo + 0.22 * holdback)})`);
      g.addColorStop(1, 'rgba(246,243,234,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, R, 0, Math.PI * 2);
      c.fill();
    }

    hatchingEgg(c, rx, ry, 1);

    // cracks: they lengthen from the top, growing in number
    const f = smooth(Math.max(0, (preFrac - 0.28) / 0.62));
    if (f > 0.01) {
      c.save();
      c.strokeStyle = `rgba(66,72,64,${String(0.55 + 0.4 * f)})`;
      c.lineWidth = 2.4;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const startOffset = (k - 1) * rx * 0.42,
          part = Math.min(1, Math.max(0, (f - k * 0.16) / 0.5));
        if (part <= 0) continue;
        c.beginPath();
        c.moveTo(startOffset, -ry * 0.55);
        const n = 5;
        for (let i = 1; i <= n; i++) {
          const q = (i / n) * part;
          c.lineTo(
            startOffset + (noise(k * 7 + i, 1) - 0.5) * rx * 0.55 * q,
            -ry * 0.55 + ry * 1.25 * q,
          );
        }
        c.stroke();
      }
      c.restore();
    }
  } else {
    // 2. the break: light bursts out, fragments fly in arcs and fall
    const e = easeOut(postFrac * 1.35),
      f = 1 - smooth(Math.max(0, (postFrac - 0.45) / 0.55));

    // brief flash, then a ring opening and fading
    const flash = Math.max(0, 1 - postFrac * 5.5);
    if (flash > 0.01) {
      const R = RY * (1 + 2.6 * (1 - flash)),
        g = c.createRadialGradient(0, 0, 2, 0, 0, R);
      g.addColorStop(0, `rgba(255,250,236,${String(0.9 * flash)})`);
      g.addColorStop(0.4, `rgba(242,197,124,${String(0.55 * flash)})`);
      g.addColorStop(1, 'rgba(242,197,124,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, R, 0, Math.PI * 2);
      c.fill();
    }
    const ao = easeOut(postFrac * 2.2),
      beforeFade = Math.max(0, 1 - postFrac * 2.6);
    if (beforeFade > 0.01) {
      c.strokeStyle = `rgba(255,247,228,${String(0.6 * beforeFade)})`;
      c.lineWidth = 3 * beforeFade + 0.5;
      c.beginPath();
      c.arc(0, 0, RY * (0.6 + 2.4 * ao), 0, Math.PI * 2);
      c.stroke();
    }

    // eight shell fragments, each on its own arc, spinning and falling
    const T = postFrac * 1.5;
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (noise(i, 3) - 0.5) * 2.6 + (i - 3.5) * 0.34;
      const speed = CELL * (1.5 + noise(i, 5) * 1.7),
        spin = (noise(i, 7) - 0.5) * 9;
      const x = Math.cos(a) * speed * T,
        y = Math.sin(a) * speed * T + CELL * 3.4 * T * T;
      const al = f * (0.85 + 0.15 * noise(i, 9));
      if (al <= 0.01) continue;
      c.save();
      c.translate(x, y);
      c.rotate(spin * T);
      c.globalAlpha = al;
      c.fillStyle = SHELL;
      c.shadowColor = 'rgba(246,243,234,0.5)';
      c.shadowBlur = 10;
      const w = RX * (0.3 + 0.22 * noise(i, 11)),
        h = RY * (0.26 + 0.2 * noise(i, 13));
      c.beginPath();
      c.moveTo(-w, h * 0.5);
      c.quadraticCurveTo(-w * 0.5, -h, w * 0.6, -h * 0.4);
      c.quadraticCurveTo(w, h * 0.2, 0, h);
      c.closePath();
      c.fill();
      c.restore();
    }

    // the two halves open like a lid before flying apart
    [1, -1].forEach((sg) => {
      if (f <= 0.01) return;
      c.save();
      c.translate(sg * RX * 1.5 * e, (sg < 0 ? 1 : -1) * RY * 1.3 * e + CELL * 2.2 * T * T);
      c.rotate(sg * e * 1.5);
      c.globalAlpha = f;
      hatchingEgg(c, RX, RY, sg > 0 ? 0.5 : -0.5);
      c.restore();
    });
  }
  c.restore();

  // half an egg, or the whole egg: part=1 for whole, 0.5 for top half, -0.5 for bottom half
  function hatchingEgg(c: CanvasRenderingContext2D, rx: number, ry: number, part: number): void {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 52; i++) {
      const a = (i / 52) * Math.PI * 2,
        cv = Math.cos(a),
        si = Math.sin(a);
      const k = 1 - 0.17 * Math.max(0, -si); // top narrower than the base
      const x = cv * rx * k,
        y = si * ry;
      if (part === 1 || (part > 0 ? y <= 0.5 : y >= -0.5)) pts.push([x, y]);
    }
    if (!pts.length) return;
    c.beginPath();
    pts.forEach(([qx, qy], i) => {
      if (i) c.lineTo(qx, qy);
      else c.moveTo(qx, qy);
    });
    c.closePath();
    const g = c.createLinearGradient(-rx, -ry, rx * 0.7, ry);
    g.addColorStop(0, '#FFFFFC');
    g.addColorStop(0.55, SHELL);
    g.addColorStop(1, '#D9D5C8');
    c.fillStyle = g;
    c.shadowColor = 'rgba(246,243,234,0.45)';
    c.shadowBlur = 20;
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(120,128,118,0.45)';
    c.lineWidth = 2;
    c.stroke();
    // soft highlight top-left, this is what makes it believable
    c.save();
    c.clip();
    c.globalAlpha = 0.5;
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath();
    c.ellipse(-rx * 0.34, -ry * 0.34, rx * 0.28, ry * 0.2, -0.5, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}
