// Transient effects: the hatching eggshell, the halos around bites and the spark bursts.

import { CELL } from './layout.js';
import { ctx } from './canvas.js';
import { COQUILLE, OMBRE, OR, ROUGE, teinteBaie } from './palette.js';
import { ECLOSION, SORTIE, TRAINE, couvee, duel, etincelles, halos, px } from '../scripts/game.js';

// Anime la naissance du serpent : un oeuf se pose, se fend et eclate.
// Appeler a chaque image avec u de 0 a 1. Purement visuel, aucun effet de bord.
// La naissance : l'oeuf respire, il se fend, il retient son souffle, puis il eclate
// et le serpent en sort. Tout est en fonctions douces, rien ne demarre ni ne s'arrete net.
export const doux = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export const sortant = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

export const bruit = (i, d) => {
  const v = Math.sin(i * 12.9898 + d * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

export function peindreCoquille(u) {
  const p = px(couvee.x, couvee.y),
    t = couvee.t;
  const RX = CELL * 0.5,
    RY = CELL * 0.66;
  const S = SORTIE; // instant de la rupture, en fraction de l'animation
  const av = Math.min(1, u / S); // avant la rupture
  const ap = Math.max(0, (u - S) / (1 + TRAINE / ECLOSION - S)); // apres, jusqu'a l'effacement complet

  ctx.save();
  ctx.translate(p.x, p.y);

  if (u < S) {
    // 1. il respire et il tremble, de plus en plus, puis il se fige juste avant de ceder
    const souffle = doux(av / 0.82); // montee de l'agitation
    const retenue = doux(Math.max(0, (av - 0.82) / 0.18)); // le temps suspendu avant la rupture
    const vif = 1 - retenue;
    const frq = 16 + 26 * souffle;
    const bal = Math.sin(t * frq) * 3.6 * souffle * vif;
    const roul = Math.sin(t * frq * 0.5) * 0.09 * souffle * vif;
    // ecrase et etire : il se tasse quand il tremble, il s'allonge quand il retient
    const ec = 1 + 0.07 * Math.sin(t * frq * 2) * souffle * vif + 0.1 * retenue;
    const el = 1 - 0.05 * Math.sin(t * frq * 2) * souffle * vif - 0.06 * retenue;
    const rx = RX * el,
      ry = RY * ec;

    ctx.translate(bal, 0);
    ctx.rotate(roul);
    // l'ombre, qui se resserre quand il se dresse
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = 'rgba(5,8,6,0.65)';
    ctx.beginPath();
    ctx.ellipse(0, RY * 0.94, rx * (0.95 - 0.2 * retenue), RY * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // le halo, qui grandit puis se ramasse sur l'oeuf avant la rupture
    const halo = souffle * (1 - 0.55 * retenue);
    if (halo > 0.01) {
      const R = ry * (1.35 + 0.7 * halo),
        g = ctx.createRadialGradient(0, 0, ry * 0.5, 0, 0, R);
      g.addColorStop(0, 'rgba(246,243,234,' + (0.16 * halo + 0.22 * retenue) + ')');
      g.addColorStop(1, 'rgba(246,243,234,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
    }

    oeuf(rx, ry, 1);

    // les fentes : elles s'allongent depuis le sommet, de plus en plus nombreuses
    const f = doux(Math.max(0, (av - 0.28) / 0.62));
    if (f > 0.01) {
      ctx.save();
      ctx.strokeStyle = 'rgba(66,72,64,' + (0.55 + 0.4 * f) + ')';
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const dep = (k - 1) * rx * 0.42,
          part = Math.min(1, Math.max(0, (f - k * 0.16) / 0.5));
        if (part <= 0) continue;
        ctx.beginPath();
        ctx.moveTo(dep, -ry * 0.55);
        const n = 5;
        for (let i = 1; i <= n; i++) {
          const q = (i / n) * part;
          ctx.lineTo(dep + (bruit(k * 7 + i, 1) - 0.5) * rx * 0.55 * q, -ry * 0.55 + ry * 1.25 * q);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  } else {
    // 2. la rupture : la lumiere jaillit, les morceaux partent en arc et retombent
    const e = sortant(ap * 1.35),
      f = 1 - doux(Math.max(0, (ap - 0.45) / 0.55));

    // l'eclair, bref, puis l'anneau qui s'ouvre et s'efface
    const fl = Math.max(0, 1 - ap * 5.5);
    if (fl > 0.01) {
      const R = RY * (1 + 2.6 * (1 - fl)),
        g = ctx.createRadialGradient(0, 0, 2, 0, 0, R);
      g.addColorStop(0, 'rgba(255,250,236,' + 0.9 * fl + ')');
      g.addColorStop(0.4, 'rgba(242,197,124,' + 0.55 * fl + ')');
      g.addColorStop(1, 'rgba(242,197,124,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
    }
    const ao = sortant(ap * 2.2),
      av2 = Math.max(0, 1 - ap * 2.6);
    if (av2 > 0.01) {
      ctx.strokeStyle = 'rgba(255,247,228,' + 0.6 * av2 + ')';
      ctx.lineWidth = 3 * av2 + 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, RY * (0.6 + 2.4 * ao), 0, Math.PI * 2);
      ctx.stroke();
    }

    // huit morceaux de coquille, chacun sur son arc, qui tournent et retombent
    const T = ap * 1.5;
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (bruit(i, 3) - 0.5) * 2.6 + (i - 3.5) * 0.34;
      const vit = CELL * (1.5 + bruit(i, 5) * 1.7),
        tour = (bruit(i, 7) - 0.5) * 9;
      const x = Math.cos(a) * vit * T,
        y = Math.sin(a) * vit * T + CELL * 3.4 * T * T;
      const al = f * (0.85 + 0.15 * bruit(i, 9));
      if (al <= 0.01) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tour * T);
      ctx.globalAlpha = al;
      ctx.fillStyle = COQUILLE;
      ctx.shadowColor = 'rgba(246,243,234,0.5)';
      ctx.shadowBlur = 10;
      const w = RX * (0.3 + 0.22 * bruit(i, 11)),
        h = RY * (0.26 + 0.2 * bruit(i, 13));
      ctx.beginPath();
      ctx.moveTo(-w, h * 0.5);
      ctx.quadraticCurveTo(-w * 0.5, -h, w * 0.6, -h * 0.4);
      ctx.quadraticCurveTo(w, h * 0.2, 0, h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // les deux moities, qui s'ouvrent comme un couvercle avant de partir
    [1, -1].forEach((sg) => {
      if (f <= 0.01) return;
      ctx.save();
      ctx.translate(sg * RX * 1.5 * e, (sg < 0 ? 1 : -1) * RY * 1.3 * e + CELL * 2.2 * T * T);
      ctx.rotate(sg * e * 1.5);
      ctx.globalAlpha = f;
      oeuf(RX, RY, sg > 0 ? 0.5 : -0.5);
      ctx.restore();
    });
  }
  ctx.restore();

  // une moitie d'oeuf, ou l'oeuf entier : part vaut 1 pour tout, 0.5 le haut, -0.5 le bas
  function oeuf(rx, ry, part) {
    const pts = [];
    for (let i = 0; i <= 52; i++) {
      const a = (i / 52) * Math.PI * 2,
        c = Math.cos(a),
        si = Math.sin(a);
      const k = 1 - 0.17 * Math.max(0, -si); // sommet plus etroit que la base
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
    g.addColorStop(0.55, COQUILLE);
    g.addColorStop(1, '#D9D5C8');
    ctx.fillStyle = g;
    ctx.shadowColor = 'rgba(246,243,234,0.45)';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(120,128,118,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // un reflet doux en haut a gauche, c'est ce qui fait qu'on y croit
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

// Une baie mangee ne projette rien : elle s'allume sur place et se retire lentement.
export const LUEUR = { offerte: '242,197,124', nature: '207,227,198' };

export function peindreHalos() {
  if (!halos.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  halos.forEach((h) => {
    const u = h.t / h.duree;
    // montee vive sur le premier cinquieme, puis une longue decrue douce
    const i = u < 0.2 ? u / 0.2 : Math.pow(1 - (u - 0.2) / 0.8, 1.9);
    const R = CELL * (0.55 + 1.25 * u),
      c =
        h.teinte === 'offerte-or'
          ? '242,197,124'
          : h.teinte === 'offerte-ombre'
            ? '180,212,222'
            : h.teinte === 'offerte' && duel()
              ? '155,226,138'
              : LUEUR[h.teinte] || LUEUR.nature;
    const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, R);
    g.addColorStop(0, 'rgba(' + c + ',' + 0.4 * i + ')');
    g.addColorStop(0.35, 'rgba(' + c + ',' + 0.18 * i + ')');
    g.addColorStop(1, 'rgba(' + c + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(h.x, h.y, R, 0, Math.PI * 2);
    ctx.fill();
    // un coeur net au tout debut, le temps que l'oeil accroche
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

export function peindreEtincelles() {
  ctx.save();
  etincelles.forEach((e) => {
    const u = 1 - e.t / e.duree,
      r = e.r === undefined ? 1 : e.r,
      a = e.a === undefined ? 1 : e.a;
    ctx.globalAlpha = u * u * u * 0.9 * a;
    ctx.fillStyle =
      e.teinte === 'offerte'
        ? teinteBaie()
        : e.teinte === 'offerte-or'
          ? OR
          : e.teinte === 'offerte-ombre'
            ? OMBRE
            : e.teinte === 'rodeur'
              ? ROUGE
              : e.teinte === 'coquille'
                ? COQUILLE
                : e.teinte === 'poussiere'
                  ? '#6b7383'
                  : '#cfe3c6';
    ctx.beginPath();
    ctx.arc(
      e.x,
      e.y,
      (e.teinte.indexOf('offerte') === 0 ? 3.5 * u + 1 : 2.5 * u + 0.8) * r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });
  ctx.restore();
}
