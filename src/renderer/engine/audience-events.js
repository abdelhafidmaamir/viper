// Audience events: turns gifts, likes, joins and viewer milestones from the live bridges into
// board effects for the team they back.

import { PALIERS_VUE, annoncer, dire, likesPar, paliersVus } from './announcements.js';
import { compter } from './crowd.js';
import {
  BOUCLIER_COUT,
  BOUCLIER_DUR,
  COUPE_COUT,
  TEMPO_COUT,
  TEMPO_DUR,
  VIE_COUT,
  coupeDe,
} from './rules.js';
import {
  charger,
  corps,
  couperDuel,
  eclat,
  manche,
  noterCadeau,
  px,
  ranger,
  semerPour,
  serpent,
} from '../scripts/game.js';

// Entry point for every audience event (gifts, likes, joins, viewer counts) from the live bridges.
export function recevoirEvenement(ev) {
  const e = ev || {},
    n = Math.max(1, Math.min(parseInt(e.n) || 1, 20));
  if (e.type === 'spectateurs') {
    const tot = parseInt(e.total) || 0;
    let haut = 0;
    for (const pl of PALIERS_VUE) {
      if (tot >= pl && !paliersVus[pl]) {
        paliersVus[pl] = 1;
        haut = pl;
      }
    }
    if (haut) annoncer({ genre: 'palier', pseudo: '', texte: dire('palier', { n: haut }) });
    return 0;
  }
  if (e.type === 'arrivee' || e.type === 'partage' || e.type === 'abonne') {
    annoncer({
      genre: e.type,
      pseudo: String(e.pseudo || ''),
      avatar: e.avatar,
      texte: dire(e.type),
    });
    return 0;
  }
  if (e.type === 'like' && e.pseudo) {
    const lp = String(e.pseudo);
    likesPar[lp] = (likesPar[lp] || 0) + n;
    if (likesPar[lp] >= 10) {
      annoncer({
        genre: 'like',
        pseudo: lp,
        avatar: e.avatar,
        texte: dire('like', { n: likesPar[lp] }),
      });
      likesPar[lp] = 0;
    }
  }
  // Camp : explicite (regie), sinon par le NOM du cadeau TikTok (Abdel : « red 1 coin rose gives one
  // point to Or, white 1 coin gives 1 point to the other ») : 'rose' -> Or, tout autre cadeau -> Ombre.
  // Sans camp ni nom : tirage au sort (public simule).
  const nom = String(e.nom || e.cadeau || e.gift || '').toLowerCase();
  // Rose rouge ('rose') -> Or ; rose blanche (TikTok la nomme 'Rosa', ou 'rose blanche'/'white rose') -> Ombre.
  // A 10 coins (Abdel) : une rose a 10 -> tempo Or, le 'Dyno' a 10 -> tempo Ombre : tout nom contenant 'rose' -> Or.
  const v = e.valeur || 0;
  // Cadeaux du camp Or par nom : rose (10), donut (30) ; tout le reste (Dyno, Capybara...) est Ombre.
  const roseRouge =
    v >= TEMPO_COUT
      ? /rose|bouquet|bagel|donut|doughnut|teddy|bear/.test(nom)
      : /^rose( rouge| red)?$/.test(nom.trim());
  const i =
    e.camp === 'ombre'
      ? 1
      : e.camp === 'or'
        ? 0
        : nom
          ? roseRouge
            ? 0
            : 1
          : Math.random() < 0.5
            ? 0
            : 1;
  compter(e.type === 'cadeau' ? n * 3 : n);
  // Le like ne donne plus de poussee de vitesse en duel (Abdel, 2026-09-19 : « this is not a feature
  // anymore, remove it »). Il compte toujours pour l'affluence (compter, plus haut), rien d'autre.
  if (e.type === 'like') return 0;
  if (e.type === 'cadeau') {
    noterCadeau(i, e.valeur || 0, e.pseudo, n, e.avatar);
    if ((e.valeur || 0) >= VIE_COUT) {
      // vie : quand une coupe devrait tuer le serpent, elle le laisse a 3 anneaux
      const av = corps[i].vies;
      corps[i].vies += n;
      corps[i].viePar = String(e.pseudo || '');
      corps[i].vieAvatar = e.avatar;
      charger(i);
      if (serpent.length) {
        const tp = px(serpent[0].x, serpent[0].y);
        eclat(tp.x, tp.y, 18, 'rodeur');
      }
      ranger();
      charger(0); // vie : eclat rouge, comme le coeur
      return corps[i].vies - av;
    }
    if ((e.valeur || 0) >= BOUCLIER_COUT) {
      // bouclier : BOUCLIER_DUR secondes d'immunite aux coupes et aux collisions (Abdel : actif 15 s)
      corps[i].bouclierT += BOUCLIER_DUR * n;
      corps[i].bouclierPar = String(e.pseudo || '');
      corps[i].bouclierAvatar = e.avatar;
      charger(i);
      if (serpent.length) {
        const tp = px(serpent[0].x, serpent[0].y);
        eclat(tp.x, tp.y, 18, 'coquille');
      }
      ranger();
      charger(0);
      return n;
    }
    if ((e.valeur || 0) >= TEMPO_COUT && (e.valeur || 0) < COUPE_COUT) {
      // tempo paye : TEMPO_DUR secondes de poussee sur SON serpent, cumulable (Abdel : le cadeau a 10 coins)
      corps[i].surgeT += TEMPO_DUR * n;
      charger(i);
      if (serpent.length) {
        const tp = px(serpent[0].x, serpent[0].y);
        eclat(tp.x, tp.y, 16, 'coquille');
      }
      ranger();
      charger(0);
      return n;
    }
    if ((e.valeur || 0) >= COUPE_COUT) {
      // coupe : 15 % de la longueur adverse, n fois
      let total = 0;
      for (let q = 0; q < n; q++) {
        if (!(manche && manche.etat === 'en cours')) break;
        total += couperDuel(1 - i, coupeDe(corps[1 - i].serpent.length), i);
      }
      charger(0);
      return total;
    }
    // bon marche : semer n baies pour le camp i
    let pose = 0;
    for (let q = 0; q < n; q++) pose += semerPour(i, e.pseudo);
    charger(0);
    return pose;
  }
  // commentaire/partage : cadence seulement
  return 0;
}
