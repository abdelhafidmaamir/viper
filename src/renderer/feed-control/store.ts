/**
 * State, pure view-model helpers, and a minimal subscribe store for the Feed control room.
 * Nothing here imports DOM or channel code: every export is testable in Vitest.
 */
import type { FeedSettingName, FeedState } from '../../shared/feed-protocol.ts';
import type { SlotStatus } from '../control/pending.ts';
import type { Tone } from '../control/view-models/status.ts';

export type FeedTab = 'live' | 'rehearsal' | 'setup';
export type ArmKey = 'round' | 'mode';

const STALE_MS = 2000;
const PENDING_TIMEOUT_MS = 2000;
const ARM_TIMEOUT_MS = 3000;
const STORAGE_TAB_KEY = 'viper-feed-control-tab';

export interface PendingSlot {
  readonly value: unknown;
  readonly sentAt: number;
}

export interface ArmVm {
  readonly armed: boolean;
  readonly fraction: number;
}

export interface FeedControlState {
  readonly gameState: FeedState | null;
  readonly lastStateAt: number | null;
  readonly now: number;
  readonly tab: FeedTab;
  readonly pending: Partial<Record<FeedSettingName, PendingSlot>>;
  readonly armed: ArmKey | null;
  readonly armedAt: number | null;
}

/** Tone for the FPS pill based on measured frame rate. */
export function fpsTone(fps: number): Tone {
  if (fps >= 58) return 'live';
  if (fps >= 45) return 'warn';
  return 'danger';
}

/** True when no state has arrived or the last one is older than STALE_MS. */
export function isGameLinkStale(state: Pick<FeedControlState, 'lastStateAt' | 'now'>): boolean {
  return state.lastStateAt === null || state.now - state.lastStateAt >= STALE_MS;
}

/** Disabled reason for controls when the game link is not healthy. Null when enabled. */
export function controlsReason(state: FeedControlState): string | null {
  if (state.lastStateAt === null) return 'Waiting for the game window';
  if (isGameLinkStale(state)) return 'Game not responding';
  return null;
}

/**
 * Resolves what value to display and which status to show for a setting, given
 * the game's current echoed value and any outstanding optimistic slot.
 */
export function resolvePending(
  stateValue: unknown,
  slot: PendingSlot | undefined,
  now: number,
): { value: unknown; status: SlotStatus } {
  if (slot === undefined) return { value: stateValue, status: 'idle' };
  if (stateValue === slot.value) return { value: stateValue, status: 'idle' };
  if (now - slot.sentAt < PENDING_TIMEOUT_MS) return { value: slot.value, status: 'pending' };
  return { value: stateValue, status: 'error' };
}

/** View model for a two-step confirm button. */
export function armVm(state: FeedControlState, key: ArmKey): ArmVm {
  if (state.armed !== key || state.armedAt === null) return { armed: false, fraction: 0 };
  const elapsed = state.now - state.armedAt;
  if (elapsed >= ARM_TIMEOUT_MS) return { armed: false, fraction: 0 };
  return { armed: true, fraction: 1 - elapsed / ARM_TIMEOUT_MS };
}

// --- Store ---

type Listener = () => void;

export interface FeedControlStore {
  get(): FeedControlState;
  patch(fn: (s: FeedControlState) => Partial<FeedControlState>): void;
  subscribe(fn: Listener): () => void;
}

export function createStore(initial: FeedControlState): FeedControlStore {
  let state = initial;
  const subs = new Set<Listener>();
  return {
    get: () => state,
    patch(fn) {
      state = { ...state, ...fn(state) };
      for (const sub of subs) sub();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

function savedTab(): FeedTab {
  try {
    const raw = localStorage.getItem(STORAGE_TAB_KEY);
    if (raw === 'live' || raw === 'rehearsal' || raw === 'setup') return raw;
  } catch {
    /* storage may be unavailable */
  }
  return 'live';
}

export function saveTab(tab: FeedTab): void {
  try {
    localStorage.setItem(STORAGE_TAB_KEY, tab);
  } catch {
    /* storage may be unavailable */
  }
}

export function initialState(): FeedControlState {
  return {
    gameState: null,
    lastStateAt: null,
    now: Date.now(),
    tab: savedTab(),
    pending: {},
    armed: null,
    armedAt: null,
  };
}

/**
 * Returns a new pending record with confirmed and expired slots removed.
 * Returns the same reference when nothing changed.
 */
export function cleanPending(
  pending: FeedControlState['pending'],
  settings: FeedState['settings'],
  now: number,
): FeedControlState['pending'] {
  const keys = Object.keys(pending) as FeedSettingName[];
  if (keys.length === 0) return pending;
  const kept = keys.filter((key) => {
    const slot = pending[key];
    return (
      slot !== undefined && settings[key] !== slot.value && now - slot.sentAt < PENDING_TIMEOUT_MS
    );
  });
  if (kept.length === keys.length) return pending;
  return Object.fromEntries(kept.map((key) => [key, pending[key]]));
}
