// What a Feed live leaves behind for reading afterwards: a journal per live (a spreadsheet file,
// one row per gift, follow, round and so on, see src/renderer/feed/journal.ts) and the list of
// everyone who ever supported the live, kept from one live to the next.

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import { writeDurably } from './feed-backup.js';

const COLLECT_EVERY_MS = 1000,
  SAVE_SUPPORTERS_EVERY = 5;

/** The folder holding one journal file per live. */
export const journalDir = (dir: string): string => path.join(dir, 'journal');

/** The byte order mark that lets Excel read accents and emoji in names correctly. */
const BOM = String.fromCharCode(0xfeff);

const pad = (n: number): string => String(n).padStart(2, '0');

/** A file name that sorts by date and says when the live began: `Viper Feed 2026-09-29 21h14.csv`. */
export function journalName(at: Date): string {
  return `Viper Feed ${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}h${pad(at.getMinutes())}.csv`;
}

/** Loads the supporters list into a Feed game window, then keeps the journal and the list saved. */
export async function journalFeed(game: BrowserWindow, dir: string): Promise<() => void> {
  const supportersFile = path.join(dir, 'feed-supporters.json'),
    folder = journalDir(dir),
    file = path.join(folder, journalName(new Date()));
  const run = (code: string): Promise<unknown> => game.webContents.executeJavaScript(code);

  try {
    const saved = await readFile(supportersFile, 'utf8');
    await run(
      `window.__viperFeed && window.__viperFeed.restoreSupporters(${JSON.stringify(saved)})`,
    );
  } catch {
    /* first live: nobody to remember yet */
  }

  let started = false,
    busy = false,
    ticks = 0;
  const timer = setInterval(() => {
    if (busy || game.isDestroyed()) return;
    busy = true;
    void (async () => {
      try {
        const rows = (await run(
          'window.__viperFeed ? window.__viperFeed.journal() : ""',
        )) as string;
        if (rows) {
          if (!started) {
            await mkdir(folder, { recursive: true });
            const header = (await run('window.__viperFeed.journalHeader()')) as string;
            await appendFile(file, BOM + `${header}\r\n`, 'utf8');
            started = true;
          }
          await appendFile(file, `${rows.replace(/\n/g, '\r\n')}\r\n`, 'utf8');
        }
        if (++ticks % SAVE_SUPPORTERS_EVERY === 0) {
          const list = (await run(
            'window.__viperFeed ? window.__viperFeed.supporters() : null',
          )) as string | null;
          if (list) await writeDurably(supportersFile, list);
        }
      } catch {
        /* the window is closing or busy: the next tick tries again */
      } finally {
        busy = false;
      }
    })();
  }, COLLECT_EVERY_MS);
  return () => {
    clearInterval(timer);
  };
}
