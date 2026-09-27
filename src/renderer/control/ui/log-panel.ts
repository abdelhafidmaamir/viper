/**
 * The event log column. Rows are keyed by id: new ones are appended, trimmed ones removed, so a
 * 10 Hz update never rebuilds the list. While the pointer is over the list, it holds still.
 */
import type { LogFilter } from '../log.ts';
import type { ControlState } from '../store.ts';
import { LOG_FILTERS, logVm, type LogRowVm } from '../view-models/log.ts';
import { h, setAttr, setClass, setHidden, setText } from './dom.ts';
import type { View } from './view.ts';

export interface LogPanelActions {
  readonly filter: (filter: LogFilter) => void;
  readonly dismiss: (id: number) => void;
  readonly close: () => void;
}

function rowElement(row: LogRowVm): HTMLLIElement {
  return h(
    'li',
    { class: `log__row log__row--${row.level}`, attrs: { 'data-id': String(row.id) } },
    [
      h('time', { class: 'log__time', text: row.time }),
      h('span', { class: `log__tag log__tag--${row.source}`, text: row.tag }),
      h('span', { class: 'log__text', text: row.text }),
    ],
  );
}

export function createLogPanel(actions: LogPanelActions): View {
  const chips = LOG_FILTERS.map((option) => {
    const chip = h('button', {
      class: 'filter',
      text: option.label,
      attrs: { type: 'button', 'aria-pressed': 'false' },
    });
    chip.addEventListener('click', () => {
      actions.filter(option.value);
    });
    return { option, chip };
  });
  const close = h('button', {
    class: 'btn btn--ghost btn--small log__close',
    text: 'Close',
    attrs: { type: 'button', 'aria-keyshortcuts': 'L' },
  });
  close.addEventListener('click', actions.close);

  const pinned = h('ul', {
    class: 'log__pinned',
    attrs: { 'aria-live': 'polite', 'aria-label': 'Errors' },
  });
  const pinnedMore = h('p', { class: 'log__more' });
  const list = h('ol', {
    class: 'log__list',
    attrs: { role: 'log', 'aria-live': 'off', 'aria-label': 'Event log', tabindex: '0' },
  });
  const empty = h('p', { class: 'muted log__empty', text: 'Nothing yet.' });
  let hovering = false;
  list.addEventListener('pointerenter', () => {
    hovering = true;
  });
  list.addEventListener('pointerleave', () => {
    hovering = false;
  });

  let renderedFilter: LogFilter | null = null;
  let lastId = 0;
  let pinnedKey = '';

  const el = h('aside', { class: 'logpanel', attrs: { 'aria-label': 'Event log' } }, [
    h('div', { class: 'logpanel__head' }, [
      h('h2', { class: 'card__title', text: 'Event log' }),
      close,
    ]),
    h(
      'div',
      { class: 'filters', attrs: { role: 'group', 'aria-label': 'Filter the log' } },
      chips.map(({ chip }) => chip),
    ),
    pinned,
    pinnedMore,
    list,
    empty,
  ]);

  function renderPinned(rows: readonly LogRowVm[], total: number): void {
    const key = rows.map((row) => row.id).join(',');
    if (key !== pinnedKey) {
      pinnedKey = key;
      pinned.replaceChildren(
        ...rows.map((row) => {
          const dismiss = h('button', {
            class: 'log__dismiss',
            text: 'Dismiss',
            attrs: { type: 'button', 'aria-label': `Dismiss error: ${row.text}` },
          });
          dismiss.addEventListener('click', () => {
            actions.dismiss(row.id);
          });
          return h('li', { class: 'log__row log__row--error log__row--pinned' }, [
            h('time', { class: 'log__time', text: row.time }),
            h('span', { class: 'log__text', text: row.text }),
            dismiss,
          ]);
        }),
      );
    }
    setText(pinnedMore, total > rows.length ? `${String(total - rows.length)} older errors` : '');
    setHidden(pinnedMore, total <= rows.length);
  }

  return {
    el,
    update(state: ControlState) {
      setClass(el, 'is-open', state.ui.logOpen);
      for (const { option, chip } of chips) {
        setAttr(chip, 'aria-pressed', String(option.value === state.ui.logFilter));
      }
      const vm = logVm(state.log, state.ui.logFilter);
      renderPinned(vm.pinned, vm.pinnedTotal);
      setHidden(empty, vm.rows.length > 0);
      if (hovering && renderedFilter === vm.filter) return;

      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
      if (renderedFilter !== vm.filter) {
        list.replaceChildren(...vm.rows.map(rowElement));
        renderedFilter = vm.filter;
      } else {
        const firstId = vm.rows[0]?.id ?? Infinity;
        while (
          list.firstElementChild &&
          Number(list.firstElementChild.getAttribute('data-id')) < firstId
        ) {
          list.firstElementChild.remove();
        }
        const fresh = vm.rows.filter((row) => row.id > lastId);
        if (fresh.length > 0) list.append(...fresh.map(rowElement));
      }
      lastId = vm.rows.at(-1)?.id ?? lastId;
      if (atBottom) list.scrollTop = list.scrollHeight;
    },
  };
}
