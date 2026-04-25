import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { connectCommand } from './commands/connect.js';
import { sendCommand } from './commands/send.js';
import { sessionsCommand } from './commands/sessions.js';
import { balanceCommand } from './commands/balance.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('clawapps')
  .description('ClawApps CLI - AI agent platform client')
  .version(pkg.version);

program
  .command('login')
  .description('Log in via WeChat or WhatsApp')
  .option('--wechat', 'Log in via WeChat')
  .option('--whatsapp', 'Log in via WhatsApp')
  .action(loginCommand);

program
  .command('logout')
  .description('Log out and clear local credentials')
  .action(logoutCommand);

program
  .command('connect')
  .description('Connect to agent workspace (persistent session)')
  .option('--session-id <id>', 'Resume a specific session')
  .option('--timeout <ms>', 'Connection timeout in milliseconds')
  .action(connectCommand);

program
  .command('send')
  .description('Send a message to agent workspace')
  .argument('<message>', 'Message to send')
  .option('--session-id <id>', 'Use a specific session')
  .option('--new-session', 'Force create a new session')
  .option('--timeout <ms>', 'Response timeout in milliseconds')
  .action(sendCommand);

program
  .command('sessions')
  .description('List or manage workspace sessions')
  .option('--clear', 'Clear session history')
  .action(sessionsCommand);

program
  .command('balance')
  .description('Check credit balance')
  .action(balanceCommand);

program.parse();
