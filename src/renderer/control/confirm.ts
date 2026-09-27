/**
 * Arm-confirm: a disruptive action needs two presses within a short window. The first press arms
 * it, the second fires; anything else, or the timeout, disarms. Only one action is armed at a time.
 */

export const ARM_WINDOW_MS = 3000;

/** Disruptive actions. Parameterised ones carry their target so a different target re-arms. */
export type ConfirmKey =
  | 'round'
  | 'bridge-stop'
  | 'test-ranking'
  | 'platform:tiktok'
  | 'platform:neutral'
  | 'gift-display-full'
  | 'ai-debug-on';

export type ArmState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'armed'; readonly key: ConfirmKey; readonly armedAt: number };

export const IDLE: ArmState = { kind: 'idle' };

export interface PressResult {
  readonly state: ArmState;
  readonly fire: boolean;
}

export function isArmed(state: ArmState, key: ConfirmKey, now: number): boolean {
  return state.kind === 'armed' && state.key === key && now - state.armedAt < ARM_WINDOW_MS;
}

/** A press on `key`: arms it, or fires it when it is already armed and still in its window. */
export function press(state: ArmState, key: ConfirmKey, now: number): PressResult {
  if (isArmed(state, key, now)) return { state: IDLE, fire: true };
  return { state: { kind: 'armed', key, armedAt: now }, fire: false };
}

export function expire(state: ArmState, now: number): ArmState {
  return state.kind === 'armed' && now - state.armedAt >= ARM_WINDOW_MS ? IDLE : state;
}

/** Fraction of the confirmation window left, for the draining ring. */
export function remainingFraction(state: ArmState, now: number): number {
  if (state.kind !== 'armed') return 0;
  return Math.max(0, Math.min(1, 1 - (now - state.armedAt) / ARM_WINDOW_MS));
}
