import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, basename, resolve } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import { getDownloadUrl } from '../lib/relay-client.js';

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
    const outPath = resolve(options.output || basename(fallbackName));
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
    const msg = err instanceof Error ? err.message : String(err);
    jsonOut({ event: 'error', code: 'CLI_ERROR', message: msg });
    process.exit(msg.includes('authenticated') || msg.includes('expired') ? 2 : 1);
  }
}
