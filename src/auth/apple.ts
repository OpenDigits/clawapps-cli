import { CONFIG } from '../lib/config.js';
import { randomBytes } from 'node:crypto';

/**
 * Build the Apple OAuth URL via OpenDigits.
 * OD handles the Apple OAuth flow and redirects back to our localhost with tokens.
 */
export function buildAppleAuthUrl(redirectUri: string): string {
  const state = randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    redirect_uri: redirectUri,
    state,
  });

  return `${CONFIG.OD_APPLE_AUTHORIZE}?${params.toString()}`;
}
