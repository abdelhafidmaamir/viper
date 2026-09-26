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
    connecte: false,
    url: URL_PONT,
    evenements: 0,
    cadeaux: 0,
    dernier: '',
    erreur: '',
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
    state.evenements++;
    /* trace brute : le dernier message recu tel quel, pour diagnostiquer ce que TikFinity envoie vraiment */
    state.brut = m.event + ' ' + JSON.stringify(d).slice(0, 300);
    if (m.event === 'like') {
      var nl = Math.max(1, parseInt(d.likeCount) || 1);
      state.dernier = 'like x' + nl + (d.uniqueId ? ' @' + d.uniqueId : '');
      notify();
      return (
        window.recevoirEvenement &&
        window.recevoirEvenement({
          type: 'like',
          n: nl,
          pseudo: d.nickname || d.uniqueId || '',
          avatar: d.profilePictureUrl || '',
        })
      );
    }
    /* arrivees, partages, abonnements : remontes au jeu pour le bandeau d'activite */
    if (m.event === 'member' || m.event === 'join' || m.event === 'share' || m.event === 'follow') {
      var ty = m.event === 'share' ? 'partage' : m.event === 'follow' ? 'abonne' : 'arrivee';
      state.dernier = ty + (d.uniqueId ? ' @' + d.uniqueId : '');
      notify();
      return (
        window.recevoirEvenement &&
        window.recevoirEvenement({
          type: ty,
          n: 1,
          pseudo: d.nickname || d.uniqueId || '',
          avatar: d.profilePictureUrl || '',
        })
      );
    }
    /* nombre de spectateurs : paliers salues par le bandeau */
    if (m.event === 'roomUser') {
      var vc = parseInt(d.viewerCount) || 0;
      state.dernier = 'spectateurs ' + vc;
      notify();
      return (
        window.recevoirEvenement && window.recevoirEvenement({ type: 'spectateurs', total: vc })
      );
    }
    if (m.event !== 'gift') return (notify(), null);
    /* rafale : giftType 1 -> ne compter que le message final (repeatEnd true) */
    var streakable = d.giftType === 1 || (d.gift && d.gift.gift_type === 1);
    var isFinal = d.repeatEnd === true || (d.gift && d.gift.repeat_end === 1);
    if (streakable && !isFinal) {
      state.dernier = 'rafale en cours (' + (d.giftName || '?') + ')';
      notify();
      return null;
    }
    var n = Math.max(1, parseInt(d.repeatCount) || 1);
    var value = parseInt(d.diamondCount) || 0;
    var giftName = String(d.giftName || '');
    state.cadeaux += n;
    state.dernier =
      giftName + ' x' + n + ' (' + value + ' diamants)' + (d.uniqueId ? ' @' + d.uniqueId : '');
    notify();
    return (
      window.recevoirEvenement &&
      window.recevoirEvenement({
        type: 'cadeau',
        n: n,
        valeur: value,
        nom: giftName,
        pseudo: d.nickname || d.uniqueId || '',
        avatar: d.profilePictureUrl || '',
      })
    );
  }

  function connect() {
    if (!intended) return;
    try {
      ws = new WebSocket(state.url);
    } catch (e) {
      state.erreur = String((e && e.message) || e);
      reschedule();
      return;
    }
    ws.onopen = function () {
      attempts = 0;
      state.connecte = true;
      state.erreur = '';
      notify();
    };
    ws.onmessage = function (ev) {
      var m = null;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        state.erreur = 'message illisible';
        notify();
        return;
      }
      try {
        process(m);
      } catch (e) {
        state.erreur = 'traitement : ' + String((e && e.message) || e);
        notify();
      }
    };
    ws.onclose = function () {
      state.connecte = false;
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
    state.connecte = false;
    notify();
  }

  window.PontTikFinity = {
    demarrer: start,
    arreter: stop,
    traiter: process,
    etat: function () {
      return {
        connecte: state.connecte,
        url: state.url,
        evenements: state.evenements,
        cadeaux: state.cadeaux,
        dernier: state.dernier,
        brut: state.brut || '',
        erreur: state.erreur,
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
