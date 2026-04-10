import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { CONFIG } from '../lib/config.js';
import { getSuccessHtml, getErrorHtml } from '../html/callback.js';
import type { PaymentGrantResult } from '../lib/types.js';

/**
 * Start a local HTTP server that receives payment grant result from the web page redirect.
 * The web page redirects to: http://localhost:{port}/callback?payment_token=xxx&auto_payment=1
 */
export function startPaymentCallbackServer(): Promise<{
  port: number;
  result: Promise<PaymentGrantResult>;
  close: () => void;
}> {
  return new Promise((resolveServer, rejectServer) => {
    let resultResolve: (result: PaymentGrantResult) => void;
    let resultReject: (error: Error) => void;

    const resultPromise = new Promise<PaymentGrantResult>((resolve, reject) => {
      resultResolve = resolve;
      resultReject = reject;
    });

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const port = (server.address() as { port: number }).port;
      const url = new URL(req.url || '/', `http://localhost:${port}`);

      if (url.pathname === '/callback') {
        const paymentToken = url.searchParams.get('payment_token');
        const autoPayment = url.searchParams.get('auto_payment');

        const isAutoPayment = autoPayment === '1';

        if (paymentToken || isAutoPayment) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(getSuccessHtml());
          resultResolve!({
            payment_token: paymentToken || undefined,
            auto_payment: isAutoPayment,
          });
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(getErrorHtml('Missing payment token. Please try again.'));
          resultReject!(new Error('Callback missing payment token'));
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };

      const timeout = setTimeout(() => {
        resultReject!(new Error('Payment grant timed out. Please try again.'));
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
