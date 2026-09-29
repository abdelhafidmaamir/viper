// Feed the Snake survives a sudden shutdown: every second the round in progress is written to a
// file (flushed to disk, then swapped in whole). On the next launch the game picks that round up
// by itself, so what viewers paid for is never lost.

import { open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

const SAVE_EVERY_MS = 1000;
/** A backup older than this is from another day's live: not restored. */
const RESTORE_WITHIN_MS = 12 * 60 * 60 * 1000;

interface Saved {
  readonly savedAt?: number;
  readonly fans?: readonly unknown[];
  readonly queue?: readonly unknown[];
  readonly owed?: readonly unknown[];
}

/** Worth restoring: recent, and someone had given or berries were still owed. */
export function worthRestoring(text: string, now = Date.now()): boolean {
  try {
    const s = JSON.parse(text) as Saved;
    if (typeof s.savedAt !== 'number' || now - s.savedAt > RESTORE_WITHIN_MS) return false;
    return (s.fans?.length ?? 0) > 0 || (s.queue?.length ?? 0) > 0 || (s.owed?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Writes the whole file, forces it to disk, then swaps it in: a crash never leaves half a file. */
async function writeDurably(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp`;
  const handle = await open(tmp, 'w');
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, file);
}

/** Restores last run's round in a Feed game window, then backs it up every second. */
export async function backUpFeed(game: BrowserWindow, dir: string): Promise<() => void> {
  const file = path.join(dir, 'feed-backup.json');
  let last: string | null = null;
  try {
    last = await readFile(file, 'utf8');
  } catch {
    /* first run: nothing to restore */
  }
  if (last && worthRestoring(last))
    await game.webContents.executeJavaScript(
      `window.__viperFeed && window.__viperFeed.restore(${JSON.stringify(last)})`,
    );

  let busy = false;
  const timer = setInterval(() => {
    if (busy || game.isDestroyed()) return;
    busy = true;
    void (async () => {
      try {
        const text = (await game.webContents.executeJavaScript(
          'window.__viperFeed ? window.__viperFeed.snapshot() : null',
        )) as string | null;
        if (text) await writeDurably(file, text);
      } catch {
        /* the window is closing or busy: the next tick tries again */
      } finally {
        busy = false;
      }
    })();
  }, SAVE_EVERY_MS);
  return () => {
    clearInterval(timer);
  };
}
