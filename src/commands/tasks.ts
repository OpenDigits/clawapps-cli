import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getBase } from '../lib/base-url.js';
import { listTasks, type TasksListParams } from '../lib/relay-client.js';

interface TasksListOptions {
  status?: string;
  action?: string;
  parentId?: string;
  hasParent?: boolean;
  includeChildren?: boolean;
  tree?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit?: string;
  offset?: string;
}

function jsonOut(obj: unknown) { process.stdout.write(JSON.stringify(obj) + '\n'); }

async function authHeaders() {
  const creds = await resolveCredentials();
  return { Authorization: `Bearer ${creds.access_token}` };
}

async function relayJson(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { ...(await authHeaders()) };
  let payload: string | undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${getBase()}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { message: text }; }
  return { status: res.status, body: parsed };
}

function emit(status: number, body: unknown) {
  if (status >= 200 && status < 300) {
    jsonOut(body);
  } else {
    jsonOut({ http: status, ...(typeof body === 'object' && body ? body : { message: body }) });
    process.exit(1);
  }
}

function parseJsonOpt(name: string, raw?: string): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { jsonOut({ error: `--${name} must be valid JSON` }); process.exit(1); }
}

// GET /task_records — list. Kept for back-compat with prior `clawapps tasks` no-arg call.
export async function tasksCommand(opts: TasksListOptions) {
  try {
    const creds = await resolveCredentials();
    const params: TasksListParams = {
      status: opts.status,
      action: opts.action,
      parent_id: opts.parentId,
      has_parent: opts.hasParent,
      include_children: opts.includeChildren,
      tree: opts.tree,
      date_from: opts.dateFrom,
      date_to: opts.dateTo,
      limit: opts.limit ? Number(opts.limit) : undefined,
      offset: opts.offset ? Number(opts.offset) : undefined,
    };
    jsonOut(await listTasks(creds.access_token, params));
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// POST /task_records — create a task. Action defaults to 'agent_task'.
// status starts at 'pending'; subsequent PATCH advances state machine.
export async function tasksCreate(opts: {
  title?: string;
  action?: string;
  args?: string;
  parentId?: string;
  description?: string;
}) {
  if (!opts.title) { jsonOut({ error: '--title required' }); process.exit(1); }
  const body: Record<string, unknown> = {
    title: opts.title,
    action: opts.action || 'agent_task',
  };
  if (opts.args) body.args = parseJsonOpt('args', opts.args);
  if (opts.parentId) body.parent_id = opts.parentId;
  if (opts.description) body.description = opts.description;
  try {
    const { status, body: resp } = await relayJson('POST', '/cli/v1/tasks', body);
    emit(status, resp);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// GET /task_records/:id — single detail with subtasks[] embedded.
export async function tasksGet(taskId: string) {
  if (!taskId) { jsonOut({ error: 'task_id required' }); process.exit(1); }
  try {
    const { status, body } = await relayJson('GET', `/cli/v1/tasks/${encodeURIComponent(taskId)}`);
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// PATCH /task_records/:id — update status / title / result / etc.
// status→running auto-stamps started_at; →completed/failed auto-stamps completed_at.
// status cannot be patched to 'deleted' (pydantic pattern rejects); use `tasks delete`.
export async function tasksUpdate(taskId: string, opts: {
  status?: string;
  title?: string;
  description?: string;
  result?: string;
  error?: string;
  aiWorkUrl?: string;
  aiWorkId?: string;
}) {
  if (!taskId) { jsonOut({ error: 'task_id required' }); process.exit(1); }
  const body: Record<string, unknown> = {};
  if (opts.status) body.status = opts.status;
  if (opts.title) body.title = opts.title;
  if (opts.description !== undefined) body.description = opts.description;
  if (opts.result) body.result = parseJsonOpt('result', opts.result);
  if (opts.error !== undefined) body.error = opts.error;
  if (opts.aiWorkUrl !== undefined) body.ai_work_url = opts.aiWorkUrl;
  if (opts.aiWorkId !== undefined) body.ai_work_id = opts.aiWorkId;
  if (Object.keys(body).length === 0) {
    jsonOut({ error: 'at least one field (--status/--title/--result/...) required' });
    process.exit(1);
  }
  try {
    const { status, body: resp } = await relayJson('PATCH', `/cli/v1/tasks/${encodeURIComponent(taskId)}`, body);
    emit(status, resp);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// DELETE /task_records/:id — soft delete (status='deleted'). Row preserved.
export async function tasksDelete(taskId: string) {
  if (!taskId) { jsonOut({ error: 'task_id required' }); process.exit(1); }
  try {
    const { status, body } = await relayJson('DELETE', `/cli/v1/tasks/${encodeURIComponent(taskId)}`);
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// POST /task_records/:id/stop — transition running/pending → paused; if delegated,
// linked Task B also paused. Forwards to Gateway task-stop when owner workspace
// resolvable; falls back to local pause + error="node not found" otherwise.
export async function tasksStop(taskId: string) {
  if (!taskId) { jsonOut({ error: 'task_id required' }); process.exit(1); }
  try {
    const { status, body } = await relayJson('POST', `/cli/v1/tasks/${encodeURIComponent(taskId)}/stop`);
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}
