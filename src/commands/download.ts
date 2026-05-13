import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, basename, resolve, sep } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getDownloadUrl } from '../lib/relay-client.js';
import { safeErrorMessage } from '../lib/sanitize.js';

// C6 (2026-05-13 pentest): `--output` accepted absolute paths and `..`,
// letting an AI agent be coerced (by an upstream prompt / task description)
// to write over ~/.ssh/authorized_keys, /etc/cron.d/*, etc. Sandbox the
// output path to cwd by default; opt out with CLAWAPPS_ALLOW_ABSOLUTE_OUTPUT=1
// only when the agent operator explicitly trusts the caller.
//
// Validation runs BEFORE network calls so a malformed --output fails fast
// (no useless backend round-trip, no token leak window).
function validateUserOutput(userOutput: string | undefined): void {
  if (!userOutput) return;
  if (process.env.CLAWAPPS_ALLOW_ABSOLUTE_OUTPUT) return;
  // Explicit reject any path-shape input. We could silently basename() it,
  // but that hides the caller's intent (and makes the rule fail-deaf for
  // AI agents that pass through human-supplied output paths). Reject loudly:
  // the caller must opt out via CLAWAPPS_ALLOW_ABSOLUTE_OUTPUT=1 or pass a
  // bare filename.
  if (
    userOutput.startsWith('/') ||
    userOutput.startsWith('\\') ||
    userOutput.includes('/') ||
    userOutput.includes('\\') ||
    userOutput.includes('..') ||
    userOutput === '.' ||
    userOutput === ''
  ) {
    throw new Error(
      `--output must be a simple filename (got '${userOutput}'). ` +
      `Set CLAWAPPS_ALLOW_ABSOLUTE_OUTPUT=1 to allow paths (use only when the caller is trusted).`,
    );
  }
}

function resolveOutputPath(userOutput: string | undefined, fallbackName: string): string {
  if (!userOutput) return resolve(process.cwd(), basename(fallbackName));
  if (process.env.CLAWAPPS_ALLOW_ABSOLUTE_OUTPUT) return resolve(userOutput);
  return resolve(process.cwd(), basename(userOutput));
}

interface DownloadOptions {
  output?: string;
}

function jsonOut(obj: Record<string, unknown>) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function parseFilename(disposition: string | null): string | null {
  if (!disposition) return null;
  const m = /filename\*?=(?:UTF-8'')?\"?([^\";]+)\"?/i.exec(disposition);
  return m ? decodeURIComponent(m[1]) : null;
}

export async function downloadCommand(fileId: string, options: DownloadOptions) {
  if (!fileId) {
    jsonOut({ event: 'error', code: 'INVALID_ARGS', message: 'file id required' });
    process.exit(1);
  }

  try {
    // C6: fail-fast on bad --output before any network / auth work.
    try {
      validateUserOutput(options.output);
    } catch (e) {
      jsonOut({ event: 'error', code: 'OUTPUT_FORBIDDEN', message: safeErrorMessage(e) });
      process.exit(1);
    }
    const creds = await resolveCredentials();
    const meta = await getDownloadUrl(creds.access_token, fileId);
    if (!meta.url) {
      jsonOut({ event: 'error', code: 'NO_URL', message: 'Backend did not return a download URL' });
      process.exit(1);
    }

    const res = await fetch(meta.url);
    if (!res.ok || !res.body) {
      jsonOut({ event: 'error', code: 'DOWNLOAD_FAILED', message: `signed URL fetch ${res.status}` });
      process.exit(1);
    }

    const headerName = parseFilename(res.headers.get('content-disposition'));
    const total = meta.size ?? Number(res.headers.get('content-length') || 0);
    const fallbackName = meta.filename || headerName || `${fileId}`;
    const outPath = resolveOutputPath(options.output, fallbackName);
    await mkdir(dirname(outPath), { recursive: true });

    let bytes = 0;
    let lastEmit = 0;
    const progress = new Writable({
      write(chunk, _enc, cb) {
        bytes += chunk.length;
        const now = Date.now();
        if (now - lastEmit > 500) {
          lastEmit = now;
          jsonOut({ event: 'progress', bytes, total: total || null });
        }
        cb();
      },
    });

    const fileStream = createWriteStream(outPath);
    // Tee the body to both progress + file
    const reader = res.body.getReader();
    const pumpProgress = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        progress.write(value);
        if (!fileStream.write(value)) {
          await new Promise<void>((r) => fileStream.once('drain', () => r()));
        }
      }
      fileStream.end();
      progress.end();
    };
    await pumpProgress();
    await new Promise<void>((r, rej) => {
      fileStream.on('finish', () => r());
      fileStream.on('error', rej);
    });
    void pipeline; // keep import for potential future use

    jsonOut({ event: 'complete', path: outPath, size: bytes });
  } catch (err: unknown) {
    const msg = safeErrorMessage(err);
    jsonOut({ event: 'error', code: 'CLI_ERROR', message: msg });
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
