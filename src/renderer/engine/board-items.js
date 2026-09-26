// Everything that sits on the board besides the snakes: berries (with their offering glow),
// rocks and brambles, each pre-rendered once into a sprite and reused every frame.

import { ctx, setCtx } from './canvas.js';
import { CELL } from './layout.js';
import { lueurBaie, teinteBaie } from './palette.js';
import {
  ALERTE,
  GERME,
  RONCE_ALERTE,
  VIEROCHER,
  VIERONCE,
  baies,
  graines,
  px,
  reglages,
  rochers,
  ronces,
} from '../scripts/game.js';

// couleur du second serpent en mode duel (a verifier au contraste)

// Ce que les spectateurs offrent : la graine tombe, l'ombre se resserre, la baie s'ouvre.
const BAIE_RS = 58,
  BAIE_N = 48,
  cacheBaie = new Map();

function spriteBaie(ph, camp) {
  const cle = ph + 'd' + (camp || '');
  let s = cacheBaie.get(cle);
  if (s) return s;
  const si = Math.sin((ph / BAIE_N) * Math.PI * 2),
    bat = 1 + 0.09 * si;
  s = document.createElement('canvas');
  s.width = 2 * BAIE_RS;
  s.height = 2 * BAIE_RS;
  const avant = setCtx(s.getContext('2d'));
  ctx.translate(BAIE_RS, BAIE_RS);
  try {
    ctx.globalAlpha = 0.35 + 0.15 * si;
    ctx.strokeStyle = teinteBaie(camp);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 24 * bat, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowColor = lueurBaie(0.9, camp);
    ctx.shadowBlur = 26;
    ctx.fillStyle = teinteBaie(camp);
    ctx.beginPath();
    ctx.arc(0, 0, 17 * bat, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,246,228,0.55)';
    ctx.beginPath();
    ctx.arc(-5, -5, 5, 0, Math.PI * 2);
    ctx.fill();
  } finally {
    setCtx(avant);
  }
  cacheBaie.set(cle, s);
  return s;
}

export function peindreOffrandes() {
  graines.forEach((g) => {
    const p = px(g.x, g.y),
      u = Math.min(1, g.t / GERME),
      chute = Math.min(1, u / 0.7);
    if (chute < 1) {
      const y = p.y - CELL * 3.2 * (1 - chute) * (1 - chute);
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.3 * chute;
      ctx.fillStyle = '#0b120d';
      ctx.beginPath();
      ctx.ellipse(p.y ? p.x : p.x, p.y + 6, 10 + 8 * chute, 3 + 2 * chute, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowColor = lueurBaie(0.8, g.camp);
      ctx.shadowBlur = 20;
      ctx.fillStyle = teinteBaie(g.camp);
      ctx.beginPath();
      ctx.arc(p.x, y, 5 + 3 * chute, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      const s = (u - 0.7) / 0.3;
      ctx.save();
      ctx.strokeStyle = 'rgba(159,199,164,0.85)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 12);
      ctx.lineTo(p.x, p.y + 12 - 14 * s);
      ctx.stroke();
      ctx.shadowColor = lueurBaie(0.9, g.camp);
      ctx.shadowBlur = 24;
      ctx.fillStyle = teinteBaie(g.camp);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
  baies.forEach((b) => {
    const p = px(b.x, b.y);
    // Toutes les baies battent au meme rythme, decale par leur age : leur dessin ne depend donc
    // que de la phase du battement. On en garde 48 images, partagees par toutes les baies du
    // plateau. C'est ici que se joue la vraie depense : `shadowBlur` est l'operation la plus
    // chere du canvas 2D, et elle etait payee une fois PAR BAIE ET PAR IMAGE. Elle est desormais
    // cuite dans le sprite, payee 48 fois pour toute la partie.
    const ph = ((Math.round(((b.t * 3.4) / (Math.PI * 2)) * BAIE_N) % BAIE_N) + BAIE_N) % BAIE_N;
    ctx.drawImage(spriteBaie(ph, b.camp), Math.round(p.x) - BAIE_RS, Math.round(p.y) - BAIE_RS);
  });
}

// Les rochers de Moon : rien ne tombe du ciel. La terre se bombe une seconde, la mousse se
// souleve, et la pierre sort du sol. L'avertissement reste lisible, le geste devient vegetal.
export function bosse(x, y, rx, ry, force) {
  const g = ctx.createRadialGradient(x, y - ry * 0.35, rx * 0.12, x, y, rx);
  g.addColorStop(0, 'rgba(58,70,56,' + 0.55 * force + ')');
  g.addColorStop(0.55, 'rgba(35,45,36,' + 0.5 * force + ')');
  g.addColorStop(1, 'rgba(20,30,23,0)');
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Les plaques de terre : l'ecorce du sol se fend en quartiers qui basculent vers l'exterieur.
// Chacune pivote autour de son bord interne, donc la pierre a l'air de forcer le sol, pas de glisser.
export function plaques(x, y, ouv, j) {
  for (let i = 0; i < 4; i++) {
    const an = (i / 4) * Math.PI * 2 + j * 0.21,
      r0 = 9,
      r1 = 20 + 13 * ouv;
    const bas = 0.34 + 0.06 * ((i + j + 8) % 3); // quartiers inegaux, aucun n'est le miroir d'un autre
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.46);
    ctx.rotate(an);
    ctx.beginPath();
    ctx.moveTo(r0, -r0 * bas);
    ctx.lineTo(r1, -r1 * bas * 0.9);
    ctx.lineTo(r1, r1 * bas * 0.9);
    ctx.lineTo(r0, r0 * bas);
    ctx.closePath();
    ctx.fillStyle = 'rgba(31,40,32,' + (0.62 + 0.28 * ouv) + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,180,140,' + 0.26 * ouv + ')';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }
}

// La fissure : trois branches noires qui s'ouvrent depuis le centre avant que rien ne depasse.
export function fissure(x, y, ouv, j) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.46);
  ctx.strokeStyle = 'rgba(6,10,7,' + 0.75 * Math.min(1, ouv * 2) + ')';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const an = (i / 3) * Math.PI * 2 + j * 0.4,
      L = 13 + 20 * ouv;
    ctx.lineWidth = 3.2 - 1.1 * i * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(
      Math.cos(an + 0.3) * L * 0.55,
      Math.sin(an + 0.3) * L * 0.55,
      Math.cos(an) * L,
      Math.sin(an) * L,
    );
    ctx.stroke();
  }
  ctx.restore();
}

// Une motte arrachee au flanc de la pierre : elle devale, tombe, et se tasse au pied.
function motte(x, y, k, i, j) {
  if (k <= 0 || k >= 1) return;
  const cote = i % 2 ? 1 : -1,
    d = 8 + 5 * ((i + j + 5) % 3);
  const px2 = x + cote * d * (0.4 + 0.6 * k),
    py2 = y - 16 + 34 * k * k;
  ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
  ctx.fillStyle = '#2a3529';
  ctx.beginPath();
  ctx.ellipse(px2, py2, 3.4 - 1.2 * k, 2.8 - 1 * k, cote * k * 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Le grain hache, meme principe que l'ambiance : un bruit deterministe, donc une pierre a
// toujours exactement la meme forme et la meme mousse tant qu'elle est au meme endroit.
const HACHE = (i, d) => {
  const v = Math.sin((i + 1) * 12.9898 + (d + 7) * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

// Une seule lumiere pour tout ce qui est pose au sol, calquee sur les cles de l'ambiance : elle
// vient de la gauche au lever, du zenith a midi, de la droite au coucher, et la nuit elle est
// faible et froide. Sans elle, un objet reste un aplat colle sur une image peinte.
export function lumiere() {
  const h = (((reglages.heure || 0) % 1) + 1) % 1;
  const jour = Math.max(0, Math.min(1, (Math.cos((h - 0.5) * Math.PI * 2) + 0.35) / 1.35));
  const an = Math.PI * (-0.82 + 0.62 * Math.min(1, Math.max(0, (h - 0.2) / 0.58)));
  const chaud = [248, 226, 186],
    froid = [164, 192, 214];
  const te = chaud.map((c, i) => Math.round(c + (froid[i] - c) * (1 - jour)));
  return { x: Math.cos(an), y: Math.sin(an), k: 0.28 + 0.72 * jour, te: te.join(',') };
}

// La pierre : une silhouette irreguliere a onze sommets, deux plans casses net, une fissure
// eclairee d'un cote, du grain, de la mousse du cote du jour, et un liseret de lumiere qui ne
// court que sur les aretes tournees vers la source.
function pointsRocher(j, ech) {
  const n = 11,
    R = 23 * (ech || 1),
    pts = [];
  for (let i = 0; i < n; i++) {
    const an = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = R * (0.8 + 0.28 * HACHE(i, j));
    pts.push({ x: Math.cos(an) * r, y: Math.sin(an) * r * 0.9 + 2, an: an });
  }
  return pts;
}

function traceRocher(pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function corpsRocher(j) {
  const L = lumiere(),
    pts = pointsRocher(j);
  // le corps : un degrade oriente par la lumiere, du flanc eclaire au flanc dans l'ombre
  traceRocher(pts);
  const g = ctx.createLinearGradient(-26 * L.x, -26 * L.y, 26 * L.x, 26 * L.y);
  g.addColorStop(0, '#7c8798');
  g.addColorStop(0.44, '#4f5a6c');
  g.addColorStop(1, '#212934');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  traceRocher(pts);
  ctx.clip();
  // le plan du dessus, casse net : c'est lui qui donne le volume, pas une facette plus claire
  ctx.beginPath();
  ctx.moveTo(-28, -4 + 1.5 * j);
  ctx.lineTo(-5, -16);
  ctx.lineTo(13, -10 + j);
  ctx.lineTo(28, -3);
  ctx.lineTo(28, -34);
  ctx.lineTo(-28, -34);
  ctx.closePath();
  const g2 = ctx.createLinearGradient(0, -26, 0, 2);
  g2.addColorStop(0, 'rgba(' + L.te + ',' + 0.34 * L.k + ')');
  g2.addColorStop(1, 'rgba(' + L.te + ',0)');
  ctx.fillStyle = g2;
  ctx.fill();
  // la fissure, creusee d'un trait sombre et relevee d'un trait clair du cote du jour
  ctx.strokeStyle = 'rgba(14,18,24,0.72)';
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-6 + 2 * j, -15);
  ctx.quadraticCurveTo(2, -2, -2 + j, 17);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(' + L.te + ',' + 0.2 * L.k + ')';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6 + 2 * j - 1.4 * L.x, -15 - 1.4 * L.y);
  ctx.quadraticCurveTo(2 - 1.4 * L.x, -2 - 1.4 * L.y, -2 + j - 1.4 * L.x, 17 - 1.4 * L.y);
  ctx.stroke();
  // le grain : quatorze eclats, moitie sombres moitie clairs, toujours les memes
  for (let i = 0; i < 14; i++) {
    const an = HACHE(i, j) * Math.PI * 2,
      r = HACHE(i + 9, j) * 19;
    ctx.globalAlpha = 0.09 + 0.09 * HACHE(i + 3, j);
    ctx.fillStyle = i % 2 ? '#0d1218' : '#a9b5c5';
    ctx.beginPath();
    ctx.arc(Math.cos(an) * r, Math.sin(an) * r * 0.88, 0.8 + 1.2 * HACHE(i + 5, j), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // la mousse : trois touffes sur le dessus, du cote eclaire, avec leur pointe plus claire
  for (let i = 0; i < 3; i++) {
    const an = -Math.PI / 2 + (HACHE(i + 2, j) - 0.5) * 1.6,
      r = 9 + 6 * HACHE(i + 7, j);
    const x = Math.cos(an) * r + L.x * 4,
      y = Math.sin(an) * r * 0.8;
    ctx.fillStyle = 'rgba(78,110,66,0.58)';
    ctx.beginPath();
    ctx.ellipse(x, y, 4 + 2.6 * HACHE(i, j), 2.3 + 1.2 * HACHE(i + 1, j), an, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(148,182,126,0.26)';
    ctx.beginPath();
    ctx.ellipse(x - L.x * 1.2, y - 1.4, 2.4 + 1.3 * HACHE(i, j), 1.2, an, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // le liseret : seulement les aretes dont la normale regarde la lumiere
  ctx.strokeStyle = 'rgba(' + L.te + ',' + 0.46 * L.k + ')';
  ctx.lineWidth = 2.1;
  ctx.lineJoin = 'round';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i],
      q = pts[(i + 1) % pts.length],
      mx = (p.x + q.x) / 2,
      my = (p.y + q.y) / 2;
    const n = Math.hypot(mx, my) || 1;
    if ((mx / n) * L.x + (my / n) * L.y > 0.15) continue; // arete a l'ombre, pas de liseret
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
  }
}

// Cache de pierres. Le corps d'une pierre ne depend que de sa variante `j` et de la lumiere,
// jamais de sa position ni de son animation de sortie, qui sont des transformations posees par
// l'appelant. On le peignait entierement a chaque image, pour chaque pierre : deux degrades, un
// clip, quatorze eclats de grain, six ellipses de mousse et onze aretes de liseret. Mesure au
// profileur, `routines/profil-rendu.js` : 2170 des 4582 operations canvas par image, soit 47 %.
// On le peint donc une fois par variante et par palier de lumiere, dans un canvas hors ecran.
const ROC_RS = 40,
  cacheRocher = new Map();

let cacheRocherCle = null;

function spriteRocher(j) {
  const cle = Math.round(((((reglages.heure || 0) % 1) + 1) % 1) * 180);
  if (cle !== cacheRocherCle) {
    cacheRocher.clear();
    cacheRocherCle = cle;
  }
  let s = cacheRocher.get(j);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = 2 * ROC_RS;
  s.height = 2 * ROC_RS;
  const avant = setCtx(s.getContext('2d'));
  ctx.translate(ROC_RS, ROC_RS);
  try {
    corpsRocher(j);
  } finally {
    setCtx(avant);
  }
  cacheRocher.set(j, s);
  return s;
}

// Remplace un appel a corpsRocher : meme dessin, meme origine, une seule operation canvas.
function poserRocher(j) {
  ctx.drawImage(spriteRocher(j), -ROC_RS, -ROC_RS);
}

export function peindreRochers() {
  rochers.forEach((r) => {
    const p = px(r.x, r.y),
      j = ((r.x * 13 + r.y * 7) % 7) - 3;
    if (r.t < ALERTE) {
      const u = r.t / ALERTE,
        lev = u * u * (3 - 2 * u); // le bombement, doux aux deux bouts
      // Elle perce tot, et sa montee a un ressaut : elle force, elle glisse d'un cheveu vers 60 %,
      // puis elle passe. C'est ce temps mort qui la rend pesante au lieu de jaillir.
      const sor = Math.max(0, (u - 0.18) / 0.82);
      let emer = sor * sor * (3 - 2 * sor);
      emer -=
        0.085 * Math.max(0, Math.sin(Math.min(1, Math.max(0, (sor - 0.46) / 0.26)) * Math.PI));
      emer = Math.max(0, Math.min(1, emer));
      ctx.save();
      // l'ombre portee du monticule, qui s'allonge a mesure qu'il monte
      ctx.globalAlpha = 0.3 * lev;
      ctx.fillStyle = '#050907';
      ctx.beginPath();
      ctx.ellipse(p.x + 6 * lev, p.y + 13, 26 * lev + 6, 8 * lev + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // la terre qui se souleve, puis se fend
      bosse(p.x, p.y + 6, 20 + 14 * lev, 9 + 9 * lev, lev);
      fissure(p.x, p.y + 4, lev, j);
      // la pierre sort du sol : on ne montre que ce qui depasse la ligne de terre
      if (emer > 0.001) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.x - 42, p.y - 48, 84, 48 + 12);
        ctx.clip();
        ctx.translate(p.x, p.y + 34 * (1 - emer));
        ctx.rotate((1 - emer) * 0.22 * (j > 0 ? 1 : -1));
        ctx.scale(0.86 + 0.14 * emer, 0.86 + 0.14 * emer);
        poserRocher(j);
        ctx.restore();
      }
      // les quartiers de sol basculent par-dessus le pied de la pierre : c'est elle qui force
      plaques(p.x, p.y + 5, lev, j);
      // les mottes arrachees devalent le flanc pendant la sortie
      for (let i = 0; i < 3; i++) motte(p.x, p.y, (emer - (0.3 + 0.16 * i)) / 0.42, i, j);
      ctx.restore();
      return;
    }
    // une fois sortie, elle se cale : un tassement sec, vers le bas seulement, jamais de rebond
    const d = r.t - ALERTE,
      k = d < 0.18 ? Math.sin((d / 0.18) * Math.PI) : 0;
    const sx = 1 + 0.05 * k,
      sy = 1 - 0.08 * k;
    const f = r.t > VIEROCHER - 2 ? (VIEROCHER - r.t) / 2 : 1;
    ctx.save();
    // la terre remuee reste visible au pied, puis se tasse
    ctx.globalAlpha = f * (d < 1.4 ? 1 - d / 1.4 : 0) * 0.8;
    if (ctx.globalAlpha > 0.01) bosse(p.x, p.y + 8, 30, 14, 0.7);
    // l'anneau de poussiere chassee par le choc
    if (d < 0.45) {
      const q = d / 0.45;
      ctx.globalAlpha = f * (1 - q) * 0.42;
      ctx.strokeStyle = 'rgba(168,176,150,1)';
      ctx.lineWidth = 3 - 2 * q;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 13, 20 + 34 * q, 7 + 12 * q, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = f * 0.45;
    ctx.fillStyle = '#050907';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 15, 21 * sx, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = f;
    ctx.translate(p.x, p.y);
    ctx.scale(sx, sy);
    poserRocher(j);
    ctx.restore();
  });
}

// La ronce : une liane, pas un trait. Le corps est un contour rempli, epais a la racine et fin a
// la pointe, avec son ombre de contact au sol, un ruban de lumiere du cote de la source, des
// feuilles a nervure et des epines crochues qui n'apparaissent que sur la part qui tue.
function pointsRonce(R) {
  const pts = [];
  R.seg.forEach((g, i) => {
    const p = px(g.x, g.y),
      u = Math.min(1, g.t / RONCE_ALERTE),
      ouv = u * u * (3 - 2 * u);
    const v = R.seg[i - 1] || R.seg[i + 1];
    if (!v || ouv >= 1) {
      pts.push({ x: p.x, y: p.y, dur: u >= 1, ouv: ouv, i: i });
      return;
    }
    const q = px(v.x, v.y);
    pts.push({
      x: q.x + (p.x - q.x) * ouv,
      y: q.y + (p.y - q.y) * ouv,
      dur: false,
      ouv: ouv,
      i: i,
    });
  });
  return pts;
}

// Le contour de la tige : on longe la ligne d'un cote, on revient de l'autre, la demi-epaisseur
// decroit vers la pointe. C'est ce qui fait une plante plutot qu'un tuyau d'epaisseur constante.
function contourRonce(pts, ep, dx, dy) {
  const n = pts.length;
  const nor = (i) => {
    const a = pts[Math.max(0, i - 1)],
      b = pts[Math.min(n - 1, i + 1)];
    const vx = b.x - a.x,
      vy = b.y - a.y,
      l = Math.hypot(vx, vy) || 1;
    return { x: -vy / l, y: vx / l };
  };
  const e = (i) =>
    ep * (1 - 0.52 * (i / Math.max(1, n - 1))) * Math.min(1, 0.35 + 0.65 * pts[i].ouv);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const u = nor(i),
      w = e(i);
    const x = pts[i].x + u.x * w + (dx || 0),
      y = pts[i].y + u.y * w + (dy || 0);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  for (let i = n - 1; i >= 0; i--) {
    const u = nor(i),
      w = e(i);
    ctx.lineTo(pts[i].x - u.x * w + (dx || 0), pts[i].y - u.y * w + (dy || 0));
  }
  ctx.closePath();
}

export function feuille(x, y, an, L, clair, f, ouv) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(an);
  ctx.globalAlpha = f * Math.min(1, ouv * 1.2);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(L * 0.5, -L * 0.34, L, 0);
  ctx.quadraticCurveTo(L * 0.5, L * 0.34, 0, 0);
  ctx.fillStyle = clair ? '#46603a' : '#2c3d25';
  ctx.fill();
  ctx.strokeStyle = 'rgba(158,190,138,0.30)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(L * 0.08, 0);
  ctx.lineTo(L * 0.86, 0);
  ctx.stroke();
  ctx.restore();
}

function epine(x, y, an, L, te, f) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(an);
  ctx.globalAlpha = f * 0.92;
  ctx.beginPath();
  ctx.moveTo(0, -2.4);
  ctx.quadraticCurveTo(L * 0.72, -L * 0.3, L, -L * 0.06); // le crochet, courbe vers l'arriere
  ctx.quadraticCurveTo(L * 0.52, L * 0.12, 0, 2.4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, L, 0);
  g.addColorStop(0, '#5d7a4c');
  g.addColorStop(1, 'rgba(' + te + ',0.92)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

// Cache de ronces. Le dessin d'une liane ne depend que de ses noeuds, de leur ouverture, de son
// effacement `f` et de la lumiere : jamais du temps qui passe. Or il etait entierement refait a
// chaque image, deux feuilles et trois epines par noeud, chacune avec son save, sa rotation et
// ses courbes. Mesure au profileur : 1406 des 4582 operations canvas par image, soit 31 %.
// Une ronce posee ne bouge plus, donc son sprite ne se repeint qu'a l'ouverture et a la mort.
// Le decalage est entier, pour que la recopie soit au pixel pres et non reechantillonnee.
const RON_M = 26;

export function peindreRonces() {
  const L = lumiere();
  const cleL = Math.round(((((reglages.heure || 0) % 1) + 1) % 1) * 180);
  ronces.forEach((R) => {
    const f = R.t > VIERONCE - 2 ? (VIERONCE - R.t) / 2 : 1;
    const pts = pointsRonce(R);
    if (pts.length < 1) return;
    let ax = Infinity,
      ay = Infinity,
      bx = -Infinity,
      by = -Infinity;
    for (const p of pts) {
      if (p.x < ax) ax = p.x;
      if (p.x > bx) bx = p.x;
      if (p.y < ay) ay = p.y;
      if (p.y > by) by = p.y;
    }
    const ox = Math.floor(ax - RON_M),
      oy = Math.floor(ay - RON_M);
    let sig = cleL + '|' + f.toFixed(2) + '|' + ox + '|' + oy + '|' + pts.length;
    for (const q of pts) sig += '|' + Math.round(q.ouv * 24) + (q.dur ? 'd' : '');
    if (R.sig !== sig) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(bx + RON_M) - ox);
      c.height = Math.max(1, Math.ceil(by + RON_M) - oy);
      const avant = setCtx(c.getContext('2d'));
      ctx.translate(-ox, -oy);
      try {
        corpsRonce(pts, f, L, R);
      } finally {
        setCtx(avant);
      }
      R.sprite = c;
      R.sig = sig;
    }
    ctx.drawImage(R.sprite, ox, oy);
  });
}

function corpsRonce(pts, f, L, R) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // l'ombre de contact : la meme tige, decalee au sol, floue par un degre d'alpha
  ctx.globalAlpha = f * 0.42;
  ctx.fillStyle = '#070c07';
  contourRonce(pts, 8.5, 2.5, 6);
  ctx.fill();
  ctx.globalAlpha = f * 0.22;
  contourRonce(pts, 11, 3.5, 9);
  ctx.fill();
  // le corps, degrade le long de la liane : sombre a la racine, plus vert vers la pointe vive
  ctx.globalAlpha = f;
  const q0 = pts[0],
    q1 = pts[pts.length - 1];
  const gb = ctx.createLinearGradient(q0.x, q0.y, q1.x, q1.y);
  gb.addColorStop(0, '#1b2616');
  gb.addColorStop(0.55, '#26331d');
  gb.addColorStop(1, '#354823');
  contourRonce(pts, 8);
  ctx.fillStyle = gb;
  ctx.fill();
  // le ruban de lumiere, du cote de la source, plus fin que le corps
  ctx.globalAlpha = f * (0.3 + 0.34 * L.k);
  contourRonce(pts, 3.1, L.x * 2.6, L.y * 2.6);
  ctx.fillStyle = 'rgba(' + L.te + ',0.55)';
  ctx.fill();
  // les feuilles : deux par noeud, jamais symetriques, la claire du cote du jour
  pts.forEach((p, i) => {
    const v = pts[i - 1] || pts[i + 1] || p;
    const an = Math.atan2(p.y - v.y, p.x - v.x),
      h = HACHE(i, R.seg.length);
    for (let k = 0; k < 2; k++) {
      const cote = k ? 1 : -1;
      const ec = an + cote * (0.78 + 0.34 * h);
      const clair = Math.cos(ec) * L.x + Math.sin(ec) * L.y < 0;
      feuille(p.x, p.y, ec, 8.5 + 3.5 * HACHE(i + k, 3), clair, f, p.ouv);
    }
  });
  // les epines : uniquement sur la part dure. Elles sont le seul signal que ca tue.
  pts.forEach((p, i) => {
    if (!p.dur) return;
    const v = pts[i - 1] || pts[i + 1] || p;
    const an = Math.atan2(p.y - v.y, p.x - v.x);
    for (let k = 0; k < 3; k++) {
      const ec = an + (k === 1 ? -Math.PI / 2 : Math.PI / 2) + (k - 1) * 0.38;
      epine(p.x, p.y, ec, 7.5 + 2 * HACHE(i + k, 5), L.te, f);
    }
  });
  ctx.restore();
}
