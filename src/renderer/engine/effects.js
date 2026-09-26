// Transient effects: the hatching eggshell, the halos around bites and the spark bursts.

import { CELL } from './layout.js';
import { ctx } from './canvas.js';
import { SHELL, SHADOW, GOLD, RED, berryTint } from './palette.js';
import { HATCH_TIME, EMERGE_TIME, TRAIL_TIME } from './rules.js';
import { egg, sparks, halos, px } from '../scripts/game.js';

// Animates snake birth: an egg lands, cracks and bursts.
// Call each frame with u from 0 to 1. Purely visual, no side effects.
// The egg breathes, cracks, holds its breath, then bursts open and the snake emerges.
// All transitions are smooth functions; nothing starts or stops abruptly.
export const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export const noise = (i, d) => {
  const v = Math.sin(i * 12.9898 + d * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export function paintShell(u) {
  const p = px(egg.x, egg.y),
    t = egg.t;
  const RX = CELL * 0.5,
    RY = CELL * 0.66;
  const S = EMERGE_TIME; // split point, as a fraction of the animation
  const preFrac = Math.min(1, u / S); // before the shell breaks
  const postFrac = Math.max(0, (u - S) / (1 + TRAIL_TIME / HATCH_TIME - S)); // after, until the full fade

  ctx.save();
  ctx.translate(p.x, p.y);

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

    ctx.translate(sway, 0);
    ctx.rotate(roll);
    // shadow, narrowing as the egg straightens up
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = 'rgba(5,8,6,0.65)';
    ctx.beginPath();
    ctx.ellipse(0, RY * 0.94, rx * (0.95 - 0.2 * holdback), RY * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // halo, growing then pulling back onto the egg before the break
    const halo = breath * (1 - 0.55 * holdback);
    if (halo > 0.01) {
      const R = ry * (1.35 + 0.7 * halo),
        g = ctx.createRadialGradient(0, 0, ry * 0.5, 0, 0, R);
      g.addColorStop(0, 'rgba(246,243,234,' + (0.16 * halo + 0.22 * holdback) + ')');
      g.addColorStop(1, 'rgba(246,243,234,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
    }

    hatchingEgg(rx, ry, 1);

    // cracks: they lengthen from the top, growing in number
    const f = smooth(Math.max(0, (preFrac - 0.28) / 0.62));
    if (f > 0.01) {
      ctx.save();
      ctx.strokeStyle = 'rgba(66,72,64,' + (0.55 + 0.4 * f) + ')';
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const startOffset = (k - 1) * rx * 0.42,
          part = Math.min(1, Math.max(0, (f - k * 0.16) / 0.5));
        if (part <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(startOffset, -ry * 0.55);
        const n = 5;
        for (let i = 1; i <= n; i++) {
          const q = (i / n) * part;
          ctx.lineTo(
            startOffset + (noise(k * 7 + i, 1) - 0.5) * rx * 0.55 * q,
            -ry * 0.55 + ry * 1.25 * q,
          );
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  } else {
    // 2. the break: light bursts out, fragments fly in arcs and fall
    const e = easeOut(postFrac * 1.35),
      f = 1 - smooth(Math.max(0, (postFrac - 0.45) / 0.55));

    // brief flash, then a ring opening and fading
    const flash = Math.max(0, 1 - postFrac * 5.5);
    if (flash > 0.01) {
      const R = RY * (1 + 2.6 * (1 - flash)),
        g = ctx.createRadialGradient(0, 0, 2, 0, 0, R);
      g.addColorStop(0, 'rgba(255,250,236,' + 0.9 * flash + ')');
      g.addColorStop(0.4, 'rgba(242,197,124,' + 0.55 * flash + ')');
      g.addColorStop(1, 'rgba(242,197,124,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
    }
    const ao = easeOut(postFrac * 2.2),
      beforeFade = Math.max(0, 1 - postFrac * 2.6);
    if (beforeFade > 0.01) {
      ctx.strokeStyle = 'rgba(255,247,228,' + 0.6 * beforeFade + ')';
      ctx.lineWidth = 3 * beforeFade + 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, RY * (0.6 + 2.4 * ao), 0, Math.PI * 2);
      ctx.stroke();
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
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin * T);
      ctx.globalAlpha = al;
      ctx.fillStyle = SHELL;
      ctx.shadowColor = 'rgba(246,243,234,0.5)';
      ctx.shadowBlur = 10;
      const w = RX * (0.3 + 0.22 * noise(i, 11)),
        h = RY * (0.26 + 0.2 * noise(i, 13));
      ctx.beginPath();
      ctx.moveTo(-w, h * 0.5);
      ctx.quadraticCurveTo(-w * 0.5, -h, w * 0.6, -h * 0.4);
      ctx.quadraticCurveTo(w, h * 0.2, 0, h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // the two halves open like a lid before flying apart
    [1, -1].forEach((sg) => {
      if (f <= 0.01) return;
      ctx.save();
      ctx.translate(sg * RX * 1.5 * e, (sg < 0 ? 1 : -1) * RY * 1.3 * e + CELL * 2.2 * T * T);
      ctx.rotate(sg * e * 1.5);
      ctx.globalAlpha = f;
      hatchingEgg(RX, RY, sg > 0 ? 0.5 : -0.5);
      ctx.restore();
    });
  }
  ctx.restore();

  // half an egg, or the whole egg: part=1 for whole, 0.5 for top half, -0.5 for bottom half
  function hatchingEgg(rx, ry, part) {
    const pts = [];
    for (let i = 0; i <= 52; i++) {
      const a = (i / 52) * Math.PI * 2,
        c = Math.cos(a),
        si = Math.sin(a);
      const k = 1 - 0.17 * Math.max(0, -si); // top narrower than the base
      const x = c * rx * k,
        y = si * ry;
      if (part === 1 || (part > 0 ? y <= 0.5 : y >= -0.5)) pts.push([x, y]);
    }
    if (!pts.length) return;
    ctx.beginPath();
    pts.forEach((q, i) => {
      if (i) ctx.lineTo(q[0], q[1]);
      else ctx.moveTo(q[0], q[1]);
    });
    ctx.closePath();
    const g = ctx.createLinearGradient(-rx, -ry, rx * 0.7, ry);
    g.addColorStop(0, '#FFFFFC');
    g.addColorStop(0.55, SHELL);
    g.addColorStop(1, '#D9D5C8');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(246,243,234,0.45)';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(120,128,118,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // soft highlight top-left, this is what makes it believable
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(-rx * 0.34, -ry * 0.34, rx * 0.28, ry * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// An eaten berry emits no projectile: it lights up in place and fades slowly.
const GLOW = { gifted: '242,197,124', nature: '207,227,198' };

export function paintHalos() {
  if (!halos.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  halos.forEach((h) => {
    const u = h.t / h.duration;
    // quick rise over the first fifth, then a long gentle fade
    const i = u < 0.2 ? u / 0.2 : Math.pow(1 - (u - 0.2) / 0.8, 1.9);
    const R = CELL * (0.55 + 1.25 * u),
      c =
        h.tint === 'gift-gold'
          ? '242,197,124'
          : h.tint === 'gift-shadow'
            ? '180,212,222'
            : h.tint === 'gifted'
              ? '155,226,138'
              : GLOW[h.tint] || GLOW.nature;
    const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, R);
    g.addColorStop(0, 'rgba(' + c + ',' + 0.4 * i + ')');
    g.addColorStop(0.35, 'rgba(' + c + ',' + 0.18 * i + ')');
    g.addColorStop(1, 'rgba(' + c + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(h.x, h.y, R, 0, Math.PI * 2);
    ctx.fill();
    // sharp core at the very start, enough for the eye to lock on
    if (u < 0.35) {
      const j = 1 - u / 0.35;
      ctx.fillStyle = 'rgba(' + c + ',' + 0.35 * j * j + ')';
      ctx.beginPath();
      ctx.arc(h.x, h.y, 7 * j + 2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.restore();
}

export function paintSparks() {
  ctx.save();
  sparks.forEach((e) => {
    const u = 1 - e.t / e.duration,
      r = e.r === undefined ? 1 : e.r,
      a = e.a === undefined ? 1 : e.a;
    ctx.globalAlpha = u * u * u * 0.9 * a;
    ctx.fillStyle =
      e.tint === 'gifted'
        ? berryTint()
        : e.tint === 'gift-gold'
          ? GOLD
          : e.tint === 'gift-shadow'
            ? SHADOW
            : e.tint === 'neutral-burst'
              ? RED
              : e.tint === 'shell'
                ? SHELL
                : e.tint === 'dust'
                  ? '#6b7383'
                  : '#cfe3c6';
    ctx.beginPath();
    ctx.arc(
      e.x,
      e.y,
      (e.tint.startsWith('gift') ? 3.5 * u + 1 : 2.5 * u + 0.8) * r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });
  ctx.restore();
}
