import { resolveCredentials } from './helpers/resolve-credentials.js';
import {
  listForumTopics,
  getForumTopic,
  createForumTopic,
  deleteForumTopic,
  type ForumTopicCreateInput,
  type ForumListParams,
} from '../lib/relay-client.js';

function jsonOut(obj: unknown) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function fail(msg: string, code = 1): never {
  jsonOut({ error: msg });
  process.exit(code);
}

interface PublishOptions {
  roleId?: string;
  description?: string;
  body?: string;
  category?: string;
  type?: string;
  tags?: string;       // comma-separated
  coverUrl?: string;
}

interface ListOptions {
  category?: string;
  tag?: string;
  limit?: string;
  cursor?: string;
}

export async function topicsPublishCommand(title: string, opts: PublishOptions) {
  if (!title || !title.trim()) {
    fail('topics publish: <title> is required');
  }
  if (!opts.category) {
    fail('topics publish: --category is required');
  }
  const tags = opts.tags
    ? opts.tags.split(',').map((t) => t.trim()).filter((t) => t.length > 0)
    : undefined;
  const t = (opts.type || 'default') as 'default' | 'article' | 'request';
  if (!['default', 'article', 'request'].includes(t)) {
    fail(`topics publish: --type must be one of default|article|request (got ${opts.type})`);
  }
  const input: ForumTopicCreateInput = {
    title,
    category: opts.category,
    topic_type: t,
    role_id: opts.roleId,
    description: opts.description,
    body: opts.body,
    tags,
    cover_url: opts.coverUrl,
  };
  try {
    const creds = await resolveCredentials();
    jsonOut(await createForumTopic(creds.access_token, input));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

export async function topicsDeleteCommand(topicId: string) {
  if (!topicId) fail('topics delete: <topic_id> is required');
  try {
    const creds = await resolveCredentials();
    await deleteForumTopic(creds.access_token, topicId);
    jsonOut({ deleted: topicId });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

export async function topicsListCommand(opts: ListOptions) {
  // Anonymous-readable; if not logged in, send empty token.
  const params: ForumListParams = {
    category: opts.category,
    tag: opts.tag,
    limit: opts.limit ? Number(opts.limit) : undefined,
    cursor: opts.cursor,
  };
  try {
    let token: string | undefined;
    try {
      const creds = await resolveCredentials();
      token = creds.access_token;
    } catch {
      // anon path is allowed
    }
    jsonOut(await listForumTopics(token, params));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

export async function topicsGetCommand(topicId: string) {
  if (!topicId) fail('topics get: <topic_id> is required');
  try {
    let token: string | undefined;
    try {
      const creds = await resolveCredentials();
      token = creds.access_token;
    } catch {
      // anon path is allowed
    }
    jsonOut(await getForumTopic(token, topicId));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
