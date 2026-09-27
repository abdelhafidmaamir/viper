// Duel HUD: the two half-rings around the board, each team's status column (shield, life,
// speed) and the heart and crest glyphs they use.

import type { Body, GaugeEvent, Point } from './types.ts';
import { CELL, COLS, H, ROWS, W, X0, Y0 } from './layout.ts';
import { ctx } from './canvas.ts';
import { SHADOW, GOLD } from './palette.ts';
import { SHIELD_DURATION, TARGET_LENGTH, REPRIEVE_LENGTH, BOOST_DURATION } from './rules.ts';
import { frameDt, pointRail } from './frame.ts';
import { HOLD_SECONDS, bodies, round, settings, t } from '../scripts/game.ts';

interface SmokeParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  l: number;
  m: number;
}

interface CapPoint {
  m: Point;
  tx: number;
  ty: number;
  nx: number;
  ny: number;
  h: number;
}

// Smoke puffs shed by the burning timer rail.
const timerSmoke: SmokeParticle[] = [];

export function paintDuel(dt: number): void {
  const ro = round;
  if (!ro) return;
  const x = X0 - 14,
    y = Y0 - 14,
    w = COLS * CELL + 28,
    h = ROWS * CELL + 28,
    r = 18;
  const perimeter = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
  // smooth the rings toward their target
  for (const c of bodies) {
    const targetLength = Math.min(1, (c.snake.length || 0) / TARGET_LENGTH);
    c.ring += (targetLength - c.ring) * Math.min(1, (dt || 0.016) * 3.5); // smoother rise
  }
  // Hold: while a team keeps its ring full for HOLD_SECONDS, its half-ring pulses faster
  // and thickens, and a 5-4-3-2-1 countdown appears at the top center in its color.
  // This is the moment the opposing team must cut: it must be unmissable.
  const holdOf = (i: number): number => {
    const body = bodies[i];
    return body && ro.state === 'playing' ? Math.min(HOLD_SECONDS, body.hold ?? 0) : 0;
  };
  // Slow pulse (2 Hz max) with no width jump: the earlier 8-26 rad/s version
  // caused a visible flicker on the cooldown bar.
  const beat = (holdTime: number): number => (holdTime > 0 ? 0.5 + 0.5 * Math.sin(t * 4) : 0);
  ctx.save();
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // empty track
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.stroke();
  // Gold team: dash ENDS at the top center (counter-clockwise on a clockwise path = inverted offset).
  // Length gauges on the border use a "gulp" animation, 1 s, brisk tempo. The gauge represents
  // the snake body: each berry eaten sends a smooth bulge from the origin (top center) to the
  // tip while the line grows. Motion recipe, do not simplify:
  //  - bulge position on smootherstep (no snap at start or end);
  //  - amplitude fades in (first 22% of travel) and back out (last 26%);
  //  - the length only grows at 72% of travel, so the bulge merges into the tip;
  //  - length follows a critically damped spring (no overshoot, no oscillation);
  //  - uses real frame time (frameDt). Render-only: nothing here touches the game state.
  // The bulge is capped at 7.7 px half-thickness: the timer rail sits at 12 px (7 px stroke).
  const GULP_DURATION = 1.0,
    smooth = (v: number): number => {
      v = Math.max(0, Math.min(1, v));
      return v * v * v * (v * (6 * v - 15) + 10);
    };
  for (let i = 0; i < bodies.length && i < 2; i++) {
    const c = bodies[i];
    if (!c) continue;
    const clockwise = i === 1,
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
    // gaugeLevel, gaugeVelocity, gaugeEvents and gaugeLength are initialized above when undefined
    const events = c.gaugeEvents ?? [];
    const gaugeLength = c.gaugeLength ?? L;
    if (L > gaugeLength && ro.state === 'playing')
      events.push({ q: 0, done: false, gain: (L - gaugeLength) * pxPerSegment });
    c.gaugeLength = L;
    let pending = 0;
    for (let k = events.length - 1; k >= 0; k--) {
      const e = events[k];
      if (!e) continue; // invariant: k < events.length
      e.q += frameDt / GULP_DURATION;
      if (!e.done && e.q >= 0.72) e.done = true;
      if (e.q >= 1) {
        events.splice(k, 1);
        continue;
      }
      if (!e.done) pending += e.gain;
    }
    const target = Math.max(0, Math.min(perimeter / 2, L * pxPerSegment) - pending),
      wr = 6.5;
    c.gaugeVelocity =
      (c.gaugeVelocity ?? 0) +
      (wr * wr * (target - (c.gaugeLevel ?? 0)) - 2 * wr * (c.gaugeVelocity ?? 0)) * frameDt;
    c.gaugeLevel = (c.gaugeLevel ?? 0) + (c.gaugeVelocity ?? 0) * frameDt;
    if (c.gaugeLevel < 0) {
      c.gaugeLevel = 0;
      c.gaugeVelocity = 0;
    }
    const Lb = Math.max(c.gaugeLevel, events.length ? 16 : 0);
    if (Lb < 1) continue;
    const holdTime = holdOf(i),
      beatVal = beat(holdTime),
      baseThickness = (holdTime > 0 ? 6 : 3.1) + 0.15 * Math.sin(t * 1.3 + i * 1.7);
    const gulps: { pos: number; a: number }[] = events.map((e: GaugeEvent) => ({
      pos: smooth(e.q) * Lb,
      a: smooth(e.q / 0.22) * (1 - smooth((e.q - 0.74) / 0.26)),
    }));
    const halfThick = (d: number): number => {
      let h2 = baseThickness;
      for (const g of gulps) h2 += 4.6 * g.a * Math.exp(-Math.pow((d - g.pos) / 19, 2));
      return h2;
    };
    const railPoint = (d: number): Point =>
      pointRail(x, y, w, h, r, clockwise ? d : (perimeter - d) % perimeter);
    // body: outer outline, inner outline, two rounded caps at the correct thickness.
    // Perf: one rail point per sample (4 px step), tangent derived from neighbors.
    const N = Math.max(6, Math.ceil(Lb / 4)),
      outer: Point[] = [],
      inner: Point[] = [],
      back: Point[] = [],
      ends: [CapPoint | null, CapPoint | null] = [null, null],
      centerline: Point[] = [];
    for (let k = 0; k <= N; k++) centerline.push(railPoint((Lb * k) / N));
    for (let k = 0; k <= N; k++) {
      const d = (Lb * k) / N;
      const a = centerline[Math.max(0, k - 1)];
      const b2 = centerline[Math.min(N, k + 1)];
      const m = centerline[k];
      if (!a || !b2 || !m) continue; // invariant: indices in 0..N, centerline has N+1 elements
      let tx = b2.x - a.x,
        ty = b2.y - a.y;
      const nn = Math.hypot(tx, ty) || 1;
      tx /= nn;
      ty /= nn;
      const sg = clockwise ? 1 : -1,
        nx = ty * sg,
        ny = -tx * sg,
        h2 = halfThick(d); // (nx,ny) points outward from the board
      outer.push({ x: m.x + nx * h2, y: m.y + ny * h2 });
      inner.push({ x: m.x - nx * h2, y: m.y - ny * h2 });
      back.push({ x: m.x + nx * (h2 - 1.8), y: m.y + ny * (h2 - 1.8) });
      if (k === 0) ends[0] = { m, tx: -tx, ty: -ty, nx: -nx, ny: -ny, h: h2 };
      if (k === N) ends[1] = { m, tx, ty, nx, ny, h: h2 };
    }
    // semicircle from outer to inner edge, following the tangent direction
    const drawCap = (e: CapPoint): void => {
      for (let q = 1; q < 6; q++) {
        const an = (Math.PI * q) / 6,
          ct = Math.sin(an),
          cn = Math.cos(an);
        ctx.lineTo(e.m.x + (e.tx * ct + e.nx * cn) * e.h, e.m.y + (e.ty * ct + e.ny * cn) * e.h);
      }
    };
    const outer0 = outer[0],
      cap0 = ends[0],
      cap1 = ends[1];
    if (!outer0 || !cap0 || !cap1) continue; // invariant: all set after the loop above (N >= 6)
    ctx.beginPath();
    ctx.moveTo(outer0.x, outer0.y);
    for (let k = 1; k <= N; k++) {
      const op = outer[k];
      if (!op) continue; // invariant: k <= N < outer.length
      ctx.lineTo(op.x, op.y);
    }
    drawCap(cap1);
    for (let k = N; k >= 0; k--) {
      const ip = inner[k];
      if (!ip) continue; // invariant: k in 0..N
      ctx.lineTo(ip.x, ip.y);
    }
    drawCap(cap0);
    ctx.closePath();
    // Perf: halo faked with a wide translucent stroke; real blur is used only during the hold
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.13)';
    ctx.stroke();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.2)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(' + rgb + ',0.96)';
    if (holdTime > 0) {
      ctx.shadowColor = 'rgba(' + rgb + ',' + String(0.45 + 0.35 * beatVal) + ')';
      ctx.shadowBlur = 10 + 16 * beatVal;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.save();
    ctx.clip();
    // light thread following the top edge
    ctx.strokeStyle = 'rgba(' + highlight + ',0.45)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let k = 2; k <= N - 2; k++) {
      const bk = back[k];
      if (!bk) continue; // invariant: k in 2..N-2, back has N+1 elements
      if (k === 2) ctx.moveTo(bk.x, bk.y);
      else ctx.lineTo(bk.x, bk.y);
    }
    ctx.stroke();
    // the berry traveling inside: a soft glow, never a sharp dot
    for (const g of gulps) {
      if (g.a < 0.02) continue;
      const m = railPoint(g.pos);
      const gr = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 12);
      gr.addColorStop(0, 'rgba(' + highlight + ',' + String(0.95 * g.a) + ')');
      gr.addColorStop(0.5, 'rgba(' + highlight + ',' + String(0.5 * g.a) + ')');
      gr.addColorStop(1, 'rgba(' + highlight + ',0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (ro.state === 'playing') {
    const matchDuration = settings.duelDuration || settings.duration,
      remaining = Math.max(0, 1 - ro.t / matchDuration);
    const ex = x - 12,
      ey = y - 12,
      ew = w + 24,
      eh = h + 24,
      er = r + 12,
      shieldEdge = 2 * (ew + eh) - 8 * er + 2 * Math.PI * er;
    // Visibility: 7 px stroke instead of 4, brighter red, more visible empty track.
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(228,64,58,0.26)';
    ctx.beginPath();
    ctx.roundRect(ex, ey, ew, eh, er);
    ctx.stroke();
    if (remaining > 0.001) {
      const len = shieldEdge * remaining,
        urgent = ro.t > matchDuration - 15;
      // Perf: a shadowBlur on a stroke that wraps the board forces the browser to blur
      // the entire board surface each frame (measured: 3.5 ms vs 0.25 ms without blur).
      // The halo is faked with two wider translucent strokes under the solid one.
      const intensity = urgent ? 0.65 + 0.35 * Math.sin(t * 6) : 0.95;
      ctx.setLineDash([len, shieldEdge - len]);
      ctx.lineDashOffset = -(ew / 2 - er);
      const layers: [number, number][] = [
        [urgent ? 19 : 15, 0.09],
        [urgent ? 13 : 11, 0.15],
        [7, intensity],
      ];
      layers.forEach(([lw2, al]) => {
        ctx.lineWidth = lw2;
        ctx.strokeStyle = 'rgba(240,78,62,' + String(al) + ')';
        ctx.beginPath();
        ctx.roundRect(ex, ey, ew, eh, er);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.lineWidth = 7;
      // Timer fuse: the last few centimeters of the stroke warm up (red, amber, warm white),
      // an ember breathes slowly at the tip, and sparse amber sparks rise and die out.
      // Render-only: nothing here touches the game state.
      const timerRailPoint = (s: number): Point => pointRail(ex, ey, ew, eh, er, Math.max(0, s)),
        tip = timerRailPoint(len);
      for (let i = 12; i >= 0; i--) {
        const q = timerRailPoint(len - i * 7),
          f = 1 - i / 12;
        ctx.fillStyle =
          'rgba(255,' +
          String(Math.round(120 + 110 * f)) +
          ',' +
          String(Math.round(70 + 120 * f * f)) +
          ',' +
          String(0.85 * f * f) +
          ')';
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const breath = 0.5 + 0.5 * Math.sin(t * 2.6);
      ctx.shadowColor = 'rgba(255,150,70,0.9)';
      ctx.shadowBlur = 16 + 16 * breath;
      ctx.fillStyle =
        'rgb(255,' +
        String(Math.round(200 + 40 * breath)) +
        ',' +
        String(Math.round(150 + 60 * breath)) +
        ')';
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
        if (!g) continue; // invariant: i < timerSmoke.length
        g.l += frameDt;
        if (g.l >= g.m) {
          timerSmoke.splice(i, 1);
          continue;
        }
        g.x += (g.vx + Math.sin(g.l * 2.2) * 14) * frameDt;
        g.y += g.vy * frameDt;
        ctx.fillStyle = 'rgba(255,205,150,' + String(0.7 * Math.sin((Math.PI * g.l) / g.m)) + ')';
        ctx.beginPath();
        ctx.arc(g.x, g.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else timerSmoke.length = 0;
    ctx.lineWidth = 6;
  }
  // hold countdown at the top center, in the holding team's color
  for (let i = 0; i < bodies.length; i++) {
    const holdTime = holdOf(i);
    if (holdTime <= 0) continue;
    const remaining = Math.max(1, Math.ceil(HOLD_SECONDS - holdTime));
    const frac = HOLD_SECONDS - holdTime - (remaining - 1); // 1 -> 0 across the second
    const tint = i === 0 ? GOLD : SHADOW,
      rgb = i === 0 ? '242,197,124' : '180,212,222';
    const cx = W / 2,
      cy = Y0 - 14,
      scale = 1 + 0.35 * (1 - frac); // digit scales up at the end of each second
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
  // red recoil flash per team
  for (const b of bodies) {
    const rt = b.recoilTime;
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

// duel rail icons (same shapes as the heart/shield in paintDuelStatus, defined locally there)
function duelHeart(icx: number, icy: number, s: number): void {
  // symmetric heart: two round lobes, one point (the earlier shape distorted at 24 px)
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

function duelShield(icx: number, icy: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(icx, icy - s);
  ctx.lineTo(icx + s * 0.8, icy - s * 0.6);
  ctx.lineTo(icx + s * 0.8, icy + s * 0.1);
  ctx.bezierCurveTo(icx + s * 0.8, icy + s * 0.7, icx, icy + s, icx, icy + s);
  ctx.bezierCurveTo(icx, icy + s, icx - s * 0.8, icy + s * 0.7, icx - s * 0.8, icy + s * 0.1);
  ctx.lineTo(icx - s * 0.8, icy - s * 0.6);
  ctx.closePath();
}

export function paintDuelStatus(): void {
  const ro = round;
  if (ro?.state !== 'playing') return;
  // same coordinates as paintDuelStatus
  const RCX_LEFT = X0 - 82,
    RCX_RIGHT = X0 + COLS * CELL + 82;
  const RY0 = Y0 + 7;
  const GAUGE_Y_BOTTOM = RY0 + 26 + 4 * 52 + 16 + 20 + 220;
  const GAUGE_Y_TOP = GAUGE_Y_BOTTOM - 220,
    GAUGE_W = 40,
    GAUGE_H = 220;
  const bs = bodies;
  const teams: { c: Body | undefined; cx: number; rgb: string; tint: string }[] = [
    { c: bs[0], cx: RCX_LEFT, rgb: '242,197,124', tint: GOLD },
    { c: bs[1], cx: RCX_RIGHT, rgb: '180,212,222', tint: SHADOW },
  ];
  ctx.save();
  teams.forEach(({ c, cx, rgb, tint }) => {
    if (!c) return;
    const surge = Math.min(1, (c.boostTime || 0) / BOOST_DURATION); // the gauge drains over the 10 s paid boost
    const invincible = (c.invincibleTime || 0) > 0;
    const cut = (c.cutTime || 0) > 0;
    // background
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.roundRect(cx - GAUGE_W / 2, GAUGE_Y_TOP, GAUGE_W, GAUGE_H, GAUGE_W / 2);
    ctx.fill();
    // boost gauge bar
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
    // invincibility glow
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
    // Danger: snake below REPRIEVE_LENGTH segments. Red triangle with exclamation mark above
    // the gauge, pulsing. Shown as soon as the snake is below 5 segments outside hatching
    // (spawn length is 5, so below 5 means it has been cut). An earlier "adult" condition
    // hid the icon almost permanently, so it was removed.
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
    // Gifted shields and lives: shields then hearts in a column below the gauge, in team color.
    // A parry (parryTime) flashes the column white.
    {
      const parried = (c.parryTime || 0) > 0;
      let iconY = GAUGE_Y_BOTTOM + 48;
      const s = 24; // large, crisp icons: smaller ones did not read on stream
      ctx.save();
      if ((c.shieldTime || 0) > 0) {
        // full shield + countdown ring draining (fraction of remaining time over SHIELD_DURATION)
        const shieldFrac = Math.min(1, c.shieldTime / SHIELD_DURATION);
        ctx.fillStyle = parried ? 'rgba(255,255,255,0.95)' : 'rgba(' + rgb + ',0.9)';
        ctx.shadowColor = 'rgba(' + rgb + ',0.6)';
        ctx.shadowBlur = 10;
        duelShield(cx, iconY, s);
        ctx.fill();
        ctx.shadowBlur = 0;
        // white outline and inner cross: a shield readable at thumb size
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
        // countdown ring: gray background, arc draining clockwise
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
        // remaining seconds, small text below the ring
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '700 20px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.ceil(c.shieldTime)) + 's', cx, iconY + s + 30);
        iconY += s * 2 + 58;
      }
      // Gifted lives: one heart per life, same size and style as the shield, readable at thumb size.
      // No upper limit: up to 4 hearts in a column; beyond that, one heart with count 'x N'.
      const lifeCount = c.lives || 0,
        drawCount = lifeCount > 4 ? 1 : lifeCount;
      for (let k = 0; k < drawCount; k++) {
        if (k === 0) iconY += 6;
        // red for both teams, matching the shield style
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
          ctx.fillText('x' + String(lifeCount), cx, iconY + s * 1.4);
        }
        iconY += s * 2.2;
      }
      ctx.restore();
    }
    // Boost lightning icon: dark disc in the gauge, 20 px lightning bolt above it.
    // Inactive: gray. Active: team color with glow and pulse.
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
    // cut flash: brief white bar
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
