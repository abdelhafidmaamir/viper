import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** A TikFinity gift message, as the WebSocket delivers it. */
const msg = (
  repeatCount: number,
  repeatEnd: boolean,
  { user = 'fan', gift = 'Rosa', streak = true } = {},
) => ({
  event: 'gift',
  data: {
    giftType: streak ? 1 : 2,
    giftName: gift,
    diamondCount: gift === 'Rosa' ? 10 : 1,
    repeatCount,
    repeatEnd,
    uniqueId: user,
    nickname: user,
  },
});

interface Got {
  user: string;
  gift: string;
  n: number;
}
let got: Got[] = [];
const total = (user = 'fan', gift = 'Rosa'): number =>
  got.filter((g) => g.user === user && g.gift === gift).reduce((a, g) => a + g.n, 0);
const send = (m: ReturnType<typeof msg>): void => {
  window.TikFinityBridge.process(m);
};

describe('live streaks (Feed): whatever a viewer pays is counted once, no matter how it arrives', () => {
  beforeAll(async () => {
    (globalThis as unknown as { window: unknown }).window = globalThis;
    await import('../../src/renderer/scripts/tikfinity-bridge.ts');
  });

  beforeEach(() => {
    got = [];
    window.receiveEvent = (ev) => {
      got.push({ user: String(ev.nickname), gift: String(ev.name), n: Number(ev.n) });
      return 1;
    };
    window.TikFinityBridge.liveStreaks?.(true);
  });

  it('a burst pays each step at once and exactly its size in total', () => {
    for (let i = 1; i <= 5; i++) send(msg(i, false));
    send(msg(5, true));
    expect(got.map((g) => g.n)).toEqual([1, 1, 1, 1, 1]);
  });

  it('a slow burst with jumps in the count pays the difference each time', () => {
    send(msg(1, false));
    send(msg(3, false));
    send(msg(3, false)); // the same step twice pays nothing more
    send(msg(7, true));
    expect(total()).toBe(7);
  });

  it('pays in full when the final message never comes', () => {
    send(msg(2, false));
    send(msg(5, false));
    expect(total()).toBe(5);
  });

  it('only the final message: pays all of it', () => {
    send(msg(4, true));
    expect(total()).toBe(4);
  });

  it('a new burst before the last one ended is paid too', () => {
    send(msg(3, false)); // its final message is lost
    send(msg(1, false)); // a new streak starts at 1
    send(msg(2, true));
    expect(total()).toBe(5);
  });

  it('two viewers bursting at the same time are kept apart', () => {
    send(msg(1, false, { user: 'a' }));
    send(msg(1, false, { user: 'b' }));
    send(msg(2, false, { user: 'a' }));
    send(msg(3, true, { user: 'b' }));
    send(msg(2, true, { user: 'a' }));
    expect([total('a'), total('b')]).toEqual([2, 3]);
  });

  it('one viewer mixing Rose and Rosa streaks gets both', () => {
    send(msg(2, false, { gift: 'Rose' }));
    send(msg(1, false, { gift: 'Rosa' }));
    send(msg(4, true, { gift: 'Rose' }));
    send(msg(1, true, { gift: 'Rosa' }));
    expect([total('fan', 'Rose'), total('fan', 'Rosa')]).toEqual([4, 1]);
  });

  it('a gift that is not a streak counts at once, every time', () => {
    send(msg(1, false, { streak: false }));
    send(msg(1, false, { streak: false }));
    send(msg(2, true, { streak: false }));
    expect(total()).toBe(4);
  });

  it('a follow sent as a social message is a follow, and counted once', () => {
    const seen: string[] = [];
    window.receiveEvent = (ev) => {
      seen.push(`${ev.type}:${String(ev.nickname)}`);
      return 1;
    };
    const social = (displayType: string, user: string) => ({
      event: 'social',
      data: { displayType, label: '{0:user} followed the host', uniqueId: user, nickname: user },
    });
    window.TikFinityBridge.process(social('pm_main_follow_message_viewer_2', 'moe'));
    window.TikFinityBridge.process({ event: 'follow', data: { uniqueId: 'moe', nickname: 'moe' } });
    window.TikFinityBridge.process({
      event: 'social',
      data: {
        displayType: 'pm_mt_guidance_share',
        label: '{0:user} shared the LIVE',
        uniqueId: 'lou',
        nickname: 'lou',
      },
    });
    expect(seen).toEqual(['follow:moe', 'share:lou']);
  });
});
