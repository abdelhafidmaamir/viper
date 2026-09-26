import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  resolveRequestPath,
  startStaticServer,
  type StaticServer,
} from '../../src/main/static-server.ts';

let root: string;
let server: StaticServer;

beforeAll(async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'viper-server-'));
  root = path.join(sandbox, 'renderer');
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await writeFile(path.join(root, 'game.html'), '<canvas id="scene"></canvas>');
  await writeFile(path.join(root, 'scripts', 'game.js'), 'void 0;');
  // A sibling whose name starts like the root: a naive prefix check would serve it.
  await mkdir(`${root}-secret`);
  await writeFile(path.join(`${root}-secret`, 'key.txt'), 'secret');
  server = await startStaticServer(root);
});

afterAll(async () => {
  await server.close();
  await rm(path.dirname(root), { recursive: true, force: true });
});

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** Raw request: `fetch` would normalise `..` segments away before they reach the server. */
function get(rawPath: string, method = 'GET'): Promise<RawResponse> {
  const { hostname, port } = new URL(server.origin);
  return new Promise((resolve, reject) => {
    const req = request({ hostname, port, path: rawPath, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => (body += chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('startStaticServer', () => {
  it('listens on loopback only', () => {
    expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it('serves the game page for /', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('scene');
  });

  it('serves scripts with a JavaScript type, no caching and no sniffing', async () => {
    const res = await get('/scripts/game.js?v=2');
    expect(res.status).toBe(200);
    expect(res.headers).toMatchObject({
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
  });

  it('answers HEAD without a body', async () => {
    const res = await get('/game.html', 'HEAD');
    expect(res.status).toBe(200);
    expect(res.body).toBe('');
  });

  it.each([
    ['/missing.js', 404],
    ['/scripts', 404],
    ['/%E0%A4%A', 400],
  ])('%s -> %i', async (requestPath, status) => {
    expect((await get(requestPath)).status).toBe(status);
  });

  it.each([
    '/../renderer-secret/key.txt',
    '/%2e%2e/renderer-secret/key.txt',
    '/..%5crenderer-secret%5ckey.txt',
  ])('never serves outside the root: %s', async (requestPath) => {
    const res = await get(requestPath);
    expect(res.status).not.toBe(200);
    expect(res.body).not.toContain('secret');
  });

  it('refuses writes', async () => {
    const res = await get('/game.html', 'POST');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET, HEAD');
  });
});

describe('resolveRequestPath', () => {
  const base = path.resolve('/app/renderer');

  it('maps a request path to a file under the root', () => {
    expect(resolveRequestPath(base, '/scripts/game.js')).toBe(
      path.join(base, 'scripts', 'game.js'),
    );
  });

  it('refuses the root itself', () => {
    expect(resolveRequestPath(base, '/')).toBeNull();
    expect(resolveRequestPath(base, '/..')).toBeNull();
  });

  it('clamps dot segments to the root', () => {
    expect(resolveRequestPath(base, '/../renderer-secret/key.txt')).toBe(
      path.join(base, 'renderer-secret', 'key.txt'),
    );
    expect(resolveRequestPath(base, '/a/../../etc/passwd')).toBe(path.join(base, 'etc', 'passwd'));
  });

  it.each(['/..\\renderer-secret\\key.txt', '/scripts/..\\..\\..\\key.txt'])(
    'never resolves outside the root, whatever the platform separator: %s',
    (requestPath) => {
      const resolved = resolveRequestPath(base, requestPath);
      const inside = resolved === null || resolved.startsWith(base + path.sep);
      expect(inside).toBe(true);
    },
  );
});

describe('startStaticServer options', () => {
  it('binds the preferred port, then falls back to a free one when it is taken', async () => {
    const first = await startStaticServer(root, { preferredPort: 0 });
    const port = Number(new URL(first.origin).port);
    try {
      const again = await startStaticServer(root, { preferredPort: port });
      try {
        expect(again.onPreferredPort).toBe(false);
        expect(again.origin).not.toBe(first.origin);
      } finally {
        await again.close();
      }
    } finally {
      await first.close();
    }
    const reused = await startStaticServer(root, { preferredPort: port });
    expect(reused).toMatchObject({ origin: first.origin, onPreferredPort: true });
    await reused.close();
  });

  it('adds document headers to HTML only', async () => {
    const withPolicy = await startStaticServer(root, {
      documentHeaders: { 'Content-Security-Policy': "default-src 'self'" },
    });
    try {
      const page = await fetch(`${withPolicy.origin}/game.html`);
      const script = await fetch(`${withPolicy.origin}/scripts/game.js`);
      expect(page.headers.get('content-security-policy')).toBe("default-src 'self'");
      expect(script.headers.get('content-security-policy')).toBeNull();
    } finally {
      await withPolicy.close();
    }
  });
});
