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
  var PRICES = { rose: 1, tempo: 10, vol: 20, bouclier: 30, vie: 100 };
  var NAMES = {
    rose: ['rose', 'rosa'],
    tempo: ['rose 10', 'dyno'],
    vol: ['bouquet', 'perfume'],
    bouclier: ['bagel', 'capybara'],
    vie: ['teddy bear', 'hand heart'],
  };
  // pieces par minute et par equipe, au calme (la ferveur multiplie de 0,6 a 1,8)
  var RATES = [0, 30, 110, 320];
  var NICKNAMES = {
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
  var CAPS = { tempo: 5, vol: 3, bouclier: 1, vie: 1 }; // a « foule », un second bouclier est permis (voir acheter)
  var COOLDOWNS = { tempo: 8, vol: 14, bouclier: 35, vie: 60 };
  var abs = Math.abs;

  function readState(B) {
    var d = B.duel(),
      it = B.interne(),
      m = B.manche && B.manche();
    if (!d || !d.or || !d.ombre) return null;
    var makeTeamState = function (c, k) {
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
      or: makeTeamState(d.or, 0),
      ombre: makeTeamState(d.ombre, 1),
      baies: it.baies.map(function (b) {
        return { x: b.x, y: b.y };
      }),
    };
  }

  function create() {
    var density = 0,
      history = [];
    var teams = {};
    ['or', 'ombre'].forEach(function (c) {
      teams[c] = {
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
    var prevTime = 0;
    // Rythme naturel : deux spectateurs n'envoient jamais un cadeau au meme instant. Apres chaque cadeau,
    // un court silence tire au sort (toutes equipes confondues) avant le suivant.
    var horloge = 0,
      libre = 0;
    function configure(i) {
      density = i;
      if (!i)
        ['or', 'ombre'].forEach(function (c) {
          teams[c].bourse = 0;
          teams[c].ferveur = 0.25;
        });
    }
    function record(team, quoi, pourquoi) {
      history.unshift((team === 'or' ? 'Or' : 'Ombre') + ' : ' + quoi + ' (' + pourquoi + ')');
      if (history.length > 6) history.pop();
    }

    function tick(e, dt) {
      var ev = [];
      if (!density || !e || !e.enCours) {
        ['or', 'ombre'].forEach(function (c) {
          teams[c].avantL = null;
        });
        return ev;
      }
      var remaining = e.duree - e.t,
        bigGiftSent = { or: false, ombre: false };
      if (e.t < prevTime)
        ['or', 'ombre'].forEach(function (c) {
          teams[c].compte = { tempo: 0, vol: 0, bouclier: 0, vie: 0, rose: 0 };
          teams[c].avantL = null;
        }); // nouvelle manche
      prevTime = e.t;
      horloge += dt;
      // l'ordre de passage des deux equipes est tire au sort a chaque tour : aucune ne parle toujours la premiere
      (Math.random() < 0.5 ? ['or', 'ombre'] : ['ombre', 'or']).forEach(function (team) {
        var Q = teams[team],
          mine = e[team],
          opponent = e[team === 'or' ? 'ombre' : 'or'],
          idx = team === 'or' ? 0 : 1;
        var buy = function (quoi, pourquoi, urgence) {
          if (horloge < libre || Q.bourse < PRICES[quoi]) return false;
          var cap =
            (CAPS[quoi] || 0) + (quoi === 'bouclier' && density >= 3 ? 1 : 0) + (urgence ? 2 : 0);
          if (CAPS[quoi] && (Q.compte[quoi] >= cap || (!urgence && Q.recharge[quoi] > 0)))
            return false;
          libre =
            horloge + (quoi === 'rose' ? 0.35 + Math.random() * 0.5 : 0.9 + Math.random() * 1.3);
          Q.compte[quoi]++;
          if (COOLDOWNS[quoi]) Q.recharge[quoi] = COOLDOWNS[quoi];
          Q.bourse -= PRICES[quoi];
          Q.depense += PRICES[quoi];
          Q.dernier = quoi;
          var nickname = NICKNAMES[team][Math.floor(Math.random() * NICKNAMES[team].length)];
          ev.push({
            type: 'cadeau',
            n: 1,
            valeur: PRICES[quoi],
            nom: NAMES[quoi][idx],
            camp: team,
            pseudo: nickname,
          });
          if (quoi !== 'rose') {
            record(team, quoi, pourquoi);
            if (PRICES[quoi] >= 20) bigGiftSent[team] = true;
          }
          return true;
        };
        // ferveur : retombe vers 0,25, monte sur coup encaisse, sur retard, et en fin de manche
        Q.ferveur += (0.25 - Q.ferveur) * Math.min(1, dt / 9);
        if (Q.avantL !== null && mine.L <= Q.avantL - 2) {
          Q.ferveur = Math.min(1, Q.ferveur + 0.45);
          Q.coup = 2.5;
        }
        if (opponent.L - mine.L >= 3) Q.ferveur = Math.min(1, Q.ferveur + 0.05 * dt);
        if (remaining <= 20) Q.ferveur = Math.max(Q.ferveur, 0.8);
        Q.coup = Math.max(0, (Q.coup || 0) - dt);
        Q.bourse = Math.min(140, Q.bourse + (RATES[density] / 60) * (0.6 + 1.2 * Q.ferveur) * dt);
        for (var r in Q.recharge) Q.recharge[r] = Math.max(0, Q.recharge[r] - dt);
        if (!mine.tete || !opponent.tete) {
          Q.avantL = mine.L;
          return;
        }
        var headDist = abs(mine.tete.x - opponent.tete.x) + abs(mine.tete.y - opponent.tete.y);
        var reflex = Math.random() < dt * 2.2; // des humains : ils reagissent en une demi-seconde, pas a la milliseconde

        // 0. L'anneau plein (Abdel : « a team can, during the 5 second countdown, gift something that blocks
        //    it from winning »). Si l'adversaire TIENT l'anneau, l'equipe casse sa tenue par un vol, en
        //    urgence (hors recharge, deux vols de plus que le plafond). S'il est sous bouclier, rien a faire.
        //    Et l'equipe dont le serpent tient l'anneau le protege d'un bouclier si elle en a encore un.
        if (
          opponent.tenue > 0 &&
          opponent.bouclierT <= 0 &&
          Math.random() < dt * 4 &&
          buy('vol', "il tient l'anneau depuis " + opponent.tenue.toFixed(1) + ' s', true)
        ) {
        } else if (
          mine.tenue > 0 &&
          mine.bouclierT <= 0 &&
          Math.random() < dt * 4 &&
          buy('bouclier', "proteger la tenue de l'anneau")
        ) {
        }
        // 1. vie : juste apres un gros coup, si la bourse suit
        else if (
          reflex &&
          Q.coup > 0 &&
          mine.vies === 0 &&
          !Q.recharge.vie &&
          opponent.L - mine.L >= 3 &&
          buy('vie', 'gros coup et retard de ' + (opponent.L - mine.L))
        ) {
        }
        // 2. bouclier : tete adverse tout pres, ou serpent en sursis
        else if (
          reflex &&
          mine.bouclierT <= 0.5 &&
          !Q.recharge.bouclier &&
          (headDist <= 3 || mine.L < 5 || Q.coup > 0) &&
          buy(
            'bouclier',
            headDist <= 3
              ? 'tete adverse a ' + headDist + ' cases'
              : mine.L < 5
                ? 'serpent en sursis'
                : 'il vient de prendre un coup',
          )
        ) {
        }
        // 3. vol : jamais dans un bouclier ; quand l'adversaire est long, ou pour renverser la fin de manche
        else if (
          reflex &&
          opponent.bouclierT <= 0 &&
          opponent.invincT <= 0 &&
          !Q.recharge.vol &&
          ((opponent.L >= 10 && opponent.L >= mine.L) ||
            (remaining <= 20 && opponent.L >= mine.L && opponent.L - mine.L <= 4)) &&
          buy(
            'vol',
            remaining <= 20
              ? 'fin de manche, ecart de ' + (opponent.L - mine.L)
              : 'adversaire long (' + opponent.L + ')',
          )
        ) {
        }
        // 4. tempo : une baie que les deux peuvent atteindre, la course se joue
        else if (reflex && mine.surgeT <= 1 && !Q.recharge.tempo) {
          for (var b = 0; b < e.baies.length; b++) {
            var dm = abs(e.baies[b].x - mine.tete.x) + abs(e.baies[b].y - mine.tete.y),
              dl = abs(e.baies[b].x - opponent.tete.x) + abs(e.baies[b].y - opponent.tete.y);
            if (dm <= 12 && dm >= 3 && dm <= dl + 2 && dl <= dm + 5) {
              if (buy('tempo', 'course a la baie, ' + dm + ' contre ' + dl + ' cases')) {
              }
              break;
            }
          }
        }
        // 5. roses : nourrir son serpent, surtout quand le plateau est vide ou qu'il est en retard ; on garde une reserve
        Q.rose -= dt;
        var reserve = remaining <= 20 ? 0 : 22;
        if (Q.rose <= 0 && Q.bourse > reserve + 1 && e.baies.length < 5) {
          if (buy('rose', ''))
            Q.rose =
              (e.baies.length < 2 || opponent.L > mine.L ? 0.9 : 2.2) * (0.6 + Math.random() * 0.8);
        }
        Q.avantL = mine.L;
      });
      // un gros cadeau d'une equipe fait monter l'autre : elle repond
      if (bigGiftSent.or) teams.ombre.ferveur = Math.min(1, teams.ombre.ferveur + 0.25);
      if (bigGiftSent.ombre) teams.or.ferveur = Math.min(1, teams.or.ferveur + 0.25);
      return ev;
    }
    function view() {
      return {
        densite: density,
        journal: history.slice(),
        comptes: { or: teams.or.compte, ombre: teams.ombre.compte },
        or: {
          ferveur: teams.or.ferveur,
          bourse: teams.or.bourse,
          depense: teams.or.depense,
          dernier: teams.or.dernier,
        },
        ombre: {
          ferveur: teams.ombre.ferveur,
          bourse: teams.ombre.bourse,
          depense: teams.ombre.depense,
          dernier: teams.ombre.dernier,
        },
      };
    }
    return { regler: configure, tick: tick, vue: view };
  }
  window.VipereFoule = { lireEtat: readState, creer: create, PRIX: PRICES };
})();
