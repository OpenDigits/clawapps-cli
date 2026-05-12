import { resolveCredentials } from './helpers/resolve-credentials.js';
import { listRoles } from '../lib/relay-client.js';
import { getBase } from '../lib/base-url.js';

function jsonOut(obj: unknown) { process.stdout.write(JSON.stringify(obj) + '\n'); }

const ALLOWED_VISIBILITY = ['public', 'contacts_only', 'private'];

export async function rolesCommand() {
  try {
    const creds = await resolveCredentials();
    jsonOut(await listRoles(creds.access_token));
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

/**
 * `clawapps roles visibility <role_id> <public|contacts_only|private>`
 *
 * Wraps BE's dedicated PUT /api/v1/roles/{id}/visibility — single field,
 * collected gates (Pro/admin tier · display_name_inited · Aliyun
 * content moderation). See seed-E-visibility-policy.md for the full
 * tier × category × visibility matrix.
 */
export async function rolesVisibilityCommand(roleId: string, value: string) {
  if (!ALLOWED_VISIBILITY.includes(value)) {
    jsonOut({ error: `visibility must be one of: ${ALLOWED_VISIBILITY.join(', ')}` });
    process.exit(1);
  }
  try {
    const creds = await resolveCredentials();
    const res = await fetch(`${getBase()}/cli/v1/roles/${roleId}/visibility`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${creds.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ visibility: value }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    jsonOut(await res.json() as Record<string, unknown>);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}
