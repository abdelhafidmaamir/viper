// Operator-only overlays: the AI debug layer (intent, reach, threats) and the LIVE safe-zone
// mock-up. Never shown on stream unless switched on from the control room.

import type { Body, Point } from './types.ts';
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
} from './layout.ts';
import { pill } from './scoreboard.ts';
import { ctx } from './canvas.ts';
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
} from '../scripts/game.ts';

export function paintLiveMockup(): void {
  const c = ctx as CanvasRenderingContext2D | null; // canvas.ts not yet typed; runtime is non-null after bindCanvas()
  if (!c) return;
  c.save();
  const GRAY = 'rgba(255,255,255,0.20)',
    DARK = 'rgba(0,0,0,0.42)',
    LIGHT = 'rgba(255,255,255,0.34)';

  // 1. Top area: dark veil, host avatar, Follow button, viewer counter, close button.
  c.fillStyle = 'rgba(0,0,0,0.30)';
  c.fillRect(0, 0, W, SR_Y);
  c.fillStyle = LIGHT;
  c.beginPath();
  c.arc(84, 150, 42, 0, Math.PI * 2);
  c.fill();
  pill(138, 126, 190, 26, LIGHT, 8); // nickname
  pill(138, 160, 96, 18, GRAY, 7); // follower count
  pill(404, 122, 150, 58, 'rgba(232,64,84,0.80)', 29); // + Suivre (r = h/2)
  pill(740, 124, 180, 54, DARK, 27); // avatars and viewer count (r = h/2)
  c.fillStyle = LIGHT;
  [768, 806].forEach((x) => {
    c.beginPath();
    c.arc(x, 151, 21, 0, Math.PI * 2);
    c.fill();
  });
  pill(840, 142, 56, 18, LIGHT, 7);
  c.strokeStyle = LIGHT;
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(1002, 134);
  c.lineTo(1038, 170);
  c.moveTo(1038, 134);
  c.lineTo(1002, 170);
  c.stroke();
  // Second row: ranking, gallery, search.
  pill(30, 216, 368, 42, DARK, 12);
  pill(414, 216, 236, 42, DARK, 12);
  pill(666, 216, 384, 42, DARK, 12);

  // 2. Gift widget column, right side; defines the lower bound of the viewer counter.
  const Z = Z_GIFTS;
  c.fillStyle = 'rgba(0,0,0,0.34)';
  c.beginPath();
  c.roundRect(Z.x, Z.y, Z.w, Z.h, 16);
  c.fill();
  for (let i = 0; i < 5; i++) {
    const y = Z.y + 22 + i * 66;
    pill(Z.x + 16, y, 52, 52, LIGHT, 14); // gift icon
    pill(Z.x + 82, y + 10, 190, 16, GRAY, 8); // gift label
    pill(Z.x + 82, y + 32, 120, 14, GRAY, 7);
  }

  // 3. Gift banner, then comment feed, then input bar.
  const B = Z_BANNER;
  c.fillStyle = 'rgba(0,0,0,0.38)';
  c.beginPath();
  c.roundRect(B.x, B.y, B.w, B.h, B.h / 2);
  c.fill();
  c.fillStyle = LIGHT;
  c.beginPath();
  c.arc(B.x + 50, B.y + B.h / 2, 34, 0, Math.PI * 2);
  c.fill();
  pill(B.x + 98, B.y + 22, 210, 20, LIGHT, 8);
  pill(B.x + 98, B.y + 54, 140, 16, GRAY, 7);
  pill(B.x + 430, B.y + 28, 120, 40, LIGHT, 10);
  const F = Z_COMMENTS;
  // 4.5 comments visible at once; the oldest is cropped at the feed's top edge and never fully
  // visible. The clip region starts there and the first bubble straddles the boundary, so the
  // mockup accurately reflects the real occupied height and feed appearance.
  c.save();
  c.beginPath();
  c.rect(F.x, F.y, F.w, F.h);
  c.clip();
  const lgArr = [620, 470, 700, 530, 660];
  for (let i = 0; i < 5; i++) {
    const y = F.y - 46 + i * 106,
      lg = lgArr[i] ?? 620; // i is 0..4, array has exactly 5 elements
    c.fillStyle = 'rgba(0,0,0,0.34)';
    c.beginPath();
    c.roundRect(F.x + 20, y, lg, 86, 22);
    c.fill();
    c.fillStyle = LIGHT;
    c.beginPath();
    c.arc(F.x + 58, y + 43, 26, 0, Math.PI * 2);
    c.fill();
    pill(F.x + 98, y + 20, lg * 0.34, 16, LIGHT, 7);
    pill(F.x + 98, y + 50, lg * 0.62, 16, GRAY, 7);
  }
  c.restore();
  const S = Z_INPUT;
  pill(S.x + 24, S.y, 560, S.h, 'rgba(0,0,0,0.42)', 28);
  pill(S.x + 52, S.y + 38, 260, 22, GRAY, 10);
  c.fillStyle = 'rgba(0,0,0,0.42)';
  [648, 744, 840, 936].forEach((x) => {
    c.beginPath();
    c.arc(x, S.y + S.h / 2, 44, 0, Math.PI * 2);
    c.fill();
  });
  c.fillStyle = LIGHT;
  [648, 744, 840, 936].forEach((x) => {
    c.beginPath();
    c.arc(x, S.y + S.h / 2, 20, 0, Math.PI * 2);
    c.fill();
  });
  c.restore();
}

// AI debug layer (super-admin only). Per snake, in team color: path to target berry, sight diamonds
// (Manhattan radius 12 attack, 10 defense), scored candidate steps, opponent crown cells avoided,
// stance/reason/pocket label, keep (green) or change (red) flash on each cell transition.
export function paintAiDebug(): void {
  const c = ctx as CanvasRenderingContext2D | null; // canvas.ts not yet typed; runtime is non-null after bindCanvas()
  if (!c) return;
  for (let i = 0; i < bodies.length; i++) {
    loadBody(i);
    const mem = aiMemory;
    const g = mem.debug,
      h = snake[0];
    if (!g || !h) {
      storeBody();
      continue;
    }
    const rgb = i === 0 ? '242,197,124' : '180,212,222',
      color = (a: number) => `rgba(${rgb},${String(a)})`,
      p = px(h.x, h.y);
    c.save();
    // 2. Sight diamonds.
    const drawLozenge = (r: number, alpha: number, dashPattern: number[]) => {
      c.setLineDash(dashPattern);
      c.strokeStyle = color(alpha);
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(p.x, p.y - r * CELL);
      c.lineTo(p.x + r * CELL, p.y);
      c.lineTo(p.x, p.y + r * CELL);
      c.lineTo(p.x - r * CELL, p.y);
      c.closePath();
      c.stroke();
    };
    c.beginPath();
    c.rect(X0, Y0, COLS * CELL, ROWS * CELL);
    c.clip();
    // Super AI: Voronoi territory tinted by team (gold's view, painted once), plus the predicted
    // opponent path (white dashes from the opponent's head).
    if (g.superAi) {
      const S = g.superAi,
        opponentBody: Body | undefined = bodies[1 - i];
      if (i === 0)
        for (let n = 0; n < S.voronoi.length; n++) {
          const l = S.voronoi[n] ?? 0; // n < S.voronoi.length, 0 is filtered by next guard
          if (l !== 1 && l !== 2) continue;
          const vx = n % COLS,
            vy = (n - vx) / COLS;
          c.fillStyle = l === 1 ? 'rgba(242,197,124,0.10)' : 'rgba(180,212,222,0.10)';
          c.fillRect(X0 + vx * CELL + 2, Y0 + vy * CELL + 2, CELL - 4, CELL - 4);
        }
      const opponentHead = opponentBody?.snake[0];
      if (S.rival.length && opponentHead) {
        const o0 = px(opponentHead.x, opponentHead.y);
        c.setLineDash([5, 6]);
        c.strokeStyle = 'rgba(255,255,255,0.7)';
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(o0.x, o0.y);
        S.rival.forEach((q) => {
          const o = px(q.x, q.y);
          c.lineTo(o.x, o.y);
        });
        c.stroke();
        c.setLineDash([]);
      }
    }
    // Direction line (Rocket League style): solid = current step (dir); white dashes = AI's committed
    // intent for the next cell (nextDir) when it differs. Projected path (Rocket League ball indicator
    // style): greedy simulation over 10 steps, each choosing the direction that minimizes distance to
    // the target berry (or opponent head when no berry), avoiding the body. The first step follows
    // nextDir. Result: a real curved line, not a straight rail.
    const pts: Point[] = [{ x: p.x, y: p.y }];
    const otherBody: Body | undefined = bodies[1 - activeIndex];
    const aiTarget = g.target ?? otherBody?.snake[0];
    let hx = h.x,
      hy = h.y,
      dx = dir.x,
      dy = dir.y;
    const occ = new Set(snake.map((s) => s.y * COLS + s.x));
    // Super AI: the line is the principal variation the search computed, not an estimate.
    const hasAiRoute = !!(g.superAi && g.route?.length);
    if (hasAiRoute && g.route)
      g.route.forEach((q) => {
        const o = px(q.x, q.y);
        pts.push({ x: o.x, y: o.y });
      });
    for (let k = 0; k < 10 && !hasAiRoute; k++) {
      // First step: force nextDir; subsequent steps: direction that closes distance to target most.
      let best: { x: number; y: number } | null = null;
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
    c.setLineDash([]);
    c.strokeStyle = color(0.9);
    c.lineWidth = 4;
    c.beginPath();
    const [firstPt, ...restPts] = pts; // pts always has >= 1 element
    if (firstPt) {
      c.moveTo(firstPt.x, firstPt.y);
      for (const pt of restPts) c.lineTo(pt.x, pt.y);
    }
    c.stroke();
    // Arrowhead at the end.
    // pts always has >= 1 element; pts.length - 1 and pts.length - 2 are bounded below.
    const last = pts.at(-1) ?? { x: p.x, y: p.y },
      prev = pts.at(-2) ?? last;
    const ddx = last.x - prev.x,
      ddy = last.y - prev.y,
      nn = Math.max(1, Math.hypot(ddx, ddy)),
      ux = ddx / nn,
      uy = ddy / nn,
      tp = 14;
    c.beginPath();
    c.moveTo(last.x, last.y);
    c.lineTo(last.x - ux * tp - uy * tp * 0.6, last.y - uy * tp + ux * tp * 0.6);
    c.moveTo(last.x, last.y);
    c.lineTo(last.x - ux * tp + uy * tp * 0.6, last.y - uy * tp - ux * tp * 0.6);
    c.stroke();
    // Dots at each projected cell.
    c.fillStyle = color(0.85);
    for (const pt of restPts) {
      c.beginPath();
      c.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      c.fill();
    }
    if (!g.superAi) drawLozenge(g.attackRange ?? 12, g.stance === 'attack' ? 0.55 : 0.22, [10, 8]);
    if (!g.superAi) drawLozenge(g.defenseRange ?? 10, g.stance === 'defense' ? 0.55 : 0.22, [3, 6]);
    // 4. Opponent crown cells avoided.
    c.setLineDash([]);
    (mem.dbgAvoid ?? []).forEach((q) => {
      const o = px(q.x, q.y),
        r = CELL / 2 - 3;
      c.fillStyle = 'rgba(255,90,90,0.10)';
      c.fillRect(o.x - r, o.y - r, 2 * r, 2 * r);
      c.strokeStyle = 'rgba(255,90,90,0.45)';
      c.lineWidth = 1.5;
      c.beginPath();
      for (let k = -2; k <= 2; k++) {
        c.moveTo(o.x - r + Math.max(0, k) * r, o.y + r - Math.max(0, -k) * r);
        c.lineTo(o.x + r + Math.min(0, k) * r, o.y - r - Math.min(0, -k) * r);
      }
      c.stroke();
    });
    // 1. Target berry: outlined (path already drawn as the projected trajectory above).
    if (g.target) {
      const o = px(g.target.x, g.target.y);
      c.strokeStyle = color(0.95);
      c.lineWidth = 3;
      c.beginPath();
      c.arc(o.x, o.y, CELL * 0.48, 0, Math.PI * 2);
      c.stroke();
    }
    // 3. Candidate steps: scored arrow, red cross if refused.
    const notes = Object.keys(g.scores)
      .map((k) => g.scores[k])
      .filter((v): v is number => typeof v === 'number');
    const mx = notes.length ? Math.max(...notes) : 0,
      mn = notes.length ? Math.min(...notes) : 0;
    Object.keys(g.scores).forEach((key) => {
      const v = g.scores[key];
      if (v === undefined) return;
      // Keys are always 'dx,dy' (two integers separated by comma, per AI score logging).
      const [sdxStr, sdyStr] = key.split(',');
      const sdx = Number(sdxStr),
        sdy = Number(sdyStr);
      const o = { x: p.x + sdx * CELL * 0.95, y: p.y + sdy * CELL * 0.95 };
      const chosen = g.choice?.x === sdx && g.choice.y === sdy;
      if (typeof v === 'number' || v === 'ok') {
        const f = typeof v === 'number' ? (mx > mn ? (v - mn) / (mx - mn) : 1) : 0.5;
        c.strokeStyle = chosen ? 'rgba(255,255,255,0.95)' : color(0.3 + 0.5 * f);
        c.lineWidth = chosen ? 5 : 1.5 + 3 * f;
        c.beginPath();
        c.moveTo(p.x + sdx * CELL * 0.35, p.y + sdy * CELL * 0.35);
        c.lineTo(o.x, o.y);
        c.lineTo(o.x - sdx * 9 - sdy * 7, o.y - sdy * 9 - sdx * 7);
        c.moveTo(o.x, o.y);
        c.lineTo(o.x - sdx * 9 + sdy * 7, o.y - sdy * 9 + sdx * 7);
        c.stroke();
        if (typeof v === 'number') {
          c.font = 'bold 13px sans-serif';
          c.fillStyle = color(0.95);
          c.textAlign = 'center';
          c.fillText(v.toFixed(1), o.x + sdx * 14, o.y + sdy * 14 + 4);
        }
      } else {
        c.strokeStyle = 'rgba(255,80,80,0.85)';
        c.lineWidth = 3;
        const r = 7;
        c.beginPath();
        c.moveTo(o.x - r, o.y - r);
        c.lineTo(o.x + r, o.y + r);
        c.moveTo(o.x + r, o.y - r);
        c.lineTo(o.x - r, o.y + r);
        c.stroke();
      }
    });
    // 6. Cell-transition flash: keep (green) or change (red).
    const fl = mem.dbgFlash;
    if (fl && t - fl.t < 0.35) {
      const o = px(fl.x, fl.y),
        u = (t - fl.t) / 0.35;
      c.strokeStyle = fl.change
        ? `rgba(255,70,70,${String(1 - u)})`
        : `rgba(110,255,140,${String(0.8 * (1 - u))})`;
      c.lineWidth = 4;
      c.beginPath();
      c.arc(o.x, o.y, CELL * (0.45 + 0.4 * u), 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
    // Super AI: chess-style evaluation bar above the board (gold's share on the left), drawn once per frame.
    if (g.superAi && i === 0) {
      const S = g.superAi,
        bx = X0,
        by = Y0 - 34,
        bw = COLS * CELL,
        part = Math.max(0.04, Math.min(0.96, 0.5 + S.value / 300));
      c.save();
      c.fillStyle = 'rgba(180,212,222,0.85)';
      c.fillRect(bx, by, bw, 10);
      c.fillStyle = 'rgba(242,197,124,0.95)';
      c.fillRect(bx, by, bw * part, 10);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillRect(bx + bw / 2 - 1, by - 3, 2, 16);
      c.font = 'bold 14px sans-serif';
      c.textAlign = 'left';
      c.fillText(
        `Super AI   depth ${String(S.depth)}   ${String(S.nodes)} nodes   eval gold ${S.value > 0 ? '+' : ''}${S.value.toFixed(0)}   territory ${String(S.ownTerritory)} / ${String(S.rivalTerritory)}`,
        bx,
        by - 8,
      );
      c.restore();
    }
    // 5. Label (outside the clip, above the head).
    const txt =
      `${g.stance ?? 'neutral'} | ${(g.reason ?? '') || '?'} | pocket ${g.pocket !== undefined ? String(g.pocket) : '?'}` +
      (g.trap !== null && g.trap !== undefined ? ` | trap ${String(g.trap)}` : '');
    c.save();
    c.font = 'bold 15px sans-serif';
    c.textAlign = 'center';
    const w = c.measureText(txt).width + 14,
      ey = p.y - CELL * 1.1;
    c.fillStyle = 'rgba(0,0,0,0.65)';
    c.fillRect(p.x - w / 2, ey - 15, w, 21);
    c.fillStyle = color(1);
    c.fillText(txt, p.x, ey);
    c.restore();
    storeBody();
  }
  loadBody(0);
}
