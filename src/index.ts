import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { loginCodeCommand } from './commands/login-code.js';
import { loginPollCommand } from './commands/login-poll.js';
import { logoutCommand } from './commands/logout.js';
import { connectCommand } from './commands/connect.js';
import { sendCommand } from './commands/send.js';
import { sessionsCommand } from './commands/sessions.js';
import { balanceCommand } from './commands/balance.js';

const program = new Command();

program
  .name('clawapps')
  .description('ClawApps CLI - AI agent platform client')
  .version('0.6.0');

// Auth
program
  .command('login')
  .description('Log in via WeChat QR code (interactive)')
  .option('--json', 'Output as JSON')
  .action(loginCommand);

program
  .command('login-code')
  .description('Create login code and QR image (non-blocking, for AI agents)')
  .action(loginCodeCommand);

program
  .command('login-poll')
  .description('Poll for login verification (for AI agents)')
  .argument('<code>', 'Login code from login-code command')
  .action(loginPollCommand);

program
  .command('logout')
  .description('Log out and clear local credentials')
  .action(logoutCommand);

// Agent workspace
program
  .command('connect')
  .description('Connect to agent workspace (persistent session)')
  .option('--session-id <id>', 'Resume a specific session')
  .option('--json', 'JSON I/O mode (NDJSON stdin/stdout)')
  .option('--timeout <ms>', 'Connection timeout in milliseconds')
  .action(connectCommand);

program
  .command('send')
  .description('Send a message to agent workspace')
  .argument('<message>', 'Message to send')
  .option('--session-id <id>', 'Use a specific session')
  .option('--new-session', 'Force create a new session')
  .option('--json', 'Output as JSON')
  .option('--timeout <ms>', 'Response timeout in milliseconds')
  .action(sendCommand);

program
  .command('sessions')
  .description('List or manage workspace sessions')
  .option('--clear', 'Clear session history')
  .option('--json', 'Output as JSON')
  .action(sessionsCommand);

program
  .command('balance')
  .description('Check credit balance')
  .option('--json', 'Output as JSON')
  .action(balanceCommand);

program.parse();
