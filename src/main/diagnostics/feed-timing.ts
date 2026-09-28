import { setTimeout as delay } from 'node:timers/promises';

import type { FrameStats } from '../page/page-kit.js';
import { evaluate } from '../page/evaluate.js';
import { json, type Diagnostic } from './context.js';

/**
 * Real frame pacing of Feed the Snake inside the packaged app: the busiest simulated audience,
 * once at the start of a round, once on a loaded board (with a CPU profile), once on a nearly
 * full board.
 */
export const feedTiming: Diagnostic = async ({ game, options, write }) => {
  const contents = game.webContents;
  const measure = (durationMs: number): Promise<FrameStats> =>
    evaluate(contents, (ms: number) => window.__viperKit.measureFrames(ms), durationMs);
  // Commands go through the Feed channel, as the control room sends them.
  const send = (command: unknown): Promise<void> =>
    evaluate(
      contents,
      (message: unknown) => {
        const channel = new BroadcastChannel('viper-feed');
        channel.postMessage(message);
        channel.close();
      },
      command,
    );

  await send({ cmd: 'setting', name: 'autoAmbience', value: false });
  await send({ cmd: 'setting', name: 'weather', value: options.weather });
  await send({ cmd: 'round' });
  await send({ cmd: 'crowd', level: 3 });

  const startOfRound = await measure(8000);
  await delay(options.settleSeconds * 1000);
  const loadedBoard = await measure(10000);
  // Where a loaded board spends its frames: open feed.cpuprofile in DevTools or speedscope.
  const { debugger: cdp } = contents;
  cdp.attach('1.3');
  try {
    await cdp.sendCommand('Profiler.enable');
    await cdp.sendCommand('Profiler.setSamplingInterval', { interval: 250 });
    await cdp.sendCommand('Profiler.start');
    await delay(5000);
    const { profile } = (await cdp.sendCommand('Profiler.stop')) as { profile: unknown };
    await write('feed.cpuprofile', JSON.stringify(profile));
  } finally {
    cdp.detach();
  }
  await send({ cmd: 'near-full' });
  const nearlyFull = await measure(6000);
  await send({ cmd: 'crowd', level: 0 });

  const environment = await evaluate(contents, () => ({
    window: `${String(window.innerWidth)}x${String(window.innerHeight)}`,
    devicePixelRatio: window.devicePixelRatio,
  }));
  await write(
    'feed-timing.json',
    json({ weather: options.weather, environment, startOfRound, loadedBoard, nearlyFull }),
  );
};
