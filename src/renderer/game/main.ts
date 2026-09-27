// The on-stream window: nothing but the canvas. The control room drives it over BroadcastChannel,
// and the TikFinity bridge runs here, next to the engine it feeds.

// First: with `?seed=<n>`, the random source and the clock become deterministic before any engine
// script reads them.
import { deterministic } from './seeded-mode.ts';
// Engine scripts, in dependency order. Each publishes its API on `window`.
import '../scripts/forest-ambience.ts';
import '../scripts/ai-human.ts';
import '../scripts/ai-super.ts';
import '../scripts/simulated-audience.ts';
import '../scripts/snake-ending.ts';
import '../scripts/game.ts';
import '../scripts/tikfinity-bridge.ts';
import './game.css';

import { linkControlRoom } from './control-link.ts';

/** A seeded run must not depend on what this machine saved: preferences stay in memory. */
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

const game = window.Viper;
const bridge = window.TikFinityBridge;

game.settings.mode = 'duel';
game.newRound();

linkControlRoom({
  game,
  bridge,
  receiveEvent: (event) => window.receiveEvent(event),
  readCrowd: () => window.ViperCrowd.readState(game),
  storage: deterministic ? memoryStorage() : localStorage,
});

// A seeded run is a closed world: live events would make it unreproducible.
if (!deterministic) bridge.start();
