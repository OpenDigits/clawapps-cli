import chalk from 'chalk';
import open from 'open';
import { loadCredentials } from '../lib/credentials.js';
import { CONFIG } from '../lib/config.js';
import { ensureValidToken } from './helpers/ensure-token.js';

export async function membershipCommand(): Promise<void> {
  const credentials = await loadCredentials();

  if (!credentials) {
    console.log(chalk.yellow('Not logged in. Run `clawapps login` first.'));
    process.exit(1);
  }

  const token = await ensureValidToken(credentials);
  if (!token) {
    console.log(chalk.red('Session expired. Please run `clawapps login` again.'));
    process.exit(1);
  }

  const url = `${CONFIG.CLAW_WEB_BASE}/membership?access_token=${encodeURIComponent(token.access_token)}&refresh_token=${encodeURIComponent(token.refresh_token)}`;

  console.log(chalk.gray('Opening membership subscription page...'));

  try {
    await open(url);
    console.log(chalk.green('Page opened in your browser.'));
  } catch {
    console.log(chalk.yellow('Could not open browser automatically.'));
    console.log(chalk.gray(`Please open this URL manually:\n${url}`));
  }
}
