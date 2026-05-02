import { resolveCredentials } from './helpers/resolve-credentials.js';
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
