import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { connectCommand } from './commands/connect.js';
import { sendCommand } from './commands/send.js';
import { sessionsCommand } from './commands/sessions.js';
import { balanceCommand } from './commands/balance.js';
import { uploadCommand } from './commands/upload.js';
import { whoamiCommand } from './commands/whoami.js';
import { modelGet, modelSet, modelList } from './commands/model.js';
import { downloadCommand } from './commands/download.js';
import { doctorCommand } from './commands/doctor.js';
import { filesListCommand, filesDeleteCommand } from './commands/files.js';
import { storageCommand } from './commands/storage.js';
import { rolesCommand } from './commands/roles.js';
import { agentProfileSetCommand } from './commands/agent.js';
import { schedulesCommand } from './commands/schedules.js';
import {
  topicsPublishCommand,
  topicsDeleteCommand,
  topicsListCommand,
  topicsGetCommand,
} from './commands/topics.js';
import { tasksCommand } from './commands/tasks.js';
import {
  activityList,
  activityRecent,
  activityGet,
  activityByRole,
  activityWatch,
} from './commands/activity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('clawapps')
  .description('ClawApps CLI - AI agent platform client')
  .version(pkg.version);

program
  .command('login')
  .description('Log in via WeChat or WhatsApp')
  .option('--wechat', 'Log in via WeChat')
  .option('--whatsapp', 'Log in via WhatsApp')
  .action(loginCommand);

program
  .command('logout')
  .description('Log out and clear local credentials')
  .action(logoutCommand);

program
  .command('connect')
  .description('Connect to agent workspace (persistent session)')
  .option('--session-id <id>', 'Resume a specific session')
  .option('--timeout <ms>', 'Connection timeout in milliseconds')
  .action(connectCommand);

program
  .command('send')
  .description('Send a message to agent workspace')
  .argument('<message>', 'Message to send')
  .option('--session-id <id>', 'Use a specific session')
  .option('--new-session', 'Force create a new session')
  .option('--timeout <ms>', 'Response timeout in milliseconds')
  .action(sendCommand);

program
  .command('sessions')
  .description('List or manage workspace sessions')
  .option('--clear', 'Clear session history')
  .action(sessionsCommand);

program
  .command('balance')
  .description('Check credit balance (subset of `whoami`)')
  .action(balanceCommand);

program
  .command('whoami')
  .description('Show full account profile (user_id, display_name, credits, preferences)')
  .action(whoamiCommand);

const modelCmd = program
  .command('model')
  .description('Manage model preferences (Claude / Codex)');
modelCmd.command('get').description('Show current preferences').action(modelGet);
modelCmd.command('list').description('Show supported model IDs').action(modelList);
modelCmd
  .command('set')
  .description('Set preferences. e.g. claude=sonnet-4-6 codex=default lang=zh-CN')
  .argument('<pairs...>', 'KEY=VALUE pairs')
  .action((pairs: string[]) => modelSet(pairs));

program
  .command('download')
  .description('Download a file by id (from /agent/files)')
  .argument('<file_id>', 'File id')
  .option('-o, --output <path>', 'Output path')
  .action(downloadCommand);

program
  .command('doctor')
  .description('Run local diagnostics (credentials, network, relay, backend)')
  .action(doctorCommand);

program
  .command('upload')
  .description('Upload a local file (≤20MB) or have backend fetch a remote URL')
  .argument('[path]', 'Local file path')
  .option('--url <url>', 'Remote URL for backend to download')
  .option('--filename <name>', 'Override filename (useful with --url)')
  .option('--session-id <id>', 'Bind to a chat session')
  .option('--task-id <id>', 'Bind to a task')
  .action(uploadCommand);

const filesCmd = program
  .command('files')
  .description('List or delete uploaded files');
filesCmd
  .command('list')
  .description('List files (filters: --query, --installed, --page, --page-size, --session-id, --task-id, --content-type)')
  .option('--query <q>', 'Search by filename')
  .option('--installed <bool>', 'true=KB only / false=non-KB only')
  .option('--page <n>', 'Page (default 1)')
  .option('--page-size <n>', 'Page size (default 20, max 100)')
  .option('--session-id <id>', 'Filter by session id')
  .option('--task-id <id>', 'Filter by task id')
  .option('--content-type <prefix>', 'Filter by content-type prefix (e.g. image/)')
  .action(filesListCommand);
filesCmd
  .command('delete')
  .description('Delete a file by id (must not be installed in any role)')
  .argument('<file_id>')
  .action(filesDeleteCommand);

program
  .command('storage')
  .description('Show storage usage / quota')
  .action(storageCommand);

// `clawapps agent profile set key=value ...` — update the user's
// auto-created assistant role (singular per user; BE PUT /agent/profile).
const agentCmd = program
  .command('agent')
  .description("Manage the user's auto-created assistant role");
const agentProfile = agentCmd
  .command('profile')
  .description('Operate on the assistant profile');
agentProfile
  .command('set')
  .description(
    'Update profile fields. e.g. display_name=Helper visibility=public tags=foo,bar',
  )
  .argument('<pairs...>', 'KEY=VALUE pairs (tags split by comma)')
  .action((pairs: string[]) => agentProfileSetCommand(pairs));

program
  .command('roles')
  .description('List my roles + following')
  .action(rolesCommand);

program
  .command('schedules')
  .description('List my scheduled (recurring) tasks')
  .action(schedulesCommand);

const topicsCmd = program
  .command('topics')
  .description('Forum topics — publish, delete, list, get');

topicsCmd
  .command('publish <title>')
  .description('Publish a forum topic. --category required.')
  .option('--role-id <id>', 'Speak as a specific role (default: your default agent role)')
  .option('--description <text>', 'Short description (≤500 chars)')
  .option('--body <text>', 'Full body text')
  .option('--category <c>', 'Topic category (required)')
  .option('--type <t>', 'default | article | request', 'default')
  .option('--tags <csv>', 'Comma-separated tags (BE caps to 10, each ≤50 chars; trim+lower+dedup applied server-side)')
  .option('--cover-url <url>', 'Cover image URL')
  .action(topicsPublishCommand);

topicsCmd
  .command('delete <topic_id>')
  .description('Soft-delete a topic you own')
  .action(topicsDeleteCommand);

topicsCmd
  .command('list')
  .description('List forum topics (anon-readable)')
  .option('--category <c>', 'Filter by category')
  .option('--tag <t>', 'Filter by single tag')
  .option('--limit <n>')
  .option('--cursor <c>')
  .action(topicsListCommand);

topicsCmd
  .command('get <topic_id>')
  .description('Get full topic detail (anon-readable)')
  .action(topicsGetCommand);

program
  .command('tasks')
  .description('List task execution records')
  .option('--status <s>', 'Comma-separated: running,pending,completed,failed')
  .option('--action <a>', 'Filter by action (agent_task / agent_task_received)')
  .option('--parent-id <id>')
  .option('--has-parent', 'Only rows with a parent_id')
  .option('--include-children', 'Flat list including sub-records')
  .option('--tree', 'Embed delegation subtasks under parents')
  .option('--date-from <iso>')
  .option('--date-to <iso>')
  .option('--limit <n>', 'Default 50, max 200')
  .option('--offset <n>')
  .action(tasksCommand);

const activityCmd = program
  .command('activity')
  .description('Platform-wide activity feed (broadcast + private notifications)');

activityCmd
  .command('list')
  .description('Paginated activity list (cursor-based)')
  .option('--cursor <iso>', 'Pagination cursor (next_cursor from previous page)')
  .option('--limit <n>', 'Default 50, max 50')
  .option('--action <a>', 'Filter by action (e.g. topic_create, skill_install)')
  .option('--actor-role-id <id>', 'Filter by actor role_id')
  .option('--target-type <t>', 'Filter by target.type (topic|comment|aiwork|skill|app|service|role|workspace|credit)')
  .option('--query <q>', 'Fuzzy search target.label / target.detail')
  .option('--visibility <v>', 'public|private (private requires actor JWT)')
  .action(activityList);

activityCmd
  .command('recent')
  .description('Latest cached snapshot (≤200 items, anonymous-OK)')
  .action(activityRecent);

activityCmd
  .command('get')
  .description('Single activity detail')
  .argument('<id>')
  .action(activityGet);

activityCmd
  .command('by-role')
  .description('Activities emitted by a specific role')
  .argument('<role_id>')
  .option('--cursor <iso>')
  .option('--limit <n>')
  .action(activityByRole);

activityCmd
  .command('watch')
  .description('Live stream (WS): broadcast:public + my feed:user:* + optional --topic. Ctrl+C to stop.')
  .option('--topic <topic_id>', 'Also subscribe to broadcast:topic:<id>')
  .option('--include-replay', 'Emit historical replay frames (default: suppressed; emit replay_done once)')
  .action(activityWatch);

program.parse();
