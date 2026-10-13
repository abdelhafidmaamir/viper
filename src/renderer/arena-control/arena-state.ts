/**
 * The arena's own state in its control room: the board as last published and the tuning values
 * sent but not confirmed yet. The Feed store (feed-control/store.ts) keeps everything else.
 * Nothing here touches the DOM.
 */
import {
  decodeArenaState,
  type ArenaCommand,
  type ArenaSettingName,
  type ArenaState,
} from '../../shared/arena-protocol.ts';
import type { PendingSlot } from '../feed-control/store.ts';

const PENDING_TIMEOUT_MS = 2000;

export type ArenaPending = Partial<Record<ArenaSettingName, PendingSlot>>;

/** Keeps the slots still waiting: not yet in the game's settings, and not sent too long ago. */
export function pruneArenaPending(
  pending: ArenaPending,
  settings: ArenaState['settings'],
  now: number,
): ArenaPending {
  const kept = (Object.keys(pending) as ArenaSettingName[]).filter((key) => {
    const slot = pending[key];
    return (
      slot !== undefined && settings[key] !== slot.value && now - slot.sentAt < PENDING_TIMEOUT_MS
    );
  });
  return Object.fromEntries(kept.map((key) => [key, pending[key]]));
}

export interface ArenaSide {
  /** The board's last state, or null before the first one arrives. */
  readonly state: () => ArenaState | null;
  readonly pending: () => ArenaPending;
  /** Sends a tuning value; it shows as sent until the game confirms it. */
  readonly send: (command: ArenaCommand) => void;
}

export interface ArenaSideChannel {
  readonly postMessage: (message: ArenaCommand) => void;
  readonly addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ) => void;
}

/** Listens for the board's state on the room's channel, next to the Feed state. */
export function linkArenaSide(channel: ArenaSideChannel, clock = Date.now): ArenaSide {
  let state: ArenaState | null = null,
    pending: ArenaPending = {};
  channel.addEventListener('message', ({ data }) => {
    const arena = decodeArenaState(data);
    if (!arena) return;
    state = arena;
    pending = pruneArenaPending(pending, arena.settings, clock());
  });
  return {
    state: () => state,
    pending: () => pending,
    send: (command) => {
      channel.postMessage(command);
      pending = { ...pending, [command.name]: { value: command.value, sentAt: clock() } };
    },
  };
}
