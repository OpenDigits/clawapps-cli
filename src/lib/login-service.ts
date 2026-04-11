import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONFIG } from './config.js';
import { saveCredentials } from './credentials.js';

function relayUrl(path: string): string {
  const base = process.env.CLAWAPPS_RELAY_URL || CONFIG.CLI_RELAY_BASE;
  return `${base}${path}`;
}

export interface LoginCodeResult {
  code: string;
  qr_url: string;
  qr_image: string;
  qr_text: string;
  expires_at: string;
}

export interface LoginPollResult {
  success: boolean;
  display_name?: string;
  error?: string;
}

/**
 * Create a login code and generate QR image.
 * Returns immediately (non-blocking).
 */
export async function createLoginCode(): Promise<LoginCodeResult> {
  const res = await fetch(relayUrl('/auth/login-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Failed to create login code (${res.status})`);

  const body = await res.json() as { code: number; data?: { code: string; expires_at: string; qr_url: string } };
  if (!body.data?.qr_url) throw new Error('Invalid response from server');

  const { code, qr_url, expires_at } = body.data;

  // Generate QR image (PNG) + QR text file
  const ts = Date.now();
  const qrImagePath = join(tmpdir(), `clawapps-login-qr-${ts}.png`);
  const qrTextPath = join(tmpdir(), `clawapps-login-qr-${ts}.txt`);
  await QRCode.toFile(qrImagePath, qr_url, { width: 300, margin: 2 });
  const qrText = await QRCode.toString(qr_url, { type: 'utf8', small: true });
  writeFileSync(qrTextPath, `Login URL: ${qr_url}\n\n${qrText}`);

  return { code, qr_url, qr_image: qrImagePath, qr_text: qrTextPath, expires_at };
}

/**
 * Poll for login verification.
 * Calls onStatus every poll interval.
 * Returns when verified, expired, or timed out.
 */
export async function pollLoginCode(
  code: string,
  onStatus?: (remaining: number) => void,
  timeoutMs: number = 180000,
): Promise<LoginPollResult> {
  const pollInterval = 3000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const remaining = Math.ceil((timeoutMs - (Date.now() - startTime)) / 1000);
    onStatus?.(remaining);

    await new Promise(r => setTimeout(r, pollInterval));

    const res = await fetch(relayUrl(`/auth/poll?code=${encodeURIComponent(code)}`));
    const raw = await res.json() as Record<string, unknown>;

    const inner = (raw.data as Record<string, unknown>) || raw;
    const innerCode = (inner.code as number) ?? (raw.code as number);
    const result = (inner.data as Record<string, unknown>) || inner;

    if (innerCode === 0 && result.access_token) {
      await saveCredentials({
        provider: 'wechat',
        access_token: result.access_token as string,
        refresh_token: result.refresh_token as string,
        logged_in_at: new Date().toISOString(),
      });
      return { success: true, display_name: (result.display_name as string) || undefined };
    }

    if (innerCode === 4008) {
      return { success: false, error: 'Code expired' };
    }
  }

  return { success: false, error: 'Timed out' };
}
