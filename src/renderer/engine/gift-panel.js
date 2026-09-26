// Gift panels: the effect legend ('complet'), the scrolling columns ('defile') and the effect
// glyphs they share. TikTok LIVE guidelines forbid on-screen prices and permanent calls to
// action, so the columns show effects, not costs, and fade out on a configurable cycle.

import { L } from './layout.js';
import { ctx } from './canvas.js';
import {
  BOUCLIER_DUR,
  OMBRE,
  OR,
  TEMPO_DUR,
  bandeauCadeau,
  corps,
  duel,
  reglages,
  retourCadeaux,
  t,
} from '../scripts/game.js';

// Legende des cadeaux (duel) : sous le compteur, une colonne par camp. Chaque ligne = image du cadeau
// TikTok (cadeaux/*.png, fond transparent), prix en coins, effet. Etape 1 (Abdel) : les deux roses.
export const CADEAUX_DUEL = {
  or: [
    { img: 'rose-rouge', prix: 1, effet: '+1' },
    { img: 'rose-10', prix: 10, effet: 'speed 10s' },
    { img: 'bouquet', prix: 20, effet: 'steal 15%' },
    { img: 'bagel', prix: 30, effet: 'shield 15s' },
    { img: 'teddy', prix: 100, effet: '+1 life' },
  ],
  ombre: [
    { img: 'rose-blanche', prix: 1, effet: '+1' },
    { img: 'dyno', prix: 10, effet: 'speed 10s' },
    { img: 'parfum', prix: 20, effet: 'steal 15%' },
    { img: 'capybara', prix: 30, effet: 'shield 15s' },
    { img: 'hand-heart', prix: 100, effet: '+1 life' },
  ],
  // a venir, une ligne par cadeau : {img:'dyno',prix:10,effet:'speed 10s'}, {prix:30,effet:'steal 15%'}, {prix:50,effet:'shield 15s'}, {prix:100,effet:'+1 life'}
};

export const imgCadeaux = {};

export function imageCadeau(nom) {
  if (imgCadeaux[nom] !== undefined) return imgCadeaux[nom];
  if (typeof Image === 'undefined') {
    imgCadeaux[nom] = null;
    return null;
  }
  const im = new Image();
  im.src = 'assets/gifts/' + nom + '.png';
  imgCadeaux[nom] = im;
  return im;
}

export function peindreLegendeDuel() {
  if (!duel()) return;
  // Compact (Abdel : 5 cadeaux par cote a venir, anglais, sans 'pour X', la couleur suffit) :
  // 5 lignes de 92 px tiennent entre 1340 et 1800.
  const Y = L.legY,
    LH = 92,
    IMG = 64,
    CW = 400;
  ctx.save();
  const mode = reglages.retourCadeau || 'aucun';
  [
    ['or', L.legCxG, OR, '242,197,124'],
    ['ombre', L.legCxD, OMBRE, '180,212,222'],
  ].forEach(([camp, cx, teinte, rgb]) => {
    const liste = CADEAUX_DUEL[camp],
      ci = camp === 'or' ? 0 : 1,
      cc = corps[ci];
    // G4 : bandeau donateur au-dessus de la colonne, il glisse vers le haut et s'efface
    const bd = bandeauCadeau[ci];
    if (mode === 'G4' && bd && t - bd.t < 2.6) {
      const a = t - bd.t,
        en = Math.min(1, a / 0.35),
        so = a > 2 ? 1 - (a - 2) / 0.6 : 1,
        e2 = 1 - Math.pow(1 - en, 3);
      ctx.globalAlpha = Math.max(0, e2 * so);
      ctx.fillStyle = teinte;
      ctx.font = '700 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bd.texte, cx, Y - LH / 2 - 16 + (1 - e2) * 18);
      ctx.globalAlpha = 1;
    }
    liste.forEach((c, k) => {
      const y = Y + k * LH;
      // retour visuel : age du dernier cadeau de cette ligne, et part restante de l'effet s'il dure
      const rc = retourCadeaux[ci][k],
        age = rc ? t - rc.t : 99;
      const reste = cc
        ? k === 1
          ? Math.min(1, (cc.surgeT || 0) / TEMPO_DUR)
          : k === 3
            ? Math.min(1, (cc.bouclierT || 0) / BOUCLIER_DUR)
            : 0
        : 0;
      if (mode === 'G1' && (age < 1.8 || reste > 0)) {
        const flash = age < 1.8 ? Math.pow(1 - age / 1.8, 1.5) : 0;
        ctx.fillStyle =
          'rgba(' +
          rgb +
          ',' +
          (0.3 * flash + (reste > 0 ? 0.1 + 0.03 * Math.sin(t * 2.4) : 0)) +
          ')';
        ctx.beginPath();
        ctx.roundRect(cx - CW / 2, y - LH / 2 + 6, CW, LH - 12, 22);
        ctx.fill();
      }
      // plaque
      ctx.fillStyle = 'rgba(6,11,8,0.46)';
      ctx.beginPath();
      ctx.roundRect(cx - CW / 2, y - LH / 2 + 6, CW, LH - 12, 22);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(' + rgb + ',0.35)';
      ctx.stroke();
      // image du cadeau, a gauche de la plaque
      // Ombre en miroir d'Or (Abdel, 2026-09-19) : image et pastille de prix a DROITE, effet aligne a droite
      const miroir = camp === 'ombre';
      const im = imageCadeau(c.img);
      const ix = miroir ? cx + CW / 2 - 16 - IMG : cx - CW / 2 + 16,
        iy = y - IMG / 2;
      // G2 : l'image sursaute ; G3 : elle sautille
      const saut = mode === 'G2' && age < 0.3 ? 1 + 0.18 * Math.sin((age / 0.3) * Math.PI) : 1,
        hop = mode === 'G3' && age < 0.25 ? -9 * Math.sin((age / 0.25) * Math.PI) : 0;
      if (im && im.complete && im.naturalWidth) {
        const d2 = IMG * saut;
        ctx.drawImage(im, ix + IMG / 2 - d2 / 2, iy + IMG / 2 - d2 / 2 + hop, d2, d2);
      } else {
        ctx.fillStyle = 'rgba(' + rgb + ',0.25)';
        ctx.beginPath();
        ctx.arc(ix + IMG / 2, y, IMG * 0.38, 0, Math.PI * 2);
        ctx.fill();
      }
      // prix : pastille coin
      // prix (pastille teintee) puis effet, sur une seule ligne
      const pcx = miroir ? ix - 18 - 17 : ix + IMG + 18 + 17; // centre de la pastille de prix
      ctx.fillStyle = teinte;
      ctx.beginPath();
      ctx.arc(pcx, y, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c110e';
      ctx.font = '900 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(c.prix), pcx, y + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = '700 30px system-ui, sans-serif';
      ctx.textAlign = miroir ? 'right' : 'left';
      ctx.fillText(c.effet, miroir ? pcx - 29 : pcx + 29, y + 1);
      ctx.textAlign = 'left';
      if (mode === 'G1') {
        if (rc && age < 2.2 && reglages.nomsDonateurs !== false) {
          ctx.globalAlpha = age < 1.6 ? 1 : Math.max(0, 1 - (age - 1.6) / 0.6);
          ctx.fillStyle = teinte;
          ctx.font = '600 19px system-ui, sans-serif';
          ctx.textAlign = miroir ? 'left' : 'right';
          ctx.fillText(rc.pseudo, miroir ? cx - CW / 2 + 18 : cx + CW / 2 - 18, y - LH / 2 + 24);
          ctx.globalAlpha = 1;
          ctx.textAlign = 'left';
        }
        if (reste > 0) {
          ctx.strokeStyle = 'rgba(' + rgb + ',0.95)';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx - CW / 2 + 24, y + LH / 2 - 9);
          ctx.lineTo(cx - CW / 2 + 24 + (CW - 48) * reste, y + LH / 2 - 9);
          ctx.stroke();
        }
      }
      if (mode === 'G2' && reste > 0) {
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        ctx.arc(ix + IMG / 2, y, IMG / 2 + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = teinte;
        ctx.beginPath();
        ctx.arc(ix + IMG / 2, y, IMG / 2 + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * reste);
        ctx.stroke();
      }
      if (mode === 'G3' && rc && rc.n > 0) {
        const bx = miroir ? ix + 6 : ix + IMG - 6,
          by = y - IMG / 2 + 8,
          pop = age < 0.3 ? 1 + 0.35 * Math.sin((age / 0.3) * Math.PI) : 1;
        ctx.fillStyle = teinte;
        ctx.beginPath();
        ctx.arc(bx, by, 15 * pop, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0c110e';
        ctx.font = '900 17px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(rc.n), bx, by + 1);
        ctx.textAlign = 'left';
      }
    });
  });
  ctx.restore();
}

// Bandeau de cadeaux qui defile (modele Livecade, valide en direction par Abdel 2026-09-22) : un ruban
// horizontal au bas de l'ecran qui glisse en continu, chaque cadeau = son image ANIMEE (wiggle) + son EFFET
// en toutes lettres. AUCUN prix, AUCUN verbe d'envoi : c'est un menu de jeu, pas une vitrine d'achat.
export const EFFET_LABEL = {
  '+1': 'BERRY',
  'speed 10s': 'SPEED',
  'steal 15%': 'STEAL',
  'shield 15s': 'SHIELD',
  '+1 life': 'LIFE',
};

export const tuilesCamp = {};

export function tuiles(camp) {
  if (tuilesCamp[camp]) return tuilesCamp[camp];
  const t = CADEAUX_DUEL[camp].map((c) => ({
    img: c.img,
    label: EFFET_LABEL[c.effet] || c.effet.toUpperCase(),
  }));
  tuilesCamp[camp] = t;
  return t;
}

// un ruban compact : boite etroite posee sur un cote ; la liste d'un camp glisse, boucle, et s'ESTOMPE en
// fondu transparent aux deux bords (rendu sur un calque a part puis efface aux extremites). Icones animees
// (wiggle), label teinte du camp. Pas de prix.
export const calquesRuban = {};

export function calqueRuban(camp, bw, bh) {
  let c = calquesRuban[camp];
  if (!c) {
    if (typeof document === 'undefined') return null;
    c = document.createElement('canvas');
    calquesRuban[camp] = c;
  }
  if (c.width !== bw) {
    c.width = bw;
    c.height = bh;
  }
  return c;
}

// Pictogramme de l'EFFET dans la DA du jeu (memes traces que le rail duel : ecusson, coeur, eclair, baie),
// dessine sur un contexte donne. C'est l'element principal de chaque ligne ; le cadeau TikTok n'est qu'un
// petit badge a cote (consigne Abdel : « the effect explicit action in the game accompagne de l'icone »).
export function glypheEffet(o, label, x, y, s, rgb) {
  o.save();
  o.lineJoin = 'round';
  o.lineCap = 'round';
  if (label === 'SHIELD') {
    o.beginPath();
    o.moveTo(x, y - s);
    o.lineTo(x + s * 0.8, y - s * 0.6);
    o.lineTo(x + s * 0.8, y + s * 0.1);
    o.bezierCurveTo(x + s * 0.8, y + s * 0.7, x, y + s, x, y + s);
    o.bezierCurveTo(x, y + s, x - s * 0.8, y + s * 0.7, x - s * 0.8, y + s * 0.1);
    o.lineTo(x - s * 0.8, y - s * 0.6);
    o.closePath();
    o.fillStyle = 'rgba(' + rgb + ',0.92)';
    o.shadowColor = 'rgba(' + rgb + ',0.6)';
    o.shadowBlur = 10;
    o.fill();
    o.shadowBlur = 0;
    o.lineWidth = 2.2;
    o.strokeStyle = 'rgba(255,255,255,0.85)';
    o.stroke();
    o.lineWidth = 2.6;
    o.strokeStyle = 'rgba(12,17,14,0.7)';
    o.beginPath();
    o.moveTo(x, y - s * 0.55);
    o.lineTo(x, y + s * 0.5);
    o.moveTo(x - s * 0.45, y - s * 0.1);
    o.lineTo(x + s * 0.45, y - s * 0.1);
    o.stroke();
  } else if (label === 'LIFE') {
    o.beginPath();
    o.moveTo(x, y + s * 0.85);
    o.bezierCurveTo(x - s * 1.15, y - s * 0.05, x - s * 0.6, y - s * 0.95, x, y - s * 0.35);
    o.bezierCurveTo(x + s * 0.6, y - s * 0.95, x + s * 1.15, y - s * 0.05, x, y + s * 0.85);
    o.closePath();
    o.fillStyle = 'rgba(228,64,58,0.95)';
    o.shadowColor = 'rgba(228,64,58,0.7)';
    o.shadowBlur = 12;
    o.fill();
    o.shadowBlur = 0;
    o.lineWidth = 2.2;
    o.strokeStyle = 'rgba(255,255,255,0.85)';
    o.stroke();
  } else if (label === 'SPEED') {
    o.beginPath();
    o.moveTo(x - s * 0.05, y - s);
    o.lineTo(x + s * 0.6, y - s);
    o.lineTo(x + s * 0.1, y - s * 0.15);
    o.lineTo(x + s * 0.55, y - s * 0.15);
    o.lineTo(x - s * 0.35, y + s);
    o.lineTo(x - s * 0.05, y + s * 0.12);
    o.lineTo(x - s * 0.6, y + s * 0.12);
    o.closePath();
    o.fillStyle = 'rgba(' + rgb + ',0.95)';
    o.shadowColor = 'rgba(' + rgb + ',0.65)';
    o.shadowBlur = 12;
    o.fill();
    o.shadowBlur = 0;
    o.lineWidth = 2;
    o.strokeStyle = 'rgba(255,255,255,0.85)';
    o.stroke();
  } else if (label === 'BERRY') {
    // la baie du plateau : rond vert lumineux
    o.fillStyle = 'rgba(130,214,120,0.96)';
    o.shadowColor = 'rgba(130,214,120,0.8)';
    o.shadowBlur = 14;
    o.beginPath();
    o.arc(x, y, s * 0.72, 0, Math.PI * 2);
    o.fill();
    o.shadowBlur = 0;
    o.lineWidth = 2.2;
    o.strokeStyle = 'rgba(255,255,255,0.85)';
    o.stroke();
    o.fillStyle = 'rgba(255,255,255,0.55)';
    o.beginPath();
    o.arc(x - s * 0.25, y - s * 0.25, s * 0.18, 0, Math.PI * 2);
    o.fill();
  } else if (label === 'STEAL') {
    // fleche courbe qui ramene vers soi : le vol d'une part de l'adversaire
    o.lineWidth = 4.5;
    o.strokeStyle = 'rgba(' + rgb + ',0.95)';
    o.shadowColor = 'rgba(' + rgb + ',0.6)';
    o.shadowBlur = 10;
    o.beginPath();
    o.arc(x, y, s * 0.72, -Math.PI * 0.15, Math.PI * 1.25);
    o.stroke();
    o.shadowBlur = 0;
    const ax = x + Math.cos(-Math.PI * 0.15) * s * 0.72,
      ay = y + Math.sin(-Math.PI * 0.15) * s * 0.72;
    o.fillStyle = 'rgba(' + rgb + ',0.95)';
    o.beginPath();
    o.moveTo(ax + s * 0.05, ay - s * 0.5);
    o.lineTo(ax + s * 0.45, ay + s * 0.05);
    o.lineTo(ax - s * 0.35, ay + s * 0.12);
    o.closePath();
    o.fill();
    o.lineWidth = 1.8;
    o.strokeStyle = 'rgba(255,255,255,0.7)';
    o.beginPath();
    o.arc(x, y, s * 0.72, -Math.PI * 0.15, Math.PI * 1.25);
    o.stroke();
  }
  o.restore();
}

// ruban VERTICAL : colonne d'un camp qui defile de bas en haut (ou l'inverse), chaque cadeau = icone + effet
// sur une ligne, projecteur au centre vertical, fondu haut et bas, plaque qualite prod.
export function rubanCadeaux(camp, x0, y0, bw, bh, rgb, vitesse, sens) {
  const T = tuiles(camp),
    n = T.length,
    TH = 132,
    FADE = 64,
    midY = bh / 2,
    icx = 52;
  ctx.save();
  // plaque TRANSLUCIDE : l'ambiance du jeu passe derriere. Ombre portee douce, lisere teinte.
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 5;
  const pg = ctx.createLinearGradient(x0, 0, x0 + bw, 0);
  pg.addColorStop(0, 'rgba(14,19,16,0.42)');
  pg.addColorStop(1, 'rgba(8,11,9,0.5)');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.roundRect(x0, y0, bw, bh, 22);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(' + rgb + ',0.5)';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.roundRect(x0 + 2, y0 + 2, bw - 4, bh - 4, 20);
  ctx.stroke();
  const oc = calqueRuban(camp, bw, bh);
  if (oc) {
    const o = oc.getContext('2d');
    o.clearRect(0, 0, bw, bh);
    // les deux colonnes partagent le meme defilement ; le cote 'sens>0' est le MIROIR vertical de l'autre :
    // meme effet au centre au meme instant des deux cotes (Abdel : « LIFE au centre a gauche = LIFE a droite »),
    // tout en glissant en sens opposes.
    const bande = n * TH,
      dec = (((t * vitesse) % bande) + bande) % bande;
    const premier = Math.floor(dec / TH) - 1;
    o.textAlign = 'left';
    o.textBaseline = 'middle';
    for (let i = premier; i * TH - dec < bh + TH; i++) {
      const it = T[((i % n) + n) % n],
        cyB = i * TH - dec + TH / 2,
        cy = sens > 0 ? bh - cyB : cyB;
      if (cy < -TH || cy > bh + TH) continue;
      // separateur discret entre deux paires
      const byB = i * TH - dec,
        by = sens > 0 ? bh - byB : byB;
      o.fillStyle = 'rgba(255,255,255,0.10)';
      o.fillRect(20, by - 0.5, bw - 40, 1);
      // projecteur au centre vertical : le cadeau au milieu s'anime, les autres au repos
      let env = 1 - Math.abs(cy - midY) / 95;
      env = env > 0 ? env * env * (3 - 2 * env) : 0;
      const ang = env * 0.17 * Math.sin(t * 9.2),
        sc = 1 + env * 0.15;
      if (env > 0.04) {
        const r = o.createRadialGradient(icx, cy, 0, icx, cy, 66);
        r.addColorStop(0, 'rgba(' + rgb + ',' + 0.22 * env + ')');
        r.addColorStop(1, 'rgba(' + rgb + ',0)');
        o.fillStyle = r;
        o.fillRect(icx - 66, cy - 66, 132, 132);
      }
      // element principal : le pictogramme de l'EFFET dans la DA du jeu (anime au centre)
      o.save();
      o.translate(icx, cy);
      o.rotate(ang);
      o.scale(sc, sc);
      glypheEffet(o, it.label, 0, 0, 22, rgb);
      o.restore();
      // le mot de l'effet
      o.shadowColor = 'rgba(0,0,0,0.6)';
      o.shadowBlur = 4;
      o.shadowOffsetY = 2;
      o.fillStyle = 'rgba(' + rgb + ',' + (0.9 + 0.1 * env) + ')';
      o.font = '800 24px system-ui, sans-serif';
      o.fillText(it.label, icx + 36, cy + 1);
      o.shadowColor = 'transparent';
      o.shadowBlur = 0;
      o.shadowOffsetY = 0;
      // le cadeau TikTok en petit badge a droite : secondaire, legerement attenue
      const im = imageCadeau(it.img),
        GB = 34,
        gx = bw - 24 - GB / 2;
      o.save();
      o.globalAlpha = 0.88;
      o.shadowColor = 'rgba(0,0,0,0.4)';
      o.shadowBlur = 5;
      o.shadowOffsetY = 2;
      if (im && im.complete && im.naturalWidth) o.drawImage(im, gx - GB / 2, cy - GB / 2, GB, GB);
      o.restore();
    }
    // fondu haut et bas : on efface vraiment le contenu (transparence), la plaque translucide reste dessous
    o.globalCompositeOperation = 'destination-out';
    let gt = o.createLinearGradient(0, 0, 0, FADE);
    gt.addColorStop(0, 'rgba(0,0,0,1)');
    gt.addColorStop(1, 'rgba(0,0,0,0)');
    o.fillStyle = gt;
    o.fillRect(0, 0, bw, FADE);
    let gb = o.createLinearGradient(0, bh - FADE, 0, bh);
    gb.addColorStop(0, 'rgba(0,0,0,0)');
    gb.addColorStop(1, 'rgba(0,0,0,1)');
    o.fillStyle = gb;
    o.fillRect(0, bh - FADE, bw, FADE);
    o.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.roundRect(x0, y0, bw, bh, 22);
    ctx.clip();
    ctx.drawImage(oc, x0, y0);
  }
  ctx.restore();
}

// les plaques ne sont PAS permanentes (un panneau permanent est un declencheur TikTok documente) :
// pattern etudie et REGLABLE en regie : visibles defileVisi s, cachees defileCache s, en boucle.
// Fondu doux en entree comme en sortie. Aucun lien avec l'arrivee des cadeaux (pattern pur).
export const DEFILE_FONDU = 0.7;

// s
export function alphaDefile() {
  // 0 est une valeur legitime pour cache (toujours visible) : ne pas la confondre avec « non regle »
  const vis = reglages.defileVisi > 0 ? reglages.defileVisi : 8,
    cache = reglages.defileCache == null ? 12 : reglages.defileCache,
    P = vis + cache,
    ph = t % P;
  if (cache <= 0) return 1; // option "toujours visible" (tests hors live)
  const a =
    ph < DEFILE_FONDU
      ? ph / DEFILE_FONDU
      : ph < vis - DEFILE_FONDU
        ? 1
        : ph < vis
          ? 1 - (ph - (vis - DEFILE_FONDU)) / DEFILE_FONDU
          : 0;
  return Math.max(0, Math.min(1, a));
}

export function peindreDefileCadeaux() {
  if (!duel()) return;
  const al = alphaDefile();
  if (al <= 0.01) return;
  // deux colonnes verticales longues, placees sur le cote DROIT, SOUS le plateau (la gauche reste libre)
  const BW = 250,
    BH = 372,
    YB = L.defY,
    XD = L.defXD,
    XG = L.defXG;
  ctx.save();
  ctx.globalAlpha = al;
  rubanCadeaux('or', XG, YB, BW, BH, '242,197,124', 40, -1);
  rubanCadeaux('ombre', XD, YB, BW, BH, '180,212,222', 40, 1);
  ctx.restore();
}
