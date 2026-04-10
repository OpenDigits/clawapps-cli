import { CONFIG } from '../lib/config.js';

/**
 * Build the Google OAuth implicit flow URL.
 * Uses response_type=token to get access_token in the URL hash fragment.
 */
export function buildGoogleAuthUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'openid email profile',
    prompt: 'select_account',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
