// Super IA Vipere (duel) : recherche adverse comme aux echecs. A chaque decision, elle simule ses
// coups ET les reponses de l'adversaire plusieurs pas a l'avance (minimax alpha-beta, coups
// simultanes, approfondissement iteratif sous budget de temps), et juge chaque position par le
// TERRITOIRE (cases qu'elle atteint avant lui, Voronoi), la longueur gagnee, les baies qu'elle
// tient, et l'enfermement. Methode des IA de tournoi Tron / Battlesnake.
// Interface identique a ia-humain.js : window.VipereSuperIA.choisir(etat) rend {x,y}.
// Regles du duel qu'elle connait : la longueur est le score ; une collision provoquee par
// l'adversaire coute la MOITIE des anneaux ; la case de queue se libere au pas suivant.
(function () {
  'use strict';
  var DX = [0, 1, 0, -1],
    DY = [-1, 0, 1, 0];
  var W_TERR = 25,
    W_BAIE = 75,
    W_PROCHE = 66,
    W_PART = 25,
    W_ENFERME = 120,
    W_ENFERME_MOI = 160;
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
  var pile = new Int32Array(4 * 128),
    sp = 0;
  var advOn = false,
    advInvincible = false,
    dbgOn = false;
  var limite = 0,
    noeuds = 0,
    arret = false,
    biais = [0, 0, 0, 0],
    marge = 0.5;
  var lig = [],
    ligRet = null,
    rootScores = [0, 0, 0, 0],
    rootBest = -1;
  var T1r = 0,
    T2r = 0;
  var maintenant =
    typeof performance !== 'undefined' && performance.now
      ? function () {
          return performance.now();
        }
      : function () {
          return Date.now();
        };

  function preparer(c, r) {
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
  function bloque(c, t) {
    var o = owner[c];
    return o === 3 || (o !== 0 && freeAt[c] + g[o] > t);
  }
  function poser(s, c, t) {
    pile[sp++] = c;
    pile[sp++] = owner[c];
    pile[sp++] = freeAt[c];
    pile[sp++] = fruit[c];
    owner[c] = s;
    freeAt[c] = t + L0[s] + (s === 2 ? 1 : 0); // lui : une case de marge (ordre des pas, bouchee)
    if (fruit[c]) {
      fruit[c] = 0;
      g[s]++;
    }
  }
  function defaire() {
    var f = pile[--sp],
      pf = pile[--sp],
      po = pile[--sp],
      c = pile[--sp];
    if (f) {
      fruit[c] = 1;
      g[owner[c]]--;
    }
    owner[c] = po;
    freeAt[c] = pf;
  }

  // Territoire de Voronoi a partir des deux tetes, en tenant compte des corps qui se retirent :
  // une case est franchissable si elle sera libre au moment ou on y arrive.
  function evalue(h1, h2, t) {
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
        // la longueur est le score : la baie la plus proche que je tiens tire fort (pente 1,5 par
        // pas), les suivantes un peu ; manger (W_BAIE) vaut toujours plus qu'approcher (W_PROCHE)
        if (l === 1) {
          T1++;
          if (fruit[n]) {
            F1 += n1++ ? 12 / (d + 1) : Math.max(3, W_PROCHE - 3 * d);
          }
        } else if (l === 2) {
          T2++;
          if (fruit[n]) {
            F2 += n2++ ? 12 / (d + 1) : Math.max(3, W_PROCHE - 3 * d);
          }
        }
      }
    }
    T1r = T1;
    T2r = T2;
    var len1 = L0[1] + g[1],
      v =
        W_TERR * (Math.log(T1 + 5) - (h2 >= 0 ? Math.log(T2 + 5) : 0)) +
        W_BAIE * (g[1] - g0[1] - (g[2] - g0[2])) +
        F1 -
        F2;
    // les baies naissent au hasard : la part de plateau que je tiens est ma chance d'etre le plus
    // proche de la PROCHAINE baie. C'est ce qui fait gagner la course a la longueur sur la duree.
    if (h2 >= 0) v += W_PART * (T1 / (T1 + T2 + 1) - 0.5);
    if (h2 >= 0) {
      var len2 = L0[2] + g[2];
      if (T2 < len2) v += W_ENFERME * (1 - T2 / len2);
    }
    if (T1 < len1) v -= W_ENFERME_MOI * (1 - T1 / len1);
    return v;
  }

  function cout(s) {
    return 12.5 * (L0[s] + g[s]) + 60;
  } // une collision = la moitie des anneaux

  function maxN(h1, h2, k1, k2, t, prof, alpha, beta, ply) {
    if ((++noeuds & 63) === 0 && maintenant() > limite) {
      arret = true;
      return 0;
    }
    var best = -1e9,
      x = h1 % cols,
      y = (h1 - x) / cols;
    for (var i = 0; i < 3 + (k1 < 0 ? 1 : 0); i++) {
      // a la racine : le meilleur coup de l'iteration d'avant passe en premier (ordreRacine)
      var k =
        ply === 0
          ? ordreRacine[i]
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
      var crash1 = c1 < 0 || bloque(c1, t);
      var v = minN(h2, c1, crash1, k, k2, t, prof, ply === 0 ? alpha - marge : alpha, beta, ply);
      if (arret) return 0;
      if (ply === 0) {
        v += biais[k];
        rootScores[k] = v;
      }
      if (v > best) {
        best = v;
        pv1[ply] = k;
        if (dbgOn) lig[ply] = ligRet;
        if (ply === 0) rootBestCourant = k;
      }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }
  var rootBestCourant = -1,
    ordreRacine = [0, 1, 2, 3],
    pv1 = new Int8Array(32).fill(-1),
    pv2 = new Int8Array(32).fill(-1);

  function minN(h2, c1, crash1, k1n, k2, t, prof, alpha, beta, ply) {
    var v;
    if (!advOn) {
      if (crash1) {
        if (dbgOn) ligRet = [];
        return -cout(1) + t;
      }
      poser(1, c1, t);
      v =
        prof <= 1
          ? evalue(c1, -1, t)
          : maxN(c1, -1, k1n, -1, t + 1, prof - 1, alpha, beta, ply + 1);
      defaire();
      if (dbgOn) ligRet = [c1, -1].concat(prof > 1 && lig[ply + 1] ? lig[ply + 1] : []);
      return v;
    }
    var worst = 1e9,
      x = h2 % cols,
      y = (h2 - x) / cols,
      ligne = null;
    // hors de portee dans l'horizon restant : ses coups ne peuvent pas m'atteindre, on ne deroule
    // que son premier coup legal (tout droit d'abord). La recherche va deux fois plus profond.
    var loin =
      c1 >= 0 && Math.abs((c1 % cols) - x) + Math.abs((c1 - (c1 % cols)) / cols - y) > 2 * prof + 1;
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
      var crash2 = c2 < 0 || bloque(c2, t),
        c1x = crash1;
      if (!c1x && !crash2 && c1 === c2) {
        c1x = true;
        crash2 = true;
      } // frontale : les deux paient
      if (c1x || crash2) {
        v = (c1x ? -cout(1) + t : 0) + (crash2 && !advInvincible ? cout(2) - t : 0);
      } else {
        poser(1, c1, t);
        poser(2, c2, t);
        v =
          prof <= 1
            ? evalue(c1, c2, t)
            : maxN(c1, c2, k1n, k, t + 1, prof - 1, alpha, beta, ply + 1);
        defaire();
        defaire();
        if (arret) return 0;
      }
      if (v < worst) {
        worst = v;
        pv2[ply] = k;
        if (dbgOn)
          ligne = [c1, c2].concat(!c1x && !crash2 && prof > 1 && lig[ply + 1] ? lig[ply + 1] : []);
      }
      if (worst < beta) beta = worst;
      if (alpha >= beta) break;
      if (loin && !crash2) break;
    }
    if (dbgOn) ligRet = ligne || [];
    return worst;
  }

  function indexDir(dx, dy) {
    for (var k = 0; k < 4; k++) if (DX[k] === dx && DY[k] === dy) return k;
    return -1;
  }

  function choisir(e) {
    preparer(e.cols, e.rows);
    var me = e.corps,
      adv = e.adversaire && e.adversaire.length ? e.adversaire : null,
      i,
      c,
      m = e.memoire || {};
    owner.fill(0);
    freeAt.fill(0);
    fruit.fill(0);
    sp = 0;
    for (i = 0; i < e.obstacles.length; i++) owner[e.obstacles[i].y * cols + e.obstacles[i].x] = 3;
    advOn = !!adv;
    advInvincible = !!e.adversaireInvincible;
    dbgOn = !!e.debug;
    L0[1] = me.length;
    g[1] = e.aGrandir > 0 ? e.aGrandir : 0;
    L0[2] = adv ? adv.length : 0;
    g[2] = 0;
    if (adv)
      for (i = adv.length - 1; i >= 0; i--) {
        c = adv[i].y * cols + adv[i].x;
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
      h2 = adv ? adv[0].y * cols + adv[0].x : -1;
    var k1 = me[1] ? indexDir(me[0].x - me[1].x, me[0].y - me[1].y) : -1;
    if (k1 < 0) k1 = indexDir(e.dir.x, e.dir.y);
    var k2 = adv && adv[1] ? indexDir(adv[0].x - adv[1].x, adv[0].y - adv[1].y) : -1;
    // hasard minuscule pour que deux Super IA ne jouent pas en miroir, et preference pour la
    // direction deja annoncee a l'ecran (anti-tremblement) tant qu'elle ne coute presque rien
    for (i = 0; i < 4; i++) biais[i] = Math.random() * 0.15;
    marge = 0.5;
    if (e.prefere) {
      var kp = indexDir(e.prefere.x, e.prefere.y);
      if (kp >= 0) {
        biais[kp] += 3;
        marge = 3.5;
      }
    }

    var budget = (typeof window !== 'undefined' && window.VIPERE_SUPER_MS) || 5;
    pv1.fill(-1);
    pv2.fill(-1);
    limite = maintenant() + budget;
    noeuds = 0;
    arret = false;
    rootBest = -1;
    var choix = -1,
      profAtteinte = 0,
      valeur = 0,
      scores = [0, 0, 0, 0],
      ligne = null;
    for (var prof = 1; prof <= 14; prof++) {
      rootBestCourant = -1;
      lig.length = 0;
      ordreRacine = k1 < 0 ? [0, 1, 2, 3] : [k1, (k1 + 3) & 3, (k1 + 1) & 3];
      if (rootBest >= 0 && ordreRacine.indexOf(rootBest) > 0) {
        ordreRacine.splice(ordreRacine.indexOf(rootBest), 1);
        ordreRacine.unshift(rootBest);
      }
      var v = maxN(h1, h2, k1, k2, 1, prof, -1e9, 1e9, 0);
      if (arret) break;
      choix = rootBestCourant;
      rootBest = choix;
      profAtteinte = prof;
      valeur = v;
      for (i = 0; i < 4; i++) scores[i] = rootScores[i];
      if (dbgOn) ligne = lig[0] ? lig[0].slice() : null;
      if (v < -1e8 || maintenant() > limite) break;
    }
    while (sp > 0) defaire();
    // aucune profondeur finie ou tout percute : le pas qui laisse le plus d'espace, jamais hors grille
    if (choix < 0 || scores[choix] < -cout(1) + 20) {
      var mieux = -1,
        mieuxT = -1;
      for (i = 0; i < 4; i++) {
        if (k1 >= 0 && i === ((k1 + 2) & 3)) continue;
        var nx = me[0].x + DX[i],
          ny = me[0].y + DY[i];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        c = ny * cols + nx;
        var T = -0.5;
        if (!bloque(c, 1)) {
          poser(1, c, 1);
          evalue(c, h2, 1);
          T = T1r;
          defaire();
        }
        if (T > mieuxT) {
          mieuxT = T;
          mieux = i;
        }
      }
      if (choix < 0 || (mieux >= 0 && mieuxT > 0 && scores[choix] < -cout(1) + 20))
        choix = mieux >= 0 ? mieux : choix;
    }
    evalue(h1, h2, 0);
    m.postureActive = valeur > 25 ? 'attaque' : valeur < -25 ? 'defense' : 'neutre';
    m.raison = 'super p' + profAtteinte;
    if (dbgOn) {
      var dbg = (m.debug = {
        scores: {},
        route: [],
        cible: null,
        piege: T2r,
        poche: T1r,
        posture: m.postureActive,
        raison: m.raison,
        choix: choix >= 0 ? { x: DX[choix], y: DY[choix] } : null,
        superIA: {
          valeur: valeur,
          prof: profAtteinte,
          noeuds: noeuds,
          terrMoi: T1r,
          terrLui: T2r,
          adv: [],
          vor: Array.prototype.slice.call(lab),
        },
      });
      for (i = 0; i < 4; i++)
        if (!(k1 >= 0 && i === ((k1 + 2) & 3)))
          dbg.scores[DX[i] + ',' + DY[i]] = scores[i] < -cout(1) + 20 ? 'refuse' : scores[i];
      if (ligne)
        for (i = 0; i + 1 < ligne.length; i += 2) {
          if (ligne[i] >= 0)
            dbg.route.push({ x: ligne[i] % cols, y: (ligne[i] - (ligne[i] % cols)) / cols });
          if (ligne[i + 1] >= 0)
            dbg.superIA.adv.push({
              x: ligne[i + 1] % cols,
              y: (ligne[i + 1] - (ligne[i + 1] % cols)) / cols,
            });
        }
    }
    return choix >= 0 ? { x: DX[choix], y: DY[choix] } : e.dir;
  }

  window.VipereSuperIA = { choisir: choisir };
})();
