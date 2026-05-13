import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getBase } from '../lib/base-url.js';
import { listSchedules } from '../lib/relay-client.js';

function jsonOut(obj: unknown) { process.stdout.write(JSON.stringify(obj) + '\n'); }

async function authHeaders(extra: Record<string, string> = {}) {
  const creds = await resolveCredentials();
  return { Authorization: `Bearer ${creds.access_token}`, ...extra };
}

async function relayJson(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { ...(await authHeaders(extraHeaders)) };
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

// GET /scheduled_tasks — list. Kept for back-compat with prior `clawapps schedules`.
export async function schedulesCommand() {
  try {
    const creds = await resolveCredentials();
    jsonOut(await listSchedules(creds.access_token));
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// POST /scheduled_tasks — create cron or once schedule.
// Delegation mode: pass --bridge-workspace + --executing-role-id (+ --caller-role-id)
// → cli-relay forwards as X-Bridge-Workspace / X-Executing-Role-Id / X-Caller-Role-Id
// headers per BE spec line 56.
export async function schedulesCreate(opts: {
  name?: string;
  type?: string;
  cronExpr?: string;
  runAt?: string;
  action?: string;
  args?: string;
  timezone?: string;
  bridgeWorkspace?: string;
  executingRoleId?: string;
  callerRoleId?: string;
}) {
  if (!opts.name) { jsonOut({ error: '--name required' }); process.exit(1); }
  if (!opts.type || !['cron', 'once'].includes(opts.type)) {
    jsonOut({ error: '--type must be cron or once' }); process.exit(1);
  }
  if (opts.type === 'cron' && !opts.cronExpr) {
    jsonOut({ error: '--cron-expr required when --type=cron' }); process.exit(1);
  }
  if (opts.type === 'once' && !opts.runAt) {
    jsonOut({ error: '--run-at required when --type=once' }); process.exit(1);
  }
  if (!opts.action) { jsonOut({ error: '--action required' }); process.exit(1); }
  const body: Record<string, unknown> = {
    name: opts.name,
    schedule_type: opts.type,
    action: opts.action,
  };
  if (opts.cronExpr) body.cron_expr = opts.cronExpr;
  if (opts.runAt) body.run_at = opts.runAt;
  if (opts.timezone) body.timezone = opts.timezone;
  if (opts.args) body.args = parseJsonOpt('args', opts.args);
  const extraHeaders: Record<string, string> = {};
  if (opts.bridgeWorkspace) extraHeaders['X-Bridge-Workspace'] = opts.bridgeWorkspace;
  if (opts.executingRoleId) extraHeaders['X-Executing-Role-Id'] = opts.executingRoleId;
  if (opts.callerRoleId) extraHeaders['X-Caller-Role-Id'] = opts.callerRoleId;
  try {
    const { status, body: resp } = await relayJson('POST', '/cli/v1/schedules', body, extraHeaders);
    emit(status, resp);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// PUT /scheduled_tasks/:id — update fields including status (active⇄paused).
export async function schedulesUpdate(scheduleId: string, opts: {
  status?: string;
  name?: string;
  cronExpr?: string;
  runAt?: string;
  args?: string;
  timezone?: string;
}) {
  if (!scheduleId) { jsonOut({ error: 'schedule_id required' }); process.exit(1); }
  const body: Record<string, unknown> = {};
  if (opts.status) body.status = opts.status;
  if (opts.name) body.name = opts.name;
  if (opts.cronExpr) body.cron_expr = opts.cronExpr;
  if (opts.runAt) body.run_at = opts.runAt;
  if (opts.args) body.args = parseJsonOpt('args', opts.args);
  if (opts.timezone) body.timezone = opts.timezone;
  if (Object.keys(body).length === 0) {
    jsonOut({ error: 'at least one field required' }); process.exit(1);
  }
  try {
    const { status, body: resp } = await relayJson('PUT', `/cli/v1/schedules/${encodeURIComponent(scheduleId)}`, body);
    emit(status, resp);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// DELETE /scheduled_tasks/:id — soft delete (status='deleted').
export async function schedulesDelete(scheduleId: string) {
  if (!scheduleId) { jsonOut({ error: 'schedule_id required' }); process.exit(1); }
  try {
    const { status, body } = await relayJson('DELETE', `/cli/v1/schedules/${encodeURIComponent(scheduleId)}`);
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}
