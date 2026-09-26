// Viper super AI (duel): iterative-deepening minimax alpha-beta with simultaneous moves and
// time budget. Scores positions by Voronoi territory, length gained, berry control, and enclosure.
// Interface identical to ai-human.js. Duel rules: length is the score; collision costs half the segments; tail frees next step.
(function () {
  'use strict';
  var DX = [0, 1, 0, -1],
    DY = [-1, 0, 1, 0];
  var W_TERRITORY = 25,
    W_BERRY = 75,
    W_CLOSE = 66,
    W_SHARE = 25,
    W_ENCLOSED = 120,
    W_ENCLOSED_ME = 160;
  var cols = 0,
    rows = 0,
    N = 0,
    owner,
    freeAt,
    fruit,
    lab,
    dd,
    Q;
  var g = [0, 0, 0],
    g0 = [0, 0, 0],
    L0 = [0, 0, 0];
  var stack = new Int32Array(4 * 128),
    sp = 0;
  var hasOpponent = false,
    opponentInvincible = false,
    dbgOn = false;
  var timeLimit = 0,
    nodeCount = 0,
    halted = false,
    biases = [0, 0, 0, 0],
    margin = 0.5;
  var pvLines = [],
    pvLineRet = null,
    rootScores = [0, 0, 0, 0],
    rootBest = -1;
  var T1r = 0,
    T2r = 0;
  var now =
    typeof performance !== 'undefined' && performance.now
      ? function () {
          return performance.now();
        }
      : function () {
          return Date.now();
        };

  function prepareGrid(c, r) {
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
  function isBlocked(c, t) {
    var o = owner[c];
    return o === 3 || (o !== 0 && freeAt[c] + g[o] > t);
  }
  function applyMove(s, c, t) {
    stack[sp++] = c;
    stack[sp++] = owner[c];
    stack[sp++] = freeAt[c];
    stack[sp++] = fruit[c];
    owner[c] = s;
    freeAt[c] = t + L0[s] + (s === 2 ? 1 : 0); // opponent: one cell of margin (step ordering, bite)
    if (fruit[c]) {
      fruit[c] = 0;
      g[s]++;
    }
  }
  function undoMove() {
    var f = stack[--sp],
      pf = stack[--sp],
      po = stack[--sp],
      c = stack[--sp];
    if (f) {
      fruit[c] = 1;
      g[owner[c]]--;
    }
    owner[c] = po;
    freeAt[c] = pf;
  }

  // Voronoi territory from both heads, accounting for bodies that retract:
  // a cell is traversable if it will be free when we arrive.
  function evaluate(h1, h2, t) {
    lab.fill(0);
    var qh = 0,
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
      var c = Q[qh++],
        l = lab[c],
        d = dd[c] + 1,
        x = c % cols,
        y = (c - x) / cols;
      for (var k = 0; k < 4; k++) {
        var nx = x + DX[k],
          ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        var n = ny * cols + nx,
          ln = lab[n];
        if (ln !== 0) {
          if (ln !== l && ln !== 3 && l !== 3 && dd[n] === d) {
            if (ln === 1) T1--;
            else T2--;
            lab[n] = 3;
          }
          continue;
        }
        var o = owner[n];
        if (o === 3 || (o !== 0 && freeAt[n] + g[o] > t + d)) continue;
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
    var len1 = L0[1] + g[1],
      v =
        W_TERRITORY * (Math.log(T1 + 5) - (h2 >= 0 ? Math.log(T2 + 5) : 0)) +
        W_BERRY * (g[1] - g0[1] - (g[2] - g0[2])) +
        F1 -
        F2;
    // Berries spawn randomly: my share of the board is my chance of being closest to the NEXT
    // berry. This is what wins the length race over time.
    if (h2 >= 0) v += W_SHARE * (T1 / (T1 + T2 + 1) - 0.5);
    if (h2 >= 0) {
      var len2 = L0[2] + g[2];
      if (T2 < len2) v += W_ENCLOSED * (1 - T2 / len2);
    }
    if (T1 < len1) v -= W_ENCLOSED_ME * (1 - T1 / len1);
    return v;
  }

  function collisionCost(s) {
    return 12.5 * (L0[s] + g[s]) + 60;
  } // one collision = half the segments

  function maxN(h1, h2, k1, k2, t, depth, alpha, beta, ply) {
    if ((++nodeCount & 63) === 0 && now() > timeLimit) {
      halted = true;
      return 0;
    }
    var best = -1e9,
      x = h1 % cols,
      y = (h1 - x) / cols;
    for (var i = 0; i < 3 + (k1 < 0 ? 1 : 0); i++) {
      // at root: best move from the previous iteration goes first (rootOrder)
      var k =
        ply === 0
          ? rootOrder[i]
          : k1 < 0
            ? i
            : i === 0
              ? k1
              : i === 1
                ? (k1 + 3) & 3
                : (k1 + 1) & 3;
      if (ply > 0 && pv1[ply] >= 0 && k1 >= 0) {
        var pk = pv1[ply];
        if (pk !== ((k1 + 2) & 3)) {
          if (i === 0) k = pk;
          else if (k === pk) k = k1;
        }
      }
      if (k1 >= 0 && k === ((k1 + 2) & 3)) continue;
      var nx = x + DX[k],
        ny = y + DY[k];
      var c1 = nx < 0 || ny < 0 || nx >= cols || ny >= rows ? -1 : ny * cols + nx;
      var crash1 = c1 < 0 || isBlocked(c1, t);
      var v = minN(h2, c1, crash1, k, k2, t, depth, ply === 0 ? alpha - margin : alpha, beta, ply);
      if (halted) return 0;
      if (ply === 0) {
        v += biases[k];
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
  var rootBestCurrent = -1,
    rootOrder = [0, 1, 2, 3],
    pv1 = new Int8Array(32).fill(-1),
    pv2 = new Int8Array(32).fill(-1);

  function minN(h2, c1, crash1, k1n, k2, t, depth, alpha, beta, ply) {
    var v;
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
      if (dbgOn) pvLineRet = [c1, -1].concat(depth > 1 && pvLines[ply + 1] ? pvLines[ply + 1] : []);
      return v;
    }
    var worst = 1e9,
      x = h2 % cols,
      y = (h2 - x) / cols,
      pvLine = null;
    // Out of reach within the remaining horizon: their moves cannot touch me, so only their
    // first legal move (straight-ahead first) is tried. The search goes twice as deep.
    var farAway =
      c1 >= 0 &&
      Math.abs((c1 % cols) - x) + Math.abs((c1 - (c1 % cols)) / cols - y) > 2 * depth + 1;
    for (var i = 0; i < 3 + (k2 < 0 ? 1 : 0); i++) {
      var k = k2 < 0 ? i : i === 0 ? k2 : i === 1 ? (k2 + 3) & 3 : (k2 + 1) & 3;
      if (pv2[ply] >= 0 && k2 >= 0) {
        var pk = pv2[ply];
        if (pk !== ((k2 + 2) & 3)) {
          if (i === 0) k = pk;
          else if (k === pk) k = k2;
        }
      }
      if (k2 >= 0 && k === ((k2 + 2) & 3)) continue;
      var nx = x + DX[k],
        ny = y + DY[k];
      var c2 = nx < 0 || ny < 0 || nx >= cols || ny >= rows ? -1 : ny * cols + nx;
      var crash2 = c2 < 0 || isBlocked(c2, t),
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
          pvLine = [c1, c2].concat(
            !c1x && !crash2 && depth > 1 && pvLines[ply + 1] ? pvLines[ply + 1] : [],
          );
      }
      if (worst < beta) beta = worst;
      if (alpha >= beta) break;
      if (farAway && !crash2) break;
    }
    if (dbgOn) pvLineRet = pvLine || [];
    return worst;
  }

  function indexDir(dx, dy) {
    for (var k = 0; k < 4; k++) if (DX[k] === dx && DY[k] === dy) return k;
    return -1;
  }

  function choose(e) {
    prepareGrid(e.cols, e.rows);
    var me = e.body,
      opponent = e.opponent && e.opponent.length ? e.opponent : null,
      i,
      c,
      m = e.memory || {};
    owner.fill(0);
    freeAt.fill(0);
    fruit.fill(0);
    sp = 0;
    for (i = 0; i < e.obstacles.length; i++) owner[e.obstacles[i].y * cols + e.obstacles[i].x] = 3;
    hasOpponent = !!opponent;
    opponentInvincible = !!e.opponentInvincible;
    dbgOn = !!e.debug;
    L0[1] = me.length;
    g[1] = e.toGrow > 0 ? e.toGrow : 0;
    L0[2] = opponent ? opponent.length : 0;
    g[2] = 0;
    if (opponent)
      for (i = opponent.length - 1; i >= 0; i--) {
        c = opponent[i].y * cols + opponent[i].x;
        owner[c] = 2;
        freeAt[c] = Math.max(freeAt[c], L0[2] - i + 1);
      }
    for (i = me.length - 1; i >= 0; i--) {
      c = me[i].y * cols + me[i].x;
      freeAt[c] = Math.max(owner[c] === 1 ? freeAt[c] : 0, L0[1] - i);
      owner[c] = 1;
    }
    for (i = 0; i < e.fruits.length; i++) {
      c = e.fruits[i].y * cols + e.fruits[i].x;
      if (!owner[c]) fruit[c] = 1;
    }
    g0[1] = g[1];
    g0[2] = g[2];
    var h1 = me[0].y * cols + me[0].x,
      h2 = opponent ? opponent[0].y * cols + opponent[0].x : -1;
    var k1 = me[1] ? indexDir(me[0].x - me[1].x, me[0].y - me[1].y) : -1;
    if (k1 < 0) k1 = indexDir(e.dir.x, e.dir.y);
    var k2 =
      opponent && opponent[1]
        ? indexDir(opponent[0].x - opponent[1].x, opponent[0].y - opponent[1].y)
        : -1;
    // Tiny randomness so two super AIs don't mirror each other, and a preference for the
    // direction already displayed (anti-jitter), as long as it costs almost nothing.
    for (i = 0; i < 4; i++) biases[i] = Math.random() * 0.15;
    margin = 0.5;
    if (e.preferred) {
      var prefDirIdx = indexDir(e.preferred.x, e.preferred.y);
      if (prefDirIdx >= 0) {
        biases[prefDirIdx] += 3;
        margin = 3.5;
      }
    }

    var budget = (typeof window !== 'undefined' && window.VIPER_SUPER_MS) || 5;
    pv1.fill(-1);
    pv2.fill(-1);
    timeLimit = now() + budget;
    nodeCount = 0;
    halted = false;
    rootBest = -1;
    var chosen = -1,
      depthReached = 0,
      rootValue = 0,
      scores = [0, 0, 0, 0],
      pvLine = null;
    for (var depth = 1; depth <= 14; depth++) {
      rootBestCurrent = -1;
      pvLines.length = 0;
      rootOrder = k1 < 0 ? [0, 1, 2, 3] : [k1, (k1 + 3) & 3, (k1 + 1) & 3];
      if (rootBest >= 0 && rootOrder.indexOf(rootBest) > 0) {
        rootOrder.splice(rootOrder.indexOf(rootBest), 1);
        rootOrder.unshift(rootBest);
      }
      var v = maxN(h1, h2, k1, k2, 1, depth, -1e9, 1e9, 0);
      if (halted) break;
      chosen = rootBestCurrent;
      rootBest = chosen;
      depthReached = depth;
      rootValue = v;
      for (i = 0; i < 4; i++) scores[i] = rootScores[i];
      if (dbgOn) pvLine = pvLines[0] ? pvLines[0].slice() : null;
      if (v < -1e8 || now() > timeLimit) break;
    }
    while (sp > 0) undoMove();
    // No depth completed or all moves crash: pick the step leaving the most territory, never outside the grid.
    if (chosen < 0 || scores[chosen] < -collisionCost(1) + 20) {
      var bestFallback = -1,
        bestTerritory = -1;
      for (i = 0; i < 4; i++) {
        if (k1 >= 0 && i === ((k1 + 2) & 3)) continue;
        var nx = me[0].x + DX[i],
          ny = me[0].y + DY[i];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        c = ny * cols + nx;
        var T = -0.5;
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
        (bestFallback >= 0 && bestTerritory > 0 && scores[chosen] < -collisionCost(1) + 20)
      )
        chosen = bestFallback >= 0 ? bestFallback : chosen;
    }
    evaluate(h1, h2, 0);
    m.activeStance = rootValue > 25 ? 'attack' : rootValue < -25 ? 'defense' : 'neutral';
    m.reason = 'super d' + depthReached;
    if (dbgOn) {
      var dbg = (m.debug = {
        scores: {},
        route: [],
        target: null,
        trap: T2r,
        pocket: T1r,
        stance: m.activeStance,
        reason: m.reason,
        choice: chosen >= 0 ? { x: DX[chosen], y: DY[chosen] } : null,
        superAi: {
          value: rootValue,
          depth: depthReached,
          nodes: nodeCount,
          ownTerritory: T1r,
          rivalTerritory: T2r,
          rival: [],
          voronoi: Array.prototype.slice.call(lab),
        },
      });
      for (i = 0; i < 4; i++)
        if (!(k1 >= 0 && i === ((k1 + 2) & 3)))
          dbg.scores[DX[i] + ',' + DY[i]] =
            scores[i] < -collisionCost(1) + 20 ? 'refused' : scores[i];
      if (pvLine)
        for (i = 0; i + 1 < pvLine.length; i += 2) {
          if (pvLine[i] >= 0)
            dbg.route.push({ x: pvLine[i] % cols, y: (pvLine[i] - (pvLine[i] % cols)) / cols });
          if (pvLine[i + 1] >= 0)
            dbg.superAi.rival.push({
              x: pvLine[i + 1] % cols,
              y: (pvLine[i + 1] - (pvLine[i + 1] % cols)) / cols,
            });
        }
    }
    return chosen >= 0 ? { x: DX[chosen], y: DY[chosen] } : e.dir;
  }

  window.ViperSuperAi = { choose: choose };
})();
