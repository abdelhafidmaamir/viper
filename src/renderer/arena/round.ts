// Snake Arena: the frame. The round's clock and its phases (GET READY, play, the winner's moment,
// the end screen), who comes back at a round's start, the flower pouring gifts next to their
// snake and dripping plain berries, every snake's step from cell to cell with what happens in the
// cell it enters (a body, a head, food), and the crown. Feed's round (state.ts) keeps the gifts
// and likes of the round for the flower, the rankings and the end screen; this file drives its
// phases.

import { FCOLS, FROWS } from '../feed/grid.ts';
import { stepInto } from '../feed/path.ts';
import { FALL_TIME, READY_TIME, game, hooks, newRound, repay, roundHold } from '../feed/state.ts';
import {
  BERRY_STAY,
  backingOf,
  chooseNext,
  neckOf,
  settled,
  updateMode,
  type Sight,
} from './ai.ts';
import { fullRingWaiting, isPilot, stepQueue, updateFlights, updatePilot } from './entry.ts';
import { lifePour, stepLives } from './lives.ts';
import {
  DEATH_TIME,
  EMERGE,
  MOUTH_CELL,
  SHELL_GONE,
  TUNING,
  activity,
  alive,
  arena,
  cellId,
  cellX,
  cellY,
  edibleBy,
  freeCell,
  kill,
  occupancy,
  onBoard,
  placeFood,
  places,
  removeFood,
  snakeOf,
  spawn,
  tickEffects,
  type Food,
  type Snake,
} from './rules.ts';

/** Share of the head's pace the tail gives up while the snake grows (state.ts GROW_SHARE). */
const GROW_SHARE = 0.5;

/** Paid berries not eaten yet on the board, falling or lying, per giver. */
function paidOnBoard(): Map<string, number> {
  const per = new Map<string, number>();
  for (const f of arena.food) if (f.by !== '') per.set(f.by, (per.get(f.by) ?? 0) + f.value);
  return per;
}

/** Paid berries the next round owes: still in the flower, or on the board uneaten. */
export function carriedOver(): number {
  let n = 0;
  for (const q of game.queue) if (q.nickname !== '') n += q.n;
  for (const v of paidOnBoard().values()) n += v;
  return n;
}

/**
 * A new round (hooks.round): the board empties; whoever was in comes back small, those owed paid
 * berries first. Feed's round has already carried over what was in the flower; the paid berries
 * left on the board go back into it here, for their givers, ranked in the new round. Plain berries
 * are simply cleared.
 */
export function arenaRound(roundTime: number): void {
  const left = [...paidOnBoard()].map(([nickname, n]) => ({ nickname, n }));
  if (left.length) repay(left, true);
  arena.round++;
  arena.time = 0;
  arena.phase = 'ready';
  arena.snakes = [];
  arena.food = [];
  arena.foodAt.clear();
  arena.dying = [];
  arena.fading = [];
  arena.crown = -1;
  arena.winner = null;
  arena.kills = 0;
  arena.deaths = { headon: 0, cutoff: 0, accident: 0, trapped: 0, boxed: 0 };
  arena.fed = 0;
  arena.fallen = { backed: 0, likesOnly: 0 };
  arena.played.clear();
  arena.enterT = 0.3;
  arena.wildT = 1;
  arena.houseT = TUNING.houseEvery * 0.4;
  TUNING.roundTime = roundTime;
  // Whoever was in, and whoever still has paid berries in the flower, is owed a place.
  const owed = new Set(
      game.queue.filter((q) => q.n > 0 && q.nickname !== '').map((q) => q.nickname),
    ),
    back = [...arena.viewers.values()].filter(
      (v) => v.state === 'in' || v.state === 'line' || (v.state === 'out' && owed.has(v.nickname)),
    );
  back.sort(
    (p, q) =>
      Number(owed.has(q.nickname)) - Number(owed.has(p.nickname)) ||
      q.gifted - p.gifted ||
      activity(q) - activity(p),
  );
  arena.line = [];
  for (const v of back) {
    v.state = 'line';
    v.snake = -1;
    arena.line.push(v.nickname);
  }
  for (const v of arena.viewers.values()) v.gifted = 0;
}

function entries(dt: number): void {
  arena.enterT -= dt;
  arena.wildT -= dt;
  const n = alive().length;
  if (arena.enterT <= 0 && n < places() && arena.line.length) {
    const name = arena.line[0],
      v = name ? arena.viewers.get(name) : undefined;
    if (v?.state !== 'line') arena.line.shift();
    else if (spawn(v)) {
      arena.line.shift();
      arena.enterT = TUNING.enterGap;
    }
  } else if (
    arena.wildT <= 0 &&
    n < Math.min(TUNING.wildUpTo, places()) &&
    !arena.line.length &&
    !fullRingWaiting()
  ) {
    spawn(null);
    arena.wildT = TUNING.wildGap;
  }
}

const fromFlower = (cell: number, value: number, by: string, colour: Food['colour']): Food => ({
  cell,
  x: cellX(cell),
  y: cellY(cell),
  value,
  t: 0,
  by,
  colour,
  glow: false,
  fx: MOUTH_CELL.x,
  fy: MOUTH_CELL.y,
});

/** Steps from the head to every free cell, -1 out of reach: where the snake can really go. */
function reachable(s: Snake, occ: Int16Array): Int32Array {
  const out = new Int32Array(occ.length).fill(-1),
    head = s.cells[0] ?? -1,
    queue = [head];
  if (!onBoard(head)) return out;
  out[head] = 0;
  // The queue grows while it is read: a breadth-first walk.
  for (const c of queue) {
    const x = cellX(c),
      y = cellY(c);
    for (const k of [
      x > 0 ? c - 1 : -1,
      x < FCOLS - 1 ? c + 1 : -1,
      y > 0 ? c - FCOLS : -1,
      y < FROWS - 1 ? c + FCOLS : -1,
    ])
      if (k >= 0 && !occ[k] && (out[k] ?? 0) < 0) {
        out[k] = (out[c] ?? 0) + 1;
        queue.push(k);
      }
  }
  return out;
}

/**
 * A gift berry leaves the flower for a cell its giver's snake reaches next: on the head's line,
 * past the cells it crosses while the berry falls, after the berries already lying there, and
 * never in a pocket closed off by bodies. The snake is seen eating its way along them.
 */
function dropNear(s: Snake, by: string): void {
  const { occ } = occupancy(),
    reach = reachable(s, occ),
    head = s.cells[0] ?? 0,
    hx = cellX(head),
    hy = cellY(head),
    dx = cellX(s.next) - hx,
    dy = cellY(s.next) - hy,
    // Cells the head covers while a berry falls and settles: a berry there is passed before it
    // can be eaten.
    passed = Math.ceil(s.speed * (FALL_TIME + BERRY_STAY + 0.15));
  // A trail straight ahead: the first free cell on the head's line past the fall, so berry after
  // berry lines up in front of the snake and it eats them in one run.
  let cell = -1;
  for (let k = passed + 1; k <= passed + 12 && cell < 0; k++) {
    const x = hx + dx * k,
      y = hy + dy * k;
    if (x < 0 || y < 0 || x >= FCOLS || y >= FROWS) break;
    const c = cellId(x, y);
    if ((reach[c] ?? -1) < 0) break;
    if (!arena.foodAt.has(c)) cell = c;
  }
  // The line is blocked or full: the nearest reachable cell past the fall, ahead of the head.
  if (cell < 0) {
    let best = Infinity;
    for (let c = 0; c < reach.length; c++) {
      const d = reach[c] ?? -1;
      if (d <= passed || arena.foodAt.has(c)) continue;
      const behind = (cellX(c) - hx) * dx + (cellY(c) - hy) * dy < 0;
      const score = d + (behind ? 100 : 0);
      if (score < best) {
        best = score;
        cell = c;
      }
    }
  }
  if (cell < 0 || !placeFood(fromFlower(cell, 1, by, s.colour))) {
    // Nowhere to put it: the snake grows by it all the same.
    s.grow += 1;
    game.pops.push({ x: s.x, y: s.y, t: 0, by });
    return;
  }
  game.dripT = 0;
  hooks.land(FALL_TIME);
}

/**
 * The flower, driven as Feed's state.advance drives it: open on the first gift in the queue whose
 * giver has a snake (in its egg or out), its picture and cards shown, closed once the queue holds
 * no such gift. Berries leave it only once the snake is out of its egg, next to its head. Plain
 * berries never open it, as Feed's own never do.
 */
function flower(dt: number): void {
  stepLives(dt);
  // A life gift has the flower for its moment: its giver's picture, then its heart drops out.
  const life = lifePour();
  if (life) {
    if (life.id !== game.pour?.id) {
      game.pour = life;
      game.pourT = 0;
    }
    game.pourT += dt;
    game.dripT += dt;
    game.closeT = 0;
    return;
  }
  const q = game.queue.find((p) => p.nickname !== '' && snakeOf(p.nickname));
  if (q && q.id !== game.pour?.id) {
    game.pour = q;
    game.pourT = 0;
  }
  game.pourT += dt;
  game.dripT += dt;
  game.closeT = q ? 0 : game.closeT + dt;
  const every = q ? 1 / Math.min(10, 3 + q.n / 12) : 0.045;
  arena.dropT += dt;
  // Nothing leaves the flower before the countdown is over: gifts wait in it and pour after GO.
  while (q && arena.dropT >= every && game.ready < 0) {
    const s = snakeOf(q.nickname);
    if (!s?.in) break;
    arena.dropT -= every;
    dropNear(s, q.nickname);
    if (--q.n <= 0) game.queue.splice(game.queue.indexOf(q), 1);
  }
  if (arena.dropT > every) arena.dropT = every;
}

/** The flower's own berries, for everyone: a few, now and then. */
function house(dt: number): void {
  arena.houseT -= dt;
  // Not before the countdown is over: a drip due during it falls at GO.
  if (arena.houseT > 0 || game.ready >= 0) return;
  const r = arena.rand;
  arena.houseT = TUNING.houseEvery * (0.8 + 0.4 * r());
  let out = 0;
  for (const f of arena.food) if (f.by === '' && !f.glow) out++;
  const n = Math.min(TUNING.houseMax - out, 1 + Math.floor(r() * TUNING.houseAmount)),
    { occ } = occupancy();
  for (let i = 0; i < n; i++) {
    const cell = freeCell(occ);
    if (cell >= 0) placeFood(fromFlower(cell, 1, '', null));
  }
}

function eatFood(s: Snake, f: Food): void {
  removeFood(f);
  // The viewer's own gift berries make their snake unbeatable for the rest of the round.
  if (!s.wild && f.by === s.nickname) s.immune = true;
  s.grow += f.value;
  s.eaten += f.value;
  s.gulps.push(0);
  s.bite = 0;
  arena.fed++;
  if (f.by !== '') game.pops.push({ x: f.x, y: f.y, t: 0, by: f.by });
  const r = arena.rand;
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2,
      v = 2 + r() * 3;
    game.sparks.push({
      x: f.x,
      y: f.y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      t: 0,
      life: 0.3 + r() * 0.3,
      gold: i % 3 === 0,
    });
  }
}

/**
 * Picks the cell the head slides into next: straight on, left or right, never back onto its neck.
 * A snake never dies by its own body: boxed in on those three cells, it passes over the least bad
 * of them for that step (the brains avoid it, so it almost never shows). With only walls and eggs
 * left, it is done; an unbeatable one waits a step instead.
 */
function replan(s: Snake, sight: Sight): void {
  let n = chooseNext(s, sight, arena.rand);
  if (n < 0) n = boxedWay(s, sight);
  if (n < 0 && s.immune) {
    s.next = s.cells[0] ?? s.next;
    s.sub = 0;
    return;
  }
  if (n < 0) {
    kill(s, null, 'boxed');
    return;
  }
  s.next = n;
  if (onBoard(s.next)) sight.reserved[s.next] = s.id + 1;
}

/** The cell a boxed-in head passes over on its next step, with whoever lies there (boxedWay). */
const passing = new WeakMap<Snake, number>();

/**
 * Boxed in straight ahead and on both sides, the least bad of those three cells, never back onto
 * its neck: its own body, nearest its tail, passed over; else another snake's body, passed over
 * the same way, nobody hurt; else a cell another head is about to take. -1 when only walls and
 * eggs are left.
 */
function boxedWay(s: Snake, sight: Sight): number {
  const mine = s.id + 1,
    head = s.cells[0] ?? -1,
    neck = neckOf(s);
  let best = -1,
    rank = 0;
  for (const k of [head - 1, head + 1, head - FCOLS, head + FCOLS]) {
    if (!onBoard(k) || Math.abs(cellX(k) - cellX(head)) > 1 || k === neck) continue;
    const o = sight.occ[k] ?? 0,
      other = o && o !== mine ? arena.snakes.find((x) => x.id === o - 1) : undefined,
      egg = !!other?.egg && !other.egg.hatched,
      r = o === mine ? 3 + s.cells.indexOf(k) / s.cells.length : egg ? 0 : o ? 2 : 1;
    if (r > rank) {
      rank = r;
      best = k;
    }
  }
  if (best >= 0 && rank < 3) passing.set(s, best);
  return best;
}

/**
 * The egg's clock, as the Duel runs it: the snake comes out at EMERGE, one cell long, and grows
 * out of the shell to its starting length; the shell's pieces finish falling behind it.
 */
function brood(s: Snake, dt: number, sight: Sight): void {
  const egg = s.egg;
  if (!egg) return;
  egg.t += dt;
  if (!egg.hatched && egg.t >= EMERGE) {
    egg.hatched = true;
    s.in = true;
    s.body.cells.length = 0;
    stepInto(s.body, egg.cell, 1);
    s.len = 1;
    s.grow = s.hatchLen - 1;
    s.safe = TUNING.safeTime;
    s.born = 0;
    sight.occ[egg.cell] = s.id + 1;
    // The shell bursts: a ring of sparks, as the Duel throws them.
    const r = arena.rand;
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2,
        v = 2 + r() * 4;
      game.sparks.push({
        x: s.x,
        y: s.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        t: 0,
        life: 0.35 + r() * 0.35,
        gold: i % 2 === 0,
      });
    }
    replan(s, sight);
  }
  if (egg.t >= SHELL_GONE) s.egg = null;
}

/** Whether a snake is still alive: read again after a kill may have changed it. */
const stillAlive = (s: Snake): boolean => s.alive;

/** The head enters its next cell: a body kills it, a head fights it, food feeds it. */
function stepCell(s: Snake, sight: Sight): void {
  const target = s.next;
  if (onBoard(target)) {
    // A boxed-in head passing over another snake's body (boxedWay) meets nobody there.
    const o = sight.occ[target] ?? 0,
      over = passing.get(s) === target,
      other = o && o !== s.id + 1 && !over ? arena.snakes.find((x) => x.id === o - 1) : undefined;
    passing.delete(s);
    if (other?.alive) {
      if (other.cells[0] === target) {
        // Head on head: the bigger survives; a shield, a newborn's grace or immunity spares either.
        const sBig = s.len > other.len * 1.05,
          oBig = other.len > s.len * 1.05;
        if (!oBig && other.shield <= 0 && other.safe <= 0 && !other.immune)
          kill(other, s, 'headon');
        if (!sBig && s.shield <= 0 && s.safe <= 0 && !s.immune) {
          kill(s, other, 'headon');
          return;
        }
        if (stillAlive(other)) {
          s.sub = 0;
          replan(s, sight);
          return;
        }
        for (const c of other.cells) if (onBoard(c)) sight.occ[c] = 0;
      } else {
        // An egg is solid and keeps its newborn safe; an immune head turns away from any body.
        if (s.shield > 0 || s.safe > 0 || s.immune || (other.egg && !other.egg.hatched)) {
          s.sub = 0;
          replan(s, sight);
          return;
        }
        const at = other.cells.indexOf(target),
          cause =
            (other.mode === 'chase' && other.target === s.id) || at < other.speed * 4
              ? 'cutoff'
              : 'accident';
        kill(s, other, cause);
        return;
      }
    }
  }
  // The prod step (path.stepInto): the head takes the cell, the tail follows unless growth is owed.
  const before = s.cells.length,
    tail = s.cells[before - 1] ?? -1;
  stepInto(s.body, target, Math.max(1, Math.ceil(s.len - 1e-6)));
  if (onBoard(target)) {
    sight.occ[target] = s.id + 1;
    sight.reserved[target] = 0;
  }
  if (
    s.cells.length <= before &&
    onBoard(tail) &&
    !s.cells.includes(tail) &&
    sight.occ[tail] === s.id + 1
  )
    sight.occ[tail] = 0;
  const f = arena.foodAt.get(target);
  if (f && settled(f) && edibleBy(f, s)) eatFood(s, f);
  replan(s, sight);
}

function move(
  s: Snake,
  dt: number,
  live: readonly Snake[],
  sight: Sight,
  hunting: Map<number, number>,
): void {
  s.born += dt;
  s.idle += dt;
  const v = s.wild ? undefined : arena.viewers.get(s.nickname);
  s.backing = v ? backingOf(v.gifted) : 0;
  if (v) arena.played.set(v.nickname, (arena.played.get(v.nickname) ?? false) || v.gifted > 0);
  brood(s, dt, sight);
  if (!s.in) return;
  s.boost = Math.max(0, s.boost - dt);
  s.shield = Math.max(0, s.shield - dt);
  s.safe = Math.max(0, s.safe - dt);
  updateMode(
    s,
    live.filter((o) => o !== s && o.in),
    dt,
    arena.clock,
    hunting,
  );
  const big = Math.min(1, Math.max(0, s.len - TUNING.startLen) / TUNING.slowAt);
  s.speed = TUNING.speed * (1 - TUNING.slowBy * big) * (1 + (s.boost > 0 ? TUNING.boostMax : 0));
  // Growth as state.advance does it: each berry adds a cell that appears at the tail, which keeps
  // crawling a little slower than the head while growth is owed, and never stops.
  const step = s.speed * dt,
    want = s.grow > 0 ? GROW_SHARE * s.speed : 0;
  s.growRate += (want - s.growRate) * Math.min(1, dt * 6);
  const g = Math.max(
    0,
    Math.min(s.grow, Math.min(step * GROW_SHARE, s.growRate * dt), TUNING.maxLen - s.len),
  );
  s.len += g;
  s.grow -= g;
  s.sub += step;
  let guard = 0;
  while (s.sub >= 1 && s.alive && guard++ < 4) {
    s.sub -= 1;
    if (s.next === s.cells[0]) {
      // Waiting for the way to open (an immune snake boxed in): look again.
      replan(s, sight);
      s.sub = 0;
      break;
    }
    stepCell(s, sight);
  }
  if (!s.alive) return;
  const h = s.cells[0] ?? 0,
    hx = cellX(h),
    hy = cellY(h),
    nx = cellX(s.next),
    ny = cellY(s.next);
  s.x = hx + (nx - hx) * s.sub;
  s.y = hy + (ny - hy) * s.sub;
  if (nx !== hx || ny !== hy) s.a = Math.atan2(ny - hy, nx - hx);
  s.gulps = s.gulps.map((gl) => gl + 26 * dt).filter((gl) => gl < s.len);
  s.bite += dt;
}

/** The biggest snake in play wears the crown; the game's own pilot never does. */
function crown(): void {
  const inPlay = alive().filter((s) => s.in && !isPilot(s));
  let best: Snake | undefined;
  for (const s of inPlay) if (!best || s.len > best.len) best = s;
  const holder = arena.snakes.find((s) => s.id === arena.crown && s.alive);
  if (!best) {
    arena.crown = -1;
    return;
  }
  if (!holder || (best !== holder && best.len > holder.len)) arena.crown = best.id;
}

/** Time is up: the crowned snake wins and the end screen comes up at once. */
function finish(): void {
  arena.phase = 'end';
  const best = arena.snakes.find((s) => s.id === arena.crown && s.alive) ?? null;
  arena.winner = best;
  let topGifter: string | null = null,
    most = 0;
  for (const v of arena.viewers.values())
    if (v.gifted > most) {
      most = v.gifted;
      topGifter = v.nickname;
    }
  if (best && !best.wild) {
    const v = arena.viewers.get(best.nickname);
    if (v) v.wins++;
  }
  let backed = 0;
  for (const b of arena.played.values()) if (b) backed++;
  arena.log.push({
    winner: best ? best.nickname : null,
    topGifter,
    kills: arena.kills,
    eaten: arena.fed,
    deaths: { ...arena.deaths },
    fallen: { ...arena.fallen },
    played: { backed, likesOnly: arena.played.size - backed },
  });
  if (arena.log.length > 200) arena.log.shift();
  game.eaten = arena.fed;
  game.full = 0;
  hooks.full();
}

/**
 * The dying bodies: each pops from its tail to its head over DEATH_TIME, a burst of sparks and a
 * soft bite at every few segments, its berries dropping where the plan says.
 */
function dying(dt: number): void {
  for (let i = arena.dying.length - 1; i >= 0; i--) {
    const d = arena.dying[i];
    if (!d) continue;
    d.t += dt;
    const s = d.s,
      total = d.segments,
      gone = Math.min(total, Math.floor((d.t / DEATH_TIME) * total));
    while (total - s.body.cells.length < gone && s.body.cells.length > 0) {
      const at = s.body.cells.length - 1,
        cell = s.body.cells.pop() ?? -1;
      if (onBoard(cell)) {
        const r = arena.rand;
        for (let k = 0; k < 5; k++) {
          const a = r() * Math.PI * 2,
            v = 2 + r() * 3;
          game.sparks.push({
            x: cellX(cell),
            y: cellY(cell),
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            t: 0,
            life: 0.3 + r() * 0.3,
            gold: k % 3 === 0,
          });
        }
      }
      if (at % 3 === 0) hooks.eat(0);
      s.len = Math.max(1, s.body.cells.length);
      s.sub = 0;
      s.next = s.body.cells[0] ?? s.next;
    }
    if (d.t >= DEATH_TIME + 0.25) arena.dying.splice(i, 1);
  }
  for (const fade of arena.fading) fade.t += dt;
  arena.fading = arena.fading.filter((fade) => fade.t < FADE_OUT);
}

/** Seconds a dead snake's paid berries take to fade off the board. */
export const FADE_OUT = 0.35;

/** For tests: the snake's head enters `cell` now, with the rules of a step. */
export function moveInto(s: Snake, cell: number): void {
  const { occ, reserved } = occupancy();
  s.next = cell;
  stepCell(s, { occ, reserved, foodAt: arena.foodAt, snakes: alive() });
}

/** Every snake's step. */
function moveAll(dt: number): void {
  const live = alive();
  const { occ, reserved } = occupancy(),
    sight: Sight = { occ, reserved, foodAt: arena.foodAt, snakes: live },
    hunting = new Map<number, number>();
  for (const s of live)
    if (s.mode === 'chase') hunting.set(s.target, (hunting.get(s.target) ?? 0) + 1);
  for (const s of live) if (s.alive) move(s, dt, live, sight, hunting);
}

/** One step of the round: the board in play, then the end screen and a new round. */
export function stepArena(dt: number): void {
  arena.clock += dt;
  tickEffects(dt);
  dying(dt);
  for (const f of arena.food) f.t += dt;
  flower(dt);
  updatePilot(dt);
  updateFlights(dt);
  stepQueue();
  // The end screen: the snakes keep moving under it until the next round starts.
  if (game.full >= 0) {
    game.full += dt;
    moveAll(dt);
    if (game.full > roundHold()) newRound();
    return;
  }
  const ready = game.ready >= 0;
  if (ready) {
    game.ready += dt;
    if (game.ready >= READY_TIME) {
      game.ready = -1;
      arena.phase = 'play';
    }
  } else arena.time += dt;
  entries(dt);
  house(dt);
  moveAll(dt);
  if (!ready) {
    crown();
    if (arena.time >= TUNING.roundTime) finish();
  }
}
