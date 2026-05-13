import WebSocket from 'ws';
import { readFile, writeFile, mkdir, chmod, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { CONFIG } from './config.js';
import { getBase } from './base-url.js';

// C8 (2026-05-13 pentest): bound a single relay frame so a malicious /
// misbehaving backend can't OOM an automated agent by streaming a 1 GB
// "assistant_text" payload. 10 MB covers any legitimate frame we ship
// (UI tree max ~200 KB, single message ~30 KB).
const WS_MAX_PAYLOAD = 10 * 1024 * 1024;
import type {
  RelayBalanceResponse,
  SessionInfo,
  SessionStore,
  MeResponse,
  Preferences,
  AgentProfileUpdate,
  DownloadUrlResponse,
} from './types.js';

function cliHttpUrl(path: string): string {
  return `${getBase()}/cli/v1${path}`;
}

function cliWsUrl(token: string, forceNewSession = false): string {
  const wsBase = getBase().replace(/^https/, 'wss').replace(/^http/, 'ws');
  const suffix = forceNewSession ? '&new_session=1' : '';
  return `${wsBase}/cli/v1/ws?token=${encodeURIComponent(token)}${suffix}`;
}

// --- WebSocket relay connection ---

export interface RelayMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Connect to Relay via WebSocket.
 */
export async function connectRelay(token: string, opts: { forceNewSession?: boolean } = {}): Promise<RelayConnection> {
  const wsUrl = cliWsUrl(token, opts.forceNewSession === true);

  // Race fix (ISS-02, 2026-05-09): the relay sends `{type:"connected"}`
  // immediately on connection, often before our 'open' handler resolves
  // (especially on the reuse fast-path). Attach the message listener BEFORE
  // awaiting 'open' so we never lose the first frame.
  const socket = new WebSocket(wsUrl, { maxPayload: WS_MAX_PAYLOAD });
  const connectedPromise = waitForMessage(socket, 'connected', CONFIG.CLI_CONNECT_TIMEOUT_MS);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error('Connection timeout'));
    }, CONFIG.CLI_CONNECT_TIMEOUT_MS);

    socket.on('open', () => { clearTimeout(timeout); resolve(); });
    socket.on('error', (err) => { clearTimeout(timeout); reject(new Error(`Connection failed: ${err.message}`)); });
  });

  const connMsg = await connectedPromise;
  return new RelayConnection(socket, connMsg.session_id as string, connMsg.mode as string);
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
        } else if (msg.type === 'error') {
          // R-54: cli-relay returns a specific error frame
          // (e.g. WORKSPACE_NOT_PROVISIONED) instead of the expected
          // 'connected' frame when the user has no workspace yet. Surface
          // it immediately so the caller doesn't hang to timeout.
          clearTimeout(timeout);
          ws.removeListener('message', handler);
          const code = (msg.code as string) || 'CONNECTION_FAILED';
          const detail = (msg.message as string) || code;
          reject(new Error(`${code}: ${detail}`));
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
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(action));
  }

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

async function relayJsonError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => ({ message: res.statusText })) as Record<string, string>;
  return new Error(body.message || body.code || `Request failed (${res.status})`);
}

export async function getBalance(token: string): Promise<RelayBalanceResponse> {
  const res = await fetch(cliHttpUrl('/balance'), {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw await relayJsonError(res);
  return await res.json() as RelayBalanceResponse;
}

// R-21-a: BE 当前仍在 preferences 里回送 preferred_claude_model /
// preferred_codex_model。客户端禁止持有/显示模型族信息，所以在反序列化时
// 主动剥这两个字段（包括 null 值的键名本身）。BE schema 改成不透明 tier
// 之后（R-21-c），此 helper 可移除。
function scrubModelLeaks(payload: Record<string, unknown> | null | undefined): void {
  if (!payload || typeof payload !== 'object') return;
  const prefs = (payload as { preferences?: Record<string, unknown> }).preferences;
  if (prefs && typeof prefs === 'object') {
    delete prefs.preferred_claude_model;
    delete prefs.preferred_codex_model;
  }
  if ('preferred_claude_model' in payload) delete (payload as Record<string, unknown>).preferred_claude_model;
  if ('preferred_codex_model' in payload) delete (payload as Record<string, unknown>).preferred_codex_model;
}

export async function getMe(token: string): Promise<MeResponse> {
  const res = await fetch(cliHttpUrl('/me'), {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw await relayJsonError(res);
  const body = await res.json() as MeResponse;
  scrubModelLeaks(body as unknown as Record<string, unknown>);
  return body;
}

export async function setPreferences(token: string, prefs: Partial<Preferences>): Promise<Preferences> {
  const res = await fetch(cliHttpUrl('/preferences'), {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (res.status === 503) {
    throw new Error('PREFERENCES_UNSUPPORTED: backend preferences endpoint not yet available');
  }
  if (!res.ok) throw await relayJsonError(res);
  const body = await res.json() as Preferences;
  scrubModelLeaks(body as unknown as Record<string, unknown>);
  return body;
}

export async function getAgentProfile(token: string): Promise<Record<string, unknown>> {
  const res = await fetch(cliHttpUrl('/agent/profile'), {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw await relayJsonError(res);
  return await res.json() as Record<string, unknown>;
}

export async function updateAgentProfile(
  token: string,
  payload: AgentProfileUpdate,
): Promise<Record<string, unknown>> {
  const res = await fetch(cliHttpUrl('/agent/profile'), {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await relayJsonError(res);
  return await res.json() as Record<string, unknown>;
}

export async function getDownloadUrl(token: string, fileId: string): Promise<DownloadUrlResponse> {
  const res = await fetch(cliHttpUrl(`/files/${encodeURIComponent(fileId)}/download-url`), {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw await relayJsonError(res);
  return await res.json() as DownloadUrlResponse;
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

// C4 (2026-05-13 pentest): mkdir + chmod 0700 keeps other UIDs from
// listing sessions.json mtime — the file itself is 0600 but the dir was
// world-readable. C12: use tmp + rename so concurrent CLI processes can't
// truncate each other's writes.
async function ensureDir700(): Promise<string> {
  const dir = join(homedir(), CONFIG.CREDENTIALS_DIR);
  await mkdir(dir, { recursive: true });
  try { await chmod(dir, 0o700); } catch { /* best effort */ }
  return dir;
}

async function atomicWrite600(filePath: string, contents: string): Promise<void> {
  const tmp = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(tmp, contents, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, filePath);
}

export async function saveSession(info: SessionInfo): Promise<void> {
  const store = await loadSessions();
  store.sessions[info.session_id] = info;
  store.last_session_id = info.session_id;
  await ensureDir700();
  await atomicWrite600(sessionsPath(), JSON.stringify(store, null, 2));
}

export async function clearSessions(): Promise<void> {
  await ensureDir700();
  await atomicWrite600(sessionsPath(), JSON.stringify({ sessions: {} }, null, 2));
}

export async function getLastSessionId(): Promise<string | null> {
  const store = await loadSessions();
  return store.last_session_id || null;
}

// --- Block 1 listings (Relay proxies to backend) ---

async function relayGet<T>(token: string, path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const qs = params ? '?' + new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)])
  ).toString() : '';
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(cliHttpUrl(path) + qs, { method: 'GET', headers });
  if (!res.ok) throw await relayJsonError(res);
  return await res.json() as T;
}

async function relayDelete(token: string, path: string): Promise<void> {
  const res = await fetch(cliHttpUrl(path), {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) throw await relayJsonError(res);
}

async function relayPostJson<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(cliHttpUrl(path), {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw await relayJsonError(res);
  return await res.json() as T;
}

export interface FilesListParams {
  q?: string;
  installed?: boolean;
  page?: number;
  page_size?: number;
  session_id?: string;
  task_id?: string;
  content_type?: string;
}

export async function listFiles(token: string, params: FilesListParams = {}): Promise<unknown> {
  return relayGet(token, '/files', params as Record<string, unknown> as Record<string, string | number | boolean | undefined>);
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  await relayDelete(token, `/files/${encodeURIComponent(fileId)}`);
}

export async function getStorage(token: string): Promise<unknown> {
  return relayGet(token, '/storage');
}

export async function listRoles(token: string): Promise<unknown> {
  return relayGet(token, '/roles');
}

export async function listSchedules(token: string): Promise<unknown> {
  return relayGet(token, '/schedules');
}

// --- Forum / topics (proxied under /cli/v1/forum/*) ---

export interface ForumTopicCreateInput {
  role_id?: string;
  title: string;
  description?: string;
  body?: string;
  category: string;
  topic_type?: 'default' | 'article' | 'request';
  tags?: string[];
  cover_url?: string;
}

export interface ForumListParams {
  category?: string;
  tag?: string;
  limit?: number;
  cursor?: string;
}

export async function listForumTopics(token: string | undefined, params: ForumListParams = {}): Promise<unknown> {
  return relayGet(token || '', '/forum/topics', params as Record<string, unknown> as Record<string, string | number | boolean | undefined>);
}

export async function getForumTopic(token: string | undefined, topicId: string): Promise<unknown> {
  return relayGet(token || '', `/forum/topics/${encodeURIComponent(topicId)}`);
}

export async function createForumTopic(token: string, input: ForumTopicCreateInput): Promise<unknown> {
  return relayPostJson(token, '/forum/topics', input);
}

export async function deleteForumTopic(token: string, topicId: string): Promise<void> {
  await relayDelete(token, `/forum/topics/${encodeURIComponent(topicId)}`);
}

export interface TasksListParams {
  status?: string;
  action?: string;
  parent_id?: string;
  has_parent?: boolean;
  include_children?: boolean;
  tree?: boolean;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export async function listTasks(token: string, params: TasksListParams = {}): Promise<unknown> {
  return relayGet(token, '/tasks', params as Record<string, unknown> as Record<string, string | number | boolean | undefined>);
}

// --- Activity / Broadcast (Relay proxies under /cli/v1/activities*) ---

import type { ActivityEnvelope, ActivityListResponse } from './types.js';

export interface ActivitiesQuery {
  cursor?: string;
  limit?: number;
  action?: string;
  actor_role_id?: string;
  target_type?: string;
  q?: string;
  visibility?: 'public' | 'private';
}

export async function listActivities(token: string | null, q: ActivitiesQuery = {}): Promise<ActivityListResponse> {
  const params: Record<string, string | number | boolean | undefined> = q as unknown as Record<string, string | number | boolean | undefined>;
  return relayGet<ActivityListResponse>(token || '', '/activities', params);
}

export async function getActivity(token: string, id: string): Promise<ActivityEnvelope> {
  return relayGet<ActivityEnvelope>(token, `/activities/${encodeURIComponent(id)}`);
}

export async function listActivitiesByRole(token: string, roleId: string, q: ActivitiesQuery = {}): Promise<ActivityListResponse> {
  return relayGet<ActivityListResponse>(token, `/activities/by-role/${encodeURIComponent(roleId)}`, q as unknown as Record<string, string | number | boolean | undefined>);
}

export async function recentActivities(token: string | null): Promise<ActivityListResponse> {
  // /recent is anonymous-friendly; pass through Authorization if we have one
  // (gives higher rate-limit budget). relayGet always sends bearer; for
  // truly anonymous calls use plain fetch.
  if (!token) {
    const res = await fetch(cliHttpUrl('/activities/recent'));
    if (!res.ok) throw await relayJsonError(res);
    return await res.json() as ActivityListResponse;
  }
  return relayGet<ActivityListResponse>(token, '/activities/recent');
}
