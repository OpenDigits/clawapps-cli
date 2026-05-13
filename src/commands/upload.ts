import { stat, readFile } from 'node:fs/promises';
import { basename, resolve as resolvePath, sep } from 'node:path';
import { homedir } from 'node:os';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getBase } from '../lib/base-url.js';
import { safeErrorMessage } from '../lib/sanitize.js';

const MAX_BYTES = 20 * 1024 * 1024;

// C7 (2026-05-13 pentest): refuse to upload from system / credential paths.
// An AI agent fed a path from an untrusted task queue could be coerced to
// upload /etc/shadow or ~/.ssh/id_rsa. Hard-block these prefixes; require
// CLAWAPPS_ALLOW_ANY_PATH=1 for an explicit, intentional opt-out.
const FORBIDDEN_PREFIXES = [
  '/etc/',
  '/proc/',
  '/sys/',
  '/dev/',
  '/root/.ssh/',
  '/root/.aws/',
  '/root/.config/gcloud/',
];

function validateUploadPath(p: string): void {
  const abs = resolvePath(p);
  const home = homedir();
  // 1. Hard-blocked system / secret paths
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (abs === prefix.replace(/\/$/, '') || abs.startsWith(prefix)) {
      throw new Error(`Refusing to upload from sensitive path: ${abs}`);
    }
  }
  // ~/.ssh, ~/.aws, ~/.gnupg, ~/.clawapps under any home are also blocked.
  for (const dot of ['.ssh', '.aws', '.gnupg', '.clawapps', '.config/gcloud']) {
    if (abs === `${home}/${dot}` || abs.startsWith(`${home}/${dot}/`)) {
      throw new Error(`Refusing to upload from sensitive path: ${abs}`);
    }
  }
  // 2. Default: must be under cwd. Override with CLAWAPPS_ALLOW_ANY_PATH=1.
  const cwd = process.cwd();
  if (abs !== cwd && !abs.startsWith(cwd + sep) && !process.env.CLAWAPPS_ALLOW_ANY_PATH) {
    throw new Error(
      `Upload path '${abs}' is outside the current directory. ` +
      `Set CLAWAPPS_ALLOW_ANY_PATH=1 to override (use only with paths you fully control).`,
    );
  }
}

interface UploadOptions {
  url?: string;
  filename?: string;
  sessionId?: string;
  taskId?: string;
}

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function relayBase(): string {
  return getBase();
}

export async function uploadCommand(path: string | undefined, options: UploadOptions) {
  try {
    const hasPath = !!path;
    const hasUrl = !!options.url;
    if (hasPath === hasUrl) {
      jsonOut({ event: 'error', code: 'INVALID_ARGS', message: 'Provide exactly one of <path> or --url' });
      process.exit(1);
    }

    const creds = await resolveCredentials();

    const params = new URLSearchParams();
    if (options.sessionId) params.set('session_id', options.sessionId);
    if (options.taskId) params.set('task_id', options.taskId);

    let response: Response;

    if (hasPath) {
      try {
        validateUploadPath(path!);
      } catch (e) {
        jsonOut({ event: 'error', code: 'PATH_FORBIDDEN', message: safeErrorMessage(e) });
        process.exit(1);
      }
      const st = await stat(path!).catch(() => null);
      if (!st) {
        jsonOut({ event: 'error', code: 'NOT_FOUND', message: `File not found: ${path}` });
        process.exit(5);
      }
      if (!st.isFile()) {
        jsonOut({ event: 'error', code: 'NOT_A_FILE', message: `Not a regular file: ${path}` });
        process.exit(1);
      }
      if (st.size > MAX_BYTES) {
        jsonOut({
          event: 'error',
          code: 'FILE_TOO_LARGE',
          message: `File size ${st.size} bytes exceeds 20 MB limit (${MAX_BYTES} bytes)`,
          size: st.size,
          limit: MAX_BYTES,
        });
        process.exit(1);
      }

      const buf = await readFile(path!);
      const fd = new FormData();
      fd.append('file', new Blob([buf]), options.filename || basename(path!));

      const qs = params.toString();
      const url = `${relayBase()}/cli/v1/files/upload${qs ? '?' + qs : ''}`;
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${creds.access_token}` },
        body: fd,
      });
    } else {
      try {
        const u = new URL(options.url!);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          throw new Error('URL must be http or https');
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        jsonOut({ event: 'error', code: 'INVALID_URL', message: msg });
        process.exit(1);
      }

      params.set('url', options.url!);
      if (options.filename) params.set('filename', options.filename);

      const url = `${relayBase()}/cli/v1/files/upload?${params.toString()}`;
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${creds.access_token}` },
      });
    }

    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }

    if (!response.ok) {
      const code =
        response.status === 401 ? 'AUTH_FAILED' :
        response.status === 402 ? 'INSUFFICIENT_CREDITS' :
        response.status === 413 ? 'FILE_TOO_LARGE' :
        response.status === 404 ? 'NOT_FOUND' :
        response.status === 504 ? 'UPLOAD_TIMEOUT' :
        'UPSTREAM_ERROR';
      const exitCode =
        response.status === 401 ? 2 :
        response.status === 402 ? 4 :
        response.status === 404 ? 5 :
        3;
      const b = body as Record<string, unknown>;
      const msg = b?.message ?? b?.detail ?? `HTTP ${response.status}`;
      jsonOut({ event: 'error', code, message: typeof msg === 'string' ? msg : String(msg) });
      process.exit(exitCode);
    }

    const flat = (body as { data?: unknown }).data ?? body;
    jsonOut({ event: 'uploaded', ...((flat as Record<string, unknown>) || {}) });
  } catch (err: unknown) {
    const msg = safeErrorMessage(err);
    jsonOut({ event: 'error', code: 'CLI_ERROR', message: msg });
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 3);
  }
}
