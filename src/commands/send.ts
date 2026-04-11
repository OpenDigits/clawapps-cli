import chalk from 'chalk';
import ora from 'ora';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import { connectRelay, saveSession } from '../lib/relay-client.js';

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
    const relay = await connectRelay(creds.access_token);

    await saveSession({ session_id: relay.sessionId, created_at: new Date().toISOString() });

    if (!isHuman) {
      process.stdout.write(JSON.stringify({ event: 'session_created', session_id: relay.sessionId }) + '\n');
    }

    const spinner = isHuman ? ora('Thinking...').start() : null;
    let fullResponse = '';
    let creditsUsed = 0;
    let balanceAfter = 0;

    for await (const msg of relay.sendMessage(message)) {
      switch (msg.type) {
        case 'assistant_text':
        case 'assistant':
          fullResponse += (msg.content as string) || (msg.text as string) || '';
          if (isHuman) {
            if (spinner?.isSpinning) spinner.stop();
          } else {
            process.stdout.write(JSON.stringify({ event: 'text', content: msg.content || msg.text }) + '\n');
          }
          break;

        case 'formatted': {
          const intro = (msg.intro as string) || '';
          if (intro && !fullResponse.includes(intro)) {
            fullResponse += intro;
            if (isHuman) {
              if (spinner?.isSpinning) spinner.stop();
            } else {
              process.stdout.write(JSON.stringify({ event: 'text', content: intro }) + '\n');
            }
          }
          if (!isHuman) {
            process.stdout.write(JSON.stringify({ event: 'formatted', mode: msg.mode, intro, ui_tree: msg.ui_tree, timing: msg.timing }) + '\n');
          }
          break;
        }

        case 'status':
        case 'log':
          if (isHuman && spinner?.isSpinning) {
            spinner.text = (msg.state || msg.level || 'processing') as string;
          } else if (!isHuman) {
            process.stdout.write(JSON.stringify({ event: msg.type, ...msg }) + '\n');
          }
          break;

        case 'mode_change':
          if (!isHuman) {
            process.stdout.write(JSON.stringify({ event: 'mode_change', mode: msg.mode, reason: msg.reason }) + '\n');
          }
          break;

        case 'complete':
          if (!isHuman) {
            process.stdout.write(JSON.stringify({ event: 'complete', success: msg.success, mode: msg.mode, usage: msg.usage }) + '\n');
          }
          break;

        case 'cost':
          creditsUsed = (msg.credits_used as number) || 0;
          balanceAfter = (msg.balance_after as number) || 0;
          if (!isHuman) {
            process.stdout.write(JSON.stringify({ event: 'cost', credits_used: creditsUsed, balance_after: balanceAfter }) + '\n');
          }
          break;

        case 'error':
          if (isHuman) {
            if (spinner?.isSpinning) spinner.fail(msg.message as string);
            console.error(chalk.red(`Error: ${msg.message}`));
          } else {
            process.stdout.write(JSON.stringify({ event: 'error', code: msg.code, message: msg.message }) + '\n');
          }
          break;
      }
    }

    spinner?.stop();
    relay.close();

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
