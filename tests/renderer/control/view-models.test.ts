import { describe, expect, it } from 'vitest';

import { press } from '../../../src/renderer/control/confirm.ts';
import { initialState, reduce, type ControlState } from '../../../src/renderer/control/store.ts';
import {
  LINK_LOCK,
  ON_AIR_LOCK,
  armVm,
  crowdVm,
  locksVm,
  settingVm,
} from '../../../src/renderer/control/view-models/controls.ts';
import {
  advantageVm,
  badgesFor,
  clampAdvantage,
  sceneCardVm,
} from '../../../src/renderer/control/view-models/director.ts';
import { formatTime, logVm } from '../../../src/renderer/control/view-models/log.ts';
import { formatClock, statusBarVm } from '../../../src/renderer/control/view-models/status.ts';
import { LIVE_BRIDGE, gameState } from './fixtures.ts';

function received(overrides: Parameters<typeof gameState>[0] = {}, at = 0): ControlState {
  return reduce(initialState(true, 0), { type: 'state', state: gameState(overrides), at });
}

const at = (state: ControlState, now: number): ControlState =>
  reduce(state, { type: 'tick', at: now });

describe('status bar', () => {
  it('formats the round clock', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(134.9)).toBe('02:14');
    expect(formatClock(-3)).toBe('00:00');
    expect(formatClock(Number.NaN)).toBe('00:00');
  });

  it('shows the score, leader and winner', () => {
    const vm = statusBarVm(
      received({ duel: { t: 61, winner: 'gold', gold: { length: 14 }, shadow: { length: 11 } } }),
    );
    expect(vm).toMatchObject({ clock: '01:01', gold: 14, shadow: 11, leader: 'gold' });
    expect(vm.winner).toBe('Gold wins');
    expect(vm.winnerTeam).toBe('gold');
  });

  it('says when there is no duel and when values are only last known', () => {
    expect(statusBarVm(received({ duel: null })).clock).toBe('No duel');
    const stale = at(received(), 1500);
    expect(statusBarVm(stale).lastKnown).toBe(true);
    expect(statusBarVm(stale).game).toMatchObject({ tone: 'warn', metric: '1.5 s' });
  });

  it('grades the game pill with the link', () => {
    expect(statusBarVm(initialState(false, 0)).game).toMatchObject({
      tone: 'danger',
      metric: 'waiting',
    });
    expect(statusBarVm(at(received(), 400)).game.tone).toBe('ok');
    expect(statusBarVm(at(received(), 3001)).game.tone).toBe('danger');
  });

  it('shows ON AIR, the bridge counts and hides the tier while live', () => {
    const vm = statusBarVm(received({ bridge: LIVE_BRIDGE }));
    expect(vm.onAir).toBe(true);
    expect(vm.bridge).toMatchObject({ tone: 'live', metric: '1,204 ev / 87 gifts' });
    expect(vm.tier).toBe('n/a');
  });

  it('reports a bridge error and the debug overlay', () => {
    const vm = statusBarVm(received({ bridge: { error: 'refused' }, aiDebug: true }));
    expect(vm.bridge).toMatchObject({ tone: 'danger', title: 'refused' });
    expect(vm.debugOverlay).toBe(true);
  });

  it('adds the last sent format as unverified', () => {
    const state = reduce(received(), {
      type: 'sent',
      command: { cmd: 'setting', name: 'format', value: 'landscape' },
      at: 0,
    });
    expect(statusBarVm(state)).toMatchObject({
      output: 'TikTok Landscape 16:9',
      outputUnverified: true,
    });
    expect(statusBarVm(received()).outputUnverified).toBe(false);
  });
});

describe('scene card', () => {
  const running = received({
    scene: { name: 'ballet', remaining: 10, duration: 20, gold: { stance: 'attack' } },
  });

  it('renders the gauge of the active scene (regression: the old gauge never rendered)', () => {
    const vm = sceneCardVm(at(running, 2000));
    const ballet = vm.buttons.find((button) => button.name === 'ballet');
    expect(ballet).toMatchObject({ active: true, countdown: '8s' });
    expect(ballet?.fraction).toBeCloseTo(0.4);
    expect(vm.buttons.filter((button) => button.active)).toHaveLength(1);
    expect(vm.status).toBe('Ballet active, 8 s left');
    expect(vm.effects?.gold).toEqual([{ text: 'attack', tone: 'hot' }]);
  });

  it('never drains below zero', () => {
    const vm = sceneCardVm(at(running, 60_000));
    expect(vm.buttons[0]?.fraction).toBe(0);
    expect(vm.buttons[0]?.countdown).toBe('0s');
  });

  it('mentions the underdog when idle', () => {
    expect(sceneCardVm(received({ underdog: true })).status).toBe(
      'No active scene, underdog running',
    );
    expect(sceneCardVm(received()).effects).toBeNull();
  });

  it('describes scene levers', () => {
    expect(badgesFor({ pA: 20, hunt: 1, flair: 0.05, noKill: true, immediateTrap: true })).toEqual([
      { text: 'range 20/10', tone: 'plain' },
      { text: 'hunt 100%', tone: 'hot' },
      { text: 'flair 5%', tone: 'plain' },
      { text: 'no lethal blow', tone: 'cold' },
      { text: 'trap', tone: 'hot' },
    ]);
  });
});

describe('advantage', () => {
  it('reads as a team and an amount', () => {
    expect(advantageVm(0)).toEqual({
      value: 0,
      text: 'Neutral',
      valueText: 'Neutral',
      leaning: null,
    });
    expect(advantageVm(20)).toMatchObject({
      text: 'Gold +20',
      valueText: 'Gold plus 20',
      leaning: 'gold',
    });
    expect(advantageVm(-15)).toMatchObject({ text: 'Shadow +15', leaning: 'shadow' });
    expect(clampAdvantage(250)).toBe(100);
    expect(clampAdvantage(-101)).toBe(-100);
  });
});

describe('locks and controls', () => {
  it('locks injections ON AIR and live actions when the game is down', () => {
    expect(locksVm(received({ bridge: LIVE_BRIDGE }))).toEqual({
      onAir: true,
      injectionLock: ON_AIR_LOCK,
      linkLock: null,
    });
    expect(locksVm(received())).toEqual({ onAir: false, injectionLock: null, linkLock: null });
    expect(locksVm(initialState(true, 0)).linkLock).toBe(LINK_LOCK);
    expect(locksVm(at(received(), 3001)).injectionLock).toBe(LINK_LOCK);
  });

  it('exposes the displayed value and status of a setting', () => {
    const state = reduce(received(), {
      type: 'sent',
      command: { cmd: 'setting', name: 'underdog', value: true },
      at: 0,
    });
    expect(settingVm(state, 'underdog')).toEqual({ value: true, status: 'pending' });
  });

  it('drains the arm ring', () => {
    const armed = reduce(at(received(), 1000), {
      type: 'armed',
      armed: press({ kind: 'idle' }, 'round', 0).state,
    });
    expect(armVm(armed, 'round')).toMatchObject({ armed: true });
    expect(armVm(armed, 'round').fraction).toBeCloseTo(2 / 3);
    expect(armVm(armed, 'bridge-stop').armed).toBe(false);
  });

  it('describes the crowd and pauses Team Battle with the link', () => {
    const crowd = {
      density: 2,
      mode: 'battle' as const,
      effectiveMode: 'battle' as const,
      sentGifts: 4,
      view: {
        log: [],
        gold: { fervor: 0.6, spend: 41.6, counts: { boost: 1, steal: 0, shield: 1, life: 0 } },
        shadow: { fervor: 0.2, spend: 0, counts: { boost: 0, steal: 0, shield: 0, life: 0 } },
      },
    };
    const state = reduce(received(), { type: 'crowd', crowd, at: 0 });
    const vm = crowdVm(state);
    expect(vm.status).toBe('Lively: two fan teams back their snake. Sent: 4 gifts.');
    expect(vm.gold.line).toBe('42 coins | boost 1, steal 0, shield 1, life 0');
    expect(vm.showTeams).toBe(true);
    expect(vm.paused).toBe(false);
    expect(crowdVm(at(state, 1300)).paused).toBe(true);
    expect(crowdVm(initialState(true, 0)).status).toBe('None: no simulated viewer.');
  });
});

describe('event log', () => {
  it('filters rows and pins the latest undismissed errors', () => {
    let state = initialState(true, 0);
    const notes = [
      { source: 'cmd', level: 'info', text: 'New round' },
      { source: 'bridge', level: 'error', text: 'e1' },
      { source: 'crowd', level: 'info', text: 'Gold: boost' },
      { source: 'link', level: 'error', text: 'e2' },
      { source: 'link', level: 'error', text: 'e3' },
      { source: 'link', level: 'error', text: 'e4' },
    ] as const;
    for (const entry of notes) state = reduce(state, { type: 'note', entry, at: 0 });
    const all = logVm(state.log, 'all');
    expect(all.rows).toHaveLength(6);
    expect(all.pinned.map((row) => row.text)).toEqual(['e2', 'e3', 'e4']);
    expect(all.pinnedTotal).toBe(4);
    expect(logVm(state.log, 'errors').rows).toHaveLength(4);
    expect(logVm(state.log, 'crowd').rows.map((row) => row.tag)).toEqual(['CROWD']);
    expect(logVm(state.log, 'cmd').rows.map((row) => row.text)).toEqual(['New round']);
  });

  it('formats times as local hh:mm:ss', () => {
    const date = new Date(2026, 0, 1, 9, 5, 7);
    expect(formatTime(date.getTime())).toBe('09:05:07');
  });
});
