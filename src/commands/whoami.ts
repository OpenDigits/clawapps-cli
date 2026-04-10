import chalk from 'chalk';
import ora from 'ora';
import { loadCredentials, saveCredentials } from '../lib/credentials.js';
import { apiGet, apiPost, type WrappedResponse } from '../lib/api.js';
import { CONFIG } from '../lib/config.js';
import type { ClawTokens, UserInfo } from '../lib/types.js';

export async function whoamiCommand(): Promise<void> {
  const credentials = await loadCredentials();

  if (!credentials) {
    console.log(chalk.yellow('Not logged in. Run `clawapps login` first.'));
    process.exit(1);
  }

  const spinner = ora('Fetching user info...').start();

  try {
    let res = await apiGet<WrappedResponse<UserInfo>>(CONFIG.CLAW_ME, credentials.access_token);

    // If 401, try refreshing the token
    if (res.status === 401) {
      spinner.text = 'Refreshing token...';

      const refreshRes = await apiPost<WrappedResponse<ClawTokens>>(CONFIG.CLAW_REFRESH, {
        refresh_token: credentials.refresh_token,
      });

      if (!refreshRes.ok) {
        spinner.stop();
        console.log(chalk.red('Session expired. Please run `clawapps login` again.'));
        process.exit(1);
      }

      const newTokens = refreshRes.data.data;

      // Update stored credentials
      await saveCredentials({
        ...credentials,
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
      });

      // Retry with new token
      res = await apiGet<WrappedResponse<UserInfo>>(CONFIG.CLAW_ME, newTokens.access_token);
    }

    spinner.stop();

    if (!res.ok) {
      console.log(chalk.red('Failed to fetch user info. Please run `clawapps login` again.'));
      process.exit(1);
    }

    const user = res.data.data;
    console.log(chalk.bold('ClawApps Account'));
    console.log('─'.repeat(30));
    if (user.name) console.log(`Name:     ${user.name}`);
    if (user.email) console.log(`Email:    ${user.email}`);
    if (user.id) console.log(`ID:       ${user.id}`);
    console.log(`Provider: ${credentials.provider}`);
  } catch (err) {
    spinner.stop();
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}
