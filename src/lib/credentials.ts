import { readFile, writeFile, mkdir, unlink, chmod, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { CONFIG } from './config.js';
import { CREDENTIALS_SCHEMA_VERSION, type Credentials } from './types.js';

const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

function getCredentialsPath(): string {
  return join(homedir(), CONFIG.CREDENTIALS_DIR, CONFIG.CREDENTIALS_FILE);
}

function getCredentialsDir(): string {
  return join(homedir(), CONFIG.CREDENTIALS_DIR);
}

/**
 * C4 (2026-05-13 pentest): the credentials directory was created with the
 * process umask (typically 0755 = world-readable). The file inside was
 * chmod 0600, but the directory still let other UIDs `ls` it and observe
 * mtime side-channels — useful for timing attacks against an admin who
 * just refreshed a token. Always chmod the dir to 0700 after mkdir.
 */
export async function ensureCredentialsDir(): Promise<string> {
  const dir = getCredentialsDir();
  await mkdir(dir, { recursive: true });
  // chmod is no-op on Windows / OK on Unix even if dir already existed.
  try { await chmod(dir, 0o700); } catch { /* best effort */ }
  return dir;
}

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    const data = await readFile(getCredentialsPath(), 'utf-8');
    return JSON.parse(data) as Credentials;
  } catch {
    return null;
  }
}

/**
 * C12 (2026-05-13 pentest): the original implementation was write-then-chmod
 * with no atomicity guarantee. A concurrent upgrade migration that called
 * clearCredentials() between two processes' write+chmod windows could leave
 * the user with no credentials. Write to a unique tmp file, chmod, then
 * rename — rename is atomic on POSIX, so readers see either the old file
 * or the new file, never a partial / 0-byte file.
 */
export async function saveCredentials(credentials: Credentials): Promise<void> {
  await ensureCredentialsDir();

  const filePath = getCredentialsPath();
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  const stamped: Credentials = {
    schema_version: CREDENTIALS_SCHEMA_VERSION,
    ...credentials,
  };
  await writeFile(tmpPath, JSON.stringify(stamped, null, 2), { mode: 0o600 });
  await chmod(tmpPath, 0o600);
  await rename(tmpPath, filePath);
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
 * v1.0: files missing `schema_version` are treated as legacy and
 * cleared so the user re-logs in (one-time disruption at upgrade).
 */
export async function getFreshCredentials(): Promise<Credentials | null> {
  const creds = await loadCredentials();
  if (!creds) return null;

  // env-var auth: skip schema/refresh tracking entirely.
  if (creds.provider === 'env') return creds;

  // Migrate: any file without schema_version is pre-v1.0 → force re-login.
  if (creds.schema_version !== CREDENTIALS_SCHEMA_VERSION) {
    await clearCredentials();
    return null;
  }

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
