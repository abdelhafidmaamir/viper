/** Admin tab: prototype variants, ambience and diagnostics. */
import type { Controller } from '../../controller.ts';
import {
  BANNERS,
  GIFT_FEEDBACK,
  HOURS,
  RANKINGS,
  WEATHERS,
  nearestHour,
  type Option,
  type VerifiedSetting,
} from '../../model.ts';
import { armVm, locksVm, settingVm } from '../../view-models/controls.ts';
import { createCard } from '../components/card.ts';
import { createSegmented, type SegmentedView } from '../components/segmented.ts';
import { createToggle } from '../components/toggle.ts';
import { h } from '../dom.ts';
import type { View } from '../view.ts';

function choice(
  controller: Controller,
  name: VerifiedSetting,
  label: string,
  options: readonly Option<string>[],
): { readonly name: VerifiedSetting; readonly view: SegmentedView } {
  return {
    name,
    view: createSegmented({
      label,
      options,
      onSelect: (value) => {
        controller.select(name, value);
      },
      onRetry: () => {
        controller.retry(name);
      },
    }),
  };
}

export function createAdminScreen(controller: Controller): View {
  const choices = [
    choice(controller, 'giftFeedback', 'Gift feedback', GIFT_FEEDBACK),
    choice(controller, 'banner', 'Activity banner', BANNERS),
    choice(controller, 'ranking', 'End screen ranking', RANKINGS),
    choice(controller, 'weather', 'Weather', WEATHERS),
  ];
  const [feedback, banner, ranking, weather] = choices.map((entry) => entry.view);
  const hour = createSegmented({
    label: 'Time of day',
    options: HOURS,
    onSelect: (value) => {
      controller.select('hour', value);
    },
    onRetry: () => {
      controller.retry('hour');
    },
  });
  const autoAmbience = createToggle({
    label: 'Auto ambience per round',
    caption: 'Draws a weather and time of day at each new round.',
    onToggle: (next) => {
      controller.toggle('autoAmbience', next);
    },
    onRetry: () => {
      controller.retry('autoAmbience');
    },
  });
  const aiDebug = createToggle({
    label: 'Debug overlay on the board',
    caption: 'Target path, view rays, scored moves. Turn off before going live.',
    onToggle: (next) => {
      controller.toggle('aiDebug', next);
    },
    onRetry: () => {
      controller.retry('aiDebug');
    },
  });

  const cards = [
    createCard(
      {
        title: 'Gift feedback prototype',
        collapsible: true,
        help: 'G1 lit row, donor and draining bar. G2 ring around the image. G3 counter badge. G4 donor banner above.',
      },
      feedback ? [feedback.el] : [],
    ),
    createCard(
      { title: 'Activity banner prototype', collapsible: true },
      banner ? [banner.el] : [],
    ),
    createCard(
      {
        title: 'End screen ranking',
        collapsible: true,
        help: 'Test it from Rehearsal: six gifts, then the end of the round.',
      },
      ranking ? [ranking.el] : [],
    ),
    createCard({ title: 'Ambience', collapsible: true }, [
      ...(weather ? [weather.el] : []),
      hour.el,
      autoAmbience.el,
    ]),
    createCard({ title: 'Diagnostics', collapsible: true }, [aiDebug.el]),
  ];

  return {
    el: h(
      'div',
      { class: 'screen screen--grid' },
      cards.map((card) => card.el),
    ),
    update(state) {
      const reason = locksVm(state).linkLock;
      for (const entry of choices) {
        const setting = settingVm(state, entry.name);
        entry.view.update({ value: setting.value, status: setting.status, reason });
      }
      const h0 = settingVm(state, 'hour');
      const hourValue = typeof h0.value === 'number' ? nearestHour(h0.value) : undefined;
      hour.update({ value: hourValue, status: h0.status, reason });
      const auto = settingVm(state, 'autoAmbience');
      autoAmbience.update({ on: auto.value === true, status: auto.status, reason });
      const debug = settingVm(state, 'aiDebug');
      aiDebug.update({
        on: debug.value === true,
        status: debug.status,
        reason,
        armed: armVm(state, 'ai-debug-on').armed,
        armedLabel: 'Confirm: overlay shows on stream',
      });
    },
  };
}
