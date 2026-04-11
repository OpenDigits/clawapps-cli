import chalk from 'chalk';
import { createInterface } from 'node:readline';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import {
  createSession,
  sendMessage,
  stopProcessing,
  closeSession,
  saveSession,
} from '../lib/relay-client.js';

interface ConnectOptions {
  sessionId?: string;
  human?: boolean;
  timeout?: string;
}

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

export async function connectCommand(options: ConnectOptions) {
  const isHuman = !!options.human;

  try {
    const creds = await resolveCredentials();
    const token = creds.access_token;

    let sessionId: string;
    if (options.sessionId) {
      sessionId = options.sessionId;
    } else {
      const session = await createSession(token);
      sessionId = session.session_id;
      await saveSession({ session_id: sessionId, created_at: new Date().toISOString() });
    }

    if (isHuman) {
      console.log(chalk.green(`Connected to session: ${sessionId}`));
      console.log(chalk.gray('Type your message and press Enter. Use Ctrl+C to exit.\n'));
    } else {
      jsonOut({ event: 'session_created', session_id: sessionId });
      jsonOut({ event: 'ready' });
    }

    let shuttingDown = false;
    const cleanup = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      try { await closeSession(token, sessionId); } catch { /* ignore */ }
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    if (isHuman) {
      await interactiveMode(token, sessionId);
    } else {
      await jsonMode(token, sessionId);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isHuman) {
      console.error(chalk.red(msg));
    } else {
      jsonOut({ event: 'error', code: 'CLI_ERROR', message: msg });
    }
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}

async function jsonMode(token: string, sessionId: string) {
  const rl = createInterface({ input: process.stdin });

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
      await stopProcessing(token, sessionId).catch(() => {});
      jsonOut({ event: 'stopped' });
      continue;
    }

    if (cmd.action === 'message' && cmd.content) {
      for await (const evt of sendMessage(token, sessionId, cmd.content)) {
        jsonOut({ event: evt.event, ...evt.data });
      }
      continue;
    }

    jsonOut({ event: 'error', code: 'UNKNOWN_ACTION', message: `Unknown action: ${cmd.action}` });
  }
}

async function interactiveMode(token: string, sessionId: string) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: chalk.cyan('> '),
  });

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }
    if (input.toLowerCase() === '/quit' || input.toLowerCase() === '/exit') break;

    if (input.toLowerCase() === '/stop') {
      await stopProcessing(token, sessionId).catch(() => {});
      console.log(chalk.yellow('Stopped.'));
      rl.prompt();
      continue;
    }

    try {
      for await (const evt of sendMessage(token, sessionId, input)) {
        switch (evt.event) {
          case 'text':
            process.stdout.write(String(evt.data.content || ''));
            break;
          case 'complete':
            process.stdout.write('\n');
            break;
          case 'cost': {
            const used = evt.data.credits_used as number;
            const after = evt.data.balance_after as number;
            if (used > 0) console.log(chalk.gray(`[Credits: -${used} | Balance: ${after}]`));
            break;
          }
          case 'error':
            console.error(chalk.red(`Error: ${evt.data.message}`));
            break;
        }
      }
    } catch (err: unknown) {
      console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    }

    rl.prompt();
  }
}
