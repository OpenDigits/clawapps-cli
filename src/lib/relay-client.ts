import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { CONFIG } from './config.js';
import { parseSSE } from './sse-parser.js';
import type { RelaySessionResponse, RelayBalanceResponse, SSEEvent, SessionStore, SessionInfo } from './types.js';

function relayUrl(path: string): string {
  const base = process.env.CLAWAPPS_RELAY_URL || CONFIG.CLI_RELAY_BASE;
  return `${base}${path}`;
}

function authHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Create a new session on the Relay.
 */
export async function createSession(token: string): Promise<RelaySessionResponse> {
  const res = await fetch(relayUrl('/session'), {
    method: 'POST',
    headers: authHeaders(token),
    body: '{}',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText })) as Record<string, string>;
    throw new Error(err.message || `Session creation failed (${res.status})`);
  }

  return await res.json() as RelaySessionResponse;
}

/**
 * Send a message and yield SSE events as they arrive.
 */
export async function* sendMessage(
  token: string,
  sessionId: string,
  content: string,
): AsyncGenerator<SSEEvent> {
  const res = await fetch(relayUrl(`/session/${sessionId}/message`), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ content }),
    signal: AbortSignal.timeout(CONFIG.CLI_MESSAGE_TIMEOUT_MS),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText })) as Record<string, string>;
    throw new Error(err.message || `Send failed (${res.status})`);
  }

  if (!res.body) {
    throw new Error('No response body (SSE stream expected)');
  }

  yield* parseSSE(res.body);
}

/**
 * Stop processing for a session.
 */
export async function stopProcessing(token: string, sessionId: string): Promise<void> {
  await fetch(relayUrl(`/session/${sessionId}/stop`), {
    method: 'POST',
    headers: authHeaders(token),
    body: '{}',
  });
}

/**
 * Close a session.
 */
export async function closeSession(token: string, sessionId: string): Promise<void> {
  await fetch(relayUrl(`/session/${sessionId}`), {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
}

/**
 * Get credit balance.
 */
export async function getBalance(token: string): Promise<RelayBalanceResponse> {
  const res = await fetch(relayUrl('/balance'), {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText })) as Record<string, string>;
    throw new Error(err.message || `Balance check failed (${res.status})`);
  }

  return await res.json() as RelayBalanceResponse;
}

// --- Local session persistence ---

function sessionsPath(): string {
  return join(homedir(), CONFIG.CREDENTIALS_DIR, CONFIG.SESSIONS_FILE);
}

export async function loadSessions(): Promise<SessionStore> {
  try {
    const data = await readFile(sessionsPath(), 'utf-8');
    return JSON.parse(data) as SessionStore;
  } catch {
    return { sessions: {} };
  }
}

export async function saveSession(info: SessionInfo): Promise<void> {
  const store = await loadSessions();
  store.sessions[info.session_id] = info;
  store.last_session_id = info.session_id;

  const dir = join(homedir(), CONFIG.CREDENTIALS_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(sessionsPath(), JSON.stringify(store, null, 2), 'utf-8');
}

export async function clearSessions(): Promise<void> {
  const dir = join(homedir(), CONFIG.CREDENTIALS_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(sessionsPath(), JSON.stringify({ sessions: {} }, null, 2), 'utf-8');
}

export async function getLastSessionId(): Promise<string | null> {
  const store = await loadSessions();
  return store.last_session_id || null;
}
