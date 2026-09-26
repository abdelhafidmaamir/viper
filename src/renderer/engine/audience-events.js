// Audience events: turns gifts, likes, joins and viewer milestones from the live bridges into
// board effects for the team they back.

import {
  VIEWER_THRESHOLDS,
  addAnnouncement,
  phrase,
  likesByViewer,
  seenThresholds,
} from './announcements.js';
import { countEvents } from './crowd.js';
import {
  SHIELD_COST,
  SHIELD_DURATION,
  CUT_COST,
  BOOST_COST,
  BOOST_DURATION,
  LIFE_COST,
  cutLength,
} from './rules.js';
import { recordGift } from './gift-feedback.js';
import {
  loadBody,
  bodies,
  cutDuel,
  burst,
  round,
  px,
  storeBody,
  plantSeedFor,
  snake,
} from '../scripts/game.js';

// Entry point for every audience event (gifts, likes, joins, viewer counts) from the live bridges.
export function receiveEvent(ev) {
  const e = ev || {},
    n = Math.max(1, Math.min(parseInt(e.n) || 1, 20));
  if (e.type === 'viewers') {
    const tot = parseInt(e.total) || 0;
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
  if (e.type === 'join' || e.type === 'share' || e.type === 'follow') {
    addAnnouncement({
      kind: e.type,
      nickname: String(e.nickname || ''),
      avatar: e.avatar,
      text: phrase(e.type),
    });
    return 0;
  }
  if (e.type === 'like' && e.nickname) {
    const liker = String(e.nickname);
    likesByViewer[liker] = (likesByViewer[liker] || 0) + n;
    if (likesByViewer[liker] >= 10) {
      addAnnouncement({
        kind: 'like',
        nickname: liker,
        avatar: e.avatar,
        text: phrase('like', { n: likesByViewer[liker] }),
      });
      likesByViewer[liker] = 0;
    }
  }
  // Team: explicit from the control room, or inferred from the TikTok gift name: 'rose' -> gold,
  // any other gift -> shadow. No team and no name: random draw (simulated audience).
  const giftName = String(e.name || e.gift || e.gift || '').toLowerCase();
  // Red rose ('rose') -> gold; white rose (TikTok calls it 'Rosa' or 'white rose') -> shadow.
  // At 10 coins any name containing 'rose' -> gold.
  const v = e.value || 0;
  // Gold team gifts by name: rose (10), donut (30); everything else (Dyno, Capybara...) is shadow.
  const isGoldGift =
    v >= BOOST_COST
      ? /rose|bouquet|bagel|donut|doughnut|teddy|bear/.test(giftName)
      : /^rose( rouge| red)?$/.test(giftName.trim());
  const i =
    e.team === 'shadow'
      ? 1
      : e.team === 'gold'
        ? 0
        : giftName
          ? isGoldGift
            ? 0
            : 1
          : Math.random() < 0.5
            ? 0
            : 1;
  countEvents(e.type === 'gift' ? n * 3 : n);
  // Likes no longer grant a speed boost. They still count toward cadence (above), nothing else.
  if (e.type === 'like') return 0;
  if (e.type === 'gift') {
    recordGift(i, e.value || 0, e.nickname, n, e.avatar);
    if ((e.value || 0) >= LIFE_COST) {
      // life: when a cut would kill the snake, it survives at 3 segments instead
      const prevLives = bodies[i].lives;
      bodies[i].lives += n;
      bodies[i].lifeBy = String(e.nickname || '');
      bodies[i].lifeAvatar = e.avatar;
      loadBody(i);
      if (snake.length) {
        const headPos = px(snake[0].x, snake[0].y);
        burst(headPos.x, headPos.y, 18, 'neutral-burst');
      }
      storeBody();
      loadBody(0); // life: red burst, like a heart
      return bodies[i].lives - prevLives;
    }
    if ((e.value || 0) >= SHIELD_COST) {
      // shield: SHIELD_DURATION seconds of immunity to cuts and collisions
      bodies[i].shieldTime += SHIELD_DURATION * n;
      bodies[i].shieldBy = String(e.nickname || '');
      bodies[i].shieldAvatar = e.avatar;
      loadBody(i);
      if (snake.length) {
        const headPos = px(snake[0].x, snake[0].y);
        burst(headPos.x, headPos.y, 18, 'shell');
      }
      storeBody();
      loadBody(0);
      return n;
    }
    if ((e.value || 0) >= BOOST_COST && (e.value || 0) < CUT_COST) {
      // paid boost: BOOST_DURATION seconds of speed on its snake, stackable
      bodies[i].boostTime += BOOST_DURATION * n;
      loadBody(i);
      if (snake.length) {
        const headPos = px(snake[0].x, snake[0].y);
        burst(headPos.x, headPos.y, 16, 'shell');
      }
      storeBody();
      loadBody(0);
      return n;
    }
    if ((e.value || 0) >= CUT_COST) {
      // cut: 15% of the rival's length, applied n times
      let total = 0;
      for (let q = 0; q < n; q++) {
        if (!(round && round.state === 'playing')) break;
        total += cutDuel(1 - i, cutLength(bodies[1 - i].snake.length), i);
      }
      loadBody(0);
      return total;
    }
    // cheap gift: plant n berries for team i
    let placed = 0;
    for (let q = 0; q < n; q++) placed += plantSeedFor(i, e.nickname);
    loadBody(0);
    return placed;
  }
  // comment/share: cadence only
  return 0;
}
