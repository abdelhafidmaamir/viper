(function () {
  'use strict';
  if (!('BroadcastChannel' in window)) {
    document.body.innerHTML = '<p>BroadcastChannel indisponible dans ce navigateur.</p>';
    return;
  }
  var channel = new BroadcastChannel('vipere-duel'),
    lastSignal = 0;
  channel.onmessage = function (ev) {
    var e = (ev.data || {}).etat;
    if (!e) return;
    lastSignal = Date.now();
    Array.prototype.forEach.call(document.querySelectorAll('[data-m]'), function (x) {
      var on = x.getAttribute('data-m') === (e.meteo || 'pluie');
      x.style.borderColor = on ? 'var(--accent)' : '';
      x.style.color = on ? 'var(--accent)' : '';
    });
    document.getElementById('ambianceAuto').checked = !!e.ambianceAuto;
    Array.prototype.forEach.call(document.querySelectorAll('[data-c]'), function (x) {
      var on = x.getAttribute('data-c') === (e.classement || 'aucun');
      x.style.borderColor = on ? 'var(--accent)' : '';
      x.style.color = on ? 'var(--accent)' : '';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-b]'), function (x) {
      var on = x.getAttribute('data-b') === (e.bandeau || 'aucun');
      x.style.borderColor = on ? 'var(--accent)' : '';
      x.style.color = on ? 'var(--accent)' : '';
    });
    var rn = document.getElementById('nomsDonateurs');
    if (rn && document.activeElement !== rn && e.nomsDonateurs !== undefined)
      rn.checked = !!e.nomsDonateurs;
    Array.prototype.forEach.call(document.querySelectorAll('[data-r]'), function (x) {
      var on = x.getAttribute('data-r') === e.retourCadeau;
      x.style.borderColor = on ? 'var(--accent)' : '';
      x.style.color = on ? 'var(--accent)' : '';
    });
    var cf = document.getElementById('fluide');
    if (cf && document.activeElement !== cf) cf.checked = !!e.fluide;
    if (e.plateforme) {
      var isNeutral = e.plateforme === 'neutre';
      document.getElementById('pfEtat').textContent =
        'actif : ' + (isNeutral ? 'Neutre (cadeaux caches)' : 'TikTok (cadeaux affiches)');
      document.getElementById('pfNeutre').style.borderColor = isNeutral ? 'var(--accent)' : '';
      document.getElementById('pfNeutre').style.color = isNeutral ? 'var(--accent)' : '';
      document.getElementById('pfTiktok').style.borderColor = isNeutral ? '' : 'var(--accent)';
      document.getElementById('pfTiktok').style.color = isNeutral ? '' : 'var(--accent)';
    }
    if (window.__fouleEtat) window.__fouleEtat(e.foule || null);
    if (window.__syncPouce) window.__syncPouce(e.avantage || 0);
    if (window.__syncSuper) window.__syncSuper(!!e.superIA);
    if (window.__syncScene) window.__syncScene(e.scene || null, !!e.underdog);
    var p = e.pont || {};
    document.getElementById('vpont').className = 'voyant' + (p.connecte ? ' ok' : '');
    /* en live (pont connecte), les boutons de test sont bloques : leurs faux pseudos ne doivent jamais passer a l'antenne */
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-t],#testClassement'),
      function (b) {
        b.disabled = !!p.connecte;
        b.title = p.connecte ? 'Bloque pendant le live : le pont TikFinity est connecte' : '';
      },
    );
    document.getElementById('epont').textContent = p.connecte
      ? 'connecte a ' + p.url
      : 'deconnecte';
    document.getElementById('plog').textContent =
      (p.dernier || 'en attente') +
      '\n' +
      (p.evenements || 0) +
      ' evenements, ' +
      (p.cadeaux || 0) +
      ' cadeaux' +
      (p.erreur ? '\nerreur : ' + p.erreur : '');
    var d = e.duel;
    document.getElementById('etat').textContent = d
      ? 'Or ' +
        ((d.or && d.or.longueur) || 0) +
        ' anneaux, Ombre ' +
        ((d.ombre && d.ombre.longueur) || 0) +
        ' anneaux\nchrono ' +
        Math.round(d.t || 0) +
        ' s' +
        (d.vainqueur ? '\nfin : ' + d.vainqueur : '') +
        (e.mesures && e.mesures.erreurs ? '\nerreurs moteur : ' + e.mesures.erreurs : '')
      : 'pas de duel en cours';
  };
  /* la fenetre jeu emet toutes les 500 ms : sans signe depuis 2 s, voyant rouge */
  setInterval(function () {
    var ok = Date.now() - lastSignal < 2000;
    document.getElementById('vjeu').className = 'voyant' + (ok ? ' ok' : '');
    document.getElementById('ejeu').textContent = ok
      ? 'fenetre jeu en ligne'
      : 'aucun signe de la fenetre jeu (est-elle ouverte ?)';
  }, 500);
  document.getElementById('fluide').onchange = function () {
    channel.postMessage({ cmd: 'reglage', nom: 'fluide', valeur: this.checked });
  };
  document.getElementById('pfTiktok').onclick = function () {
    channel.postMessage({ cmd: 'reglage', nom: 'plateforme', valeur: 'tiktok' });
  };
  document.getElementById('pfNeutre').onclick = function () {
    channel.postMessage({ cmd: 'reglage', nom: 'plateforme', valeur: 'neutre' });
  };
  document.getElementById('manche').onclick = function () {
    channel.postMessage({ cmd: 'manche' });
  };
  /* Super admin : section visible seulement avec ?admin=1 dans l'URL de la regie */
  if (/[?&]admin=1/.test(location.search)) {
    var admin = document.getElementById('admin'),
      thumbSlider = document.getElementById('pouce');
    admin.hidden = false;
    function showThumb(v) {
      document.getElementById('pouceEtat').textContent =
        v === 0 ? 'neutre (0)' : v > 0 ? 'Or +' + v : 'Ombre +' + -v;
    }
    var dbg = document.getElementById('debugIA');
    dbg.onchange = function () {
      channel.postMessage({ cmd: 'reglage', nom: 'debugIA', valeur: dbg.checked });
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-r]'), function (b) {
      b.onclick = function () {
        channel.postMessage({
          cmd: 'reglage',
          nom: 'retourCadeau',
          valeur: b.getAttribute('data-r'),
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-r]'), function (x) {
          x.style.borderColor = x === b ? 'var(--accent)' : '';
          x.style.color = x === b ? 'var(--accent)' : '';
        });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-a]'), function (b) {
      b.onclick = function () {
        channel.postMessage({
          cmd: 'reglage',
          nom: 'affichageCadeaux',
          valeur: b.getAttribute('data-a'),
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-a]'), function (x) {
          x.style.borderColor = x === b ? 'var(--accent)' : '';
          x.style.color = x === b ? 'var(--accent)' : '';
        });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (b) {
      b.onclick = function () {
        channel.postMessage({ cmd: 'reglage', nom: 'format', valeur: b.getAttribute('data-f') });
        Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (x) {
          x.style.borderColor = x === b ? 'var(--accent)' : '';
          x.style.color = x === b ? 'var(--accent)' : '';
        });
      };
    });
    var dv = document.getElementById('defileVisi'),
      dc = document.getElementById('defileCache');
    if (dv)
      dv.onchange = function () {
        channel.postMessage({ cmd: 'reglage', nom: 'defileVisi', valeur: parseInt(dv.value, 10) });
      };
    if (dc)
      dc.onchange = function () {
        channel.postMessage({ cmd: 'reglage', nom: 'defileCache', valeur: parseInt(dc.value, 10) });
      };
    Array.prototype.forEach.call(document.querySelectorAll('[data-b]'), function (b) {
      b.onclick = function () {
        channel.postMessage({ cmd: 'reglage', nom: 'bandeau', valeur: b.getAttribute('data-b') });
      };
    });
    var TESTS = {
      arrivee: { type: 'arrivee', pseudo: 'lea_gold' },
      cadeauOr: { type: 'cadeau', n: 1, valeur: 30, nom: 'bagel', camp: 'or', pseudo: 'karim.or' },
      cadeauOm: {
        type: 'cadeau',
        n: 1,
        valeur: 100,
        nom: 'hand heart',
        camp: 'ombre',
        pseudo: 'zoe_moon',
      },
      like: { type: 'like', n: 50, pseudo: 'soleil92' },
      partage: { type: 'partage', pseudo: 'nox' },
      palier: { type: 'spectateurs', total: 52 },
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (b) {
      b.onclick = function () {
        channel.postMessage({ cmd: 'evenement', ev: TESTS[b.getAttribute('data-t')] });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-c]'), function (b) {
      b.onclick = function () {
        channel.postMessage({
          cmd: 'reglage',
          nom: 'classement',
          valeur: b.getAttribute('data-c'),
        });
      };
    });
    document.getElementById('testClassement').onclick = function () {
      [
        ['or', 100, 'teddy bear', 'karim.or'],
        ['or', 30, 'bagel', 'lea_gold'],
        ['ombre', 20, 'perfume', 'nox'],
        ['ombre', 100, 'hand heart', 'zoe_moon'],
        ['ombre', 30, 'capybara', 'zoe_moon'],
        ['or', 10, 'rose 10', 'soleil92'],
      ].forEach(function (g) {
        channel.postMessage({
          cmd: 'evenement',
          ev: { type: 'cadeau', n: 1, valeur: g[1], nom: g[2], camp: g[0], pseudo: g[3] },
        });
      });
      setTimeout(function () {
        channel.postMessage({ cmd: 'finTest', camp: 'ombre' });
      }, 1500);
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-m]'), function (b) {
      b.onclick = function () {
        channel.postMessage({ cmd: 'reglage', nom: 'meteo', valeur: b.getAttribute('data-m') });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-h]'), function (b) {
      b.onclick = function () {
        channel.postMessage({
          cmd: 'reglage',
          nom: 'heure',
          valeur: parseFloat(b.getAttribute('data-h')),
        });
      };
    });
    document.getElementById('ambianceAuto').onchange = function () {
      channel.postMessage({ cmd: 'reglage', nom: 'ambianceAuto', valeur: this.checked });
    };
    var nd = document.getElementById('nomsDonateurs');
    nd.onchange = function () {
      channel.postMessage({ cmd: 'reglage', nom: 'nomsDonateurs', valeur: nd.checked });
    };
    var sup = document.getElementById('superIA');
    sup.onchange = function () {
      channel.postMessage({ cmd: 'reglage', nom: 'superIA', valeur: sup.checked });
    };
    window.__syncSuper = function (on) {
      document.getElementById('vsuper').className = 'voyant' + (on ? ' ok' : '');
      if (document.activeElement !== sup && sup.checked !== !!on) sup.checked = !!on;
    };
    var ud = document.getElementById('underdog');
    ud.onchange = function () {
      channel.postMessage({ cmd: 'reglage', nom: 'underdog', valeur: ud.checked });
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-s]'), function (b) {
      b.onclick = function () {
        channel.postMessage({ cmd: 'scene', nom: b.getAttribute('data-s') });
      };
    });
    document.getElementById('sceneStop').onclick = function () {
      channel.postMessage({ cmd: 'sceneStop' });
      /* reset local immediat : les pastilles et le bouton illumine s'eteignent sans attendre le
         prochain retour d'etat du jeu (qui n'arrive que 500 ms plus tard) */
      currentScene = null;
      eff.hidden = true;
      efO.innerHTML = '';
      efOm.innerHTML = '';
      paintScene();
    };
    /* Retour visuel de la scene en cours : bouton actif surligne, jauge qui se vide, chrono, effet par camp.
       La fenetre jeu remonte etat.scene toutes les 500 ms ; on lit cette valeur et on peint la regie.
       Rien de tout ca ne va a l'ecran du jeu. */
    var LABELS = {
      ballet: 'Ballet',
      course: 'Course a la baie',
      chasseOr: 'Or chasse Ombre',
      chasseOm: 'Ombre chasse Or',
    };
    function renderBadges(effects) {
      if (!effects || !Object.keys(effects).length) return '<span class="note">au naturel</span>';
      var out = [],
        hotBadge = function (t) {
          return '<span class="pastille chaud">' + t + '</span>';
        },
        coldBadge = function (t) {
          return '<span class="pastille froid">' + t + '</span>';
        },
        plainBadge = function (t) {
          return '<span class="pastille">' + t + '</span>';
        };
      if (effects.posture === 'attaque') out.push(hotBadge('attaque'));
      else if (effects.posture === 'defense') out.push(coldBadge('defense'));
      else if (effects.posture === 'neutre') out.push(plainBadge('neutre'));
      if (effects.pA || effects.pD)
        out.push(plainBadge('portees ' + (effects.pA || 12) + '/' + (effects.pD || 10)));
      if (effects.chasse != null)
        out.push(hotBadge('chasse ' + Math.round(effects.chasse * 100) + '%'));
      if (effects.flair != null)
        out.push(plainBadge('flair ' + Math.round(effects.flair * 100) + '%'));
      if (effects.imprudence != null)
        out.push(plainBadge('audace ' + Math.round(effects.imprudence * 100)));
      if (effects.courseBaie) out.push(coldBadge('course baie'));
      if (effects.attirer) out.push(hotBadge('cible tete adverse'));
      if (effects.repousser) out.push(coldBadge('fuit tete adverse'));
      if (effects.nePasTuer) out.push(coldBadge('sans coup fatal'));
      if (effects.encercler) out.push(hotBadge('orbite dist 2'));
      if (effects.piegeImmediat) out.push(hotBadge('piege !'));
      return out.join('');
    }
    var sceneStatusEl = document.getElementById('sceneEtat'),
      eff = document.getElementById('sceneEffet'),
      efO = document.getElementById('effetOr'),
      efOm = document.getElementById('effetOm'),
      vud = document.getElementById('vunderdog');
    /* la fenetre jeu emet toutes les 500 ms : on interpole entre deux ticks pour une jauge fluide */
    var currentScene = null,
      sceneUdOn = false,
      sceneStamp = 0;
    window.__syncScene = function (sc, udOn) {
      sceneUdOn = !!udOn;
      sceneStamp = Date.now();
      currentScene = sc
        ? { nom: sc.nom, duree: sc.duree || 0, restant: sc.restant, or: sc.or, ombre: sc.ombre }
        : null;
      vud.className = 'voyant' + (udOn ? ' ok' : '');
      if (document.activeElement !== ud && ud.checked !== !!udOn) ud.checked = !!udOn;
      if (sc) {
        eff.hidden = false;
        efO.innerHTML = renderBadges(sc.or);
        efOm.innerHTML = renderBadges(sc.ombre);
      } else {
        eff.hidden = true;
        efO.innerHTML = '';
        efOm.innerHTML = '';
      }
    };
    function paintScene() {
      /* remise a zero puis rallumage du bouton actif */
      Array.prototype.forEach.call(document.querySelectorAll('button[data-s]'), function (b) {
        b.classList.remove('actif');
        b.querySelector('.jauge').style.width = '0';
        b.querySelector('.cd').textContent = '';
      });
      if (currentScene) {
        var remaining = Math.max(0, currentScene.restant - (Date.now() - sceneStamp) / 1000);
        var b = document.querySelector('button[data-s="' + currentScene.nom + '"]');
        if (b) {
          b.classList.add('actif');
          var fraction = currentScene.duree
            ? Math.max(0, Math.min(1, remaining / currentScene.duree))
            : 0;
          b.querySelector('.jauge').style.width = (fraction * 100).toFixed(1) + '%';
          b.querySelector('.cd').textContent = Math.ceil(remaining) + 's';
        }
        sceneStatusEl.innerHTML =
          '<b>' +
          (LABELS[currentScene.nom] || currentScene.nom) +
          '</b> en cours, ' +
          Math.ceil(remaining) +
          ' s restantes' +
          (sceneUdOn ? ' &middot; underdog actif' : '');
      } else {
        sceneStatusEl.textContent =
          'aucune scene en cours' + (sceneUdOn ? ' (underdog actif en fond)' : '');
      }
    }
    setInterval(paintScene, 100);
    thumbSlider.oninput = function () {
      var v = +thumbSlider.value;
      channel.postMessage({ cmd: 'reglage', nom: 'avantage', valeur: v });
      showThumb(v);
    };
    /* la fenetre jeu remet a 0 a chaque manche : la glissiere suit son etat reel */
    window.__syncPouce = function (v) {
      if (document.activeElement !== thumbSlider && +thumbSlider.value !== v) {
        thumbSlider.value = v;
        showThumb(v);
      }
    };
  }
  document.getElementById('pgo').onclick = function () {
    channel.postMessage({
      cmd: 'pont-demarrer',
      url: document.getElementById('purl').value.trim(),
    });
  };
  document.getElementById('pstop').onclick = function () {
    channel.postMessage({ cmd: 'pont-arreter' });
  };
  /* Public simule : meme reglage que regie-base.js (gestes par minute, 95 % de likes, 5 % de cadeaux,
     et pour un cadeau en duel : 1 sur 60 vie, 1 sur 30 bouclier, 1 sur 15 vol, 1 sur 8 tempo, sinon rose).
     Les evenements passent par le canal, comme un vrai spectateur. */
  (function () {
    var DENSITY_LEVELS = [
        ['Personne', 0],
        ['Calme', 12],
        ['Anime', 100],
        ['Foule', 550],
      ],
      SHARES = { like: 0.95, cad: 0.05 };
    var NAMES = {
      1: ['rose', 'rosa'],
      10: ['rose 10', 'dyno'],
      20: ['bouquet', 'perfume'],
      30: ['bagel', 'capybara'],
      100: ['teddy bear', 'hand heart'],
    };
    var NICKNAMES = [
      'lea_m',
      'karim.dz',
      'nox',
      'mimi92',
      'sacha',
      'yuna',
      'tom_tom',
      'aya',
      'lucas.b',
      'ines',
      'pablo',
      'zoe',
      'rayan',
      'emma',
      'kenji',
      'nora',
    ];
    var audienceBox = document.getElementById('foule'),
      audienceStatusEl = document.getElementById('fouleEtat'),
      intervalHandle = null,
      sent = { like: 0, cad: 0 },
      densityIndex = 0;
    /* Deux comportements : « Bataille d'equipes » (public-simule.js : deux equipes qui regardent la partie et
       depensent avec tactique) ou « Hasard » (l'ancien tirage aveugle). Bataille par defaut. */
    var teamBattle = true,
      audienceBrain = window.VipereFoule ? window.VipereFoule.creer() : null,
      lastTick = 0;
    var battleButton = document.getElementById('fmBataille'),
      randomButton = document.getElementById('fmHasard'),
      zone = document.getElementById('fouleEquipes');
    function markMode() {
      [
        [battleButton, teamBattle],
        [randomButton, !teamBattle],
      ].forEach(function (p) {
        p[0].style.borderColor = p[1] ? 'var(--accent)' : '';
        p[0].style.color = p[1] ? 'var(--accent)' : '';
      });
      zone.hidden = !(teamBattle && densityIndex > 0);
    }
    battleButton.onclick = function () {
      teamBattle = true;
      markMode();
      restart();
    };
    randomButton.onclick = function () {
      teamBattle = false;
      markMode();
      restart();
    };
    window.__fouleEtat = function (e) {
      if (!teamBattle || !audienceBrain || !densityIndex) return;
      var now = Date.now(),
        dt = lastTick ? Math.min(1.5, (now - lastTick) / 1000) : 0.5;
      lastTick = now;
      audienceBrain.tick(e, dt).forEach(function (ev) {
        channel.postMessage({ cmd: 'evenement', ev: ev });
      });
      var v = audienceBrain.vue(),
        N = { tempo: 'tempo', vol: 'vol', bouclier: 'bouclier', vie: 'vie' };
      var formatLine = function (c) {
        return (
          Math.round(v[c].depense) +
          ' pieces | ' +
          Object.keys(N)
            .map(function (k) {
              return N[k] + ' ' + v.comptes[c][k];
            })
            .join(', ')
        );
      };
      document.getElementById('fvOr').style.width = Math.round(v.or.ferveur * 100) + '%';
      document.getElementById('fvOm').style.width = Math.round(v.ombre.ferveur * 100) + '%';
      document.getElementById('fdOr').textContent = formatLine('or');
      document.getElementById('fdOm').textContent = formatLine('ombre');
      document.getElementById('fouleJournal').textContent = v.journal.length
        ? v.journal.join(String.fromCharCode(10))
        : 'en attente du premier cadeau';
    };
    function showStatus() {
      var g = DENSITY_LEVELS[densityIndex][1];
      audienceStatusEl.textContent = g
        ? DENSITY_LEVELS[densityIndex][0] +
          ' (hasard) : environ ' +
          Math.round(g * SHARES.cad) +
          ' cadeaux par minute, tires au sort. Envoyes : ' +
          sent.cad +
          ' cadeaux.'
        : 'Personne : aucun spectateur simule.';
    }
    function restart() {
      if (intervalHandle) clearInterval(intervalHandle);
      intervalHandle = null;
      sent = { like: 0, cad: 0 };
      showStatus();
      markMode();
      if (audienceBrain) audienceBrain.regler(teamBattle ? densityIndex : 0);
      var g = DENSITY_LEVELS[densityIndex][1];
      if (!g) return;
      if (teamBattle && audienceBrain) {
        audienceStatusEl.textContent =
          DENSITY_LEVELS[densityIndex][0] +
          " : deux equipes se battent pour leur serpent. La barre est la ferveur de l'equipe, le journal dit pourquoi elle depense.";
        return;
      }
      intervalHandle = setInterval(function () {
        var camp = Math.random() < 0.5 ? 'or' : 'ombre',
          nickname = NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)];
        /* plus de likes simules : le like n'a plus d'effet en duel (Abdel, 2026-09-19) */
        if (Math.random() < (g * SHARES.cad) / 240) {
          var r = Math.random(),
            v = r < 1 / 60 ? 100 : r < 1 / 30 ? 30 : r < 1 / 15 ? 20 : r < 1 / 8 ? 10 : 1;
          channel.postMessage({
            cmd: 'evenement',
            ev: {
              type: 'cadeau',
              n: 1,
              valeur: v,
              nom: NAMES[v][camp === 'or' ? 0 : 1],
              pseudo: nickname,
              camp: camp,
            },
          });
          sent.cad++;
        }
        showStatus();
      }, 250);
    }
    DENSITY_LEVELS.forEach(function (d, i) {
      var b = document.createElement('button');
      b.textContent = d[0];
      b.onclick = function () {
        densityIndex = i;
        Array.prototype.forEach.call(audienceBox.children, function (x, k) {
          x.style.borderColor = k === i ? 'var(--accent)' : '';
          x.style.color = k === i ? 'var(--accent)' : '';
        });
        restart();
      };
      audienceBox.appendChild(b);
    });
    audienceBox.children[0].style.borderColor = 'var(--accent)';
    audienceBox.children[0].style.color = 'var(--accent)';
    markMode();
  })();
  document.getElementById('likes').onclick = function () {
    channel.postMessage({
      cmd: 'brut',
      message: { event: 'like', data: { likeCount: 50, uniqueId: 'regie' } },
    });
  };
  /* cadeaux : data-g = nom|diamants|repeat ; une rafale envoie un message intermediaire puis le final */
  Array.prototype.forEach.call(document.querySelectorAll('[data-g]'), function (b) {
    b.onclick = function () {
      var p = b.getAttribute('data-g').split('|'),
        nom = p[0],
        v = +p[1],
        n = +p[2];
      if (n > 1)
        channel.postMessage({
          cmd: 'brut',
          message: {
            event: 'gift',
            data: {
              giftName: nom,
              diamondCount: v,
              giftType: 1,
              repeatCount: n - 2 > 0 ? n - 2 : 1,
              repeatEnd: false,
              uniqueId: 'regie',
            },
          },
        });
      channel.postMessage({
        cmd: 'brut',
        message: {
          event: 'gift',
          data: {
            giftName: nom,
            diamondCount: v,
            giftType: 1,
            repeatCount: n,
            repeatEnd: true,
            uniqueId: 'regie',
          },
        },
      });
    };
  });
})();
