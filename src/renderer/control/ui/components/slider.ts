/**
 * The advantage slider: Shadow on the left, Gold on the right, readout and reset. While dragging
 * it sends at most one value per 100 ms and commits the final one on release; the game's echo
 * never moves the thumb under the operator's pointer.
 */
import type { SlotStatus } from '../../pending.ts';
import { advantageVm, ADVANTAGE_LIMIT } from '../../view-models/director.ts';
import { applyReason, h, reasonHolder, setAttr, setClass, setText, uid } from '../dom.ts';
import { createSettingStatus } from './setting-status.ts';

export const SLIDER_THROTTLE_MS = 100;
/** After the last input, the echo waits this long before moving the thumb. */
const HANDS_OFF_MS = 600;

export interface SliderOptions {
  readonly onChange: (value: number) => void;
  readonly onRetry: () => void;
}

export interface SliderVm {
  readonly value: number;
  readonly status: SlotStatus;
  readonly reason: string | null;
}

export interface SliderView {
  readonly el: HTMLElement;
  update(vm: SliderVm): void;
}

export function createAdvantageSlider(options: SliderOptions): SliderView {
  const labelId = uid('slider');
  const input = h('input', {
    class: 'range',
    attrs: {
      type: 'range',
      min: String(-ADVANTAGE_LIMIT),
      max: String(ADVANTAGE_LIMIT),
      step: '5',
      value: '0',
      'aria-labelledby': labelId,
      'aria-keyshortcuts': '[ ] 0',
    },
  });
  const readout = h('output', { class: 'readout', text: 'Neutral' });
  const reset = h('button', {
    class: 'btn btn--ghost btn--small',
    text: 'Reset',
    attrs: { type: 'button' },
  });
  const status = createSettingStatus(options.onRetry);
  const holder = reasonHolder();

  let dragging = false;
  let lastInputAt = 0;
  let lastSentAt = 0;
  let trailing: ReturnType<typeof setTimeout> | undefined;

  const show = (value: number): void => {
    const vm = advantageVm(value);
    setText(readout, vm.text);
    setAttr(input, 'aria-valuetext', vm.valueText);
    setClass(readout, 'tone-gold', vm.leaning === 'gold');
    setClass(readout, 'tone-shadow', vm.leaning === 'shadow');
  };
  const send = (): void => {
    clearTimeout(trailing);
    trailing = undefined;
    lastSentAt = performance.now();
    options.onChange(Number(input.value));
  };

  input.addEventListener('pointerdown', () => {
    dragging = true;
  });
  input.addEventListener('input', () => {
    lastInputAt = performance.now();
    show(Number(input.value));
    const wait = SLIDER_THROTTLE_MS - (lastInputAt - lastSentAt);
    if (wait <= 0) send();
    else trailing ??= setTimeout(send, wait);
  });
  input.addEventListener('change', () => {
    dragging = false;
    send();
  });
  reset.addEventListener('click', () => {
    input.value = '0';
    show(0);
    send();
  });

  const el = h('div', { class: 'field' }, [
    h('div', { class: 'field__head' }, [
      h('span', { class: 'field__label', text: 'Advantage', attrs: { id: labelId } }),
      status.el,
    ]),
    h('div', { class: 'slider' }, [
      h('span', { class: 'slider__end tone-shadow', text: 'Shadow' }),
      input,
      h('span', { class: 'slider__end tone-gold', text: 'Gold' }),
    ]),
    h('div', { class: 'slider__foot' }, [readout, reset]),
    holder,
  ]);

  return {
    el,
    update(vm) {
      applyReason(input, holder, vm.reason);
      reset.disabled = vm.reason !== null;
      status.update(vm.status, true);
      const handsOn = dragging || performance.now() - lastInputAt < HANDS_OFF_MS;
      if (handsOn || trailing !== undefined) return;
      if (Number(input.value) !== vm.value) input.value = String(vm.value);
      show(vm.value);
    },
  };
}
