import chalk from 'chalk';
import ora from 'ora';
import { loadCredentials, clearCredentials } from '../lib/credentials.js';
import { apiPost } from '../lib/api.js';
import { CONFIG } from '../lib/config.js';

export async function logoutCommand(): Promise<void> {
  const credentials = await loadCredentials();

  if (!credentials) {
    console.log(chalk.yellow('Not logged in.'));
    return;
  }

  const spinner = ora('Logging out...').start();

  try {
    // Call server-side logout
    await apiPost(
      CONFIG.CLAW_LOGOUT,
      { refresh_token: credentials.refresh_token },
      credentials.access_token,
    );
  } catch {
    // Ignore API errors — we still clear local credentials
  }

  await clearCredentials();
  spinner.stop();

  console.log(chalk.green('Logged out successfully.'));
}
