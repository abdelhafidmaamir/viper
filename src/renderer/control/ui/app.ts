/** The page shell: status bar, tabs, the active screen, the event log, the footer and help. */
import type { Controller } from '../controller.ts';
import { TABS, type TabId } from '../model.ts';
import { SHORTCUT_SHEET } from '../shortcuts.ts';
import type { Store } from '../store.ts';
import { h, setAttr, setClass, setHidden } from './dom.ts';
import { createLogPanel } from './log-panel.ts';
import { createAdminScreen } from './screens/admin.ts';
import { createLiveScreen } from './screens/live.ts';
import { createRehearsalScreen } from './screens/rehearsal.ts';
import { createSetupScreen } from './screens/setup.ts';
import { createStatusBar } from './status-bar.ts';
import type { View } from './view.ts';

const FOOTER_HINTS: readonly (readonly [string, string])[] = [
  ['N', 'new round'],
  ['1-4', 'scenes'],
  ['Esc', 'stop scene'],
  ['[ ]', 'advantage'],
  ['U', 'underdog'],
  ['S', 'super AI'],
  ['L', 'log'],
  ['?', 'all shortcuts'],
];

function helpSheet(onClose: () => void): HTMLElement {
  const close = h('button', {
    class: 'btn btn--secondary btn--small',
    text: 'Close',
    attrs: { type: 'button' },
  });
  close.addEventListener('click', onClose);
  const sheet = h(
    'div',
    {
      class: 'sheet',
      attrs: { role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'sheet-title' },
    },
    [
      h('div', { class: 'sheet__head' }, [
        h('h2', { class: 'card__title', text: 'Keyboard shortcuts', attrs: { id: 'sheet-title' } }),
        close,
      ]),
      h('p', {
        class: 'card__line',
        text: 'Active when focus is not in a text field. Director keys need admin mode.',
      }),
      h(
        'dl',
        { class: 'sheet__list' },
        SHORTCUT_SHEET.flatMap((entry) => [
          h('dt', {}, [h('kbd', { class: 'kbd', text: entry.keys })]),
          h('dd', { text: entry.action }),
        ]),
      ),
    ],
  );
  sheet.hidden = true;
  return sheet;
}

export function mountApp(root: HTMLElement, store: Store, controller: Controller): () => void {
  const initial = store.get();
  const tabs = TABS.filter((tab) => tab.id !== 'admin' || initial.admin);
  const screens: Record<TabId, View | null> = {
    live: createLiveScreen(controller, initial),
    setup: createSetupScreen(controller, (url) => {
      store.dispatch({ type: 'bridge-url', url });
    }),
    rehearsal: createRehearsalScreen(controller),
    admin: initial.admin ? createAdminScreen(controller) : null,
  };

  const tabButtons = tabs.map((tab) => {
    const button = h(
      'button',
      {
        class: 'tab',
        attrs: {
          type: 'button',
          role: 'tab',
          id: `tab-${tab.id}`,
          'aria-controls': `panel-${tab.id}`,
          'aria-keyshortcuts': `Alt+${tab.key}`,
        },
      },
      [
        tab.label,
        h('kbd', { class: 'kbd', text: `Alt+${tab.key}`, attrs: { 'aria-hidden': 'true' } }),
      ],
    );
    button.addEventListener('click', () => {
      controller.tab(tab.id);
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
    controller.tab(next.tab.id);
    next.button.focus();
  });

  const panels = tabs.map((tab) => {
    const screen = screens[tab.id];
    const panel = h(
      'section',
      {
        class: 'panel',
        attrs: { role: 'tabpanel', id: `panel-${tab.id}`, 'aria-labelledby': `tab-${tab.id}` },
      },
      screen ? [screen.el] : [],
    );
    return { tab, panel };
  });

  const statusBar = createStatusBar(() => {
    store.dispatch({ type: 'help', open: !store.get().ui.helpOpen });
  });
  const logPanel = createLogPanel({
    filter: (filter) => {
      store.dispatch({ type: 'log-filter', filter });
    },
    dismiss: (id) => {
      store.dispatch({ type: 'log-dismiss', id });
    },
    close: () => {
      store.dispatch({ type: 'log-toggle' });
    },
  });
  const sheet = helpSheet(() => {
    store.dispatch({ type: 'help', open: false });
  });
  const logToggle = h('button', {
    class: 'btn btn--ghost btn--small log-toggle',
    text: 'Event log',
    attrs: { type: 'button', 'aria-keyshortcuts': 'L', 'aria-expanded': 'false' },
  });
  logToggle.addEventListener('click', () => {
    store.dispatch({ type: 'log-toggle' });
  });

  const footer = h('footer', { class: 'footer' }, [
    ...FOOTER_HINTS.map(([key, action]) =>
      h('span', { class: 'footer__hint' }, [h('kbd', { class: 'kbd', text: key }), ` ${action}`]),
    ),
    logToggle,
  ]);

  root.replaceChildren(
    statusBar.el,
    h('div', { class: 'tabbar' }, [tablist]),
    h('div', { class: 'workspace' }, [
      h(
        'main',
        { class: 'main' },
        panels.map(({ panel }) => panel),
      ),
      logPanel.el,
    ]),
    footer,
    sheet,
  );

  let frame = 0;
  const render = (): void => {
    frame = 0;
    const state = store.get();
    statusBar.update(state);
    for (const { tab, button } of tabButtons) {
      const selected = state.ui.tab === tab.id;
      setAttr(button, 'aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    for (const { tab, panel } of panels) setHidden(panel, state.ui.tab !== tab.id);
    // Only the visible screen is patched; a hidden one catches up when it is shown.
    screens[state.ui.tab]?.update(state);
    logPanel.update(state);
    setHidden(sheet, !state.ui.helpOpen);
    setAttr(logToggle, 'aria-expanded', String(state.ui.logOpen));
    setClass(document.body, 'on-air', state.bridge.connected);
  };
  render();
  const unsubscribe = store.subscribe(() => {
    frame ||= requestAnimationFrame(render);
  });
  return () => {
    unsubscribe();
    cancelAnimationFrame(frame);
  };
}
