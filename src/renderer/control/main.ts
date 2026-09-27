// The private control room: wires the channel, the store, the crowd driver and the UI. The crowd
// brain is the shared simulated-audience script, which must load before this module runs.
import '../scripts/simulated-audience.ts';
import './control.css';

import { CONTROL_CHANNEL, type GameState } from '../../shared/control-protocol.ts';
import { createController, type Controller } from './controller.ts';
import { createCrowdDriver } from './crowd-driver.ts';
import { openLink } from './link.ts';
import { resolveShortcut } from './shortcuts.ts';
import { createStore, initialState } from './store.ts';
import { mountApp } from './ui/app.ts';

/** Link age and gauges are re-evaluated at 10 Hz between the 2 Hz state messages. */
const TICK_MS = 100;

const NON_TEXT_INPUTS: ReadonlySet<string> = new Set(['range', 'checkbox', 'radio', 'button']);

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

function bindShortcuts(store: ReturnType<typeof createStore>, controller: Controller): void {
  document.addEventListener('keydown', (event) => {
    // Held keys repeat only for the advantage steps.
    if (event.repeat && event.key !== '[' && event.key !== ']') return;
    const state = store.get();
    if (event.key === 'Escape' && state.ui.helpOpen) {
      store.dispatch({ type: 'help', open: false });
      return;
    }
    const action = resolveShortcut(
      {
        key: event.key,
        code: event.code,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        inTextField: isTextField(event.target),
      },
      {
        admin: state.admin,
        sceneRunning: state.scene !== null,
        armed: state.armed.kind === 'armed',
      },
    );
    if (!action) return;
    event.preventDefault();
    controller.shortcut(action);
  });
}

function start(root: HTMLElement): void {
  const admin = new URLSearchParams(location.search).get('admin') === '1';
  const store = createStore(initialState(admin, Date.now()));

  let onState: (state: GameState) => void = () => undefined;
  const link = openLink(new BroadcastChannel(CONTROL_CHANNEL), (state) => {
    onState(state);
  });
  const crowd = createCrowdDriver({
    brain: window.ViperCrowd.create(),
    now: Date.now,
    random: Math.random,
    every: (ms, run) => {
      const handle = setInterval(run, ms);
      return () => {
        clearInterval(handle);
      };
    },
    // Crowd gifts are not logged one by one: the brain's reasons are, through its view.
    emit: (event) => {
      link.send({ cmd: 'event', ev: event });
    },
  });
  const controller = createController({
    store,
    send: link.send,
    crowd,
    now: Date.now,
    schedule: (delayMs, run) => {
      setTimeout(run, delayMs);
    },
  });
  onState = (state) => {
    controller.onState(state);
  };

  mountApp(root, store, controller);
  bindShortcuts(store, controller);
  const timer = setInterval(() => {
    controller.tick();
  }, TICK_MS);

  window.addEventListener('pagehide', () => {
    clearInterval(timer);
    crowd.configure(0, 'battle');
    link.close();
  });
}

const root = document.getElementById('app');
if (!('BroadcastChannel' in window) || !root) {
  document.body.textContent =
    'This window cannot reach the game window (BroadcastChannel missing).';
} else {
  start(root);
}
