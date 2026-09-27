/** The control room's end of the channel to the game window. */
import type { ControlCommand, GameState } from '../../shared/control-protocol.ts';

import { decodeStateMessage } from './decode.ts';

/** The slice of `BroadcastChannel` the link uses; a fake one drives it in tests. */
export interface ChannelPort {
  postMessage(message: ControlCommand): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
  readonly close: () => void;
}

export interface GameLink {
  readonly send: (command: ControlCommand) => void;
  readonly close: () => void;
}

export function openLink(channel: ChannelPort, onState: (state: GameState) => void): GameLink {
  channel.addEventListener('message', (event) => {
    const state = decodeStateMessage(event.data);
    if (state) onState(state);
  });
  return {
    send: (command) => {
      channel.postMessage(command);
    },
    close: () => {
      channel.close();
    },
  };
}
