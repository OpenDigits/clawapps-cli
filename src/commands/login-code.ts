import { createLoginCode } from '../lib/login-service.js';

/**
 * Create a login code and QR image. Returns immediately (non-blocking).
 * Designed for AI agent integration.
 */
export async function loginCodeCommand() {
  try {
    const result = await createLoginCode();
    process.stdout.write(JSON.stringify({
      code: result.code,
      url: result.qr_url,
      qr_image: result.qr_image,
      qr_text: result.qr_text,
      expires_at: result.expires_at,
      next: `clawapps login-poll ${result.code}`,
      instructions: 'Read qr_text file to display QR code to user. Then run the next command to wait for verification.',
    }) + '\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(JSON.stringify({ error: msg }) + '\n');
    process.exit(1);
  }
}
