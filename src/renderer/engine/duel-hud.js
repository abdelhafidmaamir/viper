// Duel HUD: the two half-rings around the board, each team's status column (shield, life,
// speed) and the heart and crest glyphs they use.

import { CELL, COLS, H, ROWS, W, X0, Y0 } from './layout.js';
import { ctx } from './canvas.js';
import { SHADOW, GOLD } from './palette.js';
import { SHIELD_DURATION, TARGET_LENGTH, REPRIEVE_LENGTH, BOOST_DURATION } from './rules.js';
import { frameDt, pointRail } from './frame.js';
import { HOLD_SECONDS, bodies, round, settings, t } from '../scripts/game.js';

// Smoke puffs shed by the burning timer rail.
const timerSmoke = [];

export function paintDuel(dt) {
  if (!round) return;
  const x = X0 - 14,
    y = Y0 - 14,
    w = COLS * CELL + 28,
    h = ROWS * CELL + 28,
    r = 18;
  const perimeter = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
  // lisser les anneaux
  for (let i = 0; i < bodies.length; i++) {
    const targetLength = Math.min(1, (bodies[i].snake.length || 0) / TARGET_LENGTH);
    bodies[i].ring += (targetLength - bodies[i].ring) * Math.min(1, (dt || 0.016) * 3.5); // montee plus soyeuse (Abdel : « more smooth »)
  }
  // Tenue : pendant les TENUE_DUEL secondes ou un camp tient son anneau plein, son demi-anneau
  // bat de plus en plus vite et s'epaissit, et un compte a rebours 5-4-3-2-1 s'affiche au haut-centre
  // dans sa couleur. C'est l'instant ou l'autre camp doit couper : il faut qu'on le voie.
  const holdOf = (i) =>
    bodies[i] && round.state === 'playing' ? Math.min(HOLD_SECONDS, bodies[i].hold || 0) : 0;
  // Respiration lente (2 Hz max) et sans saut de largeur : la version battante a 8-26 rad/s
  // scintillait (Abdel : « there a flicker of the jauge bar on the cooldown its not pleasing »).
  const beat = (holdTime) => (holdTime > 0 ? 0.5 + 0.5 * Math.sin(t * 4) : 0);
  ctx.save();
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // piste vide
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
  // Or : tiret FINIT au haut-centre (anti-horaire sur le chemin horaire = offset inverse)
  // Jauges de longueur sur la bordure : « deglutition », tempo vif 1 s, validee par Abdel apres
  // maquettes (K2, puis mouvement soyeux, puis rendu net). La jauge est le corps du serpent : a
  // chaque baie mangee, un renflement lisse part de l'origine (haut-centre), glisse jusqu'a la
  // pointe et s'y fond pendant que la ligne s'allonge. Recette du mouvement, a ne pas simplifier :
  //  - position du renflement en smootherstep (depart et arrivee sans a-coup) ;
  //  - amplitude qui nait en fondu (22 % du trajet) et se resorbe (26 derniers %) ;
  //  - la longueur ne grandit qu'a 72 % du trajet, donc le renflement se fond dans la pointe ;
  //  - la longueur suit un ressort amorti critique (aucun depassement, aucune oscillation) ;
  //  - temps reel (dtRendu). Rendu seul : rien ici ne touche au jeu.
  // Le renflement est borne a 7,7 px de demi-epaisseur : le rail du timer est a 12 px (trait 7 px).
  const GULP_DURATION = 1.0,
    smooth = (v) => {
      v = Math.max(0, Math.min(1, v));
      return v * v * v * (v * (6 * v - 15) + 10);
    };
  for (let i = 0; i < bodies.length && i < 2; i++) {
    const c = bodies[i],
      clockwise = i === 1,
      rgb = i === 0 ? '242,197,124' : '180,212,222',
      highlight = i === 0 ? '255,238,206' : '228,243,249';
    const L = c.snake.length || 0,
      pxPerSegment = perimeter / 2 / TARGET_LENGTH;
    if (c.gaugeLevel === undefined) {
      c.gaugeLevel = 0;
      c.gaugeVelocity = 0;
      c.gaugeEvents = [];
      c.gaugeLength = L;
    }
    if (L > c.gaugeLength && round.state === 'playing')
      c.gaugeEvents.push({ q: 0, done: false, gain: (L - c.gaugeLength) * pxPerSegment });
    c.gaugeLength = L;
    let pending = 0;
    for (let k = c.gaugeEvents.length - 1; k >= 0; k--) {
      const e = c.gaugeEvents[k];
      e.q += frameDt / GULP_DURATION;
      if (!e.done && e.q >= 0.72) e.done = true;
      if (e.q >= 1) {
        c.gaugeEvents.splice(k, 1);
        continue;
      }
      if (!e.done) pending += e.gain;
    }
    const target = Math.max(0, Math.min(perimeter / 2, L * pxPerSegment) - pending),
      wr = 6.5;
    c.gaugeVelocity += (wr * wr * (target - c.gaugeLevel) - 2 * wr * c.gaugeVelocity) * frameDt;
    c.gaugeLevel += c.gaugeVelocity * frameDt;
    if (c.gaugeLevel < 0) {
      c.gaugeLevel = 0;
      c.gaugeVelocity = 0;
    }
    const Lb = Math.max(c.gaugeLevel, c.gaugeEvents.length ? 16 : 0);
    if (Lb < 1) continue;
    const holdTime = holdOf(i),
      beatVal = beat(holdTime),
      baseThickness = (holdTime > 0 ? 6 : 3.1) + 0.15 * Math.sin(t * 1.3 + i * 1.7);
    const gulps = c.gaugeEvents.map((e) => ({
      pos: smooth(e.q) * Lb,
      a: smooth(e.q / 0.22) * (1 - smooth((e.q - 0.74) / 0.26)),
    }));
    const halfThick = (d) => {
      let h2 = baseThickness;
      for (const g of gulps) h2 += 4.6 * g.a * Math.exp(-Math.pow((d - g.pos) / 19, 2));
      return h2;
    };
    const railPoint = (d) => pointRail(x, y, w, h, r, clockwise ? d : (perimeter - d) % perimeter);
    // le corps : un contour exterieur, un contour interieur, deux bouts arrondis a la bonne epaisseur
    // Perf : un seul point de rail par echantillon (pas de 4 px), la tangente vient des voisins
    const N = Math.max(6, Math.ceil(Lb / 4)),
      outer = [],
      inner = [],
      back = [],
      ends = [null, null],
      centerline = [];
    for (let k = 0; k <= N; k++) centerline.push(railPoint((Lb * k) / N));
    for (let k = 0; k <= N; k++) {
      const d = (Lb * k) / N,
        a = centerline[Math.max(0, k - 1)],
        b2 = centerline[Math.min(N, k + 1)],
        m = centerline[k];
      let tx = b2.x - a.x,
        ty = b2.y - a.y;
      const nn = Math.hypot(tx, ty) || 1;
      tx /= nn;
      ty /= nn;
      const sg = clockwise ? 1 : -1,
        nx = ty * sg,
        ny = -tx * sg,
        h2 = halfThick(d); // (nx,ny) pointe vers l'exterieur du plateau
      outer.push({ x: m.x + nx * h2, y: m.y + ny * h2 });
      inner.push({ x: m.x - nx * h2, y: m.y - ny * h2 });
      back.push({ x: m.x + nx * (h2 - 1.8), y: m.y + ny * (h2 - 1.8) });
      if (k === 0) ends[0] = { m, tx: -tx, ty: -ty, nx: -nx, ny: -ny, h: h2 };
      if (k === N) ends[1] = { m, tx, ty, nx, ny, h: h2 };
    }
    // demi-cercle de l'exterieur vers l'interieur, en passant par le sens de la tangente
    const drawCap = (e) => {
      for (let q = 1; q < 6; q++) {
        const an = (Math.PI * q) / 6,
          ct = Math.sin(an),
          cn = Math.cos(an);
        ctx.lineTo(e.m.x + (e.tx * ct + e.nx * cn) * e.h, e.m.y + (e.ty * ct + e.ny * cn) * e.h);
      }
    };
    ctx.beginPath();
    ctx.moveTo(outer[0].x, outer[0].y);
    for (let k = 1; k <= N; k++) ctx.lineTo(outer[k].x, outer[k].y);
    drawCap(ends[1]);
    for (let k = N; k >= 0; k--) ctx.lineTo(inner[k].x, inner[k].y);
    drawCap(ends[0]);
    ctx.closePath();
    // Perf : halo imite par un contour large et translucide ; le vrai flou ne sert que pendant la tenue
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.13)';
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.2)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(' + rgb + ',0.96)';
    if (holdTime > 0) {
      ctx.shadowColor = 'rgba(' + rgb + ',' + (0.45 + 0.35 * beatVal) + ')';
      ctx.shadowBlur = 10 + 16 * beatVal;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.clip();
    // filet de lumiere qui suit le dos
    ctx.strokeStyle = 'rgba(' + highlight + ',0.45)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let k = 2; k <= N - 2; k++) {
      if (k === 2) ctx.moveTo(back[k].x, back[k].y);
      else ctx.lineTo(back[k].x, back[k].y);
    }
    ctx.stroke();
    // la baie qui voyage a l'interieur : une lueur douce, jamais une tache nette
    for (const g of gulps) {
      if (g.a < 0.02) continue;
      const m = railPoint(g.pos);
      const gr = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 12);
      gr.addColorStop(0, 'rgba(' + highlight + ',' + 0.95 * g.a + ')');
      gr.addColorStop(0.5, 'rgba(' + highlight + ',' + 0.5 * g.a + ')');
      gr.addColorStop(1, 'rgba(' + highlight + ',0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (round.state === 'playing') {
    const matchDuration = settings.duelDuration || settings.duration,
      remaining = Math.max(0, 1 - round.t / matchDuration);
    const ex = x - 12,
      ey = y - 12,
      ew = w + 24,
      eh = h + 24,
      er = r + 12,
      shieldEdge = 2 * (ew + eh) - 8 * er + 2 * Math.PI * er;
    // Visibilite (Abdel : « the red timer is still not visible enough », sans lisere noir) : trait de
    // 7 px au lieu de 4, rouge plus vif, rail vide plus marque.
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(228,64,58,0.26)';
    ctx.beginPath();
    ctx.roundRect(ex, ey, ew, eh, er);
    ctx.stroke();
    if (remaining > 0.001) {
      const len = shieldEdge * remaining,
        urgent = round.t > matchDuration - 15;
      // Perf : un shadowBlur sur un trait qui fait le tour du plateau force le navigateur a flouter
      // toute la surface du plateau a chaque image (mesure : 3,5 ms contre 0,25 ms sans flou). Le halo
      // est donc imite par deux traits plus larges et translucides sous le trait franc.
      const intensity = urgent ? 0.65 + 0.35 * Math.sin(t * 6) : 0.95;
      ctx.setLineDash([len, shieldEdge - len]);
      ctx.lineDashOffset = -(ew / 2 - er);
      [
        [urgent ? 19 : 15, 0.09],
        [urgent ? 13 : 11, 0.15],
        [7, intensity],
      ].forEach(([lw2, al]) => {
        ctx.lineWidth = lw2;
        ctx.strokeStyle = 'rgba(240,78,62,' + al + ')';
        ctx.beginPath();
        ctx.roundRect(ex, ey, ew, eh, er);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.lineWidth = 7;
      // Meche du timer, proposition K validee par Abdel (« braise et poussieres », sans lisere noir,
      // critere : subtil, satisfaisant, dans le ton du jeu). Les derniers centimetres du trait se
      // rechauffent (rouge, ambre, blanc chaud), une braise respire lentement a la pointe, et de
      // rares grains ambres montent puis s'eteignent. Rendu seul : rien ici ne touche au jeu.
      const timerRailPoint = (s) => pointRail(ex, ey, ew, eh, er, Math.max(0, s)),
        tip = timerRailPoint(len);
      for (let i = 12; i >= 0; i--) {
        const q = timerRailPoint(len - i * 7),
          f = 1 - i / 12;
        ctx.fillStyle =
          'rgba(255,' +
          Math.round(120 + 110 * f) +
          ',' +
          Math.round(70 + 120 * f * f) +
          ',' +
          0.85 * f * f +
          ')';
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const breath = 0.5 + 0.5 * Math.sin(t * 2.6);
      ctx.shadowColor = 'rgba(255,150,70,0.9)';
      ctx.shadowBlur = 16 + 16 * breath;
      ctx.fillStyle =
        'rgb(255,' + Math.round(200 + 40 * breath) + ',' + Math.round(150 + 60 * breath) + ')';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 6.5 + 2 * breath, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (Math.random() < Math.min(1, frameDt * 2.7))
        timerSmoke.push({
          x: tip.x + (Math.random() - 0.5) * 12,
          y: tip.y,
          vx: (Math.random() - 0.5) * 16,
          vy: -25 - Math.random() * 18,
          l: 0,
          m: 2.2 + Math.random(),
        });
      for (let i = timerSmoke.length - 1; i >= 0; i--) {
        const g = timerSmoke[i];
        g.l += frameDt;
        if (g.l >= g.m) {
          timerSmoke.splice(i, 1);
          continue;
        }
        g.x += (g.vx + Math.sin(g.l * 2.2) * 14) * frameDt;
        g.y += g.vy * frameDt;
        ctx.fillStyle = 'rgba(255,205,150,' + 0.7 * Math.sin((Math.PI * g.l) / g.m) + ')';
        ctx.beginPath();
        ctx.arc(g.x, g.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else timerSmoke.length = 0;
    ctx.lineWidth = 6;
  }
  // compte a rebours de la tenue, au haut-centre, dans la couleur du camp qui tient
  for (let i = 0; i < bodies.length; i++) {
    const holdTime = holdOf(i);
    if (holdTime <= 0) continue;
    const remaining = Math.max(1, Math.ceil(HOLD_SECONDS - holdTime));
    const frac = HOLD_SECONDS - holdTime - (remaining - 1); // 1 -> 0 au fil de la seconde
    const tint = i === 0 ? GOLD : SHADOW,
      rgb = i === 0 ? '242,197,124' : '180,212,222';
    const cx = W / 2,
      cy = Y0 - 14,
      scale = 1 + 0.35 * (1 - frac); // le chiffre gonfle en fin de seconde
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 92px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(12,17,14,0.75)';
    ctx.beginPath();
    ctx.arc(0, 0, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'rgba(' + rgb + ',0.9)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = tint;
    ctx.fillText(String(remaining), 0, 4);
    ctx.restore();
  }
  // flash rouge de recul par camp
  for (let i = 0; i < bodies.length; i++) {
    const rt = bodies[i].recoilTime || 0;
    if (rt > 0) {
      ctx.save();
      ctx.globalAlpha = 0.14 * (rt / 0.9);
      ctx.fillStyle = 'rgba(228,64,58,1)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
  ctx.restore();
}

// icones du rail duel (memes traces que coeur/ecusson de peindreGrade, qui y sont locales)
function duelHeart(icx, icy, s) {
  // coeur classique et symetrique : deux lobes ronds, une pointe (le trace de peindreGrade se deformait a 24 px)
  ctx.beginPath();
  ctx.moveTo(icx, icy + s * 0.85);
  ctx.bezierCurveTo(
    icx - s * 1.15,
    icy - s * 0.05,
    icx - s * 0.6,
    icy - s * 0.95,
    icx,
    icy - s * 0.35,
  );
  ctx.bezierCurveTo(
    icx + s * 0.6,
    icy - s * 0.95,
    icx + s * 1.15,
    icy - s * 0.05,
    icx,
    icy + s * 0.85,
  );
  ctx.closePath();
}

function duelShield(icx, icy, s) {
  ctx.beginPath();
  ctx.moveTo(icx, icy - s);
  ctx.lineTo(icx + s * 0.8, icy - s * 0.6);
  ctx.lineTo(icx + s * 0.8, icy + s * 0.1);
  ctx.bezierCurveTo(icx + s * 0.8, icy + s * 0.7, icx, icy + s, icx, icy + s);
  ctx.bezierCurveTo(icx, icy + s, icx - s * 0.8, icy + s * 0.7, icx - s * 0.8, icy + s * 0.1);
  ctx.lineTo(icx - s * 0.8, icy - s * 0.6);
  ctx.closePath();
}

export function paintDuelStatus() {
  if (!round || round.state !== 'playing') return;
  // memes coordonnees que peindreGrade
  const RCX_LEFT = X0 - 82,
    RCX_RIGHT = X0 + COLS * CELL + 82;
  const RY0 = Y0 + 7;
  const GAUGE_Y_BOTTOM = RY0 + 26 + 4 * 52 + 16 + 20 + 220;
  const GAUGE_Y_TOP = GAUGE_Y_BOTTOM - 220,
    GAUGE_W = 40,
    GAUGE_H = 220;
  const teams = [
    { c: bodies[0], cx: RCX_LEFT, rgb: '242,197,124', tint: GOLD },
    { c: bodies[1], cx: RCX_RIGHT, rgb: '180,212,222', tint: SHADOW },
  ];
  ctx.save();
  teams.forEach(({ c, cx, rgb, tint: tint }) => {
    if (!c) return;
    const surge = Math.min(1, (c.boostTime || 0) / BOOST_DURATION); // la jauge se vide sur 10 s (le tempo paye)
    const invincible = (c.invincibleTime || 0) > 0;
    const cut = (c.cutTime || 0) > 0;
    // fond
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.roundRect(cx - GAUGE_W / 2, GAUGE_Y_TOP, GAUGE_W, GAUGE_H, GAUGE_W / 2);
    ctx.fill();
    // barre de poussee de tempo
    if (surge > 0.002) {
      const fillH = Math.round(GAUGE_H * surge);
      ctx.fillStyle = cut ? 'rgba(228,64,58,0.92)' : 'rgba(' + rgb + ',0.88)';
      ctx.shadowColor = 'rgba(' + rgb + ',0.55)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.roundRect(cx - GAUGE_W / 2, GAUGE_Y_BOTTOM - fillH, GAUGE_W, fillH, GAUGE_W / 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // lueur invincibilite
    if (invincible) {
      ctx.save();
      ctx.globalAlpha = 0.4 + 0.3 * Math.sin(t * 8);
      ctx.shadowColor = 'rgba(' + rgb + ',0.9)';
      ctx.shadowBlur = 30;
      ctx.strokeStyle = 'rgba(' + rgb + ',0.7)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(cx - GAUGE_W / 2, GAUGE_Y_TOP, GAUGE_W, GAUGE_H, GAUGE_W / 2);
      ctx.stroke();
      ctx.restore();
    }
    // Danger : serpent adulte sous SURSIS_DUEL anneaux. Triangle rouge a point d'exclamation au-dessus de
    // la jauge, qui bat (Abdel : « icon on the side to indicate to team that its dangerous instead of jauge in red »).
    // Visible des que le serpent est sous 5 anneaux hors eclosion (naissance a 5 : sous 5 = il a ete coupe).
    // Abdel : « i dont see the warning icon » : la condition 'adulte' le cachait presque toujours.
    if (!c.egg && c.snake.length > 0 && c.snake.length < REPRIEVE_LENGTH) {
      const dy = GAUGE_Y_TOP - 44,
        dangerSize = 22,
        al = 0.6 + 0.4 * Math.sin(t * 6);
      ctx.save();
      ctx.globalAlpha = al;
      ctx.fillStyle = 'rgba(228,64,58,1)';
      ctx.shadowColor = 'rgba(228,64,58,0.9)';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(cx, dy - dangerSize);
      ctx.lineTo(cx + dangerSize * 0.95, dy + dangerSize * 0.7);
      ctx.lineTo(cx - dangerSize * 0.95, dy + dangerSize * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', cx, dy + 4);
      ctx.restore();
    }
    // boucliers et vies offerts : ecussons puis coeurs en colonne sous la jauge, dans la teinte du camp.
    // Une pare (pareT) fait clignoter la colonne en blanc.
    {
      const parried = (c.parryTime || 0) > 0;
      let iconY = GAUGE_Y_BOTTOM + 48;
      const s = 24; // icones grandes et nettes (Abdel : trop petites, pas explicites)
      ctx.save();
      if ((c.shieldTime || 0) > 0) {
        // ecusson plein + anneau de compte a rebours qui se vide (fraction du temps restant sur 15 s)
        const shieldFrac = Math.min(1, c.shieldTime / SHIELD_DURATION);
        ctx.fillStyle = parried ? 'rgba(255,255,255,0.95)' : 'rgba(' + rgb + ',0.9)';
        ctx.shadowColor = 'rgba(' + rgb + ',0.6)';
        ctx.shadowBlur = 10;
        duelShield(cx, iconY, s);
        ctx.fill();
        ctx.shadowBlur = 0;
        // contour blanc et croix interieure : un ecusson qu'on lit a la taille d'un pouce
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        duelShield(cx, iconY, s);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(12,17,14,0.7)';
        ctx.beginPath();
        ctx.moveTo(cx, iconY - s * 0.55);
        ctx.lineTo(cx, iconY + s * 0.5);
        ctx.moveTo(cx - s * 0.45, iconY - s * 0.1);
        ctx.lineTo(cx + s * 0.45, iconY - s * 0.1);
        ctx.stroke();
        // anneau de compte a rebours : fond gris, arc qui se vide dans le sens horaire
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath();
        ctx.arc(cx, iconY, s + 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = parried ? 'rgba(255,255,255,0.95)' : 'rgba(' + rgb + ',0.95)';
        ctx.shadowColor = 'rgba(' + rgb + ',0.7)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(cx, iconY, s + 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * shieldFrac);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // secondes restantes, en petit sous l'anneau
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '700 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.ceil(c.shieldTime) + 's', cx, iconY + s + 30);
        iconY += s * 2 + 58;
      }
      // vies offertes : un coeur par vie, meme taille et meme traitement que l'ecusson (Abdel :
      // « life icons when gifted are also shown on the side »), lisibles a la taille d'un pouce
      // sans plafond : jusqu'a 4 coeurs en colonne, au-dela un seul coeur et le compte 'x N'
      const lifeCount = c.lives || 0,
        drawCount = lifeCount > 4 ? 1 : lifeCount;
      for (let k = 0; k < drawCount; k++) {
        if (k === 0) iconY += 6;
        // rouge pour les deux camps (Abdel : « they are red and same ui style as shield »)
        ctx.fillStyle = parried ? 'rgba(255,255,255,0.95)' : 'rgba(228,64,58,0.95)';
        ctx.shadowColor = 'rgba(228,64,58,0.7)';
        ctx.shadowBlur = 14;
        duelHeart(cx, iconY, s);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        duelHeart(cx, iconY, s);
        ctx.stroke();
        if (lifeCount > 4) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.font = '700 22px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('x' + lifeCount, cx, iconY + s * 1.4);
        }
        iconY += s * 2.2;
      }
      ctx.restore();
    }
    // Eclair de tempo (Abdel : gris inactif, couleur du camp actif, lisible) : pastille sombre dans la
    // barre, eclair 20 px dessus. Inactif : gris. Actif : couleur du camp, lueur, battement.
    {
      const isActive = (c.boostTime || 0) > 0,
        ex = cx,
        ey = GAUGE_Y_TOP + 40,
        es = 20;
      ctx.save();
      ctx.fillStyle = 'rgba(8,12,10,0.88)';
      ctx.beginPath();
      ctx.arc(ex, ey, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isActive ? 'rgba(' + rgb + ',0.9)' : 'rgba(255,255,255,0.22)';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex + es * 0.35, ey - es);
      ctx.lineTo(ex - es * 0.55, ey + es * 0.15);
      ctx.lineTo(ex - es * 0.05, ey + es * 0.15);
      ctx.lineTo(ex - es * 0.35, ey + es);
      ctx.lineTo(ex + es * 0.55, ey - es * 0.15);
      ctx.lineTo(ex + es * 0.05, ey - es * 0.15);
      ctx.closePath();
      if (isActive) {
        ctx.shadowColor = 'rgba(' + rgb + ',1)';
        ctx.shadowBlur = 18;
        ctx.fillStyle = tint;
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 10);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
      }
      ctx.fill();
      ctx.restore();
    }
    // eclair de coupe : barre blanche breve
    if (cut) {
      ctx.save();
      ctx.globalAlpha = 0.7 * (c.cutTime / 0.9);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.roundRect(cx - GAUGE_W / 2, GAUGE_Y_TOP, GAUGE_W, GAUGE_H, GAUGE_W / 2);
      ctx.fill();
      ctx.restore();
    }
  });
  ctx.restore();
}
