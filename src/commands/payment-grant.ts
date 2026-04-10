import chalk from 'chalk';
import ora from 'ora';
import { loadCredentials } from '../lib/credentials.js';
import { CONFIG } from '../lib/config.js';
import { ensureValidToken } from './helpers/ensure-token.js';
import { createPaymentCode, displayQRCode, pollAuthCode } from '../auth/qr-poll.js';
import type { AuthCodePaymentResult } from '../lib/types.js';

export async function paymentGrantCommand(skillId: string): Promise<void> {
  const credentials = await loadCredentials();

  if (!credentials) {
    console.log(chalk.yellow('Not logged in. Run `clawapps login` first.'));
    process.exit(1);
  }

  const validated = await ensureValidToken(credentials);
  if (!validated) {
    console.log(chalk.red('Session expired. Please run `clawapps login` again.'));
    process.exit(1);
  }

  // Create payment code via API and display QR code
  let paymentCode;
  try {
    paymentCode = await createPaymentCode(validated.access_token, skillId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(chalk.red(`\nFailed to create payment code: ${message}`));
    process.exit(1);
  }

  console.log(chalk.gray('\nScan the QR code to authorize payment:\n'));
  displayQRCode(paymentCode.qr_url);
  console.log(chalk.gray(`\nOr visit: ${paymentCode.qr_url}\n`));
  console.log(chalk.yellow('Waiting for QR code verification (valid for 3 minutes)...\n'));

  const spinner = ora('Waiting for payment confirmation...').start();

  try {
    const result = await pollAuthCode<AuthCodePaymentResult>(paymentCode.code, 'payment');

    spinner.stop();

    if (result.one_time_pay_token) {
      console.log(chalk.green('\nPayment grant confirmed!'));
      console.log(chalk.gray(`Payment Token: ${result.one_time_pay_token}`));
      console.log(chalk.gray(`Auto Payment: ${result.auto_pay_enabled ? 'enabled' : 'disabled'}`));
    } else if (result.auto_pay_enabled) {
      console.log(chalk.green('\nAuto-pay is enabled, proceeding...'));
    } else {
      console.error(chalk.red('\nPayment grant failed: no payment token received.'));
      process.exit(1);
    }
  } catch (err) {
    spinner.stop();
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(chalk.red(`\nPayment grant failed: ${message}`));
    console.error(chalk.yellow('QR code has expired. Please run `clawapps payment-grant <skill_id>` to generate a new one.'));
    process.exit(1);
  }
}
