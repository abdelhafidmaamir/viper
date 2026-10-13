// The players' photos and the heads, measured on a headless battle of 8 at 30 frames a second.
// Long: it runs only when asked,
//   ARENA_PHOTOS=60 npx vitest run tests/renderer/arena-photos.test.ts
// The photos lie over every body and every head: no part of a snake is ever drawn over a photo.
// This prints how often a crown or a boost bolt, painted over all, touches a head, and how often
// heads lie under more than half of a photo.
import { describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS } from '../../src/shared/arena-protocol.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { setAudience, tickAudience } from '../../src/renderer/arena/audience.ts';
import { photoPlace, placePhotos } from '../../src/renderer/arena/board-paint.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import { qualifying } from '../../src/renderer/arena/qualify.ts';
import { TUNING, alive, arena } from '../../src/renderer/arena/rules.ts';
import { board } from '../../src/renderer/feed/control-link.ts';
import { FCELL, FCOLS, FX0, FY0 } from '../../src/renderer/feed/grid.ts';
import { hooks, newRound } from '../../src/renderer/feed/state.ts';

const SECONDS = Number(process.env.ARENA_PHOTOS ?? 0);
const STEP = 1 / 30;

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
      marked = 0;
    const R = TUNING.photoR,
      HEAD = FCELL * 0.65;
    for (let f = 0; f < SECONDS / STEP; f++) {
      room();
      advanceArena(STEP);
      // A round can end early: the last viewer standing.
      if ((arena.phase as string) !== 'play') break;
      frames++;
      // Each head and its first neck segment, as discs: the head, then two along the neck.
      const discs: { x: number; y: number; r: number }[] = [];
      for (const s of alive()) {
        if (!s.in || !s.cells.length) continue;
        const hx = FX0 + (s.x + 0.5) * FCELL,
          hy = FY0 + (s.y + 0.5) * FCELL,
          n = s.cells[1] ?? s.cells[0] ?? 0,
          nx = FX0 + ((n % FCOLS) + 0.5) * FCELL,
          ny = FY0 + (Math.floor(n / FCOLS) + 0.5) * FCELL;
        discs.push({ x: hx, y: hy, r: HEAD });
        for (const u of [0.5, 1])
          discs.push({ x: hx + (nx - hx) * u, y: hy + (ny - hy) * u, r: HEAD * 0.8 });
      }
      const onHead = (x: number, y: number): boolean =>
        discs.some((d) => (d.x - x) ** 2 + (d.y - y) ** 2 < d.r * d.r);
      let touched = false;
      for (const s of placePhotos(arena.clock)) {
        const p = photoPlace(s);
        if (!p) continue;
        shown++;
        let n = 0,
          on = 0;
        for (let dy = -R; dy <= R; dy += 4)
          for (let dx = -R; dx <= R; dx += 4) {
            if (dx * dx + dy * dy > R * R) continue;
            n++;
            if (onHead(p.x + dx, p.y + dy)) on++;
          }
        if (on > n / 2) half++;
        // The crown over the name, the bolt at the photo's top right: painted over the heads.
        const crown = { x: p.x, y: p.y - R - 26 - 22, r: 22 },
          bolt = { x: p.x + R * 0.82, y: p.y - R * 0.82, r: 14 },
          meets = (m: { x: number; y: number; r: number }): boolean =>
            discs.some((d) => (d.x - m.x) ** 2 + (d.y - m.y) ** 2 < (d.r + m.r) ** 2);
        if ((arena.crown === s.id && meets(crown)) || (s.boost > 0 && meets(bolt))) touched = true;
      }
      if (touched) marked++;
    }
    const pc = (n: number, of: number): string => `${((100 * n) / Math.max(1, of)).toFixed(1)} %`;
    process.stderr.write(
      `PHOTOS ${String(frames)} frames: snake parts over a photo 0 (photos painted over all); frames where a crown or bolt touches a head ${pc(marked, frames)}; photo-frames more than half over heads ${pc(half, shown)}
`,
    );
    expect(frames).toBeGreaterThan(0);
  });
});
