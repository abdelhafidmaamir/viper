// Public simule « bataille d'equipes » (regie duel). Deux equipes de faux spectateurs, Or et Ombre,
// REGARDENT la partie et depensent leurs pieces comme de vrais fans qui se battent pour leur serpent :
// bouclier quand il est menace, tempo quand il fait la course vers une baie, vol quand l'adversaire
// est long ou quand la fin de manche se joue a peu, vie apres un gros coup, roses pour le nourrir.
// Chaque equipe a une FERVEUR qui monte (coup encaisse, gros cadeau d'en face, retard, fin de manche)
// et retombe ; elle regle le debit de pieces. Memes regles et meme budget pour les deux equipes : les
// decisions dependent de l'etat du jeu, jamais du camp.
// Interface : VipereFoule.lireEtat(B) -> etat ; VipereFoule.creer() -> {regler(densite), tick(etat,dt) -> [evenements], vue()}
(function () {
  'use strict';
  var PRIX = { rose: 1, tempo: 10, vol: 20, bouclier: 30, vie: 100 };
  var NOMS = {
    rose: ['rose', 'rosa'],
    tempo: ['rose 10', 'dyno'],
    vol: ['bouquet', 'perfume'],
    bouclier: ['bagel', 'capybara'],
    vie: ['teddy bear', 'hand heart'],
  };
  // pieces par minute et par equipe, au calme (la ferveur multiplie de 0,6 a 1,8)
  var DEBITS = [0, 30, 110, 320];
  var PSEUDOS = {
    or: [
      'lea_gold',
      'karim.or',
      'soleil92',
      'mimi_dore',
      'sacha_or',
      'yuna.sun',
      'tom_gold',
      'aya_or',
    ],
    ombre: [
      'nox',
      'lucas.shadow',
      'ines_ombre',
      'pablo.nuit',
      'zoe_moon',
      'rayan.dark',
      'emma_ombre',
      'kenji.night',
    ],
  };
  // Abdel : « they can give shields and lives but not in abundance, the gameplay needs to stay
  // interesting ». Plafonds PAR MANCHE et par equipe, et longues recharges : un bouclier ou une vie
  // doit rester un evenement, pas un etat permanent.
  var PLAFOND = { tempo: 5, vol: 3, bouclier: 1, vie: 1 }; // a « foule », un second bouclier est permis (voir acheter)
  var RECHARGE = { tempo: 8, vol: 14, bouclier: 35, vie: 60 };
  var abs = Math.abs;

  function lireEtat(B) {
    var d = B.duel(),
      it = B.interne(),
      m = B.manche && B.manche();
    if (!d || !d.or || !d.ombre) return null;
    var un = function (c, k) {
      return {
        L: c.longueur,
        tete: it.corps[k] ? it.corps[k].tete : null,
        bouclierT: c.bouclierT || 0,
        tenue: c.tenue || 0,
        vies: c.vies || 0,
        surgeT: c.surgeT || 0,
        invincT: c.invincT || 0,
      };
    };
    return {
      t: d.t || 0,
      duree: B.reglages.dureeDuel || 120,
      enCours: !!(m && m.etat === 'en cours'),
      or: un(d.or, 0),
      ombre: un(d.ombre, 1),
      baies: it.baies.map(function (b) {
        return { x: b.x, y: b.y };
      }),
    };
  }

  function creer() {
    var densite = 0,
      journal = [];
    var eq = {};
    ['or', 'ombre'].forEach(function (c) {
      eq[c] = {
        camp: c,
        ferveur: 0.25,
        bourse: 0,
        depense: 0,
        dernier: '',
        recharge: { tempo: 0, vol: 0, bouclier: 0, vie: 0 },
        compte: { tempo: 0, vol: 0, bouclier: 0, vie: 0, rose: 0 },
        avantL: null,
        rose: 0,
      };
    });
    var avantT = 0;
    // Rythme naturel : deux spectateurs n'envoient jamais un cadeau au meme instant. Apres chaque cadeau,
    // un court silence tire au sort (toutes equipes confondues) avant le suivant.
    var horloge = 0,
      libre = 0;
    function regler(i) {
      densite = i;
      if (!i)
        ['or', 'ombre'].forEach(function (c) {
          eq[c].bourse = 0;
          eq[c].ferveur = 0.25;
        });
    }
    function noter(camp, quoi, pourquoi) {
      journal.unshift((camp === 'or' ? 'Or' : 'Ombre') + ' : ' + quoi + ' (' + pourquoi + ')');
      if (journal.length > 6) journal.pop();
    }

    function tick(e, dt) {
      var ev = [];
      if (!densite || !e || !e.enCours) {
        ['or', 'ombre'].forEach(function (c) {
          eq[c].avantL = null;
        });
        return ev;
      }
      var reste = e.duree - e.t,
        gros = { or: false, ombre: false };
      if (e.t < avantT)
        ['or', 'ombre'].forEach(function (c) {
          eq[c].compte = { tempo: 0, vol: 0, bouclier: 0, vie: 0, rose: 0 };
          eq[c].avantL = null;
        }); // nouvelle manche
      avantT = e.t;
      horloge += dt;
      // l'ordre de passage des deux equipes est tire au sort a chaque tour : aucune ne parle toujours la premiere
      (Math.random() < 0.5 ? ['or', 'ombre'] : ['ombre', 'or']).forEach(function (camp) {
        var Q = eq[camp],
          moi = e[camp],
          lui = e[camp === 'or' ? 'ombre' : 'or'],
          idx = camp === 'or' ? 0 : 1;
        var acheter = function (quoi, pourquoi, urgence) {
          if (horloge < libre || Q.bourse < PRIX[quoi]) return false;
          var plafond =
            (PLAFOND[quoi] || 0) +
            (quoi === 'bouclier' && densite >= 3 ? 1 : 0) +
            (urgence ? 2 : 0);
          if (PLAFOND[quoi] && (Q.compte[quoi] >= plafond || (!urgence && Q.recharge[quoi] > 0)))
            return false;
          libre =
            horloge + (quoi === 'rose' ? 0.35 + Math.random() * 0.5 : 0.9 + Math.random() * 1.3);
          Q.compte[quoi]++;
          if (RECHARGE[quoi]) Q.recharge[quoi] = RECHARGE[quoi];
          Q.bourse -= PRIX[quoi];
          Q.depense += PRIX[quoi];
          Q.dernier = quoi;
          var ps = PSEUDOS[camp][Math.floor(Math.random() * PSEUDOS[camp].length)];
          ev.push({
            type: 'cadeau',
            n: 1,
            valeur: PRIX[quoi],
            nom: NOMS[quoi][idx],
            camp: camp,
            pseudo: ps,
          });
          if (quoi !== 'rose') {
            noter(camp, quoi, pourquoi);
            if (PRIX[quoi] >= 20) gros[camp] = true;
          }
          return true;
        };
        // ferveur : retombe vers 0,25, monte sur coup encaisse, sur retard, et en fin de manche
        Q.ferveur += (0.25 - Q.ferveur) * Math.min(1, dt / 9);
        if (Q.avantL !== null && moi.L <= Q.avantL - 2) {
          Q.ferveur = Math.min(1, Q.ferveur + 0.45);
          Q.coup = 2.5;
        }
        if (lui.L - moi.L >= 3) Q.ferveur = Math.min(1, Q.ferveur + 0.05 * dt);
        if (reste <= 20) Q.ferveur = Math.max(Q.ferveur, 0.8);
        Q.coup = Math.max(0, (Q.coup || 0) - dt);
        Q.bourse = Math.min(140, Q.bourse + (DEBITS[densite] / 60) * (0.6 + 1.2 * Q.ferveur) * dt);
        for (var r in Q.recharge) Q.recharge[r] = Math.max(0, Q.recharge[r] - dt);
        if (!moi.tete || !lui.tete) {
          Q.avantL = moi.L;
          return;
        }
        var dTetes = abs(moi.tete.x - lui.tete.x) + abs(moi.tete.y - lui.tete.y);
        var reflexe = Math.random() < dt * 2.2; // des humains : ils reagissent en une demi-seconde, pas a la milliseconde

        // 0. L'anneau plein (Abdel : « a team can, during the 5 second countdown, gift something that blocks
        //    it from winning »). Si l'adversaire TIENT l'anneau, l'equipe casse sa tenue par un vol, en
        //    urgence (hors recharge, deux vols de plus que le plafond). S'il est sous bouclier, rien a faire.
        //    Et l'equipe dont le serpent tient l'anneau le protege d'un bouclier si elle en a encore un.
        if (
          lui.tenue > 0 &&
          lui.bouclierT <= 0 &&
          Math.random() < dt * 4 &&
          acheter('vol', "il tient l'anneau depuis " + lui.tenue.toFixed(1) + ' s', true)
        ) {
        } else if (
          moi.tenue > 0 &&
          moi.bouclierT <= 0 &&
          Math.random() < dt * 4 &&
          acheter('bouclier', "proteger la tenue de l'anneau")
        ) {
        }
        // 1. vie : juste apres un gros coup, si la bourse suit
        else if (
          reflexe &&
          Q.coup > 0 &&
          moi.vies === 0 &&
          !Q.recharge.vie &&
          lui.L - moi.L >= 3 &&
          acheter('vie', 'gros coup et retard de ' + (lui.L - moi.L))
        ) {
        }
        // 2. bouclier : tete adverse tout pres, ou serpent en sursis
        else if (
          reflexe &&
          moi.bouclierT <= 0.5 &&
          !Q.recharge.bouclier &&
          (dTetes <= 3 || moi.L < 5 || Q.coup > 0) &&
          acheter(
            'bouclier',
            dTetes <= 3
              ? 'tete adverse a ' + dTetes + ' cases'
              : moi.L < 5
                ? 'serpent en sursis'
                : 'il vient de prendre un coup',
          )
        ) {
        }
        // 3. vol : jamais dans un bouclier ; quand l'adversaire est long, ou pour renverser la fin de manche
        else if (
          reflexe &&
          lui.bouclierT <= 0 &&
          lui.invincT <= 0 &&
          !Q.recharge.vol &&
          ((lui.L >= 10 && lui.L >= moi.L) ||
            (reste <= 20 && lui.L >= moi.L && lui.L - moi.L <= 4)) &&
          acheter(
            'vol',
            reste <= 20
              ? 'fin de manche, ecart de ' + (lui.L - moi.L)
              : 'adversaire long (' + lui.L + ')',
          )
        ) {
        }
        // 4. tempo : une baie que les deux peuvent atteindre, la course se joue
        else if (reflexe && moi.surgeT <= 1 && !Q.recharge.tempo) {
          for (var b = 0; b < e.baies.length; b++) {
            var dm = abs(e.baies[b].x - moi.tete.x) + abs(e.baies[b].y - moi.tete.y),
              dl = abs(e.baies[b].x - lui.tete.x) + abs(e.baies[b].y - lui.tete.y);
            if (dm <= 12 && dm >= 3 && dm <= dl + 2 && dl <= dm + 5) {
              if (acheter('tempo', 'course a la baie, ' + dm + ' contre ' + dl + ' cases')) {
              }
              break;
            }
          }
        }
        // 5. roses : nourrir son serpent, surtout quand le plateau est vide ou qu'il est en retard ; on garde une reserve
        Q.rose -= dt;
        var reserve = reste <= 20 ? 0 : 22;
        if (Q.rose <= 0 && Q.bourse > reserve + 1 && e.baies.length < 5) {
          if (acheter('rose', ''))
            Q.rose =
              (e.baies.length < 2 || lui.L > moi.L ? 0.9 : 2.2) * (0.6 + Math.random() * 0.8);
        }
        Q.avantL = moi.L;
      });
      // un gros cadeau d'une equipe fait monter l'autre : elle repond
      if (gros.or) eq.ombre.ferveur = Math.min(1, eq.ombre.ferveur + 0.25);
      if (gros.ombre) eq.or.ferveur = Math.min(1, eq.or.ferveur + 0.25);
      return ev;
    }
    function vue() {
      return {
        densite: densite,
        journal: journal.slice(),
        comptes: { or: eq.or.compte, ombre: eq.ombre.compte },
        or: {
          ferveur: eq.or.ferveur,
          bourse: eq.or.bourse,
          depense: eq.or.depense,
          dernier: eq.or.dernier,
        },
        ombre: {
          ferveur: eq.ombre.ferveur,
          bourse: eq.ombre.bourse,
          depense: eq.ombre.depense,
          dernier: eq.ombre.dernier,
        },
      };
    }
    return { regler: regler, tick: tick, vue: vue };
  }
  window.VipereFoule = { lireEtat: lireEtat, creer: creer, PRIX: PRIX };
})();
