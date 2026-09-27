import { BrowserWindow, screen, type WebPreferences } from 'electron';

import type { Orientation } from './config.js';
import { fitContentSize } from './layout.js';

const BACKGROUND = '#0c110e';

/** Electron security checklist defaults, stated explicitly so a future change is a visible diff. */
const SECURE_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
} as const satisfies WebPreferences;

/**
 * Pages only ever load from the local server: navigation elsewhere and pop-ups are refused, and
 * the window title stays owned by the main process (capture tools select windows by title).
 */
function lockDown(win: BrowserWindow, origin: string, title: string): void {
  const { webContents } = win;
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle(title);
  });
}

export interface GameWindowOptions {
  readonly orientation: Orientation;
  /**
   * Diagnostics run the game alone, pinned on top, as large as the screen allows: Windows
   * throttles an occluded window, which would corrupt any timing.
   */
  readonly diagnostic: boolean;
}

/**
 * The on-stream window. Always framed: OBS and TikTok LIVE Studio capture a frameless Electron
 * window as black, so the frame is cropped in the capture tool instead.
 */
export async function openGameWindow(
  origin: string,
  { orientation, diagnostic }: GameWindowOptions,
): Promise<BrowserWindow> {
  const landscape = orientation === 'landscape';
  const title = 'Viper Duel';
  const win = new BrowserWindow({
    title,
    width: landscape ? 960 : 540,
    height: landscape ? 540 : 960,
    useContentSize: true,
    autoHideMenuBar: true,
    backgroundColor: BACKGROUND,
    show: !diagnostic,
    // The window is captured, not watched: it must render at full rate even when covered.
    webPreferences: { ...SECURE_PREFERENCES, backgroundThrottling: false },
  });
  lockDown(win, origin, title);

  if (diagnostic) {
    const { width, height } = fitContentSize(orientation, screen.getPrimaryDisplay().workAreaSize);
    win.setAlwaysOnTop(true);
    win.setContentSize(width, height);
    win.center();
  }

  await win.loadURL(`${origin}/game.html`);

  if (diagnostic) {
    win.show();
    win.focus();
    win.moveTop();
  }
  return win;
}

/** The private control room. It is never captured, so the admin section is enabled. */
export async function openControlWindow(origin: string): Promise<BrowserWindow> {
  const title = 'Viper Duel | Control Room';
  const win = new BrowserWindow({
    title,
    width: 1280,
    height: 800,
    minWidth: 720,
    minHeight: 560,
    autoHideMenuBar: true,
    backgroundColor: BACKGROUND,
    webPreferences: SECURE_PREFERENCES,
  });
  lockDown(win, origin, title);
  await win.loadURL(`${origin}/control.html?admin=1`);
  return win;
}
