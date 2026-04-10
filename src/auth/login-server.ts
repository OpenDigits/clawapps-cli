import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { CONFIG } from '../lib/config.js';
import { getSuccessHtml, getErrorHtml } from '../html/callback.js';
import type { ClawTokens } from '../lib/types.js';

/**
 * Start a local HTTP server that receives ClawApps tokens from the web login page redirect.
 * The web page redirects to: http://localhost:{port}/callback?access_token=xxx&refresh_token=xxx
 */
export function startLoginCallbackServer(): Promise<{
  port: number;
  result: Promise<ClawTokens>;
  close: () => void;
}> {
  return new Promise((resolveServer, rejectServer) => {
    let resultResolve: (tokens: ClawTokens) => void;
    let resultReject: (error: Error) => void;

    const resultPromise = new Promise<ClawTokens>((resolve, reject) => {
      resultResolve = resolve;
      resultReject = reject;
    });

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const port = (server.address() as { port: number }).port;
      const url = new URL(req.url || '/', `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const accessToken = url.searchParams.get('access_token');
        const refreshToken = url.searchParams.get('refresh_token');

        if (accessToken && refreshToken) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(getSuccessHtml());
          resultResolve!({ access_token: accessToken, refresh_token: refreshToken });
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(getErrorHtml('Missing tokens. Please try again.'));
          resultReject!(new Error('Callback missing tokens'));
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };

      const timeout = setTimeout(() => {
        resultReject!(new Error('Authentication timed out. Please try again.'));
        server.close();
      }, CONFIG.AUTH_TIMEOUT_MS);

      resultPromise.finally(() => {
        clearTimeout(timeout);
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
