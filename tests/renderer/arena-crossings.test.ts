// Heads entering another snake's body without dying, measured over many headless battles of 8.
// Long: it runs only when asked,
//   ARENA_CROSSINGS=100 npx vitest run tests/renderer/arena-crossings.test.ts
import { describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS } from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { setAudience, tickAudience } from '../../src/renderer/arena/audience.ts';
import { paidQueue } from '../../src/renderer/arena/entry.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import { QUALIFY, qualifying } from '../../src/renderer/arena/qualify.ts';
import { crossings } from '../../src/renderer/arena/round.ts';
import { arena } from '../../src/renderer/arena/rules.ts';
import { board } from '../../src/renderer/feed/control-link.ts';
import { game, hooks, newRound } from '../../src/renderer/feed/state.ts';

const BATTLES = Number(process.env.ARENA_CROSSINGS ?? 0);
const STEP = 1 / 30;

describe.skipIf(!BATTLES)('snake arena: heads through bodies, measured', () => {
  it(`${String(BATTLES)} battles of 8, 2 min`, () => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
    setArenaSettings({
      ...ARENA_DEFAULTS,
      continuous: false,
      places: 8,
      pilot: 0,
      wildSnakes: 0,
      roundLength: 120,
    });
    QUALIFY.time = 8;
    let seed = 3;
    arena.rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const r = arena.rand;
    setAudience(100, r);
    const room = (): void => {
      tickAudience(
        STEP,
        {
          like: (n, k, avatar) => {
            board.like(n, avatar, k);
          },
          gift: (n, coins, avatar) => {
            board.gift(n, avatar, coins, true);
          },
        },
        r,
      );
    };
    crossings.n = 0;
    const deaths = { headon: 0, cutoff: 0, accident: 0, trapped: 0, boxed: 0 };
    newRound();
    let played = 0;
    for (let b = 0; b < BATTLES; b++) {
      paidQueue.length = 0;
      while (qualifying() || arena.phase === 'ready') {
        room();
        advanceArena(STEP);
      }
      while (game.full < 0) {
        room();
        advanceArena(STEP);
      }
      for (const k of Object.keys(deaths) as (keyof typeof deaths)[]) deaths[k] += arena.deaths[k];
      played++;
      while (game.full >= 0) advanceArena(STEP);
    }
    process.stderr.write(
      `CROSSINGS over ${String(played)} battles: ${JSON.stringify(crossings)}; deaths ${JSON.stringify(deaths)}\n`,
    );
    expect(played).toBe(BATTLES);
    expect(crossings.n).toBe(0);
  }, 3_600_000);
});
