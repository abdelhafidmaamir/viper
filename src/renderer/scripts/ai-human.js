// Viper AI "skilled human" player: plans the full path to the nearest berry, verifies a safe
// exit after eating, and falls back to tail-following otherwise. Dies only when truly trapped.
// Interface: window.ViperAi = { choose(state) }, state = {cols, rows, body, dir, fruits, obstacles, memory}
(function () {
  'use strict';
  var DIRS = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  // Cells blocked for a head seeking its route: the body excluding the head, plus obstacles.
  // The tail stays blocked here: simulation determines whether it will have moved in time.
  function buildBlocked(e, body, skipHead, skipTail) {
    var cols = e.cols,
      b = new Uint8Array(cols * e.rows),
      L = body.length,
      i;
    for (i = skipHead ? 1 : 0; i < L - (skipTail ? 1 : 0); i++) b[body[i].y * cols + body[i].x] = 1;
    for (i = 0; i < e.obstacles.length; i++) b[e.obstacles[i].y * cols + e.obstacles[i].x] = 1;
    return b;
  }

  // BFS distances from (sx,sy) and parent pointers for path reconstruction.
  function buildField(e, b, sx, sy) {
    var cols = e.cols,
      rows = e.rows,
      n = cols * rows;
    var d = new Int32Array(n).fill(-1),
      p = new Int32Array(n).fill(-1);
    var q = [sy * cols + sx],
      i = 0;
    d[sy * cols + sx] = 0;
    while (i < q.length) {
      var id = q[i++],
        cx = id % cols,
        cy = (id - cx) / cols,
        v = d[id];
      for (var k = 0; k < 4; k++) {
        var nx = cx + DIRS[k].x,
          ny = cy + DIRS[k].y;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        var j = ny * cols + nx;
        if (d[j] >= 0 || b[j]) continue;
        d[j] = v + 1;
        p[j] = id;
        q.push(j);
      }
    }
    return { d: d, p: p };
  }

  // Reconstructs the path: returns the sequence of cells from first step to target.
  function buildPath(p, id) {
    var out = [];
    while (id >= 0 && p[id] >= 0) {
      out.push(id);
      id = p[id];
    }
    out.reverse();
    return out;
  }

  // Flood fill from (x,y): pocket size, and whether it reaches the target cell.
  function zone(e, b, x, y, target) {
    var cols = e.cols,
      rows = e.rows,
      visited = new Uint8Array(cols * rows),
      stack = [x, y],
      n = 0,
      hasExit = false;
    visited[y * cols + x] = 1;
    while (stack.length) {
      var cy = stack.pop(),
        cx = stack.pop();
      n++;
      for (var k = 0; k < 4; k++) {
        var nx = cx + DIRS[k].x,
          ny = cy + DIRS[k].y;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (target && nx === target.x && ny === target.y) hasExit = true;
        var id = ny * cols + nx;
        if (visited[id] || b[id]) continue;
        visited[id] = 1;
        stack.push(nx, ny);
      }
    }
    return { size: n, exit: hasExit };
  }

  // Sides of the cell that border a wall or body: used to pack a long snake against edges.
  function countWallContacts(e, b, x, y) {
    var n = 0;
    for (var k = 0; k < 4; k++) {
      var nx = x + DIRS[k].x,
        ny = y + DIRS[k].y;
      if (nx < 0 || ny < 0 || nx >= e.cols || ny >= e.rows || b[ny * e.cols + nx]) n++;
    }
    return n;
  }

  function copyBody(body) {
    var c = [],
      i;
    for (i = 0; i < body.length; i++) c.push({ x: body[i].x, y: body[i].y });
    return c;
  }

  // Advances the body along the path. Growth only happens at the last cell (the berry).
  function simulateSteps(e, body, steps) {
    var c = copyBody(body),
      cols = e.cols,
      i;
    for (i = 0; i < steps.length; i++) {
      var id = steps[i],
        x = id % cols,
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
  function isTailFree(e) {
    return !(e.toGrow > 0);
  }
  function isSafe(e, body) {
    var L = body.length;
    if (L < 3) return true;
    var b = buildBlocked(e, body, true, isTailFree(e)),
      t = body[0],
      q = body[L - 1];
    if (b[t.y * e.cols + t.x]) return false;
    return zone(e, b, t.x, t.y, q).exit;
  }

  function dirToward(e, id) {
    var x = id % e.cols,
      y = (id - x) / e.cols,
      t = e.body[0];
    return { x: x - t.x, y: y - t.y };
  }

  // ---- Hunt (duel): close the opponent's pocket with our own body --------------------------------
  // A candidate step is first safe for us (our head still reaches our tail after the step), then
  // we measure the opponent head's pocket with our moved body and theirs blocking. 'decisive': the
  // pocket no longer touches their tail and fits in less than 2x their length (enclosed). 'attrition':
  // the pocket shrinks by at least a third. e.hunt (0-1) = trap aggressiveness.
  function opponentPocket(e, myBody, opponent) {
    // The avoidance crown (e.avoid, added to obstacles by choose) is NOT a wall for the opponent:
    // measured with it, their pocket always read as 1 cell with no exit, causing the AI to believe
    // it was enclosing them every step and stop eating (88% of steps flagged as "trap" in crowd
    // mode, board covered in ignored berries).
    var b = buildBlocked(
        Object.assign({}, e, { obstacles: e.obstaclesWithout || e.obstacles }),
        myBody,
        false,
        true,
      ),
      i,
      cols = e.cols;
    for (i = 1; i < opponent.length - 1; i++) b[opponent[i].y * cols + opponent[i].x] = 1;
    return zone(e, b, opponent[0].x, opponent[0].y, opponent[opponent.length - 1]);
  }
  function hunt(e, L, mode, force) {
    var opponent = e.opponent,
      huntIntensity = e.hunt || 0;
    if (!opponent || opponent.length < 2 || L < 5 || huntIntensity <= 0) return null;
    if (mode === 'attrition' && !force && Math.random() > huntIntensity) return null;
    var head = e.body[0],
      pocketBefore = opponentPocket(e, e.body, opponent).size,
      best = null,
      bestT = 1e9,
      k;
    var bNow = buildBlocked(e, e.body, true, isTailFree(e)),
      back = backOf(e);
    for (k = 0; k < 4; k++) {
      var d = DIRS[k];
      if (d.x === back.x && d.y === back.y) continue;
      var tx = head.x + d.x,
        ty = head.y + d.y;
      if (tx < 0 || ty < 0 || tx >= e.cols || ty >= e.rows) continue;
      if (bNow[ty * e.cols + tx]) continue; // e.obstacles already carries the opponent body and its crown
      var c = copyBody(e.body);
      c.unshift({ x: tx, y: ty });
      if (isTailFree(e)) c.pop();
      var b = buildBlocked(e, c, true, true);
      // Never adjacent to the opponent's head: they move simultaneously, which would cause a head-on collision.
      if (Math.abs(opponent[0].x - c[0].x) + Math.abs(opponent[0].y - c[0].y) <= 1) continue;
      if (!(mode === 'decisive' && force) && !zone(e, b, c[0].x, c[0].y, c[c.length - 1]).exit)
        continue;
      var z = opponentPocket(e, c, opponent);
      var ok =
        mode === 'decisive'
          ? !z.exit && z.size < opponent.length * 2
          : z.size <= pocketBefore * 0.67;
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
  function choose(e) {
    var r,
      decidedState = e;
    if (!e.avoid || !e.avoid.length) r = decide(e);
    else {
      var hardState = Object.assign({}, e, {
        obstacles: e.obstacles.concat(e.avoid),
        obstaclesWithout: e.obstacles,
      });
      r = decide(hardState);
      decidedState = hardState;
      if (r.trap) {
        r = decide(e);
        decidedState = e;
      }
    }
    if (e.debug) completeDebug(decidedState, r);
    return r.d;
  }
  // Debug overlay (super-admin): read-only, no random draws, decision already made.
  // Fills m.debug (set by decide) with the chosen step, stance, reason, post-step pocket,
  // and a verdict for each candidate step not already scored by the positioning phase.
  function completeDebug(e, r) {
    var m = e.memory || {},
      g = m.debug || (m.debug = { scores: {} }),
      t = e.body[0],
      back = backOf(e),
      k;
    g.choice = r.d;
    g.stance = m.activeStance || 'neutral';
    g.reason = m.reason || '';
    g.attackRange = e.attackRange || 12;
    g.defenseRange = e.defenseRange || 10;
    for (k = 0; k < 4; k++) {
      var d = DIRS[k],
        key = d.x + ',' + d.y;
      if (d.x === back.x && d.y === back.y) continue;
      if (!(key in g.scores)) g.scores[key] = isStepSafe(e, d) ? 'ok' : 'refused';
    }
    if (r.d) {
      var tx = t.x + r.d.x,
        ty = t.y + r.d.y;
      if (tx >= 0 && ty >= 0 && tx < e.cols && ty < e.rows) {
        var c = copyBody(e.body);
        c.unshift({ x: tx, y: ty });
        if (isTailFree(e)) c.pop();
        g.pocket = zone(e, buildBlocked(e, c, true, true), tx, ty, null).size;
      }
    }
  }
  // Back direction is the neck, not the last attempted direction: after a failed step into a wall,
  // e.dir points into the wall and its opposite was the only exit (snake pinned to a corner).
  function backOf(e) {
    var t = e.body[0],
      c = e.body[1];
    return c ? { x: c.x - t.x, y: c.y - t.y } : { x: -e.dir.x, y: -e.dir.y };
  }
  function decide(e) {
    var m = e.memory || {},
      head = e.body[0],
      L = e.body.length,
      i,
      k,
      back = backOf(e);
    var dbg = e.debug ? (m.debug = { scores: {}, route: null, target: null, trap: null }) : null;
    // Scenes (super-admin): override existing levers without changing logic.
    // Ranges: 12 attack / 10 defense by default, overridden per scene (blind = 3, face = 20).
    var attackRange = e.attackRange || 12,
      defenseRange = e.defenseRange || 10;
    if (e.forcedHunt != null) e.hunt = e.forcedHunt;
    if (e.forcedFlair != null) e.flair = e.forcedFlair;

    // 1. True fruit distances: path length, not straight-line.
    var field = buildField(e, buildBlocked(e, e.body, true, false), head.x, head.y),
      targets = [];
    for (i = 0; i < e.fruits.length; i++) {
      var f = e.fruits[i],
        id = f.y * e.cols + f.x,
        dd = field.d[id];
      if (dd > 0) targets.push({ f: f, d: dd, id: id });
    }
    targets.sort(function (a, b) {
      return a.d - b.d;
    });

    // 2. Human reaction delay, except for a berry just gifted by a viewer.
    var nearestTarget = targets[0] || null,
      key = nearestTarget ? nearestTarget.f.x + ',' + nearestTarget.f.y : '';
    if (key !== m.key) {
      m.key = key;
      m.waiting =
        nearestTarget && (nearestTarget.d <= 3 || nearestTarget.f.gifted)
          ? 0
          : 2 + Math.floor(Math.random() * 3);
    }
    if (m.waiting > 0) {
      m.waiting--;
      targets = [];
    }

    // Flair (0-1, duel): two identical AIs on a symmetric start played as mirrors. Flair adds
    // noise only to positional play, never recklessness: snakes should trap each other, not die
    // carelessly (frustrates the audience).
    var flair = Math.min(1, Math.max(0, e.flair || 0));
    // Stance (duel): defensive and attacking strategy, dynamically selected. Recomputed each step
    // from strength ratio and distance, with a few-step inertia (m.stanceTime) to avoid flickering.
    // 'attack': clearly longer, or opponent is short and close: trap takes priority over berry,
    // attrition hunt is always on. 'defense': opponent is longer or invincible and close: move away
    // from their head, avoid berries in their range, maximize pocket. 'neutral': berry first, trap
    // when the opportunity arises.
    var opponent = e.opponent,
      stance = 'neutral',
      opponentDist = 999;
    if (opponent && opponent.length) {
      opponentDist = Math.abs(opponent[0].x - head.x) + Math.abs(opponent[0].y - head.y);
      var oppLength = opponent.length,
        desiredStance = 'neutral';
      // Relevance: attack and defense are skipped for an out-of-range opponent (12 cells), and an
      // attack that closes nothing for ~6 s (40 steps) triggers fatigue: returns to neutral for a
      // reprieve.
      var oppPocket = opponentPocket(e, e.body, opponent).size;
      if (dbg) dbg.trap = oppPocket;
      if (m.fatigue > 0) m.fatigue--;
      // Empty board (no fruit): range no longer matters. The longer snake hunts, the shorter one
      // retreats; equal length also hunts (growth can only come from the opponent).
      var famine = !(e.fruits && e.fruits.length);
      if (famine && !(m.fatigue > 0) && L >= oppLength && !e.opponentInvincible)
        desiredStance = 'attack';
      else if (famine && oppLength > L) desiredStance = 'defense';
      else if (
        opponentDist <= attackRange &&
        !(m.fatigue > 0) &&
        (L >= oppLength + 4 || (oppLength < 8 && opponentDist <= 8 && L >= 6))
      )
        desiredStance = 'attack';
      else if (
        opponentDist <= defenseRange &&
        (oppLength >= L + 4 || (e.opponentInvincible && opponentDist <= 6))
      )
        desiredStance = 'defense';
      if (desiredStance !== m.stance) {
        m.stanceTime = (m.stanceTime || 0) + 1;
        if (m.stanceTime >= 4) {
          m.stance = desiredStance;
          m.stanceTime = 0;
          m.attackTime = 0;
          m.pocketRef = oppPocket;
        }
      } else m.stanceTime = 0;
      stance = m.stance || desiredStance;
      if (stance === 'attack') {
        m.attackTime = (m.attackTime || 0) + 1;
        if (oppPocket < (m.pocketRef || oppPocket) * 0.8) {
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
    if (e.forcedStance) stance = e.forcedStance;
    m.activeStance = stance;
    // Lure (face-to-face or predator scene): opponent's head becomes the target, like a berry.
    // Path-finds toward one of its free neighboring cells, bypassing real berries.
    if (e.lure && opponent && opponent.length) {
      var target = null;
      for (var kt = 0; kt < 4; kt++) {
        var cx = opponent[0].x + DIRS[kt].x,
          cy = opponent[0].y + DIRS[kt].y;
        if (cx < 0 || cy < 0 || cx >= e.cols || cy >= e.rows) continue;
        var idc = cy * e.cols + cx,
          dd = field.d[idc];
        if (dd > 0 && (!target || dd < target.d)) target = { id: idc, d: dd };
      }
      if (target) {
        var attractPath = buildPath(field.p, target.id);
        if (attractPath.length && isSafe(e, simulateSteps(e, e.body, attractPath))) {
          var attractDir = dirToward(e, attractPath[0]);
          if (!(attractDir.x === back.x && attractDir.y === back.y)) {
            m.reason = 'lure';
            return { d: attractDir, trap: false };
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
      for (i = 0; i < targets.length && i < 3; i++) {
        var racePath = buildPath(field.p, targets[i].id);
        if (!racePath.length) continue;
        if (isSafe(e, simulateSteps(e, e.body, racePath))) {
          var raceDir = dirToward(e, racePath[0]);
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
      if (opponent && opponent.length)
        targets = targets.filter(function (o) {
          return Math.abs(o.f.x - opponent[0].x) + Math.abs(o.f.y - opponent[0].y) > 5;
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
      var trap = hunt(e, L, 'decisive', e.immediateTrap);
      if (trap) {
        m.reason = e.immediateTrap ? 'trap!' : 'trap';
        return { d: trap, trap: false };
      }
    }
    // Food is a priority in ALL stances: length is the score.
    // In defense, a berry within the opponent's reach is bait: skip it, eat elsewhere.
    if (stance === 'defense' && opponent) {
      targets = targets.filter(function (o) {
        return Math.abs(o.f.x - opponent[0].x) + Math.abs(o.f.y - opponent[0].y) > 3;
      });
    }
    // 3. Simulate the full path including eating the berry; only commit if an exit remains.
    // In attack stance, only a nearby berry (4 steps) takes priority over attrition; a distant
    // berry waits until the opponent's pocket is closed.
    var fruitRoute = null;
    for (i = 0; i < targets.length && i < 3; i++) {
      var steps = buildPath(field.p, targets[i].id);
      if (!steps.length) continue;
      if (isSafe(e, simulateSteps(e, e.body, steps))) {
        var firstStep = dirToward(e, steps[0]);
        if (!(firstStep.x === back.x && firstStep.y === back.y)) {
          fruitRoute = { d: firstStep, dist: targets[i].d };
          if (dbg) {
            dbg.route = steps.map(function (id) {
              return { x: id % e.cols, y: (id - (id % e.cols)) / e.cols };
            });
            dbg.target = targets[i].f;
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
      var oppDx = opponent[0].x - opponent[1].x,
        oppDy = opponent[0].y - opponent[1].y,
        best = null,
        bestRank = 9;
      for (k = 0; k < 4; k++) {
        var bd = DIRS[k];
        if (bd.x === back.x && bd.y === back.y) continue;
        var bx = head.x + bd.x,
          by = head.y + bd.y;
        if (bx < 0 || by < 0 || bx >= e.cols || by >= e.rows) continue;
        for (var kb = 1; kb <= 3; kb++) {
          if (
            bx === opponent[0].x + oppDx * kb &&
            by === opponent[0].y + oppDy * kb &&
            kb < bestRank
          ) {
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
    if (stance === 'attack') {
      var urgentHunt = hunt(e, L, 'attrition', true);
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
      var attrition = hunt(e, L, 'attrition');
      if (attrition) {
        m.reason = 'attrition';
        return { d: attrition, trap: false };
      }
    }

    // 4. No safe route: positional play. Follow own tail while packing against edges.
    // Boldness: recklessness (0-0.05) amplified by reward pressure shrinks the pocket threshold.
    // Pressure is high when the target is far (hungry snake) or very close (approach momentum).
    // Without pressure, even at full recklessness, the margin stays nearly intact.
    var recklessness = e.recklessness || 0;
    var targetDist = nearestTarget ? nearestTarget.d : 999;
    var pressure = nearestTarget ? Math.min(1, targetDist <= 3 ? 0.8 : targetDist / 15) : 0.5;
    var boldness = Math.min(1, recklessness * (1 + pressure * 20));
    // pocketThreshold: from L+2 (boldness 0, default behaviour) down to ceil(L/2) (boldness 1)
    var pocketThreshold = Math.max(Math.ceil(L / 2), L + 2 - Math.round(boldness * (L / 2 + 2)));
    var packCoeff = Math.min(0.2, L / 250),
      chosen = null,
      scoreMax = -1e9,
      fallback = null,
      maxSpace = -1;
    // Blocked cells available to the head RIGHT NOW: body as-is, tail excluded if it will move.
    // The simulated body after the step (below) measures the pocket, not the target cell:
    // its "tail" is still the previous second-to-last segment. Original bug: all self-collision
    // deaths in duel targeted segment L-2.
    var bNow = buildBlocked(e, e.body, true, isTailFree(e));
    for (k = 0; k < 4; k++) {
      var d = DIRS[k];
      if (d.x === back.x && d.y === back.y) continue;
      var tx = head.x + d.x,
        ty = head.y + d.y;
      if (tx < 0 || ty < 0 || tx >= e.cols || ty >= e.rows) continue;
      var eats = false;
      for (i = 0; i < e.fruits.length; i++)
        if (e.fruits[i].x === tx && e.fruits[i].y === ty) eats = true;
      if (bNow[ty * e.cols + tx]) {
        if (dbg) dbg.scores[d.x + ',' + d.y] = 'refused';
        continue;
      }
      var c = copyBody(e.body);
      c.unshift({ x: tx, y: ty });
      if (!eats && isTailFree(e)) c.pop();
      var b = buildBlocked(e, c, true, true);
      // The tail cell stays occupied while eating: it does not free this turn.
      if ((eats || !isTailFree(e)) && c.length > 2) {
        var tailEnd = c[c.length - 1];
        if (tailEnd.x === tx && tailEnd.y === ty) continue;
      }
      var z = zone(e, b, tx, ty, c[c.length - 1]);
      if (z.size > maxSpace) {
        maxSpace = z.size;
        fallback = d;
      }
      if (!z.exit && z.size < pocketThreshold) {
        if (dbg) dbg.scores[d.x + ',' + d.y] = 'pocket ' + z.size;
        continue;
      }
      // advantage (duel, super-admin): -1..1. Favored: less noise in choice (fairer play).
      // Disadvantaged: extra noise (more chaotic play). Invisible: no speed or display change.
      var advantage = Math.max(-1, Math.min(1, e.advantage || 0));
      var noise =
        flair * 2 * (advantage > 0 ? 1 - 0.8 * advantage : 1) +
        (advantage < 0 ? -advantage * 0.8 : 0);
      var s =
        (d.x === e.dir.x && d.y === e.dir.y ? 0.5 : 0) +
        packCoeff * countWallContacts(e, b, tx, ty) +
        z.size * 0.02 +
        Math.random() * noise; // above the straight-ahead bonus (0.5) at 0.25: two snakes out of sync
      // defense: each cell away from opponent's head counts; own pocket is primary.
      if (stance === 'defense' && opponent && opponent.length)
        s += 0.12 * (Math.abs(opponent[0].x - tx) + Math.abs(opponent[0].y - ty)) + z.size * 0.03;
      // attack: close in on opponent's head so attrition has leverage (far away, attrition yields nothing).
      if (stance === 'attack' && opponent && opponent.length)
        s -= 0.1 * (Math.abs(opponent[0].x - tx) + Math.abs(opponent[0].y - ty));
      // Lure scene (face-to-face, ballet, predator): when direct pathing fails, positioning takes
      // over; strong bonus toward the opponent's head keeps snakes visibly magnetic instead of
      // packing against walls.
      if (e.lure && opponent && opponent.length)
        s -= 0.5 * (Math.abs(opponent[0].x - tx) + Math.abs(opponent[0].y - ty));
      // Encircle scene: optimum at distance 2 from opponent's head (enough to orbit; too close =
      // head-on, too far = no circle). +1.5 on the ideal cell, decreasing with distance.
      if (e.encircle && opponent && opponent.length) {
        var headDist = Math.abs(opponent[0].x - tx) + Math.abs(opponent[0].y - ty);
        s += 1.5 - 0.8 * Math.abs(headDist - 2);
      }
      // Repel scene: strong bonus per cell away from opponent (well above the 0.5 straight-ahead
      // bonus); snakes visibly and actively avoid each other.
      if (e.repel && opponent && opponent.length)
        s += 0.6 * (Math.abs(opponent[0].x - tx) + Math.abs(opponent[0].y - ty));
      // Blocking (attack stance): a cell placed AHEAD of the opponent's head (on their line of
      // travel, 1 to 3 cells) is valued highly: they must turn or enter our body. The step is still
      // subject to the same pocket checks; no self-sacrifice for blocking.
      if (stance === 'attack' && opponent && opponent.length > 1 && !window.VIPER_NO_BLOCKING) {
        var adx = opponent[0].x - opponent[1].x,
          ady = opponent[0].y - opponent[1].y;
        for (var kb = 1; kb <= 3; kb++) {
          if (tx === opponent[0].x + adx * kb && ty === opponent[0].y + ady * kb) {
            s += 1.2 - 0.3 * kb;
            break;
          }
        }
      }
      if (dbg) dbg.scores[d.x + ',' + d.y] = s;
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
    var lastResort = null;
    if (!chosen && !fallback) {
      for (k = 0; k < 4; k++) {
        var dr = DIRS[k];
        if (dr.x === back.x && dr.y === back.y) continue;
        var rx = head.x + dr.x,
          ry = head.y + dr.y;
        if (rx < 0 || ry < 0 || rx >= e.cols || ry >= e.rows) continue;
        lastResort = dr;
        break;
      }
    }
    m.reason =
      m.waiting > 0 ? 'waiting' : targets.length ? 'position (no safe berry route)' : 'position';
    return { d: chosen || fallback || lastResort || e.dir, trap: !chosen && !fallback };
  }

  // isStepSafe(state, d): is step d still safe? Same criterion as berry routes: free cell
  // (obstacles and avoidance crown included), and after the step the head still sees its tail.
  // Used by base.js to hold an already-committed direction (anti-jitter in head-to-head).
  function isStepSafe(e, d) {
    var t = e.body[0],
      tx = t.x + d.x,
      ty = t.y + d.y;
    if (tx < 0 || ty < 0 || tx >= e.cols || ty >= e.rows) return false;
    var extState = Object.assign({}, e, { obstacles: e.obstacles.concat(e.avoid || []) });
    if (buildBlocked(extState, e.body, true, isTailFree(e))[ty * e.cols + tx]) return false;
    var eats = false;
    for (var i = 0; i < e.fruits.length; i++)
      if (e.fruits[i].x === tx && e.fruits[i].y === ty) eats = true;
    var c = copyBody(e.body);
    c.unshift({ x: tx, y: ty });
    if (!eats && isTailFree(e)) c.pop();
    return isSafe(extState, c);
  }

  window.ViperAi = { choose: choose, safeStep: isStepSafe };
})();
