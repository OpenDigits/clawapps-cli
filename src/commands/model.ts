import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getMe, setPreferences } from '../lib/relay-client.js';
import type { Preferences } from '../lib/types.js';

const SUPPORTED_CLAUDE = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
const SUPPORTED_CODEX = ['codex-default'];

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

interface ModelOptions {
  // commander passes the leftover args via .args; we re-read from process
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
  jsonOut({ claude: SUPPORTED_CLAUDE, codex: SUPPORTED_CODEX });
}

/**
 * Accepts positional KEY=VALUE pairs:
 *   clawapps model set claude=sonnet-4-6 codex=default lang=zh-CN
 */
export async function modelSet(pairs: string[]) {
  if (!pairs || pairs.length === 0) {
    jsonOut({ error: 'usage: clawapps model set claude=<id> [codex=<id>] [lang=<code>]' });
    process.exit(1);
  }

  const update: Partial<Preferences> = {};
  for (const pair of pairs) {
    const [k, ...rest] = pair.split('=');
    const v = rest.join('=');
    if (!k || !v) continue;
    if (k === 'claude') update.preferred_claude_model = v;
    else if (k === 'codex') update.preferred_codex_model = v;
    else if (k === 'lang' || k === 'language') update.preferred_language = v;
    else {
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
    // 503 PREFERENCES_UNSUPPORTED → exit 4 so scripts can detect "backend not ready"
    process.exit(msg.includes('PREFERENCES_UNSUPPORTED') ? 4 : 1);
  }
}
