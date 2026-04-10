import chalk from 'chalk';
import { loadCredentials } from '../lib/credentials.js';
import { ensureValidToken } from './helpers/ensure-token.js';

export async function tokenCommand(): Promise<void> {
  const credentials = await loadCredentials();
  if (!credentials) {
    console.error(chalk.red('Not logged in. Please run `clawapps login` first.'));
    process.exit(1);
  }

  const validated = await ensureValidToken(credentials);
  if (!validated) {
    console.error(chalk.red('Session expired and could not be refreshed. Please run `clawapps login` to re-authenticate.'));
    process.exit(1);
  }

  console.log(validated.access_token);
}
