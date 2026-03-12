# @clawapps/cli

[![npm version](https://img.shields.io/npm/v/@clawapps/cli.svg)](https://www.npmjs.com/package/@clawapps/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

A command-line tool for authenticating with the [ClawApps](https://www.clawapps.ai) platform. Sign in via Google or Apple directly from your terminal — tokens are stored locally for use by AI agents and scripts.

## Install

```bash
npm install -g @clawapps/cli
```

## Commands

### `clawapps login`

Sign in with Google or Apple. Opens a browser for OAuth, then stores tokens locally. If already logged in, auto-refreshes the token and extends the session.

```bash
$ clawapps login
Opening browser for login...
✔ Logged in as user@gmail.com
```

### `clawapps whoami`

Show current account info. Auto-refreshes expired tokens.

```bash
$ clawapps whoami
ClawApps Account
──────────────────────────────
Name:     Username
Email:    user@gmail.com
ID:       xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Provider: google
```

### `clawapps token`

Print current valid access token. Auto-refreshes if expired. Designed for scripting.

```bash
$ clawapps token
eyJhbGciOiJIUzI1NiIs...
```

Use in scripts:

```bash
curl -H "Authorization: Bearer $(clawapps token)" https://api.clawapps.ai/api/v1/...
```

### `clawapps credit`

Open credit recharge page in browser.

```bash
$ clawapps credit
Opening credit recharge page...
Page opened in your browser.
```

### `clawapps membership`

Open membership subscription page in browser.

```bash
$ clawapps membership
Opening membership subscription page...
Page opened in your browser.
```

### `clawapps payment-grant <skill_id>`

Open payment grant page for a skill. Starts a local callback server to receive the payment token after authorization.

```bash
$ clawapps payment-grant c0ff42a9-2b54-48b3-b570-cb16be363ad6
Opening payment grant page...
Waiting for payment confirmation...

Payment grant confirmed!
Payment Token: 8d6d2e514eb241559a4dfcb3176ce3a4
Auto Payment: disabled
```

### `clawapps logout`

Sign out and clear local credentials.

```bash
$ clawapps logout
Logged out successfully.
```

## How It Works

```
clawapps login
  → Local HTTP server starts on localhost (random port)
  → Browser opens for OAuth (Google or Apple)
  → Callback returns tokens to local server
  → Credentials saved to ~/.clawapps/credentials.json (0600)

clawapps token
  → Load local credentials
  → Validate access token via API
  → If expired, auto-refresh using refresh token
  → Output valid access token to stdout
```

## Credentials

Tokens are stored at `~/.clawapps/credentials.json` with file permissions `0600`.

```json
{
  "provider": "google",
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "logged_in_at": "2026-03-12T11:00:00.000Z"
}
```

## Project Structure

```
clawapps-cli/
├── bin/claw.js                    # Entry point
├── src/
│   ├── index.ts                   # Commander setup
│   ├── commands/
│   │   ├── login.ts               # OAuth flow with auto-refresh
│   │   ├── logout.ts              # Clear credentials
│   │   ├── whoami.ts              # User info with auto-refresh
│   │   ├── token.ts               # Print valid access token
│   │   ├── credit.ts              # Open credit page
│   │   ├── membership.ts          # Open membership page
│   │   ├── payment-grant.ts       # Payment authorization flow
│   │   └── helpers/
│   │       └── ensure-token.ts    # Token validation & refresh
│   ├── auth/
│   │   ├── login-server.ts        # Login callback server
│   │   ├── payment-server.ts      # Payment callback server
│   │   ├── server.ts              # Google OAuth callback server
│   │   ├── google.ts              # Google OAuth URL builder
│   │   ├── apple.ts               # Apple OAuth URL builder
│   │   └── exchange.ts            # Token exchange
│   ├── lib/
│   │   ├── config.ts              # API endpoints & constants
│   │   ├── credentials.ts         # Read/write credentials
│   │   ├── api.ts                 # HTTP request helpers
│   │   └── types.ts               # TypeScript interfaces
│   └── html/
│       ├── callback.ts            # OAuth callback HTML templates
│       └── logo-data.ts           # Logo (base64 embedded)
├── package.json
└── tsconfig.json
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm run dev          # Watch mode
node bin/claw.js     # Run locally
```

## Requirements

- **Node.js >= 18** (uses native `fetch`)

## Related

- [clawapps-skill](https://github.com/ClawApps/clawapps-skill) — Agent Skill for managing apps on ClawApps

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (use [Conventional Commits](https://www.conventionalcommits.org/))
4. Push and open a Pull Request

## License

[MIT](LICENSE) - Copyright 2026 ClawApps
