// Snake Arena: the snakes' brains, on the grid, after the Duel's (scripts/ai-human.ts: stances
// with inertia, blocking ahead of the other head, pocket checks). The default is calm: each snake
// eats and travels like the Feed snake, on long paths, keeping its distance from the others. A
// chase is rare and readable: only when a snake is clearly bigger than a close neighbour, or its
// owner's likes have just boosted it; one chase on the whole board at a time, a long rest after.
// The chased one turns away. Whatever the mode, the next cell comes from a breadth-first search
// over the free cells, and a step is only taken into a cell from which the whole body still fits:
// a flood fill counts the room it leaves, as classic snake players do, so a snake does not curl
// into a pocket smaller than itself.

import { FCOLS, FROWS } from '../feed/grid.ts';
import { FALL_TIME } from '../feed/state.ts';
import { TOTAL, TUNING, cellX, cellY, edibleBy, onBoard, type Food, type Snake } from './rules.ts';

/** What a brain sees of the arena. */
export interface Sight {
  occ: Int16Array;
  reserved: Int16Array;
  foodAt: Map<number, Food>;
  snakes: readonly Snake[];
}

const REACH = 0.3, // how a cell's worth fades with every step to reach it
  OWN = 40, // a snake's own paid berries: above any other food, its first aim
  CUT = 3.5, // the cell in front of the chased head
  DWELL = 0.6,
  CALM = 1,
  /** The rest after a chase is kept under this key of a snake's cooldowns. */
  REST = -1;

const dist = new Int32Array(TOTAL),
  parent = new Int32Array(TOTAL),
  danger = new Uint8Array(TOTAL),
  near = new Uint8Array(TOTAL),
  worth = new Float32Array(TOTAL),
  seen = new Uint8Array(TOTAL),
  queue = new Int32Array(TOTAL);

export function neighbours(cell: number): number[] {
  const x = cellX(cell),
    y = cellY(cell),
    out: number[] = [];
  if (y >= 0 && y < FROWS && x > 0) out.push(cell - 1);
  if (y >= 0 && y < FROWS && x < FCOLS - 1) out.push(cell + 1);
  if (y > 0 && y < FROWS) out.push(cell - FCOLS);
  if (y >= 0 && y < FROWS - 1) out.push(cell + FCOLS);
  return out;
}

/**
 * Free cells reachable from `from`, counted up to `limit`: how much room a step leaves. The
 * snake's own body counts as room only where its tail will have moved on by the time it gets
 * there (the Duel's AI follows its tail the same way); another snake's body never does.
 */
export function roomFrom(from: number, me: Snake, s: Sight, limit: number): number {
  seen.fill(0);
  const own = new Map<number, number>();
  me.cells.forEach((c, i) => own.set(c, i));
  const len = me.cells.length,
    mine = me.id + 1;
  let head = 0,
    tail = 0;
  queue[tail++] = from;
  seen[from] = 1;
  dist[from] = 1;
  let n = 0;
  while (head < tail && n < limit) {
    const c = queue[head++] ?? 0,
      d = (dist[c] ?? 1) + 1;
    n++;
    for (const k of neighbours(c)) {
      if (seen[k]) continue;
      const o = s.occ[k] ?? 0;
      if (o !== 0 && o !== mine) continue;
      // While growth is owed the tail holds still: its cells free that much later.
      if (o === mine && d < len - (own.get(k) ?? 0) + Math.ceil(me.grow)) continue;
      seen[k] = 1;
      dist[k] = d;
      queue[tail++] = k;
    }
  }
  return n;
}

/** The mode machine between steps: who threatens me, whether a chase may start. */
export function updateMode(
  me: Snake,
  others: readonly Snake[],
  dt: number,
  now: number,
  hunting: Map<number, number>,
): void {
  const escapeAt = me.backing >= 3 && brain.backing === 'strong' ? 6.5 : 4.5;
  me.modeT += dt;
  let threat: Snake | null = null,
    threatD = Infinity,
    prey: Snake | null = null,
    preyD = Infinity;
  const anyChase = hunting.size > 0,
    resting = (me.cool.get(REST) ?? 0) > now;
  for (const o of others) {
    const d = Math.hypot(o.x - me.x, o.y - me.y),
      facing =
        Math.abs(
          ((Math.atan2(me.y - o.y, me.x - o.x) - o.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
        ) < 1.2,
      afterMe = o.mode === 'chase' && o.target === me.id;
    if (
      ((o.len >= me.len * TUNING.bigger && facing && d < escapeAt) || (afterMe && d < 8)) &&
      d < threatD
    ) {
      threat = o;
      threatD = d;
    }
    const clearlyBigger = me.len >= o.len * preyGuard(o.backing),
      boosted = me.boost > 0 && o.len < me.len;
    if ((clearlyBigger || boosted) && d <= TUNING.huntRange && d < preyD && o.safe <= 0) {
      prey = o;
      preyD = d;
    }
  }
  const target = me.mode === 'chase' ? others.find((o) => o.id === me.target) : undefined;
  if (threat && me.mode !== 'defend') {
    if (me.mode === 'chase') me.cool.set(REST, now + TUNING.chaseRest);
    me.mode = 'defend';
    me.modeT = 0;
    me.target = threat.id;
  } else if (me.mode === 'defend' && !threat && me.modeT > CALM) {
    me.mode = 'eat';
    me.modeT = 0;
    me.target = -1;
  } else if (me.mode === 'chase') {
    me.chaseT += dt;
    const lost = !target || Math.hypot(target.x - me.x, target.y - me.y) > TUNING.huntRange + 4;
    if (lost || me.chaseT > TUNING.chaseMax) {
      me.cool.set(REST, now + TUNING.chaseRest);
      me.mode = 'eat';
      me.modeT = 0;
      me.target = -1;
    }
  } else if (me.mode === 'eat' && prey && !anyChase && !resting && me.modeT > DWELL) {
    me.mode = 'chase';
    me.modeT = 0;
    me.target = prey.id;
    me.chaseT = 0;
  }
}

/**
 * The cell just behind the head, -1 for a snake one cell long. A snake goes straight on or turns
 * left or right, never back the way it came: whatever the brain, this cell is never its next.
 */
export const neckOf = (me: Snake): number => (me.cells.length > 1 ? (me.cells[1] ?? -1) : -1);

/**
 * The snake's own tail cell is free to step into when the tail leaves it on that same step: no
 * growth owed and the body at its full length. A coiled snake's way out is often just that.
 */
export function tailMoves(me: Snake, c: number): boolean {
  return (
    c === me.cells[me.cells.length - 1] &&
    me.cells.length > 1 &&
    me.grow < 1e-6 &&
    Math.ceil(me.len - 1e-6) <= me.cells.length
  );
}

/** A move's score for leaving room enough: above anything the other terms can add up to. */
const SAFE = 100_000;

/** The strong brain's cost of a cell next to a bigger head: a head-on lost. */
const HEAD_ON = 5000;

/** Room a step must leave: the whole body and a little more, so the snake never boxes itself in. */
export const roomNeeded = (len: number): number => Math.ceil(len) + 2;

/** Seconds a berry lies on the board before a head can eat it: never gone as soon as it lands. */
export const BERRY_STAY = 0.5;

/** A berry a head entering its cell eats now: landed, and on the board for BERRY_STAY. */
export const settled = (f: Food): boolean => f.t >= FALL_TIME + BERRY_STAY;

/**
 * A berry still falling, or only just landed, is only worth aiming at if the snake gets there once
 * it can be eaten (settled): a head that arrives first passes over it and leaves it there.
 */
export const landsInTime = (f: Food, steps: number, speed: number): boolean =>
  settled(f) || steps >= (FALL_TIME + BERRY_STAY - f.t) * speed;

/** The next cell for the snake, or -1 when no cell would let it live. */
export function chooseNext(me: Snake, s: Sight, rand: () => number): number {
  const level = brainFor(me.backing);
  if (level >= 2) return superNext(me, s, rand);
  const head = me.cells[0] ?? 0,
    neck = neckOf(me),
    len = me.len,
    mine = me.id + 1;
  danger.fill(0);
  near.fill(0);
  worth.fill(0);
  let ownWaiting = false;
  for (const f of s.foodAt.values()) if (f.by !== '' && f.by === me.nickname) ownWaiting = true;
  const chased =
      me.mode === 'chase' && !ownWaiting ? s.snakes.find((o) => o.id === me.target) : undefined,
    near2 = (o: Snake): boolean => Math.hypot(o.x - me.x, o.y - me.y) <= 2.5,
    // With its own berries waiting, only a head right there is fled.
    threat =
      me.mode === 'defend'
        ? s.snakes.find((o) => o.id === me.target && (!ownWaiting || near2(o)))
        : undefined;
  for (const o of s.snakes) {
    if (o.id === me.id || !o.alive) continue;
    const oh = o.cells[0] ?? -1;
    if (!onBoard(oh)) continue;
    // Next to any other head is where heads meet: avoided unless chasing. Within keepAway of a
    // head is crowded: avoided when a calmer road exists.
    danger[oh] = 1;
    for (const k of neighbours(oh)) danger[k] = 1;
    const ox = cellX(oh),
      oy = cellY(oh);
    for (let dy = -TUNING.keepAway; dy <= TUNING.keepAway; dy++)
      for (let dx = -TUNING.keepAway; dx <= TUNING.keepAway; dx++) {
        const x = ox + dx,
          y = oy + dy;
        if (
          x >= 0 &&
          y >= 0 &&
          x < FCOLS &&
          y < FROWS &&
          Math.abs(dx) + Math.abs(dy) <= TUNING.keepAway
        )
          near[y * FCOLS + x] = 1;
      }
  }
  const hx0 = cellX(head),
    hy0 = cellY(head);
  for (const [c, f] of s.foodAt)
    if (
      edibleBy(f, me) &&
      landsInTime(f, Math.abs(cellX(c) - hx0) + Math.abs(cellY(c) - hy0), me.speed)
    )
      worth[c] = f.value * (f.by !== '' && f.by === me.nickname ? OWN : 1);
  if (chased) {
    // Blocking, as the Duel does it: the cells on its line of travel, 1 to 3 ahead.
    const n = chased.next,
      d = n - (chased.cells[0] ?? n);
    for (let k = 1; k <= 3; k++) {
      const c = n + d * k;
      if (onBoard(c) && Math.abs(cellX(c) - cellX(n)) <= 3 && !(s.occ[c] ?? 0))
        worth[c] = Math.max(worth[c] ?? 0, CUT - k * 0.5);
    }
  }
  const free = (c: number): boolean => {
    if (c === neck || ((s.occ[c] ?? 0) !== 0 && !tailMoves(me, c))) return false;
    const r = s.reserved[c] ?? 0;
    if (r === 0 || r === mine) return true;
    const o = s.snakes.find((x) => x.id === r - 1);
    return !!o && o.len * 1.05 < len;
  };
  // Three passes: the calm road first (no crowd, no heads), then only heads kept clear, then anything.
  // With its own berries waiting, a crowd is no reason for a detour or for other food: the calm
  // road is skipped, heads are still kept clear.
  let best = -1;
  for (const pass of ownWaiting ? [1, 0] : [2, 1, 0]) {
    dist.fill(-1);
    dist[head] = 0;
    parent[head] = -1;
    let qh = 0,
      qt = 0;
    queue[qt++] = head;
    best = -1;
    let bestScore = 0;
    while (qh < qt) {
      const c = queue[qh++] ?? 0,
        d = (dist[c] ?? 0) + 1;
      for (const k of neighbours(c)) {
        if ((dist[k] ?? -1) >= 0 || !free(k)) continue;
        if (pass >= 1 && danger[k] && !(chased && (worth[k] ?? 0) >= CUT - 1.5)) continue;
        if (pass >= 2 && near[k] && !chased) continue;
        dist[k] = d;
        parent[k] = c;
        queue[qt++] = k;
        const score = (worth[k] ?? 0) / (1 + REACH * d);
        if (score > bestScore) {
          best = k;
          bestScore = score;
        }
      }
    }
    if (best >= 0) break;
  }
  let moves = neighbours(head).filter(free);
  if (!moves.length) {
    // Boxed in: the only hope is a tail about to move on (the Duel's AI follows tails too).
    moves = neighbours(head).filter((k) => {
      const o = s.snakes.find(
        (x) => k !== neck && x.alive && x.id !== me.id && x.cells[x.cells.length - 1] === k,
      );
      return !!o && o.grow < 1 && o.cells.length > 2;
    });
    return moves[Math.floor(rand() * moves.length)] ?? -1;
  }
  let step = -1;
  if (best >= 0) {
    let c = best;
    while (c >= 0 && (parent[c] ?? -1) !== head) c = parent[c] ?? -1;
    step = c;
  }
  // The flood fill: how much room each move leaves, against the room the whole body needs (the
  // basic brain of a snake nobody backs looks less far).
  const full = roomNeeded(len + me.grow),
    need = level === 0 ? Math.min(full, 24) : full,
    room = new Map<number, number>();
  for (const k of moves) room.set(k, roomFrom(k, me, s, need + 1));
  if (step >= 0 && (room.get(step) ?? 0) >= need && !threat) return step;
  // Travel: the roomiest calm cell, straight on when possible, away from a threat, toward the middle.
  const hx = cellX(head),
    hy = cellY(head),
    heading = me.cells.length > 1 ? head - (me.cells[1] ?? head) : FCOLS;
  let pick = -1,
    pickScore = -Infinity;
  for (const k of moves) {
    const r = room.get(k) ?? 0,
      kx = cellX(k),
      ky = cellY(k);
    // Room comes first: a move that leaves the body room always beats one that does not.
    let score = (r >= need ? SAFE : r * 2) + rand() * 0.4;
    if (k - head === heading) score += 1.5;
    if (danger[k]) score -= 6;
    if (near[k]) score -= 2.5;
    if (k === step) score += 2;
    if (threat) score += Math.min(10, Math.abs(kx - threat.x) + Math.abs(ky - threat.y)) * 0.8;
    else
      score +=
        (Math.abs(hx - FCOLS / 2) +
          Math.abs(hy - FROWS / 2) -
          (Math.abs(kx - FCOLS / 2) + Math.abs(ky - FROWS / 2))) *
        0.3;
    if (score > pickScore) {
      pick = k;
      pickScore = score;
    }
  }
  return pick;
}

// ---- the super AI (control room test switch) -----------------------------------------------

/**
 * Which brain each snake plays. `super` on: every snake plays the strong brain; off, the calm one.
 * `backing`: how much a viewer's gifts this round make their snake smarter and safer (Off, Light,
 * Strong): backed snakes look further ahead and are chased less, likes-only and wild ones look
 * less far.
 */
export const brain = { super: true, backing: 'off' as 'off' | 'light' | 'strong' };

/** Backing levels by berries given this round: none, 1+, 30+, 100+. */
const BACKING = [1, 30, 100] as const;
export function backingOf(gifted: number): number {
  let level = 0;
  for (const at of BACKING) if (gifted >= at) level++;
  return level;
}

/** The brain a snake of this backing plays: 0 calm and short-sighted, 1 calm, 2 strong. */
function brainFor(level: number): number {
  if (brain.super) return 2;
  if (brain.backing === 'off') return 1;
  if (brain.backing === 'light') return 1;
  return level >= 1 ? 1 : 0;
}

/** How much bigger a chaser must be to pick this prey: backed snakes are rarely chosen. */
function preyGuard(level: number): number {
  const step = brain.backing === 'strong' ? 0.5 : brain.backing === 'light' ? 0.25 : 0;
  return TUNING.bigger + step * level;
}

const sDist = new Int32Array(TOTAL),
  sQueue = new Int32Array(TOTAL),
  sSeen = new Uint8Array(TOTAL);

/**
 * Room left after the snake's head moves along `path` (its first cells, nearest first): a flood
 * fill over free cells where the body counts as free only once its tail will have left it.
 */
function roomAfter(path: readonly number[], me: Snake, s: Sight, limit: number): number {
  const cells = [...path]
      .reverse()
      .concat(me.cells)
      .slice(0, Math.max(1, Math.ceil(me.len))),
    own = new Map<number, number>();
  cells.forEach((c, i) => own.set(c, i));
  sSeen.fill(0);
  const from = path[path.length - 1] ?? me.cells[0] ?? 0,
    len = cells.length,
    mine = me.id + 1;
  let head = 0,
    tail = 0,
    n = 0;
  sQueue[tail++] = from;
  sSeen[from] = 1;
  sDist[from] = 1;
  while (head < tail && n < limit) {
    const c = sQueue[head++] ?? 0,
      d = (sDist[c] ?? 1) + 1;
    n++;
    for (const k of neighbours(c)) {
      if (sSeen[k]) continue;
      const o = s.occ[k] ?? 0,
        at = own.get(k);
      if (at !== undefined) {
        if (d < len - at + Math.ceil(me.grow)) continue;
      } else if (o !== 0 && o !== mine) continue;
      sSeen[k] = 1;
      sDist[k] = d;
      sQueue[tail++] = k;
    }
  }
  return n;
}

/** Steps from `from` to every free cell (-1 when out of reach), by breadth-first search. */
function stepsFrom(from: number, s: Sight, blocked: (c: number) => boolean): Int32Array {
  const out = new Int32Array(TOTAL).fill(-1);
  let head = 0,
    tail = 0;
  sQueue[tail++] = from;
  out[from] = 0;
  while (head < tail) {
    const c = sQueue[head++] ?? 0;
    for (const k of neighbours(c)) {
      if ((out[k] ?? -1) >= 0 || (s.occ[k] ?? 0) !== 0 || blocked(k)) continue;
      out[k] = (out[c] ?? 0) + 1;
      sQueue[tail++] = k;
    }
  }
  return out;
}

/** Moves of look-ahead by backing: likes-only snakes check one, the best-backed three. */
const depthFor = (level: number): number =>
  brain.backing === 'off' ? 2 : level >= 2 ? 3 : level >= 1 ? 2 : 1;

/**
 * Whether the snake, after `path`, can still find a move leaving it room `depth - 1` more times:
 * the look-ahead. Each step is checked with the flood fill.
 */
function holds(
  path: number[],
  me: Snake,
  s: Sight,
  need: number,
  limit: number,
  depth: number,
): boolean {
  if (roomAfter(path, me, s, limit) < need) return false;
  if (depth <= 1) return true;
  const last = path[path.length - 1] ?? 0;
  for (const k of neighbours(last)) {
    if (path.includes(k) || (s.occ[k] ?? 0) !== 0 || me.cells.slice(0, -path.length).includes(k))
      continue;
    if (holds([...path, k], me, s, need, limit, depth - 1)) return true;
  }
  return false;
}

/** The cells a head can take in its next `steps` moves going on as it goes: where it is heading. */
function heading(o: Snake, steps: number): number[] {
  const out: number[] = [],
    head = o.cells[0] ?? -1;
  if (!onBoard(head) || !onBoard(o.next)) return out;
  const dx = cellX(o.next) - cellX(head),
    dy = cellY(o.next) - cellY(head);
  let x = cellX(o.next),
    y = cellY(o.next);
  out.push(o.next);
  for (let i = 1; i < steps; i++) {
    x += dx;
    y += dy;
    if (x < 0 || y < 0 || x >= FCOLS || y >= FROWS) break;
    out.push(y * FCOLS + x);
  }
  return out;
}

/**
 * The strong brain: never a move that leaves less room than the body needs, checked one to three
 * moves ahead by backing; a food goal held until it is eaten, gone or taken by a bigger head, so
 * the route is straight; other heads read a few moves ahead, the bigger ones kept clear of and the
 * smaller ones cut off when the cell in front of them is reached first; an early escape from a
 * bigger head coming this way.
 */
export function superNext(me: Snake, s: Sight, rand: () => number): number {
  const head = me.cells[0] ?? 0,
    neck = neckOf(me),
    len = me.len,
    mine = me.id + 1,
    need = roomNeeded(len + me.grow),
    limit = need * 2,
    depth = depthFor(me.backing);
  const free = (c: number): boolean => {
    if (c === neck || ((s.occ[c] ?? 0) !== 0 && !tailMoves(me, c))) return false;
    const r = s.reserved[c] ?? 0;
    if (r === 0 || r === mine) return true;
    const o = s.snakes.find((x) => x.id === r - 1);
    return !!o && o.len * 1.05 < len;
  };
  // Bigger heads: next to them is where a head-on is lost; where they are heading, soon.
  const risky = new Map<number, number>(),
    hunters: Snake[] = [],
    escapeAt = me.backing >= 3 ? 11 : me.backing >= 1 ? 9 : 7;
  for (const o of s.snakes) {
    if (o.id === me.id || !o.alive || !o.in || !onBoard(o.cells[0] ?? -1)) continue;
    if (o.len * 1.05 >= len) {
      // Next to a bigger head is a head-on lost: worse than any berry is worth.
      for (const k of neighbours(o.cells[0] ?? 0)) risky.set(k, HEAD_ON);
      heading(o, 3).forEach((c, i) => {
        risky.set(c, Math.max(risky.get(c) ?? 0, 300 - i * 90));
        for (const k of neighbours(c)) risky.set(k, Math.max(risky.get(k) ?? 0, 150 - i * 50));
      });
      if (Math.hypot(o.x - me.x, o.y - me.y) < escapeAt) hunters.push(o);
    }
  }
  const moves = neighbours(head).filter(free);
  if (!moves.length) {
    const tails = neighbours(head).filter((k) => {
      const o = s.snakes.find(
        (x) => k !== neck && x.alive && x.id !== me.id && x.cells[x.cells.length - 1] === k,
      );
      return !!o && o.grow < 1 && o.cells.length > 2;
    });
    return tails[Math.floor(rand() * tails.length)] ?? -1;
  }
  // The food goal, kept until eaten or gone, dropped when a bigger head is closer to it. The
  // snake's own paid berries come first, the nearest of them, whatever else lies about.
  const fromHead = stepsFrom(head, s, () => false),
    goalFood = s.foodAt.get(me.goal),
    ownFood = (f: Food | undefined): boolean => !!f && f.by !== '' && f.by === me.nickname;
  if (
    !goalFood ||
    !edibleBy(goalFood, me) ||
    (fromHead[me.goal] ?? -1) < 0 ||
    !landsInTime(goalFood, fromHead[me.goal] ?? 0, me.speed)
  )
    me.goal = -1;
  let nearestOwn = -1,
    ownD = Infinity;
  for (const [c, f] of s.foodAt) {
    if (!ownFood(f)) continue;
    const d = fromHead[c] ?? -1;
    if (d >= 0 && d < ownD && landsInTime(f, d, me.speed)) {
      ownD = d;
      nearestOwn = c;
    }
  }
  if (nearestOwn >= 0 && !ownFood(s.foodAt.get(me.goal))) me.goal = nearestOwn;
  if (me.goal < 0) {
    let best = 0;
    for (const [c, f] of s.foodAt) {
      if (!edibleBy(f, me)) continue;
      const d = fromHead[c] ?? -1;
      if (d < 0 || !landsInTime(f, d, me.speed)) continue;
      let contested = false;
      for (const o of s.snakes)
        if (o.id !== me.id && o.alive && o.in && o.len * 1.05 >= len)
          if (
            Math.abs(cellX(o.cells[0] ?? 0) - cellX(c)) +
              Math.abs(cellY(o.cells[0] ?? 0) - cellY(c)) <
            d
          )
            contested = true;
      if (contested) continue;
      const w = f.value * (f.by !== '' && f.by === me.nickname ? OWN : 1),
        v = w / (1 + d);
      if (v > best) {
        best = v;
        me.goal = c;
      }
    }
  }
  // A chase only when the cell in front of the prey is closer to us than to it.
  const prey = me.mode === 'chase' ? s.snakes.find((o) => o.id === me.target) : undefined;
  const cuts = prey && prey.len * 1.05 < len ? heading(prey, 3).slice(1) : [],
    ownGoal = ownFood(s.foodAt.get(me.goal));
  const best = { move: -1, score: -Infinity };
  for (const k of moves) {
    const reach = stepsFrom(k, s, (c) => c === head);
    let score = holds([k], me, s, need, limit, depth)
      ? SAFE
      : Math.min(roomAfter([k], me, s, limit), need) * 20;
    // Snakes keep clear of bigger heads. On the way to its own berries, only a head-on it would
    // lose turns a snake away, not where a bigger head may go next.
    const risk = risky.get(k) ?? 0;
    if (!ownGoal || risk >= HEAD_ON) score -= risk;
    // Straight to the goal: the move that shortens the way to it, the more for its own berries.
    if (me.goal >= 0) {
      const d = reach[me.goal] ?? -1;
      if (d >= 0) score += (ownFood(s.foodAt.get(me.goal)) ? 3000 : 400) / (1 + d);
    }
    // Cutting the prey off: a cell on its way that we reach before it does. Never while the
    // snake's own berries wait.
    if (!ownGoal)
      cuts.forEach((c, i) => {
        const mineTo = reach[c] ?? -1;
        if (mineTo >= 0 && mineTo <= i + 1) score += 900 / (1 + mineTo);
      });
    // Escape: away from where each bigger head is heading; with its own berries waiting, only
    // from a head right there.
    for (const o of hunters) {
      if (ownGoal && Math.hypot(o.x - me.x, o.y - me.y) > 3) continue;
      const way = heading(o, 2),
        far = Math.min(
          ...way.map((c) => Math.abs(cellX(k) - cellX(c)) + Math.abs(cellY(k) - cellY(c))),
          12,
        );
      score += far * 25;
    }
    score += rand() * 0.5;
    if (score > best.score) {
      best.move = k;
      best.score = score;
    }
  }
  return best.move;
}
