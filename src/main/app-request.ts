import type { Mode } from './config.js';

/**
 * What a page asks of the app, by navigating to a reserved path the server never serves: the
 * launcher opens a mode (`/__viper/open?mode=feed`), a control room goes back to the launcher
 * (`/__viper/launcher`). Plain navigation keeps the pages free of any preload bridge.
 */
export type AppRequest =
  | { readonly kind: 'open'; readonly mode: Mode }
  | { readonly kind: 'launcher' }
  /** The Feed control room opens the folder holding each live's journal. */
  | { readonly kind: 'journal' };

const REQUEST_PATH = '/__viper/';

/** Reads an app request from a same-origin URL, or null when it is ordinary navigation. */
export function appRequest(url: string, origin: string): AppRequest | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.origin !== origin || !parsed.pathname.startsWith(REQUEST_PATH)) return null;
  const action = parsed.pathname.slice(REQUEST_PATH.length);
  if (action === 'launcher') return { kind: 'launcher' };
  if (action === 'journal') return { kind: 'journal' };
  const mode = parsed.searchParams.get('mode');
  if (action === 'open' && (mode === 'duel' || mode === 'feed')) return { kind: 'open', mode };
  return null;
}
