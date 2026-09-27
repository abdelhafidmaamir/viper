/** Rehearsal tab: exercise every visual without TikFinity. Everything here is locked ON AIR. */
import type { Controller } from '../../controller.ts';
import {
  DENSITY_LEVELS,
  GIFTS,
  TEST_EVENTS,
  type CrowdMode,
  type Option,
  type TestEventId,
} from '../../model.ts';
import type { ControlState } from '../../store.ts';
import { armVm, crowdVm, locksVm } from '../../view-models/controls.ts';
import { createButton, type ButtonView } from '../components/button.ts';
import { createCard, createLockBanner, createMeter } from '../components/card.ts';
import { createSegmented } from '../components/segmented.ts';
import { h, setHidden, setText } from '../dom.ts';
import type { View } from '../view.ts';

function giftCard(controller: Controller): View {
  const lock = createLockBanner();
  const buttons: ButtonView[] = [];
  const rows = (['gold', 'shadow'] as const).map((team) => {
    const teamButtons = GIFTS.flatMap((gift, index) => {
      if (gift.team !== team) return [];
      const button = createButton({
        label: gift.label,
        tone: team,
        onPress: () => {
          controller.gift(index);
        },
      });
      buttons.push(button);
      return [button.el];
    });
    return h('div', { class: 'gift-row' }, [
      h('span', {
        class: `gift-row__team tone-${team}`,
        text: team === 'gold' ? 'Gold' : 'Shadow',
      }),
      h('div', { class: 'row row--wrap' }, teamButtons),
    ]);
  });
  const likes = createButton({
    label: 'Likes x50',
    onPress: () => {
      controller.likes();
    },
  });
  buttons.push(likes);
  const card = createCard(
    {
      title: 'Gift simulator',
      help: 'Raw TikFinity Event API messages, injected through the same path as the live WebSocket.',
    },
    [lock.el, ...rows, h('div', { class: 'row' }, [likes.el])],
  );
  return {
    el: card.el,
    update(state) {
      const reason = locksVm(state).injectionLock;
      lock.update(reason);
      for (const button of buttons) button.update({ reason });
    },
  };
}

function testEventsCard(controller: Controller): View {
  const lock = createLockBanner();
  const ids = Object.keys(TEST_EVENTS) as TestEventId[];
  const buttons = ids.map((id) =>
    createButton({
      label: TEST_EVENTS[id].label,
      onPress: () => {
        controller.testEvent(id);
      },
    }),
  );
  const ranking = createButton({
    label: 'Test end screen ranking',
    armedLabel: 'Confirm: ends the round',
    variant: 'danger',
    onPress: () => {
      controller.testRanking();
    },
  });
  const card = createCard(
    {
      title: 'Test events',
      help: 'The ranking test sends six donor gifts, then ends the round with a Shadow win 1.5 s later.',
    },
    [
      lock.el,
      h(
        'div',
        { class: 'row row--wrap' },
        buttons.map((button) => button.el),
      ),
      h('div', { class: 'row' }, [ranking.el]),
    ],
  );
  return {
    el: card.el,
    update(state) {
      const reason = locksVm(state).injectionLock;
      lock.update(reason);
      for (const button of buttons) button.update({ reason });
      ranking.update({ reason, armed: armVm(state, 'test-ranking') });
    },
  };
}

const DENSITY_OPTIONS: readonly Option<number>[] = DENSITY_LEVELS.map((level, index) => ({
  value: index,
  label: level.label,
}));

const MODE_OPTIONS: readonly Option<CrowdMode>[] = [
  { value: 'battle', label: 'Team Battle' },
  { value: 'random', label: 'Random' },
];

function crowdCard(controller: Controller): View {
  let mode: CrowdMode = 'battle';
  let density = 0;
  const lock = createLockBanner();
  const densityControl = createSegmented({
    label: 'Density',
    options: DENSITY_OPTIONS,
    onSelect: (value) => {
      controller.crowd(value, mode);
    },
  });
  const modeControl = createSegmented({
    label: 'Mode',
    options: MODE_OPTIONS,
    onSelect: (value) => {
      controller.crowd(density, value);
    },
  });
  const status = h('p', { class: 'card__line', attrs: { role: 'status' } });
  const paused = h('p', {
    class: 'notice notice--warn',
    text: 'Crowd paused: it advances only on game updates.',
  });
  const gold = createMeter('Gold', 'gold');
  const shadow = createMeter('Shadow', 'shadow');
  const teams = h('div', { class: 'meters' }, [gold.el, shadow.el]);
  const card = createCard(
    {
      title: 'Simulated crowd',
      help: 'Team Battle: two fan teams watch the match and spend like real supporters. Random: blind draws. The crowd lives in this window and stops when it closes. Its decisions appear in the event log.',
    },
    [lock.el, densityControl.el, modeControl.el, status, paused, teams],
  );
  return {
    el: card.el,
    update(state: ControlState) {
      const vm = crowdVm(state);
      mode = vm.mode;
      density = vm.density;
      const reason = locksVm(state).injectionLock;
      lock.update(reason);
      densityControl.update({ value: vm.density, reason });
      modeControl.update({ value: vm.mode, reason });
      setText(status, vm.status);
      setHidden(paused, !vm.paused);
      setHidden(teams, !vm.showTeams);
      gold.update(vm.gold.fervor, vm.gold.line);
      shadow.update(vm.shadow.fervor, vm.shadow.line);
    },
  };
}

export function createRehearsalScreen(controller: Controller): View {
  const views = [giftCard(controller), testEventsCard(controller), crowdCard(controller)];
  return {
    el: h(
      'div',
      { class: 'screen screen--grid' },
      views.map((view) => view.el),
    ),
    update(state) {
      for (const view of views) view.update(state);
    },
  };
}
