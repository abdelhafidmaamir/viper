import { BrowserWindow, screen, type WebPreferences } from 'electron';

import { appRequest, type AppRequest } from './app-request.js';
import type { Mode, Orientation } from './config.js';
import { fitContentSize } from './layout.js';

const BACKGROUND = '#0c110e';

/** Electron security checklist defaults, stated explicitly so a future change is a visible diff. */
const SECURE_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
} as const satisfies WebPreferences;

export type RequestHandler = (request: AppRequest) => void;

/**
 * Pages only ever load from the local server: navigation elsewhere and pop-ups are refused, and
 * the window title stays owned by the main process (capture tools select windows by title).
 */
function lockDown(
  win: BrowserWindow,
  origin: string,
  title: string,
  onRequest?: RequestHandler,
): void {
  const { webContents } = win;
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  webContents.on('will-navigate', (event, url) => {
    const request = appRequest(url, origin);
    if (request) {
      event.preventDefault();
      onRequest?.(request);
      return;
    }
    if (new URL(url).origin !== origin) event.preventDefault();
  });
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle(title);
  });
}

/** Window titles: OBS and LIVE Studio find the game window by title, one source per mode. */
export const GAME_TITLE: Readonly<Record<Mode, string>> = {
  duel: 'Viper Duel',
  feed: 'Viper Feed',
  arena: 'Viper Arena',
};
const GAME_PAGE: Readonly<Record<Mode, string>> = {
  duel: 'game.html',
  feed: 'feed.html',
  arena: 'arena.html',
};
/** The duel's control room is never captured, so its admin section is on. */
const CONTROL_PAGE: Readonly<Record<Mode, string>> = {
  duel: 'control.html?admin=1',
  feed: 'feed-control.html',
  arena: 'arena-control.html',
};

export interface GameWindowOptions {
  readonly mode: Mode;
  readonly orientation: Orientation;
  /**
   * Diagnostics run the game alone, pinned on top, as large as the screen allows: Windows
   * throttles an occluded window, which would corrupt any timing.
   */
  readonly diagnostic: boolean;
  /**
   * Loads the page in deterministic mode (`game.html?seed=<n>`): seeded randomness and a virtual
   * clock driven through `window.__viperClock`. Null for every normal run.
   */
  readonly seed: number | null;
}

/**
 * The on-stream window. Always framed: OBS and TikTok LIVE Studio capture a frameless Electron
 * window as black, so the frame is cropped in the capture tool instead.
 */
export async function openGameWindow(
  origin: string,
  { mode, orientation, diagnostic, seed }: GameWindowOptions,
): Promise<BrowserWindow> {
  // Feed the Snake and Snake Arena are drawn for portrait only.
  const landscape = mode === 'duel' && orientation === 'landscape';
  const title = GAME_TITLE[mode];
  const win = new BrowserWindow({
    title,
    width: landscape ? 960 : 540,
    height: landscape ? 540 : 960,
    useContentSize: true,
    autoHideMenuBar: true,
    backgroundColor: BACKGROUND,
    show: !diagnostic,
    // The window is captured, not watched: it must render at full rate even when covered.
    webPreferences: {
      ...SECURE_PREFERENCES,
      backgroundThrottling: false,
      // Feed the Snake's sound is part of the show, the arena's too: it plays without a click.
      ...(mode === 'duel' ? {} : { autoplayPolicy: 'no-user-gesture-required' as const }),
    },
  });
  lockDown(win, origin, title);

  if (diagnostic) {
    const { width, height } = fitContentSize(orientation, screen.getPrimaryDisplay().workAreaSize);
    win.setAlwaysOnTop(true);
    win.setContentSize(width, height);
    win.center();
  }

  const query = seed === null ? '' : `?seed=${String(seed)}`;
  await win.loadURL(`${origin}/${GAME_PAGE[mode]}${query}`);

  if (diagnostic) {
    win.show();
    win.focus();
    win.moveTop();
  }
  return win;
}

/** The private control room of a mode. */
export async function openControlWindow(
  origin: string,
  mode: Mode,
  onRequest: RequestHandler,
): Promise<BrowserWindow> {
  const title = `${GAME_TITLE[mode]} | Control Room`;
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
  lockDown(win, origin, title, onRequest);
  await win.loadURL(`${origin}/${CONTROL_PAGE[mode]}`);
  return win;
}

/** The first window: pick a mode. */
export async function openLauncherWindow(
  origin: string,
  onRequest: RequestHandler,
): Promise<BrowserWindow> {
  const title = 'Viper';
  const win = new BrowserWindow({
    title,
    width: 960,
    height: 620,
    minWidth: 720,
    minHeight: 520,
    autoHideMenuBar: true,
    backgroundColor: BACKGROUND,
    webPreferences: SECURE_PREFERENCES,
  });
  lockDown(win, origin, title, onRequest);
  await win.loadURL(`${origin}/launcher.html`);
  return win;
}
