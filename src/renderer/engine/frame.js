// Frame composition: paints one frame of the board, snakes, hazards and overlays in draw order,
// and keeps the frame-rate readout used by the debug overlay.

import { peindreBandeau } from './announcements.js';
import { peindreOffrandes, peindreRochers, peindreRonces } from './board-items.js';
import { ctx, setCtx } from './canvas.js';
import { peindreDebugIA, peindreMaquetteLive } from './debug-overlay.js';
import { peindreDuel, peindreStatutsDuel } from './duel-hud.js';
import { peindreCoquille, peindreEtincelles, peindreHalos } from './effects.js';
import { peindreFin } from './end-screen.js';
import { peindreDefileCadeaux, peindreLegendeDuel } from './gift-panel.js';
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
  Z_BANNIERE,
  Z_CADEAUX,
  Z_FIL,
  Z_SAISIE,
} from './layout.js';
import { BLEU } from './palette.js';
import { ECLOSION } from './rules.js';
import { peindreScore, personne } from './scoreboard.js';
import { tension } from './tension.js';
import {
  actif,
  amb,
  charger,
  corps,
  couvee,
  manche,
  ranger,
  reglages,
  t,
  trace,
} from '../scripts/game.js';

export function peindreCourse() {
  return;
}

// Le vide entre les deux silhouettes se creuse en `destination-out`. Sur le canvas principal ce
// mode trouerait l'image entiere, fond compris, puisque le compteur est dessine par-dessus tout.
// Le glyphe est donc cuit une seule fois dans un sprite hors ecran, ou le decoupage ne concerne
// que lui. Bonus : il est paye une fois pour toute la partie et non a chaque image.
export const GENS_RS = 48;

export let spriteGens = null;

export function glypheGens(x, y, r) {
  if (!spriteGens) {
    const s = document.createElement('canvas');
    s.width = s.height = 2 * GENS_RS;
    const avant = setCtx(s.getContext('2d'));
    try {
      ctx.translate(GENS_RS, GENS_RS);
      const R = GENS_RS * 0.66;
      ctx.fillStyle = BLEU;
      personne(R * 0.86, -R * 0.16, R * 0.74);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = R * 0.3;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#000';
      personne(-R * 0.3, 0, R * 0.96);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = BLEU;
      personne(-R * 0.3, 0, R * 0.86);
    } finally {
      setCtx(avant);
    }
    spriteGens = s;
  }
  const k = r / (GENS_RS * 0.66),
    w = 2 * GENS_RS * k;
  ctx.drawImage(spriteGens, x - w / 2, y - w / 2, w, w);
}

export let dtRendu = 0.016;

export let ipsLisse = 60,
  pireDt = 0,
  pireT = 0,
  pireAffiche = 0;

// Point du rail du timer a la distance s du haut-centre, dans le sens horaire (le sens ou le trait
// rouge est dessine). Meme geometrie que ctx.roundRect(x,y,w,h,r).
export function pointRail(x, y, w, h, r, s) {
  const droit = w / 2 - r,
    q = (Math.PI * r) / 2,
    cote = h - 2 * r,
    bas = w - 2 * r;
  const arc = (cx, cy, a0, u) => ({
    x: cx + r * Math.cos(a0 + (u * Math.PI) / 2),
    y: cy + r * Math.sin(a0 + (u * Math.PI) / 2),
  });
  if (s < droit) return { x: x + w / 2 + s, y };
  s -= droit;
  if (s < q) return arc(x + w - r, y + r, -Math.PI / 2, s / q);
  s -= q;
  if (s < cote) return { x: x + w, y: y + r + s };
  s -= cote;
  if (s < q) return arc(x + w - r, y + h - r, 0, s / q);
  s -= q;
  if (s < bas) return { x: x + w - r - s, y: y + h };
  s -= bas;
  if (s < q) return arc(x + r, y + h - r, Math.PI / 2, s / q);
  s -= q;
  if (s < cote) return { x, y: y + h - r - s };
  s -= cote;
  if (s < q) return arc(x + r, y + r, Math.PI, s / q);
  s -= q;
  return { x: x + r + Math.min(s, droit), y };
}

export function peindreManche() {
  if (!manche) return;
  peindreDuel(dtRendu);
  return;
}

// Mode fluide : on masque la propriete shadowBlur du canevas principal (elle devient sans effet), et on la
// rend quand le mode est coupe. Une seule bascule, aucun des 47 endroits qui posent un flou n'est touche.
export let fluideActif = false;

export function reglerFluide() {
  const veut = !!reglages.fluide;
  if (veut === fluideActif || !ctx) return;
  if (veut)
    Object.defineProperty(ctx, 'shadowBlur', {
      set() {},
      get() {
        return 0;
      },
      configurable: true,
    });
  else delete ctx.shadowBlur;
  fluideActif = veut;
}

export function dessiner(dt) {
  reglerFluide();
  const a = amb(),
    tete = trace.length ? trace[0] : { x: W / 2, y: H / 2 };
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
    tete,
    monde: 0,
    mondeSorte: null,
    silence: 0,
    heure: reglages.heure,
    meteo: reglages.meteo,
    meteoNet: !!(manche && manche.etat === 'en cours' && manche.t < 0.3 && reglages.ambianceAuto),
    avance:
      reglages.avanceForcee !== undefined
        ? reglages.avanceForcee
        : manche
          ? Math.min(1, (manche.t || 0) / Math.max(1, reglages.dureeDuel || reglages.duree))
          : 0,
    progression: 0,
    tension: tension,
    reduit: !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  if (!a) {
    ctx.fillStyle = '#141e17';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  // En 16:9 l'ambiance couvre tout le cadre (les cotes compris) : on lui passe la largeur totale et on la
  // decale de la marge ; le jeu et le HUD, eux, restent dessines dans la composition verticale intacte.
  const enCadre = (f) => {
    if (!OX) return f(e);
    const sW = e.W,
      sX = e.x0,
      sT = e.tete;
    e.W = WF;
    e.x0 = X0 + OX;
    e.tete = { x: sT.x + OX, y: sT.y };
    ctx.save();
    ctx.translate(-OX, 0);
    try {
      return f(e);
    } finally {
      ctx.restore();
      e.W = sW;
      e.x0 = sX;
      e.tete = sT;
    }
  };
  enCadre((e2) => a.peindreFond(ctx, e2));
  ctx.save();
  peindreCourse();
  peindreOffrandes();
  peindreRochers();
  peindreRonces();

  for (let _i = 0; _i < corps.length; _i++) {
    charger(_i);
    a.peindreSerpent(ctx, trace, CELL, {
      ...e,
      teinte: corps[actif].teinte,
    });
    if (corps[actif].bouclierT > 0 && trace.length) {
      // bouclier actif : bulle autour de la tete, qui respire, et qui s'affine sur les 3 dernieres secondes
      const h = trace[0],
        bt = corps[actif].bouclierT,
        fin = Math.min(1, bt / 3);
      const rgb = actif === 0 ? '242,197,124' : '180,212,222';
      const R = CELL * (0.62 + 0.04 * Math.sin(t * 5));
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.45 * fin;
      const g = ctx.createRadialGradient(h.x, h.y, R * 0.55, h.x, h.y, R);
      g.addColorStop(0, 'rgba(' + rgb + ',0)');
      g.addColorStop(0.8, 'rgba(' + rgb + ',0.35)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(h.x, h.y, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.4 * fin) + ')';
      ctx.shadowColor = 'rgba(' + rgb + ',0.9)';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(h.x, h.y, R * 0.86, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (couvee) peindreCoquille(couvee.t / ECLOSION);
    ranger();
  }
  charger(0);
  if (reglages.debugIA) peindreDebugIA();
  // Mesure de fluidite (calque Debug IA seulement) : images par seconde lissees et pire image des 2 dernieres secondes
  ipsLisse += ((dt > 0 ? 1 / dt : 60) - ipsLisse) * 0.05;
  pireT += dt;
  if (dt > pireDt) pireDt = dt;
  if (pireT > 2) {
    pireAffiche = pireDt;
    pireDt = 0;
    pireT = 0;
  }
  if (reglages.debugIA) {
    ctx.save();
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(20, 20, 330, 34);
    ctx.fillStyle = ipsLisse < 50 ? '#ff6a5a' : '#9be28a';
    ctx.fillText(
      Math.round(ipsLisse) + ' ips   pire image ' + Math.round(pireAffiche * 1000) + ' ms',
      28,
      45,
    );
    ctx.restore();
  }
  peindreHalos();
  peindreEtincelles();
  ctx.restore();
  dtRendu = dt;
  peindreManche();
  enCadre((e2) => a.peindreAvant(ctx, e2));
  peindreScore();
  const avecCadeaux = reglages.plateforme !== 'neutre';
  if (avecCadeaux) peindreStatutsDuel();
  // affichageCadeaux : 'defile' (bandeaux qui defilent, avec le pattern visible/cache), 'complet' (ancienne legende), 'aucun' (rien)
  if (avecCadeaux) {
    const mA = reglages.affichageCadeaux || 'complet';
    if (mA === 'defile') peindreDefileCadeaux();
    else if (mA === 'complet') peindreLegendeDuel();
  }
  // Ecran de fin du duel, peint APRES le score et la legende (Abdel : « your grey veil just apply to gift and do
  // not consider the whole screen, make it smoother ») : un seul voile, plein ecran, et le classement devant tout.
  if (manche && manche.etat !== 'en cours') peindreFin();
  peindreBandeau();
  if (reglages.maquette) peindreMaquetteLive();
  enCadre((e2) => a.maj(dt, e2));
  if (reglages.zones) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    // ce que l'interface TikTok recouvre, aux positions MESUREES sur la capture d'Abdel
    ctx.fillStyle = '#f0f';
    ctx.fillRect(0, 0, W, SR_Y);
    ctx.fillRect(0, SR_Y + SR_H, W, H - SR_Y - SR_H);
    ctx.fillStyle = '#ff0';
    [Z_CADEAUX, Z_BANNIERE, Z_FIL, Z_SAISIE].forEach((z) => ctx.fillRect(z.x, z.y, z.w, z.h));
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#0f0';
    ctx.lineWidth = 3;
    ctx.strokeRect(SR_X + 2, SR_Y, SR_W - 4, SR_H);
    ctx.restore();
  }
}
