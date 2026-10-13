// Snake Arena: the frame, three steps and nothing else. The QUALIFYING (qualify.ts) seats the
// round's players; the BATTLE plays them, and only them: the flower pours each gift next to its
// giver's snake and drips plain berries, every snake steps from cell to cell with what happens in
// the cell it enters (a body, a head, food), and the biggest viewer's snake wears the crown; the
// RESULT comes when the clock runs out or one viewer's snake is left, then the end screen and the
// next qualifying. Feed's round (state.ts) keeps the gifts and likes of the round for the flower,
// the rankings and the end screen; this file drives its phases.

import { clearGameAlerts } from '../feed/alerts.ts';
import { FCOLS, FROWS } from '../feed/grid.ts';
import { stepInto } from '../feed/path.ts';
import {
  FALL_TIME,
  READY_TIME,
  game,
  hooks,
  newRound,
  roundHold,
  type Pour,
} from '../feed/state.ts';
import {
  BERRY_STAY,
  backingOfTier,
  type Tier,
  chooseNext,
  neckOf,
  settled,
  updateMode,
  type Sight,
} from './ai.ts';
import {
  anyGiftBuys,
  fired,
  isPilot,
  paidHooks,
  stepQueue,
  takePaidBatch,
  updateFlights,
  updatePilot,
  type Queued,
} from './entry.ts';
import {
  QUALIFY,
  endQualifying,
  qualifying,
  showing,
  startQualifying,
  stepQualifying,
} from './qualify.ts';
import {
  DEATH_TIME,
  EMERGE,
  MOUTH_CELL,
  SHELL_GONE,
  TUNING,
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
  removeFood,
  snakeOf,
  tickEffects,
  type Food,
  type Snake,
} from './rules.ts';

/** Share of the head's pace the tail gives up while the snake grows (state.ts GROW_SHARE). */
const GROW_SHARE = 0.5;

/** A giver's gifts still in the flower, for it to show as it seats them (or one berry's worth). */
function pourOf({ nickname, avatar }: Queued, id: number): Pour {
  const q = game.queue.find((p) => p.nickname === nickname && p.n > 0);
  return q
    ? { ...q, total: q.n }
    : {
        id,
        nickname,
        avatar: arena.viewers.get(nickname)?.avatar ?? avatar,
        n: 1,
        total: 1,
        title: '',
      };
}

/**
 * A new round (hooks.round). No berry carries over: the board and the flower empty, uneaten
 * berries leave with the round. The qualifying opens with the next batch of the paid queue on gold
 * eggs, in queue order; the rest of the queue waits for the rounds after.
 * Feed's round keeps its own carry-over; here its flower is emptied after it.
 */
export function arenaRound(roundTime: number): void {
  const owed: Pour[] = takePaidBatch().map((q, i) => pourOf(q, -2000 - i));
  game.queue = [];
  game.pour = null;
  arena.round++;
  arena.time = 0;
  arena.snakes = [];
  arena.food = [];
  arena.foodAt.clear();
  arena.dying = [];
  arena.fading = [];
  arena.crown = -1;
  arena.winner = null;
  arena.ranking = [];
  arena.outs = [];
  arena.lastT = 0;
  arena.started = 0;
  arena.kills = 0;
  arena.deaths = { headon: 0, cutoff: 0, accident: 0, trapped: 0, boxed: 0 };
  arena.fed = 0;
  arena.fallen = { backed: 0, likesOnly: 0 };
  arena.played.clear();
  arena.houseT = 0;
  TUNING.roundTime = roundTime;
  for (const v of arena.viewers.values()) {
    v.gifted = 0;
    v.battle = 0;
  }
  startQualifying(owed);
  shownGifts.clear();
  seatCards.length = 0;
  cardShown.clear();
  if (QUALIFY.time <= 0) endQualifying();
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
  // In the qualifying the flower opens on each gift that locks a seat, as long as it shows it. In
  // the battle a gift from a viewer without a snake opens it too, for a moment, as any gift does,
  // and nothing more: its berries stay in it and leave with the round. With no seat price, that
  // gift bought a place in the paid queue (entry.ts): its card shows a gold egg. With one, it is a
  // plain gift: its card shows the berry, in the qualifying too. The seat gift brings no berries:
  // outside the qualifying it has a card of its own, a gold egg, first in turn.
  const outsider = (): Pour | undefined => {
    if (game.pour && shownGifts.has(game.pour.id) && game.pourT < OUTSIDER_SHOW) return game.pour;
    return game.queue.find(
      (p) => p.nickname !== '' && !snakeOf(p.nickname) && !shownGifts.has(p.id),
    );
  };
  const seatCard = (): Pour | undefined =>
    game.pour && cardShown.has(game.pour.id) && game.pourT < OUTSIDER_SHOW
      ? game.pour
      : seatCards[0];
  const q = qualifying()
    ? (showing() ?? (anyGiftBuys() ? null : outsider()))
    : (seatCard() ??
      game.queue.find((p) => p.nickname !== '' && snakeOf(p.nickname)) ??
      outsider());
  if (q && q.id !== game.pour?.id) {
    game.pour = q;
    game.pourT = 0;
    if (q === seatCards[0]) {
      seatCards.shift();
      cardShown.add(q.id);
    } else if (game.queue.includes(q) && !snakeOf(q.nickname)) {
      shownGifts.add(q.id);
      if (!qualifying() && anyGiftBuys()) q.seat = true;
    }
  }
  game.pourT += dt;
  game.dripT += dt;
  game.closeT = q ? 0 : game.closeT + dt;
  const every = q ? 1 / Math.min(10, 3 + q.n / 12) : 0.045;
  arena.dropT += dt;
  // Nothing leaves the flower before GO: gifts wait in it and pour once the battle is on.
  while (q && arena.dropT >= every && arena.phase === 'play') {
    const s = snakeOf(q.nickname);
    // A seat gift's card has no berry to give.
    if (!s?.in || !game.queue.includes(q)) break;
    arena.dropT -= every;
    dropNear(s, q.nickname);
    if (--q.n <= 0) game.queue.splice(game.queue.indexOf(q), 1);
  }
  if (arena.dropT > every) arena.dropT = every;
}

/** Gifts from viewers without a snake the flower has shown this round, and for how long. */
const shownGifts = new Set<number>(),
  OUTSIDER_SHOW = 1.6;

/**
 * Seat gifts outside the qualifying, waiting for the flower (entry.ts paidHooks.card), and those
 * it has shown this round. One card per viewer at a time: a streak of the seat gift is one card.
 */
const seatCards: Pour[] = [],
  cardShown = new Set<number>();
let cardId = -1_000_000;
paidHooks.card = (nickname, avatar) => {
  const showingTheirs =
    game.pour?.nickname === nickname && cardShown.has(game.pour.id) && game.pourT < OUTSIDER_SHOW;
  if (showingTheirs || seatCards.some((c) => c.nickname === nickname)) return;
  seatCards.push({ id: cardId--, nickname, avatar, n: 1, total: 1, title: '', seat: true });
};

/**
 * Plain berries for everyone during the battle: FIELD.count of them on the board at all times,
 * each popping up in place on a free cell away from every head, a new one FIELD.delay seconds after
 * one is eaten. The flower gives only gifts.
 */
export const FIELD = { count: 3, delay: 2, clear: 4 };
function house(dt: number): void {
  if (arena.phase !== 'play') return;
  let out = 0;
  for (const f of arena.food) if (f.by === '' && !f.glow) out++;
  // Full: the clock waits; one eaten: a new one FIELD.delay seconds later (all of them at GO).
  if (out >= FIELD.count) {
    arena.houseT = FIELD.delay;
    return;
  }
  arena.houseT -= dt;
  if (arena.houseT > 0) return;
  arena.houseT = FIELD.delay;
  const { occ } = occupancy(),
    heads = alive()
      .map((s) => s.cells[0] ?? -1)
      .filter(onBoard),
    far = (c: number): boolean =>
      heads.every(
        (h) => Math.abs(cellX(h) - cellX(c)) + Math.abs(cellY(h) - cellY(c)) >= FIELD.clear,
      );
  for (let k = out; k < (arena.time < 0.5 ? FIELD.count : out + 1); k++) {
    let cell = -1;
    for (let tries = 0; tries < 80 && cell < 0; tries++) {
      const c = freeCell(occ);
      if (c >= 0 && far(c)) cell = c;
    }
    if (cell < 0) return;
    // In place, landed: Feed's berry bounces as it appears.
    placeFood({ ...fromFlower(cell, 1, '', null), t: FALL_TIME, fx: cellX(cell), fy: cellY(cell) });
  }
}

/**
 * Catch-up: a gift berry grows a snake by a full cell unless it already leads the second biggest
 * by CATCH_UP.lead or more; then by CATCH_UP.slow. Plain berries always a full cell. Nothing shows
 * it: the leader just grows less fast, and the rivalry stays open.
 */
export const CATCH_UP = { lead: 0.2, slow: 0.5 };
function growthOf(s: Snake, f: Food): number {
  if (f.by === '') return f.value;
  let second = 0;
  for (const o of alive()) if (o !== s && o.in && o.len > second) second = o.len;
  return s.len >= second * (1 + CATCH_UP.lead) && second > 0 ? f.value * CATCH_UP.slow : f.value;
}

function eatFood(s: Snake, f: Food): void {
  removeFood(f);
  s.grow += growthOf(s, f);
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
 * Boxed in on those three cells, it takes the least bad (boxedWay): over its own body, which never
 * kills it; else into another snake's body, where it dies, trapped. Nothing ever passes through
 * another snake. With only walls and eggs left, it is done.
 */
function replan(s: Snake, sight: Sight): void {
  let n = chooseNext(s, sight, arena.rand);
  if (n < 0) n = boxedWay(s, sight);
  if (n < 0) {
    kill(s, null, 'boxed');
    return;
  }
  s.next = n;
  if (onBoard(s.next)) sight.reserved[s.next] = s.id + 1;
}

/** The cell a cornered head takes next although another snake's body lies there (boxedWay). */
const cornered = new WeakMap<Snake, number>();

/**
 * Boxed in straight ahead and on both sides, the least bad of those three cells, never back onto
 * its neck: its own body, nearest its tail, passed over (a snake never dies by its own body); else
 * a free cell another head is about to take; else another snake's body, where it dies, trapped: it
 * never passes through. An egg is solid: never taken. -1 when only walls and eggs are left.
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
      r = o === mine ? 3 + s.cells.indexOf(k) / s.cells.length : egg ? 0 : o ? 1 : 2;
    if (r > rank) {
      rank = r;
      best = k;
    }
  }
  if (best >= 0 && rank === 1) cornered.set(s, best);
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

/**
 * Heads that entered another living snake's body and lived: none should (measures and tests),
 * counted on the snakes' real cells.
 */
export const crossings = { n: 0 };
function noteCrossing(s: Snake, target: number): void {
  if (arena.snakes.some((o) => o !== s && o.alive && o.cells.indexOf(target) > 0)) crossings.n++;
}

/** Whether a snake is still alive: read again after a kill may have changed it. */
const stillAlive = (s: Snake): boolean => s.alive;

/** The head enters its next cell: a body kills it, a head fights it, food feeds it. */
function stepCell(s: Snake, sight: Sight): void {
  const target = s.next;
  if (onBoard(target)) {
    // A cornered head (boxedWay) has no other way than into this body: it dies there.
    const o = sight.occ[target] ?? 0,
      trapped = cornered.get(s) === target,
      other = o && o !== s.id + 1 ? arena.snakes.find((x) => x.id === o - 1) : undefined;
    cornered.delete(s);
    if (other?.alive) {
      if (other.cells[0] === target) {
        // Head on head: the bigger survives; a shield or a newborn's grace spares either.
        const sBig = s.len > other.len * 1.05,
          oBig = other.len > s.len * 1.05;
        if (!oBig && other.shield <= 0 && other.safe <= 0) kill(other, s, 'headon');
        if (!sBig && s.shield <= 0 && s.safe <= 0) {
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
        // An egg is solid and keeps its newborn safe; a shielded head, or a newborn's in its
        // grace, turns away from any body while it has another way. Into a body it dies.
        if ((other.egg && !other.egg.hatched) || (!trapped && (s.shield > 0 || s.safe > 0))) {
          s.sub = 0;
          replan(s, sight);
          return;
        }
        const at = other.cells.indexOf(target),
          cause = trapped
            ? 'trapped'
            : (other.mode === 'chase' && other.target === s.id) || at < other.speed * 4
              ? 'cutoff'
              : 'accident';
        kill(s, other, cause);
        return;
      }
    }
  }
  noteCrossing(s, target);
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
  still: boolean,
): void {
  s.born += dt;
  s.idle += dt;
  const v = s.wild ? undefined : arena.viewers.get(s.nickname);
  s.backing = backingOfTier(tierOf(s));
  s.active = arena.clock - (fired.get(s.nickname) ?? -Infinity) < ACTIVE;
  if (v) arena.played.set(v.nickname, (arena.played.get(v.nickname) ?? false) || v.gifted > 0);
  brood(s, dt, sight);
  // Out of its egg, a snake waits for GO with the others: a fair start.
  if (!s.in || still) return;
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
      // Waiting for the way to open: look again.
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

/**
 * The crown: nobody's at GO, then the first snake to eat, then the biggest viewer's snake in play
 * (a tie keeps it where it is); a wild one and the game's pilot never wear it.
 */
function crown(): void {
  const inPlay = alive().filter((s) => s.in && !s.wild && !isPilot(s)),
    holder = inPlay.find((s) => s.id === arena.crown);
  // All equal at GO: nobody wears it until a snake has eaten; a tie keeps it where it is.
  let best: Snake | undefined;
  for (const s of inPlay) if (s.eaten > 0 && (!best || s.len > best.len)) best = s;
  if (!best) {
    arena.crown = holder ? holder.id : -1;
    return;
  }
  if (!holder || (best !== holder && best.len > holder.len)) arena.crown = best.id;
}

/** Viewers' snakes still in the fight (the game's pilot is not a viewer). */
const viewersAlive = (): Snake[] => alive().filter((s) => !s.wild && !isPilot(s));

/**
 * The fight is down to its last viewer (or to none, when only one started): the round ends a
 * moment later, once the last death has played.
 */
function lastStanding(dt: number): boolean {
  const left = viewersAlive().length,
    over = arena.started >= 2 ? left <= 1 : arena.started === 1 && left === 0;
  arena.lastT = over ? arena.lastT + dt : 0;
  return arena.lastT >= LAST_HOLD;
}
const LAST_HOLD = 1.2;

/**
 * The round's ranking: the viewers still alive, the biggest first, then the fallen, the last to
 * fall first. Its first is the winner.
 */
function rank(): { nickname: string; avatar?: string | undefined; eaten: number }[] {
  // The berries each ate, counted now: the snakes keep moving under the end screen.
  const eaten = (n: string): number =>
    arena.snakes.reduce((k, s) => k + (!s.wild && s.nickname === n ? s.eaten : 0), 0);
  const out = viewersAlive()
    .sort((p, q) => q.len - p.len)
    .map((s) => ({ nickname: s.nickname, avatar: s.avatar, eaten: eaten(s.nickname) }));
  for (let i = arena.outs.length - 1; i >= 0; i--) {
    const o = arena.outs[i];
    if (o && !out.some((x) => x.nickname === o.nickname))
      out.push({ nickname: o.nickname, avatar: o.avatar, eaten: eaten(o.nickname) });
  }
  return out;
}

/** The result: the clock ran out or one viewer is left. The end screen comes up at once. */
function finish(): void {
  arena.phase = 'end';
  arena.ranking = rank();
  const first = arena.ranking[0],
    best = first
      ? (arena.snakes.find((s) => s.nickname === first.nickname && !s.wild && s.alive) ??
        arena.snakes.find((s) => s.nickname === first.nickname && !s.wild) ??
        null)
      : null;
  arena.winner = best;
  if (best) arena.crown = best.alive ? best.id : -1;
  let topGifter: string | null = null,
    most = 0;
  for (const v of arena.viewers.values())
    if (v.gifted > most) {
      most = v.gifted;
      topGifter = v.nickname;
    }
  if (best) {
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
  // The headline's count: every berry the snakes ate, the sum of the podium's own counts and the
  // wild snakes'.
  game.eaten = arena.snakes.reduce((n, s) => n + s.eaten, 0);
  game.full = 0;
  // Nothing of the battle stays over the end screen: its cards go, waiting or on screen.
  clearGameAlerts();
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

/** Seconds since a player's last full likes ring during which a like seat is not anyone's prey. */
export const ACTIVE = 20;

/**
 * A snake's survival tier, never shown: 1 when its viewer gave during this battle, 2 for a paid
 * seat (and the game's pilot), 3 for a like seat and wild snakes. A gift moves it up at once.
 */
export function tierOf(s: Snake): Tier {
  if (s.wild) return 3;
  if (isPilot(s)) return 2;
  if ((arena.viewers.get(s.nickname)?.battle ?? 0) > 0) return 1;
  return s.paid ? 2 : 3;
}

/** For tests: the snake's head enters `cell` now, with the rules of a step. */
export function moveInto(s: Snake, cell: number): void {
  const { occ, reserved } = occupancy();
  s.next = cell;
  stepCell(s, { occ, reserved, foodAt: arena.foodAt, snakes: alive() });
}

/** Every snake's step; `still` before GO: the eggs hatch, nobody moves. */
function moveAll(dt: number, still = false): void {
  const live = alive();
  const { occ, reserved } = occupancy(),
    sight: Sight = { occ, reserved, foodAt: arena.foodAt, snakes: live },
    hunting = new Map<number, number>();
  for (const s of live)
    if (s.mode === 'chase') hunting.set(s.target, (hunting.get(s.target) ?? 0) + 1);
  for (const s of live) if (s.alive) move(s, dt, live, sight, hunting, still);
}

/**
 * One step of the round: the qualifying, the hatch and Feed's 3, 2, 1, the battle, then the end
 * screen and the next qualifying.
 */
export function stepArena(dt: number): void {
  arena.clock += dt;
  tickEffects(dt);
  dying(dt);
  for (const f of arena.food) f.t += dt;
  flower(dt);
  updateFlights(dt);
  // The end screen: the snakes keep moving under it until the next round starts.
  if (game.full >= 0) {
    game.full += dt;
    moveAll(dt);
    if (game.full > roundHold()) newRound();
    return;
  }
  if (qualifying()) {
    stepQueue();
    stepQualifying(dt);
    return;
  }
  if (arena.phase === 'ready') {
    // The countdown over the closed eggs; they all burst at GO, and nobody moves before the end.
    game.ready += dt;
    if (game.ready >= READY_TIME) {
      game.ready = -1;
      arena.phase = 'play';
    }
    moveAll(dt, true);
    return;
  }
  arena.time += dt;
  updatePilot(dt);
  house(dt);
  moveAll(dt);
  crown();
  if (arena.time >= TUNING.roundTime || lastStanding(dt)) finish();
}
