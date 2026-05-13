# Changelog

All notable changes to `@clawapps/cli`.

## [1.2.0] — 2026-05-13 — security hardening (AI-agent threat model)

Pentest review against AI-agent / automated-pipeline usage. 12 client findings
(C1–C12), 11 fixed, 1 deferred. **Requires cli-relay ≥ `dba88ea`** on every
server you connect to (CN-1 / A-1 prod nodes already deployed). Older relays
still accept legacy clients during the transition; mixed-version setups work.

### Security

- **C1 / C9 — relay frame field whitelist** (`src/commands/connect.ts`,
  `src/commands/send.ts`, `src/lib/sanitize.ts`). The previous
  `jsonOut({ event: msg.type, ...msg })` spread put every backend-controlled
  field on stdout. AI agents pipe stdout into LLMs, so a forum topic, role
  description, or agent name containing `<system>` / `Ignore previous` could
  hijack the upstream model. Now each known `msg.type` exposes only an
  explicit whitelist; unknown types surface as `{ event }` with no payload.
  All forwarded strings pass through `stripDangerous()` which removes ANSI
  CSI/OSC, C0 controls, zero-width / bidi-override Unicode, and Plane-14
  tag characters.
- **C2 — WS token moved out of URL** (`src/lib/relay-client.ts`). Token now
  rides on `Sec-WebSocket-Protocol: bearer.<token>`. The URL is now just
  `wss://.../cli/v1/ws`, so it never appears in `ps`, journal, docker logs,
  nginx access logs, or core dumps. Paired with cli-relay `dba88ea`.
- **C3 — `CLAWAPPS_API_URL` validation** (`src/lib/base-url.ts`). Requires
  `https://` and a host in the relay allowlist
  (`cli-relay.clawapps.{cn,ai}` and `dev-cli-relay.clawapps.{cn,ai}`).
  Set `CLAWAPPS_ALLOW_CUSTOM_HOST=1` to override for local-relay dev work.
  Closes a one-env-var Bearer-token exfil shown in pentest.
- **C4 / C12 — credential file atomicity & perms** (`src/lib/credentials.ts`,
  `src/lib/relay-client.ts`). `~/.clawapps/` is chmod'd to `0700` on every
  save (the file was already `0600`, but the dir was world-readable enough
  to leak mtime side channels). Saves now write to a per-PID tmp file and
  `rename()` atomically, eliminating the upgrade race where two clients
  could both call `clearCredentials()` and lose both old and new tokens.
- **C5 — env-var token warning + Secret-file mode** (`src/commands/helpers/
  resolve-credentials.ts`). `CLAWAPPS_ACCESS_TOKEN`/`CLAWAPPS_REFRESH_TOKEN`
  in env still works but prints a one-shot stderr warning, because env vars
  leak via `/proc/<pid>/environ`, `kubectl describe pod`, `docker inspect`,
  and any monitoring sidecar. **New recommended path:** mount a Kubernetes
  Secret / Docker secret and point `CLAWAPPS_CREDENTIALS_FILE=/path/to/creds.json`
  at it. Suppress the warning with `CLAWAPPS_SILENCE_ENV_WARNING=1`.
- **C6 — `clawapps download --output` is now a filename, not a path**
  (`src/commands/download.ts`). Anything containing `/`, `\\`, `..`, or
  starting with `/` is rejected with `OUTPUT_FORBIDDEN`. Override with
  `CLAWAPPS_ALLOW_ABSOLUTE_OUTPUT=1` only when the caller is trusted —
  this closes an attack where an LLM-suggested `--output` could write
  over `~/.ssh/authorized_keys` etc. Validation runs before any network
  call so the failure is fast.
- **C7 — `clawapps upload` path sandbox** (`src/commands/upload.ts`).
  Refuses uploads from `/etc/ /proc/ /sys/ /dev/ ~/.ssh ~/.aws ~/.gnupg
  ~/.config/gcloud ~/.clawapps` and (by default) anything outside
  `process.cwd()`. Override with `CLAWAPPS_ALLOW_ANY_PATH=1` when paths
  are trusted (e.g. CI uploading from a build artifact dir).
- **C8 — WS frame size cap** (`src/lib/relay-client.ts`). `maxPayload`
  set to 10 MB so a hostile / misbehaving backend can't OOM an automated
  agent by streaming a 1 GB `assistant_text` frame.
- **C10 — error-message scrubber** (`src/lib/sanitize.ts safeErrorMessage`).
  All `err.message` passthroughs in `connect.ts` / `send.ts` / `upload.ts`
  / `download.ts` now go through a scrubber that replaces `IP:port`, `dsn://...`,
  and `ECONNREFUSED <host>` with `[ip] / [dsn] / [host]` placeholders, and
  truncates to 200 chars. Internal network topology no longer leaks into
  the agent's prompt-context window via error frames.

### Deferred

- **C11 — sessions.json HMAC**: low ROI (the attack requires same-box
  arbitrary-code execution, which already lets the attacker read the
  credentials file directly). Scheduled for the next minor.

### Breaking changes & migration

| Previous usage                                            | New behavior                          | Override (only when intentional) |
|-----------------------------------------------------------|---------------------------------------|----------------------------------|
| `CLAWAPPS_API_URL=http://...`                             | startup error (must be `https://`)    | — (no plain HTTP is allowed)     |
| `CLAWAPPS_API_URL=<host not in allowlist>`                | startup error                         | `CLAWAPPS_ALLOW_CUSTOM_HOST=1`   |
| `clawapps download <id> --output ./sub/file.txt`          | `OUTPUT_FORBIDDEN`                    | `CLAWAPPS_ALLOW_ABSOLUTE_OUTPUT=1` |
| `clawapps download <id> --output /tmp/file.txt`           | `OUTPUT_FORBIDDEN`                    | `CLAWAPPS_ALLOW_ABSOLUTE_OUTPUT=1` |
| `clawapps upload /etc/anything`                           | `PATH_FORBIDDEN`                      | (no override — system path)      |
| `clawapps upload /abs/path/outside/cwd.txt`               | `PATH_FORBIDDEN`                      | `CLAWAPPS_ALLOW_ANY_PATH=1`      |
| `CLAWAPPS_ACCESS_TOKEN=eyJ... clawapps ...` in container  | stderr warning, still works           | `CLAWAPPS_SILENCE_ENV_WARNING=1` |

If you operate AI agents at scale, prefer `CLAWAPPS_CREDENTIALS_FILE=` over
the env-var token modes — see `handover/security-check/` in the repo for the
full pentest report.

### Deployment dependency

cli-relay must be **≥ `dba88ea security(C2): accept Sec-WebSocket-Protocol`**
on every relay node the client can reach (CN-2 nginx → CN-1; A-1 US prod).
All three production nodes were upgraded on 2026-05-13 prior to this release.
The relay accepts both the new subprotocol and the legacy `?token=` query
string, so a v1.1.x client and a v1.2.0 client connecting to the same relay
both succeed.

---

## [1.1.0] — unreleased (pending Phase 2 PROD verification complete)

### Added
- `clawapps agent profile show` — read the user's auto-created assistant role from
  BE `GET /api/v1/agent/profile` (full `_agent_out` shape including agent-only
  fields `care_mode` / `allow_escalation`).
- `clawapps agent profile set <key=value>...` — update assistant profile via BE
  `PUT /api/v1/agent/profile`. Accepts `display_name`, `description`, `prompt`,
  `avatar_url`, `visibility`, `care_mode`, `tags` (comma-separated → array).
- `clawapps model set tier=fast|balanced|smart` — set opaque model tier preference.
  Implementation forwards `preferred_tier` to BE; BE runtime-gates by membership
  (free → fast only; pro_creator → fast/balanced; pro_developer → all).
- `clawapps-switch` shell helper (separate `/usr/local/bin/clawapps-switch`)
  documented as a dev-only multi-credential tool (not packaged in npm bundle).

### Changed
- `clawapps model list` no longer returns specific model IDs (claude-opus-4-7
  etc). Returns opaque `{info, configurable, tiers}` shape. Per security review
  R-21: clients must not see model identity.
- `clawapps model set` rejects `claude=` / `codex=` / `model=` keys with a clear
  error. The old keys are silently ignored by BE anyway (pydantic
  extra-ignore); the CLI now stops accepting them so users get an explicit
  signal to migrate to `tier=`.
- `clawapps model get` and `clawapps whoami` no longer surface
  `preferred_claude_model` / `preferred_codex_model`. `whoami.preferences` now
  exposes `{preferred_tier, effective_tier, preferred_language, timezone, city}`.
- Defense-in-depth: `lib/relay-client.ts` scrubs model identity fields from any
  BE response before returning to command code, protecting against BE schema
  regressions.

### Internal
- `lib/types.ts` `Preferences` interface dropped `preferred_*_model`, added
  `preferred_tier` / `effective_tier`.
- `lib/relay-client.ts` `scrubModelLeaks()` helper applied in `getMe()` +
  `setPreferences()`.

### Migration notes for end users
- Anyone with scripts calling `clawapps model set claude=...` should switch to
  `clawapps model set tier=fast|balanced|smart`. Old form now errors out instead
  of silently being ignored.
- `clawapps model list` output shape changed: `{claude:[...], codex:[...]}` →
  `{info, configurable, tiers}`. Scripts parsing the old shape need updating.

### Coordinated with
- cli-relay 3.0.0 (private) — must be deployed before this CLI version to support
  `/cli/v1/agent/profile` + `/cli/v1/membership/policy` + tier-aware
  `/cli/v1/preferences`. PROD CN-1 already running this build as of 2026-05-11.
- clawapps-api commits 6a8619d / 91402eb / d6f45cf / 5473146 / fe8aeb6 / 493a403
  / 0da1172 — PROD landed 2026-05-11.

---

## [1.0.2] — 2026-05 (last published)

Baseline at the start of the PROD cold-start reverse推演 round.

See git history for prior releases.
