// End of round: the veil over the board, the winner banner and the donor ranking (podium or
// MVP card). Painted last so it covers everything, including the HUD.

import { CELL, H, L, OX, ROWS, W, WF, Y0 } from './layout.ts';
import { smooth01 } from './scoreboard.ts';
import { roundDonations, paintMiniSnake, getProfilePhoto } from './announcements.ts';
import { ctx as ctxRaw } from './canvas.ts';
import { SHADOW, GOLD } from './palette.ts';
import { round, settings } from '../scripts/game.ts';
import type { Team, RankingMode } from './types.ts';
import type { EndingOptions } from './types-api.ts';

/** A donor entry for the end-of-round ranking. */
interface DonorEntry {
  nickname: string;
  team: Team;
  total: number;
  avatar: string | undefined;
}

// canvas.ts exports ctx as null before that file is converted to TypeScript; the real type is below.
const getCtx = (): CanvasRenderingContext2D | null => ctxRaw;

// End-of-round veil: the winning team's color breaks through the darkness. Painted once at
// quarter resolution and stretched; recomputing a full-screen radial gradient per frame is wasteful.
let endVeilCanvas: HTMLCanvasElement | null = null;

function getEndVeil(): HTMLCanvasElement {
  if (endVeilCanvas) return endVeilCanvas;
  const c = document.createElement('canvas');
  c.width = 270;
  c.height = 480;
  const g = c.getContext('2d');
  if (!g) {
    endVeilCanvas = c;
    return c;
  } // 2d context unavailable; return blank canvas
  const gv = g.createRadialGradient(135, 200, 30, 135, 200, 346);
  gv.addColorStop(0, 'rgba(5,8,6,0.50)');
  gv.addColorStop(0.55, 'rgba(5,8,6,0.68)');
  gv.addColorStop(1, 'rgba(5,8,6,0.82)');
  g.fillStyle = gv;
  g.fillRect(0, 0, 270, 480);
  endVeilCanvas = c;
  return c;
}

export function paintEndScreen(): void {
  const ctx = getCtx();
  if (!ctx || !round) return;
  const u = Math.min(1, round.end / 1.2),
    v = round.winner,
    sun = v === 'gold';
  ctx.save();
  // Veil: smooth rise over 1.6 s (smootherstep), brighter at center where the snake stands, denser at edges.
  {
    const uv = Math.min(1, round.end / 1.6),
      kv = uv * uv * uv * (uv * (6 * uv - 15) + 10);
    // In 16:9 the veil also covers the side margins.
    ctx.globalAlpha = kv;
    if (OX) ctx.drawImage(getEndVeil(), -OX, 0, WF, H);
    else ctx.drawImage(getEndVeil(), 0, 0, W, H);
  }
  ctx.globalAlpha = 1;
  // The end snake replaces the orb: it celebrates when it wins, droops when it loses.
  const cx = W / 2,
    cy = Y0 + (ROWS * CELL) / 2,
    R = 320;
  // In a duel one team always wins, so the end snake is always happy and carries the winner's color.
  const o: EndingOptions = {
    state: sun ? 'happy' : 'sad',
    t: round.end,
    cx: cx,
    cy: cy,
    R: R,
    u: u,
  };
  const rankingFactor = isRankingActive() ? smooth01((round.end - 2.0) / 0.9) : 0;
  const grandMvp = settings.ranking.startsWith('M');
  if (rankingFactor > 0) {
    o.R = R * (1 - (grandMvp ? 0.48 : 0.34) * rankingFactor);
    o.cy = cy - (grandMvp ? 250 : 190) * rankingFactor;
  }
  if (v === 'draw') {
    // Draw: two snakes face to face, each in its team color, DRAW text.
    if (window.SnakeEnding?.paintDraw) {
      window.SnakeEnding.paintDraw(ctx, {
        ...o,
        R: R * 1.05,
        gold: { tint: GOLD, rgb: '242,197,124' },
        shadow: { tint: SHADOW, rgb: '180,212,222' },
      });
    }
    if (rankingFactor > 0) paintRanking();
    ctx.restore();
    return;
  } else {
    o.state = 'happy';
    o.tint = v === 'shadow' ? SHADOW : GOLD;
    o.rgb = v === 'shadow' ? '180,212,222' : '242,197,124';
  }
  if (window.SnakeEnding) window.SnakeEnding.paint(ctx, o);
  if (rankingFactor > 0) paintRanking();
  ctx.restore();
}

// Round donor ranking shown on the end screen. Same card style as the gift legend: nickname in team color,
// total in coins. Rendered independently.
function topDonors(team?: Team): DonorEntry[] {
  return Object.entries(roundDonations)
    .map(([p, e]) => ({
      nickname: p,
      team: e.team,
      total: e.total,
      avatar: e.avatar,
    }))
    .filter((d) => d.total > 0 && (!team || d.team === team))
    .sort((a, b) => b.total - a.total);
}

function isRankingActive(): boolean {
  return settings.ranking !== 'none' && topDonors().length > 0;
}

function paintRankingRow(
  x: number,
  y: number,
  w: number,
  h: number,
  d: DonorEntry,
  rank: number,
  appearance: number,
  mirrored: boolean,
  large: boolean,
): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (appearance <= 0.01) return;
  const tint = d.team === 'gold' ? GOLD : SHADOW,
    rgb = d.team === 'gold' ? '242,197,124' : '180,212,222';
  ctx.save();
  ctx.globalAlpha = appearance;
  ctx.translate(0, (1 - appearance) * 22);
  ctx.fillStyle = 'rgba(8,12,10,0.78)';
  ctx.beginPath();
  ctx.roundRect(x, y - h / 2, w, h, h * 0.3);
  ctx.fill();
  if (rank === 1) {
    ctx.fillStyle = 'rgba(' + rgb + ',0.10)';
    ctx.fill();
  }
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(' + rgb + ',' + String(rank === 1 ? 0.6 : 0.3) + ')';
  ctx.stroke();
  const rx = mirrored ? x + w - h / 2 - 6 : x + h / 2 + 6,
    R = h * 0.3;
  ctx.fillStyle = rank === 1 ? tint : 'rgba(' + rgb + ',0.22)';
  ctx.beginPath();
  ctx.arc(rx, y, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rank === 1 ? '#0c110e' : tint;
  ctx.font = '900 ' + String(Math.round(R * 1.1)) + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(rank), rx, y + 1);
  // Donor avatar between rank badge and name; falls back to initials if TikFinity provides none.
  const showNames = settings.donorNames,
    AV = h * 0.66,
    sg = mirrored ? -1 : 1,
    pcx = rx + sg * (R + 12 + AV / 2),
    ph = showNames ? getProfilePhoto(d.avatar) : null;
  if (showNames) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pcx, y, AV / 2, 0, Math.PI * 2);
    ctx.closePath();
    if (ph) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(ph, pcx - AV / 2, y - AV / 2, AV, AV);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(' + rgb + ',0.20)';
      ctx.fill();
      ctx.fillStyle = tint;
      ctx.font = '800 ' + String(Math.round(AV * 0.5)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        d.nickname
          .replace(/[^A-Za-z0-9]/g, '')
          .charAt(0)
          .toUpperCase() || '?',
        pcx,
        y + 1,
      );
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.8)';
    ctx.beginPath();
    ctx.arc(pcx, y, AV / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  const nameOffset = showNames ? AV + 12 : 0;
  const displayName = settings.donorNames
    ? d.nickname.slice(0, large ? 20 : 14)
    : 'supporter ' + String(rank);
  ctx.fillStyle = tint;
  ctx.font = (large ? '700 34px' : '700 27px') + ' system-ui, sans-serif';
  ctx.textAlign = mirrored ? 'right' : 'left';
  // Name never overlaps the total: font shrinks first, then truncates.
  {
    const availableWidth =
      w - (h / 2 + 6 + R + 16 + nameOffset) - 22 - String(d.total).length * (large ? 20 : 16) - 14;
    let fontSize = large ? 34 : 27,
      txt = displayName;
    while (fontSize > 18 && ctx.measureText(txt).width > availableWidth) {
      fontSize--;
      ctx.font = '700 ' + String(fontSize) + 'px system-ui, sans-serif';
    }
    while (txt.length > 3 && ctx.measureText(txt).width > availableWidth)
      txt = txt.slice(0, -2) + '…';
    ctx.fillText(txt, mirrored ? rx - R - 16 - nameOffset : rx + R + 16 + nameOffset, y + 1);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = (large ? '500 32px' : '500 26px') + ' "IBM Plex Mono", ui-monospace, monospace';
  ctx.textAlign = mirrored ? 'left' : 'right';
  ctx.fillText(String(d.total), mirrored ? x + 22 : x + w - 22, y + 1);
  ctx.restore();
}

// MVP spotlight: large avatar, gold crown, name and total. Flatters the top donor.
// M1: rotating rays behind the avatar. M2: a real snake orbits it. M3: three-step podium.
const elasticEase = (x: number): number => {
  x = Math.max(0, Math.min(1, x));
  return x === 0
    ? 0
    : x === 1
      ? 1
      : Math.pow(2, -10 * x) * Math.sin(((x * 10 - 0.75) * 2 * Math.PI) / 3) + 1;
};

function paintAvatar(cx: number, cy: number, r: number, d: DonorEntry, scale: number): void {
  const ctx = getCtx();
  if (!ctx) return;
  const tint = d.team === 'gold' ? GOLD : SHADOW,
    rgb = d.team === 'gold' ? '242,197,124' : '180,212,222',
    showNames = settings.donorNames,
    ph = showNames ? getProfilePhoto(d.avatar) : null,
    R = r * scale;
  if (R <= 0.5) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.closePath();
  if (ph) {
    ctx.save();
    ctx.clip();
    ctx.drawImage(ph, cx - R, cy - R, 2 * R, 2 * R);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(14,20,17,0.95)';
    ctx.fill();
    ctx.fillStyle = 'rgba(' + rgb + ',0.22)';
    ctx.fill();
    ctx.fillStyle = tint;
    ctx.font = '800 ' + String(Math.round(R * 0.95)) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      showNames
        ? d.nickname
            .replace(/[^A-Za-z0-9]/g, '')
            .charAt(0)
            .toUpperCase() || '?'
        : '?',
      cx,
      cy + R * 0.06,
    );
  }
  ctx.lineWidth = Math.max(2.5, R * 0.07);
  ctx.strokeStyle = tint;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function paintCrown(cx: number, cy: number, l: number, dropProgress: number): void {
  const ctx = getCtx();
  if (!ctx) return;
  // cy is the crown base; the crown drops from above and bounces.
  const h = l * 0.62,
    dy = -(1 - elasticEase(dropProgress)) * 90;
  if (dropProgress <= 0) return;
  ctx.save();
  ctx.translate(cx, cy + dy);
  ctx.rotate(-0.08);
  ctx.globalAlpha = Math.min(1, dropProgress * 4);
  ctx.fillStyle = GOLD;
  ctx.strokeStyle = '#8a6a2f';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-l / 2, 0);
  ctx.lineTo(-l / 2 - l * 0.06, -h * 0.78);
  ctx.lineTo(-l * 0.24, -h * 0.36);
  ctx.lineTo(0, -h);
  ctx.lineTo(l * 0.24, -h * 0.36);
  ctx.lineTo(l / 2 + l * 0.06, -h * 0.78);
  ctx.lineTo(l / 2, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#fff3d6';
  for (const [gx, gy] of [
    [-l / 2 - l * 0.06, -h * 0.78],
    [0, -h],
    [l / 2 + l * 0.06, -h * 0.78],
  ] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(gx, gy, l * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillStyle = '#8a6a2f';
  ctx.fillRect(-l / 2, -h * 0.16, l, h * 0.07);
  ctx.fillStyle = '#e0574a';
  ctx.beginPath();
  ctx.arc(0, -h * 0.36, l * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function paintNameAndTotal(
  cx: number,
  y: number,
  d: DonorEntry,
  bodyFontSize: number,
  appearance: number,
): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (appearance <= 0.01) return;
  const tint = d.team === 'gold' ? GOLD : SHADOW,
    displayName = settings.donorNames ? d.nickname.slice(0, 18) : 'top supporter';
  ctx.save();
  ctx.globalAlpha = appearance;
  ctx.translate(0, (1 - appearance) * 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let c = bodyFontSize;
  ctx.font = '800 ' + String(c) + 'px system-ui, sans-serif';
  while (c > 20 && ctx.measureText(displayName).width > 560) {
    c--;
    ctx.font = '800 ' + String(c) + 'px system-ui, sans-serif';
  }
  ctx.fillStyle = tint;
  ctx.fillText(displayName, cx, y);
  ctx.font =
    '500 ' +
    String(Math.round(bodyFontSize * 0.62)) +
    'px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fillText(String(d.total) + ' coins', cx, y + bodyFontSize * 0.95);
  ctx.restore();
}

function paintMvpSparks(
  cx: number,
  cy: number,
  r0: number,
  r1: number,
  age: number,
  n: number,
  rgb: string,
): void {
  const ctx = getCtx();
  if (!ctx) return;
  for (let i = 0; i < n; i++) {
    const ph = (age * 0.45 + i / n) % 1,
      ang = i * 2.399 + age * 0.3,
      rr = r0 + (r1 - r0) * ph,
      a = Math.sin(ph * Math.PI);
    ctx.fillStyle = 'rgba(' + rgb + ',' + (0.85 * a).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.9, 1.6 + 2.2 * a, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintMvp(
  mode: RankingMode,
  age: number,
  titleFn: (txt: string, y: number) => void,
  appearanceFn: (i: number) => number,
): void {
  const ctx = getCtx();
  if (!ctx) return;
  const l = topDonors();
  const m = l[0];
  if (!m) return; // only called when isRankingActive() is true; length > 0 is guaranteed
  const cx = W / 2,
    rgb = m.team === 'gold' ? '242,197,124' : '180,212,222',
    tint = m.team === 'gold' ? GOLD : SHADOW;
  if (mode === 'M3') {
    // Three-step podium: first place at center and highest, with a crown.
    titleFn('TOP SUPPORTERS', 760);
    const base = L.baseEnd,
      steps = [
        { d: l[0], x: cx, hh: 190, r: 60, rank: 1 },
        { d: l[1], x: cx - 196, hh: 132, r: 46, rank: 2 },
        { d: l[2], x: cx + 196, hh: 100, r: 42, rank: 3 },
      ];
    steps.forEach((q, i) => {
      if (!q.d) return;
      const a = smooth01((age - 0.4 - (i === 0 ? 0.5 : i === 1 ? 0 : 0.25)) / 0.6),
        tq = q.d.team === 'gold' ? '242,197,124' : '180,212,222',
        hh = q.hh * a;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(8,12,10,0.80)';
      ctx.beginPath();
      ctx.roundRect(q.x - 92, base - hh, 184, hh, [18, 18, 6, 6]);
      ctx.fill();
      ctx.fillStyle = 'rgba(' + tq + ',' + String(q.rank === 1 ? 0.12 : 0.06) + ')';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(' + tq + ',' + String(q.rank === 1 ? 0.6 : 0.3) + ')';
      ctx.stroke();
      ctx.fillStyle = 'rgba(' + tq + ',0.16)';
      ctx.font = '900 ' + String(Math.round(Math.min(90, q.hh * 0.6))) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(q.rank), q.x, base - hh / 2 + 4);
      ctx.restore();
      const ay = base - hh - q.r - 14;
      paintAvatar(q.x, ay, q.r, q.d, elasticEase(a));
      if (q.rank === 1) {
        paintMvpSparks(q.x, ay, q.r + 8, q.r + 54, age, 12, '255,238,206');
        paintCrown(q.x + 2, ay - q.r + 8, q.r * 1.25, (age - 1.5) / 0.7);
      }
      const displayName = settings.donorNames ? q.d.nickname.slice(0, 11) : '#' + String(q.rank);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = q.d.team === 'gold' ? GOLD : SHADOW;
      let c = q.rank === 1 ? 26 : 22;
      ctx.font = '700 ' + String(c) + 'px system-ui, sans-serif';
      while (c > 15 && ctx.measureText(displayName).width > 168) {
        c--;
        ctx.font = '700 ' + String(c) + 'px system-ui, sans-serif';
      }
      ctx.fillText(displayName, q.x, base - hh + 24);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '500 20px "IBM Plex Mono", ui-monospace, monospace';
      ctx.fillText(String(q.d.total), q.x, base - hh + 52);
      ctx.restore();
    });
    return;
  }
  titleFn('MVP OF THE ROUND', 748);
  const ay = 900,
    AR = 84,
    a0 = (age - 0.5) / 0.7;
  if (mode === 'M1') {
    // Soft rays rotating behind the avatar.
    ctx.save();
    ctx.translate(cx, ay);
    ctx.rotate(age * 0.35);
    ctx.globalAlpha = 0.5 * smooth01(a0);
    for (let i = 0; i < 14; i++) {
      ctx.rotate((Math.PI * 2) / 14);
      ctx.fillStyle = 'rgba(' + rgb + ',' + String(i % 2 ? 0.1 : 0.17) + ')';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-13, -AR - 78);
      ctx.lineTo(13, -AR - 78);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  if (mode === 'M2' && a0 > 0) {
    // A real snake in the MVP's team color orbits the avatar.
    const rr = AR + 30,
      headAngle = -Math.PI / 2 + age * 1.5,
      snakeLength = Math.min(1, a0) * 4.6,
      pts: { x: number; y: number }[] = [];
    for (let u = 0; u <= snakeLength; u += 0.07)
      pts.push({ x: cx + Math.cos(headAngle - u) * rr, y: ay + Math.sin(headAngle - u) * rr });
    paintMiniSnake(pts, tint, 0.5);
  }
  paintAvatar(cx, ay, AR, m, elasticEase(a0));
  paintMvpSparks(cx, ay, AR + 10, AR + (mode === 'M2' ? 70 : 90), age, 16, '255,238,206');
  paintCrown(cx + 3, ay - AR + 12, AR * 1.15, (age - 1.2) / 0.7);
  paintNameAndTotal(cx, ay + AR + (mode === 'M2' ? 66 : 50), m, 44, smooth01((age - 1.0) / 0.5));
  l.slice(1, 3).forEach((d, i) => {
    paintRankingRow(
      i === 0 ? cx - 310 : cx + 8,
      1150,
      302,
      70,
      d,
      i + 2,
      appearanceFn(i + 3),
      false,
      false,
    );
  });
}

// Ranking panel: a solid card bordered by the leader's color, a light inner edge at the top, and a
// soft shadow made of layered strokes (no blur), to ground the ranking in front of the board.
function paintRankingPanel(y0: number, y1: number, rgb: string, a: number): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (a <= 0.01) return;
  const x0 = W / 2 - 352,
    w = 704,
    h = y1 - y0,
    rr = 34;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(0, (1 - a) * 26);
  for (let i = 5; i >= 1; i--) {
    ctx.fillStyle = 'rgba(0,0,0,' + (0.07).toFixed(2) + ')';
    ctx.beginPath();
    ctx.roundRect(x0 - i * 5, y0 - i * 4 + 10, w + i * 10, h + i * 8, rr + i * 5);
    ctx.fill();
  }
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, 'rgba(22,30,26,0.97)');
  g.addColorStop(1, 'rgba(9,13,11,0.97)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, rr);
  ctx.fill();
  ctx.fillStyle = 'rgba(' + rgb + ',0.05)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(' + rgb + ',0.42)';
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, rr);
  ctx.clip();
  const hl = ctx.createLinearGradient(0, y0, 0, y0 + 90);
  hl.addColorStop(0, 'rgba(255,255,255,0.07)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(x0, y0, w, 90);
  ctx.restore();
  ctx.restore();
}

function paintRanking(): void {
  const ctx = getCtx();
  if (!ctx || !round) return;
  const mode = settings.ranking,
    age = round.end - 2.0,
    cx = W / 2,
    appearanceFn = (i: number): number => smooth01((age - 0.5 - i * 0.22) / 0.5);
  const titleFn = (txt: string, y: number): void => {
    ctx.save();
    ctx.globalAlpha = smooth01((age - 0.3) / 0.5) * 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    try {
      ctx.letterSpacing = '4px';
    } catch {
      /* letterSpacing not universally supported */
    }
    ctx.fillText(txt, cx, y);
    ctx.restore();
  };
  {
    const topDonor = topDonors()[0],
      topDonorRgb = topDonor?.team === 'shadow' ? '180,212,222' : '242,197,124';
    paintRankingPanel(
      mode.startsWith('M') ? 706 : 832,
      mode.startsWith('M') ? 1222 : mode === 'C3' ? 1150 : 1236,
      topDonorRgb,
      smooth01((age - 0.05) / 0.6),
    );
  }
  if (mode.startsWith('M')) {
    paintMvp(mode, age, titleFn, appearanceFn);
    return;
  }
  if (mode === 'C1') {
    titleFn('TOP SUPPORTERS', 872);
    topDonors()
      .slice(0, 3)
      .forEach((d, i) => {
        paintRankingRow(
          cx - 300,
          940 + i * 96,
          600,
          i === 0 ? 88 : 78,
          d,
          i + 1,
          appearanceFn(i),
          false,
          i === 0,
        );
      });
  }
  if (mode === 'C2') {
    titleFn('TOP SUPPORTERS', 872);
    (['gold', 'shadow'] as Team[]).forEach((team, c) => {
      topDonors(team)
        .slice(0, 3)
        .forEach((d, i) => {
          paintRankingRow(
            c === 0 ? cx - 392 : cx + 12,
            940 + i * 92,
            380,
            78,
            d,
            i + 1,
            appearanceFn(i),
            c === 1,
            false,
          );
        });
    });
  }
  if (mode === 'C3') {
    const l = topDonors();
    titleFn('MVP OF THE ROUND', 884);
    const top = l[0];
    if (top) paintRankingRow(cx - 310, 968, 620, 104, top, 1, appearanceFn(0), false, true);
    l.slice(1, 3).forEach((d, i) => {
      paintRankingRow(
        i === 0 ? cx - 310 : cx + 8,
        1086,
        302,
        70,
        d,
        i + 2,
        appearanceFn(i + 1),
        false,
        false,
      );
    });
  }
}
