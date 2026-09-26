import { setTimeout as delay } from 'node:timers/promises';

import { ORIENTATIONS } from '../config.js';
import { evaluate } from '../page/evaluate.js';
import { formatOf, json, type Diagnostic } from './context.js';

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
        window.VipereBase.reglerHeure(hour);
      },
      {
        format: formatOf(orientation),
        affichageCadeaux: 'defile',
        defileCache: 0,
        ambianceAuto: false,
        cycle: 0,
        plateforme: 'tiktok',
        meteo: options.weather,
      },
      options.hour,
    );
    await delay(4500);
    await capture(`${orientation}-board`);

    await evaluate(contents, () =>
      window.recevoirEvenement({
        type: 'cadeau',
        n: 1,
        valeur: 30,
        nom: 'bagel',
        camp: 'or',
        pseudo: 'karim.or',
      }),
    );
    await delay(900);
    await capture(`${orientation}-announcement`);

    await evaluate(contents, () => {
      const gifts = [
        ['or', 100, 'teddy', 'karim.or'],
        ['ombre', 30, 'capybara', 'zoe_moon'],
        ['or', 10, 'rose 10', 'soleil92'],
      ] as const;
      for (const [camp, valeur, nom, pseudo] of gifts) {
        window.recevoirEvenement({ type: 'cadeau', n: 1, valeur, nom, camp, pseudo });
      }
      window.setTimeout(() => window.VipereBase.finirTest?.('ombre'), 800);
    });
    await delay(4200);
    await capture(`${orientation}-end-screen`);
  }

  const metrics = await evaluate(contents, () => window.VipereBase.mesures());
  await write(
    'report.json',
    json({ engineErrors: metrics.erreurs, lastError: metrics.derniereErreur }),
  );
  if (metrics.erreurs > 0) {
    throw new Error(
      `Engine reported ${String(metrics.erreurs)} error(s): ${String(metrics.derniereErreur)}`,
    );
  }
};
