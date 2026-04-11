import chalk from 'chalk';
import { loadSessions, clearSessions } from '../lib/relay-client.js';

interface SessionsOptions {
  clear?: boolean;
  human?: boolean;
}

export async function sessionsCommand(options: SessionsOptions) {
  if (options.clear) {
    await clearSessions();
    if (options.human) {
      console.log(chalk.green('Session history cleared.'));
    } else {
      process.stdout.write(JSON.stringify({ cleared: true }) + '\n');
    }
    return;
  }

  const store = await loadSessions();
  const entries = Object.values(store.sessions);

  if (options.human) {
    if (entries.length === 0) {
      console.log(chalk.gray('No sessions found.'));
      return;
    }
    console.log(chalk.bold('Recent Sessions'));
    console.log();
    for (const s of entries) {
      const isCurrent = s.session_id === store.last_session_id;
      const marker = isCurrent ? chalk.green(' (current)') : '';
      console.log(`  ${s.session_id}${marker}`);
      console.log(`    Created: ${s.created_at}`);
    }
  } else {
    process.stdout.write(JSON.stringify({
      last_session_id: store.last_session_id || null,
      sessions: entries,
    }) + '\n');
  }
}
