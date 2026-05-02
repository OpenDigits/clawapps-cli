import { saveCredentials } from './credentials.js';
import { getBase } from './base-url.js';
import type { LoginChannel } from './types.js';

function cliUrl(path: string): string {
  return `${getBase()}/cli/v1${path}`;
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
  display_name_inited?: boolean;
  welcome_message?: string;
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

const POLL_INTERVAL_PENDING = 3000;
const POLL_INTERVAL_SCANNED = 800;

/**
 * Poll login state. Inner code semantics:
 *   0    success
 *   4012 SCANNED_PENDING (user scanned, waiting for confirm) — onScanned() once + faster polling
 *   4013 waiting for scan
 *   4008 expired
 */
export async function pollLoginCode(
  code: string,
  channel: LoginChannel,
  onStatus?: (remaining: number) => void,
  onScanned?: () => void,
  timeoutMs: number = 180000,
): Promise<LoginPollResult> {
  let interval = POLL_INTERVAL_PENDING;
  let scannedFired = false;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const remaining = Math.ceil((timeoutMs - (Date.now() - startTime)) / 1000);
    onStatus?.(remaining);

    await new Promise(r => setTimeout(r, interval));

    const res = await fetch(cliUrl(`/auth/poll?code=${encodeURIComponent(code)}&channel=${channel}`));
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
        display_name_inited: typeof result.display_name_inited === 'boolean' ? result.display_name_inited : undefined,
        welcome_message: (result.welcome_message as string) || undefined,
      };
    }

    if (innerCode === 4012 && !scannedFired) {
      scannedFired = true;
      interval = POLL_INTERVAL_SCANNED;
      onScanned?.();
    }

    if (innerCode === 4008) {
      return { success: false, error: 'Code expired' };
    }
  }

  return { success: false, error: 'Timed out' };
}

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
