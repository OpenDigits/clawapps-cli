import { CONFIG } from '../lib/config.js';
import { apiPost } from '../lib/api.js';
import type { ODTokens, ClawTokens } from '../lib/types.js';

/** OD API wraps response in { code, message, data } */
interface ODApiResponse<T> {
  code: string;
  message: string;
  data: T;
}

/**
 * Exchange a Google access_token for OpenDigits tokens.
 */
export async function googleToOD(googleAccessToken: string): Promise<ODTokens> {
  const res = await apiPost<ODApiResponse<ODTokens>>(CONFIG.OD_GOOGLE_AUTH, {
    access_token: googleAccessToken,
  });

  if (!res.ok) {
    throw new Error(`Google → OD exchange failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return res.data.data;
}

/**
 * Exchange OpenDigits tokens for ClawApps tokens.
 */
/** ClawApps API also wraps response in { code, message, data } */
interface ClawApiResponse<T> {
  code: string;
  message: string;
  data: T;
}

export async function odToClawApps(odTokens: ODTokens): Promise<ClawTokens> {
  const res = await apiPost<ClawApiResponse<ClawTokens>>(CONFIG.CLAW_EXCHANGE, {
    od_token: odTokens.access_token,
    od_refresh_token: odTokens.refresh_token,
  });

  if (!res.ok) {
    throw new Error(`OD → ClawApps exchange failed (${res.status}): ${JSON.stringify(res.data)}`);
  }

  return res.data.data;
}
