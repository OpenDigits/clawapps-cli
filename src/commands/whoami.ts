import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getMe } from '../lib/relay-client.js';

export async function whoamiCommand() {
  try {
    const creds = await resolveCredentials();
    const me = await getMe(creds.access_token);
    process.stdout.write(JSON.stringify(me) + '\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
