import chalk from 'chalk';
import { createInterface } from 'node:readline';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import { connectRelay, saveSession, type RelayConnection } from '../lib/relay-client.js';

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
    const relay = await connectRelay(creds.access_token);

    await saveSession({ session_id: relay.sessionId, created_at: new Date().toISOString() });

    if (isHuman) {
      console.log(chalk.green(`Connected to session: ${relay.sessionId}`));
      console.log(chalk.gray('Type your message and press Enter. Use Ctrl+C to exit.\n'));
    } else {
      jsonOut({ event: 'session_created', session_id: relay.sessionId });
      jsonOut({ event: 'ready' });
    }

    // Graceful shutdown
    let shuttingDown = false;
    const cleanup = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      relay.close();
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    if (isHuman) {
      await interactiveMode(relay);
    } else {
      await jsonMode(relay);
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

async function jsonMode(relay: RelayConnection) {
  // Read commands from stdin, send to relay
  const rl = createInterface({ input: process.stdin });

  // Also listen for push messages from Bridge
  const pushListener = (async () => {
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
      // Responses come through the pushListener
    } else {
      jsonOut({ event: 'error', code: 'UNKNOWN_ACTION', message: `Unknown action: ${cmd.action}` });
    }
  }
}

async function interactiveMode(relay: RelayConnection) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: chalk.cyan('> '),
  });

  // Listen for Bridge messages and display them
  const pushListener = (async () => {
    for await (const msg of relay.listen()) {
      switch (msg.type) {
        case 'assistant_text':
        case 'assistant':
          process.stdout.write(String(msg.content || msg.text || ''));
          break;
        case 'formatted':
          if (msg.intro) process.stdout.write(String(msg.intro));
          break;
        case 'complete':
          process.stdout.write('\n');
          rl.prompt();
          break;
        case 'cost': {
          const used = msg.credits_used as number;
          const after = msg.balance_after as number;
          if (used > 0) console.log(chalk.gray(`[Credits: -${used} | Balance: ${after}]`));
          break;
        }
        case 'error':
          console.error(chalk.red(`Error: ${msg.message}`));
          rl.prompt();
          break;
      }
    }
  })();

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) { rl.prompt(); continue; }
    if (input.toLowerCase() === '/quit' || input.toLowerCase() === '/exit') break;

    if (input.toLowerCase() === '/stop') {
      relay.stop();
      console.log(chalk.yellow('Stopped.'));
      rl.prompt();
      continue;
    }

    relay.send({ action: 'message', content: input });
    // Response comes through pushListener
  }

  relay.close();
}
