// Feed the Snake plays on a wider square board than the duel, 30 x 30 cells of 31 px, centred with
// a comfortable margin on both sides: 900 cells, so a round takes many gifts to fill.

import { CELL, W } from '../engine/layout.ts';

export const FCOLS = 30,
  FROWS = 30,
  FCELL = 31;
export const BOARD_W = FCOLS * FCELL,
  BOARD_H = FROWS * FCELL;
export const FX0 = (W - BOARD_W) / 2,
  FY0 = 300;
/** Scale from the duel's drawings to this grid. */
export const K = FCELL / CELL;

/** The berry flower above the board, and the point its berries drip from. */
export const FLOWER = { x: W / 2, y: 150 };
export const MOUTH = { x: W / 2, y: 190 };
