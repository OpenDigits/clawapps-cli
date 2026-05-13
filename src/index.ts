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
import { filesListCommand, filesDeleteCommand, filesAccessCommand } from './commands/files.js';
import { kbIngest, kbScan, kbList, kbStatus, kbDetach, kbReset, kbRebuild, kbCallback, kbDelete } from './commands/kb.js';
import { storageCommand } from './commands/storage.js';
import { rolesCommand, rolesVisibilityCommand } from './commands/roles.js';
import { agentProfileSetCommand, agentProfileShowCommand } from './commands/agent.js';
import { meProfileSetCommand, meProfileShowCommand } from './commands/me.js';
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
import {
  skillsUpload,
  skillsUploadNewVersion,
  skillsUpdate,
  skillsVisibility,
  skillsRollback,
  skillsDelete,
  skillsMine,
  skillsList,
  skillsGet,
  skillsInstall,
  skillsUninstall,
  skillsUpgrade,
} from './commands/skills.js';

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
filesCmd
  .command('access')
  .description('Get a 60-minute signed download URL for a file (re-signed each call)')
  .argument('<file_id>')
  .action(filesAccessCommand);

// `clawapps kb ...` — knowledge base ingest / list / scan / status / detach
// Mirrors BE spec /api/v1/agent/kb/* (ingest 三态 / scan / list). The callback
// endpoint (X-Cluster-Secret server-to-server) is intentionally NOT exposed.
const kbCmd = program
  .command('kb')
  .description('Knowledge base — ingest files into role KB, list, scan, status');
kbCmd
  .command('ingest')
  .description('Ingest files into a role KB (owner path: agent role; install path: pro role; --remove to detach all)')
  .requiredOption('--role-id <id>', 'Target role id')
  .option('--file-id <id...>', 'File ids to ingest (repeatable). Omit + use --remove to detach all.')
  .option('--remove', 'Detach all kb files from role (sends file_ids=[])')
  .action((opts) => kbIngest(opts));
kbCmd
  .command('scan')
  .description('Pull Gateway raw_sources; backfill is_knowledge + kb_slug (fallback when callback missed)')
  .option('--role-id <id>', 'Optional role scope')
  .action((opts) => kbScan(opts));
kbCmd
  .command('list')
  .description('List my KB files; with --role-id, each item gets is_installed flag')
  .option('--role-id <id>', 'Optional role scope')
  .action((opts) => kbList(opts));
kbCmd
  .command('status')
  .description('Show ingest job status for a role (running/completed/failed)')
  .requiredOption('--role-id <id>', 'Target role id')
  .action((opts) => kbStatus(opts));
kbCmd
  .command('detach')
  .description('Detach all kb files from a role (alias: kb ingest --remove)')
  .requiredOption('--role-id <id>', 'Target role id')
  .action((opts) => kbDetach(opts));
kbCmd
  .command('reset')
  .description('Reset KB. --mode soft (archive + raw→inbox) or hard (purge all)')
  .option('--mode <m>', 'soft (default) | hard', 'soft')
  .action((opts) => kbReset(opts));
kbCmd
  .command('rebuild')
  .description('Rebuild KB from raw (raw→inbox→clear→re-ingest)')
  .action(() => kbRebuild());
kbCmd
  .command('delete')
  .description('Delete a KB file. Omit --role-id for owner_delete + cascade across all roles; specify --role-id for role_unbind only.')
  .option('--file-id <id...>', 'File id(s) to delete (preferred; BE auto-resolves slug)')
  .option('--slug <s...>', 'KB slug(s) to delete (admin tooling)')
  .option('--role-id <id>', 'Limit to role_unbind mode (owner KB intact)')
  .action((opts) => kbDelete(opts));
kbCmd
  .command('callback')
  .description('[TEST] Simulate Bridge → BE callback (cli-relay injects X-Cluster-Secret)')
  .requiredOption('--job-id <id>', 'Ingest job id')
  .requiredOption('--file-id <id>', 'File id')
  .requiredOption('--slug <s>', 'KB slug to write back')
  .option('--status <s>', 'completed|failed', 'completed')
  .action((opts) => kbCallback(opts));

program
  .command('storage')
  .description('Show storage usage / quota')
  .action(storageCommand);

// `clawapps me profile show/set` — read/write the OWNER role
// (the user's main identity). BE cascade per R-31: display_name change
// also updates users.display_name + every role.owner_display_name +
// Moky push to Bridge.
const meCmd = program
  .command('me')
  .description("Manage the user's OWNER role (main identity)");
const meProfile = meCmd
  .command('profile')
  .description('Operate on the OWNER role profile');
meProfile
  .command('show')
  .description('Print the OWNER role profile (BE GET /roles/<owner_role_id>)')
  .action(meProfileShowCommand);
meProfile
  .command('set')
  .description(
    'Update OWNER role fields. e.g. display_name=Sky avatar_url=https://... description="主账号"',
  )
  .argument('<pairs...>', 'KEY=VALUE pairs (keys: display_name, description, avatar_url, visibility, prompt)')
  .action((pairs: string[]) => meProfileSetCommand(pairs));

// `clawapps agent profile set key=value ...` — update the user's
// auto-created assistant role (singular per user; BE PUT /agent/profile).
const agentCmd = program
  .command('agent')
  .description("Manage the user's auto-created assistant role");
const agentProfile = agentCmd
  .command('profile')
  .description('Operate on the assistant profile');
agentProfile
  .command('show')
  .description('Print the current assistant profile (BE GET /agent/profile)')
  .action(agentProfileShowCommand);
agentProfile
  .command('set')
  .description(
    'Update profile fields. e.g. display_name=Helper visibility=public tags=foo,bar',
  )
  .argument('<pairs...>', 'KEY=VALUE pairs (tags split by comma)')
  .action((pairs: string[]) => agentProfileSetCommand(pairs));

const rolesCmd = program
  .command('roles')
  .description('Manage roles (list / visibility)');
rolesCmd
  .command('list', { isDefault: true })
  .description('List my roles + following')
  .action(rolesCommand);
rolesCmd
  .command('visibility <role_id> <value>')
  .description('Set role visibility via BE dedicated endpoint. value: public | contacts_only | private')
  .action((roleId: string, value: string) => rolesVisibilityCommand(roleId, value));

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

const skillsCmd = program
  .command('skills')
  .description('Manage skill packages (upload / version / rollback / install)');

skillsCmd
  .command('upload <zip>')
  .description('Upload a new skill zip (≤10MB). Creates version 1.0.0.')
  .option('--description <text>', 'Optional short description')
  .action((zip: string, opts: { description?: string }) => skillsUpload(zip, opts));

skillsCmd
  .command('upload-new-version <skill_id> <zip>')
  .description('Upload a new version zip. BE bumps patch (e.g. 1.0.0 → 1.0.1).')
  .action((id: string, zip: string) => skillsUploadNewVersion(id, zip));

skillsCmd
  .command('update <skill_id> <pairs...>')
  .description('PATCH metadata. keys: title, short_description, long_description, category_slug, pricing_type, price_amount')
  .action((id: string, pairs: string[]) => skillsUpdate(id, pairs));

skillsCmd
  .command('visibility <skill_id> <value>')
  .description('Set marketplace visibility. value: public | private')
  .action((id: string, value: string) => skillsVisibility(id, value));

skillsCmd
  .command('rollback <skill_id> <version>')
  .description('Revert skill to a prior version (requires that version still in retention window)')
  .action((id: string, ver: string) => skillsRollback(id, ver));

skillsCmd
  .command('delete <skill_id>')
  .description('Hard-delete skill: removes all version zips from GCS and releases storage_used')
  .action((id: string) => skillsDelete(id));

skillsCmd
  .command('mine')
  .description('List skills I own (includes DRAFT / IN_REVIEW)')
  .action(skillsMine);

skillsCmd
  .command('list')
  .description('Browse marketplace (public + ACTIVE only)')
  .option('--category <c>')
  .option('--tag <t>')
  .option('--limit <n>')
  .option('--cursor <c>')
  .action((opts: { category?: string; tag?: string; limit?: string; cursor?: string }) =>
    skillsList(opts));

skillsCmd
  .command('get <skill_id>')
  .description('Get skill detail')
  .action((id: string) => skillsGet(id));

skillsCmd
  .command('install <skill_id>')
  .description('Install an ACTIVE skill into a role you own (BE: POST /roles/:rid/skills/:sid/install)')
  .requiredOption('--role-id <id>', 'Target role_id (you must own it)')
  .action((id: string, opts: { roleId: string }) => skillsInstall(id, opts));

skillsCmd
  .command('uninstall <skill_id>')
  .description('Uninstall a skill from a role you own')
  .requiredOption('--role-id <id>', 'Role to uninstall from')
  .action((id: string, opts: { roleId: string }) => skillsUninstall(id, opts));

skillsCmd
  .command('upgrade <skill_id>')
  .description("Upgrade a role's installed skill to the latest version_at_install")
  .requiredOption('--role-id <id>', 'Role to upgrade')
  .action((id: string, opts: { roleId: string }) => skillsUpgrade(id, opts));

program.parse();
