# @clawapps/cli

[![npm version](https://img.shields.io/npm/v/@clawapps/cli.svg)](https://www.npmjs.com/package/@clawapps/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

**[简体中文](README_zh.md)**

Command-line client for the [ClawApps](https://www.clawapps.ai) AI agent platform. Authenticate via WeChat or WhatsApp, send messages to your agent workspace, and integrate the platform into AI assistants and scripts.

## Install

```bash
npm install -g @clawapps/cli
```

## Quick Start

```bash
# 1. Log in (choose one channel)
clawapps login --wechat
clawapps login --whatsapp

# 2. Check balance
clawapps balance

# 3. Send a one-shot message
clawapps send "hello"

# 4. Or hold an interactive session
clawapps connect
```

## Design Philosophy

The CLI gives you **three thin layers**:
- **System** — auth, diagnostics, local config
- **Messaging** — talk to your agent
- **Account** — credits, profile, usage

Everything else (your roles, tasks, apps, knowledge base, memory) lives **inside the agent itself**. Just ask in natural language:

```bash
clawapps send "list my roles"
clawapps send "what tasks are running right now?"
clawapps send "@张老师 weekend plans?"
clawapps send "show me my deployed apps"
clawapps send "search my knowledge base for K8s notes"
```

There are deliberately no `roles`, `tasks`, `apps`, `kb` subcommands — the agent has the full context (memory, relationships, history) and gives a smarter answer than a flat API listing would.

## Commands

### `clawapps login --wechat | --whatsapp`

Authenticates with the platform via the chosen channel. The CLI prints a login URL — open it in a browser, complete the scan / pairing flow, and the CLI auto-detects success and stores credentials at `~/.clawapps/credentials.json` (mode `0600`).

```text
$ clawapps login --whatsapp

ClawApps Login — WhatsApp

Step 1. Open this link in your browser:

    https://clawapps.ai/whatsapp-login?cli_code=ABC123

Step 2. Authenticate via WhatsApp.

Waiting for you to scan… (link valid for 180 seconds)
   150 seconds remaining

✓ Login successful!

  Welcome, momoclaw 👋
  Channel:     WhatsApp
  Credits:     3357.3
  Membership:  pro
```

The login URL is valid for 3 minutes. If unscanned, the CLI exits with code `1`.

### `clawapps logout`

Clears local credentials and session history.

### `clawapps balance`

Returns the user's credit balance.

```bash
$ clawapps balance
{"credits":5060.27,"membership":"pro","display_name":"Jay"}
```

### `clawapps send <message>`

Sends a single message to the agent workspace and streams events to stdout (one JSON object per line). Suitable for scripting and AI-agent integration.

```bash
$ clawapps send "what's the weather in Toronto?"
{"event":"session_created","session_id":"abc-123"}
{"event":"text","content":"Toronto today: 7°C, rainy."}
{"event":"cost","credits_used":0.42,"balance_after":5059.85}
{"event":"complete","success":true,"mode":"chat"}
```

Options: `--session-id <id>` `--new-session` `--timeout <ms>`

### `clawapps connect`

Holds a persistent WebSocket session to the workspace. Reads JSON commands from stdin, emits events to stdout.

Stdin (one JSON command per line):

```json
{"action":"message","content":"hello"}
{"action":"stop"}
```

Stdout: same event stream as `send`.

Options: `--session-id <id>` `--timeout <ms>`

### `clawapps sessions`

Lists or clears local session history.

```bash
$ clawapps sessions
$ clawapps sessions --clear
```

## Coming in v0.9 (Preview)

The following commands are part of the v0.9 roadmap. The shape and JSON contracts below are stable — you can wire your agent against them now.

### `clawapps whoami`

Print the current logged-in identity.

```bash
$ clawapps whoami
{"user_id":"uuid","display_name":"Jay","membership":"pro","channel":"wechat","expires_at":"2026-04-29T21:21:00.000Z"}
```

### `clawapps doctor`

Run a self-diagnostic. Useful inside agent harnesses to detect setup issues.

```bash
$ clawapps doctor
{"check":"credentials","ok":true}
{"check":"network","ok":true,"latency_ms":42}
{"check":"relay_reachable","ok":true}
{"check":"workspace_ready","ok":true}
{"summary":"all checks passed"}
```

### `clawapps stop`

Interrupt the assistant's current reply (sends `{action:"stop"}` to the live session).

```bash
$ clawapps stop
{"event":"stopped"}
```

### `clawapps profile [--update <key=value>]`

Read or update your account profile.

```bash
$ clawapps profile
{"display_name":"Jay","preferred_language":"zh","preferences":{"theme":"dark"}}

$ clawapps profile --update display_name=Jacky
{"event":"updated","display_name":"Jacky"}
```

### `clawapps usage [--period 7d] [--by mode]`

View credit usage statistics.

```bash
$ clawapps usage --period 7d
{"period":"7d","total_credits":42.5,"by_day":[{"date":"2026-04-22","credits":7.1}, ...]}

$ clawapps usage --period 30d --by mode
{"period":"30d","by_mode":{"chat":120.4,"task":35.7,"role":18.2}}
```

### `clawapps config <get|set> <key> [value]`

Persistent local configuration in `~/.clawapps/config.json`.

```bash
$ clawapps config set base_url https://staging-api.clawapps.ai
$ clawapps config get base_url
{"key":"base_url","value":"https://staging-api.clawapps.ai"}
```

## Future

- `clawapps subscribe` — manage your subscription plan (returns payment link, never handles cards)
- `clawapps add-credit <amount>` — top up credits (returns payment link)

## Event Stream Reference

JSON events emitted by `send` / `connect` (one per line on stdout):

| Event             | Key fields                                | Description                                 |
|-------------------|-------------------------------------------|---------------------------------------------|
| `session_created` | `session_id`                              | Session ID assigned by the relay            |
| `ready`           | —                                         | (`connect` only) Ready to accept input      |
| `text`            | `content`                                 | Streaming text from the assistant           |
| `formatted`       | `mode`, `intro`, `ui_tree`, `timing`      | Structured UI tree output                   |
| `status` / `log`  | `state`, `level`, `message`               | Intermediate progress signals               |
| `mode_change`     | `mode`, `reason`                          | Workspace switched chat / task / role       |
| `cost`            | `credits_used`, `balance_after`           | Per-turn billing                            |
| `complete`        | `success`, `mode`, `usage`                | Turn complete                               |
| `error`           | `code`, `message`                         | Error from CLI or backend                   |

## Credentials

Stored at `~/.clawapps/credentials.json` with mode `0600`:

```json
{
  "provider": "whatsapp",
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_at": "2026-04-26T21:21:00.000Z",
  "refresh_expires_at": "2026-05-25T21:21:00.000Z",
  "user_id": "uuid",
  "logged_in_at": "2026-04-25T21:21:00.000Z"
}
```

**Auto-refresh.** Whenever a command needs a token, the CLI checks `expires_at`. If less than 10 minutes remain, it transparently calls `/cli/v1/auth/refresh` and rotates both tokens. If the refresh token has also expired, credentials are cleared and the CLI prompts to re-login.

**Environment override.** If `CLAWAPPS_ACCESS_TOKEN` and `CLAWAPPS_REFRESH_TOKEN` are both set, the CLI uses them and skips the local file.

## Configuration

| Variable                  | Default                          | Description                                  |
|---------------------------|----------------------------------|----------------------------------------------|
| `CLAWAPPS_API_URL`        | `https://api.clawapps.ai`        | Base URL for the platform (HTTP + WS).       |
| `CLAWAPPS_ACCESS_TOKEN`   | —                                | Override credentials file (with refresh)     |
| `CLAWAPPS_REFRESH_TOKEN`  | —                                | Override credentials file (with access)      |

All endpoints live under `/cli/v1/*` on the same base. There is no separate relay URL.

## Exit Codes

| Code | Meaning                                    |
|------|--------------------------------------------|
| 0    | Success                                    |
| 1    | User error (bad arguments, missing input)  |
| 2    | Authentication failed or expired           |
| 3    | Network or upstream error                  |
| 4    | Insufficient credits / payment required    |
| 5    | Resource not found                         |

## AI Assistant Integration

The CLI is designed to be invoked as a subprocess by AI agents (Claude, Codex, etc.):

```bash
clawapps send "deploy my app" | jq -c '.'
```

Each event is one self-contained JSON line — no multi-line buffering, no escaped continuation. For long-running interactions, use `clawapps connect` and write `{"action":"message",...}` lines on stdin.

Authentication can be provided via env vars instead of a login flow:

```bash
export CLAWAPPS_ACCESS_TOKEN="eyJ..."
export CLAWAPPS_REFRESH_TOKEN="eyJ..."
clawapps send "hello"
```

## Development

```bash
git clone git@github.com:OpenDigits/clawapps-cli.git
cd clawapps-cli
npm install
npm run build
node bin/claw.js login --wechat
```

## Requirements

- **Node.js >= 18** (uses native `fetch`)

## License

[MIT](LICENSE) — Copyright 2026 ClawApps
