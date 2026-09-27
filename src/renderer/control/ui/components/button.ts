/** Action button: primary, secondary, danger or ghost, with a key hint and arm-confirm support. */
import type { ArmVm } from '../../view-models/controls.ts';
import { applyReason, h, reasonHolder, setAttr, setClass, setText, setVar } from '../dom.ts';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonTone = 'gold' | 'shadow' | 'accent';

export interface ButtonOptions {
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly tone?: ButtonTone;
  readonly kbd?: string;
  /** Label while armed, e.g. "Confirm new round". */
  readonly armedLabel?: string;
  readonly onPress: () => void;
}

export interface ButtonVm {
  readonly reason?: string | null;
  readonly armed?: ArmVm;
  readonly active?: boolean;
  readonly label?: string;
}

export interface ButtonView {
  readonly el: HTMLElement;
  readonly button: HTMLButtonElement;
  update(vm: ButtonVm): void;
}

export function createButton(options: ButtonOptions): ButtonView {
  const variant = options.variant ?? 'secondary';
  const label = h('span', { class: 'btn__label', text: options.label });
  const kbd = options.kbd
    ? h('kbd', { class: 'kbd', text: options.kbd, attrs: { 'aria-hidden': 'true' } })
    : null;
  const button = h(
    'button',
    {
      class: `btn btn--${variant}${options.tone ? ` tone-${options.tone}` : ''}`,
      attrs: { type: 'button', ...(options.kbd ? { 'aria-keyshortcuts': options.kbd } : {}) },
    },
    [label, kbd, h('span', { class: 'btn__ring', attrs: { 'aria-hidden': 'true' } })],
  );
  button.addEventListener('click', options.onPress);
  const holder = reasonHolder();
  const el = h('span', { class: 'btn-wrap' }, [button, holder]);

  return {
    el,
    button,
    update(vm) {
      applyReason(button, holder, vm.reason ?? null);
      const armed = vm.armed?.armed === true;
      setClass(button, 'is-armed', armed);
      setVar(button, '--arm', (vm.armed?.fraction ?? 0).toFixed(3));
      setText(
        label,
        armed && options.armedLabel ? options.armedLabel : (vm.label ?? options.label),
      );
      setClass(button, 'is-active', vm.active === true);
      if (vm.active !== undefined) setAttr(button, 'aria-pressed', String(vm.active));
    },
  };
}
