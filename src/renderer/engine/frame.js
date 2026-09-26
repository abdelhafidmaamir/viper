// Frame composition: paints one frame of the board, snakes, hazards and overlays in draw order,
// and keeps the frame-rate readout used by the debug overlay.

import { paintBanner } from './announcements.js';
import { paintOfferings, paintStones, paintBrambles } from './board-items.js';
import { ctx, setCtx } from './canvas.js';
import { paintAiDebug, paintLiveMockup } from './debug-overlay.js';
import { paintDuel, paintDuelStatus } from './duel-hud.js';
import { paintShell, paintSparks, paintHalos } from './effects.js';
import { paintEndScreen } from './end-screen.js';
import { paintGiftScroll, paintDuelLegend } from './gift-panel.js';
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
} from './layout.js';
import { BLUE } from './palette.js';
import { HATCH_TIME } from './rules.js';
import { paintScore, paintPersonGlyph } from './scoreboard.js';
import { tension } from './tension.js';
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
} from '../scripts/game.js';

export function paintRace() {
  return;
}

// Le vide entre les deux silhouettes se creuse en `destination-out`. Sur le canvas principal ce
// mode trouerait l'image entiere, fond compris, puisque le compteur est dessine par-dessus tout.
// Le glyphe est donc cuit une seule fois dans un sprite hors ecran, ou le decoupage ne concerne
// que lui. Bonus : il est paye une fois pour toute la partie et non a chaque image.
export const VIEWERS_RS = 48;

export let viewersSprite = null;

export function paintViewersGlyph(x, y, r) {
  if (!viewersSprite) {
    const s = document.createElement('canvas');
    s.width = s.height = 2 * VIEWERS_RS;
    const savedCtx = setCtx(s.getContext('2d'));
    try {
      ctx.translate(VIEWERS_RS, VIEWERS_RS);
      const R = VIEWERS_RS * 0.66;
      ctx.fillStyle = BLUE;
      paintPersonGlyph(R * 0.86, -R * 0.16, R * 0.74);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = R * 0.3;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
      paintPersonGlyph(-R * 0.3, 0, R * 0.96);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = BLUE;
      paintPersonGlyph(-R * 0.3, 0, R * 0.86);
    } finally {
      setCtx(savedCtx);
    }
    viewersSprite = s;
  }
  const k = r / (VIEWERS_RS * 0.66),
    w = 2 * VIEWERS_RS * k;
  ctx.drawImage(viewersSprite, x - w / 2, y - w / 2, w, w);
}

export let frameDt = 0.016;

export let smoothedFps = 60,
  worstDt = 0,
  worstDtTimer = 0,
  displayedWorstDt = 0;

// Point du rail du timer a la distance s du haut-centre, dans le sens horaire (le sens ou le trait
// rouge est dessine). Meme geometrie que ctx.roundRect(x,y,w,h,r).
export function pointRail(x, y, w, h, r, s) {
  const straightLen = w / 2 - r,
    q = (Math.PI * r) / 2,
    sideLen = h - 2 * r,
    bottomLen = w - 2 * r;
  const arc = (cx, cy, a0, u) => ({
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

export function paintRound() {
  if (!round) return;
  paintDuel(frameDt);
  return;
}

// Mode fluide : on masque la propriete shadowBlur du canevas principal (elle devient sans effet), et on la
// rend quand le mode est coupe. Une seule bascule, aucun des 47 endroits qui posent un flou n'est touche.
export let smoothModeActive = false;

export function setSmoothMode() {
  const wantsSmooth = !!settings.smooth;
  if (wantsSmooth === smoothModeActive || !ctx) return;
  if (wantsSmooth)
    Object.defineProperty(ctx, 'shadowBlur', {
      set() {},
      get() {
        return 0;
      },
      configurable: true,
    });
  else delete ctx.shadowBlur;
  smoothModeActive = wantsSmooth;
}

export function drawFrame(dt) {
  setSmoothMode();
  const a = getAmbience(),
    headPos = trace.length ? trace[0] : { x: W / 2, y: H / 2 };
  const e = {
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
    hour: settings.hour,
    weather: settings.weather,
    weatherSnap: !!(round && round.state === 'playing' && round.t < 0.3 && settings.autoAmbience),
    subStep:
      settings.forcedStep !== undefined
        ? settings.forcedStep
        : round
          ? Math.min(1, (round.t || 0) / Math.max(1, settings.duelDuration || settings.duration))
          : 0,
    progression: 0,
    tension: tension,
    reduced: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  if (!a) {
    ctx.fillStyle = '#141e17';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  // En 16:9 l'ambiance couvre tout le cadre (les cotes compris) : on lui passe la largeur totale et on la
  // decale de la marge ; le jeu et le HUD, eux, restent dessines dans la composition verticale intacte.
  const inFrame = (f) => {
    if (!OX) return f(e);
    const sW = e.W,
      sX = e.x0,
      sT = e.head;
    e.W = WF;
    e.x0 = X0 + OX;
    e.head = { x: sT.x + OX, y: sT.y };
    ctx.save();
    ctx.translate(-OX, 0);
    try {
      return f(e);
    } finally {
      ctx.restore();
      e.W = sW;
      e.x0 = sX;
      e.head = sT;
    }
  };
  inFrame((e2) => a.paintBack(ctx, e2));
  ctx.save();
  paintRace();
  paintOfferings();
  paintStones();
  paintBrambles();

  for (let _i = 0; _i < bodies.length; _i++) {
    loadBody(_i);
    a.paintSnake(ctx, trace, CELL, {
      ...e,
      tint: bodies[activeIndex].tint,
    });
    if (bodies[activeIndex].shieldTime > 0 && trace.length) {
      // bouclier actif : bulle autour de la tete, qui respire, et qui s'affine sur les 3 dernieres secondes
      const h = trace[0],
        bt = bodies[activeIndex].shieldTime,
        shieldFade = Math.min(1, bt / 3);
      const rgb = activeIndex === 0 ? '242,197,124' : '180,212,222';
      const R = CELL * (0.62 + 0.04 * Math.sin(t * 5));
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.45 * shieldFade;
      const g = ctx.createRadialGradient(h.x, h.y, R * 0.55, h.x, h.y, R);
      g.addColorStop(0, 'rgba(' + rgb + ',0)');
      g.addColorStop(0.8, 'rgba(' + rgb + ',0.35)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.4 * shieldFade) + ')';
      ctx.shadowColor = 'rgba(' + rgb + ',0.9)';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(h.x, h.y, R * 0.86, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (egg) paintShell(egg.t / HATCH_TIME);
    storeBody();
  }
  loadBody(0);
  if (settings.aiDebug) paintAiDebug();
  // Mesure de fluidite (calque Debug IA seulement) : images par seconde lissees et pire image des 2 dernieres secondes
  smoothedFps += ((dt > 0 ? 1 / dt : 60) - smoothedFps) * 0.05;
  worstDtTimer += dt;
  if (dt > worstDt) worstDt = dt;
  if (worstDtTimer > 2) {
    displayedWorstDt = worstDt;
    worstDt = 0;
    worstDtTimer = 0;
  }
  if (settings.aiDebug) {
    ctx.save();
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(20, 20, 330, 34);
    ctx.fillStyle = smoothedFps < 50 ? '#ff6a5a' : '#9be28a';
    ctx.fillText(
      Math.round(smoothedFps) + ' ips   pire image ' + Math.round(displayedWorstDt * 1000) + ' ms',
      28,
      45,
    );
    ctx.restore();
  }
  paintHalos();
  paintSparks();
  ctx.restore();
  frameDt = dt;
  paintRound();
  inFrame((e2) => a.paintFront(ctx, e2));
  paintScore();
  const hasGifts = settings.platform !== 'neutral';
  if (hasGifts) paintDuelStatus();
  // affichageCadeaux : 'defile' (bandeaux qui defilent, avec le pattern visible/cache), 'complet' (ancienne legende), 'aucun' (rien)
  if (hasGifts) {
    const giftDisplayMode = settings.giftDisplay || 'full';
    if (giftDisplayMode === 'scroll') paintGiftScroll();
    else if (giftDisplayMode === 'full') paintDuelLegend();
  }
  // Ecran de fin du duel, peint APRES le score et la legende (Abdel : « your grey veil just apply to gift and do
  // not consider the whole screen, make it smoother ») : un seul voile, plein ecran, et le classement devant tout.
  if (round && round.state !== 'playing') paintEndScreen();
  paintBanner();
  if (settings.mockup) paintLiveMockup();
  inFrame((e2) => a.update(dt, e2));
  if (settings.zones) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    // ce que l'interface TikTok recouvre, aux positions MESUREES sur la capture d'Abdel
    ctx.fillStyle = '#f0f';
    ctx.fillRect(0, 0, W, SR_Y);
    ctx.fillRect(0, SR_Y + SR_H, W, H - SR_Y - SR_H);
    ctx.fillStyle = '#ff0';
    [Z_GIFTS, Z_BANNER, Z_COMMENTS, Z_INPUT].forEach((z) => ctx.fillRect(z.x, z.y, z.w, z.h));
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 3;
    ctx.strokeRect(SR_X + 2, SR_Y, SR_W - 4, SR_H);
    ctx.restore();
  }
}
