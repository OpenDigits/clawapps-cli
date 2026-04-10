import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { tokenCommand } from './commands/token.js';
import { paymentGrantCommand } from './commands/payment-grant.js';
import { rechargeCreditsCommand } from './commands/recharge-credits.js';
import { subscribeCommand } from './commands/subscribe.js';
import { connectCommand } from './commands/connect.js';
import { sendCommand } from './commands/send.js';
import { sessionsCommand } from './commands/sessions.js';
import { balanceCommand } from './commands/balance.js';

const program = new Command();

program
  .name('clawapps')
  .description('ClawApps CLI - AI agent platform client')
  .version('0.6.0');

program
  .command('login')
  .description('Log in via WeChat QR code (scan to authenticate, valid for 3 minutes)')
  .action(loginCommand);

program
  .command('logout')
  .description('Log out of your ClawApps account')
  .action(logoutCommand);

program
  .command('whoami')
  .description('Show your ClawApps account info')
  .action(whoamiCommand);

program
  .command('token')
  .description('Print valid access token (auto-refreshes if expired)')
  .action(tokenCommand);

program
  .command('payment-grant')
  .description('Authorize skill payment via QR code (valid for 3 minutes)')
  .argument('<skill_id>', 'The skill ID to grant payment for')
  .action(paymentGrantCommand);

program
  .command('recharge-credits')
  .description('Display QR code to recharge credits')
  .action(rechargeCreditsCommand);

program
  .command('subscribe')
  .description('Display QR code to subscribe membership')
  .action(subscribeCommand);

// Channel C: AI agent commands
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
