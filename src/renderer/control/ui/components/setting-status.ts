/**
 * The small status marker next to a setting: pending while the game has not echoed the value,
 * a retry button when it did not apply, a hollow dot when the game never reports the value.
 */
import type { SlotStatus } from '../../pending.ts';
import { h, setAttr, setHidden, setText } from '../dom.ts';

export const UNVERIFIED_HINT = 'Sent, the game does not report this value';

export interface SettingStatusView {
  readonly el: HTMLElement;
  /** `verifiable` false shows the hollow dot whatever the status. */
  update(status: SlotStatus, verifiable: boolean): void;
}

export function createSettingStatus(onRetry: () => void): SettingStatusView {
  const pending = h('span', { class: 'status-mark status-mark--pending', text: 'sending' });
  const retry = h('button', {
    class: 'status-mark status-mark--error',
    text: 'Not applied, retry',
    attrs: { type: 'button' },
  });
  retry.addEventListener('click', onRetry);
  const unverified = h('span', {
    class: 'status-mark status-mark--unverified',
    attrs: { title: UNVERIFIED_HINT, role: 'img', 'aria-label': UNVERIFIED_HINT },
  });
  const el = h('span', { class: 'setting-status', attrs: { 'aria-live': 'polite' } }, [
    pending,
    retry,
    unverified,
  ]);
  return {
    el,
    update(status, verifiable) {
      setHidden(pending, status !== 'pending');
      setHidden(retry, status !== 'error');
      setHidden(unverified, verifiable);
      setAttr(el, 'data-status', status);
      setText(pending, status === 'pending' ? 'sending' : '');
    },
  };
}
