import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getAgentProfile, updateAgentProfile } from '../lib/relay-client.js';
import type { AgentProfileUpdate } from '../lib/types.js';

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

const ALLOWED_KEYS = new Set([
  'display_name',
  'description',
  'prompt',
  'avatar_url',
  'visibility',
  'care_mode',
  'tags',
]);

/**
 * `clawapps agent profile show`
 *
 * Dedicated read for the user's assistant role. Mirrors PUT shape — same
 * BE serializer (_agent_out). Reads more fields than filtering `roles`
 * by category=agent (e.g. care_mode lives only here).
 */
export async function agentProfileShowCommand() {
  try {
    const creds = await resolveCredentials();
    const result = await getAgentProfile(creds.access_token);
    jsonOut(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    jsonOut({ error: msg });
    process.exit(1);
  }
}

/**
 * `clawapps agent profile set key=value [key=value ...]`
 *
 * Updates the user's auto-created assistant role (singular per user).
 * `tags=foo,bar,baz` is split into a string array. All other keys map
 * straight to BE field names. Backend (PUT /api/v1/agent/profile) owns
 * validation — we forward whatever the user supplies.
 */
export async function agentProfileSetCommand(pairs: string[]) {
  if (!pairs || pairs.length === 0) {
    jsonOut({
      error:
        'usage: clawapps agent profile set <key=value>... ' +
        `(keys: ${[...ALLOWED_KEYS].join(', ')})`,
    });
    process.exit(1);
  }

  const payload: AgentProfileUpdate = {};
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
    if (k === 'tags') {
      payload.tags = v
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
    } else {
      (payload as Record<string, unknown>)[k] = v;
    }
  }

  if (Object.keys(payload).length === 0) {
    jsonOut({ error: 'no valid key=value pairs provided' });
    process.exit(1);
  }

  try {
    const creds = await resolveCredentials();
    const result = await updateAgentProfile(creds.access_token, payload);
    jsonOut(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    jsonOut({ error: msg });
    process.exit(1);
  }
}
