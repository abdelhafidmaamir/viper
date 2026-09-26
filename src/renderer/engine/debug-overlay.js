// Operator-only overlays: the AI debug layer (intent, reach, threats) and the LIVE safe-zone
// mock-up. Never shown on stream unless switched on from the control room.

import {
  CELL,
  COLS,
  ROWS,
  SR_Y,
  W,
  X0,
  Y0,
  Z_BANNER,
  Z_GIFTS,
  Z_COMMENTS,
  Z_INPUT,
} from './layout.js';
import { pill } from './scoreboard.js';
import { ctx } from './canvas.js';
import {
  activeIndex,
  loadBody,
  bodies,
  dir,
  nextDir,
  aiMemory,
  px,
  storeBody,
  snake,
  t,
} from '../scripts/game.js';

export function paintLiveMockup() {
  ctx.save();
  const GRAY = 'rgba(255,255,255,0.20)',
    DARK = 'rgba(0,0,0,0.42)',
    LIGHT = 'rgba(255,255,255,0.34)';

  // 1. Top area: dark veil, host avatar, Follow button, viewer counter, close button.
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.fillRect(0, 0, W, SR_Y);
  ctx.fillStyle = LIGHT;
  ctx.beginPath();
  ctx.arc(84, 150, 42, 0, Math.PI * 2);
  ctx.fill();
  pill(138, 126, 190, 26, LIGHT, 8); // nickname
  pill(138, 160, 96, 18, GRAY, 7); // follower count
  pill(404, 122, 150, 58, 'rgba(232,64,84,0.80)'); // + Suivre
  pill(740, 124, 180, 54, DARK); // avatars and viewer count
  ctx.fillStyle = LIGHT;
  [768, 806].forEach((x) => {
    ctx.beginPath();
    ctx.arc(x, 151, 21, 0, Math.PI * 2);
    ctx.fill();
  });
  pill(840, 142, 56, 18, LIGHT, 7);
  ctx.strokeStyle = LIGHT;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1002, 134);
  ctx.lineTo(1038, 170);
  ctx.moveTo(1038, 134);
  ctx.lineTo(1002, 170);
  ctx.stroke();
  // Second row: ranking, gallery, search.
  pill(30, 216, 368, 42, DARK, 12);
  pill(414, 216, 236, 42, DARK, 12);
  pill(666, 216, 384, 42, DARK, 12);

  // 2. Gift widget column, right side; defines the lower bound of the viewer counter.
  const Z = Z_GIFTS;
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.roundRect(Z.x, Z.y, Z.w, Z.h, 16);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const y = Z.y + 22 + i * 66;
    pill(Z.x + 16, y, 52, 52, LIGHT, 14); // gift icon
    pill(Z.x + 82, y + 10, 190, 16, GRAY, 8); // gift label
    pill(Z.x + 82, y + 32, 120, 14, GRAY, 7);
  }

  // 3. Gift banner, then comment feed, then input bar.
  const B = Z_BANNER;
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.roundRect(B.x, B.y, B.w, B.h, B.h / 2);
  ctx.fill();
  ctx.fillStyle = LIGHT;
  ctx.beginPath();
  ctx.arc(B.x + 50, B.y + B.h / 2, 34, 0, Math.PI * 2);
  ctx.fill();
  pill(B.x + 98, B.y + 22, 210, 20, LIGHT, 8);
  pill(B.x + 98, B.y + 54, 140, 16, GRAY, 7);
  pill(B.x + 430, B.y + 28, 120, 40, LIGHT, 10);
  const F = Z_COMMENTS;
  // 4.5 comments visible at once; the oldest is cropped at the feed's top edge and never fully
  // visible. The clip region starts there and the first bubble straddles the boundary, so the
  // mockup accurately reflects the real occupied height and feed appearance.
  ctx.save();
  ctx.beginPath();
  ctx.rect(F.x, F.y, F.w, F.h);
  ctx.clip();
  for (let i = 0; i < 5; i++) {
    const y = F.y - 46 + i * 106,
      lg = [620, 470, 700, 530, 660][i];
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.roundRect(F.x + 20, y, lg, 86, 22);
    ctx.fill();
    ctx.fillStyle = LIGHT;
    ctx.beginPath();
    ctx.arc(F.x + 58, y + 43, 26, 0, Math.PI * 2);
    ctx.fill();
    pill(F.x + 98, y + 20, lg * 0.34, 16, LIGHT, 7);
    pill(F.x + 98, y + 50, lg * 0.62, 16, GRAY, 7);
  }
  ctx.restore();
  const S = Z_INPUT;
  pill(S.x + 24, S.y, 560, S.h, 'rgba(0,0,0,0.42)', 28);
  pill(S.x + 52, S.y + 38, 260, 22, GRAY, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  [648, 744, 840, 936].forEach((x) => {
    ctx.beginPath();
    ctx.arc(x, S.y + S.h / 2, 44, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = LIGHT;
  [648, 744, 840, 936].forEach((x) => {
    ctx.beginPath();
    ctx.arc(x, S.y + S.h / 2, 20, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// AI debug layer (super-admin only). Per snake, in team color: path to target berry, sight diamonds
// (Manhattan radius 12 attack, 10 defense), scored candidate steps, opponent crown cells avoided,
// stance/reason/pocket label, keep (green) or change (red) flash on each cell transition.
export function paintAiDebug() {
  for (let i = 0; i < bodies.length; i++) {
    loadBody(i);
    const g = aiMemory.debug,
      h = snake[0];
    if (!g || !h) {
      storeBody();
      continue;
    }
    const rgb = i === 0 ? '242,197,124' : '180,212,222',
      c = (a) => 'rgba(' + rgb + ',' + a + ')',
      p = px(h.x, h.y);
    ctx.save();
    // 2. Sight diamonds.
    const drawLozenge = (r, alpha, dashPattern) => {
      ctx.setLineDash(dashPattern);
      ctx.strokeStyle = c(alpha);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - r * CELL);
      ctx.lineTo(p.x + r * CELL, p.y);
      ctx.lineTo(p.x, p.y + r * CELL);
      ctx.lineTo(p.x - r * CELL, p.y);
      ctx.closePath();
      ctx.stroke();
    };
    ctx.beginPath();
    ctx.rect(X0, Y0, COLS * CELL, ROWS * CELL);
    ctx.clip();
    // Super AI: Voronoi territory tinted by team (gold's view, painted once), plus the predicted
    // opponent path (white dashes from the opponent's head).
    if (g.superAi) {
      const S = g.superAi,
        opponentBody = bodies[1 - i];
      if (i === 0 && S.voronoi)
        for (let n = 0; n < S.voronoi.length; n++) {
          const l = S.voronoi[n];
          if (l !== 1 && l !== 2) continue;
          const vx = n % COLS,
            vy = (n - vx) / COLS;
          ctx.fillStyle = l === 1 ? 'rgba(242,197,124,0.10)' : 'rgba(180,212,222,0.10)';
          ctx.fillRect(X0 + vx * CELL + 2, Y0 + vy * CELL + 2, CELL - 4, CELL - 4);
        }
      if (S.rival && S.rival.length && opponentBody && opponentBody.snake[0]) {
        const o0 = px(opponentBody.snake[0].x, opponentBody.snake[0].y);
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(o0.x, o0.y);
        S.rival.forEach((q) => {
          const o = px(q.x, q.y);
          ctx.lineTo(o.x, o.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // Direction line (Rocket League style): solid = current step (dir); white dashes = AI's committed
    // intent for the next cell (nextDir) when it differs. Projected path (Rocket League ball indicator
    // style): greedy simulation over 10 steps, each choosing the direction that minimizes distance to
    // the target berry (or opponent head when no berry), avoiding the body. The first step follows
    // nextDir. Result: a real curved line, not a straight rail.
    const pts = [{ x: p.x, y: p.y }];
    const otherBody = bodies[1 - activeIndex];
    const aiTarget = g.target || (otherBody && otherBody.snake[0]);
    let hx = h.x,
      hy = h.y,
      dx = dir.x,
      dy = dir.y;
    const occ = new Set(snake.map((s) => s.y * COLS + s.x));
    // Super AI: the line is the principal variation the search computed, not an estimate.
    const hasAiRoute = !!(g.superAi && g.route && g.route.length);
    if (hasAiRoute)
      g.route.forEach((q) => {
        const o = px(q.x, q.y);
        pts.push({ x: o.x, y: o.y });
      });
    for (let k = 0; k < 10 && !hasAiRoute; k++) {
      // First step: force nextDir; subsequent steps: direction that closes distance to target most.
      let best = null;
      if (k === 0) {
        best = { x: nextDir.x, y: nextDir.y };
        const nx = hx + best.x,
          ny = hy + best.y;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || occ.has(ny * COLS + nx)) best = null;
      }
      if (!best) {
        let bestD = 1e9;
        for (const cand of [
          { x: dx, y: dy },
          { x: -dy, y: dx },
          { x: dy, y: -dx },
        ]) {
          const nx = hx + cand.x,
            ny = hy + cand.y;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          if (occ.has(ny * COLS + nx)) continue;
          const d = aiTarget ? Math.abs(aiTarget.x - nx) + Math.abs(aiTarget.y - ny) : k;
          if (d < bestD) {
            bestD = d;
            best = cand;
          }
        }
      }
      if (!best) break;
      hx += best.x;
      hy += best.y;
      dx = best.x;
      dy = best.y;
      occ.add(hy * COLS + hx);
      const o = px(hx, hy);
      pts.push({ x: o.x, y: o.y });
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = c(0.9);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.stroke();
    // Arrowhead at the end.
    const a = pts[pts.length - 2] || pts[0],
      b = pts[pts.length - 1];
    const ddx = b.x - a.x,
      ddy = b.y - a.y,
      nn = Math.max(1, Math.hypot(ddx, ddy)),
      ux = ddx / nn,
      uy = ddy / nn,
      tp = 14;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - ux * tp - uy * tp * 0.6, b.y - uy * tp + ux * tp * 0.6);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - ux * tp + uy * tp * 0.6, b.y - uy * tp - ux * tp * 0.6);
    ctx.stroke();
    // Dots at each projected cell.
    ctx.fillStyle = c(0.85);
    for (let k = 1; k < pts.length; k++) {
      ctx.beginPath();
      ctx.arc(pts[k].x, pts[k].y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!g.superAi) drawLozenge(g.attackRange || 12, g.stance === 'attack' ? 0.55 : 0.22, [10, 8]);
    if (!g.superAi) drawLozenge(g.defenseRange || 10, g.stance === 'defense' ? 0.55 : 0.22, [3, 6]);
    // 4. Opponent crown cells avoided.
    ctx.setLineDash([]);
    (aiMemory.dbgAvoid || []).forEach((q) => {
      const o = px(q.x, q.y),
        r = CELL / 2 - 3;
      ctx.fillStyle = 'rgba(255,90,90,0.10)';
      ctx.fillRect(o.x - r, o.y - r, 2 * r, 2 * r);
      ctx.strokeStyle = 'rgba(255,90,90,0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) {
        ctx.moveTo(o.x - r + Math.max(0, k) * r, o.y + r - Math.max(0, -k) * r);
        ctx.lineTo(o.x + r + Math.min(0, k) * r, o.y - r - Math.min(0, -k) * r);
      }
      ctx.stroke();
    });
    // 1. Target berry: outlined (path already drawn as the projected trajectory above).
    if (g.target) {
      const o = px(g.target.x, g.target.y);
      ctx.strokeStyle = c(0.95);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(o.x, o.y, CELL * 0.48, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 3. Candidate steps: scored arrow, red cross if refused.
    const notes = Object.keys(g.scores)
      .map((k) => g.scores[k])
      .filter((v) => typeof v === 'number');
    const mx = notes.length ? Math.max(...notes) : 0,
      mn = notes.length ? Math.min(...notes) : 0;
    Object.keys(g.scores).forEach((key) => {
      const v = g.scores[key],
        [dx, dy] = key.split(',').map(Number),
        o = { x: p.x + dx * CELL * 0.95, y: p.y + dy * CELL * 0.95 };
      const chosen = g.choice && g.choice.x === dx && g.choice.y === dy;
      if (typeof v === 'number' || v === 'ok') {
        const f = typeof v === 'number' ? (mx > mn ? (v - mn) / (mx - mn) : 1) : 0.5;
        ctx.strokeStyle = chosen ? 'rgba(255,255,255,0.95)' : c(0.3 + 0.5 * f);
        ctx.lineWidth = chosen ? 5 : 1.5 + 3 * f;
        ctx.beginPath();
        ctx.moveTo(p.x + dx * CELL * 0.35, p.y + dy * CELL * 0.35);
        ctx.lineTo(o.x, o.y);
        ctx.lineTo(o.x - dx * 9 - dy * 7, o.y - dy * 9 - dx * 7);
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(o.x - dx * 9 + dy * 7, o.y - dy * 9 + dx * 7);
        ctx.stroke();
        if (typeof v === 'number') {
          ctx.font = 'bold 13px sans-serif';
          ctx.fillStyle = c(0.95);
          ctx.textAlign = 'center';
          ctx.fillText(v.toFixed(1), o.x + dx * 14, o.y + dy * 14 + 4);
        }
      } else {
        ctx.strokeStyle = 'rgba(255,80,80,0.85)';
        ctx.lineWidth = 3;
        const r = 7;
        ctx.beginPath();
        ctx.moveTo(o.x - r, o.y - r);
        ctx.lineTo(o.x + r, o.y + r);
        ctx.moveTo(o.x + r, o.y - r);
        ctx.lineTo(o.x - r, o.y + r);
        ctx.stroke();
      }
    });
    // 6. Cell-transition flash: keep (green) or change (red).
    const fl = aiMemory.dbgFlash;
    if (fl && t - fl.t < 0.35) {
      const o = px(fl.x, fl.y),
        u = (t - fl.t) / 0.35;
      ctx.strokeStyle = fl.change
        ? 'rgba(255,70,70,' + (1 - u) + ')'
        : 'rgba(110,255,140,' + 0.8 * (1 - u) + ')';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(o.x, o.y, CELL * (0.45 + 0.4 * u), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Super AI: chess-style evaluation bar above the board (gold's share on the left), drawn once per frame.
    if (g.superAi && i === 0) {
      const S = g.superAi,
        bx = X0,
        by = Y0 - 34,
        bw = COLS * CELL,
        part = Math.max(0.04, Math.min(0.96, 0.5 + S.value / 300));
      ctx.save();
      ctx.fillStyle = 'rgba(180,212,222,0.85)';
      ctx.fillRect(bx, by, bw, 10);
      ctx.fillStyle = 'rgba(242,197,124,0.95)';
      ctx.fillRect(bx, by, bw * part, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(bx + bw / 2 - 1, by - 3, 2, 16);
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        'Super AI   depth ' +
          S.depth +
          '   ' +
          S.nodes +
          ' nodes   eval gold ' +
          (S.value > 0 ? '+' : '') +
          S.value.toFixed(0) +
          '   territory ' +
          S.ownTerritory +
          ' / ' +
          S.rivalTerritory,
        bx,
        by - 8,
      );
      ctx.restore();
    }
    // 5. Label (outside the clip, above the head).
    const txt =
      (g.stance || 'neutral') +
      ' | ' +
      (g.reason || '?') +
      ' | pocket ' +
      (g.pocket != null ? g.pocket : '?') +
      (g.trap != null ? ' | trap ' + g.trap : '');
    ctx.save();
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    const w = ctx.measureText(txt).width + 14,
      ey = p.y - CELL * 1.1;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(p.x - w / 2, ey - 15, w, 21);
    ctx.fillStyle = c(1);
    ctx.fillText(txt, p.x, ey);
    ctx.restore();
    storeBody();
  }
  loadBody(0);
}
