import { readFile, writeFile, mkdir, unlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { CONFIG } from './config.js';
import type { Credentials } from './types.js';

const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

function getCredentialsPath(): string {
  return join(homedir(), CONFIG.CREDENTIALS_DIR, CONFIG.CREDENTIALS_FILE);
}

function getCredentialsDir(): string {
  return join(homedir(), CONFIG.CREDENTIALS_DIR);
}

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    const data = await readFile(getCredentialsPath(), 'utf-8');
    return JSON.parse(data) as Credentials;
  } catch {
    return null;
  }
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
  const dir = getCredentialsDir();
  await mkdir(dir, { recursive: true });

  const filePath = getCredentialsPath();
  await writeFile(filePath, JSON.stringify(credentials, null, 2), 'utf-8');
  await chmod(filePath, 0o600);
}

export async function clearCredentials(): Promise<void> {
  try {
    await unlink(getCredentialsPath());
  } catch {
    // File doesn't exist, that's fine
  }
}

/**
 * Load credentials and proactively refresh if expiring within
 * REFRESH_THRESHOLD_MS. Returns null if not logged in.
 *
 * Old credentials without expires_at are returned as-is (server still
 * validates; reactive 401-then-refresh is the caller's responsibility).
 */
export async function getFreshCredentials(): Promise<Credentials | null> {
  const creds = await loadCredentials();
  if (!creds) return null;
  if (creds.provider === 'env') return creds;
  if (!creds.expires_at) return creds;

  const remaining = new Date(creds.expires_at).getTime() - Date.now();
  if (remaining > REFRESH_THRESHOLD_MS) return creds;

  // Refresh token also expired — full re-login required.
  if (creds.refresh_expires_at && Date.now() >= new Date(creds.refresh_expires_at).getTime()) {
    await clearCredentials();
    return null;
  }

  try {
    const { refreshAccessToken, RefreshTokenInvalidError } = await import('./login-service.js');
    const refreshed = await refreshAccessToken(creds.refresh_token);
    const updated: Credentials = {
      ...creds,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
      refresh_expires_at: refreshed.refresh_expires_at || creds.refresh_expires_at,
      logged_in_at: new Date().toISOString(),
    };
    await saveCredentials(updated);
    return updated;
    // RefreshTokenInvalidError checked via instanceof in catch
    void RefreshTokenInvalidError;
  } catch (err) {
    if (err && (err as Error).name === 'RefreshTokenInvalidError') {
      await clearCredentials();
      return null;
    }
    return creds;
  }
}
