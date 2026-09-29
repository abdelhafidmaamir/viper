// The Feed supporters list, kept online so it survives a new build and a new computer: the app
// reads it from the streamer's own Firestore database at launch and writes it back when it
// changes. The database only answers to a long secret key shipped with the build (cloud.local.json,
// never committed); without that file the list simply stays on this computer.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface CloudConfig {
  readonly projectId: string;
  /** The secret key: the document the list lives in. Rules refuse anything shorter than 40. */
  readonly space: string;
}

/** Firestore keeps a document under 1 MiB: the list is cut into parts this long (4 bytes a char at worst). */
const PART = 200_000;
const TIMEOUT_MS = 8000;

export async function readCloudConfig(dirs: readonly string[]): Promise<CloudConfig | null> {
  for (const dir of dirs) {
    try {
      const raw = JSON.parse(await readFile(path.join(dir, 'cloud.local.json'), 'utf8')) as unknown;
      if (
        typeof raw === 'object' &&
        raw !== null &&
        'projectId' in raw &&
        'space' in raw &&
        typeof raw.projectId === 'string' &&
        typeof raw.space === 'string' &&
        /^[\w-]+$/.test(raw.projectId) &&
        /^[A-Za-z0-9]{40,}$/.test(raw.space)
      )
        return { projectId: raw.projectId, space: raw.space };
    } catch {
      /* not in this folder */
    }
  }
  return null;
}

const base = (c: CloudConfig): string =>
  `https://firestore.googleapis.com/v1/projects/${c.projectId}/databases/(default)/documents/viper/${c.space}`;

interface Doc {
  readonly fields?: Record<string, { stringValue?: string; integerValue?: string } | undefined>;
}

type Fetch = typeof fetch;

async function getDoc(url: string, f: Fetch): Promise<Doc | null> {
  const res = await f(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`cloud read ${String(res.status)}`);
  return (await res.json()) as Doc;
}

async function putDoc(url: string, fields: Record<string, unknown>, f: Fetch): Promise<void> {
  const res = await f(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`cloud write ${String(res.status)}`);
}

/** The list as last saved online, or null when there is none yet. Throws when offline. */
export async function pullSupporters(c: CloudConfig, f: Fetch = fetch): Promise<string | null> {
  const head = await getDoc(base(c), f);
  if (!head) return null;
  const parts = Number(head.fields?.parts?.integerValue ?? '0');
  if (!parts) return head.fields?.data?.stringValue ?? null;
  let text = '';
  for (let i = 0; i < parts; i++) {
    const part = await getDoc(`${base(c)}/shards/${String(i)}`, f);
    const chunk = part?.fields?.data?.stringValue;
    // A missing part means a write was cut short: better nothing than half a list.
    if (chunk === undefined) return null;
    text += chunk;
  }
  return text;
}

/** Saves the list online, in parts when it grows past one document. Throws when offline. */
export async function pushSupporters(
  c: CloudConfig,
  text: string,
  f: Fetch = fetch,
): Promise<void> {
  const savedAt = { integerValue: String(Date.now()) };
  if (text.length <= PART) {
    await putDoc(
      base(c),
      { data: { stringValue: text }, parts: { integerValue: '0' }, savedAt },
      f,
    );
    return;
  }
  const parts = Math.ceil(text.length / PART);
  // The parts first, the head last: a reader never sees a head pointing at parts not written yet.
  for (let i = 0; i < parts; i++)
    await putDoc(
      `${base(c)}/shards/${String(i)}`,
      { data: { stringValue: text.slice(i * PART, (i + 1) * PART) } },
      f,
    );
  await putDoc(
    base(c),
    { data: { stringValue: '' }, parts: { integerValue: String(parts) }, savedAt },
    f,
  );
}

/** When a saved list was written ("savedAt" inside it), 0 when unreadable. */
export function savedAt(text: string | null): number {
  if (!text) return 0;
  try {
    const t = (JSON.parse(text) as { savedAt?: unknown }).savedAt;
    return typeof t === 'number' ? t : 0;
  } catch {
    return 0;
  }
}
