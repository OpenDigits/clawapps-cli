import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getMe, setPreferences } from '../lib/relay-client.js';
import type { Preferences } from '../lib/types.js';

// R-21-a: client must not surface model identity. `model list` therefore
// returns nothing about which models exist; routing decisions live entirely
// on the backend. Until BE exposes an opaque tier interface (R-21-c) the
// command stays as a no-op notice.

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

export async function modelGet() {
  try {
    const creds = await resolveCredentials();
    const me = await getMe(creds.access_token);
    jsonOut(me.preferences as unknown as Record<string, unknown>);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    jsonOut({ error: msg });
    process.exit(1);
  }
}

export async function modelList() {
  jsonOut({
    info: 'model selection is managed server-side and not exposed to clients',
    configurable: ['tier', 'language', 'timezone', 'city'],
    tiers: ['fast', 'balanced', 'smart'],
  });
}

/**
 * Accepts positional KEY=VALUE pairs. Model identity keys are rejected.
 *   clawapps model set lang=zh-CN timezone=Asia/Shanghai city=Shanghai
 */
export async function modelSet(pairs: string[]) {
  if (!pairs || pairs.length === 0) {
    jsonOut({ error: 'usage: clawapps model set lang=<code> [timezone=<tz>] [city=<name>]' });
    process.exit(1);
  }

  const update: Partial<Preferences> = {};
  for (const pair of pairs) {
    const [k, ...rest] = pair.split('=');
    const v = rest.join('=');
    if (!k || !v) continue;
    if (k === 'claude' || k === 'codex' || k === 'model') {
      jsonOut({ error: `key '${k}' is not configurable: model selection is server-side only` });
      process.exit(1);
    } else if (k === 'tier') {
      const TIERS = ['fast', 'balanced', 'smart'];
      if (!TIERS.includes(v)) {
        jsonOut({ error: `tier must be one of: ${TIERS.join(', ')}` });
        process.exit(1);
      }
      update.preferred_tier = v;
    } else if (k === 'lang' || k === 'language') {
      update.language = v;
    } else if (k === 'timezone' || k === 'tz') {
      update.timezone = v;
    } else if (k === 'city') {
      update.city = v;
    } else {
      jsonOut({ error: `unknown key: ${k}` });
      process.exit(1);
    }
  }

  if (Object.keys(update).length === 0) {
    jsonOut({ error: 'no valid key=value pairs provided' });
    process.exit(1);
  }

  try {
    const creds = await resolveCredentials();
    const result = await setPreferences(creds.access_token, update);
    jsonOut(result as unknown as Record<string, unknown>);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    jsonOut({ error: msg });
    process.exit(msg.includes('PREFERENCES_UNSUPPORTED') ? 4 : 1);
  }
}
