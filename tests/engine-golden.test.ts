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
  { value: 1, name: 'rose' },
  { value: 10, name: 'dyno' },
  { value: 20, name: 'perfume' },
  { value: 30, name: 'bagel' },
  { value: 100, name: 'hand heart' },
] as const;

/** A scripted audience: same events at the same frames on every run. */
function playScripted(seconds: number): void {
  const frames = Math.round(seconds * 60);
  for (let i = 1; i <= frames; i++) {
    if (i % 29 === 0) sim.send({ type: 'like', n: 3, nickname: `viewer${String(i % 7)}` });
    if (i % 131 === 0) {
      sim.send({
        type: 'join',
        nickname: `newcomer${String(i)}`,
        avatar: `https://cdn.test/${String(i)}.webp`,
      });
    }
    if (i % 173 === 0) sim.send({ type: 'share', nickname: 'sharer' });
    if (i % 83 === 0) {
      const gift = GIFTS[(i / 83) % GIFTS.length];
      sim.send({
        type: 'gift',
        n: 1,
        ...gift,
        team: i % 2 ? 'gold' : 'shadow',
        nickname: `fan${String(i % 5)}`,
        avatar: `https://cdn.test/fan${String(i % 5)}.webp`,
      });
    }
    sim.frame();
  }
}

const WEATHERS = [
  ['rain', 0.5],
  ['snow', 0.36],
  ['autumn', 0.78],
  ['spring', 0.36],
  ['summer', 0.5],
  ['storm', 0.02],
  ['embers', 0.78],
  ['aurora', 0.02],
  ['stars', 0.02],
  ['fireflies', 0.02],
  ['mist', 0.22],
] as const;

function state(): string {
  const { game } = sim;
  return JSON.stringify({
    score: game.score(),
    rounds: game.rounds(),
    metrics: game.metrics(),
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
    Object.assign(sim.game.settings, {
      mode: 'duel',
      format: 'portrait',
      autoAmbience: false,
      weather: 'rain',
    });
    sim.game.newRound();
    sim.game.setHour(0.5);
    playScripted(10);
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('landscape duel with weather and time of day changes', () => {
    Object.assign(sim.game.settings, { format: 'landscape', weather: 'snow' });
    sim.game.newRound();
    sim.game.setHour(0.36);
    playScripted(4);
    Object.assign(sim.game.settings, { weather: 'storm' });
    sim.game.setHour(0.02);
    playScripted(4);
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('end screen with the round ranking', () => {
    for (const gift of GIFTS) {
      sim.send({ type: 'gift', n: 1, ...gift, team: 'gold', nickname: 'karim.or' });
    }
    sim.game.endTest('shadow');
    playScripted(3);
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('MVP ranking variant on the end screen', () => {
    Object.assign(sim.game.settings, { ranking: 'M1' });
    sim.game.newRound();
    playScripted(2);
    sim.game.endTest('gold');
    playScripted(3);
    Object.assign(sim.game.settings, { ranking: 'C3' });
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('full gift legend, neutral platform and fluid mode', () => {
    Object.assign(sim.game.settings, { giftDisplay: 'full', smooth: true });
    sim.game.newRound();
    playScripted(3);
    Object.assign(sim.game.settings, { platform: 'neutral', giftDisplay: 'none' });
    playScripted(1);
    Object.assign(sim.game.settings, {
      platform: 'tiktok',
      giftDisplay: 'scroll',
      smooth: false,
    });
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('staged scenes with the underdog boost', () => {
    Object.assign(sim.game.settings, { underdog: true });
    sim.game.newRound();
    for (const scene of [
      'face',
      'ballet',
      'race',
      'huntGold',
      'huntShadow',
      'piegeOr',
      'piegeOm',
    ]) {
      sim.game.launchScene(scene, 1);
      playScripted(1);
    }
    sim.game.stopScene();
    Object.assign(sim.game.settings, { underdog: false });
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('search AI on both sides with the debug overlay', () => {
    // The search runs on a time budget; 0.2 ms of simulated clock keeps it deterministic and fast.
    Object.assign(globalThis, { VIPER_SUPER_MS: 0.2 });
    Object.assign(sim.game.settings, { superAi: true, aiDebug: true });
    sim.game.newRound();
    playScripted(1);
    Object.assign(sim.game.settings, { superAi: false, aiDebug: false });
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('every weather, landscape', () => {
    Object.assign(sim.game.settings, { format: 'landscape' });
    sim.game.newRound();
    for (const [meteo, hour] of WEATHERS) {
      Object.assign(sim.game.settings, { weather: meteo });
      sim.game.setHour(hour);
      playScripted(1);
    }
    expect({ draw: sim.digest(), state: state() }).toMatchSnapshot();
  });

  it('long headless session: rules, AI and scoring', () => {
    Object.assign(sim.game.settings, { format: 'portrait', duelDuration: 120 });
    sim.game.newRound();
    for (let t = 0; t < 3 * 60; t += 1 / 30) sim.step(1 / 30);
    expect(state()).toMatchSnapshot();
  });
});
