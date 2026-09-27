/**
 * Segmented control: a radio group of options. Arrow keys move focus between options; Space or
 * Enter applies the focused one, so moving through the group never sends anything by accident.
 */
import type { Option, SettingValue } from '../../model.ts';
import type { SlotStatus } from '../../pending.ts';
import { applyReason, h, reasonHolder, setAttr, setClass, uid } from '../dom.ts';
import { createSettingStatus } from './setting-status.ts';

export interface SegmentedOptions<T extends SettingValue> {
  readonly label: string;
  readonly options: readonly Option<T>[];
  readonly onSelect: (value: T) => void;
  readonly onRetry?: () => void;
  /** Options styled as dangerous, e.g. a display meant for off-stream tests only. */
  readonly danger?: readonly T[];
  readonly caption?: string;
}

export interface SegmentedVm {
  readonly value: SettingValue | undefined;
  readonly status?: SlotStatus;
  readonly verifiable?: boolean;
  readonly reason?: string | null;
  /** An option being armed for confirmation, if any. */
  readonly armedValue?: SettingValue;
}

export interface SegmentedView {
  readonly el: HTMLElement;
  update(vm: SegmentedVm): void;
}

export function createSegmented<T extends SettingValue>(
  options: SegmentedOptions<T>,
): SegmentedView {
  const labelId = uid('seg');
  const status = createSettingStatus(() => options.onRetry?.());
  const holder = reasonHolder();
  const buttons = options.options.map((option) => {
    const button = h('button', {
      class: `seg__option${options.danger?.includes(option.value) ? ' seg__option--danger' : ''}`,
      text: option.label,
      attrs: { type: 'button', role: 'radio', 'aria-checked': 'false', tabindex: '-1' },
    });
    button.addEventListener('click', () => {
      options.onSelect(option.value);
    });
    return { option, button };
  });

  const group = h(
    'div',
    { class: 'seg', attrs: { role: 'radiogroup', 'aria-labelledby': labelId } },
    buttons.map(({ button }) => button),
  );
  group.addEventListener('keydown', (event) => {
    const keys: Readonly<Record<string, number>> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    const step = keys[event.key];
    if (step === undefined) return;
    const enabled = buttons.filter(({ button }) => !button.disabled);
    const index = enabled.findIndex(({ button }) => button === document.activeElement);
    const next = enabled[(index + step + enabled.length) % enabled.length];
    if (!next) return;
    event.preventDefault();
    for (const { button } of buttons) button.tabIndex = button === next.button ? 0 : -1;
    next.button.focus();
  });

  const el = h('div', { class: 'field' }, [
    h('div', { class: 'field__head' }, [
      h('span', { class: 'field__label', text: options.label, attrs: { id: labelId } }),
      status.el,
    ]),
    group,
    options.caption ? h('p', { class: 'field__caption', text: options.caption }) : null,
    holder,
  ]);

  return {
    el,
    update(vm) {
      const reason = vm.reason ?? null;
      let stop: HTMLButtonElement | undefined;
      for (const { option, button } of buttons) {
        const selected = vm.value !== undefined && option.value === vm.value;
        setAttr(button, 'aria-checked', String(selected));
        setClass(button, 'is-selected', selected);
        setClass(button, 'is-pending', selected && vm.status === 'pending');
        setClass(button, 'is-armed', vm.armedValue !== undefined && option.value === vm.armedValue);
        applyReason(button, holder, reason);
        if (selected) stop = button;
      }
      // Roving tab stop: the selected option, else the first. Left alone while focus is inside.
      if (!group.contains(document.activeElement)) {
        stop ??= buttons[0]?.button;
        for (const { button } of buttons) button.tabIndex = button === stop ? 0 : -1;
      }
      setClass(group, 'is-error', vm.status === 'error');
      status.update(vm.status ?? 'idle', vm.verifiable ?? true);
    },
  };
}
