import { apiGet, apiPost, type WrappedResponse } from '../../lib/api.js';
import { saveCredentials } from '../../lib/credentials.js';
import { CONFIG } from '../../lib/config.js';
import type { Credentials, ClawTokens, UserInfo } from '../../lib/types.js';

/**
 * Validates the current token, refreshes if expired.
 * Returns updated credentials or null if session is invalid.
 */
export async function ensureValidToken(
  credentials: Credentials,
): Promise<Credentials | null> {
  // Try current token
  const res = await apiGet<WrappedResponse<UserInfo>>(
    CONFIG.CLAW_ME,
    credentials.access_token,
  );

  if (res.ok) return credentials;

  // Token expired — try refresh
  if (res.status === 401) {
    const refreshRes = await apiPost<WrappedResponse<ClawTokens>>(
      CONFIG.CLAW_REFRESH,
      { refresh_token: credentials.refresh_token },
    );

    if (!refreshRes.ok) return null;

    const newTokens = refreshRes.data.data;
    const updated: Credentials = {
      ...credentials,
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
    };

    await saveCredentials(updated);
    return updated;
  }

  return null;
}
