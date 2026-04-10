import chalk from 'chalk';
import ora from 'ora';
import { loadCredentials, saveCredentials } from '../lib/credentials.js';
import { apiGet, type WrappedResponse } from '../lib/api.js';
import { CONFIG } from '../lib/config.js';
import { ensureValidToken } from './helpers/ensure-token.js';
import { createLoginCode, displayQRCode, pollAuthCode } from '../auth/qr-poll.js';
import type { AuthCodeLoginResult, UserInfo } from '../lib/types.js';

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
          console.log(chalk.gray('Session refreshed. Run `clawapps logout` first to switch accounts.'));
          return;
        }
      }
    } catch {
      // Token validation/refresh failed, continue with login
    }
  }

  // Create login code via API and display QR code
  let loginCode;
  try {
    loginCode = await createLoginCode();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(chalk.red(`\nFailed to create login code: ${message}`));
    process.exit(1);
  }

  console.log(chalk.gray('\nScan with WeChat to login:\n'));
  displayQRCode(loginCode.qr_url);
  console.log(chalk.gray(`\nOr visit: ${loginCode.qr_url}\n`));
  console.log(chalk.yellow('Waiting for QR code verification (valid for 3 minutes)...\n'));

  const spinner = ora('Waiting for authentication...').start();

  try {
    const result = await pollAuthCode<AuthCodeLoginResult>(loginCode.code, 'login');

    // Save credentials
    await saveCredentials({
      provider: 'google', // web login handles provider selection
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      logged_in_at: new Date().toISOString(),
    });

    spinner.text = 'Fetching user info...';

    const userRes = await apiGet<WrappedResponse<UserInfo>>(CONFIG.CLAW_ME, result.access_token);

    spinner.stop();

    console.log(chalk.green('\nLogin successful!'));
    console.log(chalk.gray(`Access Token: ${result.access_token}`));

    if (userRes.ok) {
      const user = userRes.data.data;
      const name = user.name || user.email || 'user';
      console.log(chalk.gray(`User: ${name}`));
      if (user.email) {
        console.log(chalk.gray(`Email: ${user.email}`));
      }
    }
  } catch (err) {
    spinner.stop();
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(chalk.red(`\nLogin failed: ${message}`));
    console.error(chalk.yellow('QR code has expired. Please run `clawapps login` to generate a new one.'));
    process.exit(1);
  }
}
