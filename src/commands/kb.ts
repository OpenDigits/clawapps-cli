import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getBase } from '../lib/base-url.js';

function jsonOut(obj: unknown) { process.stdout.write(JSON.stringify(obj) + '\n'); }

async function authHeaders() {
  const creds = await resolveCredentials();
  return { Authorization: `Bearer ${creds.access_token}` };
}

// Always await authHeaders BEFORE getBase(): resolveCredentials sets the
// per-channel base URL (wechat→.cn / whatsapp→.ai); skipping the await
// makes getBase() fall back to WHATSAPP_BASE and land on the wrong relay.

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

interface KbIngestOptions {
  roleId?: string;
  fileId?: string[];
  remove?: boolean;
}

// POST /agent/kb/ingest — three semantics keyed by body:
//   owner path: { role_id: <user's default agent role>, file_ids: [...] }
//   role path:  { role_id: <pro role>, file_ids: [<already kb files>] }
//   remove:     { role_id: <id>, file_ids: [] }  (CLI: --remove)
// Returns 202 + job_id (async, Bridge processes 10-30s). Caller polls
// `clawapps kb list` or `kb scan` for completion.
export async function kbIngest(opts: KbIngestOptions) {
  if (!opts.roleId) {
    jsonOut({ error: '--role-id is required' });
    process.exit(1);
  }
  const fileIds = opts.remove ? [] : (opts.fileId ?? []);
  if (!opts.remove && fileIds.length === 0) {
    jsonOut({ error: 'at least one --file-id required (or pass --remove to detach all)' });
    process.exit(1);
  }
  try {
    const { status, body } = await relayJson('POST', '/cli/v1/agent/kb/ingest', {
      role_id: opts.roleId,
      file_ids: fileIds,
    });
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// POST /agent/kb/scan — pull Gateway raw_sources, backfill is_knowledge +
// kb_slug onto user_files rows. Idempotent; used as fallback when callback
// got lost.
export async function kbScan(opts: { roleId?: string }) {
  try {
    const body: Record<string, unknown> = {};
    if (opts.roleId) body.role_id = opts.roleId;
    const { status, body: resp } = await relayJson('POST', '/cli/v1/agent/kb/scan', body);
    emit(status, resp);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// GET /agent/kb/list — list user's KB files. With ?role_id=X, each item gets
// `is_installed` flag and the response includes `installed_count`.
export async function kbList(opts: { roleId?: string }) {
  const qs = opts.roleId ? `?role_id=${encodeURIComponent(opts.roleId)}` : '';
  try {
    const { status, body } = await relayJson('GET', `/cli/v1/agent/kb/list${qs}`);
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// kb status — shorthand for `kb list --role-id X | jq .job` to check the
// most recent ingest job state on the role (running/completed/failed).
// Reads same /agent/kb/list endpoint; BE spec §1.2 says agent_role.ingest_job_*
// is surfaced in list response.
export async function kbStatus(opts: { roleId?: string }) {
  if (!opts.roleId) {
    jsonOut({ error: '--role-id is required' });
    process.exit(1);
  }
  try {
    const { status, body } = await relayJson(
      'GET',
      `/cli/v1/agent/kb/list?role_id=${encodeURIComponent(opts.roleId)}`,
    );
    if (status >= 200 && status < 300 && typeof body === 'object' && body) {
      const b = body as Record<string, unknown>;
      jsonOut({
        role_id: opts.roleId,
        ingest_job_id: b.ingest_job_id ?? null,
        ingest_job_status: b.ingest_job_status ?? null,
        installed_count: b.installed_count ?? null,
      });
    } else {
      emit(status, body);
    }
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// Alias for `kb ingest --remove`. Detaches every kb file from the given role
// in one call (BE spec KB28: file_ids=[] → role_installed_files DELETE WHERE
// role_id=?).
export async function kbDetach(opts: { roleId?: string }) {
  await kbIngest({ roleId: opts.roleId, remove: true });
}

// POST /agent/kb/reset {mode:"soft"|"hard"} — Agent spec S10. Admin-gated
// (cli-relay injects X-Cluster-Secret from env).
// soft: archive existing wiki/indexes to archived/{ts}/, raw → inbox
// hard: 全清 (raw + wiki + indexes + inbox + archived)
export async function kbReset(opts: { mode?: string }) {
  const mode = opts.mode || 'soft';
  if (mode !== 'soft' && mode !== 'hard') {
    jsonOut({ error: `--mode must be soft or hard (got: ${mode})` });
    process.exit(1);
  }
  try {
    const { status, body } = await relayJson('POST', '/cli/v1/agent/kb/reset', { mode });
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// POST /agent/kb/rebuild — Agent spec S11. Admin-gated.
// raw → inbox → 清 wiki/indexes → 重 ingest 所有 raw
export async function kbRebuild() {
  try {
    const { status, body } = await relayJson('POST', '/cli/v1/agent/kb/rebuild', {});
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// POST /agent/kb/callback — server-to-server simulation for KB30-KB33 auth
// matrix testing. cli-relay injects X-Cluster-Secret; BE accepts.
// In prod this is called by Bridge directly. CLI exposes it only for testing
// the BE callback handler's payload semantics.
interface KbCallbackOptions {
  jobId?: string;
  fileId?: string;
  slug?: string;
  status?: string;
}
export async function kbCallback(opts: KbCallbackOptions) {
  const body: Record<string, unknown> = {
    job_id: opts.jobId,
    file_id: opts.fileId,
    slug: opts.slug,
    status: opts.status || 'completed',
  };
  try {
    const { status: code, body: resp } = await relayJson('POST', '/cli/v1/agent/kb/callback', body);
    emit(code, resp);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}
