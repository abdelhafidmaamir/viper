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
    voulu = false,
    tentative = 0,
    minuteur = null;
  var etat = { connecte: false, url: URL_PONT, evenements: 0, cadeaux: 0, dernier: '', erreur: '' };
  var surChangement = null;
  function notifier() {
    if (typeof surChangement === 'function') {
      try {
        surChangement(etat);
      } catch (e) {}
    }
  }

  /* Diamants d'un cadeau : diamondCount est unitaire chez TikTok-Live-Connector,
     la valeur envoyee au jeu reste unitaire, n porte le nombre. */
  function traiter(m) {
    if (!m || !m.event) return null;
    var d = m.data || {};
    etat.evenements++;
    /* trace brute : le dernier message recu tel quel, pour diagnostiquer ce que TikFinity envoie vraiment */
    etat.brut = m.event + ' ' + JSON.stringify(d).slice(0, 300);
    if (m.event === 'like') {
      var nl = Math.max(1, parseInt(d.likeCount) || 1);
      etat.dernier = 'like x' + nl + (d.uniqueId ? ' @' + d.uniqueId : '');
      notifier();
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
      etat.dernier = ty + (d.uniqueId ? ' @' + d.uniqueId : '');
      notifier();
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
      etat.dernier = 'spectateurs ' + vc;
      notifier();
      return (
        window.recevoirEvenement && window.recevoirEvenement({ type: 'spectateurs', total: vc })
      );
    }
    if (m.event !== 'gift') return (notifier(), null);
    /* rafale : giftType 1 -> ne compter que le message final (repeatEnd true) */
    var streakable = d.giftType === 1 || (d.gift && d.gift.gift_type === 1);
    var fin = d.repeatEnd === true || (d.gift && d.gift.repeat_end === 1);
    if (streakable && !fin) {
      etat.dernier = 'rafale en cours (' + (d.giftName || '?') + ')';
      notifier();
      return null;
    }
    var n = Math.max(1, parseInt(d.repeatCount) || 1);
    var valeur = parseInt(d.diamondCount) || 0;
    var nom = String(d.giftName || '');
    etat.cadeaux += n;
    etat.dernier =
      nom + ' x' + n + ' (' + valeur + ' diamants)' + (d.uniqueId ? ' @' + d.uniqueId : '');
    notifier();
    return (
      window.recevoirEvenement &&
      window.recevoirEvenement({
        type: 'cadeau',
        n: n,
        valeur: valeur,
        nom: nom,
        pseudo: d.nickname || d.uniqueId || '',
        avatar: d.profilePictureUrl || '',
      })
    );
  }

  function connecter() {
    if (!voulu) return;
    try {
      ws = new WebSocket(etat.url);
    } catch (e) {
      etat.erreur = String((e && e.message) || e);
      replanifier();
      return;
    }
    ws.onopen = function () {
      tentative = 0;
      etat.connecte = true;
      etat.erreur = '';
      notifier();
    };
    ws.onmessage = function (ev) {
      var m = null;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        etat.erreur = 'message illisible';
        notifier();
        return;
      }
      try {
        traiter(m);
      } catch (e) {
        etat.erreur = 'traitement : ' + String((e && e.message) || e);
        notifier();
      }
    };
    ws.onclose = function () {
      etat.connecte = false;
      notifier();
      replanifier();
    };
    ws.onerror = function () {
      /* onclose suit toujours, la relance vit la-bas */
    };
  }
  /* reconnexion : 1 s, 2 s, 4 s... plafonnee a 10 s, tant que demarrer() est voulu */
  function replanifier() {
    if (!voulu) return;
    var delai = Math.min(10000, 1000 * Math.pow(2, tentative++));
    clearTimeout(minuteur);
    minuteur = setTimeout(connecter, delai);
  }
  function demarrer(url) {
    voulu = true;
    if (url) etat.url = url;
    tentative = 0;
    clearTimeout(minuteur);
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
      ws = null;
    }
    connecter();
  }
  function arreter() {
    voulu = false;
    clearTimeout(minuteur);
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
      ws = null;
    }
    etat.connecte = false;
    notifier();
  }

  window.PontTikFinity = {
    demarrer: demarrer,
    arreter: arreter,
    traiter: traiter,
    etat: function () {
      return {
        connecte: etat.connecte,
        url: etat.url,
        evenements: etat.evenements,
        cadeaux: etat.cadeaux,
        dernier: etat.dernier,
        brut: etat.brut || '',
        erreur: etat.erreur,
      };
    },
    set surChangement(f) {
      surChangement = f;
    },
    get surChangement() {
      return surChangement;
    },
  };
})();
