// The little animals that carry a liking viewer's picture, one kind per ambience (crabs.ts moves
// them). Each is drawn facing us around the origin, feet near y = 12, and holds the picture up at
// (0, -42): arms, ears, wings or claws reach for it on both sides, so they all read as one family.

import type { Weather } from '../engine/types.ts';

export interface Pose {
  /** Clock, seconds. */
  t: number;
  /** Walking phase, and how much it is walking right now (0..1). */
  step: number;
  pace: number;
  /** Height of the hop under way, in pixels, and the same as 0..1 for a flourish. */
  jump: number;
  flick: number;
  /** How much higher than usual this animal holds the picture. */
  lift: number;
  /** Which of the five it is: offsets blinks and breaths so they do not all move as one. */
  seed: number;
  /** The hop as a ratio of its length: past 1 it has landed, and by how long. */
  hop: number;
  /** The little bounds it travels by, 0..1 (animals that do not walk). */
  bounce: number;
  /** 0, then 1 once its likes have earned it its ornament. */
  tier: number;
  /** Eyes shut: a sleeping crab on the beach. */
  asleep?: boolean;
  /** A sleeping crab stirring in its sleep. */
  stir?: Stir | undefined;
}

/**
 * How a sleeping crab stirs: its body shifts sideways, leans and swells, all pivoting on the line
 * of its feet, which never move; each claw shifts and opens on its own ([left, right]).
 */
export interface Stir {
  bx: number;
  brot: number;
  bs: number;
  cdx: [number, number];
  cdy: [number, number];
  copen: [number, number];
}
/** Where the feet stand, in the animal's units: what a stir pivots on. */
export const FOOT_Y = 11;
/** Where a point of the body goes when the crab stirs. */
export function stirred(st: Stir, x: number, y: number): [number, number] {
  const cs = Math.cos(st.brot) * st.bs,
    sn = Math.sin(st.brot) * st.bs,
    dy = y - FOOT_Y;
  return [st.bx + x * cs - dy * sn, FOOT_Y + x * sn + dy * cs];
}
type G = CanvasRenderingContext2D;
type Painter = (g: G, p: Pose) => void;

const TAU = Math.PI * 2;

/**
 * Seconds an animal's idle cycle lasts. Every idle motion turns a whole number of times in it
 * (speeds are multiples of W), so the cycle can be drawn once as a strip of frames and replayed.
 */
export const LOOP = 3.2;
const W = TAU / LOOP;

const glows: Record<string, HTMLCanvasElement> = {};
/** A soft round glow of a colour, drawn once and stamped at any size. */
function glow(g: G, rgb: string, x: number, y: number, r: number, alpha: number): void {
  let cv = glows[rgb];
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    if (c) {
      const fade = c.createRadialGradient(32, 32, 2, 32, 32, 32);
      fade.addColorStop(0, `rgba(${rgb},1)`);
      fade.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = fade;
      c.fillRect(0, 0, 64, 64);
    }
    glows[rgb] = cv;
  }
  const before = g.globalAlpha;
  g.globalAlpha = before * alpha;
  g.drawImage(cv, x - r, y - r, r * 2, r * 2);
  g.globalAlpha = before;
}

function blob(
  g: G,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  line?: string,
): void {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  g.fill();
  if (line) {
    g.strokeStyle = line;
    g.lineWidth = 2;
    g.stroke();
  }
}

function dot(g: G, x: number, y: number, r: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/** Two dark eyes with a glint. */
function eyes(g: G, dx: number, y: number, r = 2.2): void {
  for (const s of [-1, 1]) {
    dot(g, s * dx, y, r, '#1c1410');
    dot(g, s * dx + 0.7, y - 0.7, r * 0.35, '#fff');
  }
}

/** Two arms raised to the picture, each ending in a paw; they stretch during a hop. */
function arms(g: G, p: Pose, color: string, paw: string, from = 11, width = 4, line = ''): void {
  for (const s of [-1, 1]) {
    const px = s * (31 + 2 * p.flick),
      py = -33 - p.lift - 3 * p.flick;
    g.beginPath();
    g.moveTo(s * from, -3);
    g.quadraticCurveTo(s * 30, -6, px, py);
    if (line) {
      g.strokeStyle = line;
      g.lineWidth = width + 3;
      g.stroke();
    }
    g.strokeStyle = color;
    g.lineWidth = width;
    g.stroke();
    if (line) blob(g, px, py, 5.5, 5.5, paw, line);
    else dot(g, px, py, 5, paw);
  }
}

/** Blinks now and then, each animal at its own moment. */
const blinking = (p: Pose): boolean => p.t % LOOP < 0.19;

/** A big glossy eye, or its lid when it blinks. */
function bigEye(g: G, x: number, y: number, r: number, shut: boolean, look = 0): void {
  if (shut) {
    g.strokeStyle = '#1c1410';
    g.lineWidth = 1.8;
    g.beginPath();
    g.arc(x, y - r * 0.2, r * 0.8, 0.15, Math.PI - 0.15);
    g.stroke();
    return;
  }
  dot(g, x + look, y, r, '#1c1410');
  dot(g, x + look - r * 0.35, y - r * 0.4, r * 0.38, '#fff');
  dot(g, x + look + r * 0.35, y + r * 0.35, r * 0.18, '#fff');
}

/** Two feet stepping in turn, tucked in during a hop. */
function feet(g: G, p: Pose, color: string, dx = 8, rx = 6): void {
  for (const s of [-1, 1]) {
    const lift = Math.max(0, Math.sin(p.step + (s > 0 ? Math.PI : 0))) * 3 * p.pace;
    blob(g, s * dx, 12 - lift - Math.min(4, p.jump * 0.2), rx, 3.2, color);
  }
}

const crab: Painter = (g, p) => {
  // Legs, three a side, stepping in turn; tucked in during a hop.
  g.strokeStyle = '#a83c26';
  for (const side of [-1, 1]) {
    g.lineWidth = 3;
    for (let l = 0; l < 3; l++) {
      const lift = Math.sin(p.step + l * 2.1 + (side > 0 ? 1.6 : 0)) * 3.5 * p.pace,
        x0 = side * (11 + l * 2),
        x1 = side * (22 + l * 3);
      g.beginPath();
      if (p.stir) {
        // Stirring: the hip follows the body, the knee half way, the foot stays put.
        const ky = -3 + l * 3 - lift,
          hip = stirred(p.stir, x0, 2 + l * 2),
          knee = stirred(p.stir, x1, ky);
        g.moveTo(hip[0], hip[1]);
        g.lineTo((x1 + knee[0]) / 2, (ky + knee[1]) / 2);
      } else {
        g.moveTo(x0, 2 + l * 2);
        g.lineTo(x1, -3 + l * 3 - lift);
      }
      g.lineTo(x1 + side * 4, 11 - Math.max(0, lift) - Math.min(4, p.jump * 0.3));
      g.stroke();
    }
    if (p.stir) stirBody(g, p.stir);
    // The claws, held up on either side of the picture; they snap during a hop.
    const k = side < 0 ? 0 : 1,
      cx = side * 34 + (p.stir?.cdx[k] ?? 0),
      cy = -34 + (p.stir?.cdy[k] ?? 0),
      open = 0.15 + 0.45 * Math.abs(Math.sin(p.t * 11 * W)) * p.flick + (p.stir?.copen[k] ?? 0);
    g.strokeStyle = '#a83c26';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(side * 12, -3);
    g.quadraticCurveTo(side * 34, -6, cx, cy);
    g.stroke();
    dot(g, cx, cy, 7.5, '#e2674a');
    g.fillStyle = '#7a2a1a';
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, 8, -Math.PI / 2 - open, -Math.PI / 2 + open);
    g.closePath();
    g.fill();
    if (p.stir) g.restore();
  }
  if (p.stir) stirBody(g, p.stir);
  // The shell, with a lighter back.
  blob(g, 0, 0, 17, 11.5, '#d8573a', '#8c2f1d');
  g.fillStyle = 'rgba(255,190,150,0.5)';
  g.beginPath();
  g.ellipse(-3, -4, 9, 4, -0.2, 0, TAU);
  g.fill();
  for (const side of [-1, 1])
    if (p.asleep) {
      g.strokeStyle = '#1c1410';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(side * 6, 1.2, 2.2, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    } else dot(g, side * 6, 2, 1.9, '#1c1410');
  if (p.stir) g.restore();
};

/** Moves what follows with the stirring body, until the matching restore. */
function stirBody(g: G, st: Stir): void {
  g.save();
  g.translate(st.bx, FOOT_Y);
  g.rotate(st.brot);
  g.scale(st.bs, st.bs);
  g.translate(0, -FOOT_Y);
}

/**
 * Rain: a frog. It breathes, its throat pulses, it blinks and looks about. It travels by little
 * bounds, legs unfolding under it; on a like it leaps with its mouth open and lands in a ripple.
 */
const frog: Painter = (g, p) => {
  const GREEN = '#6cc04f',
    DARK = '#2c6a28',
    LIGHT = '#a4e283',
    ext = Math.max(p.flick, p.bounce * 0.75),
    breath = Math.sin(p.t * W + p.seed),
    mix = (a: number, b: number): number => a + (b - a) * ext;
  // The ripple it lands in, and two drops thrown up.
  if (p.hop >= 1 && p.hop < 1.8) {
    const q = (p.hop - 1) / 0.8;
    g.strokeStyle = `rgba(226,244,255,${String(0.75 * (1 - q))})`;
    g.lineWidth = 2;
    for (const k of [1, 0.55]) {
      g.beginPath();
      g.ellipse(0, 14, (14 + 30 * q) * k, (3 + 6 * q) * k, 0, 0, TAU);
      g.stroke();
    }
    for (const s of [-1, 1])
      dot(g, s * (16 + 16 * q), 10 - Math.sin(q * Math.PI) * 16, 2.2 * (1 - q), '#e2f4ff');
  }
  // Hind legs: folded high at rest, unfolding under it in the air.
  for (const s of [-1, 1]) {
    const kx = s * mix(25, 20),
      ky = mix(-1, 16),
      fx = s * mix(23, 27),
      fy = mix(12, 27);
    g.beginPath();
    g.moveTo(s * 13, 5);
    g.lineTo(kx, ky);
    g.lineTo(fx, fy);
    g.strokeStyle = DARK;
    g.lineWidth = 11;
    g.stroke();
    g.strokeStyle = GREEN;
    g.lineWidth = 8;
    g.stroke();
    // The webbed foot, three toes.
    g.save();
    g.translate(fx, fy);
    g.rotate(s * 0.7 * ext);
    blob(g, s * 3, 0, 8.5, 3.6, LIGHT, DARK);
    for (const toe of [0, 4, 8]) dot(g, s * (3 + toe), 1.2, 2, LIGHT);
    g.restore();
  }
  arms(g, p, GREEN, LIGHT, 14, 5, DARK);
  g.save();
  g.translate(0, 12);
  g.scale(1 + 0.02 * breath, 1 - 0.03 * breath);
  g.translate(0, -12);
  blob(g, 0, 0, 21, 15, GREEN, DARK);
  blob(g, 0, 6.5, 13, 8, '#dcf7c8');
  // The throat, pulsing.
  blob(g, 0, 4.5, 6.5 + 1.6 * Math.sin(p.t * 3 * W + p.seed), 3.6, 'rgba(255,255,255,0.4)');
  // Eyes on bumps above the head.
  const shut = blinking(p),
    look = 1.3 * Math.sin(p.t * W + p.seed * 2);
  for (const s of [-1, 1]) {
    blob(g, s * 10, -13, 8.2, 8.2, GREEN, DARK);
    blob(g, s * 10, -8.5, 7.6, 5.5, GREEN);
    if (shut) bigEye(g, s * 10, -13, 5, true);
    else {
      dot(g, s * 10, -13.5, 6.2, '#fbfff4');
      bigEye(g, s * 10, -13, 4.4, false, look);
    }
    blob(g, s * 14.5, -1.5, 3.8, 2.5, 'rgba(255,135,150,0.6)');
    dot(g, s * 2.4, -6.5, 0.8, DARK);
  }
  if (p.flick > 0.25) {
    // Mouth open in the air.
    blob(g, 0, -2, 5.5, 1.5 + 3.5 * p.flick, '#8a2f45', DARK);
    blob(g, 0, -0.5 + 1.5 * p.flick, 3, 1.6, '#ff8fa3');
  } else {
    g.strokeStyle = DARK;
    g.lineWidth = 1.8;
    g.beginPath();
    g.moveTo(-8, -3.5);
    g.quadraticCurveTo(0, 2.5, 8, -3.5);
    g.stroke();
  }
  g.restore();
};

/** Snow: a penguin, flippers up, which flap during a hop. */
const penguin: Painter = (g, p) => {
  feet(g, p, '#f0962e', 7, 6.5);
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 13, -6);
    g.rotate(s * (-2.3 + 0.5 * Math.sin(p.t * 13 * W) * p.flick));
    blob(g, 0, 12, 5.5, 15, '#2a3350', '#141a2c');
    g.restore();
  }
  blob(g, 0, -2, 15.5, 16, '#2f3a5c', '#141a2c');
  blob(g, 0, 1, 10.5, 11.5, '#f6f8fb');
  // The face: a white heart shape under a dark cap.
  blob(g, -4.5, -9, 5, 4.5, '#f6f8fb');
  blob(g, 4.5, -9, 5, 4.5, '#f6f8fb');
  eyes(g, 4.5, -9.5, 1.9);
  g.fillStyle = '#f0962e';
  g.beginPath();
  g.moveTo(-3.2, -6);
  g.lineTo(3.2, -6);
  g.lineTo(0, -1.5);
  g.closePath();
  g.fill();
  for (const s of [-1, 1]) dot(g, s * 8.5, -5, 2, 'rgba(255,140,150,0.5)');
};

/**
 * Autumn: a squirrel, big head, a plume of a tail that waves behind it and whips on a like. It
 * scurries in bounds, its nose twitches, its ears flick.
 */
const squirrel: Painter = (g, p) => {
  const RUST = '#d67f3f',
    DARK = '#7a3c16',
    CREAM = '#fdecd2',
    wave = Math.sin(p.t * W + p.seed);
  // The tail, in three tones, curling up and over.
  g.save();
  g.translate(8, 9);
  g.rotate(0.09 * wave + 0.32 * p.flick - 0.16 * p.bounce);
  g.fillStyle = '#c26a2e';
  g.strokeStyle = DARK;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-4, 3);
  g.bezierCurveTo(30, 8, 44, -18, 31, -37);
  g.bezierCurveTo(24, -48, 6, -43, 11, -31);
  g.bezierCurveTo(16, -20, 13, -6, -4, -5);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = '#e9a05c';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(8, -1);
  g.bezierCurveTo(26, -3, 33, -18, 25, -32);
  g.stroke();
  g.strokeStyle = CREAM;
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(12, -3);
  g.bezierCurveTo(25, -6, 30, -18, 24, -29);
  g.stroke();
  g.restore();
  feet(g, p, '#a85a26', 7, 6.5);
  blob(g, 0, 5.5, 11.5, 9.5, RUST, DARK);
  blob(g, 0, 7.5, 6.8, 6.2, CREAM);
  arms(g, p, RUST, CREAM, 10, 4.5, DARK);
  // The head nods with each bound.
  g.save();
  g.translate(0, 1.5 * p.bounce);
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 9, -20);
    g.rotate(s * (0.25 + 0.12 * Math.max(0, Math.sin(p.t * W + p.seed + s)) ** 8));
    g.fillStyle = RUST;
    g.strokeStyle = DARK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-5, 3);
    g.quadraticCurveTo(-4, -13, 1, -15);
    g.quadraticCurveTo(6, -9, 5, 3);
    g.closePath();
    g.fill();
    g.stroke();
    blob(g, 0.3, -3.5, 2, 4.5, '#f4b6a4');
    g.restore();
  }
  blob(g, 0, -11, 15.5, 12.5, RUST, DARK);
  if (p.tier) {
    // Its ornament: an acorn cap.
    g.fillStyle = '#8a5a2b';
    g.strokeStyle = DARK;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(-9.5, -20.5);
    g.quadraticCurveTo(0, -31, 9.5, -20.5);
    g.quadraticCurveTo(0, -17.5, -9.5, -20.5);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(0, -25.5);
    g.lineTo(1.5, -29.5);
    g.stroke();
  }
  // Cream cheeks and muzzle.
  blob(g, -5.5, -6.5, 7, 5.2, CREAM);
  blob(g, 5.5, -6.5, 7, 5.2, CREAM);
  const shut = blinking(p);
  for (const s of [-1, 1]) {
    bigEye(g, s * 6.8, -13.5, 3.7, shut, 0.6 * Math.sin(p.t * W + p.seed));
    blob(g, s * 11.5, -7.5, 3.2, 2.1, 'rgba(255,125,125,0.55)');
  }
  // The nose twitches; two teeth under it.
  dot(g, 0, -9 + 0.5 * Math.sin(p.t * 6 * W + p.seed), 1.9, '#5a2a12');
  g.fillStyle = '#fff';
  g.strokeStyle = DARK;
  g.lineWidth = 0.7;
  g.beginPath();
  g.roundRect(-1.5, -6.4, 3, 2.3, 0.8);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(0, -6.4);
  g.lineTo(0, -4.1);
  g.stroke();
  g.restore();
};

/** Summer: a bee, hovering; its wings blur, faster in a hop. */
const bee: Painter = (g, p) => {
  const beat = Math.sin(p.t * (24 + 15 * p.flick) * W);
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 9, -8);
    g.rotate(s * (0.9 + 0.35 * beat));
    blob(g, 0, -12, 7, 14, 'rgba(230,246,255,0.6)', 'rgba(255,255,255,0.8)');
    g.restore();
  }
  arms(g, p, '#3a2a14', '#3a2a14', 9, 2.5);
  // Six short legs hanging.
  g.strokeStyle = '#3a2a14';
  g.lineWidth = 2;
  for (const s of [-1, 1])
    for (let l = 0; l < 2; l++) {
      g.beginPath();
      g.moveTo(s * (5 + l * 5), 9);
      g.lineTo(s * (7 + l * 6), 15 + Math.sin(p.t * 5 * W + l) * 1.5);
      g.stroke();
    }
  blob(g, 0, 1, 16, 12.5, '#f6c531', '#7a5510');
  // Stripes that follow the round of the body.
  g.strokeStyle = '#2e2212';
  g.lineWidth = 3.6;
  g.lineCap = 'butt';
  for (const [y, half] of [
    [4, 14.6],
    [10, 9.6],
  ] as const) {
    g.beginPath();
    g.moveTo(-half, y);
    g.quadraticCurveTo(0, y + 2.5, half, y);
    g.stroke();
  }
  g.lineCap = 'round';
  eyes(g, 5.5, -3, 2.4);
  for (const s of [-1, 1]) dot(g, s * 10, 0.5, 2, 'rgba(255,130,120,0.55)');
  g.strokeStyle = '#2e2212';
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(0, -1, 3.5, 0.3, Math.PI - 0.3);
  g.stroke();
};

/** Spring: a rabbit; its ears stand on either side of the picture and fold in a hop. */
const rabbit: Painter = (g, p) => {
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 7, -15);
    g.rotate(s * (0.62 + 0.25 * p.flick + 0.04 * Math.sin(p.t * 2 * W + s)));
    blob(g, 0, -17, 5.5, 18, '#f4efe8', '#b9a999');
    blob(g, 0, -16, 2.6, 13, '#f5b9c4');
    g.restore();
  }
  dot(g, 13, 8, 6, '#fff');
  feet(g, p, '#e2d8cc', 8, 7);
  arms(g, p, '#e9e1d7', '#fff');
  blob(g, 0, 3, 13.5, 11, '#f4efe8', '#b9a999');
  blob(g, 0, -9, 12, 9.5, '#f4efe8', '#b9a999');
  eyes(g, 5, -10);
  dot(g, 0, -6.5, 1.8, '#e8879a');
  g.strokeStyle = '#b9a999';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(0, -5);
  g.lineTo(0, -3);
  g.moveTo(-3, -2.5);
  g.quadraticCurveTo(0, -0.5, 3, -2.5);
  g.stroke();
  for (const s of [-1, 1]) dot(g, s * 8.5, -6, 2.2, 'rgba(255,150,165,0.5)');
};

/** Storm: a hedgehog; its spines bristle during a hop. */
const hedgehog: Painter = (g, p) => {
  const n = 13,
    bristle = 1 + 0.45 * p.flick;
  g.fillStyle = '#5a4332';
  g.strokeStyle = '#2f2118';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(-19, 8);
  for (let k = 0; k <= n; k++) {
    const a = Math.PI + (k / n) * Math.PI,
      r = 19,
      tip = (23 + 4 * (k % 2)) * bristle,
      a2 = a + Math.PI / n / 2;
    g.lineTo(Math.cos(a) * r, 6 + Math.sin(a) * r * 0.95);
    if (k < n) g.lineTo(Math.cos(a2) * tip, 6 + Math.sin(a2) * tip * 0.95);
  }
  g.lineTo(19, 8);
  g.closePath();
  g.fill();
  g.stroke();
  feet(g, p, '#b98f6c', 8, 5.5);
  arms(g, p, '#d9b592', '#f0d6b8');
  blob(g, 0, 3, 12.5, 10.5, '#ecd2b0', '#8a6a4c');
  eyes(g, 5, -1);
  dot(g, 0, 3, 2.2, '#2f2118');
  g.strokeStyle = '#8a6a4c';
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(0, 4.5, 3.5, 0.3, Math.PI - 0.3);
  g.stroke();
  for (const s of [-1, 1]) dot(g, s * 8.5, 3, 2.2, 'rgba(255,140,130,0.5)');
};

/** A sitting fox or cat: pointed ears, a mask, a tail curled to one side. */
function sitter(
  g: G,
  p: Pose,
  c: {
    fur: string;
    line: string;
    pale: string;
    ear: string;
    tail: string;
    tip: string;
    eye?: string;
  },
): void {
  // The tail sweeps, and whips up during a hop.
  g.save();
  g.translate(11, 9);
  g.rotate(-0.25 * p.flick + 0.08 * Math.sin(p.t * W));
  g.fillStyle = c.tail;
  g.strokeStyle = c.line;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(-2, 3);
  g.bezierCurveTo(16, 6, 30, -2, 28, -16);
  g.bezierCurveTo(22, -8, 12, -6, -2, -5);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = c.tip;
  g.beginPath();
  g.moveTo(28, -16);
  g.bezierCurveTo(29, -8, 25, -3, 20, 0);
  g.bezierCurveTo(22, -6, 24, -10, 28, -16);
  g.fill();
  g.restore();
  feet(g, p, c.pale, 7, 5.5);
  arms(g, p, c.fur, c.pale);
  blob(g, 0, 4, 12, 10.5, c.fur, c.line);
  blob(g, 0, 7, 6.5, 6, c.pale);
  for (const s of [-1, 1]) {
    g.fillStyle = c.fur;
    g.strokeStyle = c.line;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(s * 3, -15);
    g.lineTo(s * (12 + 2 * p.flick), -27);
    g.lineTo(s * 14, -10);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = c.ear;
    g.beginPath();
    g.moveTo(s * 6.5, -15);
    g.lineTo(s * 11.5, -22);
    g.lineTo(s * 12, -13);
    g.closePath();
    g.fill();
  }
  // The head, wide at the cheeks.
  g.fillStyle = c.fur;
  g.strokeStyle = c.line;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -1);
  g.bezierCurveTo(-8, -1, -17, -5, -15, -11);
  g.bezierCurveTo(-13, -19, 13, -19, 15, -11);
  g.bezierCurveTo(17, -5, 8, -1, 0, -1);
  g.fill();
  g.stroke();
  g.fillStyle = c.pale;
  g.beginPath();
  g.moveTo(0, -2);
  g.bezierCurveTo(-6, -2, -13, -4, -13, -8);
  g.bezierCurveTo(-7, -8, -3, -10, 0, -12);
  g.bezierCurveTo(3, -10, 7, -8, 13, -8);
  g.bezierCurveTo(13, -4, 6, -2, 0, -2);
  g.fill();
  if (c.eye)
    for (const s of [-1, 1]) {
      blob(g, s * 6, -10.5, 3, 2.6, c.eye);
      blob(g, s * 6, -10.5, 1, 2.3, '#10141c');
    }
  else eyes(g, 6, -10.5);
  dot(g, 0, -5, 1.8, '#1c1410');
}

/** Shooting stars: a black cat with moon eyes. */
const cat: Painter = (g, p) => {
  sitter(g, p, {
    fur: '#2b2f45',
    line: '#0e101c',
    pale: '#4a5072',
    ear: '#e58fa6',
    tail: '#2b2f45',
    tip: '#4a5072',
    eye: '#f6dc6a',
  });
  // Whiskers.
  g.strokeStyle = 'rgba(230,236,255,0.7)';
  g.lineWidth = 1;
  for (const s of [-1, 1])
    for (const dy of [-1.5, 1]) {
      g.beginPath();
      g.moveTo(s * 5, -5);
      g.lineTo(s * 17, -5 + dy * 2);
      g.stroke();
    }
};

/** Aurora: an arctic fox, white with a cold blue shade. */
const arcticFox: Painter = (g, p) => {
  sitter(g, p, {
    fur: '#eef4fb',
    line: '#8ea4c2',
    pale: '#ffffff',
    ear: '#c3d4ea',
    tail: '#eef4fb',
    tip: '#cfe0f3',
  });
  for (const s of [-1, 1]) dot(g, s * 9.5, -6.5, 2.2, 'rgba(255,150,170,0.45)');
};

/** Fireflies: a firefly, hovering, its lantern pulsing; it flares in a hop. */
const firefly: Painter = (g, p) => {
  const pulse = 0.6 + 0.4 * Math.sin(p.t * 2 * W) + 0.8 * p.flick;
  glow(g, '214,255,120', 0, 9, 30 + 12 * p.flick, Math.min(0.85, 0.5 * pulse));
  const beat = Math.sin(p.t * 22 * W);
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 8, -6);
    g.rotate(s * (1 + 0.3 * beat));
    blob(g, 0, -12, 6.5, 14, 'rgba(210,235,255,0.5)', 'rgba(255,255,255,0.7)');
    g.restore();
  }
  arms(g, p, '#2a2420', '#2a2420', 8, 2.5);
  // The lantern, then the dark wing cases over it.
  blob(g, 0, 9, 10, 8.5, '#e6ff8a', '#8aa63a');
  blob(g, 0, 0, 13, 10, '#3a2f2a', '#17110e');
  g.strokeStyle = '#17110e';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(0, -9);
  g.lineTo(0, 9);
  g.stroke();
  blob(g, 0, -7, 9.5, 6.5, '#c7532f', '#17110e');
  eyes(g, 4, -7.5, 2);
  g.strokeStyle = '#17110e';
  g.lineWidth = 1.5;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * 3, -12);
    g.quadraticCurveTo(s * 6, -19, s * 11, -18);
    g.stroke();
  }
};

/** Embers: a fire salamander, black with yellow spots, the tip of its tail aglow. */
const salamander: Painter = (g, p) => {
  const wag = 0.2 * Math.sin(p.t * 2 * W) + 0.5 * p.flick;
  g.save();
  g.translate(10, 9);
  g.rotate(-wag);
  g.strokeStyle = '#17110e';
  g.lineWidth = 9;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(14, 4, 26, -2, 28, -14);
  g.stroke();
  g.strokeStyle = '#33271f';
  g.lineWidth = 6;
  g.stroke();
  glow(g, '255,150,60', 28, -15, 14 + 8 * p.flick, 0.95);
  dot(g, 28, -15, 3.5, '#ffd27a');
  g.restore();
  // Splayed feet, toes out.
  for (const s of [-1, 1]) {
    const lift = Math.max(0, Math.sin(p.step + (s > 0 ? Math.PI : 0))) * 3 * p.pace;
    blob(g, s * 15, 11 - lift - Math.min(4, p.jump * 0.2), 7, 3.2, '#33271f', '#17110e');
  }
  arms(g, p, '#33271f', '#f4c63a');
  blob(g, 0, 3, 14, 10.5, '#33271f', '#17110e');
  blob(g, 0, -8, 13, 8.5, '#33271f', '#17110e');
  for (const [x, y, r] of [
    [-6, 3, 3],
    [6, 5, 2.6],
    [0, 9, 2.2],
    [-8, -11, 2.6],
    [8, -11, 2.6],
  ] as const)
    dot(g, x, y, r, '#f4c63a');
  eyes(g, 5, -7.5);
  g.strokeStyle = '#f4c63a';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, -6, 5, 0.35, Math.PI - 0.35);
  g.stroke();
};

/** Mist: an owl; its wings open wide during a hop. */
const owl: Painter = (g, p) => {
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 12, -4);
    g.rotate(s * (-2.2 - 0.35 * p.flick + 0.3 * Math.sin(p.t * 9 * W) * p.flick));
    blob(g, 0, 13, 7, 16, '#7d6a58', '#3d3027');
    g.strokeStyle = '#3d3027';
    g.lineWidth = 1.2;
    for (const f of [-3, 0, 3]) {
      g.beginPath();
      g.moveTo(f, 16);
      g.lineTo(f, 27);
      g.stroke();
    }
    g.restore();
  }
  feet(g, p, '#e0a83a', 6, 5);
  blob(g, 0, -1, 15.5, 15.5, '#8c7763', '#3d3027');
  blob(g, 0, 4, 10, 9, '#e9dcc6');
  g.strokeStyle = '#a9927a';
  g.lineWidth = 1.4;
  for (const [x, y] of [
    [-4, 2],
    [4, 2],
    [0, 6],
    [-4, 9],
    [4, 9],
  ] as const) {
    g.beginPath();
    g.arc(x, y, 2.2, 0.2, Math.PI - 0.2);
    g.stroke();
  }
  // Ear tufts and the wide eyes.
  for (const s of [-1, 1]) {
    g.fillStyle = '#8c7763';
    g.strokeStyle = '#3d3027';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(s * 5, -14);
    g.lineTo(s * 13, -22);
    g.lineTo(s * 14, -9);
    g.closePath();
    g.fill();
    g.stroke();
    blob(g, s * 6, -7, 6.2, 6.2, '#f3ead8', '#3d3027');
    dot(g, s * 6, -7, 4.2, '#f2b632');
    // It blinks now and then.
    const shut = Math.sin(p.t * W + s * 0.05) > 0.985;
    if (shut) {
      g.strokeStyle = '#3d3027';
      g.beginPath();
      g.moveTo(s * 6 - 4, -7);
      g.lineTo(s * 6 + 4, -7);
      g.stroke();
    } else dot(g, s * 6, -7, 2.2, '#1c1410');
  }
  g.fillStyle = '#e0a83a';
  g.beginPath();
  g.moveTo(-2.5, -3.5);
  g.lineTo(2.5, -3.5);
  g.lineTo(0, 1);
  g.closePath();
  g.fill();
};

/** The animal each ambience gets, and how high above the ground it hovers. */
export const CRITTERS: Readonly<
  Record<
    Weather,
    { paint: Painter; hover: number; lift: number; bound?: [height: number, rate: number] }
  >
> = {
  sea: { paint: crab, hover: 0, lift: 0 },
  rain: { paint: frog, hover: 0, lift: 10, bound: [11, 5.2] },
  snow: { paint: penguin, hover: 0, lift: 7 },
  autumn: { paint: squirrel, hover: 0, lift: 18, bound: [6, 8.5] },
  summer: { paint: bee, hover: 22, lift: 0 },
  spring: { paint: rabbit, hover: 0, lift: 6 },
  storm: { paint: hedgehog, hover: 0, lift: 0 },
  stars: { paint: cat, hover: 0, lift: 13 },
  aurora: { paint: arcticFox, hover: 0, lift: 13 },
  fireflies: { paint: firefly, hover: 22, lift: 0 },
  embers: { paint: salamander, hover: 0, lift: 3 },
  mist: { paint: owl, hover: 0, lift: 9 },
};
