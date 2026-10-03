// Feed the Snake control room: wires the channel, store, UI, and keyboard shortcuts.
import '../control/control.css';

import {
  FEED_CHANNEL,
  decodeFeedState,
  type CrowdLevel,
  type FeedCommand,
} from '../../shared/feed-protocol.ts';
import {
  cleanPending,
  controlsReason,
  rehearsalReason,
  createStore,
  initialState,
  saveTab,
  type ArmKey,
  type FeedControlState,
  type FeedControlStore,
} from './store.ts';
import { mountFeedApp } from './ui.ts';

const TICK_MS = 100;

const NON_TEXT_INPUTS: ReadonlySet<string> = new Set(['range', 'checkbox', 'radio', 'button']);

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

type Dispatch = (cmd: FeedCommand) => void;

function makeDispatch(channel: BroadcastChannel, store: FeedControlStore): Dispatch {
  return function dispatch(cmd: FeedCommand): void {
    channel.postMessage(cmd);
    if (cmd.cmd === 'setting') {
      const name = cmd.name;
      store.patch((s) => ({
        pending: { ...s.pending, [name]: { value: cmd.value, sentAt: s.now } },
      }));
    }
  };
}

function makePressArm(store: FeedControlStore) {
  return function pressArm(key: ArmKey, execute: () => void): void {
    const s = store.get();
    if (s.armed === key) {
      execute();
      store.patch(() => ({ armed: null, armedAt: null }));
    } else {
      store.patch((st) => ({ armed: key, armedAt: st.now }));
    }
  };
}

function bindShortcuts(
  store: FeedControlStore,
  dispatch: Dispatch,
  pressArm: (key: ArmKey, execute: () => void) => void,
): void {
  document.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (isTextField(event.target)) return;

    // Tab shortcuts: Alt+1 to 4 always work regardless of game link state
    if (event.altKey) {
      const tabs = ['live', 'rehearsal', 'setup', 'money'] as const;
      const idx = Number(event.key) - 1;
      if (idx >= 0 && idx < tabs.length) {
        event.preventDefault();
        const tab = tabs[idx];
        if (tab) {
          store.patch(() => ({ tab }));
          saveTab(tab);
        }
      }
      return;
    }

    // All other shortcuts require the game to be connected
    const state: FeedControlState = store.get();
    if (controlsReason(state) !== null) return;

    // Test gifts, the simulated audience and near full never fire during a real live.
    const rehearsalOff = rehearsalReason(state) !== null;
    if (rehearsalOff && event.key !== 'n' && event.key !== 'N') return;

    switch (event.key) {
      case 'n':
      case 'N':
        event.preventDefault();
        pressArm('round', () => {
          dispatch({ cmd: 'round' });
        });
        break;
      case '1':
        event.preventDefault();
        dispatch({ cmd: 'gift', gift: 'rose', count: 1 });
        break;
      case '2':
        event.preventDefault();
        dispatch({ cmd: 'gift', gift: 'rose', count: 5 });
        break;
      case '3':
        event.preventDefault();
        dispatch({ cmd: 'gift', gift: 'rosa', count: 1 });
        break;
      case '4':
        event.preventDefault();
        dispatch({ cmd: 'gift', gift: 'rosa', count: 5 });
        break;
      case 'l':
      case 'L':
        event.preventDefault();
        dispatch({ cmd: 'likes', count: 25 });
        break;
      case 's':
      case 'S': {
        event.preventDefault();
        const crowd = state.gameState?.crowd ?? 0;
        const next = ((crowd + 1) % 4) as CrowdLevel;
        dispatch({ cmd: 'crowd', level: next });
        break;
      }
      case 'f':
      case 'F':
        event.preventDefault();
        dispatch({ cmd: 'near-full' });
        break;
    }
  });
}

function start(root: HTMLElement): void {
  const channel = new BroadcastChannel(FEED_CHANNEL);
  const store = createStore(initialState());

  channel.addEventListener('message', ({ data }) => {
    const feed = decodeFeedState(data);
    if (!feed) return;
    const now = Date.now();
    store.patch((s) => ({
      gameState: feed,
      lastStateAt: now,
      now,
      pending: cleanPending(s.pending, feed.settings, now),
      armed: s.armed !== null && s.armedAt !== null && now - s.armedAt >= 3000 ? null : s.armed,
      armedAt: s.armedAt !== null && s.armed !== null && now - s.armedAt >= 3000 ? null : s.armedAt,
    }));
  });

  const ticker = setInterval(() => {
    const now = Date.now();
    store.patch((s) => {
      const armExpired = s.armed !== null && s.armedAt !== null && now - s.armedAt >= 3000;
      return {
        now,
        armed: armExpired ? null : s.armed,
        armedAt: armExpired ? null : s.armedAt,
      };
    });
  }, TICK_MS);

  const dispatch = makeDispatch(channel, store);
  const pressArm = makePressArm(store);
  const { unmount } = mountFeedApp(root, store, dispatch, pressArm);

  bindShortcuts(store, dispatch, pressArm);

  window.addEventListener('pagehide', () => {
    clearInterval(ticker);
    channel.postMessage({ cmd: 'crowd', level: 0 });
    channel.close();
    unmount();
  });
}

const root = document.getElementById('app');
if (!('BroadcastChannel' in window) || !root) {
  document.body.textContent =
    'This window cannot reach the game window (BroadcastChannel missing).';
} else {
  start(root);
}
