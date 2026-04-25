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

## Commands

### `clawapps login --wechat | --whatsapp`

Authenticates with the platform via the chosen channel. The CLI prints a login URL — open it in a browser, complete the scan / pairing flow, and the CLI auto-detects success and stores credentials at `~/.clawapps/credentials.json` (mode `0600`).

```text
$ clawapps login --whatsapp

ClawApps Login — WhatsApp

Step 1. Open this link in your browser:

    https://dev.clawapps.ai/whatsapp-login?cli_code=ABC123

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
| `CLAWAPPS_API_URL`        | `https://dev-api.clawapps.ai`    | Base URL for the platform (HTTP + WS)        |
| `CLAWAPPS_ACCESS_TOKEN`   | —                                | Override credentials file (with refresh)     |
| `CLAWAPPS_REFRESH_TOKEN`  | —                                | Override credentials file (with access)      |

All endpoints live under `/cli/v1/*` on the same base. There is no separate relay URL.

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
