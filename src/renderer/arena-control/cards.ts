/**
 * Snake Arena's control room screens: Feed's cards (feed-control/), the arena's round card in
 * place of Feed's, an Arena card for the game's tuning values, and no near-full board.
 */
import {
  ARENA_BOOST_CAPS,
  ARENA_ENTRY_LIKES,
  ARENA_GIFT_BERRIES,
  ARENA_PLACES,
  ARENA_ROUND_LENGTHS,
  ARENA_SHIELD_GIFTS,
  ARENA_WILD_SNAKES,
  type ArenaGiftBerries,
  type ArenaSettingName,
} from '../../shared/arena-protocol.ts';
import type { SettingValue } from '../control/model.ts';
import { createButton } from '../control/ui/components/button.ts';
import { createCard } from '../control/ui/components/card.ts';
import { createSegmented, type SegmentedView } from '../control/ui/components/segmented.ts';
import { h, setText, setVar } from '../control/ui/dom.ts';
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

const GIFT_BERRIES_LABELS: Record<ArenaGiftBerries, string> = {
  owner: 'Giver only',
  shared: 'Anyone can steal',
};

/** The game's tuning values. They apply at once, the round length from the next round. */
function arenaCard(arena: ArenaSide, reason: Reason): FeedView {
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
      'Likes to fill the entry ring',
      ARENA_ENTRY_LIKES.map((value) => ({ value, label: String(value) })),
    ),
    tuning(
      arena,
      'boostCap',
      'Fastest on likes',
      ARENA_BOOST_CAPS.map((value) => ({
        value,
        label: value === 1 ? 'No boost' : `x${String(value)}`,
      })),
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
      'wildSnakes',
      'Wild snakes while few play',
      ARENA_WILD_SNAKES.map((value) => ({
        value,
        label: value === 0 ? 'Off' : `Up to ${String(value)} snakes`,
      })),
      'Wild snakes keep this many on the board until enough viewers come in.',
    ),
  ];
  const card = createCard(
    { title: 'Arena' },
    rows.map((r) => r.view.el),
  );
  return {
    el: card.el,
    update(state) {
      const lock = reason(),
        settings = arena.state()?.settings,
        pending = arena.pending();
      for (const { name, view } of rows) {
        const p = resolvePending(settings?.[name], pending[name], state.now);
        view.update({
          value: typeof p.value === 'number' || typeof p.value === 'string' ? p.value : undefined,
          status: p.status,
          reason: lock,
        });
      }
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
    arena: arenaCard(arena, reason),
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
        views.arena.el,
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

/** The arena's room: Feed's tabs, the arena's Live screen, gift prices without the advisor. */
export function arenaRoom(
  store: FeedControlStore,
  dispatch: Dispatch,
  pressArm: PressArm,
  arena: ArenaSide,
): FeedRoom {
  const pricing = pricingCard(store, dispatch);
  return {
    title: 'Viper Arena',
    screens: {
      live: liveScreen(store, dispatch, pressArm, arena),
      rehearsal: createRehearsalScreen(dispatch, { nearFullBoard: false }),
      setup: createSetupScreen(dispatch, () => controlsReason(store.get()), {
        nearFullBoard: false,
      }),
      money: {
        el: h('div', { class: 'screen screen--money' }, [pricing.el]),
        update: (state) => {
          pricing.update(state);
        },
      },
    },
  };
}
