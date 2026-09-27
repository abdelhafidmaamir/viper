/** Setup tab: what the stream looks like, set before going live. */
import type { Controller } from '../../controller.ts';
import {
  FORMATS,
  GIFT_DISPLAYS,
  PLATFORMS,
  SCROLL_HIDDEN,
  SCROLL_VISIBLE,
  type UnverifiedSetting,
} from '../../model.ts';
import type { ControlState } from '../../store.ts';
import { armVm, locksVm, settingVm } from '../../view-models/controls.ts';
import { createCard } from '../components/card.ts';
import { createSegmented } from '../components/segmented.ts';
import { createSettingStatus } from '../components/setting-status.ts';
import { createToggle } from '../components/toggle.ts';
import { applyReason, h, reasonHolder, setHidden, uid } from '../dom.ts';
import type { View } from '../view.ts';

/** A labelled select of seconds, for the scroll pattern. Unverifiable by nature. */
function secondsSelect(
  controller: Controller,
  label: string,
  name: UnverifiedSetting,
  values: readonly number[],
): View {
  const id = uid('select');
  const select = h('select', { class: 'select', attrs: { id } }, [
    h('option', { text: 'not set', attrs: { value: '' } }),
    ...values.map((value) =>
      h('option', { text: `${String(value)} s`, attrs: { value: String(value) } }),
    ),
  ]);
  select.addEventListener('change', () => {
    if (select.value !== '') controller.select(name, Number(select.value));
  });
  const status = createSettingStatus(() => undefined);
  const holder = reasonHolder();
  const el = h('div', { class: 'field field--inline' }, [
    h('label', { class: 'field__label', text: label, attrs: { for: id } }),
    select,
    status.el,
    holder,
  ]);
  return {
    el,
    update(state) {
      const setting = settingVm(state, name);
      const value = setting.value === undefined ? '' : String(setting.value);
      if (document.activeElement !== select && select.value !== value) select.value = value;
      applyReason(select, holder, locksVm(state).linkLock);
      status.update(setting.status, false);
    },
  };
}

function outputCard(controller: Controller): View {
  const platform = createSegmented({
    label: 'Platform',
    options: PLATFORMS,
    caption: 'Neutral hides the gift legend and status columns. Saved for the next launch.',
    onSelect: (value) => {
      controller.select('platform', value);
    },
    onRetry: () => {
      controller.retry('platform');
    },
  });
  const format = createSegmented({
    label: 'Image format',
    options: FORMATS,
    caption: 'Applies at the next round.',
    onSelect: (value) => {
      controller.select('format', value);
    },
  });
  const giftDisplay = createSegmented({
    label: 'Gift display',
    options: GIFT_DISPLAYS,
    danger: ['full'],
    caption: 'Scroll is live-safe. Full shows prices: off-stream tests only.',
    onSelect: (value) => {
      controller.select('giftDisplay', value);
    },
  });
  const visible = secondsSelect(controller, 'Visible', 'scrollVisible', SCROLL_VISIBLE);
  const hidden = secondsSelect(controller, 'Hidden', 'scrollHidden', SCROLL_HIDDEN);
  const pattern = h('div', { class: 'row' }, [
    h('span', { class: 'field__label', text: 'Scroll pattern' }),
    visible.el,
    hidden.el,
  ]);
  const smooth = createToggle({
    label: 'Smooth mode',
    caption: 'No blur halos. Measured: 28 fps with halos, 45 without (busy board).',
    onToggle: (next) => {
      controller.toggle('smooth', next);
    },
    onRetry: () => {
      controller.retry('smooth');
    },
  });
  const donorNames = createToggle({
    label: 'Viewer names on gifts',
    caption: 'Saved for the next launch.',
    onToggle: (next) => {
      controller.toggle('donorNames', next);
    },
    onRetry: () => {
      controller.retry('donorNames');
    },
  });
  const card = createCard({ title: 'Output', collapsible: true }, [
    platform.el,
    format.el,
    giftDisplay.el,
    pattern,
    smooth.el,
    donorNames.el,
  ]);
  return {
    el: card.el,
    update(state) {
      const reason = locksVm(state).linkLock;
      const armedPlatform = (['tiktok', 'neutral'] as const).find(
        (value) => armVm(state, `platform:${value}`).armed,
      );
      const p = settingVm(state, 'platform');
      platform.update({
        value: p.value,
        status: p.status,
        reason,
        ...(armedPlatform ? { armedValue: armedPlatform } : {}),
      });
      const f = settingVm(state, 'format');
      format.update({ value: f.value, status: f.status, verifiable: false, reason });
      const g = settingVm(state, 'giftDisplay');
      giftDisplay.update({
        value: g.value,
        status: g.status,
        verifiable: false,
        reason,
        ...(armVm(state, 'gift-display-full').armed ? { armedValue: 'full' } : {}),
      });
      setHidden(pattern, g.value !== undefined && g.value !== 'scroll');
      visible.update(state);
      hidden.update(state);
      for (const [view, name] of [
        [smooth, 'smooth'],
        [donorNames, 'donorNames'],
      ] as const) {
        const setting = settingVm(state, name);
        view.update({ on: setting.value === true, status: setting.status, reason });
      }
    },
  };
}

function bridgeUrlCard(controller: Controller, dispatchUrl: (url: string) => void): View {
  const id = uid('url');
  const input = h('input', {
    class: 'input mono',
    attrs: { id, type: 'text', spellcheck: 'false', autocomplete: 'off' },
  });
  input.addEventListener('input', () => {
    dispatchUrl(input.value);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') controller.bridgeStart();
  });
  const card = createCard(
    {
      title: 'TikFinity bridge',
      help: 'WebSocket address of the TikFinity Event API. Connect from the Live tab or press Enter here.',
      collapsible: true,
    },
    [h('label', { class: 'field__label', text: 'Bridge URL', attrs: { for: id } }), input],
  );
  return {
    el: card.el,
    update(state) {
      if (document.activeElement !== input && input.value !== state.ui.bridgeUrl) {
        input.value = state.ui.bridgeUrl;
      }
    },
  };
}

export function createSetupScreen(
  controller: Controller,
  dispatchUrl: (url: string) => void,
): View {
  const views = [outputCard(controller), bridgeUrlCard(controller, dispatchUrl)];
  return {
    el: h(
      'div',
      { class: 'screen screen--grid' },
      views.map((view) => view.el),
    ),
    update(state: ControlState) {
      for (const view of views) view.update(state);
    },
  };
}
