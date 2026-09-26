(function () {
  'use strict';
  if (!('BroadcastChannel' in window)) {
    document.body.innerHTML = '<p>BroadcastChannel not available in this browser.</p>';
    return;
  }
  var channel = new BroadcastChannel('viper-duel'),
    lastSignal = 0;
  channel.onmessage = function (ev) {
    var e = (ev.data || {}).state;
    if (!e) return;
    lastSignal = Date.now();
    Array.prototype.forEach.call(document.querySelectorAll('[data-m]'), function (x) {
      var on = x.getAttribute('data-m') === (e.weather || 'rain');
      x.style.borderColor = on ? 'var(--accent)' : '';
      x.style.color = on ? 'var(--accent)' : '';
    });
    document.getElementById('autoAmbience').checked = !!e.autoAmbience;
    Array.prototype.forEach.call(document.querySelectorAll('[data-c]'), function (x) {
      var on = x.getAttribute('data-c') === (e.ranking || 'none');
      x.style.borderColor = on ? 'var(--accent)' : '';
      x.style.color = on ? 'var(--accent)' : '';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-b]'), function (x) {
      var on = x.getAttribute('data-b') === (e.banner || 'none');
      x.style.borderColor = on ? 'var(--accent)' : '';
      x.style.color = on ? 'var(--accent)' : '';
    });
    var rn = document.getElementById('donorNames');
    if (rn && document.activeElement !== rn && e.donorNames !== undefined)
      rn.checked = !!e.donorNames;
    Array.prototype.forEach.call(document.querySelectorAll('[data-r]'), function (x) {
      var on = x.getAttribute('data-r') === e.giftFeedback;
      x.style.borderColor = on ? 'var(--accent)' : '';
      x.style.color = on ? 'var(--accent)' : '';
    });
    var cf = document.getElementById('smooth');
    if (cf && document.activeElement !== cf) cf.checked = !!e.smooth;
    if (e.platform) {
      var isNeutral = e.platform === 'neutral';
      document.getElementById('platformState').textContent =
        'active: ' + (isNeutral ? 'Neutral (gifts hidden)' : 'TikTok (gifts shown)');
      document.getElementById('platformNeutral').style.borderColor = isNeutral
        ? 'var(--accent)'
        : '';
      document.getElementById('platformNeutral').style.color = isNeutral ? 'var(--accent)' : '';
      document.getElementById('platformTiktok').style.borderColor = isNeutral
        ? ''
        : 'var(--accent)';
      document.getElementById('platformTiktok').style.color = isNeutral ? '' : 'var(--accent)';
    }
    if (window.__crowdState) window.__crowdState(e.crowd || null);
    if (window.__syncThumb) window.__syncThumb(e.advantage || 0);
    if (window.__syncSuper) window.__syncSuper(!!e.superAi);
    if (window.__syncScene) window.__syncScene(e.scene || null, !!e.underdog);
    var p = e.bridge || {};
    document.getElementById('bridgeLight').className = 'light' + (p.connected ? ' ok' : '');
    /* while live (bridge connected), test buttons are disabled: fake nicknames must never reach the broadcast */
    Array.prototype.forEach.call(document.querySelectorAll('[data-t],#testRanking'), function (b) {
      b.disabled = !!p.connected;
      b.title = p.connected ? 'Locked while live: TikFinity bridge is connected' : '';
    });
    document.getElementById('bridgeStatus').textContent = p.connected
      ? 'connected to ' + p.url
      : 'disconnected';
    document.getElementById('bridgeLog').textContent =
      (p.last || 'waiting') +
      '\n' +
      (p.events || 0) +
      ' events, ' +
      (p.gifts || 0) +
      ' gifts' +
      (p.error ? '\nerror: ' + p.error : '');
    var d = e.duel;
    document.getElementById('state').textContent = d
      ? 'Gold ' +
        ((d.gold && d.gold.length) || 0) +
        ' rings, Shadow ' +
        ((d.shadow && d.shadow.length) || 0) +
        ' rings\ntimer ' +
        Math.round(d.t || 0) +
        ' s' +
        (d.winner ? '\nend: ' + d.winner : '') +
        (e.metrics && e.metrics.errors ? '\nengine errors: ' + e.metrics.errors : '')
      : 'no active duel';
  };
  /* game window emits every 500 ms: no signal for 2 s turns the indicator red */
  setInterval(function () {
    var ok = Date.now() - lastSignal < 2000;
    document.getElementById('gameLight').className = 'light' + (ok ? ' ok' : '');
    document.getElementById('gameStatus').textContent = ok
      ? 'game window online'
      : 'no signal from the game window (is it open?)';
  }, 500);
  document.getElementById('smooth').onchange = function () {
    channel.postMessage({ cmd: 'setting', name: 'smooth', value: this.checked });
  };
  document.getElementById('platformTiktok').onclick = function () {
    channel.postMessage({ cmd: 'setting', name: 'platform', value: 'tiktok' });
  };
  document.getElementById('platformNeutral').onclick = function () {
    channel.postMessage({ cmd: 'setting', name: 'platform', value: 'neutral' });
  };
  document.getElementById('round').onclick = function () {
    channel.postMessage({ cmd: 'round' });
  };
  /* Admin section: visible only with ?admin=1 in the control room URL */
  if (/[?&]admin=1/.test(location.search)) {
    var admin = document.getElementById('admin'),
      thumbSlider = document.getElementById('thumb');
    admin.hidden = false;
    function showThumb(v) {
      document.getElementById('thumbState').textContent =
        v === 0 ? 'neutral (0)' : v > 0 ? 'Gold +' + v : 'Shadow +' + -v;
    }
    var dbg = document.getElementById('aiDebug');
    dbg.onchange = function () {
      channel.postMessage({ cmd: 'setting', name: 'aiDebug', value: dbg.checked });
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-r]'), function (b) {
      b.onclick = function () {
        channel.postMessage({
          cmd: 'setting',
          name: 'giftFeedback',
          value: b.getAttribute('data-r'),
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
          cmd: 'setting',
          name: 'giftDisplay',
          value: b.getAttribute('data-a'),
        });
        Array.prototype.forEach.call(document.querySelectorAll('[data-a]'), function (x) {
          x.style.borderColor = x === b ? 'var(--accent)' : '';
          x.style.color = x === b ? 'var(--accent)' : '';
        });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (b) {
      b.onclick = function () {
        channel.postMessage({ cmd: 'setting', name: 'format', value: b.getAttribute('data-f') });
        Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (x) {
          x.style.borderColor = x === b ? 'var(--accent)' : '';
          x.style.color = x === b ? 'var(--accent)' : '';
        });
      };
    });
    var dv = document.getElementById('scrollVisible'),
      dc = document.getElementById('scrollHidden');
    if (dv)
      dv.onchange = function () {
        channel.postMessage({
          cmd: 'setting',
          name: 'scrollVisible',
          value: parseInt(dv.value, 10),
        });
      };
    if (dc)
      dc.onchange = function () {
        channel.postMessage({
          cmd: 'setting',
          name: 'scrollHidden',
          value: parseInt(dc.value, 10),
        });
      };
    Array.prototype.forEach.call(document.querySelectorAll('[data-b]'), function (b) {
      b.onclick = function () {
        channel.postMessage({ cmd: 'setting', name: 'banner', value: b.getAttribute('data-b') });
      };
    });
    var TESTS = {
      join: { type: 'join', nickname: 'lea_gold' },
      giftGold: {
        type: 'gift',
        n: 1,
        value: 30,
        name: 'bagel',
        team: 'gold',
        nickname: 'karim.or',
      },
      giftShadow: {
        type: 'gift',
        n: 1,
        value: 100,
        name: 'hand heart',
        team: 'shadow',
        nickname: 'zoe_moon',
      },
      like: { type: 'like', n: 50, nickname: 'soleil92' },
      share: { type: 'share', nickname: 'nox' },
      tier: { type: 'viewers', total: 52 },
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (b) {
      b.onclick = function () {
        channel.postMessage({ cmd: 'event', ev: TESTS[b.getAttribute('data-t')] });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-c]'), function (b) {
      b.onclick = function () {
        channel.postMessage({
          cmd: 'setting',
          name: 'ranking',
          value: b.getAttribute('data-c'),
        });
      };
    });
    document.getElementById('testRanking').onclick = function () {
      [
        ['gold', 100, 'teddy bear', 'karim.or'],
        ['gold', 30, 'bagel', 'lea_gold'],
        ['shadow', 20, 'perfume', 'nox'],
        ['shadow', 100, 'hand heart', 'zoe_moon'],
        ['shadow', 30, 'capybara', 'zoe_moon'],
        ['gold', 10, 'rose 10', 'soleil92'],
      ].forEach(function (g) {
        channel.postMessage({
          cmd: 'event',
          ev: { type: 'gift', n: 1, value: g[1], name: g[2], team: g[0], nickname: g[3] },
        });
      });
      setTimeout(function () {
        channel.postMessage({ cmd: 'endTest', team: 'shadow' });
      }, 1500);
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-m]'), function (b) {
      b.onclick = function () {
        channel.postMessage({ cmd: 'setting', name: 'weather', value: b.getAttribute('data-m') });
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-h]'), function (b) {
      b.onclick = function () {
        channel.postMessage({
          cmd: 'setting',
          name: 'hour',
          value: parseFloat(b.getAttribute('data-h')),
        });
      };
    });
    document.getElementById('autoAmbience').onchange = function () {
      channel.postMessage({ cmd: 'setting', name: 'autoAmbience', value: this.checked });
    };
    var nd = document.getElementById('donorNames');
    nd.onchange = function () {
      channel.postMessage({ cmd: 'setting', name: 'donorNames', value: nd.checked });
    };
    var sup = document.getElementById('superAi');
    sup.onchange = function () {
      channel.postMessage({ cmd: 'setting', name: 'superAi', value: sup.checked });
    };
    window.__syncSuper = function (on) {
      document.getElementById('superLight').className = 'light' + (on ? ' ok' : '');
      if (document.activeElement !== sup && sup.checked !== !!on) sup.checked = !!on;
    };
    var ud = document.getElementById('underdog');
    ud.onchange = function () {
      channel.postMessage({ cmd: 'setting', name: 'underdog', value: ud.checked });
    };
    Array.prototype.forEach.call(document.querySelectorAll('[data-s]'), function (b) {
      b.onclick = function () {
        channel.postMessage({ cmd: 'scene', name: b.getAttribute('data-s') });
      };
    });
    document.getElementById('sceneStop').onclick = function () {
      channel.postMessage({ cmd: 'sceneStop' });
      /* Reset locally at once: badges and the lit button clear without waiting for the next game
         state message, which arrives up to 500 ms later. */
      currentScene = null;
      eff.hidden = true;
      efO.innerHTML = '';
      efOm.innerHTML = '';
      paintScene();
    };
    /* Visual feedback for the active scene: active button highlighted, gauge draining, timer, per-team effect badges.
       The game window pushes state.scene every 500 ms; control room reads and repaints.
       None of this reaches the game screen. */
    var LABELS = {
      ballet: 'Ballet',
      race: 'Berry race',
      huntGold: 'Gold hunts Shadow',
      huntShadow: 'Shadow hunts Gold',
    };
    function renderBadges(effects) {
      if (!effects || !Object.keys(effects).length) return '<span class="note">none</span>';
      var out = [],
        hotBadge = function (t) {
          return '<span class="badge hot">' + t + '</span>';
        },
        coldBadge = function (t) {
          return '<span class="badge cold">' + t + '</span>';
        },
        plainBadge = function (t) {
          return '<span class="badge">' + t + '</span>';
        };
      if (effects.stance === 'attack') out.push(hotBadge('attack'));
      else if (effects.stance === 'defense') out.push(coldBadge('defense'));
      else if (effects.stance === 'neutral') out.push(plainBadge('neutral'));
      if (effects.pA || effects.pD)
        out.push(plainBadge('range ' + (effects.pA || 12) + '/' + (effects.pD || 10)));
      if (effects.hunt != null) out.push(hotBadge('hunt ' + Math.round(effects.hunt * 100) + '%'));
      if (effects.flair != null)
        out.push(plainBadge('flair ' + Math.round(effects.flair * 100) + '%'));
      if (effects.recklessness != null)
        out.push(plainBadge('recklessness ' + Math.round(effects.recklessness * 100)));
      if (effects.berryRace) out.push(coldBadge('berry race'));
      if (effects.lure) out.push(hotBadge('target opponent head'));
      if (effects.repel) out.push(coldBadge('flee opponent head'));
      if (effects.noKill) out.push(coldBadge('no lethal blow'));
      if (effects.encircle) out.push(hotBadge('orbit dist 2'));
      if (effects.immediateTrap) out.push(hotBadge('trap!'));
      return out.join('');
    }
    var sceneStatusEl = document.getElementById('sceneState'),
      eff = document.getElementById('sceneEffect'),
      efO = document.getElementById('effectGold'),
      efOm = document.getElementById('effectShadow'),
      vud = document.getElementById('underdogLight');
    /* game window emits every 500 ms: interpolate between ticks for a smooth gauge */
    var currentScene = null,
      sceneUdOn = false,
      sceneStamp = 0;
    window.__syncScene = function (sc, udOn) {
      sceneUdOn = !!udOn;
      sceneStamp = Date.now();
      currentScene = sc
        ? {
            name: sc.name,
            duration: sc.duration || 0,
            remaining: sc.remaining,
            gold: sc.gold,
            shadow: sc.shadow,
          }
        : null;
      vud.className = 'light' + (udOn ? ' ok' : '');
      if (document.activeElement !== ud && ud.checked !== !!udOn) ud.checked = !!udOn;
      if (sc) {
        eff.hidden = false;
        efO.innerHTML = renderBadges(sc.gold);
        efOm.innerHTML = renderBadges(sc.shadow);
      } else {
        eff.hidden = true;
        efO.innerHTML = '';
        efOm.innerHTML = '';
      }
    };
    function paintScene() {
      /* clear all buttons, then re-highlight the active one */
      Array.prototype.forEach.call(document.querySelectorAll('button[data-s]'), function (b) {
        b.classList.remove('active');
        b.querySelector('.gauge').style.width = '0';
        b.querySelector('.cd').textContent = '';
      });
      if (currentScene) {
        var remaining = Math.max(0, currentScene.remaining - (Date.now() - sceneStamp) / 1000);
        var b = document.querySelector('button[data-s="' + currentScene.name + '"]');
        if (b) {
          b.classList.add('active');
          var fraction = currentScene.duration
            ? Math.max(0, Math.min(1, remaining / currentScene.duration))
            : 0;
          b.querySelector('.gauge').style.width = (fraction * 100).toFixed(1) + '%';
          b.querySelector('.cd').textContent = Math.ceil(remaining) + 's';
        }
        sceneStatusEl.innerHTML =
          '<b>' +
          (LABELS[currentScene.name] || currentScene.name) +
          '</b> active, ' +
          Math.ceil(remaining) +
          ' s remaining' +
          (sceneUdOn ? ' &middot; underdog active' : '');
      } else {
        sceneStatusEl.textContent =
          'no active scene' + (sceneUdOn ? ' (underdog running in background)' : '');
      }
    }
    setInterval(paintScene, 100);
    thumbSlider.oninput = function () {
      var v = +thumbSlider.value;
      channel.postMessage({ cmd: 'setting', name: 'advantage', value: v });
      showThumb(v);
    };
    /* game window resets to 0 each round: slider follows the real state */
    window.__syncThumb = function (v) {
      if (document.activeElement !== thumbSlider && +thumbSlider.value !== v) {
        thumbSlider.value = v;
        showThumb(v);
      }
    };
  }
  document.getElementById('bridgeStart').onclick = function () {
    channel.postMessage({
      cmd: 'bridge-start',
      url: document.getElementById('bridgeUrl').value.trim(),
    });
  };
  document.getElementById('bridgeStop').onclick = function () {
    channel.postMessage({ cmd: 'bridge-stop' });
  };
  /* Simulated audience: events/min with 95% likes and 5% gifts. For a duel gift:
     1-in-60 life, 1-in-30 shield, 1-in-15 steal, 1-in-8 boost, otherwise rose.
     Events pass through the channel, same path as a real viewer. */
  (function () {
    var DENSITY_LEVELS = [
        ['None', 0],
        ['Quiet', 12],
        ['Lively', 100],
        ['Crowd', 550],
      ],
      SHARES = { like: 0.95, gifts: 0.05 };
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
    var audienceBox = document.getElementById('crowd'),
      audienceStatusEl = document.getElementById('crowdState'),
      intervalHandle = null,
      sent = { like: 0, gifts: 0 },
      densityIndex = 0;
    /* Two modes: "Team Battle" (simulated-audience.js: two teams watching and spending tactically)
       or "Random" (blind random draw). Team Battle by default. */
    var teamBattle = true,
      audienceBrain = window.ViperCrowd ? window.ViperCrowd.create() : null,
      lastTick = 0;
    var battleButton = document.getElementById('crowdBattle'),
      randomButton = document.getElementById('crowdRandom'),
      zone = document.getElementById('crowdTeams');
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
    window.__crowdState = function (e) {
      if (!teamBattle || !audienceBrain || !densityIndex) return;
      var now = Date.now(),
        dt = lastTick ? Math.min(1.5, (now - lastTick) / 1000) : 0.5;
      lastTick = now;
      audienceBrain.tick(e, dt).forEach(function (ev) {
        channel.postMessage({ cmd: 'event', ev: ev });
      });
      var v = audienceBrain.view(),
        N = { boost: 'boost', steal: 'steal', shield: 'shield', life: 'life' };
      var formatLine = function (c) {
        return (
          Math.round(v[c].spend) +
          ' coins | ' +
          Object.keys(N)
            .map(function (k) {
              return N[k] + ' ' + v.counts[c][k];
            })
            .join(', ')
        );
      };
      document.getElementById('fervorGold').style.width = Math.round(v.gold.fervor * 100) + '%';
      document.getElementById('fervorShadow').style.width = Math.round(v.shadow.fervor * 100) + '%';
      document.getElementById('spendGold').textContent = formatLine('gold');
      document.getElementById('spendShadow').textContent = formatLine('shadow');
      document.getElementById('crowdLog').textContent = v.log.length
        ? v.log.join(String.fromCharCode(10))
        : 'waiting for the first gift';
    };
    function showStatus() {
      var g = DENSITY_LEVELS[densityIndex][1];
      audienceStatusEl.textContent = g
        ? DENSITY_LEVELS[densityIndex][0] +
          ' (random): about ' +
          Math.round(g * SHARES.gifts) +
          ' gifts per minute, drawn at random. Sent: ' +
          sent.gifts +
          ' gifts.'
        : 'None: no simulated viewer.';
    }
    function restart() {
      if (intervalHandle) clearInterval(intervalHandle);
      intervalHandle = null;
      sent = { like: 0, gifts: 0 };
      showStatus();
      markMode();
      if (audienceBrain) audienceBrain.configure(teamBattle ? densityIndex : 0);
      var g = DENSITY_LEVELS[densityIndex][1];
      if (!g) return;
      if (teamBattle && audienceBrain) {
        audienceStatusEl.textContent =
          DENSITY_LEVELS[densityIndex][0] +
          ': two teams support their snake. The bar shows team fervor; the log explains why they spend.';
        return;
      }
      intervalHandle = setInterval(function () {
        var team = Math.random() < 0.5 ? 'gold' : 'shadow',
          nickname = NICKNAMES[Math.floor(Math.random() * NICKNAMES.length)];
        /* simulated likes removed: likes have no effect in duel mode */
        if (Math.random() < (g * SHARES.gifts) / 240) {
          var r = Math.random(),
            v = r < 1 / 60 ? 100 : r < 1 / 30 ? 30 : r < 1 / 15 ? 20 : r < 1 / 8 ? 10 : 1;
          channel.postMessage({
            cmd: 'event',
            ev: {
              type: 'gift',
              n: 1,
              value: v,
              name: NAMES[v][team === 'gold' ? 0 : 1],
              nickname: nickname,
              team: team,
            },
          });
          sent.gifts++;
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
      cmd: 'raw',
      message: { event: 'like', data: { likeCount: 50, uniqueId: 'control-room' } },
    });
  };
  /* gifts: data-g = name|diamonds|repeat; a streak sends one intermediate message then the final */
  Array.prototype.forEach.call(document.querySelectorAll('[data-g]'), function (b) {
    b.onclick = function () {
      var p = b.getAttribute('data-g').split('|'),
        settingName = p[0],
        v = +p[1],
        n = +p[2];
      if (n > 1)
        channel.postMessage({
          cmd: 'raw',
          message: {
            event: 'gift',
            data: {
              giftName: settingName,
              diamondCount: v,
              giftType: 1,
              repeatCount: n - 2 > 0 ? n - 2 : 1,
              repeatEnd: false,
              uniqueId: 'control-room',
            },
          },
        });
      channel.postMessage({
        cmd: 'raw',
        message: {
          event: 'gift',
          data: {
            giftName: settingName,
            diamondCount: v,
            giftType: 1,
            repeatCount: n,
            repeatEnd: true,
            uniqueId: 'control-room',
          },
        },
      });
    };
  });
})();
