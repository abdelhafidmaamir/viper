import { beforeAll, describe, expect, it } from 'vitest';

import { bootGame, type BootedGame } from './support/boot-game.ts';

const SIMULATED_MINUTES = 30;

let sim: BootedGame;

beforeAll(() => {
  sim = bootGame();
  Object.assign(sim.game.reglages, { mode: 'duel', dureeDuel: 120, avantage: 0 });
  sim.game.remettreScore();
  sim.game.razMoments();
  sim.game.nouvelleManche();
  // AI versus AI, rounds chaining on their own exactly as in the shipped app.
  for (let t = 0; t < SIMULATED_MINUTES * 60; t += 1 / 30) sim.step(1 / 30);
});

describe(`headless duel session (${String(SIMULATED_MINUTES)} simulated minutes)`, () => {
  it('chains rounds on its own', () => {
    expect(sim.game.manches().length).toBeGreaterThan(5);
  });

  it('records a valid outcome for every round', () => {
    for (const round of sim.game.manches()) {
      expect(['or', 'ombre', 'nul', 'sun']).toContain(round.camp);
      expect(round.duree).toBeGreaterThan(0);
    }
  });

  it('keeps the on-screen score within the number of decided rounds', () => {
    const { serpent, viewers } = sim.game.score();
    const decided = sim.game.manches().filter((round) => round.camp !== 'nul').length;
    expect(serpent + viewers).toBeLessThanOrEqual(decided);
  });

  it('reports no engine error', () => {
    expect(sim.game.mesures().erreurs).toBe(0);
  });
});
