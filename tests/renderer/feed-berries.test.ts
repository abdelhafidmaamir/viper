import { describe, expect, it } from 'vitest';

import {
  READY_TIME,
  SPEED,
  TOTAL,
  advance,
  game,
  gift,
  isFree,
  newRound,
} from '../../src/renderer/feed/state.ts';

describe('feed berries', () => {
  it(
    'never sit under the body and the snake never crosses itself, up to a full board',
    { timeout: 120000 },
    () => {
      for (const start of [11, 23, 57, 91, 133, 177]) {
        let seed = start;
        const rand = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
        newRound(rand);
        let bad = 0;
        for (let f = 0; f < 60 * 1200 && game.full < 0; f++) {
          if (f % 10 === 0) gift('v' + String(f % 7), undefined, rand() < 0.8 ? 1 : 10);
          advance(1 / 60, rand);
          for (const b of game.berries.values()) if (!isFree(b.at)) bad++;
          if (new Set(game.body.cells).size !== game.body.cells.length) bad++;
        }
        expect(bad).toBe(0);
        expect(game.full).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it('reaches 40% of the board within about ten seconds of GO, with no gifts', () => {
    let seed = 5;
    const rand = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    newRound(rand);
    for (let f = 0; f < 60 * (READY_TIME + 12); f++) advance(1 / 60, rand);
    expect(game.len).toBeGreaterThanOrEqual(Math.round(TOTAL * 0.4) - 5);
    expect(new Set(game.body.cells).size).toBe(game.body.cells.length);
  });

  it('the tail never stops, even under a flood of gifts', () => {
    let seed = 42;
    const rand = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    newRound(rand);
    // Where the drawn tail sits along the loop: the head's position minus the length.
    const tailAt = (): number => (game.body.ord[game.head] ?? 0) + game.sub - game.len;
    let slowest = Infinity,
      last = tailAt();
    for (let f = 0; f < 60 * 240 && game.full < 0; f++) {
      if (f % 6 === 0) gift('v' + String(f % 5), undefined, rand() < 0.5 ? 1 : 10);
      advance(1 / 60, rand);
      const now = tailAt();
      const moved = (((now - last) % TOTAL) + TOTAL) % TOTAL;
      last = now;
      if (game.ready < 0 && game.full < 0) slowest = Math.min(slowest, moved * 60);
    }
    // Never below half the normal pace, in cells per second.
    expect(slowest).toBeGreaterThanOrEqual(SPEED / 2 - 0.01);
  });
});
