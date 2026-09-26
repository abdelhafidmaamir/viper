// Crowd pacing: audience activity is smoothed into a cadence, which selects the tier that sets
// supply, targets and caps. Harnesses can pin the length cap.

import { TARGET_LENGTH, TIERS } from './rules.js';

// The race decides the round, not length: past the cap a berry scores without adding a segment.
// Length is capped because it cannot be both the round clock and the death risk: longer rounds would
// make death inevitable (measured: 2 min median, 47% snake wins when target was a length).
// Measured 2026-09-18: at round end the median length hit the cap at all three active tiers, so the
// victory was not coming too early but the cap was the binding constraint (30 segments on 320 cells = 9%).
// Cap follows turnout: 34 / 52 / 80 / 120. forceLength overrides it for harnesses, at which point
// the tier no longer touches it.
export let forcedLength = 0;

export function forceLength(v) {
  forcedLength = v;
}

// Cap = TARGET_LENGTH (ring full at 60). Two snakes at 120 on 320 cells self-trapped
// (measured: 62 deaths / 6 rounds, all trapped; at 60: 30).
export const maxLength = () => forcedLength || TARGET_LENGTH;

export let cadence = 0,
  tier = TIERS[0];

// Without jitter both teams advance on fixed clocks and the winner is predictable.
// Each safety-net delay varies by plus or minus 40%.
export const jitter = (v) => v * (0.6 + Math.random() * 0.8);

// Each event adds to cadence, which decays to zero over one minute.
export function countEvents(n) {
  cadence += n;
}

export function updateTier(dt) {
  cadence = Math.max(0, cadence - (cadence * dt) / 60);
  const c = cadence;
  let p = TIERS[0];
  for (let i = 0; i < TIERS.length; i++) if (c >= TIERS[i].min) p = TIERS[i];
  tier = p;
}
