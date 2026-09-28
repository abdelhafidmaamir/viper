// Feed the Snake: around the board. The duel's ring (here it fills with the board), the berry
// dispenser in the alert slot, the round's leaderboard under the board, and the board-filled party.

import { ctx } from '../engine/canvas.ts';
import { tr } from '../engine/i18n.ts';
import { SC_CY, W } from '../engine/layout.ts';
import { BOARD_H, BOARD_W, FX0, FY0 } from './grid.ts';
import { GOLD, berryTint } from '../engine/palette.ts';
import { FONT, paintFace } from './paint.ts';
import { FULL_HOLD, READY_TIME, TOTAL, cells, game, leaders, likers, waiting } from './state.ts';

const GREEN = berryTint(null);

function pill(x: number, y: number, w: number, h: number, fill: string): void {
  const c = ctx;
  c.beginPath();
  c.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  c.fillStyle = fill;
  c.fill();
}

const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

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

function table(
  title: string,
  kicker: string,
  unit: string,
  rows: { nickname: string; avatar?: string | undefined; n: number }[],
  y: number,
  accent: string,
): void {
  const c = ctx,
    w = 760,
    x = W / 2 - w / 2,
    rowH = 64,
    h = 104 + Math.max(1, rows.length) * rowH;
  c.fillStyle = 'rgba(12,20,15,0.88)';
  c.beginPath();
  c.roundRect(x, y, w, h, 22);
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(232,241,220,0.14)';
  c.stroke();
  c.textAlign = 'center';
  c.fillStyle = accent;
  c.font = `800 16px ${FONT}`;
  c.fillText(kicker, W / 2, y + 30);
  c.fillStyle = '#fff';
  c.font = `900 34px ${FONT}`;
  c.fillText(title, W / 2, y + 66);
  if (!rows.length) {
    c.fillStyle = 'rgba(232,241,220,0.6)';
    c.font = `700 22px ${FONT}`;
    c.fillText(tr('feed.nobody'), W / 2, y + 104 + rowH / 2);
  }
  rows.forEach((r, i) => {
    const ry = y + 104 + i * rowH + rowH / 2;
    if (i % 2 === 0) {
      c.fillStyle = 'rgba(255,255,255,0.04)';
      c.fillRect(x + 12, ry - rowH / 2 + 4, w - 24, rowH - 8);
    }
    c.textAlign = 'left';
    c.fillStyle = i === 0 ? GOLD : accent;
    c.font = `900 26px ${FONT}`;
    c.fillText(`#${String(i + 1)}`, x + 30, ry);
    paintFace(r, x + 124, ry, 24, i === 0 ? GOLD : 'rgba(232,241,220,0.5)');
    c.fillStyle = '#fff';
    c.font = `800 24px ${FONT}`;
    c.fillText(clip(r.nickname, 20), x + 164, ry);
    c.textAlign = 'right';
    c.fillStyle = i === 0 ? GOLD : accent;
    c.font = `900 26px ${FONT}`;
    c.fillText(`${String(r.n)} ${unit}`, x + w - 30, ry);
  });
}

/** Round complete: the like champion, the supporters and the likers, then the next round. */
export function paintFull(): void {
  if (game.full < 0) return;
  const c = ctx,
    a = game.full,
    fade = Math.min(1, a / 0.4) * Math.min(1, (FULL_HOLD - a) / 0.5);
  const cx = FX0 + BOARD_W / 2;
  c.save();
  c.globalAlpha = Math.max(0, fade);
  c.fillStyle = 'rgba(6,10,8,0.72)';
  c.fillRect(0, 0, W, SC_CY + 200);
  // A short burst of confetti over the filled board.
  if (a < 3)
    for (let i = 0; i < 90; i++) {
      const s = (i * 0.618034) % 1,
        v = (i * 0.414214) % 1;
      const x = cx + (s - 0.5) * BOARD_W * 1.1 + Math.sin(a * 2 + i) * 20,
        y = FY0 - 40 + a * (260 + 220 * v) + v * 300;
      c.save();
      c.globalAlpha = Math.max(0, fade * (1 - a / 3));
      c.translate(x, y);
      c.rotate(a * 3 + i);
      c.fillStyle = [GREEN, GOLD, '#b4d4de', '#fff'][i % 4] ?? '#fff';
      c.fillRect(-7, -3, 14, 6);
      c.restore();
    }
  const pop = a < 0.35 ? 0.7 + 0.3 * Math.sin((a / 0.35) * (Math.PI / 2)) : 1;
  c.translate(W / 2, 0);
  c.scale(pop, pop);
  c.translate(-W / 2, 0);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = GOLD;
  c.font = `900 50px ${FONT}`;
  c.fillText(tr('feed.filled'), W / 2, 250);
  c.fillStyle = '#fff';
  c.font = `800 26px ${FONT}`;
  const left = Math.max(0, Math.ceil(FULL_HOLD - a));
  c.fillText(tr('feed.next', { n: game.eaten, q: String(left) }), W / 2, 298);
  const champ = likers(1)[0];
  if (champ) {
    pill(W / 2, 370, 460, 84, 'rgba(12,20,15,0.9)');
    c.lineWidth = 2;
    c.strokeStyle = GREEN;
    c.stroke();
    paintFace(champ, W / 2 - 170, 370, 30, GREEN);
    c.textAlign = 'left';
    c.fillStyle = GREEN;
    c.font = `800 15px ${FONT}`;
    c.fillText(tr('feed.likeChampion'), W / 2 - 124, 350);
    c.fillStyle = '#fff';
    c.font = `900 28px ${FONT}`;
    c.fillText(clip(champ.nickname, 16), W / 2 - 124, 378);
    c.fillStyle = 'rgba(232,241,220,0.75)';
    c.font = `700 17px ${FONT}`;
    c.fillText(tr('feed.likes', { n: champ.likes }), W / 2 - 124, 400);
  }
  table(
    tr('feed.topSupporters'),
    tr('feed.finalRanking'),
    tr('feed.coins'),
    leaders(4).map((f) => ({ nickname: f.nickname, avatar: f.avatar, n: f.coins })),
    440,
    GREEN,
  );
  table(
    tr('feed.topLikes'),
    tr('feed.thisRound'),
    tr('feed.likesUnit'),
    likers(4).map((l) => ({ nickname: l.nickname, avatar: l.avatar, n: l.likes })),
    830,
    '#b4d4de',
  );
  c.restore();
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
