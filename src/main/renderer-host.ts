import path from 'node:path';

import { startStaticServer } from './static-server.js';

/**
 * Stable port for the local origin. Web storage is keyed by origin, port included: with a random
 * port every launch started from empty storage and saved control-room settings were lost.
 */
export const PREFERRED_PORT = 47813;

/**
 * Policy for the served pages. Avatars come from TikTok's CDN, the control room uses Google
 * Fonts, and the bridge connects to TikFinity over a WebSocket whose URL the operator can edit.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export interface RendererHost {
  readonly origin: string;
  dispose(): Promise<void>;
}

/**
 * Where the windows load from: the Vite dev server in development, otherwise the built renderer
 * served by the main process under the stable origin and the policy above.
 */
export async function hostRenderer(
  appPath: string,
  devServerOrigin: string | null,
): Promise<RendererHost> {
  if (devServerOrigin) return { origin: devServerOrigin, dispose: () => Promise.resolve() };

  const server = await startStaticServer(path.join(appPath, 'dist', 'renderer'), {
    preferredPort: PREFERRED_PORT,
    documentHeaders: { 'Content-Security-Policy': CONTENT_SECURITY_POLICY },
  });
  if (!server.onPreferredPort) {
    console.warn(
      `[renderer] port ${String(PREFERRED_PORT)} is taken, serving on ${server.origin}: ` +
        'control-room settings will not persist for this session.',
    );
  }
  return { origin: server.origin, dispose: () => server.close() };
}
