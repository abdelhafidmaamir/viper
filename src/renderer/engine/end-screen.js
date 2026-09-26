// End of round: the veil over the board, the winner banner and the donor ranking (podium or
// MVP card). Painted last so it covers everything, including the HUD.

import { CELL, H, L, OX, ROWS, W, WF, Y0 } from './layout.js';
import { doux01 } from './scoreboard.js';
import { donsManche, miniSerpent, photoProfil } from './announcements.js';
import { ctx } from './canvas.js';
import { OMBRE, OR, duel, manche, reglages } from '../scripts/game.js';

// Fin de manche : la scene se voile, le camp gagnant s'affiche par la lumiere, sans un mot
// le voile de fin, peint une seule fois au quart de la taille puis etire : un degrade radial plein ecran
// recalcule a chaque image couterait cher pour rien
export let voileFinC = null;

export function voileFin() {
  if (voileFinC) return voileFinC;
  const c = document.createElement('canvas');
  c.width = 270;
  c.height = 480;
  const g = c.getContext('2d');
  const gv = g.createRadialGradient(135, 200, 30, 135, 200, 346);
  gv.addColorStop(0, 'rgba(5,8,6,0.50)');
  gv.addColorStop(0.55, 'rgba(5,8,6,0.68)');
  gv.addColorStop(1, 'rgba(5,8,6,0.82)');
  g.fillStyle = gv;
  g.fillRect(0, 0, 270, 480);
  voileFinC = c;
  return c;
}

export function peindreFin() {
  const u = Math.min(1, manche.fin / 1.2),
    v = manche.vainqueur,
    sun = v === 'sun' || v === 'serpent' || v === 'or';
  ctx.save();
  // voile : montee douce (smootherstep sur 1,6 s), plus clair au centre ou se tient le serpent, plus dense aux bords
  {
    const uv = Math.min(1, manche.fin / 1.6),
      kv = uv * uv * uv * (uv * (6 * uv - 15) + 10);
    // en 16:9 le voile couvre aussi les cotes (Abdel : « just the center is active and not the full image »)
    if (duel()) {
      ctx.globalAlpha = kv;
      if (OX) ctx.drawImage(voileFin(), -OX, 0, WF, H);
      else ctx.drawImage(voileFin(), 0, 0, W, H);
    } // en 16:9 le meme voile radial s'etire sur tout le cadre, sans raccord
    else {
      ctx.globalAlpha = 0.55 * u;
      ctx.fillStyle = '#050806';
      ctx.fillRect(0, 0, W, H);
    }
  }
  ctx.globalAlpha = 1;
  // Le serpent de fin remplace l'astre : il salue quand il gagne, il baisse la tete quand il perd.
  const cx = W / 2,
    cy = Y0 + (ROWS * CELL) / 2,
    R = 320;
  // En duel, un camp gagne toujours : le serpent de fin est heureux et porte la couleur du vainqueur
  // (Abdel : « the winning snake color need to match the color of the winning team »).
  const o = { etat: sun ? 'heureux' : 'triste', t: manche.fin, cx: cx, cy: cy, R: R, u: u };
  const kCl = classementActif() ? doux01((manche.fin - 2.0) / 0.9) : 0;
  const grandMvp = /^M/.test(reglages.classement || '');
  if (kCl > 0) {
    o.R = R * (1 - (grandMvp ? 0.48 : 0.34) * kCl);
    o.cy = cy - (grandMvp ? 250 : 190) * kCl;
  }
  if (duel() && v === 'nul') {
    // Match nul : les deux serpents face a face, chacun sa couleur, mot DRAW (maquette A1 validee par Abdel).
    if (window.FinSerpent && window.FinSerpent.peindreNul) {
      window.FinSerpent.peindreNul(ctx, {
        ...o,
        R: R * 1.05,
        or: { teinte: OR, rgb: '242,197,124' },
        ombre: { teinte: OMBRE, rgb: '180,212,222' },
      });
    }
    if (kCl > 0) peindreClassement(kCl);
    ctx.restore();
    return;
  } else if (duel()) {
    o.etat = 'heureux';
    o.teinte = v === 'ombre' ? OMBRE : OR;
    o.rgb = v === 'ombre' ? '180,212,222' : '242,197,124';
  }
  if (window.FinSerpent) window.FinSerpent.peindre(ctx, o);
  if (kCl > 0) peindreClassement(kCl);
  ctx.restore();
}

// Classement des donateurs de la manche, sur l'ecran de fin (prototype, Abdel 2026-09-21). Memes plaques
// que la legende des cadeaux, pseudo dans la couleur de son camp, total en pieces. Rendu seul.
export function topDons(camp) {
  return Object.keys(donsManche)
    .map((p) => ({
      pseudo: p,
      camp: donsManche[p].camp,
      total: donsManche[p].total,
      avatar: donsManche[p].avatar,
    }))
    .filter((d) => d.total > 0 && (!camp || d.camp === camp))
    .sort((a, b) => b.total - a.total);
}

export function classementActif() {
  const m = reglages.classement;
  return duel() && m && m !== 'aucun' && topDons().length > 0;
}

export function ligneClassement(x, y, w, h, d, rang, app, miroir, grand) {
  if (app <= 0.01) return;
  const teinte = d.camp === 'or' ? OR : OMBRE,
    rgb = d.camp === 'or' ? '242,197,124' : '180,212,222';
  ctx.save();
  ctx.globalAlpha = app;
  ctx.translate(0, (1 - app) * 22);
  ctx.fillStyle = 'rgba(8,12,10,0.78)';
  ctx.beginPath();
  ctx.roundRect(x, y - h / 2, w, h, h * 0.3);
  ctx.fill();
  if (rang === 1) {
    ctx.fillStyle = 'rgba(' + rgb + ',0.10)';
    ctx.fill();
  }
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(' + rgb + ',' + (rang === 1 ? 0.6 : 0.3) + ')';
  ctx.stroke();
  const rx = miroir ? x + w - h / 2 - 6 : x + h / 2 + 6,
    R = h * 0.3;
  ctx.fillStyle = rang === 1 ? teinte : 'rgba(' + rgb + ',0.22)';
  ctx.beginPath();
  ctx.arc(rx, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rang === 1 ? '#0c110e' : teinte;
  ctx.font = '900 ' + Math.round(R * 1.1) + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rang), rx, y + 1);
  // photo de profil du donateur, entre le rang et le nom (initiale si TikFinity n'en fournit pas)
  const montre = reglages.nomsDonateurs !== false,
    AV = h * 0.66,
    sg = miroir ? -1 : 1,
    pcx = rx + sg * (R + 12 + AV / 2),
    ph = montre ? photoProfil(d.avatar) : null;
  if (montre) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pcx, y, AV / 2, 0, Math.PI * 2);
    ctx.closePath();
    if (ph) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(ph, pcx - AV / 2, y - AV / 2, AV, AV);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(' + rgb + ',0.20)';
      ctx.fill();
      ctx.fillStyle = teinte;
      ctx.font = '800 ' + Math.round(AV * 0.5) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        d.pseudo
          .replace(/[^A-Za-z0-9]/g, '')
          .charAt(0)
          .toUpperCase() || '?',
        pcx,
        y + 1,
      );
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.8)';
    ctx.beginPath();
    ctx.arc(pcx, y, AV / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const decal = montre ? AV + 12 : 0;
  const nom =
    reglages.nomsDonateurs !== false ? d.pseudo.slice(0, grand ? 20 : 14) : 'supporter ' + rang;
  ctx.fillStyle = teinte;
  ctx.font = (grand ? '700 34px' : '700 27px') + ' system-ui, sans-serif';
  ctx.textAlign = miroir ? 'right' : 'left';
  // le nom ne mord jamais sur le total : il se resserre, puis se coupe
  {
    const place =
      w - (h / 2 + 6 + R + 16 + decal) - 22 - String(d.total).length * (grand ? 20 : 16) - 14;
    let cT = grand ? 34 : 27,
      txt = nom;
    while (cT > 18 && ctx.measureText(txt).width > place) {
      cT--;
      ctx.font = '700 ' + cT + 'px system-ui, sans-serif';
    }
    while (txt.length > 3 && ctx.measureText(txt).width > place) txt = txt.slice(0, -2) + '…';
    ctx.fillText(txt, miroir ? rx - R - 16 - decal : rx + R + 16 + decal, y + 1);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = (grand ? '500 32px' : '500 26px') + ' "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = miroir ? 'left' : 'right';
  ctx.fillText(String(d.total), miroir ? x + 22 : x + w - 22, y + 1);
  ctx.restore();
}

// --- Mise en avant du MVP (Abdel, 2026-09-21 : « crucial, it is used to flatter the viewer, MVP mis en
// avant with like a crown »). Photo de profil en grand, couronne doree, nom et total ; M1 rayons, M2 le vrai
// serpent tourne autour de lui, M3 podium a trois marches.
export const elast = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x === 0
    ? 0
    : x === 1
      ? 1
      : Math.pow(2, -10 * x) * Math.sin(((x * 10 - 0.75) * 2 * Math.PI) / 3) + 1;
};

export function peindreAvatar(cx, cy, r, d, ech) {
  const teinte = d.camp === 'or' ? OR : OMBRE,
    rgb = d.camp === 'or' ? '242,197,124' : '180,212,222',
    montre = reglages.nomsDonateurs !== false,
    ph = montre ? photoProfil(d.avatar) : null,
    R = r * ech;
  if (R <= 0.5) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.closePath();
  if (ph) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(ph, cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(14,20,17,0.95)';
    ctx.fill();
    ctx.fillStyle = 'rgba(' + rgb + ',0.22)';
    ctx.fill();
    ctx.fillStyle = teinte;
    ctx.font = '800 ' + Math.round(R * 0.95) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      montre
        ? d.pseudo
            .replace(/[^A-Za-z0-9]/g, '')
            .charAt(0)
            .toUpperCase() || '?'
        : '?',
      cx,
      cy + R * 0.06,
    );
  }
  ctx.lineWidth = Math.max(2.5, R * 0.07);
  ctx.strokeStyle = teinte;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function couronne(cx, cy, l, chute) {
  // cy = base de la couronne ; elle tombe d'en haut et rebondit
  const h = l * 0.62,
    dy = -(1 - elast(chute)) * 90;
  if (chute <= 0) return;
  ctx.save();
  ctx.translate(cx, cy + dy);
  ctx.rotate(-0.08);
  ctx.globalAlpha = Math.min(1, chute * 4);
  ctx.fillStyle = OR;
  ctx.strokeStyle = '#8a6a2f';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-l / 2, 0);
  ctx.lineTo(-l / 2 - l * 0.06, -h * 0.78);
  ctx.lineTo(-l * 0.24, -h * 0.36);
  ctx.lineTo(0, -h);
  ctx.lineTo(l * 0.24, -h * 0.36);
  ctx.lineTo(l / 2 + l * 0.06, -h * 0.78);
  ctx.lineTo(l / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff3d6';
  [
    [-l / 2 - l * 0.06, -h * 0.78],
    [0, -h],
    [l / 2 + l * 0.06, -h * 0.78],
  ].forEach((q) => {
    ctx.beginPath();
    ctx.arc(q[0], q[1], l * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.fillStyle = '#8a6a2f';
  ctx.fillRect(-l / 2, -h * 0.16, l, h * 0.07);
  ctx.fillStyle = '#e0574a';
  ctx.beginPath();
  ctx.arc(0, -h * 0.36, l * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function nomEtTotal(cx, y, d, corpsN, app) {
  if (app <= 0.01) return;
  const teinte = d.camp === 'or' ? OR : OMBRE,
    nom = reglages.nomsDonateurs !== false ? d.pseudo.slice(0, 18) : 'top supporter';
  ctx.save();
  ctx.globalAlpha = app;
  ctx.translate(0, (1 - app) * 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let c = corpsN;
  ctx.font = '800 ' + c + 'px system-ui, sans-serif';
  while (c > 20 && ctx.measureText(nom).width > 560) {
    c--;
    ctx.font = '800 ' + c + 'px system-ui, sans-serif';
  }
  ctx.fillStyle = teinte;
  ctx.fillText(nom, cx, y);
  ctx.font = '500 ' + Math.round(corpsN * 0.62) + 'px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillText(d.total + ' coins', cx, y + corpsN * 0.95);
  ctx.restore();
}

export function etincellesMvp(cx, cy, r0, r1, age, n, rgb) {
  for (let i = 0; i < n; i++) {
    const ph = (age * 0.45 + i / n) % 1,
      ang = i * 2.399 + age * 0.3,
      rr = r0 + (r1 - r0) * ph,
      a = Math.sin(ph * Math.PI);
    ctx.fillStyle = 'rgba(' + rgb + ',' + (0.85 * a).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.9, 1.6 + 2.2 * a, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function peindreMvp(mode, age, titre, app) {
  const l = topDons(),
    m = l[0],
    cx = W / 2,
    rgb = m.camp === 'or' ? '242,197,124' : '180,212,222',
    teinte = m.camp === 'or' ? OR : OMBRE;
  if (mode === 'M3') {
    // podium : trois marches, le premier au centre, plus haut, couronne
    titre('TOP SUPPORTERS', 760);
    const base = L.finBase,
      marches = [
        { d: l[0], x: cx, hh: 190, r: 60, rang: 1 },
        { d: l[1], x: cx - 196, hh: 132, r: 46, rang: 2 },
        { d: l[2], x: cx + 196, hh: 100, r: 42, rang: 3 },
      ];
    marches.forEach((q, i) => {
      if (!q.d) return;
      const a = doux01((age - 0.4 - (i === 0 ? 0.5 : i === 1 ? 0 : 0.25)) / 0.6),
        tq = q.d.camp === 'or' ? '242,197,124' : '180,212,222',
        hh = q.hh * a;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,12,10,0.80)';
      ctx.beginPath();
      ctx.roundRect(q.x - 92, base - hh, 184, hh, [18, 18, 6, 6]);
      ctx.fill();
      ctx.fillStyle = 'rgba(' + tq + ',' + (q.rang === 1 ? 0.12 : 0.06) + ')';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(' + tq + ',' + (q.rang === 1 ? 0.6 : 0.3) + ')';
      ctx.stroke();
      ctx.fillStyle = 'rgba(' + tq + ',0.16)';
      ctx.font = '900 ' + Math.round(Math.min(90, q.hh * 0.6)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(q.rang), q.x, base - hh / 2 + 4);
      ctx.restore();
      const ay = base - hh - q.r - 14;
      peindreAvatar(q.x, ay, q.r, q.d, elast(a));
      if (q.rang === 1) {
        etincellesMvp(q.x, ay, q.r + 8, q.r + 54, age, 12, '255,238,206');
        couronne(q.x + 2, ay - q.r + 8, q.r * 1.25, (age - 1.5) / 0.7);
      }
      const nom = reglages.nomsDonateurs !== false ? q.d.pseudo.slice(0, 11) : '#' + q.rang;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = q.d.camp === 'or' ? OR : OMBRE;
      let c = q.rang === 1 ? 26 : 22;
      ctx.font = '700 ' + c + 'px system-ui, sans-serif';
      while (c > 15 && ctx.measureText(nom).width > 168) {
        c--;
        ctx.font = '700 ' + c + 'px system-ui, sans-serif';
      }
      ctx.fillText(nom, q.x, base - hh + 24);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '500 20px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(String(q.d.total), q.x, base - hh + 52);
      ctx.restore();
    });
    return;
  }
  titre('MVP OF THE ROUND', 748);
  const ay = 900,
    AR = 84,
    a0 = (age - 0.5) / 0.7;
  if (mode === 'M1') {
    // rayons doux qui tournent derriere la photo
    ctx.save();
    ctx.translate(cx, ay);
    ctx.rotate(age * 0.35);
    ctx.globalAlpha = 0.5 * doux01(a0);
    for (let i = 0; i < 14; i++) {
      ctx.rotate((Math.PI * 2) / 14);
      ctx.fillStyle = 'rgba(' + rgb + ',' + (i % 2 ? 0.1 : 0.17) + ')';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-13, -AR - 78);
      ctx.lineTo(13, -AR - 78);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  if (mode === 'M2' && a0 > 0) {
    // le vrai serpent, a la couleur du camp du MVP, tourne autour de sa photo
    const rr = AR + 30,
      tete = -Math.PI / 2 + age * 1.5,
      long = Math.min(1, a0) * 4.6,
      pts = [];
    for (let u = 0; u <= long; u += 0.07)
      pts.push({ x: cx + Math.cos(tete - u) * rr, y: ay + Math.sin(tete - u) * rr });
    miniSerpent(pts, teinte, 0.5);
  }
  peindreAvatar(cx, ay, AR, m, elast(a0));
  etincellesMvp(cx, ay, AR + 10, AR + (mode === 'M2' ? 70 : 90), age, 16, '255,238,206');
  couronne(cx + 3, ay - AR + 12, AR * 1.15, (age - 1.2) / 0.7);
  nomEtTotal(cx, ay + AR + (mode === 'M2' ? 66 : 50), m, 44, doux01((age - 1.0) / 0.5));
  l.slice(1, 3).forEach((d, i) =>
    ligneClassement(i === 0 ? cx - 310 : cx + 8, 1150, 302, 70, d, i + 2, app(i + 3), false, false),
  );
}

// Le panneau du classement (Abdel : « not separated and isolated well enough with the background, it feels like
// just floating ») : une vraie carte opaque, bordee de la couleur du premier, avec un filet clair en haut et une
// ombre portee faite de contours fondus (pas de flou), qui pose le classement devant le plateau.
export function panneauClassement(y0, y1, rgb, a) {
  if (a <= 0.01) return;
  const x0 = W / 2 - 352,
    w = 704,
    h = y1 - y0,
    rr = 34;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(0, (1 - a) * 26);
  for (let i = 5; i >= 1; i--) {
    ctx.fillStyle = 'rgba(0,0,0,' + (0.07).toFixed(2) + ')';
    ctx.beginPath();
    ctx.roundRect(x0 - i * 5, y0 - i * 4 + 10, w + i * 10, h + i * 8, rr + i * 5);
    ctx.fill();
  }
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(22,30,26,0.97)');
  g.addColorStop(1, 'rgba(9,13,11,0.97)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, rr);
  ctx.fill();
  ctx.fillStyle = 'rgba(' + rgb + ',0.05)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(' + rgb + ',0.42)';
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, rr);
  ctx.clip();
  const hl = ctx.createLinearGradient(0, y0, 0, y0 + 90);
  hl.addColorStop(0, 'rgba(255,255,255,0.07)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(x0, y0, w, 90);
  ctx.restore();
  ctx.restore();
}

export function peindreClassement(k) {
  const mode = reglages.classement,
    age = manche.fin - 2.0,
    cx = W / 2,
    app = (i) => doux01((age - 0.5 - i * 0.22) / 0.5);
  const titre = (txt, y) => {
    ctx.save();
    ctx.globalAlpha = doux01((age - 0.3) / 0.5) * 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    try {
      ctx.letterSpacing = '4px';
    } catch (e) {}
    ctx.fillText(txt, cx, y);
    ctx.restore();
  };
  {
    const pr = topDons()[0],
      prgb = pr && pr.camp === 'ombre' ? '180,212,222' : '242,197,124';
    panneauClassement(
      /^M/.test(mode) ? 706 : 832,
      /^M/.test(mode) ? 1222 : mode === 'C3' ? 1150 : 1236,
      prgb,
      doux01((age - 0.05) / 0.6),
    );
  }
  if (/^M/.test(mode)) {
    peindreMvp(mode, age, titre, app);
    return;
  }
  if (mode === 'C1') {
    titre('TOP SUPPORTERS', 872);
    topDons()
      .slice(0, 3)
      .forEach((d, i) =>
        ligneClassement(
          cx - 300,
          940 + i * 96,
          600,
          i === 0 ? 88 : 78,
          d,
          i + 1,
          app(i),
          false,
          i === 0,
        ),
      );
  }
  if (mode === 'C2') {
    titre('TOP SUPPORTERS', 872);
    ['or', 'ombre'].forEach((camp, c) =>
      topDons(camp)
        .slice(0, 3)
        .forEach((d, i) =>
          ligneClassement(
            c === 0 ? cx - 392 : cx + 12,
            940 + i * 92,
            380,
            78,
            d,
            i + 1,
            app(i),
            c === 1,
            false,
          ),
        ),
    );
  }
  if (mode === 'C3') {
    const l = topDons();
    titre('MVP OF THE ROUND', 884);
    ligneClassement(cx - 310, 968, 620, 104, l[0], 1, app(0), false, true);
    l.slice(1, 3).forEach((d, i) =>
      ligneClassement(
        i === 0 ? cx - 310 : cx + 8,
        1086,
        302,
        70,
        d,
        i + 2,
        app(i + 1),
        false,
        false,
      ),
    );
  }
}
