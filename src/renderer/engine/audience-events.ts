// Audience events: turns gifts, likes, joins and viewer milestones from the live bridges into
// board effects for the team they back.

import type { AudienceEvent, Body, Round } from './types.ts';
import {
  VIEWER_THRESHOLDS,
  addAnnouncement,
  phrase,
  announceLikes,
  seenThresholds,
} from './announcements.ts';
import { countEvents } from './crowd.ts';
import { addLikes } from './crowd-energy.ts';
import {
  SHIELD_COST,
  SHIELD_DURATION,
  CUT_COST,
  BOOST_COST,
  BOOST_DURATION,
  LIFE_COST,
  cutLength,
} from './rules.ts';
import { recordGift } from './gift-feedback.ts';
import { launchFan, welcomeFan } from './fan-rings.ts';
import {
  loadBody,
  bodies,
  cutDuel,
  burst,
  round,
  px,
  storeBody,
  plantSeedFor,
  plantWelcomeBerry,
  snake,
} from '../scripts/game.ts';

// Entry point for every audience event (gifts, likes, joins, viewer counts) from the live bridges.
export function receiveEvent(ev: AudienceEvent | null | undefined): number {
  const e = ev ?? {},
    n = Math.max(1, Math.min(parseInt(String((e as AudienceEvent).n ?? 1)) || 1, 20));
  const typedBodies: Body[] = bodies;
  const typedRound: Round | null = round;
  if ((e as AudienceEvent).type === 'viewers') {
    const tot = parseInt(String((e as AudienceEvent).total ?? 0)) || 0;
    let highestTier = 0;
    for (const pl of VIEWER_THRESHOLDS) {
      if (tot >= pl && !seenThresholds[pl]) {
        seenThresholds[pl] = 1;
        highestTier = pl;
      }
    }
    if (highestTier)
      addAnnouncement({ kind: 'tier', nickname: '', text: phrase('tier', { n: highestTier }) });
    return 0;
  }
  const type = (e as AudienceEvent).type;
  if (type === 'join' || type === 'share' || type === 'follow') {
    if (type === 'join') {
      const welcome = plantWelcomeBerry((e as AudienceEvent).nickname ?? '');
      if (welcome) welcomeFan(welcome, (e as AudienceEvent).avatar);
    }
    addAnnouncement({
      kind: type,
      nickname: (e as AudienceEvent).nickname ?? '',
      avatar: (e as AudienceEvent).avatar,
      text: phrase(type),
    });
    return 0;
  }
  if (type === 'like') addLikes(n, (e as AudienceEvent).nickname, (e as AudienceEvent).avatar);
  if (type === 'like' && (e as AudienceEvent).nickname)
    announceLikes((e as AudienceEvent).nickname ?? '', (e as AudienceEvent).avatar, n);
  // Team: explicit from the control room, or inferred from the TikTok gift name: 'rose' -> gold,
  // any other gift -> shadow. No team and no name: random draw (simulated audience).
  const ev_ = e as AudienceEvent;
  const giftName = (ev_.name ?? ev_.gift ?? '').toLowerCase();
  // Red rose ('rose') -> gold; white rose (TikTok calls it 'Rosa' or 'white rose') -> shadow.
  // At 10 coins any name containing 'rose' -> gold.
  const v = ev_.value ?? 0;
  // Gold team gifts by name: rose (10), donut (30); everything else (Dyno, Capybara...) is shadow.
  const isGoldGift =
    v >= BOOST_COST
      ? /rose|bouquet|bagel|donut|doughnut|teddy|bear/.test(giftName)
      : /^rose( rouge| red)?$/.test(giftName.trim());
  const i =
    ev_.team === 'shadow'
      ? 1
      : ev_.team === 'gold'
        ? 0
        : giftName
          ? isGoldGift
            ? 0
            : 1
          : Math.random() < 0.5
            ? 0
            : 1;
  countEvents(ev_.type === 'gift' ? n * 3 : n);
  // Likes no longer grant a speed boost. They still count toward cadence (above), nothing else.
  if (ev_.type === 'like') return 0;
  if (ev_.type === 'gift') {
    recordGift(i, ev_.value ?? 0, ev_.nickname, n, ev_.avatar);
    launchFan(i, ev_.nickname, ev_.avatar, ev_.value ?? 0);
    if ((ev_.value ?? 0) >= LIFE_COST) {
      // life: when a cut would kill the snake, it survives at 3 segments instead
      const prevLives = typedBodies[i]?.lives ?? 0;
      const bodyI = typedBodies[i];
      if (bodyI) {
        bodyI.lives += n;
        bodyI.lifeBy = ev_.nickname ?? '';
        bodyI.lifeAvatar = ev_.avatar;
      }
      loadBody(i);
      const snakeArr = snake as { x: number; y: number }[];
      if (snakeArr.length) {
        const h = snakeArr[0];
        if (h) {
          const headPos = px(h.x, h.y);
          burst(headPos.x, headPos.y, 18, 'neutral-burst', undefined);
        }
      }
      storeBody();
      loadBody(0); // life: red burst, like a heart
      return (typedBodies[i]?.lives ?? 0) - prevLives;
    }
    if ((ev_.value ?? 0) >= SHIELD_COST) {
      // shield: SHIELD_DURATION seconds of immunity to cuts and collisions
      const bodyI = typedBodies[i];
      if (bodyI) {
        bodyI.shieldTime += SHIELD_DURATION * n;
        bodyI.shieldBy = ev_.nickname ?? '';
        bodyI.shieldAvatar = ev_.avatar;
      }
      loadBody(i);
      const snakeArr = snake as { x: number; y: number }[];
      if (snakeArr.length) {
        const h = snakeArr[0];
        if (h) {
          const headPos = px(h.x, h.y);
          burst(headPos.x, headPos.y, 18, 'shell', undefined);
        }
      }
      storeBody();
      loadBody(0);
      return n;
    }
    if ((ev_.value ?? 0) >= BOOST_COST && (ev_.value ?? 0) < CUT_COST) {
      // paid boost: BOOST_DURATION seconds of speed on its snake, stackable
      const bodyI = typedBodies[i];
      if (bodyI) bodyI.boostTime += BOOST_DURATION * n;
      loadBody(i);
      const snakeArr = snake as { x: number; y: number }[];
      if (snakeArr.length) {
        const h = snakeArr[0];
        if (h) {
          const headPos = px(h.x, h.y);
          burst(headPos.x, headPos.y, 16, 'shell', undefined);
        }
      }
      storeBody();
      loadBody(0);
      return n;
    }
    if ((ev_.value ?? 0) >= CUT_COST) {
      // cut: 15% of the rival's length, applied n times
      let total = 0;
      for (let q = 0; q < n; q++) {
        if (typedRound?.state !== 'playing') break;
        total += cutDuel(1 - i, cutLength(typedBodies[1 - i]?.snake.length ?? 0), i);
      }
      loadBody(0);
      return total;
    }
    // cheap gift: plant n berries for team i
    let placed = 0;
    for (let q = 0; q < n; q++) placed += plantSeedFor(i, ev_.nickname ?? '');
    loadBody(0);
    return placed;
  }
  // comment/share: cadence only
  return 0;
}
