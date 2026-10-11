// The little icons that burst around a viewer alert card, one icon per kind, all in the same
// style as the like hearts: pink hearts for likes, gold sparkles for a join, blossoms for
// a share, butterflies for a follow. Each is drawn once and stamped.

import type { AlertKind } from './alerts.ts';

const RES = 64;
const sprites: Partial<Record<AlertKind, HTMLCanvasElement>> = {};

function make(draw: (g: CanvasRenderingContext2D) => void, res = RES): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = res;
  const g = cv.getContext('2d');
  if (g) {
    // Drawn on a 32 x 32 grid centred on the sprite.
    g.translate(res / 2, res / 2);
    g.scale(res / 32, res / 32);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    draw(g);
  }
  return cv;
}

function shine(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.beginPath();
  g.ellipse(x, y, 3, 1.9, -0.6, 0, Math.PI * 2);
  g.fill();
}

function heartPath(g: CanvasRenderingContext2D): void {
  g.translate(0, 1);
  g.beginPath();
  g.moveTo(0, 12);
  g.bezierCurveTo(-18, 0, -14, -15, 0, -7);
  g.bezierCurveTo(14, -15, 18, 0, 0, 12);
}

function heart(g: CanvasRenderingContext2D): void {
  heartPath(g);
  const fill = g.createLinearGradient(0, -14, 0, 12);
  fill.addColorStop(0, '#ffb3c6');
  fill.addColorStop(1, '#ff4d78');
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 1.6;
  g.strokeStyle = 'rgba(255,245,248,0.95)';
  g.stroke();
  shine(g, -6, -6);
}

/** A four-point sparkle, for someone arriving. */
function sparkle(g: CanvasRenderingContext2D): void {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2,
      r = i % 2 ? 4.2 : 14;
    if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  const fill = g.createLinearGradient(0, -14, 0, 14);
  fill.addColorStop(0, '#fff4c2');
  fill.addColorStop(1, '#f2b94a');
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 1.4;
  g.strokeStyle = 'rgba(255,250,230,0.95)';
  g.stroke();
}

/** A little blossom, the berry flower's own: someone shares the live. */
function share(g: CanvasRenderingContext2D): void {
  for (let i = 0; i < 5; i++) {
    g.save();
    g.rotate((i / 5) * Math.PI * 2);
    const petal = g.createLinearGradient(0, 0, 0, -13);
    petal.addColorStop(0, '#e98aa0');
    petal.addColorStop(1, '#fbd3dc');
    g.fillStyle = petal;
    g.beginPath();
    g.ellipse(0, -7, 5.2, 7.4, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,240,244,0.9)';
    g.stroke();
    g.restore();
  }
  g.fillStyle = '#ffe07a';
  g.beginPath();
  g.arc(0, 0, 3.8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.arc(-1.2, -1.2, 1.3, 0, Math.PI * 2);
  g.fill();
}

/** A little butterfly, wings open (the flap is animated when drawn): someone follows. */
function follow(g: CanvasRenderingContext2D): void {
  const upper = g.createLinearGradient(0, -14, 0, 0);
  upper.addColorStop(0, '#ffc2d2');
  upper.addColorStop(1, '#ff8fab');
  g.fillStyle = upper;
  g.beginPath();
  g.ellipse(-7, -5, 7, 6, -0.5, 0, Math.PI * 2);
  g.ellipse(7, -5, 7, 6, 0.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#8fd0e8';
  g.beginPath();
  g.ellipse(-6, 6, 5.2, 4, 0.4, 0, Math.PI * 2);
  g.ellipse(6, 6, 5.2, 4, -0.4, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,245,248,0.9)';
  g.stroke();
  g.fillStyle = '#3a2a2a';
  g.beginPath();
  g.roundRect(-1.3, -8, 2.6, 16, 1.3);
  g.fill();
  g.strokeStyle = '#3a2a2a';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-0.5, -8);
  g.quadraticCurveTo(-3, -12, -5, -12);
  g.moveTo(0.5, -8);
  g.quadraticCurveTo(3, -12, 5, -12);
  g.stroke();
}

const DRAW: Readonly<Record<AlertKind, (g: CanvasRenderingContext2D) => void>> = {
  like: heart,
  join: sparkle,
  share,
  follow,
  // Never burst (a kill's card has no icons): here for the table to be complete.
  kill: share,
};

export function burstSprite(kind: AlertKind): HTMLCanvasElement {
  return (sprites[kind] ??= make(DRAW[kind]));
}

/** The like heart drawn larger, for where it is shown big: filled, or its rim alone (empty). */
let bigHearts: { full: HTMLCanvasElement; rim: HTMLCanvasElement } | null = null;
export function bigHeart(full: boolean): HTMLCanvasElement {
  bigHearts ??= {
    full: make(heart, 128),
    rim: make((g) => {
      heartPath(g);
      g.lineWidth = 2.6;
      g.strokeStyle = 'rgba(255,245,248,0.95)';
      g.stroke();
    }, 128),
  };
  return full ? bigHearts.full : bigHearts.rim;
}
