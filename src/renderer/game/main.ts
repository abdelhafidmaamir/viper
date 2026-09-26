// The on-stream window: nothing but the canvas. The control room drives it over BroadcastChannel,
// and the TikFinity bridge runs here, next to the engine it feeds.

// Engine scripts, in dependency order. Each publishes its API on `window`.
import '../scripts/forest-ambience.js';
import '../scripts/ai-human.js';
import '../scripts/ai-super.js';
import '../scripts/simulated-audience.js';
import '../scripts/snake-ending.js';
import '../scripts/game.js';
import '../scripts/tikfinity-bridge.js';
import './game.css';

import { linkControlRoom } from './control-link.ts';

const game = window.Viper;
const bridge = window.TikFinityBridge;

game.settings.mode = 'duel';
game.newRound();

linkControlRoom({
  game,
  bridge,
  receiveEvent: (event) => window.receiveEvent(event),
  readCrowd: () => window.ViperCrowd.readState(game),
  storage: localStorage,
});

bridge.start();
