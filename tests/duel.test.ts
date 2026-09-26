import { beforeAll, describe, expect, it } from 'vitest';

import { bootGame, type BootedGame } from './support/boot-game.ts';

const SIMULATED_MINUTES = 30;

let sim: BootedGame;

beforeAll(() => {
  sim = bootGame();
  Object.assign(sim.game.settings, { mode: 'duel', duelDuration: 120, advantage: 0 });
  sim.game.resetScore();
  sim.game.resetMoments();
  sim.game.newRound();
  // AI versus AI, rounds chaining on their own exactly as in the shipped app.
  for (let t = 0; t < SIMULATED_MINUTES * 60; t += 1 / 30) sim.step(1 / 30);
});

describe(`headless duel session (${String(SIMULATED_MINUTES)} simulated minutes)`, () => {
  it('chains rounds on its own', () => {
    expect(sim.game.rounds().length).toBeGreaterThan(5);
  });

  it('records a valid outcome for every round', () => {
    for (const round of sim.game.rounds()) {
      expect(['gold', 'shadow', 'draw', 'sun']).toContain(round.team);
      expect(round.duration).toBeGreaterThan(0);
    }
  });

  it('keeps the on-screen score within the number of decided rounds', () => {
    const { snake: serpent, viewers } = sim.game.score();
    const decided = sim.game.rounds().filter((round) => round.team !== 'draw').length;
    expect(serpent + viewers).toBeLessThanOrEqual(decided);
  });

  it('reports no engine error', () => {
    expect(sim.game.metrics().errors).toBe(0);
  });
});
