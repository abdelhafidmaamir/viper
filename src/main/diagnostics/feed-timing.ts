import { setTimeout as delay } from 'node:timers/promises';

import type { WebContents } from 'electron';

import type { FrameStats } from '../page/page-kit.js';
import { evaluate } from '../page/evaluate.js';
import { json, type Diagnostic } from './context.js';

/** What the diagnostic reads back from the state the game publishes. */
interface Published {
  readonly phase: string;
  readonly fill: number;
  readonly settings: Readonly<Record<string, unknown>>;
}

// The settings the diagnostic changes, put back as they were when it is done.
const BORROWED = ['autoAmbience', 'weather', 'startFill'] as const;

/** Chromium's sampling profiler for `ms`: open the file in DevTools or speedscope. */
async function profile(contents: WebContents, ms: number): Promise<string> {
  const { debugger: cdp } = contents;
  cdp.attach('1.3');
  try {
    await cdp.sendCommand('Profiler.enable');
    await cdp.sendCommand('Profiler.setSamplingInterval', { interval: 250 });
    await cdp.sendCommand('Profiler.start');
    await delay(ms);
    const { profile: taken } = (await cdp.sendCommand('Profiler.stop')) as { profile: unknown };
    return JSON.stringify(taken);
  } finally {
    cdp.detach();
  }
}

/**
 * Real frame pacing of Feed the Snake inside the packaged app. First the costly case on its own:
 * a snake that covers 95% of the board with nobody feeding it, so it stays that long for the
 * whole measure (with a CPU profile). Then the busiest simulated audience: at the start of a
 * round, on a loaded board (with a CPU profile), and while the board fills up and the end screen
 * shows.
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
  // The next state the game publishes (twice a second).
  const published = (): Promise<Published> =>
    evaluate(
      contents,
      () =>
        new Promise<Published>((resolve) => {
          const channel = new BroadcastChannel('viper-feed');
          channel.onmessage = ({ data }: MessageEvent<{ feed?: Published }>) => {
            if (!data.feed) return;
            channel.close();
            resolve(data.feed);
          };
        }),
    );
  const where = async (): Promise<{ phase: string; fill: number }> => {
    const { phase, fill } = await published();
    return { phase, fill };
  };

  const before = (await published()).settings;
  await send({ cmd: 'setting', name: 'autoAmbience', value: false });
  await send({ cmd: 'setting', name: 'weather', value: options.weather });

  await send({ cmd: 'crowd', level: 0 });
  await send({ cmd: 'setting', name: 'startFill', value: 0.95 });
  await send({ cmd: 'round' });
  // Past the countdown, so the snake is moving.
  await delay(6000);
  const longSnake = { ...(await measure(10000)), ...(await where()) };
  await write('feed-long.cpuprofile', await profile(contents, 5000));

  await send({ cmd: 'setting', name: 'startFill', value: 0 });
  await send({ cmd: 'round' });
  await send({ cmd: 'crowd', level: 3 });
  const startOfRound = await measure(8000);
  await delay(options.settleSeconds * 1000);
  const loadedBoard = { ...(await measure(10000)), ...(await where()) };
  await write('feed.cpuprofile', await profile(contents, 5000));
  await send({ cmd: 'near-full' });
  const nearlyFull = { ...(await measure(6000)), ...(await where()) };
  await send({ cmd: 'crowd', level: 0 });
  for (const name of BORROWED) await send({ cmd: 'setting', name, value: before[name] });

  const environment = await evaluate(contents, () => {
    const canvas = document.querySelector('canvas');
    return {
      window: `${String(window.innerWidth)}x${String(window.innerHeight)}`,
      canvas: canvas ? `${String(canvas.width)}x${String(canvas.height)}` : null,
      devicePixelRatio: window.devicePixelRatio,
    };
  });
  await write(
    'feed-timing.json',
    json({
      weather: options.weather,
      environment,
      longSnake,
      startOfRound,
      loadedBoard,
      nearlyFull,
    }),
  );
};
