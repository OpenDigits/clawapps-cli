/**
 * Channel-aware BASE_URL resolution.
 *
 * Routing rule (product decision, 2026-05-02):
 *   wechat   → https://cli-relay.clawapps.cn  (CN-2 nginx → CN-1 PM2, mainland)
 *   whatsapp → https://cli-relay.clawapps.ai  (ai-prod1 Docker)
 *   env CLAWAPPS_API_URL always overrides (dev / custom deploys)
 *
 * CLI talks only to the cli-relay subdomain, never directly to the
 * backend `api.clawapps.*` host. Each cli-relay subdomain serves
 * `/cli/v1/*` (Relay) — same path layout both sides.
 */

import type { LoginChannel } from './types.js';

const WECHAT_BASE = 'https://cli-relay.clawapps.cn';
const WHATSAPP_BASE = 'https://cli-relay.clawapps.ai';

// C3 (2026-05-13 pentest): CLAWAPPS_API_URL is an attacker-friendly env
// override. A leaked env var or k8s ConfigMap typo can redirect every
// authenticated request to a hostile server. Hard-allowlist the hosts we
// ship; require explicit CLAWAPPS_ALLOW_CUSTOM_HOST=1 to dev against
// anything else (e.g. localhost mocks, ngrok during local-relay work).
const ALLOWED_HOSTS = new Set([
  'cli-relay.clawapps.cn',
  'cli-relay.clawapps.ai',
  'dev-cli-relay.clawapps.cn',
  'dev-cli-relay.clawapps.ai',
]);

let cachedBase: string | null = null;

export function setBaseFromChannel(channel: LoginChannel | undefined): void {
  if (channel === 'wechat') cachedBase = WECHAT_BASE;
  else if (channel === 'whatsapp') cachedBase = WHATSAPP_BASE;
}

function validateOverride(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`CLAWAPPS_API_URL is not a valid URL: ${raw}`);
  }
  if (u.protocol !== 'https:') {
    throw new Error(`CLAWAPPS_API_URL must use https:// (got ${u.protocol}//${u.host}). Plain http would leak Bearer tokens.`);
  }
  if (!ALLOWED_HOSTS.has(u.host) && !process.env.CLAWAPPS_ALLOW_CUSTOM_HOST) {
    throw new Error(
      `CLAWAPPS_API_URL host '${u.host}' not in allowlist [${[...ALLOWED_HOSTS].join(', ')}]. ` +
      `Set CLAWAPPS_ALLOW_CUSTOM_HOST=1 to override (dev / local-relay only).`,
    );
  }
  // Strip trailing slash so cliHttpUrl/cliWsUrl never produce double-slash.
  return raw.replace(/\/$/, '');
}

export function getBase(): string {
  // env wins, every call (so test harnesses can flip mid-process)
  const env = process.env.CLAWAPPS_API_URL;
  if (env) return validateOverride(env);
  return cachedBase || WHATSAPP_BASE;
}
