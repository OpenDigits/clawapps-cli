import { readFileSync } from 'node:fs';
import { createLoginCode } from '../lib/login-service.js';

/**
 * Create a login code and QR image. Returns immediately (non-blocking).
 * Outputs JSON metadata + QR code text to stdout.
 * Designed for AI agent integration.
 */
export async function loginCodeCommand() {
  try {
    const result = await createLoginCode();
    process.stdout.write(JSON.stringify({
      code: result.code,
      url: result.qr_url,
      qr_image: result.qr_image,
      expires_at: result.expires_at,
      next: `clawapps login-poll ${result.code}`,
    }) + '\n');
    // Print QR text directly so agent sees it in stdout
    process.stdout.write(readFileSync(result.qr_text, 'utf-8'));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    process.exit(1);
  }
}
