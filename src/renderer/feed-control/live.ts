/** Live screen: round, TikFinity, top gifters, and ambience cards. */
import {
  FEED_HOURS,
  FEED_WEATHERS,
  START_FILLS,
  type FeedCommand,
  type FeedWeather,
} from '../../shared/feed-protocol.ts';
import { decodeBridge } from '../control/decode.ts';
import { createButton } from '../control/ui/components/button.ts';
import { createCard } from '../control/ui/components/card.ts';
import { createSegmented } from '../control/ui/components/segmented.ts';
import { createToggle } from '../control/ui/components/toggle.ts';
import { h, setHidden, setText, setVar } from '../control/ui/dom.ts';
import {
  armVm,
  controlsReason,
  resolvePending,
  type ArmKey,
  type FeedControlStore,
} from './store.ts';
import type { FeedView } from './ui.ts';

type Dispatch = (cmd: FeedCommand) => void;
type Reason = () => string | null;

const PHASE_LABELS: Record<'ready' | 'playing' | 'full', string> = {
  ready: 'Get ready',
  playing: 'Playing',
  full: 'Board filled',
};

const WEATHER_OPTIONS = FEED_WEATHERS.map((w) => ({
  value: w,
  label: (
    {
      rain: 'Rain',
      snow: 'Snow',
      autumn: 'Autumn',
      summer: 'Summer',
      spring: 'Spring',
      storm: 'Storm',
      stars: 'Shooting stars',
      aurora: 'Aurora',
      fireflies: 'Fireflies',
      embers: 'Embers',
      mist: 'Mist',
    } as Record<FeedWeather, string>
  )[w],
}));

const HOUR_OPTIONS = [
  { value: FEED_HOURS[0], label: 'Night' },
  { value: FEED_HOURS[1], label: 'Sunrise' },
  { value: FEED_HOURS[2], label: 'Day' },
  { value: FEED_HOURS[3], label: 'Sunset' },
] as const;

const HOUR_THRESHOLD = 1 / 48;

function nearestHourPreset(hour: number): number | undefined {
  return HOUR_OPTIONS.find((o) => Math.abs(o.value - hour) < HOUR_THRESHOLD)?.value;
}

const START_OPTIONS = START_FILLS.map((value) => ({
  value,
  label: value === 0 ? 'Normal' : `${String(Math.round(value * 100))}%`,
}));

function roundCard(dispatch: Dispatch, pressArm: (k: ArmKey, f: () => void) => void): FeedView {
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
  const fill = h(
    'span',
    { class: 'meter__bar', attrs: { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100' } },
    [h('span', { class: 'meter__fill' })],
  );
  const fillPct = h('span', { class: 'meter__value' });
  const stats = h('p', { class: 'card__line' });
  // How long the snake is when a round starts; applies from the next round.
  const startLen = createSegmented({
    label: 'Start length',
    options: START_OPTIONS,
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'startFill', value });
    },
  });
  const card = createCard({ title: 'Round' }, [
    newRound.el,
    startLen.el,
    h('p', { class: 'field__caption', text: 'Applies from the next round.' }),
    phase,
    info,
    h('div', { class: 'meter' }, [fill, fillPct]),
    stats,
  ]);
  return {
    el: card.el,
    update(state) {
      const reason = controlsReason(state);
      newRound.update({ reason, armed: armVm(state, 'round') });
      const sf = resolvePending(
        state.gameState?.settings.startFill,
        state.pending.startFill,
        state.now,
      );
      startLen.update({
        value: typeof sf.value === 'number' ? sf.value : undefined,
        status: sf.status,
        reason,
      });
      const g = state.gameState;
      if (!g) {
        setText(phase, '');
        setText(info, 'Waiting for the game');
        setText(stats, '');
        return;
      }
      setText(phase, PHASE_LABELS[g.phase]);
      setText(info, `Round ${String(g.round)} · Route ${String(g.pattern)}/5`);
      const pct = Math.floor(g.fill * 100);
      setVar(fill, '--fill', `${String(pct)}%`);
      fill.setAttribute('aria-valuenow', String(pct));
      setText(fillPct, `${String(pct)}% (${String(g.cells)} / ${String(g.total)} cells)`);
      setText(
        stats,
        `${String(g.berries)} on board · ${String(g.waiting)} in flower · ${String(g.eaten)} eaten`,
      );
    },
  };
}

function bridgeCard(dispatch: Dispatch, reason: Reason): FeedView {
  const last = h('p', { class: 'card__line' });
  const error = h('p', { class: 'card__line tone-danger', attrs: { role: 'alert' } });
  const connect = createButton({
    label: 'Connect',
    variant: 'primary',
    onPress: () => {
      dispatch({ cmd: 'bridge-start' });
    },
  });
  const disconnect = createButton({
    label: 'Disconnect',
    variant: 'danger',
    onPress: () => {
      dispatch({ cmd: 'bridge-stop' });
    },
  });
  const card = createCard({ title: 'TikFinity' }, [
    last,
    error,
    h('div', { class: 'row' }, [connect.el, disconnect.el]),
  ]);
  return {
    el: card.el,
    update(state) {
      const lock = reason();
      const bridge = decodeBridge(state.gameState?.bridge);
      setText(last, bridge.last ? `Last: ${bridge.last}` : 'Waiting for an event');
      setText(error, bridge.error ? `Error: ${bridge.error}` : '');
      setHidden(error, !bridge.error);
      connect.update({ reason: lock ?? (bridge.connected ? 'Already connected' : null) });
      disconnect.update({ reason: lock ?? (bridge.connected ? null : 'Not connected') });
    },
  };
}

function giftLeadersCard(): FeedView {
  const rows: HTMLElement[] = [];
  for (let i = 0; i < 5; i++) rows.push(h('div', { class: 'card__line' }));
  const likesLine = h('p', { class: 'card__line' });
  const card = createCard({ title: 'Top gifters' }, [...rows, likesLine]);
  return {
    el: card.el,
    update(state) {
      const leaders = state.gameState?.leaders ?? [];
      const likes = state.gameState?.likes ?? 0;
      rows.forEach((row, i) => {
        const leader = leaders[i];
        if (leader) {
          setText(row, `${String(i + 1)}. ${leader.nickname}: ${String(leader.coins)} coins`);
          setHidden(row, false);
        } else if (i === 0 && leaders.length === 0) {
          setText(row, 'Nobody yet');
          setHidden(row, false);
        } else {
          setHidden(row, true);
        }
      });
      setText(likesLine, `Total likes this round: ${String(likes)}`);
    },
  };
}

function ambienceCard(dispatch: Dispatch, reason: Reason): FeedView {
  const weather = createSegmented({
    label: 'Weather',
    options: WEATHER_OPTIONS,
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'weather', value });
    },
  });
  const hour = createSegmented({
    label: 'Time of day',
    options: [...HOUR_OPTIONS],
    onSelect: (value) => {
      dispatch({ cmd: 'setting', name: 'hour', value });
    },
  });
  const autoAmbience = createToggle({
    label: 'New ambience each round',
    onToggle: (value) => {
      dispatch({ cmd: 'setting', name: 'autoAmbience', value });
    },
  });
  const card = createCard({ title: 'Ambience' }, [weather.el, hour.el, autoAmbience.el]);
  return {
    el: card.el,
    update(state) {
      const lock = reason();
      const settings = state.gameState?.settings;
      const { pending, now } = state;
      const w = resolvePending(settings?.weather, pending.weather, now);
      weather.update({ value: w.value as FeedWeather | undefined, status: w.status, reason: lock });
      const hv = resolvePending(settings?.hour, pending.hour, now);
      const hourVal = typeof hv.value === 'number' ? nearestHourPreset(hv.value) : undefined;
      hour.update({ value: hourVal, status: hv.status, reason: lock });
      const a = resolvePending(settings?.autoAmbience, pending.autoAmbience, now);
      autoAmbience.update({ on: a.value === true, status: a.status, reason: lock });
    },
  };
}

export function createLiveScreen(
  store: FeedControlStore,
  dispatch: Dispatch,
  pressArm: (k: ArmKey, f: () => void) => void,
): FeedView {
  const reason: Reason = () => controlsReason(store.get());
  const roundV = roundCard(dispatch, pressArm);
  const bridgeV = bridgeCard(dispatch, reason);
  const leadersV = giftLeadersCard();
  const ambienceV = ambienceCard(dispatch, reason);
  const all = [roundV, bridgeV, leadersV, ambienceV];
  return {
    el: h('div', { class: 'screen screen--live' }, [
      h('div', { class: 'column column--left' }, [roundV.el, bridgeV.el]),
      h('div', { class: 'column column--center' }, [leadersV.el, ambienceV.el]),
    ]),
    update(state) {
      for (const view of all) view.update(state);
    },
  };
}
