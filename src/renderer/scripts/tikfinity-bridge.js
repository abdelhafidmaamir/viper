/* pont-tikfinity.js : relie le jeu a l'Event API de TikFinity (app desktop).
   FAIT (ecran Event API de l'app, 2026-09-18) : endpoint ws://localhost:21213/,
   messages {"event":"chat|gift|share|follow|like|roomUser|subscribe","data":{...}},
   payloads au format TikTok-Live-Connector.
   Regle des rafales (streaks) : un cadeau "streakable" (giftType 1) envoie un message par palier
   de rafale puis un dernier avec repeatEnd:true et le total ; on ne compte que ce dernier.
   Un cadeau non streakable (giftType != 1) se compte immediatement.
   Expose window.PontTikFinity : { demarrer, arreter, etat(), traiter(objet), surChangement }. */
(function () {
  'use strict';
  var URL_PONT = 'ws://localhost:21213/';
  var ws = null,
    intended = false,
    attempts = 0,
    timer = null;
  var state = {
    connected: false,
    url: URL_PONT,
    events: 0,
    gifts: 0,
    last: '',
    error: '',
  };
  var onChange = null;
  function notify() {
    if (typeof onChange === 'function') {
      try {
        onChange(state);
      } catch (e) {}
    }
  }

  /* Diamants d'un cadeau : diamondCount est unitaire chez TikTok-Live-Connector,
     la valeur envoyee au jeu reste unitaire, n porte le nombre. */
  function process(m) {
    if (!m || !m.event) return null;
    var d = m.data || {};
    state.events++;
    /* trace brute : le dernier message recu tel quel, pour diagnostiquer ce que TikFinity envoie vraiment */
    state.raw = m.event + ' ' + JSON.stringify(d).slice(0, 300);
    if (m.event === 'like') {
      var nl = Math.max(1, parseInt(d.likeCount) || 1);
      state.last = 'like x' + nl + (d.uniqueId ? ' @' + d.uniqueId : '');
      notify();
      return (
        window.receiveEvent &&
        window.receiveEvent({
          type: 'like',
          n: nl,
          nickname: d.nickname || d.uniqueId || '',
          avatar: d.profilePictureUrl || '',
        })
      );
    }
    /* arrivees, partages, abonnements : remontes au jeu pour le bandeau d'activite */
    if (m.event === 'member' || m.event === 'join' || m.event === 'share' || m.event === 'follow') {
      var ty = m.event === 'share' ? 'share' : m.event === 'follow' ? 'follow' : 'join';
      state.last = ty + (d.uniqueId ? ' @' + d.uniqueId : '');
      notify();
      return (
        window.receiveEvent &&
        window.receiveEvent({
          type: ty,
          n: 1,
          nickname: d.nickname || d.uniqueId || '',
          avatar: d.profilePictureUrl || '',
        })
      );
    }
    /* nombre de spectateurs : paliers salues par le bandeau */
    if (m.event === 'roomUser') {
      var vc = parseInt(d.viewerCount) || 0;
      state.last = 'spectateurs ' + vc;
      notify();
      return window.receiveEvent && window.receiveEvent({ type: 'viewers', total: vc });
    }
    if (m.event !== 'gift') return (notify(), null);
    /* rafale : giftType 1 -> ne compter que le message final (repeatEnd true) */
    var streakable = d.giftType === 1 || (d.gift && d.gift.gift_type === 1);
    var isFinal = d.repeatEnd === true || (d.gift && d.gift.repeat_end === 1);
    if (streakable && !isFinal) {
      state.last = 'rafale en cours (' + (d.giftName || '?') + ')';
      notify();
      return null;
    }
    var n = Math.max(1, parseInt(d.repeatCount) || 1);
    var value = parseInt(d.diamondCount) || 0;
    var giftName = String(d.giftName || '');
    state.gifts += n;
    state.last =
      giftName + ' x' + n + ' (' + value + ' diamants)' + (d.uniqueId ? ' @' + d.uniqueId : '');
    notify();
    return (
      window.receiveEvent &&
      window.receiveEvent({
        type: 'gift',
        n: n,
        value: value,
        name: giftName,
        nickname: d.nickname || d.uniqueId || '',
        avatar: d.profilePictureUrl || '',
      })
    );
  }

  function connect() {
    if (!intended) return;
    try {
      ws = new WebSocket(state.url);
    } catch (e) {
      state.error = String((e && e.message) || e);
      reschedule();
      return;
    }
    ws.onopen = function () {
      attempts = 0;
      state.connected = true;
      state.error = '';
      notify();
    };
    ws.onmessage = function (ev) {
      var m = null;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        state.error = 'message illisible';
        notify();
        return;
      }
      try {
        process(m);
      } catch (e) {
        state.error = 'traitement : ' + String((e && e.message) || e);
        notify();
      }
    };
    ws.onclose = function () {
      state.connected = false;
      notify();
      reschedule();
    };
    ws.onerror = function () {
      /* onclose suit toujours, la relance vit la-bas */
    };
  }
  /* reconnexion : 1 s, 2 s, 4 s... plafonnee a 10 s, tant que demarrer() est voulu */
  function reschedule() {
    if (!intended) return;
    var delay = Math.min(10000, 1000 * Math.pow(2, attempts++));
    clearTimeout(timer);
    timer = setTimeout(connect, delay);
  }
  function start(url) {
    intended = true;
    if (url) state.url = url;
    attempts = 0;
    clearTimeout(timer);
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
      ws = null;
    }
    connect();
  }
  function stop() {
    intended = false;
    clearTimeout(timer);
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
      ws = null;
    }
    state.connected = false;
    notify();
  }

  window.TikFinityBridge = {
    start: start,
    stop: stop,
    process: process,
    state: function () {
      return {
        connected: state.connected,
        url: state.url,
        events: state.events,
        gifts: state.gifts,
        last: state.last,
        raw: state.raw || '',
        error: state.error,
      };
    },
    set surChangement(f) {
      onChange = f;
    },
    get surChangement() {
      return onChange;
    },
  };
})();
