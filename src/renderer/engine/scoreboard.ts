// The arcade scoreboard under the board: one glyph and one count per team, the round clock
// between them.

import { SC_CY, W } from './layout.ts';
// ctx is always non-null when paint functions are called (bindCanvas runs before any rendering)
import { ctx } from './canvas.ts';
import { BLUE, SHADOW, GOLD } from './palette.ts';
import { paintViewersGlyph } from './frame.ts';
import {
  round,
  snakePulse,
  viewersPulse,
  settings,
  snakeScore,
  scoreViewers,
} from '../scripts/game.ts';

// Scoreboard under the board. The board ends at Y0+ROWS*CELL (1220) and the TikTok
// comment feed starts at 1290. The band 1226-1284 is the only location both in the safe
// zone and never covered by the interface.
// Reads without labels: snake head and win count on the left, crowd glyph and count on the
// right. No text, consistent with the ring and stars.
// In duel mode, each team occupies one side. The two lateral columns (x 40-124 and 956-1040)
// are free for the full height and are within the safe zone (SR_X=40, SR_W=1000).
// The board spans x=124 to x=956 and is not touched.
// One team per side frees up height, which was the real constraint for the bottom-bar version:
// between the ring (1234) and the comment feed (1290) there were only 56 px.
// The chosen height (258-400) aligns with the top of the star columns (CIEL_HAUT=260).
// The lateral columns are wide. The ring runs from X0-14=150 to X0+COLS*CELL+14=930,
// leaving 150 px on each side. The free band sits between the top chrome bottom (260)
// and the TikTok gift widget top (392): 132 px.
// The plate occupies 266-390, leaving 6 px below the chrome and 2 px above the widgets.
// Both teams fit in a single horizontal bar, centered, just below the board. The scoreboard
// reads under the game like an arcade cabinet, not on the side. The bar under the ring (1232)
// and the comment feed is narrow, so it is low and compact: glyph then count, side by side,
// a vertical rule between the two teams.
const SC_SPACING = 122; // distance between the two team centers, on each side of W/2
const SC_GLYPH_OFFSET = 32; // glyph-to-count distance within a team
const SC_R = 13; // glyph radius, compact
const SC_BW = 250,
  SC_BH = 48; // plate width and height, kept compact

export const smooth01 = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Score digit bounce on a new point: a sharp push then a damped return.
// 0.9 s maximum: beyond that the digit is still dancing when the viewer has already moved on.
function bounce(p: number): number {
  if (p >= 0.9) return 1;
  const u = p / 0.9;
  // capped at 1.25: beyond that a two-digit number overflows the 84 px band
  return 1 + 0.3 * Math.sin(Math.PI * smooth01(u * 1.25)) * (1 - u);
}

// Snake head glyph for the scoreboard: the same silhouette as in-game, at small scale.
// Two eyes, not an abstract pictogram: this is what makes the team obvious without a label.
export function paintSnakeGlyph(x: number, y: number, r: number, tint?: string): void {
  ctx.fillStyle = tint ?? '#e8f1dc';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // neck stub pointing back, so it reads as a head and not a ball
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 1.15;
  ctx.strokeStyle = tint ?? '#d9e7cc';
  ctx.beginPath();
  ctx.moveTo(x - r * 0.2, y + r * 0.35);
  ctx.lineTo(x - r * 1.25, y + r * 0.72);
  ctx.stroke();
  ctx.fillStyle = '#1b2a1f';
  for (const o of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(x + r * 0.36, y + o * r * 0.36, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Viewer team glyph: two people. Two rejected designs before this: three overlapping discs
// (read as a chat icon) and a stone (shows what the team gives, not what it is).
// Two head-and-shoulders silhouettes with a clear gap between them, the smaller one receding:
// the universal sign for people, and two is enough to imply plurality. The gap between
// them is cut with `destination-out`; without it the two bodies merge into one blob at this size.
export function paintPersonGlyph(x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y - r * 0.95, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  // shoulders: a wide arc closed flat, the shape that reads as a torso not a mushroom
  ctx.beginPath();
  ctx.moveTo(x - r * 1.05, y + r * 1.15);
  ctx.quadraticCurveTo(x - r * 1.02, y + r * 0.02, x, y + r * 0.02);
  ctx.quadraticCurveTo(x + r * 1.02, y + r * 0.02, x + r * 1.05, y + r * 1.15);
  ctx.closePath();
  ctx.fill();
}

// One team: its glyph then its round win count, side by side on the SC_CY line.
// Only the glyph and the digit animate on a score event, never the plate: otherwise
// the whole bar dances and the two teams can no longer be compared.
// tint (duel): both teams are snakes, each in its team color.
// mirrored (right team): the count moves to the center side and the glyph to the edge,
// like a football scoreboard: glyph, count | count, glyph.
function teamBar(
  cx: number,
  n: number,
  sun: boolean,
  pulse: number,
  tint: string | undefined,
  mirrored?: boolean,
): void {
  const sg = mirrored ? -1 : 1;
  const k = bounce(pulse),
    lively = Math.max(0, 1 - pulse / 0.9);
  const glow = tint ?? (sun ? 'rgba(242,197,124,0.85)' : 'rgba(143,168,216,0.85)');
  ctx.save();
  ctx.translate(cx - sg * SC_GLYPH_OFFSET, SC_CY);
  ctx.scale(sg * k, 1); // mirror: the right-team glyph faces the other way
  if (lively > 0.02) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 26 * lively;
  }
  if (sun || tint) paintSnakeGlyph(0, 0, SC_R, tint);
  else paintViewersGlyph(0, 0, SC_R);
  ctx.restore();

  ctx.save();
  ctx.translate(cx + sg * SC_GLYPH_OFFSET, SC_CY);
  ctx.scale(k, k);
  if (lively > 0.02) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 24 * lively;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '500 30px "IBM Plex Mono", ui-monospace, monospace';
  ctx.fillStyle = tint ?? (sun ? GOLD : BLUE);
  ctx.fillText(String(n), 0, 1);
  ctx.restore();
}

export function paintScore(): void {
  // In duel mode: one snake per team, gold on the left, shadow on the right, same plate, same logic.
  const cx = W / 2;
  // The remaining round time is shown in digits between the two scores, like a football scorecard.
  // The plate widens to accommodate it; glyphs are unchanged.
  const timer = round,
    bw = timer ? SC_BW + 84 : SC_BW,
    spacing = timer ? SC_SPACING + 84 : SC_SPACING;
  ctx.save();
  // plate: the scoreboard must read in full daylight and at night, so it carries its own
  // dark, discreet background. A single plate for both teams.
  ctx.fillStyle = 'rgba(6,11,8,0.46)';
  ctx.beginPath();
  ctx.roundRect(cx - bw / 2, SC_CY - SC_BH / 2, bw, SC_BH, SC_BH / 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  if (timer) {
    const matchDuration = settings.duelDuration || settings.duration,
      r = Math.max(0, Math.ceil(matchDuration - (timer.t || 0)));
    const txt = `${String(Math.floor(r / 60))}:${String(r % 60).padStart(2, '0')}`;
    ctx.beginPath();
    ctx.moveTo(cx - 42, SC_CY - 13);
    ctx.lineTo(cx - 42, SC_CY + 13);
    ctx.moveTo(cx + 42, SC_CY - 13);
    ctx.lineTo(cx + 42, SC_CY + 13);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '500 24px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle =
      r <= 20 && timer.state === 'playing' ? 'rgba(240,78,62,0.95)' : 'rgba(255,255,255,0.72)';
    ctx.fillText(txt, cx, SC_CY + 1);
  } else {
    // vertical rule between the two teams
    ctx.beginPath();
    ctx.moveTo(cx, SC_CY - 13);
    ctx.lineTo(cx, SC_CY + 13);
    ctx.stroke();
  }
  ctx.restore();
  teamBar(cx - spacing / 2, snakeScore, true, snakePulse, GOLD);
  teamBar(cx + spacing / 2, scoreViewers, false, viewersPulse, SHADOW, true);
}

// TikTok interface overlay, for judging the game under real conditions rather than on a bare
// canvas. These are not abstract reference zones: they are the actual UI elements drawn at
// measured positions so you can see what covers what, what stays readable, and where the
// viewer's eye actually lands. Purely visual, no effect on the game, absent by default.
export function pill(x: number, y: number, w: number, h: number, tint: string, r?: number): void {
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r ?? h / 2);
  ctx.fill();
}
