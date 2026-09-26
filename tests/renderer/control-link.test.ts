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
    reglages: {
      mode: 'base',
      plateforme: 'tiktok',
      nomsDonateurs: true,
      fluide: false,
      meteo: 'pluie',
      avantage: 0,
    } as unknown as GameSettings,
    nouvelleManche: vi.fn(),
    reglerHeure: vi.fn(),
    lancerScene: vi.fn(),
    stopScene: vi.fn(),
    scene: vi.fn(() => null),
    finirTest: vi.fn(),
    mesures: vi.fn(() => ({ erreurs: 0, derniereErreur: null, t: 0 })),
    duel: vi.fn((): DuelSnapshot | null => null),
  } satisfies GameApi;
  const bridge = {
    demarrer: vi.fn(),
    arreter: vi.fn(),
    traiter: vi.fn(),
    etat: vi.fn(() => ({ connecte: false })),
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
      fakeStorage({ 'vipere-plateforme': 'neutre', 'vipere-noms': '0', 'vipere-fluide': '1' }),
    );
    restorePreferences(deps);
    expect(game.reglages).toMatchObject({
      plateforme: 'neutre',
      nomsDonateurs: false,
      fluide: true,
    });
  });

  it('ignores unknown or default-equivalent values', () => {
    const { deps, game } = fakeDeps(
      fakeStorage({ 'vipere-plateforme': 'youtube', 'vipere-noms': '1', 'vipere-fluide': '0' }),
    );
    restorePreferences(deps);
    expect(game.reglages).toMatchObject({
      plateforme: 'tiktok',
      nomsDonateurs: true,
      fluide: false,
    });
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
    applyCommand({ cmd: 'evenement', ev: { type: 'like', n: 3 } }, deps);
    applyCommand({ cmd: 'brut', message: { event: 'gift' } }, deps);
    expect(deps.receiveEvent).toHaveBeenCalledWith({ type: 'like', n: 3 });
    expect(bridge.traiter).toHaveBeenCalledWith({ event: 'gift' });
  });

  it('starts and stops the bridge', () => {
    const { deps, bridge } = fakeDeps();
    applyCommand({ cmd: 'pont-demarrer', url: 'ws://localhost:21213/' }, deps);
    applyCommand({ cmd: 'pont-arreter' }, deps);
    expect(bridge.demarrer).toHaveBeenCalledWith('ws://localhost:21213/');
    expect(bridge.arreter).toHaveBeenCalledOnce();
  });

  it('starts a new duel round', () => {
    const { deps, game } = fakeDeps();
    applyCommand({ cmd: 'manche' }, deps);
    expect(game.reglages.mode).toBe('duel');
    expect(game.nouvelleManche).toHaveBeenCalledOnce();
  });

  it('applies known settings and persists the ones that survive a restart', () => {
    const { deps, game, storage } = fakeDeps();
    applyCommand({ cmd: 'reglage', nom: 'meteo', valeur: 'neige' }, deps);
    applyCommand({ cmd: 'reglage', nom: 'plateforme', valeur: 'neutre' }, deps);
    applyCommand({ cmd: 'reglage', nom: 'nomsDonateurs', valeur: false }, deps);
    expect(game.reglages).toMatchObject({ meteo: 'neige', plateforme: 'neutre' });
    expect(Object.fromEntries(storage.data)).toEqual({
      'vipere-plateforme': 'neutre',
      'vipere-noms': '0',
    });
  });

  it('ignores settings the engine does not have, including inherited names', () => {
    const { deps, game } = fakeDeps();
    applyCommand({ cmd: 'reglage', nom: '__proto__', valeur: { polluted: true } }, deps);
    applyCommand({ cmd: 'reglage', nom: 'unknown', valeur: 1 }, deps);
    expect(game.reglages).not.toHaveProperty('unknown');
    expect(Object.getPrototypeOf(game.reglages)).toBe(Object.prototype);
  });

  it('drives staged scenes and test endings', () => {
    const { deps, game } = fakeDeps();
    applyCommand({ cmd: 'scene', nom: 'face', duree: 15 }, deps);
    applyCommand({ cmd: 'sceneStop' }, deps);
    applyCommand({ cmd: 'finTest', camp: 'ombre' }, deps);
    expect(game.lancerScene).toHaveBeenCalledWith('face', 15);
    expect(game.stopScene).toHaveBeenCalledOnce();
    expect(game.finirTest).toHaveBeenCalledWith('ombre');
  });
});

describe('snapshot', () => {
  it('reports the duel in the wire format the control room reads', () => {
    const { deps, game } = fakeDeps();
    game.duel.mockReturnValue({
      t: 42,
      vainqueur: null,
      or: { longueur: 9 },
      ombre: { longueur: 12 },
    });
    expect(snapshot(deps)).toMatchObject({
      pont: { connecte: false },
      plateforme: 'tiktok',
      nomsDonateurs: true,
      duel: { t: 42, vainqueur: null, or: { longueur: 9 }, ombre: { longueur: 12 } },
      mesures: { erreurs: 0 },
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

    for (const payload of [null, 'manche', { cmd: 'unknown' }, { etat: {} }]) deliver(payload);

    expect(game.nouvelleManche).not.toHaveBeenCalled();
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
    deliver({ cmd: 'manche' });

    expect(logged).toHaveBeenCalledWith('[control] "sceneStop" failed', expect.any(Error));
    expect(game.nouvelleManche).toHaveBeenCalledOnce();
  });
});
