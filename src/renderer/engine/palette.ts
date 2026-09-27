// Team and effect colours shared by every painter.

import type { Team } from './types.ts';

export const GOLD = '#F2C57C';

// Berry color cannot be gold (team gold's color): soft green, distinct from both teams and the forest floor.
const BERRY_GREEN = '#9BE28A',
  BERRY_GREEN_ALPHA = (a: number): string => `rgba(155,226,138,${String(a)})`;

export const berryTint = (team: Team | null | undefined): string =>
  team === 'gold' ? GOLD : team === 'shadow' ? SHADOW : BERRY_GREEN;

export const berryGlow = (a: number, team: Team | null | undefined): string =>
  team === 'gold'
    ? `rgba(242,197,124,${String(a)})`
    : team === 'shadow'
      ? `rgba(180,212,222,${String(a)})`
      : BERRY_GREEN_ALPHA(a);

export const SHADOW = '#b4d4de'; // color of the second snake (verify contrast)

export const BLUE = '#8FA8D8',
  RED = '#D64A42',
  SHELL = '#F6F3EA';
