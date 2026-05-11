import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getMe } from '../lib/relay-client.js';
import { getBase } from '../lib/base-url.js';

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

const ALLOWED_KEYS = new Set([
  'display_name',
  'description',
  'avatar_url',
  'visibility',
]);

async function resolveOwnerRoleId(token: string): Promise<string> {
  // The OWNER role id is reported back via the roles list — find the
  // category=default entry. We don't trust user_id == role_id (sky's
  // account had it equal, JAY's does not).
  const res = await fetch(`${getBase()}/cli/v1/roles`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`failed to list roles: ${res.status}`);
  const data = await res.json() as { roles?: Array<{ role_id: string; category: string }> };
  const owner = (data.roles || []).find((r) => r.category === 'default');
  if (!owner) throw new Error('no default (owner) role found for this user');
  return owner.role_id;
}

/**
 * `clawapps me profile show` — print the user's OWNER role profile.
 * Mirrors `clawapps agent profile show`. Pulls /cli/v1/roles/<owner_role_id>.
 */
export async function meProfileShowCommand() {
  try {
    const creds = await resolveCredentials();
    const roleId = await resolveOwnerRoleId(creds.access_token);
    const res = await fetch(`${getBase()}/cli/v1/roles/${roleId}`, {
      headers: { 'Authorization': `Bearer ${creds.access_token}` },
    });
    if (!res.ok) throw new Error(`failed: ${res.status}`);
    jsonOut(await res.json() as Record<string, unknown>);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    jsonOut({ error: msg });
    process.exit(1);
  }
}

/**
 * `clawapps me profile set <key=value>...` — update the user's OWNER role.
 *
 * BE cascade on owner role display_name change (R-31): also updates
 * users.display_name, agent_roles[*].owner_display_name, Moky push to
 * Bridge .system_config.json, and keeps display_name_inited=true.
 *
 * Allowed keys: display_name / description / avatar_url / visibility.
 * (visibility=public may be FORBIDDEN on free tier per R-22 paywall.)
 */
export async function meProfileSetCommand(pairs: string[]) {
  if (!pairs || pairs.length === 0) {
    jsonOut({
      error:
        'usage: clawapps me profile set <key=value>... ' +
        `(keys: ${[...ALLOWED_KEYS].join(', ')})`,
    });
    process.exit(1);
  }

  const payload: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq <= 0) {
      jsonOut({ error: `bad pair (need key=value): ${pair}` });
      process.exit(1);
    }
    const k = pair.slice(0, eq);
    const v = pair.slice(eq + 1);
    if (!ALLOWED_KEYS.has(k)) {
      jsonOut({ error: `unknown key: ${k}` });
      process.exit(1);
    }
    payload[k] = v;
  }

  try {
    const creds = await resolveCredentials();
    const roleId = await resolveOwnerRoleId(creds.access_token);
    const res = await fetch(`${getBase()}/cli/v1/roles/${roleId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${creds.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    jsonOut(await res.json() as Record<string, unknown>);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    jsonOut({ error: msg });
    process.exit(1);
  }
}
