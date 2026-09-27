/**
 * Operator intentions, turned into commands. The controller owns the rules that sit between a
 * click and the wire: confirmations for disruptive actions, the ON AIR lock on test injections,
 * retries. It touches no DOM, so it is driven directly in tests.
 */
import type { ControlCommand, GameState } from '../../shared/control-protocol.ts';

import * as commands from './commands.ts';
import { IDLE, press, type ConfirmKey } from './confirm.ts';
import type { CrowdDriver } from './crowd-driver.ts';
import {
  GIFTS,
  isVerified,
  type CrowdMode,
  type SceneName,
  type SettingName,
  type SettingValue,
  type TabId,
  type TestEventId,
} from './model.ts';
import { displayed, retryValue } from './pending.ts';
import type { ShortcutAction } from './shortcuts.ts';
import type { Store } from './store.ts';
import { clampAdvantage } from './view-models/director.ts';

export interface ControllerDeps {
  readonly store: Store;
  readonly send: (command: ControlCommand) => void;
  readonly crowd: CrowdDriver;
  readonly now: () => number;
  readonly schedule: (delayMs: number, run: () => void) => void;
}

export type BooleanSetting =
  'smooth' | 'donorNames' | 'underdog' | 'superAi' | 'autoAmbience' | 'aiDebug';

export interface Controller {
  onState(state: GameState): void;
  tick(): void;
  round(): void;
  scene(name: SceneName): void;
  stopScene(): void;
  setAdvantage(value: number): void;
  nudgeAdvantage(delta: number): void;
  toggle(name: BooleanSetting, next: boolean): void;
  select(name: SettingName, value: SettingValue): void;
  retry(name: SettingName): void;
  bridgeStart(): void;
  bridgeStop(): void;
  gift(index: number): void;
  likes(): void;
  testEvent(id: TestEventId): void;
  testRanking(): void;
  crowd(density: number, mode: CrowdMode): void;
  shortcut(action: ShortcutAction): void;
  escape(): void;
  tab(tab: TabId): void;
}

export function createController(deps: ControllerDeps): Controller {
  const { store } = deps;

  const onAir = (): boolean => store.get().bridge.connected;

  function send(command: ControlCommand, quiet = false): void {
    deps.send(command);
    store.dispatch({ type: 'sent', command, at: deps.now(), quiet });
  }

  function disarm(): void {
    if (store.get().armed.kind !== 'idle') store.dispatch({ type: 'armed', armed: IDLE });
  }

  /** First press arms, second fires. Returns nothing: the action runs only on the second. */
  function confirmed(key: ConfirmKey, run: () => void): void {
    const result = press(store.get().armed, key, deps.now());
    store.dispatch({ type: 'armed', armed: result.state });
    if (result.fire) run();
  }

  /** Test injections never reach a live broadcast: fake nicknames would show on stream. */
  function injectionAllowed(what: string): boolean {
    if (!onAir()) return true;
    store.dispatch({
      type: 'note',
      at: deps.now(),
      entry: { source: 'cmd', level: 'warn', text: `Refused while ON AIR: ${what}` },
    });
    return false;
  }

  function sendSetting(name: SettingName, value: SettingValue): void {
    send(commands.setting(name, value));
  }

  function publishCrowd(): void {
    store.dispatch({ type: 'crowd', crowd: deps.crowd.status(), at: deps.now() });
  }

  function currentBoolean(name: BooleanSetting): boolean {
    return displayed(store.get().settings[name]) === true;
  }

  /** Enter confirms whatever is armed, exactly as a second click on it would. */
  function pressAgain(key: ConfirmKey): void {
    switch (key) {
      case 'round':
        controller.round();
        return;
      case 'bridge-stop':
        controller.bridgeStop();
        return;
      case 'test-ranking':
        controller.testRanking();
        return;
      case 'platform:tiktok':
        controller.select('platform', 'tiktok');
        return;
      case 'platform:neutral':
        controller.select('platform', 'neutral');
        return;
      case 'gift-display-full':
        controller.select('giftDisplay', 'full');
        return;
      case 'ai-debug-on':
        controller.toggle('aiDebug', true);
        return;
    }
  }

  const controller: Controller = {
    onState(state) {
      store.dispatch({ type: 'state', state, at: deps.now() });
      const crowd = deps.crowd.status();
      if (crowd.density > 0 && onAir()) {
        deps.crowd.configure(0, crowd.mode);
        store.dispatch({
          type: 'note',
          at: deps.now(),
          entry: {
            source: 'crowd',
            level: 'warn',
            text: 'Simulated crowd stopped: TikFinity is live',
          },
        });
      } else {
        deps.crowd.onState(state.crowd);
      }
      publishCrowd();
    },

    tick() {
      store.dispatch({ type: 'tick', at: deps.now() });
    },

    round() {
      confirmed('round', () => {
        send(commands.round());
      });
    },

    scene(name) {
      disarm();
      send(commands.scene(name));
    },

    stopScene() {
      disarm();
      send(commands.sceneStop());
    },

    setAdvantage(value) {
      disarm();
      sendSetting('advantage', clampAdvantage(value));
    },

    nudgeAdvantage(delta) {
      const current = displayed(store.get().settings.advantage);
      controller.setAdvantage((typeof current === 'number' ? current : 0) + delta);
    },

    toggle(name, next) {
      if (name === 'aiDebug' && next && onAir()) {
        confirmed('ai-debug-on', () => {
          sendSetting(name, true);
        });
        return;
      }
      disarm();
      sendSetting(name, next);
    },

    select(name, value) {
      if (name === 'platform' && onAir() && (value === 'tiktok' || value === 'neutral')) {
        confirmed(`platform:${value}`, () => {
          sendSetting(name, value);
        });
        return;
      }
      if (name === 'giftDisplay' && value === 'full' && onAir()) {
        confirmed('gift-display-full', () => {
          sendSetting(name, value);
        });
        return;
      }
      disarm();
      sendSetting(name, value);
    },

    retry(name) {
      const value = isVerified(name) ? retryValue(store.get().settings[name]) : undefined;
      if (value !== undefined) sendSetting(name, value);
    },

    bridgeStart() {
      disarm();
      send(commands.bridgeStart(store.get().ui.bridgeUrl));
    },

    bridgeStop() {
      if (!onAir()) {
        disarm();
        send(commands.bridgeStop());
        return;
      }
      confirmed('bridge-stop', () => {
        send(commands.bridgeStop());
      });
    },

    gift(index) {
      disarm();
      const button = GIFTS[index];
      if (!button || !injectionAllowed('simulated gift')) return;
      for (const command of commands.giftStreak(button)) send(command);
    },

    likes() {
      disarm();
      if (injectionAllowed('simulated likes')) send(commands.likes());
    },

    testEvent(id) {
      disarm();
      if (injectionAllowed('test event')) send(commands.testEvent(id));
    },

    testRanking() {
      if (!injectionAllowed('ranking test')) return;
      confirmed('test-ranking', () => {
        for (const step of commands.testRankingPlan()) {
          if (step.delayMs === 0) send(step.command);
          // The lock is checked again when the delayed step fires.
          else
            deps.schedule(step.delayMs, () => {
              if (injectionAllowed('ranking test end')) send(step.command);
            });
        }
      });
    },

    crowd(density, mode) {
      disarm();
      if (density > 0 && !injectionAllowed('simulated crowd')) return;
      deps.crowd.configure(density, mode);
      publishCrowd();
    },

    escape() {
      if (store.get().armed.kind !== 'idle') disarm();
      else if (store.get().scene) controller.stopScene();
    },

    tab(tab) {
      store.dispatch({ type: 'tab', tab });
    },

    shortcut(action) {
      switch (action.kind) {
        case 'round':
          controller.round();
          return;
        case 'confirm': {
          const { armed } = store.get();
          if (armed.kind === 'armed') pressAgain(armed.key);
          return;
        }
        case 'scene':
          controller.scene(action.name);
          return;
        case 'escape':
          controller.escape();
          return;
        case 'advantage':
          controller.nudgeAdvantage(action.delta);
          return;
        case 'advantage-reset':
          controller.setAdvantage(0);
          return;
        case 'toggle-underdog':
          controller.toggle('underdog', !currentBoolean('underdog'));
          return;
        case 'toggle-super-ai':
          controller.toggle('superAi', !currentBoolean('superAi'));
          return;
        case 'toggle-log':
          store.dispatch({ type: 'log-toggle' });
          return;
        case 'tab':
          controller.tab(action.tab);
          return;
        case 'help':
          store.dispatch({ type: 'help', open: !store.get().ui.helpOpen });
          return;
      }
    },
  };
  return controller;
}
