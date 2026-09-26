// IA Vipere "joueur humain doue" : elle planifie le trajet entier jusqu'au fruit, verifie qu'elle
// peut encore ressortir une fois le fruit avale, et se rabat sur le suivi de queue sinon.
// Aucune erreur tiree au de : elle ne meurt que reellement piegee.
// Interface : window.VipereIA = { choisir(etat) }, etat = {cols, rows, corps, dir, fruits, obstacles, memoire}
(function () {
  'use strict';
  var DIRS = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];

  // Cases interdites pour une tete qui cherche sa route : le corps sauf la tete, plus les obstacles.
  // La queue reste bloquee ici : c'est la simulation qui dira si elle aura bouge a temps.
  function buildBlocked(e, body, skipHead, skipTail) {
    var cols = e.cols,
      b = new Uint8Array(cols * e.rows),
      L = body.length,
      i;
    for (i = skipHead ? 1 : 0; i < L - (skipTail ? 1 : 0); i++) b[body[i].y * cols + body[i].x] = 1;
    for (i = 0; i < e.obstacles.length; i++) b[e.obstacles[i].y * cols + e.obstacles[i].x] = 1;
    return b;
  }

  // Distances reelles depuis (sx,sy) et le chemin pour y revenir
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

  // Remonte le chemin : rend la suite des cases, du premier pas jusqu'a la cible
  function buildPath(p, id) {
    var out = [];
    while (id >= 0 && p[id] >= 0) {
      out.push(id);
      id = p[id];
    }
    out.reverse();
    return out;
  }

  // Remplissage depuis (x,y) : taille de la poche, et si elle touche la case visee
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

  // Combien de cotes de la case longent un mur ou le corps : un joueur long range son serpent
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

  // Deroule le corps le long du chemin. Il ne grandit qu'a la derniere case, celle du fruit.
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

  // Un etat est sur si la tete voit encore sa propre queue : la boucle se rouvre toujours
  // e.aGrandir > 0 : le serpent grandit encore (oeuf, grappe de baies), la queue ne bouge pas, on
  // ne compte pas sur sa case. Sans ca, 21 des 39 morts d'une sonde duel etaient "soi" sous 10 anneaux.
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

  // ---- Chasse (duel) : refermer la poche de l'adversaire avec son propre corps -------------------
  // Un pas candidat est d'abord SUR pour nous (notre tete revoit notre queue apres le pas), puis on
  // mesure la poche de la tete adverse quand notre corps deplace et le sien bloquent. 'decisif' : la
  // poche ne touche plus sa queue et tient en moins de 2 fois sa longueur, il est enferme. 'usure' :
  // la poche perd au moins un tiers par rapport a maintenant. e.chasse (0-1) = gout du piege.
  function opponentPocket(e, myBody, opponent) {
    // la couronne d'evitement (e.eviter, ajoutee aux obstacles par choisir) n'est PAS un mur pour
    // l'adversaire : mesuree avec, sa poche valait toujours 1 case sans issue, l'IA croyait
    // l'enfermer a chaque pas et ne mangeait plus (88 % de pas "piege" en foule, Abdel a vu le
    // plateau couvert de baies ignorees)
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
      if (bNow[ty * e.cols + tx]) continue; // e.obstacles porte deja le corps adverse et sa couronne
      var c = copyBody(e.body);
      c.unshift({ x: tx, y: ty });
      if (isTailFree(e)) c.pop();
      var b = buildBlocked(e, c, true, true);
      // jamais a cote de la tete adverse : elle bouge en meme temps, ce serait une frontale
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

  // e.eviter (duel) : cases a eviter si possible (couronne de la tete adverse), jamais au prix de
  // la vie. Elles sont d'abord traitees en obstacles ; si plus aucune issue n'existe, on redecide
  // sans elles. Sonde : en obstacles durs, elles bouchaient tout pres d'un mur et le serpent gardait
  // son cap dedans (morts "evitables", adversaire a 2-4 cases).
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
  // Calque de debug (super admin) : lecture seule, aucun tirage au sort, la decision est deja prise.
  // Complete m.debug (rempli par decider) avec le pas choisi, la posture, la raison, la poche apres
  // le pas et un verdict pour chaque pas candidat que la phase de position n'a pas note.
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
      if (!(key in g.scores)) g.scores[key] = isStepSafe(e, d) ? 'ok' : 'refuse';
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
  // L'arriere, c'est le cou, pas la derniere direction tentee : apres un pas rate contre un mur,
  // e.dir pointe dans le mur et son inverse etait la seule issue (serpent colle au coin, Abdel).
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
    // Scènes (super admin) : surécrivent des leviers existants sans changer la logique.
    // portees : 12 attaque / 10 defense par defaut, override par scène (aveugle = 3, face = 20).
    var attackRange = e.attackRange || 12,
      defenseRange = e.defenseRange || 10;
    if (e.forcedHunt != null) e.hunt = e.forcedHunt;
    if (e.forcedFlair != null) e.flair = e.forcedFlair;

    // 1. Ou sont vraiment les fruits : distance de trajet, pas distance a vol d'oiseau.
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

    // 2. Temps de reaction humain, sauf sur ce qu'un spectateur vient d'offrir
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

    // Flair (0-1, duel) : deux IA identiques sur un depart symetrique jouaient en miroir (Abdel). Le
    // flair n'ajoute que du hasard au jeu de position, jamais d'imprudence : Abdel veut des serpents
    // qui se piegent l'un l'autre, pas qui meurent betement (ca frustre le spectateur).
    var flair = Math.min(1, Math.max(0, e.flair || 0));
    // Posture (duel, Abdel : "defensive and attacking strategy dynamically used"). Recalculee a chaque
    // pas d'apres le rapport de force et la distance, avec une inertie de quelques pas (m.posture,
    // m.postureT) pour ne pas clignoter. 'attaque' : je suis nettement plus long, ou il est court et
    // pres : le piege passe avant la baie, la chasse d'usure est systematique. 'defense' : il est
    // plus long que moi ou invincible et pres : je m'eloigne de sa tete, je ne mange pas sous son nez,
    // je maximise ma poche. 'neutre' : baie d'abord, piege si l'occasion se presente.
    var opponent = e.opponent,
      stance = 'neutral',
      opponentDist = 999;
    if (opponent && opponent.length) {
      opponentDist = Math.abs(opponent[0].x - head.x) + Math.abs(opponent[0].y - head.y);
      var oppLength = opponent.length,
        desiredStance = 'neutral';
      // Pertinence (Abdel : "they react to each other, no loop of strategy when it's not relevant") :
      // on n'attaque ni ne fuit un adversaire hors de portee (12 cases), et une attaque qui ne
      // referme rien pendant ~6 s (40 pas) se fatigue : retour au neutre le temps d'un repit.
      var oppPocket = opponentPocket(e, e.body, opponent).size;
      if (dbg) dbg.trap = oppPocket;
      if (m.fatigue > 0) m.fatigue--;
      // Plateau sans nourriture (Abdel : « when no food on the board, snakes should play attack and
      // defense strategy, not just circle around ») : la portee ne compte plus, le plus long chasse, le
      // plus court se derobe, et un serpent egal chasse aussi (la longueur ne peut venir que de l'autre).
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
        } // ca mord : on continue
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
    // Attirer (scène face à face ou prédateur) : la tête adverse devient la cible, comme une baie.
    // On path-find vers l'une de ses cases voisines libres, en sautant les vraies baies.
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
            m.reason = 'attire';
            return { d: attractDir, trap: false };
          }
        }
      }
    }
    // Repousser (scène ballet ou proie) : on saute attaque / piège / barrage / baies proches, et le
    // jeu de position en bas reçoit un très fort bonus d'éloignement (m.repousser lu plus bas).
    if (e.repel) m.repel = true;
    else m.repel = false;
    // Course à la baie : la scène coupe attaque et défense, on ne joue que la baie la plus proche sûre.
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
    // Scène repousser : coupe piège / barrage / usure, et vide la liste des baies dans un rayon
    // proche de la tête adverse (on ne veut pas être aimanté vers lui par une baie).
    if (e.repel) {
      if (opponent && opponent.length)
        targets = targets.filter(function (o) {
          return Math.abs(o.f.x - opponent[0].x) + Math.abs(o.f.y - opponent[0].y) > 5;
        });
    }
    // Scène encercler (chasse Abdel : « circle the other snake and no nothing ») : la chasseuse
    // ignore TOUTES les baies, ne va pas défendre sa propre poche, ne cherche qu'à tourner autour
    // de l'adversaire à distance 2 pour finir par refermer le cercle avec son propre corps.
    if (e.encircle) targets = [];
    // 3a. Chasse decisive (duel) : si un pas SUR referme la poche de l'adversaire au point qu'il ne
    // peut plus en sortir, il passe avant la baie. C'est le piege a la slither.
    // Scene ballet (Abdel : « donner le show sans tuer l'autre ») : on saute la chasse decisive.
    // Restent l'attirance, l'orbite, l'usure : la pression est visible, la sortie reste possible.
    if ((stance !== 'defense' || e.immediateTrap) && !e.repel && !e.noKill) {
      // scène piège : on autorise le pas qui referme le plus, même risqué pour nous
      var trap = hunt(e, L, 'decisive', e.immediateTrap);
      if (trap) {
        m.reason = e.immediateTrap ? 'piege!' : 'trap';
        return { d: trap, trap: false };
      }
    }
    // La nourriture reste une priorite dans TOUTES les postures (Abdel) : la longueur est le score.
    // En defense, une baie a portee de sa tete est un appat : on la laisse, on mange ailleurs.
    if (stance === 'defense' && opponent) {
      targets = targets.filter(function (o) {
        return Math.abs(o.f.x - opponent[0].x) + Math.abs(o.f.y - opponent[0].y) > 3;
      });
    }
    // 3. Le trajet entier est simule, fruit avale compris. On ne part que si on sait ressortir.
    // En attaque, seule une baie PROCHE (4 pas) passe avant l'usure ; une baie lointaine attend
    // que la poche adverse soit refermee.
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
      // Barrage (Abdel : « when two snakes are parallel and one is slightly ahead, cut the route of the
      // other »). Un pas SUR qui pose ma tete sur sa ligne de course, 1 a 3 cases devant lui, passe
      // avant l'usure : il devra tourner ou entrer dans mon corps.
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
        m.reason = 'barrage';
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
    // 3b. Chasse d'usure : sans baie accessible, un pas sur qui retrecit nettement la poche adverse
    if (stance !== 'defense') {
      var attrition = hunt(e, L, 'attrition');
      if (attrition) {
        m.reason = 'attrition';
        return { d: attrition, trap: false };
      }
    }

    // 4. Aucune route sure : jeu de position. On suit sa queue en se rangeant contre les bords.
    // Audace : imprudence (0-0.05) amplifie par la pression de recompense retrecit le seuil de poche.
    // Pression haute si la cible est loin (serpent affame) ou tres proche (elan d'approche).
    // Sans pression, meme a pleine imprudence, la marge reste quasi-intacte.
    var recklessness = e.recklessness || 0;
    var targetDist = nearestTarget ? nearestTarget.d : 999;
    var pressure = nearestTarget ? Math.min(1, targetDist <= 3 ? 0.8 : targetDist / 15) : 0.5;
    var boldness = Math.min(1, recklessness * (1 + pressure * 20));
    // seuilPoche : de L+2 (audace=0, comportement actuel) au plancher ceil(L/2) (audace=1)
    var pocketThreshold = Math.max(Math.ceil(L / 2), L + 2 - Math.round(boldness * (L / 2 + 2)));
    var packCoeff = Math.min(0.2, L / 250),
      chosen = null,
      scoreMax = -1e9,
      fallback = null,
      maxSpace = -1;
    // Ce que la tete peut toucher A CET INSTANT : le corps tel qu'il est, queue exclue si elle va
    // bouger. Le corps simule apres le pas (plus bas) sert a mesurer la poche, pas a juger la case
    // visee : sa "queue" est l'ancien avant-dernier anneau, encore en place. Bug d'origine : toutes
    // les morts "soi" du duel visaient le segment L-2.
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
        if (dbg) dbg.scores[d.x + ',' + d.y] = 'refuse';
        continue;
      }
      var c = copyBody(e.body);
      c.unshift({ x: tx, y: ty });
      if (!eats && isTailFree(e)) c.pop();
      var b = buildBlocked(e, c, true, true);
      // la case de la queue est occupee tant qu'il avale : elle ne se libere pas ce tour
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
        if (dbg) dbg.scores[d.x + ',' + d.y] = 'poche ' + z.size;
        continue;
      }
      // avantage (duel, super admin) : -1..1. Favorise = moins de bruit dans le choix (jeu plus juste),
      // defavorise = bruit supplementaire (jeu plus brouillon). Invisible : ni vitesse ni affichage.
      var advantage = Math.max(-1, Math.min(1, e.advantage || 0));
      var noise =
        flair * 2 * (advantage > 0 ? 1 - 0.8 * advantage : 1) +
        (advantage < 0 ? -advantage * 0.8 : 0);
      var s =
        (d.x === e.dir.x && d.y === e.dir.y ? 0.5 : 0) +
        packCoeff * countWallContacts(e, b, tx, ty) +
        z.size * 0.02 +
        Math.random() * noise; // au-dessus du bonus tout droit (0,5) des 0,25 : deux serpents desaccordes
      // defense : chaque case d'eloignement de sa tete compte, et sa poche a moi prime
      if (stance === 'defense' && opponent && opponent.length)
        s += 0.12 * (Math.abs(opponent[0].x - tx) + Math.abs(opponent[0].y - ty)) + z.size * 0.03;
      // attaque : se rapprocher de sa tete pour que l'usure ait prise (sans baie, l'usure loin de lui ne rend rien)
      if (stance === 'attack' && opponent && opponent.length)
        s -= 0.1 * (Math.abs(opponent[0].x - tx) + Math.abs(opponent[0].y - ty));
      // Scène attirer (face à face, ballet, prédateur) : quand le path direct échoue, le jeu de
      // position reprend la main ; ici on pousse un bonus fort vers la tête adverse pour que les
      // serpents restent visiblement magnétiques au lieu de se ranger contre les murs.
      if (e.lure && opponent && opponent.length)
        s -= 0.5 * (Math.abs(opponent[0].x - tx) + Math.abs(opponent[0].y - ty));
      // Scène encercler : optimum à distance 2 de la tête adverse (assez pour orbiter, trop près =
      // frontale, trop loin = pas de cercle). +1.5 sur la case idéale, dégressif en s'écartant.
      if (e.encircle && opponent && opponent.length) {
        var headDist = Math.abs(opponent[0].x - tx) + Math.abs(opponent[0].y - ty);
        s += 1.5 - 0.8 * Math.abs(headDist - 2);
      }
      // Scène repousser : bonus fort par case d'éloignement (largement au-dessus du bonus tout droit
      // de 0.5), les serpents visibles se cherchent activement à s'éviter.
      if (e.repel && opponent && opponent.length)
        s += 0.6 * (Math.abs(opponent[0].x - tx) + Math.abs(opponent[0].y - ty));
      // Barrage (Abdel : « when two snakes are parallel and one is slightly ahead, cut the route of the
      // other »). En attaque, une case posee DEVANT sa tete (sur sa ligne de course, 1 a 3 cases) vaut
      // beaucoup : il devra tourner ou entrer dans mon corps. Le pas reste soumis aux memes controles
      // de poche, on ne se sacrifie pas pour barrer.
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
    // reellement piegee : la plus grande poche, et elle espere que la queue passe
    // Dernier recours : JAMAIS un pas hors grille. Acculee dans un coin (l'adversaire l'a poussee
    // contre le mur puis s'en va), toutes les cases sures sont prises et 'choix'/'secours' sont nuls.
    // Avant, on rendait e.dir, qui pointe droit dans le mur : en duel la faute 'mur' rend le serpent
    // invincible SANS le deplacer (on ne traverse pas un mur), et il pousse contre la paroi pour
    // toujours. On force donc un virage DANS la grille, meme sur son propre corps : la collision
    // 'soi' le rend invincible, et une case interne, elle, se traverse (base.js ligne 983), donc il
    // se degage. Abdel, 2026-09-18 : « the opponent pushed him to the corner and went away and the
    // other one stayed stuck trying to move forward against the wall ».
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
      m.waiting > 0 ? 'waiting' : targets.length ? 'position(baie sans route sure)' : 'position';
    return { d: chosen || fallback || lastResort || e.dir, trap: !chosen && !fallback };
  }

  // pasSur(etat, d) : le pas d reste-t-il sur ? Meme critere que les trajets vers une baie : case
  // libre (obstacles et couronne adverse compris), et apres le pas la tete voit encore sa queue.
  // Sert a base.js pour garder une direction deja annoncee (anti-tremblement tete contre tete).
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
