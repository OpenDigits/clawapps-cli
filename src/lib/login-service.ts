import { CONFIG } from './config.js';
import { saveCredentials } from './credentials.js';
import type { LoginChannel } from './types.js';

function cliUrl(path: string): string {
  const base = process.env.CLAWAPPS_API_URL || CONFIG.BASE_URL;
  return `${base}/cli/v1${path}`;
}

function isoFromExpiresIn(seconds?: number): string | undefined {
  if (typeof seconds !== 'number' || seconds <= 0) return undefined;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export interface LoginCodeResult {
  code: string;
  login_url: string;
  expires_at: string;
}

export interface LoginPollResult {
  success: boolean;
  display_name?: string;
  credits?: number;
  membership?: string;
  error?: string;
}

export interface RefreshResult {
  access_token: string;
  refresh_token: string;
  expires_at?: string;
  refresh_expires_at?: string;
}

export class RefreshTokenInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefreshTokenInvalidError';
  }
}

/**
 * Create a login code via cli-relay.
 *   POST /cli/v1/auth/login-code  { channel }
 *   → { code:0, message, data:{ code, channel, login_url, qr_url, expires_at } }
 */
export async function createLoginCode(channel: LoginChannel): Promise<LoginCodeResult> {
  const res = await fetch(cliUrl('/auth/login-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel }),
  });
  if (!res.ok) throw new Error(`Failed to create login code (${res.status})`);

  const body = await res.json() as {
    code?: number;
    data?: { code: string; channel?: string; expires_at: string; login_url?: string; qr_url?: string };
  };
  const inner = body.data;
  const url = inner?.login_url || inner?.qr_url;
  if (body.code !== 0 || !inner || !url) {
    throw new Error('Invalid response from server');
  }
  return { code: inner.code, login_url: url, expires_at: inner.expires_at };
}

/**
 * Poll login state via cli-relay (passes through backend double envelope).
 *   GET /cli/v1/auth/poll?code=<code>
 *   → { code:"OK", data:{ code:0|4013|4008, message, data:{ access_token, refresh_token, expires_in, refresh_expires_in, user_id, display_name, credits, membership } | null } }
 * Persists credentials on inner.code===0; returns credits/membership inline so login.ts can skip a follow-up balance call.
 */
export async function pollLoginCode(
  code: string,
  channel: LoginChannel,
  onStatus?: (remaining: number) => void,
  timeoutMs: number = 180000,
): Promise<LoginPollResult> {
  const pollInterval = 3000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const remaining = Math.ceil((timeoutMs - (Date.now() - startTime)) / 1000);
    onStatus?.(remaining);

    await new Promise(r => setTimeout(r, pollInterval));

    const res = await fetch(cliUrl(`/auth/poll?code=${encodeURIComponent(code)}`));
    const raw = await res.json() as Record<string, unknown>;

    const inner = (raw.data as Record<string, unknown>) || raw;
    const innerCode = inner.code as number | string | undefined;
    const result = (inner.data as Record<string, unknown>) || inner;

    if (innerCode === 0 && result.access_token) {
      await saveCredentials({
        provider: channel,
        access_token: result.access_token as string,
        refresh_token: result.refresh_token as string,
        expires_at: isoFromExpiresIn(result.expires_in as number | undefined),
        refresh_expires_at: isoFromExpiresIn(result.refresh_expires_in as number | undefined),
        user_id: (result.user_id as string) || undefined,
        logged_in_at: new Date().toISOString(),
      });
      return {
        success: true,
        display_name: (result.display_name as string) || undefined,
        credits: typeof result.credits === 'number' ? result.credits : undefined,
        membership: (result.membership as string) || undefined,
      };
    }

    if (innerCode === 4008) {
      return { success: false, error: 'Code expired' };
    }
  }

  return { success: false, error: 'Timed out' };
}

/**
 * Refresh access_token via cli-relay (also rotates refresh_token).
 *   POST /cli/v1/auth/refresh  { refresh_token }
 *   → flat or wrapped { access_token, refresh_token, expires_in, refresh_expires_in }
 *   401 → RefreshTokenInvalidError (caller should clear creds + prompt re-login)
 */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
  const res = await fetch(cliUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (res.status === 401) {
    throw new RefreshTokenInvalidError('Refresh token invalid or expired');
  }
  if (!res.ok) throw new Error(`Refresh failed (${res.status})`);

  const body = await res.json() as Record<string, unknown>;
  // Accept both flat ({access_token,...}) and wrapped ({data:{access_token,...}}) shapes.
  const data = (body.data as Record<string, unknown>) || body;
  const access = data.access_token as string | undefined;
  if (!access) throw new Error('Invalid refresh response');

  return {
    access_token: access,
    refresh_token: (data.refresh_token as string) || refreshToken,
    expires_at: isoFromExpiresIn(data.expires_in as number | undefined),
    refresh_expires_at: isoFromExpiresIn(data.refresh_expires_in as number | undefined),
  };
}
