import chalk from 'chalk';
import ora from 'ora';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import {
  createSession,
  sendMessage,
  saveSession,
  getLastSessionId,
} from '../lib/relay-client.js';

interface SendOptions {
  sessionId?: string;
  newSession?: boolean;
  human?: boolean;
  timeout?: string;
}

export async function sendCommand(message: string, options: SendOptions) {
  const isHuman = !!options.human;

  try {
    const creds = await resolveCredentials();
    const token = creds.access_token;

    // Resolve session
    let sessionId: string;

    if (options.sessionId) {
      sessionId = options.sessionId;
    } else if (options.newSession) {
      const session = await createSession(token);
      sessionId = session.session_id;
      await saveSession({ session_id: sessionId, created_at: new Date().toISOString() });
    } else {
      const lastId = await getLastSessionId();
      if (lastId) {
        sessionId = lastId;
      } else {
        const session = await createSession(token);
        sessionId = session.session_id;
        await saveSession({ session_id: sessionId, created_at: new Date().toISOString() });
      }
    }

    if (!isHuman) {
      process.stdout.write(JSON.stringify({ event: 'session_created', session_id: sessionId }) + '\n');
    }

    // Send message and collect response
    const spinner = isHuman ? ora('Thinking...').start() : null;
    let fullResponse = '';
    let creditsUsed = 0;
    let balanceAfter = 0;

    for await (const evt of sendMessage(token, sessionId, message)) {
      switch (evt.event) {
        case 'text':
          fullResponse += (evt.data.content as string) || '';
          if (isHuman) {
            if (spinner?.isSpinning) spinner.stop();
          } else {
            process.stdout.write(JSON.stringify({ event: 'text', content: evt.data.content }) + '\n');
          }
          break;

        case 'status':
        case 'log':
          if (isHuman && spinner?.isSpinning) {
            spinner.text = (evt.data.state || evt.data.level || 'processing') as string;
          } else if (!isHuman) {
            process.stdout.write(JSON.stringify({ event: evt.event, ...evt.data }) + '\n');
          }
          break;

        case 'formatted':
          // Agent mode: forward structured data
          if (!isHuman) {
            process.stdout.write(JSON.stringify({ event: 'formatted', ...evt.data }) + '\n');
          }
          break;

        case 'mode_change':
          if (!isHuman) {
            process.stdout.write(JSON.stringify({ event: 'mode_change', ...evt.data }) + '\n');
          }
          break;

        case 'complete':
          if (!isHuman) {
            process.stdout.write(JSON.stringify({ event: 'complete', ...evt.data }) + '\n');
          }
          break;

        case 'cost':
          creditsUsed = (evt.data.credits_used as number) || 0;
          balanceAfter = (evt.data.balance_after as number) || 0;
          if (!isHuman) {
            process.stdout.write(JSON.stringify({ event: 'cost', ...evt.data }) + '\n');
          }
          break;

        case 'error':
          if (isHuman) {
            if (spinner?.isSpinning) spinner.fail(evt.data.message as string);
            console.error(chalk.red(`Error: ${evt.data.message}`));
          } else {
            process.stdout.write(JSON.stringify({ event: 'error', ...evt.data }) + '\n');
          }
          break;
      }
    }

    if (spinner?.isSpinning) spinner.stop();

    if (isHuman && fullResponse) {
      console.log(fullResponse);
      if (creditsUsed > 0) {
        console.log(chalk.gray(`\n[Credits used: ${creditsUsed} | Balance: ${balanceAfter}]`));
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isHuman) {
      console.error(chalk.red(msg));
    } else {
      process.stdout.write(JSON.stringify({ event: 'error', code: 'CLI_ERROR', message: msg }) + '\n');
    }
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
