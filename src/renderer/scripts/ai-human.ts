// Viper AI "skilled human" player: plans the full path to the nearest berry, verifies a safe
// exit after eating, and falls back to tail-following otherwise. Dies only when truly trapped.
// Interface: window.ViperAi = { choose(state) }, state = {cols, rows, body, dir, fruits, obstacles, memory}

import type { AiDebug, Cell, Direction, Fruit } from '../engine/types.ts';
import type { AiState } from '../engine/types-api.ts';

const DIRS: readonly Direction[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

// Cells blocked for a head seeking its route: the body excluding the head, plus obstacles.
// The tail stays blocked here: simulation determines whether it will have moved in time.
function buildBlocked(
  e: AiState,
  body: readonly Cell[],
  skipHead: boolean,
  skipTail: boolean,
): Uint8Array {
  const cols = e.cols,
    b = new Uint8Array(cols * e.rows),
    L = body.length;
  for (const cell of (body as Cell[]).slice(skipHead ? 1 : 0, skipTail ? L - 1 : L))
    b[cell.y * cols + cell.x] = 1;
  for (const obs of e.obstacles) b[obs.y * cols + obs.x] = 1;
  return b;
}

// BFS distances from (sx,sy) and parent pointers for path reconstruction.
function buildField(
  e: AiState,
  b: Uint8Array,
  sx: number,
  sy: number,
): { d: Int32Array; p: Int32Array } {
  const cols = e.cols,
    rows = e.rows,
    n = cols * rows;
  const d = new Int32Array(n).fill(-1),
    p = new Int32Array(n).fill(-1);
  const q: number[] = [sy * cols + sx];
  let i = 0;
  d[sy * cols + sx] = 0;
  while (i < q.length) {
    const id = q[i++] ?? 0; // i < q.length, element was pushed; ?? 0 unreachable
    const cx = id % cols,
      cy = (id - cx) / cols,
      v = d[id] ?? 0; // id was enqueued so d[id] >= 0; ?? 0 unreachable
    for (const dir of DIRS) {
      const nx = cx + dir.x,
        ny = cy + dir.y;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if ((d[j] ?? -1) >= 0 || (b[j] ?? 0)) continue;
      d[j] = v + 1;
      p[j] = id;
      q.push(j);
    }
  }
  return { d: d, p: p };
}

// Reconstructs the path: returns the sequence of cells from first step to target.
function buildPath(p: Int32Array, id: number): number[] {
  const out: number[] = [];
  while (id >= 0 && (p[id] ?? -1) >= 0) {
    out.push(id);
    id = p[id] ?? -1; // id >= 0 here so p[id] is defined; ?? -1 exits loop
  }
  out.reverse();
  return out;
}

// Flood fill from (x,y): pocket size, and whether it reaches the target cell.
function zone(
  e: AiState,
  b: Uint8Array,
  x: number,
  y: number,
  target: Cell | null,
): { size: number; exit: boolean } {
  const cols = e.cols,
    rows = e.rows,
    visited = new Uint8Array(cols * rows),
    stack: number[] = [x, y];
  let n = 0,
    hasExit = false;
  visited[y * cols + x] = 1;
  while (stack.length) {
    const cy = stack.pop() ?? 0; // stack.length > 0; ?? 0 unreachable
    const cx = stack.pop() ?? 0;
    n++;
    for (const dir of DIRS) {
      const nx = cx + dir.x,
        ny = cy + dir.y;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (nx === target?.x && ny === target.y) hasExit = true;
      const id = ny * cols + nx;
      if ((visited[id] ?? 0) || (b[id] ?? 0)) continue;
      visited[id] = 1;
      stack.push(nx, ny);
    }
  }
  return { size: n, exit: hasExit };
}

// Sides of the cell that border a wall or body: used to pack a long snake against edges.
function countWallContacts(e: AiState, b: Uint8Array, x: number, y: number): number {
  let n = 0;
  for (const dir of DIRS) {
    const nx = x + dir.x,
      ny = y + dir.y;
    if (nx < 0 || ny < 0 || nx >= e.cols || ny >= e.rows || (b[ny * e.cols + nx] ?? 0)) n++;
  }
  return n;
}

function copyBody(body: readonly Cell[]): Cell[] {
  const c: Cell[] = [];
  for (const cell of body) c.push({ x: cell.x, y: cell.y });
  return c;
}

// Advances the body along the path. Growth only happens at the last cell (the berry).
function simulateSteps(e: AiState, body: readonly Cell[], steps: number[]): Cell[] {
  const c = copyBody(body),
    cols = e.cols;
  for (let i = 0; i < steps.length; i++) {
    const id = steps[i] ?? 0; // i < steps.length; ?? 0 unreachable
    const x = id % cols,
      y = (id - x) / cols;
    c.unshift({ x: x, y: y });
    if (i < steps.length - 1) c.pop();
  }
  return c;
}

// State is safe when the head can still reach its own tail: the loop always reopens.
// When toGrow > 0 the snake is still growing (egg, berry cluster), so the tail does not
// move and its cell cannot be relied on. Without this, 21 of 39 duel deaths below 10 segments
// were self-collisions.
function isTailFree(e: AiState): boolean {
  return !(e.toGrow > 0);
}
function isSafe(e: AiState, body: Cell[]): boolean {
  const L = body.length;
  if (L < 3) return true;
  const b = buildBlocked(e, body, true, isTailFree(e));
  const t = body[0];
  const q = body[L - 1];
  if (!t || !q) return true; // L >= 3 guarantees both exist; guard for TypeScript
  if (b[t.y * e.cols + t.x] ?? 0) return false;
  return zone(e, b, t.x, t.y, q).exit;
}

function dirToward(e: AiState, id: number): Direction {
  const x = id % e.cols,
    y = (id - x) / e.cols;
  const t = e.body[0] ?? { x: 0, y: 0 }; // body always has a head; ?? unreachable
  return { x: x - t.x, y: y - t.y };
}

// ---- Hunt (duel): close the opponent's pocket with our own body --------------------------------
// A candidate step is first safe for us (our head still reaches our tail after the step), then
// we measure the opponent head's pocket with our moved body and theirs blocking. 'decisive': the
// pocket no longer touches their tail and fits in less than 2x their length (enclosed). 'attrition':
// the pocket shrinks by at least a third. e.hunt (0-1) = trap aggressiveness.
function opponentPocket(
  e: AiState,
  myBody: Cell[],
  opponent: readonly Cell[],
): { size: number; exit: boolean } {
  // The avoidance crown (e.avoid, added to obstacles by choose) is NOT a wall for the opponent:
  // measured with it, their pocket always read as 1 cell with no exit, causing the AI to believe
  // it was enclosing them every step and stop eating (88% of steps flagged as "trap" in crowd
  // mode, board covered in ignored berries).
  const merged: AiState = { ...e, obstacles: e.obstaclesWithout ?? e.obstacles };
  const b = buildBlocked(merged, myBody, false, true);
  const cols = e.cols;
  for (const opp of (opponent as Cell[]).slice(1, opponent.length - 1)) b[opp.y * cols + opp.x] = 1;
  const opp0 = opponent[0];
  const oppTail = opponent[opponent.length - 1];
  if (!opp0 || !oppTail) return { size: 0, exit: false }; // opponent has >= 2 cells (checked by caller)
  return zone(e, b, opp0.x, opp0.y, oppTail);
}
function hunt(
  e: AiState,
  L: number,
  mode: 'decisive' | 'attrition',
  force: boolean,
): Direction | null {
  const opponent = e.opponent,
    huntIntensity = e.hunt || 0;
  if (!opponent || opponent.length < 2 || L < 5 || huntIntensity <= 0) return null;
  if (mode === 'attrition' && !force && Math.random() > huntIntensity) return null;
  const head = e.body[0];
  if (!head) return null; // body always has a head; guard for TypeScript
  const pocketBefore = opponentPocket(e, e.body as Cell[], opponent).size;
  let best: Direction | null = null,
    bestT = 1e9;
  const bNow = buildBlocked(e, e.body, true, isTailFree(e)),
    back = backOf(e);
  for (const d of DIRS) {
    if (d.x === back.x && d.y === back.y) continue;
    const tx = head.x + d.x,
      ty = head.y + d.y;
    if (tx < 0 || ty < 0 || tx >= e.cols || ty >= e.rows) continue;
    if (bNow[ty * e.cols + tx]) continue; // e.obstacles already carries the opponent body and its crown
    const c = copyBody(e.body);
    c.unshift({ x: tx, y: ty });
    if (isTailFree(e)) c.pop();
    const b = buildBlocked(e, c, true, true);
    // Never adjacent to the opponent's head: they move simultaneously, which would cause a head-on collision.
    const opp0 = opponent[0];
    const c0 = c[0];
    if (!opp0 || !c0) continue;
    if (Math.abs(opp0.x - c0.x) + Math.abs(opp0.y - c0.y) <= 1) continue;
    const cTail = c[c.length - 1];
    if (!cTail) continue;
    if (!(mode === 'decisive' && force) && !zone(e, b, c0.x, c0.y, cTail).exit) continue;
    const z = opponentPocket(e, c, opponent);
    const ok =
      mode === 'decisive' ? !z.exit && z.size < opponent.length * 2 : z.size <= pocketBefore * 0.67;
    if (ok && z.size < bestT) {
      bestT = z.size;
      best = d;
    }
  }
  return best;
}

// e.avoid (duel): cells to avoid if possible (crown around the opponent's head), never at the
// cost of survival. Treated as hard obstacles first; if no exit remains, the decision is retried
// without them. When treated as hard obstacles, they blocked all paths near a wall and the snake
// held its heading into them (avoidable deaths, opponent 2-4 cells away).
function choose(e: AiState): Direction {
  let r: { d: Direction | null; trap: boolean };
  let decidedState = e;
  if (!e.avoid.length) r = decide(e);
  else {
    const hardState: AiState = {
      ...e,
      obstacles: e.obstacles.concat(e.avoid),
      obstaclesWithout: e.obstacles,
    };
    r = decide(hardState);
    decidedState = hardState;
    if (r.trap) {
      r = decide(e);
      decidedState = e;
    }
  }
  if (e.debug) completeDebug(decidedState, r);
  return r.d ?? e.dir;
}
// Debug overlay (super-admin): read-only, no random draws, decision already made.
// Fills m.debug (set by decide) with the chosen step, stance, reason, post-step pocket,
// and a verdict for each candidate step not already scored by the positioning phase.
function completeDebug(e: AiState, r: { d: Direction | null; trap: boolean }): void {
  const m = e.memory;
  const g: AiDebug = m.debug ?? (m.debug = { scores: {} });
  const t = e.body[0];
  if (!t) return; // body always has a head; guard for TypeScript
  const back = backOf(e);
  g.choice = r.d ?? null;
  g.stance = m.activeStance ?? 'neutral';
  g.reason = m.reason ?? '';
  g.attackRange = e.attackRange ?? 12;
  g.defenseRange = e.defenseRange ?? 10;
  for (const d of DIRS) {
    const key = String(d.x) + ',' + String(d.y);
    if (d.x === back.x && d.y === back.y) continue;
    if (!(key in g.scores)) g.scores[key] = isStepSafe(e, d) ? 'ok' : 'refused';
  }
  if (r.d) {
    const tx = t.x + r.d.x,
      ty = t.y + r.d.y;
    if (tx >= 0 && ty >= 0 && tx < e.cols && ty < e.rows) {
      const c = copyBody(e.body);
      c.unshift({ x: tx, y: ty });
      if (isTailFree(e)) c.pop();
      g.pocket = zone(e, buildBlocked(e, c, true, true), tx, ty, null).size;
    }
  }
}
// Back direction is the neck, not the last attempted direction: after a failed step into a wall,
// e.dir points into the wall and its opposite was the only exit (snake pinned to a corner).
function backOf(e: AiState): Direction {
  const t = e.body[0];
  const c = e.body[1];
  if (!t) return { x: -e.dir.x, y: -e.dir.y };
  return c ? { x: c.x - t.x, y: c.y - t.y } : { x: -e.dir.x, y: -e.dir.y };
}
function decide(e: AiState): { d: Direction | null; trap: boolean } {
  const m = e.memory;
  const head = e.body[0];
  if (!head) return { d: e.dir, trap: false }; // body always has a head; guard for TypeScript
  const L = e.body.length;
  const back = backOf(e);
  const dbg: AiDebug | null = e.debug
    ? (m.debug = {
        scores: {},
        route: null as Cell[] | null,
        target: null as Fruit | null,
        trap: null as number | null,
      })
    : null;
  // Scenes (super-admin): override existing levers without changing logic.
  // Ranges: 12 attack / 10 defense by default, overridden per scene (blind = 3, face = 20).
  const attackRange = e.attackRange ?? 12,
    defenseRange = e.defenseRange ?? 10;
  if (e.forcedHunt !== undefined) e.hunt = e.forcedHunt;
  if (e.forcedFlair !== undefined) e.flair = e.forcedFlair;

  // 1. True fruit distances: path length, not straight-line.
  const field = buildField(e, buildBlocked(e, e.body, true, false), head.x, head.y);
  let targets: { f: { x: number; y: number; gifted: boolean }; d: number; id: number }[] = [];
  for (const f of e.fruits) {
    const id = f.y * e.cols + f.x,
      dd = field.d[id] ?? -1;
    if (dd > 0) targets.push({ f: f, d: dd, id: id });
  }
  targets.sort(function (a, b) {
    return a.d - b.d;
  });

  // 2. Human reaction delay, except for a berry just gifted by a viewer.
  const nearestTarget = targets[0] ?? null,
    key = nearestTarget ? String(nearestTarget.f.x) + ',' + String(nearestTarget.f.y) : '';
  if (key !== m.key) {
    m.key = key;
    m.waiting =
      nearestTarget && (nearestTarget.d <= 3 || nearestTarget.f.gifted)
        ? 0
        : 2 + Math.floor(Math.random() * 3);
  }
  if ((m.waiting ?? 0) > 0) {
    m.waiting = (m.waiting ?? 0) - 1;
    targets = [];
  }

  // Flair (0-1, duel): two identical AIs on a symmetric start played as mirrors. Flair adds
  // noise only to positional play, never recklessness: snakes should trap each other, not die
  // carelessly (frustrates the audience).
  const flair = Math.min(1, Math.max(0, e.flair || 0));
  // Stance (duel): defensive and attacking strategy, dynamically selected. Recomputed each step
  // from strength ratio and distance, with a few-step inertia (m.stanceTime) to avoid flickering.
  // 'attack': clearly longer, or opponent is short and close: trap takes priority over berry,
  // attrition hunt is always on. 'defense': opponent is longer or invincible and close: move away
  // from their head, avoid berries in their range, maximize pocket. 'neutral': berry first, trap
  // when the opportunity arises.
  const opponent = e.opponent;
  let stance: 'attack' | 'defense' | 'neutral' = 'neutral';
  let opponentDist: number;
  if (opponent?.length) {
    const opp0 = opponent[0];
    if (opp0) {
      opponentDist = Math.abs(opp0.x - head.x) + Math.abs(opp0.y - head.y);
      const oppLength = opponent.length;
      let desiredStance: 'attack' | 'defense' | 'neutral' = 'neutral';
      // Relevance: attack and defense are skipped for an out-of-range opponent (12 cells), and an
      // attack that closes nothing for ~6 s (40 steps) triggers fatigue: returns to neutral for a
      // reprieve.
      const oppPocket = opponentPocket(e, e.body as Cell[], opponent).size;
      if (dbg) dbg.trap = oppPocket;
      if ((m.fatigue ?? 0) > 0) m.fatigue = (m.fatigue ?? 0) - 1;
      // Empty board (no fruit): range no longer matters. The longer snake hunts, the shorter one
      // retreats; equal length also hunts (growth can only come from the opponent).
      const famine = !e.fruits.length;
      if (famine && !((m.fatigue ?? 0) > 0) && L >= oppLength && !e.opponentInvincible)
        desiredStance = 'attack';
      else if (famine && oppLength > L) desiredStance = 'defense';
      else if (
        opponentDist <= attackRange &&
        !((m.fatigue ?? 0) > 0) &&
        (L >= oppLength + 4 || (oppLength < 8 && opponentDist <= 8 && L >= 6))
      )
        desiredStance = 'attack';
      else if (
        opponentDist <= defenseRange &&
        (oppLength >= L + 4 || (e.opponentInvincible && opponentDist <= 6))
      )
        desiredStance = 'defense';
      if (desiredStance !== m.stance) {
        m.stanceTime = (m.stanceTime ?? 0) + 1;
        if (m.stanceTime >= 4) {
          m.stance = desiredStance;
          m.stanceTime = 0;
          m.attackTime = 0;
          m.pocketRef = oppPocket;
        }
      } else m.stanceTime = 0;
      stance = m.stance ?? desiredStance;
      if (stance === 'attack') {
        m.attackTime = (m.attackTime ?? 0) + 1;
        if (oppPocket < (m.pocketRef ?? oppPocket) * 0.8) {
          m.attackTime = 0;
          m.pocketRef = oppPocket;
        } // making progress: continue
        if (m.attackTime > 40) {
          m.fatigue = 30;
          m.stance = 'neutral';
          stance = 'neutral';
          m.attackTime = 0;
        }
      }
    }
  }
  if (e.forcedStance) stance = e.forcedStance;
  m.activeStance = stance;
  // Lure (face-to-face or predator scene): opponent's head becomes the target, like a berry.
  // Path-finds toward one of its free neighboring cells, bypassing real berries.
  if (e.lure && opponent?.length) {
    const opp0 = opponent[0];
    if (opp0) {
      let target: { id: number; d: number } | null = null;
      for (const dkt of DIRS) {
        const cx = opp0.x + dkt.x,
          cy = opp0.y + dkt.y;
        if (cx < 0 || cy < 0 || cx >= e.cols || cy >= e.rows) continue;
        const idc = cy * e.cols + cx,
          dd = field.d[idc] ?? -1;
        if (dd > 0 && (!target || dd < target.d)) target = { id: idc, d: dd };
      }
      if (target) {
        const attractPath = buildPath(field.p, target.id);
        if (attractPath.length && isSafe(e, simulateSteps(e, e.body, attractPath))) {
          const step0 = attractPath[0];
          if (step0 !== undefined) {
            const attractDir = dirToward(e, step0);
            if (!(attractDir.x === back.x && attractDir.y === back.y)) {
              m.reason = 'lure';
              return { d: attractDir, trap: false };
            }
          }
        }
      }
    }
  }
  // Repel (ballet or prey scene): skips attack, trap, blocking, and nearby berries; the
  // positioning phase below receives a strong distance bonus (m.repel, read below).
  if (e.repel) m.repel = true;
  else m.repel = false;
  // Berry race scene: disables attack and defense, only the nearest safe berry is played.
  if (e.berryRace) {
    for (let i = 0; i < targets.length && i < 3; i++) {
      const tgt = targets[i];
      if (!tgt) continue;
      const racePath = buildPath(field.p, tgt.id);
      if (!racePath.length) continue;
      if (isSafe(e, simulateSteps(e, e.body, racePath))) {
        const step0 = racePath[0];
        if (step0 === undefined) continue;
        const raceDir = dirToward(e, step0);
        if (!(raceDir.x === back.x && raceDir.y === back.y)) {
          m.reason = 'race';
          return { d: raceDir, trap: false };
        }
      }
    }
  }
  // Repel scene: disables trap, blocking, and attrition; removes berries within 5 cells
  // of the opponent's head (avoids being drawn toward them by a berry).
  if (e.repel) {
    const opp0 = opponent?.[0];
    if (opp0)
      targets = targets.filter(function (o) {
        return Math.abs(o.f.x - opp0.x) + Math.abs(o.f.y - opp0.y) > 5;
      });
  }
  // Encircle scene: ignores ALL berries and pocket defense; only orbits the opponent at
  // distance 2 to eventually close the circle with its own body.
  if (e.encircle) targets = [];
  // 3a. Decisive hunt (duel): a safe step that closes the opponent's pocket so they cannot
  // escape takes priority over the berry. Classic slither-style trap.
  // Ballet scene: skips decisive hunt. Lure, orbit, and attrition remain; pressure is visible
  // but an exit stays open.
  if ((stance !== 'defense' || e.immediateTrap) && !e.repel && !e.noKill) {
    // Trap scene: allows the most closing step even if it is risky for us.
    const trap = hunt(e, L, 'decisive', e.immediateTrap ?? false);
    if (trap) {
      m.reason = e.immediateTrap ? 'trap!' : 'trap';
      return { d: trap, trap: false };
    }
  }
  // Food is a priority in ALL stances: length is the score.
  // In defense, a berry within the opponent's reach is bait: skip it, eat elsewhere.
  if (stance === 'defense' && opponent) {
    const opp0 = opponent[0];
    if (opp0)
      targets = targets.filter(function (o) {
        return Math.abs(o.f.x - opp0.x) + Math.abs(o.f.y - opp0.y) > 3;
      });
  }
  // 3. Simulate the full path including eating the berry; only commit if an exit remains.
  // In attack stance, only a nearby berry (4 steps) takes priority over attrition; a distant
  // berry waits until the opponent's pocket is closed.
  let fruitRoute: { d: Direction; dist: number } | null = null;
  for (let i = 0; i < targets.length && i < 3; i++) {
    const tgt = targets[i];
    if (!tgt) continue;
    const steps = buildPath(field.p, tgt.id);
    if (!steps.length) continue;
    if (isSafe(e, simulateSteps(e, e.body, steps))) {
      const step0 = steps[0];
      if (step0 === undefined) continue;
      const firstStep = dirToward(e, step0);
      if (!(firstStep.x === back.x && firstStep.y === back.y)) {
        fruitRoute = { d: firstStep, dist: tgt.d };
        if (dbg) {
          dbg.route = steps.map(function (id) {
            return { x: id % e.cols, y: (id - (id % e.cols)) / e.cols };
          });
          dbg.target = tgt.f;
        }
        break;
      }
    }
  }
  if (fruitRoute && (stance !== 'attack' || fruitRoute.dist <= 4)) {
    m.reason = 'berry';
    return { d: fruitRoute.d, trap: false };
  }
  if (stance === 'attack' && opponent && opponent.length > 1 && !window.VIPER_NO_BLOCKING) {
    // Blocking: a safe step that places our head on the opponent's line of travel, 1 to 3 cells
    // ahead, takes priority over attrition. They must turn or enter our body.
    const opp0 = opponent[0];
    const opp1 = opponent[1];
    if (opp0 && opp1) {
      const oppDx = opp0.x - opp1.x,
        oppDy = opp0.y - opp1.y;
      let best: Direction | null = null,
        bestRank = 9;
      for (const bd of DIRS) {
        if (bd.x === back.x && bd.y === back.y) continue;
        const bx = head.x + bd.x,
          by = head.y + bd.y;
        if (bx < 0 || by < 0 || bx >= e.cols || by >= e.rows) continue;
        for (let kb = 1; kb <= 3; kb++) {
          if (bx === opp0.x + oppDx * kb && by === opp0.y + oppDy * kb && kb < bestRank) {
            if (isSafe(e, simulateSteps(e, e.body, [by * e.cols + bx]))) {
              best = bd;
              bestRank = kb;
            }
          }
        }
      }
      if (best) {
        m.reason = 'block';
        return { d: best, trap: false };
      }
    }
  }
  if (stance === 'attack') {
    const urgentHunt = hunt(e, L, 'attrition', true);
    if (urgentHunt) {
      m.reason = 'attrition';
      return { d: urgentHunt, trap: false };
    }
    if (fruitRoute) {
      m.reason = 'berry';
      return { d: fruitRoute.d, trap: false };
    }
  }
  // 3b. Attrition hunt: no accessible berry; a safe step that noticeably shrinks the opponent's pocket.
  if (stance !== 'defense') {
    const attrition = hunt(e, L, 'attrition', false);
    if (attrition) {
      m.reason = 'attrition';
      return { d: attrition, trap: false };
    }
  }

  // 4. No safe route: positional play. Follow own tail while packing against edges.
  // Boldness: recklessness (0-0.05) amplified by reward pressure shrinks the pocket threshold.
  // Pressure is high when the target is far (hungry snake) or very close (approach momentum).
  // Without pressure, even at full recklessness, the margin stays nearly intact.
  const recklessness = e.recklessness || 0;
  const targetDist = nearestTarget ? nearestTarget.d : 999;
  const pressure = nearestTarget ? Math.min(1, targetDist <= 3 ? 0.8 : targetDist / 15) : 0.5;
  const boldness = Math.min(1, recklessness * (1 + pressure * 20));
  // pocketThreshold: from L+2 (boldness 0, default behaviour) down to ceil(L/2) (boldness 1)
  const pocketThreshold = Math.max(Math.ceil(L / 2), L + 2 - Math.round(boldness * (L / 2 + 2)));
  const packCoeff = Math.min(0.2, L / 250);
  let chosen: Direction | null = null,
    scoreMax = -1e9,
    fallback: Direction | null = null,
    maxSpace = -1;
  // Blocked cells available to the head RIGHT NOW: body as-is, tail excluded if it will move.
  // The simulated body after the step (below) measures the pocket, not the target cell:
  // its "tail" is still the previous second-to-last segment. Original bug: all self-collision
  // deaths in duel targeted segment L-2.
  const bNow = buildBlocked(e, e.body, true, isTailFree(e));
  for (const d of DIRS) {
    if (d.x === back.x && d.y === back.y) continue;
    const tx = head.x + d.x,
      ty = head.y + d.y;
    if (tx < 0 || ty < 0 || tx >= e.cols || ty >= e.rows) continue;
    let eats = false;
    for (const fr of e.fruits) if (fr.x === tx && fr.y === ty) eats = true;
    if (bNow[ty * e.cols + tx]) {
      if (dbg) dbg.scores[String(d.x) + ',' + String(d.y)] = 'refused';
      continue;
    }
    const c = copyBody(e.body);
    c.unshift({ x: tx, y: ty });
    if (!eats && isTailFree(e)) c.pop();
    const b = buildBlocked(e, c, true, true);
    // The tail cell stays occupied while eating: it does not free this turn.
    if ((eats || !isTailFree(e)) && c.length > 2) {
      const tailEnd = c[c.length - 1];
      if (!tailEnd) continue;
      if (tailEnd.x === tx && tailEnd.y === ty) continue;
    }
    const cTail = c[c.length - 1];
    if (!cTail) continue;
    const z = zone(e, b, tx, ty, cTail);
    if (z.size > maxSpace) {
      maxSpace = z.size;
      fallback = d;
    }
    if (!z.exit && z.size < pocketThreshold) {
      if (dbg) dbg.scores[String(d.x) + ',' + String(d.y)] = `pocket ${String(z.size)}`;
      continue;
    }
    // advantage (duel, super-admin): -1..1. Favored: less noise in choice (fairer play).
    // Disadvantaged: extra noise (more chaotic play). Invisible: no speed or display change.
    const advantage = Math.max(-1, Math.min(1, e.advantage || 0));
    const noise =
      flair * 2 * (advantage > 0 ? 1 - 0.8 * advantage : 1) +
      (advantage < 0 ? -advantage * 0.8 : 0);
    let s =
      (d.x === e.dir.x && d.y === e.dir.y ? 0.5 : 0) +
      packCoeff * countWallContacts(e, b, tx, ty) +
      z.size * 0.02 +
      Math.random() * noise; // above the straight-ahead bonus (0.5) at 0.25: two snakes out of sync
    const opp0 = opponent?.[0];
    // defense: each cell away from opponent's head counts; own pocket is primary.
    if (stance === 'defense' && opp0)
      s += 0.12 * (Math.abs(opp0.x - tx) + Math.abs(opp0.y - ty)) + z.size * 0.03;
    // attack: close in on opponent's head so attrition has leverage (far away, attrition yields nothing).
    if (stance === 'attack' && opp0) s -= 0.1 * (Math.abs(opp0.x - tx) + Math.abs(opp0.y - ty));
    // Lure scene (face-to-face, ballet, predator): when direct pathing fails, positioning takes
    // over; strong bonus toward the opponent's head keeps snakes visibly magnetic instead of
    // packing against walls.
    if (e.lure && opp0) s -= 0.5 * (Math.abs(opp0.x - tx) + Math.abs(opp0.y - ty));
    // Encircle scene: optimum at distance 2 from opponent's head (enough to orbit; too close =
    // head-on, too far = no circle). +1.5 on the ideal cell, decreasing with distance.
    if (e.encircle && opp0) {
      const headDist = Math.abs(opp0.x - tx) + Math.abs(opp0.y - ty);
      s += 1.5 - 0.8 * Math.abs(headDist - 2);
    }
    // Repel scene: strong bonus per cell away from opponent (well above the 0.5 straight-ahead
    // bonus); snakes visibly and actively avoid each other.
    if (e.repel && opp0) s += 0.6 * (Math.abs(opp0.x - tx) + Math.abs(opp0.y - ty));
    // Blocking (attack stance): a cell placed AHEAD of the opponent's head (on their line of
    // travel, 1 to 3 cells) is valued highly: they must turn or enter our body. The step is still
    // subject to the same pocket checks; no self-sacrifice for blocking.
    const opp1 = opponent?.[1];
    if (stance === 'attack' && opp0 && opp1 && !window.VIPER_NO_BLOCKING) {
      const adx = opp0.x - opp1.x,
        ady = opp0.y - opp1.y;
      for (let kb = 1; kb <= 3; kb++) {
        if (tx === opp0.x + adx * kb && ty === opp0.y + ady * kb) {
          s += 1.2 - 0.3 * kb;
          break;
        }
      }
    }
    if (dbg) dbg.scores[String(d.x) + ',' + String(d.y)] = s;
    if (s > scoreMax) {
      scoreMax = s;
      chosen = d;
    }
  }
  // Truly trapped: largest pocket, hoping the tail clears.
  // Last resort: NEVER a step outside the grid. Cornered (pushed against the wall then abandoned),
  // all safe cells are taken and both chosen and fallback are null. Previously returned e.dir,
  // which points into the wall: in duel a 'wall' fault makes the snake invincible WITHOUT moving
  // (walls are not crossed), and it would push against the wall forever. A turn INTO the grid is
  // forced, even onto own body: a self-collision makes it invincible, and an interior cell IS
  // crossed (base.js line 983), so it escapes.
  let lastResort: Direction | null = null;
  if (!chosen && !fallback) {
    for (const dr of DIRS) {
      if (dr.x === back.x && dr.y === back.y) continue;
      const rx = head.x + dr.x,
        ry = head.y + dr.y;
      if (rx < 0 || ry < 0 || rx >= e.cols || ry >= e.rows) continue;
      lastResort = dr;
      break;
    }
  }
  m.reason =
    (m.waiting ?? 0) > 0
      ? 'waiting'
      : targets.length
        ? 'position (no safe berry route)'
        : 'position';
  return { d: chosen ?? fallback ?? lastResort ?? e.dir, trap: !chosen && !fallback };
}

// isStepSafe(state, d): is step d still safe? Same criterion as berry routes: free cell
// (obstacles and avoidance crown included), and after the step the head still sees its tail.
// Used by base.js to hold an already-committed direction (anti-jitter in head-to-head).
function isStepSafe(e: AiState, d: Direction): boolean {
  const t = e.body[0];
  if (!t) return false; // body always has a head; guard for TypeScript
  const tx = t.x + d.x,
    ty = t.y + d.y;
  if (tx < 0 || ty < 0 || tx >= e.cols || ty >= e.rows) return false;
  const extState: AiState = { ...e, obstacles: e.obstacles.concat(e.avoid) };
  if (buildBlocked(extState, e.body, true, isTailFree(e))[ty * e.cols + tx]) return false;
  let eats = false;
  for (const fr of e.fruits) if (fr.x === tx && fr.y === ty) eats = true;
  const c = copyBody(e.body);
  c.unshift({ x: tx, y: ty });
  if (!eats && isTailFree(e)) c.pop();
  return isSafe(extState, c);
}

window.ViperAi = { choose: choose, safeStep: isStepSafe };
