// The on-stream window: nothing but the canvas. The control room drives it over BroadcastChannel,
// and the TikFinity bridge runs here, next to the engine it feeds.

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
