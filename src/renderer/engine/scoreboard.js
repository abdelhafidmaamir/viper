// The arcade scoreboard under the board: one glyph and one count per team, the round clock
// between them.

import { SC_CY, W } from './layout.js';
import { ctx } from './canvas.js';
import { BLEU, OMBRE, OR } from './palette.js';
import {
  duel,
  glypheGens,
  manche,
  pulseS,
  pulseV,
  reglages,
  scoreSerpent,
  scoreViewers,
} from '../scripts/game.js';

// Mode de base, sans un mot : l'anneau du plateau est le METRE DE VICTOIRE GLOBAL. Il compte la
// progression sur tout le run, des grades deja faits jusqu'au dernier. Il monte a chaque bouchee et
// fait le tour complet au dernier grade. Il PEUT redescendre : chaque coeur arrache par la meute
// (rose premium) recule la progression, et la portion perdue brule alors en rouge avant de refluer.
// Le rail gauche, lui, montre le detail du grade courant (jauge qui se remplit puis se vide a chaque
// grade) : deux echelles distinctes, macro au bord et micro dans le rail.

// Le compteur de serie, sous le plateau. Emplacement mesure : le plateau finit a Y0+ROWS*CELL,
// soit 1220, et le fil de commentaires TikTok demarre a 1290. La bande 1226-1284 est le seul
// endroit a la fois dans la zone sure et jamais recouvert par l'interface.
// Il se lit sans un mot : a gauche une tete de serpent et son nombre de manches gagnees, a
// droite une foule et le sien. Pas de libelle, comme l'anneau et les astres.
// Idee d'Abdel : le mode versus place le soleil a gauche et la lune a droite, un camp par cote.
// Le compteur reprend la meme grammaire. En mode de base `peindreCourse` ne dessine rien, donc
// les deux bandes laterales, x 40 a 124 et 956 a 1040, sont libres sur toute la hauteur et sont
// dans la zone sure (SR_X=40, SR_W=1000). Le plateau va de x=124 a x=956, il n'est pas touche.
// Poser un camp par cote libere la hauteur, qui etait le vrai plafond de la version en bas :
// entre l'anneau (1234) et le fil de commentaires (1290) il n'y avait que 56 px.
// La hauteur choisie, 258 a 400, est celle du haut des colonnes d'astres (CIEL_HAUT=260).
// Les colonnes laterales sont enfin larges. L'anneau va de X0-14=150 a X0+COLS*CELL+14=930, il
// reste donc 150 px de chaque cote. En hauteur, la bande libre est celle entre le bas du chrome
// du haut (260) et le sommet de la colonne de widgets cadeaux de TikTok (392) : 132 px.
// La plaque prend 266 a 390, ce qui laisse 6 px sous le chrome et 2 px au-dessus des widgets.
// Les deux camps tiennent dans UNE barre horizontale, centree, juste sous le plateau. Choix
// d'Abdel : le tableau d'affichage se lit sous le jeu, comme une borne d'arcade, pas sur le cote.
// La bande sous l'anneau (1232) et le fil de commentaires est etroite, la barre est donc basse
// et compacte : glyphe puis chiffre, cote a cote, un filet vertical entre les deux camps.
export const SC_ECART = 122;

// ecart entre les centres des deux camps, de part et d'autre de W/2
export const SC_GX = 32;

// ecart glyphe-chiffre a l'interieur d'un camp
export const SC_R = 13;

// rayon du glyphe, compact
export const SC_BW = 250,
  SC_BH = 48;

// largeur et hauteur de la plaque de fond, reduites
export const doux01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Le gonflement d'un chiffre qui vient de marquer : une poussee franche puis un retour amorti.
// 0,9 s, pas plus : au-dela le chiffre danse encore quand le spectateur a deja tourne la page.
export function bond(p) {
  if (p >= 0.9) return 1;
  const u = p / 0.9;
  // plafonne a 1,25 : au-dela, un chiffre a deux chiffres deborde de la bande de 84 px
  return 1 + 0.3 * Math.sin(Math.PI * doux01(u * 1.25)) * (1 - u);
}

// La tete de serpent du compteur : la meme silhouette qu'en jeu, en petit. Deux yeux, pas un
// pictogramme abstrait : c'est ce qui rend le camp evident sans legende.
export function glypheSerpent(x, y, r, teinte) {
  ctx.fillStyle = teinte || '#e8f1dc';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // le cou, un moignon vers l'arriere, pour qu'on lise une tete et non une bille
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 1.15;
  ctx.strokeStyle = teinte || '#d9e7cc';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.2, y + r * 0.35);
  ctx.lineTo(x - r * 1.25, y + r * 0.72);
  ctx.stroke();
  ctx.fillStyle = '#1b2a1f';
  for (const o of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + r * 0.36, y + o * r * 0.36, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Le camp des spectateurs, ce sont des gens. Deux essais rates avant celui-ci : trois disques qui
// se chevauchaient, lus comme une icone de chat, puis une pierre, qui disait ce que le camp POSE
// et non ce qu'il EST. Ici, deux silhouettes tete-et-epaules franchement separees par un vide,
// la plus petite en retrait : c'est le signe universel de « des gens », et deux suffisent a dire
// le pluriel. Le vide entre elles est creuse en `destination-out`, sinon les deux corps fusionnent
// en une tache a cette taille.
export function personne(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y - r * 0.95, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  // les epaules : un arc large ferme a plat, la forme qui fait lire un buste et non un champignon
  ctx.beginPath();
  ctx.moveTo(x - r * 1.05, y + r * 1.15);
  ctx.quadraticCurveTo(x - r * 1.02, y + r * 0.02, x, y + r * 0.02);
  ctx.quadraticCurveTo(x + r * 1.02, y + r * 0.02, x + r * 1.05, y + r * 1.15);
  ctx.closePath();
  ctx.fill();
}

// Un camp : son glyphe puis son nombre de manches gagnees, cote a cote sur la ligne SC_CY.
// Seuls le glyphe et le chiffre respirent quand le camp marque, jamais la plaque : sinon la
// barre entiere danse et les deux camps ne se comparent plus.
// teinte (duel) : les deux camps sont des viperes, chacune dans sa couleur
// miroir (camp de droite) : le chiffre passe cote centre et le glyphe a l'extremite, comme une
// plaque de score de football : glyphe, chiffre | chiffre, glyphe
export function campBarre(cx, n, sun, pulse, teinte, miroir) {
  const sg = miroir ? -1 : 1;
  const k = bond(pulse),
    vif = Math.max(0, 1 - pulse / 0.9);
  const lueur = teinte ? teinte : sun ? 'rgba(242,197,124,0.85)' : 'rgba(143,168,216,0.85)';
  ctx.save();
  ctx.translate(cx - sg * SC_GX, SC_CY);
  ctx.scale(sg * k, 1); // miroir : le glyphe de droite regarde dans l'autre sens
  if (vif > 0.02) {
    ctx.shadowColor = lueur;
    ctx.shadowBlur = 26 * vif;
  }
  if (sun || teinte) glypheSerpent(0, 0, SC_R, teinte);
  else glypheGens(0, 0, SC_R);
  ctx.restore();

  ctx.save();
  ctx.translate(cx + sg * SC_GX, SC_CY);
  ctx.scale(k, k);
  if (vif > 0.02) {
    ctx.shadowColor = lueur;
    ctx.shadowBlur = 24 * vif;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 30px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = teinte || (sun ? OR : BLEU);
  ctx.fillText(String(n), 0, 1);
  ctx.restore();
}

export function peindreScore() {
  // en mode versus les deux colonnes appartiennent aux astres (CIEL_X=62), le compteur s'efface
  // en duel il reste : une vipere par camp, Or a gauche, Ombre a droite, meme plaque, meme logique
  if (!duel()) return;
  const cx = W / 2;
  // Duel (Abdel, 2026-09-21, variante T1) : le temps restant de la manche, en chiffres, entre les deux
  // scores, comme une carte de score de foot. La plaque s'elargit pour lui faire place ; glyphes inchanges.
  const chrono = duel() && manche,
    bw = chrono ? SC_BW + 84 : SC_BW,
    ecart = chrono ? SC_ECART + 84 : SC_ECART;
  ctx.save();
  // la plaque : le compteur doit tenir aussi bien en plein jour que dans la nuit, il porte donc
  // son propre fond, sombre et discret. Une seule plaque pour les deux camps.
  ctx.fillStyle = 'rgba(6,11,8,0.46)';
  ctx.beginPath();
  ctx.roundRect(cx - bw / 2, SC_CY - SC_BH / 2, bw, SC_BH, SC_BH / 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  if (chrono) {
    const dureeM = reglages.dureeDuel || reglages.duree,
      r = Math.max(0, Math.ceil(dureeM - (manche.t || 0)));
    const txt = Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0');
    ctx.beginPath();
    ctx.moveTo(cx - 42, SC_CY - 13);
    ctx.lineTo(cx - 42, SC_CY + 13);
    ctx.moveTo(cx + 42, SC_CY - 13);
    ctx.lineTo(cx + 42, SC_CY + 13);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 24px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle =
      r <= 20 && manche.etat === 'en cours' ? 'rgba(240,78,62,0.95)' : 'rgba(255,255,255,0.72)';
    ctx.fillText(txt, cx, SC_CY + 1);
  } else {
    // un filet vertical, entre les deux camps
    ctx.beginPath();
    ctx.moveTo(cx, SC_CY - 13);
    ctx.lineTo(cx, SC_CY + 13);
    ctx.stroke();
  }
  ctx.restore();
  campBarre(cx - ecart / 2, scoreSerpent, true, pulseS, duel() ? OR : null);
  campBarre(cx + ecart / 2, scoreViewers, false, pulseV, duel() ? OMBRE : null, true);
}

// Maquette de l'interface TikTok, pour juger le jeu en conditions reelles au lieu de juger un
// canvas nu. Ce n'est PAS un repere abstrait comme `reglages.zones` : ce sont les elements
// eux-memes, dessines aux positions mesurees sur la capture d'Abdel, pour qu'on voie ce qui
// recouvre quoi, ce qui reste lisible, et ou l'oeil du spectateur va reellement.
// Purement visuel, aucun effet sur le jeu, absent par defaut.
export function pilule(x, y, w, h, te, r) {
  ctx.fillStyle = te;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r === undefined ? h / 2 : r);
  ctx.fill();
}
