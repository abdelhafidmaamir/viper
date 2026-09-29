// Feed the Snake: around the board. The duel's ring (here it fills with the board), the berry
// dispenser in the alert slot, the round's leaderboard under the board, and the board-filled party.

import { ctx } from '../engine/canvas.ts';
import { tr } from '../engine/i18n.ts';
import { W } from '../engine/layout.ts';
import { BOARD_H, BOARD_W, FX0, FY0 } from './grid.ts';
import { GOLD, berryTint } from '../engine/palette.ts';
import { paintRoundEnd } from './leaderboard.ts';
import { FONT } from './paint.ts';
import { READY_TIME, TOTAL, cells, game, waiting } from './state.ts';

const GREEN = berryTint(null);

// ---- the ring ------------------------------------------------------------------------------

/** Same rail as the duel (12 px outside the board); its fill is how full the board is. */
export function paintRing(t: number): void {
  const c = ctx,
    x = FX0 - 26,
    y = FY0 - 26,
    w = BOARD_W + 52,
    h = BOARD_H + 52,
    r = 30;
  const fill = game.len / TOTAL,
    left = TOTAL - cells(),
    perim = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
  c.save();
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,255,255,0.1)';
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.stroke();
  // Drawn from the top center, clockwise, like the duel's timer.
  const urgent = left <= 20 && game.full < 0;
  const glow = urgent ? 0.6 + 0.4 * Math.sin(t * 7) : 0.9;
  c.setLineDash([perim * fill, perim]);
  c.lineDashOffset = -(w / 2 - r);
  const g = c.createLinearGradient(x, y + h, x, y);
  g.addColorStop(0, GREEN);
  g.addColorStop(1, GOLD);
  c.strokeStyle = urgent ? `rgba(242,197,124,${String(0.25 * glow)})` : 'rgba(155,226,138,0.18)';
  c.lineWidth = 17;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.stroke();
  c.strokeStyle = g;
  c.lineWidth = 7;
  c.stroke();
  c.restore();
}

// ---- the leaderboard under the board -------------------------------------------------------

export function paintLeaders(): void {
  const c = ctx,
    y = FY0 + BOARD_H + 80;
  const left = TOTAL - cells(),
    wait = waiting() + game.berries.size;
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // Status line right under the ring.
  c.font = `900 26px ${FONT}`;
  c.fillStyle = left <= 20 ? GOLD : '#fff';
  const status =
    game.full >= 0
      ? 'BOARD FILLED!'
      : `${String(Math.floor((game.len / TOTAL) * 100))}% FULL · ${String(left)} cells left`;
  c.fillText(status, W / 2 - (wait ? 120 : 0), y - 34);
  if (wait) {
    c.fillStyle = GREEN;
    c.fillText(`${String(wait)} berries`, W / 2 + 190, y - 34);
  }
  c.restore();
}

// ---- round complete ------------------------------------------------------------------------

/** Round complete: this round's ranking and the all-time supporters (leaderboard.ts). */
export function paintFull(): void {
  paintRoundEnd(performance.now() / 1000, waiting());
}

// ---- get ready -----------------------------------------------------------------------------

export function paintReady(): void {
  if (game.ready < 0) return;
  const c = ctx,
    left = READY_TIME - game.ready,
    n = Math.ceil(left - 0.6),
    word = n >= 1 ? String(n) : tr('feed.go'),
    k = (left - 0.6) % 1,
    pop = 1 + 0.35 * Math.max(0, k - 0.7) * 3;
  const cx = FX0 + BOARD_W / 2,
    cy = FY0 + BOARD_H / 2;
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.fillStyle = '#fff';
  c.font = `900 40px ${FONT}`;
  c.lineWidth = 10;
  c.strokeStyle = 'rgba(12,20,15,0.8)';
  c.strokeText(tr('feed.ready'), cx, cy - 110);
  c.fillText(tr('feed.ready'), cx, cy - 110);
  c.translate(cx, cy);
  c.scale(pop, pop);
  c.font = `900 150px ${FONT}`;
  c.lineWidth = 18;
  c.strokeText(word, 0, 10);
  c.fillStyle = n >= 1 ? GOLD : GREEN;
  c.fillText(word, 0, 10);
  c.restore();
}
