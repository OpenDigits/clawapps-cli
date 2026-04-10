import chalk from 'chalk';
import ora from 'ora';
import qrcode from 'qrcode-terminal';
import { saveCredentials, loadCredentials } from '../lib/credentials.js';
import { CONFIG } from '../lib/config.js';
import { getBalance } from '../lib/relay-client.js';

function relayUrl(path: string): string {
  const base = process.env.CLAWAPPS_RELAY_URL || CONFIG.CLI_RELAY_BASE;
  return `${base}${path}`;
}

export async function loginCommand(): Promise<void> {
  // Check if already logged in
  const existing = await loadCredentials();
  if (existing) {
    try {
      const balance = await getBalance(existing.access_token);
      console.log(chalk.green(`Already logged in as ${chalk.bold(balance.display_name || 'user')}.`));
      console.log(chalk.gray('Run `clawapps logout` first to switch accounts.'));
      return;
    } catch {
      // Token invalid, continue with login
    }
  }

  // Create login code via Relay
  let loginCode: { code: string; expires_at: string; qr_url: string };
  try {
    const res = await fetch(relayUrl('/auth/login-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) throw new Error(`Failed to create login code (${res.status})`);
    loginCode = await res.json() as typeof loginCode;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Failed to create login code: ${msg}`));
    process.exit(1);
  }

  // Display QR code
  console.log(chalk.gray('\nScan with WeChat to login:\n'));
  qrcode.generate(loginCode.qr_url, { small: true }, (code: string) => {
    console.log(code);
  });
  console.log(chalk.gray(`\nOr visit: ${loginCode.qr_url}\n`));
  console.log(chalk.yellow('Waiting for WeChat verification (valid for 3 minutes)...\n'));

  // Poll for verification
  const spinner = ora('Waiting for authentication...').start();
  const pollInterval = 3000;
  const timeout = 180000;
  const startTime = Date.now();

  try {
    while (Date.now() - startTime < timeout) {
      await new Promise(r => setTimeout(r, pollInterval));

      const res = await fetch(relayUrl(`/auth/poll?code=${encodeURIComponent(loginCode.code)}`));
      const data = await res.json() as { code: number; message: string; data?: { access_token: string; refresh_token: string; display_name?: string } };

      if (data.code === 0 && data.data?.access_token) {
        // Login successful
        await saveCredentials({
          provider: 'wechat',
          access_token: data.data.access_token,
          refresh_token: data.data.refresh_token,
          logged_in_at: new Date().toISOString(),
        });

        spinner.stop();
        console.log(chalk.green('\nLogin successful!'));
        if (data.data.display_name) {
          console.log(chalk.gray(`User: ${data.data.display_name}`));
        }
        return;
      }

      if (data.code === 4008) {
        spinner.stop();
        console.error(chalk.red('\nQR code expired. Run `clawapps login` to try again.'));
        process.exit(1);
      }

      // code 4013 = waiting for verification, keep polling
    }

    spinner.stop();
    console.error(chalk.red('\nLogin timed out. Run `clawapps login` to try again.'));
    process.exit(1);
  } catch (err) {
    spinner.stop();
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\nLogin failed: ${msg}`));
    process.exit(1);
  }
}
