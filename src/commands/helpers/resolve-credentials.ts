import { loadCredentials } from '../../lib/credentials.js';
import { ensureValidToken } from './ensure-token.js';
import type { Credentials } from '../../lib/types.js';

/**
 * Resolve valid credentials from environment variables or local file.
 *
 * Priority:
 *   1. CLAWAPPS_ACCESS_TOKEN + CLAWAPPS_REFRESH_TOKEN env vars
 *   2. ~/.clawapps/credentials.json
 *   3. Throw with instructions to run `clawapps login`
 *
 * Auto-refreshes expired tokens.
 */
export async function resolveCredentials(): Promise<Credentials> {
  const envAccess = process.env.CLAWAPPS_ACCESS_TOKEN;
  const envRefresh = process.env.CLAWAPPS_REFRESH_TOKEN;

  // Strategy 1: environment variables (skip validation — Relay will validate)
  if (envAccess && envRefresh) {
    return {
      provider: 'google',
      access_token: envAccess,
      refresh_token: envRefresh,
      logged_in_at: new Date().toISOString(),
    };
  }

  // Strategy 2: local file
  const creds = await loadCredentials();

  if (!creds) {
    throw new Error('Not authenticated. Run `clawapps login` or set CLAWAPPS_ACCESS_TOKEN.');
  }

  // Validate and auto-refresh
  const valid = await ensureValidToken(creds);
  if (!valid) {
    throw new Error('Session expired. Run `clawapps login` to re-authenticate.');
  }

  return valid;
}
