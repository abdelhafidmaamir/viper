/* tikfinity-bridge.js : connects the game to the TikFinity desktop app Event API.
   Endpoint: ws://localhost:21213/. Messages: {"event":"chat|gift|share|follow|like|roomUser|subscribe","data":{...}},
   payloads follow the TikTok-Live-Connector format.
   Streak rule: a streakable gift (giftType 1) emits one message per streak step then a final one
   with repeatEnd:true and the total count; only that final message is counted.
   A non-streakable gift (giftType != 1) is counted immediately.
   Exposes window.TikFinityBridge: { start, stop, state(), process(obj), onChange }. */
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

  /* Gift diamonds: diamondCount is per-unit in TikTok-Live-Connector;
     the value forwarded to the game stays per-unit and n carries the count. */
  function process(m) {
    if (!m || !m.event) return null;
    var d = m.data || {};
    state.events++;
    /* raw trace: last message as received, for diagnosing what TikFinity actually sends */
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
    /* joins, shares, follows: forwarded to the game for the activity banner */
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
    /* viewer count: tier milestones acknowledged by the banner */
    if (m.event === 'roomUser') {
      var vc = parseInt(d.viewerCount) || 0;
      state.last = 'viewers ' + vc;
      notify();
      return window.receiveEvent && window.receiveEvent({ type: 'viewers', total: vc });
    }
    if (m.event !== 'gift') return (notify(), null);
    /* streak: giftType 1 means count only the final message (repeatEnd true) */
    var streakable = d.giftType === 1 || (d.gift && d.gift.gift_type === 1);
    var isFinal = d.repeatEnd === true || (d.gift && d.gift.repeat_end === 1);
    if (streakable && !isFinal) {
      state.last = 'streak in progress (' + (d.giftName || '?') + ')';
      notify();
      return null;
    }
    var n = Math.max(1, parseInt(d.repeatCount) || 1);
    var value = parseInt(d.diamondCount) || 0;
    var giftName = String(d.giftName || '');
    state.gifts += n;
    state.last =
      giftName + ' x' + n + ' (' + value + ' diamonds)' + (d.uniqueId ? ' @' + d.uniqueId : '');
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
        state.error = 'unreadable message';
        notify();
        return;
      }
      try {
        process(m);
      } catch (e) {
        state.error = 'processing: ' + String((e && e.message) || e);
        notify();
      }
    };
    ws.onclose = function () {
      state.connected = false;
      notify();
      reschedule();
    };
    ws.onerror = function () {
      /* onclose always follows; reconnect lives there */
    };
  }
  /* reconnect backoff: 1 s, 2 s, 4 s... capped at 10 s, as long as start() was called */
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
    set onChange(f) {
      onChange = f;
    },
    get onChange() {
      return onChange;
    },
  };
})();
