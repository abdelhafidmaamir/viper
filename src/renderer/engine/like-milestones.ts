// Room milestones: every 1,000 likes from the whole room, confetti bursts over the board with a
// thank-you the host can react to out loud. Pure display, no effect on the game.

import { ctx } from './canvas.ts';
import { CELL, COLS, ROWS, X0, Y0 } from './layout.ts';
import { tr, trNum } from './i18n.ts';

const STEP = 1000;
const SHOW = 3.2; // seconds the thank-you stays
const PIECES = 110;
const GRAVITY = 520;
const COLORS = ['254,44,85', '242,197,124', '180,212,222', '134,204,112', '255,255,255'];

let roomLikes = 0,
  reached = 0,
  age = SHOW,
  seq = 0;
let confetti: {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  turn: number;
  color: string;
}[] = [];

// A fixed sequence instead of Math.random, so the seeded game never sees the party.
function next(): number {
  seq++;
  return (seq * 0.618034) % 1;
}

export function addRoomLikes(n: number): void {
  roomLikes += n;
  const step = Math.floor(roomLikes / STEP) * STEP;
  if (step <= reached) return;
  reached = step;
  age = 0;
  const cx = X0 + (COLS * CELL) / 2,
    top = Y0 + ROWS * CELL * 0.1;
  confetti = [];
  for (let i = 0; i < PIECES; i++) {
    const a = -Math.PI / 2 + (next() - 0.5) * 2.2,
      v = 380 + next() * 520;
    confetti.push({
      x: cx + (next() - 0.5) * 120,
      y: top + ROWS * CELL * 0.3,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      spin: next() * Math.PI * 2,
      turn: (next() - 0.5) * 14,
      color: COLORS[i % COLORS.length] ?? COLORS[0] ?? '255,255,255',
    });
  }
}

export function updateMilestones(dt: number): void {
  if (age >= SHOW) return;
  age += dt;
  for (const p of confetti) {
    p.vy += GRAVITY * dt;
    p.vx *= 1 - 1.2 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.spin += p.turn * dt;
  }
  if (age >= SHOW) confetti = [];
}

export function paintMilestones(): void {
  const c = ctx as CanvasRenderingContext2D | null;
  if (!c || age >= SHOW) return;
  const fade = Math.min(1, (SHOW - age) / 0.5);
  c.save();
  for (const p of confetti) {
    c.save();
    c.globalAlpha = fade;
    c.translate(p.x, p.y);
    c.rotate(p.spin);
    c.fillStyle = `rgb(${p.color})`;
    c.fillRect(
      -7,
      -3.5 * Math.abs(Math.cos(p.spin * 1.7)) - 1,
      14,
      7 * Math.abs(Math.cos(p.spin * 1.7)) + 2,
    );
    c.restore();
  }
  // The thank-you pops in with a small overshoot, then holds.
  const pop =
      age < 0.35
        ? 0.6 + 0.55 * Math.sin((age / 0.35) * (Math.PI / 2))
        : 1 + 0.15 * Math.max(0, 1 - (age - 0.35) * 4),
    cx = X0 + (COLS * CELL) / 2,
    cy = Y0 + ROWS * CELL * 0.38;
  c.globalAlpha = fade;
  c.translate(cx, cy);
  c.scale(pop, pop);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.font = '900 76px system-ui, sans-serif';
  c.lineWidth = 14;
  c.strokeStyle = 'rgb(254,44,85)';
  const count = trNum(reached);
  const likesText = `${count} ${tr('milestones.likes')}`;
  c.strokeText(likesText, 0, 0);
  c.fillStyle = '#fff';
  c.fillText(likesText, 0, 0);
  c.font = '800 40px system-ui, sans-serif';
  c.lineWidth = 9;
  const thanksText = tr('milestones.thanks');
  c.strokeText(thanksText, 0, 70);
  c.fillText(thanksText, 0, 70);
  c.restore();
}
