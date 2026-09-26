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
  function bloc(e, corps, sautTete, sautQueue) {
    var cols = e.cols,
      b = new Uint8Array(cols * e.rows),
      L = corps.length,
      i;
    for (i = sautTete ? 1 : 0; i < L - (sautQueue ? 1 : 0); i++)
      b[corps[i].y * cols + corps[i].x] = 1;
    for (i = 0; i < e.obstacles.length; i++) b[e.obstacles[i].y * cols + e.obstacles[i].x] = 1;
    return b;
  }

  // Distances reelles depuis (sx,sy) et le chemin pour y revenir
  function champ(e, b, sx, sy) {
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
  function chemin(p, id) {
    var out = [];
    while (id >= 0 && p[id] >= 0) {
      out.push(id);
      id = p[id];
    }
    out.reverse();
    return out;
  }

  // Remplissage depuis (x,y) : taille de la poche, et si elle touche la case visee
  function zone(e, b, x, y, cible) {
    var cols = e.cols,
      rows = e.rows,
      vus = new Uint8Array(cols * rows),
      pile = [x, y],
      n = 0,
      sortie = false;
    vus[y * cols + x] = 1;
    while (pile.length) {
      var cy = pile.pop(),
        cx = pile.pop();
      n++;
      for (var k = 0; k < 4; k++) {
        var nx = cx + DIRS[k].x,
          ny = cy + DIRS[k].y;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (cible && nx === cible.x && ny === cible.y) sortie = true;
        var id = ny * cols + nx;
        if (vus[id] || b[id]) continue;
        vus[id] = 1;
        pile.push(nx, ny);
      }
    }
    return { taille: n, sortie: sortie };
  }

  // Combien de cotes de la case longent un mur ou le corps : un joueur long range son serpent
  function appui(e, b, x, y) {
    var n = 0;
    for (var k = 0; k < 4; k++) {
      var nx = x + DIRS[k].x,
        ny = y + DIRS[k].y;
      if (nx < 0 || ny < 0 || nx >= e.cols || ny >= e.rows || b[ny * e.cols + nx]) n++;
    }
    return n;
  }

  function copie(corps) {
    var c = [],
      i;
    for (i = 0; i < corps.length; i++) c.push({ x: corps[i].x, y: corps[i].y });
    return c;
  }

  // Deroule le corps le long du chemin. Il ne grandit qu'a la derniere case, celle du fruit.
  function simuler(e, corps, pas) {
    var c = copie(corps),
      cols = e.cols,
      i;
    for (i = 0; i < pas.length; i++) {
      var id = pas[i],
        x = id % cols,
        y = (id - x) / cols;
      c.unshift({ x: x, y: y });
      if (i < pas.length - 1) c.pop();
    }
    return c;
  }

  // Un etat est sur si la tete voit encore sa propre queue : la boucle se rouvre toujours
  // e.aGrandir > 0 : le serpent grandit encore (oeuf, grappe de baies), la queue ne bouge pas, on
  // ne compte pas sur sa case. Sans ca, 21 des 39 morts d'une sonde duel etaient "soi" sous 10 anneaux.
  function queueLibre(e) {
    return !(e.aGrandir > 0);
  }
  function sur(e, corps) {
    var L = corps.length;
    if (L < 3) return true;
    var b = bloc(e, corps, true, queueLibre(e)),
      t = corps[0],
      q = corps[L - 1];
    if (b[t.y * e.cols + t.x]) return false;
    return zone(e, b, t.x, t.y, q).sortie;
  }

  function vers(e, id) {
    var x = id % e.cols,
      y = (id - x) / e.cols,
      t = e.corps[0];
    return { x: x - t.x, y: y - t.y };
  }

  // ---- Chasse (duel) : refermer la poche de l'adversaire avec son propre corps -------------------
  // Un pas candidat est d'abord SUR pour nous (notre tete revoit notre queue apres le pas), puis on
  // mesure la poche de la tete adverse quand notre corps deplace et le sien bloquent. 'decisif' : la
  // poche ne touche plus sa queue et tient en moins de 2 fois sa longueur, il est enferme. 'usure' :
  // la poche perd au moins un tiers par rapport a maintenant. e.chasse (0-1) = gout du piege.
  function pocheAdverse(e, mien, adv) {
    // la couronne d'evitement (e.eviter, ajoutee aux obstacles par choisir) n'est PAS un mur pour
    // l'adversaire : mesuree avec, sa poche valait toujours 1 case sans issue, l'IA croyait
    // l'enfermer a chaque pas et ne mangeait plus (88 % de pas "piege" en foule, Abdel a vu le
    // plateau couvert de baies ignorees)
    var b = bloc(
        Object.assign({}, e, { obstacles: e.obstaclesSans || e.obstacles }),
        mien,
        false,
        true,
      ),
      i,
      cols = e.cols;
    for (i = 1; i < adv.length - 1; i++) b[adv[i].y * cols + adv[i].x] = 1;
    return zone(e, b, adv[0].x, adv[0].y, adv[adv.length - 1]);
  }
  function chasser(e, L, mode, force) {
    var adv = e.adversaire,
      chasse = e.chasse || 0;
    if (!adv || adv.length < 2 || L < 5 || chasse <= 0) return null;
    if (mode === 'usure' && !force && Math.random() > chasse) return null;
    var tete = e.corps[0],
      avant = pocheAdverse(e, e.corps, adv).taille,
      best = null,
      bestT = 1e9,
      k;
    var bNow = bloc(e, e.corps, true, queueLibre(e)),
      ar = arriereDe(e);
    for (k = 0; k < 4; k++) {
      var d = DIRS[k];
      if (d.x === ar.x && d.y === ar.y) continue;
      var tx = tete.x + d.x,
        ty = tete.y + d.y;
      if (tx < 0 || ty < 0 || tx >= e.cols || ty >= e.rows) continue;
      if (bNow[ty * e.cols + tx]) continue; // e.obstacles porte deja le corps adverse et sa couronne
      var c = copie(e.corps);
      c.unshift({ x: tx, y: ty });
      if (queueLibre(e)) c.pop();
      var b = bloc(e, c, true, true);
      // jamais a cote de la tete adverse : elle bouge en meme temps, ce serait une frontale
      if (Math.abs(adv[0].x - c[0].x) + Math.abs(adv[0].y - c[0].y) <= 1) continue;
      if (!(mode === 'decisif' && force) && !zone(e, b, c[0].x, c[0].y, c[c.length - 1]).sortie)
        continue;
      var z = pocheAdverse(e, c, adv);
      var ok =
        mode === 'decisif' ? !z.sortie && z.taille < adv.length * 2 : z.taille <= avant * 0.67;
      if (ok && z.taille < bestT) {
        bestT = z.taille;
        best = d;
      }
    }
    return best;
  }

  // e.eviter (duel) : cases a eviter si possible (couronne de la tete adverse), jamais au prix de
  // la vie. Elles sont d'abord traitees en obstacles ; si plus aucune issue n'existe, on redecide
  // sans elles. Sonde : en obstacles durs, elles bouchaient tout pres d'un mur et le serpent gardait
  // son cap dedans (morts "evitables", adversaire a 2-4 cases).
  function choisir(e) {
    var r,
      ed = e;
    if (!e.eviter || !e.eviter.length) r = decider(e);
    else {
      var dur = Object.assign({}, e, {
        obstacles: e.obstacles.concat(e.eviter),
        obstaclesSans: e.obstacles,
      });
      r = decider(dur);
      ed = dur;
      if (r.piege) {
        r = decider(e);
        ed = e;
      }
    }
    if (e.debug) completerDebug(ed, r);
    return r.d;
  }
  // Calque de debug (super admin) : lecture seule, aucun tirage au sort, la decision est deja prise.
  // Complete m.debug (rempli par decider) avec le pas choisi, la posture, la raison, la poche apres
  // le pas et un verdict pour chaque pas candidat que la phase de position n'a pas note.
  function completerDebug(e, r) {
    var m = e.memoire || {},
      g = m.debug || (m.debug = { scores: {} }),
      t = e.corps[0],
      ar = arriereDe(e),
      k;
    g.choix = r.d;
    g.posture = m.postureActive || 'neutre';
    g.raison = m.raison || '';
    g.porteeAttaque = e.porteeAttaque || 12;
    g.porteeDefense = e.porteeDefense || 10;
    for (k = 0; k < 4; k++) {
      var d = DIRS[k],
        cle = d.x + ',' + d.y;
      if (d.x === ar.x && d.y === ar.y) continue;
      if (!(cle in g.scores)) g.scores[cle] = pasSur(e, d) ? 'ok' : 'refuse';
    }
    if (r.d) {
      var tx = t.x + r.d.x,
        ty = t.y + r.d.y;
      if (tx >= 0 && ty >= 0 && tx < e.cols && ty < e.rows) {
        var c = copie(e.corps);
        c.unshift({ x: tx, y: ty });
        if (queueLibre(e)) c.pop();
        g.poche = zone(e, bloc(e, c, true, true), tx, ty, null).taille;
      }
    }
  }
  // L'arriere, c'est le cou, pas la derniere direction tentee : apres un pas rate contre un mur,
  // e.dir pointe dans le mur et son inverse etait la seule issue (serpent colle au coin, Abdel).
  function arriereDe(e) {
    var t = e.corps[0],
      c = e.corps[1];
    return c ? { x: c.x - t.x, y: c.y - t.y } : { x: -e.dir.x, y: -e.dir.y };
  }
  function decider(e) {
    var m = e.memoire || {},
      tete = e.corps[0],
      L = e.corps.length,
      i,
      k,
      ar = arriereDe(e);
    var dbg = e.debug ? (m.debug = { scores: {}, route: null, cible: null, piege: null }) : null;
    // Scènes (super admin) : surécrivent des leviers existants sans changer la logique.
    // portees : 12 attaque / 10 defense par defaut, override par scène (aveugle = 3, face = 20).
    var pA = e.porteeAttaque || 12,
      pD = e.porteeDefense || 10;
    if (e.chasseForcee != null) e.chasse = e.chasseForcee;
    if (e.flairForce != null) e.flair = e.flairForce;

    // 1. Ou sont vraiment les fruits : distance de trajet, pas distance a vol d'oiseau.
    var ch = champ(e, bloc(e, e.corps, true, false), tete.x, tete.y),
      liste = [];
    for (i = 0; i < e.fruits.length; i++) {
      var f = e.fruits[i],
        id = f.y * e.cols + f.x,
        dd = ch.d[id];
      if (dd > 0) liste.push({ f: f, d: dd, id: id });
    }
    liste.sort(function (a, b) {
      return a.d - b.d;
    });

    // 2. Temps de reaction humain, sauf sur ce qu'un spectateur vient d'offrir
    var vise = liste[0] || null,
      cle = vise ? vise.f.x + ',' + vise.f.y : '';
    if (cle !== m.cle) {
      m.cle = cle;
      m.attente = vise && (vise.d <= 3 || vise.f.offerte) ? 0 : 2 + Math.floor(Math.random() * 3);
    }
    if (m.attente > 0) {
      m.attente--;
      liste = [];
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
    var adv = e.adversaire,
      posture = 'neutre',
      dAdv = 999;
    if (adv && adv.length) {
      dAdv = Math.abs(adv[0].x - tete.x) + Math.abs(adv[0].y - tete.y);
      var La = adv.length,
        veut = 'neutre';
      // Pertinence (Abdel : "they react to each other, no loop of strategy when it's not relevant") :
      // on n'attaque ni ne fuit un adversaire hors de portee (12 cases), et une attaque qui ne
      // referme rien pendant ~6 s (40 pas) se fatigue : retour au neutre le temps d'un repit.
      var poche = pocheAdverse(e, e.corps, adv).taille;
      if (dbg) dbg.piege = poche;
      if (m.fatigue > 0) m.fatigue--;
      // Plateau sans nourriture (Abdel : « when no food on the board, snakes should play attack and
      // defense strategy, not just circle around ») : la portee ne compte plus, le plus long chasse, le
      // plus court se derobe, et un serpent egal chasse aussi (la longueur ne peut venir que de l'autre).
      var famine = !(e.fruits && e.fruits.length);
      if (famine && !(m.fatigue > 0) && L >= La && !e.adversaireInvincible) veut = 'attaque';
      else if (famine && La > L) veut = 'defense';
      else if (dAdv <= pA && !(m.fatigue > 0) && (L >= La + 4 || (La < 8 && dAdv <= 8 && L >= 6)))
        veut = 'attaque';
      else if (dAdv <= pD && (La >= L + 4 || (e.adversaireInvincible && dAdv <= 6)))
        veut = 'defense';
      if (veut !== m.posture) {
        m.postureT = (m.postureT || 0) + 1;
        if (m.postureT >= 4) {
          m.posture = veut;
          m.postureT = 0;
          m.attaqueT = 0;
          m.pocheRef = poche;
        }
      } else m.postureT = 0;
      posture = m.posture || veut;
      if (posture === 'attaque') {
        m.attaqueT = (m.attaqueT || 0) + 1;
        if (poche < (m.pocheRef || poche) * 0.8) {
          m.attaqueT = 0;
          m.pocheRef = poche;
        } // ca mord : on continue
        if (m.attaqueT > 40) {
          m.fatigue = 30;
          m.posture = 'neutre';
          posture = 'neutre';
          m.attaqueT = 0;
        }
      }
    }
    if (e.postureForcee) posture = e.postureForcee;
    m.postureActive = posture;
    // Attirer (scène face à face ou prédateur) : la tête adverse devient la cible, comme une baie.
    // On path-find vers l'une de ses cases voisines libres, en sautant les vraies baies.
    if (e.attirer && adv && adv.length) {
      var cible = null;
      for (var kt = 0; kt < 4; kt++) {
        var cx = adv[0].x + DIRS[kt].x,
          cy = adv[0].y + DIRS[kt].y;
        if (cx < 0 || cy < 0 || cx >= e.cols || cy >= e.rows) continue;
        var idc = cy * e.cols + cx,
          dd = ch.d[idc];
        if (dd > 0 && (!cible || dd < cible.d)) cible = { id: idc, d: dd };
      }
      if (cible) {
        var pasA = chemin(ch.p, cible.id);
        if (pasA.length && sur(e, simuler(e, e.corps, pasA))) {
          var d0A = vers(e, pasA[0]);
          if (!(d0A.x === ar.x && d0A.y === ar.y)) {
            m.raison = 'attire';
            return { d: d0A, piege: false };
          }
        }
      }
    }
    // Repousser (scène ballet ou proie) : on saute attaque / piège / barrage / baies proches, et le
    // jeu de position en bas reçoit un très fort bonus d'éloignement (m.repousser lu plus bas).
    if (e.repousser) m.repousser = true;
    else m.repousser = false;
    // Course à la baie : la scène coupe attaque et défense, on ne joue que la baie la plus proche sûre.
    if (e.courseBaie) {
      for (i = 0; i < liste.length && i < 3; i++) {
        var pasC = chemin(ch.p, liste[i].id);
        if (!pasC.length) continue;
        if (sur(e, simuler(e, e.corps, pasC))) {
          var d0C = vers(e, pasC[0]);
          if (!(d0C.x === ar.x && d0C.y === ar.y)) {
            m.raison = 'course';
            return { d: d0C, piege: false };
          }
        }
      }
    }
    // Scène repousser : coupe piège / barrage / usure, et vide la liste des baies dans un rayon
    // proche de la tête adverse (on ne veut pas être aimanté vers lui par une baie).
    if (e.repousser) {
      if (adv && adv.length)
        liste = liste.filter(function (o) {
          return Math.abs(o.f.x - adv[0].x) + Math.abs(o.f.y - adv[0].y) > 5;
        });
    }
    // Scène encercler (chasse Abdel : « circle the other snake and no nothing ») : la chasseuse
    // ignore TOUTES les baies, ne va pas défendre sa propre poche, ne cherche qu'à tourner autour
    // de l'adversaire à distance 2 pour finir par refermer le cercle avec son propre corps.
    if (e.encercler) liste = [];
    // 3a. Chasse decisive (duel) : si un pas SUR referme la poche de l'adversaire au point qu'il ne
    // peut plus en sortir, il passe avant la baie. C'est le piege a la slither.
    // Scene ballet (Abdel : « donner le show sans tuer l'autre ») : on saute la chasse decisive.
    // Restent l'attirance, l'orbite, l'usure : la pression est visible, la sortie reste possible.
    if ((posture !== 'defense' || e.piegeImmediat) && !e.repousser && !e.nePasTuer) {
      // scène piège : on autorise le pas qui referme le plus, même risqué pour nous
      var piege = chasser(e, L, 'decisif', e.piegeImmediat);
      if (piege) {
        m.raison = e.piegeImmediat ? 'piege!' : 'piege';
        return { d: piege, piege: false };
      }
    }
    // La nourriture reste une priorite dans TOUTES les postures (Abdel) : la longueur est le score.
    // En defense, une baie a portee de sa tete est un appat : on la laisse, on mange ailleurs.
    if (posture === 'defense' && adv) {
      liste = liste.filter(function (o) {
        return Math.abs(o.f.x - adv[0].x) + Math.abs(o.f.y - adv[0].y) > 3;
      });
    }
    // 3. Le trajet entier est simule, fruit avale compris. On ne part que si on sait ressortir.
    // En attaque, seule une baie PROCHE (4 pas) passe avant l'usure ; une baie lointaine attend
    // que la poche adverse soit refermee.
    var routeBaie = null;
    for (i = 0; i < liste.length && i < 3; i++) {
      var pas = chemin(ch.p, liste[i].id);
      if (!pas.length) continue;
      if (sur(e, simuler(e, e.corps, pas))) {
        var d0 = vers(e, pas[0]);
        if (!(d0.x === ar.x && d0.y === ar.y)) {
          routeBaie = { d: d0, dist: liste[i].d };
          if (dbg) {
            dbg.route = pas.map(function (id) {
              return { x: id % e.cols, y: (id - (id % e.cols)) / e.cols };
            });
            dbg.cible = liste[i].f;
          }
          break;
        }
      }
    }
    if (routeBaie && (posture !== 'attaque' || routeBaie.dist <= 4)) {
      m.raison = 'baie';
      return { d: routeBaie.d, piege: false };
    }
    if (posture === 'attaque' && adv && adv.length > 1 && !window.VIPERE_SANS_BARRAGE) {
      // Barrage (Abdel : « when two snakes are parallel and one is slightly ahead, cut the route of the
      // other »). Un pas SUR qui pose ma tete sur sa ligne de course, 1 a 3 cases devant lui, passe
      // avant l'usure : il devra tourner ou entrer dans mon corps.
      var bdx = adv[0].x - adv[1].x,
        bdy = adv[0].y - adv[1].y,
        meilleur = null,
        meilleurK = 9;
      for (k = 0; k < 4; k++) {
        var bd = DIRS[k];
        if (bd.x === ar.x && bd.y === ar.y) continue;
        var bx = tete.x + bd.x,
          by = tete.y + bd.y;
        if (bx < 0 || by < 0 || bx >= e.cols || by >= e.rows) continue;
        for (var kb = 1; kb <= 3; kb++) {
          if (bx === adv[0].x + bdx * kb && by === adv[0].y + bdy * kb && kb < meilleurK) {
            if (sur(e, simuler(e, e.corps, [by * e.cols + bx]))) {
              meilleur = bd;
              meilleurK = kb;
            }
          }
        }
      }
      if (meilleur) {
        m.raison = 'barrage';
        return { d: meilleur, piege: false };
      }
    }
    if (posture === 'attaque') {
      var pressant = chasser(e, L, 'usure', true);
      if (pressant) {
        m.raison = 'usure';
        return { d: pressant, piege: false };
      }
      if (routeBaie) {
        m.raison = 'baie';
        return { d: routeBaie.d, piege: false };
      }
    }
    // 3b. Chasse d'usure : sans baie accessible, un pas sur qui retrecit nettement la poche adverse
    if (posture !== 'defense') {
      var usure = chasser(e, L, 'usure');
      if (usure) {
        m.raison = 'usure';
        return { d: usure, piege: false };
      }
    }

    // 4. Aucune route sure : jeu de position. On suit sa queue en se rangeant contre les bords.
    // Audace : imprudence (0-0.05) amplifie par la pression de recompense retrecit le seuil de poche.
    // Pression haute si la cible est loin (serpent affame) ou tres proche (elan d'approche).
    // Sans pression, meme a pleine imprudence, la marge reste quasi-intacte.
    var imprudence = e.imprudence || 0;
    var distCible = vise ? vise.d : 999;
    var pression = vise ? Math.min(1, distCible <= 3 ? 0.8 : distCible / 15) : 0.5;
    var audace = Math.min(1, imprudence * (1 + pression * 20));
    // seuilPoche : de L+2 (audace=0, comportement actuel) au plancher ceil(L/2) (audace=1)
    var seuilPoche = Math.max(Math.ceil(L / 2), L + 2 - Math.round(audace * (L / 2 + 2)));
    var rangement = Math.min(0.2, L / 250),
      choix = null,
      scoreMax = -1e9,
      secours = null,
      espaceMax = -1;
    // Ce que la tete peut toucher A CET INSTANT : le corps tel qu'il est, queue exclue si elle va
    // bouger. Le corps simule apres le pas (plus bas) sert a mesurer la poche, pas a juger la case
    // visee : sa "queue" est l'ancien avant-dernier anneau, encore en place. Bug d'origine : toutes
    // les morts "soi" du duel visaient le segment L-2.
    var bNow = bloc(e, e.corps, true, queueLibre(e));
    for (k = 0; k < 4; k++) {
      var d = DIRS[k];
      if (d.x === ar.x && d.y === ar.y) continue;
      var tx = tete.x + d.x,
        ty = tete.y + d.y;
      if (tx < 0 || ty < 0 || tx >= e.cols || ty >= e.rows) continue;
      var mange = false;
      for (i = 0; i < e.fruits.length; i++)
        if (e.fruits[i].x === tx && e.fruits[i].y === ty) mange = true;
      if (bNow[ty * e.cols + tx]) {
        if (dbg) dbg.scores[d.x + ',' + d.y] = 'refuse';
        continue;
      }
      var c = copie(e.corps);
      c.unshift({ x: tx, y: ty });
      if (!mange && queueLibre(e)) c.pop();
      var b = bloc(e, c, true, true);
      // la case de la queue est occupee tant qu'il avale : elle ne se libere pas ce tour
      if ((mange || !queueLibre(e)) && c.length > 2) {
        var qf = c[c.length - 1];
        if (qf.x === tx && qf.y === ty) continue;
      }
      var z = zone(e, b, tx, ty, c[c.length - 1]);
      if (z.taille > espaceMax) {
        espaceMax = z.taille;
        secours = d;
      }
      if (!z.sortie && z.taille < seuilPoche) {
        if (dbg) dbg.scores[d.x + ',' + d.y] = 'poche ' + z.taille;
        continue;
      }
      // avantage (duel, super admin) : -1..1. Favorise = moins de bruit dans le choix (jeu plus juste),
      // defavorise = bruit supplementaire (jeu plus brouillon). Invisible : ni vitesse ni affichage.
      var av = Math.max(-1, Math.min(1, e.avantage || 0));
      var bruit = flair * 2 * (av > 0 ? 1 - 0.8 * av : 1) + (av < 0 ? -av * 0.8 : 0);
      var s =
        (d.x === e.dir.x && d.y === e.dir.y ? 0.5 : 0) +
        rangement * appui(e, b, tx, ty) +
        z.taille * 0.02 +
        Math.random() * bruit; // au-dessus du bonus tout droit (0,5) des 0,25 : deux serpents desaccordes
      // defense : chaque case d'eloignement de sa tete compte, et sa poche a moi prime
      if (posture === 'defense' && adv && adv.length)
        s += 0.12 * (Math.abs(adv[0].x - tx) + Math.abs(adv[0].y - ty)) + z.taille * 0.03;
      // attaque : se rapprocher de sa tete pour que l'usure ait prise (sans baie, l'usure loin de lui ne rend rien)
      if (posture === 'attaque' && adv && adv.length)
        s -= 0.1 * (Math.abs(adv[0].x - tx) + Math.abs(adv[0].y - ty));
      // Scène attirer (face à face, ballet, prédateur) : quand le path direct échoue, le jeu de
      // position reprend la main ; ici on pousse un bonus fort vers la tête adverse pour que les
      // serpents restent visiblement magnétiques au lieu de se ranger contre les murs.
      if (e.attirer && adv && adv.length)
        s -= 0.5 * (Math.abs(adv[0].x - tx) + Math.abs(adv[0].y - ty));
      // Scène encercler : optimum à distance 2 de la tête adverse (assez pour orbiter, trop près =
      // frontale, trop loin = pas de cercle). +1.5 sur la case idéale, dégressif en s'écartant.
      if (e.encercler && adv && adv.length) {
        var dh = Math.abs(adv[0].x - tx) + Math.abs(adv[0].y - ty);
        s += 1.5 - 0.8 * Math.abs(dh - 2);
      }
      // Scène repousser : bonus fort par case d'éloignement (largement au-dessus du bonus tout droit
      // de 0.5), les serpents visibles se cherchent activement à s'éviter.
      if (e.repousser && adv && adv.length)
        s += 0.6 * (Math.abs(adv[0].x - tx) + Math.abs(adv[0].y - ty));
      // Barrage (Abdel : « when two snakes are parallel and one is slightly ahead, cut the route of the
      // other »). En attaque, une case posee DEVANT sa tete (sur sa ligne de course, 1 a 3 cases) vaut
      // beaucoup : il devra tourner ou entrer dans mon corps. Le pas reste soumis aux memes controles
      // de poche, on ne se sacrifie pas pour barrer.
      if (posture === 'attaque' && adv && adv.length > 1 && !window.VIPERE_SANS_BARRAGE) {
        var adx = adv[0].x - adv[1].x,
          ady = adv[0].y - adv[1].y;
        for (var kb = 1; kb <= 3; kb++) {
          if (tx === adv[0].x + adx * kb && ty === adv[0].y + ady * kb) {
            s += 1.2 - 0.3 * kb;
            break;
          }
        }
      }
      if (dbg) dbg.scores[d.x + ',' + d.y] = s;
      if (s > scoreMax) {
        scoreMax = s;
        choix = d;
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
    var recours = null;
    if (!choix && !secours) {
      for (k = 0; k < 4; k++) {
        var dr = DIRS[k];
        if (dr.x === ar.x && dr.y === ar.y) continue;
        var rx = tete.x + dr.x,
          ry = tete.y + dr.y;
        if (rx < 0 || ry < 0 || rx >= e.cols || ry >= e.rows) continue;
        recours = dr;
        break;
      }
    }
    m.raison =
      m.attente > 0 ? 'attente' : liste.length ? 'position(baie sans route sure)' : 'position';
    return { d: choix || secours || recours || e.dir, piege: !choix && !secours };
  }

  // pasSur(etat, d) : le pas d reste-t-il sur ? Meme critere que les trajets vers une baie : case
  // libre (obstacles et couronne adverse compris), et apres le pas la tete voit encore sa queue.
  // Sert a base.js pour garder une direction deja annoncee (anti-tremblement tete contre tete).
  function pasSur(e, d) {
    var t = e.corps[0],
      tx = t.x + d.x,
      ty = t.y + d.y;
    if (tx < 0 || ty < 0 || tx >= e.cols || ty >= e.rows) return false;
    var ee = Object.assign({}, e, { obstacles: e.obstacles.concat(e.eviter || []) });
    if (bloc(ee, e.corps, true, queueLibre(e))[ty * e.cols + tx]) return false;
    var mange = false;
    for (var i = 0; i < e.fruits.length; i++)
      if (e.fruits[i].x === tx && e.fruits[i].y === ty) mange = true;
    var c = copie(e.corps);
    c.unshift({ x: tx, y: ty });
    if (!mange && queueLibre(e)) c.pop();
    return sur(ee, c);
  }

  window.VipereIA = { choisir: choisir, pasSur: pasSur };
})();
