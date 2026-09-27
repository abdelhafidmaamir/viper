/**
 * Minimal DOM helpers. Text always goes through `textContent`; nothing here parses HTML. Setters
 * compare before writing so a 10 Hz update loop only touches what changed.
 */

type Child = Node | string | null | undefined | false;

export interface Props {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: readonly Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) el.setAttribute(name, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function setAttr(el: Element, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}

export function setClass(el: Element, name: string, on: boolean): void {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

export function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

/** Sets a CSS custom property, used for gauge and meter fills (no inline style strings). */
export function setVar(el: HTMLElement, name: string, value: string): void {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

export function setDisabled(
  el: HTMLButtonElement | HTMLInputElement | HTMLSelectElement,
  disabled: boolean,
): void {
  if (el.disabled !== disabled) el.disabled = disabled;
}

let nextId = 0;

/** A document-unique id for aria relationships. */
export function uid(prefix: string): string {
  nextId += 1;
  return `${prefix}-${String(nextId)}`;
}

/** A visually hidden element that carries a disabled control's reason for assistive tech. */
export function reasonHolder(): HTMLSpanElement {
  return h('span', { class: 'sr-only', attrs: { id: uid('reason') } });
}

/** Applies a disabled state with its reason as tooltip and accessible description. */
export function applyReason(
  control: HTMLButtonElement | HTMLInputElement | HTMLSelectElement,
  holder: HTMLElement,
  reason: string | null,
): void {
  setDisabled(control, reason !== null);
  setText(holder, reason ?? '');
  setAttr(control, 'aria-describedby', reason === null ? null : holder.id);
  setAttr(control, 'title', reason);
}
