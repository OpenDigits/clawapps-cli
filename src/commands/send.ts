import { resolveCredentials } from './helpers/resolve-credentials.js';
import { connectRelay, saveSession } from '../lib/relay-client.js';

interface SendOptions {
  sessionId?: string;
  newSession?: boolean;
  timeout?: string;
}

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

export async function sendCommand(message: string, _options: SendOptions) {
  try {
    const creds = await resolveCredentials();
    const relay = await connectRelay(creds.access_token);

    await saveSession({ session_id: relay.sessionId, created_at: new Date().toISOString() });
    jsonOut({ event: 'session_created', session_id: relay.sessionId });

    let serverError: { code?: string; message?: string } | null = null;

    for await (const msg of relay.sendMessage(message)) {
      switch (msg.type) {
        case 'assistant_text':
          jsonOut({ event: 'text', content: msg.content });
          break;

        case 'formatted': {
          const intro = (msg.intro as string) || '';
          if (intro) jsonOut({ event: 'text', content: intro });
          jsonOut({ event: 'formatted', mode: msg.mode, intro, ui_tree: msg.ui_tree, timing: msg.timing });
          break;
        }

        case 'status':
        case 'log':
          jsonOut({ event: msg.type, ...msg });
          break;

        case 'mode_change':
          jsonOut({ event: 'mode_change', mode: msg.mode, reason: msg.reason });
          break;

        case 'warning':
          // R-35: surfaced when /consume returns non-200 (e.g.
          // CONCURRENT_CHATS_EXCEEDED, INSUFFICIENT_CREDITS). Pass
          // through code/message/data so callers can render or act.
          jsonOut({ event: 'warning', code: msg.code, message: msg.message, data: msg.data });
          break;

        case 'complete':
          jsonOut({ event: 'complete', success: msg.success, mode: msg.mode, usage: msg.usage });
          break;

        case 'cost':
          jsonOut({
            event: 'cost',
            credits_used: (msg.credits_used as number) || 0,
            balance_after: (msg.balance_after as number) || 0,
          });
          break;

        case 'error':
          jsonOut({ event: 'error', code: msg.code, message: msg.message });
          // Remember the first error so we can exit non-zero after the loop.
          // (Fix ISS-04: a one-shot send that ended in a server error must
          // not exit 0 — script callers need a signal.)
          if (!serverError) {
            serverError = {
              code: typeof msg.code === 'string' ? msg.code : undefined,
              message: typeof msg.message === 'string' ? msg.message : undefined,
            };
          }
          break;
      }
    }

    relay.close();

    if (serverError) {
      // 4 = INSUFFICIENT_CREDITS, 2 = AUTH, 1 = generic
      const code = serverError.code || '';
      if (code === 'INSUFFICIENT_CREDITS') process.exit(4);
      if (code === 'AUTH_EXPIRED' || code === 'AUTH_REQUIRED') process.exit(2);
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    jsonOut({ event: 'error', code: 'CLI_ERROR', message: msg });
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
