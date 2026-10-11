// Snake Arena: around the board. The ring as the round's clock (Feed's ring, full at the start and
// emptying as the time runs out, in the crown holder's colour, the time left at its top), the red
// likes ring inside each animal's picture on the beach (the way in), and the picture flying from
// the beach to the egg its snake hatches from.

import { ctx } from '../engine/canvas.ts';
import { GOLD } from '../engine/palette.ts';
import { paintRing } from '../feed/hud.ts';
import { BOARD_W, FX0, FY0 } from '../feed/grid.ts';
import { FONT, paintFace } from '../feed/paint.ts';
import { crabFaces, setCrabSpots, sleepersFrom, type CrabSpot } from '../feed/crabs.ts';
import { H, W } from '../engine/layout.ts';
import { COLOURS, crownColour, likesRing } from './board-paint.ts';
import {
  ENTRY,
  FLIGHT,
  HEART_FLIGHT,
  QUEUE,
  flights,
  likeHearts,
  queueOrder,
  rings,
} from './entry.ts';
import { bigHeart } from '../feed/alert-fx.ts';
import { TUNING, alive, arena, places, snakeOf } from './rules.ts';
import { QUALIFY, qualLeft, qualLikes, qualifying, topLikes } from './qualify.ts';

const RED = '#ff3b5c';
const smooth = (v: number): number => {
  const x = Math.max(0, Math.min(1, v));
  return x * x * (3 - 2 * x);
};

/** "1:42" */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Feed's ring as the round's clock: full when the round starts, empty at 0:00, in step with the
 * time left written small at its top centre.
 */
export function paintArenaRing(t: number): void {
  if (qualifying()) {
    paintRing(t, qualLeft() / QUALIFY.time, false);
    return;
  }
  const left = Math.max(0, TUNING.roundTime - arena.time),
    playing = arena.phase === 'play' || arena.phase === 'ready',
    urgent = left <= 20 && arena.phase === 'play';
  paintRing(t, playing ? left / TUNING.roundTime : 0, urgent, crownColour() ?? undefined);
}

/** The time left, small at the ring's top centre: painted after the flower, which reaches over it. */
export function paintArenaTime(): void {
  const q = qualifying(),
    left = q ? qualLeft() : Math.max(0, TUNING.roundTime - arena.time),
    urgent = q ? left <= 5 : left <= 20 && arena.phase === 'play';
  if (!q && arena.phase !== 'play' && arena.phase !== 'ready') return;
  const c = ctx,
    x = FX0 + BOARD_W / 2,
    y = FY0 - 26,
    text = clockText(left);
  c.save();
  c.font = `900 26px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const w = c.measureText(text).width + 22;
  c.fillStyle = 'rgba(8,12,10,0.78)';
  c.beginPath();
  c.roundRect(x - w / 2, y - 17, w, 34, 17);
  c.fill();
  c.fillStyle = urgent ? GOLD : '#fff';
  c.fillText(text, x, y + 1);
  c.restore();
}

/** A picture's radius at full size. */
const PHOTO = 39;
/** The players' order on the beach, and when it last changed. */
let ranking: string[] = [],
  rankedAt = -Infinity;
const RERANK = 1.5;

/**
 * The beach in two groups on Feed's ground line, laid out each frame, clear of the sleeping crabs
 * on the right. On the left one animal per viewer's snake on the board, biggest snake first and
 * crowned, its picture outlined in the snake's colour and a flag of that colour beside it. A gap
 * away, the queue in single file, the fullest ring at the front nearest the players, tagged NEXT.
 * The size is the largest at which no picture touches another.
 */
export function layOutBeach(): void {
  const players = alive()
      .filter((s) => !s.wild)
      .sort((p, q) => p.id - q.id),
    margin = 70,
    right = Math.min(W - margin, sleepersFrom()),
    gap = 90,
    playerSlots = Math.max(1, places()),
    // The width splits between the groups in proportion to their spots.
    width = right - margin - gap,
    unit = width / (playerSlots + QUEUE.spots - 1 + 1),
    scale = Math.max(0.55, Math.min(1, (unit - 10) / (2 * PHOTO))),
    queueFrom = margin + playerSlots * unit + gap,
    spots: CrabSpot[] = [];
  // The players stand in ranking order, the biggest first; one place changes at a time and only
  // when a snake is clearly bigger, so the line reads, then moves.
  ranking = ranking.filter((n) => players.some((s) => s.nickname === n));
  for (const s of players) if (!ranking.includes(s.nickname)) ranking.push(s.nickname);
  const lenOf = (n: string): number => players.find((s) => s.nickname === n)?.len ?? 0;
  if (arena.clock - rankedAt > RERANK)
    for (let i = 0; i + 1 < ranking.length; i++) {
      const a = ranking[i] ?? '',
        b = ranking[i + 1] ?? '';
      if (lenOf(b) >= lenOf(a) + 2) {
        ranking[i] = b;
        ranking[i + 1] = a;
        rankedAt = arena.clock;
        break;
      }
    }
  ranking.forEach((nickname, i) => {
    const s = players.find((p) => p.nickname === nickname);
    if (!s) return;
    spots.push({
      nickname,
      avatar: s.avatar,
      x: margin + i * unit,
      ring: COLOURS[s.colour],
      crown: arena.crown === s.id,
    });
  });
  queueOrder()
    .filter((nickname) => !players.some((s) => s.nickname === nickname))
    .forEach((nickname, i) => {
      spots.push({
        nickname,
        avatar: arena.viewers.get(nickname)?.avatar,
        x: queueFrom + i * unit,
        tag: i === 0 && !qualifying() ? 'NEXT' : undefined,
      });
    });
  // Every animal on one line in the sand: a ranking change, or a move in the queue, is a walk
  // sideways along it, the one moving up passing in front of the other.
  setCrabSpots(spots, { scale, lane: 0, step: unit });
}

/** A player's flag: a small pennant in their snake's colour, held up beside the picture. */
export function paintFlags(t: number): void {
  const c = ctx;
  for (const s of alive()) {
    if (s.wild) continue;
    const f = crabFaces().get(s.nickname);
    if (!f) continue;
    const x = f.x + f.r * 0.95,
      top = f.y - f.r * 1.5,
      wave = Math.sin(t * 5 + s.id) * 3;
    c.save();
    c.strokeStyle = 'rgba(60,40,20,0.9)';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(x, f.y + f.r * 0.6);
    c.lineTo(x, top);
    c.stroke();
    c.fillStyle = COLOURS[s.colour];
    c.beginPath();
    c.moveTo(x, top);
    c.lineTo(x + f.r * 0.85, top + f.r * 0.25 + wave);
    c.lineTo(x, top + f.r * 0.55);
    c.closePath();
    c.fill();
    c.restore();
  }
}

/** An animal's picture is drawn at 28 of its 32 half-size units (crabs.ts paints it so). */
const CRAB_PHOTO = 28 / 32;

/**
 * The red ring on each waiting animal's picture outline, where crabs.ts drew the picture this
 * frame. On the beach a red ring only ever means likes filling the way in: a player's animal wears
 * none, its likes fill the speed ring on its snake's picture on the board.
 */
export function paintBeachRings(t: number): void {
  const need = ENTRY.likesNeeded,
    q = qualifying(),
    top = topLikes(),
    leader = q ? undefined : queueOrder()[0],
    c = ctx;
  for (const [nickname, f] of crabFaces()) {
    if (snakeOf(nickname)) continue;
    if (nickname === leader) {
      // The one going in next: its ring glows a little, softly breathing.
      const r = f.r * CRAB_PHOTO;
      c.save();
      c.strokeStyle = RED;
      c.globalAlpha = 0.18 + 0.1 * Math.sin(t * 4);
      c.lineWidth = r * 0.5;
      c.beginPath();
      c.arc(f.x, f.y, r + r * 0.1, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
    // During the qualifying the ring is this race's likes, full for its top liker.
    const fill = q
      ? top > 0
        ? (qualLikes.get(nickname) ?? 0) / top
        : 0
      : (rings.get(nickname) ?? 0) / need;
    if (fill > 0.01) likesRing(f.x, f.y, f.r * CRAB_PHOTO, Math.min(1, fill));
  }
}

/** Each like as the prod heart, flying from the bottom right corner into its viewer's ring. */
export function paintLikeHearts(): void {
  const c = ctx,
    sprite = bigHeart(true);
  for (const h of likeHearts) {
    const f = crabFaces().get(h.nickname);
    if (!f || h.t < h.delay) continue;
    const u = smooth((h.t - h.delay) / HEART_FLIGHT),
      x0 = W - 40,
      y0 = H + 20,
      x = x0 + (f.x - x0) * u,
      y = y0 + (f.y - y0) * u - Math.sin(u * Math.PI) * 90,
      size = 34 - 12 * u;
    c.save();
    c.globalAlpha = 1 - 0.3 * u;
    c.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    c.restore();
  }
}

/** A full ring: the picture flies from the beach to the egg its snake hatches from. */
export function paintFlights(): void {
  for (const f of flights) {
    const u = smooth(f.t / FLIGHT),
      x = f.x + (f.tx - f.x) * u,
      y = f.y + (f.ty - f.y) * u - Math.sin(u * Math.PI) * 120,
      r = 45 - 20 * u;
    paintFace(f, x, y, r, RED);
  }
}
