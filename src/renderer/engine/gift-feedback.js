// Gift feedback: remembers the latest donor per gift line and per team, for the legend highlight
// and the donor banner. Cleared at every round.

import {
  EFFECT_ACTIONS,
  addAnnouncement,
  alreadyDonated,
  phrase,
  roundDonations,
  teamName,
} from './announcements.js';
import { DUEL_GIFTS, EFFECT_LABEL } from './gift-panel.js';
import { SHIELD_COST, CUT_COST, BOOST_COST, LIFE_COST } from './rules.js';
import { settings, t } from '../scripts/game.js';

export let giftFeedback = [[], []],
  giftBanner = [null, null]; // [camp][ligne] = {t, pseudo, n} ; bandeau = {t, texte}

// [camp][ligne] = {t, pseudo, n} ; bandeau = {t, texte}
/** Clears the per-round gift feedback. */
export function clearGiftFeedback() {
  giftFeedback = [[], []];
  giftBanner = [null, null];
}

export function recordGift(i, value, nickname, n, avatar) {
  const k =
    value >= LIFE_COST
      ? 4
      : value >= SHIELD_COST
        ? 3
        : value >= CUT_COST
          ? 2
          : value >= BOOST_COST
            ? 1
            : 0;
  const r = giftFeedback[i][k] || (giftFeedback[i][k] = { t: -9, pseudo: '', n: 0 });
  r.t = t;
  r.pseudo = String(nickname || '');
  r.n += Math.max(1, n || 1);
  const c = DUEL_GIFTS[i === 0 ? 'or' : 'ombre'][k];
  const isFirst = !!(r.pseudo && !alreadyDonated[r.pseudo]);
  if (r.pseudo) {
    alreadyDonated[r.pseudo] = 1;
    const donorRecord =
      roundDonations[r.pseudo] ||
      (roundDonations[r.pseudo] = { camp: i === 0 ? 'or' : 'ombre', total: 0 });
    donorRecord.total += (value || 0) * Math.max(1, n || 1);
    donorRecord.camp = i === 0 ? 'or' : 'ombre';
  }
  if (r.pseudo && roundDonations[r.pseudo] && avatar) roundDonations[r.pseudo].avatar = avatar;
  if (c)
    addAnnouncement({
      genre: 'cadeau',
      pseudo: r.pseudo,
      avatar,
      texte: phrase(isFirst ? 'premier' : 'cadeau', {
        c: teamName(i === 0 ? 'or' : 'ombre'),
        q: EFFECT_ACTIONS[k] || c.effet,
      }),
      camp: i === 0 ? 'or' : 'ombre',
      effet: EFFECT_LABEL[c.effet],
    });
  giftBanner[i] = {
    t,
    texte:
      (r.pseudo && settings.nomsDonateurs !== false ? r.pseudo + '  >  ' : '') + (c ? c.effet : ''),
  };
}
