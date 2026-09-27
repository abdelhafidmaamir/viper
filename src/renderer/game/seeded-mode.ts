// Imported first by the game entry: it must replace the random source and the clock before any
// engine script reads them. Without `?seed=<n>` in the page URL it does nothing at all.

import { installDeterminism, seedFrom } from './determinism.ts';

const seed = seedFrom(window.location.search);

/** True when the page runs from a seed, driven by `window.__viperClock` (see determinism.ts). */
export const deterministic = seed !== null;

if (seed !== null) window.__viperClock = installDeterminism(window, seed);
