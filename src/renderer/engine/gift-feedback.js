// Gift feedback: remembers the latest donor per gift line and per team, for the legend highlight
// and the donor banner. Cleared at every round.

import { DONS, annoncer, dejaDonne, dire, donsManche, nomCamp } from './announcements.js';
import { CADEAUX_DUEL, EFFET_LABEL } from './gift-panel.js';
import { BOUCLIER_COUT, COUPE_COUT, TEMPO_COUT, VIE_COUT } from './rules.js';
import { reglages, t } from '../scripts/game.js';

export let retourCadeaux = [[], []],
  bandeauCadeau = [null, null]; // [camp][ligne] = {t, pseudo, n} ; bandeau = {t, texte}

// [camp][ligne] = {t, pseudo, n} ; bandeau = {t, texte}
/** Clears the per-round gift feedback. */
export function oublierCadeaux() {
  retourCadeaux = [[], []];
  bandeauCadeau = [null, null];
}

export function noterCadeau(i, valeur, pseudo, n, avatar) {
  const k =
    valeur >= VIE_COUT
      ? 4
      : valeur >= BOUCLIER_COUT
        ? 3
        : valeur >= COUPE_COUT
          ? 2
          : valeur >= TEMPO_COUT
            ? 1
            : 0;
  const r = retourCadeaux[i][k] || (retourCadeaux[i][k] = { t: -9, pseudo: '', n: 0 });
  r.t = t;
  r.pseudo = String(pseudo || '');
  r.n += Math.max(1, n || 1);
  const c = CADEAUX_DUEL[i === 0 ? 'or' : 'ombre'][k];
  const premier = !!(r.pseudo && !dejaDonne[r.pseudo]);
  if (r.pseudo) {
    dejaDonne[r.pseudo] = 1;
    const dm =
      donsManche[r.pseudo] || (donsManche[r.pseudo] = { camp: i === 0 ? 'or' : 'ombre', total: 0 });
    dm.total += (valeur || 0) * Math.max(1, n || 1);
    dm.camp = i === 0 ? 'or' : 'ombre';
  }
  if (r.pseudo && donsManche[r.pseudo] && avatar) donsManche[r.pseudo].avatar = avatar;
  if (c)
    annoncer({
      genre: 'cadeau',
      pseudo: r.pseudo,
      avatar,
      texte: dire(premier ? 'premier' : 'cadeau', {
        c: nomCamp(i === 0 ? 'or' : 'ombre'),
        q: DONS[k] || c.effet,
      }),
      camp: i === 0 ? 'or' : 'ombre',
      effet: EFFET_LABEL[c.effet],
    });
  bandeauCadeau[i] = {
    t,
    texte:
      (r.pseudo && reglages.nomsDonateurs !== false ? r.pseudo + '  >  ' : '') + (c ? c.effet : ''),
  };
}
