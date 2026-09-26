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
  giftBanner = [null, null]; // [team][line] = {t, nickname, n}; banner = {t, text}
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
  const r = giftFeedback[i][k] || (giftFeedback[i][k] = { t: -9, nickname: '', n: 0 });
  r.t = t;
  r.nickname = String(nickname || '');
  r.n += Math.max(1, n || 1);
  const c = DUEL_GIFTS[i === 0 ? 'gold' : 'shadow'][k];
  const isFirst = !!(r.nickname && !alreadyDonated[r.nickname]);
  if (r.nickname) {
    alreadyDonated[r.nickname] = 1;
    const donorRecord =
      roundDonations[r.nickname] ||
      (roundDonations[r.nickname] = { team: i === 0 ? 'gold' : 'shadow', total: 0 });
    donorRecord.total += (value || 0) * Math.max(1, n || 1);
    donorRecord.team = i === 0 ? 'gold' : 'shadow';
  }
  if (r.nickname && roundDonations[r.nickname] && avatar)
    roundDonations[r.nickname].avatar = avatar;
  if (c)
    addAnnouncement({
      kind: 'gift',
      nickname: r.nickname,
      avatar,
      text: phrase(isFirst ? 'first' : 'gift', {
        c: teamName(i === 0 ? 'gold' : 'shadow'),
        q: EFFECT_ACTIONS[k] || c.effect,
      }),
      team: i === 0 ? 'gold' : 'shadow',
      effect: EFFECT_LABEL[c.effect],
    });
  giftBanner[i] = {
    t,
    text:
      (r.nickname && settings.donorNames !== false ? r.nickname + '  >  ' : '') +
      (c ? c.effect : ''),
  };
}
