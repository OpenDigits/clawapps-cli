import { createInterface } from 'node:readline';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import { connectRelay, saveSession } from '../lib/relay-client.js';

interface ConnectOptions {
  sessionId?: string;
  timeout?: string;
}

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

export async function connectCommand(_options: ConnectOptions) {
  try {
    const creds = await resolveCredentials();
    const relay = await connectRelay(creds.access_token);

    await saveSession({ session_id: relay.sessionId, created_at: new Date().toISOString() });
    jsonOut({ event: 'session_created', session_id: relay.sessionId });
    jsonOut({ event: 'ready' });

    let shuttingDown = false;
    const cleanup = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      relay.close();
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Read commands from stdin, send to relay
    const rl = createInterface({ input: process.stdin });

    // Listen for push messages from Bridge
    void (async () => {
      for await (const msg of relay.listen()) {
        jsonOut({ event: msg.type, ...msg });
      }
    })();

    for await (const line of rl) {
      if (!line.trim()) continue;

      let cmd: { action: string; content?: string };
      try {
        cmd = JSON.parse(line);
      } catch {
        jsonOut({ event: 'error', code: 'INVALID_JSON', message: 'Invalid JSON input' });
        continue;
      }

      if (cmd.action === 'stop') {
        relay.stop();
        jsonOut({ event: 'stopped' });
      } else if (cmd.action === 'message' && cmd.content) {
        relay.send({ action: 'message', content: cmd.content });
      } else {
        jsonOut({ event: 'error', code: 'UNKNOWN_ACTION', message: `Unknown action: ${cmd.action}` });
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    jsonOut({ event: 'error', code: 'CLI_ERROR', message: msg });
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
