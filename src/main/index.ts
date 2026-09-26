import { app } from 'electron';

import { ConfigError, parseConfig, type AppConfig } from './config.js';
import { runDiagnostic } from './diagnostics/index.js';
import { evaluate } from './page/evaluate.js';
import { hostRenderer } from './renderer-host.js';
import { openControlWindow, openGameWindow } from './windows.js';

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

async function start(config: AppConfig): Promise<void> {
  await app.whenReady();

  const renderer = await hostRenderer(app.getAppPath(), config.rendererOrigin);
  app.once('will-quit', () => void renderer.dispose());
  app.on('window-all-closed', () => {
    app.quit();
  });

  const game = await openGameWindow(renderer.origin, {
    orientation: config.orientation,
    diagnostic: config.diagnostic !== null,
  });

  if (config.diagnostic) {
    const { name, options } = config.diagnostic;
    app.exit(await runDiagnostic(game, name, config.orientation, options));
    return;
  }

  if (config.orientation === 'landscape') {
    await evaluate(game.webContents, () => {
      window.VipereBase.reglages.format = 'horizontal';
      window.VipereBase.nouvelleManche();
    });
  }
  const control = await openControlWindow(renderer.origin);

  // A second launch focuses this instance instead of opening a competing local server.
  app.on('second-instance', () => {
    for (const win of [game, control]) {
      if (win.isDestroyed()) continue;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
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

if (!config.diagnostic && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  start(config).catch(fail);
}
