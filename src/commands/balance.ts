import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getBalance } from '../lib/relay-client.js';

export async function balanceCommand() {
  try {
    const creds = await resolveCredentials();
    const balance = await getBalance(creds.access_token);
    process.stdout.write(JSON.stringify(balance) + '\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
