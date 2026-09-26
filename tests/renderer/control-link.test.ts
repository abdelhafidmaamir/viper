import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyCommand,
  linkControlRoom,
  restorePreferences,
  snapshot,
  type ChannelLike,
  type GameLinkDeps,
} from '../../src/renderer/game/control-link.ts';
import type { GameStateMessage } from '../../src/shared/control-protocol.ts';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

function fakeDeps(storage = fakeStorage()) {
  const game = {
    settings: {
      mode: 'base',
      platform: 'tiktok',
      donorNames: true,
      smooth: false,
      weather: 'rain',
      advantage: 0,
    } as unknown as GameSettings,
    newRound: vi.fn(),
    setHour: vi.fn(),
    launchScene: vi.fn(),
    stopScene: vi.fn(),
    scene: vi.fn(() => null),
    endTest: vi.fn(),
    metrics: vi.fn(() => ({ errors: 0, lastError: null, t: 0 })),
    duel: vi.fn((): DuelSnapshot | null => null),
  } satisfies GameApi;
  const bridge = {
    start: vi.fn(),
    stop: vi.fn(),
    process: vi.fn(),
    state: vi.fn(() => ({ connected: false })),
  } satisfies TikFinityBridge;
  const deps = {
    game,
    bridge,
    receiveEvent: vi.fn(),
    readCrowd: vi.fn(() => null),
    storage,
  } satisfies GameLinkDeps;
  return { deps, game, bridge, storage };
}

describe('restorePreferences', () => {
  it('applies stored values that depart from the defaults', () => {
    const { deps, game } = fakeDeps(
      fakeStorage({ 'viper-platform': 'neutral', 'viper-donor-names': '0', 'viper-smooth': '1' }),
    );
    restorePreferences(deps);
    expect(game.settings).toMatchObject({
      platform: 'neutral',
      donorNames: false,
      smooth: true,
    });
  });

  it('ignores unknown or default-equivalent values', () => {
    const { deps, game } = fakeDeps(
      fakeStorage({ 'viper-platform': 'youtube', 'viper-donor-names': '1', 'viper-smooth': '0' }),
    );
    restorePreferences(deps);
    expect(game.settings).toMatchObject({
      platform: 'tiktok',
      donorNames: true,
      smooth: false,
    });
  });

  it('reads choices saved under the pre-rename keys and encodings', () => {
    const { deps, game } = fakeDeps(
      fakeStorage({ 'vipere-plateforme': 'neutre', 'vipere-noms': '0', 'vipere-fluide': '1' }),
    );
    restorePreferences(deps);
    expect(game.settings).toMatchObject({
      platform: 'neutral',
      donorNames: false,
      smooth: true,
    });
  });

  it('prefers the current key over the legacy one', () => {
    const { deps, game } = fakeDeps(
      fakeStorage({ 'viper-platform': 'tiktok', 'vipere-plateforme': 'neutre' }),
    );
    restorePreferences(deps);
    expect(game.settings.platform).toBe('tiktok');
  });

  it('survives a storage that throws', () => {
    const { deps } = fakeDeps({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
    } as unknown as ReturnType<typeof fakeStorage>);
    expect(() => {
      restorePreferences(deps);
    }).not.toThrow();
  });
});

describe('applyCommand', () => {
  it('routes audience events and raw bridge messages', () => {
    const { deps, bridge } = fakeDeps();
    applyCommand({ cmd: 'event', ev: { type: 'like', n: 3 } }, deps);
    applyCommand({ cmd: 'raw', message: { event: 'gift' } }, deps);
    expect(deps.receiveEvent).toHaveBeenCalledWith({ type: 'like', n: 3 });
    expect(bridge.process).toHaveBeenCalledWith({ event: 'gift' });
  });

  it('starts and stops the bridge', () => {
    const { deps, bridge } = fakeDeps();
    applyCommand({ cmd: 'bridge-start', url: 'ws://localhost:21213/' }, deps);
    applyCommand({ cmd: 'bridge-stop' }, deps);
    expect(bridge.start).toHaveBeenCalledWith('ws://localhost:21213/');
    expect(bridge.stop).toHaveBeenCalledOnce();
  });

  it('starts a new duel round', () => {
    const { deps, game } = fakeDeps();
    applyCommand({ cmd: 'round' }, deps);
    expect(game.settings.mode).toBe('duel');
    expect(game.newRound).toHaveBeenCalledOnce();
  });

  it('applies known settings and persists the ones that survive a restart', () => {
    const { deps, game, storage } = fakeDeps();
    applyCommand({ cmd: 'setting', name: 'weather', value: 'snow' }, deps);
    applyCommand({ cmd: 'setting', name: 'platform', value: 'neutral' }, deps);
    applyCommand({ cmd: 'setting', name: 'donorNames', value: false }, deps);
    expect(game.settings).toMatchObject({ weather: 'snow', platform: 'neutral' });
    expect(Object.fromEntries(storage.data)).toEqual({
      'viper-platform': 'neutral',
      'viper-donor-names': '0',
    });
  });

  it('ignores settings the engine does not have, including inherited names', () => {
    const { deps, game } = fakeDeps();
    applyCommand({ cmd: 'setting', name: '__proto__', value: { polluted: true } }, deps);
    applyCommand({ cmd: 'setting', name: 'unknown', value: 1 }, deps);
    expect(game.settings).not.toHaveProperty('unknown');
    expect(Object.getPrototypeOf(game.settings)).toBe(Object.prototype);
  });

  it('drives staged scenes and test endings', () => {
    const { deps, game } = fakeDeps();
    applyCommand({ cmd: 'scene', name: 'face', duration: 15 }, deps);
    applyCommand({ cmd: 'sceneStop' }, deps);
    applyCommand({ cmd: 'endTest', team: 'shadow' }, deps);
    expect(game.launchScene).toHaveBeenCalledWith('face', 15);
    expect(game.stopScene).toHaveBeenCalledOnce();
    expect(game.endTest).toHaveBeenCalledWith('shadow');
  });
});

describe('snapshot', () => {
  it('reports the duel in the wire format the control room reads', () => {
    const { deps, game } = fakeDeps();
    game.duel.mockReturnValue({
      t: 42,
      winner: null,
      gold: { length: 9 },
      shadow: { length: 12 },
    });
    expect(snapshot(deps)).toMatchObject({
      bridge: { connected: false },
      platform: 'tiktok',
      donorNames: true,
      duel: { t: 42, winner: null, gold: { length: 9 }, shadow: { length: 12 } },
      metrics: { errors: 0 },
    });
  });

  it('reports no duel between rounds', () => {
    const { deps } = fakeDeps();
    expect(snapshot(deps).duel).toBeNull();
  });
});

describe('linkControlRoom', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function fakeChannel() {
    let listener: ((event: MessageEvent<unknown>) => void) | undefined;
    const posted: GameStateMessage[] = [];
    const channel: ChannelLike = {
      postMessage: (message) => void posted.push(message),
      addEventListener: (_type, handler) => {
        listener = handler;
      },
      close: vi.fn(),
    };
    const deliver = (data: unknown) => listener?.({ data } as MessageEvent<unknown>);
    return { channel, posted, deliver };
  }

  it('publishes state twice per second until disposed', () => {
    const { deps } = fakeDeps();
    const { channel, posted } = fakeChannel();
    const dispose = linkControlRoom(deps, channel);

    vi.advanceTimersByTime(1000);
    expect(posted).toHaveLength(2);

    dispose();
    vi.advanceTimersByTime(1000);
    expect(posted).toHaveLength(2);
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('ignores payloads that are not commands', () => {
    const { deps, game } = fakeDeps();
    const { channel, deliver } = fakeChannel();
    linkControlRoom(deps, channel);

    for (const payload of [null, 'round', { cmd: 'unknown' }, { state: {} }]) deliver(payload);

    expect(game.newRound).not.toHaveBeenCalled();
  });

  it('logs a failing command and keeps listening', () => {
    const { deps, game } = fakeDeps();
    const { channel, deliver } = fakeChannel();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    game.stopScene.mockImplementation(() => {
      throw new Error('boom');
    });
    linkControlRoom(deps, channel);

    deliver({ cmd: 'sceneStop' });
    deliver({ cmd: 'round' });

    expect(logged).toHaveBeenCalledWith('[control] "sceneStop" failed', expect.any(Error));
    expect(game.newRound).toHaveBeenCalledOnce();
  });
});
