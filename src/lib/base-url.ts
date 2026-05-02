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

let cachedBase: string | null = null;

export function setBaseFromChannel(channel: LoginChannel | undefined): void {
  if (channel === 'wechat') cachedBase = WECHAT_BASE;
  else if (channel === 'whatsapp') cachedBase = WHATSAPP_BASE;
}

export function getBase(): string {
  // env wins, every call (so test harnesses can flip mid-process)
  if (process.env.CLAWAPPS_API_URL) return process.env.CLAWAPPS_API_URL;
  return cachedBase || WHATSAPP_BASE;
}
