# @clawapps/cli

[![npm version](https://img.shields.io/npm/v/@clawapps/cli.svg)](https://www.npmjs.com/package/@clawapps/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

Command-line client for the [ClawApps](https://www.clawapps.ai) AI agent platform. Authenticate via WeChat, interact with your agent workspace, and integrate with external AI assistants.

## Install

```bash
npm install -g @clawapps/cli
```

## Quick Start

```bash
# 1. Login (scan WeChat QR code)
clawapps login

# 2. Check balance
clawapps balance

# 3. Send a message to your agent workspace
clawapps send "hello"

# 4. Or start a persistent session
clawapps connect
```

## Commands

### Authentication

#### `clawapps login`

Log in via WeChat QR code. Scan with WeChat to authenticate (valid for 3 minutes). Tokens are stored locally for subsequent commands.

```bash
$ clawapps login
Scan with WeChat to login:
█████████████████████
█████████████████████
Waiting for authentication...
✔ Login successful!
```

#### `clawapps logout`

Sign out and clear local credentials.

#### `clawapps whoami`

Show current account info. Auto-refreshes expired tokens.

#### `clawapps token`

Print valid access token to stdout. Auto-refreshes if expired. Designed for scripting.

```bash
curl -H "Authorization: Bearer $(clawapps token)" https://api.clawapps.ai/api/v1/...
```

### Agent Workspace

#### `clawapps send <message>`

Send a message to your agent workspace and receive the response.

```bash
# Human-readable output
$ clawapps send "what's the weather in Toronto?"
Toronto today: 7°C, rainy. Bring an umbrella.

# JSON output (for AI assistant integration)
$ clawapps send "hello" --json
{"event":"session_created","session_id":"abc-123"}
{"event":"text","content":"Hello! How can I help you?"}
{"event":"complete","success":true,"usage":{...}}
```

Options:
- `--json` — Output as NDJSON events (one JSON per line)
- `--session-id <id>` — Use a specific session
- `--new-session` — Force create a new session
- `--timeout <ms>` — Response timeout

#### `clawapps connect`

Start a persistent interactive session with your agent workspace.

```bash
# Interactive mode (human)
$ clawapps connect
Connected to session: abc-123
> hello
Hello! How can I help you?
> /quit

# JSON pipe mode (AI assistant integration)
$ clawapps connect --json
{"event":"session_created","session_id":"abc-123"}
{"event":"ready"}
# stdin: {"action":"message","content":"hello"}
# stdout: {"event":"text","content":"Hello!"}
```

Options:
- `--json` — NDJSON streaming I/O (stdin/stdout)
- `--session-id <id>` — Resume a specific session
- `--timeout <ms>` — Connection timeout

#### `clawapps balance`

Check your credit balance.

```bash
$ clawapps balance
Account Balance
  Credits:    78.16
  Membership: free

$ clawapps balance --json
{"credits":78.16,"membership":"free","display_name":"sammi"}
```

#### `clawapps sessions`

List or manage local session history.

```bash
$ clawapps sessions
$ clawapps sessions --clear
```

### Payment

#### `clawapps payment-grant <skill_id>`

Authorize skill payment via QR code.

#### `clawapps recharge-credits`

Display QR code to recharge credits.

#### `clawapps subscribe`

Display QR code to subscribe membership.

## AI Assistant Integration

External AI assistants (e.g., Claude Code) can use the CLI as a subprocess to interact with the ClawApps agent workspace:

```bash
# Set credentials via environment variables
export CLAWAPPS_ACCESS_TOKEN="eyJ..."
export CLAWAPPS_REFRESH_TOKEN="eyJ..."

# Send a message and parse JSON response
clawapps send "deploy my app" --json
```

**JSON events** (stdout, one per line):

| Event | Description |
|-------|-------------|
| `session_created` | Session ID assigned |
| `text` | Assistant response text (streaming) |
| `mode_change` | Switched from Gemini to Claude mode |
| `status` | Processing state (thinking, etc.) |
| `complete` | Response finished, includes usage stats |
| `cost` | Credits consumed and remaining balance |
| `error` | Error occurred |

## Credentials

Tokens stored at `~/.clawapps/credentials.json` (permissions `0600`).

Session history stored at `~/.clawapps/sessions.json`.

Environment variables override local credentials:
- `CLAWAPPS_ACCESS_TOKEN` — Access token
- `CLAWAPPS_REFRESH_TOKEN` — Refresh token
- `CLAWAPPS_RELAY_URL` — Custom relay endpoint (for development)

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run dev          # Watch mode
node bin/claw.js     # Run locally
```

## Requirements

- **Node.js >= 18** (uses native `fetch`)

## License

[MIT](LICENSE) - Copyright 2026 ClawApps
