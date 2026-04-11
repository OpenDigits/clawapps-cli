import { pollLoginCode } from '../lib/login-service.js';

/**
 * Poll for login code verification. Outputs JSON events.
 * Designed for AI agent integration.
 */
export async function loginPollCommand(code: string) {
  function jsonOut(obj: Record<string, unknown>) {
    process.stdout.write(JSON.stringify(obj) + '\n');
  }

  try {
    const result = await pollLoginCode(code, (remaining) => {
      if (remaining % 30 === 0) {
        jsonOut({ event: 'waiting', remaining });
      }
    });

    if (result.success) {
      jsonOut({ event: 'login_success', display_name: result.display_name || null });
    } else {
      jsonOut({ event: 'error', code: 'LOGIN_FAILED', message: result.error });
      process.exit(1);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    jsonOut({ event: 'error', code: 'POLL_ERROR', message: msg });
    process.exit(1);
  }
}
