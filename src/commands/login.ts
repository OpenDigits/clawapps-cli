import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import { loadCredentials, saveCredentials } from '../lib/credentials.js';
import { apiGet, type WrappedResponse } from '../lib/api.js';
import { CONFIG } from '../lib/config.js';
import { startLoginCallbackServer } from '../auth/login-server.js';
import { ensureValidToken } from './helpers/ensure-token.js';
import type { UserInfo } from '../lib/types.js';

export async function loginCommand(): Promise<void> {
  // Check if already logged in, refresh token if needed
  const existing = await loadCredentials();
  if (existing) {
    try {
      const validated = await ensureValidToken(existing);
      if (validated) {
        const res = await apiGet<WrappedResponse<UserInfo>>(CONFIG.CLAW_ME, validated.access_token);
        if (res.ok) {
          const user = res.data.data;
          console.log(chalk.green(`Already logged in as ${chalk.bold(user.email || user.name || 'user')}.`));
          console.log(chalk.gray('Session refreshed. Run `claw logout` first to switch accounts.'));
          return;
        }
      }
    } catch {
      // Token validation/refresh failed, continue with browser login
    }
  }

  // Start local callback server to receive tokens from web
  const { port, result, close } = await startLoginCallbackServer();
  const callbackUrl = `http://localhost:${port}/callback`;

  // Open web login page with callback
  const loginUrl = `${CONFIG.CLAW_WEB_BASE}/login?callback=${encodeURIComponent(callbackUrl)}`;

  console.log(chalk.gray('\nOpening browser for login...'));
  console.log(chalk.gray(`If the browser doesn't open, visit:\n${loginUrl}\n`));

  try {
    await open(loginUrl);
  } catch {
    console.log(chalk.yellow('Could not open browser automatically.'));
    console.log(chalk.yellow('Please open the URL above manually.'));
  }

  const spinner = ora('Waiting for authentication...').start();

  try {
    const tokens = await result;

    // Save credentials
    await saveCredentials({
      provider: 'google', // web login handles provider selection
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      logged_in_at: new Date().toISOString(),
    });

    spinner.text = 'Fetching user info...';

    const userRes = await apiGet<WrappedResponse<UserInfo>>(CONFIG.CLAW_ME, tokens.access_token);

    spinner.stop();

    if (userRes.ok) {
      const user = userRes.data.data;
      const name = user.name || user.email || 'user';
      console.log(chalk.green(`\nLogged in as ${chalk.bold(name)}`));
      if (user.email) {
        console.log(chalk.gray(`Email: ${user.email}`));
      }
    } else {
      console.log(chalk.green('\nLogin successful!'));
      console.log(chalk.gray('Run `claw whoami` to see your account info.'));
    }
  } catch (err) {
    spinner.stop();
    close();
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(chalk.red(`\nLogin failed: ${message}`));
    process.exit(1);
  }
}
