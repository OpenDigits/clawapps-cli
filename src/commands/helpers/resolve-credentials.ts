import { loadCredentials } from '../../lib/credentials.js';
import type { Credentials } from '../../lib/types.js';

/**
 * Resolve credentials from environment variables or local file.
 *
 * Priority:
 *   1. CLAWAPPS_ACCESS_TOKEN + CLAWAPPS_REFRESH_TOKEN env vars
 *   2. ~/.clawapps/credentials.json
 *   3. Throw with instructions to run `clawapps login`
 *
 * Token validation is done server-side by the Relay.
 */
export async function resolveCredentials(): Promise<Credentials> {
  const envAccess = process.env.CLAWAPPS_ACCESS_TOKEN;
  const envRefresh = process.env.CLAWAPPS_REFRESH_TOKEN;

  if (envAccess && envRefresh) {
    return {
      provider: 'env',
      access_token: envAccess,
      refresh_token: envRefresh,
      logged_in_at: new Date().toISOString(),
    };
  }

  const creds = await loadCredentials();
  if (!creds) {
    throw new Error('Not authenticated. Run `clawapps login` or set CLAWAPPS_ACCESS_TOKEN.');
  }

  return creds;
}
