// The players' photos and the bodies, measured on a headless battle of 8 at 30 frames a second.
// Long: it runs only when asked,
//   ARENA_PHOTOS=60 npx vitest run tests/renderer/arena-photos.test.ts
// The photos are painted under the bodies, so no body is ever hidden by one; this prints how often
// a body lies over more than half of a photo (the photo's readability), and how often a crown or
// a boost bolt, the only marks painted over the bodies, touches a body.
import { describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS } from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { setAudience, tickAudience } from '../../src/renderer/arena/audience.ts';
import { photoPlace, placePhotos } from '../../src/renderer/arena/board-paint.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import { qualifying } from '../../src/renderer/arena/qualify.ts';
import { TUNING, arena, occupancy } from '../../src/renderer/arena/rules.ts';
import { board } from '../../src/renderer/feed/control-link.ts';
import { FCELL, FCOLS, FROWS, FX0, FY0 } from '../../src/renderer/feed/grid.ts';
import { hooks, newRound } from '../../src/renderer/feed/state.ts';

const SECONDS = Number(process.env.ARENA_PHOTOS ?? 0);
const STEP = 1 / 30;

/** Whether a point lies on a body: a body is narrower than its cell, so the cell's inner part. */
function onBody(x: number, y: number, occ: Int16Array): boolean {
  const cx = Math.floor((x - FX0) / FCELL),
    cy = Math.floor((y - FY0) / FCELL);
  if (cx < 0 || cy < 0 || cx >= FCOLS || cy >= FROWS || !occ[cy * FCOLS + cx]) return false;
  const u = (x - FX0) / FCELL - cx,
    v = (y - FY0) / FCELL - cy;
  return u > 0.15 && u < 0.85 && v > 0.15 && v < 0.85;
}

/** Share of a disc lying on bodies, sampled on a fine grid. */
function covered(x: number, y: number, r: number, occ: Int16Array): number {
  let n = 0,
    on = 0;
  for (let dy = -r; dy <= r; dy += 4)
    for (let dx = -r; dx <= r; dx += 4) {
      if (dx * dx + dy * dy > r * r) continue;
      n++;
      if (onBody(x + dx, y + dy, occ)) on++;
    }
  return on / Math.max(1, n);
}

describe.skipIf(!SECONDS)('snake arena: photos and bodies, measured', () => {
  it(`${String(SECONDS)} s of a battle of 8`, () => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
    setArenaSettings({
      ...ARENA_DEFAULTS,
      places: 8,
      pilot: false,
      wildSnakes: 0,
      roundLength: 120,
    });
    let seed = 5;
    arena.rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const r = arena.rand;
    newRound();
    // The rehearsal's medium room (100 made-up viewers) plays the qualifying and the battle.
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
    while (qualifying() || arena.phase !== 'play') {
      room();
      advanceArena(STEP);
    }
    let frames = 0,
      shown = 0,
      half = 0,
      some = 0,
      marks = 0;
    for (let f = 0; f < SECONDS / STEP; f++) {
      room();
      advanceArena(STEP);
      // A round can end early: the last viewer standing.
      if ((arena.phase as string) !== 'play') break;
      frames++;
      const { occ } = occupancy();
      let marked = false;
      for (const s of placePhotos(arena.clock)) {
        const p = photoPlace(s);
        if (!p) continue;
        shown++;
        const share = covered(p.x, p.y, TUNING.photoR, occ);
        if (share > 0) some++;
        if (share > 0.5) half++;
        // The crown over the name, the bolt at the photo's top right: painted over the bodies.
        const crowned = arena.crown === s.id,
          bolt = s.boost > 0;
        if (
          (crowned && covered(p.x, p.y - TUNING.photoR - 26 - 22, 22, occ) > 0) ||
          (bolt && covered(p.x + TUNING.photoR * 0.82, p.y - TUNING.photoR * 0.82, 14, occ) > 0)
        )
          marked = true;
      }
      if (marked) marks++;
    }
    const pc = (n: number, of: number): string => `${((100 * n) / Math.max(1, of)).toFixed(1)} %`;
    process.stderr.write(
      `PHOTOS ${String(frames)} frames: bodies hidden by a photo 0 (painted under them); photos with a body over part of them ${pc(some, shown)}, over more than half ${pc(half, shown)} of photo-frames; frames where a crown or bolt touches a body ${pc(marks, frames)}\n`,
    );
    expect(frames).toBeGreaterThan(0);
  });
});
