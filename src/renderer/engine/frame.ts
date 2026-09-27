// Frame composition: paints one frame of the board, snakes, hazards and overlays in draw order,
// and keeps the frame-rate readout used by the debug overlay.

import type { AmbienceFrame } from './types-api.ts';
import type { Body, Point, Round, Settings } from './types.ts';
import { paintBanner } from './announcements.ts';
import { paintOfferings, paintStones, paintBrambles } from './board-items.ts';
import { ctx, setCtx } from './canvas.ts';
import { paintAiDebug, paintLiveMockup } from './debug-overlay.ts';
import { paintDuel, paintDuelStatus } from './duel-hud.ts';
import { paintShell, paintSparks, paintHalos } from './effects.ts';
import { paintEndScreen } from './end-screen.ts';
import { paintFans, paintFlyers, paintGiftBerries, updateFans } from './fan-rings.ts';
import { paintGiftScroll, paintDuelLegend } from './gift-panel.ts';
import {
  CELL,
  COLS,
  H,
  OX,
  ROWS,
  SR_H,
  SR_W,
  SR_X,
  SR_Y,
  W,
  WF,
  X0,
  Y0,
  Z_BANNER,
  Z_GIFTS,
  Z_COMMENTS,
  Z_INPUT,
} from './layout.ts';
import { BLUE } from './palette.ts';
import { HATCH_TIME } from './rules.ts';
import { paintScore, paintPersonGlyph } from './scoreboard.ts';
import { paintEnergy } from './crowd-energy.ts';
import { tension } from './tension.ts';
import {
  activeIndex,
  getAmbience,
  loadBody,
  bodies,
  egg,
  round,
  storeBody,
  settings,
  t,
  trace,
} from '../scripts/game.ts';

export function paintRace(): void {
  return;
}

// The gap between the two silhouettes uses `destination-out` compositing. On the main canvas this
// mode would punch through the entire image including the background because the counter is drawn
// on top of everything. The glyph is therefore baked once into an offscreen sprite where clipping
// affects only itself. Paid once per match, not per frame.
export const VIEWERS_RS = 48;

export let viewersSprite: HTMLCanvasElement | null = null;

export function paintViewersGlyph(x: number, y: number, r: number): void {
  if (!viewersSprite) {
    const s = document.createElement('canvas');
    s.width = s.height = 2 * VIEWERS_RS;
    const offCtx = s.getContext('2d');
    if (!offCtx) return;
    const savedCtx = setCtx(offCtx);
    try {
      offCtx.translate(VIEWERS_RS, VIEWERS_RS);
      const R = VIEWERS_RS * 0.66;
      offCtx.fillStyle = BLUE;
      paintPersonGlyph(R * 0.86, -R * 0.16, R * 0.74);
      offCtx.globalCompositeOperation = 'destination-out';
      offCtx.lineWidth = R * 0.3;
      offCtx.strokeStyle = '#000';
      offCtx.fillStyle = '#000';
      paintPersonGlyph(-R * 0.3, 0, R * 0.96);
      offCtx.stroke();
      offCtx.globalCompositeOperation = 'source-over';
      offCtx.fillStyle = BLUE;
      paintPersonGlyph(-R * 0.3, 0, R * 0.86);
    } finally {
      setCtx(savedCtx);
    }
    viewersSprite = s;
  }
  const k = r / (VIEWERS_RS * 0.66),
    w = 2 * VIEWERS_RS * k;
  const c = ctx as CanvasRenderingContext2D | null;
  if (!c) return;
  c.drawImage(viewersSprite, x - w / 2, y - w / 2, w, w);
}

export let frameDt = 0.016;

export let smoothedFps = 60,
  worstDt = 0,
  worstDtTimer = 0,
  displayedWorstDt = 0;

// Point on the timer rail at arc length s from the top center, clockwise (the direction the red
// stroke is drawn). Same geometry as ctx.roundRect(x, y, w, h, r).
export function pointRail(x: number, y: number, w: number, h: number, r: number, s: number): Point {
  const straightLen = w / 2 - r,
    q = (Math.PI * r) / 2,
    sideLen = h - 2 * r,
    bottomLen = w - 2 * r;
  const arc = (cx: number, cy: number, a0: number, u: number): Point => ({
    x: cx + r * Math.cos(a0 + (u * Math.PI) / 2),
    y: cy + r * Math.sin(a0 + (u * Math.PI) / 2),
  });
  if (s < straightLen) return { x: x + w / 2 + s, y };
  s -= straightLen;
  if (s < q) return arc(x + w - r, y + r, -Math.PI / 2, s / q);
  s -= q;
  if (s < sideLen) return { x: x + w, y: y + r + s };
  s -= sideLen;
  if (s < q) return arc(x + w - r, y + h - r, 0, s / q);
  s -= q;
  if (s < bottomLen) return { x: x + w - r - s, y: y + h };
  s -= bottomLen;
  if (s < q) return arc(x + r, y + h - r, Math.PI / 2, s / q);
  s -= q;
  if (s < sideLen) return { x, y: y + h - r - s };
  s -= sideLen;
  if (s < q) return arc(x + r, y + r, Math.PI, s / q);
  s -= q;
  return { x: x + r + Math.min(s, straightLen), y };
}

export function paintRound(): void {
  if (!round) return;
  paintDuel(frameDt);
  return;
}

// Smooth mode: shadow blur on the main canvas is suppressed (becomes a no-op) and restored when
// smooth mode is off. A single toggle; none of the 47 shadow-blur sites need touching.
export let smoothModeActive = false;

export function setSmoothMode(): void {
  const s: Settings = settings;
  const wantsSmooth = s.smooth;
  if (wantsSmooth === smoothModeActive) return;
  const c = ctx as CanvasRenderingContext2D | null;
  if (!c) return;
  if (wantsSmooth)
    Object.defineProperty(c, 'shadowBlur', {
      set() {
        return;
      },
      get() {
        return 0;
      },
      configurable: true,
    });
  else Reflect.deleteProperty(c, 'shadowBlur');
  smoothModeActive = wantsSmooth;
}

export function drawFrame(dt: number): void {
  setSmoothMode();
  const c = ctx as CanvasRenderingContext2D | null;
  if (!c) return;
  const a = getAmbience();
  const typedTrace: Point[] = trace;
  const headPos: Point = typedTrace[0] ?? { x: W / 2, y: H / 2 };
  const s: Settings = settings;
  const typedRound: Round | null = round;
  const typedBodies: (Body | undefined)[] = bodies;
  const e: AmbienceFrame = {
    t,
    dt,
    W,
    H,
    cell: CELL,
    x0: X0,
    y0: Y0,
    cols: COLS,
    rows: ROWS,
    head: headPos,
    world: 0,
    worldKind: null,
    silence: 0,
    hour: s.hour,
    weather: s.weather,
    weatherSnap: typedRound?.state === 'playing' && typedRound.t < 0.3 && s.autoAmbience,
    subStep:
      s.forcedStep ??
      (typedRound
        ? Math.min(1, (typedRound.t || 0) / Math.max(1, s.duelDuration || s.duration))
        : 0),
    progression: 0,
    tension: tension,
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
  if (!a) {
    c.fillStyle = '#141e17';
    c.fillRect(0, 0, W, H);
    return;
  }
  // In 16:9 the ambience covers the full frame including side margins: it receives the total width
  // and is offset by the margin, while the game and HUD remain drawn in the original vertical composition.
  const inFrame = (f: (frame: AmbienceFrame) => void): void => {
    if (!OX) {
      f(e);
      return;
    }
    const sW = e.W,
      sX = e.x0,
      sT = e.head;
    e.W = WF;
    e.x0 = X0 + OX;
    e.head = { x: sT.x + OX, y: sT.y };
    c.save();
    c.translate(-OX, 0);
    try {
      f(e);
    } finally {
      c.restore();
      e.W = sW;
      e.x0 = sX;
      e.head = sT;
    }
  };
  inFrame((e2) => {
    a.paintBack(c, e2);
  });
  c.save();
  paintRace();
  paintOfferings();
  paintGiftBerries(c);
  paintStones();
  paintBrambles();

  for (let _i = 0; _i < typedBodies.length; _i++) {
    loadBody(_i);
    const bodyTint = typedBodies[activeIndex]?.tint;
    a.paintSnake(c, trace, CELL, bodyTint !== undefined ? { ...e, tint: bodyTint } : e);
    const activeBody = typedBodies[activeIndex];
    if (activeBody && activeBody.shieldTime > 0 && trace.length) {
      // Active shield: pulsing bubble around the head, fading over the last 3 seconds.
      const h = trace[0];
      if (h) {
        const bt = activeBody.shieldTime,
          shieldFade = Math.min(1, bt / 3);
        const rgb = activeIndex === 0 ? '242,197,124' : '180,212,222';
        const R = CELL * (0.62 + 0.04 * Math.sin(t * 5));
        c.save();
        c.globalAlpha = 0.35 + 0.45 * shieldFade;
        const g = c.createRadialGradient(h.x, h.y, R * 0.55, h.x, h.y, R);
        g.addColorStop(0, `rgba(${rgb},0)`);
        g.addColorStop(0.8, `rgba(${rgb},0.35)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        c.fillStyle = g;
        c.beginPath();
        c.arc(h.x, h.y, R, 0, Math.PI * 2);
        c.fill();
        c.lineWidth = 2.5;
        c.strokeStyle = `rgba(255,255,255,${String(0.5 + 0.4 * shieldFade)})`;
        c.shadowColor = `rgba(${rgb},0.9)`;
        c.shadowBlur = 14;
        c.beginPath();
        c.arc(h.x, h.y, R * 0.86, 0, Math.PI * 2);
        c.stroke();
        c.restore();
      }
    }
    if (egg) paintShell(egg.t / HATCH_TIME);
    storeBody();
  }
  loadBody(0);
  updateFans(dt);
  paintFans(c);
  if (s.aiDebug) paintAiDebug();
  // Performance readout (AI debug layer only): smoothed frames per second and worst frame time over the last 2 seconds.
  smoothedFps += ((dt > 0 ? 1 / dt : 60) - smoothedFps) * 0.05;
  worstDtTimer += dt;
  if (dt > worstDt) worstDt = dt;
  if (worstDtTimer > 2) {
    displayedWorstDt = worstDt;
    worstDt = 0;
    worstDtTimer = 0;
  }
  if (s.aiDebug) {
    c.save();
    c.font = 'bold 22px sans-serif';
    c.textAlign = 'left';
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(20, 20, 330, 34);
    c.fillStyle = smoothedFps < 50 ? '#ff6a5a' : '#9be28a';
    c.fillText(
      String(Math.round(smoothedFps)) +
        ' fps   worst frame ' +
        String(Math.round(displayedWorstDt * 1000)) +
        ' ms',
      28,
      45,
    );
    c.restore();
  }
  paintHalos();
  paintSparks();
  c.restore();
  frameDt = dt;
  paintRound();
  inFrame((e2) => {
    a.paintFront(c, e2);
  });
  paintScore();
  paintEnergy();
  const hasGifts = s.platform !== 'neutral';
  if (hasGifts) paintDuelStatus();
  // settings.giftDisplay: 'scroll' (scrolling banners), 'full' (full legend panel), unset for no display.
  if (hasGifts) {
    const giftDisplayMode = s.giftDisplay;
    if (giftDisplayMode === 'scroll') paintGiftScroll();
    else if (giftDisplayMode === 'full') paintDuelLegend();
  }
  paintFlyers(c);
  // End screen painted AFTER the score and legend: one full-screen veil with the ranking on top.
  if (typedRound && typedRound.state !== 'playing') paintEndScreen();
  paintBanner();
  if (s.mockup) paintLiveMockup();
  inFrame((e2) => {
    a.update(dt, e2);
  });
  if (s.zones) {
    c.save();
    c.globalAlpha = 0.2;
    // TikTok UI overlay zones, at positions measured from a real capture.
    c.fillStyle = '#f0f';
    c.fillRect(0, 0, W, SR_Y);
    c.fillRect(0, SR_Y + SR_H, W, H - SR_Y - SR_H);
    c.fillStyle = '#ff0';
    [Z_GIFTS, Z_BANNER, Z_COMMENTS, Z_INPUT].forEach((z) => {
      c.fillRect(z.x, z.y, z.w, z.h);
    });
    c.globalAlpha = 0.9;
    c.strokeStyle = '#0f0';
    c.lineWidth = 3;
    c.strokeRect(SR_X + 2, SR_Y, SR_W - 4, SR_H);
    c.restore();
  }
}
