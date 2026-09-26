import { setTimeout as delay } from 'node:timers/promises';

import { evaluate } from '../page/evaluate.js';
import { formatOf, json, type Diagnostic } from './context.js';

const SAMPLED_FRAMES = 90;

/** Canvas calls per frame and per call site on a loaded board: where the frame budget goes. */
export const drawCalls: Diagnostic = async ({ game, orientation, options, write }) => {
  const contents = game.webContents;
  await evaluate(
    contents,
    (settings: Partial<GameSettings>) => {
      window.__viperKit.startDuel(settings);
      window.__viperKit.startCrowd(3);
    },
    { format: formatOf(orientation), dureeDuel: 600, ambianceAuto: false, meteo: options.weather },
  );
  await delay(options.settleSeconds * 1000);

  const report = await evaluate(
    contents,
    (frames: number) => window.__viperKit.countDrawCalls(frames),
    SAMPLED_FRAMES,
  );
  await write('draw-calls.json', json(report));
};
