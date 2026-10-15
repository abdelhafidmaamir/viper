// Snake Arena measured headless, fast: many battles of 8 played by the rehearsal's medium room,
// pure rule steps of STEP seconds (no painting, no frame timers), shared across worker threads.
//
//   node scripts/arena-measure.ts [battles] [workers] [q27]
//
// Defaults: 100 battles of 2 min in continuous play (q27: with the qualifying), as many workers
// as the processor count minus 2. Prints the heads that entered another snake's body and lived
// (none should), the rounds that did not end on the clock (in continuous play none should), the
// steps that threw (none should), the deaths by cause, and the wall-clock time.
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

/** Seconds of one rule step: a snake moves at most a cell and a half in it, under the 4 allowed. */
const STEP = 0.1;

interface Result {
  battles: number;
  crossings: number;
  /** Rounds ended before the clock ran out, and steps that threw. */
  early: number;
  errors: number;
  deaths: Record<string, number>;
}

async function battles(from: number, to: number, continuous: boolean): Promise<Result> {
  const { ARENA_DEFAULTS } = await import('../src/shared/arena-protocol.ts');
  const { newArenaRound, setArenaSettings } = await import('../src/renderer/arena/arena.ts');
  const { setAudience, tickAudience } = await import('../src/renderer/arena/audience.ts');
  const { paidQueue } = await import('../src/renderer/arena/entry.ts');
  const { countOnArena } = await import('../src/renderer/arena/link.ts');
  const { QUALIFY, qualifying } = await import('../src/renderer/arena/qualify.ts');
  const { crossings, stepArena } = await import('../src/renderer/arena/round.ts');
  const { arena } = await import('../src/renderer/arena/rules.ts');
  const { board } = await import('../src/renderer/feed/control-link.ts');
  const { game, hooks, newRound } = await import('../src/renderer/feed/state.ts');
  hooks.round = () => {
    newArenaRound();
  };
  countOnArena();
  setArenaSettings({
    ...ARENA_DEFAULTS,
    places: 8,
    pilot: 0,
    wildSnakes: 0,
    roundLength: 120,
    continuous,
  });
  QUALIFY.time = 8;
  const out: Result = { battles: 0, crossings: 0, early: 0, errors: 0, deaths: {} };
  const step = (): void => {
    try {
      stepArena(STEP);
    } catch {
      out.errors++;
    }
  };
  for (let b = from; b < to; b++) {
    let seed = 1000 + b * 7919;
    const rand = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    arena.rand = rand;
    setAudience(100, rand);
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
        rand,
      );
    };
    paidQueue.length = 0;
    crossings.n = 0;
    newRound();
    while (qualifying() || arena.phase === 'ready') {
      room();
      step();
    }
    while (game.full < 0) {
      room();
      step();
    }
    out.battles++;
    if (arena.time < 120 - STEP) out.early++;
    out.crossings += crossings.n;
    for (const [k, v] of Object.entries(arena.deaths)) out.deaths[k] = (out.deaths[k] ?? 0) + v;
  }
  return out;
}

if (isMainThread) {
  const total = Number(process.argv[2] ?? 100),
    workers = Math.max(1, Number(process.argv[3] ?? availableParallelism() - 2)),
    continuous = process.argv[4] !== 'q27',
    started = performance.now(),
    per = Math.ceil(total / workers),
    jobs: Promise<Result>[] = [];
  for (let w = 0; w < workers && w * per < total; w++) {
    const from = w * per,
      to = Math.min(total, from + per);
    jobs.push(
      new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), {
          workerData: { from, to, continuous },
        });
        worker.once('message', (r: Result) => {
          resolve(r);
        });
        worker.once('error', reject);
      }),
    );
  }
  const results = await Promise.all(jobs),
    sum: Result = { battles: 0, crossings: 0, early: 0, errors: 0, deaths: {} };
  for (const r of results) {
    sum.battles += r.battles;
    sum.crossings += r.crossings;
    sum.early += r.early;
    sum.errors += r.errors;
    for (const [k, v] of Object.entries(r.deaths)) sum.deaths[k] = (sum.deaths[k] ?? 0) + v;
  }
  const seconds = (performance.now() - started) / 1000;
  console.info(
    `${String(sum.battles)} battles of 8 (2 min, ${continuous ? 'continuous' : 'q27'}) on ${String(jobs.length)} workers in ${seconds.toFixed(1)} s: ` +
      `${String(sum.crossings)} heads through another body; ${String(sum.early)} ended before the clock; ` +
      `${String(sum.errors)} steps threw; deaths ${JSON.stringify(sum.deaths)}`,
  );
} else {
  const { from, to, continuous } = workerData as { from: number; to: number; continuous: boolean };
  parentPort?.postMessage(await battles(from, to, continuous));
}
