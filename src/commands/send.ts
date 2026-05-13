import { resolveCredentials } from './helpers/resolve-credentials.js';
import { connectRelay, saveSession } from '../lib/relay-client.js';
import { stripDangerous, safeErrorMessage } from '../lib/sanitize.js';

interface SendOptions {
  sessionId?: string;
  newSession?: boolean;
  timeout?: string;
}

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// C1 (2026-05-13 pentest): backend-controlled text → upstream LLM. Every
// string we forward from `msg` goes through stripDangerous() to defang
// ANSI / control bytes / invisible Unicode / RTL override before it lands
// on stdout, which an automated AI agent will pipe to its model.
function s(v: unknown): string {
  return typeof v === 'string' ? stripDangerous(v) : '';
}

export async function sendCommand(message: string, options: SendOptions) {
  try {
    const creds = await resolveCredentials();
    const relay = await connectRelay(creds.access_token, { forceNewSession: options.newSession === true });

    await saveSession({ session_id: relay.sessionId, created_at: new Date().toISOString() });
    jsonOut({ event: 'session_created', session_id: relay.sessionId });

    let serverError: { code?: string; message?: string } | null = null;

    for await (const msg of relay.sendMessage(message)) {
      switch (msg.type) {
        case 'assistant_text':
          jsonOut({ event: 'text', content: s(msg.content) });
          break;

        case 'formatted': {
          const intro = s(msg.intro);
          if (intro) jsonOut({ event: 'text', content: intro });
          // ui_tree is a structured tree — leave nested values as-is; the
          // dangerous-string scan would have to recurse and we don't yet
          // have a per-node schema. Frontends should treat ui_tree string
          // leaves as untrusted and sanitize at render time.
          jsonOut({ event: 'formatted', mode: s(msg.mode), intro, ui_tree: msg.ui_tree, timing: msg.timing });
          break;
        }

        case 'status':
          jsonOut({ event: 'status', stage: s((msg as Record<string, unknown>).stage), detail: s((msg as Record<string, unknown>).detail) });
          break;
        case 'log':
          jsonOut({ event: 'log', level: s((msg as Record<string, unknown>).level), message: s((msg as Record<string, unknown>).message) });
          break;

        case 'mode_change':
          jsonOut({ event: 'mode_change', mode: s(msg.mode), reason: s(msg.reason) });
          break;

        case 'warning':
          // R-35: surfaced when /consume returns non-200 (e.g.
          // CONCURRENT_CHATS_EXCEEDED, INSUFFICIENT_CREDITS). Pass
          // through code/message/data so callers can render or act.
          jsonOut({ event: 'warning', code: s(msg.code), message: s(msg.message), data: msg.data });
          break;

        case 'complete':
          jsonOut({ event: 'complete', success: msg.success === true, mode: s(msg.mode), usage: msg.usage });
          break;

        case 'cost':
          jsonOut({
            event: 'cost',
            credits_used: (msg.credits_used as number) || 0,
            balance_after: (msg.balance_after as number) || 0,
          });
          break;

        case 'error':
          jsonOut({ event: 'error', code: s(msg.code), message: s(msg.message) });
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
    const msg = safeErrorMessage(err);
    jsonOut({ event: 'error', code: 'CLI_ERROR', message: msg });
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
