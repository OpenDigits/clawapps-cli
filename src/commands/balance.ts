import chalk from 'chalk';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getBalance } from '../lib/relay-client.js';

export async function balanceCommand(options: { human?: boolean }) {
  try {
    const creds = await resolveCredentials();
    const balance = await getBalance(creds.access_token);

    if (options.human) {
      console.log(chalk.bold('Account Balance'));
      console.log(`  Credits:    ${chalk.green(String(balance.credits))}`);
      console.log(`  Membership: ${balance.membership}`);
      if (balance.display_name) {
        console.log(`  Name:       ${balance.display_name}`);
      }
    } else {
      process.stdout.write(JSON.stringify(balance) + '\n');
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (options.human) {
      console.error(chalk.red(msg));
    } else {
      process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    }
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
