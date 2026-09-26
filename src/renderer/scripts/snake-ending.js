/* fin-serpent.js : le serpent de fin de manche, heureux ou triste.
   Tout est procédural, déterministe, tracé au canvas 2D. Aucune dépendance.
   Unités internes : R vaut 250, le contexte est mis à l'échelle R/250 en entrée. */
(function () {
  'use strict';
  var TAU = Math.PI * 2,
    R = 250;
  var BODY = '#d9e7cc',
    HEAD = '#e8f1dc',
    EYE = '#1b2a1f',
    GOLD = '#F2C57C',
    BLUE = '#8FA8D8';

  function cl(x, a, b) {
    return x < a ? a : x > b ? b : x;
  }
  function sm(x) {
    x = cl(x, 0, 1);
    return x * x * (3 - 2 * x);
  } /* smoothstep, rien ne démarre net */
  function el(x) {
    /* sortie élastique, pour le rebond */
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return 1 + Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (TAU / 3));
  }
  function hs(i) {
    var x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  function fraction(x) {
    return x - Math.floor(x);
  }
  /* impulsion périodique : 0 avant t0, puis une bosse de largeur `dur` toutes les `per` secondes */
  function pulse(t, t0, per, dur) {
    if (t < t0) return 0;
    var ph = fraction((t - t0) / per) * per;
    return ph < dur ? Math.sin((Math.PI * ph) / dur) : 0;
  }

  /* ---------- géométrie du corps, une fonction paramétrique par état ---------- */

  /* Heureux : queue au centre d'une spirale, le cou se dresse hors du dernier tour,
     la tête se penche vers l'intérieur comme un point d'interrogation. */
  function pathHappy(s, t) {
    var K = TAU * 1.55,
      th = K - s * K,
      r = R * (0.14 + 0.44 * s);
    var x = Math.cos(th) * r - R * 0.14,
      y = Math.sin(th) * r + R * 0.08;
    var q = sm((s - 0.72) / 0.28);
    q = q * q;
    var lift =
      0.56 * el((t - 0.9) / 1.3) + 0.03 * Math.sin(t * 2.4); /* montée élastique puis respiration */
    y -= R * lift * q;
    x += R * 0.12 * q; /* le cou reste hors de la spirale */
    var p = sm((s - 0.9) / 0.1);
    p = p * p;
    x -=
      R *
      (0.2 + 0.04 * Math.sin(t * 2.4 + 1)) *
      p *
      sm((t - 1.4) / 1); /* la tête se penche, en retard sur le cou */
    var w =
      Math.sin(s * 9 - t * 3.2) *
      R *
      0.024 *
      Math.sin(Math.PI * s); /* ondulation de la queue vers la tête */
    return { x: x, y: y, w: w };
  }

  /* Triste : corps allongé au sol, dos à peine bombé, cou qui se soulève un peu
     puis retombe. Le soupir gonfle et relâche le cou lentement. */
  function pathSad(s, t) {
    var dr = sm((t - 1.9) / 1.5); /* la tête s'abaisse après l'entrée */
    var sighAmount = sigh(t);
    var x = -0.72 * R + s * 1.34 * R;
    var y = 0.2 * R - 0.09 * R * Math.sin(Math.PI * cl(s / 0.62, 0, 1));
    var n = sm((s - 0.56) / 0.3);
    y -= R * (0.55 - 0.14 * dr + 0.06 * sighAmount) * n * n;
    var d = sm((s - 0.84) / 0.16);
    d = d * d;
    y += R * (0.4 - 0.05 * sighAmount) * d * dr;
    x -= R * 0.06 * d * dr;
    var w =
      Math.sin(s * 6 - t * 1.1) *
      R *
      0.018 *
      Math.sin(Math.PI * s); /* ondulation lente et lourde */
    return { x: x, y: y, w: w };
  }
  /* Nul : serpent de gauche qui se dresse vers le centre, nez à nez avec son miroir ;
     regard neutre, petit hochement synchrone (maquette A1 validée par Abdel, 2026-09-18). */
  function pFace(s, t) {
    var x = -1.0 * R + s * 0.72 * R,
      y = 0.22 * R - 0.06 * R * Math.sin(Math.PI * cl(s / 0.6, 0, 1));
    var n = sm((s - 0.55) / 0.45);
    n = n * n;
    y -= R * 0.5 * el((t - 0.8) / 1.3) * n;
    x += R * 0.06 * n;
    y += R * 0.035 * Math.sin(t * 1.5) * n * sm((t - 2) / 1);
    var w = Math.sin(s * 7 - t * 1.4) * R * 0.02 * Math.sin(Math.PI * s);
    return { x: x, y: y, w: w };
  }
  function sigh(t) {
    /* inspiration courte, expiration longue */
    if (t < 3) return 0;
    var ph = fraction((t - 3) / 5.5);
    return ph < 0.3 ? sm(ph / 0.3) : 1 - sm((ph - 0.3) / 0.7);
  }

  /* échantillonne la courbe jusqu'à `e`, décale par l'ondulation, trace un seul trait lissé */
  function paintBody(g, fn, t, e) {
    var N = 56,
      pts = [],
      i,
      s,
      a,
      b,
      dx,
      dy,
      L,
      m,
      n;
    for (i = 0; i <= N; i++) {
      s = (e * i) / N;
      a = fn(s, t);
      b = fn(Math.min(s + 0.004, 1), t);
      dx = b.x - a.x;
      dy = b.y - a.y;
      L = Math.sqrt(dx * dx + dy * dy) || 1;
      pts.push({ x: a.x - (dy / L) * a.w, y: a.y + (dx / L) * a.w });
    }
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < N; i++) {
      m = pts[i];
      n = pts[i + 1];
      g.quadraticCurveTo(m.x, m.y, (m.x + n.x) / 2, (m.y + n.y) / 2);
    }
    g.lineTo(pts[N].x, pts[N].y);
    g.stroke();
    m = pts[N];
    n = pts[N - 2];
    dx = m.x - n.x;
    dy = m.y - n.y;
    L = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: m.x, y: m.y, dx: dx / L, dy: dy / L };
  }

  /* ---------- tête, yeux, langue ---------- */

  function paintHead(g, h, a, color) {
    g.globalAlpha = a;
    g.fillStyle = color || HEAD;
    g.beginPath();
    g.arc(h.x, h.y, 23, 0, TAU);
    g.fill();
  }

  /* les yeux vivent dans le repère de la tête : x vers l'avant, y en travers */
  function paintEyes(g, h, happy, t, a) {
    var px = -h.dy,
      py = h.dx,
      ang = Math.atan2(h.dy, h.dx),
      i,
      ex,
      ey;
    var blink = happy ? pulse(t, 2.2, 3.7, 0.24) : pulse(t, 3.4, 5.2, 0.6);
    var eyeOpen = happy ? sm((t - 1.6) / 0.8) : 1; /* les yeux se plissent une fois dressé */
    g.globalAlpha = a;
    g.strokeStyle = EYE;
    g.fillStyle = EYE;
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    for (i = -1; i <= 1; i += 2) {
      ex = h.x + h.dx * 9 + px * 8 * i;
      ey = h.y + h.dy * 9 + py * 8 * i;
      g.save();
      g.translate(ex, ey);
      g.rotate(ang);
      if (happy === 'neutre') {
        /* nul : point rond, clignement vertical */
        g.scale(1, 1 - 0.85 * blink);
        g.beginPath();
        g.arc(0, 0, 3.5, 0, TAU);
        g.fill();
      } else if (happy) {
        g.scale(1 - 0.85 * blink, 1);
        if (eyeOpen < 0.5) {
          g.beginPath();
          g.arc(0, 0, 3.5 * (1 - 0.3 * blink) + 0.01, 0, TAU);
          g.fill();
        } else {
          g.beginPath();
          g.arc(-1.6, 0, 4.4, -1.15, 1.15);
          g.stroke();
        } /* arc bombé vers l'avant : sourire */
      } else {
        g.scale(1, 1 - 0.7 * blink);
        g.beginPath();
        g.arc(2.2, 0, 4.4, Math.PI - 1.05, Math.PI + 1.05);
        g.stroke(); /* arc tombant, mi-clos */
      }
      g.restore();
    }
  }

  function paintTongue(g, h, t, a) {
    var L = pulse(t, 2.6, 3.4, 0.5);
    if (L <= 0) return;
    var bx = h.x + h.dx * 21,
      by = h.y + h.dy * 21,
      tx = bx + h.dx * 17 * L,
      ty = by + h.dy * 17 * L;
    var c = Math.cos(0.6),
      s = Math.sin(0.6),
      fx = h.dx * 6 * L,
      fy = h.dy * 6 * L;
    g.globalAlpha = a * sm(L * 3);
    g.strokeStyle = GOLD;
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(bx, by);
    g.lineTo(tx, ty);
    g.moveTo(tx, ty);
    g.lineTo(tx + fx * c - fy * s, ty + fx * s + fy * c);
    g.moveTo(tx, ty);
    g.lineTo(tx + fx * c + fy * s, ty - fx * s + fy * c);
    g.stroke();
  }

  /* ---------- accents : halo, étincelles, goutte ---------- */

  function halo(g, color, a, radius) {
    var gr = g.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
    gr.addColorStop(0, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a;
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, radius, 0, TAU);
    g.fill();
  }

  function paintSparks(g, t, u, color) {
    var entryFade = sm((t - 1.4) / 1),
      i,
      ph,
      x,
      y,
      a,
      r;
    if (entryFade <= 0) return;
    g.fillStyle = color || GOLD;
    for (i = 0; i < 8; i++) {
      ph = fraction(t / 2.8 + hs(i));
      x = (hs(i + 10) - 0.5) * 1.5 * R + 0.05 * R * Math.sin(t * 1.3 + i);
      y = 0.55 * R - ph * 1.15 * R;
      a = Math.sin(Math.PI * ph) * entryFade * u * (0.5 + 0.5 * hs(i + 30));
      r = 2.2 + 2 * hs(i + 20);
      g.globalAlpha = a * 0.25;
      g.beginPath();
      g.arc(x, y, r * 3, 0, TAU);
      g.fill(); /* halo doux sans shadowBlur */
      g.globalAlpha = a;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
    }
  }

  /* la goutte naît sous l'oeil extérieur, grossit, se détache, tombe et s'efface */
  function paintTear(g, h, t, u) {
    if (t < 3.6) return;
    var ph = fraction((t - 3.6) / 6.5),
      px = -h.dy,
      py = h.dx;
    var ox = h.x + h.dx * 9 + px * 8 + 2,
      oy = h.y + h.dy * 9 + py * 8 + 7,
      r,
      y,
      a,
      f;
    if (ph < 0.42) {
      r = 4.2 * sm(ph / 0.42);
      y = oy + r * 0.7;
      a = sm(ph / 0.1);
    } else if (ph < 0.72) {
      f = (ph - 0.42) / 0.3;
      r = 4.2;
      y = oy + 3 + 0.5 * R * f * f;
      a = 1 - sm((f - 0.55) / 0.45);
    } else return;
    g.globalAlpha = u * a * 0.85;
    g.fillStyle = BLUE;
    g.beginPath();
    g.arc(ox, y, r, 0, TAU);
    g.fill();
    g.globalAlpha = u * a * 0.6;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(ox - r * 0.3, y - r * 0.3, r * 0.28, 0, TAU);
    g.fill(); /* reflet, la goutte est froide et brillante */
  }

  /* ---------- entrée publique ---------- */

  function paint(g, o) {
    if (!g || typeof g.save !== 'function') return;
    g.save();
    try {
      o = o || {};
      var happy = o.etat !== 'triste';
      var t = +o.t;
      if (!(t >= 0)) t = 0;
      var cx = +o.cx || 0,
        cy = +o.cy || 0;
      var Rp = +o.R;
      if (!(Rp > 0)) Rp = 250;
      var u = +o.u;
      if (!(u >= 0)) u = 0;
      if (u > 1) u = 1;
      var k = Rp / R,
        e,
        h,
        aT,
        sighAmount;
      /* o.teinte (couleur CSS) et o.rgb ('r,g,b') : en duel, le serpent de fin porte la couleur du camp
         vainqueur. Corps, tete, halo, lueur et etincelles suivent ; sans teinte, rendu inchange. */
      var bodyColor = o.teinte || BODY,
        headColor = o.teinte || HEAD,
        rgb = o.rgb || '242,197,124';

      g.translate(cx, cy);
      g.scale(k, k);
      g.lineCap = 'round';
      g.lineJoin = 'round';

      if (happy) {
        e = sm(t / 1.6);
        aT = sm((e - 0.86) / 0.14);
        halo(
          g,
          'rgba(' + rgb + ',0.22)',
          u * (0.7 + 0.3 * Math.sin(t * 1.1)) * sm(t / 2),
          R * 1.15,
        );
        g.save();
        g.scale(1 + 0.012 * Math.sin(t * 1.6), 1 + 0.012 * Math.sin(t * 1.6)); /* respiration */
        g.globalAlpha = u;
        g.strokeStyle = bodyColor;
        g.lineWidth = 38;
        g.shadowColor = 'rgba(' + rgb + ',0.55)';
        g.shadowBlur = 28 * sm((t - 1) / 1.5); /* seul shadowBlur de l'image */
        h = paintBody(g, pathHappy, t, e);
        g.shadowBlur = 0;
        if (aT > 0) {
          paintHead(g, h, u * aT, headColor);
          paintEyes(g, h, true, t, u * aT);
          paintTongue(g, h, t, u * aT);
        }
        g.restore();
        paintSparks(g, t, u, o.teinte);
      } else {
        e = sm(t / 2.2);
        aT = sm((e - 0.86) / 0.14);
        sighAmount = sigh(t);
        /* triste teinte (match nul en duel : les deux serpents, chacun sa couleur) ; sans teinte, bleu froid */
        var rgbSad = o.teinte ? rgb : '143,168,216';
        halo(g, 'rgba(' + rgbSad + ',0.12)', u * (0.75 + 0.25 * sighAmount) * sm(t / 2.5), R * 1.1);
        g.globalAlpha = u;
        g.strokeStyle = bodyColor;
        g.lineWidth = 38 * (1 + 0.06 * sighAmount); /* le soupir gonfle le corps */
        g.shadowColor = 'rgba(' + rgbSad + ',0.35)';
        g.shadowBlur = 22 * sm((t - 1.5) / 1.5);
        h = paintBody(g, pathSad, t, e);
        g.shadowBlur = 0;
        if (aT > 0) {
          paintHead(g, h, u * aT, o.teinte ? headColor : undefined);
          paintEyes(g, h, false, t, u * aT);
          paintTear(g, h, t, u * aT);
        }
      }
    } catch (err) {
      /* un raté d'animation ne doit jamais casser la fin de manche */
    }
    g.restore();
  }

  /* Match nul en duel : les deux serpents face à face, chacun sa couleur, et le mot DRAW au-dessus.
     o : t, cx, cy, R, u, or:{teinte,rgb}, ombre:{teinte,rgb}. Gauche = or, droite = son miroir. */
  function paintDraw(g, o) {
    if (!g || typeof g.save !== 'function') return;
    g.save();
    try {
      o = o || {};
      var t = +o.t;
      if (!(t >= 0)) t = 0;
      var Rp = +o.R;
      if (!(Rp > 0)) Rp = 250;
      var u = +o.u;
      if (!(u >= 0)) u = 0;
      if (u > 1) u = 1;
      var k = Rp / R,
        e = sm(t / 1.6),
        aT = sm((e - 0.86) / 0.14),
        i,
        c,
        h;
      var teams = [
        o.or || { teinte: GOLD, rgb: '242,197,124' },
        o.ombre || { teinte: BLUE, rgb: '143,168,216' },
      ];
      g.translate(+o.cx || 0, +o.cy || 0);
      g.scale(k, k);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      halo(g, 'rgba(' + teams[0].rgb + ',0.16)', u * sm(t / 2), R * 0.9);
      halo(g, 'rgba(' + teams[1].rgb + ',0.16)', u * sm(t / 2), R * 0.9);
      for (i = 0; i < 2; i++) {
        c = teams[i];
        g.save();
        if (i === 1) g.scale(-1, 1);
        g.globalAlpha = u;
        g.strokeStyle = c.teinte;
        g.lineWidth = 38;
        g.shadowColor = 'rgba(' + c.rgb + ',0.5)';
        g.shadowBlur = 26 * sm((t - 1) / 1.5);
        h = paintBody(g, pFace, t, e);
        g.shadowBlur = 0;
        if (aT > 0) {
          paintHead(g, h, u * aT, c.teinte);
          paintEyes(g, h, 'neutre', t, u * aT);
        }
        g.restore();
      }
      var a = sm((t - 2.2) / 0.8); /* DRAW une fois les têtes dressées */
      if (a > 0) {
        g.globalAlpha = u * a;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = '700 78px system-ui, "Segoe UI", sans-serif';
        g.letterSpacing = '14px';
        var gr = g.createLinearGradient(-120, 0, 120, 0);
        gr.addColorStop(0, teams[0].teinte);
        gr.addColorStop(1, teams[1].teinte);
        g.fillStyle = gr;
        g.fillText('DRAW', 7, -R * 0.62 + R * 0.03 * (1 - a));
      }
    } catch (err) {
      /* un raté d'animation ne doit jamais casser la fin de manche */
    }
    g.restore();
  }

  window.FinSerpent = {
    peindre: paint,
    peindreNul: paintDraw,
  };
})();
