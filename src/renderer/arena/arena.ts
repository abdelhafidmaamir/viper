// Snake Arena's board: everything between the ring's four sides, and the arena's marks on the
// beach. The frame loop (main.ts) and the control room link (link.ts) only ever go through the
// functions here; the rules live in rules.ts, round.ts, ai.ts and entry.ts, the painters in
// board-paint.ts and beach.ts.

import type { ArenaSettings, ArenaSnakeCount } from '../../shared/arena-protocol.ts';
import type { Ambience, AmbienceFrame } from '../engine/types-api.ts';
import { tr } from '../engine/i18n.ts';
import { brain } from './ai.ts';
import {
  layOutBeach,
  paintArenaRing,
  paintArenaTime,
  paintBeachRings,
  paintFlags,
  paintFlights,
  paintLikeHearts,
} from './beach.ts';

export { layOutBeach };

export { paintArenaTime };
import { paintFood, paintSnakes } from './board-paint.ts';
import { paintFlyingHearts } from './lives.ts';
import { ENTRY, QUEUE, isPilot, setPilot } from './entry.ts';
import { arenaRound, carriedOver, stepArena } from './round.ts';

export { carriedOver };
import { TUNING, alive, arena, options, toPx } from './rules.ts';

export { arenaGift, arenaLike } from './entry.ts';

let settings: ArenaSettings | null = null;

/** The control room's tuning values; the round length applies from the next round. */
export function setArenaSettings(next: ArenaSettings): void {
  settings = next;
  TUNING.places = next.places;
  TUNING.wildUpTo = next.wildSnakes;
  TUNING.speed = next.speed;
  TUNING.boostCap = next.boostCap;
  TUNING.shieldGift = next.shieldGift;
  TUNING.lifeOn = next.lifeOn;
  TUNING.lifePrice = next.lifePrice;
  TUNING.maxLives = next.maxLives;
  TUNING.lifeKeep = next.lifeKeep;
  TUNING.houseEvery = next.plainEvery;
  TUNING.houseAmount = next.plainAmount;
  ENTRY.likesNeeded = next.entryLikes;
  QUEUE.idle = next.queueIdle;
  ENTRY.giftEntry = next.giftEntry;
  options.likeBoost = next.likeBoost;
  options.ownerOnly = next.giftBerries === 'owner';
  brain.super = next.superAI;
  brain.backing = next.backing;
  setPilot(next.pilot);
}

/** A new round: the board empties and whoever was in comes back. */
export function newArenaRound(): void {
  arenaRound(settings?.roundLength ?? TUNING.roundTime);
}

/** Plays dt seconds, in short steps so a slow frame never lets a snake skip a cell's rules. */
export function advanceArena(dt: number): void {
  const n = Math.max(1, Math.ceil(dt / 0.034));
  for (let i = 0; i < n; i++) stepArena(dt / n);
}

/** The board's food and snakes, painted with the ambience's own snake painter. */
export function paintArena(
  c: CanvasRenderingContext2D,
  a: Ambience,
  e: AmbienceFrame,
  t: number,
): void {
  paintFood(t);
  paintSnakes(c, a, e, t);
}

/** The ring round the board: the round's clock. */
export const paintArenaClock = paintArenaRing;

/** On the beach, over the animals: their entry rings and the pictures flying up. */
export function paintArenaBeach(t: number): void {
  paintFlags(t);
  paintBeachRings(t);
  paintLikeHearts();
  paintFlights();
}

/** Over the flower: the hearts a life gift drops, on their way to their pictures. */
export const paintArenaLives = paintFlyingHearts;

/** Share of the round gone, 0 to 1: the beach climbs with it, as with Feed's fill. */
export const arenaProgress = (): number => Math.min(1, arena.time / TUNING.roundTime);

/** Where the ambience looks: the crowned head, or the board's middle. */
export function arenaFocus(fallback: { x: number; y: number }): { x: number; y: number } {
  const king = arena.snakes.find((s) => s.id === arena.crown && s.alive);
  return king ? toPx(king.x, king.y) : fallback;
}

/** The end screen's headline: who survived with the crown, or the time simply ran out. */
export function arenaHeadline(): string {
  const w = arena.winner;
  if (!w || isPilot(w)) return tr('arena.over');
  return tr('arena.won', { name: w.wild ? tr('arena.wild') : w.nickname.toUpperCase() });
}

export interface ArenaStatus {
  readonly secondsLeft: number;
  readonly roundLength: number;
  readonly phase: 'ready' | 'play' | 'won' | 'end';
  /** Berries eaten on the board this round. */
  readonly eaten: number;
  readonly snakes: ArenaSnakeCount;
  readonly kills: number;
  /** Deaths by cause this round, self-traps included. */
  readonly trapped: number;
}

/** The round so far, for the control room and the tests. */
export function arenaStatus(): ArenaStatus {
  const live = alive();
  return {
    secondsLeft: Math.max(0, TUNING.roundTime - arena.time),
    roundLength: TUNING.roundTime,
    phase: arena.phase,
    eaten: arena.fed,
    snakes: {
      viewers: live.filter((s) => !s.wild && !isPilot(s)).length,
      wild: live.filter((s) => s.wild).length,
      pilot: live.some(isPilot),
    },
    kills: arena.kills,
    trapped: arena.deaths.trapped,
  };
}
