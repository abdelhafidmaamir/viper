// Snake Arena, continuous play (the control room's "Continuous play", on by default). The board
// never empties: `places()` snakes always play, and a snake nobody owns is the computer's, a white
// egg in its picture's circle and no name. A like from a viewer without a snake takes a free one
// at once: the computer's snake leaves the board, an egg comes at its place and the viewer's snake
// hatches from it at the starting length, their picture over it. With no snake free they wait in
// line, first like first, and a gift goes ahead of the line. A life comes from the extra-life gift
// alone (Money tab, when on), up to "Lives at most", and takes a crash for the snake (rules.ts
// absorb). A player with no life left who has neither liked nor given for "Free snake back after"
// seconds gives the snake back to the computer (the same way: it leaves, the computer's hatches
// small at its place), and so does a crash with no life left. A round ends
// on the clock alone; after its end screen the next one starts at once (round.ts): every snake
// small again, every owner with their snake, its colour and their lives. The beach left of the
// podium is for the viewers not playing: those in line first, holding an egg, then the latest
// arrivals (beach.ts).

import { note, type Row } from '../feed/journal.ts';
import { game, repay } from '../feed/state.ts';
import { isPilotKey, playHooks, rings } from './entry.ts';
import {
  EMERGE,
  TUNING,
  alive,
  arena,
  eggNear,
  lifeHooks,
  places,
  retire,
  snakeOf,
  spawn,
  viewer,
  type Snake,
  type Viewer,
} from './rules.ts';

export const PLAY = {
  /** Seconds an egg laid for a snake changing hands waits before it bursts. */
  beat: 0.6,
  /** Seconds a new arrival's animal stays on the beach, unless newer ones need its place. */
  arrived: 30,
  /** Places for the animals left of the podium. */
  beach: 5,
  /** Seconds before the eggs of a new round burst. */
  start: 0.3,
  /** Seconds a breaking heart takes to drop and fade. */
  heart: 1,
};

/** The game's own player writes no journal row. */
function journal(row: Row): void {
  if (!isPilotKey(row.nickname ?? '')) note(row);
}

/** The computer's snakes out of their eggs: free to take. */
const free = (): Snake[] => alive().filter((s) => s.wild && s.in);

/** Seconds before the next computer snake is laid on a board short of one. */
let fillT = 0;

/**
 * A snake changes hands: it leaves the board (its body pops), and a new one, the viewer's or the
 * computer's (`v` null), is laid in its colour on the free cell nearest its head, never on a
 * body, bursting PLAY.beat seconds later at the starting length. Null when no cell is free.
 */
function replace(s: Snake, v: Viewer | null): Snake | null {
  const head = s.cells[0] ?? s.next,
    body = [...s.cells];
  retire(s);
  const at = eggNear(head, body),
    next = at < 0 ? null : spawn(v, s.colour, at);
  if (!next?.egg) return next;
  next.egg.t = EMERGE - PLAY.beat;
  // The viewer's picture shows over their egg until the snake is out.
  next.seat = v !== null;
  return next;
}

/**
 * The viewer takes the computer's snake: a new one hatches at its place, theirs, at the starting
 * length, with their lives and shield.
 */
function own(s: Snake, v: Viewer, gift: boolean): void {
  leaveLine(v.nickname);
  v.lives = Math.min(TUNING.livesMax, v.lives);
  v.keep = 0;
  const mine = replace(s, v);
  if (!mine) {
    // Nowhere to lay the egg: back to the head of the line, for the next free snake.
    v.state = 'out';
    v.snake = -1;
    arena.line.unshift({ nickname: v.nickname, avatar: v.avatar, gift, liked: arena.clock });
    return;
  }
  mine.taken = arena.clock;
  rings.delete(v.nickname);
  journal({ event: 'takes a snake', nickname: v.nickname, detail: gift ? 'by gift' : 'by like' });
}

/**
 * The snake goes back to the computer: it leaves, its picture dropping to the beach and its berries
 * back to the flower, and the computer's hatches at its place at the starting length.
 */
function release(s: Snake): void {
  const v = arena.viewers.get(s.nickname);
  journal({ event: 'snake back to the computer', nickname: s.nickname, detail: 'no like' });
  replace(s, null);
  if (v) {
    v.state = 'out';
    v.snake = -1;
  }
  // Back on the beach a while, where one like takes a snake again.
  arrive(s.nickname, s.avatar);
}

/** Out of the line, if waiting in it. */
function leaveLine(nickname: string): void {
  const i = arena.line.findIndex((w) => w.nickname === nickname);
  if (i >= 0) arena.line.splice(i, 1);
}

/** In line for the next free snake: a gift goes ahead of every like, after the gifts before it. */
function wait(v: Viewer, gift: boolean): void {
  const mine = arena.line.find((w) => w.nickname === v.nickname);
  if (mine) {
    mine.liked = arena.clock;
    if (!gift || mine.gift) return;
    leaveLine(v.nickname);
  }
  const w = { nickname: v.nickname, avatar: v.avatar, gift, liked: arena.clock };
  if (!gift) {
    arena.line.push(w);
    return;
  }
  const after = arena.line.findIndex((o) => !o.gift);
  arena.line.splice(after < 0 ? arena.line.length : after, 0, w);
}

/**
 * A viewer without a snake liked or gave: a free snake is theirs at once, in the battle, unless
 * others wait before them; else they wait in line (on the end screen, for the next round).
 */
playHooks.take = (v, gift) => {
  if (!v.nickname || snakeOf(v.nickname)) return;
  const s = arena.phase === 'play' && (gift || !arena.line.length) ? free()[0] : undefined;
  if (s) own(s, v, gift);
  else wait(v, gift);
};

/** A life took a crash. */
lifeHooks.absorbed = (s) => {
  journal({ event: 'life used', nickname: s.nickname, detail: `${String(s.lives)} left` });
};

/**
 * A crash with no life left: the snake falls and comes back as the computer's (fill), its owner
 * back on the beach a while.
 */
lifeHooks.fell = (s) => {
  journal({ event: 'snake back to the computer', nickname: s.nickname, detail: 'crash' });
  arrive(s.nickname, s.avatar);
};

/** Free snakes go to the line, first in it first. */
function serve(): void {
  if (arena.phase !== 'play') return;
  for (const s of free()) {
    const w = arena.line[0];
    if (!w) return;
    own(s, viewer(w.nickname, w.avatar), w.gift);
  }
}

/** A board short of snakes gets a computer one from an egg, TUNING.wildGap seconds apart. */
function fill(dt: number): void {
  if (arena.snakes.filter((s) => s.alive).length >= places()) {
    fillT = TUNING.wildGap;
    return;
  }
  fillT -= dt;
  if (fillT > 0) return;
  fillT = TUNING.wildGap;
  spawn(null);
}

/** A viewer arrived on the live: their animal shows on the beach a while (beach.ts). */
export function arrive(nickname: string, avatar: string | undefined): void {
  if (!arena.continuous || !nickname || isPilotKey(nickname)) return;
  const i = arena.arrivals.findIndex((a) => a.nickname === nickname);
  if (i >= 0) arena.arrivals.splice(i, 1);
  arena.arrivals.push({ nickname, avatar, at: arena.clock });
}

/**
 * The viewers not playing whose animals stand left of the podium, nearest it first: those in
 * line, first in line first, then the latest arrivals, the newest first.
 */
export function beachCrowd(): {
  nickname: string;
  avatar?: string | undefined;
  waiting: boolean;
}[] {
  const out: { nickname: string; avatar?: string | undefined; waiting: boolean }[] = [];
  for (const w of arena.line) {
    if (out.length >= PLAY.beach) return out;
    if (!snakeOf(w.nickname))
      out.push({
        nickname: w.nickname,
        avatar: arena.viewers.get(w.nickname)?.avatar ?? w.avatar,
        waiting: true,
      });
  }
  for (let i = arena.arrivals.length - 1; i >= 0 && out.length < PLAY.beach; i--) {
    const a = arena.arrivals[i];
    if (!a || snakeOf(a.nickname) || out.some((o) => o.nickname === a.nickname)) continue;
    out.push({
      nickname: a.nickname,
      avatar: arena.viewers.get(a.nickname)?.avatar ?? a.avatar,
      waiting: false,
    });
  }
  return out;
}

/**
 * One step of continuous play: the line and the arrivals age, the breaking hearts drop; in the
 * battle the idle players with no life left give their snakes back, the board is filled up and the
 * line served.
 */
export function stepPlay(dt: number): void {
  const now = arena.clock;
  // A like waiter who stopped liking leaves the line; a gift keeps its place.
  arena.line = arena.line.filter((w) => w.gift || now - w.liked <= TUNING.idleRelease);
  arena.arrivals = arena.arrivals.filter((a) => now - a.at < PLAY.arrived);
  for (const b of arena.breaks) b.t += dt;
  arena.breaks = arena.breaks.filter((b) => b.t < PLAY.heart && b.s.alive);
  if (arena.phase !== 'play') return;
  for (const s of alive()) {
    if (s.wild || s.lives > 0 || isPilotKey(s.nickname)) continue;
    const acts = arena.viewers.get(s.nickname)?.acts ?? [],
      last = Math.max(acts[acts.length - 1] ?? -Infinity, s.taken ?? -Infinity);
    if (now - last > TUNING.idleRelease) release(s);
  }
  fill(dt);
  serve();
}

/** A snake's owner, kept from one round to the next. */
export interface Owner {
  readonly v: Viewer;
  readonly colour: Snake['colour'];
  readonly lives: number;
}

/**
 * Before the board empties for a new round: every owner, with their snake's colour and lives. The
 * berries they still had on the board go back into the flower in their name, to pour again.
 */
export function keepOwners(): Owner[] {
  const out: Owner[] = [],
    owed = new Map<string, number>();
  for (const s of alive()) {
    if (s.wild) continue;
    const v = arena.viewers.get(s.nickname);
    if (v) out.push({ v, colour: s.colour, lives: s.lives });
  }
  for (const f of arena.food)
    if (f.by !== '' && out.some((o) => o.v.nickname === f.by))
      owed.set(f.by, (owed.get(f.by) ?? 0) + f.value);
  if (owed.size)
    repay(
      [...owed].map(([nickname, n]) => ({ nickname, n })),
      false,
    );
  return out;
}

/**
 * The round starts at once, on an empty board: every owner's snake from an egg in its colour, with
 * its lives, then the computer's up to the places, all bursting together a moment later.
 */
export function startPlay(owners: readonly Owner[]): void {
  arena.phase = 'play';
  game.ready = -1;
  for (const o of owners) {
    o.v.lives = Math.min(TUNING.livesMax, o.lives);
    o.v.shield = 0;
    o.v.keep = 0;
    const s = spawn(o.v, o.colour);
    if (!s?.egg) continue;
    s.egg.t = EMERGE - PLAY.start;
    s.seat = true;
  }
  arena.started = owners.length;
  while (arena.snakes.filter((s) => s.alive).length < places()) {
    const s = spawn(null);
    if (!s?.egg) break;
    s.egg.t = EMERGE - PLAY.start;
  }
  fillT = TUNING.wildGap;
}

/** Leaving continuous play: nobody waits for a snake any more. */
export function clearPlay(): void {
  arena.line.length = 0;
  arena.arrivals.length = 0;
  arena.breaks.length = 0;
}
