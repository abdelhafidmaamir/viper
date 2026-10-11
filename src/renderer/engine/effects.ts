// Transient effects: the hatching eggshell, the halos around bites and the spark bursts.

import type { Egg, Halo, Spark } from './types.ts';
import { CELL } from './layout.ts';
import { ctx } from './canvas.ts';
import { SHELL, SHADOW, GOLD, RED, berryTint } from './palette.ts';
import { egg, sparks, halos, px } from '../scripts/game.ts';

import { noise, paintEgg, smooth } from './eggshell.ts';

export { noise, smooth };

export function paintShell(u: number): void {
  // egg and ctx are both non-null while the shell animation is running (guarded by drawFrame).
  const egg_: Egg | null = egg;
  if (!egg_) return;
  const c = ctx as CanvasRenderingContext2D | null;
  if (!c) return;
  const p = px(egg_.x, egg_.y);
  paintEgg(c, p.x, p.y, egg_.t, u);
}

// An eaten berry emits no projectile: it lights up in place and fades slowly.
const GLOW: Record<string, string> = { gifted: '242,197,124', nature: '207,227,198' };

export function paintHalos(): void {
  const halos_: Halo[] = halos;
  if (!halos_.length) return;
  const c = ctx as CanvasRenderingContext2D | null;
  if (!c) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  halos_.forEach((h) => {
    const u = h.t / h.duration;
    // quick rise over the first fifth, then a long gentle fade
    const i = u < 0.2 ? u / 0.2 : Math.pow(1 - (u - 0.2) / 0.8, 1.9);
    const R = CELL * (0.55 + 1.25 * u),
      cv =
        h.tint === 'gift-gold'
          ? '242,197,124'
          : h.tint === 'gift-shadow'
            ? '180,212,222'
            : h.tint === 'gifted'
              ? '155,226,138'
              : (GLOW[h.tint] ?? '207,227,198');
    const g = c.createRadialGradient(h.x, h.y, 0, h.x, h.y, R);
    g.addColorStop(0, `rgba(${cv},${String(0.4 * i)})`);
    g.addColorStop(0.35, `rgba(${cv},${String(0.18 * i)})`);
    g.addColorStop(1, `rgba(${cv},0)`);
    c.fillStyle = g;
    c.beginPath();
    c.arc(h.x, h.y, R, 0, Math.PI * 2);
    c.fill();
    // sharp core at the very start, enough for the eye to lock on
    if (u < 0.35) {
      const j = 1 - u / 0.35;
      c.fillStyle = `rgba(${cv},${String(0.35 * j * j)})`;
      c.beginPath();
      c.arc(h.x, h.y, 7 * j + 2, 0, Math.PI * 2);
      c.fill();
    }
  });
  c.restore();
}

export function paintSparks(): void {
  const sparks_: Spark[] = sparks;
  const c = ctx as CanvasRenderingContext2D | null;
  if (!c) return;
  c.save();
  sparks_.forEach((e) => {
    const u = 1 - e.t / e.duration,
      r = e.r,
      a = e.a;
    c.globalAlpha = u * u * u * 0.9 * a;
    c.fillStyle =
      e.tint === 'gifted'
        ? berryTint(undefined)
        : e.tint === 'gift-gold'
          ? GOLD
          : e.tint === 'gift-shadow'
            ? SHADOW
            : e.tint === 'neutral-burst'
              ? RED
              : e.tint === 'shell'
                ? SHELL
                : '#6b7383';
    c.beginPath();
    c.arc(e.x, e.y, (e.tint.startsWith('gift') ? 3.5 * u + 1 : 2.5 * u + 0.8) * r, 0, Math.PI * 2);
    c.fill();
  });
  c.restore();
}
