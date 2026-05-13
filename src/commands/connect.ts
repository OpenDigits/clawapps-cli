import { createInterface } from 'node:readline';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import { connectRelay, saveSession } from '../lib/relay-client.js';
import { pickAllowed, stripDangerous, safeErrorMessage } from '../lib/sanitize.js';

interface ConnectOptions {
  sessionId?: string;
  timeout?: string;
}

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

// C1 (2026-05-13 pentest): never spread `...msg` into stdout. Backend frames
// may carry attacker-controlled fields (forum content, role descriptions,
// agent profile text) that include prompt-injection payloads. White-list
// each relay msg.type to a known set of fields and run text through
// stripDangerous() so ANSI / invisible-Unicode / control bytes can't reach
// an upstream LLM via the agent's stdout pipe.
const RELAY_MSG_FIELDS: Record<string, readonly string[]> = {
  connected: ['session_id', 'mode'],
  assistant_text: ['content'],
  formatted: ['mode', 'intro', 'ui_tree', 'timing'],
  status: ['stage', 'detail'],
  log: ['level', 'message'],
  mode_change: ['mode', 'reason'],
  warning: ['code', 'message', 'data'],
  cost: ['credits_used', 'balance_after'],
  complete: ['success', 'mode', 'usage'],
  error: ['code', 'message'],
};

function safeRelayEvent(msg: Record<string, unknown>): Record<string, unknown> {
  const type = typeof msg.type === 'string' ? msg.type : 'unknown';
  const allowed = RELAY_MSG_FIELDS[type];
  if (!allowed) {
    // Unknown type: surface the type only, drop all attacker-controlled fields.
    return { event: stripDangerous(type) };
  }
  return { event: type, ...pickAllowed(msg, allowed as readonly (keyof typeof msg)[]) };
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

    const rl = createInterface({ input: process.stdin });

    // Track in-flight messages so stdin EOF can wait for their replies
    // (ISS-07). Each `message` action increments; each `complete`/`error`
    // event from the relay decrements.
    let pending = 0;
    type Resolver = () => void;
    let drainResolve: Resolver | null = null;

    void (async () => {
      for await (const msg of relay.listen()) {
        jsonOut(safeRelayEvent(msg));
        if (msg.type === 'complete' || msg.type === 'error') {
          if (pending > 0) pending -= 1;
          if (pending === 0) {
            // Use a typed temp + cast to dodge inner-closure narrowing loss.
            const r = drainResolve as Resolver | null;
            drainResolve = null;
            if (r !== null) (r as Resolver)();
          }
        }
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
        pending += 1;
        relay.send({ action: 'message', content: cmd.content });
      } else {
        jsonOut({ event: 'error', code: 'UNKNOWN_ACTION', message: `Unknown action: ${cmd.action}` });
      }
    }

    // ISS-06 + ISS-07 fix: stdin EOF → wait for any pending message to
    // complete (≤ 120s grace), then close.
    if (pending > 0) {
      await Promise.race([
        new Promise<void>((resolve) => { drainResolve = resolve as Resolver; }),
        new Promise<void>((resolve) => setTimeout(resolve, 120_000)),
      ]);
    }
    cleanup();
  } catch (err: unknown) {
    const msg = safeErrorMessage(err);
    jsonOut({ event: 'error', code: 'CLI_ERROR', message: msg });
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
