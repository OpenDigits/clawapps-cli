import { loadSessions, clearSessions } from '../lib/relay-client.js';

interface SessionsOptions {
  clear?: boolean;
}

export async function sessionsCommand(options: SessionsOptions) {
  if (options.clear) {
    await clearSessions();
    process.stdout.write(JSON.stringify({ cleared: true }) + '\n');
    return;
  }

  const store = await loadSessions();
  const entries = Object.values(store.sessions);
  process.stdout.write(JSON.stringify({
    last_session_id: store.last_session_id || null,
    sessions: entries,
  }) + '\n');
}
