// On-stream announcements: the banner that credits viewers for their plays, the phrasing it
// uses (no mention of gifts or prices, per TikTok LIVE guidelines) and viewer avatars.

import { glypheEffet } from './gift-panel.js';
import { BD_CX, BD_CY, BD_W, CELL, W } from './layout.js';
import { glypheSerpent } from './scoreboard.js';
import {
  OMBRE,
  OR,
  amb,
  corps,
  ctx,
  duel,
  manche,
  pointRail,
  reglages,
  t,
} from '../scripts/game.js';

// ===== Bandeau d'activite, haut-centre (prototype, Abdel 2026-09-21 : « welcome people, thanks donations,
// like and share, with a cute animation of the snake », puis « more polished »). Une annonce a la fois,
// les cadeaux passent devant. Meme plaque que les lignes de la legende, et le VRAI rendu du serpent en
// petit. Masque pendant la tenue de l'anneau (le compte a rebours occupe la meme place). Rendu seul.
export let annonces = [],
  annonceCur = null,
  likesPar = {};

// memoire du LIVE (pas de la manche) : paliers de spectateurs deja salues, premiers cadeaux, serie de victoires,
// et dons de la manche en cours par spectateur (pour le classement de fin de manche).
export const PALIERS_VUE = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export let paliersVus = {},
  dejaDonne = {},
  serieCamp = null,
  serieN = 0,
  donsManche = {},
  sauveT = [-9, -9];

export function nomCamp(c) {
  return c === 'or' ? 'Or' : 'Ombre';
}

// Les mots du bandeau (Abdel, 2026-09-21 : « more natural and user friendly, not like a bot, a bit more warm »).
// Plusieurs tournures par evenement, tirees au sort sans jamais redire la meme deux fois de suite.
// De vraies phrases, comme un hote qui parle, avec le NOM du spectateur dedans (Abdel : « not human speech
// readable », « their name is not visible »). {nom} est mis en valeur au rendu ; {c} camp, {a} camp adverse.
// Plus AUCUNE notion de cadeau dans les annonces (Abdel, 2026-09-22 : « get rid of the notion of gift but
// still reward the viewer ») : le spectateur est celebre pour son ACTION dans le jeu. DONS = l'action
// accomplie, conjuguee, par effet (meme index que CADEAUX_DUEL).
export const DONS = [
  'drops a berry',
  'fires a speed boost',
  'pulls off a steal',
  'raises a shield',
  'grants an extra life',
];

export const MOTS = {
  arrivee: [
    "Welcome {nom}, glad you're here!",
    'Hey {nom}, good to see you!',
    '{nom} just joined us, say hi!',
  ],
  partage: ['Thanks for sharing the live, {nom}!', '{nom} shared the live, thank you so much!'],
  abonne: ['Thanks for the follow, {nom}!', '{nom} just followed, welcome aboard!'],
  like: ['{nom} dropped {n} likes, thank you!', '{n} likes from {nom}, love it!'],
  // Abdel : ne jamais ecrire « Or » ni « Ombre », la couleur de la plaque et du nom le dit deja
  cadeau: ['{nom} {q}! What a play!', 'Big play: {nom} {q}!', '{nom} {q} for the team!'],
  premier: ['{nom} enters the game and {q}! Welcome!', 'First play by {nom}: {q}!'],
  palier: ["We're {n} here now, welcome everyone!", "{n} of us watching, you're amazing!"],
  serie: ['{n} wins in a row! Who can stop them?', "That's {n} in a row, unstoppable!"],
  sauve: ["{nom}'s {q} just saved the day!", "What a save! {nom}'s {q} kept them alive."],
  sauveSans: ['A {q} just saved the day!', 'What a save, that {q} kept them alive!'],
};

export const dernierMot = {};

export function dire(cle, v) {
  const l = MOTS[cle];
  let k = Math.floor(Math.random() * l.length);
  if (l.length > 1 && k === dernierMot[cle]) k = (k + 1) % l.length;
  dernierMot[cle] = k;
  return l[k]
    .replace('{n}', v && v.n !== undefined ? v.n : '')
    .replace('{c}', (v && v.c) || '')
    .replace('{a}', (v && v.a) || '')
    .replace('{q}', (v && v.q) || '');
}

export function sauve(i, quoi) {
  // un bouclier ou une vie offerts viennent d'eviter une perte
  if (t - sauveT[i] < 4) return;
  sauveT[i] = t;
  const camp = i === 0 ? 'or' : 'ombre',
    qui = corps[i] && corps[i][quoi === 'vie' ? 'viePar' : 'bouclierPar'];
  annoncer({
    genre: 'sauve',
    pseudo: qui || '',
    texte: dire(qui ? 'sauve' : 'sauveSans', {
      c: nomCamp(camp),
      q: quoi === 'vie' ? 'extra life' : 'shield',
    }),
    avatar: corps[i] && corps[i][quoi === 'vie' ? 'vieAvatar' : 'bouclierAvatar'],
    camp,
    effet: quoi === 'vie' ? 'LIFE' : 'SHIELD',
    devant: true,
  });
}

export const BD_DUR = 3.8,
  BD_H = 96;

// Serie de victoires d'un camp : annoncee a partir de la deuxieme manche gagnee d'affilee.
export function annoncerSerie(camp) {
  if (serieCamp === camp) serieN++;
  else {
    serieCamp = camp;
    serieN = 1;
  }
  if (serieN >= 2)
    annoncer({
      genre: 'serie',
      pseudo: '',
      texte: dire('serie', {
        c: nomCamp(camp),
        a: nomCamp(camp === 'or' ? 'ombre' : 'or'),
        n: serieN,
      }),
      camp,
      devant: true,
    });
}

// Les dons se comptent par manche : le classement de fin repart de zero.
export function oublierDonsManche() {
  donsManche = {};
}

export function annoncer(a) {
  if (!duel() || !reglages.bandeau || reglages.bandeau === 'aucun') return;
  if (a.genre === 'cadeau' || a.devant) {
    let k = annonces.findIndex((q) => q.genre !== 'cadeau');
    if (k < 0) k = annonces.length;
    annonces.splice(k, 0, a);
  } else annonces.push(a);
  if (annonces.length > 6) annonces.length = 6;
}

// photos de profil des spectateurs (URL fournie par TikFinity) : cache borne, image prete ou rien
export const photos = {};

export let nbPhotos = 0;

export function photoProfil(url) {
  if (!url || typeof url !== 'string' || !/^https?:/.test(url)) return null;
  let im = photos[url];
  if (!im) {
    if (nbPhotos > 80) {
      for (const k in photos) delete photos[k];
      nbPhotos = 0;
    }
    im = new Image();
    im.referrerPolicy = 'no-referrer';
    im.src = url;
    photos[url] = im;
    nbPhotos++;
  }
  return im.complete && im.naturalWidth ? im : null;
}

export function miniSerpent(pts, teinte, ech) {
  const a = amb();
  if (!a || !a.peindreSerpent || pts.length < 2) return;
  ctx.save();
  ctx.scale(ech, ech);
  a.peindreSerpent(
    ctx,
    pts.map((p) => ({ x: p.x / ech, y: p.y / ech })),
    CELL,
    { teinte },
  );
  ctx.restore();
}

export function peindreBandeau() {
  const mode = reglages.bandeau;
  if (!duel() || !mode || mode === 'aucun' || !manche) return;
  const tenue = corps.some((c) => c && (c.tenue || 0) > 0 && manche.etat === 'en cours');
  if (tenue) {
    annonceCur = null;
    return;
  }
  if (!annonceCur && annonces.length) {
    annonceCur = annonces.shift();
    annonceCur.t0 = t;
  }
  const lisse = (v) => {
    v = Math.max(0, Math.min(1, v));
    return v * v * v * (v * (6 * v - 15) + 10);
  };
  if (annonceCur && t - annonceCur.t0 >= BD_DUR) annonceCur = null;
  const actif = annonceCur,
    age = actif ? t - actif.t0 : 0;
  const teinte = actif && actif.camp ? (actif.camp === 'or' ? OR : OMBRE) : '#e8f1dc',
    rgb =
      actif && actif.camp ? (actif.camp === 'or' ? '242,197,124' : '180,212,222') : '232,241,220';
  const en = actif ? lisse(age / 0.55) : 0,
    so = actif ? lisse((age - (BD_DUR - 0.55)) / 0.55) : 0;
  const cx = BD_CX + (mode === 'P3' ? 34 : 0),
    x = cx - BD_W / 2,
    y = BD_CY - BD_H / 2;
  // la plaque et son contenu ; reveal = part visible depuis la gauche (P2, P3), alpha global
  const plaque = (reveal, alpha, dy) => {
    if (alpha <= 0.01 || reveal <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(0, dy || 0);
    ctx.beginPath();
    ctx.rect(x - 4, y - 6, (BD_W + 8) * reveal, BD_H + 12);
    ctx.clip();
    ctx.fillStyle = 'rgba(8,12,10,0.74)';
    ctx.beginPath();
    ctx.roundRect(x, y, BD_W, BD_H, 24);
    ctx.fill();
    ctx.fillStyle = 'rgba(' + rgb + ',' + (0.1 * (1 - Math.min(1, age / 1.6))).toFixed(3) + ')';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.38)';
    ctx.stroke();
    const AV = 64,
      ax = x + 16 + AV / 2,
      pop =
        age < 0.9
          ? 1 + 0.14 * Math.sin(Math.min(1, Math.max(0, (age - 0.45) / 0.45)) * Math.PI)
          : 1;
    const noms = reglages.nomsDonateurs !== false,
      nom = noms && actif.pseudo ? actif.pseudo.slice(0, 18) : '',
      av = noms ? photoProfil(actif.avatar) : null;
    // photo de profil du spectateur, ronde, cerclee de la couleur du camp ; sinon son initiale ; sinon le glyphe
    if (nom) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, BD_CY, (AV / 2) * pop, 0, Math.PI * 2);
      ctx.closePath();
      if (av) {
        ctx.save();
        ctx.clip();
        ctx.drawImage(av, ax - (AV / 2) * pop, BD_CY - (AV / 2) * pop, AV * pop, AV * pop);
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(' + rgb + ',0.22)';
        ctx.fill();
        ctx.fillStyle = teinte;
        ctx.font = '800 32px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          nom
            .replace(/[^A-Za-z0-9]/g, '')
            .charAt(0)
            .toUpperCase() || '?',
          ax,
          BD_CY + 2,
        );
      }
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(' + rgb + ',0.85)';
      ctx.beginPath();
      ctx.arc(ax, BD_CY, (AV / 2) * pop, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else glypheSerpent(ax, BD_CY, 17 * pop, actif.camp ? teinte : null);
    // a droite : le glyphe de l'EFFET du jeu (plus l'artwork du cadeau, notion de cadeau retiree)
    const IM = 60,
      aImg = !!actif.effet;
    if (aImg) {
      ctx.save();
      ctx.translate(x + BD_W - 16 - IM / 2, BD_CY);
      ctx.scale(pop, pop);
      glypheEffet(ctx, actif.effet, 0, 0, 22, rgb);
      ctx.restore();
    }
    // la phrase : mots de couleur claire, le nom en gras dans la couleur du camp, deux lignes au plus
    const tx = ax + AV / 2 + 18,
      place = x + BD_W - (aImg ? IM + 30 : 22) - tx;
    const morceaux = String(actif.texte).split('{nom}'),
      pieces = [];
    morceaux.forEach((m, k) => {
      if (k > 0) pieces.push({ t: nom || 'a viewer', fort: !!nom });
      (m.match(/\S+|\s+/g) || []).forEach((q) => pieces.push({ t: q, fort: false }));
    });
    const mots = [];
    let cur = null;
    pieces.forEach((q) => {
      if (!q.fort && /^\s+$/.test(q.t)) {
        cur = null;
        return;
      }
      if (!cur) {
        cur = [];
        mots.push(cur);
      }
      cur.push(q);
    });
    let corpsT = 30,
      lignes = [];
    for (; corpsT >= 19; corpsT--) {
      const fN = '500 ' + corpsT + 'px system-ui, sans-serif',
        fF = '800 ' + corpsT + 'px system-ui, sans-serif';
      ctx.font = fN;
      const esp = ctx.measureText(' ').width;
      mots.forEach((w) => {
        w.l = 0;
        w.forEach((q) => {
          ctx.font = q.fort ? fF : fN;
          q.l = ctx.measureText(q.t).width;
          w.l += q.l;
        });
      });
      lignes = [[]];
      let lx = 0;
      mots.forEach((w) => {
        if (lx > 0 && lx + esp + w.l > place) {
          lignes.push([]);
          lx = 0;
        }
        if (lx > 0) lx += esp;
        w.x = lx;
        lx += w.l;
        lignes[lignes.length - 1].push(w);
      });
      if (lignes.length <= 2 && mots.every((w) => w.l <= place)) break;
    }
    const inter = corpsT * 1.22,
      y0 = BD_CY - ((lignes.length - 1) * inter) / 2 + 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    lignes.slice(0, 2).forEach((li, k) =>
      li.forEach((w) => {
        let wx = tx + w.x;
        w.forEach((q) => {
          ctx.font = (q.fort ? '800 ' : '500 ') + corpsT + 'px system-ui, sans-serif';
          ctx.fillStyle = q.fort ? (actif.camp ? teinte : '#ffffff') : 'rgba(255,255,255,0.86)';
          ctx.fillText(q.t, wx, y0 + k * inter);
          wx += q.l;
        });
      }),
    );
    ctx.restore();
  };
  if (mode === 'P1' && actif) {
    // orbite : le serpent fait le tour de la plaque, se pose, puis repart en l'effacant
    plaque(1, en * (1 - so), (1 - en) * 10);
    const m = 13,
      rx = x - m,
      ry = y - m,
      rw = BD_W + 2 * m,
      rh = BD_H + 2 * m,
      rr = 24 + m,
      per = 2 * (rw + rh) - 8 * rr + 2 * Math.PI * rr;
    const tour = lisse(age / 1.25),
      sTete = per * 0.08 + tour * per + Math.max(0, age - 1.25) * 22 + so * per * 0.55,
      long = Math.min(170, tour * per) * (1 - so * 0.4);
    const pts = [];
    for (let d = 0; d <= long; d += 7) {
      const s2 = (((sTete - d) % per) + per) % per;
      pts.push(pointRail(rx, ry, rw, rh, rr, s2));
    }
    ctx.save();
    ctx.globalAlpha = 1 - so;
    miniSerpent(pts, teinte, 0.5);
    ctx.restore();
  }
  if (mode === 'P2' && actif) {
    // porteur : le serpent traverse en ondulant et deroule la plaque derriere lui
    const hx = x - 60 + lisse(age / 1.1) * (BD_W + 140) + Math.max(0, age - 1.1) * 520;
    plaque(Math.max(0, Math.min(1, (hx - x - 10) / BD_W)), 1 - so, -so * 12);
    const pts = [];
    for (let i = 0; i < 26; i++) {
      const px2 = hx - i * 7;
      pts.push({ x: px2, y: BD_CY + Math.sin(px2 * 0.03) * 15 });
    }
    if (hx < W + 220) miniSerpent(pts, teinte, 0.5);
  }
  if (mode === 'P3') {
    // mascotte : un petit serpent love, toujours la ; il se redresse et la plaque sort de lui
    const mx = cx - BD_W / 2 - 38,
      my = BD_CY + 6,
      leve = en - so,
      resp = 1 + 0.03 * Math.sin(t * 2.2);
    if (actif) plaque(en, 1 - so, 0);
    const pts = [
      { x: mx + 6 + leve * 10, y: my - 30 - leve * 16 - 2 * Math.sin(t * 2.2) },
      { x: mx + 2 + leve * 6, y: my - 22 - leve * 9 },
      { x: mx - 2, y: my - 14 },
    ];
    for (let i = 0; i <= 19; i++) {
      const ang = -Math.PI / 2 - i * 0.4,
        rad = (27 - i * 0.35) * resp;
      pts.push({ x: mx + Math.cos(ang) * rad * 1.2, y: my + 4 + Math.sin(ang) * rad * 0.6 });
    }
    miniSerpent(pts, actif ? teinte : '#e8f1dc', 0.42);
  }
}
