import { resolveCredentials } from './helpers/resolve-credentials.js';
import { listRoles } from '../lib/relay-client.js';

function jsonOut(obj: unknown) { process.stdout.write(JSON.stringify(obj) + '\n'); }

export async function rolesCommand() {
  try {
    const creds = await resolveCredentials();
    jsonOut(await listRoles(creds.access_token));
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}
