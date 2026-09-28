/** DOM shell: status bar, tabs, and screen panels. */
import type { FeedCommand } from '../../shared/feed-protocol.ts';
import { decodeBridge } from '../control/decode.ts';
import { createButton } from '../control/ui/components/button.ts';
import { createPill } from '../control/ui/components/card.ts';
import { h, setAttr, setClass, setHidden } from '../control/ui/dom.ts';
import {
  armVm,
  controlsReason,
  fpsTone,
  isGameLinkStale,
  saveTab,
  type ArmKey,
  type FeedControlState,
  type FeedControlStore,
} from './store.ts';
import { createLiveScreen, createRehearsalScreen, createSetupScreen } from './screens.ts';

export interface FeedView {
  readonly el: HTMLElement;
  update(state: FeedControlState): void;
}

type Dispatch = (cmd: FeedCommand) => void;
type PressArm = (key: ArmKey, execute: () => void) => void;

function createStatusBar(dispatch: Dispatch, pressArm: PressArm): FeedView {
  const gamePill = createPill();
  const bridgePill = createPill();
  const fpsPill = createPill();

  const changeMode = createButton({
    label: 'Change mode',
    armedLabel: 'Confirm change mode',
    variant: 'secondary',
    onPress: () => {
      pressArm('mode', () => {
        dispatch({ cmd: 'crowd', level: 0 });
        location.assign('/__viper/launcher');
      });
    },
  });

  const title = h('div', { class: 'statusbar__group' }, [
    h('span', { class: 'caps', text: 'Viper Feed' }),
    h('span', { class: 'chip__text', text: 'Control Room' }),
  ]);

  const el = h('header', { class: 'statusbar', attrs: { 'aria-label': 'Show status' } }, [
    title,
    h('div', { class: 'statusbar__group' }, [gamePill.el, bridgePill.el, fpsPill.el]),
    h('div', { class: 'statusbar__group statusbar__end' }, [changeMode.el]),
  ]);

  return {
    el,
    update(state) {
      const stale = isGameLinkStale(state);
      gamePill.update(
        stale
          ? {
              tone: state.lastStateAt === null ? 'danger' : 'warn',
              label: state.lastStateAt === null ? 'Game not responding' : 'Game not responding',
              metric: '',
              title: 'No recent update from the game window',
            }
          : {
              tone: 'live',
              label: 'Game linked',
              metric: '',
              title: 'Game window is sending updates',
            },
      );

      const bridge = decodeBridge(state.gameState?.bridge);
      bridgePill.update(
        bridge.connected
          ? {
              tone: 'live',
              label: 'TikFinity live',
              metric: `${bridge.events.toLocaleString('en-US')} ev`,
              title: `Connected to ${bridge.url}`,
            }
          : bridge.error
            ? { tone: 'danger', label: 'TikFinity error', metric: '', title: bridge.error }
            : {
                tone: 'neutral',
                label: 'TikFinity off',
                metric: '',
                title: 'TikFinity disconnected',
              },
      );

      const fps = state.gameState?.fps ?? 0;
      const slowFrames = state.gameState?.slowFrames ?? 0;
      const errors = state.gameState?.errors ?? 0;
      fpsPill.update({
        tone: state.gameState ? fpsTone(fps) : 'neutral',
        label: `${String(fps)} fps`,
        metric: '',
        title: `${String(slowFrames)} slow frames/s, ${String(errors)} errors`,
      });

      changeMode.update({ armed: armVm(state, 'mode') });
      setClass(document.body, 'on-air', bridge.connected);
    },
  };
}

type TabId = 'live' | 'rehearsal' | 'setup';

const FEED_TABS: readonly { readonly id: TabId; readonly label: string; readonly key: string }[] = [
  { id: 'live', label: 'Live', key: '1' },
  { id: 'rehearsal', label: 'Rehearsal', key: '2' },
  { id: 'setup', label: 'Setup', key: '3' },
];

export function mountFeedApp(
  root: HTMLElement,
  store: FeedControlStore,
  dispatch: Dispatch,
  pressArm: PressArm,
): { unmount: () => void } {
  const statusBar = createStatusBar(dispatch, pressArm);
  const reason = () => controlsReason(store.get());

  const screens: Record<TabId, FeedView> = {
    live: createLiveScreen(store, dispatch, pressArm),
    rehearsal: createRehearsalScreen(dispatch, reason),
    setup: createSetupScreen(dispatch, reason),
  };

  const tabButtons = FEED_TABS.map((tab) => {
    const button = h(
      'button',
      {
        class: 'tab',
        attrs: {
          type: 'button',
          role: 'tab',
          id: `ftab-${tab.id}`,
          'aria-controls': `fpanel-${tab.id}`,
          'aria-keyshortcuts': `Alt+${tab.key}`,
        },
      },
      [
        tab.label,
        h('kbd', { class: 'kbd', text: `Alt+${tab.key}`, attrs: { 'aria-hidden': 'true' } }),
      ],
    );
    button.addEventListener('click', () => {
      store.patch(() => ({ tab: tab.id }));
      saveTab(tab.id);
    });
    return { tab, button };
  });

  const tablist = h(
    'nav',
    { class: 'tabs', attrs: { role: 'tablist', 'aria-label': 'Control room sections' } },
    tabButtons.map(({ button }) => button),
  );
  tablist.addEventListener('keydown', (event) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    const index = tabButtons.findIndex(({ button }) => button === document.activeElement);
    const next = tabButtons[(index + step + tabButtons.length) % tabButtons.length];
    if (!next) return;
    event.preventDefault();
    store.patch(() => ({ tab: next.tab.id }));
    saveTab(next.tab.id);
    next.button.focus();
  });

  const panels = FEED_TABS.map((tab) => {
    const panel = h(
      'section',
      {
        class: 'panel',
        attrs: {
          role: 'tabpanel',
          id: `fpanel-${tab.id}`,
          'aria-labelledby': `ftab-${tab.id}`,
        },
      },
      [screens[tab.id].el],
    );
    return { tab, panel };
  });

  root.replaceChildren(
    statusBar.el,
    h('div', { class: 'tabbar' }, [tablist]),
    h('div', { class: 'workspace' }, [
      h(
        'main',
        { class: 'main' },
        panels.map(({ panel }) => panel),
      ),
    ]),
  );

  let frame = 0;
  const render = (): void => {
    frame = 0;
    const state = store.get();
    statusBar.update(state);
    for (const { tab, button } of tabButtons) {
      const selected = state.tab === tab.id;
      setAttr(button, 'aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    for (const { tab, panel } of panels) setHidden(panel, state.tab !== tab.id);
    screens[state.tab].update(state);
  };

  render();
  const unsubscribe = store.subscribe(() => {
    frame ||= requestAnimationFrame(render);
  });

  return {
    unmount() {
      unsubscribe();
      cancelAnimationFrame(frame);
    },
  };
}
