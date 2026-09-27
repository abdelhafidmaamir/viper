import { describe, expect, it, vi } from 'vitest';

import type { ControlCommand } from '../../../src/shared/control-protocol.ts';
import { createController } from '../../../src/renderer/control/controller.ts';
import { createCrowdDriver, type CrowdBrain } from '../../../src/renderer/control/crowd-driver.ts';
import { createStore, initialState } from '../../../src/renderer/control/store.ts';
import { LIVE_BRIDGE, gameState } from './fixtures.ts';

function setup() {
  let now = 1000;
  const sent: ControlCommand[] = [];
  const scheduled: { delayMs: number; run: () => void }[] = [];
  const brain: CrowdBrain = { configure: vi.fn(), tick: vi.fn(() => []), view: () => null };
  const store = createStore(initialState(true, now));
  const crowd = createCrowdDriver({
    brain,
    now: () => now,
    random: () => 0.5,
    every: () => () => undefined,
    emit: (event) => sent.push({ cmd: 'event', ev: event }),
  });
  const controller = createController({
    store,
    send: (command) => sent.push(command),
    crowd,
    now: () => now,
    schedule: (delayMs, run) => scheduled.push({ delayMs, run }),
  });
  controller.onState(gameState());
  return {
    store,
    controller,
    sent,
    scheduled,
    brain,
    advance: (ms: number) => {
      now += ms;
    },
    goLive: () => {
      controller.onState(gameState({ bridge: LIVE_BRIDGE }));
    },
  };
}

describe('controller', () => {
  it('sends exactly one new round for two presses', () => {
    const { controller, sent, store } = setup();
    controller.round();
    expect(sent).toEqual([]);
    expect(store.get().armed.kind).toBe('armed');
    controller.round();
    expect(sent).toEqual([{ cmd: 'round' }]);
    expect(store.get().armed.kind).toBe('idle');
  });

  it('lets the arm window lapse', () => {
    const { controller, sent, advance } = setup();
    controller.round();
    advance(3000);
    controller.round();
    expect(sent).toEqual([]);
  });

  it('disarms when anything else is done', () => {
    const { controller, sent } = setup();
    controller.round();
    controller.scene('race');
    controller.round();
    expect(sent).toEqual([{ cmd: 'scene', name: 'race', duration: 15 }]);
  });

  it('confirms the armed action with Enter and cancels with Escape', () => {
    const { controller, sent, store } = setup();
    controller.shortcut({ kind: 'round' });
    controller.shortcut({ kind: 'confirm' });
    expect(sent).toEqual([{ cmd: 'round' }]);
    controller.round();
    controller.shortcut({ kind: 'escape' });
    expect(store.get().armed.kind).toBe('idle');
  });

  it('stops a running scene with Escape when nothing is armed', () => {
    const { controller, sent } = setup();
    controller.onState(gameState({ scene: { name: 'ballet', remaining: 5, duration: 20 } }));
    controller.escape();
    expect(sent).toEqual([{ cmd: 'sceneStop' }]);
  });

  it('refuses every test injection ON AIR', () => {
    const { controller, sent, goLive, store } = setup();
    goLive();
    controller.gift(0);
    controller.likes();
    controller.testEvent('join');
    controller.testRanking();
    controller.testRanking();
    controller.crowd(2, 'battle');
    expect(sent).toEqual([]);
    expect(store.get().crowd.density).toBe(0);
    expect(
      store.get().log.entries.filter((entry) => entry.text.startsWith('Refused')),
    ).toHaveLength(6);
  });

  it('injects in rehearsal, with the ranking end scheduled and re-checked', () => {
    const { controller, sent, scheduled, goLive } = setup();
    controller.gift(1);
    expect(sent).toHaveLength(2);
    controller.testRanking();
    controller.testRanking();
    expect(sent).toHaveLength(8);
    expect(scheduled).toHaveLength(1);
    goLive();
    scheduled[0]?.run();
    expect(sent.at(-1)?.cmd).toBe('event');
  });

  it('stops the simulated crowd when TikFinity goes live', () => {
    const { controller, store, goLive, brain } = setup();
    controller.crowd(2, 'battle');
    expect(store.get().crowd.density).toBe(2);
    goLive();
    expect(store.get().crowd.density).toBe(0);
    expect(brain.configure).toHaveBeenLastCalledWith(0);
  });

  it('asks confirmation for risky settings only ON AIR', () => {
    const { controller, sent, goLive } = setup();
    controller.select('platform', 'neutral');
    expect(sent).toEqual([{ cmd: 'setting', name: 'platform', value: 'neutral' }]);
    goLive();
    controller.select('platform', 'tiktok');
    controller.select('giftDisplay', 'full');
    controller.toggle('aiDebug', true);
    expect(sent).toHaveLength(1);
    controller.shortcut({ kind: 'confirm' });
    expect(sent.at(-1)).toEqual({ cmd: 'setting', name: 'aiDebug', value: true });
    controller.select('giftDisplay', 'scroll');
    expect(sent.at(-1)).toEqual({ cmd: 'setting', name: 'giftDisplay', value: 'scroll' });
  });

  it('asks confirmation to disconnect only while connected', () => {
    const { controller, sent, goLive } = setup();
    controller.bridgeStop();
    expect(sent).toEqual([{ cmd: 'bridge-stop' }]);
    goLive();
    controller.bridgeStop();
    expect(sent).toHaveLength(1);
    controller.bridgeStop();
    expect(sent).toHaveLength(2);
  });

  it('connects with the edited URL', () => {
    const { controller, sent, store } = setup();
    store.dispatch({ type: 'bridge-url', url: ' ws://10.0.0.2:21213/ ' });
    controller.bridgeStart();
    expect(sent).toEqual([{ cmd: 'bridge-start', url: 'ws://10.0.0.2:21213/' }]);
  });

  it('nudges and clamps the advantage from the displayed value', () => {
    const { controller, sent } = setup();
    controller.shortcut({ kind: 'advantage', delta: 5 });
    controller.shortcut({ kind: 'advantage', delta: 5 });
    controller.setAdvantage(400);
    controller.shortcut({ kind: 'advantage-reset' });
    expect(sent.map((command) => (command.cmd === 'setting' ? command.value : null))).toEqual([
      5, 10, 100, 0,
    ]);
  });

  it('toggles assists from their displayed state and retries a failed one', () => {
    const { controller, sent, advance, store } = setup();
    controller.shortcut({ kind: 'toggle-underdog' });
    controller.shortcut({ kind: 'toggle-underdog' });
    expect(sent).toEqual([
      { cmd: 'setting', name: 'underdog', value: true },
      { cmd: 'setting', name: 'underdog', value: false },
    ]);
    controller.toggle('superAi', true);
    advance(1600);
    controller.onState(gameState());
    expect(store.get().settings.superAi.status).toBe('error');
    controller.retry('superAi');
    expect(sent.at(-1)).toEqual({ cmd: 'setting', name: 'superAi', value: true });
    expect(sent).toHaveLength(4);
  });
});
