import { setTimeout as delay } from 'node:timers/promises';

import { evaluate } from '../page/evaluate.js';
import { formatOf, json, type Diagnostic } from './context.js';

const SAMPLING_INTERVAL_US = 250;
const PROFILE_MS = 12_000;

/**
 * Chromium's sampling profiler on the game renderer, on a loaded board with a simulated crowd.
 * Open `cpu.cpuprofile` in Chrome DevTools (Performance panel) or speedscope.
 */
export const cpuProfile: Diagnostic = async ({ game, orientation, options, write }) => {
  const contents = game.webContents;
  await evaluate(
    contents,
    (settings: Partial<GameSettings>) => {
      window.__viperKit.startDuel(settings);
      window.__viperKit.startCrowd(3);
    },
    {
      format: formatOf(orientation),
      duelDuration: 600,
      autoAmbience: false,
      weather: options.weather,
    },
  );
  await delay(options.settleSeconds * 1000);

  const { debugger: cdp } = contents;
  cdp.attach('1.3');
  let profile: unknown;
  try {
    await cdp.sendCommand('Profiler.enable');
    await cdp.sendCommand('Profiler.setSamplingInterval', { interval: SAMPLING_INTERVAL_US });
    await cdp.sendCommand('Profiler.start');
    await delay(PROFILE_MS);
    ({ profile } = (await cdp.sendCommand('Profiler.stop')) as { profile: unknown });
  } finally {
    cdp.detach();
  }

  // Frame pacing right after profiling proves the window was not throttled while sampled.
  const frames = await evaluate(
    contents,
    (ms: number) => window.__viperKit.measureFrames(ms),
    4000,
  );
  await write('cpu.cpuprofile', JSON.stringify(profile));
  await write('cpu-profile.frames.json', json(frames));
};
