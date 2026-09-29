import { describe, expect, it } from 'vitest';

import { pullSupporters, pushSupporters, savedAt } from '../../src/main/feed-cloud.ts';

/** A stand-in for Firestore's REST API: documents by URL. */
function fakeFirestore(): { fetch: typeof fetch; docs: Map<string, unknown> } {
  const docs = new Map<string, unknown>();
  const f = ((url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === 'PATCH') {
      docs.set(url, JSON.parse(init.body ?? '{}') as unknown);
      return Promise.resolve(new Response('{}', { status: 200 }));
    }
    const doc = docs.get(url);
    return Promise.resolve(
      doc
        ? new Response(JSON.stringify(doc), { status: 200 })
        : new Response('{}', { status: 404 }),
    );
  }) as unknown as typeof fetch;
  return { fetch: f, docs };
}

const cloud = { projectId: 'viper-test', space: 'x'.repeat(48) };

describe('online supporters list', () => {
  it('reads back what it saved, and nothing before the first save', async () => {
    const { fetch } = fakeFirestore();
    expect(await pullSupporters(cloud, fetch)).toBeNull();
    const text = JSON.stringify({ savedAt: 5, supporters: [{ id: 'kapach971', berries: 210 }] });
    await pushSupporters(cloud, text, fetch);
    expect(await pullSupporters(cloud, fetch)).toBe(text);
  });

  it('cuts a very long list into parts and puts it back together', async () => {
    const { fetch, docs } = fakeFirestore();
    const text = JSON.stringify({ savedAt: 9, pad: '🌸'.repeat(150_000) });
    await pushSupporters(cloud, text, fetch);
    expect([...docs.keys()].filter((k) => k.includes('/shards/')).length).toBeGreaterThan(1);
    expect(await pullSupporters(cloud, fetch)).toBe(text);
  });

  it('knows which copy is newest', () => {
    expect(savedAt(JSON.stringify({ savedAt: 42 }))).toBe(42);
    expect(savedAt('not json')).toBe(0);
    expect(savedAt(null)).toBe(0);
  });
});
