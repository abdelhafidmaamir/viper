// Snake Arena control room: wires the channel, the Feed store and shell, the arena's own state
// and the keyboard shortcuts. The same wiring as Feed's room (feed-control/main.ts) on the
// arena's channel, without the near-full board.
import '../control/control.css';

import { ARENA_CHANNEL } from '../../shared/arena-protocol.ts';
import { decodeFeedState, type CrowdLevel, type FeedCommand } from '../../shared/feed-protocol.ts';
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
} from '../feed-control/store.ts';
import { mountFeedApp, type Dispatch, type PressArm } from '../feed-control/ui.ts';
import { linkArenaSide } from './arena-state.ts';
import { arenaRoom } from './cards.ts';

const TICK_MS = 100;

const NON_TEXT_INPUTS: ReadonlySet<string> = new Set(['range', 'checkbox', 'radio', 'button']);

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

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

function makePressArm(store: FeedControlStore): PressArm {
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

function bindShortcuts(store: FeedControlStore, dispatch: Dispatch, pressArm: PressArm): void {
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

    // Test gifts and the simulated audience never fire during a real live.
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
    }
  });
}

function start(root: HTMLElement): void {
  const channel = new BroadcastChannel(ARENA_CHANNEL);
  const store = createStore(initialState());
  // The board's own state and tuning values travel on the same channel as Feed's.
  const arena = linkArenaSide(channel);

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
  const { unmount } = mountFeedApp(
    root,
    store,
    dispatch,
    pressArm,
    arenaRoom(store, dispatch, pressArm, arena),
  );

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
