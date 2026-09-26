import { beforeAll, describe, expect, it } from 'vitest';

import { bootGame, type BootedGame } from './support/boot-game.ts';

let sim: BootedGame;

beforeAll(() => {
  sim = bootGame();
});

/** Gift values that trigger each duel effect: none, speed, steal, shield, extra life. */
const GIFT_VALUES = [1, 10, 20, 30, 100] as const;

const WEATHERS = [
  'rain',
  'snow',
  'autumn',
  'summer',
  'spring',
  'storm',
  'stars',
  'aurora',
  'fireflies',
  'embers',
  'mist',
] as const;

/** Plays `seconds` of duel at 60 fps under a steady stream of audience events, drawing every frame. */
function playDuel(seconds: number): void {
  const frames = Math.round(seconds * 60);
  for (let i = 1; i <= frames; i++) {
    if (i % 23 === 0) sim.send({ type: 'like', n: 2, nickname: 'viewer' });
    if (i % 53 === 0) sim.send({ type: 'share', nickname: 'viewer' });
    if (i % 97 === 0) {
      const valeur = GIFT_VALUES[(i / 97) % GIFT_VALUES.length];
      sim.send({
        type: 'gift',
        team: i % 2 ? 'gold' : 'shadow',
        value: valeur,
        nickname: 'fan',
        n: 1,
      });
    }
    sim.game.settings.hour = (i / frames) % 1;
    sim.frame();
  }
}

function startRound(settings: Record<string, unknown>): void {
  Object.assign(sim.game.settings, { mode: 'duel' }, settings);
  sim.game.newRound();
}

describe('duel render loop', () => {
  it.each(['portrait', 'landscape'])('plays 60 s in %s format without an error', (format) => {
    startRound({ format });
    const callsBefore = sim.drawCalls();

    playDuel(60);

    expect(sim.game.metrics()).toMatchObject({ errors: 0, lastError: null });
    expect(sim.drawCalls()).toBeGreaterThan(callsBefore);
  });

  it.each(['scroll', 'full', 'none'])('draws the "%s" gift panel', (affichageCadeaux) => {
    startRound({ giftDisplay: affichageCadeaux });
    playDuel(10);
    expect(sim.game.metrics().errors).toBe(0);
  });

  it.each(WEATHERS)('renders the "%s" weather in both formats', (meteo) => {
    for (const format of ['portrait', 'landscape']) {
      startRound({ autoAmbience: false, weather: meteo, format });
      playDuel(5);
    }
    expect(sim.game.metrics()).toMatchObject({ errors: 0, lastError: null });
  });
});
