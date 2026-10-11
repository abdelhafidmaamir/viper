// Snake Arena's board: everything between the ring's four sides. The frame loop (main.ts) gives
// it time, the canvas, the round's start and end and the viewers' likes and gifts, and asks for
// the round clock. Nothing else in the window knows how the board plays, so the game itself can
// be swapped in behind these few functions.
//
// For now the board is a placeholder: one snake loops round the board, a cell longer for each
// berry given this round.

import { ARENA_DEFAULTS, type ArenaSettings } from '../../shared/arena-protocol.ts';
import { FCELL, FCOLS, FROWS, FX0, FY0 } from '../feed/grid.ts';
import { snakeTint } from '../feed/paint.ts';

let settings: ArenaSettings = ARENA_DEFAULTS;

/** The control room's tuning values; the round length applies from the next round. */
export function setArenaSettings(next: ArenaSettings): void {
  settings = next;
}

/** Gifts sent once the round was over: they are paid for, so they play in the next round. */
const nextRound: { nickname: string; avatar: string | undefined; n: number }[] = [];
let over = false,
  secondsLeft = ARENA_DEFAULTS.roundLength,
  /** This round's length: a new setting waits for the next round. */
  roundLength = ARENA_DEFAULTS.roundLength,
  /** Likes and berries that reached the board this round. */
  likes = 0,
  berries = 0,
  /** The placeholder snake's place on its loop, in cells. */
  along = 0;

const SPEED = 9,
  START_LEN = 6,
  MAX_LEN = 80,
  /** The loop runs this many cells inside the board's edge. */
  INSET = 3;

/**
 * A new round: the board empties and the clock starts again at the round length. Gifts sent
 * during the last end screen come in first.
 */
export function newArenaRound(): void {
  roundLength = settings.roundLength;
  secondsLeft = roundLength;
  likes = 0;
  berries = 0;
  over = false;
  for (const g of nextRound.splice(0)) arenaGift(g.nickname, g.avatar, g.n);
}

/** The round stops and its end screen shows. */
export function endArenaRound(): void {
  over = true;
}

/** Plays dt seconds of the round. True on the frame its time runs out. */
export function advanceArena(dt: number): boolean {
  along += dt * SPEED;
  if (over || secondsLeft <= 0) return false;
  secondsLeft = Math.max(0, secondsLeft - dt);
  if (secondsLeft > 0) return false;
  over = true;
  return true;
}

/** A viewer's likes: `n` of them at once, as TikTok batches them. */
export function arenaLike(nickname: string, _avatar: string | undefined, n: number): void {
  if (!nickname || n <= 0) return;
  likes += n;
}

/** A viewer's gift, already priced in berries (the control room's price list). */
export function arenaGift(nickname: string, avatar: string | undefined, n: number): void {
  if (!nickname || n <= 0) return;
  if (over) {
    nextRound.push({ nickname, avatar, n });
    return;
  }
  berries += n;
}

/** Seconds left in the round and how long it was set to last, read every frame for the ring. */
export function arenaClock(): { secondsLeft: number; roundLength: number } {
  return { secondsLeft, roundLength };
}

export interface ArenaStatus {
  readonly secondsLeft: number;
  readonly roundLength: number;
  /** Likes that reached the board this round. */
  readonly likes: number;
  /** Berries eaten on the board this round, for the end screen. */
  readonly eaten: number;
}

/** The round so far. */
export function arenaStatus(): ArenaStatus {
  return { secondsLeft, roundLength, likes, eaten: berries };
}

// ---- the placeholder snake -----------------------------------------------------------------

const SIDE_W = FCOLS - 2 * INSET - 1,
  SIDE_H = FROWS - 2 * INSET - 1,
  LOOP = 2 * (SIDE_W + SIDE_H);

/** The centre of the cell `k` steps round the loop, clockwise from its top left corner. */
function loopPoint(k: number): { x: number; y: number } {
  const s = ((k % LOOP) + LOOP) % LOOP;
  let gx: number, gy: number;
  if (s < SIDE_W) [gx, gy] = [s, 0];
  else if (s < SIDE_W + SIDE_H) [gx, gy] = [SIDE_W, s - SIDE_W];
  else if (s < 2 * SIDE_W + SIDE_H) [gx, gy] = [SIDE_W - (s - SIDE_W - SIDE_H), SIDE_H];
  else [gx, gy] = [0, SIDE_H - (s - 2 * SIDE_W - SIDE_H)];
  return { x: FX0 + (INSET + gx + 0.5) * FCELL, y: FY0 + (INSET + gy + 0.5) * FCELL };
}

/** Draws the board. `hour` is the time of day, 0 to 1, for anything that changes with it. */
export function paintArena(c: CanvasRenderingContext2D, t: number, hour: number): void {
  const length = Math.min(MAX_LEN, START_LEN + berries),
    head = loopPoint(along);
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = snakeTint();
  c.lineWidth = FCELL * 0.8;
  c.beginPath();
  c.moveTo(head.x, head.y);
  // One point per cell back along the loop, the last one part of the way.
  for (let k = 1; k <= Math.ceil(length); k++) {
    const p = loopPoint(along - Math.min(k, length));
    c.lineTo(p.x, p.y);
  }
  c.stroke();
  // Eyes that glow a little at night, blinking now and then.
  const night = hour < 0.2 || hour > 0.85,
    open = Math.sin(t * 1.3) > -0.97;
  c.fillStyle = night ? '#fff6c8' : '#fff';
  for (const side of [-1, 1]) {
    c.beginPath();
    c.arc(head.x + side * FCELL * 0.18, head.y - FCELL * 0.08, FCELL * 0.12, 0, Math.PI * 2);
    c.fill();
  }
  if (open) {
    c.fillStyle = '#10140f';
    for (const side of [-1, 1]) {
      c.beginPath();
      c.arc(head.x + side * FCELL * 0.18, head.y - FCELL * 0.06, FCELL * 0.06, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}
