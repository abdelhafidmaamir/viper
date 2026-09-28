import { describe, expect, it } from 'vitest';

import { buildLoop } from '../../src/renderer/feed/loop-path.ts';

describe('feed loop', () => {
  it('visits every cell once and closes on itself', () => {
    let seed = 7;
    const rand = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let run = 0; run < 100; run++) {
      const path = buildLoop(16, 20, rand);
      expect(path).toHaveLength(320);
      expect(new Set(path.map((c) => c.y * 16 + c.x)).size).toBe(320);
      path.forEach((a, i) => {
        const b = path[(i + 1) % path.length] ?? a;
        expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
      });
    }
  });
});
