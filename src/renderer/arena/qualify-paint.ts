// Snake Arena: the qualifying on screen. Each seat's egg with the picture of its holder over it,
// their red ring filled by their likes this qualifying (full for the top liker), a full gold ring
// for a seat held by a gift; the pictures flying between the beach and the eggs; the word
// QUALIFYING where GET READY shows.

import { ctx } from '../engine/canvas.ts';
import { tr } from '../engine/i18n.ts';
import { GOLD } from '../engine/palette.ts';
import { BOARD_H, BOARD_W, FX0, FY0 } from '../feed/grid.ts';
import { FONT, paintFace } from '../feed/paint.ts';
import { SEAT_PHOTO, likesRing, paintStillEgg } from './board-paint.ts';
import { FLIGHT } from './entry.ts';
import {
  qualLikes,
  qualifying,
  seatFlights,
  seatPhoto,
  seats,
  topLikes,
  type Seat,
} from './qualify.ts';
import { arena, cellX, cellY, toPx } from './rules.ts';

const RED = '#ff3b5c';
const smooth = (v: number): number => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};

function paintName(name: string, x: number, y: number): void {
  const c = ctx,
    short = name.length > 16 ? name.slice(0, 15) + '…' : name;
  c.save();
  c.font = `800 20px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'bottom';
  c.lineJoin = 'round';
  c.lineWidth = 5;
  c.strokeStyle = 'rgba(12,20,15,0.8)';
  c.strokeText(short, x, y);
  c.fillStyle = '#fff';
  c.fillText(short, x, y);
  c.restore();
}

function paintSeat(seat: Seat, t: number): void {
  const c = ctx,
    egg = toPx(cellX(seat.cell), cellY(seat.cell)),
    photo = seatPhoto(seat),
    r = SEAT_PHOTO;
  paintStillEgg(c, egg.x, egg.y, t + seat.cell);
  const v = seat.holder ? arena.viewers.get(seat.holder) : undefined;
  if (!seat.holder || seat.since < FLIGHT) {
    // An open seat: a faint mark where a picture will sit.
    c.save();
    c.globalAlpha = 0.3;
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    c.setLineDash([6, 6]);
    c.beginPath();
    c.arc(photo.x, photo.y, r, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    return;
  }
  const fan = { nickname: seat.holder, avatar: v?.avatar };
  c.save();
  c.strokeStyle = seat.locked ? 'rgba(242,197,124,0.8)' : 'rgba(255,255,255,0.5)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(egg.x, egg.y - 14);
  c.lineTo(photo.x, photo.y + r);
  c.stroke();
  c.restore();
  if (seat.locked) {
    // Held by a gift: the ring full, in gold, glowing softly.
    c.save();
    c.globalAlpha = 0.25 + 0.1 * Math.sin(t * 3);
    c.fillStyle = GOLD;
    c.beginPath();
    c.arc(photo.x, photo.y, r + 10, 0, Math.PI * 2);
    c.fill();
    c.restore();
    paintFace(fan, photo.x, photo.y, r, GOLD);
    c.save();
    c.lineWidth = Math.max(3, r * 0.16);
    c.strokeStyle = GOLD;
    c.beginPath();
    c.arc(photo.x, photo.y, r, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  } else {
    paintFace(fan, photo.x, photo.y, r, 'rgba(255,255,255,0.55)');
    const top = topLikes(),
      mine = qualLikes.get(seat.holder) ?? 0;
    if (top > 0) likesRing(photo.x, photo.y, r, mine / top);
  }
  paintName(seat.holder, photo.x, photo.y - r - 8);
}

/** The seats' eggs and pictures, on the board during the qualifying. */
export function paintSeats(t: number): void {
  if (!qualifying()) return;
  for (const seat of seats) paintSeat(seat, t);
}

/** Pictures flying up to a seat, or back down to the beach. */
export function paintSeatFlights(): void {
  for (const f of seatFlights) {
    const u = smooth(f.t / FLIGHT),
      x = f.x + (f.tx - f.x) * u,
      y = f.y + (f.ty - f.y) * u - Math.sin(u * Math.PI) * (f.down ? 60 : 120),
      r = f.down ? SEAT_PHOTO + 11 * u : 45 - 11 * u;
    paintFace(f, x, y, r, f.down ? 'rgba(255,255,255,0.55)' : RED);
  }
}

/** QUALIFYING, where and as big as Feed's GET READY. */
export function paintQualifying(): void {
  if (!qualifying()) return;
  const c = ctx,
    cx = FX0 + BOARD_W / 2,
    cy = FY0 + BOARD_H / 2,
    word = tr('arena.qualifying');
  c.save();
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.fillStyle = '#fff';
  c.font = `900 40px ${FONT}`;
  c.lineWidth = 10;
  c.strokeStyle = 'rgba(12,20,15,0.8)';
  c.strokeText(word, cx, cy - 110);
  c.fillText(word, cx, cy - 110);
  c.restore();
}
