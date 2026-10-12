// The survival tiers measured over many headless battles. Long: it runs only when asked,
//   ARENA_MEASURE=100 npx vitest run tests/renderer/arena-tiers.test.ts
// and prints the death rate and the win share of each tier.
import { describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS } from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { arenaLike, nextSeats } from '../../src/renderer/arena/entry.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import { QUALIFY, qualifying } from '../../src/renderer/arena/qualify.ts';
import { tierOf } from '../../src/renderer/arena/round.ts';
import { arena } from '../../src/renderer/arena/rules.ts';
import { board } from '../../src/renderer/feed/control-link.ts';
import { game, hooks, newRound } from '../../src/renderer/feed/state.ts';

const ROUNDS = Number(process.env.ARENA_MEASURE ?? 0),
  /** Seconds between the battle gifter's gifts of 5 berries (ARENA_GIFT_EVERY, 20 by default). */
  GIFT_EVERY = Number(process.env.ARENA_GIFT_EVERY ?? 20);
const STEP = 1 / 30;

describe.skipIf(!ROUNDS)('snake arena: survival tiers, measured', () => {
  it(`${String(ROUNDS)} battles of 6: 1 gifting, 2 paid seats, 3 like seats`, () => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
    setArenaSettings({ ...ARENA_DEFAULTS, pilot: false, wildSnakes: 0, roundLength: 120 });
    QUALIFY.time = 2;
    let seed = 11;
    arena.rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const r = arena.rand;
    const roles: Record<string, 1 | 2 | 3> = {
      gifter: 1,
      paidA: 2,
      paidB: 2,
      likeA: 3,
      likeB: 3,
      likeC: 3,
    };
    const deaths = { 1: 0, 2: 0, 3: 0 },
      seats = { 1: 0, 2: 0, 3: 0 },
      wins = { 1: 0, 2: 0, 3: 0, none: 0 },
      mismatched = { n: 0 },
      food = { eaten: 0, crowns: 0 };
    let played = 0;
    newRound();
    for (let round = 0; round < ROUNDS; round++) {
      nextSeats.length = 0;
      game.queue = [];
      arena.food = [];
      arena.foodAt.clear();
      arena.snakes = [];
      newRound();
      // The qualifying: two paid seats, four like seats (the gifter among them).
      board.gift('paidA', undefined, 5, true);
      board.gift('paidB', undefined, 5, true);
      for (const n of ['gifter', 'likeA', 'likeB', 'likeC']) arenaLike(n, undefined, 20);
      while (qualifying() || arena.phase === 'ready') advanceArena(STEP);
      // The battle: the gifter gives at once and every 20 s; every player's likes now and then.
      let t = 0,
        nextGift = 0,
        holder = -1;
      while (game.full < 0 && t < 200) {
        if (arena.crown !== holder && arena.crown >= 0) {
          food.crowns++;
          holder = arena.crown;
        }
        if (t >= nextGift) {
          board.gift('gifter', undefined, 5, true);
          nextGift += GIFT_EVERY;
        }
        for (const n of Object.keys(roles)) if (r() < STEP / 12) arenaLike(n, undefined, 100);
        advanceArena(STEP);
        t += STEP;
      }
      for (const [n, tier] of Object.entries(roles)) {
        seats[tier]++;
        if (arena.outs.some((o) => o.nickname === n)) deaths[tier]++;
        const s = arena.snakes.find((x) => x.nickname === n);
        if (s && tierOf(s) !== tier) mismatched.n++;
      }
      food.eaten += game.eaten;
      const w = arena.winner?.nickname;
      if (w && w in roles) wins[roles[w] ?? 3]++;
      else wins.none++;
      played++;
      // On to the end screen's close and the next round.
      while (game.full >= 0) advanceArena(STEP);
    }
    const rate = (tier: 1 | 2 | 3): string =>
      `${((100 * deaths[tier]) / Math.max(1, seats[tier])).toFixed(1)} %`;
    const share = (k: 1 | 2 | 3 | 'none'): string =>
      `${((100 * wins[k]) / Math.max(1, played)).toFixed(1)} %`;
    process.stderr.write(
      `TIERS over ${String(played)} battles: deaths per round, tier 1 ${rate(1)}, tier 2 ${rate(2)}, tier 3 ${rate(3)}; ` +
        `wins, tier 1 ${share(1)}, tier 2 ${share(2)}, tier 3 ${share(3)}, none ${share('none')}; ` +
        `snakes whose tier differed from their role: ${String(mismatched.n)}; ` +
        `berries eaten per battle ${(food.eaten / Math.max(1, played)).toFixed(1)}, ` +
        `crown changes per battle ${(food.crowns / Math.max(1, played)).toFixed(1)}\n`,
    );
    expect(played).toBe(ROUNDS);
  }, 3_600_000);
});
