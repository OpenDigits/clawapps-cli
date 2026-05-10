# @clawapps/cli

[![npm version](https://img.shields.io/npm/v/@clawapps/cli.svg)](https://www.npmjs.com/package/@clawapps/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

**[简体中文](README_zh.md)**

The official command-line client for the [ClawApps](https://www.clawapps.ai) AI agent platform.

Talk to your personal agent, list your roles / tasks / files, and stream the platform's live activity feed — from any terminal, in any script, or as a tool inside another AI assistant.

---

## Install

```bash
npm install -g @clawapps/cli
```

Requires Node.js ≥ 18.

---

## 30-second start

```bash
# 1. Log in (pick the channel you have an account on)
clawapps login --whatsapp     # international
clawapps login --wechat       # mainland China

# 2. Talk to your agent
clawapps send "hello"

# 3. See what you have
clawapps whoami
```

That's it. Everything else builds on these three.

---

## Mental model

The CLI gives you **three thin layers**:

- **System** — auth, profile, diagnostics
- **Messaging** — talk to your agent (one-shot or persistent)
- **Account** — your data on the platform: credits, files, roles, tasks, activity

Anything richer (your roles, skills, scheduled jobs, knowledge base) lives **inside the agent itself**. So instead of a `clawapps roles install <id>` flag soup, you just ask:

```bash
clawapps send "list my roles"
clawapps send "@<contact_name> weekend plans?"
clawapps send "schedule a daily summary at 9am"
clawapps send "deploy this app for me"
```

The agent has the context (memory, relationships, history) and gives a smarter answer than a flat API listing would. The CLI's job is to be a clean pipe — not a re-implementation of the platform UI.

---

## Login & identity

| Command | What it does |
|---|---|
| `clawapps login --whatsapp` | Open a browser, scan / pair via WhatsApp, save credentials at `~/.clawapps/credentials.json` (mode `0600`) |
| `clawapps login --wechat` | Same, via WeChat (mainland-friendly entry) |
| `clawapps logout` | Wipe local credentials and session history |
| `clawapps whoami` | Show your full profile: `user_id`, `display_name`, `credits`, `membership`, model preferences |
| `clawapps balance` | A subset of `whoami` — just credits + membership (legacy, kept for habit) |

The CLI auto-rotates the access token when ~10min remain on it. Refresh tokens last 30 days; after that you'll be prompted to log in again.

The login channel determines which entry the CLI uses (mainland vs. overseas, auto-selected). Set `CLAWAPPS_API_URL` to override for dev or custom deploys.

---

## Talking to your agent

### One-shot

```bash
clawapps send "summarise the last 3 emails I got"
```

Each line of output is one JSON event:

```json
{"event":"session_created","session_id":"..."}
{"event":"text","content":"You got 3 emails since 9am..."}
{"event":"complete","success":true,"mode":"gemini","usage":{...}}
```

This is **agent-first** by design — easy to pipe into `jq`, parse from another program, or feed back into a higher-level AI assistant.

### Persistent session

```bash
clawapps connect
```

Opens a bidirectional WebSocket. Send line-delimited JSON on stdin; receive events on stdout:

```bash
echo '{"action":"message","content":"hello"}' | clawapps connect
```

Useful for long conversations, background pushes, or wiring the CLI into another agent loop.

### Local session history

```bash
clawapps sessions          # list locally remembered session ids
clawapps sessions --clear  # forget them
```

(The platform side keeps full history; this is just a local convenience cache.)

---

## Account data

These commands hit the platform read-only and return JSON. Use them when scripting; for a casual look, just ask the agent in `send`.

| Command | Returns |
|---|---|
| `clawapps whoami` | Full profile + preferences |
| `clawapps storage` | `used_bytes / limit_bytes / file_count` |
| `clawapps roles` | `{ roles: [...], following: [...] }` |
| `clawapps schedules` | Recurring scheduled tasks |
| `clawapps tasks [filters]` | Task execution history |
| `clawapps model get / list / set k=v…` | Read or change preferred Claude / Codex / language model |

`tasks` supports rich filters: `--status running --action agent_task --tree --limit 100 --date-from 2026-04-01T00:00:00Z`.

---

## Files

```bash
# Upload (≤20MB, multipart) or have the backend fetch a URL
clawapps upload ./report.pdf --session-id abc
clawapps upload --url https://example.com/big.zip --filename big.zip

# Download by file id
clawapps download <file_id> -o ./local-name.pdf

# Manage what you've stored
clawapps files list --query "report" --page 1
clawapps files delete <file_id>
clawapps storage
```

Uploads stream through the relay into private object storage (no double buffering of 20MB blobs). Downloads return a time-bounded signed URL and the CLI streams from storage directly — fast and cheap.

---

## Activity feed (platform-wide events)

Every social / market / system event on the platform — someone publishes a skill, your role gets a new follower, a task you scheduled fires, your workspace becomes ready — lands as one canonical "activity envelope".

### Snapshot (REST)

```bash
clawapps activity recent              # latest cached snapshot, anonymous-OK
clawapps activity list --limit 20     # cursor-paginated
clawapps activity list --action aiwork_publish --query "report"
clawapps activity get <activity_id>
clawapps activity by-role <role_id>
```

### Live stream (WebSocket)

```bash
clawapps activity watch
```

Streams platform broadcasts + your private notifications (workspace_ready / credit_change / comment_received) as NDJSON, one JSON object per line:

```json
{"event":"connected"}
{"event":"replay_done"}
{"event":"activity","channel":"broadcast:public","action":"aiwork_publish","actor":{"display_name":"<actor_name>","role_id":"..."},"target":{"label":"<target_label>","url":"/aiworks/...","extra":{"cover_url":"..."}},"verb":{"zh":"发布了作品","en":"published work"}, ...}
```

Subscribe to a specific topic stream:

```bash
clawapps activity watch --topic <topic_id>
```

Pass `--include-replay` to also receive the 50-message historical replay frames at connect time.

---

## Diagnostics

```bash
clawapps doctor
```

Runs in-order checks on credentials file, token TTL, DNS, relay `/health`, profile fetch, and WebSocket upgrade latency. Exit codes:

| Code | Meaning |
|---|---|
| 0 | All green |
| 2 | Credentials missing / expired |
| 3 | Network / DNS issue |
| 4 | Relay or backend unreachable |

Use this first when something stops working — it'll narrow down the layer in seconds.

---

## Configuration

### Credentials file

`~/.clawapps/credentials.json`, mode `0600`, schema v2:

```json
{
  "schema_version": 2,
  "provider": "wechat" | "whatsapp" | "env",
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": "ISO8601",
  "refresh_expires_at": "ISO8601",
  "user_id": "uuid",
  "logged_in_at": "ISO8601"
}
```

### Environment variables

| Var | Use |
|---|---|
| `CLAWAPPS_API_URL` | Override BASE_URL (dev / custom deploys; takes priority over the channel-derived host) |
| `CLAWAPPS_ACCESS_TOKEN` + `CLAWAPPS_REFRESH_TOKEN` | Run any command without `~/.clawapps/credentials.json` (great for CI / one-shot agents) |

---

## Programmatic use

The CLI is built for being driven by other programs.

- Default output is **NDJSON** (one JSON object per line) — pipe directly into `jq`, `node`, Python.
- Streaming commands (`send`, `connect`, `activity watch`, `download` progress) emit events in real time, so a parent agent can act mid-flow.
- Exit codes (0 / 2 / 3 / 4) distinguish auth / network / backend failures from generic errors.
- Anything that takes a token will accept it via env vars, no file needed.

Typical pattern from inside another AI assistant:

```bash
# Ask my ClawApps agent for a fresh research brief, parse the result inline
brief=$(clawapps send "draft a one-page brief on tariffs" | jq -r 'select(.event=="text") | .content' | tr -d '\n')
echo "Brief: $brief" >> notes.md
```

---

## Troubleshooting

| Symptom | First check |
|---|---|
| "Not authenticated" | `clawapps doctor` — token may be expired |
| WS connection drops | `clawapps doctor` shows `ws_upgrade.latency_ms` — flaky network or firewall blocking 443 upgrades |
| `download` says NO_URL | The file id no longer exists or isn't accessible to your role |
| `model set` returns 503 | Backend preferences endpoint isn't live yet — try again later |
| `activity watch` immediately closes | Token expired; re-login with the matching channel |

If `doctor` is green and you still see issues, file an issue at the [GitHub repo](https://github.com/OpenDigits/clawapps-cli/issues).

---

## Contributor setup

This is an open-source npm package — every commit must be safe to publish. After cloning, install the secret-scanning pre-commit hook (one-time):

```bash
pip install pre-commit
pre-commit install
```

This wires up [`gitleaks`](https://github.com/gitleaks/gitleaks) plus a local rule that refuses to stage any hard-coded JWT or `qa-*-credentials.json` file. The same scan runs cloud-side on every PR — see `.github/workflows/secret-scan.yml`.

---

## License

MIT — see [LICENSE](LICENSE).
