/**
 * Optimistic state of one setting. A control shows the operator's target at once, then waits for
 * the game to echo it. Without an echo within the timeout it reverts and reports an error; a retry
 * sends the same value again. Settings the game never reports stay "unverified".
 */
import { sameValue, type SettingValue } from './model.ts';

/** Three state messages at 500 ms. */
export const PENDING_TIMEOUT_MS = 1500;

export type SlotStatus = 'idle' | 'pending' | 'error' | 'unverified';

export interface SettingSlot {
  /** Last value reported by the game (or, when unverifiable, last value sent). */
  readonly confirmed: SettingValue | undefined;
  /** Value sent and not yet echoed, or the value that failed to apply. */
  readonly desired: SettingValue | undefined;
  readonly sentAt: number | undefined;
  readonly status: SlotStatus;
  readonly verifiable: boolean;
}

export function emptySlot(verifiable: boolean): SettingSlot {
  return {
    confirmed: undefined,
    desired: undefined,
    sentAt: undefined,
    status: 'idle',
    verifiable,
  };
}

/** The operator sent a value. */
export function request(slot: SettingSlot, value: SettingValue, now: number): SettingSlot {
  if (!slot.verifiable) {
    return { ...slot, confirmed: value, desired: undefined, sentAt: now, status: 'unverified' };
  }
  return { ...slot, desired: value, sentAt: now, status: 'pending' };
}

/** A state message arrived with the game's current value. */
export function observe(slot: SettingSlot, echoed: SettingValue, now: number): SettingSlot {
  if (!slot.verifiable) return slot;
  const next = { ...slot, confirmed: echoed };
  if (slot.status === 'pending' && sameValue(echoed, slot.desired)) {
    return { ...next, desired: undefined, sentAt: undefined, status: 'idle' };
  }
  return expire(next, now, false);
}

/**
 * Turns a pending slot into an error once the timeout passes. While the game link is down the
 * slot is frozen instead: the game cannot answer, which says nothing about the command.
 */
export function expire(slot: SettingSlot, now: number, frozen: boolean): SettingSlot {
  if (slot.status !== 'pending' || frozen || slot.sentAt === undefined) return slot;
  if (now - slot.sentAt < PENDING_TIMEOUT_MS) return slot;
  return { ...slot, status: 'error' };
}

/** What the control shows: the target while pending, the game's value otherwise. */
export function displayed(slot: SettingSlot): SettingValue | undefined {
  return slot.status === 'pending' ? slot.desired : slot.confirmed;
}

/** The value a retry would send, when the slot is in error. */
export function retryValue(slot: SettingSlot): SettingValue | undefined {
  return slot.status === 'error' ? slot.desired : undefined;
}
