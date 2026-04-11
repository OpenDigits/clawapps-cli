import chalk from 'chalk';
import ora from 'ora';
import qrcode from 'qrcode-terminal';
import { loadCredentials } from '../lib/credentials.js';
import { getBalance } from '../lib/relay-client.js';
import { createLoginCode, pollLoginCode } from '../lib/login-service.js';

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

export async function loginCommand(options: { json?: boolean }): Promise<void> {
  const isJson = !!options.json;

  // Check if already logged in
  const existing = await loadCredentials();
  if (existing) {
    try {
      const balance = await getBalance(existing.access_token);
      if (isJson) {
        jsonOut({ event: 'already_logged_in', display_name: balance.display_name });
      } else {
        console.log(chalk.green(`Already logged in as ${chalk.bold(balance.display_name || 'user')}.`));
        console.log(chalk.gray('Run `clawapps logout` first to switch accounts.'));
      }
      return;
    } catch {
      // Token invalid, continue with login
    }
  }

  // Create login code
  let loginCode;
  try {
    loginCode = await createLoginCode();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isJson) {
      jsonOut({ event: 'error', code: 'LOGIN_CODE_FAILED', message: msg });
    } else {
      console.error(chalk.red(`Failed to create login code: ${msg}`));
    }
    process.exit(1);
  }

  // Display login info
  if (isJson) {
    jsonOut({
      event: 'login_url',
      url: loginCode.qr_url,
      qr_image: loginCode.qr_image,
      expires_at: loginCode.expires_at,
      instructions: 'Show the URL and QR image to the user. They need to open the link or scan the QR code with WeChat to authenticate.',
    });
  } else {
    console.log(chalk.bold('\nLogin URL:'));
    console.log(chalk.cyan(loginCode.qr_url));
    console.log();
    qrcode.generate(loginCode.qr_url, { small: true });
    console.log(chalk.gray('\nOpen the link or scan QR code with WeChat to authenticate.'));
    console.log(chalk.yellow('Waiting for verification (valid for 3 minutes)...\n'));
  }

  // Poll for verification
  const spinner = isJson ? null : ora('Waiting for authentication...').start();

  const result = await pollLoginCode(loginCode.code, (remaining) => {
    if (spinner) {
      const min = Math.floor(remaining / 60);
      const sec = remaining % 60;
      spinner.text = `Waiting for authentication... ${min}:${sec.toString().padStart(2, '0')}`;
    } else if (remaining % 30 === 0) {
      jsonOut({ event: 'waiting', remaining });
    }
  });

  spinner?.stop();

  if (result.success) {
    if (isJson) {
      jsonOut({ event: 'login_success', display_name: result.display_name || null });
    } else {
      console.log(chalk.green('\nLogin successful!'));
      if (result.display_name) {
        console.log(chalk.gray(`User: ${result.display_name}`));
      }
    }
  } else {
    if (isJson) {
      jsonOut({ event: 'error', code: 'LOGIN_FAILED', message: result.error });
    } else {
      console.error(chalk.red(`\n${result.error}. Run \`clawapps login\` to try again.`));
    }
    process.exit(1);
  }
}
