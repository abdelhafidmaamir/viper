/** Card, status pill, meter and lock banner: the passive building blocks. */
import type { PillVm } from '../../view-models/status.ts';
import { h, setAttr, setClass, setHidden, setText, setVar, uid } from '../dom.ts';

export interface CardOptions {
  readonly title: string;
  /** Explanation kept off the surface, behind a `?` toggle. */
  readonly help?: string;
  readonly collapsible?: boolean;
  readonly className?: string;
}

export interface CardView {
  readonly el: HTMLElement;
  readonly header: HTMLElement;
  readonly body: HTMLElement;
  /** Slot at the right of the title, for a pill or a count. */
  readonly aside: HTMLElement;
}

export function createCard(options: CardOptions, children: readonly Node[] = []): CardView {
  const titleId = uid('card');
  const aside = h('span', { class: 'card__aside' });
  const body = h('div', { class: 'card__body' }, children);
  const header = h('header', { class: 'card__head' }, [
    h('h2', { class: 'card__title', text: options.title, attrs: { id: titleId } }),
    aside,
  ]);
  if (options.help) {
    const helpId = uid('help');
    const help = h('p', { class: 'card__help', text: options.help, attrs: { id: helpId } });
    help.hidden = true;
    const toggle = h('button', {
      class: 'card__help-toggle',
      text: '?',
      attrs: {
        type: 'button',
        'aria-expanded': 'false',
        'aria-controls': helpId,
        'aria-label': `About ${options.title}`,
        title: options.help,
      },
    });
    toggle.addEventListener('click', () => {
      help.hidden = !help.hidden;
      toggle.setAttribute('aria-expanded', String(!help.hidden));
    });
    header.append(toggle);
    body.prepend(help);
  }
  if (options.collapsible) {
    const collapse = h('button', {
      class: 'card__collapse',
      attrs: { type: 'button', 'aria-expanded': 'true', 'aria-label': `Collapse ${options.title}` },
    });
    collapse.addEventListener('click', () => {
      body.hidden = !body.hidden;
      collapse.setAttribute('aria-expanded', String(!body.hidden));
      collapse.setAttribute(
        'aria-label',
        `${body.hidden ? 'Expand' : 'Collapse'} ${options.title}`,
      );
    });
    header.append(collapse);
  }
  const el = h(
    'section',
    { class: `card ${options.className ?? ''}`.trim(), attrs: { 'aria-labelledby': titleId } },
    [header, body],
  );
  return { el, header, body, aside };
}

export interface PillView {
  readonly el: HTMLElement;
  update(vm: PillVm): void;
}

export function createPill(): PillView {
  const label = h('span', { class: 'pill__label' });
  const metric = h('span', { class: 'pill__metric' });
  const el = h('span', { class: 'pill', attrs: { role: 'status' } }, [
    h('span', { class: 'pill__dot', attrs: { 'aria-hidden': 'true' } }),
    label,
    metric,
  ]);
  return {
    el,
    update(vm) {
      setAttr(el, 'data-tone', vm.tone);
      setText(label, vm.label);
      setText(metric, vm.metric);
      setHidden(metric, vm.metric === '');
      setAttr(el, 'title', vm.title || null);
    },
  };
}

export interface MeterView {
  readonly el: HTMLElement;
  update(fraction: number, value: string): void;
}

export function createMeter(label: string, tone: Team): MeterView {
  const bar = h(
    'span',
    {
      class: 'meter__bar',
      attrs: {
        role: 'meter',
        'aria-label': `${label} fervor`,
        'aria-valuemin': '0',
        'aria-valuemax': '100',
      },
    },
    [h('span', { class: 'meter__fill' })],
  );
  const value = h('span', { class: 'meter__value' });
  const el = h('div', { class: `meter tone-${tone}` }, [
    h('span', { class: 'meter__label', text: label }),
    bar,
    value,
  ]);
  return {
    el,
    update(fraction, text) {
      const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
      setVar(bar, '--fill', `${String(pct)}%`);
      setAttr(bar, 'aria-valuenow', String(pct));
      setText(value, text);
    },
  };
}

export interface LockView {
  readonly el: HTMLElement;
  update(reason: string | null): void;
}

/** One strip per card instead of a tooltip on every disabled button. */
export function createLockBanner(): LockView {
  const text = h('span');
  const el = h('div', { class: 'lock', attrs: { role: 'note' } }, [
    h('span', { class: 'lock__icon', attrs: { 'aria-hidden': 'true' } }),
    text,
  ]);
  el.hidden = true;
  return {
    el,
    update(reason) {
      setHidden(el, reason === null);
      setText(text, reason ?? '');
      setClass(el, 'lock--link', reason !== null && !reason.startsWith('Locked'));
    },
  };
}
