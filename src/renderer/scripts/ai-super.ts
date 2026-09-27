// Viper super AI (duel): iterative-deepening minimax alpha-beta with simultaneous moves and
// time budget. Scores positions by Voronoi territory, length gained, berry control, and enclosure.
// Interface identical to ai-human.js. Duel rules: length is the score; collision costs half the segments; tail frees next step.

import type { AiState } from '../engine/types-api.ts';
import type { AiDebug } from '../engine/types.ts';

const DX = [0, 1, 0, -1],
  DY = [-1, 0, 1, 0];
const W_TERRITORY = 25,
  W_BERRY = 75,
  W_CLOSE = 66,
  W_SHARE = 25,
  W_ENCLOSED = 120,
  W_ENCLOSED_ME = 160;
let cols = 0,
  rows = 0,
  N = 0;
let owner: Int8Array = new Int8Array(0),
  freeAt: Int16Array = new Int16Array(0),
  fruit: Uint8Array = new Uint8Array(0),
  lab: Int8Array = new Int8Array(0),
  dd: Int16Array = new Int16Array(0),
  Q: Int16Array = new Int16Array(0);
const g = [0, 0, 0],
  g0 = [0, 0, 0],
  L0 = [0, 0, 0];
const stack = new Int32Array(4 * 128);
let sp = 0;
let hasOpponent = false,
  opponentInvincible = false,
  dbgOn = false;
let timeLimit = 0,
  nodeCount = 0,
  halted = false;
const biases = [0, 0, 0, 0];
let margin = 0.5;
const pvLines: (number[] | null)[] = [];
let pvLineRet: number[] | null = null;
const rootScores = [0, 0, 0, 0];
let rootBest = -1;
let T1r = 0,
  T2r = 0;
const now: () => number =
  typeof performance !== 'undefined'
    ? function () {
        return performance.now();
      }
    : function () {
        return Date.now();
      };

function prepareGrid(c: number, r: number): void {
  if (c === cols && r === rows) return;
  cols = c;
  rows = r;
  N = c * r;
  owner = new Int8Array(N);
  freeAt = new Int16Array(N);
  fruit = new Uint8Array(N);
  lab = new Int8Array(N);
  dd = new Int16Array(N);
  Q = new Int16Array(N + 2);
}
function isBlocked(c: number, t: number): boolean {
  const o = owner[c] ?? 0; // c is a valid board index
  return o === 3 || (o !== 0 && (freeAt[c] ?? 0) + (g[o] ?? 0) > t);
}
function applyMove(s: number, c: number, t: number): void {
  stack[sp++] = c;
  stack[sp++] = owner[c] ?? 0;
  stack[sp++] = freeAt[c] ?? 0;
  stack[sp++] = fruit[c] ?? 0;
  owner[c] = s;
  freeAt[c] = t + (L0[s] ?? 0) + (s === 2 ? 1 : 0); // opponent: one cell of margin (step ordering, bite)
  if (fruit[c]) {
    fruit[c] = 0;
    g[s] = (g[s] ?? 0) + 1;
  }
}
function undoMove(): void {
  const f = stack[--sp] ?? 0, // sp tracks push/pop pairs; stack was filled before
    pf = stack[--sp] ?? 0,
    po = stack[--sp] ?? 0,
    c = stack[--sp] ?? 0;
  if (f) {
    fruit[c] = 1;
    const ow = owner[c] ?? 0;
    g[ow] = (g[ow] ?? 0) - 1;
  }
  owner[c] = po;
  freeAt[c] = pf;
}

// Voronoi territory from both heads, accounting for bodies that retract:
// a cell is traversable if it will be free when we arrive.
function evaluate(h1: number, h2: number, t: number): number {
  lab.fill(0);
  let qh = 0,
    qt = 0,
    T1 = 0,
    T2 = 0,
    F1 = 0,
    F2 = 0,
    n1 = 0,
    n2 = 0;
  lab[h1] = 1;
  dd[h1] = 0;
  Q[qt++] = h1;
  if (h2 >= 0) {
    lab[h2] = 2;
    dd[h2] = 0;
    Q[qt++] = h2;
  }
  while (qh < qt) {
    const c = Q[qh++] ?? 0, // qh < qt, element was enqueued; ?? 0 unreachable
      l = lab[c] ?? 0,
      d = (dd[c] ?? 0) + 1,
      x = c % cols,
      y = (c - x) / cols;
    for (let k = 0; k < 4; k++) {
      const nx = x + (DX[k] ?? 0), // k in 0..3, DX/DY have 4 entries; ?? 0 unreachable
        ny = y + (DY[k] ?? 0);
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const n = ny * cols + nx,
        ln = lab[n] ?? 0;
      if (ln !== 0) {
        if (ln !== l && ln !== 3 && l !== 3 && (dd[n] ?? 0) === d) {
          if (ln === 1) T1--;
          else T2--;
          lab[n] = 3;
        }
        continue;
      }
      const o = owner[n] ?? 0;
      if (o === 3 || (o !== 0 && (freeAt[n] ?? 0) + (g[o] ?? 0) > t + d)) continue;
      lab[n] = l;
      dd[n] = d;
      Q[qt++] = n;
      // Length is the score: the closest reachable berry pulls strongly (slope 1.5/step),
      // subsequent ones pull weakly. Eating (W_BERRY) always outweighs approaching (W_CLOSE).
      if (l === 1) {
        T1++;
        if (fruit[n]) {
          F1 += n1++ ? 12 / (d + 1) : Math.max(3, W_CLOSE - 3 * d);
        }
      } else if (l === 2) {
        T2++;
        if (fruit[n]) {
          F2 += n2++ ? 12 / (d + 1) : Math.max(3, W_CLOSE - 3 * d);
        }
      }
    }
  }
  T1r = T1;
  T2r = T2;
  const len1 = (L0[1] ?? 0) + (g[1] ?? 0);
  let v =
    W_TERRITORY * (Math.log(T1 + 5) - (h2 >= 0 ? Math.log(T2 + 5) : 0)) +
    W_BERRY * ((g[1] ?? 0) - (g0[1] ?? 0) - ((g[2] ?? 0) - (g0[2] ?? 0))) +
    F1 -
    F2;
  // Berries spawn randomly: my share of the board is my chance of being closest to the NEXT
  // berry. This is what wins the length race over time.
  if (h2 >= 0) v += W_SHARE * (T1 / (T1 + T2 + 1) - 0.5);
  if (h2 >= 0) {
    const len2 = (L0[2] ?? 0) + (g[2] ?? 0);
    if (T2 < len2) v += W_ENCLOSED * (1 - T2 / len2);
  }
  if (T1 < len1) v -= W_ENCLOSED_ME * (1 - T1 / len1);
  return v;
}

function collisionCost(s: number): number {
  return 12.5 * ((L0[s] ?? 0) + (g[s] ?? 0)) + 60;
} // one collision = half the segments

let rootBestCurrent = -1,
  rootOrder = [0, 1, 2, 3];
const pv1 = new Int8Array(32).fill(-1),
  pv2 = new Int8Array(32).fill(-1);

function maxN(
  h1: number,
  h2: number,
  k1: number,
  k2: number,
  t: number,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
): number {
  if ((++nodeCount & 63) === 0 && now() > timeLimit) {
    halted = true;
    return 0;
  }
  let best = -1e9;
  const x = h1 % cols,
    y = (h1 - x) / cols;
  for (let i = 0; i < 3 + (k1 < 0 ? 1 : 0); i++) {
    // at root: best move from the previous iteration goes first (rootOrder)
    let k =
      ply === 0
        ? (rootOrder[i] ?? 0)
        : k1 < 0
          ? i
          : i === 0
            ? k1
            : i === 1
              ? (k1 + 3) & 3
              : (k1 + 1) & 3;
    if (ply > 0 && (pv1[ply] ?? -1) >= 0 && k1 >= 0) {
      const pk = pv1[ply] ?? -1; // pv1[ply] >= 0 checked above; ?? -1 unreachable
      if (pk !== ((k1 + 2) & 3)) {
        if (i === 0) k = pk;
        else if (k === pk) k = k1;
      }
    }
    if (k1 >= 0 && k === ((k1 + 2) & 3)) continue;
    const nx = x + (DX[k] ?? 0), // k in 0..3; ?? 0 unreachable
      ny = y + (DY[k] ?? 0);
    const c1 = nx < 0 || ny < 0 || nx >= cols || ny >= rows ? -1 : ny * cols + nx;
    const crash1 = c1 < 0 || isBlocked(c1, t);
    let v = minN(h2, c1, crash1, k, k2, t, depth, ply === 0 ? alpha - margin : alpha, beta, ply);
    if (halted) return 0;
    if (ply === 0) {
      v += biases[k] ?? 0; // k is 0..3, biases has 4 entries; ?? 0 unreachable
      rootScores[k] = v;
    }
    if (v > best) {
      best = v;
      pv1[ply] = k;
      if (dbgOn) pvLines[ply] = pvLineRet;
      if (ply === 0) rootBestCurrent = k;
    }
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function minN(
  h2: number,
  c1: number,
  crash1: boolean,
  k1n: number,
  k2: number,
  t: number,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
): number {
  let v: number;
  if (!hasOpponent) {
    if (crash1) {
      if (dbgOn) pvLineRet = [];
      return -collisionCost(1) + t;
    }
    applyMove(1, c1, t);
    v =
      depth <= 1
        ? evaluate(c1, -1, t)
        : maxN(c1, -1, k1n, -1, t + 1, depth - 1, alpha, beta, ply + 1);
    undoMove();
    if (dbgOn) pvLineRet = [c1, -1].concat(depth > 1 ? (pvLines[ply + 1] ?? []) : []);
    return v;
  }
  let worst = 1e9;
  const x = h2 % cols,
    y = (h2 - x) / cols;
  let pvLine: number[] | null = null;
  // Out of reach within the remaining horizon: their moves cannot touch me, so only their
  // first legal move (straight-ahead first) is tried. The search goes twice as deep.
  const farAway =
    c1 >= 0 && Math.abs((c1 % cols) - x) + Math.abs((c1 - (c1 % cols)) / cols - y) > 2 * depth + 1;
  for (let i = 0; i < 3 + (k2 < 0 ? 1 : 0); i++) {
    let k = k2 < 0 ? i : i === 0 ? k2 : i === 1 ? (k2 + 3) & 3 : (k2 + 1) & 3;
    if ((pv2[ply] ?? -1) >= 0 && k2 >= 0) {
      const pk = pv2[ply] ?? -1; // pv2[ply] >= 0 checked above; ?? -1 unreachable
      if (pk !== ((k2 + 2) & 3)) {
        if (i === 0) k = pk;
        else if (k === pk) k = k2;
      }
    }
    if (k2 >= 0 && k === ((k2 + 2) & 3)) continue;
    const nx = x + (DX[k] ?? 0), // k in 0..3; ?? 0 unreachable
      ny = y + (DY[k] ?? 0);
    const c2 = nx < 0 || ny < 0 || nx >= cols || ny >= rows ? -1 : ny * cols + nx;
    let crash2 = c2 < 0 || isBlocked(c2, t),
      c1x = crash1;
    if (!c1x && !crash2 && c1 === c2) {
      c1x = true;
      crash2 = true;
    } // head-on: both pay
    if (c1x || crash2) {
      v =
        (c1x ? -collisionCost(1) + t : 0) +
        (crash2 && !opponentInvincible ? collisionCost(2) - t : 0);
    } else {
      applyMove(1, c1, t);
      applyMove(2, c2, t);
      v =
        depth <= 1
          ? evaluate(c1, c2, t)
          : maxN(c1, c2, k1n, k, t + 1, depth - 1, alpha, beta, ply + 1);
      undoMove();
      undoMove();
      if (halted) return 0;
    }
    if (v < worst) {
      worst = v;
      pv2[ply] = k;
      if (dbgOn)
        pvLine = [c1, c2].concat(!c1x && !crash2 && depth > 1 ? (pvLines[ply + 1] ?? []) : []);
    }
    if (worst < beta) beta = worst;
    if (alpha >= beta) break;
    if (farAway && !crash2) break;
  }
  if (dbgOn) pvLineRet = pvLine ?? [];
  return worst;
}

function indexDir(dx: number, dy: number): number {
  for (let k = 0; k < 4; k++) if (DX[k] === dx && DY[k] === dy) return k;
  return -1;
}

function choose(e: AiState): { x: number; y: number } {
  prepareGrid(e.cols, e.rows);
  const me = e.body,
    opponent = e.opponent?.length ? e.opponent : null;
  let i: number, c: number;
  const m = e.memory;
  owner.fill(0);
  freeAt.fill(0);
  fruit.fill(0);
  sp = 0;
  for (const obs of e.obstacles) owner[obs.y * cols + obs.x] = 3;
  hasOpponent = !!opponent;
  opponentInvincible = e.opponentInvincible;
  dbgOn = !!e.debug;
  L0[1] = me.length;
  g[1] = e.toGrow > 0 ? e.toGrow : 0;
  L0[2] = opponent ? opponent.length : 0;
  g[2] = 0;
  if (opponent)
    for (i = opponent.length - 1; i >= 0; i--) {
      const oc = opponent[i];
      if (!oc) continue; // i in bounds (i < opponent.length); guard for TypeScript
      c = oc.y * cols + oc.x;
      owner[c] = 2;
      freeAt[c] = Math.max(freeAt[c] ?? 0, L0[2] - i + 1);
    }
  for (i = me.length - 1; i >= 0; i--) {
    const mc = me[i];
    if (!mc) continue; // i in bounds (i < me.length); guard for TypeScript
    c = mc.y * cols + mc.x;
    freeAt[c] = Math.max(owner[c] === 1 ? (freeAt[c] ?? 0) : 0, L0[1] - i);
    owner[c] = 1;
  }
  for (const fr of e.fruits) {
    c = fr.y * cols + fr.x;
    if (!owner[c]) fruit[c] = 1;
  }
  g0[1] = g[1];
  g0[2] = g[2];
  const me0 = me[0];
  if (!me0) return e.dir; // body always has a head; guard for TypeScript
  const h1 = me0.y * cols + me0.x;
  const opp0 = opponent?.[0];
  const h2 = opp0 ? opp0.y * cols + opp0.x : -1;
  const me1 = me[1];
  let k1 = me1 ? indexDir(me0.x - me1.x, me0.y - me1.y) : -1;
  if (k1 < 0) k1 = indexDir(e.dir.x, e.dir.y);
  const opp1 = opponent?.[1];
  const k2 = opp0 && opp1 ? indexDir(opp0.x - opp1.x, opp0.y - opp1.y) : -1;
  // Tiny randomness so two super AIs don't mirror each other, and a preference for the
  // direction already displayed (anti-jitter), as long as it costs almost nothing.
  for (i = 0; i < 4; i++) biases[i] = Math.random() * 0.15;
  margin = 0.5;
  if (e.preferred) {
    const prefDirIdx = indexDir(e.preferred.x, e.preferred.y);
    if (prefDirIdx >= 0) {
      // prefDirIdx is in 0..3 (checked by indexDir), biases has 4 entries
      biases[prefDirIdx] = (biases[prefDirIdx] ?? 0) + 3;
      margin = 3.5;
    }
  }

  const budget = window.VIPER_SUPER_MS ?? 5;
  pv1.fill(-1);
  pv2.fill(-1);
  timeLimit = now() + budget;
  nodeCount = 0;
  halted = Number.isNaN(budget); // always false; function call prevents literal narrowing
  rootBest = -1;
  let chosen = -1,
    depthReached = 0,
    rootValue = 0;
  const scores = [0, 0, 0, 0];
  let pvLine: number[] | null = null;
  for (let depth = 1; depth <= 14; depth++) {
    rootBestCurrent = -1;
    pvLines.length = 0;
    rootOrder = k1 < 0 ? [0, 1, 2, 3] : [k1, (k1 + 3) & 3, (k1 + 1) & 3];
    if (rootBest >= 0 && rootOrder.indexOf(rootBest) > 0) {
      rootOrder.splice(rootOrder.indexOf(rootBest), 1);
      rootOrder.unshift(rootBest);
    }
    const v = maxN(h1, h2, k1, k2, 1, depth, -1e9, 1e9, 0);
    if (halted) break;
    chosen = rootBestCurrent;
    rootBest = chosen;
    depthReached = depth;
    rootValue = v;
    for (i = 0; i < 4; i++) scores[i] = rootScores[i] ?? 0;
    if (dbgOn) pvLine = pvLines[0] ? pvLines[0].slice() : null;
    if (v < -1e8 || now() > timeLimit) break;
  }
  while (sp > 0) undoMove();
  // No depth completed or all moves crash: pick the step leaving the most territory, never outside the grid.
  if (chosen < 0 || (scores[chosen] ?? 0) < -collisionCost(1) + 20) {
    let bestFallback = -1,
      bestTerritory = -1;
    for (i = 0; i < 4; i++) {
      if (k1 >= 0 && i === ((k1 + 2) & 3)) continue;
      const nx = me0.x + (DX[i] ?? 0), // i in 0..3; ?? 0 unreachable
        ny = me0.y + (DY[i] ?? 0);
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      c = ny * cols + nx;
      let T = -0.5;
      if (!isBlocked(c, 1)) {
        applyMove(1, c, 1);
        evaluate(c, h2, 1);
        T = T1r;
        undoMove();
      }
      if (T > bestTerritory) {
        bestTerritory = T;
        bestFallback = i;
      }
    }
    if (
      chosen < 0 ||
      (bestFallback >= 0 && bestTerritory > 0 && (scores[chosen] ?? 0) < -collisionCost(1) + 20)
    )
      chosen = bestFallback >= 0 ? bestFallback : chosen;
  }
  evaluate(h1, h2, 0);
  m.activeStance = rootValue > 25 ? 'attack' : rootValue < -25 ? 'defense' : 'neutral';
  m.reason = `super d${String(depthReached)}`;
  if (dbgOn) {
    const dbgScores: AiDebug['scores'] = {};
    const dbg = (m.debug = {
      scores: dbgScores,
      route: [] as { x: number; y: number }[],
      target: null,
      trap: T2r,
      pocket: T1r,
      stance: m.activeStance,
      reason: m.reason,
      choice: chosen >= 0 ? { x: DX[chosen] ?? 0, y: DY[chosen] ?? 0 } : null,
      superAi: {
        value: rootValue,
        depth: depthReached,
        nodes: nodeCount,
        ownTerritory: T1r,
        rivalTerritory: T2r,
        rival: [] as { x: number; y: number }[],
        voronoi: Array.prototype.slice.call(lab) as number[],
      },
    });
    for (i = 0; i < 4; i++)
      if (!(k1 >= 0 && i === ((k1 + 2) & 3)))
        dbg.scores[`${String(DX[i] ?? 0)},${String(DY[i] ?? 0)}`] =
          (scores[i] ?? 0) < -collisionCost(1) + 20 ? 'refused' : (scores[i] ?? 0);
    if (pvLine)
      for (i = 0; i + 1 < pvLine.length; i += 2) {
        const vi = pvLine[i];
        const vi1 = pvLine[i + 1];
        if (vi !== undefined && vi >= 0)
          dbg.route.push({ x: vi % cols, y: (vi - (vi % cols)) / cols });
        if (vi1 !== undefined && vi1 >= 0)
          dbg.superAi.rival.push({
            x: vi1 % cols,
            y: (vi1 - (vi1 % cols)) / cols,
          });
      }
  }
  return chosen >= 0 ? { x: DX[chosen] ?? 0, y: DY[chosen] ?? 0 } : e.dir;
}

window.ViperSuperAi = { choose: choose };
