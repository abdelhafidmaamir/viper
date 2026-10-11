import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ARENA_DEFAULTS } from '../../src/shared/arena-protocol.ts';
import { setCtx } from '../../src/renderer/engine/canvas.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { layOutBeach, paintBeachRings } from '../../src/renderer/arena/beach.ts';
import { arenaLike, flights, likeHearts, queue, rings } from '../../src/renderer/arena/entry.ts';
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
  likeHearts.length = 0;
  game.queue = [];
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

/** Frames where `n` walks to the left (its picture moving more than its idle sway). */
const walkingLeft = (seen: readonly Frame[], n: string): Frame[] =>
  seen.filter((f, i) => i > 0 && face(f, n).x < face(seen[i - 1], n).x - 0.5);

describe('the snake arena beach', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });
  beforeEach(fresh);

  it('a player overtaking another walks sideways on its line: same height, same size, in front', () => {
    player('ana', 12);
    const bo = player('bo', 8);
    frames(1.5);
    const still = frame(),
      a0 = face(still, 'ana'),
      b0 = face(still, 'bo');
    expect(b0.x).toBeGreaterThan(a0.x);
    bo.len = 20;
    const slide = frames(1.5),
      forward = walkingLeft(slide, 'bo');
    expect(forward.length).toBeGreaterThan(5);
    for (const f of slide) {
      // Only x changes: never up, never into the sand, never smaller or bigger.
      expect(face(f, 'ana').y).toBe(a0.y);
      expect(face(f, 'bo').y).toBe(b0.y);
      expect(face(f, 'ana').r).toBe(a0.r);
      expect(face(f, 'bo').r).toBe(b0.r);
    }
    // The one moving up the ranking passes in front of the other.
    for (const f of forward) expect(f.order.indexOf('bo')).toBeGreaterThan(f.order.indexOf('ana'));
    const end = slide[slide.length - 1];
    // They traded places, each within its idle sway of the other's.
    expect(Math.abs(face(end, 'bo').x - a0.x)).toBeLessThan(9);
    expect(Math.abs(face(end, 'ana').x - b0.x)).toBeLessThan(9);
  });

  it('a waiting animal overtaking another in the queue walks sideways too', () => {
    arenaLike('q1', pic('q1'), 10);
    arenaLike('q2', pic('q2'), 1);
    frames(1.5);
    const still = frame(),
      p0 = face(still, 'q1'),
      q0 = face(still, 'q2');
    expect(q0.x).toBeGreaterThan(p0.x);
    arenaLike('q2', pic('q2'), 30);
    const slide = frames(1.5);
    expect(walkingLeft(slide, 'q2').length).toBeGreaterThan(5);
    for (const f of slide) {
      expect(face(f, 'q1').y).toBe(p0.y);
      expect(face(f, 'q2').y).toBe(q0.y);
      expect(face(f, 'q2').r).toBe(q0.r);
    }
    const end = slide[slide.length - 1];
    expect(face(end, 'q2').x).toBeLessThan(face(end, 'q1').x);
  });

  it("a like fills a waiting viewer's entry ring, a player's speed: never the other", () => {
    const pia = playing('pia', row(5, 12, 5));
    arenaLike('quin', pic('quin'), 30);
    frames(1);
    // Waiting in the queue: the entry ring fills, no snake goes any faster.
    arenaLike('quin', pic('quin'), 5);
    expect(rings.get('quin')).toBe(35);
    expect(snakeOf('quin')).toBeUndefined();
    expect(pia.boost).toBe(0);
    // Playing: the snake's speed ring on the board fills and it speeds up; nothing builds up on
    // the way in, and the animal on the beach shows the like's hearts as Feed's do.
    advanceArena(1 / 30);
    const cruising = pia.speed;
    arenaLike('pia', pic('pia'), 5);
    crabLike('pia', pic('pia'), 5);
    expect(pia.boost).toBeCloseTo(5 * TUNING.likeBoost);
    expect(pia.boost / TUNING.boostCap).toBeGreaterThan(0.01);
    expect(rings.get('pia') ?? 0).toBe(0);
    expect(queue.some((w) => w?.nickname === 'pia')).toBe(false);
    expect(crabsState().find((c) => c.nickname === 'pia')?.hearts).toBeGreaterThan(0);
    advanceArena(1 / 30);
    expect(pia.speed).toBeGreaterThan(cruising);
    // On the beach only the waiting animal wears a red ring.
    const f = frame(),
      ringOn = (n: string): boolean => {
        const p = face(f, n);
        return f.rings.some((c) => Math.abs(c.x - p.x) < 0.01 && Math.abs(c.y - p.y) < 0.01);
      };
    expect(ringOn('quin')).toBe(true);
    expect(ringOn('pia')).toBe(false);
  });

  it('keeps the sleeping crab, clear of a full board and a full queue', () => {
    for (let k = 0; k < 8; k++) player(`p${String(k)}`, 10 + k);
    for (let k = 0; k < 4; k++) arenaLike(`w${String(k)}`, pic(`w${String(k)}`), 10 + k);
    // Just liked, no animal out: Feed's sleeper would show nobody at all.
    crabLike('zed', pic('zed'), 1);
    frames(3);
    const f = frame(),
      sleeper = face(f, 'zed'),
      animals = [...f.faces].filter(([n]) => n !== 'zed');
    expect(sleepersState()[0]?.who).toBe('zed');
    expect(animals).toHaveLength(12);
    // Every picture on the beach stands left of the sleeper's, none touching it.
    const PHOTO = 28 / 32;
    for (const [, a] of animals)
      expect(a.x + a.r * PHOTO).toBeLessThan(sleeper.x - sleeper.r * PHOTO);
  });

  it('never drops the sleeping crab, even with every viewer already on the beach', () => {
    for (let k = 0; k < 8; k++) player(`p${String(k)}`, 10 + k);
    for (let k = 0; k < 4; k++) arenaLike(`w${String(k)}`, pic(`w${String(k)}`), 10 + k);
    for (let k = 0; k < 4; k++) crabLike(`w${String(k)}`, pic(`w${String(k)}`), 1);
    const shown = new Set<string>();
    for (let k = 0; k < 6 / FRAME; k++) {
      frame();
      const who = sleepersState()[0]?.who;
      expect(who).toBeDefined();
      shown.add(who ?? '');
    }
    // And its pictures still turn.
    expect(shown.size).toBeGreaterThan(1);
  });
});
