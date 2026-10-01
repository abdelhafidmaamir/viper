import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export interface StaticServer {
  /** `http://127.0.0.1:<port>`, no trailing slash. */
  readonly origin: string;
  /** False when the preferred port was taken and a random one was used instead. */
  readonly onPreferredPort: boolean;
  close(): Promise<void>;
}

export interface StaticServerOptions {
  /** Served for `/`. */
  readonly defaultDocument?: string;
  /**
   * Port to bind first. Web storage is scoped to the origin, port included, so a stable port is
   * what lets saved settings survive a restart. Falls back to a free port when taken.
   */
  readonly preferredPort?: number;
  /** Extra headers on HTML documents, e.g. a Content-Security-Policy. */
  readonly documentHeaders?: Readonly<Record<string, string>>;
}

type ResolvedOptions = Required<Omit<StaticServerOptions, 'preferredPort'>>;

/**
 * Maps a request path to a file under `root`, or `null` when it would escape it.
 * Exported for tests.
 */
export function resolveRequestPath(root: string, requestPath: string): string | null {
  const target = path.resolve(root, `.${path.posix.normalize(`/${requestPath}`)}`);
  const relative = path.relative(root, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return target;
}

function send(
  res: ServerResponse,
  status: number,
  extraHeaders: Record<string, string> = {},
): void {
  res.writeHead(status, { ...BASE_HEADERS, ...extraHeaders }).end();
}

async function handle(
  root: string,
  { defaultDocument, documentHeaders }: ResolvedOptions,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, { Allow: 'GET, HEAD' });
    return;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    send(res, 400);
    return;
  }

  const file = resolveRequestPath(root, pathname === '/' ? defaultDocument : pathname);
  if (!file) {
    send(res, 403);
    return;
  }

  let body: Buffer;
  try {
    body = await readFile(file);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    send(res, code === 'ENOENT' || code === 'EISDIR' ? 404 : 500);
    return;
  }

  const extension = path.extname(file).toLowerCase();
  res.writeHead(200, {
    ...BASE_HEADERS,
    ...(extension === '.html' ? documentHeaders : {}),
    'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    'Content-Length': String(body.length),
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

/**
 * Serves `root` on the loopback interface.
 *
 * Both windows load from this one origin so they can talk over `BroadcastChannel`, and the game
 * page, being `http:`, may open the TikFinity WebSocket that `file:` pages cannot.
 */
export async function startStaticServer(
  root: string,
  { defaultDocument = 'game.html', preferredPort, documentHeaders = {} }: StaticServerOptions = {},
): Promise<StaticServer> {
  const resolvedRoot = path.resolve(root);
  const options: ResolvedOptions = { defaultDocument, documentHeaders };
  const server = createServer((req, res) => {
    handle(resolvedRoot, options, req, res).catch(() => {
      if (!res.headersSent) send(res, 500);
      else res.destroy();
    });
  });

  let onPreferredPort = preferredPort !== undefined;
  try {
    await listen(server, preferredPort ?? 0);
  } catch (error) {
    if (!onPreferredPort || (error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    onPreferredPort = false;
    await listen(server, 0);
  }

  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    onPreferredPort,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
