// What a Feed live leaves behind for reading afterwards: a journal per live (a spreadsheet file,
// one row per gift, follow, round and so on, see src/renderer/feed/journal.ts) and the list of
// everyone who ever supported the live, kept from one live to the next.

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { BrowserWindow } from 'electron';

import { writeDurably } from './feed-backup.js';
import { pullSupporters, pushSupporters, savedAt, type CloudConfig } from './feed-cloud.js';

const COLLECT_EVERY_MS = 1000,
  SAVE_SUPPORTERS_EVERY = 5,
  /** The online copy is written at most this often: a gift reaches it within seconds. */
  PUSH_EVERY_MS = 15_000;

/** The folder holding one journal file per live. */
export const journalDir = (dir: string): string => path.join(dir, 'journal');

/** The byte order mark that lets Excel read accents and emoji in names correctly. */
const BOM = String.fromCharCode(0xfeff);

const pad = (n: number): string => String(n).padStart(2, '0');

/** A file name that sorts by date and says when the live began: `Viper Feed 2026-09-29 21h14.csv`. */
export function journalName(at: Date): string {
  return `Viper Feed ${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}h${pad(at.getMinutes())}.csv`;
}

/**
 * Loads the supporters list into a Feed game window, then keeps the journal and the list saved:
 * on this computer, and online when the build carries a cloud key, so a new build or a new
 * computer picks up where the last one left off.
 */
export async function journalFeed(
  game: BrowserWindow,
  dir: string,
  cloud: CloudConfig | null = null,
): Promise<() => void> {
  const supportersFile = path.join(dir, 'feed-supporters.json'),
    folder = journalDir(dir),
    file = path.join(folder, journalName(new Date()));
  const run = (code: string): Promise<unknown> => game.webContents.executeJavaScript(code);

  // The newest of the two copies wins: this computer's, or the one saved online by any computer.
  const local = await readFile(supportersFile, 'utf8').catch(() => null);
  let online: string | null = null,
    reachable = false;
  if (cloud)
    try {
      online = await pullSupporters(cloud);
      reachable = true;
    } catch {
      /* offline: this computer's copy, sent online once the connection is back */
    }
  const saved = savedAt(online) > savedAt(local) ? online : local;
  if (saved)
    await run(
      `window.__viperFeed && window.__viperFeed.restoreSupporters(${JSON.stringify(saved)})`,
    ).catch(() => undefined);
  // What the online copy still lacks: this computer's, when it is newer or the cloud was out of reach.
  let pending: string | null = cloud && saved && (saved !== online || !reachable) ? saved : null,
    pushedAt = 0;

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
          if (list) {
            await writeDurably(supportersFile, list);
            pending = list;
          }
        }
        if (cloud && pending && Date.now() - pushedAt >= PUSH_EVERY_MS) {
          pushedAt = Date.now();
          const text = pending;
          try {
            await pushSupporters(cloud, text);
            // Only if nothing newer came in while it was being sent.
            if (pending === text) pending = null;
          } catch {
            /* offline: kept, sent on a later tick */
          }
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
