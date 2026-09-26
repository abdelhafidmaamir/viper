/**
 * Characterisation test for the engine refactor.
 *
 * A seeded, fully deterministic session is replayed and every canvas call, every context write
 * and the resulting game state are folded into digests. A behaviour-preserving refactor keeps
 * every digest identical. A change that is meant to alter rendering or rules updates the
 * snapshot deliberately, in its own commit (`vitest -u`), with a capture to show the difference.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { bootGame, type BootedGame } from './support/boot-game.ts';

const SEED = 20260926;

let sim: BootedGame;

/** Gift values that trigger each duel effect: none, speed, steal, shield, extra life. */
const GIFTS = [
  { valeur: 1, nom: 'rose' },
  { valeur: 10, nom: 'dyno' },
  { valeur: 20, nom: 'perfume' },
  { valeur: 30, nom: 'bagel' },
  { valeur: 100, nom: 'hand heart' },
] as const;

/** A scripted audience: same events at the same frames on every run. */
function playScripted(seconds: number): void {
  const frames = Math.round(seconds * 60);
  for (let i = 1; i <= frames; i++) {
    if (i % 29 === 0) sim.send({ type: 'like', n: 3, pseudo: `viewer${String(i % 7)}` });
    if (i % 131 === 0) {
      sim.send({
        type: 'arrivee',
        pseudo: `newcomer${String(i)}`,
        avatar: `https://cdn.test/${String(i)}.webp`,
      });
    }
    if (i % 173 === 0) sim.send({ type: 'partage', pseudo: 'sharer' });
    if (i % 83 === 0) {
      const gift = GIFTS[(i / 83) % GIFTS.length];
      sim.send({
        type: 'cadeau',
        n: 1,
        ...gift,
        camp: i % 2 ? 'or' : 'ombre',
        pseudo: `fan${String(i % 5)}`,
        avatar: `https://cdn.test/fan${String(i % 5)}.webp`,
      });
    }
    sim.frame();
  }
}

const WEATHERS = [
  ['pluie', 0.5],
  ['neige', 0.36],
  ['automne', 0.78],
  ['printemps', 0.36],
  ['ete', 0.5],
  ['orage', 0.02],
  ['braises', 0.78],
  ['aurore', 0.02],
  ['etoiles', 0.02],
  ['lucioles', 0.02],
  ['brume', 0.22],
] as const;

function state(): string {
  const { game } = sim;
  return JSON.stringify({
    score: game.score(),
    rounds: game.manches(),
    metrics: game.mesures(),
    duel: game.duel(),
  });
}

beforeAll(() => {
  sim = bootGame({ seed: SEED, record: true });
  // Scenarios start from a fixed generator state, independent of what loading consumed.
  sim.reseed(SEED);
  sim.digest();
});

describe('engine characterisation (seed 20260926)', () => {
  // Segments share one session and must run in order; each asserts its own digest.
  it('portrait duel under a scripted audience', () => {
    Object.assign(sim.game.reglages, {
      mode: 'duel',
      format: 'vertical',
      ambianceAuto: false,
      meteo: 'pluie',
    });
    sim.game.nouvelleManche();
    sim.game.reglerHeure(0.5);
    playScripted(10);
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('landscape duel with weather and time of day changes', () => {
    Object.assign(sim.game.reglages, { format: 'horizontal', meteo: 'neige' });
    sim.game.nouvelleManche();
    sim.game.reglerHeure(0.36);
    playScripted(4);
    Object.assign(sim.game.reglages, { meteo: 'orage' });
    sim.game.reglerHeure(0.02);
    playScripted(4);
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('end screen with the round ranking', () => {
    for (const gift of GIFTS) {
      sim.send({ type: 'cadeau', n: 1, ...gift, camp: 'or', pseudo: 'karim.or' });
    }
    sim.game.finirTest('ombre');
    playScripted(3);
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('MVP ranking variant on the end screen', () => {
    Object.assign(sim.game.reglages, { classement: 'M1' });
    sim.game.nouvelleManche();
    playScripted(2);
    sim.game.finirTest('or');
    playScripted(3);
    Object.assign(sim.game.reglages, { classement: 'C3' });
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('full gift legend, neutral platform and fluid mode', () => {
    Object.assign(sim.game.reglages, { affichageCadeaux: 'complet', fluide: true });
    sim.game.nouvelleManche();
    playScripted(3);
    Object.assign(sim.game.reglages, { plateforme: 'neutre', affichageCadeaux: 'aucun' });
    playScripted(1);
    Object.assign(sim.game.reglages, {
      plateforme: 'tiktok',
      affichageCadeaux: 'defile',
      fluide: false,
    });
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('staged scenes with the underdog boost', () => {
    Object.assign(sim.game.reglages, { underdog: true });
    sim.game.nouvelleManche();
    for (const scene of [
      'face',
      'ballet',
      'course',
      'chasseOr',
      'chasseOm',
      'piegeOr',
      'piegeOm',
    ]) {
      sim.game.lancerScene(scene, 1);
      playScripted(1);
    }
    sim.game.stopScene();
    Object.assign(sim.game.reglages, { underdog: false });
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('search AI on both sides with the debug overlay', () => {
    // The search runs on a time budget; 0.2 ms of simulated clock keeps it deterministic and fast.
    Object.assign(globalThis, { VIPERE_SUPER_MS: 0.2 });
    Object.assign(sim.game.reglages, { superIA: true, debugIA: true });
    sim.game.nouvelleManche();
    playScripted(1);
    Object.assign(sim.game.reglages, { superIA: false, debugIA: false });
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('every weather, landscape', () => {
    Object.assign(sim.game.reglages, { format: 'horizontal' });
    sim.game.nouvelleManche();
    for (const [meteo, hour] of WEATHERS) {
      Object.assign(sim.game.reglages, { meteo });
      sim.game.reglerHeure(hour);
      playScripted(1);
    }
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('long headless session: rules, AI and scoring', () => {
    Object.assign(sim.game.reglages, { format: 'vertical', dureeDuel: 120 });
    sim.game.nouvelleManche();
    for (let t = 0; t < 3 * 60; t += 1 / 30) sim.step(1 / 30);
    expect(state()).toMatchSnapshot();
  });
});
