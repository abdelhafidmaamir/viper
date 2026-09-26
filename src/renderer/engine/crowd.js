// Crowd pacing: audience activity is smoothed into a cadence, which selects the tier that sets
// supply, targets and caps. Harnesses can pin the length cap.

import { LONG_CIBLE_DUEL, PALIERS } from './rules.js';

// La course decide la manche, pas la longueur : passe ce plafond, la baie donne le cran sans le segment.
// Dans les deux modes la longueur est plafonnee : elle ne peut pas etre a la fois l'horloge de la
// manche et le risque de mort, sinon allonger la manche rend la mort inevitable (mesure : 2 min
// de mediane et 47 % de victoires serpent quand la cible etait une longueur).
// Mesure du 2026-09-18 : a la fin des manches, la longueur mediane valait 30 sur 30 aux trois
// paliers actifs. Ce n'etait donc pas la victoire qui arrivait trop tot, c'etait le plafond qui
// etait la contrainte agissante, et 30 segments sur 320 cases font 9 % du plateau. Abdel : « we
// need to be able to reach stages were the snake is really long and becomes challenging ».
// Le plafond suit donc l'affluence : salle vide 34, calme 52, animee 80, foule 120. `reglerLong`
// le force pour les harnais, auquel cas le palier ne le touche plus.
export let longForce = 0;

export function forcerLong(v) {
  longForce = v;
}

// duel : plafond = LONG_CIBLE_DUEL (l'anneau est plein a 60). Deux serpents a 120 sur 320 cases
// s'enfermaient eux-memes (sonde : 62 morts/6 manches, toutes piegees ; a 60 : 30)
export const longMax = () => longForce || LONG_CIBLE_DUEL;

// duel : plafond LONG_CIBLE_DUEL
export let cadence = 0,
  palier = PALIERS[0];

// Salle vide, les deux camps avancaient sur deux horloges fixes et le vainqueur etait connu d'avance.
// La foret respire : chaque delai du garde-fou varie de plus ou moins 40 %.
export const souffle = (v) => v * (0.6 + Math.random() * 0.8);

// Chaque evenement pese sur la cadence, qui redescend toute seule en une minute
export function compter(n) {
  cadence += n;
}

export function majPalier(dt) {
  cadence = Math.max(0, cadence - (cadence * dt) / 60);
  const c = cadence;
  let p = PALIERS[0];
  for (let i = 0; i < PALIERS.length; i++) if (c >= PALIERS[i].min) p = PALIERS[i];
  palier = p;
}
