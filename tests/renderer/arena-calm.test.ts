/**
 * Snake Arena, calm: nothing on screen presses a viewer. The clock shows as the ring alone (the
 * qualifying's pill says QUALIFYING, no digits; no pill in the battle), no tick, no seat at risk;
 * a seat's badge is its like count with no icon, the hearts pop round the photo; the like strip's
 * chips hold a ring and no number; no card announces a place in line; a gift seat swaps quietly.
 * And the Money tab's "Gifts buy seats", off by default: off, no gift buys a seat or a place.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import {
  ARENA_DEFAULTS,
  readArenaSettings,
  sanitizeArenaSetting,
  type ArenaSettings,
} from '../../src/shared/arena-protocol.ts';
import { setCtx } from '../../src/renderer/engine/canvas.ts';
import { bigHeart } from '../../src/renderer/feed/alert-fx.ts';
import { advanceArena, newArenaRound, setArenaSettings } from '../../src/renderer/arena/arena.ts';
import { likePopSpots, paintArenaTime } from '../../src/renderer/arena/beach.ts';
import {
  BOOST,
  PILOT,
  PILOT_LIKES,
  nameOf,
  pilotHooks,
  arenaLike,
  fired,
  flights,
  isSeatGift,
  likePops,
  paidQueue,
  queue,
  rings,
  takePaidBatch,
  updatePilot,
} from '../../src/renderer/arena/entry.ts';
import {
  ARENA_STORAGE_KEY,
  applyArenaCommand,
  arenaSettings,
  countOnArena,
} from '../../src/renderer/arena/link.ts';
import * as qualifyModule from '../../src/renderer/arena/qualify.ts';
import {
  QUALIFY,
  actors,
  challengers,
  locked,
  qualLikes,
  qualifying,
  seats,
} from '../../src/renderer/arena/qualify.ts';
import { paintActors, paintSeats } from '../../src/renderer/arena/qualify-paint.ts';
import { FIELD } from '../../src/renderer/arena/round.ts';
import { MOUTH_CELL, arena, cellX, cellY, kill, snakeOf } from '../../src/renderer/arena/rules.ts';
import {
  ARENA_ALERTS,
  paintStrip,
  resetStrip,
  stepStrip,
  stripState,
} from '../../src/renderer/arena/strip.ts';
import {
  alertsState,
  resetAlerts,
  setAlertLook,
  setAlertsOn,
  setLikeAlerts,
  updateAlerts,
} from '../../src/renderer/feed/alerts.ts';
import { board } from '../../src/renderer/feed/control-link.ts';
import { READY_TIME, game, hooks, newRound } from '../../src/renderer/feed/state.ts';

/** What a painter did: the words it wrote, the images it drew, the colours it filled with. */
interface Painted {
  texts: string[];
  images: unknown[];
  fills: string[];
  scales: number;
}

/** A drawing context that draws nothing and writes down what it is asked. */
function recordingCtx(rec: Painted): CanvasRenderingContext2D {
  const props: Record<string, unknown> = { font: '10px sans-serif' };
  const api: Record<string, unknown> = {
    measureText: (text: string) => ({ width: text.length * 10 }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    fillText: (text: string) => {
      rec.texts.push(text);
    },
    drawImage: (image: unknown) => {
      rec.images.push(image);
    },
    scale: () => {
      rec.scales++;
    },
  };
  return new Proxy(
    {},
    {
      get: (_, key: string) =>
        key in api ? api[key] : key in props ? props[key] : () => undefined,
      set: (_, key: string, value: unknown) => {
        if (key === 'fillStyle' && typeof value === 'string') rec.fills.push(value);
        props[key] = value;
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
}
const g = globalThis as { document?: unknown };
g.document ??= {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => recordingCtx({ texts: [], images: [], fills: [], scales: 0 }),
  }),
};

/** Paints with `paint` on a recording context and returns what it did. */
function record(paint: () => void): Painted {
  const rec: Painted = { texts: [], images: [], fills: [], scales: 0 };
  const previous = setCtx(recordingCtx(rec));
  try {
    paint();
  } finally {
    setCtx(previous);
  }
  return rec;
}

const STEP = 1 / 30;
const run = (seconds: number): void => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) advanceArena(STEP);
};

/** A new round, seeded; gifts buy no seats unless `extra` says so (the default). */
function fresh(extra: Partial<ArenaSettings> = {}): void {
  setArenaSettings({
    ...ARENA_DEFAULTS,
    continuous: false,
    places: 6,
    pilot: 0,
    wildSnakes: 0,
    ...extra,
  });
  let s = 7;
  arena.rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  arena.viewers.clear();
  rings.clear();
  fired.clear();
  queue.length = 0;
  flights.length = 0;
  likePops.length = 0;
  game.queue = [];
  paidQueue.length = 0;
  arena.food = [];
  arena.foodAt.clear();
  arena.snakes = [];
  resetStrip();
  newRound();
}

const like = (nickname: string, n: number): void => {
  arenaLike(nickname, undefined, n);
};
const give = (nickname: string, berries: number): void => {
  board.gift(nickname, undefined, berries, true);
};
const holders = (): (string | null)[] => seats.map((s) => s.holder);
/** Names without digits: a digit painted on the board is a number, never part of a name. */
const NAMES = ['ana', 'ben', 'cleo', 'dan', 'eve', 'fay', 'gus', 'hal'];

describe('snake arena: calm', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  it('the clock: the qualifying pill says QUALIFYING alone, the battle has none, no tick at the end', () => {
    fresh();
    like('ana', 5);
    let ticks = 0;
    const eat = hooks.eat;
    hooks.eat = () => {
      ticks++;
    };
    try {
      run(QUALIFY.time - 6);
      const early = record(paintArenaTime);
      expect(early.texts).toEqual(['QUALIFYING']);
      expect(early.scales).toBe(0);
      // The last 5 seconds: no tick, no beat, still no digits.
      run(5.5);
      expect(ticks).toBe(0);
      const late = record(paintArenaTime);
      expect(late.texts).toEqual(['QUALIFYING']);
      expect(late.scales).toBe(0);
    } finally {
      hooks.eat = eat;
    }
    run(1 + QUALIFY.freeze + READY_TIME);
    expect(arena.phase).toBe('play');
    expect(record(paintArenaTime).texts).toEqual([]);
  });

  it('no seat is ever at risk: no red badge, nothing exported to tell one', () => {
    expect('atRisk' in qualifyModule).toBe(false);
    fresh();
    NAMES.slice(0, 6).forEach((n, i) => {
      like(n, 20 + i);
    });
    run(1);
    // A challenger right behind the weakest seat.
    like('hal', 19);
    run(1);
    expect(challengers).toContain('hal');
    const rec = record(() => {
      paintSeats(1);
      paintActors(1);
    });
    expect(rec.fills.some((f) => f.startsWith('rgba(160,20,45'))).toBe(false);
  });

  it("a seat's badge is its like count, the heart before it only while the switch is on", () => {
    fresh();
    expect(ARENA_DEFAULTS.likeHeart).toBe(true);
    like('ana', 12);
    like('ben', 7);
    run(1.2);
    likePops.length = 0;
    const on = record(() => {
      paintActors(1);
    });
    expect(on.texts.filter((t) => /\d/.test(t)).sort()).toEqual(['12', '7']);
    expect(on.images.filter((i) => i === bigHeart(true))).toHaveLength(2);
    // Switched off from the control room, live: the number alone.
    const storage = { getItem: () => null, setItem: () => undefined };
    applyArenaCommand({ cmd: 'arena-setting', name: 'likeHeart', value: false }, { storage });
    const off = record(() => {
      paintActors(1);
    });
    expect(off.texts.filter((t) => /\d/.test(t)).sort()).toEqual(['12', '7']);
    expect(off.images.includes(bigHeart(true))).toBe(false);
    applyArenaCommand({ cmd: 'arena-setting', name: 'likeHeart', value: true }, { storage });
  });

  it('hearts float on the sides of the photo, never over its name or its badge, a few a like', () => {
    fresh();
    like('ana', 12);
    like('ben', 7);
    run(1.2);
    likePops.length = 0;
    // A single like: 10 hearts, a beat apart, each from its own place on the photo's sides.
    like('ana', 1);
    expect(likePops.filter((h) => h.nickname === 'ana')).toHaveLength(10);
    const seen: { x: number; y: number; cx: number; cy: number; r: number }[] = [];
    for (let i = 0; i < Math.round(1.6 / STEP); i++) {
      advanceArena(STEP);
      seen.push(...likePopSpots().filter((p) => p.nickname === 'ana'));
    }
    expect(seen.length).toBeGreaterThan(20);
    for (const p of seen) {
      // Beside the photo, never over its middle where the name and the badge are.
      expect(Math.abs(p.x - p.cx)).toBeGreaterThan(p.r * 0.85);
      // A heart's top stays under the name's baseline; its middle above the badge's middle.
      expect(p.y - 15).toBeGreaterThan(p.cy - p.r - 6);
      expect(p.y).toBeLessThan(p.cy + p.r);
    }
    // They float as Feed's do, about 1.3 s: gone a moment after the last leaves.
    run(1);
    expect(likePops.filter((h) => h.nickname === 'ana')).toHaveLength(0);
    // More for a burst, up to a cap for one viewer: a flood never covers the photo.
    like('ben', 50);
    expect(likePops.filter((h) => h.nickname === 'ben')).toHaveLength(14);
    like('ben', 1000);
    like('ben', 1000);
    expect(likePops.filter((h) => h.nickname === 'ben')).toHaveLength(16);
    // The likes still count, every one of them.
    expect(qualLikes.get('ben')).toBe(2057);
  });

  it("the strip's chips: the ring and no number, before and at a boost", () => {
    fresh();
    NAMES.slice(0, 4).forEach((n) => {
      like(n, 10);
    });
    run(QUALIFY.time + QUALIFY.freeze + READY_TIME + 0.5);
    expect(arena.phase).toBe('play');
    BOOST.likes = 100;
    like('ana', 60);
    run(0.2);
    stepStrip();
    expect(stripState().find((c) => c.nickname === 'ana')?.percent).toBe(60);
    // The photos' initials are all the words a chip holds.
    expect(record(paintStrip).texts.filter((t) => /[\d%]/.test(t))).toEqual([]);
    like('ana', 50);
    run(0.1);
    stepStrip();
    expect(stripState().find((c) => c.nickname === 'ana')?.full).toBe(true);
    expect(record(paintStrip).texts.filter((t) => /[\d%]/.test(t))).toEqual([]);
  });

  it('gifts buy seats: a gift takes the weakest like seat with an ordinary swap, no trip to the beach', () => {
    fresh({ giftSeats: true });
    NAMES.slice(0, 6).forEach((n, i) => {
      like(n, 20 + i);
    });
    run(1.5);
    expect(holders().every((h) => h !== null)).toBe(true);
    give('hal', 5);
    // The weakest like seat's holder crosses down to the first challenger's place.
    expect(holders()).toContain('hal');
    expect(holders()).not.toContain('ana');
    expect(challengers[0]).toBe('ana');
    const down = actors.get('ana');
    expect(down?.leaving).toBe(false);
    run(QUALIFY.show + QUALIFY.fly + 0.2);
    expect(locked).toEqual(['hal']);
    expect(challengers).toContain('ana');
  });
});

describe('snake arena: "Gifts buy seats", off by default', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  it('is off by default, a switch, kept with the settings', () => {
    expect(ARENA_DEFAULTS.giftSeats).toBe(false);
    expect(readArenaSettings(null).giftSeats).toBe(false);
    expect(sanitizeArenaSetting('giftSeats', true)).toBe(true);
    expect(sanitizeArenaSetting('giftSeats', 'yes')).toBeUndefined();
    const map = new Map<string, string>(),
      storage = {
        getItem: (key: string) => map.get(key) ?? null,
        setItem: (key: string, value: string) => {
          map.set(key, value);
        },
      };
    applyArenaCommand({ cmd: 'arena-setting', name: 'giftSeats', value: true }, { storage });
    expect(arenaSettings.giftSeats).toBe(true);
    expect(readArenaSettings(map.get(ARENA_STORAGE_KEY)).giftSeats).toBe(true);
    applyArenaCommand({ cmd: 'arena-setting', name: 'giftSeats', value: false }, { storage });
    expect(readArenaSettings(map.get(ARENA_STORAGE_KEY)).giftSeats).toBe(false);
  });

  it('off: a qualifying gift buys no seat, the flower thanks the giver; the race is the likes', () => {
    fresh();
    NAMES.slice(0, 6).forEach((n, i) => {
      like(n, 20 + i);
    });
    run(1.5);
    const before = holders();
    give('hal', 50);
    run(0.3);
    expect(holders()).toEqual(before);
    expect(locked).toHaveLength(0);
    expect(paidQueue).toHaveLength(0);
    // The flower opens on the giver as for any gift: their berry, no gold egg.
    expect(game.pour?.nickname).toBe('hal');
    expect(game.pour?.seat).toBeFalsy();
    // Likes alone decide: hal's likes take the weakest seat at the cut.
    like('hal', 40);
    run(1);
    expect(holders()).toContain('hal');
    expect(locked).toHaveLength(0);
  });

  it('off: a battle gift buys no place in line; a player gets berries; the seat price is a plain gift', () => {
    fresh({ seatPrice: 99 });
    expect(isSeatGift(99)).toBe(false);
    like('ana', 30);
    like('ben', 20);
    run(QUALIFY.time + QUALIFY.freeze + READY_TIME + 0.5);
    expect(arena.phase).toBe('play');
    give('stranger', 10);
    give('ana', 5);
    expect(paidQueue).toHaveLength(0);
    expect(game.queue.some((q) => q.nickname === 'ana' && !q.seat)).toBe(true);
    run(0.5);
    expect(game.pour?.seat).toBeFalsy();
    // The next round opens with nobody on a paid seat.
    expect(takePaidBatch()).toEqual([]);
    const ben = snakeOf('ben');
    if (ben) kill(ben, null, 'accident');
    run(15);
    expect(qualifying()).toBe(true);
    expect(locked).toHaveLength(0);
  });

  it('switched off, the paid queue empties', () => {
    fresh({ giftSeats: true });
    like('ana', 30);
    run(QUALIFY.time + QUALIFY.freeze + READY_TIME + 0.5);
    give('stranger', 10);
    expect(paidQueue.map((q) => q.nickname)).toEqual(['stranger']);
    setArenaSettings({
      ...ARENA_DEFAULTS,
      continuous: false,
      places: 6,
      pilot: 0,
      wildSnakes: 0,
    });
    expect(paidQueue).toHaveLength(0);
  });
});

describe('snake arena: the pilot likes as an engaged viewer', () => {
  beforeAll(() => {
    // A supporter with a loaded picture for the pilot to show.
    pilotHooks.pool = () => [{ nickname: 'Skohlds', avatar: 'https://p.test/skohlds.jpg' }];
    pilotHooks.ready = () => true;
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  it('bursts of 5 to 15 likes every 0.5 to 1 s in the qualifying, hearts round its picture', () => {
    fresh({ pilot: 1 });
    let pops = 0;
    for (let i = 0; i < Math.round((QUALIFY.time - 1) / STEP); i++) {
      advanceArena(STEP);
      pops = Math.max(pops, likePops.filter((h) => h.nickname === PILOT.key).length);
    }
    const likes = qualLikes.get(PILOT.key) ?? 0,
      seconds = QUALIFY.time - 1;
    expect(likes).toBeGreaterThanOrEqual(
      (seconds / PILOT_LIKES.gap[1]) * PILOT_LIKES.burst[0] * 0.8,
    );
    expect(likes).toBeLessThanOrEqual((seconds / PILOT_LIKES.gap[0] + 1) * PILOT_LIKES.burst[1]);
    expect(holders()).toContain(PILOT.key);
    expect(pops).toBeGreaterThan(0);
    setArenaSettings({ ...ARENA_DEFAULTS, continuous: false, pilot: 0 });
  });

  it("its likes get the like card in the qualifying, as a viewer's do", () => {
    fresh({ pilot: 1 });
    setAlertsOn(true);
    setAlertLook(ARENA_ALERTS);
    setLikeAlerts(true);
    resetAlerts();
    run(2);
    updateAlerts(0.01);
    const card = alertsState().current;
    expect(card?.kind).toBe('like');
    expect(card?.nickname).toBe(nameOf(PILOT.key));
    setLikeAlerts(false);
    setArenaSettings({ ...ARENA_DEFAULTS, continuous: false, pilot: 0 });
  });

  it('in the battle, a speed boost every 15 to 25 s, its chip on the strip', () => {
    fresh({ pilot: 1 });
    like('ana', 3);
    run(QUALIFY.time + QUALIFY.freeze + READY_TIME + 0.5);
    expect(arena.phase).toBe('play');
    expect(snakeOf(PILOT.key)).toBeDefined();
    stepStrip();
    expect(stripState().some((c) => c.nickname === PILOT.key)).toBe(true);
    // A boost: its snake dashes and grows, its chip turns gold, the card names it.
    setAlertsOn(true);
    setAlertLook(ARENA_ALERTS);
    resetAlerts();
    const snake = snakeOf(PILOT.key),
      grow = snake?.grow ?? 0;
    for (let i = 0; i < Math.round(30 / STEP) && !fired.has(PILOT.key); i++) {
      arena.clock += STEP;
      updatePilot(STEP);
    }
    expect(fired.has(PILOT.key)).toBe(true);
    expect(snake?.boost ?? 0).toBeGreaterThan(0);
    expect(snake?.grow ?? 0).toBeGreaterThan(grow);
    stepStrip();
    expect(stripState().find((c) => c.nickname === PILOT.key)?.full).toBe(true);
    updateAlerts(0.01);
    expect(alertsState().current?.kind).toBe('boost');
    expect(alertsState().current?.nickname).toBe(nameOf(PILOT.key));
    // Its pace alone, the board held still: the boosts it fires over 100 s.
    BOOST.likes = 100;
    const boosts: number[] = [];
    let last = fired.get(PILOT.key);
    for (let i = 0; i < Math.round(100 / STEP); i++) {
      arena.clock += STEP;
      updatePilot(STEP);
      const now = fired.get(PILOT.key);
      if (now !== undefined && now !== last) boosts.push(now);
      last = now;
    }
    expect(boosts.length).toBeGreaterThanOrEqual(4);
    expect(boosts.length).toBeLessThanOrEqual(7);
    for (let i = 1; i < boosts.length; i++) {
      const gap = (boosts[i] ?? 0) - (boosts[i - 1] ?? 0);
      expect(gap).toBeGreaterThanOrEqual(PILOT_LIKES.boostEvery[0] - 1.5);
      expect(gap).toBeLessThanOrEqual(PILOT_LIKES.boostEvery[1] + 1.5);
    }
    setArenaSettings({ ...ARENA_DEFAULTS, continuous: false, pilot: 0 });
  });
});

describe('snake arena: plain berries come from the flower', () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  it('at GO the flower opens with nobody on it and drops the 3, one after the other, away from heads', () => {
    fresh();
    like('ana', 30);
    like('ben', 20);
    run(QUALIFY.time + QUALIFY.freeze + READY_TIME - 0.1);
    const plain = (): number => arena.food.filter((f) => f.by === '' && !f.glow).length;
    expect(plain()).toBe(0);
    const counts: number[] = [];
    let opened = false;
    const seen = new Set<unknown>();
    for (let i = 0; i < Math.round(2 / STEP); i++) {
      advanceArena(STEP);
      if (game.pour?.nickname === '') opened = true;
      if (counts.at(-1) !== plain()) counts.push(plain());
      for (const f of arena.food.filter((b) => b.by === '' && !seen.has(b))) {
        seen.add(f);
        // From the flower's mouth, onto a free cell away from every head.
        expect(f.fx).toBe(MOUTH_CELL.x);
        for (const sn of arena.snakes.filter((x) => x.alive)) {
          const h = sn.cells[0] ?? -1;
          expect(Math.abs(cellX(h) - f.x) + Math.abs(cellY(h) - f.y)).toBeGreaterThanOrEqual(
            FIELD.clear - 1,
          );
        }
      }
    }
    expect(opened).toBe(true);
    expect(counts).toEqual([0, 1, 2, 3]);
    // None due: the flower closes.
    run(1.5);
    expect(game.closeT).toBeGreaterThan(0);
  });

  it('a gift has the flower first: a plain berry waits until it is free', () => {
    fresh();
    like('ana', 30);
    like('ben', 20);
    run(QUALIFY.time + QUALIFY.freeze + READY_TIME + 2);
    const plain = (): number => arena.food.filter((f) => f.by === '' && !f.glow).length;
    expect(plain()).toBe(FIELD.count);
    // One plain berry eaten, then a gift: its berries pour for seconds.
    const one = arena.food.find((f) => f.by === '');
    if (one) {
      arena.food.splice(arena.food.indexOf(one), 1);
      arena.foodAt.delete(one.cell);
    }
    give('ana', 40);
    let pouring = 0,
      was = plain(),
      after = 0;
    for (let i = 0; i < Math.round(12 / STEP); i++) {
      advanceArena(STEP);
      const now = plain();
      if (game.queue.some((q) => q.nickname === 'ana')) {
        pouring += STEP;
        // While the gift has the flower, no plain berry leaves it.
        expect(now).toBeLessThanOrEqual(was);
        expect(game.pour?.nickname).toBe('ana');
      } else if (now > was) after++;
      was = now;
    }
    expect(pouring).toBeGreaterThan(2.5);
    // Once the gift is poured, the plain berries due come.
    expect(after).toBeGreaterThan(0);
  });
});

describe("snake arena: the flower's plain berry settings, applied at once", () => {
  beforeAll(() => {
    hooks.round = () => {
      newArenaRound();
    };
    countOnArena();
  });

  const plainOut = (): number => arena.food.filter((f) => f.by === '' && !f.glow).length;
  const toGo = (extra: Partial<ArenaSettings>): void => {
    fresh(extra);
    like('ana', 30);
    like('ben', 20);
    run(QUALIFY.time + QUALIFY.freeze + READY_TIME - 0.1);
  };

  it('"Plain berries on the board": 0 is none, the flower never opens for them; 1 keeps one', () => {
    toGo({ plainAmount: 0 });
    for (let i = 0; i < Math.round(4 / STEP); i++) {
      advanceArena(STEP);
      expect(plainOut()).toBe(0);
      expect(game.pour?.nickname === '' && game.closeT === 0).toBe(false);
    }
    toGo({ plainAmount: 1 });
    let most = 0;
    for (let i = 0; i < Math.round(3 / STEP); i++) {
      advanceArena(STEP);
      most = Math.max(most, plainOut());
    }
    expect(most).toBe(1);
  });

  it('"Plain berry delay": a new one comes that many seconds after one is eaten', () => {
    toGo({ plainAmount: 1, plainEvery: 5 });
    run(2.5);
    expect(plainOut()).toBe(1);
    const one = arena.food.find((f) => f.by === '');
    if (one) {
      arena.food.splice(arena.food.indexOf(one), 1);
      arena.foodAt.delete(one.cell);
    }
    let back = -1;
    for (let i = 0; i < Math.round(9 / STEP) && back < 0; i++) {
      advanceArena(STEP);
      if (plainOut() > 0) back = (i + 1) * STEP;
    }
    // 5 s, then the flower opens (0.6 s) before the berry leaves it.
    expect(back).toBeGreaterThan(4.9);
    expect(back).toBeLessThan(6.2);
  });

  it('after the last plain berry the flower stays open about 1.5 s, then closes', () => {
    toGo({ plainAmount: 1, plainEvery: 25 });
    let dropped = -1,
      closed = -1;
    for (let i = 0; i < Math.round(6 / STEP) && closed < 0; i++) {
      advanceArena(STEP);
      if (dropped < 0 && plainOut() > 0) dropped = i * STEP;
      if (dropped >= 0 && game.closeT > 0) closed = i * STEP;
    }
    expect(dropped).toBeGreaterThan(0);
    expect(closed - dropped).toBeGreaterThan(1.3);
    expect(closed - dropped).toBeLessThan(1.8);
  });

  it('the settings are kept and read back as the control room set them', () => {
    expect(sanitizeArenaSetting('plainAmount', 0)).toBe(0);
    expect(sanitizeArenaSetting('plainAmount', 6)).toBe(6);
    expect(sanitizeArenaSetting('plainAmount', 7)).toBeUndefined();
    expect(sanitizeArenaSetting('plainEvery', 1)).toBe(1);
    expect(sanitizeArenaSetting('plainEvery', 4)).toBeUndefined();
    expect(readArenaSettings(JSON.stringify({ plainAmount: 5, plainEvery: 10 }))).toMatchObject({
      plainAmount: 5,
      plainEvery: 10,
    });
    expect(readArenaSettings(null)).toMatchObject({ plainAmount: 3, plainEvery: 2 });
  });
});
