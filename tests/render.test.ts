import { beforeAll, describe, expect, it } from 'vitest';

import { bootGame, type BootedGame } from './support/boot-game.ts';

let sim: BootedGame;

beforeAll(() => {
  sim = bootGame();
});

/** Gift values that trigger each duel effect: none, speed, steal, shield, extra life. */
const GIFT_VALUES = [1, 10, 20, 30, 100] as const;

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
] as const;

/** Plays `seconds` of duel at 60 fps under a steady stream of audience events, drawing every frame. */
function playDuel(seconds: number): void {
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

function startRound(settings: Record<string, unknown>): void {
  Object.assign(sim.game.reglages, { mode: 'duel' }, settings);
  sim.game.nouvelleManche();
}

describe('duel render loop', () => {
  it.each(['vertical', 'horizontal'])('plays 60 s in %s format without an error', (format) => {
    startRound({ format });
    const callsBefore = sim.counter.calls;

    playDuel(60);

    expect(sim.game.mesures()).toMatchObject({ erreurs: 0, derniereErreur: null });
    expect(sim.counter.calls).toBeGreaterThan(callsBefore);
  });

  it.each(['defile', 'complet', 'aucun'])('draws the "%s" gift panel', (affichageCadeaux) => {
    startRound({ affichageCadeaux });
    playDuel(10);
    expect(sim.game.mesures().erreurs).toBe(0);
  });

  it.each(WEATHERS)('renders the "%s" weather in both formats', (meteo) => {
    for (const format of ['vertical', 'horizontal']) {
      startRound({ ambianceAuto: false, meteo, format });
      playDuel(5);
    }
    expect(sim.game.mesures()).toMatchObject({ erreurs: 0, derniereErreur: null });
  });
});
