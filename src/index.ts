import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { creditCommand } from './commands/credit.js';
import { membershipCommand } from './commands/membership.js';
import { tokenCommand } from './commands/token.js';

const program = new Command();

program
  .name('claw')
  .description('ClawApps CLI - Manage your ClawApps account')
  .version('0.1.0');

program
  .command('login')
  .description('Log in to your ClawApps account via Google or Apple')
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
  .command('credit')
  .description('Open credit recharge page in browser')
  .action(creditCommand);

program
  .command('membership')
  .description('Open membership subscription page in browser')
  .action(membershipCommand);

program
  .command('token')
  .description('Print current valid access token (refreshes if needed)')
  .action(tokenCommand);

program.parse();
