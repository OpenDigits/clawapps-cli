import { readFile } from 'node:fs/promises';
import { getFreshCredentials } from '../../lib/credentials.js';
import { setBaseFromChannel } from '../../lib/base-url.js';
import type { Credentials } from '../../lib/types.js';

let envWarningPrinted = false;

/**
 * Resolve credentials from environment variables, file mount, or stored file.
 *
 * Priority:
 *   1. CLAWAPPS_CREDENTIALS_FILE → read JSON from that file (recommended for
 *      k8s / docker — mount a Secret, file content stays out of env / logs)
 *   2. CLAWAPPS_ACCESS_TOKEN + CLAWAPPS_REFRESH_TOKEN env vars (prints a
 *      one-shot stderr warning since /proc/<pid>/environ + kubectl describe
 *      + docker inspect all expose env vars to anyone who can read them)
 *   3. ~/.clawapps/credentials.json (default after `clawapps login`)
 *   4. Throw with instructions to run `clawapps login`
 *
 * Token validation is done server-side by the Relay.
 */
export async function resolveCredentials(): Promise<Credentials> {
  // 1. File-mount mode (recommended for automated agents).
  const credsFile = process.env.CLAWAPPS_CREDENTIALS_FILE;
  if (credsFile) {
    const raw = await readFile(credsFile, 'utf-8');
    const parsed = JSON.parse(raw) as Credentials;
    if (!parsed.access_token || !parsed.refresh_token) {
      throw new Error(`CLAWAPPS_CREDENTIALS_FILE ${credsFile} missing access_token / refresh_token`);
    }
    return { ...parsed, provider: parsed.provider ?? 'env' };
  }

  // 2. env vars — works but leaks via /proc/<pid>/environ.
  const envAccess = process.env.CLAWAPPS_ACCESS_TOKEN;
  const envRefresh = process.env.CLAWAPPS_REFRESH_TOKEN;
  if (envAccess && envRefresh) {
    if (!envWarningPrinted && !process.env.CLAWAPPS_SILENCE_ENV_WARNING) {
      process.stderr.write(
        '[clawapps] WARNING: token passed via CLAWAPPS_ACCESS_TOKEN env var. ' +
        'In container / k8s deployments this leaks to /proc/<pid>/environ, ' +
        'kubectl describe pod, docker inspect, etcd, and any monitoring sidecar. ' +
        'Prefer CLAWAPPS_CREDENTIALS_FILE=/path/to/creds.json with a mounted Secret. ' +
        '(Set CLAWAPPS_SILENCE_ENV_WARNING=1 to suppress.)\n',
      );
      envWarningPrinted = true;
    }
    return {
      provider: 'env',
      access_token: envAccess,
      refresh_token: envRefresh,
      logged_in_at: new Date().toISOString(),
    };
  }

  const creds = await getFreshCredentials();
  if (!creds) {
    throw new Error('Not authenticated. Run `clawapps login --wechat` or `clawapps login --whatsapp`, or set CLAWAPPS_ACCESS_TOKEN.');
  }

  // Per-channel BASE_URL: wechat → .cn, whatsapp → .ai
  if (creds.provider === 'wechat' || creds.provider === 'whatsapp') {
    setBaseFromChannel(creds.provider);
  }

  return creds;
}
