import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS } from '../../src/shared/arena-protocol.ts';
import { setCtx } from '../../src/renderer/engine/canvas.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import {
  SLEEPER_SPOT,
  layOutBeach,
  paintBeachRings,
  podiumFor,
} from '../../src/renderer/arena/beach.ts';
import { W } from '../../src/renderer/engine/layout.ts';
import {
  arenaLike,
  flights,
  likePops,
  queue,
  rings,
  paidQueue,
} from '../../src/renderer/arena/entry.ts';
import { countOnArena } from '../../src/renderer/arena/link.ts';
import {
  TUNING,
  arena,
  cellId,
  cellX,
  cellY,
  snakeOf,
  spawn,
  viewer,
  type Snake,
} from '../../src/renderer/arena/rules.ts';
import {
  clearCrabs,
  crabFaces,
  crabLike,
  crabsState,
  paintCrabs,
  setSleeperSpot,
  sleepersState,
} from '../../src/renderer/feed/crabs.ts';
import { game, hooks, newRound } from '../../src/renderer/feed/state.ts';
import { QUALIFY } from '../../src/renderer/arena/qualify.ts';

// These tests play the round as it was before the qualifying: straight to GET READY.
QUALIFY.time = 0;

// The beach is painted for real on a context that only keeps track of its transform, and of the
// circles it is asked to draw: where each picture lands, and the rings drawn round them.

class Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.e = e;
    this.f = f;
  }
  multiply(o: Matrix): Matrix {
    return new Matrix(
      this.a * o.a + this.c * o.b,
      this.b * o.a + this.d * o.b,
      this.a * o.c + this.c * o.d,
      this.b * o.c + this.d * o.d,
      this.a * o.e + this.c * o.f + this.e,
      this.b * o.e + this.d * o.f + this.f,
    );
  }
  invertSelf(): this {
    const { a, b, c, d, e, f } = this,
      det = a * d - b * c;
    this.a = d / det;
    this.b = -b / det;
    this.c = -c / det;
    this.d = a / det;
    this.e = (c * f - d * e) / det;
    this.f = (b * e - a * f) / det;
    return this;
  }
  transformPoint(p: { x: number; y: number }): { x: number; y: number } {
    return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f };
  }
  copy(): Matrix {
    return new Matrix(this.a, this.b, this.c, this.d, this.e, this.f);
  }
}

interface Circle {
  x: number;
  y: number;
  stroke: string;
}

function fakeContext(circles?: Circle[]): CanvasRenderingContext2D {
  let m = new Matrix(),
    props: Record<string, unknown> = {
      globalAlpha: 1,
      lineWidth: 1,
      strokeStyle: '#000',
      fillStyle: '#000',
      font: '10px sans-serif',
      filter: 'none',
      canvas: { width: 1080, height: 1920 },
    };
  const stack: { m: Matrix; props: Record<string, unknown> }[] = [],
    gradient = { addColorStop: (): void => undefined },
    then = (next: Matrix): void => {
      m = m.multiply(next);
    },
    api: Record<string, (...args: never[]) => unknown> = {
      save: () => stack.push({ m: m.copy(), props: { ...props } }),
      restore: () => {
        const s = stack.pop();
        if (s) ({ m, props } = s);
      },
      translate: (x: number, y: number) => {
        then(new Matrix(1, 0, 0, 1, x, y));
      },
      scale: (x: number, y: number) => {
        then(new Matrix(x, 0, 0, y, 0, 0));
      },
      rotate: (r: number) => {
        then(new Matrix(Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0));
      },
      transform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
        then(new Matrix(a, b, c, d, e, f));
      },
      setTransform: (a?: number | Matrix, b = 0, c = 0, d = 1, e = 0, f = 0) => {
        m =
          a instanceof Matrix
            ? a.copy()
            : a === undefined
              ? new Matrix()
              : new Matrix(a, b, c, d, e, f);
      },
      resetTransform: () => {
        m = new Matrix();
      },
      getTransform: () => m.copy(),
      measureText: (text: string) => ({ width: text.length * 8 }),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      arc: (x: number, y: number) => {
        circles?.push({ ...m.transformPoint({ x, y }), stroke: String(props.strokeStyle) });
      },
    };
  const target: Record<string, unknown> = {};
  return new Proxy(target, {
    get: (_, key: string) => (key in api ? api[key] : key in props ? props[key] : () => undefined),
    set: (_, key: string, value: unknown) => {
      props[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

class FakeImage {
  complete = false;
  naturalWidth = 0;
  crossOrigin = '';
  set src(_url: string) {
    this.complete = true;
    this.naturalWidth = 64;
  }
}
Object.assign(globalThis, {
  Image: FakeImage,
  document: {
    createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => fakeContext() }),
  },
});

const circles: Circle[] = [];
setCtx(fakeContext(circles));

const pic = (name: string): string => `https://p16.example/${name}.jpg`;
const RED = '#ff3b5c';
/** Share of the round gone: the beach's height, held still here. */
const RISE = 0.4;
const FRAME = 1 / 60;
let clock = 0;

interface Frame {
  faces: Map<string, { x: number; y: number; r: number }>;
  /** Who was painted, in order. */
  order: string[];
  rings: Circle[];
}

/** One frame of the beach: laid out, the animals painted, the rings over them. */
function frame(): Frame {
  clock += FRAME;
  arena.clock = clock;
  circles.length = 0;
  layOutBeach();
  paintCrabs(clock, RISE, false, 'sea');
  paintBeachRings(clock);
  return {
    faces: new Map([...crabFaces()].map(([n, f]) => [n, { ...f }])),
    order: [...crabFaces().keys()],
    rings: circles.filter((c) => c.stroke === RED),
  };
}
const frames = (seconds: number): Frame[] =>
  Array.from({ length: Math.round(seconds / FRAME) }, frame);
const face = (f: Frame | undefined, n: string): { x: number; y: number; r: number } => {
  const got = f?.faces.get(n);
  if (!got) throw new Error(`no picture for ${n}`);
  return got;
};

function fresh(): void {
  setArenaSettings({ ...ARENA_DEFAULTS, pilot: false, wildSnakes: 0, places: 8 });
  let s = 7;
  arena.rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  arena.viewers.clear();
  rings.clear();
  queue.length = 0;
  flights.length = 0;
  likePops.length = 0;
  game.queue = [];
  paidQueue.length = 0;
  newRound();
  for (let i = 0; i < 120; i++) advanceArena(1 / 30);
  clearCrabs();
  // Every test on a clock of its own, well past the last one's.
  clock += 100;
  arena.clock = clock;
}

/** A viewer's snake on the board, still in its egg: its animal stands with the players. */
function player(name: string, len: number): Snake {
  const s = spawn(viewer(name, pic(name)));
  if (!s) throw new Error('no place for a snake');
  s.len = len;
  return s;
}

/** A viewer's snake out of its egg and playing, lying on `cells`, head first. */
function playing(name: string, cells: readonly number[]): Snake {
  const s = player(name, cells.length),
    head = cells[0] ?? 0;
  s.egg = null;
  s.in = true;
  s.safe = 0;
  s.body.cells.length = 0;
  s.body.cells.push(...cells);
  s.next = head;
  s.x = cellX(head);
  s.y = cellY(head);
  return s;
}
const row = (y: number, from: number, to: number): number[] => {
  const out: number[] = [];
  for (let x = from; x >= to; x--) out.push(cellId(x, y));
  return out;
};

describe('the snake arena beach', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
    // As the arena's window does: the sleeping crab above the board, the beach all the players'.
    setSleeperSpot(SLEEPER_SPOT);
  });
  beforeEach(fresh);

  it("the podium stands in the board's order, right to left: the crowned snake on the 1st mound, the highest", () => {
    const ana = playing('ana', row(5, 12, 5)),
      bo = playing('bo', row(9, 12, 5)),
      cy = playing('cy', row(13, 12, 5));
    ana.eaten = 1;
    ana.len = 12;
    bo.len = 9;
    cy.len = 8;
    advanceArena(1 / 30);
    expect(arena.crown).toBe(ana.id);
    const end = frames(2).at(-1),
      a = face(end, 'ana'),
      b = face(end, 'bo'),
      c = face(end, 'cy');
    // The 1st on the right and highest, the 2nd in the middle, lower, the 3rd on its left, lower still.
    expect(b.x).toBeLessThan(a.x);
    expect(c.x).toBeLessThan(b.x);
    expect(a.y).toBeLessThan(b.y);
    expect(b.y).toBeLessThan(c.y);
    // A new leader: the animals trade mounds, eased, and the crowned one ends on the 1st.
    bo.eaten = 1;
    bo.len = 20;
    advanceArena(1 / 30);
    expect(arena.crown).toBe(bo.id);
    const after = frames(2).at(-1);
    expect(Math.abs(face(after, 'bo').x - a.x)).toBeLessThan(9);
  });

  it('eight players: the ranking runs right to left, the 1st and 2nd right of the comments, no two animals touching', () => {
    const lens = [30, 26, 22, 18, 15, 13, 11, 9],
      names = lens.map((_, k) => `p${String(k)}`),
      snakes = names.map((n, k) => playing(n, row(1 + 3 * k, 12, 5)));
    snakes.forEach((s, k) => {
      s.len = lens[k] ?? 8;
    });
    const top = snakes[0];
    if (top) top.eaten = 1;
    advanceArena(1 / 30);
    const end = frames(3).at(-1),
      at = names.map((n) => face(end, n)),
      xs = at.map((f) => f.x),
      { width } = podiumFor(8, 20, W);
    for (let k = 1; k < 8; k++) {
      // Right to left, and never two animals touching.
      expect(xs[k]).toBeLessThan(xs[k - 1] ?? 0);
      expect((xs[k - 1] ?? 0) - (xs[k] ?? 0)).toBeGreaterThan(width);
    }
    // The 1st and 2nd right of the comments (81 % of the width); everybody on screen.
    expect(xs[1]).toBeGreaterThan(0.81 * W);
    expect((xs[0] ?? 0) + (at[0]?.r ?? 0) * 1.8).toBeLessThan(W);
    expect((xs[7] ?? 0) - width / 2).toBeGreaterThan(0);
    // The podium steps down from the right; from the 4th on, all at ground level.
    const ys = at.map((f) => f.y);
    expect(ys[0]).toBeLessThan(ys[1] ?? 0);
    expect(ys[1]).toBeLessThan(ys[2] ?? 0);
    expect(ys[2]).toBeLessThan(ys[3] ?? 0);
    for (let k = 4; k < 8; k++) expect(Math.abs((ys[k] ?? 0) - (ys[3] ?? 0))).toBeLessThan(3);
  });

  it('the beach changes its order at most once a second', () => {
    const ana = playing('ana', row(5, 12, 5)),
      bo = playing('bo', row(9, 12, 5)),
      cy = playing('cy', row(13, 12, 5));
    ana.eaten = 1;
    ana.len = 20;
    bo.len = 10;
    cy.len = 9;
    advanceArena(1 / 30);
    frames(2);
    const x = (f: Frame | undefined, n: string): number => face(f, n).x;
    // cy passes bo, then bo passes cy back a moment later: the beach waits a second between.
    cy.len = 12;
    frames(0.2);
    bo.len = 14;
    const soon = frames(0.4).at(-1);
    // Still cy ahead (on the right of bo) 0.6 s after its pass.
    expect(x(soon, 'cy')).toBeGreaterThan(x(soon, 'bo'));
    const later = frames(2).at(-1);
    expect(x(later, 'bo')).toBeGreaterThan(x(later, 'cy'));
  });

  it("in the battle a player's likes fill the ring round its animal, and 100 fire a boost", () => {
    const pia = playing('pia', row(5, 12, 5));
    frames(1);
    arenaLike('pia', pic('pia'), 50);
    crabLike('pia', pic('pia'), 50);
    expect(rings.get('pia')).toBe(50);
    expect(pia.boost).toBe(0);
    expect(crabsState().find((c) => c.nickname === 'pia')?.hearts).toBeGreaterThan(0);
    const f = frame(),
      p = face(f, 'pia');
    // The red ring is round the animal's picture on the beach.
    expect(f.rings.some((c) => Math.abs(c.x - p.x) < 0.01 && Math.abs(c.y - p.y) < 0.01)).toBe(
      true,
    );
    arenaLike('pia', pic('pia'), 50);
    expect(pia.boost).toBeGreaterThan(0);
    expect(rings.get('pia')).toBe(0);
    expect(TUNING.boostCap).toBeGreaterThan(0);
  });

  it('in the battle the sleeping crab shows the players, each in turn', () => {
    for (let k = 0; k < 6; k++) playing(`p${String(k)}`, row(3 + 4 * k, 12, 5));
    for (let k = 0; k < 6; k++) crabLike(`p${String(k)}`, pic(`p${String(k)}`), 1);
    const shown = new Set<string>();
    for (let k = 0; k < 8 / FRAME; k++) {
      frame();
      const who = sleepersState()[0]?.who;
      if (who) shown.add(who);
    }
    expect(shown.size).toBeGreaterThan(1);
    for (const n of shown) expect(snakeOf(n)).toBeDefined();
  });
});
