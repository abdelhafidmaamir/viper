// The survival tiers measured over many headless battles. Long: it runs only when asked,
//   ARENA_MEASURE=100 npx vitest run tests/renderer/arena-tiers.test.ts
// and prints the death rate and the win share of each tier.
import { describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS } from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { BOOST, arenaLike, nextSeats } from '../../src/renderer/arena/entry.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import { QUALIFY, qualifying } from '../../src/renderer/arena/qualify.ts';
import { tierOf } from '../../src/renderer/arena/round.ts';
import { arena } from '../../src/renderer/arena/rules.ts';
import { board } from '../../src/renderer/feed/control-link.ts';
import { game, hooks, newRound } from '../../src/renderer/feed/state.ts';

const ROUNDS = Number(process.env.ARENA_MEASURE ?? 0),
  /** Battle gifters (ARENA_GIFTERS, 1 or 2): scenario A has one, B two. */
  GIFTERS = Number(process.env.ARENA_GIFTERS ?? 1),
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
    // Cells a full likes ring grows a snake by (ARENA_BOOST_CELLS, the game's default otherwise).
    BOOST.cells = Number(process.env.ARENA_BOOST_CELLS ?? BOOST.cells);
    let seed = 11;
    arena.rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const r = arena.rand;
    // A: one battle gifter, two paid seats, three like seats. B: two battle gifters, one paid seat.
    const roles: Record<string, 1 | 2 | 3> =
        GIFTERS === 2
          ? { gifter: 1, gifter2: 1, paidA: 2, likeA: 3, likeB: 3, likeC: 3 }
          : { gifter: 1, paidA: 2, paidB: 2, likeA: 3, likeB: 3, likeC: 3 },
      gifters = Object.keys(roles).filter((n) => n.startsWith('gifter')),
      EVERY: Record<string, number> =
        GIFTERS === 2
          ? { gifter: 6, gifter2: 15, paidA: 40, likeA: 6, likeB: 15, likeC: 40 }
          : { gifter: 6, paidA: 15, paidB: 40, likeA: 6, likeB: 15, likeC: 40 },
      heavy = { wins: 0, deaths: 0 },
      paid = Object.keys(roles).filter((n) => n.startsWith('paid'));
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
      for (const n of paid) board.gift(n, undefined, 5, true);
      for (const n of [...gifters, 'likeA', 'likeB', 'likeC']) arenaLike(n, undefined, 20);
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
          for (const n of gifters) board.gift(n, undefined, 5, true);
          nextGift += GIFT_EVERY;
        }
        // A skewed like rate: in each group one heavy liker (a ring every 6 s on average), one
        // medium (15 s), one light (40 s).
        for (const n of Object.keys(roles))
          if (r() < STEP / (EVERY[n] ?? 15)) arenaLike(n, undefined, 100);
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
      if (w === 'likeA') heavy.wins++;
      if (arena.outs.some((o) => o.nickname === 'likeA')) heavy.deaths++;
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
        `crown changes per battle ${(food.crowns / Math.max(1, played)).toFixed(1)}; heavy liker (like seat) wins ${String(heavy.wins)} %, dies ${String(heavy.deaths)} %\n`,
    );
    expect(played).toBe(ROUNDS);
  }, 3_600_000);
});
