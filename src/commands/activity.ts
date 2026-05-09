import WebSocket from 'ws';
import { resolveCredentials } from './helpers/resolve-credentials.js';
import {
  listActivities,
  recentActivities,
  getActivity,
  listActivitiesByRole,
  type ActivitiesQuery,
} from '../lib/relay-client.js';
import { getBase } from '../lib/base-url.js';

function jsonOut(obj: unknown) { process.stdout.write(JSON.stringify(obj) + '\n'); }

function buildQuery(opts: Record<string, string | undefined>): ActivitiesQuery {
  const q: ActivitiesQuery = {};
  if (opts.cursor) q.cursor = opts.cursor;
  if (opts.limit) q.limit = Number(opts.limit);
  if (opts.action) q.action = opts.action;
  if (opts.actorRoleId) q.actor_role_id = opts.actorRoleId;
  if (opts.targetType) q.target_type = opts.targetType;
  if (opts.query) q.q = opts.query;
  if (opts.visibility === 'public' || opts.visibility === 'private') q.visibility = opts.visibility;
  return q;
}

interface ListOpts {
  cursor?: string; limit?: string; action?: string; actorRoleId?: string;
  targetType?: string; query?: string; visibility?: string;
}

export async function activityList(opts: ListOpts) {
  try {
    let token: string | null = null;
    try { token = (await resolveCredentials()).access_token; } catch { /* anon OK */ }
    jsonOut(await listActivities(token, buildQuery(opts as Record<string, string | undefined>)));
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function activityRecent() {
  try {
    // recent is anonymous-friendly — try with creds first, fall back to plain
    let token: string | null = null;
    try {
      const creds = await resolveCredentials();
      token = creds.access_token;
    } catch { /* no creds is fine for /recent */ }
    jsonOut(await recentActivities(token));
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function activityGet(id: string) {
  if (!id) { jsonOut({ error: 'activity id required' }); process.exit(1); }
  try {
    let token = '';
    try { token = (await resolveCredentials()).access_token; } catch { /* anon OK */ }
    jsonOut(await getActivity(token, id));
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

export async function activityByRole(roleId: string, opts: ListOpts) {
  if (!roleId) { jsonOut({ error: 'role_id required' }); process.exit(1); }
  try {
    let token = '';
    try { token = (await resolveCredentials()).access_token; } catch { /* anon OK */ }
    jsonOut(await listActivitiesByRole(token, roleId, buildQuery(opts as Record<string, string | undefined>)));
  } catch (err) {
    jsonOut({ error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
}

interface WatchOpts {
  topic?: string;
  includeReplay?: boolean;
}

/**
 * Live activity stream via cli-relay WS proxy at /cli/v1/activities/ws.
 * cli-relay validates the JWT and opens an upstream WS to the backend
 * (broadcast subscription lives there). Channel routing:
 *
 *   broadcast:public          — every public activity (ticker)
 *   broadcast:topic:<id>      — only after subscribe_topic
 *   feed:user:<my_user_id>    — my private notifications
 *
 * Output: one JSON line per event ({event:"activity", channel, replay?, ...envelope}).
 * Replay frames are suppressed by default; --include-replay passes them through
 * with replay:true. A `{event:"replay_done"}` line is emitted once the first
 * non-replay frame arrives.
 */
export async function activityWatch(opts: WatchOpts) {
  const creds = await resolveCredentials();
  const wsUrl = getBase().replace(/^https/, 'wss').replace(/^http/, 'ws')
    + `/cli/v1/activities/ws?token=${encodeURIComponent(creds.access_token)}`;

  const ws = new WebSocket(wsUrl);
  let replayDoneEmitted = false;

  ws.on('open', () => {
    jsonOut({ event: 'connected', url: wsUrl.replace(/token=[^&]+/, 'token=***') });
    if (opts.topic) {
      ws.send(JSON.stringify({ type: 'subscribe_topic', topic_id: opts.topic }));
    }
  });

  ws.on('message', (data) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    if (msg.type === 'subscribed') {
      jsonOut({ event: 'subscribed', ...msg });
      return;
    }

    if (msg.type !== 'broadcast') {
      // chat / deploy_status / etc — pass through with raw type so callers can filter
      jsonOut({ event: msg.type, ...msg });
      return;
    }

    const isReplay = msg.replay === true;
    if (isReplay && !opts.includeReplay) return; // suppress
    if (!isReplay && !replayDoneEmitted) {
      replayDoneEmitted = true;
      jsonOut({ event: 'replay_done' });
    }
    const activity = msg.activity as Record<string, unknown>;
    jsonOut({
      event: 'activity',
      channel: msg.channel,
      replay: isReplay || undefined,
      ...activity,
    });
  });

  ws.on('close', (code, reason) => {
    jsonOut({ event: 'closed', code, reason: reason.toString() });
    process.exit(code === 1000 ? 0 : 1);
  });

  ws.on('error', (err) => {
    jsonOut({ event: 'error', code: 'WS_ERROR', message: err.message });
  });

  process.on('SIGINT', () => { try { ws.close(1000, 'user cancel'); } catch {} });
  process.on('SIGTERM', () => { try { ws.close(1000, 'shutdown'); } catch {} });
}
