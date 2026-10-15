/**
 * Snake Arena's control room screens: Feed's cards (feed-control/), the arena's round card in
 * place of Feed's, an Arena card for the game's tuning values, and no near-full board.
 */
import {
  ARENA_BACKING,
  ARENA_BOOST_CAPS,
  ARENA_DEFAULTS,
  ARENA_ENTRY_LIKES,
  ARENA_GIFT_BERRIES,
  ARENA_IDLE_RELEASES,
  ARENA_LIFE_KEEPS,
  ARENA_LIVES_MAX,
  ARENA_LIFE_PRICES,
  ARENA_MAX_LIVES,
  ARENA_PLACES,
  ARENA_PLAIN_AMOUNTS,
  ARENA_PILOTS,
  ARENA_PLAIN_EVERY,
  ARENA_ROUND_LENGTHS,
  ARENA_SHIELD_GIFTS,
  ARENA_QUEUE_IDLES,
  ARENA_SEAT_PRICE_MAX,
  ARENA_SPEEDS,
  ARENA_WILD_SNAKES,
  readSeatPrice,
  type ArenaBacking,
  type ArenaGiftBerries,
  type ArenaSettingName,
} from '../../shared/arena-protocol.ts';
import type { SettingValue } from '../control/model.ts';
import { createButton } from '../control/ui/components/button.ts';
import { createCard } from '../control/ui/components/card.ts';
import { createSegmented, type SegmentedView } from '../control/ui/components/segmented.ts';
import { createToggle, type ToggleView } from '../control/ui/components/toggle.ts';
import { h, setDisabled, setHidden, setText, setVar } from '../control/ui/dom.ts';
import {
  ambienceCard,
  bridgeCard,
  entrancesCard,
  giftLeadersCard,
  giftsCard,
  grantCard,
} from '../feed-control/live.ts';
import { pricingCard } from '../feed-control/money.ts';
import { createRehearsalScreen, createSetupScreen } from '../feed-control/screens.ts';
import {
  armVm,
  controlsReason,
  rehearsalReason,
  resolvePending,
  type FeedControlState,
  type FeedControlStore,
} from '../feed-control/store.ts';
import type { Dispatch, FeedRoom, FeedView, PressArm } from '../feed-control/ui.ts';
import type { ArenaSide } from './arena-state.ts';

type Reason = () => string | null;

const PHASE_LABELS: Record<'ready' | 'playing' | 'full', string> = {
  ready: 'Get ready',
  playing: 'Playing',
  full: 'End screen',
};

/** "2:05" */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/** Feed's round card without the board's fill: the round, its phase and the time it has left. */
function roundCard(dispatch: Dispatch, pressArm: PressArm, arena: ArenaSide): FeedView {
  const newRound = createButton({
    label: 'New round',
    armedLabel: 'Confirm new round',
    variant: 'primary',
    kbd: 'N',
    onPress: () => {
      pressArm('round', () => {
        dispatch({ cmd: 'round' });
      });
    },
  });
  const phase = h('p', { class: 'card__line caps' });
  const info = h('p', { class: 'card__line' });
  const time = h(
    'span',
    { class: 'meter__bar', attrs: { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100' } },
    [h('span', { class: 'meter__fill' })],
  );
  const timeLeft = h('span', { class: 'meter__value' });
  const card = createCard({ title: 'Round' }, [
    newRound.el,
    phase,
    info,
    h('div', { class: 'meter' }, [time, timeLeft]),
  ]);
  return {
    el: card.el,
    update(state) {
      newRound.update({ reason: controlsReason(state), armed: armVm(state, 'round') });
      const g = state.gameState,
        board = arena.state();
      if (!g || !board) {
        setText(phase, '');
        setText(info, 'Waiting for the game');
        setText(timeLeft, '');
        return;
      }
      setText(phase, PHASE_LABELS[g.phase]);
      setText(info, `Round ${String(g.round)}`);
      const pct = Math.round(
        Math.min(1, Math.max(0, 1 - board.secondsLeft / board.settings.roundLength)) * 100,
      );
      setVar(time, '--fill', `${String(pct)}%`);
      time.setAttribute('aria-valuenow', String(pct));
      setText(timeLeft, `${clockText(board.secondsLeft)} left`);
    },
  };
}

interface Tuning {
  readonly name: ArenaSettingName;
  readonly view: SegmentedView;
}

function tuning(
  arena: ArenaSide,
  name: ArenaSettingName,
  label: string,
  options: readonly { readonly value: SettingValue; readonly label: string }[],
  caption?: string,
): Tuning {
  const view = createSegmented<SettingValue>({
    label,
    options,
    onSelect: (value) => {
      arena.send({ cmd: 'arena-setting', name, value });
    },
    ...(caption ? { caption } : {}),
  });
  return { name, view };
}

interface Switch {
  readonly name: ArenaSettingName;
  readonly view: ToggleView;
}

function toggle(arena: ArenaSide, name: ArenaSettingName, label: string, caption?: string): Switch {
  const view = createToggle({
    label,
    onToggle: (value) => {
      arena.send({ cmd: 'arena-setting', name, value });
    },
    ...(caption ? { caption } : {}),
  });
  return { name, view };
}

const BACKING_LABELS: Record<ArenaBacking, string> = {
  off: 'Off',
  light: 'Light',
  strong: 'Strong',
};

const GIFT_BERRIES_LABELS: Record<ArenaGiftBerries, string> = {
  owner: 'Giver only',
  shared: 'Anyone can eat them',
};

/** Shows the game's values as the board last confirmed them, or as sent and still pending. */
function updateTuning(
  state: FeedControlState,
  arena: ArenaSide,
  lock: string | null,
  rows: readonly Tuning[],
  switches: readonly Switch[],
): void {
  const settings = arena.state()?.settings,
    pending = arena.pending();
  for (const { name, view } of rows) {
    const p = resolvePending(settings?.[name], pending[name], state.now);
    view.update({
      value: typeof p.value === 'number' || typeof p.value === 'string' ? p.value : undefined,
      status: p.status,
      reason: lock,
    });
  }
  for (const { name, view } of switches) {
    const p = resolvePending(settings?.[name], pending[name], state.now);
    view.update({ on: p.value === true, status: p.status, reason: lock });
  }
}

/** The game's tuning values. They apply at once, the round length from the next round. */
export function arenaCard(arena: ArenaSide, reason: Reason): FeedView {
  const rows: Tuning[] = [
    tuning(
      arena,
      'places',
      'Snakes on the board',
      ARENA_PLACES.map((value) => ({ value, label: String(value) })),
    ),
    tuning(
      arena,
      'entryLikes',
      'Likes for a speed boost',
      ARENA_ENTRY_LIKES.map((value) => ({ value, label: String(value) })),
      "A player's likes fill the ring on their chip under the board. In continuous play a full ring gives 2 s of speed; otherwise 4 s of speed and 3 cells of length.",
    ),
    tuning(
      arena,
      'boostCap',
      'Likes boost, at most',
      ARENA_BOOST_CAPS.map((value) => ({ value, label: `${String(value)} s` })),
    ),
    tuning(
      arena,
      'shieldGift',
      'A shield for a gift of',
      ARENA_SHIELD_GIFTS.map((value) => ({
        value,
        label: value === 0 ? 'Never' : `${String(value)} berries`,
      })),
    ),
    tuning(
      arena,
      'roundLength',
      'Round length',
      ARENA_ROUND_LENGTHS.map((value) => ({ value, label: `${String(value / 60)} min` })),
      'Applies from the next round.',
    ),
    tuning(
      arena,
      'giftBerries',
      "A gift's berries",
      ARENA_GIFT_BERRIES.map((value) => ({ value, label: GIFT_BERRIES_LABELS[value] })),
    ),
    tuning(
      arena,
      'plainAmount',
      'Plain berries on the board',
      ARENA_PLAIN_AMOUNTS.map((value) => ({ value, label: value === 0 ? 'None' : String(value) })),
      'In the battle the flower keeps this many plain berries on the board, for every snake.',
    ),
    tuning(
      arena,
      'plainEvery',
      'Plain berry delay',
      ARENA_PLAIN_EVERY.map((value) => ({ value, label: `${String(value)} s` })),
      'Seconds before the flower drops a new one after one is eaten.',
    ),
    tuning(
      arena,
      'livesMax',
      'Lives at most',
      ARENA_LIVES_MAX.map((value) => ({ value, label: String(value) })),
      'In continuous play each gift gives one life, up to this many. A life takes a crash for the snake.',
    ),
    tuning(
      arena,
      'idleRelease',
      'Free snake back after',
      ARENA_IDLE_RELEASES.map((value) => ({ value, label: `${String(value)} s` })),
      'In continuous play, a player with no life left who stops liking gives their snake back to the computer.',
    ),
    tuning(
      arena,
      'wildSnakes',
      'Wild snakes while few play',
      ARENA_WILD_SNAKES.map((value) => ({
        value,
        label: value === 0 ? 'Off' : `Up to ${String(value)}`,
      })),
    ),
    tuning(
      arena,
      'speed',
      'Snake speed',
      ARENA_SPEEDS.map((value) => ({ value, label: `${String(value)} cells/s` })),
    ),
    tuning(
      arena,
      'queueIdle',
      "In the qualifying, a liker's animal leaves after",
      ARENA_QUEUE_IDLES.map((value) => ({ value, label: `${String(value)} s without a like` })),
    ),
    tuning(
      arena,
      'pilot',
      'Pilot snakes',
      ARENA_PILOTS.map((value) => ({ value, label: value === 0 ? 'None' : String(value) })),
      "The game's own players show how it works, each under the picture and name of one of the top 20 supporters, picked at random each round.",
    ),
    tuning(
      arena,
      'backing',
      'Gifts make a snake smarter and safer',
      ARENA_BACKING.map((value) => ({ value, label: BACKING_LABELS[value] })),
      'Backed snakes look further ahead and are chased less; likes-only ones play the basic brain.',
    ),
  ];
  const switches: Switch[] = [
    toggle(
      arena,
      'continuous',
      'Continuous play',
      'The board always plays: a like takes a free snake, a round starts again right after its end screen. Off: the qualifying, the eggs and the 3, 2, 1. Applies from the next round.',
    ),
    toggle(arena, 'likeBoost', 'Likes speed up the snake'),
    toggle(
      arena,
      'likeHeart',
      'Heart on like counts',
      "In the qualifying, the heart before each seat's and challenger's number of likes.",
    ),
    toggle(
      arena,
      'superAI',
      'Super AI',
      'The best-backed snakes play the strongest brain: they never box themselves in.',
    ),
  ];
  const status = h('p', { class: 'card__line' });
  const card = createCard({ title: 'Arena' }, [
    ...rows.map((r) => r.view.el),
    ...switches.map((w) => w.view.el),
    status,
  ]);
  return {
    el: card.el,
    update(state) {
      updateTuning(state, arena, reason(), rows, switches);
      const board = arena.state(),
        snakes = board?.snakes;
      setText(
        status,
        snakes
          ? `On the board: ${String(snakes.viewers)} viewers, ${String(snakes.wild)} wild${snakes.pilot ? ', pilots' : ''} · ${String(board.trapped ?? 0)} boxed in by their own body this round`
          : '',
      );
    },
  };
}

/** Continuous play, as the board last confirmed it or as sent and still pending. */
function continuousOn(state: FeedControlState, arena: ArenaSide): boolean {
  const p = resolvePending(
    arena.state()?.settings.continuous,
    arena.pending().continuous,
    state.now,
  );
  return p.value === true;
}

/**
 * Gifts buy seats, as the board last confirmed it or as sent and still pending. Never in
 * continuous play: there is no seat to buy.
 */
function giftSeatsOn(state: FeedControlState, arena: ArenaSide): boolean {
  const p = resolvePending(arena.state()?.settings.giftSeats, arena.pending().giftSeats, state.now);
  return p.value === true && !continuousOn(state, arena);
}

/**
 * The paid queue, read only: whoever gave outside a qualifying, first in line first, so the
 * operator can tell a viewer where they stand. The first ones (as many as there are places) play
 * the next round on paid seats. Hidden while gifts buy no seats: the queue is empty then.
 */
export function paidQueueCard(arena: ArenaSide): FeedView {
  const list = h('div', { class: 'paid-queue' });
  const card = createCard({ title: 'Paid queue' }, [
    h('p', {
      class: 'field__caption',
      text: 'Gifts outside the qualifying. Each round takes the first ones, up to the number of snakes.',
    }),
    list,
  ]);
  let shown: string | null = null;
  return {
    el: card.el,
    update(state) {
      setHidden(card.el, !giftSeatsOn(state, arena));
      const board = arena.state(),
        names = board?.paidQueue ?? [],
        places = board?.settings.places ?? 0,
        key = [String(places), ...names].join('|');
      if (key === shown) return;
      shown = key;
      list.replaceChildren(
        ...(names.length
          ? names.map((name, i) =>
              h('p', {
                class: 'card__line',
                text: `${String(i + 1)}. ${name}${i < places ? ' (next round)' : ''}`,
              }),
            )
          : [h('p', { class: 'card__line', text: 'Nobody in line' })]),
      );
    },
  };
}

/**
 * Whether gifts buy seats at all, above the seat price: off, the default, no gift buys a seat or a
 * place in the paid queue, the qualifying goes by likes alone, and the seat price waits greyed.
 * Hidden in continuous play, where it means nothing.
 */
export function giftSeatsCard(arena: ArenaSide, reason: Reason): FeedView {
  const switches: Switch[] = [
    toggle(
      arena,
      'giftSeats',
      'Gifts buy seats',
      'Off: the qualifying goes by likes alone, no gift buys a seat or a place in line, and the paid queue stays empty.',
    ),
  ];
  const card = createCard(
    { title: 'Paid seats' },
    switches.map((w) => w.view.el),
  );
  return {
    el: card.el,
    update(state) {
      setHidden(card.el, continuousOn(state, arena));
      updateTuning(state, arena, reason(), [], switches);
    },
  };
}

/**
 * The seat gift, next to the gift prices: the coin value of the one gift that buys a seat in the
 * qualifying, or a place in the paid queue outside it, typed in a field like the price rows'. That
 * gift gives no berries. 0, the default: any gift buys one. Enter or leaving the field applies it;
 * an empty or wrong entry puts the value in use back. Greyed while gifts buy no seats.
 */
export function seatCard(arena: ArenaSide, dispatch: Dispatch): FeedView {
  const coins = h('input', {
    class: 'input',
    attrs: {
      type: 'number',
      min: '0',
      max: String(ARENA_SEAT_PRICE_MAX),
      placeholder: 'coins',
      'aria-label': 'Seat price in coins',
    },
  });
  /** The value in use, or sent and still pending: what a wrong entry falls back to. */
  let last = ARENA_DEFAULTS.seatPrice,
    shown: number | null = null,
    editing = false;
  const commit = (): void => {
    const value = readSeatPrice(coins.value, last);
    editing = false;
    shown = value;
    coins.value = String(value);
    if (value === last) return;
    last = value;
    arena.send({ cmd: 'arena-setting', name: 'seatPrice', value });
  };
  coins.addEventListener('input', () => {
    editing = true;
  });
  coins.addEventListener('change', commit);
  // A rehearsal gift at this value, to see what it buys.
  const test = createButton({
    label: 'Test',
    variant: 'secondary',
    onPress: () => {
      if (last >= 1) dispatch({ cmd: 'gift', gift: 'rose', count: 1, coins: last });
    },
  });
  const status = h('p', { class: 'field__caption', attrs: { role: 'status' } });
  const clash = h('p', { class: 'card__line tone-warn' });
  const card = createCard({ title: 'Seat price' }, [
    h('p', {
      class: 'field__caption',
      text: 'Coin value of the gift that buys a seat. 0: any gift buys one.',
    }),
    h('div', { class: 'tier' }, [
      coins,
      h('span', { class: 'field__caption', text: 'coins' }),
      test.el,
    ]),
    status,
    clash,
  ]);
  return {
    el: card.el,
    update(state) {
      const settings = arena.state()?.settings,
        p = resolvePending(settings?.seatPrice, arena.pending().seatPrice, state.now),
        value = typeof p.value === 'number' ? p.value : null;
      if (value !== null) last = value;
      if (!editing && value !== null && value !== shown) {
        coins.value = String(value);
        shown = value;
      }
      const on = giftSeatsOn(state, arena);
      setDisabled(coins, controlsReason(state) !== null || !on);
      test.update({
        reason:
          rehearsalReason(state) ??
          (!on ? 'Gifts buy no seats' : last > 0 ? null : 'Any gift buys a seat'),
      });
      setText(
        status,
        !on
          ? 'Off: gifts buy no seats.'
          : p.status === 'pending'
            ? 'Sending…'
            : p.status === 'error'
              ? 'The game did not take it.'
              : editing
                ? 'Edited: Enter to apply.'
                : value === null
                  ? ''
                  : value === 0
                    ? 'In use: any gift buys a seat.'
                    : `In use: the ${String(value)}-coin gift buys a seat, and gives no berries.`,
      );
      const same =
        on &&
        value !== null &&
        value > 0 &&
        settings?.lifeOn === true &&
        settings.lifePrice === value;
      setText(
        clash,
        same ? 'The extra-life gift has the same price: that gift gives a life, not a seat.' : '',
      );
      setHidden(clash, !same);
    },
  };
}

/**
 * The extra-life gift, next to the gift prices: a gift at its price gives the giver's snake a life
 * instead of berries. Off until switched on.
 */
function lifeCard(arena: ArenaSide, reason: Reason): FeedView {
  const rows: Tuning[] = [
    tuning(
      arena,
      'lifePrice',
      'Gift that gives a life',
      ARENA_LIFE_PRICES.map((value) => ({ value, label: `${String(value)} coins` })),
      'That gift gives a life instead of berries, whatever the price list says.',
    ),
    tuning(
      arena,
      'maxLives',
      'Lives a snake can hold',
      ARENA_MAX_LIVES.map((value) => ({ value, label: String(value) })),
    ),
    tuning(
      arena,
      'lifeKeep',
      'Length kept on a life',
      ARENA_LIFE_KEEPS.map((value) => ({ value, label: `${String(Math.round(value * 100))}%` })),
    ),
  ];
  const switches: Switch[] = [toggle(arena, 'lifeOn', 'Extra-life gift')];
  const card = createCard({ title: 'Extra life' }, [
    ...switches.map((w) => w.view.el),
    ...rows.map((r) => r.view.el),
  ]);
  return {
    el: card.el,
    update(state) {
      updateTuning(state, arena, reason(), rows, switches);
    },
  };
}

function liveScreen(
  store: FeedControlStore,
  dispatch: Dispatch,
  pressArm: PressArm,
  arena: ArenaSide,
): FeedView {
  const reason: Reason = () => controlsReason(store.get());
  const views = {
    round: roundCard(dispatch, pressArm, arena),
    bridge: bridgeCard(dispatch, reason),
    leaders: giftLeadersCard(),
    gifts: giftsCard(),
    grant: grantCard(dispatch, reason),
    entrances: entrancesCard(dispatch, reason, () => rehearsalReason(store.get())),
    ambience: ambienceCard(dispatch, reason),
  };
  return {
    el: h('div', { class: 'screen screen--live' }, [
      h('div', { class: 'column column--left' }, [
        views.round.el,
        views.bridge.el,
        views.entrances.el,
      ]),
      h('div', { class: 'column column--center' }, [
        views.leaders.el,
        views.gifts.el,
        views.grant.el,
        views.ambience.el,
      ]),
    ]),
    update(state) {
      for (const view of Object.values(views)) view.update(state);
    },
  };
}

/** A screen with one more card, at its start or its end. */
function withCard(screen: FeedView, card: FeedView, first = false): FeedView {
  if (first) screen.el.prepend(card.el);
  else screen.el.append(card.el);
  return {
    el: screen.el,
    update(state) {
      screen.update(state);
      card.update(state);
    },
  };
}

/** The arena's room: Feed's tabs, the arena's Live screen, gift prices without the advisor. */
export function arenaRoom(
  store: FeedControlStore,
  dispatch: Dispatch,
  pressArm: PressArm,
  arena: ArenaSide,
): FeedRoom {
  const pricing = pricingCard(store, dispatch, { roundInfo: false }),
    giftSeats = giftSeatsCard(arena, () => controlsReason(store.get())),
    seat = seatCard(arena, dispatch),
    life = lifeCard(arena, () => controlsReason(store.get()));
  return {
    title: 'Viper Arena',
    screens: {
      live: liveScreen(store, dispatch, pressArm, arena),
      rehearsal: createRehearsalScreen(dispatch, { nearFullBoard: false }),
      // The game's own settings and its paid queue first, then Feed's.
      setup: withCard(
        withCard(
          createSetupScreen(dispatch, () => controlsReason(store.get()), {
            nearFullBoard: false,
            snakeAppearance: false,
            tabCount: 4,
          }),
          paidQueueCard(arena),
          true,
        ),
        arenaCard(arena, () => controlsReason(store.get())),
        true,
      ),
      // The gift prices, then whether gifts buy seats, then what the two special gifts buy: a
      // seat, a life.
      money: {
        el: h('div', { class: 'screen screen--money' }, [
          pricing.el,
          h('div', { class: 'column' }, [giftSeats.el, seat.el, life.el]),
        ]),
        update: (state) => {
          pricing.update(state);
          giftSeats.update(state);
          seat.update(state);
          life.update(state);
        },
      },
    },
  };
}
