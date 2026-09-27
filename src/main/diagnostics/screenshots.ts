import { setTimeout as delay } from 'node:timers/promises';

import { ORIENTATIONS } from '../config.js';
import { evaluate } from '../page/evaluate.js';
import { formatOf, json, type Diagnostic } from './context.ts';

const CONTENT_SIZE = {
  portrait: [720, 1280],
  landscape: [1280, 720],
} as const;

/**
 * Captures the key moments of a duel in both orientations: live board, gift announcement and end
 * screen. This is the visual baseline every rendering change is compared against.
 */
export const screenshots: Diagnostic = async ({ game, options, write }) => {
  const contents = game.webContents;
  /** Crops to the game canvas: the window around it is letterboxing, not content. */
  const capture = async (name: string): Promise<void> => {
    const rect = await evaluate(contents, () => window.__viperKit.sceneRect());
    await write(`${name}.png`, (await contents.capturePage(rect)).toPNG());
  };

  for (const orientation of ORIENTATIONS) {
    const [width, height] = CONTENT_SIZE[orientation];
    game.setContentSize(width, height);

    await evaluate(
      contents,
      (settings: Partial<GameSettings>, hour: number) => {
        window.__viperKit.startDuel(settings);
        window.Viper.setHour(hour);
      },
      {
        format: formatOf(orientation),
        giftDisplay: 'scroll',
        scrollHidden: 0,
        autoAmbience: false,
        cycle: 0,
        platform: 'tiktok',
        weather: options.weather,
      },
      options.hour,
    );
    await delay(4500);
    await capture(`${orientation}-board`);

    await evaluate(contents, () =>
      window.receiveEvent({
        type: 'gift',
        n: 1,
        value: 30,
        name: 'bagel',
        team: 'gold',
        nickname: 'karim.or',
      }),
    );
    await delay(900);
    await capture(`${orientation}-announcement`);

    await evaluate(contents, () => {
      const gifts = [
        ['gold', 100, 'teddy', 'karim.or'],
        ['shadow', 30, 'capybara', 'zoe_moon'],
        ['gold', 10, 'rose 10', 'soleil92'],
      ] as const;
      for (const [camp, valeur, nom, pseudo] of gifts) {
        window.receiveEvent({
          type: 'gift',
          n: 1,
          value: valeur,
          name: nom,
          team: camp,
          nickname: pseudo,
        });
      }
      window.setTimeout(() => window.Viper.endTest?.('shadow'), 800);
    });
    await delay(4200);
    await capture(`${orientation}-end-screen`);
  }

  const metrics = await evaluate(contents, () => window.Viper.metrics());
  await write('report.json', json({ engineErrors: metrics.errors, lastError: metrics.lastError }));
  if (metrics.errors > 0) {
    throw new Error(
      `Engine reported ${String(metrics.errors)} error(s): ${String(metrics.lastError)}`,
    );
  }
};
