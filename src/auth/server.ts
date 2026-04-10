import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { CONFIG } from '../lib/config.js';
import { getGoogleCallbackHtml, getSuccessHtml, getErrorHtml } from '../html/callback.js';
import type { AuthProvider, ODTokens } from '../lib/types.js';

export interface CallbackResult {
  provider: AuthProvider;
  /** For Google: the Google access_token; For Apple: not used */
  googleAccessToken?: string;
  /** For Apple: OD tokens come directly in the callback */
  odTokens?: ODTokens;
}

interface ServerContext {
  port: number;
  provider: AuthProvider;
  resolve: (result: CallbackResult) => void;
  reject: (error: Error) => void;
}

function handleRequest(ctx: ServerContext, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', `http://localhost:${ctx.port}`);

  // Google: /callback serves HTML that extracts token from hash
  if (url.pathname === '/callback' && ctx.provider === 'google') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getGoogleCallbackHtml(ctx.port));
    return;
  }

  // Google: /token receives the token POSTed by the callback HTML page
  if (url.pathname === '/token' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const accessToken = data.access_token;
        if (!accessToken) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing access_token' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        ctx.resolve({ provider: 'google', googleAccessToken: accessToken });
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Apple: /callback receives OD tokens as query params
  if (url.pathname === '/callback' && ctx.provider === 'apple') {
    const accessToken = url.searchParams.get('access_token');
    const refreshToken = url.searchParams.get('refresh_token');

    if (!accessToken || !refreshToken) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getErrorHtml('Missing tokens in callback. Please try again.'));
      ctx.reject(new Error('Apple callback missing tokens'));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getSuccessHtml());
    ctx.resolve({
      provider: 'apple',
      odTokens: { access_token: accessToken, refresh_token: refreshToken },
    });
    return;
  }

  // Fallback
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

/**
 * Start a local HTTP server to receive the OAuth callback.
 * Returns a promise that resolves with the callback result.
 */
export function startCallbackServer(provider: AuthProvider): Promise<{
  port: number;
  result: Promise<CallbackResult>;
  close: () => void;
}> {
  return new Promise((resolveServer, rejectServer) => {
    let resultResolve: (result: CallbackResult) => void;
    let resultReject: (error: Error) => void;

    const resultPromise = new Promise<CallbackResult>((resolve, reject) => {
      resultResolve = resolve;
      resultReject = reject;
    });

    const server = createServer((req, res) => {
      handleRequest(
        { port: (server.address() as { port: number }).port, provider, resolve: resultResolve!, reject: resultReject! },
        req,
        res,
      );
    });

    // Bind to 127.0.0.1 only for security, port 0 = system assigns
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };

      // Set up timeout
      const timeout = setTimeout(() => {
        resultReject!(new Error('Authentication timed out. Please try again.'));
        server.close();
      }, CONFIG.AUTH_TIMEOUT_MS);

      // When result resolves or rejects, clean up
      resultPromise.finally(() => {
        clearTimeout(timeout);
        // Give the browser a moment to receive the response
        setTimeout(() => server.close(), 500);
      });

      resolveServer({
        port: addr.port,
        result: resultPromise,
        close: () => {
          clearTimeout(timeout);
          server.close();
        },
      });
    });

    server.on('error', (err) => {
      rejectServer(err);
    });
  });
}
