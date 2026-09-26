import { setTimeout as delay } from 'node:timers/promises';

import type { FrameStats } from '../page/page-kit.js';
import { evaluate } from '../page/evaluate.js';
import { formatOf, json, WEATHER_SHOWCASE, type Diagnostic } from './context.js';

/**
 * Real frame pacing inside the packaged app, under a simulated crowd at full intensity: once at
 * the start of a round, once on a loaded board, and optionally per weather.
 */
export const frameTiming: Diagnostic = async ({ game, orientation, options, write }) => {
  const contents = game.webContents;
  const measure = (durationMs: number): Promise<FrameStats> =>
    evaluate(contents, (ms: number) => window.__viperKit.measureFrames(ms), durationMs);

  await evaluate(
    contents,
    (settings: Partial<GameSettings>, hour: number) => {
      window.__viperKit.startDuel(settings);
      window.Viper.setHour(hour);
      window.__viperKit.startCrowd(3);
    },
    {
      format: formatOf(orientation),
      duelDuration: 600,
      autoAmbience: false,
      cycle: 0,
      weather: options.weather,
    },
    options.hour,
  );

  const startOfRound = await measure(8000);
  await delay(options.settleSeconds * 1000);
  const loadedBoard = await measure(15000);

  const perWeather: Record<string, FrameStats> = {};
  if (options.allWeathers) {
    for (const [weather, hour] of WEATHER_SHOWCASE) {
      await evaluate(
        contents,
        (name: string, at: number) => {
          window.Viper.settings.weather = name;
          window.Viper.setHour(at);
        },
        weather,
        hour,
      );
      await delay(4500);
      perWeather[weather] = await measure(7000);
    }
  }

  const environment = await evaluate(contents, () => window.__viperKit.environment());
  await write(
    'frame-timing.json',
    json({
      orientation,
      weather: options.weather,
      environment,
      startOfRound,
      loadedBoard,
      ...(options.allWeathers ? { perWeather } : {}),
    }),
  );
};
