import chalk from 'chalk';
import { getFreshCredentials } from '../lib/credentials.js';
import { setBaseFromChannel } from '../lib/base-url.js';
import { getMe } from '../lib/relay-client.js';
import { createLoginCode, pollLoginCode } from '../lib/login-service.js';
import type { LoginChannel } from '../lib/types.js';

interface LoginOptions {
  wechat?: boolean;
  whatsapp?: boolean;
}

function resolveChannel(options: LoginOptions): { channel?: LoginChannel; error?: string } {
  if (options.wechat && options.whatsapp) {
    return { error: 'Cannot specify both --wechat and --whatsapp.' };
  }
  if (options.wechat) return { channel: 'wechat' };
  if (options.whatsapp) return { channel: 'whatsapp' };
  return { error: 'Must specify --wechat or --whatsapp.' };
}

const TIMEOUT_MS = 180_000;

export async function loginCommand(options: LoginOptions): Promise<void> {
  const { channel, error: channelError } = resolveChannel(options);
  if (!channel) {
    console.error(chalk.red(channelError));
    console.error(chalk.gray('Usage: clawapps login --wechat | --whatsapp'));
    process.exit(1);
  }

  // Pin BASE_URL up front so all subsequent calls (login-code,
  // poll, getMe) hit the channel-correct host.
  setBaseFromChannel(channel);

  const channelLabel = channel === 'wechat' ? 'WeChat' : 'WhatsApp';

  // Already logged in?
  const existing = await getFreshCredentials();
  if (existing) {
    try {
      const me = await getMe(existing.access_token);
      console.log(chalk.green(`✓ Already logged in as ${chalk.bold(me.display_name || 'user')} via ${existing.provider}.`));
      console.log(chalk.gray('  Run `clawapps logout` first to switch accounts.'));
      return;
    } catch {
      // Token invalid even after refresh; fall through to fresh login
    }
  }

  let loginCode;
  try {
    loginCode = await createLoginCode(channel);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Failed to create login code: ${msg}`));
    process.exit(1);
  }

  console.log();
  console.log(chalk.bold(`ClawApps Login — ${channelLabel}`));
  console.log();
  console.log('Step 1. Open this link in your browser:');
  console.log();
  console.log('    ' + chalk.cyan.underline(loginCode.login_url));
  console.log();
  console.log(`Step 2. Authenticate via ${channelLabel}.`);
  console.log();
  const totalSec = Math.ceil(TIMEOUT_MS / 1000);
  console.log(chalk.yellow(`Waiting for you to scan… (link valid for ${totalSec} seconds)`));

  const result = await pollLoginCode(
    loginCode.code,
    channel,
    (remaining) => {
      if (remaining > 0 && remaining < totalSec && remaining % 30 === 0) {
        console.log(chalk.gray(`   ${remaining} seconds remaining`));
      }
    },
    () => {
      console.log(chalk.cyan('   ✓ Scanned — waiting for confirmation…'));
    },
    TIMEOUT_MS,
  );

  if (result.success) {
    console.log();
    console.log(chalk.green.bold('✓ Login successful!'));
    console.log();
    console.log(`  Welcome, ${chalk.bold(result.display_name || 'friend')} 👋`);
    console.log(`  Channel:     ${channelLabel}`);
    if (typeof result.credits === 'number') {
      console.log(`  Credits:     ${chalk.bold(String(result.credits))}`);
    }
    if (result.membership) {
      console.log(`  Membership:  ${result.membership}`);
    }
    if (result.welcome_message) {
      console.log();
      console.log(chalk.cyan(result.welcome_message));
    } else {
      console.log();
      if (channel === 'wechat') {
        console.log(chalk.cyan('🦞 已接入应用龙虾 ClawApps 平台，可以开始聊天找服务。'));
      } else {
        console.log(chalk.cyan("🦞 You're now connected to the ClawApps platform. Start chatting with services."));
      }
    }
    console.log();
    console.log(chalk.gray('  Try:  clawapps send "<your question>"'));
    console.log(chalk.gray('  Help: clawapps --help'));
    console.log();
    return;
  }

  console.log();
  if (result.error === 'Code expired' || result.error === 'Timed out') {
    console.error(chalk.red('Timed out — link expired without scan.'));
  } else {
    console.error(chalk.red(`Login failed: ${result.error}`));
  }
  console.error(chalk.gray(`Run \`clawapps login --${channel}\` to try again.`));
  process.exit(1);
}
