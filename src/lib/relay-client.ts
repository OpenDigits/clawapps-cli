import WebSocket from 'ws';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { CONFIG } from './config.js';
import type { RelayBalanceResponse, SessionInfo, SessionStore } from './types.js';

function relayHttpUrl(path: string): string {
  const base = process.env.CLAWAPPS_RELAY_URL || CONFIG.CLI_RELAY_BASE;
  return `${base}${path}`;
}

function relayWsUrl(token: string): string {
  const base = process.env.CLAWAPPS_RELAY_URL || CONFIG.CLI_RELAY_BASE;
  const wsBase = base.replace(/^https/, 'wss').replace(/^http/, 'ws');
  return `${wsBase}/ws?token=${encodeURIComponent(token)}`;
}

// --- WebSocket relay connection ---

export interface RelayMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Connect to Relay via WebSocket.
 */
export async function connectRelay(token: string): Promise<RelayConnection> {
  const wsUrl = relayWsUrl(token);

  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error('Connection timeout'));
    }, CONFIG.CLI_CONNECT_TIMEOUT_MS);

    socket.on('open', () => { clearTimeout(timeout); resolve(socket); });
    socket.on('error', (err) => { clearTimeout(timeout); reject(new Error(`Connection failed: ${err.message}`)); });
  });

  // Wait for {type:"connected"} from Relay
  const connMsg = await waitForMessage(ws, 'connected', CONFIG.CLI_CONNECT_TIMEOUT_MS);

  return new RelayConnection(ws, connMsg.session_id as string, connMsg.mode as string);
}

function waitForMessage(ws: WebSocket, expectedType: string, timeoutMs: number): Promise<RelayMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Timeout waiting for "${expectedType}"`));
    }, timeoutMs);

    function handler(data: WebSocket.RawData) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === expectedType) {
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          resolve(msg);
        }
      } catch { /* keep waiting */ }
    }

    ws.on('message', handler);
  });
}

export class RelayConnection {
  ws: WebSocket;
  sessionId: string;
  mode: string;

  constructor(ws: WebSocket, sessionId: string, mode: string) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.mode = mode;
  }

  send(action: Record<string, unknown>) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(action));
    }
  }

  /**
   * Send a message and yield responses until complete/error.
   */
  async *sendMessage(content: string): AsyncGenerator<RelayMessage> {
    this.send({ action: 'message', content });

    const queue: RelayMessage[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    const handler = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as RelayMessage;
        queue.push(msg);
        if (resolve) { resolve(); resolve = null; }
      } catch { /* ignore */ }
    };

    this.ws.on('message', handler);

    try {
      while (!done) {
        if (queue.length === 0) {
          await new Promise<void>((r) => { resolve = r; });
        }
        while (queue.length > 0) {
          const msg = queue.shift()!;
          yield msg;
          if (msg.type === 'complete' || msg.type === 'error') {
            done = true;
            break;
          }
        }
      }
    } finally {
      this.ws.removeListener('message', handler);
    }
  }

  /**
   * Listen for all messages (including push).
   */
  async *listen(): AsyncGenerator<RelayMessage> {
    const queue: RelayMessage[] = [];
    let resolve: (() => void) | null = null;
    let closed = false;

    const handler = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as RelayMessage;
        queue.push(msg);
        if (resolve) { resolve(); resolve = null; }
      } catch { /* ignore */ }
    };

    const closeHandler = () => {
      closed = true;
      if (resolve) { resolve(); resolve = null; }
    };

    this.ws.on('message', handler);
    this.ws.on('close', closeHandler);

    try {
      while (!closed) {
        if (queue.length === 0) {
          await new Promise<void>((r) => { resolve = r; });
        }
        while (queue.length > 0) {
          yield queue.shift()!;
        }
      }
    } finally {
      this.ws.removeListener('message', handler);
      this.ws.removeListener('close', closeHandler);
    }
  }

  stop() {
    this.send({ action: 'stop' });
  }

  close() {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1000, 'Client close');
    }
  }
}

// --- HTTP endpoints ---

export async function getBalance(token: string): Promise<RelayBalanceResponse> {
  const res = await fetch(relayHttpUrl('/balance'), {
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
