import chalk from 'chalk';
import { CONFIG } from '../lib/config.js';
import { displayQRCode } from '../auth/qr-poll.js';

export async function subscribeCommand(): Promise<void> {
  const url = `${CONFIG.CLAW_WEB_BASE}/membership`;

  console.log(chalk.yellow('\nScan the QR code to subscribe membership.\n'));
  displayQRCode(url);
  console.log(chalk.gray(`\nOr visit: ${url}\n`));
}
