import { describe, expect, it, vi } from 'vitest';

import {
  RANDOM_TICK_MS,
  createCrowdDriver,
  giftValue,
  randomGift,
  type CrowdBrain,
} from '../../../src/renderer/control/crowd-driver.ts';

/** A random source replaying fixed values in a loop. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
}

function harness(brain: CrowdBrain | null) {
  let now = 0;
  const timers: { ms: number; run: () => void; cancelled: boolean }[] = [];
  const emitted: AudienceEvent[] = [];
  const driver = createCrowdDriver({
    brain,
    now: () => now,
    random: sequence(0.1, 0.1, 0),
    every: (ms, run) => {
      const timer = { ms, run, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    emit: (event) => emitted.push(event),
  });
  return {
    driver,
    timers,
    emitted,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function fakeBrain(events: AudienceEvent[] = []): CrowdBrain & {
  configure: ReturnType<typeof vi.fn>;
  tick: ReturnType<typeof vi.fn>;
} {
  return {
    configure: vi.fn<(level: number) => void>(),
    tick: vi.fn(() => events),
    view: () => ({ log: ['Gold: shield (just took a hit)'], gold: { fervor: 0.8, spend: 30 } }),
  };
}

describe('random crowd', () => {
  it('draws gift values by rarity', () => {
    expect(giftValue(0)).toBe(100);
    expect(giftValue(1 / 40)).toBe(30);
    expect(giftValue(1 / 20)).toBe(20);
    expect(giftValue(0.1)).toBe(10);
    expect(giftValue(0.5)).toBe(1);
  });

  it('sends a gift only when the draw falls under the level rate', () => {
    expect(randomGift(0, sequence(0.1, 0.1, 0, 0.5))).toBeNull();
    expect(randomGift(550, sequence(0.9, 0.5, 0.001, 0.5))).toEqual({
      type: 'gift',
      n: 1,
      value: 1,
      name: 'rosa',
      nickname: 'lucas.b',
      team: 'shadow',
    });
  });

  it('runs a timer in random mode and stops it on reconfiguration', () => {
    const { driver, timers, emitted } = harness(null);
    driver.configure(3, 'random');
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(RANDOM_TICK_MS);
    timers[0]?.run();
    expect(emitted).toHaveLength(1);
    expect(driver.status().sentGifts).toBe(1);
    driver.configure(0, 'random');
    expect(timers[0]?.cancelled).toBe(true);
    expect(driver.status().sentGifts).toBe(0);
  });

  it('falls back to random when Team Battle has no brain', () => {
    const { driver, timers } = harness(null);
    driver.configure(1, 'battle');
    expect(driver.status().effectiveMode).toBe('random');
    expect(timers).toHaveLength(1);
  });
});

describe('Team Battle crowd', () => {
  it('advances the brain on each state with the elapsed time, capped', () => {
    const gift: AudienceEvent = { type: 'gift', n: 1, value: 30, team: 'gold' };
    const brain = fakeBrain([gift]);
    const { driver, timers, emitted, advance } = harness(brain);
    driver.configure(2, 'battle');
    expect(brain.configure).toHaveBeenCalledWith(2);
    expect(timers).toHaveLength(0);

    driver.onState({ inProgress: true });
    expect(brain.tick).toHaveBeenLastCalledWith({ inProgress: true }, 0.5);
    advance(500);
    driver.onState({});
    expect(brain.tick).toHaveBeenLastCalledWith({}, 0.5);
    advance(10_000);
    driver.onState({});
    expect(brain.tick).toHaveBeenLastCalledWith({}, 1.5);

    expect(emitted).toEqual([gift, gift, gift]);
    expect(driver.status().sentGifts).toBe(3);
    expect(driver.status().view?.gold.fervor).toBe(0.8);
  });

  it('does nothing at density zero and resets the brain', () => {
    const brain = fakeBrain();
    const { driver } = harness(brain);
    driver.configure(0, 'battle');
    driver.onState({});
    expect(brain.tick).not.toHaveBeenCalled();
    expect(brain.configure).toHaveBeenCalledWith(0);
  });

  it('configures the brain at zero in random mode', () => {
    const brain = fakeBrain();
    const { driver } = harness(brain);
    driver.configure(2, 'random');
    expect(brain.configure).toHaveBeenCalledWith(0);
    driver.onState({});
    expect(brain.tick).not.toHaveBeenCalled();
  });
});
