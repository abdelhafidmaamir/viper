// Snake Arena's board: everything between the ring's four sides, and the arena's marks on the
// beach. The frame loop (main.ts) and the control room link (link.ts) only ever go through the
// functions here; the rules live in qualify.ts, rules.ts, round.ts, ai.ts and entry.ts, the
// painters in qualify-paint.ts, board-paint.ts and beach.ts.

import type { ArenaSettings, ArenaSnakeCount } from '../../shared/arena-protocol.ts';
import type { Ambience, AmbienceFrame } from '../engine/types-api.ts';
import { tr } from '../engine/i18n.ts';
import { brain } from './ai.ts';
import {
  SLEEPER_SPOT,
  layOutBeach,
  paintPodium,
  paintArenaRing,
  paintArenaTime,
  paintBeachRings,
  paintFlags,
  paintSleeperHeart,
  paintPodiumCrown,
  paintFlights,
  paintLikePops,
} from './beach.ts';
import { paintBoardShade, paintFood, paintSnakes } from './board-paint.ts';
import { BOOST, PILOT, QUEUE, clearPaidQueue, isPilot, setPilot } from './entry.ts';
import { paintBeachHearts } from './lives.ts';
import { paintActors, paintSeats } from './qualify-paint.ts';
import { qualifying } from './qualify.ts';
import { FIELD, arenaRound, stepArena } from './round.ts';
import { TUNING, alive, arena, options, toPx } from './rules.ts';

export { SLEEPER_SPOT, layOutBeach, paintArenaTime, paintPodium, qualifying };
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
  TUNING.seatPrice = next.seatPrice;
  TUNING.giftSeats = next.giftSeats;
  // Off, nobody holds a place in line: the paid queue empties.
  if (!next.giftSeats) clearPaidQueue();
  TUNING.lifeOn = next.lifeOn;
  TUNING.lifePrice = next.lifePrice;
  TUNING.maxLives = next.maxLives;
  TUNING.lifeKeep = next.lifeKeep;
  // The flower's plain berries, applied at once: how many it keeps out, how soon a new one comes.
  FIELD.count = next.plainAmount;
  FIELD.delay = next.plainEvery;
  BOOST.likes = next.entryLikes;
  QUEUE.idle = next.queueIdle;
  options.likeBoost = next.likeBoost;
  options.likeHeart = next.likeHeart;
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
  paintSeats(t);
}

/** The ring round the board, the round's clock, over the board's darker shade. */
export function paintArenaClock(): void {
  paintBoardShade();
  paintArenaRing();
}

/**
 * Over the beach and the board: the players' flags and boost rings, the lives, the qualifying's
 * pictures with their likes popping, and a life's picture flying to its egg.
 */
export function paintArenaBeach(t: number): void {
  paintFlags(t);
  paintPodiumCrown(t);
  paintBeachRings(t);
  paintSleeperHeart();
  paintBeachHearts();
  paintActors(t);
  paintLikePops();
  paintFlights();
}

/** Share of the round gone, 0 to 1: the beach climbs with it, as with Feed's fill. */
export const arenaProgress = (): number => Math.min(1, arena.time / TUNING.roundTime);

/** Where the ambience looks: the crowned head, or the board's middle. */
export function arenaFocus(fallback: { x: number; y: number }): { x: number; y: number } {
  const king = arena.snakes.find((s) => s.id === arena.crown && s.alive);
  return king ? toPx(king.x, king.y) : fallback;
}

/** The end screen's headline: the viewer whose snake wins, or the time simply ran out. */
export function arenaHeadline(): string {
  const w = arena.winner;
  if (!w || w.wild || isPilot(w)) return tr('arena.over');
  return tr('arena.wins', { name: w.nickname.toUpperCase() });
}

/** Berries a viewer's snakes ate this round: their own gift berries and the plain ones alike. */
export const eatenBy = (nickname: string): number =>
  arena.snakes.reduce((n, s) => n + (!s.wild && s.nickname === nickname ? s.eaten : 0), 0);

/**
 * The end screen's podium: the round's ranking (the survivors, the biggest first, then the last
 * to fall), each with the berries their snake ate by the end of the battle, as the headline counts
 * them. No likes here: they have their own section. The pilot never ranks.
 */
export function arenaPodium(): {
  nickname: string;
  avatar?: string | undefined;
  berries: number;
  likes: number;
  berriesAlways: boolean;
}[] {
  return arena.ranking
    .filter((r) => r.nickname !== PILOT.key)
    .map((r) => ({
      nickname: r.nickname,
      avatar: r.avatar,
      berries: r.eaten,
      likes: 0,
      berriesAlways: true,
    }));
}

export interface ArenaStatus {
  readonly secondsLeft: number;
  readonly roundLength: number;
  readonly phase: 'qualify' | 'ready' | 'play' | 'won' | 'end';
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
