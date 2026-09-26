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
  var PRICES = { rose: 1, boost: 10, steal: 20, shield: 30, life: 100 };
  var NAMES = {
    rose: ['rose', 'rosa'],
    boost: ['rose 10', 'dyno'],
    steal: ['bouquet', 'perfume'],
    shield: ['bagel', 'capybara'],
    life: ['teddy bear', 'hand heart'],
  };
  // pieces par minute et par equipe, au calme (la ferveur multiplie de 0,6 a 1,8)
  var RATES = [0, 30, 110, 320];
  var NICKNAMES = {
    gold: [
      'lea_gold',
      'karim.or',
      'soleil92',
      'mimi_dore',
      'sacha_or',
      'yuna.sun',
      'tom_gold',
      'aya_or',
    ],
    shadow: [
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
  var CAPS = { boost: 5, steal: 3, shield: 1, life: 1 }; // a « foule », un second bouclier est permis (voir acheter)
  var COOLDOWNS = { boost: 8, steal: 14, shield: 35, life: 60 };
  var abs = Math.abs;

  function readState(B) {
    var d = B.duel(),
      it = B.internal(),
      m = B.round && B.round();
    if (!d || !d.gold || !d.shadow) return null;
    var makeTeamState = function (c, k) {
      return {
        L: c.length,
        head: it.body[k] ? it.body[k].head : null,
        shieldTime: c.shieldTime || 0,
        hold: c.hold || 0,
        lives: c.lives || 0,
        boostTime: c.boostTime || 0,
        invincibleTime: c.invincibleTime || 0,
      };
    };
    return {
      t: d.t || 0,
      duration: B.settings.duelDuration || 120,
      inProgress: !!(m && m.state === 'playing'),
      gold: makeTeamState(d.gold, 0),
      shadow: makeTeamState(d.shadow, 1),
      berries: it.berries.map(function (b) {
        return { x: b.x, y: b.y };
      }),
    };
  }

  function create() {
    var density = 0,
      history = [];
    var teams = {};
    ['gold', 'shadow'].forEach(function (c) {
      teams[c] = {
        team: c,
        fervor: 0.25,
        purse: 0,
        spend: 0,
        last: '',
        cooldown: { boost: 0, steal: 0, shield: 0, life: 0 },
        count: { boost: 0, steal: 0, shield: 0, life: 0, rose: 0 },
        lengthBefore: null,
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
        ['gold', 'shadow'].forEach(function (c) {
          teams[c].purse = 0;
          teams[c].fervor = 0.25;
        });
    }
    function record(team, what, why) {
      history.unshift((team === 'gold' ? 'Or' : 'Ombre') + ' : ' + what + ' (' + why + ')');
      if (history.length > 6) history.pop();
    }

    function tick(e, dt) {
      var ev = [];
      if (!density || !e || !e.inProgress) {
        ['gold', 'shadow'].forEach(function (c) {
          teams[c].lengthBefore = null;
        });
        return ev;
      }
      var remaining = e.duration - e.t,
        bigGiftSent = { gold: false, shadow: false };
      if (e.t < prevTime)
        ['gold', 'shadow'].forEach(function (c) {
          teams[c].count = { boost: 0, steal: 0, shield: 0, life: 0, rose: 0 };
          teams[c].lengthBefore = null;
        }); // nouvelle manche
      prevTime = e.t;
      horloge += dt;
      // l'ordre de passage des deux equipes est tire au sort a chaque tour : aucune ne parle toujours la premiere
      (Math.random() < 0.5 ? ['gold', 'shadow'] : ['shadow', 'gold']).forEach(function (team) {
        var Q = teams[team],
          mine = e[team],
          opponent = e[team === 'gold' ? 'shadow' : 'gold'],
          idx = team === 'gold' ? 0 : 1;
        var buy = function (what, why, urgence) {
          if (horloge < libre || Q.purse < PRICES[what]) return false;
          var cap =
            (CAPS[what] || 0) + (what === 'shield' && density >= 3 ? 1 : 0) + (urgence ? 2 : 0);
          if (CAPS[what] && (Q.count[what] >= cap || (!urgence && Q.cooldown[what] > 0)))
            return false;
          libre =
            horloge + (what === 'rose' ? 0.35 + Math.random() * 0.5 : 0.9 + Math.random() * 1.3);
          Q.count[what]++;
          if (COOLDOWNS[what]) Q.cooldown[what] = COOLDOWNS[what];
          Q.purse -= PRICES[what];
          Q.spend += PRICES[what];
          Q.last = what;
          var nickname = NICKNAMES[team][Math.floor(Math.random() * NICKNAMES[team].length)];
          ev.push({
            type: 'gift',
            n: 1,
            value: PRICES[what],
            name: NAMES[what][idx],
            team: team,
            nickname: nickname,
          });
          if (what !== 'rose') {
            record(team, what, why);
            if (PRICES[what] >= 20) bigGiftSent[team] = true;
          }
          return true;
        };
        // ferveur : retombe vers 0,25, monte sur coup encaisse, sur retard, et en fin de manche
        Q.fervor += (0.25 - Q.fervor) * Math.min(1, dt / 9);
        if (Q.lengthBefore !== null && mine.L <= Q.lengthBefore - 2) {
          Q.fervor = Math.min(1, Q.fervor + 0.45);
          Q.hit = 2.5;
        }
        if (opponent.L - mine.L >= 3) Q.fervor = Math.min(1, Q.fervor + 0.05 * dt);
        if (remaining <= 20) Q.fervor = Math.max(Q.fervor, 0.8);
        Q.hit = Math.max(0, (Q.hit || 0) - dt);
        Q.purse = Math.min(140, Q.purse + (RATES[density] / 60) * (0.6 + 1.2 * Q.fervor) * dt);
        for (var r in Q.cooldown) Q.cooldown[r] = Math.max(0, Q.cooldown[r] - dt);
        if (!mine.head || !opponent.head) {
          Q.lengthBefore = mine.L;
          return;
        }
        var headDist = abs(mine.head.x - opponent.head.x) + abs(mine.head.y - opponent.head.y);
        var reflex = Math.random() < dt * 2.2; // des humains : ils reagissent en une demi-seconde, pas a la milliseconde

        // 0. L'anneau plein (Abdel : « a team can, during the 5 second countdown, gift something that blocks
        //    it from winning »). Si l'adversaire TIENT l'anneau, l'equipe casse sa tenue par un vol, en
        //    urgence (hors recharge, deux vols de plus que le plafond). S'il est sous bouclier, rien a faire.
        //    Et l'equipe dont le serpent tient l'anneau le protege d'un bouclier si elle en a encore un.
        if (
          opponent.hold > 0 &&
          opponent.shieldTime <= 0 &&
          Math.random() < dt * 4 &&
          buy('steal', "il tient l'anneau depuis " + opponent.hold.toFixed(1) + ' s', true)
        ) {
        } else if (
          mine.hold > 0 &&
          mine.shieldTime <= 0 &&
          Math.random() < dt * 4 &&
          buy('shield', "proteger la tenue de l'anneau")
        ) {
        }
        // 1. vie : juste apres un gros coup, si la bourse suit
        else if (
          reflex &&
          Q.hit > 0 &&
          mine.lives === 0 &&
          !Q.cooldown.life &&
          opponent.L - mine.L >= 3 &&
          buy('life', 'gros coup et retard de ' + (opponent.L - mine.L))
        ) {
        }
        // 2. bouclier : tete adverse tout pres, ou serpent en sursis
        else if (
          reflex &&
          mine.shieldTime <= 0.5 &&
          !Q.cooldown.shield &&
          (headDist <= 3 || mine.L < 5 || Q.hit > 0) &&
          buy(
            'shield',
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
          opponent.shieldTime <= 0 &&
          opponent.invincibleTime <= 0 &&
          !Q.cooldown.steal &&
          ((opponent.L >= 10 && opponent.L >= mine.L) ||
            (remaining <= 20 && opponent.L >= mine.L && opponent.L - mine.L <= 4)) &&
          buy(
            'steal',
            remaining <= 20
              ? 'fin de manche, ecart de ' + (opponent.L - mine.L)
              : 'adversaire long (' + opponent.L + ')',
          )
        ) {
        }
        // 4. tempo : une baie que les deux peuvent atteindre, la course se joue
        else if (reflex && mine.boostTime <= 1 && !Q.cooldown.boost) {
          for (var b = 0; b < e.berries.length; b++) {
            var dm = abs(e.berries[b].x - mine.head.x) + abs(e.berries[b].y - mine.head.y),
              dl = abs(e.berries[b].x - opponent.head.x) + abs(e.berries[b].y - opponent.head.y);
            if (dm <= 12 && dm >= 3 && dm <= dl + 2 && dl <= dm + 5) {
              if (buy('boost', 'course a la baie, ' + dm + ' contre ' + dl + ' cases')) {
              }
              break;
            }
          }
        }
        // 5. roses : nourrir son serpent, surtout quand le plateau est vide ou qu'il est en retard ; on garde une reserve
        Q.rose -= dt;
        var reserve = remaining <= 20 ? 0 : 22;
        if (Q.rose <= 0 && Q.purse > reserve + 1 && e.berries.length < 5) {
          if (buy('rose', ''))
            Q.rose =
              (e.berries.length < 2 || opponent.L > mine.L ? 0.9 : 2.2) *
              (0.6 + Math.random() * 0.8);
        }
        Q.lengthBefore = mine.L;
      });
      // un gros cadeau d'une equipe fait monter l'autre : elle repond
      if (bigGiftSent.gold) teams.shadow.fervor = Math.min(1, teams.shadow.fervor + 0.25);
      if (bigGiftSent.shadow) teams.gold.fervor = Math.min(1, teams.gold.fervor + 0.25);
      return ev;
    }
    function view() {
      return {
        density: density,
        log: history.slice(),
        counts: { gold: teams.gold.count, shadow: teams.shadow.count },
        gold: {
          fervor: teams.gold.fervor,
          purse: teams.gold.purse,
          spend: teams.gold.spend,
          last: teams.gold.last,
        },
        shadow: {
          fervor: teams.shadow.fervor,
          purse: teams.shadow.purse,
          spend: teams.shadow.spend,
          last: teams.shadow.last,
        },
      };
    }
    return { configure: configure, tick: tick, view: view };
  }
  window.ViperCrowd = { readState: readState, create: create, PRICES: PRICES };
})();
