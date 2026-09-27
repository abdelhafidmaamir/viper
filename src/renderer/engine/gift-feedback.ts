// Gift feedback: remembers the latest donor per gift line and per team, for the legend highlight
// and the donor banner. Cleared at every round.

import type { DuelGift, GiftBanner, GiftFeedbackTable } from './types.ts';
import {
  EFFECT_ACTIONS,
  addAnnouncement,
  alreadyDonated,
  phrase,
  roundDonations,
  teamName,
} from './announcements.ts';
import { DUEL_GIFTS, EFFECT_LABEL } from './gift-panel.ts';
import { SHIELD_COST, CUT_COST, BOOST_COST, LIFE_COST } from './rules.ts';
import { settings, t } from '../scripts/game.ts';

export let giftFeedback: GiftFeedbackTable = [[], []],
  giftBanner: [GiftBanner | null, GiftBanner | null] = [null, null]; // [team][line] = {t, nickname, n}; banner = {t, text}
/** Clears the per-round gift feedback. */
export function clearGiftFeedback(): void {
  giftFeedback = [[], []];
  giftBanner = [null, null];
}

export function recordGift(
  i: number,
  value: number,
  nickname: string | undefined,
  n: number | undefined,
  avatar: string | undefined,
): void {
  const donated = alreadyDonated;
  const donations = roundDonations;
  // Cast DUEL_GIFTS so its elements are properly typed as DuelGift.
  const duelGifts = DUEL_GIFTS as { gold: DuelGift[]; shadow: DuelGift[] };
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
  // Access the team row from the tuple by explicit index to avoid noUncheckedIndexedAccess issues.
  const row = i === 0 ? giftFeedback[0] : giftFeedback[1];
  const r = row[k] ?? (row[k] = { t: -9, nickname: '', n: 0 });
  r.t = t;
  r.nickname = nickname ?? '';
  r.n += Math.max(1, n ?? 1);
  const c = duelGifts[i === 0 ? 'gold' : 'shadow'][k];
  const isFirst = !!(r.nickname && !donated[r.nickname]);
  if (r.nickname) {
    donated[r.nickname] = 1;
    const donorRecord =
      donations[r.nickname] ??
      (donations[r.nickname] = { team: i === 0 ? 'gold' : 'shadow', total: 0 });
    donorRecord.total += (value || 0) * Math.max(1, n ?? 1);
    donorRecord.team = i === 0 ? 'gold' : 'shadow';
  }
  if (r.nickname && avatar) {
    const donor = donations[r.nickname];
    if (donor) donor.avatar = avatar;
  }
  if (c)
    addAnnouncement({
      kind: 'gift',
      nickname: r.nickname,
      avatar,
      text: phrase(isFirst ? 'first' : 'gift', {
        c: teamName(i === 0 ? 'gold' : 'shadow'),
        q: EFFECT_ACTIONS[k] ?? c.effect,
      }),
      team: i === 0 ? 'gold' : 'shadow',
      effect: EFFECT_LABEL[c.effect],
    });
  const text =
    (r.nickname && settings.donorNames ? r.nickname + '  >  ' : '') + (c ? c.effect : '');
  if (i === 0) giftBanner[0] = { t, text };
  else giftBanner[1] = { t, text };
}
