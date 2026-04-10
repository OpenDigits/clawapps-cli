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
  json?: boolean;
  timeout?: string;
}

export async function sendCommand(message: string, options: SendOptions) {
  const isJson = !!options.json;

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
      // Try to reuse last session, fall back to new
      const lastId = await getLastSessionId();
      if (lastId) {
        sessionId = lastId;
      } else {
        const session = await createSession(token);
        sessionId = session.session_id;
        await saveSession({ session_id: sessionId, created_at: new Date().toISOString() });
      }
    }

    if (isJson) {
      process.stdout.write(JSON.stringify({ event: 'session_created', session_id: sessionId }) + '\n');
    }

    // Send message and collect response
    const spinner = isJson ? null : ora('Thinking...').start();
    let fullResponse = '';
    let usage: Record<string, unknown> | null = null;
    let creditsUsed = 0;
    let balanceAfter = 0;

    for await (const evt of sendMessage(token, sessionId, message)) {
      switch (evt.event) {
        case 'text':
          fullResponse += (evt.data.content as string) || '';
          if (isJson) {
            process.stdout.write(JSON.stringify({ event: 'text', content: evt.data.content }) + '\n');
          } else if (spinner?.isSpinning) {
            spinner.stop();
          }
          break;

        case 'status':
        case 'log':
          if (spinner?.isSpinning) {
            const state = (evt.data.state || evt.data.level || 'processing') as string;
            spinner.text = state;
          }
          if (isJson) {
            process.stdout.write(JSON.stringify({ event: evt.event, ...evt.data }) + '\n');
          }
          break;

        case 'mode_change':
          if (isJson) {
            process.stdout.write(JSON.stringify({ event: 'mode_change', ...evt.data }) + '\n');
          }
          break;

        case 'complete':
          usage = (evt.data.usage as Record<string, unknown>) || null;
          if (isJson) {
            process.stdout.write(JSON.stringify({ event: 'complete', ...evt.data }) + '\n');
          }
          break;

        case 'cost':
          creditsUsed = (evt.data.credits_used as number) || 0;
          balanceAfter = (evt.data.balance_after as number) || 0;
          if (isJson) {
            process.stdout.write(JSON.stringify({ event: 'cost', ...evt.data }) + '\n');
          }
          break;

        case 'error':
          if (spinner?.isSpinning) spinner.fail(evt.data.message as string);
          if (isJson) {
            process.stdout.write(JSON.stringify({ event: 'error', ...evt.data }) + '\n');
          } else {
            console.error(chalk.red(`Error: ${evt.data.message}`));
          }
          break;
      }
    }

    if (spinner?.isSpinning) spinner.stop();

    if (!isJson && fullResponse) {
      console.log(fullResponse);
      if (creditsUsed > 0) {
        console.log(chalk.gray(`\n[Credits used: ${creditsUsed} | Balance: ${balanceAfter}]`));
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isJson) {
      process.stdout.write(JSON.stringify({ event: 'error', code: 'CLI_ERROR', message: msg }) + '\n');
    } else {
      console.error(chalk.red(msg));
    }
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
