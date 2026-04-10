import chalk from 'chalk';
import { clearCredentials } from '../lib/credentials.js';
import { clearSessions } from '../lib/relay-client.js';

export async function logoutCommand(): Promise<void> {
  await clearCredentials();
  await clearSessions();
  console.log(chalk.green('Logged out successfully.'));
}
