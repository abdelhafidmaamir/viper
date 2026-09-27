import type { ControlState } from '../store.ts';

/** A mounted piece of UI: built once, then patched from each new state. */
export interface View {
  readonly el: HTMLElement;
  update(state: ControlState): void;
}
