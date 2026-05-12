import { stat, readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getBase } from '../lib/base-url.js';

function jsonOut(obj: unknown) { process.stdout.write(JSON.stringify(obj) + '\n'); }

const VISIBILITY_VALUES = ['public', 'private'];
const UPDATE_KEYS = new Set([
  'title', 'short_description', 'long_description',
  'category_slug', 'pricing_type', 'price_amount',
]);

async function authHeaders() {
  const creds = await resolveCredentials();
  return { Authorization: `Bearer ${creds.access_token}` };
}

// Always await authHeaders/resolveCredentials BEFORE getBase(): resolveCredentials
// sets the per-channel base URL (wechat→.cn / whatsapp→.ai). Otherwise getBase()
// falls back to WHATSAPP_BASE and lands on the wrong relay.

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

async function uploadMultipart(path: string, relayPath: string, extraFields?: Record<string, string>) {
  const st = await stat(path).catch(() => null);
  if (!st || !st.isFile()) {
    jsonOut({ error: `File not found or not a regular file: ${path}` });
    process.exit(1);
  }
  const headers = await authHeaders();
  const buf = await readFile(path);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), basename(path));
  if (extraFields) for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);
  const res = await fetch(`${getBase()}${relayPath}`, {
    method: 'POST',
    headers,
    body: fd,
  });
  const text = await res.text();
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { parsed = { message: text }; }
  emit(res.status, parsed);
}

export async function skillsUpload(zipPath: string, opts: { description?: string }) {
  try {
    const extra: Record<string, string> = {};
    if (opts.description) extra.short_description = opts.description;
    await uploadMultipart(zipPath, '/cli/v1/skills/upload', extra);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function skillsUploadNewVersion(skillId: string, zipPath: string) {
  try {
    await uploadMultipart(zipPath, `/cli/v1/skills/${encodeURIComponent(skillId)}/upload-new-version`);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function skillsUpdate(skillId: string, pairs: string[]) {
  try {
    const body: Record<string, unknown> = {};
    for (const p of pairs) {
      const eq = p.indexOf('=');
      if (eq < 0) { jsonOut({ error: `bad pair: ${p}` }); process.exit(1); }
      const k = p.slice(0, eq);
      const v = p.slice(eq + 1);
      if (!UPDATE_KEYS.has(k)) {
        jsonOut({ error: `unknown key: ${k}. allowed: ${[...UPDATE_KEYS].join(', ')}` });
        process.exit(1);
      }
      body[k] = k === 'price_amount' ? Number(v) : v;
    }
    const { status, body: out } = await relayJson('PUT', `/cli/v1/skills/${encodeURIComponent(skillId)}`, body);
    emit(status, out);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function skillsVisibility(skillId: string, value: string) {
  if (!VISIBILITY_VALUES.includes(value)) {
    jsonOut({ error: `visibility must be one of: ${VISIBILITY_VALUES.join(', ')}` });
    process.exit(1);
  }
  try {
    const { status, body } = await relayJson(
      'PATCH', `/cli/v1/skills/${encodeURIComponent(skillId)}/visibility`, { visibility: value },
    );
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function skillsRollback(skillId: string, version: string) {
  try {
    const { status, body } = await relayJson(
      'POST',
      `/cli/v1/skills/${encodeURIComponent(skillId)}/rollback/${encodeURIComponent(version)}`,
    );
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function skillsDelete(skillId: string) {
  try {
    const { status, body } = await relayJson('DELETE', `/cli/v1/skills/${encodeURIComponent(skillId)}`);
    if (status === 204) { jsonOut({ deleted: true, skill_id: skillId }); return; }
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function skillsMine() {
  try {
    const { status, body } = await relayJson('GET', '/cli/v1/skills/mine');
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

interface ListOpts { category?: string; tag?: string; limit?: string; cursor?: string }
export async function skillsList(opts: ListOpts) {
  try {
    const q = new URLSearchParams();
    if (opts.category) q.set('category', opts.category);
    if (opts.tag) q.set('tag', opts.tag);
    if (opts.limit) q.set('limit', opts.limit);
    if (opts.cursor) q.set('cursor', opts.cursor);
    const qs = q.toString();
    const { status, body } = await relayJson('GET', `/cli/v1/skills${qs ? '?' + qs : ''}`);
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function skillsGet(skillId: string) {
  try {
    const { status, body } = await relayJson('GET', `/cli/v1/skills/${encodeURIComponent(skillId)}`);
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

// Install / uninstall / upgrade — nested under role per BE routing.
// role_id is REQUIRED; caller must own the role; skill must be ACTIVE.
export async function skillsInstall(skillId: string, opts: { roleId?: string }) {
  if (!opts.roleId) {
    jsonOut({ error: '--role-id is required (caller must own the role)' });
    process.exit(1);
  }
  try {
    const { status, body } = await relayJson(
      'POST',
      `/cli/v1/roles/${encodeURIComponent(opts.roleId)}/skills/${encodeURIComponent(skillId)}/install`,
    );
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function skillsUninstall(skillId: string, opts: { roleId?: string }) {
  if (!opts.roleId) {
    jsonOut({ error: '--role-id is required' });
    process.exit(1);
  }
  try {
    const { status, body } = await relayJson(
      'DELETE',
      `/cli/v1/roles/${encodeURIComponent(opts.roleId)}/skills/${encodeURIComponent(skillId)}/install`,
    );
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function skillsUpgrade(skillId: string, opts: { roleId?: string }) {
  if (!opts.roleId) {
    jsonOut({ error: '--role-id is required' });
    process.exit(1);
  }
  try {
    const { status, body } = await relayJson(
      'POST',
      `/cli/v1/roles/${encodeURIComponent(opts.roleId)}/skills/${encodeURIComponent(skillId)}/upgrade`,
    );
    emit(status, body);
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}
