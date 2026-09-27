import { describe, expect, it, vi } from 'vitest';

import { LOG_CAP, newCrowdLines } from '../../../src/renderer/control/log.ts';
import {
  EFFECT_TIMEOUT_MS,
  createStore,
  initialState,
  linkStatusOf,
  reduce,
  type Action,
  type ControlState,
} from '../../../src/renderer/control/store.ts';
import { LIVE_BRIDGE, gameState } from './fixtures.ts';

function run(state: ControlState, ...actions: Action[]): ControlState {
  return actions.reduce(reduce, state);
}

const texts = (state: ControlState): string[] => state.log.entries.map((entry) => entry.text);

describe('linkStatusOf', () => {
  it('uses the online, stale and offline thresholds', () => {
    expect(linkStatusOf(null, 5000)).toBe('waiting');
    expect(linkStatusOf(0, 1199)).toBe('online');
    expect(linkStatusOf(0, 1200)).toBe('stale');
    expect(linkStatusOf(0, 3000)).toBe('stale');
    expect(linkStatusOf(0, 3001)).toBe('offline');
  });
});

describe('reduce: state messages and ticks', () => {
  it('goes online on the first state and logs link transitions', () => {
    let state = run(initialState(true, 0), { type: 'state', state: gameState(), at: 100 });
    expect(state.link).toBe('online');
    expect(texts(state)).toEqual(['Game window online']);

    state = run(state, { type: 'tick', at: 1300 }, { type: 'tick', at: 1400 });
    expect(state.link).toBe('stale');
    state = run(state, { type: 'tick', at: 3200 });
    expect(state.link).toBe('offline');
    expect(texts(state).slice(1)).toEqual([
      'Game link stale: no update for over a second',
      'Game window not responding',
    ]);
  });

  it('logs bridge changes and errors by diffing states', () => {
    let state = run(initialState(true, 0), {
      type: 'state',
      state: gameState({ bridge: LIVE_BRIDGE }),
      at: 0,
    });
    state = run(state, {
      type: 'state',
      state: gameState({ bridge: { connected: false, error: 'socket closed' } }),
      at: 500,
    });
    expect(state.log.entries.filter((e) => e.source === 'bridge').map((e) => e.text)).toEqual([
      'TikFinity connected to ws://localhost:21213/',
      'TikFinity disconnected',
      'TikFinity error: socket closed',
    ]);
  });

  it('logs and timestamps an increase in engine errors', () => {
    let state = run(initialState(true, 0), { type: 'state', state: gameState(), at: 0 });
    state = run(state, { type: 'state', state: gameState({ metrics: { errors: 2 } }), at: 500 });
    expect(state.errorsRaisedAt).toBe(500);
    expect(state.log.entries.at(-1)).toMatchObject({ level: 'error', text: 'Engine errors: 2' });
  });

  it('keeps the scene and its measurement time', () => {
    const state = run(initialState(true, 0), {
      type: 'state',
      state: gameState({ scene: { name: 'race', remaining: 9, duration: 15 } }),
      at: 700,
    });
    expect(state.scene?.name).toBe('race');
    expect(state.sceneAt).toBe(700);
  });
});

describe('reduce: sent commands', () => {
  it('holds a setting pending until the echo arrives', () => {
    let state = run(initialState(true, 0), { type: 'state', state: gameState(), at: 0 });
    state = run(state, {
      type: 'sent',
      command: { cmd: 'setting', name: 'platform', value: 'neutral' },
      at: 100,
    });
    expect(state.settings.platform.status).toBe('pending');
    state = run(state, { type: 'state', state: gameState({ platform: 'neutral' }), at: 500 });
    expect(state.settings.platform.status).toBe('idle');
    expect(state.settings.platform.confirmed).toBe('neutral');
  });

  it('reports a setting that is not applied in time', () => {
    let state = run(initialState(true, 0), { type: 'state', state: gameState(), at: 0 });
    state = run(
      state,
      { type: 'sent', command: { cmd: 'setting', name: 'smooth', value: true }, at: 100 },
      { type: 'state', state: gameState(), at: 500 },
      { type: 'state', state: gameState(), at: 1000 },
      { type: 'tick', at: 1600 },
    );
    expect(state.settings.smooth.status).toBe('error');
    expect(texts(state)).toContain('Not applied: smooth mode');
  });

  it('freezes pending settings while the link is down', () => {
    let state = run(initialState(true, 0), { type: 'state', state: gameState(), at: 0 });
    state = run(
      state,
      { type: 'sent', command: { cmd: 'setting', name: 'smooth', value: true }, at: 1000 },
      { type: 'tick', at: 3500 },
    );
    expect(state.link).toBe('offline');
    expect(state.settings.smooth.status).toBe('pending');
  });

  it('marks unverifiable settings as such', () => {
    const state = run(initialState(true, 0), {
      type: 'sent',
      command: { cmd: 'setting', name: 'format', value: 'landscape' },
      at: 0,
    });
    expect(state.settings.format).toMatchObject({ status: 'unverified', confirmed: 'landscape' });
  });

  it('confirms a new round when the clock drops', () => {
    let state = run(initialState(true, 0), { type: 'state', state: gameState(), at: 0 });
    state = run(state, { type: 'sent', command: { cmd: 'round' }, at: 100 });
    expect(state.effects).toHaveLength(1);
    state = run(state, {
      type: 'state',
      state: gameState({
        duel: { t: 0.2, winner: null, gold: { length: 4 }, shadow: { length: 4 } },
      }),
      at: 500,
    });
    expect(state.effects).toHaveLength(0);
    expect(texts(state)).toEqual(['Game window online', 'New round', 'Confirmed: new round']);
  });

  it('warns when a fire-and-forget command shows no effect', () => {
    let state = run(initialState(true, 0), { type: 'state', state: gameState(), at: 0 });
    state = run(
      state,
      { type: 'sent', command: { cmd: 'scene', name: 'ballet', duration: 20 }, at: 0 },
      { type: 'state', state: gameState(), at: 500 },
      { type: 'state', state: gameState(), at: 1000 },
      { type: 'state', state: gameState(), at: EFFECT_TIMEOUT_MS - 200 },
      { type: 'tick', at: EFFECT_TIMEOUT_MS },
    );
    expect(state.effects).toHaveLength(0);
    expect(texts(state).at(-1)).toBe('No effect seen: scene start');
  });

  it('clears the scene at once on stop', () => {
    let state = run(initialState(true, 0), {
      type: 'state',
      state: gameState({ scene: { name: 'ballet', remaining: 12, duration: 20 } }),
      at: 0,
    });
    state = run(state, { type: 'sent', command: { cmd: 'sceneStop' }, at: 50 });
    expect(state.scene).toBeNull();
  });

  it('remembers the last tier test and skips logging quiet commands', () => {
    const state = run(
      initialState(true, 0),
      {
        type: 'sent',
        command: { cmd: 'event', ev: { type: 'viewers', total: 52 } as AudienceEvent },
        at: 0,
      },
      { type: 'sent', command: { cmd: 'event', ev: { type: 'gift' } }, at: 0, quiet: true },
    );
    expect(state.lastTier).toBe(52);
    expect(state.log.entries).toHaveLength(1);
  });
});

describe('reduce: ui and log', () => {
  it('refuses the admin tab outside admin mode', () => {
    const state = initialState(false, 0);
    expect(reduce(state, { type: 'tab', tab: 'admin' })).toBe(state);
    expect(reduce(state, { type: 'tab', tab: 'setup' }).ui.tab).toBe('setup');
  });

  it('caps the log and dismisses pinned errors', () => {
    let state = initialState(true, 0);
    for (let i = 0; i < LOG_CAP + 20; i += 1) {
      state = reduce(state, {
        type: 'note',
        at: i,
        entry: { source: 'link', level: i === LOG_CAP + 19 ? 'error' : 'info', text: String(i) },
      });
    }
    expect(state.log.entries).toHaveLength(LOG_CAP);
    expect(state.log.entries[0]?.text).toBe('20');
    const last = state.log.entries.at(-1);
    state = reduce(state, { type: 'log-dismiss', id: last?.id ?? -1 });
    expect(state.log.entries.at(-1)?.dismissed).toBe(true);
  });

  it('logs the crowd brain decisions once each', () => {
    const view = (log: string[]) => ({
      density: 2,
      mode: 'battle' as const,
      effectiveMode: 'battle' as const,
      sentGifts: 0,
      view: {
        log,
        gold: { fervor: 0.3, spend: 0, counts: { boost: 0, steal: 0, shield: 0, life: 0 } },
        shadow: { fervor: 0.3, spend: 0, counts: { boost: 0, steal: 0, shield: 0, life: 0 } },
      },
    });
    let state = reduce(initialState(true, 0), { type: 'crowd', crowd: view(['a']), at: 0 });
    state = reduce(state, { type: 'crowd', crowd: view(['c', 'b', 'a']), at: 1 });
    state = reduce(state, { type: 'crowd', crowd: view(['c', 'b', 'a']), at: 2 });
    expect(texts(state)).toEqual(['a', 'b', 'c']);
    expect(newCrowdLines(['x'], ['z', 'y'])).toEqual(['y', 'z']);
  });
});

describe('createStore', () => {
  it('notifies listeners on change only', () => {
    const store = createStore(initialState(false, 0));
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.dispatch({ type: 'tab', tab: 'admin' });
    expect(listener).not.toHaveBeenCalled();
    store.dispatch({ type: 'tab', tab: 'rehearsal' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.dispatch({ type: 'tab', tab: 'live' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get().ui.tab).toBe('live');
  });
});
