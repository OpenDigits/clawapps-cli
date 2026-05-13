import { resolveCredentials } from './helpers/resolve-credentials.js';
import { listFiles, deleteFile, getDownloadUrl, type FilesListParams } from '../lib/relay-client.js';

interface FilesListOptions {
  query?: string;
  installed?: string;
  page?: string;
  pageSize?: string;
  sessionId?: string;
  taskId?: string;
  contentType?: string;
}

function jsonOut(obj: unknown) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function fail(msg: string, code = 1): never {
  jsonOut({ error: msg });
  process.exit(code);
}

export async function filesListCommand(opts: FilesListOptions) {
  try {
    const creds = await resolveCredentials();
    const params: FilesListParams = {
      q: opts.query,
      page: opts.page ? Number(opts.page) : undefined,
      page_size: opts.pageSize ? Number(opts.pageSize) : undefined,
      session_id: opts.sessionId,
      task_id: opts.taskId,
      content_type: opts.contentType,
    };
    if (opts.installed === 'true') params.installed = true;
    else if (opts.installed === 'false') params.installed = false;
    const result = await listFiles(creds.access_token, params);
    jsonOut(result);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

export async function filesDeleteCommand(fileId: string) {
  if (!fileId) fail('file id required');
  try {
    const creds = await resolveCredentials();
    await deleteFile(creds.access_token, fileId);
    jsonOut({ deleted: true, file_id: fileId });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

// BE spec endpoint /api/v1/files/access/:id — 60min signed URL, re-signed
// every call. cli-relay normalizes the response shape (line 528).
export async function filesAccessCommand(fileId: string) {
  if (!fileId) fail('file id required');
  try {
    const creds = await resolveCredentials();
    const result = await getDownloadUrl(creds.access_token, fileId);
    jsonOut(result);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
