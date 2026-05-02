import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { lookup } from 'node:dns/promises';
import WebSocket from 'ws';
import { CONFIG } from '../lib/config.js';
import { loadCredentials } from '../lib/credentials.js';
import { getBase, setBaseFromChannel } from '../lib/base-url.js';
import { getMe } from '../lib/relay-client.js';

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function baseUrl(): string {
  return getBase();
}

function wsUrl(token: string): string {
  return baseUrl().replace(/^https/, 'wss').replace(/^http/, 'ws')
    + `/cli/v1/ws?token=${encodeURIComponent(token)}`;
}

const EXIT_OK = 0;
const EXIT_CREDS = 2;
const EXIT_NETWORK = 3;
const EXIT_BACKEND = 4;

export async function doctorCommand() {
  let exitCode = EXIT_OK;

  // 1. credentials file
  const credsPath = join(homedir(), CONFIG.CREDENTIALS_DIR, CONFIG.CREDENTIALS_FILE);
  let credsMode: number | null = null;
  try {
    const s = await stat(credsPath);
    credsMode = s.mode & 0o777;
    jsonOut({ check: 'credentials_file', ok: true, path: credsPath, mode: credsMode.toString(8) });
    if (credsMode !== 0o600) {
      jsonOut({ check: 'credentials_perms', ok: false, expected: '600', actual: credsMode.toString(8) });
      exitCode = EXIT_CREDS;
    }
  } catch {
    jsonOut({ check: 'credentials_file', ok: false, message: 'no credentials.json — run `clawapps login`' });
    // continue diagnostics, but flag
    exitCode = EXIT_CREDS;
  }

  const creds = await loadCredentials();
  if (creds && (creds.provider === 'wechat' || creds.provider === 'whatsapp')) {
    setBaseFromChannel(creds.provider);
  }

  // 2. token TTL
  if (creds?.expires_at) {
    const remainMs = new Date(creds.expires_at).getTime() - Date.now();
    jsonOut({ check: 'access_token_ttl', ok: remainMs > 0, remaining_minutes: Math.floor(remainMs / 60000) });
    if (remainMs <= 0) exitCode = EXIT_CREDS;
  } else if (creds) {
    jsonOut({ check: 'access_token_ttl', ok: true, remaining_minutes: null, note: 'env or legacy creds' });
  }
  if (creds?.refresh_expires_at) {
    const remainMs = new Date(creds.refresh_expires_at).getTime() - Date.now();
    jsonOut({ check: 'refresh_token_ttl', ok: remainMs > 0, remaining_days: Math.floor(remainMs / 86400000) });
    if (remainMs <= 0) exitCode = EXIT_CREDS;
  }

  // 3. DNS
  const url = new URL(baseUrl());
  try {
    const lk = await lookup(url.hostname);
    jsonOut({ check: 'dns', ok: true, host: url.hostname, address: lk.address });
  } catch (err) {
    jsonOut({ check: 'dns', ok: false, host: url.hostname, message: (err as Error).message });
    exitCode = EXIT_NETWORK;
    finish(exitCode);
    return;
  }

  // 4. /health
  try {
    const t0 = Date.now();
    const res = await fetch(`${baseUrl()}/cli/v1/../health`, { method: 'GET' }).catch(() => null);
    // Our /health is at root, not under /cli/v1/. Fall back accordingly.
    const realRes = res?.ok ? res : await fetch(`${baseUrl()}/health`).catch(() => null);
    const latency = Date.now() - t0;
    if (realRes?.ok) {
      const body = await realRes.json().catch(() => ({}));
      jsonOut({ check: 'relay_health', ok: true, latency_ms: latency, body });
    } else {
      jsonOut({ check: 'relay_health', ok: false, latency_ms: latency, status: realRes?.status });
      exitCode = EXIT_BACKEND;
    }
  } catch (err) {
    jsonOut({ check: 'relay_health', ok: false, message: (err as Error).message });
    exitCode = EXIT_NETWORK;
  }

  // 5. /cli/v1/me (verifies token + backend reachable)
  if (creds?.access_token) {
    try {
      const me = await getMe(creds.access_token);
      jsonOut({ check: 'me', ok: true, user_id: me.user_id, display_name: me.display_name, credits: me.credits });
    } catch (err) {
      jsonOut({ check: 'me', ok: false, message: (err as Error).message });
      // distinguish: auth vs backend down
      const msg = (err as Error).message;
      exitCode = msg.includes('expired') || msg.includes('AUTH') ? EXIT_CREDS : EXIT_BACKEND;
    }
  }

  // 6. WS upgrade test
  if (creds?.access_token) {
    const t0 = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl(creds.access_token));
        const timer = setTimeout(() => { ws.terminate(); reject(new Error('WS upgrade timeout (10s)')); }, 10000);
        ws.on('open', () => {
          // success on upgrade alone — close immediately, don't wait for connected frame
          // (that requires a Bridge container which we don't want to wake up just for doctor)
          clearTimeout(timer);
          ws.close(1000);
          resolve();
        });
        ws.on('error', (err) => { clearTimeout(timer); reject(err); });
      });
      jsonOut({ check: 'ws_upgrade', ok: true, latency_ms: Date.now() - t0 });
    } catch (err) {
      jsonOut({ check: 'ws_upgrade', ok: false, latency_ms: Date.now() - t0, message: (err as Error).message });
      if (exitCode === EXIT_OK) exitCode = EXIT_NETWORK;
    }
  }

  finish(exitCode);
}

function finish(code: number) {
  jsonOut({ check: 'summary', ok: code === EXIT_OK, exit_code: code });
  process.exit(code);
}
