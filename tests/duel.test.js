import { beforeAll, describe, expect, it } from 'vitest';
import { bootGame } from './support/boot-game.js';

/** @type {ReturnType<typeof bootGame>} */
let sim;

beforeAll(() => {
  sim = bootGame();
  const { game } = sim;
  game.reglages.mode = 'duel';
  game.reglages.dureeDuel = 120;
  game.reglages.avantage = 0;
  game.remettreScore();
  game.razMoments();
  game.nouvelleManche();
  // 30 simulated minutes of AI vs AI, rounds chaining on their own like in the shipped app.
  for (let t = 0; t < 30 * 60; t += 1 / 30) sim.step(1 / 30);
});

describe('headless duel session', () => {
  it('chains rounds on its own', () => {
    expect(sim.game.manches().length).toBeGreaterThan(5);
  });

  it('records a valid outcome for every round', () => {
    for (const round of sim.game.manches()) {
      expect(['or', 'ombre', 'nul', 'sun']).toContain(round.camp);
      expect(round.duree).toBeGreaterThan(0);
    }
  });

  it('keeps the on-screen score consistent with the round log', () => {
    const { serpent, viewers } = sim.game.score();
    const decided = sim.game
      .manches()
      .filter((/** @type {{ camp: string }} */ r) => r.camp !== 'nul');
    expect(serpent + viewers).toBeLessThanOrEqual(decided.length);
  });

  it('reports no engine error', () => {
    expect(sim.game.mesures().erreurs).toBe(0);
  });
});
