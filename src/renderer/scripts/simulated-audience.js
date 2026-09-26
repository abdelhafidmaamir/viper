// Simulated audience for the duel control room. Two fake viewer teams, gold and shadow,
// WATCH the match and spend their coins like real fans supporting their snake:
// shield when threatened, boost when racing for a berry, steal when the opponent is
// long or when the round is close, life after a big hit, roses to feed it.
// Each team has a FERVOR that rises (hit absorbed, big gift from the opponent, falling behind,
// end of round) and decays; it controls the coin rate. Both teams share the same rules and budget:
// decisions depend on game state only, never on which team is acting.
// Interface: ViperCrowd.readState(B) -> state; ViperCrowd.create() -> {configure(density), tick(state,dt) -> [events], view()}
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
  // coins per minute per team at rest (fervor multiplies from 0.6 to 1.8)
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
  // Caps per round per team, with long cooldowns: a shield or life must stay a notable
  // event, not a permanent state.
  var CAPS = { boost: 5, steal: 3, shield: 1, life: 1 }; // at crowd density a second shield is allowed (see buy)
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
    // Natural pacing: two viewers never send a gift at the same instant. After each gift,
    // a short random gap (across both teams) passes before the next.
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
      history.unshift((team === 'gold' ? 'Gold' : 'Shadow') + ': ' + what + ' (' + why + ')');
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
        }); // new round
      prevTime = e.t;
      horloge += dt;
      // team order is randomized each tick: neither team always acts first
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
        // fervor: decays toward 0.25, rises on a hit taken, when behind, and near the end of a round
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
        var reflex = Math.random() < dt * 2.2; // human pace: reactions take half a second, not a millisecond

        // 0. Full ring: if the opponent is HOLDING the ring, break the hold with a steal, urgency mode
        //    (bypasses cooldown, allows two extra steals over cap). If they have a shield, nothing to do.
        //    The team whose snake is holding the ring shields it if a shield is still available.
        if (
          opponent.hold > 0 &&
          opponent.shieldTime <= 0 &&
          Math.random() < dt * 4 &&
          buy('steal', 'holding the ring for ' + opponent.hold.toFixed(1) + ' s', true)
        ) {
        } else if (
          mine.hold > 0 &&
          mine.shieldTime <= 0 &&
          Math.random() < dt * 4 &&
          buy('shield', 'protect the ring hold')
        ) {
        }
        // 1. life: right after a big hit, if the purse allows it
        else if (
          reflex &&
          Q.hit > 0 &&
          mine.lives === 0 &&
          !Q.cooldown.life &&
          opponent.L - mine.L >= 3 &&
          buy('life', 'big hit, trailing by ' + (opponent.L - mine.L))
        ) {
        }
        // 2. shield: opponent head very close, or snake on its last legs
        else if (
          reflex &&
          mine.shieldTime <= 0.5 &&
          !Q.cooldown.shield &&
          (headDist <= 3 || mine.L < 5 || Q.hit > 0) &&
          buy(
            'shield',
            headDist <= 3
              ? 'opponent head ' + headDist + ' cells away'
              : mine.L < 5
                ? 'snake on last legs'
                : 'just took a hit',
          )
        ) {
        }
        // 3. steal: never against a shielded opponent; when they are long or to flip a close endgame
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
              ? 'end of round, gap of ' + (opponent.L - mine.L)
              : 'opponent is long (' + opponent.L + ')',
          )
        ) {
        }
        // 4. boost: a berry both snakes can reach, the race is on
        else if (reflex && mine.boostTime <= 1 && !Q.cooldown.boost) {
          for (var b = 0; b < e.berries.length; b++) {
            var dm = abs(e.berries[b].x - mine.head.x) + abs(e.berries[b].y - mine.head.y),
              dl = abs(e.berries[b].x - opponent.head.x) + abs(e.berries[b].y - opponent.head.y);
            if (dm <= 12 && dm >= 3 && dm <= dl + 2 && dl <= dm + 5) {
              if (buy('boost', 'berry race, ' + dm + ' vs ' + dl + ' cells')) {
              }
              break;
            }
          }
        }
        // 5. roses: feed the snake, especially when the board is empty or it is behind; keep a reserve
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
      // a big gift from one team spikes the other's fervor: they respond
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
