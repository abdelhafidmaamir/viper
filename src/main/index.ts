import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { app, shell, type BrowserWindow } from 'electron';

import { ConfigError, parseConfig, type AppConfig, type Mode } from './config.js';
import { runDiagnostic } from './diagnostics/index.js';
import { backUpFeed } from './feed-backup.js';
import { readCloudConfig } from './feed-cloud.js';
import { journalDir, journalFeed } from './feed-journal.js';
import { useReproducibleRendering, VISUAL_SEED } from './diagnostics/visual.js';
import { evaluate } from './page/evaluate.js';
import { hostRenderer } from './renderer-host.js';
import type { AppRequest } from './app-request.js';
import { GAME_TITLE, openControlWindow, openGameWindow, openLauncherWindow } from './windows.js';

/**
 * Windows reports a covered window as occluded and Chromium then stops painting it. The game
 * window is captured by OBS or LIVE Studio while other windows sit on top, so it must never be
 * treated as hidden.
 */
function keepRenderingWhenCovered(): void {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
}

/**
 * The windows on screen: the launcher, or one mode's game window and its control room. Closing
 * the game window closes its control room and quits; closing the control room leaves the game on
 * stream, as before. "Change mode" in a control room goes back to the launcher.
 */
function createSession(origin: string, config: AppConfig) {
  let windows: BrowserWindow[] = [];
  /** Set while windows are swapped, so closing the old ones does not close the new ones. */
  let swapping = false;

  const closeAll = (keep: readonly BrowserWindow[] = []): void => {
    for (const win of windows) if (!keep.includes(win) && !win.isDestroyed()) win.close();
  };

  /** Opens the new windows first, then closes the old ones: the app never has zero windows. */
  const swap = async (open: () => Promise<BrowserWindow[]>): Promise<void> => {
    if (swapping) return;
    swapping = true;
    const previous = windows;
    try {
      const next = await open();
      windows = next;
      for (const win of previous) if (!win.isDestroyed()) win.close();
      // The game window takes its control room with it.
      const [game] = next;
      if (next.length > 1 && game)
        game.once('closed', () => {
          if (!swapping && windows === next) closeAll();
        });
    } finally {
      swapping = false;
    }
  };

  const onRequest = (request: AppRequest): void => {
    if (request.kind === 'journal') {
      const folder = journalDir(app.getPath('userData'));
      void mkdir(folder, { recursive: true })
        .then(() => shell.openPath(folder))
        .catch((error: unknown) => {
          console.error('[app] could not open the journal folder', error);
        });
      return;
    }
    const task = request.kind === 'open' ? openMode(request.mode) : openLauncher();
    task.catch((error: unknown) => {
      console.error('[app] could not switch windows', error);
      // Never leave the operator without a window to act from.
      if (windows.every((win) => win.isDestroyed())) void openLauncher().catch(() => undefined);
    });
  };

  const openMode = (mode: Mode): Promise<void> =>
    swap(async () => {
      const game = await openGameWindow(origin, {
        mode,
        orientation: config.orientation,
        diagnostic: false,
        seed: null,
      });
      let control: BrowserWindow;
      try {
        if (mode === 'duel' && config.orientation === 'landscape') {
          await evaluate(game.webContents, () => {
            window.Viper.settings.format = 'landscape';
            window.Viper.newRound();
          });
        }
        control = await openControlWindow(origin, mode, onRequest);
      } catch (error) {
        if (!game.isDestroyed()) game.close();
        throw error;
      }
      // Closed while its control room was loading: drop the pair, the launcher stays.
      if (game.isDestroyed()) {
        control.close();
        throw new Error('game window closed while opening');
      }
      if (mode === 'feed' || mode === 'arena') {
        // Feed saves its round every second, so a sudden shutdown can be undone on the next
        // launch. The arena has no round worth saving yet.
        const stop =
          mode === 'feed' ? await backUpFeed(game, app.getPath('userData')) : () => undefined;
        // Both keep a journal and the one supporters list, which lives online too when the build
        // carries its key (feed-cloud.ts).
        const cloud = await readCloudConfig([process.resourcesPath, app.getAppPath()]);
        const stopJournal = await journalFeed(
          game,
          app.getPath('userData'),
          cloud,
          [process.resourcesPath, app.getAppPath()],
          GAME_TITLE[mode],
        );
        game.once('closed', () => {
          stop();
          stopJournal();
        });
      }
      return [game, control];
    });

  const openLauncher = (): Promise<void> =>
    swap(async () => [await openLauncherWindow(origin, onRequest)]);

  const focus = (): void => {
    for (const win of windows) {
      if (win.isDestroyed()) continue;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  };

  return { openMode, openLauncher, focus };
}

async function start(config: AppConfig): Promise<void> {
  await app.whenReady();

  const renderer = await hostRenderer(app.getAppPath(), config.rendererOrigin);
  app.once('will-quit', () => void renderer.dispose());
  app.on('window-all-closed', () => {
    app.quit();
  });

  if (config.diagnostic) {
    const { name, options } = config.diagnostic;
    const game = await openGameWindow(renderer.origin, {
      mode: name === 'feed-timing' ? 'feed' : 'duel',
      orientation: config.orientation,
      diagnostic: true,
      seed: name === 'visual' ? VISUAL_SEED : null,
    });
    app.exit(await runDiagnostic(game, name, config.orientation, options));
    return;
  }

  const session = createSession(renderer.origin, config);
  await (config.mode ? session.openMode(config.mode) : session.openLauncher());

  // A second launch focuses this instance instead of opening a competing local server.
  app.on('second-instance', session.focus);
}

function fail(error: unknown): never {
  console.error(error instanceof ConfigError ? error.message : error);
  app.exit(1);
  process.exit(1);
}

keepRenderingWhenCovered();

let config: AppConfig;
try {
  // Packaged: [exe, ...args]. Development: [electron, appPath, ...args].
  config = parseConfig(process.argv.slice(app.isPackaged ? 1 : 2));
} catch (error) {
  fail(error);
}

// The app was named Viper Duel before it had a second mode: its settings stay where they were,
// unless a rehearsal asks for a folder of its own.
app.setPath(
  'userData',
  config.dataDir ? path.resolve(config.dataDir) : path.join(app.getPath('appData'), 'Viper Duel'),
);

// Pixel regression needs a rasteriser that is a pure function of the draw calls.
if (config.diagnostic?.name === 'visual') useReproducibleRendering(app);

if (!config.diagnostic && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start(config).catch(fail);
}
