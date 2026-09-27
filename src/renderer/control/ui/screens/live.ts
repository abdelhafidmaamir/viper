/** Live tab: round and link on the left, the director's levers in the center. */
import type { Controller } from '../../controller.ts';
import { WEATHERS } from '../../model.ts';
import type { ControlState } from '../../store.ts';
import { armVm, locksVm, settingVm } from '../../view-models/controls.ts';
import { sceneCardVm, type Badge } from '../../view-models/director.ts';
import { bridgePill, winnerText } from '../../view-models/status.ts';
import { createButton } from '../components/button.ts';
import { createCard, createPill } from '../components/card.ts';
import { createSceneButton } from '../components/scene-button.ts';
import { createSegmented } from '../components/segmented.ts';
import { createAdvantageSlider } from '../components/slider.ts';
import { createToggle } from '../components/toggle.ts';
import { h, setHidden, setText } from '../dom.ts';
import type { View } from '../view.ts';

function renderBadges(container: HTMLElement, badges: readonly Badge[]): void {
  const key = badges.map((badge) => `${badge.tone}:${badge.text}`).join('|');
  if (container.dataset.key === key) return;
  container.dataset.key = key;
  container.replaceChildren(
    ...(badges.length === 0
      ? [h('span', { class: 'muted', text: 'none' })]
      : badges.map((badge) =>
          h('span', { class: `badge badge--${badge.tone}`, text: badge.text }),
        )),
  );
}

function roundCard(controller: Controller): View {
  const button = createButton({
    label: 'New round',
    armedLabel: 'Confirm new round',
    variant: 'primary',
    kbd: 'N',
    onPress: () => {
      controller.round();
    },
  });
  const status = h('p', { class: 'card__line' });
  const card = createCard(
    { title: 'Round', help: 'Starts a new duel. The advantage resets to neutral each round.' },
    [button.el, status],
  );
  return {
    el: card.el,
    update(state) {
      button.update({ reason: locksVm(state).linkLock, armed: armVm(state, 'round') });
      const duel = state.game?.duel ?? null;
      setText(status, duel ? (winnerText(duel.winner) ?? 'Round in play') : 'No duel running');
    },
  };
}

function bridgeCard(controller: Controller): View {
  const pill = createPill();
  const url = h('p', { class: 'card__line mono' });
  const last = h('p', { class: 'card__line' });
  const counts = h('p', { class: 'card__line' });
  const error = h('p', { class: 'card__line tone-danger', attrs: { role: 'alert' } });
  const connect = createButton({
    label: 'Connect',
    variant: 'primary',
    onPress: () => {
      controller.bridgeStart();
    },
  });
  const disconnect = createButton({
    label: 'Disconnect',
    armedLabel: 'Confirm disconnect',
    variant: 'danger',
    onPress: () => {
      controller.bridgeStop();
    },
  });
  const card = createCard(
    {
      title: 'TikFinity',
      help: 'Live gifts arrive through TikFinity. The URL is edited in Setup.',
    },
    [url, last, counts, error, h('div', { class: 'row' }, [connect.el, disconnect.el])],
  );
  card.aside.append(pill.el);
  return {
    el: card.el,
    update(state) {
      const { bridge } = state;
      const lock = locksVm(state).linkLock;
      pill.update(bridgePill(state));
      setText(url, bridge.url || state.ui.bridgeUrl);
      setText(last, bridge.last ? `Last: ${bridge.last}` : 'Last: waiting for an event');
      setText(
        counts,
        `${bridge.events.toLocaleString('en-US')} events, ${bridge.gifts.toLocaleString('en-US')} gifts`,
      );
      setText(error, bridge.error ? `Error: ${bridge.error}` : '');
      setHidden(error, !bridge.error);
      connect.update({ reason: lock ?? (bridge.connected ? 'Already connected' : null) });
      disconnect.update({
        reason: lock ?? (bridge.connected ? null : 'Not connected'),
        armed: armVm(state, 'bridge-stop'),
      });
    },
  };
}

function scenesCard(controller: Controller, initial: ControlState): View {
  const vm0 = sceneCardVm(initial);
  const buttons = vm0.buttons.map((vm) =>
    createSceneButton(vm, () => {
      controller.scene(vm.name);
    }),
  );
  const stop = createButton({
    label: 'Stop scene',
    kbd: 'Esc',
    onPress: () => {
      controller.stopScene();
    },
  });
  const status = h('p', { class: 'card__line', attrs: { role: 'status' } });
  const gold = h('span', { class: 'badges' });
  const shadow = h('span', { class: 'badges' });
  const effects = h('div', { class: 'effects' }, [
    h('span', { class: 'effects__team tone-gold', text: 'Gold' }),
    gold,
    h('span', { class: 'effects__team tone-shadow', text: 'Shadow' }),
    shadow,
  ]);
  const card = createCard(
    {
      title: 'Scenes',
      help: 'A scene forces a situation for a few seconds, invisible on screen, then hands back control. Shift with 1 to 4 replaces a running scene.',
    },
    [
      h(
        'div',
        { class: 'scene-grid' },
        buttons.map((button) => button.el),
      ),
      h('div', { class: 'row' }, [stop.el, status]),
      effects,
    ],
  );
  return {
    el: card.el,
    update(state) {
      const vm = sceneCardVm(state);
      const lock = locksVm(state).linkLock;
      vm.buttons.forEach((button, index) => buttons[index]?.update(button, lock));
      stop.update({ reason: lock ?? (vm.running ? null : 'No scene running') });
      setText(status, vm.status);
      setHidden(effects, vm.effects === null);
      renderBadges(gold, vm.effects?.gold ?? []);
      renderBadges(shadow, vm.effects?.shadow ?? []);
    },
  };
}

function advantageCard(controller: Controller): View {
  const slider = createAdvantageSlider({
    onChange: (value) => {
      controller.setAdvantage(value);
    },
    onRetry: () => {
      controller.retry('advantage');
    },
  });
  const card = createCard(
    {
      title: 'Advantage',
      help: 'Hidden nudge on AI play quality, never shown on stream. Resets to neutral at each new round. Keys: [ and ] step by 5, 0 resets.',
    },
    [slider.el],
  );
  return {
    el: card.el,
    update(state) {
      const setting = settingVm(state, 'advantage');
      slider.update({
        value: typeof setting.value === 'number' ? setting.value : 0,
        status: setting.status,
        reason: locksVm(state).linkLock,
      });
    },
  };
}

function assistCard(controller: Controller): View {
  const underdog = createToggle({
    label: 'Underdog',
    caption: 'Helps the shorter snake, invisible',
    kbd: 'U',
    onToggle: (next) => {
      controller.toggle('underdog', next);
    },
    onRetry: () => {
      controller.retry('underdog');
    },
  });
  const superAi = createToggle({
    label: 'Super AI',
    caption: 'Lookahead for both snakes, paused during a scene',
    kbd: 'S',
    onToggle: (next) => {
      controller.toggle('superAi', next);
    },
    onRetry: () => {
      controller.retry('superAi');
    },
  });
  const card = createCard({ title: 'Assist' }, [underdog.el, superAi.el]);
  return {
    el: card.el,
    update(state) {
      const reason = locksVm(state).linkLock;
      for (const [view, name] of [
        [underdog, 'underdog'],
        [superAi, 'superAi'],
      ] as const) {
        const setting = settingVm(state, name);
        view.update({ on: setting.value === true, status: setting.status, reason });
      }
    },
  };
}

function ambienceRow(controller: Controller): View {
  const weather = createSegmented({
    label: 'Weather',
    options: WEATHERS,
    onSelect: (value) => {
      controller.select('weather', value);
    },
    onRetry: () => {
      controller.retry('weather');
    },
  });
  const details = h('details', { class: 'card card--details' }, [
    h('summary', { class: 'card__title', text: 'Ambience' }),
    h('div', { class: 'card__body' }, [weather.el]),
  ]);
  return {
    el: details,
    update(state) {
      const setting = settingVm(state, 'weather');
      weather.update({
        value: setting.value,
        status: setting.status,
        reason: locksVm(state).linkLock,
      });
    },
  };
}

export function createLiveScreen(controller: Controller, initial: ControlState): View {
  const left = [roundCard(controller), bridgeCard(controller)];
  const center = initial.admin
    ? [
        scenesCard(controller, initial),
        advantageCard(controller),
        assistCard(controller),
        ambienceRow(controller),
      ]
    : [];
  const centerColumn = h('div', { class: 'column column--center' }, [
    ...center.map((view) => view.el),
    center.length === 0
      ? createCard({ title: 'Director' }, [
          h('p', {
            class: 'card__line',
            text: 'Director levers need the admin control room (?admin=1).',
          }),
        ]).el
      : null,
  ]);
  const el = h('div', { class: 'screen screen--live' }, [
    h(
      'div',
      { class: 'column column--left' },
      left.map((view) => view.el),
    ),
    centerColumn,
  ]);
  const views = [...left, ...center];
  return {
    el,
    update(state) {
      for (const view of views) view.update(state);
    },
  };
}
