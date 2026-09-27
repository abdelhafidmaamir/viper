/** Toggle switch (`role="switch"`), with the setting's pending, error or unverified state. */
import type { SlotStatus } from '../../pending.ts';
import { applyReason, h, reasonHolder, setAttr, setClass, setText, uid } from '../dom.ts';
import { createSettingStatus } from './setting-status.ts';

export interface ToggleOptions {
  readonly label: string;
  readonly caption?: string;
  readonly kbd?: string;
  readonly onToggle: (next: boolean) => void;
  readonly onRetry?: () => void;
}

export interface ToggleVm {
  readonly on: boolean;
  readonly status?: SlotStatus;
  readonly reason?: string | null;
  readonly armed?: boolean;
  /** Replaces the label while armed, e.g. "Confirm debug overlay". */
  readonly armedLabel?: string;
}

export interface ToggleView {
  readonly el: HTMLElement;
  update(vm: ToggleVm): void;
}

export function createToggle(options: ToggleOptions): ToggleView {
  const labelId = uid('toggle');
  let on = false;
  const label = h('span', { class: 'toggle__label', text: options.label, attrs: { id: labelId } });
  const button = h(
    'button',
    {
      class: 'switch',
      attrs: {
        type: 'button',
        role: 'switch',
        'aria-checked': 'false',
        'aria-labelledby': labelId,
        ...(options.kbd ? { 'aria-keyshortcuts': options.kbd } : {}),
      },
    },
    [h('span', { class: 'switch__thumb', attrs: { 'aria-hidden': 'true' } })],
  );
  const flip = (): void => {
    if (!button.disabled) options.onToggle(!on);
  };
  button.addEventListener('click', flip);
  label.addEventListener('click', flip);
  const status = createSettingStatus(() => options.onRetry?.());
  const holder = reasonHolder();
  const el = h('div', { class: 'toggle' }, [
    button,
    h('div', { class: 'toggle__text' }, [
      h('span', { class: 'toggle__line' }, [
        label,
        options.kbd
          ? h('kbd', { class: 'kbd', text: options.kbd, attrs: { 'aria-hidden': 'true' } })
          : null,
        status.el,
      ]),
      options.caption ? h('span', { class: 'field__caption', text: options.caption }) : null,
    ]),
    holder,
  ]);

  return {
    el,
    update(vm) {
      on = vm.on;
      setAttr(button, 'aria-checked', String(vm.on));
      setClass(button, 'is-pending', vm.status === 'pending');
      setClass(button, 'is-error', vm.status === 'error');
      setClass(button, 'is-armed', vm.armed === true);
      setText(label, vm.armed && vm.armedLabel ? vm.armedLabel : options.label);
      applyReason(button, holder, vm.reason ?? null);
      setClass(el, 'is-disabled', button.disabled);
      status.update(vm.status ?? 'idle', true);
    },
  };
}
