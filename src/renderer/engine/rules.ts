// Game rules: board speed, hazard timings, crowd tiers, gift prices and durations, and the fixed
// temperament both AIs share. The bench API retunes tier fields in place.

import type { Tier } from './types.ts';

export const SPEED = 7;

export const SEED_GROW_TIME = 1;

// Alternates which snake resolves first each tick for fairness.
// At under 1 s the stone pops instead of warning; past 1.5 s the snake at 7 cells/s on a 16-cell board
// has already crossed every cell one could target.
export const STONE_WARNING = 1.3,
  STONE_LIFE = 45;

// The bramble is the second blocker. The stone is discrete and sudden; the bramble creeps and closes
// a whole lane. It warns faster per segment (0.8 s) but takes BRAMBLE_STEP * BRAMBLE_MAX_SEGMENTS to
// deploy and lives shorter because it occupies more space.
export const BRAMBLE_WARNING = 0.8,
  BRAMBLE_STEP = 0.75,
  BRAMBLE_MAX_SEGMENTS = 4,
  BRAMBLE_LIFE = 20;

// Four turnout tiers: the game holds from empty room to full crowd.
// cadence = events per minute, smoothed. Each tier changes supply, target and caps.
// skySun: berries eaten to raise the sun to the top. skyMoon: stones placed for the moon.
export const TIERS: Tier[] = [
  {
    id: 'empty',
    min: 0,
    hit: 0.5,
    wild: 10,
    target: 27,
    skySun: 27,
    skyMoon: 13,
    maxBerries: 3,
    maxStones: 4,
    perBerry: 1,
    perStone: 1,
    nature: 26,
    maxLength: 34,
  },
  {
    id: 'quiet',
    min: 6,
    hit: 0.34,
    wild: 22,
    target: 48,
    skySun: 48,
    skyMoon: 14,
    maxBerries: 3,
    maxStones: 5,
    perBerry: 2,
    perStone: 1,
    nature: 40,
    maxLength: 52,
  },
  {
    id: 'busy',
    min: 60,
    hit: 0.12,
    wild: 0,
    target: 108,
    skySun: 108,
    skyMoon: 10,
    maxBerries: 4,
    maxStones: 4,
    perBerry: 6,
    perStone: 2,
    nature: 0,
    maxLength: 80,
  },
  {
    id: 'crowd',
    min: 250,
    hit: 0.018,
    wild: 0,
    target: 120,
    skySun: 120,
    skyMoon: 16,
    maxBerries: 5,
    maxStones: 5,
    perBerry: 20,
    perStone: 6,
    nature: 0,
    maxLength: 120,
  },
];

// Economy modelled on a real live: the rose gift plays AGAINST the snake.
// Shares and follows have no game effect. Likes speed BOTH snakes through the shared pool in
// crowd-energy.ts. The only speed boost for one team is the boost gift (BOOST_FACTOR for
// BOOST_DURATION s).
// Tuned down from 1.5.
export const BOOST_FACTOR = 1.2;

// Seconds (x0.6 to 1.4 jitter) between neutral green berries when the board is empty; slows with turnout.
export const FOREST_BERRY_INTERVAL = 8;

// Gift of 10-29 coins: 10 s paid speed boost, above the like threshold.
export const BOOST_COST = 10,
  BOOST_DURATION = 10;

// Cut: the gift removes 15% of the rival's length, minimum 1 segment.
export const CUT_COST = 20,
  CUT_FRACTION = 0.15;
export const cutLength = (L: number): number => Math.max(1, Math.round(L * CUT_FRACTION));

// Shield at 30 coins: 15 s immunity, stackable with no cap. Life at 100 coins: no cap.
export const SHIELD_COST = 30,
  LIFE_COST = 100,
  SHIELD_DURATION = 15;

// Target length for the duel ring.
export const TARGET_LENGTH = 40;

// Below this length the half-ring turns red: reprieve state.
export const REPRIEVE_LENGTH = 5;

// Snakes start at 5 segments; a young snake can be cut to 1 segment but never killed.
export const START_LENGTH = 5,
  YOUNG_MIN_LENGTH = 2;

// A snake that has never reached 10 segments is "young": a cut never drops it below 3 and it cannot be in reprieve (no trap at start).
export const ADULT_LENGTH = 10;

// The stone spawns ahead of the snake but never in the cell it will cross before the stone is solid.
// At SPEED cells/s it covers STONE_WARNING * SPEED cells during the warning; any cell closer in its
// lane would be passed before the stone exists. Spawn well ahead or to the side, never in that dead zone.
export const STONE_CLEARANCE = (): number => SPEED * (STONE_WARNING + 0.25); // cells the snake travels during the warning window, with margin

// A round starts with a hatch: a white shell lands at the center of the board, cracks open, and the
// snake emerges. Nothing moves while it is there.
export const HATCH_TIME = 1.4,
  EMERGE_TIME = 0.6,
  TRAIL_TIME = 0.55;

// flair: impulsive player fraction in the AI (0 = cautious). Both teams receive identical values.
// STRICT EQUALITY: measurement showed that any lever difference biases outcomes (the team receiving
// flair 0.4 / hunt 0.9 dropped from 53% to 47%), so any lever difference is a handicap. Trajectories
// still diverge because flair and hunt draw random rolls per tick.
export const FLAIR_BY_TEAM = { gold: 0.3, shadow: 0.3 };

// hunt: appetite for trapping (the AI closes the rival's pocket with its own body).
export const HUNT_BY_TEAM = { gold: 0.7, shadow: 0.7 };
