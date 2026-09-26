// Operator-only overlays: the AI debug layer (intent, reach, threats) and the LIVE safe-zone
// mock-up. Never shown on stream unless switched on from the control room.

import {
  CELL,
  COLS,
  ROWS,
  SR_Y,
  W,
  X0,
  Y0,
  Z_BANNIERE,
  Z_CADEAUX,
  Z_FIL,
  Z_SAISIE,
} from './layout.js';
import {
  actif,
  charger,
  corps,
  ctx,
  dir,
  dirProchaine,
  duel,
  memoireIA,
  pilule,
  px,
  ranger,
  serpent,
  t,
} from '../scripts/game.js';

export function peindreMaquetteLive() {
  ctx.save();
  const GRIS = 'rgba(255,255,255,0.20)',
    SOMBRE = 'rgba(0,0,0,0.42)',
    CLAIR = 'rgba(255,255,255,0.34)';

  // 1. le haut : voile sombre, pastille de l'hote, bouton Suivre, compteur, croix
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(0, 0, W, SR_Y);
  ctx.fillStyle = CLAIR;
  ctx.beginPath();
  ctx.arc(84, 150, 42, 0, Math.PI * 2);
  ctx.fill();
  pilule(138, 126, 190, 26, CLAIR, 8); // le pseudo
  pilule(138, 160, 96, 18, GRIS, 7); // les abonnes
  pilule(404, 122, 150, 58, 'rgba(232,64,84,0.80)'); // + Suivre
  pilule(740, 124, 180, 54, SOMBRE); // les avatars et le nombre de spectateurs
  ctx.fillStyle = CLAIR;
  [768, 806].forEach((x) => {
    ctx.beginPath();
    ctx.arc(x, 151, 21, 0, Math.PI * 2);
    ctx.fill();
  });
  pilule(840, 142, 56, 18, CLAIR, 7);
  ctx.strokeStyle = CLAIR;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1002, 134);
  ctx.lineTo(1038, 170);
  ctx.moveTo(1038, 134);
  ctx.lineTo(1002, 170);
  ctx.stroke();
  // la seconde rangee : classement, galerie, recherche
  pilule(30, 216, 368, 42, SOMBRE, 12);
  pilule(414, 216, 236, 42, SOMBRE, 12);
  pilule(666, 216, 384, 42, SOMBRE, 12);

  // 2. la colonne de widgets cadeaux, a droite : c'est elle qui borne le compteur par le bas
  const Z = Z_CADEAUX;
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.roundRect(Z.x, Z.y, Z.w, Z.h, 16);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const y = Z.y + 22 + i * 66;
    pilule(Z.x + 16, y, 52, 52, CLAIR, 14); // l'icone du cadeau
    pilule(Z.x + 82, y + 10, 190, 16, GRIS, 8); // le libelle
    pilule(Z.x + 82, y + 32, 120, 14, GRIS, 7);
  }

  // 3. la banniere de cadeau, puis le fil de commentaires, puis la barre de saisie
  const B = Z_BANNIERE;
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.roundRect(B.x, B.y, B.w, B.h, B.h / 2);
  ctx.fill();
  ctx.fillStyle = CLAIR;
  ctx.beginPath();
  ctx.arc(B.x + 50, B.y + B.h / 2, 34, 0, Math.PI * 2);
  ctx.fill();
  pilule(B.x + 98, B.y + 22, 210, 20, CLAIR, 8);
  pilule(B.x + 98, B.y + 54, 140, 16, GRIS, 7);
  pilule(B.x + 430, B.y + 28, 120, 40, CLAIR, 10);
  const F = Z_FIL;
  // 4 commentaires et demi a la fois, compte par Abdel sur un vrai live : le plus ancien est
  // coupe net par le haut du fil, il ne s'affiche jamais en entier. On decoupe donc a la zone
  // et on demarre la premiere bulle a cheval sur son bord, sinon la maquette ment sur la
  // hauteur reellement occupee et sur l'aspect du fil.
  ctx.save();
  ctx.beginPath();
  ctx.rect(F.x, F.y, F.w, F.h);
  ctx.clip();
  for (let i = 0; i < 5; i++) {
    const y = F.y - 46 + i * 106,
      lg = [620, 470, 700, 530, 660][i];
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.roundRect(F.x + 20, y, lg, 86, 22);
    ctx.fill();
    ctx.fillStyle = CLAIR;
    ctx.beginPath();
    ctx.arc(F.x + 58, y + 43, 26, 0, Math.PI * 2);
    ctx.fill();
    pilule(F.x + 98, y + 20, lg * 0.34, 16, CLAIR, 7);
    pilule(F.x + 98, y + 50, lg * 0.62, 16, GRIS, 7);
  }
  ctx.restore();
  const S = Z_SAISIE;
  pilule(S.x + 24, S.y, 560, S.h, 'rgba(0,0,0,0.42)', 28);
  pilule(S.x + 52, S.y + 38, 260, 22, GRIS, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  [648, 744, 840, 936].forEach((x) => {
    ctx.beginPath();
    ctx.arc(x, S.y + S.h / 2, 44, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = CLAIR;
  [648, 744, 840, 936].forEach((x) => {
    ctx.beginPath();
    ctx.arc(x, S.y + S.h / 2, 20, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// Calque de debug IA (super admin). Par serpent, dans la couleur de son camp : trajet vers la baie
// visee, rayons de vue (losanges de Manhattan 12 attaque, 10 defense), pas candidats notes, couronne
// adverse evitee, etiquette posture/raison/poche, flash garde (vert) ou change (rouge) a chaque case.
export function peindreDebugIA() {
  for (let i = 0; i < corps.length; i++) {
    charger(i);
    const g = memoireIA.debug,
      h = serpent[0];
    if (!g || !h) {
      ranger();
      continue;
    }
    const rgb = i === 0 ? '242,197,124' : '180,212,222',
      c = (a) => 'rgba(' + rgb + ',' + a + ')',
      p = px(h.x, h.y);
    ctx.save();
    // 2. rayons de vue
    const losange = (r, alpha, tiret) => {
      ctx.setLineDash(tiret);
      ctx.strokeStyle = c(alpha);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r * CELL);
      ctx.lineTo(p.x + r * CELL, p.y);
      ctx.lineTo(p.x, p.y + r * CELL);
      ctx.lineTo(p.x - r * CELL, p.y);
      ctx.closePath();
      ctx.stroke();
    };
    ctx.beginPath();
    ctx.rect(X0, Y0, COLS * CELL, ROWS * CELL);
    ctx.clip();
    // Super IA : territoire de Voronoi teinte par camp (vu par Or, peint une fois), et la reponse
    // que ce serpent PREDIT chez l'adversaire (pointille blanc partant de la tete adverse)
    if (g.superIA) {
      const S = g.superIA,
        advC = corps[1 - i];
      if (i === 0 && S.vor)
        for (let n = 0; n < S.vor.length; n++) {
          const l = S.vor[n];
          if (l !== 1 && l !== 2) continue;
          const vx = n % COLS,
            vy = (n - vx) / COLS;
          ctx.fillStyle = l === 1 ? 'rgba(242,197,124,0.10)' : 'rgba(180,212,222,0.10)';
          ctx.fillRect(X0 + vx * CELL + 2, Y0 + vy * CELL + 2, CELL - 4, CELL - 4);
        }
      if (S.adv && S.adv.length && advC && advC.serpent[0]) {
        const o0 = px(advC.serpent[0].x, advC.serpent[0].y);
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(o0.x, o0.y);
        S.adv.forEach((q) => {
          const o = px(q.x, q.y);
          ctx.lineTo(o.x, o.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // Ligne de direction facon Rocket League : trait plein = pas en cours (dir), trait pointille
    // blanc = intent decide par l'IA pour la prochaine case (dirProchaine), s'il differe.
    // Trajectoire anticipee facon indicateur de balle Rocket League : simulation greedy des 10
    // prochains pas. A chaque case, on prend la direction qui minimise la distance a la cible (baie
    // visee par l'IA, ou tete adverse s'il n'y en a pas), en evitant le corps. Le premier pas
    // respecte dirProchaine (l'intent decide). Resultat : une ligne courbe reelle, pas un rail.
    const pts = [{ x: p.x, y: p.y }];
    const autreC = duel() ? corps[1 - actif] : null;
    const cibleAnt = g.cible || (autreC && autreC.serpent[0]);
    let hx = h.x,
      hy = h.y,
      dx = dir.x,
      dy = dir.y;
    const occ = new Set(serpent.map((s) => s.y * COLS + s.x));
    // Super IA : la ligne est la VRAIE variante principale calculee par la recherche, pas une estimation
    const pvSuper = !!(g.superIA && g.route && g.route.length);
    if (pvSuper)
      g.route.forEach((q) => {
        const o = px(q.x, q.y);
        pts.push({ x: o.x, y: o.y });
      });
    for (let k = 0; k < 10 && !pvSuper; k++) {
      // premier pas : on impose dirProchaine ; ensuite : la direction qui rapproche le plus de la cible
      let best = null;
      if (k === 0) {
        best = { x: dirProchaine.x, y: dirProchaine.y };
        const nx = hx + best.x,
          ny = hy + best.y;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || occ.has(ny * COLS + nx)) best = null;
      }
      if (!best) {
        let bestD = 1e9;
        for (const cand of [
          { x: dx, y: dy },
          { x: -dy, y: dx },
          { x: dy, y: -dx },
        ]) {
          const nx = hx + cand.x,
            ny = hy + cand.y;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          if (occ.has(ny * COLS + nx)) continue;
          const d = cibleAnt ? Math.abs(cibleAnt.x - nx) + Math.abs(cibleAnt.y - ny) : k;
          if (d < bestD) {
            bestD = d;
            best = cand;
          }
        }
      }
      if (!best) break;
      hx += best.x;
      hy += best.y;
      dx = best.x;
      dy = best.y;
      occ.add(hy * COLS + hx);
      const o = px(hx, hy);
      pts.push({ x: o.x, y: o.y });
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = c(0.9);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.stroke();
    // pointe a l'extremite
    const a = pts[pts.length - 2] || pts[0],
      b = pts[pts.length - 1];
    const ddx = b.x - a.x,
      ddy = b.y - a.y,
      nn = Math.max(1, Math.hypot(ddx, ddy)),
      ux = ddx / nn,
      uy = ddy / nn,
      tp = 14;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - ux * tp - uy * tp * 0.6, b.y - uy * tp + ux * tp * 0.6);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - ux * tp + uy * tp * 0.6, b.y - uy * tp - ux * tp * 0.6);
    ctx.stroke();
    // petits points aux cases anticipees
    ctx.fillStyle = c(0.85);
    for (let k = 1; k < pts.length; k++) {
      ctx.beginPath();
      ctx.arc(pts[k].x, pts[k].y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!g.superIA) losange(g.porteeAttaque || 12, g.posture === 'attaque' ? 0.55 : 0.22, [10, 8]);
    if (!g.superIA) losange(g.porteeDefense || 10, g.posture === 'defense' ? 0.55 : 0.22, [3, 6]);
    // 4. couronne adverse evitee
    ctx.setLineDash([]);
    (memoireIA.dbgEviter || []).forEach((q) => {
      const o = px(q.x, q.y),
        r = CELL / 2 - 3;
      ctx.fillStyle = 'rgba(255,90,90,0.10)';
      ctx.fillRect(o.x - r, o.y - r, 2 * r, 2 * r);
      ctx.strokeStyle = 'rgba(255,90,90,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) {
        ctx.moveTo(o.x - r + Math.max(0, k) * r, o.y + r - Math.max(0, -k) * r);
        ctx.lineTo(o.x + r + Math.min(0, k) * r, o.y - r - Math.min(0, -k) * r);
      }
      ctx.stroke();
    });
    // 1. baie visee : cerclee (le trajet est deja peint plus haut, en trajectoire anticipee)
    if (g.cible) {
      const o = px(g.cible.x, g.cible.y);
      ctx.strokeStyle = c(0.95);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(o.x, o.y, CELL * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 3. pas candidats : fleche notee, croix si refuse
    const notes = Object.keys(g.scores)
      .map((k) => g.scores[k])
      .filter((v) => typeof v === 'number');
    const mx = notes.length ? Math.max(...notes) : 0,
      mn = notes.length ? Math.min(...notes) : 0;
    Object.keys(g.scores).forEach((cle) => {
      const v = g.scores[cle],
        [dx, dy] = cle.split(',').map(Number),
        o = { x: p.x + dx * CELL * 0.95, y: p.y + dy * CELL * 0.95 };
      const choisi = g.choix && g.choix.x === dx && g.choix.y === dy;
      if (typeof v === 'number' || v === 'ok') {
        const f = typeof v === 'number' ? (mx > mn ? (v - mn) / (mx - mn) : 1) : 0.5;
        ctx.strokeStyle = choisi ? 'rgba(255,255,255,0.95)' : c(0.3 + 0.5 * f);
        ctx.lineWidth = choisi ? 5 : 1.5 + 3 * f;
        ctx.beginPath();
        ctx.moveTo(p.x + dx * CELL * 0.35, p.y + dy * CELL * 0.35);
        ctx.lineTo(o.x, o.y);
        ctx.lineTo(o.x - dx * 9 - dy * 7, o.y - dy * 9 - dx * 7);
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(o.x - dx * 9 + dy * 7, o.y - dy * 9 + dx * 7);
        ctx.stroke();
        if (typeof v === 'number') {
          ctx.font = 'bold 13px sans-serif';
          ctx.fillStyle = c(0.95);
          ctx.textAlign = 'center';
          ctx.fillText(v.toFixed(1), o.x + dx * 14, o.y + dy * 14 + 4);
        }
      } else {
        ctx.strokeStyle = 'rgba(255,80,80,0.85)';
        ctx.lineWidth = 3;
        const r = 7;
        ctx.beginPath();
        ctx.moveTo(o.x - r, o.y - r);
        ctx.lineTo(o.x + r, o.y + r);
        ctx.moveTo(o.x + r, o.y - r);
        ctx.lineTo(o.x - r, o.y + r);
        ctx.stroke();
      }
    });
    // 6. flash au franchissement : garde (vert) ou change (rouge)
    const fl = memoireIA.dbgFlash;
    if (fl && t - fl.t < 0.35) {
      const o = px(fl.x, fl.y),
        u = (t - fl.t) / 0.35;
      ctx.strokeStyle = fl.change
        ? 'rgba(255,70,70,' + (1 - u) + ')'
        : 'rgba(110,255,140,' + 0.8 * (1 - u) + ')';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(o.x, o.y, CELL * (0.45 + 0.4 * u), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Super IA : barre d'evaluation facon echecs au-dessus du plateau (part d'Or a gauche), une seule fois
    if (g.superIA && i === 0) {
      const S = g.superIA,
        bx = X0,
        by = Y0 - 34,
        bw = COLS * CELL,
        part = Math.max(0.04, Math.min(0.96, 0.5 + S.valeur / 300));
      ctx.save();
      ctx.fillStyle = 'rgba(180,212,222,0.85)';
      ctx.fillRect(bx, by, bw, 10);
      ctx.fillStyle = 'rgba(242,197,124,0.95)';
      ctx.fillRect(bx, by, bw * part, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(bx + bw / 2 - 1, by - 3, 2, 16);
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        'Super IA   prof ' +
          S.prof +
          '   ' +
          S.noeuds +
          ' noeuds   eval Or ' +
          (S.valeur > 0 ? '+' : '') +
          S.valeur.toFixed(0) +
          '   territoire ' +
          S.terrMoi +
          ' / ' +
          S.terrLui,
        bx,
        by - 8,
      );
      ctx.restore();
    }
    // 5. etiquette (hors clip, au-dessus de la tete)
    const txt =
      (g.posture || 'neutre') +
      ' | ' +
      (g.raison || '?') +
      ' | poche ' +
      (g.poche != null ? g.poche : '?') +
      (g.piege != null ? ' | adv ' + g.piege : '');
    ctx.save();
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(txt).width + 14,
      ey = p.y - CELL * 1.1;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(p.x - w / 2, ey - 15, w, 21);
    ctx.fillStyle = c(1);
    ctx.fillText(txt, p.x, ey);
    ctx.restore();
    ranger();
  }
  charger(0);
}
