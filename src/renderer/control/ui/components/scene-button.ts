/** Scene button: an action button with a drain gauge and a countdown while its scene runs. */
import type { SceneButtonVm } from '../../view-models/director.ts';
import { applyReason, h, reasonHolder, setAttr, setClass, setText, setVar } from '../dom.ts';

export interface SceneButtonView {
  readonly el: HTMLElement;
  update(vm: SceneButtonVm, reason: string | null): void;
}

export function createSceneButton(initial: SceneButtonVm, onPress: () => void): SceneButtonView {
  const countdown = h('span', { class: 'scene__countdown' });
  const button = h(
    'button',
    {
      class: `btn btn--secondary scene tone-${initial.tone}`,
      attrs: { type: 'button', 'aria-keyshortcuts': initial.key, 'aria-pressed': 'false' },
    },
    [
      h('span', { class: 'scene__gauge', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'btn__label', text: initial.label }),
      countdown,
      h('kbd', { class: 'kbd', text: initial.key, attrs: { 'aria-hidden': 'true' } }),
    ],
  );
  button.addEventListener('click', onPress);
  const holder = reasonHolder();
  return {
    el: h('span', { class: 'btn-wrap' }, [button, holder]),
    update(vm, reason) {
      applyReason(button, holder, reason);
      setClass(button, 'is-active', vm.active);
      setAttr(button, 'aria-pressed', String(vm.active));
      setVar(button, '--fill', vm.fraction.toFixed(3));
      setText(countdown, vm.countdown);
    },
  };
}
