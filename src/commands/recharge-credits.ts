import chalk from 'chalk';
import { CONFIG } from '../lib/config.js';
import { displayQRCode } from '../auth/qr-poll.js';

export async function rechargeCreditsCommand(): Promise<void> {
  const url = `${CONFIG.CLAW_WEB_BASE}/credit`;

  console.log(chalk.yellow('\nInsufficient credits. Please scan the QR code to recharge.\n'));
  displayQRCode(url);
  console.log(chalk.gray(`\nOr visit: ${url}\n`));
}
