/** The top status bar: always visible, read-only except the shortcut sheet button. */
import type { ControlState } from '../store.ts';
import { statusBarVm } from '../view-models/status.ts';
import { createPill } from './components/card.ts';
import { UNVERIFIED_HINT } from './components/setting-status.ts';
import { h, setAttr, setClass, setHidden, setText } from './dom.ts';

export interface StatusBarView {
  readonly el: HTMLElement;
  update(state: ControlState): void;
}

export function createStatusBar(onHelp: () => void): StatusBarView {
  const game = createPill();
  const bridge = createPill();
  const onAir = h('span', { class: 'onair', attrs: { role: 'status' } });
  const debug = h('span', {
    class: 'pill',
    text: 'DEBUG OVERLAY',
    attrs: { 'data-tone': 'danger' },
  });

  const clock = h('span', { class: 'clock__time', attrs: { 'aria-label': 'Round clock' } });
  const lastKnown = h('span', { class: 'clock__note', text: 'last known' });
  const gold = h('span', { class: 'score__value tone-gold' });
  const shadow = h('span', { class: 'score__value tone-shadow' });
  const goldSide = h('span', { class: 'score__side' }, [
    h('span', { class: 'score__team', text: 'Gold' }),
    gold,
  ]);
  const shadowSide = h('span', { class: 'score__side' }, [
    shadow,
    h('span', { class: 'score__team', text: 'Shadow' }),
  ]);
  const winner = h('span', { class: 'chip chip--winner' });
  const errors = h('span', { class: 'chip chip--errors', attrs: { role: 'status' } });
  const output = h('span', { class: 'chip__text' });
  const outputDot = h('span', {
    class: 'status-mark status-mark--unverified',
    attrs: { title: UNVERIFIED_HINT, role: 'img', 'aria-label': UNVERIFIED_HINT },
  });
  const tier = h('span', { class: 'chip__text' });
  const help = h(
    'button',
    {
      class: 'btn btn--ghost btn--small',
      attrs: { type: 'button', 'aria-keyshortcuts': '?' },
    },
    [h('kbd', { class: 'kbd', text: '?', attrs: { 'aria-hidden': 'true' } }), ' Shortcuts'],
  );
  help.addEventListener('click', onHelp);
  const modeSwitch = createModeSwitch();

  const el = h('header', { class: 'statusbar', attrs: { 'aria-label': 'Show status' } }, [
    h('div', { class: 'statusbar__group' }, [game.el, bridge.el, onAir, debug]),
    h('div', { class: 'statusbar__group statusbar__round' }, [
      h('span', { class: 'clock' }, [
        h('span', { class: 'caps', text: 'Round' }),
        clock,
        lastKnown,
      ]),
      h('span', { class: 'score', attrs: { 'aria-label': 'Rings per team' } }, [
        goldSide,
        h('span', { class: 'score__vs', text: 'vs' }),
        shadowSide,
      ]),
      winner,
      errors,
    ]),
    h('div', { class: 'statusbar__group statusbar__end' }, [
      h('span', { class: 'chip', attrs: { title: 'Platform and image format' } }, [
        output,
        outputDot,
      ]),
      h('span', { class: 'chip', attrs: { title: 'Viewer tier: not reported by the game' } }, [
        h('span', { class: 'caps', text: 'Tier' }),
        tier,
      ]),
      help,
      modeSwitch,
    ]),
  ]);

  return {
    el,
    update(state) {
      const vm = statusBarVm(state);
      game.update(vm.game);
      bridge.update(vm.bridge);
      setText(onAir, vm.onAir ? 'ON AIR' : 'REHEARSAL');
      setAttr(onAir, 'data-mode', vm.onAir ? 'live' : 'rehearsal');
      setHidden(debug, !vm.debugOverlay);
      setText(clock, vm.clock);
      setClass(lastKnown, 'is-off', !vm.lastKnown);
      setClass(el, 'is-stale', vm.lastKnown);
      setText(gold, String(vm.gold));
      setText(shadow, String(vm.shadow));
      setAttr(goldSide, 'aria-label', `Gold ${String(vm.gold)} rings`);
      setAttr(shadowSide, 'aria-label', `Shadow ${String(vm.shadow)} rings`);
      setClass(goldSide, 'is-leading', vm.leader === 'gold');
      setClass(shadowSide, 'is-leading', vm.leader === 'shadow');
      setHidden(winner, vm.winner === null);
      setText(winner, vm.winner ?? '');
      setAttr(winner, 'data-team', vm.winnerTeam);
      setHidden(errors, vm.errors === 0);
      setText(errors, `Errors ${String(vm.errors)}`);
      setClass(errors, 'is-pulsing', vm.errorsPulse);
      setText(output, vm.output);
      setHidden(outputDot, !vm.outputUnverified);
      setText(tier, vm.tier);
    },
  };
}

/** How long "Confirm change mode" waits for the second click. */
const MODE_CONFIRM_MS = 3000;

/**
 * Back to the mode launcher, after a second click: the Electron main process catches this
 * navigation, opens the launcher and closes the game and this window.
 */
function createModeSwitch(): HTMLButtonElement {
  const button = h('button', {
    class: 'btn btn--ghost btn--small',
    text: 'Change mode',
    attrs: { type: 'button', title: 'Close this mode and go back to the launcher' },
  });
  let armedUntil = 0;
  button.addEventListener('click', () => {
    if (Date.now() < armedUntil) {
      location.assign('/__viper/launcher');
      return;
    }
    armedUntil = Date.now() + MODE_CONFIRM_MS;
    setText(button, 'Confirm change mode');
    setTimeout(() => {
      armedUntil = 0;
      setText(button, 'Change mode');
    }, MODE_CONFIRM_MS);
  });
  return button;
}
