import qrcode from 'qrcode-terminal';
import { CONFIG } from '../lib/config.js';

export interface CreateLoginCodeResult {
  code: string;
  expires_at: string;
  qr_url: string;
}

export interface CreatePaymentCodeResult {
  code: string;
  type: string;
  skill_id: string;
  expires_at: string;
  qr_url: string;
}

/**
 * Call POST /agent/create-login-code to create a login code on the server.
 * No authentication required.
 */
export async function createLoginCode(): Promise<CreateLoginCodeResult> {
  const res = await fetch(CONFIG.AGENT_CREATE_LOGIN_CODE, { method: 'POST' });
  const json = await res.json() as {
    code: string;
    data?: { code: number; message?: string; data?: CreateLoginCodeResult };
  };

  if (json.code === 'OK' && json.data?.code === 0 && json.data.data) {
    return json.data.data;
  }

  throw new Error(json.data?.message || 'Failed to create login code');
}

/**
 * Call POST /agent/create-payment-code to create a payment code on the server.
 * Requires authentication (Bearer token).
 */
export async function createPaymentCode(
  token: string,
  skillId: string,
  type: string = 'one_time',
): Promise<CreatePaymentCodeResult> {
  const url = `${CONFIG.AGENT_CREATE_PAYMENT_CODE}?skill_id=${encodeURIComponent(skillId)}&type=${encodeURIComponent(type)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const json = await res.json() as {
    code: string;
    data?: { code: number; message?: string; data?: CreatePaymentCodeResult };
  };

  if (json.code === 'OK' && json.data?.code === 0 && json.data.data) {
    return json.data.data;
  }

  throw new Error(json.data?.message || 'Failed to create payment code');
}

/**
 * Display a QR code in the terminal.
 */
export function displayQRCode(url: string): void {
  qrcode.generate(url, { small: true });
}

/**
 * Poll the agent auth-code verification API.
 * Resolves with the response data when the code is verified.
 * Rejects on timeout or error.
 */
export function pollAuthCode<T>(
  code: string,
  type: 'login' | 'payment',
  timeoutMs: number = CONFIG.AUTH_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = `${CONFIG.AGENT_AUTH_CODE}?code=${encodeURIComponent(code)}&type=${type}`;
    const startTime = Date.now();

    async function poll() {
      if (Date.now() - startTime >= timeoutMs) {
        reject(new Error('Verification timed out. Please try again.'));
        return;
      }

      try {
        const res = await fetch(url);
        const json = await res.json() as {
          code: string;
          data?: { code: number; message?: string; data?: T };
        };

        // Outer envelope: code "OK", then check inner code
        if (json.code === 'OK' && json.data) {
          if (json.data.code === 0 && json.data.data) {
            resolve(json.data.data);
            return;
          }
          // Inner code non-zero (e.g. 4007 "Code not found"), keep polling
        }

        // Other responses, keep polling
      } catch {
        // Network error, keep polling
      }

      setTimeout(poll, CONFIG.AUTH_POLL_INTERVAL_MS);
    }

    poll();
  });
}
