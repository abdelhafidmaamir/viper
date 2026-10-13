// Snake Arena: the qualifying on screen, read without words. The seats' eggs in two ranked rows,
// each holder's picture over its egg with their name above and their number of likes under it in
// a small badge (the hearts pop round the picture, beach.ts); the cut line under the seats; the
// three best challengers under it. A swap is two pictures crossing the line together, numbers in
// view, the bigger going up. Nothing presses: no seat is ever shown at risk, the cut line stays
// still to the end. A gift's seat has a gold egg and a gold outline on its photo. No ring here:
// the red ring means speed, in the battle only. Nothing written on the board: QUALIFYING is in the
// clock's pill (beach.ts).

import { ctx } from '../engine/canvas.ts';
import { GOLD } from '../engine/palette.ts';
import { BOARD_W, FCELL, FCOLS, FX0 } from '../feed/grid.ts';
import { FONT, paintFace } from '../feed/paint.ts';
import { bumpOf, paintStillEgg } from './board-paint.ts';
import { nameOf } from './entry.ts';
import {
  CUT_Y,
  QUALIFY,
  actors,
  challengers,
  isGold,
  isLocked,
  likesOf,
  qual,
  qualifying,
  seatOf,
  seatSpot,
  seats,
  type Actor,
} from './qualify.ts';
import { arena, cellX, cellY, toPx } from './rules.ts';

/** The name cut to fit `max` pixels at the current font. */
function fit(name: string, max: number): string {
  const c = ctx;
  if (c.measureText(name).width <= max) return name;
  let n = name;
  while (n.length > 1 && c.measureText(n + '…').width > max) n = n.slice(0, -1);
  return n + '…';
}

/** Room for a name: the gap between two eggs of the first row (or two challengers). */
export function column(): number {
  const first = Math.max(1, Math.ceil(seats.length / 2));
  return Math.floor(FCOLS / Math.max(first, QUALIFY.challengers)) * FCELL - 16;
}

function paintName(name: string, x: number, y: number): void {
  const c = ctx;
  c.save();
  c.font = `800 34px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.lineJoin = 'round';
  c.lineWidth = 7;
  c.strokeStyle = 'rgba(12,20,15,0.85)';
  const shown = fit(name, column());
  c.strokeText(shown, x, y);
  c.fillStyle = '#fff';
  c.fillText(shown, x, y);
  c.restore();
}

/** The badge: the number of likes, 34 bold, in a dark pill; no icon (the hearts pop round the photo). */
function paintBadge(n: number, x: number, y: number): void {
  const c = ctx,
    text = String(n);
  c.save();
  c.font = `900 34px ${FONT}`;
  const tw = c.measureText(text).width,
    w = Math.max(46, tw + 26),
    h = 46;
  c.fillStyle = 'rgba(8,12,10,0.82)';
  c.beginPath();
  c.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
  c.fill();
  c.fillStyle = '#fff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, x, y + 2);
  c.restore();
}

/** The eggs, the empty seats' marks and the cut line, on the board under the pictures. */
export function paintSeats(t: number): void {
  if (!qualifying()) return;
  const c = ctx;
  seats.forEach((seat, i) => {
    const egg = toPx(cellX(seat.cell), cellY(seat.cell));
    paintStillEgg(c, egg.x, egg.y, t + seat.cell, { gold: isGold(seat.holder) });
    const a = seat.holder ? actors.get(seat.holder) : undefined;
    if (a && Math.hypot(a.x - seatSpot(i).x, a.y - seatSpot(i).y) < 60) return;
    // An open seat: a faint mark where a picture will sit.
    const spot = seatSpot(i);
    c.save();
    c.globalAlpha = 0.3;
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    c.setLineDash([8, 8]);
    c.beginPath();
    c.arc(spot.x, spot.y, spot.r * 0.8, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  });
  // The cut line: soft, in the frame's gold, the same to the end.
  const fade =
    qual.t > QUALIFY.time ? Math.max(0, 1 - (qual.t - QUALIFY.time) / QUALIFY.freeze) : 1;
  c.save();
  c.globalAlpha = 0.45 * fade;
  c.strokeStyle = GOLD;
  c.lineCap = 'round';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(FX0 + 40, CUT_Y);
  c.lineTo(FX0 + BOARD_W - 40, CUT_Y);
  c.stroke();
  c.restore();
}

function paintActor(a: Actor, t: number): void {
  const c = ctx,
    locked = isGold(a.nickname),
    onBoard = a.leaving || !!seatOf(a.nickname) || challengers.includes(a.nickname),
    // Going back to the beach, its name and number fade out at once; coming up from the beach,
    // they show only as it arrives: one name per animal, never on the sand or the sea.
    leavingWords = a.leaving
      ? Math.max(0, 1 - a.t / 0.2)
      : a.rising
        ? Math.max(0, Math.min(1, (a.t / a.dur - 0.7) / 0.3))
        : 1,
    r = a.r * bumpOf(a.nickname),
    // At 0:00 the names and numbers fade: the hatch takes over.
    words = qual.t > QUALIFY.time ? Math.max(0, 1 - (qual.t - QUALIFY.time) / QUALIFY.freeze) : 1;
  c.save();
  c.globalAlpha = Math.max(0, Math.min(1, a.alpha));
  if (locked) {
    c.save();
    c.globalAlpha *= 0.3 + 0.1 * Math.sin(t * 3);
    c.fillStyle = GOLD;
    c.beginPath();
    c.arc(a.x, a.y, r + 12, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  const fan = { nickname: a.nickname, avatar: arena.viewers.get(a.nickname)?.avatar };
  paintFace(fan, a.x, a.y, r, locked ? GOLD : 'rgba(255,255,255,0.55)');
  const n = likesOf(a.nickname);
  if (onBoard && words * leavingWords > 0) {
    c.globalAlpha *= words * leavingWords;
    paintName(nameOf(a.nickname), a.x, a.y - r - 6);
    // A paid seat shows no badge: its gold egg and outline say it.
    if (!isLocked(a.nickname)) paintBadge(n, a.x, a.y + r + 2);
  }
  c.restore();
}

/** The pictures: the seats' holders, the challengers, and those going back to the beach. */
export function paintActors(t: number): void {
  if (!qualifying()) return;
  // The ones leaving first, under; the seats last, on top.
  const list = [...actors.values()].sort(
    (p, q) => Number(!!seatOf(p.nickname)) - Number(!!seatOf(q.nickname)),
  );
  for (const a of list) paintActor(a, t);
}
