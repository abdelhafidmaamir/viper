import { describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS, type ArenaCommand } from '../../src/shared/arena-protocol.ts';
import { linkArenaSide, pruneArenaPending } from '../../src/renderer/arena-control/arena-state.ts';

describe('arena control room', () => {
  it('keeps a sent setting until the game confirms it or it waits too long', () => {
    const pending = { places: { value: 12, sentAt: 1000 }, wildSnakes: { value: 0, sentAt: 1000 } };
    expect(pruneArenaPending(pending, { ...ARENA_DEFAULTS, places: 12 }, 1500)).toEqual({
      wildSnakes: { value: 0, sentAt: 1000 },
    });
    expect(pruneArenaPending(pending, ARENA_DEFAULTS, 3500)).toEqual({});
  });

  it('reads the board from the channel and shows a sent setting as pending', () => {
    let now = 1000;
    const sent: ArenaCommand[] = [],
      listeners: ((event: MessageEvent<unknown>) => void)[] = [];
    const side = linkArenaSide(
      {
        postMessage: (message) => sent.push(message),
        addEventListener: (_type, listener) => listeners.push(listener),
      },
      () => now,
    );
    const post = (data: unknown): void => {
      for (const listener of listeners) listener({ data } as MessageEvent<unknown>);
    };
    expect(side.state()).toBeNull();
    side.send({ cmd: 'arena-setting', name: 'places', value: 10 });
    expect(sent).toHaveLength(1);
    expect(side.pending().places?.value).toBe(10);
    // Feed's state on the same channel is not the board's.
    post({ feed: { fill: 0 } });
    expect(side.state()).toBeNull();
    now = 1400;
    post({ arena: { settings: { ...ARENA_DEFAULTS, places: 10 }, secondsLeft: 90 } });
    expect(side.state()?.secondsLeft).toBe(90);
    expect(side.pending()).toEqual({});
  });
});
