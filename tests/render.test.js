import { beforeAll, describe, expect, it } from 'vitest';
import { bootGame } from './support/boot-game.js';

/** @type {ReturnType<typeof bootGame>} */
let sim;

beforeAll(() => {
  sim = bootGame();
});

/** Gift values that trigger each duel effect: nothing, speed, steal, shield, extra life. */
const GIFT_VALUES = [1, 10, 20, 30, 100];

/**
 * Plays `seconds` of a duel at 60 fps with a steady stream of audience events, drawing every frame.
 * @param {number} seconds
 */
function playDuel(seconds) {
  const frames = Math.round(seconds * 60);
  for (let i = 1; i <= frames; i++) {
    if (i % 23 === 0) sim.send({ type: 'like', n: 2, pseudo: 'viewer' });
    if (i % 53 === 0) sim.send({ type: 'partage', pseudo: 'viewer' });
    if (i % 97 === 0) {
      const valeur = GIFT_VALUES[(i / 97) % GIFT_VALUES.length];
      sim.send({ type: 'cadeau', camp: i % 2 ? 'or' : 'ombre', valeur, pseudo: 'fan', n: 1 });
    }
    sim.game.reglages.heure = (i / frames) % 1;
    sim.frame();
  }
}

describe('duel render loop', () => {
  it.each(['vertical', 'horizontal'])('runs 60 s in %s format without a single error', (format) => {
    sim.game.reglages.mode = 'duel';
    sim.game.reglages.format = format;
    sim.game.nouvelleManche();
    const before = sim.counter.calls;

    playDuel(60);

    const { erreurs, derniereErreur } = sim.game.mesures();
    expect(derniereErreur ?? null).toBeNull();
    expect(erreurs).toBe(0);
    expect(sim.counter.calls - before).toBeGreaterThan(0);
  });

  it.each(['defile', 'complet', 'aucun'])('draws the "%s" gift panel mode', (mode) => {
    sim.game.reglages.affichageCadeaux = mode;
    sim.game.nouvelleManche();
    playDuel(10);
    expect(sim.game.mesures().erreurs).toBe(0);
  });

  const WEATHERS = [
    'pluie',
    'neige',
    'automne',
    'ete',
    'printemps',
    'orage',
    'etoiles',
    'aurore',
    'lucioles',
    'braises',
    'brume',
  ];

  it.each(WEATHERS)("renders the '%s' weather in both formats", (weather) => {
    sim.game.reglages.ambianceAuto = false;
    sim.game.reglages.meteo = weather;
    for (const format of ['vertical', 'horizontal']) {
      sim.game.reglages.format = format;
      sim.game.nouvelleManche();
      playDuel(5);
      expect(sim.game.mesures().derniereErreur ?? null).toBeNull();
    }
  });
});
