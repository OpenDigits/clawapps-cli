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

    for await (const msg of relay.sendMessage(message)) {
      switch (msg.type) {
        case 'assistant_text':
        case 'assistant':
          jsonOut({ event: 'text', content: msg.content || msg.text });
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
          break;
      }
    }

    relay.close();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    jsonOut({ event: 'error', code: 'CLI_ERROR', message: msg });
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
